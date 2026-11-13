"""director.py — de `momentos.json` a la edición entera, sin que nadie escriba un `build.py`.

El agente dice qué se ve en cada palabra (`momentos.json`); el director pone lo demás con las medidas de las
referencias (reference/devices.md, look.md, edl/): en qué cuadro corta, qué dispositivo dibuja cada momento, el empuje
de cada imagen, los cortes de dentro de un momento largo, las entradas, los subtítulos palabra por palabra (blancos, o
en tinta sobre lo claro), la rejilla, los clics y el cierre. Lo usa `scripts/hacer.py`, desde la raíz del proyecto:

    from director import plan, armar
    p = plan(m, words)                      # los tiempos y lo que se puede revisar sin material (`--revisa`)
    datos = armar(m, words, hecho, p)       # src/edicion.json, sfx-cues.txt, public/sonido.wav, work/edicion-datos.json

`m` es momentos.json; `words`, work/tx/words.json; `hecho`, work/material.json (lo deja scripts/material.py).

Qué puede pedir un momento (lo dice entero SKILL.md):
  ve      el nombre de una cosa de `material`, una lista de ellas, o `cara`, `negro`, `maquina`
  forma   con una lista: `serie` (una por palabra), `rafaga`, `tarjetas`, `muro`, `triptico`, `mundo`
  entra   `corte`, `mosaico`, `enfoque`, `negativo`, `blanco`, `glitch`
  grande  la palabra enorme (`clave`, `titulo`, `choque`); en la cara, `mega`: roja y detrás de la cabeza
"""
import json
import os
import re
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent / 'scripts'))
sys.path.insert(0, str(AQUI.parent.parent / 'video-base' / 'scripts'))
from ev1_more import *          # noqa: E402,F401,F403  (los dispositivos: ev1_devices + ev1_more)
import ev1_treat                # noqa: E402
from momentos import anclar, busca, normal, palabras_de  # noqa: E402,F401
from sonido import mezclar      # noqa: E402

ESPECIALES = ('cara', 'negro', 'maquina')
FORMAS = ('serie', 'rafaga', 'tarjetas', 'muro', 'triptico', 'mundo')
ENTRADAS = ('corte', 'mosaico', 'enfoque', 'negativo', 'blanco', 'glitch')
GRANDES = {'clave': 'key', 'titulo': 'title', 'choque': 'shock'}
COLA = 0.8              # lo que la última imagen (y su palabra grande) se queda tras la última palabra: el remate se ve
CIERRE = 0.8            # y luego, segundos de negro con el golpe del final
# Lo que aguanta una imagen quieta antes de que el director corte dentro de ella: el cuerpo de un video respira a
# 1,2–2,0 s por imagen (look.md §3); cuatro segundos quietos es un error.
RESPIRA = 1.5
CLARO = 0.60            # con la franja de los subtítulos más clara que esto, van en tinta
ORIGENES = ('50% 50%', '30% 36%', '70% 42%', '46% 68%', '62% 30%')
EMPUJES = (0.045, 0.06, 0.075, 0.05, 0.07)          # el zoom constante de 4 a 7,5 %/s de 62 de 79 planos de REF-1
# De cada ocho cortes sin `entra`, dos abren desenfocados y uno en negativo: lo demás corta seco, con su clic.
ENTRA_SOLO = ('corte', 'corte', 'enfoque', 'corte', 'corte', 'negativo', 'corte', 'enfoque')


def lista_ve(mo):
    ve = mo.get('ve')
    return [ve] if isinstance(ve, str) else list(ve or [])


def despegar(words):
    """
    Una palabra corta que el alineador dejó pegada al final de la frase anterior, antes de una pausa («…muy padre.»
    «Me», 1,2 s de silencio, «entusiasma»): va con la que sigue. Si no, el momento que empieza en ella corta la imagen
    un segundo antes de que se diga, y la palabra roja de «padre» duraba 0,4 s.
    """
    fuera = [dict(w) for w in words]
    for k in range(len(fuera) - 1):
        w, sig = fuera[k], fuera[k + 1]
        pegada = k > 0 and w['s'] - fuera[k - 1]['e'] < 0.15
        if pegada and w['e'] - w['s'] <= 0.12 and sig['s'] - w['e'] >= 0.45:
            w['e'] = round(sig['s'] - 0.02, 3)
            w['s'] = round(w['e'] - 0.16, 3)
    return fuera


def cuando(x, texto):
    """El inicio, dentro del momento, de la primera palabra de `texto`; None si no se dice en él."""
    primera = normal(str(texto).split()[0]) if str(texto).split() else ''
    return next((p[1] for p in x['palabras'] if normal(p[0]) == primera), None)


def mega_en(x):
    """Cuándo entra la palabra roja de un momento de cara: en su palabra, o al empezar si es la primera."""
    t = cuando(x, x['mega'])
    return fr(t if t is not None and t - x['t0'] > 0.1 else x['t0'])


REFERENCIA = re.compile(r'^(mixkit|archive|commons|nasa|yt):|^https?://', re.I)
VIDEOS = ('.mp4', '.webm', '.mov', '.m4v', '.ogv', '.mkv')
FOTOS = ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif')


