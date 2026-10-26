"""
Encuentra texto en una captura o en un cuadro de video, en píxeles originales. Así las marcas y la cámara se escriben
con la frase que citan, sin medir coordenadas en una rejilla.

Una captura hecha con `<skill>/scripts/pagina.mjs` trae dentro el texto de la página: cada palabra con su caja, su
línea base y su letra. Entonces la frase se busca con el texto de verdad (se escribe "$1.00", no lo que leyera el
OCR) y la traducción sale con la letra, el tamaño, el color y la línea base del original. Una imagen sin ese texto (un
cuadro de video, una captura vieja o editada) se lee con el OCR de Windows; en Mac y Linux, con RapidOCR.

    python ubicar.py <imagen | video@segundo> "frase"     cajas de la frase (una por renglón)
    python ubicar.py <imagen | video@segundo>             todo el texto, renglón por renglón, con su caja

Las rutas son relativas a public/ (web/x.png, clips/tema.mp4@946.2) o absolutas. Desde guion.py se usan
`marca_texto`, `caja_texto` y `zona` (ver ESCENAS.md de la skill). Los resultados del OCR se guardan en
fuentes/ocr/ para no repetirlo.
"""

import difflib
import functools
import hashlib
import json
import os
import re
import subprocess
import sys
import time
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


def existe(fuente: str) -> bool:
    """Si la imagen (o el video de `video@segundo`) ya está: guion.py corre mientras siguen saliendo las capturas."""
    return _ruta(fuente)[0].exists()


@functools.cache
def _contenido(archivo: Path, tam: int, cambio: int) -> str:
    return hashlib.sha1(archivo.read_bytes()).hexdigest()


def _clave(fuente: str, idioma: str = "en-US") -> str:
    """
    La clave del OCR guardado. De una imagen, su contenido; de un video (pesa cientos de MB), su ruta dentro del episodio
    y su tamaño. Con la ruta absoluta, copiar o mover el episodio perdía todo lo leído.
    """
    archivo, seg = _ruta(fuente)
    archivo, s = archivo.resolve(), archivo.stat()
    if seg is None:
        quien = _contenido(archivo, s.st_size, s.st_mtime_ns)
    else:
        quien = f"{archivo.relative_to(RAIZ).as_posix() if archivo.is_relative_to(RAIZ) else archivo}:{s.st_size}"
    return hashlib.sha1(f"{quien}|{seg}|{idioma}".encode()).hexdigest()[:16]


def guardar(ruta: Path, texto: str) -> None:
    """
    Escribe a un temporal y lo pone en su lugar: con las escenas en paralelo corren varios guion.py a la vez, y uno no
    debe leer lo que otro deja a medias. Si Windows no deja reemplazarlo (alguien lo está leyendo), reintenta.
    """
    temporal = ruta.with_name(f"{ruta.name}.{os.getpid()}.tmp")
    temporal.write_text(texto, encoding="utf8")
    for _ in range(30):
        try:
            return os.replace(temporal, ruta)
        except PermissionError:
            time.sleep(0.1)
    os.replace(temporal, ruta)


def imagen(fuente: str, idioma: str = "en-US") -> Path:
    """La imagen de la fuente: el archivo, o el cuadro de ese segundo del video (se extrae una vez)."""
    archivo, seg = _ruta(fuente)
    if seg is None:
        return archivo
    CACHE.mkdir(parents=True, exist_ok=True)
    cuadro = CACHE / f"{_clave(fuente, idioma)}.png"
    if not cuadro.exists():
        temporal = CACHE / f"_cuadro{os.getpid()}.png"
        subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-ss", str(seg), "-i", str(archivo), "-frames:v", "1",
                        "-update", "1", str(temporal)], check=True)
        os.replace(temporal, cuadro)
    return cuadro


# El OCR de Windows no lee imágenes de más de 10,000 px por lado (OcrEngine.MaxImageDimension): una página capturada
# entera mide 15,000 a 24,000 px de alto. Esas se leen por trozos que se traslapan.
OCR_MAX = 9000
TRASLAPE = 400


