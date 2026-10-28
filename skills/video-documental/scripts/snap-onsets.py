#!/usr/bin/env python3
"""snap-onsets.py — put the first word after each real pause on the frame the voice starts.

    python -I -B -X utf8 <skill>/scripts/snap-onsets.py <video-dir> [--db -38] [--min 0.12]

(transcribir.py ya lo corre al acabar.)

The speech engine reports the first word after a pause 60-220 ms EARLY, so a caption or a cut
keyed to it lands before the sound. This finds the real pauses with ffmpeg silencedetect
(noise -38 dB, at least 0.12 s) and moves only the FIRST word after each pause to the pause's
end. Shorter dips are plosive closures inside a word ("O|pus", "Clau|de"): snapping to those
moves words onto the wrong syllable, so they are left alone.

Reads  public/assets/media/vo.wav and work/tx/words.json
Writes work/tx/words.json (snapped), work/tx/words_raw.json (the original, once),
       work/silences.txt ("start end" per pause, used by the silence-cut and drop beats).
"""
import argparse, json, os, re, shutil, subprocess


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video_dir')
    ap.add_argument('--db', type=float, default=-38)
    ap.add_argument('--min', type=float, default=0.12)
    a = ap.parse_args()
    vd = a.video_dir
    wav = os.path.join(vd, 'public', 'assets', 'media', 'vo.wav')
    wp = os.path.join(vd, 'work', 'tx', 'words.json')
    raw = os.path.join(vd, 'work', 'tx', 'words_raw.json')
    if not os.path.exists(raw):
        shutil.copy(wp, raw)
    words = json.load(open(raw, encoding='utf-8'))
    err = subprocess.run(['ffmpeg', '-nostdin', '-i', wav, '-af', f'silencedetect=noise={a.db}dB:d={a.min}', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r'silence_start: (-?[\d.]+)', err)]
    en = [float(x) for x in re.findall(r'silence_end: (-?[\d.]+)', err)]
    sil = list(zip(st, en))
    with open(os.path.join(vd, 'work', 'silences.txt'), 'w', encoding='utf-8', newline='\n') as f:
        for s, e in sil:
            f.write(f'{s:.3f} {e:.3f}\n')
    used, moved = set(), []
    for s, e in sil:
        # the first word that starts inside this pause (or just before it) is the early one
        for i, w in enumerate(words):
            if w['s'] >= s - 0.05 and i not in used:
                if w['s'] < e and e < w['e'] - 0.04 and (i + 1 == len(words) or e < words[i + 1]['s']):
                    moved.append((w['w'], w['s'], e))
                    w['s'] = round(e, 3)
                used.add(i)
                break
    for i in range(1, len(words)):
        assert words[i]['s'] >= words[i - 1]['s'], ('order broke at', words[i])
    with open(wp, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(words, f, ensure_ascii=False, indent=0)
    print(f'snap-onsets: {len(sil)} pauses, {len(moved)} words moved later')
    for w, s0, s1 in moved:
        print(f'  {w:<16} {s0:7.3f} -> {s1:7.3f}  (+{(s1 - s0) * 1000:.0f} ms)')


if __name__ == '__main__':
    main()