def directas(material, momentos):
    """
    Una referencia puesta tal cual en `ve` (`"ve": "mixkit:4939"`) es una cosa más de `material`, sin tener que
    nombrarla: lo que es (clip, foto, página, post) sale de la propia referencia. Con nombre van las que piden algo
    (una `pagina` con su `marca`, un `desde`, un `look`). Devuelve el material entero y los momentos con sus nombres.
    """
    material = dict(material)
    de_ref = {}

    def cosa(ref):
        r = ref.lower().split('?')[0]
        if r.startswith(('mixkit:', 'archive:', 'yt:', 'nasa:')):
            return {'clip': ref}            # las de `nasa:` que son una foto, lo dice material.py al bajarla
        if r.startswith('commons:'):
            return {'clip': ref} if r.endswith(VIDEOS) else {'foto': ref}
        if re.search(r'(x|twitter)\.com/[^/]+/status', r):
            return {'post': ref}
        return {'clip': ref} if r.endswith(VIDEOS) else {'foto': ref} if r.endswith(FOTOS) else {'pagina': ref}

    def nombre(ref):
        if ref not in de_ref:
            base = re.sub(r'[^a-z0-9]+', '-', ref.lower().replace('file:', '')).strip('-')[:36].strip('-') or 'cosa'
            id_, n = base, 2
            while id_ in material:
                id_, n = f'{base}-{n}', n + 1
            material[id_] = cosa(ref)
            de_ref[ref] = id_
        return de_ref[ref]

    fuera = []
    for mo in momentos:
        ve = mo.get('ve')
        if isinstance(ve, str) and ve not in material and REFERENCIA.match(ve):
            mo = {**mo, 've': nombre(ve)}
        elif isinstance(ve, list):
            mo = {**mo, 've': [nombre(v) if isinstance(v, str) and v not in material and REFERENCIA.match(v) else v for v in ve]}
        fuera.append(mo)
    return material, fuera


