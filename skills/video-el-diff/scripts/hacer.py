"""
El episodio entero en un comando, de fondo: de guion.md y momentos.json (lo único que escribe el agente) a
out/el-diff-final.mp4 con su portada y su hoja para mirarlo. Es el motor de MOTOR.md de video-base, con el director de
El Diff (director.py).

    python -B -X utf8 <skill>/scripts/hacer.py --revisa [--dura <min>]      solo revisa momentos.json (un segundo)
    python -B -X utf8 <skill>/scripts/hacer.py --studio <Voz> [--dura <min>]  con la voz de la línea `Voz:`
    python -B -X utf8 <skill>/scripts/hacer.py --audio <archivo>             con la que grabó el usuario
    python -B -X utf8 <skill>/scripts/hacer.py --sin-voz                     el material y las escenas, mientras llega la voz
    python -B -X utf8 <skill>/scripts/hacer.py --solo-voz --studio <Voz>     solo la voz, en cuanto el guion está cerrado
    python -B -X utf8 <skill>/scripts/hacer.py                               otra vez, con la voz que ya hay
    … --otra-vez                                                           un segundo render, solo si el usuario pidió un cambio

`--dura`: los minutos que pidieron. Si el guion se pasa o se queda corto más del 10 %, lo dice antes de pagar la voz.

Desde la raíz del episodio. En orden, y para diciendo todo lo que hay que arreglar:
1. Comprueba momentos.json contra guion.md (director.py): cada palabra, cada fuente, el ritmo, los rótulos, la prueba.
2. A la vez: las capturas de cada cita (capturar.mjs), los recortes de las personas, el metraje y las fotos (lo que ya
   está en la carpeta del noticiero no se baja otra vez), y la voz, que solo se pide si el guion cambió.
3. El director escribe guion.json; la línea de tiempo (adaptar.py), la música y la vista en vivo del estudio.
4. Lo que se mide sin renderizar (reglas.mjs): lo dice, y lo que es de acomodo lo arregla el director.
5. La portada (la del gancho sobre un cuadro del episodio) y el render (final.py), una sola vez.
"""

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
BASE = SKILL.parent / "video-base" / "scripts"
sys.path.insert(0, str(BASE))
sys.path.insert(0, str(SKILL / "scripts"))
import director  # noqa: E402
import memes  # noqa: E402
from momentos import Reloj, guardar, hoja, palabras_de, parar  # noqa: E402

RAIZ = Path.cwd()
PY = [sys.executable, "-B", "-X", "utf8"]
POR_MINUTO = 180  # las palabras por minuto de largo.py
# La carpeta del noticiero (donde vive marca.json): lo que ya se bajó para un episodio sirve en los siguientes.
RECORTES = RAIZ.parent / "recortes"
METRAJE = RAIZ.parent / "metraje"


def correr(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)


def cola(r: subprocess.CompletedProcess, n: int = 1500) -> str:
    return (r.stdout + r.stderr).strip()[-n:]


# --- el material, a la vez -------------------------------------------------------------------------------------------


