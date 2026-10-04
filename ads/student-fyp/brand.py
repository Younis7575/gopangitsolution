"""Drawing toolkit for the ad: brand palette, typography, easing, glass cards.

Colours come straight from the site stylesheets:
  --gis-bg #05070d   --gis-surface #0b1020   --gis-accent #2b65f5
  --gis-accent-2 #7c5cff   --gis-cyan #38ddf2   --gis-ink #f2f5fc
  --gis-muted #7b869c

Typography is SF Pro (variable) so we get real Heavy/Black weights without
shipping a font file.

IMPORTANT: every frame is an RGB image and translucent drawing goes through
`ImageDraw.Draw(frame, "RGBA")`, which is the only Pillow mode that actually
blends (on an RGBA image the same call *replaces* pixels, alpha included).
Sprites with their own alpha are composited with `frame.paste(sprite, xy, sprite)`.
"""

from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
FPS = 30

BG_MID = (5, 7, 14)
BG_BOT = (2, 4, 10)
SURFACE = (11, 16, 32)
ACCENT = (43, 101, 245)
ACCENT_L = (120, 165, 255)
ACCENT2 = (124, 92, 255)
CYAN = (56, 221, 242)
INK = (242, 245, 252)
MUTED = (123, 134, 156)
DIM = (86, 96, 118)
WARN = (255, 96, 96)
OK = (46, 213, 145)
GOLD = (255, 190, 92)

# safe area: Reels UI eats the top ~180px and the bottom ~330px
SAFE_TOP = 300
SAFE_BOT = 1590

SF = "/System/Library/Fonts/SFNS.ttf"
_fc: dict = {}


def font(size: int, weight: str = "Regular") -> ImageFont.FreeTypeFont:
    key = (size, weight)
    f = _fc.get(key)
    if f is None:
        f = ImageFont.truetype(SF, size)
        try:
            f.set_variation_by_name(weight)
        except Exception:
            pass
        _fc[key] = f
    return f


def new_draw(img):
    """The one and only way to get a blending draw object."""
    return ImageDraw.Draw(img, "RGBA")


# ---------------------------------------------------------------- easing ---

def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


def lerp(a, b, t):
    return a + (b - a) * t


def prog(t, start, dur):
    """Normalised 0..1 progress of a sub-animation that starts at `start`."""
    if dur <= 0:
        return 1.0
    return clamp((t - start) / dur)


def ease_out_cubic(t):
    t = clamp(t)
    return 1 - (1 - t) ** 3


def ease_in_cubic(t):
    return clamp(t) ** 3


def ease_in_out(t):
    t = clamp(t)
    return 3 * t * t - 2 * t * t * t


def ease_out_expo(t):
    t = clamp(t)
    return 1.0 if t >= 1 else 1 - 2 ** (-10 * t)


def ease_out_back(t, s=1.55):
    t = clamp(t)
    u = t - 1
    return 1 + (s + 1) * u ** 3 + s * u ** 2


def pop(t):
    """Scale-in used for chips/cards: 0 -> 1 with a small overshoot."""
    return ease_out_back(t, 1.9)


def rgba(c, a):
    return (int(c[0]), int(c[1]), int(c[2]), int(clamp(a, 0, 255)))


# ------------------------------------------------------------------ text ---

def text_w(d: ImageDraw.ImageDraw, text: str, f, tracking: float = 0.0) -> float:
    if not text:
        return 0.0
    if tracking == 0:
        return d.textlength(text, font=f)
    return sum(d.textlength(ch, font=f) for ch in text) + tracking * (len(text) - 1)


def draw_text(d, xy, text, f, fill, tracking=0.0, anchor="la",
              stroke_width=0, stroke_fill=None):
    """Draw text with optional letter-spacing. anchor[0] in l/m/r."""
    if not text:
        return 0.0
    x, y = xy
    if tracking == 0:
        d.text((x, y), text, font=f, fill=fill, anchor=anchor,
               stroke_width=stroke_width, stroke_fill=stroke_fill)
        return d.textlength(text, font=f)
    total = text_w(d, text, f, tracking)
    if anchor[0] == "m":
        x -= total / 2
    elif anchor[0] == "r":
        x -= total
    va = anchor[1] if len(anchor) > 1 else "a"
    for ch in text:
        d.text((x, y), ch, font=f, fill=fill, anchor="l" + va,
               stroke_width=stroke_width, stroke_fill=stroke_fill)
        x += d.textlength(ch, font=f) + tracking
    return total


