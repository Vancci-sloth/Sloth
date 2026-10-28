#!/usr/bin/env python3
"""synth-sfx.py — the Editor V1 sound kit, synthesised in code. No samples, no recordings.

    python3 scripts/synth-sfx.py          ->  sfx/ev1kit/*.wav, sfx/ev1/*.wav, sfx/peaks.json

The device library (components/ev1_devices.py) cues 22 sounds by name (`ev1kit/click_3`,
`ev1kit/clicktrain_1`, ...). Their character, length, transient position and level were
MEASURED off the style's reference edits (reference/edl/SOUND.md); only those numbers live
here. Every waveform below is built from seeded noise and sine/square oscillators, so the
kit is royalty-free and a rerun writes bit-identical files.

What each number protects:
- length + transient (ms): the devices cue a sound at `picture time - pre-roll`, where the
  pre-roll is the file-start -> transient distance. Move a transient and every click lands
  off its frame.
- click spacing: tile trains are 1 click per frame at 24 fps (41.7 ms), pop and strobe
  trains 1 per 80 ms. The devices are frame-locked to them.
- 20 ms RMS peak (dBFS): the gains in ev1_devices.SND were solved against it, so a file
  that came out louder would sit too far forward in the mix.
Every file peaks at -1 dBFS, 48 kHz, 16-bit stereo, like the originals it stands in for.

Needs python3 + numpy only.
"""
import json, os, wave
import numpy as np

SR = 48000
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sfx'))
PEAK = 10 ** (-1 / 20)                      # -1 dBFS


# ------------------------------------------------------------------ helpers
def N(ms):
    return int(round(ms * SR / 1000))


def rng(seed):
    return np.random.default_rng(seed)


def eq(x, hp=None, lp=None, order=2, tilt=0.0, bell=None):
    """Zero-phase filter in the frequency domain. hp/lp in Hz (Butterworth-shaped
    magnitude), tilt in dB/octave around 1 kHz, bell=(Hz, gain dB, octaves wide)."""
    n = len(x)
    M = 1 << int(np.ceil(np.log2(n + SR)))  # padded: no wrap-around
    X = np.fft.rfft(x, M)
    f = np.fft.rfftfreq(M, 1 / SR)
    f[0] = 1e-3
    H = np.ones_like(f)
    if hp:
        H /= np.sqrt(1 + (hp / f) ** (2 * order))
    if lp:
        H /= np.sqrt(1 + (f / lp) ** (2 * order))
    if tilt:
        H *= 10 ** (tilt * np.log2(np.maximum(f, 20) / 1000) / 20)
    if bell:
        fc, g, w = bell
        H *= 10 ** (g * np.exp(-0.5 * (np.log2(f / fc) / (w / 2)) ** 2) / 20)
    return np.fft.irfft(X * H, M)[:n]


def env_db(n, pts):
    """Amplitude envelope from (ms, dB) breakpoints, linear in dB."""
    t = np.arange(n) / SR * 1000
    ms, db = zip(*pts)
    return 10 ** (np.interp(t, ms, db) / 20)


def osc(n, freq, shape='sine', phase=0.0):
    """freq: Hz, a number or a per-sample array (for sweeps and drops)."""
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    ph = 2 * np.pi * np.cumsum(f) / SR + phase
    if shape == 'sine':
        return np.sin(ph)
    if shape == 'square':
        return np.sign(np.sin(ph))
    if shape == 'saw':
        return 2 * ((ph / (2 * np.pi)) % 1.0) - 1
    raise ValueError(shape)


def glide(n, pts):
    """Frequency curve from (ms, Hz) breakpoints, linear in log-frequency."""
    t = np.arange(n) / SR * 1000
    ms, hz = zip(*pts)
    return np.exp(np.interp(t, ms, np.log(hz)))


def burst(n_total, at_ms, r, core=0.7, tail=6.0, tail_db=-20.0, attack=0.15):
    """One noise click: a fast core plus a quieter, slower tail, starting at at_ms."""
    x = np.zeros(n_total)
    a = N(at_ms)
    m = n_total - a
    if m <= 0:
        return x
    tt = np.arange(m) / SR * 1000
    e = np.exp(-tt / core) + 10 ** (tail_db / 20) * np.exp(-tt / tail)
    e *= np.minimum(1, tt / attack)
    x[a:] = r.standard_normal(m) * e
    return x


