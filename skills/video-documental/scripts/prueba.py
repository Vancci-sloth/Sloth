"""
Prueba de punta a punta, sin grabación: 7 segundos con los dispositivos de verdad, renderizados con Remotion.

    python -I -B -X utf8 <skill>/scripts/prueba.py [carpeta] [--vertical]   (por defecto ./_prueba-documental[-vertical])

Dibuja sus propias imágenes en código (nada bajado, nada de nadie), las trata con ev1_treat.py y arma la edición con
el tile-flash reveal, pop + shatter, un strobe de formas iguales, la palabra roja de choque, el muro 3D, un datamosh y
el título cromado, con subtítulos en español (acentos y signos de apertura: las fuentes los tienen que traer). Deja
out/prueba.mp4 (con sus clics) y out/prueba-hoja.jpg, un cuadro por momento: míralo. Las imágenes son abstractas a
propósito; en un video de verdad cada una es material real encontrado para su frase.

La carpeta se queda (con su node_modules) para la siguiente vez; si ya existe, solo se rehace la edición.
"""
import os, subprocess, sys
from pathlib import Path

VERTICAL = '--vertical' in sys.argv          # antes de importar los dispositivos: el formato se lee al importarlos
if VERTICAL:
    os.environ['EV1_FORMATO'] = 'vertical'
    sys.argv.remove('--vertical')

import numpy as np, cv2

SK = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SK / 'components')); sys.path.insert(0, str(SK / 'scripts'))
from ev1_more import *          # noqa
import ev1_treat as T
from nuevo import crear
from sonido import mezclar

rng = np.random.default_rng(11)


def city(w=2112, h=1188):
    """a skyline at dusk: gradient sky, blocks with lit windows"""
    y = np.linspace(0, 1, h)[:, None, None]
    im = (np.array([90, 60, 40]) * (1 - y) + np.array([40, 110, 200]) * y) * np.ones((h, w, 3))
    x = 0
    while x < w:
        bw = int(rng.integers(90, 260)); bh = int(rng.integers(300, 900))
        im[h - bh:, x:x + bw] = rng.integers(15, 45)
        for wy in range(h - bh + 30, h - 20, 46):
            for wx in range(x + 16, x + bw - 20, 34):
                if rng.random() < 0.45:
                    im[wy:wy + 20, wx:wx + 14] = (120, 210, 250)
        x += bw + int(rng.integers(6, 30))
    return np.clip(im, 0, 255).astype(np.uint8)


def card(w=900, h=620, seed=0):
    """a page: a header bar, a headline block, text lines"""
    r = np.random.default_rng(seed)
    im = np.full((h, w, 3), 244, np.uint8)
    im[:70] = (40, 40, 40)
    cv2.rectangle(im, (50, 120), (w - int(r.integers(120, 300)), 190), (30, 30, 30), -1)
    for k in range(7):
        y = 240 + k * 50
        cv2.rectangle(im, (50, y), (w - int(r.integers(60, 260)), y + 18), (150, 150, 150), -1)
    return im


def circle(seed):
    r = np.random.default_rng(seed)
    im = np.full((1080, 1920, 3), int(r.integers(10, 40)), np.uint8)
    cv2.circle(im, (960 + int(r.integers(-80, 80)), 540 + int(r.integers(-40, 40))), int(r.integers(280, 400)),
               tuple(int(v) for v in r.integers(120, 255, 3)), -1)
    return im


