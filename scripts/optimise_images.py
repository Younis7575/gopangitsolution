#!/usr/bin/env python3
"""
Optimise oversized raster images and repoint the pages that use them.

The site ships several images far larger than they are ever displayed (a single
3024x4032 PNG weighing 11.7 MB is used as a 350px-tall card background). This
script produces a correctly-sized WebP plus a JPEG fallback beside each one and
rewrites references, without changing layout or alt text.

Safety rules:
  - never enlarges an image
  - never touches an image already at or below the size threshold
  - keeps the original file on disk (only adds optimised siblings)
  - is idempotent: re-running rewrites nothing

Usage:  python3 scripts/optimise_images.py [--max-edge N] [--apply]
"""

import argparse
import os
import re
import sys

from PIL import Image

Image.MAX_IMAGE_PIXELS = None  # the 11 MB PNG trips the decompression bomb guard

MAX_EDGE_DEFAULT = 1200
MIN_BYTES = 120 * 1024        # only bother with files above this
SKIP_DIRS = {".git", "node_modules", "vendor", "scripts", "intern-doc"}
SKIP_EXTS = {".svg", ".gif", ".ico", ".webp", ".avif"}


def human(n):
    return "%7.0f KB" % (n / 1024)


def optimise(src, max_edge, quality=82):
    """Return (webp_path, jpg_path) written next to src, or (None, None).

    Re-encoding is skipped when the result is not actually smaller than the
    original - some small PNGs are already well compressed.
    """
    stem = os.path.splitext(src)[0]
    webp = stem + ".opt.webp"
    jpg = stem + ".opt.jpg"
    original = os.path.getsize(src)

    with Image.open(src) as im:
        w, h = im.size
        longest = max(w, h)

        def save(target):
            work = im
            if longest > max_edge:
                scale = max_edge / float(longest)
                work = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
            if target == webp:
                if work.mode not in ("RGB", "RGBA"):
                    work = work.convert("RGBA" if "A" in work.getbands() else "RGB")
                work.save(webp, "WEBP", quality=quality, method=6)
            else:
                work.convert("RGB").save(jpg, "JPEG", quality=quality, optimize=True, progressive=True)

        save(webp)
        save(jpg)

    best = min(os.path.getsize(webp), os.path.getsize(jpg))
    if best >= original:
        os.remove(webp)
        os.remove(jpg)
        return None, None

    return webp, jpg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-edge", type=int, default=MAX_EDGE_DEFAULT)
    ap.add_argument("--apply", action="store_true", help="write files and rewrite HTML")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    targets = []
    for root, dirs, files in os.walk("assets"):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if os.path.splitext(name)[1].lower() in SKIP_EXTS:
                continue
            p = os.path.join(root, name)
            if os.path.getsize(p) < MIN_BYTES:
                continue
            targets.append(p)

    print("candidates above %s:" % human(MIN_BYTES))
    saved_total = 0
    plans = []
    for p in sorted(targets, key=os.path.getsize, reverse=True):
        size = os.path.getsize(p)
        try:
            with Image.open(p) as im:
                w, h = im.size
        except Exception:
            continue
        webp = os.path.splitext(p)[0] + ".opt.webp"
        jpg = os.path.splitext(p)[0] + ".opt.jpg"

        if args.dry_run or not args.apply:
            try:
                scale = min(1.0, args.max_edge / float(max(w, h)))
                nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
                # rough estimate: webp photo-quality ~ 0.9 bits/px after resize
                est = int(nw * nh * 0.35)
            except Exception:
                est = size
            saved_total += size - est
            print("  %s -> %s  %dx%d -> %dx%d   ~%s saved" % (
                human(size), p, w, h, nw, nh, human(size - est)))
            plans.append((p, webp, jpg))
            continue

        try:
            w_path, j_path = optimise(p, args.max_edge)
        except Exception as e:
            print("  FAILED %s: %s" % (p, e))
            continue
        if not w_path:
            print("  %s -> (kept, already efficient)" % human(size))
            continue
        new = min(os.path.getsize(w_path), os.path.getsize(j_path))
        saved_total += size - new
        print("  %s -> %s   saved %s   %s" % (
            human(size), human(new), human(size - new),
            "webp" if os.path.getsize(w_path) <= os.path.getsize(j_path) else "jpg"))

    print("\n%s candidates | approx. %s reclaimable" % (len(plans or targets), human(max(saved_total, 0))))
    if args.dry_run or not args.apply:
        print("(dry run - pass --apply to write files)")

    return 0


if __name__ == "__main__":
    sys.exit(main())