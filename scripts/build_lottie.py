#!/usr/bin/env python3
"""
Generate the Gopang Lottie icon set.

Every animation is authored from the same primitives (rounded rects, ellipses,
bezier paths, trim-path line draws and travelling packets) using one shared
palette and one shared timing curve, so the whole set reads as a single design
system rather than a pile of unrelated stock animations.

Output: assets/lottie/<name>.json   (bodymovin v5.7.4 schema, 256x256, 30fps)
"""

import json
import math
import os

# ---------------------------------------------------------------- palette ---
BLUE = [0.498, 0.651, 1.000]   # #7FA6FF
CYAN = [0.220, 0.867, 0.949]   # #38DDF2
PURPLE = [0.655, 0.545, 0.980]  # #A78BFA
INK = [0.949, 0.961, 0.988]     # #F2F5FC

W = H = 256
FR = 30
LOOP = 90  # 3 seconds

EASE_I = {"x": [0.4], "y": [1]}
EASE_O = {"x": [0.2], "y": [0]}


# ------------------------------------------------------------- properties ---
def still(v):
    return {"a": 0, "k": v}


def anim(keys):
    """keys: list of (frame, value). Uses one shared easing curve."""
    out = []
    for i, (t, v) in enumerate(keys):
        k = {"t": t, "s": v if isinstance(v, list) else [v]}
        if i < len(keys) - 1:
            k["i"] = EASE_I
            k["o"] = EASE_O
        out.append(k)
    return {"a": 1, "k": out}


def loop_draw(frames_in=26, hold_to=58, frames_out=LOOP - 58):
    """Trim-path keyframes for a seamless draw / hold / erase loop."""
    return anim([
        (0, [0]),
        (frames_in, [100]),
        (hold_to, [100]),
        (LOOP, [0]),
    ])


# ----------------------------------------------------------------- shapes ---
def tr(p=None, a=None, s=None, r=None, o=None):
    item = {
        "ty": "tr",
        "p": p or still([0, 0]),
        "a": a or still([0, 0]),
        "s": s or still([100, 100]),
        "r": r or still(0),
        "o": o or still(100),
    }
    return item


def tag_tr(*args, **kwargs):
    """Marks a transform to be hoisted out of a shape list by group()."""
    return {"__tr": tr(*args, **kwargs)}


def group(items, name="g", trs=None):
    # Callers inside the icon bodies pass their transform inline as a tagged
    # entry; hoist it out so it lands after the shapes, as bodymovin expects.
    for it in items:
        if isinstance(it, dict) and "__tr" in it:
            trs = trs or it["__tr"]
            items.remove(it)
            break
    return {"ty": "gr", "nm": name, "np": len(items), "it": items + [trs or tr()]}


def rect(w, h, x=0, y=0, r=0):
    return {"ty": "rc", "d": 1, "s": still([w, h]), "p": still([x, y]), "r": still(r), "nm": "rect"}


def ellipse(w, h, x=0, y=0):
    return {"ty": "el", "d": 1, "s": still([w, h]), "p": still([x, y]), "nm": "el"}


def path(vertices, closed=False, in_t=None, out_t=None):
    if in_t is None:
        in_t = [[0, 0]] * len(vertices)
    if out_t is None:
        out_t = [[0, 0]] * len(vertices)
    return {
        "ty": "sh",
        "d": 1,
        "ks": still({"i": in_t, "o": out_t, "v": vertices, "c": closed}),
        "nm": "path",
    }


def stroke(color, width=8, opacity=100, cap=2, join=2, trs=None):
    return {
        "ty": "st",
        "c": still(color + [1] if len(color) == 3 else color),
        "o": opacity if isinstance(opacity, dict) else still(opacity),
        "w": width if isinstance(width, dict) else still(width),
        "lc": cap,
        "lj": join,
        "ml": 4,
        "nm": "stroke",
        "trs": trs,
    }


def stroke_noop():
    return {"ty": "st", "c": still([0, 0, 0, 1]), "o": still(0), "w": still(0), "lc": 2, "lj": 2, "nm": "stroke"}


def fill(color, opacity=100, rule=1, trs=None):
    return {
        "ty": "fl",
        "c": still(color + [1] if len(color) == 3 else color),
        "o": opacity if isinstance(opacity, dict) else still(opacity),
        "r": rule,
        "nm": "fill",
        "trs": trs,
    }


def trim(e_keys=None, s_keys=None, offset=0):
    return {
        "ty": "tm",
        "s": s_keys or still(0),
        "e": e_keys or still(100),
        "o": still(offset),
        "m": 1,
        "nm": "trim",
    }


