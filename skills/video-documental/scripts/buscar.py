"""
Busca material real para varias ideas de una vez y lo enseña en una sola hoja, para elegir MIRANDO y no por el título.

    python -I -B -X utf8 <skill>/scripts/buscar.py "race start" "dripping tap" "foto:Googleplex" "archivo:car show 1950" "nasa:aurora"
    python -I -B -X utf8 <skill>/scripts/buscar.py --mira archive:DesignForDreaming            (qué segundo de un clip)

Desde la raíz del proyecto. Cada idea, entre comillas y en inglés (los bancos están en inglés), de dos o tres palabras:
  a secas      clips de banco de Mixkit (lo de hoy: manos, oficinas, ciudades, objetos) y alguno de Wikimedia Commons
  foto:<idea>  fotos de Wikimedia Commons (lugares, sedes, personas con nombre, objetos, eventos) y de NASA
  archivo:<idea>  películas de archivo de archive.org (Prelinger, dominio público): lo de época, para las metáforas
  nasa:<idea>  videos y fotos de NASA: el espacio, la Tierra, la ciencia
De cada candidato dice su referencia (`mixkit:4421`, `archive:…`, `commons:File:…`, `nasa:…`), que es lo que va en
`material` de momentos.json, tal cual. Deja `revision/busca.jpg`: una fila por idea, cada miniatura con su número.
Mírala una vez y elige.

`--mira <referencia de un clip>`: un cuadro por segundo del clip con su segundo encima (`revision/mira.jpg`), para
poner `desde` donde pasa lo que se dice (un grifo solo gotea cada tanto; una película de archivo abre con su rótulo).
Sin `desde`, el clip empieza un quinto adentro.

Sin llaves ni cuentas. Lo que no sale aquí (la página de la empresa, su foto, un post) va con su URL en `pagina`,
`foto` o `post`: eso se busca en la web.
"""

import io
import json
import re
import subprocess
import sys
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from material import AGENTE, API, Falla, pedir, pedir_json, resolver, sin_html  # noqa: E402

POR_IDEA = 6
LIMITADO: set[str] = set()   # los bancos que contestaron «demasiadas peticiones»


def mixkit(q: str) -> list[dict]:
    """Las páginas de etiqueta de Mixkit (su buscador se dibuja en el navegador y no da nada por aquí)."""
    palabras = re.sub(r"[^a-z0-9 ]+", " ", q.lower()).split()
    fuera, vistos = [], set()
    # La etiqueta entera y, solo si no da nada, sus palabras sueltas: «tap» a secas traía gente bailando.
    for etiqueta in dict.fromkeys(["-".join(palabras), palabras[-1] if palabras else "", palabras[0] if palabras else ""]):
        if not etiqueta or fuera:
            continue
        try:
            pagina = pedir(f"https://mixkit.co/free-stock-video/{etiqueta}/", espera=15)[0].decode("utf-8", "ignore")
        except Falla as e:
            if "429" in str(e):
                LIMITADO.add("Mixkit")
            continue
        for slug, id_ in re.findall(r'href="/free-stock-video/([a-z0-9\-]+)-(\d+)/"', pagina):
            if id_ in vistos:
                continue
            vistos.add(id_)
            # Los que la página enseña sin su mp4 no se pueden bajar (salían en la hoja y luego daban 403).
            video = re.search(rf"https://assets\.mixkit\.co/[^\"' ]*?{id_}[^\"' ]*?\.mp4", pagina)
            if not video:
                continue
            # La miniatura que la propia página enlaza: cada clip guarda las suyas en otra ruta.
            mini = re.search(rf"https://assets\.mixkit\.co/[^\"' ]*?{id_}[^\"' ]*?thumb-360-\d+\.jpg", pagina)
            fuera.append({"ref": f"mixkit:{id_}", "titulo": slug.replace("-", " "), "de": "Mixkit, libre", "video": video.group(0),
                          "mini": mini.group(0) if mini else f"https://assets.mixkit.co/videos/{id_}/{id_}-thumb-360-0.jpg"})
            if len(fuera) >= 5:
                break
    return fuera


def archive(q: str) -> list[dict]:
    u = ("https://archive.org/advancedsearch.php?q=" + urllib.parse.quote(f"({q}) AND mediatype:movies AND collection:(prelinger OR opensource_movies OR newsandpublicaffairs)")
         + "&fl[]=identifier&fl[]=title&fl[]=licenseurl&sort[]=downloads+desc&rows=5&output=json")
    return [{"ref": f"archive:{d['identifier']}", "titulo": str(d.get("title", ""))[:60],
             "de": "archive.org" + (", dominio público" if "publicdomain" in str(d.get("licenseurl", "")) else ", ver licencia"),
             "mini": f"https://archive.org/services/img/{d['identifier']}"} for d in pedir_json(u)["response"]["docs"]]