def plan(m, words):
    """
    Los tiempos de cada momento sobre las palabras de la toma y todo lo que está mal y se puede decir sin bajar nada.
    Devuelve {'momentos': [{..., t0, t1, i0, i1, palabras}], 'errores': [...], 'avisos': [...], 'fin', 'dur', 'duras'}.
    """
    errores, avisos = [], []
    material, momentos = directas(m.get('material') or {}, m.get('momentos') or [])
    if not momentos:
        return {'momentos': [], 'errores': ['no tiene momentos'], 'avisos': [], 'fin': 0, 'dur': 0, 'duras': {}, 'material': material}
    dichas = [normal(w['w']) for w in words]
    # Las palabras que el transcriptor dejó vacías al normalizar (un signo suelto) no cuentan para buscar.
    indices_reales = [k for k, d in enumerate(dichas) if d]
    solo = [dichas[k] for k in indices_reales]
    indices, errs = anclar(momentos, solo, 'la grabación')
    errores += errs
    fin = fr(words[-1]['e'])
    # El último momento no se corta con la última sílaba: «aprende a preguntar» duraba 0,8 s y su palabra roja, 0,4.
    cola = fr(fin + COLA)
    dur = fr(cola + CIERRE)
    fuera = []
    for k, mo in enumerate(momentos):
        i0 = indices_reales[indices[k]] if indices[k] >= 0 else None
        fuera.append({**mo, 'k': k, 'i0': i0})
    validos = [x for x in fuera if x['i0'] is not None]
    for n, x in enumerate(validos):
        sig = validos[n + 1]['i0'] if n + 1 < len(validos) else len(words)
        x['i1'] = sig
        # El primer momento empieza en el cuadro 0, diga lo que diga su palabra: nada antes de él.
        x['t0'] = 0.0 if n == 0 else fr(words[x['i0']]['s'])
        x['t1'] = fr(words[sig]['s']) if sig < len(words) else cola
        x['palabras'] = [(w['w'], max(x['t0'], fr(w['s'])), w['e']) for w in words[(0 if n == 0 else x['i0']):sig]]
    # La palabra roja se queda 0,9 s o más: si se dice al final de su momento, el siguiente empieza un poco después (su
    # primera palabra se sigue oyendo y subtitulando a su hora, sobre la cara). Pedírselo al agente costaba una vuelta.
    for n, x in enumerate(validos[:-1]):
        if x.get('mega') and lista_ve(x)[:1] == ['cara']:
            hasta = fr(mega_en(x) + 0.9)
            sig = validos[n + 1]
            if x['t1'] < hasta and sig['t1'] - hasta >= 0.6:
                x['t1'] = sig['t0'] = hasta
    usados, duras = set(), {}
    cara = 0.0
    con_material = clips = recortes = 0
    antes_cara = False
    for x in fuera:
        que = f"momento {x['k'] + 1} («{x.get('palabra', '')}»)"
        ve = lista_ve(x)
        d = (x.get('t1', 0) - x.get('t0', 0)) if x['i0'] is not None else 0
        if not ve:
            errores.append(f"{que}: falta `ve` (una cosa de `material`, una lista, o `cara`, `negro`, `maquina`)")
            continue
        especial = ve[0] in ESPECIALES
        if especial and len(ve) > 1:
            errores.append(f"{que}: `{ve[0]}` va solo, sin lista")
        for id_ in ve:
            if id_ not in ESPECIALES and id_ not in material:
                errores.append(f"{que}: no hay «{id_}» en `material` (ni es una referencia: `mixkit:…`, `commons:File:…`, una URL)")
            usados.add(id_)
        forma = x.get('forma')
        if forma and forma not in FORMAS:
            errores.append(f"{que}: no hay forma «{forma}» (hay: {', '.join(FORMAS)})")
        if forma in ('rafaga', 'tarjetas', 'muro', 'triptico') and len(ve) < 2:
            errores.append(f"{que}: `{forma}` pide una lista en `ve` (dos cosas o más)")
        if forma == 'triptico' and len(ve) != 3:
            errores.append(f"{que}: `triptico` son tres cosas")
        if forma == 'tarjetas' and not 2 <= len(ve) <= 5:
            errores.append(f"{que}: `tarjetas` son de dos a cinco cosas")
        if forma == 'muro' and len(ve) < 4:
            errores.append(f"{que}: `muro` pide cuatro cosas o más (las repite hasta llenar la pared)")
        if x.get('entra') and x['entra'] not in ENTRADAS:
            errores.append(f"{que}: no hay entrada «{x['entra']}» (hay: {', '.join(ENTRADAS)})")
        g = x.get('grande')
        if isinstance(g, dict) and g.get('tipo', 'clave') not in GRANDES:
            errores.append(f"{que}: `grande.tipo` es {', '.join(GRANDES)}")
        # Cada palabra en pantalla se dijo: la grande es de la toma, no un eslogan.
        for campo, texto in (('grande', g.get('texto') if isinstance(g, dict) else g), ('mega', x.get('mega'))):
            if texto and busca(solo, str(texto)) < 0:
                errores.append(f"{que}: `{campo}` («{texto}») no se dice en la grabación: la palabra grande es una que se dice, tal cual")
        if ve[0] == 'maquina' and not x.get('texto'):
            errores.append(f"{que}: `maquina` pide `texto` (lo que se teclea: una cita real, tal cual)")
        if (x.get('mega') or forma == 'mundo') and ve[0] != 'cara' and forma != 'mundo':
            errores.append(f"{que}: `mega` es la palabra roja detrás de tu cabeza: va en un momento `cara`")
        if x['i0'] is None:
            continue
        if x.get('mega') or forma == 'mundo':
            recortes += 1
            x['recorte'] = True
        if x.get('mega') and ve[0] == 'cara' and not errs and x['t1'] - mega_en(x) < 0.7:
            errores.append(f"{que}: «{x['mega']}» se dice al final del momento y la palabra roja se vería {x['t1'] - mega_en(x):.1f} s: "
                           "que el momento siguiente empiece más tarde (0,7 s o más después de esa palabra)")
        if ve[0] == 'cara':
            cara += d
            if antes_cara:
                errores.append(f"{que}: dos momentos de cara seguidos: júntalos en uno o mete material en medio")
            if d > 4.0 and not x.get('mega') and not errs:
                errores.append(f"{que}: {d:.1f} s seguidos de cara: pártelo con material en medio (la cara va en tramos de 1,2 a 2,5 s)")
        elif ve[0] not in ESPECIALES:
            con_material += 1
            tipos = [next((t for t in ('clip', 'foto', 'pagina', 'post', 'logo', 'archivo') if t in (material.get(i) or {})), None) for i in ve]
            if 'clip' in tipos or any(str((material.get(i) or {}).get('archivo', '')).lower().endswith(('.mp4', '.mov', '.webm')) for i in ve):
                clips += 1
            if forma in ('rafaga', None) and len(ve) == 1 and d > 6.0 and not errs:
                errores.append(f"{que}: {d:.1f} s con una sola imagen: pártelo en dos momentos con otra cosa (la imagen cambia cada 0,6–1,5 s)")
            # Lo que tiene que durar cada clip: lo que suman los momentos en que sale.
            for i in ve:
                duras[i] = duras.get(i, 0) + d
        antes_cara = ve[0] == 'cara'
    # Lo de `material` que ningún momento usa no se baja ni se dice: no vale una vuelta del agente.
    material = {id_: c for id_, c in material.items() if id_ in usados}
    total = max(fin, 0.1)
    n = len(validos)
    # Con un momento sin anclar, los tiempos de sus vecinos no son los de verdad: lo que se cuenta con ellos se dice
    # cuando ya estén todos en su sitio (si no, un error traía cinco falsos detrás).
    if n and total > 8 and not errs:
        if total / n > 2.6:
            errores.append(f"son {n} momentos para {total:.0f} s (uno cada {total / n:.1f} s): hacen falta {int(total / 2.2) + 1} o más. "
                           "Cada frase lleva su imagen, y casi cada sustantivo, la suya")
        if cara / total > 0.45 and not m.get('cara_libre'):
            errores.append(f"la cara ocupa el {cara / total:.0%} del video: que sea del 25 al 35 %; lo demás, material de lo que se nombra")
        if cara / total < 0.195 and not m.get('cara_libre'):
            errores.append(f"la cara sale el {cara / total:.0%} del video: que salga del 25 al 35 % (en lo que es opinión o va a "
                           "cámara: «honestamente», «yo», la pregunta), o `\"cara_libre\": \"<por qué>\"`")
        if con_material and clips / con_material < 0.4 and not m.get('sin_clips'):
            errores.append(f"solo {clips} de {con_material} momentos de material llevan un clip: imagen en movimiento en la mitad o más "
                           "(buscar.py da clips de Mixkit, archive.org, NASA y Commons), o `\"sin_clips\": \"<por qué>\"`")
        if recortes > 2:
            errores.append(f"hay {recortes} momentos con recorte (`mega` o `mundo`): es para la frase estrella, dos como mucho")
        # Lo que hace que sea este estilo y no un pase de clips de banco: con solo «una cosa por momento», un agente
        # entregó 34 momentos sin una ráfaga, una tarjeta ni una palabra grande (10 nov 2026).
        grandes = sum(1 for x in validos if x.get('mega') or x.get('grande'))
        if not any(x.get('mega') for x in validos):
            errores.append("ningún momento lleva `mega`: ponla en la frase estrella a cámara (`\"ve\": \"cara\", \"mega\": \"<la palabra>\"`); "
                           "es la palabra roja detrás de tu cabeza, y la portada")
        if total > 25 and grandes < 3:
            errores.append(f"solo {grandes} momento(s) llevan palabra grande: además de `mega`, pon `grande` en dos o más palabras que "
                           "importan (una cifra, el nombre, el remate), con su `tipo`")
        if total > 25 and not any(len(lista_ve(x)) > 1 for x in validos):
            errores.append("ningún momento enseña varias cosas a la vez: pon unas `tarjetas` (una lista que se nombra), una `rafaga` "
                           "(una cantidad o una palabra abstracta: de cuatro a seis imágenes de la misma forma) o un `muro` («todas», «en todas partes»)")
        if total > 25 and not any(x.get('ve') == 'negro' for x in validos) and not m.get('sin_negro'):
            errores.append("ningún momento va en `negro`: uno, en la frase que pesa («nada», «nadie», la pausa antes del remate), o "
                           "`\"sin_negro\": \"<por qué>\"`")
        if not any(t in c for c in material.values() if isinstance(c, dict) for t in ('pagina', 'post')) and not m.get('sin_paginas'):
            errores.append("ninguna cosa es una `pagina` o un `post`: lo que se afirma se enseña en su página, con la `marca` en lo que "
                           "se dice (el precio en la página de precios, la cifra en su artículo, el anuncio en su post); un logo o un "
                           "clip de banco no lo prueban. Si la grabación no afirma nada de nadie, `\"sin_paginas\": \"<por qué>\"`")
    return {'momentos': validos, 'errores': errores, 'avisos': avisos, 'fin': fin, 'cola': cola, 'dur': dur, 'duras': duras,
            'cara': round(cara / total, 3), 'material': material}


