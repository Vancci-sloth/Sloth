"""pass2_prep.py — after pass 1 renders: (1) the opening 1.4s of pass 1 as a clean seekable clip for the player
window, (2) one frame per shot (shot middle) for the timeline / filmstrip / picture strobe, (3) the real render
line for the session log. Run from the video folder: python work/pass2_prep.py out/pass1.mp4 out/pass1.log"""
import json, os, re, subprocess, sys
p1, logf = sys.argv[1], sys.argv[2]
FPS = 30
os.makedirs('assets/p1', exist_ok=True)
subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', '0', '-t', '1.45', '-i', p1, '-an', '-c:v', 'libx264', '-crf', '16',
                '-g', '30', '-keyint_min', '30', '-pix_fmt', 'yuv420p', 'assets/media/pass1_open.mp4'], check=True)
shots = json.load(open('work/shots.json'))
for a, b, name in shots:
    f = int(round((a + b) / 2 * FPS))
    out = f'assets/p1/{f:05d}.jpg'
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', f'{f / FPS:.4f}', '-i', p1, '-vframes', '1', '-vf', 'scale=640:-2', '-q:v', '3', out], check=True)
n = int(subprocess.run(['ffprobe', '-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', p1],
                       capture_output=True, text=True).stdout.strip())
size = os.path.getsize(p1) / 1e6
log = json.load(open('work/session_log_head.json'))
log.append('  └ out/pass1.mp4 · ' + next(l.strip() for l in open(logf, errors='ignore') if 'rendered in' in l))
json.dump(log, open('work/session_log.json', 'w'), indent=0)
print('pass1 frames', n, 'thumbs', len(shots))
