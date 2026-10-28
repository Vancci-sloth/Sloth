#!/usr/bin/env python
"""ev1_treat.py — the Editor V1 image treatments. Every sourced still goes through here.

The references never show a photo as it came: 58-68% of held shots carry a treatment
(reference/look.md §1). These are those treatments, measured, as functions and a CLI.

    python ev1_treat.py <in> <out> --look teal --size 2112x1188 [--focus 0.5,0.4]
                        [--halftone 0.35] [--vignette 0.7] [--recolor 70-170:350]
                        [--glitch 4]   (writes out_0.jpg … out_3.jpg instead)
                        [--led 0.9]    (dot-matrix version)

looks:   natural · mono · teal · warm · invert · deep (crushed, for type on top)
recolor: rotate only the hues inside FROM-TO (degrees) to TARGET; keeps value and
         saturation, so a green aurora becomes a red one without touching the city
         lights or clouds. "Change the colours" in the brief means this.

Everything is seeded: the same call gives the same pixels (renders must be deterministic).
Run with:  python -I -B -X utf8  (numpy + cv2 + PIL: los pide la card en Sloth, en Requisitos)
"""
import argparse, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # formato.py (con -I la carpeta del script no está en sys.path)
import numpy as np, cv2


def load(path):
    im = cv2.imread(path, cv2.IMREAD_COLOR)
    if im is None:
        raise SystemExit(f'cannot read {path}')
    return im


def cover(im, W, H, focus=(0.5, 0.5)):
    """object-fit: cover, cropped around a focus point (fractions of the source)."""
    h, w = im.shape[:2]; s = max(W / w, H / h)
    im = cv2.resize(im, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    h, w = im.shape[:2]
    x = int(np.clip(focus[0] * w - W / 2, 0, w - W)); y = int(np.clip(focus[1] * h - H / 2, 0, h - H))
    return im[y:y + H, x:x + W]


def _lum(im):
    return cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255


def scurve(x, k):
    """contrast S-curve around 0.5; k=0 is identity."""
    return np.clip(0.5 + (x - 0.5) * (1 + k) - k * 4 * (x - 0.5) ** 3, 0, 1)


def look(im, name):
    f = im.astype(np.float32) / 255
    L = _lum(im)
    if name == 'natural':
        out = scurve(f, 0.12)
    elif name == 'mono':      # T2: 18% of held runtime, neutral grey, hard contrast
        g = scurve(L, 0.45); out = np.dstack([g, g, g])
    elif name == 'teal':      # T1: 22% — hue mass piles in 180-220deg; shadows teal, highlights warm
        g = scurve(L, 0.25)[..., None]
        base = scurve(f, 0.2) * 0.6 + g * 0.4                      # 40% toward grey
        teal = np.array([0.50, 0.40, 0.08])                        # BGR, pulled into the shadows
        cream = np.array([0.84, 0.95, 1.04])                       # BGR multiplier on the highlights
        ws = (1 - g) ** 1.4 * 0.55
        out = base * (1 - ws) + teal * ws * (0.4 + g)
        out = out * (1 + (cream - 1) * g ** 1.5)
    elif name == 'warm':      # T1/T2: amber/sepia drones, burning ships
        g = scurve(L, 0.3)
        lo = np.array([0.05, 0.08, 0.14]); mid = np.array([0.18, 0.45, 0.78]); hi = np.array([0.80, 0.93, 1.0])   # BGR
        t = g[..., None]
        out = np.where(t < 0.5, lo + (mid - lo) * (t / 0.5), mid + (hi - mid) * ((t - 0.5) / 0.5))
    elif name == 'invert':    # the 1-2 frame negative flash; inverted warm reads cyan
        out = 1 - scurve(f, 0.1)
    elif name == 'deep':      # crushed plate for big type: blacks down, mids pulled
        out = scurve(f, 0.3) * 0.72
    else:
        raise SystemExit(f'unknown look {name}')
    return (np.clip(out, 0, 1) * 255).astype(np.uint8)


def recolor(im, lo, hi, target, sat_gain=1.15):
    """rotate hues in [lo,hi] degrees to target degrees, feathered 12deg at the edges."""
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV_FULL).astype(np.float32)
    h = hsv[..., 0] * 360 / 256
    inside = ((h - lo) % 360) <= ((hi - lo) % 360)
    d_lo = np.minimum((h - lo) % 360, (lo - h) % 360); d_hi = np.minimum((h - hi) % 360, (hi - h) % 360)
    edge = np.clip(np.minimum(d_lo, d_hi) / 12, 0, 1)
    w = np.where(inside, edge, 0) * np.clip(hsv[..., 1] / 60, 0, 1)
    # Recolour fully, then blend in RGB by the weight. Rotating the hue BY the weight
    # walks every feathered pixel through the colour wheel and paints rainbow fringes.
    mid = (lo + ((hi - lo) % 360) / 2) % 360
    rel = ((h - mid + 180) % 360) - 180                  # position inside the band, keeps its texture
    full = hsv.copy()
    full[..., 0] = ((target + rel * 0.35) % 360) * 256 / 360
    full[..., 1] = np.clip(hsv[..., 1] * sat_gain, 0, 255)
    rec = cv2.cvtColor(full.astype(np.uint8), cv2.COLOR_HSV2BGR_FULL).astype(np.float32)
    w = cv2.GaussianBlur(w.astype(np.float32), (0, 0), 1.5)[..., None]
    return np.clip(im.astype(np.float32) * (1 - w) + rec * w, 0, 255).astype(np.uint8)