def gradient(c0, c1, s=(0, 0), e=(0, 256)):
    """Linear gradient fill (type 1)."""
    return {
        "ty": "gf",
        "o": still(100),
        "r": 1,
        "bm": 0,
        "g": {"p": 3, "k": still([0, c0[0], c0[1], c0[2], 0.5, c1[0], c1[1], c1[2], 1, c0[0], c0[1], c0[2]])},
        "s": still(list(s)),
        "e": still(list(e)),
        "t": 1,
        "nm": "gf",
    }


def layer(shapes, ind, nm, op=LOOP, ip=0, ks=None, parent=None):
    ks = ks or {
        "o": still(100),
        "r": still(0),
        "p": still([0, 0, 0]),
        "a": still([0, 0, 0]),
        "s": still([100, 100, 100]),
    }
    l = {
        "ddd": 0,
        "ind": ind,
        "ty": 4,
        "nm": nm,
        "sr": 1,
        "ks": ks,
        "ao": 0,
        "shapes": shapes,
        "ip": ip,
        "op": op,
        "st": 0,
        "bm": 0,
    }
    if parent is not None:
        l["parent"] = parent
    return l


def ks_transform(pos=None, scale=None, rot=None, opacity=None, anchor=None):
    return {
        "o": opacity or still(100),
        "r": rot or still(0),
        "p": pos or still([0, 0, 0]),
        "a": anchor or still([0, 0, 0]),
        "s": scale or still([100, 100, 100]),
    }


# ------------------------------------------------------ shared components ---
def node(x, y, r=13, color=CYAN, pulse=True, dur=LOOP, delay=0):
    """A glowing network node that breathes."""
    scale = still([100, 100]) if not pulse else anim([
        (delay, [100, 100]),
        (delay + dur / 2, [124, 124]),
        (LOOP, [100, 100]),
    ])
    return group([
        ellipse(r * 2, r * 2),
        fill(color, 100),
    ], "node", trs=tr(p=still([x, y]), s=scale))


def ring(x, y, r, width=5, color=BLUE, phase=0, dur=LOOP):
    """An expanding / contracting halo ring."""
    return group([
        ellipse(r * 2, r * 2),
        stroke(color, width),
    ], "ring", trs=tr(p=still([x, y]), s=anim([
            (phase, [55, 55]),
            (phase + dur * 0.55, [130, 130]),
            (LOOP, [130, 130]),
        ]), o=anim([
            (phase, [90]),
            (phase + dur * 0.55, [0]),
            (LOOP, [0]),
        ])))


def packet(points, color=CYAN, dur=46, delay=0, r=9):
    """A dot travelling along a polyline, fading in and out."""
    keys = []
    n = len(points)
    for i in range(n):
        t = delay + dur * (i / max(n - 1, 1))
        keys.append((round(t, 2), [points[i][0], points[i][1]]))
    pos = {"a": 1, "k": []}
    for i, (t, v) in enumerate(keys):
        k = {"t": t, "s": v}
        if i < len(keys) - 1:
            k["i"] = {"x": 0.55, "y": 1}
            k["o"] = {"x": 0.35, "y": 0}
        pos["k"].append(k)
    fade_out = min(delay + dur + 4, LOOP)
    opacity = anim([
        (max(delay - 3, 0), [0]),
        (delay + 5, [100]),
        (max(fade_out - 5, delay + 6), [100]),
        (fade_out, [0]),
        (LOOP, [0]),
    ])
    return group([
        ellipse(r * 2, r * 2),
        fill(color, opacity),
    ], "packet", trs=tr(p=pos, o=opacity))


def edge(x1, y1, x2, y2, color=BLUE, width=4, opacity=42):
    """Static connector between two points."""
    return group([
        path([[x1, y1], [x2, y2]]),
        stroke(color, width, opacity),
    ], "edge")


def bar(x, y, w, h, color, delay=0, dur=44):
    """A bar-chart bar that grows from the baseline."""
    return group([
        rect(w, h, 0, 0, w / 2),
        gradient(color, [c * 0.35 for c in color], (0, -h / 2), (0, h / 2)),
        tag_tr(
            p=still([x, y]),
            a=still([0, -h / 2]),
            s=anim([
                (delay, [100, 0]),
                (delay + dur * 0.6, [100, 100]),
                (delay + dur, [100, 100]),
                (LOOP, [100, 0]),
            ]),
        ),
    ], "bar")


def check(x, y, size=26, color=CYAN, delay=0):
    """A checkmark that stroke-draws itself."""
    s = size / 2
    return group([
        path([[-s, 0], [-s * 0.25, s * 0.62], [s, -s * 0.68]]),
        trim(loop_draw(18, 52, LOOP - 52)),
        stroke(color, 9),
    ], "check")