def fade(x, in_ms=0.0, out_ms=4.0):
    x = x.copy()
    shape = (-1,) + (1,) * (x.ndim - 1)                  # works on mono and (n, 2)
    if in_ms:
        k = N(in_ms); x[:k] *= np.linspace(0, 1, k).reshape(shape)
    if out_ms:
        k = N(out_ms); x[-k:] *= np.linspace(1, 0, k).reshape(shape)
    return x


def crush(x, steps):
    return np.round(x * steps) / steps


def rms20_peak_db(m):
    w = min(N(20), len(m))
    c = np.cumsum(np.r_[0, m.astype(float) ** 2])
    r = np.sqrt((c[w:] - c[:-w]) / w)
    return 20 * np.log10(r.max() + 1e-12)


def stereo(mono, side=None, width=0.0):
    """Mono -> (n, 2). `side` is an independent signal spread L/R at `width` (decorrelates)."""
    if side is None or not width:
        return np.stack([mono, mono], 1)
    return np.stack([mono + width * side, mono - width * side], 1)


def norm(st):
    return st / (np.abs(st).max() + 1e-12) * PEAK


def fit(build, target_db, lo, hi, iters=28):
    """Bisect one shape parameter p so that, peak-normalised to -1 dBFS, the file's
    20 ms RMS peak (on the L+R mean) lands on target_db. build(p) -> (n, 2)."""
    def level(p):
        st = norm(build(p))
        return rms20_peak_db(st.mean(1)), st
    l_lo, s_lo = level(lo)
    l_hi, s_hi = level(hi)
    up = l_hi > l_lo
    if (target_db - l_lo) * (target_db - l_hi) > 0:      # out of range: take the closer end
        return s_lo if abs(l_lo - target_db) < abs(l_hi - target_db) else s_hi
    for _ in range(iters):
        mid = (lo + hi) / 2
        l_mid, s_mid = level(mid)
        if (l_mid < target_db) == up:
            lo = mid
        else:
            hi = mid
    return level((lo + hi) / 2)[1]


def sat(x, drive):
    """tanh saturation; drive 0 = linear. Raises RMS against the peak (crest down)."""
    if drive <= 1e-6:
        return x
    return np.tanh(drive * x / (np.abs(x).max() + 1e-12))


def pin(st, at_ms, margin_db, band, seed=999):
    """Put the file's absolute peak at at_ms: add a short accent there, filtered to the
    sound's own band, sign-matched and sized margin_db above everything else."""
    m = st.mean(1)
    a, w = N(at_ms), N(2.5)
    lo, hi = max(0, a - w), min(len(m), a + w)
    i = lo + int(np.argmax(np.abs(m[lo:hi])))
    rest = np.abs(np.r_[m[:lo], m[hi:]]).max()
    need = rest * 10 ** (margin_db / 20) - abs(m[i])
    if need <= 0:
        return st
    acc = eq(burst(len(m), 2.0, rng(seed), core=0.8, tail=3.0, tail_db=-14), hp=band[0], lp=band[1])
    j = int(np.argmax(np.abs(acc)))
    acc = np.roll(acc, i - j) / acc[j] * need * np.sign(m[i] or 1.0)
    return st + acc[:, None]


def shaped(body, at_ms, band):
    """One crest knob for fit(): p < 0 saturates the body (RMS up against the peak),
    p >= 0 raises the pinned peak p dB further above it (RMS down)."""
    def build(p):
        st = body()
        st = sat(st, -p) if p < 0 else st
        return pin(st, at_ms, 0.3 + max(p, 0.0), band)
    return build


def write(path, st):
    st = np.clip(st, -1, 1)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((st * 32767).round().astype('<i2').tobytes())


