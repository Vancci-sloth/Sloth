"""build.py — la edición documental de este video, sobre los tiempos de cada palabra de la toma.

Un bloque por línea de PLAN.md: un dispositivo de components/ev1_devices.py o ev1_more.py, con el material real que se
encontró para esa línea (work/assets.json, lo llena work/prep.py) y su `c.escena(...)`, que es la escena en el estudio
de Sloth. Los dispositivos escriben sus propios sonidos, así la hoja de efectos nunca se despega del corte.

    python -I -B -X utf8 build.py         -> src/edicion.json (Remotion), sfx-cues.txt, public/sonido.wav, work/shots.json

Cada vez que corre, el monitor de Sloth enseña la versión nueva en vivo. Para revisar:
    node <skill>/scripts/cuadros.mjs      (un cuadro por escena, al 90 %, en revision/hoja-*.png: míralos todos)
y para el final:
    FINAL=1 python -I -B -X utf8 build.py && python -I -B -X utf8 <skill>/scripts/terminar.py .

Las rutas de las imágenes y los clips son relativas a public/ ('assets/img/x.jpg' es public/assets/img/x.jpg).
Los momentos que enseñan el propio video (su línea de tiempo, su tira de cuadros) piden dos pasadas: PASS=1, render,
work/pass2_prep.py, PASS=2 (ver <skill>/ejemplo/). El ejemplo entero de 45 s es <skill>/ejemplo/build.py.
"""
import json, os, sys
from pathlib import Path

KIT = Path(os.environ.get('SLOTH_SKILLS') or Path.home() / '.claude' / 'skills') / 'video-documental'
sys.path.insert(0, str(KIT / 'components'))
sys.path.insert(0, str(KIT / 'scripts'))
from ev1_more import *          # noqa  (todos los dispositivos: ev1_devices + ev1_more)
from sonido import mezclar

PASS = int(os.environ.get('PASS', '1'))
FINAL = os.environ.get('FINAL') == '1'          # FINAL=1 no escribe mientras quede algún hueco

W_ = json.load(open('work/tx/words.json', encoding='utf-8'))
WORDS = [(w['w'], w['s']) for w in W_]
VO_END = W_[-1]['e']
DUR = fr(VO_END + 1.4)                           # ~1.4 s de cierre tras la última palabra


def norm(w): return w.strip('.,:;¿?¡!"').lower()


def find(word, after=0.0):
    """onset of the first `word` at or after `after` seconds"""
    for w, t in WORDS:
        if norm(w) == norm(word) and t >= after - 1e-6:
            return t
    raise KeyError(word)


def span(first, last, after=0.0):
    """[(word, onset)] from `first` to `last`: one caption group"""
    out, on = [], False
    for w, t in WORDS:
        if not on and norm(w) == norm(first) and t >= after - 1e-6:
            on = True
        if on:
            out.append((w, t))
            if norm(w) == norm(last):
                return out
    raise KeyError(first)


A = json.load(open('work/assets.json', encoding='utf-8')) if os.path.exists('work/assets.json') else {}
SIL = [tuple(map(float, l.split())) for l in open('work/silences.txt')] if os.path.exists('work/silences.txt') else []
c = Comp(DUR)
F1 = 1 / FPS
MISSING, PLACEHOLDERS, SHOTS = [], [], []


def has(*ks):
    ok = all(k in A and os.path.exists(os.path.join('public', A[k])) for k in ks)
    if not ok:
        MISSING.extend(k for k in ks if k not in A)
    return ok


def ph(t0, t1, label, z=1):
    """a loud magenta placeholder for a beat whose material isn't sourced yet (never ships: FINAL=1 refuses)"""
    PLACEHOLDERS.append(label)
    c.clip(t0, t1, f'<div class="ev1-layer" style="background:#2a2a2a"><div style="position:absolute;left:80px;top:80px;'
                   f'font:700 60px var(--ev1-sans);color:#f0f">{esc(label)}</div></div>', z)


def shot(t0, t1, name):
    SHOTS.append((fr(t0), fr(t1), name))


def face(t0, t1, punch=None, z=1):
    """the speaker on camera, RAW (no grade, no B&W, no vignette): one more picture in the stream.
    punch = (t, scale) a hard punch-in on the stressed word."""
    v = broll(c, t0, t1, 'assets/media/cam_raw.mp4', z=z, rate=0.012, media_start=fr(t0),
              punches=[punch] if punch else ())
    shot(t0, t1, 'face')
    return v


# ============================================================ BEATS — un bloque por línea de PLAN.md
# Cámbialos por los de verdad. Cada uno: b, e = inicio y fin de la línea (de las palabras); su dispositivo; sus
# subtítulos; y c.escena('<la línea, corta>', b, e).
#
# Línea 1 — la apertura: un tile-flash reveal desde negro sobre una foto real, y después su clip en movimiento.
b, e = 0.0, fr(WORDS[min(3, len(WORDS) - 1)][1])
if has('open_still', 'open_clip'):
    tend = tile_reveal(c, b, A['open_still'], z=2, seed=3, size=(W, H))
    c.clip(b, tend, '<div class="ev1-layer ev1-black"></div>', z=1)
    broll(c, tend, e, A['open_clip'], z=1, rate=0.07)
else:
    ph(b, e, 'línea 1: open_still + open_clip')
shot(b, e, 'open')
captions(c, [(WORDS[:3], e)])
c.escena('Apertura', b, e)
#
# Línea 2 — tú, crudo, con la palabra fuerte enorme y roja DETRÁS de la cabeza; pide el recorte:
#   python -I -B -X utf8 <skill>/scripts/matte.py --plate public/assets/media/cam_raw.mp4 --start <b> --dur <e-b> \
#       --out public/assets/media/matte_a.webm
#   cutout_world(c, b, e, [('video', 'assets/media/cam_raw.mp4', b, None, b)], 'assets/media/matte_a.webm', b, z=1,
#                mega=('EDITA', find('edita'), 560))
# El resto de la toma, mientras no está construido:
b = e
if b < fr(VO_END):
    face(b, fr(VO_END))
    ph(b, fr(VO_END), 'el resto: un dispositivo por línea (PLAN.md)', z=2)
    c.escena('Sin construir', b, fr(VO_END))

# cierre
c.clip(fr(VO_END), DUR, '<div class="ev1-layer ev1-black"></div>', z=1)
sfx(c, fr(VO_END), 'outro', 0.8)

finish(c, 0, DUR, z=80, grid=False, vignette=False)   # mejor la rejilla y la viñeta por línea: finish(c, b, e) en las de imagen

if FINAL and (PLACEHOLDERS or MISSING):
    sys.exit(f'build.py: FINAL no escribe: huecos {PLACEHOLDERS}, falta material {sorted(set(MISSING))}')
c.write_cues('sfx-cues.txt')
# La voz, o la premezcla de voz y cama de bed-mix.py, con todos los efectos: lo que suena en vivo y en el render.
base = 'work/premix.wav' if os.path.exists('work/premix.wav') else 'public/assets/media/vo.wav'
mezclar(base, 'sfx-cues.txt', 'public/sonido.wav', DUR)
c.write('src/edicion.json', audio='sonido.wav', title='Editor V1')
with open('work/shots.json', 'w', encoding='utf-8') as f:
    json.dump(sorted(SHOTS), f)
print('PASS', PASS, 'dur', DUR, 'cues', len(c.cues), 'shots', len(SHOTS), 'escenas', len(c.escenas),
      'placeholders', len(PLACEHOLDERS), 'missing', sorted(set(MISSING)))
