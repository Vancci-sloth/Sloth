"""
Las fotos reales del video, todas en una llamada, a public/img/<nombre>.jpg: de la página donde salen (su og:image, la
foto que la página da para compartirse: la del producto, la del artículo) o de la URL de la imagen misma.

    python -B -X utf8 <skill>/scripts/imagenes.py <nombre>=<url> [<nombre>=<url>…]     (desde la raíz del proyecto)

Dice el tamaño de cada una, o por qué no se pudo; las que no salen se cambian por un ícono, no se inventan. Van en
momentos.json como `"tarjeta": { "tipo": "imagen", "src": "img/<nombre>.jpg", "pie": "…", "fuente": "…" }`.
"""

import html
import io
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

AGENTE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
ANCHO = 1200


def bajar(url: str) -> tuple[bytes, str]:
    pedido = urllib.request.Request(url, headers={"User-Agent": AGENTE, "Accept-Language": "es,en;q=0.8"})
    with urllib.request.urlopen(pedido, timeout=20) as r:
        return r.read(), r.headers.get("content-type", "")


def una(nombre: str, url: str) -> str:
    try:
        datos, tipo = bajar(url)
        if "html" in tipo:
            pagina = datos.decode("utf-8", errors="replace")
            m = re.search(r'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image)(?::src)?["\'][^>]*content=["\']([^"\']+)', pagina, re.I) or re.search(
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\'](?:og:image|twitter:image)', pagina, re.I)
            if not m:
                return f"✗ {nombre}: la página no trae foto para compartir (og:image); busca la URL de la imagen"
            datos, _ = bajar(urllib.parse.urljoin(url, html.unescape(m.group(1))))
        im = Image.open(io.BytesIO(datos))
        # Lo transparente (un diagrama en PNG) va sobre blanco: con convert("RGB") a secas quedaba negro y la molécula de
        # la adenosina salió líneas oscuras sobre negro.
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            fondo = Image.new("RGB", im.size, "white")
            fondo.paste(im, mask=im.getchannel("A"))
            im = fondo
        im = im.convert("RGB")
        if im.width < 300:
            return f"✗ {nombre}: muy chica ({im.width}×{im.height})"
        if im.width > ANCHO:
            im = im.resize((ANCHO, round(im.height * ANCHO / im.width)), Image.LANCZOS)
        destino = Path("public/img") / f"{nombre}.jpg"
        destino.parent.mkdir(parents=True, exist_ok=True)
        im.save(destino, quality=88)
        return f"✓ {nombre}: {destino.as_posix()} ({im.width}×{im.height})"
    except Exception as e:  # noqa: BLE001 — se dice y se sigue con las demás
        return f"✗ {nombre}: {e}"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    pares = [a.split("=", 1) for a in sys.argv[1:] if "=" in a]
    if not pares or not Path("package.json").exists():
        sys.exit(__doc__)
    with ThreadPoolExecutor(8) as ex:
        for linea in ex.map(lambda p: una(*p), pares):
            print(linea)


main()
