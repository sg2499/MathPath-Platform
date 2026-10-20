"""The eight rank soundtracks, composed and rendered offline (not shipped: tools/).

    python3 tools/rank-medals/soundtrack.py <outDir> [FAMILY ...]

Every track follows the cut scene's own timeline (scene.js, T): the embers
gather over a low swell, a build drives into the strike, the strike lands on a
full-orchestra hit with the rank's own accent (an anvil for Copper, a gong for
Bronze, ice for Silver ...), the stones, laurel and crest sparkle in, and the
rank's motif lands with the title, then rings out. A replay is the same piece
with its events pulled in (K = 0.62), so it stays in sync with the shorter
replay.

All instruments are synthesised here (additive brass, strings and choir,
modal bells and drums, shaped noise), mixed with a convolution hall and
mastered to the same loudness. Output: <FAMILY>-<promo|replay>.wav (48 kHz
stereo) and .mp3 (for the app, public/audio/ranks/).
"""
import os
import subprocess
import sys

import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d
import zlib

SR = 48000
NAMES = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "E#": 5, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11, "B#": 12}


def note(s):
    """'C#4' -> MIDI number."""
    return 12 * (int(s[-1]) + 1) + NAMES[s[:-1]]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


class Rng:
    def __init__(self, seed):
        self.g = np.random.default_rng(seed)

    def __getattr__(self, k):
        return getattr(self.g, k)


R = Rng(1)


