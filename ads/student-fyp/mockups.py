"""Self-generated product mockups for the deliverables scene.

Nothing here is a screenshot: the web app and the mobile app are drawn with
Pillow on top of the brand palette, so both platforms can be *animated*
inside the video — counters ticking up, chart bars growing, a status
pipeline filling in, rows popping in with their checkmarks, an active tab
indicator sliding across.

Two entry points, both returning an RGBA sprite of a fixed size:

    web_app(t, clock)     ->  WEB_W x WEB_H   browser + dashboard
    mobile_app(t, clock)  ->  PH_W  x PH_H    device + student app

`t` is the mockup's own local timeline (0 when it enters the frame) and
`clock` is the scene clock, used only for idle motion (pulses, sways) so a
mockup never freezes. Every frame is drawn fresh, so nothing is cached.

Same Pillow rules as the rest of the ad: each sprite is built as an **RGB**
image (so translucent fills blend via `B.new_draw`) and converted to RGBA
only at the very end by the rounded-corner mask.
"""

from __future__ import annotations

import math

import brand as B
from brand import (ACCENT, ACCENT2, ACCENT_L, CYAN, DIM, GOLD, INK, MUTED, OK,
                   WARN, ease_out_cubic, ease_out_back, font, lerp, pop, prog,
                   rgba)

WEB_W, WEB_H = 700, 480        # browser window
PH_W, PH_H = 290, 610          # phone, bezel included

_PULSE = (255, 95, 87, 255, 188, 46, 40, 200, 64)


# ------------------------------------------------------------------ atoms ---

def _spark(d, x, y, w, h, vals, p, col, width=3):
    """Mini sparkline, drawn left -> right as the scene plays."""
    if p <= 0:
        return
    n = len(vals)
    k = max(2, min(n, int(n * min(1.0, p)) + 1))
    pts = [(x + w * i / (n - 1), y + h - h * v) for i, v in enumerate(vals[:k])]
    d.line(pts, fill=rgba(col, 235), width=width, joint="curve")
    px, py = pts[-1]
    d.ellipse([px - width, py - width, px + width, py + width],
              fill=rgba(col, 255))


def _bars(img, d, x0, baseline, bw, gap, fracs, t, c0, c1, hot=6):
    """Row of bars that grow with a stagger. Returns nothing."""
    for i, f in enumerate(fracs):
        g = ease_out_cubic(prog(t, 0.55 + i * 0.08, 0.75))
        hgt = 168 * f * g
        if hgt <= 1:
            continue
        x = x0 + i * (bw + gap)
        a = ACCENT if i != hot else ACCENT2
        b = ACCENT2 if i != hot else CYAN
        B.gradient_rect(img, [x, baseline - hgt, x + bw, baseline],
                        a, b, radius=5, horizontal=False, alpha=255)
        cap = B.new_draw(img)
        cap.rounded_rectangle([x, baseline - hgt, x + bw, baseline - hgt + 3],
                              1.5, fill=rgba((255, 255, 255), 120))


def _check(d, cx, cy, s, p):
    """Tick mark that draws itself, then pops."""
    e = ease_out_back(min(1.0, p), 2.2)
    if e <= 0:
        return
    s = s * e
    col = (255, 255, 255, 255)
    d.line([(cx - s * 0.38, cy + s * 0.02), (cx - s * 0.10, cy + s * 0.30)],
           fill=col, width=max(2, int(s * 0.16)), joint="curve")
    d.line([(cx - s * 0.10, cy + s * 0.30), (cx + s * 0.40, cy - s * 0.32)],
           fill=col, width=max(2, int(s * 0.16)), joint="curve")


def _ripple(d, x, y, p, col=CYAN, r0=6, r1=30):
    """A click/tap ring that expands and fades."""
    if p <= 0 or p >= 1:
        return
    e = ease_out_cubic(p)
    r = r0 + (r1 - r0) * e
    a = 220 * (1 - e)
    d.ellipse([x - r, y - r, x + r, y + r], outline=rgba(col, a), width=3)
    r *= 0.66
    d.ellipse([x - r, y - r, x + r, y + r], outline=rgba(col, a * 0.7),
              width=2)