# ---------------------------------------------------------------------------------------------- el armado
class Estado:
    """Lo que el director lleva de un momento al siguiente: la comp, los cortes, los tramos para los subtítulos."""

    def __init__(self, c):
        self.c = c
        self.cortes = []        # cada segundo en que cambia la imagen
        self.tramos = []        # (a, b, luz, suelo): para el color y el sitio de los subtítulos
        self.n = 0              # cuántas imágenes van (para rotar empujes y orígenes)
        self.sin_entra = 0
        self.movimiento = 0.0   # segundos con imagen en movimiento (clips y cara)
        self.visto = {}         # de cada clip, cuántos segundos se han enseñado ya
        self.portada = None     # el segundo del cuadro de la portada: la palabra roja ya entera
        self.portada_2 = None   # si no hay `mega`, la primera palabra `grande`

    def corte(self, t, sonido='click'):
        self.cortes.append(round(fr(t), 3))
        if sonido:
            sfx(self.c, t, sonido)

    def tramo(self, a, b, luz, suelo='imagen'):
        self.tramos.append((fr(a), fr(b), luz, suelo))


def partes(x, n, minimo=0.35):
    """`n` cortes dentro de un momento, en los inicios de sus palabras más cercanos a partirlo en partes iguales."""
    t0, t1 = x['t0'], x['t1']
    inicios = sorted({fr(p[1]) for p in x['palabras'] if t0 + minimo <= fr(p[1]) <= t1 - minimo})
    fuera = [t0]
    for k in range(1, n):
        ideal = t0 + (t1 - t0) * k / n
        cerca = min(inicios, key=lambda t: abs(t - ideal)) if inicios else fr(ideal)
        if abs(cerca - ideal) > (t1 - t0) / n * 0.45:
            cerca = fr(ideal)
        if cerca - fuera[-1] >= minimo:
            fuera.append(cerca)
    return fuera + [t1]


def entrada(e, x, a, lleno, ids=(), primero=False):
    """La entrada de un momento sobre su imagen (lo que ya se puso en `a`). Devuelve True si puso su propio sonido."""
    c = e.c
    como = x.get('entra')
    if not como:
        if primero:
            como = 'mosaico' if lleno else 'blanco'
        else:
            como = ENTRA_SOLO[e.sin_entra % len(ENTRA_SOLO)]
            e.sin_entra += 1
    if como == 'mosaico' and lleno:
        fin = tile_reveal(c, a, lleno, z=6, seed=3 + x['k'], frames_n=9, size=(W, H))
        c.clip(a, fin, '<div class="ev1-layer ev1-black"></div>', z=5)
        return True
    if como == 'negativo' and ids:
        neg_flash(c, a, list(ids))
        return True
    if como == 'blanco':
        white_flash(c, a, z=90, frames_n=1)
        return True
    if como == 'glitch' and lleno and os.path.exists(os.path.join('public', lleno)):
        base = ev1_treat.load(os.path.join('public', lleno))
        base = ev1_treat.cover(base, W, H)
        rutas = []
        for j, g in enumerate(ev1_treat.glitch_frames(base, 3, seed=3 + x['k'])):
            ruta = f"assets/m/_g{x['k']}_{j}.jpg"
            ev1_treat.cv2.imwrite(os.path.join('public', ruta), g)
            rutas.append(ruta)
        frames(c, a, rutas, z=7)
        return True
    return False        # corte seco (y `enfoque`, que lo pone quien dibuja)


def enfoca(e, x, primero):
    """Si este momento abre desenfocado (lo pide `entra` o le toca en la rueda)."""
    if x.get('entra'):
        return x['entra'] == 'enfoque'
    return not primero and ENTRA_SOLO[e.sin_entra % len(ENTRA_SOLO)] == 'enfoque'