# La columna mide lo que una captura para el celular (400 px a escala 3), venga la ventana del ancho que venga: a 660 px
# el recorte salía de 2,076 px y la letra, de 12 px en el video (la corrida larga del eval).
LECTOR = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
body{{margin:0;background:#fff;color:#15171a}} main{{max-width:368px;margin:0 auto;padding:26px 16px 48px;font:17px/1.5 Georgia,'Times New Roman',serif}}
.sitio{{font:700 12px/1 'Segoe UI',Arial,sans-serif;letter-spacing:.09em;text-transform:uppercase;color:#6b7280;margin-bottom:12px}}
h1{{font:800 25px/1.15 'Segoe UI',Arial,sans-serif;margin:0 0 18px}} p{{margin:0 0 15px}}
</style></head><body><main><article><div class="sitio">{sitio}</div><h1>{titulo}</h1>{parrafos}</article></main></body></html>"""


def vista_de_lectura(url: str, nombre: str) -> str | None:
    """
    Una página que no se deja capturar (un muro, un tope de tiempo), con su texto ya leído (fuentes/textos/): ese texto
    en una hoja limpia, con su sitio y su título, que sí se captura y sin red. Devuelve su URL de archivo, o None si la
    página no se leyó. El 10 de noviembre, theverge.com tardó más de 120 s y tumbó el episodio entero.
    """
    import html
    from urllib.parse import urlsplit

    from verificar import clave, textos
    archivo = textos().get(clave(url))
    if not archivo or not archivo.exists():
        return None
    cabeza, _, cuerpo = archivo.read_text(encoding="utf-8").partition("\n---\n")
    titulo = next((l[8:].strip() for l in cabeza.splitlines() if l.startswith("Título:")), "")
    fecha = next((l[10:].strip()[:10] for l in cabeza.splitlines() if l.startswith("Publicado:")), "")
    # Un párrafo por renglón del texto: lo leído del radar llega sin renglones en blanco, y un artículo en un solo
    # párrafo se recortaba entero, con letra de 12 px (la corrida larga del eval).
    parrafos = [x.strip() for x in cuerpo.splitlines() if x.strip() and x.strip() != titulo]
    hoja = RAIZ / "fuentes" / "paginas" / f"{nombre}-lectura.html"
    hoja.parent.mkdir(parents=True, exist_ok=True)
    hoja.write_text(LECTOR.format(sitio=html.escape(urlsplit(url).netloc.removeprefix("www.") + (f" · {fecha}" if fecha[:2] == "20" else "")),
                                  titulo=html.escape(titulo), parrafos="".join(f"<p>{html.escape(x)}</p>" for x in parrafos)), encoding="utf-8")
    return hoja.resolve().as_uri()


def capturar(lista: list[dict]) -> tuple[list[str], list[str]]:
    """capturar.mjs sobre una lista: las URL que no se dejaron (ERROR o VACÍA) y las citas que no están en su página."""
    guardar(RAIZ / "fuentes" / "capturas.json", lista)
    # Ocho Edge a la vez y 40 s de tope: en la tercera corrida larga las capturas fueron 131 de los 299 s de la máquina.
    r = correr(["node", str(SKILL / "scripts" / "capturar.mjs"), "fuentes/capturas.json", "--edges", "8", "--hoja", "revision/capturas.png"],
               env={**os.environ, "CAPTURA_TOPE": "40"})
    lineas = r.stdout.splitlines()
    caidas = [x["url"] for x in lista if any(l.startswith(("ERROR", "VACÍA")) and x["url"] in l for l in lineas)]
    faltas = [l[5:].strip().split(": ", 1)[-1] for l in lineas if l.startswith("FALTA")]
    if r.returncode and not caidas and not faltas and not any(l.startswith(("bien", "AVISO")) for l in lineas):
        faltas.append("capturar.mjs falló: " + cola(r, 600))
    return caidas, faltas


def copia_de(url: str) -> Path:
    """Donde queda la página entera de una URL (MHTML), guardada antes de saber qué se cita de ella."""
    from verificar import clave  # la misma página con o sin barra final, www o `?utm`
    return RAIZ / "fuentes" / "paginas" / f"pre-{hashlib.sha1(clave(url).encode()).hexdigest()[:10]}.mhtml"


def copias() -> None:
    """
    Las páginas de las fichas (fuentes/fichas/citas.json: de dónde sale cada dato del guion), guardadas enteras mientras
    se hace la voz y se escriben los momentos. Con la copia, cada captura es un recorte sin red, de unos 2 s; sin ella,
    abrir las páginas después de escribir los momentos eran 131 de los 299 s de la máquina (tercera corrida larga).
    """
    fichas = RAIZ / "fuentes" / "fichas" / "citas.json"
    urls = sorted({f["url"] for f in json.loads(fichas.read_text(encoding="utf8")) if str(f.get("url") or "").startswith("http")}) if fichas.exists() else []
    lista = [{"url": u, "png": f"fuentes/paginas/pre/{copia_de(u).stem}.png"} for u in urls if not copia_de(u).exists()]
    if not lista:
        return
    guardar(RAIZ / "fuentes" / "copias.json", lista)
    copiando = RAIZ / "fuentes" / "paginas" / "copiando"  # quien llegue a capturar espera a que acaben, y no abre las mismas
    copiando.parent.mkdir(parents=True, exist_ok=True)
    copiando.write_text("")
    try:
        correr(["node", str(SKILL / "scripts" / "capturar.mjs"), "fuentes/copias.json", "--edges", "8"], env={**os.environ, "CAPTURA_TOPE": "40"})
    finally:
        copiando.unlink(missing_ok=True)
    print(f"  copias: {sum(copia_de(x['url']).exists() for x in lista)} de {len(lista)} páginas guardadas", flush=True)


def capturas(m: dict) -> list[str]:
    """
    Las capturas que faltan, todas a la vez. Lo que la página viva no dio (no cargó a tiempo, un muro, o ya no trae la
    cita tal cual: un artículo que se editó), en una segunda vuelta desde su texto ya leído, que es contra el que
    `--revisa` comprobó la cita. Así una cita que pasó la revisión no tumba el episodio después de pagar la voz.
    """
    hecha = lambda png: (RAIZ / "fuentes" / "material" / png).exists()
    errores: list[str] = []
    copiando = RAIZ / "fuentes" / "paginas" / "copiando"
    while copiando.exists() and time.time() - copiando.stat().st_mtime < 90:
        time.sleep(0.5)
    for vuelta in (1, 2):
        faltan = director.lista_capturas(m, hecha)
        if not faltan:
            break
        nombres = {a: b for x in faltan for a, b in x.pop("nombres").items()}
        if vuelta == 2:
            leidas = []
            for x in faltan:
                hoja = vista_de_lectura(x["url"], Path(x["png"]).stem.rstrip("-"))
                if hoja:
                    leidas.append({**x, "url": hoja, "ancho": 400})
                    print(f"  aviso: {x['url']} no se dejó capturar: va su texto en una vista de lectura", flush=True)
                else:
                    errores.append(f"{x['url']} no se dejó capturar y no está leída (leer.mjs): usa otra fuente del mismo dato")
            faltan = leidas
            if not faltan:
                break
        else:
            # De la copia que se guardó mientras se hacía la voz, si está: sin red.
            faltan = [{**x, "url": str(copia_de(x["url"])), **({"ancho": 380} if re.search(r"(?:x|twitter)\.com/[^/]+/status/", x["url"]) else {})}
                      if copia_de(x["url"]).exists() else x for x in faltan]
        caidas, faltas = capturar(faltan)
        if vuelta == 2:
            errores += [f"{f}: copia la cita tal cual está en la página (fuentes/textos/) o quítala" for f in faltas]
            errores += [f"{u} no se pudo capturar ni desde su texto: usa otra fuente del mismo dato" for u in caidas]
        # Cada recorte, a su nombre de verdad (el de su cita).
        for sale, final in nombres.items():
            if (RAIZ / sale).exists():
                os.replace(RAIZ / sale, RAIZ / final)
    return errores


def persona(nombre: str, datos: dict) -> str | None:
    """Su recorte: el de la carpeta del noticiero o, si no está, la primera foto de Wikimedia Commons, recortada."""
    destino = RAIZ / "public" / "recortes" / f"{nombre}.png"
    if destino.exists():
        return None
    destino.parent.mkdir(parents=True, exist_ok=True)
    guardado = RECORTES / f"{nombre}.png"
    if guardado.exists():
        shutil.copy2(guardado, destino)
        return None
    carpeta = RAIZ / "fuentes" / "material" / "personas" / nombre
    foto = datos.get("foto")
    if foto and Path(foto).exists():
        elegida = Path(foto)
    else:
        r = correr(PY + [str(SKILL / "scripts" / "imagen.py"), datos.get("busca") or datos.get("nombre") or nombre, str(carpeta), "3"])
        fotos = sorted(carpeta.glob("*.jpg"))
        if r.returncode or not fotos:
            return f"personas.{nombre}: no hay foto libre de «{datos.get('busca') or datos.get('nombre') or nombre}» en Commons; pon `busca` con su nombre exacto en inglés, `foto` con un archivo, o quítala"
        elegida = fotos[0]
    r = correr(PY + [str(BASE / "recorte.py"), str(elegida), str(destino)])
    if r.returncode or not destino.exists():
        return f"personas.{nombre}: no se pudo recortar {elegida.name}: {cola(r, 300)}"
    RECORTES.mkdir(exist_ok=True)
    shutil.copy2(destino, guardado)
    return None


def clip(nombre: str, datos: dict) -> str | None:
    """Su metraje: el de la carpeta del noticiero o, si no está, el tramo de `url` de `desde` a `hasta`."""
    destino = RAIZ / "public" / "videos" / f"{nombre}.mp4"
    if destino.exists():
        return None
    destino.parent.mkdir(parents=True, exist_ok=True)
    guardado = METRAJE / f"{nombre}.mp4"
    if guardado.exists():
        shutil.copy2(guardado, destino)
        return None
    if not datos.get("url") or "desde" not in datos or "hasta" not in datos:
        return f"clips.{nombre}: no está en la carpeta del noticiero ({METRAJE}); dale `url`, `desde` y `hasta` (segundos del original)"
    r = correr(PY + [str(SKILL / "scripts" / "metraje.py"), "bajar", datos["url"], str(datos["desde"]), str(datos["hasta"]), str(destino),
                     *(["--llenar"] if datos.get("llenar") else [])])
    if r.returncode or not destino.exists():
        return f"clips.{nombre}: no se pudo bajar ({cola(r, 300)}); usa otro video del mismo momento o quítalo"
    METRAJE.mkdir(exist_ok=True)
    shutil.copy2(destino, guardado)
    indice = METRAJE / "indice.json"
    todo = json.loads(indice.read_text(encoding="utf-8")) if indice.exists() else {}
    todo[nombre] = {k: datos[k] for k in ("url", "desde", "hasta", "que", "llenar") if k in datos}
    guardar(indice, todo)
    return None


def logo(nombre: str, de: str) -> str | None:
    """
    El logo de una empresa a public/logos/<nombre>.png: el ícono de su sitio (`sitio:<dominio>`), la foto de su cuenta de
    X (`x:<cuenta>`) o una imagen (`https://…`). Lo que ya está en la carpeta del noticiero no se baja otra vez.
    """
    destino = RAIZ / "public" / "logos" / f"{nombre}.png"
    if destino.exists():
        return None
    destino.parent.mkdir(parents=True, exist_ok=True)
    guardado = RAIZ.parent / "logos" / f"{nombre}.png"
    if guardado.exists():
        shutil.copy2(guardado, destino)
        return None
    import io

    from PIL import Image
    de = de or f"sitio:{nombre}.com"
    if de.startswith("http"):
        urls = [de]
    elif de.startswith("sitio:"):
        # El ícono del sitio suele ser de 32 px (bing.com): si sale chico, la foto de su cuenta de X o su logo de Clearbit.
        dominio = de[6:].split("/")[0]
        urls = [f"https://www.google.com/s2/favicons?domain={dominio}&sz=256", f"https://unavatar.io/x/{dominio.split('.')[-2]}?fallback=false",
                f"https://logo.clearbit.com/{dominio}"]
    else:
        urls = [f"https://unavatar.io/x/{de.removeprefix('x:')}?fallback=false"]
    mejor, ultimo = None, ""
    for url in urls:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=20) as r:
                im = Image.open(io.BytesIO(r.read())).convert("RGBA")
        except Exception as e:  # noqa: BLE001 — se prueba la siguiente
            ultimo = str(e)
            continue
        if mejor is None or min(im.size) > min(mejor.size):
            mejor = im
        if min(mejor.size) >= 128:
            break
    if mejor is None or min(mejor.size) < 32:
        return f"logos.{nombre}: no salió ({ultimo or 'muy chico'}); prueba `sitio:<su dominio>`, `x:<su cuenta>` o la URL de la imagen, o quítalo"
    mejor.resize((256, 256), Image.LANCZOS).save(destino)
    guardado.parent.mkdir(exist_ok=True)
    shutil.copy2(destino, guardado)
    return None


def imagen(nombre: str, datos: dict) -> str | None:
    """Una foto real: la de la página (su og:image) o la URL de la imagen, a public/web/img-<nombre>.jpg."""
    destino = RAIZ / "public" / "web" / f"img-{nombre}.jpg"
    if destino.exists():
        return None
    try:
        from PIL import Image
        import io
        pedido = urllib.request.Request(datos["url"], headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36"})
        with urllib.request.urlopen(pedido, timeout=20) as r:
            crudo, tipo = r.read(), r.headers.get("content-type", "")
        if "html" in tipo:
            pagina = crudo.decode("utf-8", errors="replace")
            mm = re.search(r'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\'][^>]*content=["\']([^"\']+)', pagina, re.I) or \
                re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\'](?:og:image|twitter:image)', pagina, re.I)
            if not mm:
                return f"imagenes.{nombre}: la página no trae foto para compartir; pon la URL de la imagen"
            from html import unescape
            from urllib.parse import urljoin
            with urllib.request.urlopen(urllib.request.Request(urljoin(datos["url"], unescape(mm.group(1))), headers=pedido.headers), timeout=20) as r:
                crudo = r.read()
        im = Image.open(io.BytesIO(crudo)).convert("RGB")
        if im.width < 400:
            return f"imagenes.{nombre}: muy chica ({im.width}×{im.height})"
        destino.parent.mkdir(parents=True, exist_ok=True)
        im.save(destino, quality=90)
    except Exception as e:  # noqa: BLE001 — se dice y se sigue con lo demás
        return f"imagenes.{nombre}: {e}"
    return None


# --- la voz ----------------------------------------------------------------------------------------------------------


def pedir(ruta: str, datos: dict | None = None) -> dict:
    url = os.environ.get("SLOTH_URL", "http://127.0.0.1:4848").rstrip("/") + ruta
    pedido = urllib.request.Request(url, data=json.dumps(datos).encode() if datos else None, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(pedido, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"la voz: {json.load(e).get('error', e)} (VOZ.md de video-base: «Si falla»)")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Sloth no contesta en {url}: {e.reason}")


def terminos(g: director.Guion) -> str:
    """Los nombres propios del guion, de pista para el transcriptor: lo que va en mayúscula sin empezar oración."""
    vistos, antes = [], "."
    for w in g.crudas:
        limpia = w.strip("«»\"'()¿?¡!.,;:")
        if limpia[:1].isupper() and not antes.endswith((".", "?", "!", ":")) and len(limpia) > 2 and limpia not in vistos:
            vistos.append(limpia)
        antes = w
    return ",".join(vistos[:40])


def voz(args: dict, g: director.Guion) -> str | None:
    """La voz solo si el guion cambió desde la última (o si no hay). Devuelve el error, si lo hubo."""
    firma = hashlib.sha1((RAIZ / "guion.md").read_bytes()).hexdigest()
    hecha = RAIZ / "fuentes" / "voz" / "guion.sha1"
    lista = (RAIZ / "public" / "voz" / "narracion.wav").exists() and (RAIZ / "fuentes" / "voz" / "palabras.json").exists()
    # Si `--solo-voz` la está haciendo de fondo para este mismo guion, se espera esa: pedirla otra vez la pondría en fila
    # detrás de la primera. Quien la hace de fondo (`--de-fondo`) no espera su propia marca.
    pidiendo = RAIZ / "fuentes" / "voz" / "pidiendo"
    en_curso = lambda: pidiendo.exists() and pidiendo.read_text().strip() == firma and time.time() - pidiendo.stat().st_mtime < 600
    if not args.get("de-fondo") and en_curso():
        print("  la voz se está haciendo de fondo: la espero…", flush=True)
        while en_curso() and not (hecha.exists() and hecha.read_text().strip() == firma):
            time.sleep(1)
        lista =(RAIZ / "public" / "voz" / "narracion.wav").exists() and (RAIZ / "fuentes" / "voz" / "palabras.json").exists()
        if not (lista and hecha.exists() and hecha.read_text().strip() == firma) and (RAIZ / "voz.log").exists():
            print("  la voz de fondo no salió: " + (RAIZ / "voz.log").read_text(encoding="utf-8", errors="replace").strip()[-300:], flush=True)
    if not args.get("studio") and not args.get("audio"):
        if lista and (not hecha.exists() or hecha.read_text().strip() == firma):
            return None
        return ("el guion cambió desde la voz: corre hacer.py con --studio <Voz> o --audio <archivo>" if lista
                else "falta la voz: --studio <Voz> o --audio <archivo>")
    pidiendo.parent.mkdir(parents=True, exist_ok=True)
    pidiendo.write_text(firma)
    try:
        return voz_nueva(args, g, firma, hecha, lista)
    finally:
        pidiendo.unlink(missing_ok=True)


def voz_nueva(args: dict, g: director.Guion, firma: str, hecha: Path, lista: bool) -> str | None:
    if args.get("studio"):
        if lista and hecha.exists() and hecha.read_text().strip() == firma:
            return None
        audio = RAIZ / "fuentes" / "voz" / "ai-studio.wav"
        try:
            for intento in (1, 2):
                t = pedir("/api/voz/generar", {"voz": args["studio"], "archivo": str((RAIZ / "guion.md").resolve()), "salida": str(audio.resolve())})
                while t["estado"] in ("en-fila", "generando"):
                    t = pedir(f"/api/voz/trabajos/{t['id']}?esperar=40")
                # AI Studio a veces cierra su página o pierde la descarga a medias: se pide otra vez, una sola. La cuota
                # del día y la cuenta sin conectar no se arreglan repitiendo.
                if t["estado"] != "error" or intento == 2 or any(x in str(t.get("error", "")).lower() for x in ("cuota", "429", "cuenta", "sesión", "llave")):
                    break
                print(f"  la voz falló ({str(t.get('error'))[:80]}); otra vez…", flush=True)
            if t["estado"] == "error":
                return f"la voz: {t['error']} (VOZ.md de video-base: «Si falla»)"
        except RuntimeError as e:
            return str(e)
    else:
        audio = Path(args["audio"])
    r = correr(PY + [str(SKILL / "scripts" / "voz.py"), str(audio), terminos(g)])
    if r.returncode:
        return "voz.py: " + cola(r, 900)
    for linea in r.stdout.splitlines():
        if linea.startswith(("voz:", "AVISO", "aviso")) or "repetido" in linea or "CIFRA" in linea:
            print("  " + linea, flush=True)
    hecha.parent.mkdir(parents=True, exist_ok=True)
    hecha.write_text(firma + "\n")
    return None


# --- después del material ----------------------------------------------------------------------------------------------


def medible(guion: dict) -> tuple[list[str], dict[int, set[str]]]:
    """
    reglas.mjs, sin renderizar: lo citado chico, cortado o tapado, las marcas fuera y las capturas en tira. Devuelve los
    hallazgos y, de los «cita tapada», qué mover en qué momento: un rótulo o una pegatina que cae sobre lo citado se van
    al otro lado sin que el agente dé otra vuelta (era la mayoría de los arreglos de las revisiones a mano).
    """
    # Cada medio segundo: lo que tapa una cita se queda segundos, y a 0,2 s medirlo eran 29 s en un episodio de seis minutos.
    # `--minimo 0.6`: en dos muestras seguidas; con una sola contaba lo que dura un cuadro de una entrada.
    r = correr(["node", str(SKILL / "scripts" / "reglas.mjs"), "--paso", "0.5", "--minimo", "0.6"])
    # Lo de la tarjeta de la marca (el logo, la despedida) no es del episodio: su entrada animada a veces se mide a medias.
    de_la_marca = {b["id"] for p in guion["parrafos"] for b in p["beats"] if b["v"].get("tipo") == "logo"}
    hallazgos = [l.strip() for l in r.stdout.splitlines() if re.match(r"\s*b\d+\s", l) and l.split()[0] not in de_la_marca]
    momento = {b["id"]: b.get("momento") for p in guion["parrafos"] for b in p["beats"]}
    mover: dict[int, set[str]] = {}
    for h in hallazgos:
        if "cita tapada" not in h or not momento.get(h.split()[0]):
            continue
        # Quién tapa: una pegatina sale como su imagen o como su caja vacía («DIV»); un rótulo, con su texto.
        beat = next(b for p in guion["parrafos"] for b in p["beats"] if b["id"] == h.split()[0])
        rotulos = [e for e in beat["v"].get("encima") or [] if e.get("tipo") == "rotulo"]
        quien = h.rsplit("por «", 1)[-1].rstrip("»)").upper()
        # Si el texto de quien tapa es el de uno de esos rótulos (el hallazgo lo trae recortado).
        es = lambda cuales: any(quien in t or t in quien for t in (str(e.get("texto", "")).upper().replace("\n", " ") for e in rotulos if cuales(e.get("estilo"))) if t)
        que = ("logos" if "/logos/" in h or quien == "DIV" else "persona" if "/recortes/" in h
               else "nota" if es(lambda s: s == "traduccion") else "sello" if es(lambda s: s == "sello")
               else "rotulos" if es(lambda s: s not in ("traduccion", "sello")) else None)
        if que:
            mover.setdefault(momento[h.split()[0]] - 1, set()).add(que)
    return hallazgos, mover


def portada(m: dict, guion: dict, vertical: bool) -> str | None:
    """
    La del vertical (PORTADA.md de video-base): el gancho en un renglón sobre un cuadro del episodio, de un beat que no
    sea texto citado si lo hay. final.py la pega de primer cuadro.
    """
    destino = RAIZ / "portada.png"
    if not vertical or destino.exists():
        return None
    beats = [b for p in guion["parrafos"] for b in p["beats"]]
    sin_texto = [b for b in beats if b["v"].get("clip") or b["v"].get("encuadre") == "cubre" or any(e.get("tipo") == "pegado" for e in b["v"].get("encima") or [])]
    elegido = (sin_texto or [b for b in beats if b["v"].get("tipo") == "captura"] or beats)[0]["id"]
    r = correr(["node", "revisar.mjs", "0.95", elegido], env={**os.environ, "VIDEO_EL_DIFF": str(SKILL)})
    cuadro = RAIZ / "revision" / f"{elegido}_95.jpg"
    if r.returncode or not cuadro.exists():
        return "la portada: no salió el cuadro de fondo: " + cola(r, 400)
    titulo = " ".join(x.strip() for x in str(m.get("gancho") or guion.get("gancho") or RAIZ.name).replace("\n", "/").split("/") if x.strip())
    r = correr(["node", str(BASE / "portada_sin_ia.mjs"), str(cuadro), str(destino), "--titulo", titulo])
    return None if destino.exists() else "la portada: " + cola(r, 400)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if not (RAIZ / "src" / "Video.tsx").exists():
        sys.exit("Córrelo desde la raíz del episodio (la carpeta que creó nuevo.py).")
    a = sys.argv[1:]
    args: dict = {}
    while a:
        x = a.pop(0)
        if x in ("--studio", "--audio", "--dura") and a:
            args[x[2:]] = a.pop(0)
        elif x in ("--revisa", "--sin-voz", "--solo-voz", "--otra-vez", "--de-fondo"):
            args[x[2:]] = True
        else:
            sys.exit(__doc__)
    # Lo largo, antes que nada y aunque aún no haya momentos: cambiar el guion después de escribirlos los desancla todos
    # (en la primera corrida del eval el guion salió de 237 palabras para 180 y hubo que rehacer las dos cosas).
    g = director.Guion()
    if args.get("dura"):
        n, quiere = len(palabras_de(" ".join(g.crudas))), round(float(args["dura"]) * POR_MINUTO)
        if abs(n - quiere) > quiere * 0.10:
            sys.exit(f"✗ El guion tiene {n} palabras (~{n / POR_MINUTO:.1f} min) y pidieron {float(args['dura']):g} min (~{quiere} palabras, contando "
                     "la frase del logo, la despedida y la invitación): " + (f"quítale {n - quiere}." if n > quiere else f"súmale {quiere - n}."))
        if args.get("revisa") and not (RAIZ / "momentos.json").exists():
            print(f"✓ el guion mide {n} palabras (~{n / POR_MINUTO:.1f} min): ya puedes escribir momentos.json")
            return
    if args.get("solo-voz"):
        # La voz de un episodio de 6 minutos tarda unos 2: se pide de fondo en cuanto el guion mide lo que tiene que medir,
        # mientras se escriben los momentos. Después, hacer.py la encuentra hecha.
        if not args.get("de-fondo"):
            # Vuelve enseguida: la voz y las copias de las páginas siguen solas (voz.log), y hacer.py las espera.
            if not args.get("studio") and not args.get("audio"):
                sys.exit("✗ --solo-voz lleva --studio <Voz> o --audio <archivo>")
            # La marca, antes de lanzarlo: un hacer.py que llegue enseguida espera esta voz en vez de pedir otra.
            (RAIZ / "fuentes" / "voz").mkdir(parents=True, exist_ok=True)
            (RAIZ / "fuentes" / "voz" / "pidiendo").write_text(hashlib.sha1((RAIZ / "guion.md").read_bytes()).hexdigest())
            with open(RAIZ / "voz.log", "w", encoding="utf-8") as log:
                subprocess.Popen(PY + [str(Path(__file__).resolve()), *sys.argv[1:], "--de-fondo"], cwd=RAIZ, stdout=log, stderr=subprocess.STDOUT,
                                 stdin=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "DETACHED_PROCESS", 0))
            print("✓ el guion mide lo que debe. La voz y las copias de las páginas ya se hacen de fondo (voz.log): no las esperes, "
                  "escribe momentos.json; hacer.py las toma hechas o espera lo que les falte")
            return
        with ThreadPoolExecutor(2) as pool:
            de_las_copias = pool.submit(copias)
            error = voz(args, g)
            de_las_copias.result()
        if error:
            sys.exit("✗ " + error)
        print("✓ voz lista (public/voz/narracion.wav): hacer.py ya no la pide otra vez mientras no cambie guion.md")
        return
    m, g, mc = director.cargar()
    plan = director.revisar(m, g, mc)
    if args.get("revisa"):
        print(f"✓ momentos.json bien ({len(plan)} beats): ya puedes lanzar hacer.py de fondo")
        return

    reloj = Reloj(RAIZ)
    reloj.paso("momentos.json bien; el material y la voz, a la vez…")
    from comun import enlazar_modulos
    enlazar_modulos(RAIZ)
    trabajos: list[tuple[str, object]] = [("capturas", lambda: capturas(m))]
    trabajos += [("recortes", lambda n=n, d=d: [e] if (e := persona(n, d)) else []) for n, d in (m.get("personas") or {}).items()]
    trabajos += [("metraje", lambda n=n, d=d: [e] if (e := clip(n, d)) else []) for n, d in (m.get("clips") or {}).items()]
    trabajos += [("fotos", lambda n=n, d=d: [e] if (e := imagen(n, d)) else []) for n, d in (m.get("imagenes") or {}).items()]
    trabajos += [("logos", lambda n=n, d=d: [e] if (e := logo(n, d)) else []) for n, d in (m.get("logos") or {}).items()]
    pedidos = sorted({mo["meme"] for mo in m.get("momentos") or [] if mo.get("meme")})
    trabajos += [("memes", lambda n=n: [e] if (e := memes.bajar(n, RAIZ.parent / "memes", RAIZ / "public" / "web" / f"meme-{memes.slug(n)}.jpg")) else []) for n in pedidos]
    if not args.get("sin-voz"):
        trabajos.append(("voz", lambda: [e] if (e := voz(args, g)) else []))
    import time
    tardo: dict[str, float] = {}

    def medido(par: tuple[str, object]) -> list[str]:
        t0 = time.time()
        try:
            return par[1]()
        finally:
            tardo[par[0]] = tardo.get(par[0], 0) + time.time() - t0

    with ThreadPoolExecutor(6) as pool:
        errores = [e for lista in pool.map(medido, trabajos) for e in lista]
    print("  " + " · ".join(f"{k} {v:.0f} s" for k, v in tardo.items()), flush=True)
    # Lo que va encima (un logo, un recorte) y no bajó no tumba el episodio: va sin él, y se dice. En la segunda corrida
    # larga del eval, el logo de TSMC (su sitio no resolvió) costó tres vueltas y cinco minutos.
    for clave, carpeta, campo in (("logos", "logos", "logo"), ("personas", "recortes", "persona")):
        for nombre in [n for n in (m.get(clave) or {}) if not (RAIZ / "public" / carpeta / f"{n}.png").exists()]:
            errores = [e for e in errores if not e.startswith(f"{clave}.{nombre}:")]
            del m[clave][nombre]
            for mo in m["momentos"]:
                if mo.get(campo) == nombre:
                    del mo[campo]
                elif isinstance(mo.get(campo), list) and nombre in mo[campo]:
                    mo[campo] = [x for x in mo[campo] if x != nombre]
            print(f"  aviso: no salió {'el logo' if clave == 'logos' else 'el recorte'} de «{nombre}»: el episodio va sin él", flush=True)
    r = correr(PY + [str(SKILL / "scripts" / "material.py")])
    if r.returncode:
        errores.append("material.py: " + cola(r, 600))

    reloj.paso("las escenas (director)…")
    guion, d = director.escribir(m, g, mc, plan)
    for aviso in d.avisos:
        print("  aviso: " + aviso, flush=True)
    errores += d.errores
    errores += [f"falta en public/: {f} (no se bajó: arriba dice por qué, o no está en `clips`, `personas` ni `imagenes`)" for f in sorted(d.faltan)
                if not any(Path(f).stem.split("-")[0] in e for e in errores)]
    errores += [f"sin traducir: {x}" for x in director.sin_traducir(guion)]
    parar(errores, "el episodio")
    if args.get("sin-voz"):
        print(f"✓ material y escenas listos ({sum(len(p['beats']) for p in guion['parrafos'])} beats). Con la voz: hacer.py --audio <archivo>")
        return

    reloj.paso("la línea de tiempo, la música y la vista en vivo…")
    r = correr(PY + ["voz/adaptar.py"])
    parte = re.search(r"\((\d+)%\)", r.stdout)
    if (r.returncode or not parte or int(parte.group(1)) < 90) and args.get("studio"):
        # AI Studio a veces se salta una frase (una cita entre comillas, en la tercera corrida corta): se pide otra vez,
        # una sola, sin que el agente tenga que borrar la de antes a mano.
        print("  la voz de AI Studio no dice el guion entero: la pido otra vez…", flush=True)
        for viejo in ("ai-studio.wav", "ai-studio.wav.huella", "guion.sha1", "palabras.json"):
            (RAIZ / "fuentes" / "voz" / viejo).unlink(missing_ok=True)
        if error := voz(args, g):
            sys.exit("✗ " + error)
        r = correr(PY + ["voz/adaptar.py"])
        parte = re.search(r"\((\d+)%\)", r.stdout)
    if r.returncode or not parte or int(parte.group(1)) < 90:
        sys.exit("✗ La voz no es la de este guion (adaptar.py):\n" + cola(r, 900) + "\nSi cambiaste guion.md, pide la voz otra vez: hacer.py --studio <Voz>.")
    # La música (unos 10 s en un episodio de seis minutos) se sintetiza mientras se mide: medir solo mira la imagen.
    with ThreadPoolExecutor(1) as aparte:
        musica = aparte.submit(correr, PY + ["audio/sintetizar.py"])
        r = correr(["node", "vivo.mjs"])
        if r.returncode:
            sys.exit("✗ vivo.mjs:\n" + cola(r))
        reloj.paso("lo que se mide sin renderizar…")
        hallazgos, mover = medible(guion)
        if musica.result().returncode:
            sys.exit("✗ sintetizar.py:\n" + cola(musica.result()))
    if mover:
        # Una sola vuelta: lo que tapaba una cita cambia de lado, y se mide otra vez para decir lo que quede.
        guion, d = director.escribir(m, g, mc, plan, mover)
        for cmd in (PY + ["voz/adaptar.py"], ["node", "vivo.mjs"]):
            correr(cmd)
        # Sin medir otra vez (un minuto más en un episodio de seis): lo movido se quita de la lista y se dice.
        movidos = {f"b{n:02d}" for n in range(1, 999) if any(b.get("momento", 0) - 1 in mover and b["id"] == f"b{n:02d}" for p in guion["parrafos"] for b in p["beats"])}
        hallazgos = [h for h in hallazgos if not ("cita tapada" in h and h.split()[0] in movidos)]
        print(f"  {len(mover)} escenas con algo sobre lo citado: lo de encima pasó al otro lado", flush=True)
    if hallazgos:
        print("  Lo que se midió (de acomodo; cámbialo solo si es de tu momentos.json: otra cita, otro rótulo):", flush=True)
        for h in hallazgos[:25]:
            print("  ✘ " + h, flush=True)
    vertical = guion["formato"] == "vertical"
    if error := portada(m, guion, vertical):
        sys.exit("✗ " + error)
    reloj.paso("render…")
    r = correr(PY + [str(SKILL / "scripts" / "final.py"), *(["--otra-vez"] if args.get("otra-vez") else [])])
    for linea in r.stdout.splitlines():
        if linea.startswith(("final:", "tramos:")):
            print("  " + linea, flush=True)
    video = RAIZ / "out" / "el-diff-final.mp4"
    if r.returncode or not video.exists():
        sys.exit("✗ final.py:\n" + cola(r, 2000))
    # El episodio de un vistazo: unos 70 cuadros, a lo ancho en vertical.
    from momentos import duracion
    dura = duracion(video)
    mira = hoja(video, RAIZ / "revision" / "hoja.png", cada=max(1.5, dura / 72), columnas=12 if vertical else 6, ancho=160 if vertical else 320)
    reloj.listo(video, [mira] + ([RAIZ / "portada.png"] if vertical else []))


if __name__ == "__main__":
    main()
