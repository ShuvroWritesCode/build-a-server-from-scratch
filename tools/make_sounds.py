#!/usr/bin/env python3
"""Synthesize the course's sound effects and write them to js/data/sounds.js.

Standard library only (math, struct, base64, random). No numpy, no audio libraries,
no binary files in the repo: the output is a plain classic script holding 16-bit PCM
as base64 strings, which js/core/audio.js decodes into Web Audio buffers on demand.

Run from the repo root:   python3 tools/make_sounds.py

Every sound is deterministic (seeded noise) so re-running produces an identical file.
Loops are made seamless here, not in the browser: the fan hum is built only from
partials that complete a whole number of cycles per loop, and the wind bed has its
tail cross-faded onto its head.
"""
import base64
import math
import os
import random
import struct
import sys

TAU = 2 * math.pi


# ----------------------------------------------------------------------------- helpers
def normalize(samples, peak=0.9):
    m = max(1e-9, max(abs(s) for s in samples))
    k = peak / m
    return [s * k for s in samples]


def soft_clip(x, drive=1.0):
    return math.tanh(x * drive) / math.tanh(drive)


def one_pole_lowpass(samples, sr, cutoff, passes=1):
    """Simple RC low-pass. Cheap and good enough for noise shaping."""
    out = samples
    for _ in range(passes):
        a = 1.0 - math.exp(-TAU * cutoff / sr)
        y = 0.0
        res = []
        for s in out:
            y += a * (s - y)
            res.append(y)
        out = res
    return out


def one_pole_highpass(samples, sr, cutoff):
    a = 1.0 - math.exp(-TAU * cutoff / sr)
    y = 0.0
    res = []
    for s in samples:
        y += a * (s - y)
        res.append(s - y)
    return res


def crossfade_loop(samples, sr, fade_s):
    """Make a seamless loop: blend the last `fade_s` seconds onto the first `fade_s`
    with an equal-power curve, then drop the tail. Output is shorter by fade_s."""
    n = int(fade_s * sr)
    body = samples[:-n]
    tail = samples[-n:]
    for i in range(n):
        t = i / n
        a = math.cos(t * math.pi / 2)  # tail weight: 1 → 0
        b = math.sin(t * math.pi / 2)  # head weight: 0 → 1
        body[i] = tail[i] * a + body[i] * b
    return body


def envelope(i, sr, attack, hold, release, n):
    """Linear attack, hold, exponential-ish release. Returns 0..1."""
    t = i / sr
    if t < attack:
        return t / attack
    if t < attack + hold:
        return 1.0
    r = (t - attack - hold) / max(1e-6, release)
    return max(0.0, math.exp(-4.5 * r) * (1 - r)) if r < 1 else 0.0


def pcm16_b64(samples):
    ints = [max(-32768, min(32767, int(round(s * 32767)))) for s in samples]
    raw = struct.pack('<%dh' % len(ints), *ints)
    return base64.b64encode(raw).decode('ascii')


# ----------------------------------------------------------------------------- sounds
def fan_hum(sr=16000, dur=0.5):
    """A server fan at nominal speed. Playback rate is scaled in the browser to follow rpm.

    All partials are multiples of 1/dur (2 Hz) so the loop is exactly periodic.
    """
    n = int(sr * dur)
    base = 1.0 / dur
    # blade-pass tone with harmonics, a motor whine, a sub thump, and a 4 Hz wobble
    partials = [
        (round(118 / base) * base, 1.00),   # blade pass fundamental (~118 Hz)
        (round(236 / base) * base, 0.45),
        (round(354 / base) * base, 0.22),
        (round(472 / base) * base, 0.14),
        (round(708 / base) * base, 0.08),
        (round(1180 / base) * base, 0.05),  # motor / bearing whine
        (round(1770 / base) * base, 0.03),
        (round(59 / base) * base, 0.30),    # sub (half the blade pass)
    ]
    out = []
    for i in range(n):
        t = i / sr
        s = 0.0
        for f, a in partials:
            s += a * math.sin(TAU * f * t)
        wobble = 1.0 + 0.08 * math.sin(TAU * 4 * t)
        out.append(soft_clip(s * 0.35 * wobble, 1.4))
    # air rush component: periodic-noise approximation using many detuned partials
    # that still complete whole cycles (so the loop stays seamless)
    rng = random.Random(7)
    rush = [0.0] * n
    for k in range(40):
        f = base * rng.randint(300, 1400)  # 600–2800 Hz
        ph = rng.random() * TAU
        a = 0.02 * (1 - abs(f - 1600) / 1600)
        for i in range(n):
            rush[i] += a * math.sin(TAU * f * i / sr + ph)
    out = [o + r for o, r in zip(out, rush)]
    return normalize(out, 0.85)


