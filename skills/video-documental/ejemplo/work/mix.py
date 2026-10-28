"""mix.py — WORKED EXAMPLE: voice + the bed, the bed's own structure doing the cutting (SOUND.md: cut, don't duck).
The general tool is scripts/bed-mix.py (same maths, ramps on the command line); this is the per-video version.

Bed = the creator's own track (cleared for their videos). START is chosen so the song's drop (43.60 s in the song)
slams in on "And this is just day one" (REF-2: the bed comes back on the line AFTER the punchline). The bed sits
~5.5 LU under the voice (the refs run 0.8-3 dB; 5.5 kept every word clear on a dense bed), pulls down under the black
word card, CUTS OUT under "and that's it." and again under the punchline "Claude did." (both play dry), settles under
the key phrase after a slam, dips under the comment box, and rings out under the end card.
    python work/mix.py   ->  work/premix.wav (48 kHz float, DUR long)
"""
import json, os, re, subprocess
import numpy as np, soundfile as sf

SR = 48000; DUR = 46.4
SCR = os.environ.get('TMPDIR', '/tmp')
B = json.load(open('work/beats.json'))
SONG = 'assets/music/bed.mp3'
START = 43.60 - B['and4']                        # the drop slams in on "And this is just day one" (REF-2: back on the line after the punchline)
raw = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-ss', f'{START:.4f}', '-t', f'{DUR + 0.2}', '-i', SONG,
                      '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
bed = np.frombuffer(raw, np.float32).reshape(-1, 2).copy()[:int(DUR * SR)]
vo, sr = sf.read('assets/media/vo.wav', dtype='float32')
assert sr == SR
vo = np.pad(vo, ((0, max(0, len(bed) - len(vo))), (0, 0)))[:len(bed)]
t = np.arange(len(bed)) / SR


def lufs(x):
    p = os.path.join(SCR, '_mix_lufs.wav'); sf.write(p, x, SR)
    o = subprocess.run(['ffmpeg', '-nostdin', '-i', p, '-af', 'loudnorm=print_format=summary', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.search(r'Input Integrated:\s+(-?[\d.]+)', o).group(1))


L_vo = lufs(vo[:int(44.97 * SR)]); L_bed = lufs(bed)
TARGET = L_vo - 5.5
g = 10 ** ((TARGET - L_bed) / 20)
env = np.ones_like(t)


def ramp_db(a, b, db, fade=0.015):
    m = np.clip(np.minimum((t - a) / fade + 1, (b - t) / fade + 1), 0, 1)
    env[:] *= 10 ** (db * m / 20)


ramp_db(B['but1'] + 0.08, B['answers'] - 0.03, -8)                 # "But none of that" — black word card
ramp_db(B['and3'] - 0.01, B['im'] - 0.02, -70, 0.012)              # "and that's it." — the bed CUTS OUT, voice alone
ramp_db(B['you'], B['but2'] - 0.03, -4, 0.05)                       # the comment box
ramp_db(B['im'] + 0.30, B['fast'] - 0.05, -2.5, 0.2)                # settle under "talking about real editing" after the slam
ramp_db(B['drop'], B['and4'] - 0.02, -70, 0.012)                    # "Claude did." — the punchline, voice alone: the bed cuts out on the flash
env *= np.clip(t / 0.02, 0, 1)                                       # on the beat from frame 0 (REF-1/3)
env *= np.clip((DUR - t) / 0.9, 0, 1)                                # ring out over the end card
mix = vo + bed * g * env[:, None]
sf.write('work/premix.wav', mix, SR, subtype='FLOAT')
sf.write('work/bed_only.wav', bed * g * env[:, None], SR, subtype='FLOAT')
print('start %.3f  vo %.1f LUFS  bed %.1f -> %.1f (gain %.2f)  mix %.1f LUFS' % (START, L_vo, L_bed, TARGET, g, lufs(mix)))
