#!/usr/bin/env python3
"""bed-mix.py — the voice plus a music bed that CUTS rather than ducks (reference/edl/SOUND.md).

    python -I -B -X utf8 <skill>/scripts/bed-mix.py --voice public/assets/media/vo.wav --song public/assets/music/bed.mp3 \
        --song-at 1.886 --dur 46.4 --under 5.5 \
        --ramp 12.88,13.57,-8 --ramp 23.04,23.96,-70,0.012 --ramp 40.567,41.694,-70,0.012 \
        --out work/premix.wav

--song-at S   the song time that plays at video time 0 (line the song's drop up with a word:
              S = drop_time_in_song - word_onset)
--under LU    the bed sits this many LU under the voice (refs 0.8-3 dB; 5.5 keeps every word clear
              on a dense bed. Re-transcribe the final to check nothing got masked.)
--ramp a,b,dB[,fade]   a gain change between video times a and b with a `fade`-second ramp each
              side (default 0.015). -70 = the bed CUTS OUT (the punchline plays dry, then the bed
              slams back on the next line). Repeatable; ramps multiply.
--voice-end T measure the voice's loudness up to T only (skip a silent tail).

Writes the premix (voice + bed, 48 kHz float) and, next to it, <out>_bed.wav (the bed alone, for
a waveform beat). The song is never looped or stretched: pick a start so it covers --dur.
"""
import argparse, os, re, subprocess, tempfile
import numpy as np
import soundfile as sf

SR = 48000


def lufs(x):
    fd, p = tempfile.mkstemp(suffix='.wav'); os.close(fd)
    try:
        sf.write(p, x, SR)
        o = subprocess.run(['ffmpeg', '-nostdin', '-i', p, '-af', 'loudnorm=print_format=summary', '-f', 'null', '-'],
                           capture_output=True, text=True).stderr
    finally:
        os.remove(p)
    return float(re.search(r'Input Integrated:\s+(-?[\d.]+)', o).group(1))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--voice', required=True)
    ap.add_argument('--song', required=True)
    ap.add_argument('--song-at', type=float, default=0.0)
    ap.add_argument('--dur', type=float, required=True)
    ap.add_argument('--under', type=float, default=5.5)
    ap.add_argument('--ramp', action='append', default=[])
    ap.add_argument('--fade-in', type=float, default=0.02)
    ap.add_argument('--ring-out', type=float, default=0.9)
    ap.add_argument('--voice-end', type=float, default=None)
    ap.add_argument('--out', default='work/premix.wav')
    a = ap.parse_args()

    raw = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-ss', f'{max(0.0, a.song_at):.4f}', '-t', f'{a.dur + 0.2}',
                          '-i', a.song, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    bed = np.frombuffer(raw, np.float32).reshape(-1, 2).copy()
    n = int(round(a.dur * SR))
    if a.song_at < 0:                                  # the song starts after video time 0
        bed = np.pad(bed, ((int(-a.song_at * SR), 0), (0, 0)))
    if len(bed) < n:
        print(f'bed-mix: note: the song runs out {(n - len(bed)) / SR:.2f}s before --dur (silence after)')
    bed = np.pad(bed, ((0, max(0, n - len(bed))), (0, 0)))[:n]

    vo, sr = sf.read(a.voice, dtype='float32', always_2d=True)
    if sr != SR:
        raise SystemExit(f'bed-mix: {a.voice} is {sr} Hz; make it 48 kHz (nuevo.py does)')
    if vo.shape[1] == 1:
        vo = np.repeat(vo, 2, axis=1)
    vo = np.pad(vo[:, :2], ((0, max(0, n - len(vo))), (0, 0)))[:n]

    t = np.arange(n) / SR
    L_vo = lufs(vo[:int((a.voice_end or a.dur) * SR)])
    L_bed = lufs(bed)
    g = 10 ** ((L_vo - a.under - L_bed) / 20)
    env = np.ones(n)
    for r in a.ramp:
        v = [float(x) for x in r.split(',')]
        s, e, db = v[:3]
        fade = v[3] if len(v) > 3 else 0.015
        m = np.clip(np.minimum((t - s) / fade + 1, (e - t) / fade + 1), 0, 1)
        env *= 10 ** (db * m / 20)
    env *= np.clip(t / max(a.fade_in, 1e-3), 0, 1)
    env *= np.clip((a.dur - t) / max(a.ring_out, 1e-3), 0, 1)
    bed_out = bed * g * env[:, None]
    mix = vo + bed_out
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    sf.write(a.out, mix, SR, subtype='FLOAT')
    sf.write(os.path.splitext(a.out)[0] + '_bed.wav', bed_out, SR, subtype='FLOAT')
    print(f'bed-mix: voice {L_vo:.1f} LUFS, bed {L_bed:.1f} -> {L_vo - a.under:.1f} (gain {g:.2f}), '
          f'{len(a.ramp)} ramps, mix {lufs(mix):.1f} LUFS -> {a.out}')


if __name__ == '__main__':
    main()
