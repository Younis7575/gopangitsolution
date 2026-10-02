#!/usr/bin/env python3
"""
Static bounds checker for the generated Lottie icons.

Every icon is drawn around a group origin and placed on the 256x256 artboard by
its layer transform, so a stray group offset, an over-long animation travel or a
mis-sized rectangle pushes geometry outside the viewBox. lottie-web does not
clip that away visually in the site -- the icon simply bleeds past its mount --
and getBBox() in the browser ignores ancestor transforms, which makes the mistake
easy to miss. This walks the JSON, resolves the layer and group transform chains
at every keyframe and reports the artboard-space bounds of each shape.

    python3 scripts/check_lottie_bounds.py [--json assets/lottie/student-*.json]

Exit code is 1 when anything leaves the artboard, so it can gate a build.
"""

import argparse
import glob
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ------------------------------------------------------------- transforms ---
def mat(tx, ty, rot_deg, sx, sy):
    r = math.radians(rot_deg or 0.0)
    cos, sin = math.cos(r), math.sin(r)
    return [
        sx * cos, sx * sin,
        -sy * sin, sy * cos,
        tx, ty,
    ]


def apply(m, x, y):
    return (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])


def compose(outer, inner):
    """outer(inner(p)) -- outer applied after inner."""
    a, b = outer, inner
    return [
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5],
    ]


def scale_of(m):
    return max(math.hypot(m[0], m[1]), math.hypot(m[2], m[3]))


# -------------------------------------------------------------- properties ---
def prop(prop, frame, default=None):
    """Resolve a bodymovin property to a number/list at `frame`."""
    if prop is None:
        return default
    if not isinstance(prop, dict):
        return prop
    if prop.get("a") != 1:
        return prop.get("k", default)
    keys = prop.get("k") or []
    if not keys:
        return default
    if frame <= keys[0].get("t", 0):
        return keys[0].get("s", default)
    for i in range(len(keys) - 1):
        a, b = keys[i], keys[i + 1]
        t0, t1 = a.get("t", 0), b.get("t", 0)
        if t0 <= frame <= t1:
            span = t1 - t0
            u = 0.0 if span == 0 else (frame - t0) / span
            # The shared easing curve is monotonic, so linear interpolation can
            # only ever under-report the true excursion, never invent one.
            return lerp(a.get("s"), b.get("s"), u)
    return keys[-1].get("s", default)


def lerp(a, b, u):
    if isinstance(a, list) or isinstance(b, list):
        a = a if isinstance(a, list) else [a]
        b = b if isinstance(b, list) else [b]
        n = max(len(a), len(b))
        a = a + [a[-1] if a else 0] * (n - len(a))
        b = b + [b[-1] if b else 0] * (n - len(b))
        return [a[i] + (b[i] - a[i]) * u for i in range(n)]
    return a + (b - a) * u


def num(v, i=0):
    """Component `i` of a bodymovin vector. Scalars pass straight through."""
    if isinstance(v, (list, tuple)):
        return float(v[i]) if len(v) > i else 0.0
    return float(v)


def frames_of(prop, extra=()):
    if not isinstance(prop, dict) or prop.get("a") != 1:
        return [0.0]
    return sorted(set([float(k.get("t", 0)) for k in prop.get("k", [])] + list(extra)))


# ------------------------------------------------------------------ shapes ---
def local_points(shape, frame):
    """Corner/vertex points of one primitive in its own space."""
    t = shape.get("ty")
    if t == "rc":
        w, h = prop(shape.get("s"), frame, [0, 0])
        x, y = prop(shape.get("p"), frame, [0, 0])
        hw, hh = num(w) / 2.0, num(h) / 2.0
        cx, cy = num(x), num(y)
        return [(cx - hw, cy - hh), (cx + hw, cy - hh),
                (cx + hw, cy + hh), (cx - hw, cy + hh)]
    if t == "el":
        w, h = prop(shape.get("s"), frame, [0, 0])
        x, y = prop(shape.get("p"), frame, [0, 0])
        cx, cy = num(x), num(y)
        rx, ry = num(w) / 2.0, num(h) / 2.0
        # Cardinal + diagonal points bound the ellipse tightly enough here.
        return [(cx + rx * math.cos(a), cy + ry * math.sin(a))
                for a in (0, math.pi / 4, math.pi / 2, 3 * math.pi / 4,
                          math.pi, 5 * math.pi / 4, 3 * math.pi / 2, 7 * math.pi / 4)]
    if t == "sh":
        ks = prop(shape.get("ks"), frame, {}) or {}
        return [(float(v[0]), float(v[1])) for v in (ks.get("v") or [])]
    return []


