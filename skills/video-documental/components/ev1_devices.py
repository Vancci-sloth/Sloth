"""ev1_devices.py — the Editor V1 device library.

Every beat in an Editor V1 edit is one of these devices. Each was measured frame by frame
in the three reference reels (reference/devices.md has the frame counts and where
each one was seen). A device writes its HTML, its GSAP lines and its own SFX cues, so the
sound lands on the frame the picture changes and the cue sheet can never drift from the cut.

    import sys; sys.path.insert(0, '<skill>/components'); from ev1_devices import *
    c = Comp(dur=19.4)
    still(c, 0, 1.9, 'assets/img/hq.jpg', z=1)
    captions(c, [[('might', .82), ('have', .98)], ...], end=1.9)
    c.write_cues('sfx-cues.txt'); c.write('src/edicion.json', audio='sonido.wav')

En Sloth no hay HyperFrames: `Comp.write` deja la edición en `src/edicion.json` y la dibuja el proyecto de Remotion
del video (`plantilla/src/Edicion.tsx`), que mueve la misma línea de tiempo de GSAP cuadro a cuadro. Así se ve en vivo
en el estudio y se renderiza con Remotion. Las rutas de las imágenes y los clips son relativas a `public/`.

Rules baked in (every one of them broke an earlier build):
- every time is snapped to a whole frame; clip durations are FLOORED to 4 decimals
- every clip gets an explicit z-index (track index is not paint order)
- videos are top-level clips, never inside a timed wrapper
- initial transforms go in a gsap.set preamble OUTSIDE the timeline; fromTo always
  carries immediateRender:false
- nothing tweens visibility/autoAlpha on a .clip; inner nodes carry opacity
"""
import json, math, os, random, sys, html as _html

FPS = 30
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'scripts'))
from formato import tamano  # noqa: E402

# El cuadro: 1920x1080 o, con formato.txt = vertical en la carpeta del video, 1080x1920. Las medidas de las
# referencias van a 1080 de alto en horizontal; en vertical las letras guardan su tamaño (1080 es el lado corto en los
# dos) y lo que no cabe a lo ancho se ajusta (fit_size).
W, H = tamano()
VERTICAL = H > W
FULL = f'position:absolute;left:0;top:0;width:{W}px;height:{H}px'

# Ancho medio de un carácter, en em, de cada letra grande (con su letter-spacing): para que en vertical una palabra
# no se salga del cuadro. Medido a ojo sobre Inter 900, Arimo 700, Playfair 700 cursiva y Bodoni 700.
_EM = {'key': 0.56, 'title': 0.50, 'shock': 0.74, 'mega': 0.68, 'slap': 0.72}


def fit_size(text, kind, size, margin=0.9):
    """En vertical, el tamaño de letra para que `text` (o la más larga de sus líneas) quepa en margin x W."""
    if not VERTICAL:
        return size
    lines = text if isinstance(text, (list, tuple)) else [text]
    longest = max((len(t) for t in lines), default=1)
    return min(size, int(margin * W / max(1, longest * _EM[kind])))


def fr(t):            # snap seconds to the frame grid
    return round(t * FPS) / FPS


def dstr(t0, t1):     # clip duration floored so the renderer's ceil gives exactly the frame count
    n = round(t1 * FPS) - round(t0 * FPS)
    return f'{math.floor(n / FPS * 1e4) / 1e4:.4f}'


def esc(s):
    return _html.escape(s, quote=True)


class Comp:
    def __init__(self, dur, cid='main', fps=FPS):
        self.dur, self.cid = fr(dur), cid
        self.els, self.vids, self.js, self.pre, self.css, self.cues, self.escenas = [], [], [], [], [], [], []
        self.n = 0

    def uid(self, p='e'):
        self.n += 1
        return f'{p}{self.n}'

    def clip(self, t0, t1, inner, z, cls='ev1-layer', style='', cid=None):
        cid = cid or self.uid('c')
        self.els.append({'id': cid, 'f0': round(t0 * FPS), 'f1': round(t1 * FPS), 'z': z, 'cls': f'clip {cls}'.strip(),
                         'style': style, 'html': inner, 'pieza': _pieza()})
        return cid

    def video(self, t0, t1, src, media_start, z, style='', vid=None, cls='clip ev1-fill'):
        vid = vid or self.uid('v')
        self.vids.append({'id': vid, 'f0': round(t0 * FPS), 'f1': round(t1 * FPS), 'z': z, 'cls': cls, 'style': style,
                          'src': src, 'desde': round(media_start * FPS), 'pieza': _pieza()})
        return vid

    def escena(self, nombre, t0, t1):
        """Una línea del PLAN en el tiempo: en el estudio de Sloth es una escena (en la línea de tiempo, para saltar a
        ella o citarla en el chat)."""
        self.escenas.append({'nombre': nombre, 'f0': round(t0 * FPS), 'f1': round(t1 * FPS)})

    def at(self, line):
        self.js.append(line)

    def cue(self, t, sound, gain):
        self.cues.append((round(t, 3), sound, gain))

    def write(self, path='src/edicion.json', tokens='public/assets/ev1/tokens.css', audio=None, title='Editor V1'):
        """La edición para Remotion (`src/Edicion.tsx`). `audio`: el sonido entero (voz, cama y efectos), relativo a
        public/; lleva su hora para que el monitor de Sloth vuelva a pedirlo cuando cambia."""
        archivo = os.path.join('public', audio) if audio else None
        audio = f'{audio}?v={int(os.path.getmtime(archivo))}' if archivo and os.path.exists(archivo) else None
        doc = {'titulo': title, 'fps': FPS, 'ancho': W, 'alto': H, 'duracion': round(self.dur * FPS),
               'css': open(tokens, encoding='utf-8').read() + '\n' + '\n'.join(self.css),
               'clips': self.els, 'videos': self.vids, 'pre': '\n'.join(self.pre), 'js': '\n'.join(self.js),
               'escenas': sorted(self.escenas, key=lambda e: e['f0']), 'audio': audio}
        # Temporal y reemplazo: el motor en vivo relee el archivo en cuanto cambia y no debe verlo a medias.
        with open(path + '.tmp', 'w', encoding='utf-8', newline='\n') as f:
            json.dump(doc, f, ensure_ascii=False)
        os.replace(path + '.tmp', path)

    def write_cues(self, path):
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write('# Editor V1 cue sheet, written by the devices. time = file start (pre-rolled)\n')
            for t, s, g in sorted(self.cues):
                f.write(f'{max(0, t):.3f}  {s}  {g}\n')


