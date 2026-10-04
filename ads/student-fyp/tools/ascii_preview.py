#!/usr/bin/env python3
"""Terminal previewer for the ad's frames.

The preview webview and the image reader are both unavailable in this
environment, so this prints a PNG as a character map: one character per
cell, bucketed by luminance, with saturated pixels classified by hue. It is
enough to judge layout, collisions, contrast and colour balance; pass
`--bright` to see only pixels above the legibility threshold used by
qa_check.py.

Usage:  python3 tools/ascii_preview.py out.png [cell_px] [--bright] [--ansi]
"""
from __future__ import annotations

import sys

import numpy as np
from PIL import Image

BUCKETS = " .:*#@"


def classify(a):
    """(rows, cols) uint8 array of characters."""
    h, w, _ = a.shape
    out = np.full((h, w), " ", dtype="<U1")
    lum = (0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2])
    sat = a.max(axis=2).astype(np.int16) - a.min(axis=2).astype(np.int16)
    for i in range(1, len(BUCKETS)):
        hi = 255.0 if i == len(BUCKETS) - 1 else 255.0 * (i + 0.5) / (len(BUCKETS) - 1)
        lo = 255.0 * (i - 0.5) / (len(BUCKETS) - 1)
        out[(lum >= lo) & (lum < hi)] = BUCKETS[i]
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    hue = np.full((h, w), " ", dtype="<U1")
    hue[(b > 120) & (b > r + 40) & (g > 110)] = "C"          # cyan
    hue[(b > 110) & (b > r + 50) & (g < 110)] = "A"          # accent blue
    hue[(b > 90) & (r > 70) & (b > g + 40)] = "V"            # violet
    hue[(g > 110) & (g > r + 40) & (g > b + 20)] = "G"        # green
    hue[(r > 140) & (r > g + 60) & (r > b + 60)] = "R"        # red
    hue[(r > 150) & (g > 120) & (b < g - 40)] = "Y"          # yellow
    hue[(r > 150) & (g > 90) & (b < 90) & (r > g + 30)] = "O"  # orange
    out[(sat > 55) & (hue != " ")] = hue[(sat > 55) & (hue != " ")]
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    path = args[0]
    cell = int(args[1]) if len(args) > 1 else 8
    im = Image.open(path).convert("RGB")
    w, h = im.size
    box = None
    for f in flags:
        if f.startswith("--box="):
            box = [int(v) for v in f[6:].split(",")]
    ox, oy = (box[0], box[1]) if box else (0, 0)
    im = im.crop((ox, oy, box[2], box[3])) if box else im
    w, h = im.size
    cw, ch = max(1, w // cell), max(1, h // (cell * 2))
    a = np.asarray(im.resize((cw, ch), Image.BOX), np.int16)
    if "--bright" in flags:
        lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
        a = np.where((lum > 118)[..., None], a, np.array([7, 10, 22]))
    ch_map = classify(a.astype(np.uint8))
    print(f"{path}  {w}x{h}  cell={cell} -> {cw}x{ch}")
    for row in ch_map:
        print("".join(row))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
