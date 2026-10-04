#!/usr/bin/env python3
"""Build the Student / FYP social ad.

    python3 ads/student-fyp/build.py            # full build
    python3 ads/student-fyp/build.py --tts      # force re-synthesis of the voice
    python3 ads/student-fyp/build.py --stills   # also dump QA stills

Output: ads/student-fyp/output/gopang-student-fyp-9x16.mp4  (1080x1920, H.264)
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np                                            # noqa: E402
from PIL import Image, ImageDraw                              # noqa: E402

import audio                                                  # noqa: E402
import brand as B                                             # noqa: E402
import storyboard as SB                                       # noqa: E402
import visual as V                                            # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
BUILD = os.path.join(HERE, "build")
OUT = os.path.join(HERE, "output")
FPS = B.FPS
SILENT_MP4 = os.path.join(BUILD, "video_silent.mp4")


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- timeline ---

def build_timeline(vo_items):
    """Turn measured voice line durations into scene/line start times."""
    items = []
    for it in vo_items:
        items.append(dict(it))

    t = SB.LEAD_IN
    scenes = []
    for sc in SB.SCENES:
        start = t
        lines = []
        for i, ln in enumerate(sc["lines"]):
            dur = next(x["duration"] for x in items
                       if x["scene"] == sc["id"] and x["text"] == ln["roman"])
            lines.append({"roman": ln["roman"], "start": t, "dur": dur,
                          "end": t + dur})
            t += dur + (SB.LINE_GAP if i < len(sc["lines"]) - 1 else 0)
        dur = t - start + SB.SCENE_GAP
        scenes.append({"id": sc["id"], "kind": sc["kind"], "start": start,
                       "dur": dur, "lines": lines,
                       "line_starts": {i: ln["start"] - start
                                       for i, ln in enumerate(lines)}})
        t += SB.SCENE_GAP
    total = t + SB.TAIL
    for it in items:
        for s in scenes:
            for ln in s["lines"]:
                if ln["roman"] == it["text"] and it["scene"] == s["id"]:
                    it["start"] = ln["start"]
    return scenes, total, items


def scene_ctx(sc):
    """Per-scene timeline facade handed to the scene renderers."""
    n = len(sc["lines"])

    def active(now):
        for i, ln in enumerate(sc["lines"]):
            if ln["start"] - sc["start"] <= now <= ln["end"] - sc["start"] + 0.28:
                p = (now - (ln["start"] - sc["start"])) / ln["dur"]
                return i, p
        return None, 0.0

    return {
        "lines": sc["lines"],
        "start": sc["start"],
        "dur": sc["dur"],
        "len": sc["dur"],
        "line_starts": sc["line_starts"],
        "active": active,
        "line_p": 0.0,
        "line_t": 0.0,
    }


# ------------------------------------------------------------------ render ---

def render(scenes, total, stills=False, log_every=30):
    os.makedirs(BUILD, exist_ok=True)
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-v", "error",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{B.W}x{B.H}",
         "-r", str(FPS), "-i", "-",
         "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "17",
         "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
         "-movflags", "+faststart", SILENT_MP4],
        stdin=subprocess.PIPE)

    st = V.Studio(ROOT)
    base = st.bg
    nframes = int(round(total * FPS))
    log(f"  {nframes} frames at {FPS}fps")
    t0 = time.time()
    still_dir = os.path.join(OUT, "stills")
    if stills:
        os.makedirs(still_dir, exist_ok=True)
    want_stills = {}

    for f in range(nframes):
        t = f / FPS
        img = base.copy()
        d = B.new_draw(img)

        # ambient particles + slow aurora drift, always on
        st.particles.draw(d, t, boost=0.9)

        for i, sc in enumerate(scenes):
            st_t = t - sc["start"]
            if st_t < -0.35 or st_t > sc["dur"] + 0.35:
                continue
            ctx = scene_ctx(sc)
            _, lp = ctx["active"](max(0.0, st_t))
            ctx["line_p"] = lp
            ctx["line_t"] = st_t
            local = max(0.0, st_t)
            fn = V.SCENES[sc["kind"]]
            if i == 0 and st_t < -0.35:
                continue
            fn(img, d, st, local, ctx, lp)
            if sc["kind"] != "hook" and st_t > 0.4:
                bug_a = min(1.0, max(0.0, (t - 12.0) / 1.2))
                st.bug(img, d, bug_a)
            st.captions(img, d, ctx, local)
            break

        st.rail(img, d, t, total, scenes,
                next((i for i, s in enumerate(scenes)
                      if s["start"] <= t < s["start"] + s["dur"]), len(scenes) - 1))

        if stills:
            mid = t + 0.5 * sc_dur_probe(scenes, t)
            key = round(mid * 2) / 2
            want_stills.setdefault(key, img)

        ff.stdin.write(img.tobytes())

        if f % log_every == 0:
            done = f / FPS
            el = time.time() - t0
            log(f"  frame {f:5d}/{nframes}  {done:5.1f}s  "
                f"{f / max(el, 1e-6):4.1f} fps  eta {el / max(f, 1) * (nframes - f):5.1f}s")

    ff.stdin.close()
    if ff.wait() != 0:
        raise RuntimeError("ffmpeg video encode failed")

    if stills:
        for k, im in sorted(want_stills.items()):
            im.convert("RGB").save(os.path.join(still_dir, f"t{k:06.1f}.jpg"),
                                   quality=88)
        log(f"  stills -> {still_dir} ({len(want_stills)} frames)")
    return SILENT_MP4


def sc_dur_probe(scenes, t):
    for s in scenes:
        if s["start"] <= t < s["start"] + s["dur"]:
            return s["dur"]
    return 0.0


# -------------------------------------------------------------------- main ---

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tts", action="store_true", help="re-synthesise the voice")
    ap.add_argument("--stills", action="store_true", help="dump QA stills")
    ap.add_argument("--no-music", action="store_true")
    ap.add_argument("--skip-render", action="store_true",
                    help="reuse the existing silent video")
    ap.add_argument("--name", default="gopang-student-fyp-9x16")
    args = ap.parse_args()

    os.makedirs(BUILD, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)

    log("1/5  voiceover")
    vo_items = audio.build_voiceover(SB.SCENES, SB.VOICE, SB.VOICE_RATE,
                                     SB.VOICE_PITCH, force=args.tts, log=log)

    scenes, total, items = build_timeline(vo_items)
    log(f"     {len(vo_items)} lines, {len(scenes)} scenes, {total:.2f}s")
    for s in scenes:
        log(f"     {s['id']:<13} {s['start']:6.2f}s -> "
            f"{s['start'] + s['dur']:6.2f}s  ({len(s['lines'])} lines)")

    log("2/5  silent video")
    if args.skip_render and os.path.exists(SILENT_MP4):
        log("     reusing", SILENT_MP4)
    else:
        render(scenes, total, stills=args.stills)

    log("3/5  music bed")
    music = audio.build_music(total, log=log)

    log("4/5  voiceover track + sfx")
    vo_wav = audio.assemble_voiceover(items, None, total)
    whoosh = audio.build_whooshes([s["start"] for s in scenes], total)

    log("5/5  mix + encode")
    dest = os.path.join(OUT, args.name + ".mp4")
    if args.no_music:
        audio.run(["ffmpeg", "-y", "-v", "error", "-i", SILENT_MP4,
                   "-i", vo_wav, "-i", whoosh,
                   "-filter_complex",
                   "[1:a]loudnorm=I=-15:TP=-1.5[a0];[2:a]volume=0.9[sx];"
                   "[a0][sx]amix=inputs=2:normalize=0[a]",
                   "-map", "0:v", "-map", "[a]", "-c:v", "copy",
                   "-c:a", "aac", "-b:a", "192k",
                   "-movflags", "+faststart", "-shortest", dest])
    else:
        audio.mix(SILENT_MP4, vo_wav, music, whoosh, dest, total, log=log)

    probe = audio.run(["ffprobe", "-v", "error", "-show_entries",
                       "format=duration,size:stream=codec_name,width,height,"
                       "r_frame_rate,channels,sample_rate",
                       "-of", "default=noprint_wrappers=1", dest])
    log("\n" + probe.strip())
    log(f"\nDONE  {dest}  ({os.path.getsize(dest) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()