def _pieza():
    """El dispositivo que dibuja esto, el de más afuera (cutout_world, no el tile_reveal al que llama), para que el
    estudio diga qué es lo que se elige en el cuadro. Si lo pone build.py a mano, su función (face, ph) o «capa»."""
    f, nombre = sys._getframe(2), None
    while f:
        if f.f_code.co_filename.lower().endswith(('ev1_devices.py', 'ev1_more.py')):
            nombre = f.f_code.co_name
        elif nombre:
            break
        f = f.f_back
    if nombre:
        return nombre
    llamador = sys._getframe(2).f_code.co_name
    return llamador if llamador != '<module>' else 'capa'


# ------------------------------------------------------------------ sound roles
# Peaks differ by 11 dB across the palette, so each role has a solved gain and a
# pre-roll (the cue time is when the FILE starts; its transient sits inside it).
SND = {
    # role:        (file in <skill>/sfx/,            gain,  pre-roll s)   — sfx/peaks.json
    # Synthesised by scripts/synth-sfx.py to the reference sounds' measured length, transient and level.
    # Gains reproduce the refs' level vs a -20 LUFS voice:
    # the clicks sit only 2-7 dB under the voice. Pre-roll = file start -> transient, minus the
    # 4-14 ms the refs' clicks LAG the picture (measured).
    'train_tile':  ('ev1kit/clicktrain_1', 0.39, 0.017),   # tile reveal: 1 click/frame
    'train_tile2': ('ev1kit/clicktrain_2', 0.40, 0.012),
    'train_pop':   ('ev1kit/clicktrain_3', 0.34, 0.032),   # pop-ins: 1 click / 2 frames
    'train_strobe':('ev1kit/clicktrain_4', 0.55, 0.122),   # strobe burst
    'click':       ('ev1kit/click_3', 0.42, -0.008),       # a single pop / cut in a run
    'click_soft':  ('ev1kit/click_1', 0.30, -0.008),
    'swish':       ('ev1kit/swish_1', 0.20, 0.270),        # into a title: transient = the cut
    'glitch':      ('ev1kit/glitch_1', 0.40, 0.170),       # datamosh
    'riser':       ('ev1kit/riser_1', 0.50, 0.760),        # swell that peaks ON the cut
    'subtone':     ('ev1kit/subtone_1', 0.07, 0.000),      # under a black / UI card
    'subboom':     ('ev1kit/subboom_1', 0.10, 0.035),
    'impact':      ('ev1kit/impact_2', 0.36, 0.040),       # the beat slamming back after a silence
    'hit':         ('ev1kit/impact_1', 0.24, 0.110),       # a single cut that needs weight (rare)
    'outro':       ('ev1kit/outro_1', 0.55, 0.085),
    # kept for reference, not reference-accurate:
    'tick':        ('ev1/tick', 0.16, 0.0),
    'whoosh':      ('ev1kit/swish_1', 0.14, 0.270),
}


def sfx(c, t, role, gain_scale=1.0):
    name, g, pre = SND[role]
    c.cue(fr(t) - pre, name, round(g * gain_scale, 3))


# ------------------------------------------------------------------ STILL
def still(c, t0, t1, src, z, push=1.06, origin='50% 50%', size=None, push_from=1.0):
    """A held real image, edge to edge, on a slow linear push (REF-1/2: every still breathes)."""
    iid = c.uid('img')
    w, h = size or (round(W * 1.1), round(H * 1.1))
    inner = (f'<img id="{iid}" src="{src}" style="position:absolute;left:{(W - w) // 2}px;top:{(H - h) // 2}px;'
             f'width:{w}px;height:{h}px;transform-origin:{origin}">')
    cid = c.clip(t0, t1, inner, z)
    c.at(f'tl.fromTo("#{iid}",{{scale:{push_from}}},{{scale:{push},duration:{fr(t1) - fr(t0):.4f},ease:"none",immediateRender:false}},{fr(t0):.4f});')
    return cid, iid


# ------------------------------------------------------------------ FRAMES (glitch / datamosh)
def frames(c, t0, srcs, z, per=1, sound='glitch'):
    """Show a list of pre-rendered frames one (or `per`) frame each: the 3-4 frame datamosh."""
    t = fr(t0)
    for s in srcs:
        c.clip(t, t + per / FPS, f'<img src="{s}" class="ev1-fill">', z)
        t += per / FPS
    if sound:
        sfx(c, t0, sound)
    return t