# ------------------------------------------------------------------ icons ---
def web_development():
    """Browser window: frame draws on, tab dots pop, content lines sweep."""
    layers = []
    layers.append(layer([
        group([
            rect(180, 132, 0, 0, 18),
            stroke(BLUE, 9),
        ], "frame"),
        group([
            path([[-90, -44], [90, -44]]),
            stroke(BLUE, 7),
        ], "bar", tr(p=still([0, -66]))),
        group([
            rect(160, 4, 0, 0, 2),
            gradient(CYAN, BLUE, (-80, 0), (80, 0)),
            tag_tr(
                p=still([0, 34]),
                a=still([-80, 0]),
                s=anim([
                    (0, [0, 100]),
                    (34, [100, 100]),
                    (62, [100, 100]),
                    (LOOP, [0, 100]),
                ]),
            ),
        ], "progress"),
        group([
            rect(66, 12, 0, 0, 6),
            stroke(PURPLE, 7, 70),
        ], "line1"),
        group([
            rect(110, 12, 0, 0, 6),
            stroke(PURPLE, 7, 45),
        ], "line2"),
        group([
            rect(88, 12, 0, 0, 6),
            stroke(BLUE, 7, 45),
        ], "line3"),
        group([
            ellipse(11, 11, -66, -66),
            fill(CYAN),
            tag_tr(o=anim([(0, [0]), (12, [100]), (74, [100]), (86, [0]), (LOOP, [0])])),
        ], "dot1"),
        group([
            ellipse(11, 11, -44, -66),
            fill(BLUE),
            tag_tr(o=anim([(0, [0]), (16, [100]), (74, [100]), (86, [0]), (LOOP, [0])])),
        ], "dot2"),
        group([
            ellipse(11, 11, -22, -66),
            fill(PURPLE),
            tag_tr(o=anim([(0, [0]), (20, [100]), (74, [100]), (86, [0]), (LOOP, [0])])),
        ], "dot3"),
    ], 1, "browser"))
    return layers


def mobile_app():
    """Smartphone with a UI screen, a ripple tap and a moving app tile."""
    layers = []
    layers.append(layer([
        group([
            rect(122, 196, 0, 0, 24),
            stroke(BLUE, 9),
        ], "body"),
        group([
            rect(48, 10, 0, 0, 5),
            fill(BLUE, 70),
        ], "speaker"),
        group([
            rect(96, 128, 0, 0, 16),
            gradient(BLUE, PURPLE, (-48, 64), (48, -64)),
            tag_tr(p=still([0, -14]), o=still(22)),
        ], "screen-glow"),
        group([
            rect(84, 16, 0, 0, 8),
            fill(INK, 80),
        ], "titlebar"),
        group([
            rect(84, 11, 0, 0, 5),
            fill(BLUE, 60),
        ], "line1"),
        group([
            rect(60, 11, 0, 0, 5),
            fill(BLUE, 40),
        ], "line2"),
        group([
            rect(84, 44, 0, 0, 12),
            stroke(CYAN, 6),
            tag_tr(p=still([0, 34]), s=anim([
                (0, [100, 100]),
                (34, [100, 100]),
                (52, [112, 112]),
                (LOOP, [100, 100]),
            ])),
        ], "card"),
        group([
            rect(84, 8, 0, 0, 4),
            fill(CYAN, 85),
            tag_tr(
                p=still([0, 34]),
                a=still([-42, 0]),
                s=anim([(0, [0, 100]), (26, [100, 100]), (58, [100, 100]), (LOOP, [0, 100])]),
            ),
        ], "cardfill"),
        ring(0, 34, 34, 4, CYAN, 30),
        ring(0, 34, 34, 4, BLUE, 62),
        group([
            ellipse(26, 26),
            fill(INK, 90),
        ], "homebtn"),
    ], 1, "phone"))
    return layers


def flutter():
    """Flutter mark geometry: the two interlocking bevelled chevrons."""
    layers = []
    layers.append(layer([
        group([
            path([[-16, -78], [44, -78], [16, -44], [-44, -44]]),
            gradient(CYAN, BLUE, (-44, -78), (44, -44)),
        ], "slate"),
        group([
            path([[44, -78], [74, -36], [46, -36], [16, -78]]),
            fill(BLUE, 90),
        ], "chevron-top"),
        group([
            path([[-44, -6], [-16, -6], [16, 36], [-14, 36]]),
            fill(PURPLE, 92),
        ], "mid-left"),
        group([
            path([[16, -6], [44, -6], [16, 32], [-12, 32]]),
            fill(BLUE, 88),
        ], "mid-right"),
        group([
            path([[-44, 38], [-14, 38], [16, 78], [-16, 78]]),
            gradient(BLUE, PURPLE, (-44, 38), (16, 78)),
        ], "stem"),
    ], 1, "mark", ks=ks_transform(
        rot=anim([(0, [-3]), (45, [3]), (LOOP, [-3])]),
        scale=anim([(0, [100, 100]), (45, [104, 104]), (LOOP, [100, 100])]),
    )))
    layers.append(layer([
        ring(0, 0, 112, 3, BLUE, 0, LOOP),
        ring(0, 0, 92, 3, CYAN, 30),
    ], 2, "halo", op=LOOP))
    return layers