def una_foto(e, x, h, a, b, z=1, primero=False):
    """Una foto a cuadro completo: su empuje y, si dura, cortes dentro de ella a otra parte de la misma imagen."""
    c = e.c
    n = max(1, round((b - a) / RESPIRA))
    cortes = partes({**x, 't0': a, 't1': b}, n)
    ids = []
    for j in range(len(cortes) - 1):
        s, t = cortes[j], cortes[j + 1]
        desde = 1.0 if j == 0 else 1.0 + 0.11 * j + 0.06 * (j % 2)
        _, iid = still(c, s, t, h['lleno'], z=z, push=desde + EMPUJES[(e.n + j) % 5] * (t - s) * 1.2,
                       origin=ORIGENES[0 if j == 0 else (e.n + j) % 5], push_from=desde)
        ids.append(iid)
        if j:
            e.corte(s, 'click_soft')
    sonado = entrada(e, x, a, h['lleno'], ids[:1], primero)
    e.corte(a, None if sonado else 'click')
    finish(c, a, b, z=80, grid=True, vignette=False)
    e.tramo(a, b, h.get('luz', 0.3))
    e.n += 1


def un_clip(e, x, h, a, b, z=1, desde=0.0, primero=False):
    """Un clip a cuadro completo, con su zoom constante y, si dura, un golpe de zoom en una palabra de en medio."""
    c = e.c
    n = max(1, round((b - a) / (RESPIRA * 1.25)))
    cortes = partes({**x, 't0': a, 't1': b}, n)
    rate = EMPUJES[e.n % 5]
    golpes = [(t, 1.0 + 0.12 * j + rate * (t - a)) for j, t in enumerate(cortes[1:-1], 1)]
    vid = broll(c, a, b, h['clip'], z=z, rate=rate, focus_in=9 if enfoca(e, x, primero) else 0, media_start=desde, punches=golpes)
    for t, _ in golpes:
        e.corte(t, 'click_soft')
    sonado = entrada(e, x, a, h.get('tarjeta'), [vid], primero)
    e.corte(a, None if sonado else 'click')
    e.tramo(a, b, h.get('luz', 0.3))
    e.movimiento += b - a
    e.n += 1
    return vid


def una_pagina(e, x, h, a, b):
    """Una página real a cuadro completo: entra desenfocada, empuja y el marcador barre lo que se resalta."""
    c = e.c
    oscura = h.get('luz', 0.8) < 0.45
    marca_t = None
    quiere = x.get('marca_en')
    if quiere:
        marca_t = next((p[1] for p in x['palabras'] if normal(p[0]) == normal(quiere)), None)
    page_card(c, a, b, h['pagina'], z=1, marks=h.get('marcas') or [], mark_t=marca_t, dark=oscura, focus_frames=6,
              push=0.05 if b - a < 2 else 0.03)
    e.corte(a)
    e.tramo(a, b, h.get('luz', 0.8), 'pagina')
    e.n += 1


def una_tarjeta(e, x, h, a, b):
    """Un post, un bloque de una página o un logo: una tarjeta sobre negro que entra enfocándose."""
    c = e.c
    if h['tipo'] == 'logo':
        c.clip(a, b, '<div class="ev1-layer ev1-black"></div>', z=1)
        marca = img_mark(c, a, b, h['logo'], z=2, width=420 if not VERTICAL else 380)
        # Tampoco un logo se queda quieto: crece despacio lo que dura (nada se queda quieto en las referencias).
        if b - a > 0.5:
            c.at(f'tl.fromTo("#{marca}",{{scale:1}},{{scale:{1 + 0.05 * (b - a):.3f},duration:{b - a - 6 / FPS:.4f},ease:"none",'
                 f'immediateRender:false}},{a + 6 / FPS:.4f});')
        e.corte(a)
        e.tramo(a, b, 0.0, 'logo')
        return
    ancho = min(1180 if not VERTICAL else W - 120, int(h.get('ancho') or 1180))
    alto = ancho / max(0.2, h.get('proporcion') or 1.6)
    # Que quepa a lo alto con sitio para los subtítulos debajo.
    tope = H * (0.72 if not VERTICAL else 0.5)
    if alto > tope:
        ancho = int(ancho * tope / alto)
    marca = None
    if h.get('marcas'):
        k = ancho / (h.get('ancho') or ancho)
        mx, my, mw, mh = h['marcas'][0]
        marca = (round(mx * k), round(my * k), round(mw * k), round(mh * k), a + 0.5)
    focus_card(c, a, b, h['tarjeta'], z=1, card_w=ancho, frames_n=10, mark=marca, y=None if not VERTICAL else 760)
    e.corte(a)
    e.tramo(a, b, 0.0, 'tarjeta')
    e.n += 1


def una_cosa(e, x, h, a, b, primero=False, desde=0.0):
    """Una sola cosa de material en [a, b): según lo que es."""
    if h['tipo'] == 'clip':
        # Un clip que vuelve a salir sigue donde se quedó: no repite su primer segundo.
        desde = e.visto.get(h.get('id'), 0.0)
        if desde + (b - a) > h.get('dura', 1e9) + 0.05:
            desde = 0.0
        e.visto[h.get('id')] = desde + (b - a)
        un_clip(e, x, h, a, b, desde=desde, primero=primero)
    elif h['tipo'] == 'foto':
        una_foto(e, x, h, a, b, primero=primero)
    elif h['tipo'] == 'pagina' and not h.get('es_tarjeta'):
        una_pagina(e, x, h, a, b)
    else:
        una_tarjeta(e, x, h, a, b)


def cortes_en_palabras(x, n, minimo=4 / FPS):
    """`n` inicios dentro del momento, uno por palabra (o repartidos si hay menos palabras que cosas)."""
    t0, t1 = x['t0'], x['t1']
    inicios = sorted({fr(p[1]) for p in x['palabras']} | {t0})
    if len(inicios) >= n:
        elegidos = [inicios[round(k * (len(inicios) - 1) / max(1, n - 1))] if n > 1 else inicios[0] for k in range(n)]
        elegidos[0] = t0
    else:
        elegidos = [fr(t0 + (t1 - t0) * k / n) for k in range(n)]
    fuera = [t0]
    for t in elegidos[1:]:
        fuera.append(max(t, fuera[-1] + minimo))
    return [t for t in fuera if t < t1 - 2 / FPS] or [t0]


