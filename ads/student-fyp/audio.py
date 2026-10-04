"""Audio for the ad: neural Urdu voiceover, a synthesized music bed and
transition whooshes, mixed with sidechain ducking and loudness normalisation.

No stock audio is downloaded — the bed is generated here, so the ad ships
with no licensing question attached.
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import shutil
import subprocess

import numpy as np

SR = 48000
BUILD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build")


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed:\n{p.stderr[-2500:]}")
    return p.stdout


def duration_of(path: str) -> float:
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
               "-of", "csv=p=0", path])
    return float(out.strip())


def wav(path, samples: np.ndarray, sr: int = SR):
    """Write float32 [-1, 1] mono/stereo as 16-bit PCM wav via ffmpeg."""
    x = np.clip(samples, -1.0, 1.0)
    pcm = (x * 32767.0).astype("<i2")
    raw = pcm.tobytes()
    nch = 2 if x.ndim == 2 else 1
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(nch)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(raw)
    return path


def read_wav_mono(path: str) -> np.ndarray:
    import wave
    with wave.open(path, "rb") as w:
        n, ch, sw = w.getnframes(), w.getnchannels(), w.getsampwidth()
        data = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float32) / 32768.0
    if ch > 1:
        data = data.reshape(-1, ch).mean(axis=1)
    return data


# --------------------------------------------------------------- voiceover ---

async def _synth_line(text: str, voice: str, rate: str, pitch: str, dest: str):
    import edge_tts
    comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await comm.save(dest)


def build_voiceover(scenes, voice, rate, pitch, force=False, log=print):
    """Synthesise one mp3 per narration line. Returns [{path, duration, text}]."""
    out_dir = os.path.join(BUILD, "vo")
    os.makedirs(out_dir, exist_ok=True)

    async def run_all():
        for sc in scenes:
            for i, line in enumerate(sc["lines"]):
                dest = os.path.join(out_dir, f'{sc["id"]}_{i:02d}.mp3')
                if os.path.exists(dest) and not force:
                    continue
                log(f'  tts  {sc["id"]}_{i:02d}  {line["roman"][:46]}...')
                await _synth_line(line["ur"], voice, rate, pitch, dest)

    asyncio.run(run_all())

    items = []
    for sc in scenes:
        for i, line in enumerate(sc["lines"]):
            p = os.path.join(out_dir, f'{sc["id"]}_{i:02d}.mp3')
            items.append({"path": p, "duration": duration_of(p),
                          "text": line["roman"], "scene": sc["id"]})
    return items


def assemble_voiceover(items, timeline, total: float) -> str:
    """Lay every line down at its timeline offset and sum them."""
    dest = os.path.join(BUILD, "voiceover.wav")
    if os.path.exists(dest):
        os.remove(dest)
    n = len(items)
    args = ["ffmpeg", "-y", "-v", "error"]
    for it in items:
        args += ["-i", it["path"]]
    delays = []
    labels = []
    for i, it in enumerate(items):
        ms = int(round(it["start"] * 1000))
        delays.append(f"[{i}:a]aresample=48000,adelay={ms}|{ms}[a{i}]")
        labels.append(f"[a{i}]")
    mix = ("".join(labels) +
           f"amix=inputs={n}:normalize=0:dropout_transition=0,"
           "loudnorm=I=-16:TP=-3:LRA=11[m]")
    fc = ";".join(delays) + ";" + mix
    args += ["-filter_complex", fc, "-map", "[m]", "-ac", "2", "-ar", str(SR), dest]
    run(args)
    return dest


# ------------------------------------------------------------------ music ---

def _adsr(n, a, d, s, r, sr=SR):
    """Attack/decay/sustain/release, clamped so the segments always fit n."""
    if n <= 0:
        return np.zeros(0, np.float32)
    env = np.zeros(n, np.float32)
    an = min(max(1, int(a * sr)), n)
    dn = min(max(0, int(d * sr)), max(0, n - an))
    rn = min(max(0, int(r * sr)), max(0, n - an - dn))
    env[:an] = np.linspace(0, 1, an, dtype=np.float32)
    if dn:
        env[an:an + dn] = np.linspace(1, s, dn, dtype=np.float32)
    env[an + dn:n - rn] = s
    if rn:
        env[n - rn:] = np.linspace(s, 0, rn, dtype=np.float32)
    return env


def _saw(phase, harmonics=14):
    out = np.zeros_like(phase)
    for k in range(1, harmonics + 1):
        out += np.sin(2 * np.pi * k * phase) / k
    return out


def _lowpass(x, cutoff, sr=SR):
    """One-pole lowpass; cutoff may be a per-sample array."""
    a = 1 - np.exp(-2 * np.pi * np.asarray(cutoff, np.float32) / sr)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):          # simple, and fast enough offline
        acc += float(a[i] if a.ndim else a) * (x[i] - acc)
        y[i] = acc
    return y


def build_music(total: float, bpm=104, log=print) -> str:
    """Upbeat corporate tech bed: pad + bass + arpeggio + kick + hats."""
    dest = os.path.join(BUILD, "music.wav")
    beat = 60.0 / bpm
    bar = beat * 4
    n = int(total * SR) + SR
    t = np.arange(n, dtype=np.float32) / SR

    # i - VI - III - VII in A minor, one chord per bar
    roots = [0, -4, 3, -2]                    # semitones from A
    chord_ratios = [(1, 1.1892, 1.4983), (1, 1.1892, 1.3348),
                    (1, 1.2599, 1.4983), (1, 1.2599, 1.4983)]
    a2 = 110.0

    pad = np.zeros(n, np.float32)
    bass = np.zeros(n, np.float32)
    arp = np.zeros(n, np.float32)
    drums = np.zeros(n, np.float32)

    nbars = int(math.ceil(total / bar)) + 1
    for b in range(nbars):
        t0 = b * bar
        i0 = int(t0 * SR)
        i1 = min(n, i0 + int(bar * SR) + 1)
        L = i1 - i0
        if L <= 8:
            continue
        root, ratios = roots[b % 4], chord_ratios[b % 4]
        f_root = a2 * (2 ** (root / 12))

        # pad: three chord tones, detuned saws, slow swell
        seg_t = np.arange(L, dtype=np.float32) / SR
        swell = _adsr(L, 0.35, 0.2, 0.85, bar * 0.5)
        for j, r in enumerate(ratios):
            f = f_root * r * 2
            for det in (-0.16, 0.16):
                ph = (f + det) * seg_t
                pad[i0:i1] += _saw(ph, 10) * (0.055 / len(ratios))
        pad[i0:i1] *= swell * 0.9

        # bass: sub on the down beat plus a push on the & of 3
        for off, ln, amp in ((0.0, bar * 0.45, 0.30), (beat * 2.5, beat * 0.6, 0.20)):
            j0 = i0 + int(off * SR)
            j1 = min(n, j0 + int(ln * SR))
            Ln = j1 - j0
            if Ln <= 8:
                continue
            st = np.arange(Ln, dtype=np.float32) / SR
            e = np.exp(-st * 3.4)
            bass[j0:j1] += (np.sin(2 * np.pi * f_root * 0.5 * st) * 0.9 +
                            np.sin(2 * np.pi * f_root * st) * 0.35) * e * amp

        # arpeggio: 8th-note pluck riding the chord
        seq = [0, 1, 2, 1, 2, 1, 0, 2]
        for k, deg in enumerate(seq):
            off = k * beat * 0.5
            j0 = i0 + int(off * SR)
            j1 = min(n, j0 + int(beat * 0.52 * SR))
            Ln = j1 - j0
            if Ln <= 8:
                continue
            f = f_root * ratios[deg % len(ratios)] * (4 if k % 4 >= 2 else 2)
            st = np.arange(Ln, dtype=np.float32) / SR
            e = np.exp(-st * 7.0)
            tone = (np.sin(2 * np.pi * f * st) + 0.32 * np.sin(4 * np.pi * f * st))
            amp = 0.115 if (b % 2 == 1 or k % 4 == 0) else 0.075
            arp[j0:j1] += tone * e * amp

        # kick on 1 and 3, hat on 8ths, snare/clap on 2 and 4
        for off in (0.0, beat * 2):
            j0 = i0 + int(off * SR)
            Ln = min(int(0.3 * SR), n - j0)
            if Ln <= 8:
                continue
            st = np.arange(Ln, dtype=np.float32) / SR
            f = 118 * np.exp(-st * 26) + 44
            drums[j0:j0 + Ln] += np.sin(2 * np.pi * np.cumsum(f) / SR) * \
                np.exp(-st * 8.5) * 0.5
        for off in (beat, beat * 3):
            j0 = i0 + int(off * SR)
            Ln = min(int(0.22 * SR), n - j0)
            if Ln <= 8:
                continue
            st = np.arange(Ln, dtype=np.float32) / SR
            nz = np.random.RandomState(11).randn(Ln).astype(np.float32)
            nz = np.convolve(nz, np.ones(24) / 24, mode="same")
            drums[j0:j0 + Ln] += nz * np.exp(-st * 26) * 0.16
        for k in range(8):
            j0 = i0 + int(k * beat * 0.5 * SR)
            Ln = min(int(0.07 * SR), n - j0)
            if Ln <= 8:
                continue
            st = np.arange(Ln, dtype=np.float32) / SR
            nz = np.random.RandomState(100 + k).randn(Ln).astype(np.float32)
            nz = np.convolve(nz, np.ones(6) / 6, mode="same")
            amp = 0.075 if k % 2 == 0 else 0.045
            drums[j0:j0 + Ln] += nz * np.exp(-st * 70) * amp

    pad = _lowpass(pad, np.full(n, 2600, np.float32)) * 0.9
    # light stereo widening on the pad
    delay = int(0.012 * SR)
    pad_r = np.concatenate([np.zeros(delay, np.float32), pad[:-delay]]) * 0.9

    def fade_edges(x, fin=1.2, fout=2.4):
        n0, n1 = int(fin * SR), int(fout * SR)
        if n0:
            x[:n0] *= np.linspace(0, 1, n0, dtype=np.float32)
        if n1:
            x[-n1:] *= np.linspace(1, 0, n1, dtype=np.float32)
        return x

    total_n = int(total * SR)
    pad, bass, arp, drums = (fade_edges(x)[:total_n] for x in (pad, bass, arp, drums))
    pad_r = pad_r[:total_n]

    left = pad * 1.0 + pad_r * 0.55 + bass + arp + drums * 0.9
    right = pad_r * 1.0 + pad * 0.55 + bass + arp + drums * 0.9
    stereo = np.stack([left, right], axis=1)

    peak = float(np.max(np.abs(stereo))) or 1.0
    # The bed must sit well under the voice: it gets sidechain-ducked but a
    # loud bed still smothers the narration between words.
    stereo = stereo / peak * 0.30
    log(f"  music peak-normalised to {float(np.max(np.abs(stereo))):.3f}")
    return wav(dest, stereo)


# -------------------------------------------------------------------- sfx ---

def build_whooshes(transition_times, total: float) -> str:
    """Short noise sweeps placed on every scene change."""
    dest = os.path.join(BUILD, "whoosh.wav")
    n = int(total * SR)
    track = np.zeros(n, np.float32)
    rs = np.random.RandomState(5)
    for i, ts in enumerate(sorted(set(round(x, 2) for x in transition_times))):
        dur = 0.55
        L = int(dur * SR)
        j0 = int(ts * SR) - L // 2
        if j0 < 0 or j0 + L > n:
            continue
        t = np.arange(L, dtype=np.float32) / SR
        nz = rs.randn(L).astype(np.float32)
        nz = np.convolve(nz, np.ones(4) / 4, mode="same")
        # sweeping band: cheap stand-in for a resonant filter
        cut = 400 + 5200 * (t / dur) ** 1.7
        y = np.empty(L, np.float32)
        acc = 0.0
        a = 1 - np.exp(-2 * np.pi * cut / SR)
        for k in range(L):
            acc += float(a[k]) * (nz[k] - acc)
            y[k] = acc
        y *= np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.6
        y *= 0.22 * (0.85 + 0.15 * i)
        track[j0:j0 + L] += y
    return wav(dest, track)


def build_click() -> str:
    """Soft UI tick for the slot picker."""
    dest = os.path.join(BUILD, "click.wav")
    L = int(0.09 * SR)
    t = np.arange(L, dtype=np.float32) / SR
    y = (np.sin(2 * np.pi * 1500 * t) * 0.5 + np.sin(2 * np.pi * 2400 * t) * 0.3)
    y *= np.exp(-t * 60)
    return wav(dest, y.astype(np.float32))


# ------------------------------------------------------------------- mix ---

def mix(video_silent: str, voice_wav: str, music_wav: str, whoosh_wav: str,
        dest: str, total: float, log=print):
    """Duck the bed under the voice, add whooshes, normalise, encode AAC."""
    run(["ffmpeg", "-y", "-v", "error",
         "-i", video_silent, "-i", music_wav, "-i", voice_wav, "-i", whoosh_wav,
         "-filter_complex",
         # bed, sidechain-ducked by the voice
         "[1:a]atrim=0:%.3f,asetpts=N/SR/TB[m0];"
         "[2:a]asplit=2[v0][sc];"
         "[m0][sc]sidechaincompress=threshold=0.045:ratio=9:attack=18:"
         "release=340:makeup=1.7[duck];"
         "[3:a]atrim=0:%.3f,volume=0.9[sx];"
         "[duck][v0][sx]amix=inputs=3:normalize=0:dropout_transition=0[mix];"
         "[mix]loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.97[aout]"
         % (total, total),
         "-map", "0:v", "-map", "[aout]",
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
         "-movflags", "+faststart", "-shortest", dest])
    log(f"  muxed -> {dest}")
    return dest