def ai_machine_learning():
    """Neural network: 4 layers, dim edges, bright travelling pulses."""
    cols = [
        (30, [12, 86, 160]),
        (95, [49, 123]),
        (161, [12, 86, 160]),
        (226, [49, 123]),
    ]
    shapes = []
    for li in range(len(cols) - 1):
        x1, ys1 = cols[li]
        x2, ys2 = cols[li + 1]
        for y1 in ys1:
            for y2 in ys2:
                shapes.append(edge(x1, y1, x2, y2, BLUE, 3, 24))

    colors = [CYAN, BLUE, PURPLE, CYAN]
    nodes = []
    for li, (x, ys) in enumerate(cols):
        for y in ys:
            nodes.append(layer([node(x, y, 14, colors[li], True, LOOP, (li * 5 + y) % 12)], 0, "n%d-%d" % (li, y)))

    routes = [
        ([(30, 12), (95, 49), (161, 12), (226, 49)], 0),
        ([(30, 86), (95, 123), (161, 86), (226, 123)], 16),
        ([(30, 160), (95, 123), (161, 160), (226, 123)], 32),
        ([(30, 12), (95, 49), (161, 86), (226, 123)], 48),
    ]
    packets = []
    for pts, delay in routes:
        packets.append(layer([packet(pts, CYAN, 40, delay, 10)], 0, "pkt%d" % delay))
    packets.append(layer([packet([(30, 160), (95, 123), (161, 86), (226, 49)], PURPLE, 44, 20, 8)], 0, "pktB"))

    core = layer([
        group([
            ellipse(70, 70),
            fill(BLUE, 14),
        ], "core"),
        ring(0, 0, 50, 4, PURPLE, 10),
        ring(0, 0, 50, 4, CYAN, 46),
    ], 3, "core", ks=ks_transform(pos=still([128, 118, 0])))

    return [layer(shapes, 1, "edges"), core] + nodes + packets


def cloud_devops():
    """Cloud with a deployment arrow and packets rising into it."""
    cloud_v = [[-84, 20], [-84, 4], [-72, -18], [-50, -30], [-28, -26],
               [-8, -48], [26, -48], [50, -30], [66, -6], [66, 20]]
    pts = cloud_v
    layers = []
    layers.append(layer([
        group([
            path(pts),
            trim(loop_draw(30, 62, LOOP - 62)),
            stroke(BLUE, 10),
        ], "cloud"),
        group([
            rect(168, 10, 0, 0, 5),
            stroke(BLUE, 10),
        ], "base"),
        group([
            path([[0, 26], [0, -12]]),
            trim(loop_draw(20, 66, LOOP - 66)),
            stroke(CYAN, 8),
        ], "stem"),
        group([
            path([[-22, -6], [0, -30], [22, -6]]),
            trim(loop_draw(20, 66, LOOP - 66)),
            stroke(CYAN, 8),
        ], "arrow"),
        packet([(0, 84), (0, 40), (0, 6)], CYAN, 40, 6, 9),
        packet([(-38, 88), (-38, 40)], PURPLE, 40, 24, 8),
        packet([(38, 88), (38, 40)], BLUE, 40, 42, 8),
        group([
            rect(120, 8, 0, 0, 4),
            gradient(CYAN, BLUE, (-60, 0), (60, 0)),
            tag_tr(
                p=still([0, 92]),
                a=still([-60, 0]),
                s=anim([(0, [0, 100]), (36, [100, 100]), (68, [100, 100]), (LOOP, [0, 100])]),
            ),
        ], "pipeline"),
    ], 1, "cloud"))
    return layers


