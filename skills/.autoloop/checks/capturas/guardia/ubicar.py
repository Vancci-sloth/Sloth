"""
Encuentra texto en una captura o en un cuadro de video con el OCR de Windows, en píxeles originales. Así las marcas
y la cámara se escriben con la frase que citan, sin medir coordenadas en una rejilla.

    python ubicar.py <imagen | video@segundo> "frase"     cajas de la frase (una por renglón)
    python ubicar.py <imagen | video@segundo>             todo el texto, renglón por renglón, con su caja

Las rutas son relativas a public/ (web/x.png, clips/tema.mp4@946.2) o absolutas. Desde guion.py se usan
`marca_texto`, `caja_texto` y `zona` (ver ESCENAS.md de la skill). Los resultados del OCR se guardan en
fuentes/ocr/ para no repetirlo.

Cada llamada recuerda su frase: si la captura tiene versión angosta (`web/x-<nombre>-angosto.png`), `angostas()`
repite las mismas llamadas sobre ella para el corte vertical (ver el final de este archivo).
"""

import difflib
import functools
import hashlib
import itertools
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
PUBLICO = RAIZ / "public"
CACHE = RAIZ / "fuentes" / "ocr"
PS = RAIZ / "ocr.ps1"


def _ruta(fuente: str) -> tuple[Path, float | None]:
    if "@" in fuente and not (PUBLICO / fuente).exists() and not Path(fuente).exists():
        video, seg = fuente.rsplit("@", 1)
        return _abs(video), float(seg)
    return _abs(fuente), None


def _abs(p: str) -> Path:
    return Path(p) if Path(p).is_absolute() or Path(p).exists() else PUBLICO / p


def _clave(fuente: str, idioma: str = "en-US") -> str:
    archivo, seg = _ruta(fuente)
    return hashlib.sha1(f"{archivo}|{seg}|{archivo.stat().st_mtime}|{idioma}".encode()).hexdigest()[:16]


def imagen(fuente: str, idioma: str = "en-US") -> Path:
    """La imagen de la fuente: el archivo, o el cuadro de ese segundo del video (se extrae una vez)."""
    archivo, seg = _ruta(fuente)
    if seg is None:
        return archivo
    CACHE.mkdir(parents=True, exist_ok=True)
    cuadro = CACHE / f"{_clave(fuente, idioma)}.png"
    if not cuadro.exists():
        subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-ss", str(seg), "-i", str(archivo), "-frames:v", "1",
                        "-update", "1", str(cuadro)], check=True)
    return cuadro


def ocr(fuente: str, idioma: str = "en-US") -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    guardado = CACHE / f"{_clave(fuente, idioma)}.json"
    if guardado.exists():
        return json.loads(guardado.read_text(encoding="utf8"))
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(PS), str(imagen(fuente, idioma)), idioma],
                       capture_output=True, text=True, encoding="utf8", check=True)
    d = json.loads(r.stdout)
    guardado.write_text(json.dumps(d, ensure_ascii=False), encoding="utf8")
    return d


def _norm(t: str) -> str:
    t = unicodedata.normalize("NFD", t.lower())
    return "".join(c for c in t if c.isalnum() and unicodedata.category(c) != "Mn")


def _union(rs: list[list[int]], pad: int) -> list[int]:
    x0 = min(r[0] for r in rs) - pad
    y0 = min(r[1] for r in rs) - pad
    x1 = max(r[0] + r[2] for r in rs) + pad
    y1 = max(r[1] + r[3] for r in rs) + pad
    return [x0, y0, x1 - x0, y1 - y0]


def buscar(fuente: str, frase: str, ocurrencia: int = 1, pad: int = 4, idioma: str = "en-US") -> list[list[int]]:
    """Cajas de la frase, una por renglón que ocupa. Tolera diferencias del OCR (letras, puntuación)."""
    return [_union(l["rs"], pad) for l in _renglones(fuente, frase, ocurrencia, idioma)]