# ------------------------------------------------------------------ clicks
# Measured: 70 ms files, transient at 4 ms, 97-100% of the energy above 3 kHz
# (centroid 11-13 kHz; click_3 is darker, ~5 kHz), 20 ms RMS peak about 19-20 dB under the peak.
def click_one(seed, tilt, hp, extra=(), tail_db=-20, floor_db=-60, bell=None, floor_band=(3000, 16000)):
    def build(core):
        r = rng(seed)
        n = N(70)
        x = burst(n, 3.6, r, core=core, tail=6.0, tail_db=tail_db)
        for at, db in extra:                          # the quieter second clicks some files carry
            x += 10 ** (db / 20) * burst(n, at, r, core=core, tail=6.0, tail_db=tail_db)
        x = eq(x, hp=hp, order=2, tilt=tilt, bell=bell)
        fl = eq(r.standard_normal(n), hp=floor_band[0], lp=floor_band[1])
        x += 10 ** (floor_db / 20) * np.abs(x).max() * fl / (np.abs(fl).max() + 1e-12)
        return pin(stereo(fade(x, 0, 3)), 4.0, 1.0, (hp, 16000))
    return build


def train(seed, length_ms, clicks, peak_at, tilt=-2.0, hp=3500, extras=(), bed=None, dark=()):
    """clicks: [(ms, dB rel. loudest)], the measured onsets of the reference train.
    peak_at: the click that is the file's absolute peak in the reference.
    bed: [(ms, dB)] breakpoints of a faint high noise between clicks.
    dark: indices of clicks with more mid in them (the pop and strobe trains mix two flavours)."""
    def build(core):
        r = rng(seed)
        n = N(length_ms)
        x = np.zeros(n)
        for i, (at, db) in enumerate(list(clicks) + list(extras)):
            b = burst(n, at - 0.4, r, core=core, tail=5.0, tail_db=-22)
            if i in dark:
                b = eq(b, hp=1500, order=2, tilt=-3, bell=(3500, 8, 1.4))
            else:
                b = eq(b, hp=hp, order=2, tilt=tilt)
            a = N(at)                                 # level = the click's own 1 ms RMS, as measured
            seg = b[max(0, a - N(2)):a + N(4)] ** 2
            b /= np.sqrt(np.convolve(seg, np.ones(N(1)) / N(1), 'valid').max()) + 1e-12
            x += 10 ** (db / 20) * b
        if bed:
            nz = eq(r.standard_normal(n), hp=2500, lp=14000)
            x += np.abs(x).max() * nz / np.abs(nz).max() * env_db(n, bed)
        return pin(stereo(fade(x, 0, 4)), peak_at, 0.6, (hp, 16000))
    return build