def _cursor(d, x, y, alpha):
    """The classic pointer, so the browser reads as software in use."""
    if alpha <= 0.01:
        return
    pts = [(0, 0), (0, 17), (4.6, 12.8), (7.6, 19.4), (10.4, 18.0),
           (7.4, 11.8), (12.0, 11.2)]
    k = 1.45
    d.polygon([(x + px * k, y + py * k) for px, py in pts],
              fill=rgba((255, 255, 255), 245 * alpha),
              outline=rgba((6, 9, 20), 220 * alpha))


def _tab_glyph(d, kind, cx, cy, col, on):
    """Four tiny vector icons for the app's bottom tab bar."""
    s = 7
    if kind == 0:                                   # home
        d.polygon([(cx, cy - s), (cx + s, cy + 1), (cx - s, cy + 1)],
                  fill=rgba(col, 255))
        d.rounded_rectangle([cx - 5, cy + 2, cx + 5, cy + s], 1.5,
                            fill=rgba(col, 255))
    elif kind == 1:                                 # projects (grid)
        for gx in (-1, 1):
            for gy in (-1, 1):
                d.rounded_rectangle([cx + gx * 3 - 3, cy + gy * 3 - 3,
                                     cx + gx * 3 + 3, cy + gy * 3 + 3], 1.5,
                                    fill=rgba(col, 255))
    elif kind == 2:                                 # chat
        d.rounded_rectangle([cx - s, cy - s + 1, cx + s, cy + s - 2], s / 2,
                            outline=rgba(col, 255), width=2)
        d.polygon([(cx - 4, cy + s - 3), (cx - 1, cy + s - 3),
                   (cx - 4, cy + s + 1)], fill=rgba(col, 255))
    else:                                           # profile
        d.ellipse([cx - 4, cy - s, cx + 4, cy - s + 8], fill=rgba(col, 255))
        d.pieslice([cx - s, cy + 1, cx + s, cy + s + 8], 180, 360,
                   fill=rgba(col, 255))


# ------------------------------------------------------------- web (laptop) ---