@functools.cache
def _rapidocr():
    import logging
    from rapidocr import RapidOCR
    motor = RapidOCR()
    # Cada lectura anuncia sus modelos en la salida de errores.
    logging.getLogger("RapidOCR").setLevel(logging.WARNING)
    return motor


def _ocr_rapido(ruta: Path) -> dict:
    """
    Fuera de Windows: RapidOCR (los modelos de PaddleOCR, en el procesador; lee el español con sus acentos), con la misma
    salida que ocr.ps1. Sus cajas miden el renglón entero de alto, no cada letra.
    """
    from PIL import Image
    r = _rapidocr()(str(ruta), return_word_box=True)
    lineas = []
    for palabras in r.word_results or ():
        ps = []
        for t, _, caja in palabras:
            xs, ys = [p[0] for p in caja], [p[1] for p in caja]
            ps.append({"t": t, "r": [int(min(xs)), int(min(ys)), int(max(xs) - min(xs)), int(max(ys) - min(ys))]})
        if ps:
            lineas.append({"palabras": ps})
    with Image.open(ruta) as im:
        ancho, alto = im.size
    return {"ancho": ancho, "alto": alto, "lineas": lineas}


def _ocr_archivo(ruta: Path, idioma: str) -> dict:
    if sys.platform != "win32":
        return _ocr_rapido(ruta)
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(PS), str(ruta), idioma],
                       capture_output=True, text=True, encoding="utf8", check=True)
    return json.loads(r.stdout)