# ------------------------------------------------------------------ the kit
def kit():
    S = {}
    SUB, LOWMID, MID = (25, 400), (40, 1200), (300, 6000)          # pin() accent bands

    # --- single clicks ---------------------------------------------------------
    S['click_1'] = fit(click_one(11, tilt=-2.5, hp=3500, floor_db=-50), -19.5, 0.15, 3.0)
    S['click_2'] = fit(click_one(12, tilt=-1.8, hp=4500, extra=[(63.5, -27)], floor_db=-48), -20.4, 0.15, 3.0)
    S['click_3'] = fit(click_one(13, tilt=-4.0, hp=2600, bell=(3500, 10, 1.2), extra=[(40, -27), (58, -29)],
                                 floor_db=-34, floor_band=(2500, 6000)), -19.6, 0.15, 3.0)
    S['click_4'] = fit(click_one(14, tilt=-1.5, hp=4500, extra=[(45.6, -5), (61.6, -15)], floor_db=-44), -18.8, 0.15, 6.0)

    # --- click trains (onset ms, dB) ------------------------------------------
    # tile trains: 9 panes, 1 per frame at 24 fps (+ a faint pre-click at 2.5 ms on the first)
    ct1 = [(25, -2), (66.7, -13.5), (108.3, -15), (150, -16), (191.7, -5), (233.3, -1.5), (275, -1), (316.7, -1.5), (358.3, 0)]
    S['clicktrain_1'] = fit(train(21, 440, ct1, 358.3, extras=[(2.5, -12), (84, -25), (166, -24), (207, -23), (334, -25), (382, -12), (406, -25), (430, -28)],
                                  bed=[(0, -34), (440, -36)]), -20.5, 0.15, 3.0)
    ct2 = [(22, -1), (64, -1), (105, -1), (146, -1), (188, -1), (230, 0), (272, -1), (314, -2), (355, -2)]
    S['clicktrain_2'] = fit(train(22, 390, ct2, 230, tilt=-1.5, extras=[(80, -25), (120, -27), (254, -20), (333, -23), (371, -29)],
                                  bed=[(0, -40), (390, -44)]), -20.8, 0.15, 3.0)
    # pop train: 1 per 80 ms (2 frames at 25 fps); the reference skips the 443 ms pop too
    ct3 = [(43, -1), (123, -2), (203, -5), (283, -2), (363, 0), (484, -3), (563, -7), (646, -10), (723, -2), (803, -2)]
    S['clicktrain_3'] = fit(train(23, 850, ct3, 363, tilt=-1.5, extras=[(138, -28), (154, -28), (172, -24), (220, -30), (299, -30), (500, -29), (578, -24), (819, -26)],
                                  bed=[(0, -52), (850, -52)]), -19.9, 0.15, 3.0)
    # strobe burst: 13 clicks, 80 ms apart after the first, a noisy swell under the last third
    ct4 = [(14, -2), (134, -2), (214, -1), (294, -1), (374, -3), (454, -1), (534, -3), (614, -1), (694, -4), (774, 0), (854, -2), (934, -1), (1014, -3)]
    S['clicktrain_4'] = fit(train(24, 1120, ct4, 774, tilt=-3.5, hp=2500, extras=[(722, -19), (748, -19), (1030, -18), (1056, -25), (1084, -26)],
                                  dark=(5, 11), bed=[(0, -40), (650, -40), (700, -26), (1000, -26), (1040, -30), (1120, -34)]), -20.6, 0.15, 3.0)

    # --- swish: band noise around 1.5 kHz swelling into the cut at 270 ms -----------------
    def swish():
        r = rng(31); n = N(340)
        nz = eq(r.standard_normal(n), hp=700, lp=2000, order=2)
        x = nz * env_db(n, [(0, -46), (200, -46), (225, -36), (240, -22), (262, -10), (270, 0), (282, -4), (300, -8), (340, -12)])
        x += 0.4 * eq(burst(n, 269.5, r, core=1.0, tail=12, tail_db=-10), hp=900, lp=2600)
        air = eq(r.standard_normal(n), hp=3500, lp=9000) * env_db(n, [(0, -54), (200, -56), (270, -44), (340, -52)])
        return stereo(fade(x + air, 2, 6))
    S['swish_1'] = fit(shaped(swish, 270.5, MID), -11.6, -6, 8)

    # --- glitch: crushed hum, then stuttered low slices from 121 ms (loudest at 224) ------
    def glitch():
        r = rng(41); n = N(270)
        hum = crush(0.6 * osc(n, 160, 'square') + 0.5 * r.standard_normal(n), 5)
        x = eq(hum, hp=200, lp=2000) * env_db(n, [(0, -24), (115, -22), (121, -60), (270, -60)])
        for at, dur, f, db in [(121, 24, 152, -6), (147, 26, 76, -2), (174, 15, 152, -2), (190, 32, 76, -4),
                               (224, 26, 64, 0), (252, 16, 96, -4)]:
            a = N(at); m = min(N(dur), n - a)
            tt = np.arange(m)
            s = 0.7 * osc(m, f) + 0.35 * osc(m, 2 * f) + 0.2 * osc(m, f, 'square') + 0.05 * r.standard_normal(m)
            s = crush(s / np.abs(s).max(), 4) * 10 ** (db / 20)
            s *= np.minimum(1, tt / N(0.6)) * np.minimum(1, (m - tt) / N(1.5))
            x[a:a + m] += s
        return stereo(eq(x, lp=900, order=2))
    S['glitch_1'] = fit(shaped(glitch, 223.6, LOWMID), -5.9, -6, 8)

    # --- impact_1: a 200 -> 50 Hz drop at 116 ms, room tone before and after ---------------
    def impact1():
        r = rng(51); n = N(900)
        f = glide(n, [(0, 210), (116, 200), (150, 120), (220, 70), (400, 52), (900, 48)])
        body = osc(n, f) * env_db(n, [(0, -80), (100, -60), (112, -6), (117, 0), (140, -4), (170, -12), (220, -22), (280, -38), (400, -60), (900, -80)])
        body += 0.3 * osc(n, 2 * f) * env_db(n, [(0, -80), (110, -20), (117, 0), (150, -10), (250, -40), (900, -80)])
        thump = eq(burst(n, 115.5, r, core=1.2, tail=20, tail_db=-14), hp=80, lp=900) * 0.35
        pre = eq(r.standard_normal(n), hp=150, lp=900) * env_db(n, [(0, -40), (55, -40), (65, -32), (100, -32), (112, -40), (900, -40)])
        room = eq(r.standard_normal(n), hp=300, lp=2500) * env_db(n, [(0, -70), (260, -58), (300, -52), (900, -52)])
        return stereo(fade(body + thump + pre + room, 1, 20))
    S['impact_1'] = fit(shaped(impact1, 117.3, LOWMID), -5.7, -6, 8)

    # --- impact_2: a 170 Hz thump at 49 ms whose noise tail brightens as it dies, then a crisp
    # high tick at 300 ms -------------------------------------------------------------
    def impact2():
        r = rng(52); n = N(460)
        f = glide(n, [(0, 240), (49, 220), (80, 175), (200, 160), (460, 140)])
        body = osc(n, f) * env_db(n, [(0, -80), (38, -40), (46, -2), (50, 0), (70, -5), (100, -12), (140, -22), (200, -40), (460, -70)])
        mid = eq(r.standard_normal(n), hp=600, lp=3000) * env_db(n, [(0, -80), (44, -50), (50, -2), (90, -7), (150, -20), (220, -46), (460, -80)])
        hiss = eq(r.standard_normal(n), hp=3000, lp=8000) * env_db(n, [(0, -80), (48, -30), (60, -12), (120, -10), (190, -16), (260, -34), (360, -60), (460, -70)])
        tick = 10 ** (-14 / 20) * eq(burst(n, 299.5, r, core=0.8, tail=8, tail_db=-14), hp=6000, tilt=0.5)
        tail = osc(n, 141) * env_db(n, [(0, -90), (330, -70), (360, -42), (420, -40), (460, -44)])
        return stereo(fade(body + mid + hiss + tick + tail, 0, 6))
    S['impact_2'] = fit(shaped(impact2, 56.1, LOWMID), -8.4, -6, 8)

    # --- subboom: a 160 -> 41 Hz drop at 42 ms, then a held sub for the whole file -----------
    def subboom():
        r = rng(61); n = N(1220)
        f = glide(n, [(0, 160), (28, 158), (45, 90), (80, 52), (200, 46), (600, 42), (1220, 41)])
        e = env_db(n, [(0, -60), (20, -28), (30, -10), (40, 0), (55, -2), (90, -3.5), (200, -3.5), (800, -3.8), (1220, -4.8)])
        x = (osc(n, f) + 0.12 * osc(n, 3 * f) + 0.06 * osc(n, 4 * f)) * e
        x += eq(r.standard_normal(n), hp=120, lp=400) * env_db(n, [(0, -70), (40, -16), (120, -30), (1220, -34)])
        return stereo(fade(x, 0, 8))
    S['subboom_1'] = fit(shaped(subboom, 42.2, SUB), -6.0, -6, 8)

    # --- subtone_1: a 90 Hz breath that dips, then a 41 Hz tone swelling to the end ------------
    def subtone1():
        r = rng(62); n = N(800)
        hi = osc(n, glide(n, [(0, 62), (60, 90), (120, 94), (160, 60)])) * env_db(n, [(0, -11), (60, -12), (100, -12), (125, -22), (150, -40), (200, -80), (800, -80)])
        lo = osc(n, 41) * env_db(n, [(0, -70), (110, -30), (150, -22), (180, -10), (300, -7), (500, -5), (700, -3), (748, 0), (790, -1.5), (800, -6)])
        return stereo(fade(hi + lo + 0.002 * eq(r.standard_normal(n), hp=60, lp=250), 2, 6))
    S['subtone_1'] = fit(shaped(subtone1, 747.7, SUB), -3.4, -6, 8)

    # --- subtone_2: a pulsing low rumble (30-65 Hz) that rises into its last 30 ms -----------------
    def subtone2():
        r = rng(63); n = N(1044)
        f = 47 + 14 * np.sin(2 * np.pi * np.cumsum(np.full(n, 1.7)) / SR) + eq(r.standard_normal(n), lp=6) * 400
        f = np.clip(f, 29, 76)
        car = osc(n, f) + 0.25 * osc(n, 1.5 * f)
        puls = eq(np.repeat(r.uniform(0.35, 1.0, n // N(30) + 1), N(30))[:n], lp=40)
        e = env_db(n, [(0, -22), (200, -16), (500, -16), (800, -13), (850, -9), (950, -8), (1019, 0), (1030, -1), (1044, -4)])
        side = eq(r.standard_normal(n), lp=90) * e * 0.4
        return fade(stereo(car * puls * e, side, 0.6), 3, 3)
    S['subtone_2'] = fit(shaped(subtone2, 1019.3, SUB), -4.4, -6, 8)

    # --- riser_1: a low noise swell with a mid-noise flurry at 200-360 ms; it reaches the cut
    # at ~760 ms and peaks at 864 -----------------------------------------------------------
    def riser1():
        r = rng(71); n = N(980)
        e = env_db(n, [(0, -40), (200, -36), (420, -24), (690, -20), (720, -14), (760, -6), (840, -2), (864, 0), (930, -4), (980, -8)])
        lows = [eq(r.standard_normal(n), hp=30, lp=110, order=3) for _ in range(3)]
        lows = [l / np.abs(l).max() for l in lows]
        lm = eq(r.standard_normal(n), hp=120, lp=420)
        lm = lm / np.abs(lm).max() * 0.35
        tone = osc(n, glide(n, [(0, 55), (980, 62)])) * 0.4
        midn = eq(r.standard_normal(n), hp=900, lp=6000) * env_db(n, [(0, -70), (200, -60), (230, -30), (300, -27), (350, -30), (380, -70), (980, -80)])
        acc = eq(burst(n, 759.5, r, core=4, tail=40, tail_db=-8), hp=40, lp=250) * 0.3
        common = (0.6 * lows[0] + lm + tone + acc) * e + midn
        st = np.stack([common + 0.7 * lows[1] * e, common + 0.7 * lows[2] * e], 1)
        return fade(st, 5, 15)
    S['riser_1'] = fit(shaped(riser1, 864.2, SUB), -9.1, -6, 8)

    # --- riser_2: a 47 Hz swell from silence to 547 ms, then a long fall ------------------------
    def riser2():
        r = rng(72); n = N(1202)
        e = env_db(n, [(0, -66), (80, -60), (120, -46), (200, -34), (230, -28), (245, -16), (330, -12), (450, -7), (547, 0), (650, -2), (800, -6), (950, -14), (1100, -22), (1202, -28)])
        x = osc(n, glide(n, [(0, 50), (547, 47), (1202, 41)])) * e
        x += eq(r.standard_normal(n), hp=2500, lp=12000) * env_db(n, [(0, -66), (60, -54), (110, -54), (140, -80), (1202, -80)])
        return stereo(fade(x, 3, 10))
    S['riser_2'] = fit(shaped(riser2, 547.2, SUB), -4.0, -6, 8)

    # --- riser_3: a 105 Hz noisy drone fading out under a sub that rises to 958 ms ----------------
    def riser3():
        r = rng(73); n = N(1060)
        drone = (osc(n, 105) * 0.6 + eq(r.standard_normal(n), hp=200, lp=1500) * 0.5) * env_db(n, [(0, -28), (300, -25), (360, -28), (500, -50), (1060, -80)])
        sub = osc(n, glide(n, [(0, 70), (330, 62), (600, 52), (960, 46), (1060, 44)])) * env_db(n, [(0, -50), (330, -28), (480, -20), (620, -13), (700, -9), (844, -3), (958, 0), (1040, -2), (1060, -8)])
        sub += 0.15 * osc(n, 105) * env_db(n, [(0, -80), (600, -30), (958, -6), (1060, -14)])
        return stereo(fade(drone + sub, 3, 10))
    S['riser_3'] = fit(shaped(riser3, 958.7, SUB), -4.7, -6, 8)

    # --- sweepdown: a 250 Hz -> 28 Hz descending tone, loudest at 645 ms ---------------------------
    def sweep():
        r = rng(81); n = N(750)
        f = glide(n, [(0, 250), (150, 240), (300, 170), (450, 110), (600, 70), (650, 60), (750, 28)])
        car = 0.7 * osc(n, f) + 0.5 * eq(osc(n, f, 'saw'), lp=2500)
        e = env_db(n, [(0, -42), (100, -38), (150, -30), (175, -16), (300, -15), (450, -17), (560, -14), (600, -7), (645, 0), (700, -4), (750, -10)])
        side = eq(r.standard_normal(n), hp=60, lp=600) * e * 0.25
        hiss = eq(r.standard_normal(n), hp=900, lp=6000) * env_db(n, [(0, -50), (170, -34), (480, -34), (500, -26), (530, -36), (750, -46)])
        return fade(stereo(car * e + hiss, side, 1.0), 3, 8)
    S['sweepdown_1'] = fit(shaped(sweep, 645.3, LOWMID), -6.6, -6, 8)

    # --- explosion: a low roar with crackle, a thud at 960 ms ------------------------------------
    def explosion():
        r = rng(91); n = N(1150)
        e = env_db(n, [(0, -26), (190, -27), (215, -18), (245, -6), (400, -4), (570, -7), (650, -12), (750, -12), (800, -6), (900, -9), (950, -4), (1000, -6), (1150, -8)])
        roar = [eq(r.standard_normal(n), hp=25, lp=150, order=3) for _ in range(3)]
        roar = [x / np.abs(x).max() for x in roar]
        body = eq(r.standard_normal(n), hp=150, lp=500)
        body = body / np.abs(body).max() * 0.45
        crack = np.zeros(n)
        for at in r.uniform(200, 1150, 70):
            crack += r.uniform(0.2, 1.0) * burst(n, at, r, core=0.6, tail=4, tail_db=-12)
        crack = eq(crack, hp=500, lp=3500)
        crack = crack / np.abs(crack).max() * 0.35 * e
        crack += eq(r.standard_normal(n), hp=900, lp=6000) * env_db(n, [(0, -26), (40, -28), (80, -60), (1150, -60)])
        thud = osc(n, glide(n, [(0, 70), (955, 70), (1000, 45), (1150, 40)])) * env_db(n, [(0, -90), (950, -40), (958, -4), (975, -2), (1010, -10), (1150, -18)])
        common = (0.75 * roar[0] + body) * e + crack + thud
        st = np.stack([common + 0.6 * roar[1] * e, common + 0.6 * roar[2] * e], 1)
        return fade(st, 2, 10)
    S['explosion_1'] = fit(shaped(explosion, 960.0, LOWMID), -8.7, -6, 8)

    # --- outro_1: a sub sting at 147 ms that pulses (~14 Hz) as it falls away ---------------------
    def outro1():
        r = rng(101); n = N(1580)
        f = glide(n, [(0, 70), (80, 60), (150, 45), (400, 35), (760, 30), (800, 45), (900, 32), (1580, 24)])
        car = osc(n, f) + 0.3 * osc(n, 2 * f) + 0.15 * osc(n, 3 * f) + 0.15 * osc(n, 4 * f) + 0.2 * osc(n, 5 * f)
        trem = 1 - 0.55 * (0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(np.full(n, 14.0)) / SR))
        trem = np.where(np.arange(n) < N(160), 1.0, trem)
        e = env_db(n, [(0, -14), (70, -14), (82, -5), (147, 0), (170, -3), (300, -8), (750, -10), (770, -4), (820, -5), (900, -9), (1200, -16), (1400, -24), (1500, -30), (1560, -40), (1580, -60)])
        grit = eq(r.standard_normal(n), hp=130, lp=400) * e * 0.3
        return stereo(fade(car * trem * e + grit, 2, 15))
    S['outro_1'] = fit(shaped(outro1, 147.4, SUB), -4.2, -6, 8)

    # --- outro_2: hiss chatter, a low swell to 720 ms, more hiss, a closing low hit at 1228 ms -------
    def outro2():
        r = rng(102); n = N(1350)
        hiss = eq(r.standard_normal(n), hp=2500, lp=12000)
        chatter = np.zeros(n)
        for at in np.arange(12, 400, 21.0):
            chatter += r.uniform(0.3, 1.0) * burst(n, at + r.uniform(-3, 3), r, core=1.0, tail=6, tail_db=-10)
        chatter = eq(chatter, hp=2500, lp=12000)
        hi = (0.5 * hiss / np.abs(hiss).max() + 0.5 * chatter / np.abs(chatter).max()) * env_db(n, [(0, 0), (100, -4), (130, -10), (260, -12), (300, -6), (440, -8), (470, -50), (790, -50), (800, -16), (900, -18), (950, -40), (1040, -40), (1060, -18), (1180, -20), (1200, -50), (1350, -50)])
        lo_f = glide(n, [(0, 60), (440, 50), (700, 42), (1200, 40), (1228, 48), (1350, 38)])
        le = env_db(n, [(0, -70), (420, -50), (450, -18), (500, -13), (650, -12), (690, -6), (720, -3), (760, -14), (800, -30), (850, -50), (1200, -60), (1218, -16), (1228, 0), (1270, -6), (1350, -9)])
        lo = (osc(n, lo_f) + 0.25 * osc(n, 3 * lo_f) + 0.15 * osc(n, 5 * lo_f)) * le
        lo += eq(r.standard_normal(n), hp=130, lp=450) * le * 0.6
        thump = eq(burst(n, 1227.5, r, core=1.5, tail=25, tail_db=-12), hp=40, lp=400) * 0.25
        side = eq(r.standard_normal(n), hp=2500, lp=12000) * env_db(n, [(0, -24), (450, -30), (470, -80), (1350, -80)])
        return fade(stereo(hi + lo + thump, side, 0.5), 2, 6)
    S['outro_2'] = fit(shaped(outro2, 1229.3, SUB), -8.9, -6, 8)

    return S


# ------------------------------------------------------------------ ev1/tick|hit|glitch
# The library's three original synthesised sounds, ported unchanged (same seed, same order).
def ev1_basics():
    r = np.random.default_rng(7)

    def env(n, attack, decay):
        t = np.arange(n) / SR
        return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / decay)

    def peak89(x):
        x = np.asarray(x, dtype=np.float64)
        return x / (np.abs(x).max() + 1e-9) * 0.89

    out = {}
    n = int(0.018 * SR); t = np.arange(n) / SR
    tick = r.standard_normal(n) * env(n, 0.0003, 0.0025)
    tick += 0.6 * np.sin(2 * np.pi * 4200 * t) * env(n, 0.0002, 0.004)
    tick += 0.3 * np.sin(2 * np.pi * 7600 * t) * env(n, 0.0001, 0.002)
    out['tick'] = peak89(tick)

    n = int(0.7 * SR); t = np.arange(n) / SR
    f = 42 + 48 * np.exp(-t / 0.05)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.22)
    air = r.standard_normal(n) * env(n, 0.001, 0.05)
    air = np.convolve(air, np.ones(6) / 6, mode='same') * 0.35
    out['hit'] = peak89(body + air + 0.4 * np.r_[tick, np.zeros(n - len(tick))])

    parts = []
    for k in range(6):
        m = int(SR * (0.022 + 0.012 * r.random())); tt = np.arange(m) / SR
        sq = np.sign(np.sin(2 * np.pi * (300 + 1800 * r.random()) * tt))
        nz = r.standard_normal(m)
        s = (0.6 * sq + 0.5 * nz) * (0.5 + 0.5 * r.random())
        s = np.round(s * 6) / 6
        parts += [s, np.zeros(int(SR * 0.008 * r.random()))]
    g = np.concatenate(parts)
    out['glitch'] = peak89(g * env(len(g), 0.0005, 0.12))
    return {k: np.stack([v, v], 1) for k, v in out.items()}


def main():
    peaks = {}
    for group, sounds in (('ev1kit', kit()), ('ev1', ev1_basics())):
        for name, st in sounds.items():
            path = os.path.join(OUT, group, name + '.wav')
            write(path, st)
            m = st.mean(1)
            peaks[f'{group}/{name}'] = {'len_ms': round(len(m) / SR * 1000, 1),
                                        'peak_ms': round(int(np.argmax(np.abs(m))) / SR * 1000, 1),
                                        'rms20_peak_dbfs': round(rms20_peak_db(m), 2)}
            print(f'wrote sfx/{group}/{name}.wav  {peaks[f"{group}/{name}"]["len_ms"]:.0f} ms')
    with open(os.path.join(OUT, 'peaks.json'), 'w') as f:
        json.dump(peaks, f, indent=1)
    print('wrote sfx/peaks.json')


if __name__ == '__main__':
    main()