def wrap(d, text, f, max_w, tracking=0.0):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if not cur or text_w(d, t, f, tracking) <= max_w:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def karaoke(frame, d, xy, text, f, fill_live, fill_idle, p, tracking=0.0,
            stroke_width=0, stroke_fill=None, center=False):
    """Caption whose colour sweeps left->right in step with the voice."""
    x, y = xy
    w = text_w(d, text, f, tracking)
    va = "m"          # vertical middle, so idle and live text share a baseline
    draw_text(d, (x, y), text, f, fill_idle, tracking,
              ("m" if center else "l") + va, stroke_width, stroke_fill)
    if p <= 0 or not text:
        return w
    if p >= 1:
        draw_text(d, (x, y), text, f, fill_live, tracking,
                  ("m" if center else "l") + va, stroke_width, stroke_fill)
        return w
    # 'm' means the box spans ascender..descender, so the baseline sits at
    # y + (ascent - descent) / 2. Build the live strip around that offset.
    asc, desc = f.getmetrics()
    base_off = (asc - desc) / 2.0
    strip_h = int(f.size * 3)
    strip = Image.new("RGBA", (int(w) + 24, strip_h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(strip)
    # always left-aligned inside the strip; the caller offsets by px
    draw_text(sd, (12, strip_h / 2), text, f, fill_live, tracking,
              "l" + va, stroke_width, stroke_fill)
    strip = strip.crop((0, 0, max(1, int(w * clamp(p)) + 24), strip_h))
    px = x - w / 2 if center else x
    frame.paste(strip, (int(round(px)) - 12,
                        int(round(y - strip_h / 2))), strip)
    return w


def gradient_text(frame, xy, text, f, c0, c1, anchor="mm", alpha=255):
    """Glyphs filled with a horizontal gradient."""
    x, y = xy
    pad = int(f.size * 0.5)
    tw = int(text_w(new_draw(frame), text, f)) + pad * 2
    th = int(f.size * 2.0)
    mask = Image.new("L", (tw, th), 0)
    ImageDraw.Draw(mask).text((pad, th / 2), text, font=f, fill=255, anchor="lm")
    t = np.linspace(0, 1, tw, dtype=np.float32)[None, :, None]
    rgb = (np.array(c0, np.float32)[None, None, :] * (1 - t) +
           np.array(c1, np.float32)[None, None, :] * t)
    rgb = np.repeat(rgb, th, axis=0)
    a = (np.asarray(mask, np.float32) / 255.0 * alpha)[:, :, None]
    grad = np.concatenate([rgb, a], axis=2).astype(np.uint8)
    patch = Image.fromarray(grad, "RGBA")
    px = x - tw / 2 if anchor[0] == "m" else (x - tw if anchor[0] == "r" else x)
    frame.paste(patch, (int(round(px)), int(round(y - th / 2))), patch)


# --------------------------------------------------------------- surfaces ---

def vgrad(size, top, bot):
    w, h = size
    t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    arr = np.array(top, np.float32)[None, None, :] * (1 - t) + \
        np.array(bot, np.float32)[None, None, :] * t
    return Image.fromarray(np.repeat(arr.astype(np.uint8), w, axis=1), "RGB")


def make_background():
    """Static base plate: gradient + aurora + tech grid + vignette. Built once."""
    bg = vgrad((W, H), (7, 10, 22), BG_BOT)
    for cx, cy, r, col, a in ((250, 380, 620, ACCENT, 120),
                               (860, 250, 520, ACCENT2, 100),
                               (560, 780, 700, (30, 60, 140), 80)):
        blob = make_blob(r, col, falloff=2.4, blur_frac=0.22)
        bg.paste(alpha_scaled(blob, a / 255.0), (cx - r // 2, cy - r // 2), blob)

    d = new_draw(bg)
    step = 90
    for x in range(0, W + 1, step):
        d.line([(x, 0), (x, H)], fill=rgba((150, 180, 255), 10), width=1)
    for y in range(0, H + 1, step):
        d.line([(0, y), (W, y)], fill=rgba((150, 180, 255), 10), width=1)

    yy, xx = np.mgrid[0:H, 0:W]
    dx = (xx - W / 2) / (W / 2)
    dy = (yy - H / 2) / (H / 2)
    r = np.sqrt(dx * dx + dy * dy * 0.72)
    v = np.clip((r - 0.60) / 0.78, 0, 1) ** 1.4
    mask = Image.fromarray((v * 225).astype(np.uint8), "L")
    bg.paste(Image.new("RGB", (W, H), (0, 0, 0)), (0, 0), mask)
    return bg


def make_blob(size, color, falloff=2.2, blur_frac=0.18):
    """Radial glow sprite (RGBA) built with numpy, blurred once."""
    s = int(size)
    yy, xx = np.mgrid[0:s, 0:s]
    c = (s - 1) / 2.0
    rr = np.sqrt(((xx - c) / c) ** 2 + ((yy - c) / c) ** 2)
    a = np.clip(1 - rr, 0, 1) ** falloff
    arr = np.zeros((s, s, 4), np.uint8)
    arr[..., 0], arr[..., 1], arr[..., 2] = color[0], color[1], color[2]
    arr[..., 3] = (a * 255).astype(np.uint8)
    img = Image.fromarray(arr, "RGBA")
    if blur_frac:
        img = img.filter(ImageFilter.GaussianBlur(max(2, s * blur_frac)))
    return img


def alpha_scaled(img, k):
    k = clamp(k)
    if k >= 1:
        return img
    a = np.asarray(img).copy()
    a[..., 3] = (a[..., 3] * k).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, img.size[0] - 1, img.size[1] - 1], radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def paste(img, sprite, xy):
    """Alpha-composite an RGBA sprite onto an RGB frame."""
    img.paste(sprite, (int(xy[0]), int(xy[1])), sprite)


def shadow(img, box, radius=36, blur=34, alpha=118, dy=16, spread=18):
    """Soft drop shadow under a card, rendered into a small scratch layer."""
    x0, y0, x1, y1 = box
    m = spread + blur * 3
    rx0, ry0 = max(0, int(x0 - m)), max(0, int(y0 - m + dy))
    rx1, ry1 = min(W, int(x1 + m)), min(H, int(y1 + m + dy))
    if rx1 <= rx0 or ry1 <= ry0:
        return
    lay = Image.new("L", (rx1 - rx0, ry1 - ry0), 0)
    ImageDraw.Draw(lay).rounded_rectangle(
        [x0 - rx0, y0 - ry0 + dy, x1 - rx0, y1 - ry0 + dy],
        radius, fill=int(alpha))
    lay = lay.filter(ImageFilter.GaussianBlur(blur))
    blk = Image.new("RGBA", lay.size, (0, 0, 0, 255))
    blk.putalpha(lay)
    img.paste(blk, (rx0, ry0), blk)


def glass(d, box, radius=34, alpha=20, border=(255, 255, 255, 40),
          tint=(255, 255, 255), highlight=True):
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, radius, fill=rgba(tint, alpha),
                        outline=border, width=2)
    if highlight:
        d.rounded_rectangle([x0 + 3, y0 + 3, x1 - 3, y0 + radius], radius,
                            fill=(255, 255, 255, 10))
    return box


def gradient_rect(img, box, c0, c1, radius=34, horizontal=False, alpha=255):
    """Rounded rect filled with a linear gradient, composited onto `img`."""
    x0, y0, x1, y1 = [int(v) for v in box]
    w, h = max(1, x1 - x0), max(1, y1 - y0)
    if horizontal:
        t = np.linspace(0, 1, w, dtype=np.float32)[None, :, None]
    else:
        t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    rgb = np.array(c0, np.float32)[None, None, :] * (1 - t) + \
        np.array(c1, np.float32)[None, None, :] * t
    if horizontal:
        rgb = np.repeat(rgb, h, axis=0)
    else:
        rgb = np.repeat(rgb, w, axis=1)
    a = np.full((h, w, 1), float(clamp(alpha, 0, 255)), np.float32)
    patch = Image.fromarray(np.concatenate([rgb, a], axis=2).astype(np.uint8),
                            "RGBA")
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius, fill=255)
    patch.putalpha(Image.composite(patch.getchannel("A"),
                                   Image.new("L", (w, h), 0), mask))
    img.paste(patch, (x0, y0), patch)


def accent_bar(img, x, y, w, h, c0=ACCENT, c1=ACCENT2, radius=None, alpha=240):
    """Rounded gradient bar (single shape, no banding)."""
    if w <= 0:
        return
    radius = radius if radius is not None else h / 2
    gradient_rect(img, [x, y, x + w, y + h], c0, c1, radius=radius,
                  horizontal=True, alpha=alpha)


def sweep_highlight(img, box, radius, p, color=INK, strength=95):
    """A diagonal light band travelling across a card — the 'shine'."""
    if p <= 0 or p >= 1.35:
        return
    x0, y0, x1, y1 = [int(v) for v in box]
    bw = max(8, int((x1 - x0) * 0.30))
    span = (x1 - x0) + bw
    sx = x0 - bw + span * clamp(p)
    lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(lay)
    for i in range(bw):
        a = int(strength * math.sin(math.pi * (i + 0.5) / bw))
        ld.line([(sx + i, y0), (sx + i - (y1 - y0) * 0.55, y1)],
                fill=tuple(color) + (a,), width=1)
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius, fill=255)
    lay.putalpha(Image.composite(lay.getchannel("A"),
                                 Image.new("L", img.size, 0), mask))
    img.paste(lay, (0, 0), lay)