def serie(e, x, hs, primero=False):
    """Varias cosas cortadas en las palabras: una por palabra, un clic por corte."""
    cortes = cortes_en_palabras(x, len(hs))
    for j, t in enumerate(cortes):
        fin = cortes[j + 1] if j + 1 < len(cortes) else x['t1']
        una_cosa(e, {**x, 'entra': x.get('entra') if j == 0 else 'corte'}, hs[j], t, fin, primero=primero and j == 0)


def rafaga(e, x, hs):
    """Una ráfaga: imágenes de 2 a 4 cuadros cada una, de la misma forma, un clic cada una (el strobe de REF-2 y REF-3)."""
    c = e.c
    a, b = x['t0'], x['t1']
    paso = 2 if b - a < 0.7 else 3 if b - a < 1.6 else 4
    n = max(1, round((b - a) * FPS / paso))
    seq(c, [(hs[k % len(hs)]['lleno'], a + paso * k / FPS) for k in range(n)], z=1, t_end=b, rot=4, push=0.08, seed=5 + x['k'])
    for k in range(n):
        e.cortes.append(round(a + paso * k / FPS, 3))
    e.tramo(a, b, 0.3)
    e.n += 1


def tarjetas(e, x, hs):
    """Las cosas caen una por palabra sobre negro (una caja blanca un cuadro antes de cada una), se alejan y estallan."""
    c = e.c
    a, b = x['t0'], x['t1']
    n = len(hs)
    caen = cortes_en_palabras(x, n, minimo=3 / FPS)
    caen = [max(t, a + 2 / FPS) for t in caen] + [a + 2 / FPS + 0.2 * k for k in range(len(caen), n)]
    giros = (-4, 2, -3, 3, -2)
    cartas = []
    for k, h in enumerate(hs):
        if VERTICAL:
            w = 700 if n <= 3 else 560
            cx = round(W * (0.42 if k % 2 == 0 else 0.58))
            cy = round(H * (0.30 + 0.42 * (k / max(1, n - 1)) if n > 1 else 0.5))
        else:
            w = round(min(640, (W - 160) / n * 1.12))
            cx = round(W * (k + 0.5) / n)
            cy = round(H * 0.5 + (28 if k % 2 else -18))
        cartas.append((h['tarjeta'], cx, cy, w, giros[k % 5], caen[k]))
    pop_shatter(c, a, b, cartas, z=1, shatter=b - a > 1.0)
    for t in caen:
        e.cortes.append(round(fr(t), 3))
    e.tramo(a, b, 0.0, 'tarjeta')
    e.n += 1


def muro(e, x, hs):
    c = e.c
    wall3d(c, x['t0'], x['t1'], [h['tarjeta'] for h in hs], z=1, cols=4 if not VERTICAL else 3)
    e.corte(x['t0'])
    e.tramo(x['t0'], x['t1'], 0.1, 'tarjeta')
    e.n += 1


def triptico(e, x, hs):
    c = e.c
    if all(h['tipo'] == 'clip' for h in hs):
        triptych(c, x['t0'], x['t1'], [(h['clip'], 0.0) for h in hs], z=1)
        e.movimiento += x['t1'] - x['t0']
        e.corte(x['t0'])
        e.tramo(x['t0'], x['t1'], 0.3)
    else:
        tarjetas(e, x, hs)


def cara(e, x, primero=False):
    """Quien habla, con la cámara cruda. Con `mega`, la palabra roja enorme detrás de su cabeza (pide el recorte)."""
    c = e.c
    a, b = x['t0'], x['t1']
    rate = 0.03
    golpe_t = None
    if x.get('golpe'):
        golpe_t = next((p[1] for p in x['palabras'] if normal(p[0]) == normal(x['golpe'])), None)
    mega = x.get('mega')
    mega_t = mega_en(x) if mega else None
    if golpe_t is None and mega_t is not None and mega_t > a:
        golpe_t = mega_t
    if golpe_t is None and b - a > 2.4:
        golpe_t = partes(x, 2)[1]
    golpes = [(golpe_t, 1.13)] if golpe_t and a < golpe_t < b - 0.2 else []
    broll(c, a, b, 'assets/media/cam_raw.mp4', z=1, rate=rate, media_start=a, origin='50% 38%', punches=golpes)
    for t, _ in golpes:
        e.corte(t, 'click_soft')
    if primero:
        white_flash(c, a, z=90, frames_n=1, sound=None)
    e.corte(a, None if primero else 'click')
    if mega and x.get('recorte_archivo'):
        escala = 1.13 if golpes and golpes[0][0] <= mega_t else 1.0 + rate * (mega_t - a)
        y = x.get('mega_y') or (330 if not VERTICAL else round(H * 0.27))
        # Que quepa a lo ancho también en horizontal: «MODELO» a 560 px medía 2.300 y salía cortada.
        letras = max(1, len(str(mega)))
        keyword(c, mega_t, b, str(mega).upper(), z=20, x=W // 2, y=y, kind='mega', blur_in=False,
                size=min(560, int(0.94 * W / (letras * 0.68))))
        broll(c, mega_t, b, x['recorte_archivo'], z=30, rate=rate, origin='50% 38%', start_scale=escala, media_start=0.0)
        sfx(c, mega_t, 'hit', 0.8)
        e.portada = e.portada or round(mega_t + (b - mega_t) * 0.6, 3)
    e.tramo(a, b, 0.2, 'cara')
    e.movimiento += b - a