def main():
    destino = Path(sys.argv[1] if len(sys.argv) > 1 else '_prueba-documental' + ('-vertical' if VERTICAL else '')).resolve()
    if not (destino / 'node_modules').exists():
        crear(destino, VERTICAL)
    os.chdir(destino)
    (destino / 'public' / 'assets' / 'img').mkdir(parents=True, exist_ok=True)
    I = lambda n: f'assets/img/{n}.jpg'           # en la edición, relativas a public/
    P = lambda n: f'public/assets/img/{n}.jpg'    # en disco
    T.treat(city(), P('city'), 'teal', size=(round(W * 1.1), round(H * 1.1)), ht=0.3, vig=0.7)
    T.treat(city(), P('city_deep'), 'deep', size=(W, H), vig=0.6)
    for k in range(3):
        cv2.imwrite(P(f'card{k}'), card(seed=k))
    for k in range(6):
        T.treat(circle(k), P(f'circ{k}'), ['mono', 'warm', 'teal'][k % 3], size=(W, H))
    for k in range(6):
        T.treat(card(1600, 1000, seed=10 + k), P(f'wall{k}'), 'natural', size=(1280, 794))
    g = T.treat(city(), None, 'warm', size=(W, H))
    for k, fimg in enumerate(T.glitch_frames(g, 4)):
        cv2.imwrite(P(f'gl{k}'), fimg)

    c = Comp(7.0)
    # 0.0 tile-flash reveal from black onto the skyline, then it holds and pushes
    tend = tile_reveal(c, 0.0, I('city'), z=2, seed=3)
    c.clip(0, tend, '<div class="ev1-layer ev1-black"></div>', z=1)
    still(c, tend, 1.4, I('city'), z=1)
    finish(c, 0, 1.4)
    captions(c, [([('Esto', 0.10), ('es', 0.30), ('el', 0.50), ('documental.', 0.82)], 1.4)])
    c.escena('Apertura: tile reveal', 0, 1.4)
    # 1.4 three cards pop one per word, pull out, shatter into white blocks
    pos = ([(520, 520, 620), (990, 580, 640), (1440, 510, 600)] if not VERTICAL else
           [(430, 640, 700), (640, 980, 720), (450, 1320, 680)])
    pop_shatter(c, 1.4, 2.6, [(I(f'card{k}'), x, y, w, r, t) for k, ((x, y, w), r, t) in
                              enumerate(zip(pos, (-4, 2, -3), (1.47, 1.70, 1.93)))], z=1)
    captions(c, [([('¿Quién', 1.47), ('decidió', 1.70), ('esto?', 1.93)], 2.6, 'serif')])
    c.escena('Pop + shatter', 1.4, 2.6)
    # 2.6 a shape-matched strobe: every image a circle, 3 frames each, a click each
    strobe(c, 2.6, 3.4, [I(f'circ{k}') for k in range(6)], z=1)
    c.escena('Strobe', 2.6, 3.4)
    # 3.4 negative flash into the crushed plate, the red shock word cuts on hard
    s = still(c, 3.4, 4.4, I('city_deep'), z=1, push=1.04)
    neg_flash(c, 3.4, [s[1]])
    keyword(c, 3.47, 4.4, 'NADIE', z=10, kind='shock', sound='hit')
    finish(c, 3.4, 4.4)
    c.escena('Palabra de choque', 3.4, 4.4)
    # 4.4 the 3D wall the camera sweeps across
    wall3d(c, 4.4, 5.6, [I(f'wall{k}') for k in range(6)], z=1)
    captions(c, [([('en', 4.5), ('cada', 4.62), ('página.', 4.76)], 5.6)])
    c.escena('Muro 3D', 4.4, 5.6)
    # 5.6 a 4-frame datamosh, a white frame, then the chrome title on paper
    t = frames(c, 5.6, [I(f'gl{k}') for k in range(4)], z=1)
    white_flash(c, t)
    c.clip(t + 1 / 30, 7.0, '<div class="ev1-layer ev1-paper"><div class="ev1-vignette"></div></div>', z=1)
    keyword(c, t + 1 / 30, 7.0, 'Año Ñandú', z=10, kind='title', sound='swish')
    c.escena('Datamosh y título', 5.6, 7.0)

    c.write_cues('sfx-cues.txt')
    k = mezclar(None, 'sfx-cues.txt', 'public/sonido.wav', c.dur)
    c.write('src/edicion.json', audio='sonido.wav', title='Prueba documental')
    print(f'prueba: edición con {len(c.els)} capas, {len(c.vids)} videos y {k} sonidos')

    from espacio import limpiar_temporales  # de video-base, que nuevo.py ya puso en sys.path
    limpiar_temporales()
    r = subprocess.run('npx --no-install remotion render src/index.ts Documental out/prueba.mp4 --codec=h264 --crf=18 '
                       '--pixel-format=yuv420p --color-space=bt709 --log=error', shell=True)
    if r.returncode or not Path('out/prueba.mp4').exists():
        sys.exit('prueba: el render falló')
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', 'out/prueba.mp4', '-vf',
                    "select='eq(n\\,8)+eq(n\\,50)+eq(n\\,62)+eq(n\\,90)+eq(n\\,115)+eq(n\\,150)+eq(n\\,169)+eq(n\\,200)',scale=480:-2,tile=4x2",
                    '-frames:v', '1', 'out/prueba-hoja.jpg'], check=True)
    print(f'prueba: {destino / "out" / "prueba.mp4"}  hoja: {destino / "out" / "prueba-hoja.jpg"}')


if __name__ == '__main__':
    main()