def _ocr_por_trozos(ruta: Path, idioma: str) -> dict:
    """Lee una imagen muy alta por trozos de OCR_MAX px; cada renglón se queda del trozo donde cae lejos de la orilla."""
    from PIL import Image
    with Image.open(ruta) as im:
        w, h = im.size
        if w > OCR_MAX:
            raise SystemExit(f"{ruta} mide {w} px de ancho: el OCR de Windows no pasa de 10,000. Vuelve a capturarla más angosta.")
        inicios = list(range(0, max(1, h - TRASLAPE), OCR_MAX - TRASLAPE))
        lineas = []
        for k, y0 in enumerate(inicios):
            trozo = CACHE / f"_trozo{os.getpid()}-{k}.png"  # otro guion.py puede estar leyendo otra a la vez
            im.crop((0, y0, w, min(h, y0 + OCR_MAX))).save(trozo)
            desde = y0 + (TRASLAPE // 2 if k else 0)
            hasta = inicios[k + 1] + TRASLAPE // 2 if k + 1 < len(inicios) else h
            for l in _ocr_archivo(trozo, idioma)["lineas"]:
                for p in l["palabras"]:
                    p["r"][1] += y0
                arriba = min((p["r"][1] for p in l["palabras"]), default=y0)
                if desde <= arriba < hasta:
                    lineas.append(l)
            trozo.unlink()
    return {"ancho": w, "alto": h, "lineas": lineas}


# El nombre del bloque de texto que `pagina.mjs` mete en el PNG.
CLAVE_PAGINA = "sloth-pagina"


@functools.cache
def _pagina_de(archivo: Path, cambio: float) -> dict | None:
    from PIL import Image
    with Image.open(archivo) as im:
        texto = getattr(im, "text", {}).get(CLAVE_PAGINA)
        tam = im.size
    if not texto:
        return None
    d = json.loads(texto)
    # Si la imagen se recortó o se editó después, sus cajas ya no valen (PIL no guarda el bloque al reescribirla).
    return d if (d["ancho"], d["alto"]) == tam else None


def pagina(fuente: str) -> dict | None:
    """El texto de la página que trae una captura de `pagina.mjs`, o None (un cuadro de video, una captura sin él)."""
    archivo, seg = _ruta(fuente)
    if seg is not None or archivo.suffix.lower() != ".png" or not archivo.exists():
        return None
    return _pagina_de(archivo, archivo.stat().st_mtime)


def ocr(fuente: str, idioma: str = "en-US") -> dict:
    """Los renglones de la imagen con la caja de cada palabra: los de la página si los trae, si no los del OCR."""
    d = pagina(fuente)
    if d:
        return d
    CACHE.mkdir(parents=True, exist_ok=True)
    guardado = CACHE / f"{_clave(fuente, idioma)}.json"
    if guardado.exists():
        return json.loads(guardado.read_text(encoding="utf8"))
    ruta = imagen(fuente, idioma)
    from PIL import Image
    with Image.open(ruta) as im:
        alta = max(im.size) > OCR_MAX
    d = _ocr_por_trozos(ruta, idioma) if alta else _ocr_archivo(ruta, idioma)
    guardar(guardado, json.dumps(d, ensure_ascii=False))
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
    """Los renglones de la frase: cajas de sus palabras (`rs`), su texto, si la frase llega al final del renglón y, si la
    captura trae el texto de la página, su letra y su línea base."""
    d, palabras, i, n = _aparicion(fuente, frase, ocurrencia, idioma)
    por_linea: dict[int, list] = {}
    for li, w in palabras[i:i + n]:
        por_linea.setdefault(li, []).append(w)
    return [{"rs": [w["r"] for w in ws], "texto": " ".join(w["t"] for w in ws),
             "al_final": ws[-1] is d["lineas"][li]["palabras"][-1],
             "letra": d["lineas"][li].get("letra"), "base": ws[0].get("b")}
            for li, ws in por_linea.items()]


FIN_DE_ORACION = (".", "!", "?", ":", ";", "…")


def oracion(fuente: str, frase: str, ocurrencia: int = 1) -> dict | None:
    """Con el texto de la página: la oración entera donde está la frase y lo que queda fuera de la frase antes y después
    (en el mismo bloque, sin un punto de por medio). None si la captura no trae el texto de la página."""
    if not pagina(fuente):
        return None
    d, palabras, i, n = _aparicion(fuente, frase, ocurrencia)
    bloque = palabras[i][1].get("k")
    a = i
    while a > 0 and palabras[a - 1][1].get("k") == bloque and not palabras[a - 1][1]["t"].endswith(FIN_DE_ORACION):
        a -= 1
    b = i + n
    if not palabras[b - 1][1]["t"].endswith(FIN_DE_ORACION):
        while b < len(palabras) and palabras[b][1].get("k") == bloque:
            b += 1
            if palabras[b - 1][1]["t"].endswith(FIN_DE_ORACION):
                break
    texto = lambda ps: " ".join(w["t"] for _, w in ps)
    return {"oracion": texto(palabras[a:b]), "antes": texto(palabras[a:i]), "despues": texto(palabras[i + n:b])}


def _aparicion(fuente: str, frase: str, ocurrencia: int = 1, idioma: str = "en-US") -> tuple[dict, list, int, int]:
    """Dónde está la frase: el texto de la imagen, sus palabras (renglón, palabra), el índice de la primera y cuántas son."""
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
    return d, palabras, apariciones[ocurrencia - 1][1], n


def _mas(r: list[int], mas: int) -> list[int]:
    return [r[0] - mas, r[1], r[2] + 2 * mas, r[3]]


def marca_texto(fuente: str, frase: str, en: str | None = None, t: float | None = None, ocurrencia: int = 1,
                mas: int = 0, es: str | None = None, peso: int = 400, italica: bool = False, serif: bool = False,
                **kw) -> list[dict]:
    """Resaltador sobre la frase (una marca por renglón). `mas` alarga cada marca esos píxeles por lado (texto chico).

    Con `es="..."`, poco después de pintarse el resaltador el inglés se convierte en esa traducción, en su lugar y del
    mismo tamaño. `peso` (400, 600, 700), `italica` y `serif` imitan la letra del original (un titular en negritas).
    Solo si queda limpia: si en la oración quedaría inglés suelto junto al español, si deja un hueco antes de lo que sigue
    en el renglón o si no cabe en sus renglones, la frase se queda en inglés con su resaltador y lo avisa.
    """
    cuando = {"en": en} if en else {"t": t or 0}
    renglones = _renglones(fuente, frase, ocurrencia)
    marcas = [{"r": _mas(_union(l["rs"], 4), mas), "tipo": "marcador", **cuando, **kw} for l in renglones]
    if not es:
        return marcas
    # Una traducción a medias se lee como un error: el 19 de octubre, 30 de 89 salieron con inglés pegado al español
    # ("heels of DeepSeek lanzó su modelo"), huecos en blanco o encima de otro renglón. Mejor el inglés resaltado, que la
    # voz ya dice en español. El resto del párrafo alrededor de lo citado (otras oraciones) no cuenta.
    o = oracion(fuente, frase, ocurrencia)
    sueltos = [(x, donde) for x, donde in ((o["antes"], "antes"), (o["despues"], "después")) if x] if o else []
    tr = traduccion(fuente, renglones, es, peso, italica, serif)
    hueco, cabe = tr.pop("hueco"), tr.pop("cabe")
    motivo = ("en la misma oración quedaría en inglés " + " y ".join(f"«{x}» {donde}" for x, donde in sueltos)
              if sueltos else "no cabe en sus renglones" if not cabe
              else f"deja un hueco de {hueco} px junto al inglés que sigue" if hueco else "")
    if motivo:
        print(f'aviso: no se traduce "{frase}" ({fuente}): {motivo}. Márcala hasta el punto (la oración entera) y'
              ' tradúcela entera, o déjala en inglés.', file=sys.stderr)
        return marcas
    marcas[0]["es"] = tr
    for m in marcas[1:]:
        m["parte"] = True
    return marcas


# ---------- traducción de lo marcado ----------

_LETRAS = {(400, False, False): "segoeui.ttf", (400, True, False): "segoeuii.ttf", (600, False, False): "seguisb.ttf",
           (600, True, False): "seguisbi.ttf", (700, False, False): "segoeuib.ttf", (700, True, False): "segoeuiz.ttf",
           (400, False, True): "georgia.ttf", (400, True, True): "georgiai.ttf", (700, False, True): "georgiab.ttf",
           (700, True, True): "georgiaz.ttf"}


def _archivo_letra(peso: int, italica: bool, serif: bool) -> Path:
    """Segoe UI y Georgia en Windows; en Mac, Arial y Georgia; en Linux, DejaVu, que traen casi todos."""
    if sys.platform == "win32":
        return Path("C:/Windows/Fonts") / _LETRAS[(peso, italica, serif)]
    negrita = "Bold" if peso >= 600 else ""
    if sys.platform == "darwin":
        estilo = " ".join(x for x in (negrita, "Italic" if italica else "") if x)
        return Path("/System/Library/Fonts/Supplemental") / f"{'Georgia' if serif else 'Arial'}{' ' + estilo if estilo else ''}.ttf"
    estilo = negrita + (("Italic" if serif else "Oblique") if italica else "")
    return Path("/usr/share/fonts/truetype/dejavu") / f"{'DejaVuSerif' if serif else 'DejaVuSans'}{'-' + estilo if estilo else ''}.ttf"


def _letra(peso: int, italica: bool, tam: float, serif: bool = False):
    from PIL import ImageFont
    p = min(_LETRAS, key=lambda k: (k[2] != serif, k[1] != italica, abs(k[0] - peso)))
    return ImageFont.truetype(str(_archivo_letra(*p)), max(1, round(tam)))


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


def _rgb(css: str) -> tuple:
    """`rgb(12, 34, 56)` o `rgba(...)` de la página a una tupla."""
    return tuple(int(float(v)) for v in re.findall(r"[\d.]+", css)[:3])


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
    GitHub en Windows). Si no cabe, achica la letra hasta un 72 %; si aun así no cabe, `marca_texto` no la usa.
    """
    from PIL import Image
    img = Image.open(imagen(fuente)).convert("RGB")
    crudos = [_union(l["rs"], 0) for l in renglones]
    marcas = [_union(l["rs"], 4) for l in renglones]
    # Con el texto de la página, la letra es la de verdad: tamaño, peso, cursiva, color, fondo y línea base. Sin él, se
    # deducen de la imagen.
    L = renglones[0].get("letra")
    if L:
        peso, italica, serif = L["peso"], L["italica"], L["generica"] == "serif"
    f100 = _letra(peso, italica, 100, serif)
    if L:
        tam0 = L["tam"]
        fondo = _rgb(L["fondo"]) if L.get("fondo") else _colores(img, crudos)[0]
        tinta = _rgb(L["color"])
        bases = [l["base"] for l in renglones]
    else:
        # Tamaño de letra: el que hace que el inglés mida lo que mide en la imagen (su renglón más largo).
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
        _, lineas, f, xs = acomodar(tam, n + 1)
    elif tam < tam0 * 0.9:
        print(f'aviso: "{texto}" quedó al {tam / tam0:.0%} del tamaño del inglés en {fuente}; una traducción más corta'
              ' se ve mejor', file=sys.stderr)
    salida, cubre, anchos = [], [[m[0] - 2, m[1], m[2] + 4, m[3]] for m in marcas], {}
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
        anchos[i] = w
        cubre.append(r)
    # El hueco: lo que el parche deja vacío en el último renglón cuando sigue otro texto en inglés, o un renglón entero
    # sin español dentro del párrafo. El primero, vacío a propósito (la frase empezaba al final), no cuenta.
    hueco = 0
    for i in range(n):
        if i == 0 and lineas[0] == "":
            continue
        if not anchos.get(i) or (i == n - 1 and not renglones[-1]["al_final"]):
            hueco = max(hueco, crudos[i][2] - anchos.get(i, 0))
    hueco = round(hueco) if hueco > 0.6 * tam else 0
    cubre = [{"r": r, "fondo": _orillas(img, r, fondo)} for r in cubre]
    return {"lineas": salida, "tam": round(tam, 1), "peso": peso, "italica": italica, "serif": serif, "cubre": cubre,
            "fondo": _hexa(fondo), "tinta": _hexa(tinta), **({"familia": L["familia"]} if L else {}),
            "hueco": hueco, "cabe": cabe}


def caja_texto(fuente: str, frase: str, en: str | None = None, t: float | None = None, ocurrencia: int = 1,
               pad: int = 2, **kw) -> dict:
    """Una caja roja alrededor de toda la frase. `pad` en píxeles de la imagen; el componente suma 8 px de pantalla."""
    cuando = {"en": en} if en else {"t": t or 0}
    return {"r": _union(buscar(fuente, frase, ocurrencia), pad), **cuando, **kw}


def renglones(fuente: str, idioma: str = "en-US") -> list[list[int]]:
    """Las cajas de todos los renglones de la captura. guion.py las escribe en src/lineas.json para que el encuadre
    vertical (src/encuadre.ts) no corte un renglón a la mitad."""
    return [_union([w["r"] for w in l["palabras"]], 0) for l in ocr(fuente, idioma)["lineas"] if l["palabras"]]


# La forma de la pantalla donde se ve una captura: la zona de la escena en vertical (1080x1156, `ZONA` de
# Video.tsx), o 16:9 en horizontal. La fija `guion.py` con `fijar_formato`.
ASPECTO = 1080 / 1156


def fijar_formato(formato: str) -> None:
    """`"vertical"`: `zona()` da rectángulos con la forma de la zona de escena; si no, en 16:9."""
    global ASPECTO
    ASPECTO = 1080 / 1156 if formato == "vertical" else 16 / 9


def zona(fuente: str, frase: str, ancho: int | None = None, aspecto: float | None = None, ocurrencia: int = 1) -> list[int]:
    """Rectángulo para `vista` o `toma`, centrado en la frase y con la forma `aspecto` (ancho/alto; por defecto, la de la pantalla)."""
    aspecto = aspecto or ASPECTO
    x, y, w, h = _union(buscar(fuente, frase, ocurrencia), 0)
    W = max(ancho or 0, int(w * 1.25), int(h * 3 * aspecto))
    H = int(W / aspecto)
    return [max(0, x + w // 2 - W // 2), max(0, y + h // 2 - H // 2), W, H]


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
