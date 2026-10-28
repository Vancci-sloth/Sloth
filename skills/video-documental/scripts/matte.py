#!/usr/bin/env python3
"""matte.py — cut the speaker out of the RAW camera for the hero beat (the world changes behind
them, the big red word sits behind their head). Corre con el Python de Sloth, que trae PyTorch: si el Python con que
se lanza no lo tiene, se relanza solo con aquel, en el turno de la GPU (como la transcripción).

    python -I -B -X utf8 <skill>/scripts/matte.py --plate public/assets/media/cam_raw.mp4 --start 15.5 --dur 4.4 \
        --out public/assets/media/matte_a.webm

In the build the path is relative to public/: cutout_world(..., 'assets/media/matte_a.webm', 15.5).

Writes a VP9 video with an alpha channel (yuva420p), RGB premultiplied over black, taken from
the same raw plate the face beats use, so the cut-out matches the face shots exactly.
Frame 0 of the webm = plate time --start. In the comp: data-media-start = beat_start - start
(components/ev1_more.py cutout_world(matte_src=..., matte_first_s=start) does this for you).

Model: Robust Video Matting (mobilenetv3), loaded at run time from its public repo through
torch.hub (GPL-3.0, not shipped in this kit). Its recurrent state is why the edge does not
crawl frame to frame; two warm-up passes on the first frame kill the first-frame flicker.
--harden lifts the soft fringe (a mic or a chair edge reading as half-transparent).
"""
import argparse, subprocess, sys
import numpy as np

FPS = 30


def medida(plate):
    """(ancho, alto) de la cámara: el recorte sale del tamaño del video (1920x1080 o, en vertical, 1080x1920)."""
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                        '-of', 'csv=p=0', plate], capture_output=True, text=True, check=True)
    return tuple(int(v) for v in r.stdout.strip().split(',')[:2])


def relanzar():
    """El mismo comando con el Python de Sloth (video-base/scripts/sloth.py), en el turno de la GPU."""
    import os
    from pathlib import Path
    sys.path.insert(0, str(Path(os.environ.get('SLOTH_SKILLS') or Path.home() / '.claude' / 'skills') / 'video-base' / 'scripts'))
    from sloth import sloth, turno_gpu
    with turno_gpu():
        sys.exit(sloth(str(Path(__file__).resolve()), *sys.argv[1:]).returncode)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--plate', required=True)
    ap.add_argument('--start', type=float, required=True)
    ap.add_argument('--dur', type=float, required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--downsample', type=float, default=0.3, help='0.25 sharper hair (slower), 0.4 softer')
    ap.add_argument('--harden', type=float, default=0.04, help='alpha below this -> 0, rescaled; 0 = off')
    ap.add_argument('--device', default='auto', choices=['auto', 'cpu', 'mps', 'cuda'])
    a = ap.parse_args()

    try:
        import torch
    except ImportError:
        relanzar()
    dev = a.device
    if dev == 'auto':
        dev = 'cuda' if torch.cuda.is_available() else ('mps' if torch.backends.mps.is_available() else 'cpu')
    model = torch.hub.load('PeterL1n/RobustVideoMatting', 'mobilenetv3', trust_repo=True).eval().to(dev)

    W, H = medida(a.plate)
    n = int(round(a.dur * FPS))
    dec = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-ss', f'{a.start:.4f}', '-i', a.plate, '-frames:v', str(n),
                            '-vf', f'scale={W}:{H}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    enc = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}',
                            '-r', str(FPS), '-i', '-', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '28',
                            '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-auto-alt-ref', '0', '-g', '30', a.out],
                           stdin=subprocess.PIPE)
    rec = [None] * 4
    k = 0
    with torch.no_grad():
        while True:
            buf = dec.stdout.read(W * H * 3)
            if len(buf) < W * H * 3:
                break
            rgb = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
            x = torch.from_numpy(rgb).to(dev).permute(2, 0, 1)[None].float() / 255
            for _ in range(3 if k == 0 else 1):              # warm-up on frame 0
                _, pha, *rec = model(x, *rec, downsample_ratio=a.downsample)
            al = pha[0, 0].clamp(0, 1).cpu().numpy()
            if a.harden > 0:
                al = np.clip((al - a.harden) / (1 - 2 * a.harden), 0, 1)
            a8 = (al * 255 + 0.5).astype(np.uint8)
            pre = (rgb.astype(np.float32) * al[..., None] + 0.5).astype(np.uint8)
            enc.stdin.write(np.dstack([pre, a8]).tobytes())
            k += 1
            if k % 30 == 0:
                print(f'  {k}/{n} frames', file=sys.stderr)
    enc.stdin.close()
    enc.wait(); dec.wait()
    print(f'matte: {k} frames ({dev}) -> {a.out}  (frame 0 = plate {a.start:.3f}s)')


if __name__ == '__main__':
    main()
