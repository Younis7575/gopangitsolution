"""Scene renderers for the ad.

Every scene depicts the real product: the 30-minute slot grid, the seven
project-request fieldsets, the admin pipeline statuses and — for the
deliverables beat — the web app and the mobile app drawn live by `mockups`.
Frames are RGB and composited with `B.paste`, so translucent fills blend
correctly.
"""

from __future__ import annotations

import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw

import brand as B
import mockups as MK
from brand import (ACCENT, ACCENT2, ACCENT_L, CYAN, DIM, GOLD, INK, MUTED, OK,
                   WARN, W, H, ease_out_back, ease_out_cubic, font, lerp, pop,
                   prog, rgba)

CAP_TOP = 1400
CAP_MAX_W = 880
RAIL_Y = 1656


class Particles:
    def __init__(self, n=52, seed=3):
        rs = random.Random(seed)
        self.p = []
        for _ in range(n):
            self.p.append({
                "x": rs.uniform(0, W), "y": rs.uniform(0, H),
                "r": rs.uniform(1.5, 4.2), "sp": rs.uniform(8, 34),
                "ph": rs.uniform(0, 6.28),
                "c": rs.choice([CYAN, ACCENT_L, ACCENT2, INK]),
                "a": rs.uniform(40, 150),
            })

    def draw(self, d, t, boost=1.0):
        for q in self.p:
            y = (q["y"] - t * q["sp"]) % (H + 80) - 40
            x = q["x"] + math.sin(t * 0.4 + q["ph"]) * 22
            a = q["a"] * (0.55 + 0.45 * math.sin(t * 1.1 + q["ph"])) * boost
            d.ellipse([x - q["r"], y - q["r"], x + q["r"], y + q["r"]],
                      fill=rgba(q["c"], a))