def mundo(e, x, hs):
    """La frase estrella: quien habla, recortado, delante de un mundo que cambia en las palabras."""
    c = e.c
    a, b = x['t0'], x['t1']
    cambios = cortes_en_palabras(x, len(hs), minimo=0.3)
    mundos = [('video' if h['tipo'] == 'clip' else 'img', h['clip'] if h['tipo'] == 'clip' else h['lleno'], t, h.get('tarjeta') if h['tipo'] != 'clip' else None, 0.0)
              for h, t in zip(hs, cambios)]
    mega = None
    if x.get('mega'):
        t = next((p[1] for p in x['palabras'] if normal(p[0]) == normal(str(x['mega']).split()[0])), a)
        mega = (str(x['mega']).upper(), max(a, t), x.get('mega_y') or (330 if not VERTICAL else round(H * 0.27)))
    cutout_world(c, a, b, mundos, x['recorte_archivo'], a, z=1, mega=mega)
    for t in cambios:
        e.corte(t, 'click' if t == a else None)
    finish(c, a, b, z=80, grid=True, vignette=False)
    e.tramo(a, b, 0.3, 'cara')
    e.movimiento += b - a
    e.n += 1


def negro(e, x):
    """La tarjeta negra («nada», «nadie», un silencio): la palabra sola y chica, el suelo baja."""
    c = e.c
    c.clip(x['t0'], x['t1'], '<div class="ev1-layer ev1-black"></div>', z=1)
    sfx(c, x['t0'], 'subtone')
    e.cortes.append(round(x['t0'], 3))
    e.tramo(x['t0'], x['t1'], 0.0, 'negro')


def maquina(e, x):
    """Una cita tecleada sobre negro tras un cursor de bloque: lo que no se puede enseñar tal cual (un post con emojis)."""
    c = e.c
    a, b = x['t0'], x['t1']
    renglones = [r for r in str(x['texto']).split('\n') if r.strip()][:4]
    letras = sum(len(r) for r in renglones) or 1
    por_letra = max(1, min(3, int((b - a - 0.4) * FPS / letras)))
    t = a + 2 / FPS
    lineas = []
    for r in renglones:
        lineas.append((r, t, por_letra, ''))
        t += len(r) * por_letra / FPS + 0.1
    typewriter(c, a, b, lineas, z=1, font=46 if not VERTICAL else 40)
    e.cortes.append(round(a, 3))
    e.tramo(a, b, 0.0, 'negro')


def palabra_grande(e, x):
    """La palabra de la frase, enorme, encima de lo que haya. Devuelve desde cuándo, para que los subtítulos callen."""
    g = x.get('grande')
    if not g:
        return None
    c = e.c
    if isinstance(g, str):
        g = {'texto': g}
    texto = str(g.get('texto', '')).strip()
    tipo = g.get('tipo') or 'clave'
    t = next((p[1] for p in x['palabras'] if normal(p[0]) == normal((g.get('en') or texto).split()[0])), x['t0'])
    t = fr(max(x['t0'], t))
    if x['t1'] - t < 0.25:
        t = x['t0']
    if tipo == 'choque':
        c.clip(t, x['t1'], '<div class="ev1-layer" style="background:rgba(6,6,7,.62)"></div>', z=38)
        keyword(c, t, x['t1'], texto.upper(), z=40, kind='shock', size=fit_size(texto, 'shock', 240 if len(texto) <= 6 else 176))
        sfx(c, t, 'hit', 0.7)
    elif tipo == 'titulo':
        c.clip(t, x['t1'], '<div class="ev1-layer" style="background:rgba(6,6,7,.45)"></div>', z=38)
        keyword(c, t, x['t1'], texto, z=40, kind='title', sound='swish')
    else:
        # Blanca sobre una página blanca no se lee («veinte» sobre los precios): lo claro se oscurece debajo.
        suelo = next((tr for tr in e.tramos if tr[0] <= t + 1e-6 < tr[1]), None)
        if suelo and suelo[2] > 0.45:
            c.clip(t, x['t1'], '<div class="ev1-layer" style="background:rgba(6,6,7,.55)"></div>', z=38)
        keyword(c, t, x['t1'], texto, z=40, kind='key', size=fit_size(texto, 'key', 150))
    e.portada_2 = e.portada_2 or round(t + (x['t1'] - t) * 0.6, 3)
    return t


def grupos(palabras, hasta, cortes):
    """Los subtítulos de un tramo: de tres a cuatro palabras por grupo, cortando en la puntuación y en cada imagen."""
    tope_n, tope_letras = (3, 17) if VERTICAL else (4, 26)
    cortes = sorted(cortes)
    fuera, g = [], []
    for w, t, _ in palabras:
        if t >= hasta:
            break
        cambia = g and any(g[0][1] < k <= t + 1e-6 for k in cortes)
        if g and (cambia or len(g) >= tope_n or sum(len(p[0]) + 1 for p in g) + len(w) > tope_letras):
            fuera.append(g)
            g = []
        g.append((w, t))
        if w.rstrip().endswith(('.', ',', '?', '!', ':', ';', '…')):
            fuera.append(g)
            g = []
    if g:
        fuera.append(g)
    return fuera