def web_app(t, clock=0.0):
    """Browser window showing the real admin dashboard for student projects."""
    w, h = WEB_W, WEB_H
    img = B.vgrad((w, h), (17, 23, 46), (8, 11, 26))
    d = B.new_draw(img)

    # ---- window chrome ---------------------------------------------------
    d.rectangle([0, 0, w, 52], fill=rgba(INK, 12))
    d.line([(0, 52), (w, 52)], fill=rgba(INK, 34), width=1)
    for i in range(3):
        d.ellipse([16 + i * 21 - 6, 20, 16 + i * 21 + 6, 32],
                  fill=_PULSE[i * 4:i * 4 + 4])
    d.rounded_rectangle([96, 12, 556, 40], 14, fill=rgba(INK, 20),
                        outline=rgba(INK, 32), width=1)
    d.rounded_rectangle([110, 24, 120, 32], 2, fill=rgba(OK, 235))
    d.arc([112, 18, 118, 26], 180, 360, fill=rgba(OK, 235), width=2)
    B.draw_text(d, (128, 26), "gopangitsolution.com/student-projects",
                font(14, "Medium"), rgba(MUTED, 255), anchor="lm")
    d.rounded_rectangle([566, 12, 686, 40], 14, fill=rgba(CYAN, 36),
                        outline=rgba(CYAN, 140), width=1)
    B.draw_text(d, (626, 26), "WEB APP", font(13, "Bold"), rgba(CYAN, 255),
                1.4, "mm")
    lp = ease_out_cubic(prog(t, 0.12, 1.15))
    if lp > 0:
        B.accent_bar(img, 0, 52, w * lp, 3, ACCENT, CYAN)

    # ---- sidebar ---------------------------------------------------------
    d.rectangle([0, 53, 152, h], fill=(10, 14, 33))
    d.line([(152, 53), (152, h)], fill=rgba(INK, 26), width=1)
    B.gradient_rect(img, [18, 68, 40, 90], ACCENT, ACCENT2, radius=6)
    B.draw_text(d, (48, 79), "Gopang", font(14, "Bold"), rgba(INK, 255),
                anchor="lm")
    nav = [("Overview", False), ("Requests", True), ("Projects", False),
           ("Schedule", False), ("Reports", False)]
    for i, (lab, active) in enumerate(nav):
        p = prog(t, 0.20 + i * 0.06, 0.4)
        if p <= 0:
            continue
        e = ease_out_cubic(p)
        y = 116 + i * 36
        x0 = 14 - (1 - e) * 26
        if active:
            d.rounded_rectangle([x0, y - 15, x0 + 124, y + 15], 8,
                                fill=rgba(ACCENT, 92))
            d.rounded_rectangle([x0, y - 15, x0 + 3, y + 15], 2,
                                fill=rgba(CYAN, 255))
        col = [CYAN, ACCENT_L, ACCENT2, GOLD, OK][i]
        d.ellipse([x0 + 16, y - 4, x0 + 24, y + 4], fill=rgba(col, 235 * e))
        B.draw_text(d, (x0 + 34, y), lab,
                    font(14, "Semibold" if active else "Medium"),
                    rgba(INK if active else MUTED, 255 * e), anchor="lm")
    d.ellipse([16, 430, 42, 456], fill=rgba(ACCENT2, 210))
    B.draw_text(d, (29, 443), "AK", font(13, "Black"), (255, 255, 255),
                anchor="mm")
    B.draw_text(d, (52, 443), "Admin", font(13, "Medium"), rgba(MUTED, 255),
                anchor="lm")

    # ---- main header -----------------------------------------------------
    pe = ease_out_cubic(prog(t, 0.05, 0.5))
    B.draw_text(d, (170, 84), "Student Projects", font(24, "Bold"),
                rgba(INK, 255 * pe), anchor="lm")
    B.draw_text(d, (170, 108), "requests  ·  schedule  ·  delivery",
                font(12, "Medium"), rgba(MUTED, 255 * pe), 0.4, "lm")
    pn = prog(t, 0.22, 0.5)
    if pn > 0:
        e = ease_out_cubic(pn)
        B.gradient_rect(img, [566, 72, 682, 102], ACCENT, ACCENT2, radius=15,
                        alpha=int(240 * e))
        B.draw_text(d, (624, 87), "+ New Request", font(13, "Bold"),
                    rgba((255, 255, 255), 255 * e), 0.3, "mm")

    # ---- stat cards (counters tick up, sparklines draw) -------------------
    cards = [("ACTIVE", 24, CYAN, [0.3, 0.5, 0.42, 0.66, 0.58, 0.82, 1.0]),
             ("IN DEVELOPMENT", 9, ACCENT_L, [0.6, 0.48, 0.7, 0.55, 0.8, 0.68, 0.92]),
             ("DELIVERED", 148, OK, [0.18, 0.34, 0.42, 0.6, 0.7, 0.86, 1.0])]
    for i, (lab, target, col, vals) in enumerate(cards):
        p = prog(t, 0.14 + i * 0.09, 0.45)
        if p <= 0:
            continue
        e = ease_out_cubic(p)
        x = 170 + i * 174
        d.rounded_rectangle([x - (1 - e) * 40, 126, x + 162, 204], 15,
                            fill=rgba(INK, 15 * e), outline=rgba(INK, 36 * e),
                            width=1)
        B.draw_text(d, (x + 14, 148), lab, font(11, "Medium"),
                    rgba(MUTED, 255 * e), 0.9, "lm")
        n = int(target * ease_out_cubic(prog(t, 0.34 + i * 0.12, 0.95)))
        B.draw_text(d, (x + 14, 180), str(n), font(28, "Black"),
                    rgba(INK, 255 * e), anchor="lm")
        _spark(d, x + 86, 146, 62, 40, vals,
               prog(t, 0.45 + i * 0.12, 1.3), col)

    # ---- chart -----------------------------------------------------------
    pc = prog(t, 0.28, 0.5)
    if pc > 0:
        e = ease_out_cubic(pc)
        d.rounded_rectangle([170, 222 - (1 - e) * 30, 352, 466], 16,
                            fill=rgba(INK, 13 * e), outline=rgba(INK, 32 * e),
                            width=1)
        B.draw_text(d, (184, 244), "Requests / month", font(13, "Semibold"),
                    rgba(INK, 235 * e), anchor="lm")
        B.draw_text(d, (338, 244), "2026", font(11, "Medium"),
                    rgba(DIM, 255 * e), anchor="rm")
        d.line([(184, 446), (338, 446)], fill=rgba(INK, 30 * e), width=1)
        _bars(img, d, 184, 446, 14, 9,
              [0.34, 0.50, 0.42, 0.72, 0.60, 0.86, 1.0], t, ACCENT, ACCENT2, 6)

    # ---- pipeline --------------------------------------------------------
    pp = prog(t, 0.34, 0.5)
    if pp > 0:
        e = ease_out_cubic(pp)
        d.rounded_rectangle([366, 222 - (1 - e) * 30, 534, 466], 16,
                            fill=rgba(INK, 13 * e), outline=rgba(INK, 32 * e),
                            width=1)
        B.draw_text(d, (380, 244), "Pipeline", font(13, "Semibold"),
                    rgba(INK, 235 * e), anchor="lm")
        d.ellipse([516, 240, 522, 246], fill=rgba(OK, 235 * e))
        rows = [("Requirements", "6", CYAN, 0.34),
                ("Quote ready", "4", ACCENT_L, 0.24),
                ("Development", "9", ACCENT2, 0.50),
                ("Delivered", "148", OK, 1.0)]
        for i, (lab, n, col, frac) in enumerate(rows):
            rp = prog(t, 0.62 + i * 0.14, 0.7)
            if rp <= 0:
                continue
            re = ease_out_cubic(rp)
            y = 276 + i * 48
            d.ellipse([380, y - 4, 388, y + 4], fill=rgba(col, 240 * re))
            B.draw_text(d, (396, y - 6), lab, font(12, "Medium"),
                        rgba(MUTED, 255 * re), anchor="lm")
            k = n if rp > 0.55 else ""
            B.draw_text(d, (520, y - 7), k, font(15, "Bold"),
                        rgba(INK, 255 * re), anchor="rm")
            d.rounded_rectangle([396, y + 8, 520, y + 14], 3,
                                fill=rgba(INK, 30 * re))
            B.accent_bar(img, 396, y + 8, 124 * frac * re, 6, col, col,
                         radius=3)
    # inner rim
    d.rounded_rectangle([1, 1, w - 2, h - 2], 16, outline=rgba(INK, 62),
                        width=2)

    # a pointer moves across the dashboard and clicks twice
    pf = prog(t, 0.85, 0.5)
    if pf > 0:
        a = ease_out_cubic(pf) * (1 - prog(t, 3.9, 0.6))
        p1 = ease_out_cubic(prog(t, 1.0, 0.75))
        p2 = ease_out_cubic(prog(t, 2.1, 0.8))
        ax, ay = 640, 300
        bx, by = 76, 152
        cx2, cy2 = 268, 430
        x = ax + (bx - ax) * p1 + (cx2 - bx) * p2
        y = ay + (by - ay) * p1 + (cy2 - by) * p2
        _cursor(d, x, y, a)
        _ripple(d, bx, by, prog(t, 1.85, 0.55), CYAN)
        _ripple(d, cx2, cy2, prog(t, 3.0, 0.55), CYAN)
    return B.rounded(img, 16)