def _renglones(fuente: str, frase: str, ocurrencia: int = 1, idioma: str = "en-US") -> list[dict]:
    """Los renglones de la frase: cajas de sus palabras (`rs`), su texto y si la frase llega al final del renglón."""
    d = ocr(fuente, idioma)
    palabras = [(i, w) for i, l in enumerate(d["lineas"]) for w in l["palabras"] if _norm(w["t"])]
    texto = [_norm(w["t"]) for _, w in palabras]
    buscada = [_norm(p) for p in re.split(r"\s+", frase) if _norm(p)]
    n = len(buscada)
    candidatos = []
    for i in range(len(texto) - n + 1):
        parecido = difflib.SequenceMatcher(None, "".join(texto[i:i + n]), "".join(buscada)).ratio()
        candidatos.append((parecido, i))
    # Solo cuentan las apariciones tan parecidas como la mejor: así "available on macOS" no le gana el lugar a
    # "available for macOS" cuando la segunda es la exacta. Cada aparición cuenta una vez (sin solapes).
    mejor_p = max((c[0] for c in candidatos), default=0)
    buenos = [c for c in candidatos if c[0] >= max(0.8, mejor_p - 0.03)]
    apariciones = []
    for p, i in sorted(buenos, key=lambda c: -c[0]):
        if all(abs(i - j) >= n for _, j in apariciones):
            apariciones.append((p, i))
    apariciones.sort(key=lambda c: c[1])
    if len(apariciones) > 1 and ocurrencia == 1:
        print(f'aviso: "{frase}" aparece {len(apariciones)} veces en {fuente}; se usa la primera (ocurrencia=1)', file=sys.stderr)
    if len(apariciones) < ocurrencia:
        mejor = max(candidatos, default=(0, 0))
        visto = " ".join(w["t"] for _, w in palabras[mejor[1]:mejor[1] + n])
        raise SystemExit(f'"{frase}" no está en {fuente} (lo más parecido: "{visto}", {mejor[0]:.0%})')
    i = apariciones[ocurrencia - 1][1]
    por_linea: dict[int, list] = {}
    for li, w in palabras[i:i + n]:
        por_linea.setdefault(li, []).append(w)
    return [{"rs": [w["r"] for w in ws], "texto": " ".join(w["t"] for w in ws),
             "al_final": ws[-1] is d["lineas"][li]["palabras"][-1]}
            for li, ws in por_linea.items()]


def _mas(r: list[int], mas: int) -> list[int]:
    return [r[0] - mas, r[1], r[2] + 2 * mas, r[3]]


def marca_texto(fuente: str, frase: str, en: str | None = None, t: float | None = None, ocurrencia: int = 1,
                mas: int = 0, es: str | None = None, peso: int = 400, italica: bool = False, serif: bool = False,
                **kw) -> list[dict]:
    """Resaltador sobre la frase (una marca por renglón). `mas` alarga cada marca esos píxeles por lado (texto chico).

    Con `es="..."`, poco después de pintarse el resaltador el inglés se convierte en esa traducción, en su lugar y del
    mismo tamaño. `peso` (400, 600, 700), `italica` y `serif` imitan la letra del original (un titular en negritas).
    """
    cuando = {"en": en} if en else {"t": t or 0}
    renglones = _renglones(fuente, frase, ocurrencia)
    marcas = [{"r": _mas(_union(l["rs"], 4), mas), "tipo": "marcador", **cuando, **kw} for l in renglones]
    if es:
        marcas[0]["es"] = traduccion(fuente, renglones, es, peso, italica, serif)
        for m in marcas[1:]:
            m["parte"] = True
    llamada = _llamada("marca_texto", fuente, frase, en=en, t=t, ocurrencia=ocurrencia, mas=mas, es=es, peso=peso,
                       italica=italica, serif=serif, **kw)
    for m in marcas:
        m["_ocr"] = llamada
    return marcas


# ---------- traducción de lo marcado ----------

_LETRAS = {(400, False, False): "segoeui.ttf", (400, True, False): "segoeuii.ttf", (600, False, False): "seguisb.ttf",
           (600, True, False): "seguisbi.ttf", (700, False, False): "segoeuib.ttf", (700, True, False): "segoeuiz.ttf",
           (400, False, True): "georgia.ttf", (400, True, True): "georgiai.ttf", (700, False, True): "georgiab.ttf",
           (700, True, True): "georgiaz.ttf"}


def _letra(peso: int, italica: bool, tam: float, serif: bool = False):
    from PIL import ImageFont
    p = min(_LETRAS, key=lambda k: (k[2] != serif, k[1] != italica, abs(k[0] - peso)))
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / _LETRAS[p]), max(1, round(tam)))