def erp_crm():
    """Enterprise dashboard: KPI tiles plus an animated bar chart."""
    layers = []
    frame = group([
        rect(196, 156, 0, 0, 20),
        gradient(BLUE, PURPLE, (-98, -78), (98, 78)),
        tag_tr(o=still(14)),
    ], "bg")
    layers.append(layer([
        frame,
        group([
            rect(190, 150, 0, 0, 20),
            stroke(BLUE, 8, 80),
        ], "outline"),
    ], 2, "panel", ks=ks_transform(pos=still([128, 128, 0]))))

    tiles = []
    for i, c in enumerate([CYAN, BLUE, PURPLE]):
        tiles.append(group([
            rect(50, 24, 0, 0, 8),
            fill(c, 70),
        ], "tile%d" % i, trs=tr(p=still([-58 + i * 58, -46]))))
    layers.append(layer(tiles, 3, "kpis", ks=ks_transform(pos=still([128, 128, 0]))))

    bars = []
    heights = [26, 46, 34, 62, 52]
    colors = [BLUE, BLUE, CYAN, CYAN, PURPLE]
    for i, (h, c) in enumerate(zip(heights, colors)):
        bars.append(bar(-52 + i * 26, 50, 15, h, c, i * 5, 46))
    bars.append(group([
        rect(140, 4, 0, 0, 2),
        stroke(BLUE, 3, 45),
    ], "axis", trs=tr(p=still([0, 62]))))
    bars.append(packet([(-52, 20), (-26, -18), (0, 14), (26, -34), (52, -22), (52, 22)], CYAN, 52, 4, 8))
    layers.append(layer(bars, 4, "chart", ks=ks_transform(pos=still([128, 128, 0]))))
    return layers


def ecommerce():
    """Order pipeline: a box travels a track and drops into a cart."""
    layers = []
    layers.append(layer([
        group([
            path([[-96, 54], [-52, 54], [-52, 84], [-96, 84]], False),
            path([[-52, 54], [-34, 62], [-34, 84], [-52, 84]], False),
            path([[-96, 54], [-78, 62], [-34, 62], [-52, 54]], False),
            trim(loop_draw(26, 62, LOOP - 62)),
            stroke(BLUE, 7),
        ], "box"),
        group([
            path([[16, 6], [86, 6], [70, 54], [32, 54]], False),
            trim(loop_draw(20, 62, LOOP - 62)),
            stroke(CYAN, 8),
        ], "cart"),
        group([
            ellipse(17, 17),
            stroke(PURPLE, 7),
        ], "wheel1", trs=tr(p=still([42, 70]))),
        group([
            ellipse(17, 17),
            stroke(PURPLE, 7),
        ], "wheel2", trs=tr(p=still([66, 70]))),
        group([
            rect(150, 4, 0, 0, 2),
            stroke(BLUE, 4, 40),
        ], "track", trs=tr(p=still([0, 86]))),
    ], 1, "scene", ks=ks_transform(pos=still([128, 116, 0]))))

    layers.append(layer([
        group([
            rect(38, 34, 0, 0, 6),
            gradient(CYAN, BLUE, (-19, -17), (19, 17)),
            tag_tr(
                p=anim([
                    (0, [-96, 34]),
                    (38, [-52, 34]),
                    (52, [-52, 34]),
                    (62, [-20, 12]),
                    (70, [-20, 12]),
                ]),
            ),
        ], "parcel"),
        ring(-20, 12, 34, 4, CYAN, 70),
    ], 2, "parcel", ks=ks_transform(pos=still([128, 116, 0]))))
    return layers


def ui_ux_design():
    """Design canvas: layout blocks snap in and a pen path draws a wireframe."""
    layers = []
    layers.append(layer([
        group([
            rect(190, 152, 0, 0, 20),
            stroke(BLUE, 8, 75),
        ], "canvas"),
        group([
            rect(84, 46, -44, -44, 12),
            gradient(BLUE, CYAN, (-86, -67), (-2, -21)),
            tag_tr(o=anim([
                (0, [0]), (12, [0]), (22, [80]),
                (44, [80]), (54, [80]), (64, [0]), (LOOP, [0]),
            ])),
        ], "hero-block"),
        group([
            rect(34, 34, 48, -44, 8),
            fill(PURPLE, 70),
            tag_tr(o=anim([
                (0, [0]), (18, [0]), (28, [70]),
                (44, [70]), (54, [70]), (64, [0]), (LOOP, [0]),
            ])),
        ], "chip"),
        group([
            rect(160, 16, 0, 24, 8),
            fill(CYAN, 60),
            tag_tr(o=anim([
                (0, [0]), (22, [0]), (32, [60]),
                (44, [60]), (54, [60]), (64, [0]), (LOOP, [0]),
            ])),
        ], "line1"),
        group([
            rect(126, 16, -17, 48, 8),
            fill(BLUE, 45),
            tag_tr(o=anim([
                (0, [0]), (26, [0]), (36, [45]),
                (44, [45]), (54, [45]), (64, [0]), (LOOP, [0]),
            ])),
        ], "line2"),
        group([
            path([[-46, 58], [10, 58], [44, 44], [90, 44]]),
            trim(loop_draw(34, 62, LOOP - 62)),
            stroke(CYAN, 6, 85),
        ], "wire"),
        group([
            path([[84, 26], [96, 40], [108, 26]], False),
            fill(INK, 90),
        ], "cursor"),
    ], 1, "ui"))
    return layers