# ------------------------------------------------------------- mobile (app) ---

def mobile_app(t, clock=0.0):
    """iPhone-style device running the student app: project card, deliverables,
    bottom tab bar. `t` is the mockup's own entrance clock."""
    w, h = PH_W, PH_H
    sw, sh = w - 24, h - 24          # screen area

    # ---- device body -----------------------------------------------------
    img = B.vgrad((w, h), (38, 42, 58), (12, 14, 24))
    d = B.new_draw(img)
    d.rounded_rectangle([1, 1, w - 2, h - 2], 46, outline=rgba(INK, 78),
                        width=2)
    d.rounded_rectangle([4, 4, w - 5, h - 5], 44, outline=rgba(INK, 26),
                        width=1)
    d.arc([12, 12, w - 12, h * 0.62], 195, 345, fill=rgba(INK, 34), width=3)
    for by, bh2 in ((150, 46), (210, 46), (270, 46)):     # side buttons
        d.rounded_rectangle([-1, by, 3, by + bh2], 2, fill=rgba(INK, 60))
    d.rounded_rectangle([w - 3, 200, w + 1, 254], 2, fill=rgba(INK, 60))

    # ---- screen ----------------------------------------------------------
    s = B.vgrad((sw, sh), (13, 18, 40), (7, 10, 24))
    sd = B.new_draw(s)

    # status bar
    B.draw_text(sd, (22, 22), "9:41", font(13, "Bold"), rgba(INK, 255),
                anchor="lm")
    for i in range(4):
        bh3 = 4 + i * 3
        sd.rounded_rectangle([198 + i * 6, 26 - bh3, 202 + i * 6, 26], 1.5,
                             fill=rgba(INK, 255 if i < 3 else 90))
    sd.rounded_rectangle([226, 14, 250, 28], 4, outline=rgba(INK, 150),
                         width=2)
    sd.rounded_rectangle([251, 18, 253, 24], 1, fill=rgba(INK, 150))
    bat = 16 * min(1.0, 0.35 + 0.65 * ease_out_cubic(prog(t, 0.2, 1.4)))
    sd.rounded_rectangle([228, 16, 228 + bat, 26], 2, fill=rgba(OK, 235))

    # greeting + avatar
    ph = prog(t, 0.10, 0.5)
    if ph > 0:
        e = ease_out_cubic(ph)
        B.draw_text(sd, (22, 58), "GOOD MORNING, AYESHA", font(10, "Bold"),
                    rgba(MUTED, 255 * e), 1.1, "lm")
        B.draw_text(sd, (22, 84), "My Projects", font(25, "Black"),
                    rgba(INK, 255 * e), anchor="lm")
        r = 21 * pop(e)
        cx = 226
        B.gradient_rect(s, [cx - r, 62 - r, cx + r, 62 + r], ACCENT2, ACCENT,
                        radius=r, horizontal=False, alpha=int(250 * e))
        B.draw_text(sd, (cx, 62), "AK", font(14, "Black"),
                    rgba((255, 255, 255), 255 * e), anchor="mm")

    # hero: the live request card
    pb = prog(t, 0.26, 0.6)
    if pb > 0:
        e = ease_out_back(min(1.0, pb), 1.3)
        box = [18, 112, sw - 18, 244]
        B.gradient_rect(s, box, ACCENT, ACCENT2, radius=22, horizontal=True,
                        alpha=246)
        he = ease_out_cubic(pb)
        B.draw_text(sd, (34, 140), "FYP-2026-00042", font(12, "Bold"),
                    rgba((255, 255, 255), 225 * he), 0.6, "lm")
        B.draw_text(sd, (34, 172), "In Development", font(23, "Black"),
                    rgba((255, 255, 255), 255 * he), anchor="lm")
        sd.rounded_rectangle([34, 196, 196, 208], 6, fill=(255, 255, 255, 60))
        fill = 162 * 0.68 * ease_out_cubic(prog(t, 0.7, 1.3))
        if fill > 2:
            B.accent_bar(s, 34, 196, fill, 12, CYAN, (255, 255, 255), radius=6)
            dot = 5 + 1.2 * math.sin(clock * 4.2)
            sd.ellipse([34 + fill - dot - 6, 202 - dot - 6,
                        34 + fill + dot + 6, 202 + dot + 6],
                       fill=rgba(CYAN, 70))
            sd.ellipse([34 + fill - dot, 202 - dot, 34 + fill + dot, 202 + dot],
                       fill=rgba((255, 255, 255), 255))
        B.draw_text(sd, (sw - 34, 202), "68%", font(20, "Black"),
                    rgba((255, 255, 255), 255 * he), anchor="rm")
        B.draw_text(sd, (34, 224), "quote confirmed  ·  due in 9 days",
                    font(10, "Medium"), rgba((255, 255, 255), 190 * he),
                    anchor="lm")

    # deliverables list
    pl = prog(t, 0.55, 0.4)
    if pl > 0:
        e = ease_out_cubic(pl)
        B.draw_text(sd, (22, 270), "DELIVERABLES", font(10, "Bold"),
                    rgba(MUTED, 255 * e), 1.4, "lm")
    rows = [("Source Code", "Git repository  ·  ready", (ACCENT, ACCENT_L)),
            ("UI / UX Design", "Figma file  ·  build", (ACCENT2, ACCENT)),
            ("Backend + API", "Server  ·  database", (CYAN, ACCENT))]
    for i, (t1, t2, cols) in enumerate(rows):
        p = prog(t, 0.70 + i * 0.20, 0.5)
        if p <= 0:
            continue
        e = ease_out_cubic(p)
        y = 286 + i * 84 - (1 - e) * 26
        sd.rounded_rectangle([18, y, sw - 18, y + 74], 18,
                             fill=rgba(INK, 14 * e),
                             outline=rgba(INK, 30 * e), width=1)
        k = pop(min(1.0, p * 1.6))
        B.gradient_rect(s, [30, y + 19, 66, y + 55], cols[0], cols[1],
                        radius=14 * max(0.2, k), horizontal=False,
                        alpha=int(250 * e))
        ck = prog(t, 0.70 + i * 0.20 + 0.32, 0.4)
        if ck > 0:
            _check(sd, 48, y + 36, 17, ck)
        B.draw_text(sd, (78, y + 30), t1, font(15, "Semibold"),
                    rgba(INK, 255 * e), anchor="lm")
        B.draw_text(sd, (78, y + 52), t2, font(11, "Medium"),
                    rgba(MUTED, 255 * e), anchor="lm")
        ch = ease_out_cubic(prog(t, 0.70 + i * 0.20 + 0.5, 0.4))
        if ch > 0:
            cc = rgba(INK, 130 * ch)
            sd.line([(sw - 44, y + 32), (sw - 36, y + 40)], fill=cc, width=2)
            sd.line([(sw - 36, y + 40), (sw - 28, y + 24)], fill=cc, width=2)
    sd.rounded_rectangle([sw - 10, 292, sw - 7, 372], 2, fill=rgba(INK, 45))

    # bottom tab bar — the active pill slides from Home to Projects
    pt = prog(t, 0.4, 0.4)
    if pt > 0:
        e = ease_out_cubic(pt)
        sd.rectangle([0, sh - 48, sw, sh], fill=rgba(INK, 24 * e))
        sd.line([(0, sh - 48), (sw, sh - 48)], fill=rgba(INK, 40 * e), width=1)
        slide = ease_out_cubic(prog(t, 1.05, 0.6))
        active_x = lerp(36, 102, slide)
        sd.rounded_rectangle([active_x - 16, sh - 42, active_x + 16, sh - 16], 11,
                             fill=rgba(ACCENT, 110 * e))
        _ripple(sd, active_x, sh - 29, prog(t, 1.0, 0.7), CYAN, 8, 34)
        labels = ["Home", "Projects", "Chat", "Profile"]
        for i, lab in enumerate(labels):
            x = 36 + i * 66
            on = (i == 1) if slide > 0.5 else (i == 0)
            col = CYAN if on else MUTED
            _tab_glyph(sd, i, x, sh - 30, col, on)
            B.draw_text(sd, (x, sh - 8), lab, font(9, "Semibold"),
                        rgba(col, 255 * e), 0.3, "mm")
        sd.rounded_rectangle([sw / 2 - 34, sh - 6, sw / 2 + 34, sh - 3], 2,
                             fill=rgba(INK, 120 * e))

    s2 = B.new_draw(s)
    s2.rounded_rectangle([0, 0, sw - 1, sh - 1], 34, outline=rgba(INK, 46),
                         width=1)
    B.paste(img, B.rounded(s, 34), (12, 12))

    # dynamic island sits on top of the screen
    di = B.new_draw(img)
    di.rounded_rectangle([101, 22, 189, 48], 13, fill=(4, 5, 10))
    di.ellipse([172, 30, 179, 37], fill=(22, 26, 40))
    return B.rounded(img, 46)
