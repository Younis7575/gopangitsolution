#!/usr/bin/env python3
"""Derive dark-background ("light") versions of the Gopang logo.

The shipped logo artwork is dark navy on transparent, which disappears on the
deep-dark premium theme. This script produces light variants that keep the
brand mark's teal/cyan accents and turn only the dark navy ink white.

Outputs (idempotent, deterministic):
  assets/img/logo-light.png  — derived from assets/img/logo.png
  assets/img/logo-light.svg  — derived from assets/img/logo.svg

Nothing else in the repo is touched.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "assets" / "img"

# Pixels darker than this become pure white; between the two thresholds the
# original colour is blended toward white so the teal accents survive.
DARK = 46
LIGHT = 96


def lighten(rgb):
    r, g, b = rgb
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if lum <= DARK:
        return (255, 255, 255)
    if lum >= LIGHT:
        return (r, g, b)
    t = (lum - DARK) / (LIGHT - DARK)
    return (
        int(r + (255 - r) * t),
        int(g + (255 - g) * t),
        int(b + (255 - b) * t),
    )


def hex_to_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def do_png():
    from PIL import Image

    src = IMG / "logo.png"
    im = Image.open(src).convert("RGBA")
    out = Image.new("RGBA", im.size)
    src_px = im.load()
    dst_px = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = src_px[x, y]
            if a == 0:
                dst_px[x, y] = (0, 0, 0, 0)
            else:
                r2, g2, b2 = lighten((r, g, b))
                dst_px[x, y] = (r2, g2, b2, a)
    out.save(IMG / "logo-light.png", optimize=True)
    print("wrote assets/img/logo-light.png", out.size)


def do_svg():
    src = (IMG / "logo.svg").read_text(encoding="utf-8")

    def repl(m):
        val = m.group(2)
        if m.group(1) == "fill-opacity" or not re.fullmatch(r"#?[0-9a-fA-F]{3,6}", val):
            return m.group(0)
        r, g, b = hex_to_rgb(val)
        r2, g2, b2 = lighten((r, g, b))
        return '%s="#%02X%02X%02X"' % (m.group(1), r2, g2, b2)

    out = re.sub(r'\b(fill|stroke)="(#[0-9a-fA-F]{3,6})"', repl, src)
    (IMG / "logo-light.svg").write_text(out, encoding="utf-8")
    print("wrote assets/img/logo-light.svg")


if __name__ == "__main__":
    do_png()
    do_svg()