def backend_api():
    """Two server stacks bridged by a hub, packets shuttling between them."""
    layers = []

    def stack(x, flip):
        shapes = [
            group([
                rect(66, 40, 0, 0, 12),
                stroke(BLUE, 8),
            ], "unit", trs=tr(p=still([0, -50]))),
            group([
                rect(66, 40, 0, 0, 12),
                stroke(BLUE, 8),
            ], "unit", trs=tr(p=still([0, 0]))),
            group([
                rect(66, 40, 0, 0, 12),
                stroke(BLUE, 8),
            ], "unit", trs=tr(p=still([0, 50]))),
        ]
        for i, y in enumerate((-50, 0, 50)):
            shapes.append(group([
                ellipse(9, 9, -20, y),
                fill(CYAN, 90),
                tag_tr(o=anim([
                    (i * 8, [25]),
                    (i * 8 + 12, [100]),
                    (40 + i * 8, [100]),
                    (56 + i * 8, [25]),
                    (LOOP, [25]),
                ])),
            ], "led"))
        return shapes

    layers.append(layer(stack(-64, False), 1, "left", ks=ks_transform(pos=still([72, 128, 0]))))
    layers.append(layer(stack(64, True), 2, "right", ks=ks_transform(pos=still([184, 128, 0]))))

    layers.append(layer([
        group([
            ellipse(38, 38),
            gradient(PURPLE, BLUE, (-19, -19), (19, 19)),
            tag_tr(s=anim([(0, [100, 100]), (45, [114, 114]), (LOOP, [100, 100])])),
        ], "hub"),
        ring(0, 0, 40, 4, PURPLE, 20),
    ], 3, "hub", ks=ks_transform(pos=still([128, 128, 0]))))

    layers.append(layer([
        edge(-40, 128, 22, 128, BLUE, 4, 45),
        edge(158, 128, 234, 128, BLUE, 4, 45),
        packet([(-40, 128), (22, 128)], CYAN, 34, 4, 9),
        packet([(158, 128), (234, 128)], PURPLE, 34, 24, 9),
        packet([(234, 128), (158, 128)], CYAN, 34, 46, 8),
    ], 4, "traffic"))
    return layers


def cyber_security():
    """Shield with a vertical scan line and an expanding breach ring."""
    shield_v = [[0, -92], [74, -58], [74, 18], [0, 94], [-74, 18], [-74, -58]]
    layers = []
    layers.append(layer([
        group([
            path(shield_v),
            fill(BLUE, 12),
        ], "body"),
        group([
            path(shield_v),
            trim(loop_draw(30, 66, LOOP - 66)),
            stroke(BLUE, 9),
        ], "outline"),
        group([
            rect(96, 5, 0, 0, 3),
            gradient(CYAN, PURPLE, (-48, 0), (48, 0)),
            tag_tr(
                p=still([0, -84]),
                o=anim([(30, [0]), (34, [100]), (58, [100]), (66, [0]), (LOOP, [0])]),
            ),
        ], "scan"),
        group([
            rect(150, 150, 0, 0, 8),
            stroke(CYAN, 3),
            tag_tr(o=anim([
                (0, [70]), (45, [0]), (LOOP, [70]),
            ])),
        ], "sweep"),
        packet([(0, -84), (0, 60)], CYAN, 40, 30, 9),
        ring(0, 0, 96, 4, PURPLE, 50),
    ], 1, "shield"))
    return layers


def qa_testing():
    """Checklist where three ticks draw in sequence, plus a bug magnifier."""
    layers = []
    rows = []
    for i in range(3):
        y = -52 + i * 52
        rows.append(group([
            rect(26, 26, -76, y, 9),
            stroke(BLUE, 6, 60),
        ], "box%d" % i))
        rows.append(check(-76, y, 20, CYAN, i * 9))
        rows.append(group([
            rect(104, 12, 18, y, 6),
            stroke(BLUE, 6, 50),
        ], "line%d" % i))
    layers.append(layer(rows, 1, "list", ks=ks_transform(pos=still([138, 128, 0]))))
    layers.append(layer([
        group([
            ellipse(74, 74),
            stroke(PURPLE, 8),
        ], "lens"),
        group([
            path([[28, 28], [50, 50]]),
            stroke(PURPLE, 9),
        ], "handle"),
        group([
            path([[-18, -4], [-6, 8], [16, -16]], False),
            trim(loop_draw(16, 50, LOOP - 50)),
            stroke(CYAN, 7),
        ], "bug-leg"),
        ring(0, 0, 44, 3, CYAN, 12),
    ], 2, "lens", ks=ks_transform(pos=still([56, 190, 0]), scale=still([76, 76, 100]))))
    return layers