def halftone(im, amount=0.35, pitch=None):
    """T1's dot screen: dark dots in the shadows, pitch ~0.75% of height (8px at 1080)."""
    H, W = im.shape[:2]; p = pitch or max(5, round(H * 0.0075))
    L = cv2.GaussianBlur(_lum(im), (0, 0), p / 2)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # 45-degree screen
    u = ((xx + yy) / np.sqrt(2)) % p - p / 2; v = ((xx - yy) / np.sqrt(2)) % p - p / 2
    r = np.sqrt(u * u + v * v) / (p / 2)
    dot = (r < np.sqrt(np.clip(1 - L, 0, 1)) * 0.95).astype(np.float32)
    dot = cv2.GaussianBlur(dot, (0, 0), 0.6)
    f = im.astype(np.float32) / 255
    out = f * (1 - amount * dot[..., None] * (1 - L[..., None]) ** 0.5)
    return (np.clip(out, 0, 1) * 255).astype(np.uint8)


def vignette(im, edge_ratio=0.7):
    """edge/centre luma ratio, measured median 0.86 (T1) and 0.59 (T2)."""
    H, W = im.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / np.sqrt(2)
    m = 1 - (1 - edge_ratio) * np.clip((d - 0.25) / 0.75, 0, 1) ** 1.6 * 1.25
    return (np.clip(im.astype(np.float32) * m[..., None], 0, 255)).astype(np.uint8)