# ---------------------------------------------------------------------------
# envelopes and helpers
# ---------------------------------------------------------------------------
def env(N, a=0.01, d=0.1, s=0.8, r=0.3, hold=None):
    """ADSR over N samples; hold = seconds before release (default: till the end minus r)."""
    t = np.arange(N) / SR
    dur = N / SR
    hold = dur - r if hold is None else hold
    e = np.where(t < a, (t / max(a, 1e-4)) ** 1.5, s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = np.clip((t - hold) / max(r, 1e-4), 0, 1)
    e = e * np.where(t > hold, np.cos(rel * np.pi / 2) ** 2, 1.0)
    return e


def fade(x, a=0.004, r=0.02):
    N = len(x)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    g = np.ones(N)
    g[:na] = np.linspace(0, 1, na)
    g[-nr:] *= np.linspace(1, 0, nr)
    return x * g


def shaped_noise(N, mask, seed=None, nper=1024):
    """White noise filtered by mask(freqs[F,1], times[1,T]) -> gain[F,T] (time-varying)."""
    g = np.random.default_rng(seed) if seed is not None else R
    x = g.standard_normal(N + nper)
    f, t, Z = signal.stft(x, SR, nperseg=nper)
    Z *= mask(f[:, None], t[None, :])
    _, y = signal.istft(Z, SR, nperseg=nper)
    return y[:N]


def sos(kind, fc, order=2):
    return signal.butter(order, fc, btype=kind, fs=SR, output="sos")


def filt(x, kind, fc, order=2):
    return signal.sosfilt(sos(kind, fc, order), x)


# ---------------------------------------------------------------------------
# instruments (each returns a mono signal)
# ---------------------------------------------------------------------------
def additive(f0, dur, gain_k, cutoff=None, vib=0.0, vib_rate=5.5, vib_delay=0.25, scoop=0.0, slope=4, kmax=60, fmax=15000):
    """Harmonic tone. gain_k(k) -> amplitude; cutoff (Hz, scalar or array) is a
    per-harmonic lowpass, so a cutoff envelope makes brass open and close."""
    N = int(dur * SR)
    t = np.arange(N) / SR
    f = np.full(N, f0, float)
    if scoop:
        f *= 2 ** (-scoop * np.exp(-t / 0.05) / 12)
    if vib:
        f *= 1 + vib * np.sin(2 * np.pi * vib_rate * t + R.uniform(0, 6.28)) * np.clip((t - vib_delay) / 0.4, 0, 1)
    ph = 2 * np.pi * np.cumsum(f) / SR
    out = np.zeros(N)
    K = int(min(kmax, fmax / f0))
    for k in range(1, K + 1):
        g = gain_k(k)
        if g == 0:
            continue
        if cutoff is not None:
            g = g / np.sqrt(1 + (k * f0 / cutoff) ** slope)
        out += g * np.sin(k * ph + R.uniform(0, 6.28))
    return out


SAW = lambda k: 1.0 / k
SQR = lambda k: (1.0 / k) if k % 2 else 0.12 / k


def brass(m, dur, vel=1.0, bright=1.0):
    f0 = hz(m)
    N = int(dur * SR)
    t = np.arange(N) / SR
    # the bell of the horn opens on the attack and settles; louder is brighter
    cut = f0 * (1.4 + (4.5 * vel * bright) * (1 - np.exp(-t / 0.06)) * (0.65 + 0.35 * np.exp(-t / 0.5)))
    x = additive(f0, dur, SAW, cutoff=cut, vib=0.0035, vib_rate=5.2, vib_delay=0.35, scoop=0.35, slope=3)
    breath = filt(R.standard_normal(N), "bandpass", [min(f0 * 2, 3000), min(f0 * 6, 9000)]) * 0.02 * np.exp(-t / 0.08)
    return (x + breath) * env(N, a=0.045, d=0.25, s=0.82, r=min(0.35, dur * 0.4))


def ensemble(fn, m, dur, voices=4, cents=9, jitter=0.012, **kw):
    """A section: several players a few cents apart, starting a hair apart."""
    N = int(dur * SR)
    out = np.zeros(N)
    for i in range(voices):
        d = (i - (voices - 1) / 2) / max(1, (voices - 1) / 2) * cents / 100 + R.uniform(-0.02, 0.02)
        x = fn(m + d, dur, **kw)
        off = int(R.uniform(0, jitter) * SR)
        out[off:] += x[: N - off]
    return out / np.sqrt(voices)


def strings(m, dur, a=0.35, r=0.6, bright=1.0):
    f0 = hz(m)
    N = int(dur * SR)
    x = additive(f0, dur, SAW, cutoff=min(14000, f0 * 6 * bright + 1200), vib=0.0045, vib_rate=5.4, vib_delay=0.2)
    return x * env(N, a=a, d=0.4, s=0.9, r=min(r, dur * 0.5))


def stacc(m, dur=0.16, vel=1.0):
    """Short, bowed-off string note (ostinato)."""
    f0 = hz(m)
    N = int(dur * SR)
    t = np.arange(N) / SR
    cut = f0 * (2 + 5 * vel * np.exp(-t / 0.05))
    x = additive(f0, dur, SAW, cutoff=cut, slope=3)
    return x * env(N, a=0.006, d=0.06, s=0.35, r=0.05)


VOWELS = {
    "ah": [(800, 90, 1.0), (1150, 110, 0.55), (2900, 160, 0.22), (3900, 200, 0.12)],
    "oo": [(320, 70, 1.0), (800, 90, 0.35), (2400, 160, 0.08)],
    "eh": [(500, 80, 1.0), (1750, 120, 0.5), (2500, 160, 0.3), (3500, 200, 0.12)],
}


def voice(m, dur, vowel="ah", a=0.5, r=0.8):
    f0 = hz(m)
    N = int(dur * SR)
    fm = VOWELS[vowel]
    def g(k):
        fk = k * f0
        return (1.0 / k ** 0.6) * (0.03 + sum(A / (1 + ((fk - F) / B) ** 2) for F, B, A in fm))
    x = additive(f0, dur, g, vib=0.006, vib_rate=R.uniform(4.6, 5.8), vib_delay=0.3, fmax=9000)
    breath = shaped_noise(N, lambda f, t: np.exp(-((f - fm[1][0]) / 900) ** 2)) * 0.012
    return (x + breath) * env(N, a=a, d=0.5, s=0.92, r=min(r, dur * 0.5))


def choir(m, dur, vowel="ah", voices=6, **kw):
    return ensemble(voice, m, dur, voices=voices, cents=11, jitter=0.03, vowel=vowel, **kw)


def flute(m, dur, a=0.08):
    f0 = hz(m)
    N = int(dur * SR)
    x = additive(f0, dur, lambda k: [1, 0.22, 0.09, 0.04, 0.02][k - 1] if k <= 5 else 0, vib=0.006, vib_rate=5.0, vib_delay=0.2)
    air = filt(R.standard_normal(N), "bandpass", [f0 * 0.8, min(f0 * 4, 12000)]) * 0.035
    return (x + air) * env(N, a=a, d=0.2, s=0.85, r=min(0.4, dur * 0.4))


def modal(partials, dur, click=0.0, click_fc=4000):
    """partials: (freq, amp, t60). A struck object: bells, bars, gongs, anvils."""
    N = int(dur * SR)
    t = np.arange(N) / SR
    out = np.zeros(N)
    for f, a, t60 in partials:
        if f >= SR / 2.2:
            continue
        out += a * np.sin(2 * np.pi * f * t + R.uniform(0, 6.28)) * np.exp(-6.9 * t / t60)
    if click:
        n = int(0.012 * SR)
        c = filt(R.standard_normal(n), "highpass", click_fc) * np.exp(-np.arange(n) / (0.002 * SR))
        out[:n] += click * c
    return fade(out, 0.0015, 0.05)


BELL = [(0.5, 0.35, 1.0), (1.0, 1.0, 0.8), (1.183, 0.55, 0.62), (1.506, 0.45, 0.5), (2.0, 0.4, 0.42), (2.514, 0.28, 0.34), (2.662, 0.24, 0.3), (3.011, 0.2, 0.26), (4.166, 0.14, 0.2), (5.433, 0.1, 0.15), (6.796, 0.07, 0.12)]


def bell(m, dur=3.0, t60=3.2, bright=1.0):
    f0 = hz(m)
    return modal([(f0 * r, a * (bright if r > 2 else 1), t60 * d) for r, a, d in BELL], dur, click=0.15)


def celesta(m, dur=1.8, t60=1.6):
    f0 = hz(m)
    return modal([(f0, 1.0, t60), (f0 * 2.0, 0.25, t60 * 0.5), (f0 * 4.0, 0.12, t60 * 0.25), (f0 * 5.4, 0.04, t60 * 0.15)], dur, click=0.25, click_fc=6000)


def glass(m, dur=2.6, t60=2.4):
    f0 = hz(m)
    return modal([(f0, 1.0, t60), (f0 * 2.32, 0.42, t60 * 0.6), (f0 * 4.25, 0.22, t60 * 0.38), (f0 * 6.63, 0.1, t60 * 0.25)], dur, click=0.1, click_fc=8000)


def harp(m, dur=2.4, t60=2.2):
    f0 = hz(m)
    N = int(dur * SR)
    t = np.arange(N) / SR
    out = np.zeros(N)
    for k in range(1, min(24, int(14000 / f0)) + 1):
        a = abs(np.sin(np.pi * k * 0.13)) / k ** 0.9
        out += a * np.sin(2 * np.pi * f0 * k * (1 + 0.0004 * k * k) * t + R.uniform(0, 6.28)) * np.exp(-6.9 * t / (t60 / (1 + 0.22 * k)))
    return fade(out * 0.6, 0.002, 0.06)


def pluck_synth(m, dur=0.35, cut0=6.0):
    f0 = hz(m)
    N = int(dur * SR)
    t = np.arange(N) / SR
    x = additive(f0, dur, SQR, cutoff=f0 * (1.2 + cut0 * np.exp(-t / 0.07)), slope=3)
    return x * env(N, a=0.003, d=0.12, s=0.25, r=0.1)


def supersaw(m, dur, cut=3000, a=0.6, r=0.8):
    return ensemble(lambda mm, d: additive(hz(mm), d, SAW, cutoff=cut, slope=3), m, dur, voices=7, cents=18, jitter=0.0) * env(int(dur * SR), a=a, d=0.5, s=0.9, r=r)


def timpani(m, dur=2.6, vel=1.0):
    f0 = hz(m)
    N = int(dur * SR)
    t = np.arange(N) / SR
    glide = 1 + 0.03 * np.exp(-t / 0.05)
    out = np.zeros(N)
    for r, a, t60 in [(1, 1, 2.2), (1.5, 0.5, 1.5), (1.98, 0.32, 1.1), (2.44, 0.2, 0.8), (2.9, 0.12, 0.6)]:
        out += a * np.sin(2 * np.pi * np.cumsum(f0 * r * glide) / SR) * np.exp(-6.9 * t / t60)
    n = int(0.04 * SR)
    out[:n] += filt(R.standard_normal(n), "lowpass", 1400) * np.exp(-np.arange(n) / (0.006 * SR)) * 0.6
    return fade(out * vel, 0.001, 0.05)


def taiko(dur=1.2, vel=1.0, f=62):
    N = int(dur * SR)
    t = np.arange(N) / SR
    fr = f + f * 1.1 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-6.9 * t / 0.9)
    body += 0.35 * np.sin(2 * np.pi * np.cumsum(fr * 1.58) / SR) * np.exp(-6.9 * t / 0.4)
    skin = filt(R.standard_normal(N), "bandpass", [140, 700]) * np.exp(-t / 0.05) * 0.5
    slap = filt(R.standard_normal(N), "bandpass", [1200, 4000]) * np.exp(-t / 0.008) * 0.25
    return fade(np.tanh((body + skin + slap) * 1.3 * vel), 0.0005, 0.05)