def maintenance_support():
    """Rotating gear wrapped by a support heartbeat trace."""
    layers = []
    teeth = []
    for i in range(8):
        teeth.append(group([
            rect(16, 26, 0, -56, 5),
            fill(PURPLE, 92),
        ], "tooth", trs=tr(r=still(i * 45))))
    layers.append(layer([
        group(teeth, "teeth"),
        group([
            ellipse(112, 112),
            gradient(BLUE, PURPLE, (-56, -56), (56, 56)),
            tag_tr(o=still(16)),
        ], "disc"),
        group([
            ellipse(84, 84),
            stroke(BLUE, 9),
        ], "rim"),
        group([
            ellipse(34, 34),
            gradient(CYAN, BLUE, (-17, -17), (17, 17)),
        ], "hub"),
    ], 1, "gear", ks=ks_transform(
        pos=still([128, 118, 0]),
        rot=anim([(0, [0]), (LOOP, [360])]),
    )))
    hb = [[-104, 216], [-64, 216], [-50, 200], [-30, 240], [-6, 190], [16, 216], [104, 216]]
    layers.append(layer([
        group([
            path(hb),
            trim(loop_draw(30, 64, LOOP - 64)),
            stroke(CYAN, 7),
        ], "pulse"),
    ], 2, "pulse"))
    return layers


def analytics():
    """KPI dashboard with a self-drawing trend line and live counters."""
    layers = []
    tiles = []
    for i, c in enumerate([CYAN, BLUE, PURPLE]):
        tiles.append(group([
            rect(52, 30, 0, 0, 9),
            fill(c, 16),
        ], "t%d" % i, trs=tr(p=still([-60 + i * 60, -50]))))
        tiles.append(group([
            rect(30, 8, 0, 0, 4),
            fill(c, 90),
            tag_tr(
                p=still([-66 + i * 60, -50]),
                a=still([-15, 0]),
                s=anim([
                    (i * 6, [0, 100]), (26 + i * 6, [100, 100]),
                    (64, [100, 100]), (LOOP, [0, 100]),
                ]),
            ),
        ], "v%d" % i))
    layers.append(layer(tiles, 1, "kpis", ks=ks_transform(pos=still([128, 128, 0]))))

    trend = [[-86, 34], [-56, 6], [-26, 22], [4, -20], [34, -4], [64, -34], [86, -52]]
    layers.append(layer([
        group([
            rect(186, 104, 0, 6, 14),
            stroke(BLUE, 5, 32),
        ], "plot"),
        group([
            path(trend),
            trim(loop_draw(36, 66, LOOP - 66)),
            stroke(CYAN, 8),
        ], "line"),
        group([
            ellipse(18, 18, 86, -52),
            gradient(CYAN, BLUE, (-9, -9), (9, 9)),
        ], "head"),
        ring(86, -52, 20, 4, CYAN, 66),
    ], 2, "chart", ks=ks_transform(pos=still([128, 168, 0]))))
    return layers


def database():
    """Database cylinder with data packets streaming through its pipeline."""
    layers = []
    layers.append(layer([
        group([
            ellipse(128, 50, 0, -56),
            stroke(BLUE, 9),
        ], "lid"),
        group([
            path([[-64, -56], [-64, 46]]),
            stroke(BLUE, 9),
        ], "left"),
        group([
            path([[64, -56], [64, 46]]),
            stroke(BLUE, 9),
        ], "right"),
        group([
            ellipse(128, 50, 0, 46),
            stroke(BLUE, 9),
        ], "base"),
        group([
            ellipse(128, 42, 0, -6),
            stroke(PURPLE, 5, 55),
        ], "ring1"),
        group([
            ellipse(128, 42, 0, 22),
            stroke(PURPLE, 5, 55),
        ], "ring2"),
        group([
            ellipse(128, 38, 0, -6),
            fill(CYAN, 22),
        ], "core"),
        packet([(-92, 122), (-64, 96), (-64, -40), (0, -66), (64, -40), (64, 96), (92, 122)], CYAN, 54, 4, 9),
        packet([(-64, 10), (64, 10)], PURPLE, 40, 26, 8),
    ], 1, "db", ks=ks_transform(pos=still([128, 116, 0]))))
    return layers


