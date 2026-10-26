"""
Guarda un post de X como material: su JSON (texto, autor, fecha, métricas), el avatar, sus imágenes y su video.

    python tuit.py <url de x.com> <carpeta> [nombre]

Usa la API de fxtwitter (WebFetch no puede leer x.com). Para la captura real del post usa pagina.mjs con la misma
URL (ver MATERIAL.md): en el video se muestra la captura, con el video del post encima si lo trae.
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

from comun import sloth

sys.stdout.reconfigure(encoding="utf-8")


def bajar(url: str, destino: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    destino.write_bytes(urllib.request.urlopen(req, timeout=60).read())


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    url, carpeta = sys.argv[1], Path(sys.argv[2])
    m = re.search(r"(?:x|twitter)\.com/([^/]+)/status/(\d+)", url)
    if not m:
        sys.exit("no parece la URL de un post de X")
    usuario, ident = m.groups()
    nombre = sys.argv[3] if len(sys.argv) > 3 else f"{usuario}-{ident}"
    carpeta.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(f"https://api.fxtwitter.com/{usuario}/status/{ident}", headers={"User-Agent": "Mozilla/5.0"})
    d = json.loads(urllib.request.urlopen(req, timeout=60).read())
    (carpeta / f"{nombre}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf8")
    t = d["tweet"]
    autor = t["author"]
    print(f"@{autor['screen_name']} · {t.get('created_at')}\n{t.get('text')}")
    print(f"likes {t.get('likes')} · reposts {t.get('retweets')} · vistas {t.get('views')}")
    if autor.get("avatar_url"):
        bajar(autor["avatar_url"].replace("_normal", "_400x400"), carpeta / f"{autor['screen_name']}-avatar.jpg")
    media = t.get("media") or {}
    for i, f in enumerate(media.get("photos", []), 1):
        try:
            bajar(f["url"] + ("?name=orig" if "pbs.twimg.com" in f["url"] and "?" not in f["url"] else ""), carpeta / f"{nombre}-foto{i}.jpg")
        except Exception:
            bajar(f["url"], carpeta / f"{nombre}-foto{i}.jpg")
    if media.get("videos"):
        sloth("-m", "yt_dlp", "-o", str((carpeta / f"{nombre}.%(ext)s").resolve()), "--no-progress", url, check=False)
    print("guardado en", carpeta)


main()
