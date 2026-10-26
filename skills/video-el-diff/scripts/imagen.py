"""
Fotos para recortar y pegar encima (`pegado()`): la persona que decide, el animal o el objeto del chiste. Busca en
Wikimedia Commons, que tiene retratos oficiales y fotos con licencia libre, y no pide llave.

    python imagen.py "<qué>" <carpeta> [n]

Baja hasta n candidatas (6 por defecto) a <carpeta> (fuentes/material/personas o fuentes/material/objetos), con
`creditos.json` (archivo, título, autor, licencia y URL) y una hoja con todas numeradas (<carpeta>/hoja.png) para
elegir sin abrirlas una por una. Busca en inglés y con el nombre exacto ("Jensen Huang", "llama animal", "bald eagle").

La elegida se recorta con la base común de video:
    python <skill>/../video-base/scripts/recorte.py <foto> public/recortes/<nombre>.png
"""

import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

AGENTE = "ElDiff/1.0 (Sloth; uso local)"
API = "https://commons.wikimedia.org/w/api.php"


def pedir(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": AGENTE}), timeout=40) as r:
        return r.read()


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    que, carpeta = sys.argv[1], Path(sys.argv[2])
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 6
    carpeta.mkdir(parents=True, exist_ok=True)
    q = urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search", "gsrsearch": f"filetype:bitmap {que}",
        "gsrnamespace": 6, "gsrlimit": n * 2, "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": 1600,
    })
    paginas = json.loads(pedir(f"{API}?{q}")).get("query", {}).get("pages", {})
    # El orden de la búsqueda (`index`) es el de relevancia.
    candidatas = sorted(paginas.values(), key=lambda p: p.get("index", 0))
    previos = carpeta / "creditos.json"
    creditos = json.loads(previos.read_text(encoding="utf8")) if previos.exists() else []
    # Repetir la búsqueda no pisa lo de antes: lo ya bajado se salta y los números siguen.
    vistas = {c.get("url") for c in creditos}
    base = que.lower().replace(" ", "-")[:40]
    k = max((int(m[1]) for f in carpeta.glob("*.jpg") if (m := re.fullmatch(re.escape(base) + r"-(\d+)\.jpg", f.name))),
            default=0)
    antes = k
    nuevas = []
    for p in candidatas:
        if len(nuevas) >= n:
            break
        info = (p.get("imageinfo") or [{}])[0]
        if info.get("width", 0) < 500 or not info.get("thumburl") or info.get("descriptionurl") in vistas:
            continue
        meta = info.get("extmetadata", {})
        k += 1
        nombre = f"{base}-{k}.jpg"
        try:
            (carpeta / nombre).write_bytes(pedir(info["thumburl"]))
        except OSError as e:
            print(f"  no bajó {p['title']}: {e}")
            continue
        nuevas.append({
            "archivo": nombre, "titulo": p["title"], "licencia": meta.get("LicenseShortName", {}).get("value"),
            "autor": meta.get("Artist", {}).get("value", "")[:200], "url": info.get("descriptionurl"),
        })
    if not nuevas:
        sys.exit(f"Commons no tiene fotos {'nuevas ' if antes else ''}de «{que}». Prueba en inglés, con otro nombre, "
                 f"{'con más (n), ' if antes else ''}o captura su foto de una fuente.")
    previos.write_text(json.dumps(creditos + nuevas, ensure_ascii=False, indent=1), encoding="utf8")

    ims = []
    for c in nuevas:
        im = Image.open(carpeta / c["archivo"]).convert("RGB")
        im.thumbnail((420, 420))
        ims.append(im)
    hoja = Image.new("RGB", (430 * min(3, len(ims)), 440 * ((len(ims) + 2) // 3)), "white")
    d = ImageDraw.Draw(hoja)
    for i, im in enumerate(ims):
        x, y = (i % 3) * 430, (i // 3) * 440
        hoja.paste(im, (x + 5, y + 15))
        d.rectangle([x, y, x + 34, y + 22], fill="black")
        d.text((x + 6, y + 4), nuevas[i]["archivo"].rsplit("-", 1)[1].removesuffix(".jpg"), fill="yellow")
    hoja.save(carpeta / "hoja.png")
    for c in nuevas:
        print(f"{c['archivo']} · {c['licencia']} · {c['titulo']}")
    print(f"hoja: {carpeta / 'hoja.png'}")


main()