def custom_software():
    """Layered architecture: three stacked modules wired to a core."""
    layers = []
    modules = []
    for i, c in enumerate([BLUE, PURPLE, CYAN]):
        y = -56 + i * 56
        modules.append(group([
            rect(150, 42, 0, 0, 12),
            gradient(c, [v * 0.3 for v in c], (-75, -21), (75, 21)),
            tag_tr(p=still([0, y]), o=still(26)),
        ], "glow%d" % i))
        modules.append(group([
            rect(142, 36, 0, 0, 11),
            stroke(c, 7, 85),
        ], "mod%d" % i, trs=tr(
            p=still([0, y]),
            s=anim([
                (i * 7, [92, 92]), (22 + i * 7, [100, 100]),
                (62, [100, 100]), (LOOP, [92, 92]),
            ]),
        )))
    modules.append(group([
        rect(70, 7, 0, 0, 4),
        gradient(CYAN, BLUE, (-35, 0), (35, 0)),
        tag_tr(
            p=still([0, 66]),
            a=still([-35, 0]),
            s=anim([(0, [0, 100]), (34, [100, 100]), (66, [100, 100]), (LOOP, [0, 100])]),
        ),
    ], "pipe"))
    layers.append(layer(modules, 1, "modules", ks=ks_transform(pos=still([128, 122, 0]))))
    layers.append(layer([ring(0, 0, 118, 3, BLUE, 0), ring(0, 0, 98, 3, PURPLE, 30)], 2, "halo"))
    return layers


def cloud_generic():
    return cloud_devops()


def dedicated_team():
    """Three seated engineer silhouettes orbiting a shared build pipeline."""
    layers = []
    layers.append(layer([
        group([
            path([[-88, 78], [-88, 30], [-52, -6], [-16, 30], [-16, 78]], False),
            trim(loop_draw(26, 64, LOOP - 64)),
            stroke(BLUE, 8),
        ], "dev-a"),
        group([
            ellipse(38, 38, -88, -22),
            stroke(BLUE, 8),
        ], "head-a"),
        group([
            rect(66, 40, 66, 34, 8),
            stroke(CYAN, 8),
        ], "monitor"),
        group([
            path([[34, 34], [98, 34]], False),
            trim(loop_draw(20, 66, LOOP - 66)),
            stroke(PURPLE, 6, 85),
        ], "code"),
        group([
            rect(92, 8, 66, 34, 4),
            gradient(CYAN, BLUE, (20, 34), (112, 34)),
            tag_tr(
                p=still([66, 34]),
                a=still([-46, 0]),
                s=anim([(0, [0, 100]), (30, [100, 100]), (66, [100, 100]), (LOOP, [0, 100])]),
            ),
        ], "codefill"),
        packet([(-16, 6), (24, 20), (66, 34)], CYAN, 40, 8, 9),
    ], 1, "team", ks=ks_transform(pos=still([128, 124, 0]))))
    return layers


def communication():
    """Support channel: a headset bubble with a live signal wave."""
    layers = []
    layers.append(layer([
        group([
            rect(168, 118, 0, 0, 30),
            stroke(BLUE, 9),
        ], "bubble"),
        group([
            path([[-30, 58], [-30, 82], [-4, 62]], False),
            fill(BLUE, 60),
        ], "tail"),
        group([
            rect(120, 11, 0, -18, 6),
            fill(CYAN, 85),
        ], "line1"),
        group([
            rect(84, 11, -18, 4, 6),
            fill(BLUE, 60),
        ], "line2"),
        group([
            rect(96, 11, -24, 26, 6),
            fill(PURPLE, 60),
        ], "line3"),
        packet([(0, 118), (0, 66)], CYAN, 34, 4, 10),
        ring(0, 128, 26, 4, PURPLE, 34),
    ], 1, "chat", ks=ks_transform(pos=still([128, 108, 0]))))
    return layers


ICONS = {
    "web-development": web_development,
    "mobile-app": mobile_app,
    "flutter": flutter,
    "ai-machine-learning": ai_machine_learning,
    "cloud-devops": cloud_devops,
    "erp-crm": erp_crm,
    "ecommerce": ecommerce,
    "ui-ux-design": ui_ux_design,
    "backend-api": backend_api,
    "cyber-security": cyber_security,
    "qa-testing": qa_testing,
    "maintenance-support": maintenance_support,
    "analytics": analytics,
    "database": database,
    "custom-software": custom_software,
    "dedicated-team": dedicated_team,
    "communication": communication,
}


def build(name):
    layers = ICONS[name]()
    layers.sort(key=lambda l: l["ind"])
    for i, l in enumerate(layers):
        l["ind"] = i + 1
    return {
        "v": "5.7.4",
        "fr": FR,
        "ip": 0,
        "op": LOOP,
        "w": W,
        "h": H,
        "nm": "gis-" + name,
        "ddd": 0,
        "assets": [],
        "layers": layers,
        "markers": [],
    }


def main():
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "lottie")
    os.makedirs(out, exist_ok=True)
    total = 0
    for name in sorted(ICONS):
        data = build(name)
        path = os.path.join(out, name + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"))
        size = os.path.getsize(path)
        total += size
        print("%-24s %2d layers  %5d B" % (name, len(data["layers"]), size))
    print("-" * 44)
    print("%d icons, %.1f KB total" % (len(ICONS), total / 1024.0))


if __name__ == "__main__":
    main()