def glitch_frames(im, n=4, seed=3):
    """the 3-4 frame datamosh between shots (T1 f192-195): sliced, RGB-split, smeared."""
    rng = np.random.default_rng(seed); H, W = im.shape[:2]; outs = []
    for k in range(n):
        f = im.copy(); amt = (k + 1) / n
        for _ in range(int(6 + 14 * amt)):                       # displaced horizontal slices
            y = rng.integers(0, H - 8); h = int(rng.integers(6, max(8, int(H * 0.08 * amt) + 8)))
            dx = int(rng.normal(0, W * 0.06 * amt)); f[y:y + h] = np.roll(f[y:y + h], dx, axis=1)
        b, g, r = cv2.split(f); s = int(W * 0.012 * amt) + 2           # channel split
        f = cv2.merge([np.roll(b, -s, 1), g, np.roll(r, s, 1)])
        for _ in range(int(3 + 6 * amt)):                         # smeared blocks
            x = rng.integers(0, W - 40); y = rng.integers(0, H - 40); bw = int(rng.integers(40, W // 5)); bh = int(rng.integers(12, H // 9))
            col = f[y:y + 1, x:x + bw].copy(); f[y:y + bh, x:x + bw] = np.repeat(col, min(bh, H - y), axis=0)[:f[y:y + bh, x:x + bw].shape[0]]
        if k == n - 1:                                            # a white block on the last frame
            x = rng.integers(0, W // 2); y = rng.integers(0, H // 2); f[y:y + H // 6, x:x + W // 5] = 245
        outs.append(f)
    return outs


def led(im, amount=1.0, cells=110):
    """T2's #3 card: the picture rebuilt as lit dots on black."""
    H, W = im.shape[:2]; cw = W / cells; rows = int(H / cw)
    small = cv2.resize(im, (cells, rows), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    out = np.zeros((H, W, 3), np.float32)
    for j in range(rows):
        for i in range(cells):
            c = small[j, i]; L = float(c.mean())
            if L < 0.06: continue
            cv2.circle(out, (int((i + 0.5) * cw), int((j + 0.5) * cw)), max(1, int(cw * 0.42 * min(1, 0.4 + L))), (c * (0.6 + 0.6 * amount)).tolist(), -1, cv2.LINE_AA)
    out = out + cv2.GaussianBlur(out, (0, 0), cw * 0.8) * 0.6
    return (np.clip(out, 0, 1) * 255).astype(np.uint8)


def treat(src, out, lk='natural', size='video', focus=(0.5, 0.5), crop=None, ht=0.0, vig=None, rec=None, quality=92):
    """size: (w, h), 'video' = the video's frame (formato.txt), None = keep the source size."""
    if size == 'video':
        from formato import tamano
        size = tamano()
    im = load(src) if isinstance(src, str) else src
    if crop: x0, y0, x1, y1 = crop; im = im[y0:y1, x0:x1]
    if size: im = cover(im, size[0], size[1], focus)
    if rec: im = recolor(im, *rec)
    im = look(im, lk)
    if ht: im = halftone(im, ht)
    if vig: im = vignette(im, vig)
    if out:
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        cv2.imwrite(out, im, [cv2.IMWRITE_JPEG_QUALITY, quality] if out.endswith('.jpg') else [])
    return im


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--look', default='natural'); ap.add_argument('--size', default=None, help='WxH; default: the frame of the video')
    ap.add_argument('--focus', default='0.5,0.5'); ap.add_argument('--crop', default=None, help='x0,y0,x1,y1 in source px')
    ap.add_argument('--halftone', type=float, default=0); ap.add_argument('--vignette', type=float, default=None)
    ap.add_argument('--recolor', default=None, help='FROM-TO:TARGET degrees, e.g. 70-170:355')
    ap.add_argument('--glitch', type=int, default=0); ap.add_argument('--led', type=float, default=0)
    a = ap.parse_args()
    W, H = map(int, a.size.split('x')) if a.size else __import__('formato').tamano(); fx, fy = map(float, a.focus.split(','))
    rec = None
    if a.recolor:
        rng_, t = a.recolor.split(':'); lo, hi = map(float, rng_.split('-')); rec = (lo, hi, float(t))
    crop = tuple(map(int, a.crop.split(','))) if a.crop else None
    im = treat(a.src, None if (a.glitch or a.led) else a.out, a.look, (W, H), (fx, fy), crop, a.halftone, a.vignette, rec)
    if a.glitch:
        base, ext = os.path.splitext(a.out)
        for k, g in enumerate(glitch_frames(im, a.glitch)): cv2.imwrite(f'{base}_{k}{ext}', g)
    if a.led:
        cv2.imwrite(a.out, led(im, a.led))
    print('wrote', a.out)