def subtitulos(e, momentos, corrige, calla):
    """Las palabras de la toma, cada una en su inicio: blancas, o en tinta donde lo de detrás es claro."""
    c = e.c
    arreglo = {normal(k): v for k, v in (corrige or {}).items()}

    def escrita(w):
        solo = normal(w)
        if solo in arreglo:
            cola = w[len(w.rstrip('.,;:!?…')):]
            return arreglo[solo] + cola
        return w

    for x in momentos:
        if x.get('sin_subtitulos') or lista_ve(x)[0] == 'maquina':
            continue
        hasta = calla.get(x['k'], x['t1'])
        gs = grupos(x['palabras'], hasta, [t for t in e.cortes if x['t0'] < t < x['t1']] if (x.get('forma') or 'serie') == 'serie' else [])
        for n, g in enumerate(gs):
            a = g[0][1]
            b = gs[n + 1][0][1] if n + 1 < len(gs) else hasta
            if b - a < 1 / FPS:
                continue
            tramo = next((t for t in e.tramos if t[0] <= a + 1e-6 < t[1]), (a, b, 0.3, 'imagen'))
            luz, suelo = tramo[2], tramo[3]
            palabras = [(escrita(w), t) for w, t in g]
            y = None
            if not VERTICAL:
                y = '85%' if suelo == 'cara' else '88%' if suelo in ('pagina', 'tarjeta') else None
            elif suelo == 'tarjeta':
                y = '80%'
            # Bajo el logo, no encima: en horizontal el subtítulo del centro caía sobre él.
            if suelo == 'logo' and not VERTICAL:
                y = '76%'
            if suelo in ('negro', 'logo'):
                captions(c, [(palabras, b, 'serif')], y=y)
            elif luz > CLARO:
                captions_switch(c, palabras, [(a, b, 'ink')], y=y)
            elif x.get('enfasis') == 'cursiva':
                captions(c, [(palabras, b, 'serif')], y=y)
            else:
                captions(c, [(palabras, b)], y=y)


def rotar_clics(c):
    """Las referencias nunca repiten el mismo clic 80 veces: rotan cuatro, a sus niveles medidos, un 15 % por debajo."""
    varios = [('ev1kit/click_3', 0.42), ('ev1kit/click_1', 0.33), ('ev1kit/click_4', 0.36), ('ev1kit/click_2', 0.32)]
    k = 0
    for i, (t, s, g) in sorted(enumerate(c.cues), key=lambda p: p[1][0]):
        if s == 'ev1kit/click_3':
            nombre, g0 = varios[k % 4]
            k += 1
            c.cues[i] = (t, nombre, round(g0 * 0.85 * (g / 0.42), 3))


def armar(m, words, hecho, p, final=True):
    """La edición entera. `p` es lo que devolvió `plan`; cada momento con recorte trae ya su `recorte_archivo`."""
    c = Comp(p['dur'])
    e = Estado(c)
    calla = {}
    huecos = []
    for n, x in enumerate(p['momentos']):
        ve = lista_ve(x)
        primero = n == 0
        if ve[0] == 'cara':
            cara(e, x, primero)
        elif ve[0] == 'negro':
            negro(e, x)
        elif ve[0] == 'maquina':
            maquina(e, x)
        else:
            hs = [{**hecho[i], 'id': i} for i in ve if i in hecho]
            if len(hs) != len(ve):
                huecos.append(x['k'])
                c.clip(x['t0'], x['t1'], '<div class="ev1-layer ev1-black"></div>', z=1)
                e.tramo(x['t0'], x['t1'], 0.0, 'negro')
            else:
                forma = x.get('forma') or ('serie' if len(hs) > 1 else None)
                if forma == 'mundo' and x.get('recorte_archivo'):
                    mundo(e, x, hs)
                elif forma == 'rafaga':
                    rafaga(e, x, hs)
                elif forma == 'tarjetas':
                    tarjetas(e, x, hs)
                elif forma == 'muro':
                    muro(e, x, hs)
                elif forma == 'triptico':
                    triptico(e, x, hs)
                elif len(hs) > 1:
                    serie(e, x, hs, primero)
                else:
                    una_cosa(e, x, hs[0], x['t0'], x['t1'], primero)
        t = palabra_grande(e, x)
        if t is not None:
            calla[x['k']] = t
        c.escena(' '.join(w for w, _, _ in x['palabras'][:6])[:60] or str(x.get('palabra')), x['t0'], x['t1'])
    subtitulos(e, p['momentos'], m.get('corrige'), calla)
    # El cierre: negro tras la última palabra, con su golpe.
    c.clip(p['cola'], p['dur'], '<div class="ev1-layer ev1-black"></div>', z=95)
    sfx(c, p['cola'], 'outro', 0.8)
    rotar_clics(c)
    if final and huecos:
        raise SystemExit(f"✗ quedan momentos sin su material: {', '.join(str(k + 1) for k in huecos)}")
    c.write_cues('sfx-cues.txt')
    base = 'work/premix.wav' if os.path.exists('work/premix.wav') else 'public/assets/media/vo.wav'
    mezclar(base, 'sfx-cues.txt', 'public/sonido.wav', p['dur'])
    c.write('src/edicion.json', audio='sonido.wav', title=str(m.get('titulo') or 'Documental'))
    cortes = sorted(set(e.cortes))
    huecos_t = [round(b - a, 2) for a, b in zip(cortes, cortes[1:] + [p['fin']])]
    datos = {'dur': p['dur'], 'fin': p['fin'], 'momentos': len(p['momentos']), 'cortes': cortes,
             'cortes_por_minuto': round(len(cortes) / max(p['fin'], 1) * 60, 1), 'mas_largo': max(huecos_t or [0]),
             'cara': p.get('cara', 0), 'movimiento': round(e.movimiento / max(p['fin'], 1), 3), 'sonidos': len(c.cues),
             'negros': [[a, b] for a, b, _, suelo in e.tramos if suelo == 'negro'] + [[p['cola'], p['dur']]],
             'capas': len(c.els), 'videos': len(c.vids), 'portada': e.portada or e.portada_2}
    with open('work/edicion-datos.json', 'w', encoding='utf-8', newline='\n') as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    return datos