def commons(q: str, video: bool) -> list[dict]:
    u = ("https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=8"
         f"&gsrsearch={urllib.parse.quote(q + (' filetype:video' if video else ' filetype:bitmap'))}"
         "&prop=imageinfo&iiprop=url|extmetadata|mime|size&iiurlwidth=360")
    paginas = sorted((pedir_json(u).get("query", {}).get("pages", {}) or {}).values(), key=lambda p: p.get("index", 0))
    fuera = []
    for p in paginas:
        ii = (p.get("imageinfo") or [{}])[0]
        if ii.get("mime", "").startswith("video") != video or (not video and min(ii.get("width", 0), ii.get("height", 0)) < 700):
            continue
        licencia = sin_html(ii.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")) or "ver ficha"
        fuera.append({"ref": f"commons:{p['title']}", "titulo": p["title"][5:60], "de": f"Commons, {licencia}", "mini": ii.get("thumburl")})
    return fuera[:4]


def nasa(q: str, video: bool) -> list[dict]:
    u = f"https://images-api.nasa.gov/search?media_type={'video' if video else 'image'}&q=" + urllib.parse.quote(q)
    fuera = []
    for it in pedir_json(u)["collection"]["items"][:4]:
        d = it["data"][0]
        mini = next((l["href"] for l in it.get("links", []) if l.get("render") == "image"), None)
        fuera.append({"ref": f"nasa:{d['nasa_id']}", "titulo": str(d.get("title", ""))[:60], "de": "NASA, dominio público", "mini": mini})
    return fuera


def una_idea(idea: str) -> dict:
    """Los candidatos de una idea: cada banco a la vez, y primero los del que más acierta para lo que se pide."""
    clase, _, resto = idea.partition(":")
    clase = clase.strip().lower() if resto and clase.strip().lower() in ("foto", "archivo", "nasa") else ""
    q = resto.strip() if clase else idea.strip()
    # (el banco, cuántos se toman de él): lo primero es lo que más acierta; lo demás, por si no hay.
    fuentes = {"foto": [(lambda: commons(q, False), 5), (lambda: nasa(q, False), 1)],
               "archivo": [(lambda: archive(q), 4), (lambda: commons(q, True), 2)],
               "nasa": [(lambda: nasa(q, True), 4), (lambda: nasa(q, False), 2)],
               "": [(lambda: mixkit(q), 5), (lambda: commons(q, True), 1)]}[clase]

    def una(f):
        try:
            return f()
        except Exception:  # noqa: BLE001 — un banco caído no tumba los demás
            return []

    with ThreadPoolExecutor(len(fuentes)) as ex:
        listas = list(ex.map(lambda par: una(par[0]), fuentes))
    fuera = [c for lista, (_, n) in zip(listas, fuentes) for c in lista[:n]]
    # Si el primer banco no dio lo suyo, se rellena con lo que sobre de los demás.
    fuera += [c for lista, (_, n) in zip(listas, fuentes) for c in lista[n:]]
    return {"idea": idea, "candidatos": fuera[:POR_IDEA]}


def miniatura(c: dict):
    from PIL import Image
    try:
        im = Image.open(io.BytesIO(pedir(c["mini"], AGENTE if "wikimedia" not in str(c["mini"]) else API, 15)[0])).convert("RGB")
        im.thumbnail((236, 133))
        return im
    except Exception:  # noqa: BLE001
        return None


# Los títulos de Mixkit dicen lo que se ve: con una persona de frente («smiling woman», «couple of friends») es gente
# al azar; con solo sus manos o de espaldas, no. (Un detector de caras pediría bajar su modelo; el título basta.)
GENTE = re.compile(r"\b(wom[ae]n|m[ae]n|girls?|boys?|people|persons?|friends?|couple|family|portrait|faces?|selfie|child(ren)?|kids?"
                   r"|lady|guys?|smil\w+|elderly|students?|teachers?|workers?|team|bride|groom|baby|mother|father|models?)\b")
SOLO_PARTES = re.compile(r"\b(hands?|fingers?|feet|foot|legs?|silhouettes?|from behind|back view|crowd|aerial)\b")


def con_gente(titulo: str) -> bool:
    return bool(GENTE.search(titulo)) and not SOLO_PARTES.search(titulo)


def miniaturas(ideas: list[dict]) -> None:
    """La miniatura de cada candidato y, en los clips de banco, si sale gente: «nada de gente al azar» se decide aquí."""
    todos = [c for i in ideas for c in i["candidatos"]]
    with ThreadPoolExecutor(16) as ex:
        for c, im in zip(todos, ex.map(miniatura, todos)):
            c["im"] = im
            c["gente"] = c["ref"].startswith("mixkit:") and con_gente(c["titulo"])


def hoja(ideas: list[dict], salida: Path) -> None:
    from PIL import Image, ImageDraw
    alto, ancho = 176, 240
    lienzo = Image.new("RGB", (ancho * POR_IDEA, alto * len(ideas)), (24, 24, 26))
    d = ImageDraw.Draw(lienzo)
    for f, k, c in [(f, k, c) for f, i in enumerate(ideas) for k, c in enumerate(i["candidatos"])]:
        im = c.pop("im", None)
        x, y = k * ancho, f * alto
        if im:
            lienzo.paste(im, (x + (ancho - im.width) // 2, y + 40))
        else:
            d.text((x + 8, y + 90), "sin miniatura", fill=(220, 90, 90))
        d.text((x + 3, y + 3), f"{c['n']}  {c['ref']}"[:38], fill=(255, 220, 0))
        d.text((x + 3, y + 19), ("[gente] " if c.get("gente") else "") + c["titulo"][:38], fill=(255, 120, 120) if c.get("gente") else (190, 190, 190))
    for f, i in enumerate(ideas):
        if not i["candidatos"]:
            d.text((8, f * alto + 70), f"«{i['idea']}»: nada (prueba con otra palabra, más simple)", fill=(220, 90, 90))
    salida.parent.mkdir(parents=True, exist_ok=True)
    lienzo.save(salida, quality=82)


def mira(ref: str) -> None:
    """Un cuadro por segundo de un clip (hasta 60), con su segundo, para elegir `desde`."""
    try:
        url = resolver("clip", ref)["url"]
    except Falla as e:
        sys.exit(f"✗ {e}")
    if url.startswith("yt:"):
        sys.exit("✗ De YouTube no se mira desde aquí: da `desde` con el segundo que ya conoces del video.")
    salida = Path("revision") / "mira.jpg"
    salida.parent.mkdir(exist_ok=True)
    fuente = "fontfile='C\\:/Windows/Fonts/arial.ttf':" if sys.platform == "win32" else ""
    r = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-t", "60", "-i", url, "-vf",
                        f"fps=1,scale=240:-2,drawtext={fuente}text='%{{pts\\:flt}}':x=6:y=6:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6,tile=10x6:padding=3",
                        "-frames:v", "1", "-q:v", "4", str(salida)], capture_output=True, text=True)
    if r.returncode or not salida.exists():
        sys.exit(f"✗ No pude abrir {ref}: {r.stderr.strip()[-200:]}")
    print(f"✓ {salida}: un cuadro por segundo de {ref}, con su segundo. Pon `desde` donde pasa lo que se dice.")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    if args[0] == "--mira":
        if len(args) != 2:
            sys.exit(__doc__)
        return mira(args[1])
    with ThreadPoolExecutor(8) as ex:
        ideas = list(ex.map(una_idea, args))
    miniaturas(ideas)
    n = 0
    # Un renglón por idea: con uno por candidato, quien corta la salida (`| tail`) se quedaba sin las primeras ideas.
    for i in ideas:
        partes = []
        for c in i["candidatos"]:
            n += 1
            c["n"] = n
            # El título, solo donde la referencia no lo dice ya (las de Commons son el nombre del archivo).
            titulo = "" if c["ref"].startswith("commons:") else f" {c['titulo'][:44]}"
            partes.append(f"{n} {c['ref']}{titulo}" + (" [gente]" if c.get("gente") else ""))
        print(f"«{i['idea']}»  " + ("  |  ".join(partes) if partes else "nada (otra palabra, más simple)"))
    if LIMITADO:
        print(f"OJO: {', '.join(sorted(LIMITADO))} no contestó (demasiadas búsquedas seguidas): espera medio minuto y repite las "
              "ideas que salieron sin clips.")
    salida = Path("revision") / "busca.jpg"
    hoja(ideas, salida)
    # Para material.py: dónde está el mp4 de cada clip de Mixkit que ya se vio (también los de búsquedas anteriores).
    apunte = salida.with_suffix(".json")
    try:
        mixkit_vistos = json.loads(apunte.read_text(encoding="utf-8")).get("mixkit", {})
    except (OSError, ValueError, AttributeError):
        mixkit_vistos = {}
    mixkit_vistos.update({c["ref"][7:]: c["video"] for i in ideas for c in i["candidatos"] if c.get("video")})
    apunte.write_text(json.dumps({"mixkit": mixkit_vistos}, ensure_ascii=False), encoding="utf-8", newline="\n")
    print(f"\nMira {salida.resolve()} (una fila por idea, cada miniatura con su número) y elige por lo que se ve; en "
          "momentos.json va la referencia de ese número, tal cual está arriba. Esta lista es todo: no abras busca.json.\n"
          "[gente]: en ese clip de banco sale alguien de frente. Nada de gente al azar: solo si la frase habla de esa "
          "clase de persona; para lo demás, manos, espaldas, objetos y lugares.")


if __name__ == "__main__":
    main()