# ------------------------------------------------------------------ TILE-FLASH REVEAL
def tile_reveal(c, t, src, z, cols=3, rows=3, frames_n=10, seed=1, size=None, click=True):
    """REF-1's opening move: the thirds grid; each pane flashes white for one frame and
    then shows the new picture, one pane per frame in a shuffled order, one click per pane.
    The layer ends when the last pane lands; put the full still underneath from `t`."""
    t = fr(t)
    rnd = random.Random(seed)
    order = list(range(cols * rows)); rnd.shuffle(order)
    w, h = size or (round(W * 1.1), round(H * 1.1)); ox, oy = (W - w) // 2, (H - h) // 2
    pw, ph = W / cols, H / rows
    step = max(1, frames_n // (cols * rows)) if frames_n >= cols * rows else 1
    inner, end = [], t
    for k, p in enumerate(order):
        cx, cy = p % cols, p // cols
        x0, y0 = round(cx * pw), round(cy * ph); x1, y1 = round((cx + 1) * pw), round((cy + 1) * ph)
        pid, fid = c.uid('pane'), c.uid('pf')
        inner.append(f'<div id="{pid}" style="position:absolute;left:{x0}px;top:{y0}px;width:{x1 - x0}px;height:{y1 - y0}px;overflow:hidden;opacity:0">'
                     f'<img src="{src}" style="position:absolute;left:{ox - x0}px;top:{oy - y0}px;width:{w}px;height:{h}px"></div>'
                     f'<div id="{fid}" style="position:absolute;left:{x0}px;top:{y0}px;width:{x1 - x0}px;height:{y1 - y0}px;background:#fff;opacity:0"></div>')
        tf = t + (k * step) / FPS
        c.at(f'tl.set("#{fid}",{{opacity:1}},{tf:.4f});tl.set("#{fid}",{{opacity:0}},{tf + 1 / FPS:.4f});tl.set("#{pid}",{{opacity:1}},{tf + 1 / FPS:.4f});')
        end = max(end, tf + 2 / FPS)
    c.clip(t, end, ''.join(inner), z)
    if click:
        sfx(c, t, 'train_tile' if seed % 2 else 'train_tile2')
    return end


# ------------------------------------------------------------------ CAPTIONS
def captions(c, groups, z=60, y=None, on_paper=False, slots=None):
    """Small white words, centred, each appearing on its own spoken onset (+-1 frame,
    measured), laid out in their final slots so nothing re-centres. groups = list of
    (words, t_end) where words = [(text, onset), ...]."""
    for g in groups:
        words, t_end = g[0], g[1]
        mode = g[2] if len(g) > 2 else None      # REF-2: captions change character on stress
        if not words:
            continue
        t0 = fr(words[0][1])
        spans = []
        for wtxt, on in words:
            wid = c.uid('w')
            spans.append(f'<span id="{wid}" class="w">{esc(wtxt)}</span>')
            c.at(f'tl.set("#{wid}",{{opacity:1}},{max(t0, fr(on)):.4f});')
        style = f'top:calc({y} - 0.6 * var(--ev1-cap-size));' if y else ''
        if mode == 'serif':   # stressed phrase -> italic serif ("who wins", "win or die")
            style += 'font:italic 600 calc(var(--ev1-cap-size) * 1.25)/1.2 var(--ev1-serif);letter-spacing:0;'
        elif mode == 'big':   # the key word -> 2-2.5x bold ("the best", "monopoly", "crack")
            style += 'font:700 calc(var(--ev1-cap-size) * 2.3)/1.1 var(--ev1-grotesk);letter-spacing:-0.03em;top:calc(50% - 0.7 * var(--ev1-cap-size) * 2.3);'
        cls = 'ev1-cap on-paper' if on_paper else 'ev1-cap'
        c.clip(t0, t_end, f'<div class="{cls}" style="{style}">{"".join(spans)}</div>', z, cls='', style=FULL)


# ------------------------------------------------------------------ DISPLAY TYPE
def keyword(c, t0, t1, text, z, x=None, y=None, kind='key', blur_in=True, sound=None, size=None):
    """The big word. kind = key (white sans) | shock (red Didone caps) | title (chrome serif
    italic). Blur-in over 6 frames (REF-1 "Valley"); the shock word cuts on hard.
    text may be a list: one display line each, stacked left-aligned (a long ID behind a
    head reads better as two short lines than as one occluded one)."""
    kid = c.uid('k')
    x = W // 2 if x is None else x
    y = H // 2 if y is None else y
    if VERTICAL:   # what doesn't fit the width shrinks to it (the token size when it fits)
        base = size or {'key': 132, 'title': 136, 'shock': 176, 'mega': 560}[kind]
        if fit_size(text, kind, base) < base:
            size = fit_size(text, kind, base)
    cls = {'key': 'ev1-key', 'shock': 'ev1-shock', 'title': 'ev1-title', 'mega': 'ev1-mega'}[kind]   # mega: the huge black-weight red word, set BEHIND the speaker's matte
    fs = f'font-size:{size}px;' if size else ''
    if isinstance(text, (list, tuple)):
        inner = f'<div id="{kid}">' + ''.join(f'<div class="{cls}" style="{fs}line-height:1.02">{esc(t)}</div>' for t in text) + '</div>'
    else:
        inner = f'<div id="{kid}" class="{cls}" style="{fs}">{esc(text)}</div>'
    if kind == 'title':
        inner = f'<div class="ev1-title-wrap">{inner}</div>'
    box = (f'<div style="position:absolute;left:0;top:{y}px;width:{W}px;height:0;display:flex;justify-content:center;'
           f'align-items:center;transform:translateX({x - W // 2}px)">{inner}</div>')
    c.clip(t0, t1, box, z, cls='', style=FULL)
    if blur_in and kind not in ('shock', 'mega'):
        c.at(f'tl.fromTo("#{kid}",{{opacity:0,filter:"blur(18px)",scale:1.06}},{{opacity:1,filter:"blur(0px)",scale:1,duration:0.2,ease:"power2.out",immediateRender:false}},{fr(t0):.4f});')
        c.pre.append(f'gsap.set("#{kid}",{{opacity:0}});')
    if sound:
        sfx(c, t0, sound)
    return kid


def svg_mark(c, t0, t1, svg_markup, z, width=980, x=None, y=None, color='#fff', blur_in=True):
    """A real brand mark (the company's own SVG), white, blurred in like a keyword."""
    mid = c.uid('mark')
    x = W // 2 if x is None else x
    y = H // 2 if y is None else y
    width = min(width, W - 120)
    svg = svg_markup.replace('<svg', f'<svg style="width:100%;height:auto;display:block;fill:{color}"', 1)
    inner = (f'<div style="position:absolute;left:{x - width // 2}px;top:{y}px;width:{width}px;transform:translateY(-50%)">'
             f'<div id="{mid}" style="filter:drop-shadow(0 8px 30px rgba(0,0,0,.45))">{svg}</div></div>')
    c.clip(t0, t1, inner, z, cls='', style=FULL)
    if blur_in:
        c.pre.append(f'gsap.set("#{mid}",{{opacity:0}});')
        c.at(f'tl.fromTo("#{mid}",{{opacity:0,filter:"blur(22px) drop-shadow(0 8px 30px rgba(0,0,0,.45))",scale:1.08}},{{opacity:1,filter:"blur(0px) drop-shadow(0 8px 30px rgba(0,0,0,.45))",scale:1,duration:0.2,ease:"power2.out",immediateRender:false}},{fr(t0):.4f});')
    return mid


# ------------------------------------------------------------------ POP COLLAGE
def pop_collage(c, t0, t1, cards, z, ground='black'):
    """REF-2's opening: real cards land one by one on a dark ground, each preceded by a
    one-frame white box of its own size, one click each. cards = [(src, x, y, w, rot, t_pop)]
    (x, y = card centre). The whole stack drifts in slowly."""
    gid = c.uid('col')
    inner = [f'<div class="ev1-layer ev1-black"></div><div id="{gid}" class="ev1-layer">']
    for src, x, y, w, rot, tp in cards:
        cid, bid, kid = c.uid('cd'), c.uid('cb'), c.uid('ck')
        inner.append(f'<div id="{kid}" style="position:absolute;left:{x - w // 2}px;top:{y}px;width:{w}px;transform:translateY(-50%) rotate({rot}deg)">'
                     f'<img id="{cid}" src="{src}" style="display:block;width:100%;border-radius:{max(8, w // 40)}px;box-shadow:0 18px 50px rgba(0,0,0,.55);opacity:0">'
                     f'<div id="{bid}" style="position:absolute;inset:0;background:#fff;border-radius:{max(8, w // 40)}px;opacity:0"></div></div>')
        tp = fr(tp)
        c.at(f'tl.set("#{bid}",{{opacity:1}},{tp - 1 / FPS:.4f});tl.set("#{bid}",{{opacity:0}},{tp:.4f});tl.set("#{cid}",{{opacity:1}},{tp:.4f});')
        sfx(c, tp - 1 / FPS, 'click')
    inner.append('</div>')
    c.clip(t0, t1, ''.join(inner), z)
    c.at(f'tl.fromTo("#{gid}",{{scale:1}},{{scale:1.05,duration:{fr(t1) - fr(t0):.4f},ease:"none",immediateRender:false}},{fr(t0):.4f});')


# ------------------------------------------------------------------ 3D WALL
def wall3d(c, t0, t1, tiles, z, cols=4, tile_w=None, gap=40, rot=(56, 0, -24), travel=(-1500, 380), sound=False):
    """REF-1 41.4-45.3s: a perspective plane covered in real cards, the camera sweeping
    across it with motion blur. tiles = list of srcs, laid on a grid and repeated to fill."""
    pid = c.uid('wall')
    tile_w = tile_w or (760 if not VERTICAL else 600)
    rows = max(3, math.ceil(len(tiles) * 2 / cols))
    cells = []
    for r in range(rows):
        for k in range(cols):
            src = tiles[(r * cols + k + r) % len(tiles)]
            x = k * (tile_w + gap) + (r % 2) * tile_w * 0.35; y = r * (tile_w * 0.62 + gap)
            cells.append(f'<img src="{src}" style="position:absolute;left:{x:.0f}px;top:{y:.0f}px;width:{tile_w}px;height:{tile_w * 0.62:.0f}px;object-fit:cover;object-position:50% 0%;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.6)">')
    pw = cols * (tile_w + gap) + tile_w; ph = rows * (tile_w * 0.62 + gap)
    inner = (f'<div class="ev1-layer ev1-black" style="perspective:1500px;perspective-origin:50% 40%">'
             f'<div id="{pid}" style="position:absolute;left:{(W - pw) / 2:.0f}px;top:{(H - ph) / 2:.0f}px;width:{pw:.0f}px;height:{ph:.0f}px;transform-style:preserve-3d">{"".join(cells)}</div></div>')
    c.clip(t0, t1, inner, z)
    c.pre.append(f'gsap.set("#{pid}",{{rotationX:{rot[0]},rotationY:{rot[1]},rotationZ:{rot[2]},x:{-travel[0] / 2},y:{-travel[1] / 2}}});')
    d = fr(t1) - fr(t0)
    c.at(f'tl.fromTo("#{pid}",{{x:{-travel[0] / 2},y:{-travel[1] / 2},filter:"blur(6px)"}},{{x:{travel[0] / 2},y:{travel[1] / 2},filter:"blur(0px)",duration:{d:.4f},ease:"power3.out",immediateRender:false}},{fr(t0):.4f});')
    if sound:   # the references' wall sweep is SILENT — the bed carries it (SOUND.md)
        sfx(c, t0, 'whoosh')


# ------------------------------------------------------------------ PAPER CARD
def paper_card(c, t0, t1, src, z, card_w=None, left=(), right=(), invert_in=2):
    """REF-1 8.2-9.0s: a small real card on the grey-vignetted paper ground, the spoken
    words flanking it in ink, the card creeping larger. Opens on an invert flash
    (the paper reads black for `invert_in` frames, REF-2 f503). In vertical the words sit above and below the card."""
    wid, kid = c.uid('pw'), c.uid('pk')
    card_w = card_w or (1000 if not VERTICAL else W - 160)
    words = []
    for side, ws in (('l', left), ('r', right)):
        for wtxt, on in ws:
            sid = c.uid('pwd')
            words.append((side, sid, wtxt, on))
    ltxt = ''.join(f'<span id="{s}" style="opacity:0;margin-left:.42em">{esc(w)}</span>' for sd, s, w, o in words if sd == 'l')
    rtxt = ''.join(f'<span id="{s}" style="opacity:0;margin-right:.42em">{esc(w)}</span>' for sd, s, w, o in words if sd == 'r')
    card = f'<img src="{src}" style="display:block;width:100%;border-radius:10px;box-shadow:0 24px 60px rgba(0,0,0,.28)">'
    if VERTICAL:
        capv = 'font:600 var(--ev1-cap-size)/1.2 var(--ev1-sans);color:var(--ev1-ink);text-align:center;padding:0 60px;min-height:1.2em'
        inner = (f'<div id="{wid}" class="ev1-layer ev1-paper"><div style="position:absolute;left:0;top:{H // 2}px;width:{W}px;'
                 f'transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:44px">'
                 f'<div style="{capv}">{ltxt}</div><div id="{kid}" style="width:{card_w}px">{card}</div>'
                 f'<div style="{capv}">{rtxt}</div></div></div>')
    else:
        capstyle = f'font:600 var(--ev1-cap-size)/1 var(--ev1-sans);color:var(--ev1-ink);position:absolute;top:{H // 2}px;transform:translateY(-50%);white-space:nowrap'
        inner = (f'<div id="{wid}" class="ev1-layer ev1-paper">'
                 f'<div id="{kid}" style="position:absolute;left:{(W - card_w) // 2}px;top:{H // 2}px;width:{card_w}px;transform:translateY(-50%)">'
                 f'{card}</div>'
                 f'<div style="{capstyle};right:{(W + card_w) // 2 + 40}px;text-align:right">{ltxt}</div>'
                 f'<div style="{capstyle};left:{(W + card_w) // 2 + 40}px">{rtxt}</div></div>')
    c.clip(t0, t1, inner, z)
    for sd, s, w, on in words:
        c.at(f'tl.set("#{s}",{{opacity:1}},{max(fr(t0), fr(on)):.4f});')
    c.at(f'tl.fromTo("#{kid}",{{scale:0.94}},{{scale:1.04,duration:{fr(t1) - fr(t0):.4f},ease:"none",immediateRender:false}},{fr(t0):.4f});')
    if invert_in:
        c.pre.append(f'gsap.set("#{wid}",{{filter:"invert(1)"}});')
        c.at(f'tl.set("#{wid}",{{filter:"invert(1)"}},{fr(t0):.4f});tl.set("#{wid}",{{filter:"none"}},{fr(t0) + invert_in / FPS:.4f});')
        sfx(c, t0, 'click')


# ------------------------------------------------------------------ STROBE MONTAGE
def strobe(c, t0, t1, srcs, z, step_frames=3, tracker=True, seed=4):
    """REF-2 83.2-84.6s: one word carried by a burst of images, 2-3 frames each, a small
    white square hopping between them. One tick per image."""
    t0, t1 = fr(t0), fr(t1)
    rnd = random.Random(seed)
    n = max(1, round((t1 - t0) * FPS / step_frames))
    ids, inner = [], []
    for k in range(n):
        iid = c.uid('st'); ids.append(iid)
        inner.append(f'<img id="{iid}" src="{srcs[k % len(srcs)]}" class="ev1-fill" style="opacity:0">')
    sq = c.uid('sq')
    if tracker:
        inner.append(f'<div id="{sq}" style="position:absolute;left:0;top:0;width:64px;height:64px;background:#fff;mix-blend-mode:difference"></div>')
    c.clip(t0, t1, ''.join(inner), z)
    for k, iid in enumerate(ids):
        tk = t0 + k * step_frames / FPS
        c.at(f'tl.set("#{iid}",{{opacity:1}},{tk:.4f});')
        if k:
            c.at(f'tl.set("#{ids[k - 1]}",{{opacity:0}},{tk:.4f});')
        if tracker:
            c.at(f'tl.set("#{sq}",{{x:{rnd.randint(round(W * 0.16), round(W * 0.81))},y:{rnd.randint(round(H * 0.17), round(H * 0.76))}}},{tk:.4f});')
    sfx(c, t0, 'train_strobe')


# ------------------------------------------------------------------ RACK FOCUS on a real card
def focus_card(c, t0, t1, src, z, card_w=1180, frames_n=12, mark=None, ground='black', y=None):
    """A real card filling most of the frame, opening defocused and racking sharp over
    12 frames (REF-1 9.9s). mark = (x, y, w, h, t) highlighter on the card in CARD px. y = the card's centre (default
    mid-frame; in vertical, raise it so the caption line at 63% stays clear of the card)."""
    kid = c.uid('fc')
    cy = H // 2 if y is None else y
    mk = ''
    if mark:
        mx, my, mw, mh, mt = mark
        mid = c.uid('fm')
        mk = f'<div id="{mid}" class="ev1-mark on-dark" style="left:{mx}px;top:{my}px;width:{mw}px;height:{mh}px"></div>'
    k = min(1.0, (W - 120) / card_w)   # in vertical the card shrinks to the width; its marks stay in card px
    inner = (f'<div class="ev1-layer ev1-{ground}"><div style="position:absolute;left:{(W - card_w) // 2}px;top:{cy}px;width:{card_w}px;transform:translateY(-50%) scale({k:.4f})">'
             f'<div id="{kid}"><img src="{src}" style="display:block;width:100%;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.6)">{mk}</div></div></div>')
    c.clip(t0, t1, inner, z)
    c.pre.append(f'gsap.set("#{kid}",{{filter:"blur(16px)"}});')
    c.at(f'tl.fromTo("#{kid}",{{filter:"blur(16px)",scale:1.0}},{{filter:"blur(0px)",scale:1.0,duration:{frames_n / FPS:.4f},ease:"power2.out",immediateRender:false}},{fr(t0):.4f});')
    c.at(f'tl.fromTo("#{kid}",{{scale:1.0}},{{scale:1.05,duration:{fr(t1) - fr(t0):.4f},ease:"none",immediateRender:false}},{fr(t0):.4f});')
    if mark:
        c.pre.append(f'gsap.set("#{mid}",{{scaleX:0}});')
        c.at(f'tl.fromTo("#{mid}",{{scaleX:0}},{{scaleX:1,duration:0.2,ease:"power2.out",immediateRender:false}},{fr(mark[4]):.4f});')
        sfx(c, mark[4], 'click_soft')


# ------------------------------------------------------------------ TERMINAL (rebuilt UI)
def terminal(c, t0, t1, cmd, rows, z, stop_t, marks=(), font=34, cmd_frames=10):
    """A rebuilt API call: the command types, the response streams up, and stops with the
    rows that matter centred; markers sweep across them one per tick (REF-1's PayPal
    receipt is the same move: a real interface, rebuilt, timed to the words)."""
    lh = round(font * 1.5)
    cid, lid = c.uid('cmd'), c.uid('list')
    chars = []
    for k, ch in enumerate(cmd):
        sid = c.uid('ch')
        chars.append(f'<span id="{sid}" style="opacity:0">{esc(ch)}</span>')
        c.at(f'tl.set("#{sid}",{{opacity:1}},{fr(t0) + (k * cmd_frames / max(1, len(cmd))) / FPS:.4f});')
    body = []
    for k, r in enumerate(rows):
        body.append(f'<div style="height:{lh}px">{r}</div>')
    target = max(m[0] for m in marks) if marks else len(rows) - 1
    stop_y = H // 2 + 20 - (target - len(marks) // 2) * lh
    start_y = H + 20
    lx, ty = (150, 90) if not VERTICAL else (60, 230)
    mk = []
    for row, x, w, tm in marks:
        mid = c.uid('tm')
        mk.append(f'<div id="{mid}" class="ev1-mark on-dark" style="left:{x}px;top:{row * lh + 4}px;width:{w}px;height:{lh - 8}px"></div>')
        c.pre.append(f'gsap.set("#{mid}",{{scaleX:0}});')
        c.at(f'tl.fromTo("#{mid}",{{scaleX:0}},{{scaleX:1,duration:0.16,ease:"power2.out",immediateRender:false}},{fr(tm):.4f});')
        sfx(c, tm, 'click_soft')
    inner = (f'<div class="ev1-layer" style="background:#0B0D10">'
             f'<div class="ev1-term" style="left:{lx}px;top:{ty}px;font-size:{font}px"><span class="dim">$ </span><span id="{cid}">{"".join(chars)}</span></div>'
             f'<div id="{lid}" class="ev1-term" style="left:{lx}px;top:0;font-size:{font}px">{"".join(body)}{"".join(mk)}</div>'
             f'<div style="position:absolute;left:0;top:0;width:{W}px;height:{ty + 110}px;background:linear-gradient(#0B0D10 72%,rgba(11,13,16,0))"></div>'
             f'<div class="ev1-term" style="left:{lx}px;top:{ty}px;font-size:{font}px"><span class="dim">$ </span>{esc(cmd)}</div></div>')
    c.clip(t0, t1, inner, z)
    c.pre.append(f'gsap.set("#{lid}",{{y:{start_y}}});')
    c.at(f'tl.fromTo("#{lid}",{{y:{start_y}}},{{y:{stop_y},duration:{fr(stop_t) - fr(t0) - cmd_frames / FPS:.4f},ease:"power2.inOut",immediateRender:false}},{fr(t0) + cmd_frames / FPS:.4f});')
    c.at(f'tl.fromTo("#{lid}",{{y:{stop_y}}},{{y:{stop_y - 30},duration:{fr(t1) - fr(stop_t):.4f},ease:"none",immediateRender:false}},{fr(stop_t):.4f});')


# ------------------------------------------------------------------ TYPEWRITER (block cursor)
def typewriter(c, t0, t1, lines, z, font=46, top=None):
    """REF-2 51.8s "with no ▮": text typing on black behind a white block cursor, with
    broken scanlines flickering across. lines = [(html_text_plain, t_start, frames_per_char)]."""
    top = top if top is not None else round(H * 0.352)
    sx, sy = W / 1920, H / 1080
    rows = []
    cur = c.uid('cur')
    last_t = fr(t0)
    for k, (txt, ts, fpc, cls) in enumerate(lines):
        spans = []
        for j, ch in enumerate(txt):
            sid = c.uid('tw')
            spans.append(f'<span id="{sid}" style="opacity:0">{esc(ch)}</span>')
            tt = fr(ts) + (j * fpc) / FPS
            c.at(f'tl.set("#{sid}",{{opacity:1}},{tt:.4f});')
            last_t = max(last_t, tt)
        rows.append(f'<div class="{cls}" style="min-height:{round(font * 1.45)}px">{"".join(spans)}</div>')
        sfx(c, ts, 'click_soft')
    lines_html = ''.join(rows)
    scan = ''.join(f'<div class="ev1-scan" style="top:{y * sy:.0f}px;height:{h}px;left:{x * sx:.0f}px;width:{w * sx:.0f}px"></div>'
                   for x, y, w, h in [(240, 300, 900, 2), (980, 640, 620, 3), (120, 720, 380, 2), (1300, 260, 420, 2)])
    wrap = f'white-space:pre-wrap;width:{W - 160}px;' if VERTICAL else ''
    inner = (f'<div class="ev1-layer ev1-black"><div class="ev1-term" style="left:{200 if not VERTICAL else 80}px;top:{top}px;font-size:{font}px;line-height:1.45;{wrap}">{lines_html}'
             f'<span id="{cur}" class="ev1-cursor"></span></div>{scan}</div>')
    c.css.append('.ev1-scan{position:absolute;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.55),rgba(120,200,255,.4),rgba(255,255,255,0));opacity:.0}')
    c.clip(t0, t1, inner, z)
    # cursor blinks on 8-frame halves
    t = fr(t0); on = True
    while t < fr(t1):
        c.at(f'tl.set("#{cur}",{{opacity:{1 if on else 0}}},{t:.4f});'); t += 8 / FPS; on = not on
    c.at(f'tl.set(".ev1-scan",{{opacity:.7}},{fr(t0) + 2 / FPS:.4f});tl.set(".ev1-scan",{{opacity:0}},{fr(t0) + 4 / FPS:.4f});'
         f'tl.set(".ev1-scan",{{opacity:.6}},{last_t:.4f});tl.set(".ev1-scan",{{opacity:0}},{last_t + 2 / FPS:.4f});')


# ------------------------------------------------------------------ PLATFORM HOP (find bar)
def find_hop(c, t0, t1, pages, query, z, type_at=None, fpc=2, counter='0/0', rate=0.05, dim=0.55):
    """REF-2 69.6-72.4s "platform hop": one input keeps typing while the site under it cuts
    (Google -> Facebook -> YouTube -> Twitter -> ChatGPT). Here it is a browser find bar
    searching each real page for the thing he says is missing: "aurora — 0/0". pages =
    [(src, t_cut)], each a full-frame capture; one click per page cut."""
    t0, t1 = fr(t0), fr(t1)
    gid = c.uid('hop')
    imgs = []
    cuts = [fr(tc) for _, tc in pages] + [t1]
    for k, (src, tc) in enumerate(pages):
        iid = c.uid('hp')
        imgs.append(f'<img id="{iid}" src="{src}" class="ev1-fill" style="opacity:0;transform-origin:50% 30%;filter:brightness({dim})">')  # pages dimmed: the bar and the caption read first
        c.at(f'tl.set("#{iid}",{{opacity:1}},{cuts[k]:.4f});')
        if k + 1 < len(pages):
            c.at(f'tl.set("#{iid}",{{opacity:0}},{cuts[k + 1]:.4f});')
        c.at(f'tl.fromTo("#{iid}",{{scale:1.0}},{{scale:{1 + rate * (cuts[k + 1] - cuts[k]) * 3:.4f},duration:{cuts[k + 1] - cuts[k]:.4f},ease:"none",immediateRender:false}},{cuts[k]:.4f});')
        if k:
            sfx(c, cuts[k], 'click_soft')
    ta = fr(type_at or t0)
    chars = []
    for j, ch in enumerate(query):
        sid = c.uid('q')
        chars.append(f'<span id="{sid}" style="opacity:0">{esc(ch)}</span>')
        c.at(f'tl.set("#{sid}",{{opacity:1}},{ta + j * fpc / FPS:.4f});')
    cid = c.uid('cnt')
    t_cnt = ta + len(query) * fpc / FPS
    c.at(f'tl.set("#{cid}",{{opacity:1}},{t_cnt:.4f});tl.set("#{gid}-bar",{{backgroundColor:"#FCE8E6"}},{t_cnt:.4f});')
    bar = (f'<div id="{gid}-bar" style="position:absolute;right:{120 if not VERTICAL else 60}px;top:{96 if not VERTICAL else 230}px;width:{min(640, W - 120)}px;height:84px;border-radius:14px;background:#FFFFFF;'
           f'box-shadow:0 18px 50px rgba(0,0,0,.45);display:flex;align-items:center;padding:0 26px;box-sizing:border-box;gap:18px;'
           f'font:500 38px/1 var(--ev1-sans);color:#202124">'
           f'<div style="flex:1;white-space:nowrap">{"".join(chars)}<span class="ev1-cursor" style="background:#1A73E8;width:3px;margin-left:3px"></span></div>'
           f'<div id="{cid}" style="opacity:0;color:#5F6368;font-size:32px">{counter}</div>'
           f'<div style="width:2px;height:44px;background:#DADCE0"></div>'
           f'<div style="color:#5F6368;font-size:34px;letter-spacing:10px">&#8963;&#8964;</div><div style="color:#5F6368;font-size:40px">&#215;</div></div>')
    c.clip(t0, t1, f'<div id="{gid}" class="ev1-layer ev1-black">{"".join(imgs)}<div class="ev1-vignette"></div>{bar}</div>', z)
    sfx(c, t_cnt, 'click')
    return gid


# ------------------------------------------------------------------ B-ROLL (moving footage)
def broll(c, t0, t1, src, z, rate=0.055, direction='in', focus_in=0, start_scale=None, origin='50% 50%', media_start=0.0,
          punches=(), style=''):
    """A real moving clip, edge to edge, never still: REF-1 runs a steady digital zoom of
    4-7.5%/s on 62 of 79 shots (in on faces and objects, out on composites), and opens new
    interview cuts defocused, sharpening over ~9 frames (focus_in=9). punches = [(t, scale)]
    hard punch-ins on a word. Transform AND filter both reach the renderer on <video>
    (tested 2026-10-20)."""
    vid = c.uid('br')
    t0, t1 = fr(t0), fr(t1)
    d = t1 - t0
    s0 = start_scale or (1.0 if direction == 'in' else 1.0 + rate * d)
    s1 = s0 + rate * d if direction == 'in' else s0 - rate * d
    c.video(t0, t1, src, media_start, z, style=f'transform-origin:{origin};{style}', vid=vid)
    c.pre.append(f'gsap.set("#{vid}",{{scale:{s0:.4f}}});')
    c.at(f'tl.fromTo("#{vid}",{{scale:{s0:.4f}}},{{scale:{s1:.4f},duration:{d:.4f},ease:"none",immediateRender:false}},{t0:.4f});')
    if focus_in:
        c.at(f'tl.fromTo("#{vid}",{{filter:"blur(14px)"}},{{filter:"blur(0px)",duration:{focus_in / FPS:.4f},ease:"power2.out",immediateRender:false}},{t0:.4f});')
    for tp, sc in punches:
        # a hard punch on the word, then the slow drift carries on from the new size
        c.at(f'tl.set("#{vid}",{{scale:{sc:.4f}}},{fr(tp):.4f});'
             f'tl.fromTo("#{vid}",{{scale:{sc:.4f}}},{{scale:{sc + rate * (t1 - fr(tp)):.4f},duration:{t1 - fr(tp):.4f},ease:"none",immediateRender:false}},{fr(tp):.4f});')
    return vid


def overlay(c, t0, t1, src, z, blend='screen', opacity=1.0, media_start=0.0):
    """A texture clip over everything: light leak (screen), glitch noise (normal, 2-4 frames)."""
    vid = c.uid('ov')
    t0, t1 = fr(t0), fr(t1)
    c.video(t0, t1, src, media_start, z, style=f'mix-blend-mode:{blend};opacity:{opacity}', vid=vid)
    return vid


def neg_flash(c, t, ids, sound='click'):
    """REF-1's invert: ONE negative frame, then ONE overexposed bloom frame, then the shot.
    ids = the elements on screen at t (videos included — filters reach the renderer)."""
    t = fr(t)
    for i in ids:
        c.at(f'tl.set("#{i}",{{filter:"invert(1)"}},{t:.4f});'
             f'tl.set("#{i}",{{filter:"brightness(2.4) contrast(0.8) blur(3px)"}},{t + 1 / FPS:.4f});'
             f'tl.set("#{i}",{{filter:"none"}},{t + 2 / FPS:.4f});')
    if sound:
        sfx(c, t, sound)


# ------------------------------------------------------------------ FLASH / FINISH
def white_flash(c, t, z=90, frames_n=1, sound='click'):
    c.clip(t, fr(t) + frames_n / FPS, '<div class="ev1-layer" style="background:#fff"></div>', z)
    if sound:
        sfx(c, t, sound)


def finish(c, t0, t1, z=80, grid=True, vignette=True):
    """The overlays every image beat sits under: thirds grid (scaled with the push in
    REF-1, here static) and the vignette."""
    inner = ('<div class="ev1-grid"></div>' if grid else '') + ('<div class="ev1-vignette"></div>' if vignette else '')
    c.clip(t0, t1, inner, z, cls='', style=f'{FULL};pointer-events:none')
