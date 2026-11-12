"""
Las plantillas de meme que todos reconocen (las 100 más usadas de imgflip, sin llave), para `"meme": "<nombre>"` de
momentos.json: el chiste visual que no pide buscar ni mirar nada.

    python -X utf8 <skill>/scripts/memes.py                 los nombres, en un renglón cada uno
    python -X utf8 <skill>/scripts/memes.py <palabras>      solo los que las llevan

`hacer.py` baja la que pide cada momento a public/web/meme-<nombre>.jpg y la guarda en la carpeta del noticiero
(`memes/`), donde también se queda la lista: un episodio sin internet usa las que ya bajó. Los memes en video (una
escena, una caricatura) son `clips`, con su `url`, `desde` y `hasta`.
"""

import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

API = "https://api.imgflip.com/get_memes"
AGENTE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36"


def slug(t: str) -> str:
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def lista(carpeta: Path) -> list[dict]:
    """Las plantillas: de la carpeta del noticiero si ya se pidieron, o de imgflip (y se guardan)."""
    guardada = carpeta / "indice.json"
    if guardada.exists():
        return json.loads(guardada.read_text(encoding="utf8"))
    with urllib.request.urlopen(urllib.request.Request(API, headers={"User-Agent": AGENTE}), timeout=20) as r:
        memes = [{"nombre": m["name"], "url": m["url"]} for m in json.load(r)["data"]["memes"]]
    carpeta.mkdir(parents=True, exist_ok=True)
    guardada.write_text(json.dumps(memes, ensure_ascii=False, indent=1) + "\n", encoding="utf8", newline="\n")
    return memes


def bajar(nombre: str, carpeta: Path, destino: Path) -> str | None:
    """La plantilla `nombre` (como en la lista, sin contar mayúsculas ni signos) a `destino`. Devuelve el error, si lo hay."""
    archivo = carpeta / f"{slug(nombre)}.jpg"
    if not archivo.exists():
        try:
            m = next((x for x in lista(carpeta) if slug(x["nombre"]) == slug(nombre)), None)
            if not m:
                return f"no hay una plantilla «{nombre}»: los nombres, con `python <skill>/scripts/memes.py`"
            with urllib.request.urlopen(urllib.request.Request(m["url"], headers={"User-Agent": AGENTE}), timeout=30) as r:
                crudo = r.read()
            from io import BytesIO

            from PIL import Image
            Image.open(BytesIO(crudo)).convert("RGB").save(archivo, quality=92)
        except Exception as e:  # noqa: BLE001 — se dice y el episodio sigue con lo demás
            return f"no se pudo bajar la plantilla «{nombre}»: {e}"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(archivo.read_bytes())
    return None


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    # Desde un episodio, la carpeta del noticiero es la de arriba; desde ella misma, la actual.
    aqui = Path.cwd()
    carpeta = (aqui.parent if (aqui / "src" / "Video.tsx").exists() else aqui) / "memes"
    buscadas = [slug(a) for a in sys.argv[1:]]
    for m in lista(carpeta):
        if all(b in slug(m["nombre"]) for b in buscadas):
            print(m["nombre"])


if __name__ == "__main__":
    main()