def walk(shapes, parent, frame, sink, pad=0.0):
    for item in shapes or []:
        if not isinstance(item, dict):
            continue
        if item.get("ty") == "gr":
            t = None
            for it in item.get("it", []):
                if isinstance(it, dict) and it.get("ty") == "tr":
                    t = it
            m = parent
            if t is not None:
                p = prop(t.get("p"), frame, [0, 0])
                s = prop(t.get("s"), frame, [100, 100])
                r = prop(t.get("r"), frame, 0)
                m = compose(parent, mat(num(p), num(p, 1), num(r),
                                        num(s) / 100.0, num(s, 1) / 100.0))
            # A stroke sits beside the shape it paints, so the bleed has to be
            # measured against the group that owns both.
            walk(item.get("it"), m, frame, sink, group_pad(item, frame))
            continue

        pts = local_points(item, frame)
        if not pts:
            continue
        world = [apply(parent, x, y) for x, y in pts]
        sink.append((item.get("nm") or item.get("ty"),
                     item.get("ty"), world, scale_of(parent), pad))


def group_pad(group, frame):
    """Half the widest visible stroke declared inside a group."""
    half = 0.0
    for it in group.get("it", []):
        if isinstance(it, dict) and it.get("ty") == "st":
            if num(prop(it.get("o"), frame, 100)) > 0:
                half = max(half, num(prop(it.get("w"), frame, 0)) / 2.0)
    return half


def collect(data):
    """[(name, [x0,y0,x1,y1])] artboard-space bounds across the whole loop."""
    ip = float(data.get("ip", 0))
    op = float(data.get("op", 90))

    layer_props = []
    for lyr in data.get("layers", []):
        ks = lyr.get("ks", {}) or {}
        layer_props += frames_of(ks.get("p")) + frames_of(ks.get("s"))
    sample = sorted(set([op - 1] + [ip] + layer_props))
    # Sample between keyframes too: a linear segment's extremes are its ends,
    # but the extra points keep the checker honest if easing ever changes.
    dense = set(sample)
    for i in range(len(sample) - 1):
        for s in (0.25, 0.5, 0.75):
            dense.add(sample[i] + (sample[i + 1] - sample[i]) * s)
    sample = sorted(dense)

    results = {}
    for frame in sample:
        for lyr in data.get("layers", []):
            ks = lyr.get("ks", {}) or {}
            p = prop(ks.get("p"), frame, [0, 0, 0])
            a = prop(ks.get("a"), frame, [0, 0, 0])
            s = prop(ks.get("s"), frame, [100, 100, 100])
            r = prop(ks.get("r"), frame, 0)
            lm = mat(num(p), num(p, 1), num(r), num(s) / 100.0, num(s, 1) / 100.0)
            _ = a
            for group in lyr.get("shapes", []):
                if not isinstance(group, dict) or group.get("ty") != "gr":
                    continue
                sink = []
                walk([group], lm, frame, sink)
                for idx, (nm, _ty, pts, sc, pad) in enumerate(sink):
                    g = pad / sc if sc else 0.0
                    for x, y in pts:
                        x0, x1 = x - g, x + g
                        y0, y1 = y - g, y + g
                        key = "%s/%s%d" % (lyr.get("nm"), nm, idx)
                        b = results.setdefault(key, [1e9, 1e9, -1e9, -1e9])
                        b[0] = min(b[0], x0)
                        b[1] = min(b[1], y0)
                        b[2] = max(b[2], x1)
                        b[3] = max(b[3], y1)
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*", default=None)
    ap.add_argument("--margin", type=float, default=2.0)
    args = ap.parse_args()

    files = args.files or sorted(
        glob.glob(os.path.join(ROOT, "assets", "lottie", "student-*.json")))
    bad = 0
    for f in files:
        name = os.path.basename(f)[:-5]
        with open(f, encoding="utf-8") as fh:
            data = json.load(fh)
        w, h = float(data.get("w", 256)), float(data.get("h", 256))
        m = args.margin
        worst = []
        for key, b in sorted(collect(data).items()):
            if not all(map(lambda v: abs(v) < 1e8, b)):
                continue
            over = max(-m - b[0], -m - b[1], b[2] - (w - m), b[3] - (h - m))
            worst.append((over, key, b))
        worst.sort(reverse=True)
        over_icons = [x for x in worst if x[0] > 0]
        flag = "FAIL" if over_icons else " ok "
        print("[%s] %-24s %3d shapes" % (flag, name, len(worst)))
        for over, key, b in worst[:4]:
            print("        %-34s [%6.1f %6.1f %6.1f %6.1f]%s" % (
                key, b[0], b[1], b[2], b[3],
                "   <-- OVERFLOW by %.1f" % over if over > 0 else ""))
        if over_icons:
            bad += 1
    print("-" * 52)
    print("%d file(s), %d with overflow" % (len(files), bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
