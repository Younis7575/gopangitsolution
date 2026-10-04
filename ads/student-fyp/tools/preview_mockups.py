#!/usr/bin/env python3
"""Throwaway: render mockup sprites + full scene frames to PNG for eyeballing."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import brand as B
import mockups as MK
import visual as V

OUT = os.path.join(os.path.dirname(HERE), "output", "qa2")
os.makedirs(OUT, exist_ok=True)

# 1. sprites on their own, big
for name, spr, t in (("web_t0.6", MK.web_app(0.6, 0.6), 0),
                     ("web_t3.0", MK.web_app(3.0, 3.0), 0),
                     ("phone_t0.8", MK.mobile_app(0.8, 0.8), 0),
                     ("phone_t3.5", MK.mobile_app(3.5, 3.5), 0)):
    spr.save(os.path.join(OUT, f"spr_{name}.png"))
    print("sprite", name, spr.size)

# 2. scene frames on the 1080x1920 plate
tl = {"active": lambda t: (0, 0.4), "lines": [{"roman": "x"}],
      "line_starts": {0: 0.0, 1: 2.6}}
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
st = V.Studio(ROOT)
for t in (0.6, 1.6, 2.8, 3.8, 5.0):
    img = st.bg.copy()
    d = B.new_draw(img)
    V.scene_deliverables(img, d, st, t, tl, 0.4)
    st.bug(img, d, 1.0)
    st.captions(img, d, tl, t)
    img.save(os.path.join(OUT, f"scene_t{t:04.1f}.png"))
    print("scene t=%.1f" % t)
print("ok")