def kick(dur=0.5):
    N = int(dur * SR)
    t = np.arange(N) / SR
    fr = 46 + 120 * np.exp(-t / 0.03)
    return fade(np.tanh(1.6 * np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t / 0.18)), 0.0005, 0.03)


def snare(dur=0.5, vel=1.0):
    N = int(dur * SR)
    t = np.arange(N) / SR
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.04)
    rattle = filt(R.standard_normal(N), "bandpass", [1800, 9000]) * np.exp(-t / 0.12)
    return fade((tone * 0.6 + rattle) * vel, 0.0005, 0.03)


def boom(dur=4.0, depth=1.0):
    """The cinematic impact: a sub drop, a body thump and a dark noise bloom."""
    N = int(dur * SR)
    t = np.arange(N) / SR
    fr = 34 + 80 * np.exp(-t / 0.09)
    sub = np.tanh(1.8 * np.sin(2 * np.pi * np.cumsum(fr) / SR)) * np.exp(-6.9 * t / (2.8 * depth))
    thump = filt(R.standard_normal(N), "lowpass", 260) * np.exp(-t / 0.12) * 1.4
    bloom = shaped_noise(N, lambda f, tt: np.exp(-f / (180 + 1400 * np.exp(-tt / 0.25))) * np.exp(-tt / 0.9)) * 0.9
    click = np.zeros(N)
    n = int(0.006 * SR)
    click[:n] = filt(R.standard_normal(n), "highpass", 2000) * np.linspace(1, 0, n) * 0.6
    return fade(sub + thump + bloom + click, 0.0005, 0.2)


def crash(dur=4.5, t60=3.2, bright=1.0):
    N = int(dur * SR)
    def m(f, t):
        hp = 1 / (1 + (2600 / np.maximum(f, 1)) ** 4)
        return hp * np.exp(-6.9 * t / (t60 * (0.35 + 0.65 * (4000 / np.maximum(f, 4000)) ** (0.6 / bright))))
    x = shaped_noise(N, m)
    t = np.arange(N) / SR
    shimmer = sum(np.sin(2 * np.pi * f * t + R.uniform(0, 6.28)) * np.exp(-t / R.uniform(0.6, 1.6)) for f in R.uniform(3200, 9000, 24)) * 0.02
    return fade(x + shimmer, 0.001, 0.3)


def riser(dur, f_from=300, f_to=7000, q=0.6):
    N = int(dur * SR)
    def m(f, t):
        c = f_from * (f_to / f_from) ** (t / dur) ** 1.6
        return np.exp(-(np.log(np.maximum(f, 1) / c) / q) ** 2) * (t / dur) ** 2
    return fade(shaped_noise(N, m), 0.05, 0.01)


