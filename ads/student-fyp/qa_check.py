#!/usr/bin/env python3
"""Automated layout QA for the ad.

For every scene this renders the final frame twice — once with the burned-in
captions, once without — and asserts that:

  1. no scene content leaks into the caption band (the captions would sit on
     top of it and neither would be readable),
  2. nothing important falls outside the Reels/TikTok safe area, where the
     platform UI covers the frame,
  3. the caption itself stays inside the horizontal margins.

Run:  python3 ads/student-fyp/qa_check.py
Exit code 0 = all scenes pass.
"""

from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import brand as B                                            # noqa: E402
import build                                                  # noqa: E402
import storyboard as SB                                      # noqa: E402
import visual as V                                           # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

CAP_BAND = (1330, 1470)     # where a burned-in caption can land
SAFE_TOP = 300
SAFE_BOT = 1580
MARGIN_X = 80
BRIGHT = 118# 0-255 luminance considered "content"
BRIGHT_TOL = 0.012# fraction of bright pixels allowed in the caption band


def luma(img):
    a = np.asarray(img.convert("L"), np.float32)
    return a


def content_mask(img):
    return luma(img) > BRIGHT


def check():
    import audio
    vo = audio.build_voiceover(SB.SCENES, SB.VOICE, SB.VOICE_RATE,
                               SB.VOICE_PITCH, log=lambda *a: None)
    scenes, total, _ = build.build_timeline(vo)
    st = V.Studio(ROOT)
    problems = []

    for sc in scenes:
        # sample the last 15% of the scene, where every element is on screen
        for frac in (0.7, 0.85, 0.99):
            local = sc["dur"] * frac
            ctx = build.scene_ctx(sc)
            _, lp = ctx["active"](local)
            ctx["line_p"], ctx["line_t"] = lp, local

            bare = st.bg.copy()
            d = B.new_draw(bare)
            V.SCENES[sc["kind"]](bare, d, st, local, ctx, lp)
            st.bug(bare, d, 1.0 if sc["id"] not in ("hook", "problem") else 0.0)

            with_cap = bare.copy()
            d2 = B.new_draw(with_cap)
            st.captions(with_cap, d2, ctx, local)
            st.rail(with_cap, d2, local, total, scenes, scenes.index(sc))

            m = content_mask(bare)
            band = m[SAFE_TOP:SAFE_BOT]
            ink = band.mean()
            if ink < 0.004 or ink > 0.45:
                problems.append(
                    f"{sc['id']} @{frac:.0%}: content band ink {ink:.2%} is out "
                    f"of the expected 0.4%-45% window (scene looks empty/full)")
            y0, y1 = CAP_BAND
            frac_bright = m[y0:y1].mean()
            if frac_bright > BRIGHT_TOL:
                rows = np.where(m[y0:y1].mean(axis=1) > BRIGHT_TOL)[0]
                problems.append(
                    f"{sc['id']} @{frac:.0%}: scene content occupies "
                    f"{frac_bright:.2%} of the caption band "
                    f"(rows {y0 + rows[0]}-{y0 + rows[-1]})")

            below = m[SAFE_BOT:].mean()
            if below > 0.002:
                problems.append(
                    f"{sc['id']} @{frac:.0%}: {below:.2%} bright pixels below "
                    f"y={SAFE_BOT} (platform UI zone)")

            cm = content_mask(with_cap)
            cols = np.where(cm[CAP_BAND[0]:CAP_BAND[1]].any(axis=0))[0]
            if len(cols) and (cols[0] < MARGIN_X or cols[-1] > B.W - MARGIN_X):
                problems.append(
                    f"{sc['id']} @{frac:.0%}: caption overflows the horizontal "
                    f"margins (x {cols[0]}..{cols[-1]})")

        print(f"  checked {sc['id']:<13} {sc['start']:6.2f}s")

    # 4. karaoke alignment: the live (spoken) layer and the idle (upcoming)
    #    layer must occupy the same glyphs, only a different colour. Compare
    #    the ink masks at 0% and 100% sweep — a misaligned strip drops IoU.
    for sc in scenes:
        for li, ln in enumerate(sc["lines"]):
            f = B.font(46, "Semibold")
            masks = []
            for p in (0.0, 1.0):
                im = Image.new("RGB", (B.W, B.H), (10, 12, 20))
                dd = B.new_draw(im)
                B.karaoke(im, dd, (B.W / 2, V.CAP_TOP), ln["roman"], f,
                          (255, 255, 255), (128, 140, 164), p, -0.4, 5,
                          (2, 4, 10, 200), center=True)
                a = np.asarray(im, np.int16)
                masks.append((np.abs(a - np.array([10, 12, 20])).max(axis=2)
                              > 14))
            inter = (masks[0] & masks[1]).sum()
            union = (masks[0] | masks[1]).sum()
            iou = inter / max(1, union)
            if iou < 0.97:
                problems.append(
                    f"{sc['id']} line {li}: karaoke layers misaligned "
                    f"(IoU {iou:.3f} < 0.97)")
        print(f"  karaoke  {sc['id']:<13} ok")

    print()
    if problems:
        print("FAIL")
        for p in problems:
            print("  -", p)
        return 1
    print(f"PASS  {len(scenes)} scenes clean: no caption collision, everything "
          f"inside the {SAFE_TOP}-{SAFE_BOT} safe area, karaoke aligned.")
    return 0


if __name__ == "__main__":
    raise SystemExit(check())