class Studio:
    def __init__(self, root):
        self.root = root
        self.bg = B.make_background()
        self.particles = Particles()

        logo = Image.open(os.path.join(root, "assets", "img",
                                       "logo-white.png")).convert("RGBA")
        # The shipped lockup is navy-on-transparent: unreadable on a dark
        # plate, so lift it towards white for video use.
        a = np.asarray(logo).astype(np.float32)
        lift = 0.52
        a[..., :3] = a[..., :3] + (255 - a[..., :3]) * lift
        logo = Image.fromarray(a.astype(np.uint8), "RGBA")
        self.logo = logo.resize((720, int(720 * logo.size[1] / logo.size[0])),
                                Image.LANCZOS)
        # the swirl mark on its own, for the corner bug
        mark = logo.crop((0, 0, int(logo.size[0] * 0.235), logo.size[1]))
        self.logo_mark = mark.resize((118, int(118 * mark.size[1] / mark.size[0])),
                                     Image.LANCZOS)

        self.glow_a = B.make_blob(720, ACCENT, falloff=2.5, blur_frac=0.28)
        self.glow_b = B.make_blob(640, ACCENT2, falloff=2.5, blur_frac=0.28)
        self.glow_c = B.make_blob(560, CYAN, falloff=2.6, blur_frac=0.30)
        self.glow_w = B.make_blob(620, WARN, falloff=2.6, blur_frac=0.30)

    # -- shared atoms ---------------------------------------------------
    def chip(self, d, cx, y, text, f, fg=INK, bg=(255, 255, 255, 26),
            bd=(255, 255, 255, 46), padx=26, pady=14, tracking=0.0,
            from_bottom=False):
        w = B.text_w(d, text, f, tracking)
        h = f.size + pady * 2
        x0, y0 = cx - w / 2 - padx, (y - h if from_bottom else y)
        d.rounded_rectangle([x0, y0, x0 + w + padx * 2, y0 + h],
                            h // 2, fill=bg, outline=bd, width=2)
        B.draw_text(d, (cx, y0 + h / 2), text, f, fg, tracking, "mm")
        return w + padx * 2, h

    def card(self, img, d, box, radius=34, alpha=22, bd=(255, 255, 255, 42)):
        B.shadow(img, box, radius=radius)
        B.glass(d, box, radius=radius, alpha=alpha, border=bd)

    def accent_pill(self, img, box, label, f, c0=ACCENT, c1=ACCENT2):
        B.gradient_rect(img, box, c0, c1, radius=(box[3] - box[1]) / 2,
                        horizontal=True, alpha=246)
        d = B.new_draw(img)
        B.draw_text(d, ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), label, f,
                    (255, 255, 255), anchor="mm")

    # -- persistent chrome ----------------------------------------------
    def bug(self, img, d, alpha):
        if alpha <= 0.01:
            return
        y = 218
        B.paste(img, B.alpha_scaled(self.logo_mark, alpha),
                (92, int(y - self.logo_mark.size[1] / 2)))
        x = 92 + self.logo_mark.size[0] + 20
        B.draw_text(d, (x, y - 16), "GOPANG IT SOLUTION",
                    font(29, "Semibold"), rgba(INK, 255 * alpha), 3.0, "lm")
        B.draw_text(d, (x, y + 16), "STUDENT PROJECTS",
                    font(20, "Medium"), rgba(CYAN, 230 * alpha), 4.0, "lm")

    def rail(self, img, d, t, total, scenes, idx):
        x0, x1 = 92, W - 92
        d.rounded_rectangle([x0, RAIL_Y, x1, RAIL_Y + 7], 4,
                            fill=rgba(INK, 30))
        p = min(1.0, t / total) if total else 0
        B.accent_bar(img, x0, RAIL_Y, (x1 - x0) * p, 7)
        for s in scenes:
            if s["start"] <= 0:
                continue
            x = x0 + (x1 - x0) * (s["start"] / total)
            d.rounded_rectangle([x - 1.5, RAIL_Y - 5, x + 1.5, RAIL_Y + 12], 2,
                                fill=rgba(INK, 70))
        B.draw_text(d, (x0, RAIL_Y + 32), f"{idx + 1:02d} / {len(scenes):02d}",
                    font(22, "Medium"), rgba(DIM, 255), 3.0, "lm")

    def captions(self, img, d, tl, t):
        if not tl["lines"]:
            return
        idx, lp = tl["active"](t)
        if idx is None:
            return
        text = tl["lines"][idx]["roman"]
        f = font(46, "Semibold")
        ls = B.wrap(d, text, f, CAP_MAX_W, -0.4)
        lh = 64
        y0 = CAP_TOP - lh * (len(ls) - 1) / 2
        widest = max(B.text_w(d, s, f, -0.4) for s in ls)
        bx0, bx1 = W / 2 - widest / 2 - 38, W / 2 + widest / 2 + 38
        by0 = y0 - lh / 2 - 20
        by1 = y0 + lh * (len(ls) - 1) + lh / 2 + 20
        d.rounded_rectangle([bx0, by0, bx1, by1], 30, fill=rgba((3, 5, 12), 132))
        d.rounded_rectangle([bx0, by0, bx0 + 130, by0 + 3], 2,
                            fill=rgba(CYAN, 190))
        for i, s in enumerate(ls):
            per = 1.0 / len(ls)
            local = min(1.0, max(0.0, lp - i * per) / per)
            B.karaoke(img, d, (W / 2, y0 + i * lh), s, f, (255, 255, 255),
                      (128, 140, 164), local, -0.4, stroke_width=5,
                      stroke_fill=(2, 4, 10, 200), center=True)
        n = len(tl["lines"])
        if n > 1:
            dw, gap = 20, 12
            sx = W / 2 - (n * dw + (n - 1) * gap) / 2
            for i in range(n):
                on = i == idx
                d.rounded_rectangle([sx + i * (dw + gap), by1 + 20,
                                     sx + i * (dw + gap) + dw, by1 + 26], 3,
                                    fill=rgba(CYAN if on else (255, 255, 255),
                                              235 if on else 70))


# ------------------------------------------------------------------ scenes ---