def wind(sr=11025, dur=2.0, fade=0.25):
    """Air moving through a chassis: low-passed noise with slow turbulence. Loops seamlessly."""
    rng = random.Random(11)
    total = int(sr * (dur + fade))
    noise = [rng.uniform(-1, 1) for _ in range(total)]
    shaped = one_pole_lowpass(noise, sr, 1400, passes=2)
    shaped = one_pole_highpass(shaped, sr, 80)
    # turbulence: gentle amplitude swell from two slow LFOs (whole cycles per loop)
    out = []
    for i, s in enumerate(shaped):
        t = i / sr
        swell = 1.0 + 0.22 * math.sin(TAU * (1.0 / dur) * t) + 0.12 * math.sin(TAU * (3.0 / dur) * t + 1.3)
        out.append(s * swell)
    out = crossfade_loop(out, sr, fade)
    return normalize(out, 0.8)


def fan_fail(sr=16000, dur=0.75):
    """A fan seizing: a thud, a bearing rattle and a whine that winds down."""
    rng = random.Random(3)
    n = int(sr * dur)
    out = []
    noise = [rng.uniform(-1, 1) for _ in range(n)]
    rattle_src = one_pole_lowpass(noise, sr, 900)
    phase = 0.0
    for i in range(n):
        t = i / sr
        # thud: 90 → 45 Hz sine with fast decay
        f_thud = 90 * math.exp(-3 * t) + 40
        thud = math.sin(TAU * f_thud * t) * math.exp(-9 * t)
        # whine gliding down 700 → 120 Hz over the clip
        f_w = 120 + 580 * math.exp(-4.5 * t)
        phase += TAU * f_w / sr
        whine = math.sin(phase) * 0.35 * math.exp(-3.2 * t) * min(1.0, t * 40)
        # rattle: noise gated at ~28 Hz, slowing down
        gate = 1.0 if math.sin(TAU * (28 - 20 * t) * t) > 0.3 else 0.0
        rattle = rattle_src[i] * gate * 0.5 * math.exp(-4 * t)
        out.append(soft_clip(thud * 0.9 + whine + rattle, 1.2))
    return normalize(out, 0.9)


def clack(sr=16000, dur=0.14):
    """A part seating or un-seating: short mechanical click."""
    rng = random.Random(5)
    n = int(sr * dur)
    noise = [rng.uniform(-1, 1) for _ in range(n)]
    burst = one_pole_lowpass(noise, sr, 2600)
    out = []
    for i in range(n):
        t = i / sr
        env = math.exp(-55 * t)
        tone = math.sin(TAU * 210 * t) * math.exp(-40 * t) * 0.6
        out.append(burst[i] * env + tone)
    return normalize(out, 0.85)


def alarm(sr=16000, dur=0.5):
    """A BMC-style two-tone warning beep (used when the CPU hits throttling)."""
    n = int(sr * dur)
    out = []
    for i in range(n):
        t = i / sr
        if t < 0.2:
            f, lt = 880, t
        elif 0.24 <= t < 0.46:
            f, lt = 660, t - 0.24
        else:
            out.append(0.0)
            continue
        env = envelope(int(lt * sr), sr, 0.008, 0.15, 0.06, n)
        # soft square: fundamental + odd harmonics
        s = math.sin(TAU * f * t) + math.sin(TAU * 3 * f * t) / 3 + math.sin(TAU * 5 * f * t) / 5
        out.append(s * env * 0.5)
    return normalize(out, 0.7)


SOUNDS = [
    ('hum', fan_hum, True),
    ('wind', wind, True),
    ('fanFail', fan_fail, False),
    ('clack', clack, False),
    ('alarm', alarm, False),
]

SR = {'hum': 16000, 'wind': 11025, 'fanFail': 16000, 'clack': 16000, 'alarm': 16000}


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_path = os.path.join(root, 'js', 'data', 'sounds.js')
    entries = []
    total = 0
    for name, fn, loop in SOUNDS:
        sr = SR[name]
        samples = fn(sr=sr)
        b64 = pcm16_b64(samples)
        total += len(b64)
        entries.append("    %s: { sr: %d, loop: %s, pcm: '%s' }" % (name, sr, 'true' if loop else 'false', b64))
        sys.stderr.write('%-8s %5d samples @ %5d Hz  %6.2f s  %6d b64 chars\n' % (name, len(samples), sr, len(samples) / sr, len(b64)))
    js = (
        "/* GENERATED by tools/make_sounds.py — do not edit by hand.\n"
        "   Sound effects as mono 16-bit PCM, base64. Loaded on demand by js/core/audio.js the first time\n"
        "   sound is switched on, so readers who never enable sound never download it. */\n"
        ";(function (S) {\n"
        "  'use strict';\n"
        "  S.data.sounds = {\n" + ",\n".join(entries) + "\n  };\n"
        "  if (S.audio && S.audio._onSoundsLoaded) S.audio._onSoundsLoaded();\n"
        "})(window.SRV);\n"
    )
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(js)
    sys.stderr.write('wrote %s (%d KB)\n' % (os.path.relpath(out_path, root), len(js) // 1024))


if __name__ == '__main__':
    main()