def whoosh(dur=1.0, f0=500, f1=6000):
    N = int(dur * SR)
    def m(f, t):
        c = f0 * (f1 / f0) ** (t / dur)
        return np.exp(-(np.log(np.maximum(f, 1) / c) / 0.7) ** 2) * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    return fade(shaped_noise(N, m), 0.01, 0.05)


def anvil(dur=3.0, f0=1180):
    parts = [(f0, 1.0, 2.6), (f0 * 1.413, 0.55, 1.6), (f0 * 2.43, 0.42, 1.0), (f0 * 3.02, 0.3, 0.7), (f0 * 4.15, 0.2, 0.45), (f0 * 5.6, 0.12, 0.3), (f0 * 0.37, 0.4, 0.9)]
    return modal(parts, dur, click=0.9, click_fc=2500)


def gong(dur=6.0, f0=72):
    t = np.arange(int(dur * SR)) / SR
    parts = [(f0 * r, a, d) for r, a, d in [(1, 1, 5.5), (1.52, 0.6, 4.5), (2.03, 0.5, 4), (2.61, 0.42, 3.4), (3.17, 0.34, 3), (3.92, 0.28, 2.4), (4.6, 0.22, 2.2), (5.43, 0.18, 1.8), (6.7, 0.12, 1.4), (8.1, 0.08, 1.0)]]
    x = modal(parts, dur, click=0.4, click_fc=900)
    swell = 0.6 + 0.4 * np.clip(t / 0.5, 0, 1)            # a gong blooms after it is struck
    return x * swell


def ice_crackle(dur=0.9, density=90):
    N = int(dur * SR)
    out = np.zeros(N)
    for _ in range(int(density * dur)):
        at = int(R.uniform(0, 1) ** 1.8 * (N - 600))
        n = int(R.uniform(0.0015, 0.006) * SR)
        out[at:at + n] += filt(R.standard_normal(n), "bandpass", [R.uniform(2500, 5000), 11000]) * np.exp(-np.arange(n) / (0.0012 * SR)) * R.uniform(0.2, 1)
    return out


def lightning(dur=4.0):
    N = int(dur * SR)
    t = np.arange(N) / SR
    crack = filt(R.standard_normal(N), "highpass", 900) * np.exp(-t / 0.035) * 1.2
    crackle = np.zeros(N)
    for _ in range(70):
        at = int(R.uniform(0, 0.45) ** 1.5 * SR)
        n = int(0.003 * SR)
        crackle[at:at + n] += R.standard_normal(n) * np.exp(-np.arange(n) / (0.0008 * SR)) * R.uniform(0.3, 1)
    rumble = shaped_noise(N, lambda f, tt: np.exp(-f / (90 + 500 * np.exp(-tt / 0.3))) * np.clip(tt / 0.12, 0, 1) * np.exp(-tt / 1.4)) * 2.2
    rumble *= 0.7 + 0.3 * np.abs(np.sin(2 * np.pi * 3.3 * t))
    return fade(crack + crackle * 0.6 + rumble, 0.0005, 0.3)


def zap(dur=0.9, f0=180, f1=2400):
    """A rising energy sweep (Platinum's core)."""
    N = int(dur * SR)
    t = np.arange(N) / SR
    f = f0 * (f1 / f0) ** (t / dur) ** 2
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph + 2.2 * np.sin(ph * 1.5)) * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.5
    return fade(x, 0.01, 0.08)


# ---------------------------------------------------------------------------
# the mix
# ---------------------------------------------------------------------------
class Track:
    def __init__(self, dur):
        self.N = int(dur * SR)
        self.dry = np.zeros((2, self.N))
        self.wet = np.zeros((2, self.N))

    def add(self, x, at, gain=1.0, pan=0.0, send=0.3):
        i = int(at * SR)
        if i >= self.N or len(x) == 0:
            return
        if i < 0:
            x, i = x[-i:], 0
        x = x[: self.N - i] * gain
        L, Rr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        self.dry[0, i:i + len(x)] += x * L * (1 - send * 0.5)
        self.dry[1, i:i + len(x)] += x * Rr * (1 - send * 0.5)
        self.wet[0, i:i + len(x)] += x * L * send
        self.wet[1, i:i + len(x)] += x * Rr * send

    def chord(self, fn, notes, at, gain=1.0, spread=0.6, send=0.3, **kw):
        k = len(notes)
        for j, m in enumerate(notes):
            pan = (j / max(1, k - 1) - 0.5) * 2 * spread if k > 1 else 0
            self.add(fn(m, **kw), at, gain / np.sqrt(k), pan, send)

    def render(self, rt=2.6, mix=1.0, loud=-16.5):
        ir = hall(rt)
        wet = np.stack([signal.fftconvolve(self.wet[c], ir[c])[: self.N] for c in range(2)])
        y = self.dry + wet * mix
        y = signal.sosfilt(sos("highpass", 28), y, axis=1)
        y = master_eq(y)
        # level: the loud middle of the piece to a common loudness, then a limiter
        a, b = int(1.8 * SR), int(min(self.N, 7.0 * SR))
        rms = np.sqrt(np.mean(y[:, a:b] ** 2)) + 1e-9
        y *= 10 ** (loud / 20) / rms
        y = limit(y, 10 ** (-1.0 / 20))
        nf = int(0.6 * SR)
        y[:, -nf:] *= np.linspace(1, 0, nf) ** 2
        return y