def scene_hook(img, d, st, t, tl, line_p):
    B.paste(img, B.alpha_scaled(st.glow_w, 0.55), (W - 760, 470))
    B.paste(img, B.alpha_scaled(st.glow_a, 0.42), (-300, 220))

    f_chip = font(26, "Bold")
    if prog(t, 0.05, 0.45) > 0:
        st.chip(d, W / 2, 360, "FINAL YEAR PROJECT", f_chip, INK,
                rgba(WARN, 40), rgba(WARN, 130), 22, 13, 6.0, from_bottom=True)

    f_big = font(268, "Black")
    p1 = ease_out_back(prog(t, 0.12, 0.8), 1.2)
    dy = (1 - p1) * 140
    B.paste(img, B.alpha_scaled(st.glow_a, 0.7 * p1), (W // 2 - 400, 660 - 400))
    B.gradient_text(img, (W / 2, 660 + dy), "FYP", f_big, ACCENT_L, ACCENT2,
                    alpha=255 * min(1, p1))

    p2 = prog(t, 0.62, 0.5)
    if p2 > 0:
        e = ease_out_cubic(p2)
        y = 850 + (1 - e) * 70
        B.draw_text(d, (W / 2, y), "abhi tak shuru nahi hua?", font(74, "Bold"),
                    rgba(INK, 255 * e), anchor="ma")
        pulse = 0.5 + 0.5 * math.sin(t * 5.2)
        B.accent_bar(img, W / 2 - 300 * e, y + 108, 600 * e, 8 + 3 * pulse,
                     ACCENT2, WARN)

    p3 = prog(t, tl["line_starts"].get(1, 99), 0.6)
    if p3 > 0:
        e = ease_out_cubic(p3)
        box = [W / 2 - 390, 1010 + (1 - e) * 90, W / 2 + 390, 1210 + (1 - e) * 90]
        st.card(img, d, box, bd=rgba(WARN, 70))
        d.rounded_rectangle(box, 34, fill=rgba((24, 8, 14), 120))
        B.draw_text(d, (box[0] + 44, box[1] + 56), "SUBMISSION DEADLINE",
                    font(26, "Bold"), rgba(WARN, 255), 4.0, "lm")
        left = 12 * 86400 - t * 26
        dd, rem = divmod(int(left), 86400)
        hh, rem = divmod(rem, 3600)
        mm, ss = divmod(rem, 60)
        B.draw_text(d, (box[0] + 44, box[1] + 130), f"{max(dd, 0):02d} DAYS",
                    font(60, "Black"), INK, anchor="lm")
        B.draw_text(d, (box[2] - 44, box[1] + 128),
                    f"{hh:02d} : {mm:02d} : {ss:02d}", font(42, "Bold"),
                    rgba(WARN, 255), anchor="rm")
        B.draw_text(d, (box[2] - 44, box[1] + 168), "hrs   min   sec",
                    font(21, "Medium"), rgba(MUTED, 255), 2.0, "rm")


def scene_problem(img, d, st, t, tl, line_p):
    B.paste(img, B.alpha_scaled(st.glow_w, 0.40), (-240, 360))
    rows = [("TOPIC BADAL GAYA", "Supervisor ne idea change kar diya"),
            ("REFERENCE NAHI", "Literature / papers mil nahi rahe"),
            ("REPORT DATE QAREEB", "Submission ka waqt khatam ho raha hai")]
    f_num = font(28, "Black")
    f_t = font(46, "Bold")
    f_s = font(28, "Medium")
    base_y = 500
    for i, (t1, t2) in enumerate(rows):
        p = prog(t, 0.08 + i * 0.3, 0.6)
        if p <= 0:
            continue
        k = ease_out_back(p, 1.5)
        shake = (1 - prog(t, 0.08 + i * 0.3, 0.55)) * 18 * math.sin(t * 42 + i)
        y = base_y + i * 210 + (1 - k) * 70
        x = W / 2 + shake
        box = [x - 430, y, x + 430, y + 164]
        st.card(img, d, box, alpha=18, bd=rgba(WARN, 62))
        d.rounded_rectangle([box[0] + 28, box[1] + 28, box[0] + 96, box[3] - 28],
                            18, fill=rgba(WARN, 46))
        B.draw_text(d, (box[0] + 62, (box[1] + box[3]) / 2), str(i + 1), f_num,
                    WARN, anchor="mm")
        B.draw_text(d, (box[0] + 126, box[1] + 64), t1, f_t, INK, anchor="lm")
        B.draw_text(d, (box[0] + 126, box[1] + 114), t2, f_s, MUTED, anchor="lm")
    p = prog(t, 1.25, 0.5)
    if p > 0:
        B.draw_text(d, (W / 2, 1190), "Aur is se akela student nahi bacha",
                    font(38, "Bold"), rgba(INK, 255 * ease_out_cubic(p)),
                    anchor="ma")


def scene_brand(img, d, st, t, tl, line_p):
    k = ease_out_cubic(prog(t, 0.02, 0.9))
    sc = lerp(0.92, 1.0, k)
    lw, lh = int(st.logo.size[0] * sc), int(st.logo.size[1] * sc)
    B.paste(img, B.alpha_scaled(st.glow_a, 0.85 * k), (int(W / 2 - lw / 2 - 30),
                                                      int(600 - lh / 2 - 90)))
    B.paste(img, B.alpha_scaled(st.logo, k), (int(W / 2 - lw / 2),
                                              int(600 - lh / 2)))
    B.sweep_highlight(img, [W / 2 - lw / 2, 600 - lh / 2, W / 2 + lw / 2,
                            600 + lh / 2], 10, prog(t, 0.4, 1.2))

    p2 = prog(t, 0.55, 0.6)
    if p2 > 0:
        e = ease_out_cubic(p2)
        y = 600 + lh / 2 + 80
        B.draw_text(d, (W / 2, y), "STUDENT  PROJECTS  DIVISION",
                    font(34, "Bold"), rgba(CYAN, 255 * e), 8.0, "ma")
        B.accent_bar(img, W / 2 - 260 * e, y + 46, 520 * e, 6)
    p3 = prog(t, 1.25, 0.7)
    if p3 > 0:
        e = ease_out_cubic(p3)
        y = 1080
        st.accent_pill(img, [W / 2 - 300, y, W / 2 - 40, y + 100],
                       "100% FREE", font(46, "Black"))
        st.accent_pill(img, [W / 2 + 40, y, W / 2 + 300, y + 100],
                       "30 MIN", font(46, "Black"), CYAN, ACCENT)


def scene_booking(img, d, st, t, tl, line_p):
    k = ease_out_cubic(prog(t, 0.0, 0.5))
    top = 380 + (1 - k) * 60
    box = [70, top, W - 70, top + 870]
    st.card(img, d, box, radius=40, alpha=26)
    B.draw_text(d, (box[0] + 46, box[1] + 76), "BOOK A FREE SLOT",
                font(40, "Bold"), INK, anchor="lm")
    B.draw_text(d, (box[0] + 46, box[1] + 126), "Pakistan Standard Time (PKT)",
                font(26, "Medium"), rgba(MUTED, 255), 1.0, "lm")
    st.chip(d, box[2] - 158, box[1] + 66, "12 OPEN", font(24, "Bold"), CYAN,
            rgba(CYAN, 30), rgba(CYAN, 90), 20, 10, 2.0)

    slots = ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
             "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"]
    cols, gx, gy = 4, 26, 26
    cw = (box[2] - box[0] - 92 - gx * (cols - 1)) / cols
    ch = 104
    top2 = box[1] + 180
    chosen = 5
    for i, s in enumerate(slots):
        r, c = divmod(i, cols)
        x0 = box[0] + 46 + c * (cw + gx)
        y0 = top2 + r * (ch + gy)
        p = prog(t, 0.25 + i * 0.055, 0.4)
        if p <= 0:
            continue
        a = ease_out_back(p, 1.4)
        sel = i == chosen
        sp = prog(t, 0.25 + chosen * 0.055 + 0.28, 0.5)
        if sel and sp > 0:
            pulse = 0.5 + 0.5 * math.sin(t * 7)
            g = 5 + 5 * pulse
            d.rounded_rectangle([x0 - g, y0 - g, x0 + cw + g, y0 + ch + g],
                                24, outline=rgba(CYAN, 70 + 130 * sp), width=3)
        yy = y0 + (1 - a) * 26
        if sel and sp > 0.05:
            B.gradient_rect(img, [x0, yy, x0 + cw, yy + ch], ACCENT, ACCENT2,
                            radius=18, horizontal=True, alpha=246 * sp)
            d.rounded_rectangle([x0, yy, x0 + cw, yy + ch], 18,
                                outline=rgba(CYAN, 220 * sp), width=2)
        else:
            d.rounded_rectangle([x0, yy, x0 + cw, yy + ch], 18,
                                fill=rgba(INK, 22 * a),
                                outline=rgba(INK, 60 * a), width=2)
        B.draw_text(d, (x0 + cw / 2, yy + ch / 2), s, font(34, "Bold"),
                    INK if not (sel and sp > 0.05) else (255, 255, 255),
                    anchor="mm")
        ck = prog(t, 0.25 + chosen * 0.055 + 0.62, 0.4)
        if sel and ck > 0:
            g = ease_out_back(ck, 2.0)
            cx0, cy0 = x0 + cw - 32, yy + 30
            d.ellipse([cx0 - 15 * g, cy0 - 15 * g, cx0 + 15 * g, cy0 + 15 * g],
                      fill=rgba(OK, 255 * g))
            if g > 0.55:
                d.line([(cx0 - 7, cy0), (cx0 - 1, cy0 + 7), (cx0 + 8, cy0 - 7)],
                       fill=(255, 255, 255), width=3)

    p2 = prog(t, tl["line_starts"].get(1, 99), 0.5)
    if p2 > 0:
        e = ease_out_back(p2, 1.3)
        y = box[1] + 580
        b2 = [70 + (1 - e) * 130, y, W - 70, y + 116]
        d.rounded_rectangle(b2, 30, fill=rgba((10, 40, 30), 225),
                            outline=rgba(OK, 110), width=2)
        d.ellipse([b2[0] + 30, y + 36, b2[0] + 84, y + 90], fill=rgba(OK, 255 * e))
        if e > 0.6:
            d.line([(b2[0] + 45, y + 63), (b2[0] + 55, y + 74), (b2[0] + 71, y + 51)],
                   fill=(255, 255, 255), width=4)
        B.draw_text(d, (b2[0] + 110, y + 58), "CONS-2026-00042 confirmed",
                    font(32, "Bold"), rgba(INK, 255 * e), anchor="lm")
    p3 = prog(t, tl["line_starts"].get(2, 99), 0.5)
    if p3 > 0:
        e = ease_out_cubic(p3)
        y = box[1] + 716
        b3 = [70 + (1 - e) * 130, y, W - 70, y + 104]
        d.rounded_rectangle(b3, 30, fill=rgba((12, 26, 52), 225),
                            outline=rgba(CYAN, 100), width=2)
        B.draw_text(d, (b3[0] + 44, y + 52), "Google Meet link mil gaya",
                    font(32, "Bold"), rgba(CYAN, 255 * e), anchor="lm")


def scene_request(img, d, st, t, tl, line_p):
    steps = [("01", "Student Information"), ("02", "Academic Information"),
             ("03", "Project Information"), ("04", "Project Requirements"),
             ("05", "Duration & Completion"), ("06", "Estimated Project Budget"),
             ("07", "Attachments")]
    f_num = font(30, "Black")
    f_t = font(36, "Semibold")
    x0, x1 = 110, W - 110
    top = 420
    rh, gap = 86, 14
    k = ease_out_cubic(prog(t, 0.0, 0.4))
    for i, (num, label) in enumerate(steps):
        y = top + i * (rh + gap) + (1 - k) * 60
        p = prog(t, 0.08 + i * 0.16, 0.5)
        if p <= 0:
            continue
        a = ease_out_cubic(p)
        bx0 = x0 - (1 - a) * 90
        d.rounded_rectangle([bx0, y, x1, y + rh], 24,
                            fill=rgba(INK, 20 * a),
                            outline=rgba(INK, 48 * a), width=2)
        B.draw_text(d, (bx0 + 40, y + rh / 2), num, f_num, rgba(ACCENT_L, 255 * a),
                    1.0, "lm")
        B.draw_text(d, (bx0 + 112, y + rh / 2), label, f_t, rgba(INK, 255 * a),
                    anchor="lm")
        done = prog(t, 0.08 + i * 0.16 + 0.26, 0.35)
        if done > 0:
            dk = ease_out_back(done, 2.0)
            cx = x1 - 54
            d.ellipse([cx - 19 * dk, y + rh / 2 - 19 * dk,
                       cx + 19 * dk, y + rh / 2 + 19 * dk],
                      fill=rgba(OK, 240 * dk))
            if dk > 0.6:
                d.line([(cx - 8, y + rh / 2), (cx - 1, y + rh / 2 + 8),
                        (cx + 9, y + rh / 2 - 8)], fill=(255, 255, 255), width=4)
    bar_y = top + len(steps) * (rh + gap) + 30
    p = min(1.0, prog(t, 0.08 + (len(steps) - 1) * 0.16 + 0.28, 0.7))
    d.rounded_rectangle([x0, bar_y, x1, bar_y + 8], 4, fill=rgba(INK, 34))
    B.accent_bar(img, x0, bar_y, (x1 - x0) * p, 8)
    p2 = prog(t, 0.08 + (len(steps) - 1) * 0.16 + 0.78, 0.45)
    if p2 > 0:
        e = ease_out_back(p2, 1.6)
        st.chip(d, W / 2, bar_y + 104, "REQUEST SENT  ·  FYP-2026-00042",
                font(28, "Bold"), INK, rgba(ACCENT, 215), rgba(CYAN, 140),
                26, 14, 2.0, from_bottom=True)


def scene_flow(img, d, st, t, tl, line_p):
    nodes = [("Requirements Review", "requirements_review"),
             ("Quote Prepared", "quote_prepared"),
             ("In Development", "development"),
             ("Delivered", "delivered")]
    x = 250
    top, gap = 520, 195
    f_t = font(40, "Bold")
    f_s = font(23, "Medium")
    B.paste(img, B.alpha_scaled(st.glow_a, 0.32), (-200, 400))
    d.rounded_rectangle([x - 3, top - 34, x + 3, top + gap * 3], 3,
                        fill=rgba(INK, 40))
    for i, (label, slug) in enumerate(nodes):
        y = top + i * gap
        p = prog(t, 0.1 + i * 0.44, 0.55)
        if p <= 0:
            continue
        e = ease_out_cubic(p)
        if e > 0.85:
            pulse = 0.5 + 0.5 * math.sin(t * 6 - i)
            d.ellipse([x - 34 - 9 * pulse, y - 34 - 9 * pulse,
                       x + 34 + 9 * pulse, y + 34 + 9 * pulse],
                      fill=rgba(ACCENT, 70 + 45 * pulse))
        d.ellipse([x - 30, y - 30, x + 30, y + 30],
                  fill=rgba(ACCENT, 240 * e) if e > 0.85 else
                  rgba(INK, 30 * e),
                  outline=rgba(INK, int(100 * e)), width=2)
        if e > 0.85:
            d.line([(x - 12, y + 1), (x - 3, y + 11), (x + 14, y - 12)],
                   fill=(255, 255, 255), width=5)
        B.draw_text(d, (x + 76, y - 18), label, f_t, rgba(INK, 255 * e), anchor="lm")
        B.draw_text(d, (x + 76, y + 22), slug, f_s, rgba(MUTED, 255 * e), 1.0, "lm")
        if i < len(nodes) - 1 and e > 0.85:
            rp = prog(t, 0.1 + i * 0.44 + 0.5, 0.4)
            if rp > 0:
                d.rounded_rectangle([x - 3, y, x - 3 + 6, y + gap * rp], 3,
                                    fill=rgba(ACCENT_L, 235 * rp))

    p2 = prog(t, tl["line_starts"].get(2, 99), 0.5)
    if p2 > 0:
        e = ease_out_cubic(p2)
        box = [110, 1170, W - 110, 1310]
        B.shadow(img, box)
        d.rounded_rectangle(box, 30, fill=rgba(INK, 24 * e),
                            outline=rgba(INK, 50 * e), width=2)
        B.draw_text(d, (box[0] + 42, box[1] + 44), "REQUEST REFERENCE",
                    font(23, "Medium"), rgba(MUTED, 255 * e), 3.0, "lm")
        text = "FYP-2026-00042"
        f_big = font(52, "Black")
        kk = int(min(1.15, e * 1.2) * len(text))
        B.draw_text(d, (box[0] + 42, box[1] + 98), text[:kk], f_big,
                    rgba(INK, 255 * e), 2.0, "lm")
        if e > 0.9 and math.sin(t * 6) > 0:
            w = B.text_w(d, text[:kk], f_big, 2.0)
            d.rounded_rectangle([box[0] + 48 + w, box[1] + 70,
                                 box[0] + 54 + w, box[1] + 124], 3,
                                fill=rgba(CYAN, 255))


def scene_deliverables(img, d, st, t, tl, line_p):
    """Web app + mobile app, drawn live by `mockups` instead of photographed."""
    B.paste(img, B.alpha_scaled(st.glow_a, 0.30), (-340, 220))
    B.paste(img, B.alpha_scaled(st.glow_c, 0.24), (W - 640, 640))

    # ---- the web app: a browser window running the real admin dashboard ---
    bx, by = 86, 452
    pw = prog(t, 0.02, 0.8)
    if pw > 0:
        e = ease_out_cubic(pw)
        web = MK.web_app(t - 0.02, t)
        k = 0.93 + 0.07 * e
        nw, nh = int(MK.WEB_W * k), int(MK.WEB_H * k)
        if k < 0.999:
            web = web.resize((nw, nh), Image.LANCZOS)
        x = bx + (MK.WEB_W - nw) // 2
        y = by + (MK.WEB_H - nh) / 2 + (1 - e) * 80
        real = [x, y, x + nw, y + nh]
        B.shadow(img, real, radius=18, blur=48, alpha=175, dy=26)
        B.paste(img, B.alpha_scaled(web, e), (x, y))
        B.sweep_highlight(img, real, 16, prog(t, 0.6, 1.6))
    pb = prog(t, 0.45, 0.5)
    if pb > 0:
        e = pop(pb)
        st.chip(d, 180, 388 - (1 - e) * 20, "WEB APP", font(25, "Black"),
                rgba(CYAN, 255 * e), rgba(CYAN, 36 * e), rgba(CYAN, 150 * e),
                26, 12, 3.0)

    # ---- the mobile app: a phone that lands in front of the browser ------
    t_ph = min(2.95, max(2.0, tl["line_starts"].get(1, 99) - 0.30))
    pp = prog(t, t_ph, 0.85)
    if pp > 0:
        e = ease_out_cubic(pp)
        ph = MK.mobile_app(t - t_ph, t)
        k = 0.90 + 0.10 * ease_out_back(pp, 1.2)
        if k < 0.999:
            ph = ph.resize((int(MK.PH_W * k), int(MK.PH_H * k)), Image.LANCZOS)
        ang = -4.0 * (1 - e) + 0.9 * math.sin(t * 0.85)
        if abs(ang) > 0.05:
            ph = ph.rotate(ang, resample=Image.BICUBIC, expand=True)
        cxm = 640 + MK.PH_W / 2
        cym = 690 + MK.PH_H / 2 + (1 - e) * 150
        ox, oy = int(cxm - ph.size[0] / 2), int(cym - ph.size[1] / 2)
        real = [ox, oy, ox + ph.size[0], oy + ph.size[1]]
        flash = prog(t, t_ph + 0.05, 0.8)
        if flash < 1:
            B.paste(img, B.alpha_scaled(st.glow_c, 0.45 * (1 - flash)),
                    (int(cxm - 320), int(cym - 320)))
        B.shadow(img, real, radius=46, blur=52, alpha=200, dy=32)
        B.paste(img, B.alpha_scaled(ph, e), (ox, oy))
        pb = prog(t, t_ph + 0.55, 0.5)
        if pb > 0:
            e2 = pop(pb)
            st.chip(d, 755, 388 - (1 - e2) * 20, "MOBILE APP",
                    font(25, "Black"), rgba(CYAN, 255 * e2),
                    rgba(CYAN, 36 * e2), rgba(CYAN, 150 * e2), 26, 12, 3.0)

    # ---- what actually ships with the project ---------------------------
    chips = ["Source Code", "UI / UX Design", "Backend + API",
             "Deployment + Docs"]
    f_c = font(27, "Bold")
    for i, c in enumerate(chips):
        p = prog(t, 0.6 + i * 0.16, 0.5)
        if p <= 0:
            continue
        e = pop(p)
        y = 966 + i * 58
        d.rounded_rectangle([86, y + 10, 91, y + 38], 2,
                            fill=rgba(CYAN, 240 * e))
        st.chip(d, 355, y, c, f_c, rgba(INK, 255 * e), rgba(INK, 26 * e),
                rgba(CYAN, 96 * e), 26, 12, 1.4)
    p2 = prog(t, tl["line_starts"].get(1, 99), 0.45)
    if p2 > 0:
        e = ease_out_cubic(p2)
        st.chip(d, 355, 1208, "AI / ML  ·  ERP / CRM  ·  DATABASE",
                font(23, "Bold"), rgba(CYAN, 255 * e), rgba(CYAN, 30 * e),
                rgba(CYAN, 110 * e), 24, 12, 1.6)


def scene_cta(img, d, st, t, tl, line_p):
    B.paste(img, B.alpha_scaled(st.glow_a, 0.50), (-280, 360))
    B.paste(img, B.alpha_scaled(st.glow_b, 0.42), (W - 700, 280))

    e = ease_out_back(prog(t, 0.0, 0.8), 1.15)
    box = [90, 390, W - 90, 870]
    y0 = box[1] + (1 - e) * 70
    real = [box[0], y0, box[2], y0 + (box[3] - box[1])]
    B.shadow(img, real, radius=44, blur=44, alpha=160, dy=22)
    B.gradient_rect(img, real, (18, 26, 54), (12, 18, 38), radius=44, alpha=238)
    d.rounded_rectangle(real, 44, outline=rgba(CYAN, 130 * e), width=2)
    B.sweep_highlight(img, real, 44, prog(t, 0.45, 1.4))
    B.draw_text(d, (W / 2, y0 + 78), "Aaj hi book karein", font(36, "Medium"),
                rgba(MUTED, 255 * e), anchor="ma")
    st.accent_pill(img, [box[0] + 56, y0 + 120, box[2] - 56, y0 + 236],
                   "FREE 30-MIN CONSULTATION", font(42, "Black"))
    B.draw_text(d, (W / 2, y0 + 288), "Google Meet  ·  Pakistan Standard Time",
                font(27, "Medium"), rgba(CYAN, 240 * e), anchor="ma")

    t2 = tl["line_starts"].get(1, 99)
    p2 = prog(t, t2, 0.5)
    if p2 > 0:
        e2 = ease_out_cubic(p2)
        lw = 260
        B.paste(img, B.alpha_scaled(st.logo, e2), (int(W / 2 - lw / 2), 920))
    p3 = prog(t, t2 + 0.6, 0.6)
    if p3 > 0:
        e3 = ease_out_cubic(p3)
        y = 1020
        d.rounded_rectangle([W / 2 - 450, y, W / 2 + 450, y + 104], 28,
                            fill=rgba(INK, 22 * e3),
                            outline=rgba(INK, 56 * e3), width=2)
        B.draw_text(d, (W / 2, y + 52), "gopangitsolution.com/student-projects",
                    font(33, "Bold"), rgba(INK, 255 * e3), 1.0, "mm")
        B.draw_text(d, (W / 2, y + 148), "WhatsApp  +92 334 2322324",
                    font(29, "Semibold"), rgba(CYAN, 255 * e3), 1.0, "ma")
    p4 = prog(t, t2 + 1.3, 0.7)
    if p4 > 0:
        e4 = ease_out_cubic(p4)
        pulse = 0.5 + 0.5 * math.sin(t * 4)
        st.chip(d, W / 2, 1250 + (1 - e4) * 40,
                "CONS-2026  ·  FYP-2026  ·  SAME ENGINEERS WHO BUILD IT",
                font(25, "Bold"), INK, rgba(INK, 22 + 14 * pulse),
                rgba(CYAN, 120), 24, 14, 2.0, from_bottom=True)


SCENES = {
    "hook": scene_hook,
    "problem": scene_problem,
    "brand": scene_brand,
    "booking": scene_booking,
    "request": scene_request,
    "flow": scene_flow,
    "deliverables": scene_deliverables,
    "cta": scene_cta,
}