def _colores(img, rs: list[list[int]]) -> tuple[tuple, tuple]:
    """Color del fondo (el más común) y de la letra (lo más lejano al fondo) bajo los renglones marcados."""
    pix = []
    for x, y, w, h in rs:
        pix += list(img.crop((x - 2, y - 2, x + w + 2, y + h + 2)).convert("RGB").getdata())
    cubetas: dict = {}
    for c in pix:
        cubetas.setdefault(tuple(v // 16 for v in c), []).append(c)
    comun = max(cubetas.values(), key=len)
    fondo = tuple(sum(c[i] for c in comun) // len(comun) for i in range(3))
    dist = [(sum((a - b) ** 2 for a, b in zip(c, fondo)), c) for c in pix]
    tope = max(d for d, _ in dist) or 1
    tinta = sorted([c for d, c in dist if d >= 0.55 * tope], key=sum)
    tinta = tinta[len(tinta) // 2] if tinta else tuple(255 - v for v in fondo)
    return fondo, tinta


def _hexa(c: tuple) -> str:
    return "#%02x%02x%02x" % tuple(c[:3])


def _cerca(c: tuple, fondo: tuple, umbral: int = 60) -> bool:
    return sum((a - b) ** 2 for a, b in zip(c, fondo)) < umbral ** 2


def _orillas(img, r: list[int], fondo: tuple) -> list[str]:
    """Color del fondo en la orilla izquierda y derecha de `r` (solo lo parecido al fondo, sin la tinta): el parche
    que tapa el inglés va en degradado entre los dos, para que no se note sobre un fondo que cambia (OpenAI)."""
    def promedio(caja):
        pix = [c for c in img.crop(caja).getdata() if _cerca(c, fondo)]
        return _hexa(tuple(sum(c[i] for c in pix) // len(pix) for i in range(3))) if pix else _hexa(fondo)
    x, y, w, h = r
    x0, x1 = max(0, x), min(img.width, x + w)
    return [promedio((x0, y, min(x1, x0 + 12), y + h)), promedio((max(x0, x1 - 12), y, x1, y + h))]


def _base(img, r: list[int], fondo: tuple) -> int | None:
    """Línea base de un renglón medida en la imagen: el último renglón de píxeles con bastante tinta (abajo de él solo
    quedan las colas de g, p, y)."""
    x, y, w, h = r
    caja = img.crop((x, y - 2, x + w, y + h + 4))
    filas = []
    for j in range(caja.height):
        fila = [caja.getpixel((i, j)) for i in range(0, caja.width, 2)]
        filas.append(sum(1 for c in fila if not _cerca(c, fondo, 90)))
    tope = max(filas) if filas else 0
    if not tope:
        return None
    ultima = max(j for j, n in enumerate(filas) if n >= 0.3 * tope)
    return y - 2 + ultima + 1


def traduccion(fuente: str, renglones: list[dict], texto: str, peso: int = 400, italica: bool = False,
               serif: bool = False) -> dict:
    """Acomoda la traducción sobre los renglones de la frase: mismo tamaño y color de letra, sin invadir lo de al lado.

    Mide con la Segoe UI de Windows (o Georgia con `serif`), la letra con que el componente la dibuja (y la de X y
    GitHub en Windows). Si no cabe, achica la letra hasta un 72 %; si aun así no cabe, usa un renglón más y lo avisa.
    """
    from PIL import Image
    img = Image.open(imagen(fuente)).convert("RGB")
    crudos = [_union(l["rs"], 0) for l in renglones]
    marcas = [_union(l["rs"], 4) for l in renglones]
    # Tamaño de letra: el que hace que el inglés mida lo que mide en la imagen (su renglón más largo).
    f100 = _letra(peso, italica, 100, serif)
    largo = max(range(len(crudos)), key=lambda i: crudos[i][2])
    tam0 = 100 * crudos[largo][2] / max(1.0, f100.getlength(renglones[largo]["texto"]))
    # Línea base de cada renglón, medida en la tinta del inglés (si no, estimada con la letra).
    fondo, tinta = _colores(img, crudos)
    bases = [_base(img, c, fondo) or round(c[1] - f100.getbbox(l["texto"], anchor="ls")[1] * tam0 / 100)
             for c, l in zip(crudos, renglones)]
    paso = (bases[-1] - bases[0]) / (len(bases) - 1) if len(bases) > 1 else tam0 * 1.4
    # Ancho de cada renglón: hasta la orilla derecha del párrafo, o hasta el margen si la frase cierra su renglón.
    # El último renglón, si sigue con otro texto, no pasa de donde acaba la frase.
    izq = min(c[0] for c in crudos[1:]) if len(crudos) > 1 else crudos[0][0]
    der = max(c[0] + c[2] for c in crudos)
    if renglones[-1]["al_final"]:
        der = max(der, img.width - max(30, min(crudos[0][0], 60)))

    def acomodar(tam: float, n: int, salta: bool = False):
        """`salta`: deja vacío el primer renglón (la frase empieza en las últimas palabras de un renglón)."""
        f = _letra(peso, italica, tam, serif)
        xs = [crudos[i][0] if i < len(crudos) else izq for i in range(n)]
        lim = [der - x for x in xs]
        if not renglones[-1]["al_final"] and n == len(crudos):
            lim[-1] = crudos[-1][0] + crudos[-1][2] - xs[-1]
        lineas, actual = ([""] if salta else []), ""
        for p in texto.split():
            prueba = (actual + " " + p).strip()
            if not lineas and not actual and n > 1 and f.getlength(p) > lim[0]:
                lineas.append("")  # la primera palabra no cabe en lo que queda del primer renglón
            if actual and f.getlength(prueba) > lim[min(len(lineas), n - 1)]:
                lineas.append(actual)
                actual = p
            else:
                actual = prueba
        lineas.append(actual)
        cabe = len(lineas) <= n and all(f.getlength(t) <= lim[i] + 1 for i, t in enumerate(lineas))
        return cabe, lineas, f, xs

    n = len(crudos)

    def mejor(salta: bool):
        tam = tam0
        cabe, lineas, f, xs = acomodar(tam, n, salta)
        while not cabe and tam > tam0 * 0.72:
            tam *= 0.96
            cabe, lineas, f, xs = acomodar(tam, n, salta)
        return cabe, tam, lineas, f, xs

    cabe, tam, lineas, f, xs = mejor(False)
    # Si la frase empieza en las últimas palabras de un renglón, el español empieza en el siguiente cuando así
    # no hay que achicar la letra (queda junto en vez de partido en un pedacito y el resto).
    if n > 1 and crudos[0][2] < 0.3 * (der - izq):
        otro = mejor(True)
        if otro[0] and otro[1] >= tam * 0.99:
            cabe, tam, lineas, f, xs = otro
    if not cabe:
        cabe, lineas, f, xs = acomodar(tam, n + 1)
        print(f'aviso: "{texto}" no cabe en {n} renglón(es) de {fuente}; usa {len(lineas)}', file=sys.stderr)
    elif tam < tam0 * 0.9:
        print(f'aviso: "{texto}" quedó al {tam / tam0:.0%} del tamaño del inglés en {fuente}; una traducción más corta'
              ' se ve mejor', file=sys.stderr)
    salida, cubre = [], [[m[0] - 2, m[1], m[2] + 4, m[3]] for m in marcas]
    for i, t in enumerate(lineas):
        if not t:
            continue
        j = min(i, len(bases) - 1)
        base = round(bases[j] + paso * (i - j))
        m = marcas[min(i, len(marcas) - 1)]
        w = round(f.getlength(t))
        x = xs[i] if i < len(xs) else izq
        r = [x - 4, m[1] + base - bases[j], w + 8, m[3]]
        salida.append({"t": t, "x": x, "base": base, "w": w, "r": r})
        cubre.append(r)
    cubre = [{"r": r, "fondo": _orillas(img, r, fondo)} for r in cubre]
    return {"lineas": salida, "tam": round(tam, 1), "peso": peso, "italica": italica, "serif": serif, "cubre": cubre,
            "fondo": _hexa(fondo), "tinta": _hexa(tinta)}


def caja_texto(fuente: str, frase: str, en: str | None = None, t: float | None = None, ocurrencia: int = 1,
               pad: int = 2, **kw) -> dict:
    """Una caja roja alrededor de toda la frase. `pad` en píxeles de la imagen; el componente suma 8 px de pantalla."""
    cuando = {"en": en} if en else {"t": t or 0}
    return {"r": _union(buscar(fuente, frase, ocurrencia), pad), **cuando, **kw,
            "_ocr": _llamada("caja_texto", fuente, frase, en=en, t=t, ocurrencia=ocurrencia, pad=pad, **kw)}


def renglones(fuente: str, idioma: str = "en-US") -> list[list[int]]:
    """Las cajas de todos los renglones de la captura. guion.py las escribe en src/lineas.json para que el encuadre del
    corte vertical (src/encuadre.ts) no corte un renglón a la mitad."""
    return [_union([w["r"] for w in l["palabras"]], 0) for l in ocr(fuente, idioma)["lineas"] if l["palabras"]]


def zona(fuente: str, frase: str, ancho: int | None = None, aspecto: float = 16 / 9, ocurrencia: int = 1) -> list[int]:
    """Rectángulo para `vista` o `toma`, centrado en la frase y con la forma `aspecto` (ancho/alto)."""
    x, y, w, h = _union(buscar(fuente, frase, ocurrencia), 0)
    W = max(ancho or 0, int(w * 1.25), int(h * 3 * aspecto))
    H = int(W / aspecto)
    z = Zona([max(0, x + w // 2 - W // 2), max(0, y + h // 2 - H // 2), W, H])
    z.llamada = _llamada("zona", fuente, frase, ancho=ancho, aspecto=aspecto, ocurrencia=ocurrencia)
    return z


# ---------- la versión angosta de una captura, para el corte vertical ----------
#
# Un tuit capturado a 600 px CSS tiene renglones de lado a lado: en vertical se ve completo pero con letra chica. Si
# junto a `web/x.png` está `web/x-angosto.png` (el mismo post en una ventana de celular), `angostas()` le escribe a cada
# beat de esa captura un `vertical={...}` con la imagen angosta: las marcas, cajas, traducciones y zonas se vuelven a
# buscar en ella con la misma frase, y los rectángulos escritos a mano (`vista`, tomas, `video.r`, `foco`, `caja(r)`)
# se pasan por lo que tienen dentro: las palabras que cubren (emparejadas por OCR entre las dos capturas) o la parte
# del video. En guion.py no se escribe nada dos veces; el episodio 16:9 no cambia.

ANGOSTO = "-angosto"
_ids = itertools.count(1)


class Zona(list):
    """El rectángulo de `zona()`: recuerda su frase (`llamada`) para repetirla en la captura angosta."""
    llamada: dict


def _llamada(fn: str, fuente: str, frase: str, **kw) -> dict:
    return {"id": next(_ids), "fn": fn, "fuente": fuente, "frase": frase, "kw": kw}


def angosta(img: str) -> str | None:
    """`web/x-y.png` -> `web/x-y-angosto.png`, si existe en public/."""
    otra = re.sub(r"(\.\w+)$", ANGOSTO + r"\1", img)
    return otra if otra != img and (PUBLICO / otra).exists() else None


@functools.cache
def _tam(fuente: str) -> tuple[int, int]:
    d = ocr(fuente)
    return d["ancho"], d["alto"]


@functools.cache
def _palabras(fuente: str) -> list[tuple[str, list[int]]]:
    return [(_norm(w["t"]), w["r"]) for l in ocr(fuente)["lineas"] for w in l["palabras"] if _norm(w["t"])]


@functools.cache
def _pareja(ancha: str, angosta_: str, exacta: bool = False) -> dict[int, int]:
    """Qué palabra de la captura angosta es cada palabra de la ancha: el mismo texto en el mismo orden, partido en
    otros renglones. Sin `exacta`, también las que el OCR leyó distinto en un tramo del mismo largo ("A1" y "AI")."""
    a, b = _palabras(ancha), _palabras(angosta_)
    sm = difflib.SequenceMatcher(None, [t for t, _ in a], [t for t, _ in b], autojunk=False)
    par = {}
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal" or (not exacta and op == "replace" and i2 - i1 == j2 - j1):
            par.update({i1 + k: j1 + k for k in range(i2 - i1)})
    return par


@functools.cache
def _escala_texto(ancha: str, angosta_: str) -> float:
    """Cuánto más alta es la letra en la angosta (la mediana de las palabras emparejadas)."""
    a, b, par = _palabras(ancha), _palabras(angosta_), _pareja(ancha, angosta_)
    k = sorted(b[j][1][3] / a[i][1][3] for i, j in par.items() if a[i][1][3] > 0)
    return k[len(k) // 2] if k else _tam(angosta_)[0] / _tam(ancha)[0]


def _centro_en(w: list[int], r: list[int]) -> bool:
    cx, cy = w[0] + w[2] / 2, w[1] + w[3] / 2
    return r[0] <= cx <= r[0] + r[2] and r[1] <= cy <= r[1] + r[3]


def _corte(a: list[int], b: list[int]) -> list[int] | None:
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[0] + a[2], b[0] + b[2]), min(a[1] + a[3], b[1] + b[3])
    return [x0, y0, x1 - x0, y1 - y0] if x1 > x0 and y1 > y0 else None


def _proporcional(r: list[int], V: list[int], V2: list[int]) -> list[int]:
    kx, ky = V2[2] / V[2], V2[3] / V[3]
    return [round(V2[0] + (r[0] - V[0]) * kx), round(V2[1] + (r[1] - V[1]) * ky), round(r[2] * kx), round(r[3] * ky)]


@functools.cache
def _medio(ancha: str, angosta_: str, V: tuple[int, ...]) -> list[int]:
    """El rectángulo `V` (el video de un tuit) en la captura angosta: la caja con tinta entre el último renglón de texto
    que lo precede y el primero que lo sigue (sus palabras, emparejadas por OCR), sin su borde de 1 px CSS."""
    import numpy as np
    from PIL import Image
    a, b, par = _palabras(ancha), _palabras(angosta_), _pareja(ancha, angosta_, exacta=True)
    W, H = _tam(angosta_)
    arriba = [b[par[i]][1] for i, (_, w) in enumerate(a) if i in par and w[1] + w[3] <= V[1]]
    abajo = [b[par[i]][1] for i, (_, w) in enumerate(a) if i in par and w[1] >= V[1] + V[3]]
    y0 = max((w[1] + w[3] for w in arriba), default=0) + 2
    y1 = min((w[1] for w in abajo), default=H) - 2
    img = np.asarray(Image.open(imagen(angosta_)).convert("RGB")).astype(int)
    fondo = np.median(img[:, :8].reshape(-1, 3), axis=0)
    tinta = np.abs(img[y0:y1] - fondo).sum(axis=2) > 60
    filas, cols = np.where(tinta.mean(axis=1) > 0.3)[0], np.where(tinta.mean(axis=0) > 0.3)[0]
    if not len(filas) or not len(cols):
        print(f"aviso: no encontré el video {list(V)} de {ancha} en {angosta_}; va escalado", file=sys.stderr)
        k = W / _tam(ancha)[0]
        return [round(v * k) for v in V]
    x0, x1, ya, yb = cols[0], cols[-1] + 1, y0 + filas[0], y0 + filas[-1] + 1
    # El borde: renglones de arriba del mismo color que el primero (en la mitad de en medio: las esquinas son redondas).
    borde, m = 0, (x1 - x0) // 4
    while borde < 8 and np.abs(img[ya + borde, x0 + m:x1 - m] - img[ya, (x0 + x1) // 2]).sum(axis=1).max() < 30:
        borde += 1
    return [int(x0 + borde), int(ya + borde), int(x1 - x0 - 2 * borde), int(yb - ya - 2 * borde)]


def traspasa(r: list[int], ancha: str, angosta_: str, video: list[int] | None = None) -> list[int]:
    """Un rectángulo escrito a mano en la captura ancha, en la angosta, por lo que tiene dentro: las palabras que
    cubre (con su mismo margen, a la escala de la letra) y la parte del video `video` que cubre. Uno que abarca casi
    todo el ancho sigue abarcándolo."""
    if isinstance(r, Zona):
        return _repite(r.llamada, angosta_)
    Wa = _tam(ancha)[0]
    Wb, Hb = _tam(angosta_)
    partes = []
    if video:
        k = _corte(r, video)
        V2 = _medio(ancha, angosta_, tuple(video))
        if k and k[2] * k[3] >= 0.8 * r[2] * r[3]:
            return _proporcional(r, video, V2)
        if k:
            partes.append(_proporcional(k, video, V2))
    a, b, par = _palabras(ancha), _palabras(angosta_), _pareja(ancha, angosta_)
    dentro = [i for i, (_, w) in enumerate(a) if i in par and _centro_en(w, r) and not (video and _centro_en(w, video))]
    if dentro:
        Ua, Ub = _union([a[i][1] for i in dentro], 0), _union([b[par[i]][1] for i in dentro], 0)
        s = _escala_texto(ancha, angosta_)
        izq, arr = (Ua[0] - r[0]) * s, (Ua[1] - r[1]) * s
        der, aba = (r[0] + r[2] - Ua[0] - Ua[2]) * s, (r[1] + r[3] - Ua[1] - Ua[3]) * s
        partes.append([Ub[0] - izq, Ub[1] - arr, Ub[2] + izq + der, Ub[3] + arr + aba])
    if not partes:
        print(f"aviso: {r} de {ancha} no cubre texto ni video; va escalado a {angosta_}", file=sys.stderr)
        return [round(v * Wb / Wa) for v in r]
    U = _union(partes, 0)
    if r[2] >= 0.9 * Wa:
        U = [0, U[1], Wb, U[3]]
    x0, y0 = max(0, U[0]), max(0, U[1])
    x1, y1 = min(Wb, U[0] + U[2]), min(Hb, U[1] + U[3])
    return [round(x0), round(y0), round(x1 - x0), round(y1 - y0)]


def _repite(llamada: dict, angosta_: str):
    """La misma llamada (`marca_texto`, `caja_texto` o `zona`) sobre la captura angosta."""
    kw = dict(llamada["kw"])
    s = _escala_texto(llamada["fuente"], angosta_)
    if kw.get("mas"):
        kw["mas"] = round(kw["mas"] * s)
    if "pad" in kw:
        kw["pad"] = round(kw["pad"] * s)
    if kw.get("ancho"):
        kw["ancho"] = round(kw["ancho"] * _tam(angosta_)[0] / _tam(llamada["fuente"])[0])
    fn = {"marca_texto": marca_texto, "caja_texto": caja_texto, "zona": zona}[llamada["fn"]]
    return fn(angosta_, llamada["frase"], **kw)


def _marcas(marcas: list[dict], ancha: str, angosta_: str, video: list[int] | None) -> list[dict]:
    salida, hechas = [], set()
    for m in marcas:
        ll = m.get("_ocr")
        if not ll:
            salida.append({**m, "r": traspasa(m["r"], ancha, angosta_, video)})
            continue
        if ll["id"] in hechas:
            continue
        hechas.add(ll["id"])
        try:
            nuevo = _repite(ll, angosta_)
        except SystemExit as e:
            print(f"aviso: {e}; la marca va por sus palabras, sin traducción", file=sys.stderr)
            nuevo = [{k: v for k, v in x.items() if k not in ("es", "parte")} | {"r": traspasa(x["r"], ancha, angosta_, video)}
                     for x in marcas if x.get("_ocr", {}).get("id") == ll["id"]]
        salida += nuevo if isinstance(nuevo, list) else [nuevo]
    return salida


def angostas(guion: dict) -> None:
    """Para guion.py, antes de escribir guion.json: a cada captura con versión angosta le agrega su `vertical` (ver
    arriba) y quita de todo lo que recuerdan las llamadas. Las claves `vertical` que ya traía el beat (escritas en
    píxeles de la captura ancha) también se pasan a la angosta."""
    for p in guion["parrafos"]:
        for b in p["beats"]:
            v = b["v"]
            otra = angosta(v.get("img") or "") if v.get("tipo") == "captura" else None
            if not otra:
                continue
            ancha, video = v["img"], (v.get("video") or {}).get("r")
            base = {**v, **v.get("vertical", {})}
            w, h = _tam(otra)
            vv = {**v.get("vertical", {}), "img": otra, "w": w, "h": h}
            if base.get("marcas"):
                vv["marcas"] = _marcas(base["marcas"], ancha, otra, video)
            for clave in ("vista", "importante"):
                if base.get(clave):
                    vv[clave] = traspasa(base[clave], ancha, otra, video)
            if base.get("camara"):
                vv["camara"] = [{**c, "r": traspasa(c["r"], ancha, otra, video)} for c in base["camara"]]
            if base.get("foco"):
                vv["foco"] = {**base["foco"], "r": traspasa(base["foco"]["r"], ancha, otra, video)}
            if video:
                vv["video"] = {**base["video"], "r": _medio(ancha, otra, tuple(video))}
            v["vertical"] = vv
    _limpia(guion)


def _limpia(x) -> None:
    if isinstance(x, dict):
        x.pop("_ocr", None)
        for v in x.values():
            _limpia(v)
    elif isinstance(x, list):
        for v in x:
            _limpia(v)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) == 2:
        d = ocr(sys.argv[1])
        print(f"{d['ancho']}x{d['alto']}")
        for l in d["lineas"]:
            print(_union([w["r"] for w in l["palabras"]], 0), " ".join(w["t"] for w in l["palabras"]))
    elif len(sys.argv) == 3:
        for r in buscar(sys.argv[1], sys.argv[2]):
            print(r)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