def master_eq(y):
    """A gentle mastering curve: a little less low-mid weight, more presence
    and air, so the instruments read clearly on laptop and phone speakers."""
    n = y.shape[1]
    f = np.fft.rfftfreq(n, 1 / SR)
    db = (-2.0 / (1 + (f / 140) ** 2) * (f > 0)          # low shelf down below ~140 Hz
          + 3.0 * np.exp(-(np.log2(np.maximum(f, 1) / 3500)) ** 2 / 0.8)   # presence around 3.5 kHz
          + 2.5 / (1 + (9000 / np.maximum(f, 1)) ** 2)   # air above 9 kHz
          - 12 / (1 + (18500 / np.maximum(f, 1)) ** 8))  # and nothing harsh at the very top
    g = 10 ** (db / 20)
    return np.stack([np.fft.irfft(np.fft.rfft(y[c]) * g, n) for c in range(2)])


def hall(rt, seed=11):
    """A stereo hall: early reflections, then a dense tail whose highs die first."""
    N = int(rt * 1.25 * SR)
    out = []
    for c in range(2):
        def m(f, t):
            rtf = rt * (0.45 + 0.55 / (1 + (np.maximum(f, 1) / 5500) ** 1.4))
            return np.exp(-6.9 * t / rtf) * np.clip(t / 0.03, 0, 1)
        tail = shaped_noise(N, m, seed=seed + c)
        pre = int(0.022 * SR)
        ir = np.zeros(N + pre)
        ir[pre:] = tail
        g = np.random.default_rng(seed + 10 + c)
        for _ in range(14):
            d = int(g.uniform(0.004, 0.06) * SR)
            ir[d] += g.uniform(-0.5, 0.5)
        out.append(ir / np.sqrt(np.sum(ir ** 2)))
    return out


def limit(y, thr):
    """Look-ahead peak limiter."""
    peak = np.max(np.abs(y), axis=0)
    look = int(0.004 * SR)
    need = np.minimum(1.0, thr / np.maximum(peak, 1e-9))
    need = minimum_filter1d(need, size=2 * look + 1, mode="nearest")    # reach the gain before the peak arrives
    g = np.empty_like(need)
    rel = np.exp(-1 / (0.12 * SR))
    cur = 1.0
    for i in range(len(need)):
        cur = need[i] if need[i] < cur else need[i] + (cur - need[i]) * rel
        g[i] = cur
    return y * g


# ---------------------------------------------------------------------------
# the compositions
# ---------------------------------------------------------------------------
def timeline(K):
    return {"gather": 0.0, "body": 1.0 * K, "strike": 2.25 * K, "stones": 2.5 * K, "laurel": 2.85 * K, "crest": 3.3 * K,
            "sweep": 3.6 * K, "title": 4.3 * K, "line": 4.75 * K, "xp": 5.1 * K, "actions": 5.4 * K, "end": 5.4 * K + 0.6}


def M(*names):
    return [note(n) for n in names]


# Each rank: its key and chords, the sound of its strike, and its motif.
FAMILIES = {
    "COPPER": dict(rt=2.2, mix=0.8,
                   drone=M("D2", "A2"), build=M("D3", "F3", "A3", "D4"), hit=M("D2", "A2", "D3", "F#3", "A3", "D4"), final=M("D3", "A3", "D4", "F#4", "A4"),
                   motif=[("A3", 0.5), ("D4", 0.25), ("E4", 0.25), ("F#4", 1)], lead="brass", sparkle="celesta", spark=M("D5", "F#5", "A5", "D6", "F#6", "A6")),
    "BRONZE": dict(rt=2.6, mix=0.85,
                   drone=M("E2", "B2"), build=M("E3", "B3", "E4"), hit=M("E2", "B2", "E3", "B3", "E4", "G#4"), final=M("E3", "B3", "E4", "G#4", "B4"),
                   motif=[("B3", 0.5), ("E4", 0.5), ("F#4", 0.25), ("G#4", 1)], lead="brass", sparkle="bell", spark=M("E5", "G#5", "B5", "E6", "G#6", "B6")),
    "SILVER": dict(rt=3.4, mix=1.15,
                   drone=M("F#2", "C#3"), build=M("F#4", "G#4", "C#5"), hit=M("F#3", "C#4", "G#4", "A#4", "C#5", "F#5"), final=M("F#4", "A#4", "C#5", "G#5", "B#5"),
                   motif=[("C#5", 0.5), ("F#5", 0.25), ("G#5", 0.25), ("A#5", 1)], lead="glass", sparkle="glass", spark=M("F#5", "G#5", "A#5", "C#6", "F#6", "G#6")),
    "GOLD": dict(rt=2.6, mix=0.9,
                 drone=M("C2", "G2"), build=M("G3", "B3", "D4", "F4"), hit=M("C2", "G2", "C3", "E3", "G3", "C4", "E4"), final=M("C3", "G3", "C4", "E4", "G4", "C5"),
                 motif=[("G4", 0.33), ("G4", 0.33), ("G4", 0.34), ("C5", 0.5), ("E5", 1)], lead="brass", sparkle="celesta", spark=M("C6", "E6", "G6", "C7", "E6", "G6")),
    "PLATINUM": dict(rt=2.8, mix=0.95,
                     drone=M("A1", "E2"), build=M("A3", "C4", "E4", "B4"), hit=M("A1", "A2", "E3", "A3", "C#4", "E4", "B4"), final=M("A3", "E4", "A4", "C#5", "B4"),
                     motif=[("E5", 0.5), ("A5", 0.25), ("B5", 0.25), ("C#6", 1)], lead="synth", sparkle="pluck", spark=M("A5", "C#6", "E6", "A6", "B6", "E7")),
    "EMERALD": dict(rt=3.0, mix=1.05,
                    drone=M("G2", "D3"), build=M("E3", "G3", "B3", "D4"), hit=M("G2", "D3", "G3", "B3", "D4", "A4"), final=M("G3", "D4", "G4", "B4", "D5", "A4"),
                    motif=[("D5", 0.5), ("G5", 0.25), ("A5", 0.25), ("B5", 1)], lead="flute", sparkle="harp", spark=M("G5", "B5", "D6", "G6", "A6", "B6")),
    "DIAMOND": dict(rt=3.8, mix=1.2,
                    drone=M("B1", "F#2"), build=M("G#3", "B3", "D#4", "E4"), hit=M("B2", "F#3", "B3", "D#4", "F#4", "C#5"), final=M("B3", "F#4", "B4", "D#5", "F#5", "C#5"),
                    motif=[("F#5", 0.5), ("B5", 0.25), ("C#6", 0.25), ("D#6", 1)], lead="bell", sparkle="glass", spark=M("B5", "D#6", "E#6", "F#6", "B6", "C#7")),
    "CHAMPION": dict(rt=3.0, mix=0.95,
                     drone=M("D2", "A2"), build=M("D3", "F3", "A3"), hit=M("D2", "A2", "D3", "F3", "A3", "D4", "F4"), final=M("D3", "A3", "D4", "F#4", "A4", "D5"),
                     motif=[("A4", 0.33), ("A4", 0.33), ("D5", 0.34), ("E5", 0.5), ("F#5", 1.2)], lead="brass", sparkle="bell", spark=M("D6", "F#6", "A6", "D7")),
}


