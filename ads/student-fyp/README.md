# Student / FYP social ad

A generated 9:16 (1080x1920) video ad for the Student & Final Year Project
module. Everything is produced from code — the voice, the music, the
animation and the captions — so the ad can be re-cut whenever the copy or the
feature list changes.

**Output:** `output/gopang-student-fyp-9x16.mp4` — 45.6s, H.264 High / yuv420p,
30fps, AAC 48kHz stereo, −14.1 LUFS, −1.1 dBTP.

## Build

```bash
python3 -m venv ads/student-fyp/.venv
ads/student-fyp/.venv/bin/pip install pillow numpy edge-tts
ads/student-fyp/.venv/bin/python ads/student-fyp/build.py
```

Requires `ffmpeg`/`ffprobe` on PATH. A full build is ~90s; the render is the
slow part (~30fps, 1367 frames).

| flag | effect |
| --- | --- |
| `--tts` | re-synthesise the voiceover (otherwise cached in `build/vo/`) |
| `--skip-render` | re-mix the audio only, reusing `build/video_silent.mp4` |
| `--stills` | dump QA stills to `output/stills/` |
| `--no-music` | voice + SFX only |
| `--name X` | output filename stem |

## QA

```bash
ads/student-fyp/.venv/bin/python ads/student-fyp/qa_check.py
```

Checks every scene for content colliding with the caption band, content
outside the Reels safe area (300–1580px), captions overflowing the side
margins, an empty/overfull frame, and karaoke misalignment. Exit code 0 = pass.

## Files

- `storyboard.py` — the 8 scenes and their narration. `ur` is Urdu script fed
  to the voice; `roman` is the Roman-Urdu caption burned into the picture.
  Timings are *derived* from the measured audio, so a copy change re-flows
  the edit automatically.
- `audio.py` — neural TTS, the synthesized music bed, transition whooshes,
  sidechain ducking and the loudness-normalised mix.
- `brand.py` — palette (from the site CSS variables), SF Pro typography,
  easing, glass cards, gradient fills, the karaoke caption primitive.
- `visual.py` — the scene renderers plus the persistent chrome (brand bug,
  caption block, progress rail).
- `mockups.py` — the product mockups for the deliverables scene, drawn with
  Pillow rather than photographed: `web_app()` renders a browser window
  running the real admin dashboard (load bar, counters, sparklines, chart,
  pipeline, a pointer that clicks through it) and `mobile_app()` renders a
  phone (bezel, dynamic island, status bar, live request card, deliverable
  rows that tick off, a tab bar whose indicator slides). Both take their own
  local clock, so the scene can time their entrances.
- `build.py` — measures the voiceover, lays out the timeline, pipes raw RGB
  frames into ffmpeg, then mixes the audio.
- `qa_check.py` — the layout checks above.

## How the edit is timed

1. Each narration line is synthesised on its own and measured with ffprobe.
2. Line starts are laid out with `LINE_GAP` / `SCENE_GAP`, plus `LEAD_IN` and
   a `TAIL` hold.
3. Every scene receives its own local time, so animations are written against
   scene-relative seconds and the whole ad re-flows if the voice changes.

## Changing things

- **Copy** — edit `SCENES` in `storyboard.py`, then rebuild with `--tts`.
  Keep lines to 3–6 words: the whole ad only fits 45s of speech.
- **Voice** — `VOICE` / `VOICE_RATE` / `VOICE_PITCH` at the bottom of
  `storyboard.py`. Available `ur-PK-*` voices: `AsadNeural` (male, used here),
  `UzmaNeural` (female). Raise the rate to compress, lower it to slow down.
- **Music** — `build_music()` in `audio.py` (BPM, chord progression, layer
  levels). The bed is peak-normalised to 0.30 so it stays under the voice;
  raise it and the narration gets buried.
- **Layout** — scene content must stay inside 380–1310px; the caption band is
  1330–1470 and `qa_check.py` fails the build if anything drifts into it.
- **The mockups** — sizes live at the top of `mockups.py` (`WEB_W/WEB_H`,
  `PH_W/PH_H`); their positions are the `bx, by` / `640, 690` pairs in
  `scene_deliverables`. Keep anything in the browser below y≈240 inside
  x<490 or the phone covers it, and keep phone content above local y≈240
  clear of the badges.
- **Previewing a frame** — the image viewer is not always available, so
  `tools/ascii_preview.py out.png [cell_px] [--box=x0,y0,x1,y1]` prints any
  frame as a character map (luminance buckets, saturated pixels classified
  by hue), and `tools/preview_mockups.py` dumps the mockups plus sample
  scene frames to `output/qa2/`.
- **Colours** — `brand.py`, straight from the site theme.

## Notes

- Nothing is licensed from a third party: the music is synthesized in
  `audio.py` and the images are the project's own.
- The captions use Roman Urdu while the voice uses Urdu script — the
  `ur-PK` neural voices mispronounce Latin text, but render Urdu script
  correctly, and Roman Urdu is what this audience reads on screen.