def lead(kind, m, dur):
    if kind == "brass":
        return ensemble(brass, m, dur, voices=3, cents=7, vel=0.95)
    if kind == "glass":
        return glass(m, dur=max(2.4, dur + 1.6))
    if kind == "bell":
        return bell(m, dur=max(3.0, dur + 2), t60=3.6) * 0.8
    if kind == "flute":
        return flute(m, dur)
    if kind == "synth":
        f0 = hz(m)
        N = int(dur * SR)
        t = np.arange(N) / SR
        x = ensemble(lambda mm, d: additive(hz(mm), d, SAW, cutoff=f0 * (2.5 + 3 * np.exp(-np.arange(int(d * SR)) / SR / 0.15)), slope=3, vib=0.004, vib_delay=0.15), m, dur, voices=3, cents=12, jitter=0)
        return x * env(N, a=0.02, d=0.2, s=0.8, r=min(0.3, dur * 0.4))
    raise ValueError(kind)


def spark_inst(kind, m):
    return {"celesta": celesta, "bell": lambda mm: bell(mm, dur=2.6, t60=2.4) * 0.7, "glass": glass, "harp": harp, "pluck": lambda mm: pluck_synth(mm, 0.5)}[kind](m)


def compose(fam, mode="promo"):
    K = 0.62 if mode == "replay" else 1.0
    T = timeline(K)
    P = FAMILIES[fam]
    R.g = np.random.default_rng(zlib.crc32(f"{fam}-{mode}".encode()))
    dur = T["end"] + 5.0
    tr = Track(dur)
    S = T["strike"]
    big = fam == "CHAMPION"

    # --- the gather: a low swell under the embers, growing into the strike
    for m in P["drone"]:
        x = ensemble(strings, m, S + 0.3, voices=4, cents=8, a=S * 0.8, r=0.3, bright=0.6)
        tr.add(x, 0.0, 0.32, pan=R.uniform(-0.3, 0.3), send=0.35)
    if fam in ("PLATINUM",):
        tr.add(supersaw(P["drone"][0] + 12, S + 0.2, cut=900, a=S * 0.7, r=0.2), 0, 0.12, 0, 0.3)
    for j, m in enumerate(P["build"]):
        x = choir(m, S - T["body"] + 0.5, vowel="oo" if fam in ("SILVER", "DIAMOND", "EMERALD") else "ah", a=(S - T["body"]) * 0.8, r=0.25) if fam not in ("PLATINUM",) else supersaw(m, S - T["body"] + 0.4, cut=1600, a=(S - T["body"]) * 0.8, r=0.2)
        tr.add(x, T["body"] - 0.15, 0.16 if not big else 0.22, pan=(j / max(1, len(P["build"]) - 1) - 0.5) * 1.2, send=0.5)
    tr.add(riser(S - 0.15, 250, 9000, 0.55), 0.15, 0.22, 0, 0.4)
    rc = crash(2.2, 1.6)[::-1]                       # a reversed cymbal sucks into the strike
    tr.add(rc, S - len(rc) / SR, 0.35, 0, 0.3)

    # --- the build: hits that drive into the strike
    span = S - T["body"]
    beats = [T["body"] + span * x for x in (0, 0.38, 0.62, 0.78, 0.88, 0.95)]
    for i, b in enumerate(beats):
        v = 0.55 + 0.45 * i / len(beats)
        if fam == "COPPER":
            tr.add(anvil(1.6, 1180 + 40 * i), b, 0.16 * v, pan=0.35, send=0.35) if i in (0, 2, 4) else None
            tr.add(timpani(P["drone"][0] + 12, 1.5, v), b, 0.5 * v, -0.2, 0.25)
        elif fam in ("BRONZE", "CHAMPION"):
            tr.add(taiko(1.0, v, 58 if i % 2 else 66), b, 0.8 * v, pan=(-0.3 if i % 2 else 0.3), send=0.3)
        elif fam == "GOLD":
            tr.add(snare(0.4, v), b, 0.35 * v, 0.15, 0.25)
            tr.add(timpani(note("G2"), 1.4, v), b, 0.45 * v, -0.2, 0.25)
        elif fam == "PLATINUM":
            tr.add(kick(0.45), b, 0.75 * v, 0, 0.1)
        else:
            tr.add(timpani(P["drone"][0] + 12, 1.6, v * 0.8), b, 0.36 * v, -0.15, 0.4)
    if fam == "PLATINUM":       # sixteenth arpeggio climbing with the filter
        step = span / 12
        arp = P["build"] + [P["build"][1] + 12]
        for i in range(12):
            tr.add(pluck_synth(arp[i % len(arp)] + 12, 0.3, 2 + 6 * i / 12), T["body"] + i * step, 0.14, pan=0.5 * np.sin(i), send=0.35)
    if big:                     # strings ostinato and a rising choir: the Champion builds hardest
        step = span / 16
        for i in range(16):
            tr.add(stacc(note("D3") + (0 if i % 4 else 12) + (1 if i >= 12 else 0) * 0, 0.14, 0.7 + 0.3 * i / 16), T["body"] + i * step, 0.18, pan=-0.3, send=0.2)
        tr.add(snare(0.4, 1), S - 0.12, 0.3, 0.2, 0.25)
        tr.add(snare(0.4, 1), S - 0.06, 0.38, 0.2, 0.25)

    # --- the strike. A breath first: everything drops away for a moment, so the hit lands harder
    tt = np.arange(tr.N) / SR
    dip = 1 - 0.7 * np.clip((tt - (S - 0.13)) / 0.1, 0, 1) * (tt < S + 0.02)
    tr.dry *= dip
    tr.wet *= 0.4 + 0.6 * dip
    tr.add(boom(4.5, 1.15 if big else 1.0), S, 1.25 if big else 1.05, 0, 0.25)
    tr.add(crash(4.8, 3.4), S, 0.5, 0.25, 0.4)
    stab = min(1.8, T["title"] - S - 0.25)
    if fam == "COPPER":
        tr.add(anvil(3.2, 1250), S, 0.42, 0.3, 0.35)
        tr.add(anvil(2.4, 940), S + 0.012, 0.22, -0.4, 0.35)
    if fam == "BRONZE":
        tr.add(gong(6.5, 70), S, 0.55, 0.0, 0.45)
    if fam == "SILVER":
        tr.add(ice_crackle(1.2, 120), S, 0.18, 0.35, 0.4)
        tr.add(ice_crackle(1.0, 90), S + 0.05, 0.14, -0.35, 0.4)
        tr.add(whoosh(1.0, 3000, 12000), S - 0.05, 0.12, 0, 0.6)
    if fam == "GOLD":
        tr.add(timpani(note("C2") + 12, 2.6, 1.0), S, 0.75, -0.1, 0.25)
    if fam == "PLATINUM":
        tr.add(zap(1.0, 120, 3200), S - 0.25, 0.22, 0, 0.45)
        tr.add(kick(0.6), S, 0.9, 0, 0.1)
    if fam == "EMERALD":
        for j, m in enumerate(M("G5", "D6", "G6", "B6", "D7")):
            tr.add(glass(m, 2.8, 2.6), S + 0.06 * j, 0.1, pan=-0.6 + 0.3 * j, send=0.6)
    if fam == "DIAMOND":
        for j, m in enumerate(M("B5", "C#6", "D#6", "E#6", "F#6", "G#6", "A#6", "B6")):
            tr.add(glass(m, 2.4, 2.2), S + 0.035 * j, 0.09, pan=-0.7 + 0.2 * j, send=0.65)
    if big:
        tr.add(lightning(4.2), S - 0.02, 0.8, 0.15, 0.3)
        tr.add(lightning(3.6), S + 0.4, 0.42, -0.5, 0.35)
        tr.add(lightning(3.2), T["crest"] + 0.15, 0.32, 0.55, 0.35)
        tr.add(gong(6.0, 58), S, 0.35, 0, 0.45)
    # the full chord on the strike: low brass and strings, the choir above
    hit = P["hit"]
    tr.chord(lambda m: ensemble(brass, m, stab, voices=3, cents=6, vel=1.0, bright=0.9), [m for m in hit if m < note("E4")], S + 0.005, 0.9 if fam not in ("SILVER", "DIAMOND", "PLATINUM") else 0.35, 0.7, 0.3)
    tr.chord(lambda m: ensemble(strings, m, stab + 0.6, voices=5, a=0.03, r=0.6), hit, S, 0.55, 0.8, 0.35)
    if fam != "PLATINUM":
        tr.chord(lambda m: choir(m + 12 if m < note("C4") else m, stab + 0.7, vowel="ah", a=0.08, r=0.7), hit[-4:], S, 0.38 if not big else 0.55, 0.7, 0.5)
    else:
        tr.chord(lambda m: supersaw(m + 12, stab + 0.5, cut=4200, a=0.02, r=0.6), hit[-4:], S, 0.32, 0.8, 0.45)

    # --- stones, laurel, crest: the sparkle
    for i, m in enumerate(P["spark"][:6]):
        tr.add(spark_inst(P["sparkle"], m), T["stones"] + i * 0.12 * K, 0.17, pan=(-0.6 + 0.24 * i), send=0.55)
    gl = P["final"] + [m + 12 for m in P["final"]]
    for i, m in enumerate(sorted(gl)):
        tr.add(harp(m + 12, 2.0, 1.8), T["laurel"] + i * (0.42 * K) / len(gl), 0.12, pan=-0.5 + i / len(gl), send=0.5)
    tr.add(spark_inst("bell" if P["sparkle"] != "pluck" else "pluck", P["spark"][-1] + 12 if P["spark"][-1] < note("C7") else P["spark"][-1]), T["crest"], 0.12, 0.3, 0.6)
    tr.add(whoosh(1.2, 400, 9000), T["sweep"] - 0.1, 0.14, 0, 0.55)
    # under it all, the hit chord settles into a held pad
    pad_len = T["title"] - S + 0.6
    tr.chord(lambda m: ensemble(strings, m, pad_len, voices=5, a=0.4, r=0.4, bright=0.8), P["build"] if fam != "GOLD" else M("G3", "B3", "D4", "F4"), S + 0.5, 0.32, 0.8, 0.45)

    # --- the title: a roll into the rank's motif, landing on the final chord
    roll_from = T["sweep"]
    n_roll = int((T["title"] - roll_from) / 0.055)
    for i in range(n_roll):
        v = 0.25 + 0.75 * (i / max(1, n_roll)) ** 2
        tr.add(timpani(P["drone"][0] + 12, 0.6, v) if fam != "PLATINUM" else snare(0.2, v * 0.6), roll_from + i * 0.055, 0.22 * v, -0.2, 0.3)
    beat = 0.32 * (0.8 + 0.2 * K)
    total = sum(b for _, b in P["motif"][:-1])
    t0 = T["title"] - total * beat
    for j, (n_, b) in enumerate(P["motif"]):
        last = j == len(P["motif"]) - 1
        d = (T["end"] + 2.6 - (t0)) if last else b * beat * 1.05
        g = 0.55 if P["lead"] in ("brass", "synth") else 0.42
        tr.add(lead(P["lead"], note(n_), d), t0, g * (1.15 if last else 1), pan=0.1, send=0.4)
        if P["lead"] == "brass":
            tr.add(lead("brass", note(n_) - 12, d), t0, g * 0.6, pan=-0.2, send=0.4)
        t0 += b * beat
    final_len = T["end"] + 3.2 - T["title"]
    T_ = T["title"]
    tr.add(boom(3.5, 0.8), T_, 0.45 if not big else 0.75, 0, 0.3)
    tr.add(crash(4.0, 3.0), T_, 0.3, -0.25, 0.4)
    tr.chord(lambda m: ensemble(strings, m, final_len, voices=6, a=0.05, r=1.6), P["final"], T_, 0.75, 0.9, 0.4)
    if P["lead"] in ("brass",) or big:
        tr.chord(lambda m: ensemble(brass, m, final_len * 0.75, voices=3, cents=6, vel=0.85), [m - 12 for m in P["final"][:3]], T_, 0.7, 0.6, 0.35)
    if fam == "PLATINUM":
        tr.chord(lambda m: supersaw(m, final_len, cut=3600, a=0.05, r=1.5), P["final"], T_, 0.4, 0.9, 0.45)
        tr.add(kick(0.6), T_, 0.8, 0, 0.1)
    else:
        tr.chord(lambda m: choir(m, final_len, vowel="ah", a=0.12, r=1.6), P["final"], T_, 0.42 if not big else 0.6, 0.8, 0.55)
    tr.add(timpani(P["drone"][0] + 12, 3.0, 1.0) if fam != "PLATINUM" else kick(0.6), T_, 0.7, -0.15, 0.3)
    tr.add(ensemble(strings, P["drone"][0], final_len, voices=4, a=0.05, r=1.6, bright=0.6), T_, 0.35, -0.3, 0.3)
    # the XP line fills with a small rising chime
    for i, m in enumerate(P["spark"][:4]):
        tr.add(celesta(m, 1.4, 1.2), T["xp"] + 0.07 * i, 0.07, pan=0.3 - 0.2 * i, send=0.6)

    return tr.render(rt=P["rt"], mix=P["mix"])


def write(path, y):
    from scipy.io import wavfile
    wavfile.write(path, SR, (np.clip(y.T, -1, 1) * 32767).astype(np.int16))


if __name__ == "__main__":
    out = sys.argv[1]
    fams = sys.argv[2:] or list(FAMILIES)
    os.makedirs(out, exist_ok=True)
    for fam in fams:
        for mode in ("promo", "replay"):
            y = compose(fam, mode)
            wav = os.path.join(out, f"{fam}-{mode}.wav")
            write(wav, y)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "libmp3lame", "-b:a", "160k", os.path.join(out, f"{fam}-{mode}.mp3")], check=True)
            print(fam, mode, f"{len(y[0]) / SR:.1f}s", f"peak {20 * np.log10(np.max(np.abs(y))):.1f} dBFS")
