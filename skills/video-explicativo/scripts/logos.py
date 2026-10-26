"""
Baja todos los logos del video de una vez, a public/logos/<nombre>.png (256 px), y deja una hoja con todos para
mirarlos de un vistazo. Reddit y Telegram ya vienen en la plantilla.

    python -B -X utf8 <skill>/scripts/logos.py <nombre>[=<de dónde>] [...]     (desde la raíz del proyecto)

De dónde, para cada uno:
- nada o `x:<cuenta>`: la foto de su cuenta de X (unavatar.io). `opensea` es `opensea=x:opensea`.
- `sitio:<dominio>`: el ícono de su sitio (`discord=sitio:discord.com`), para cuando la foto de X no es el logo (una
  de Halloween, una persona).
- `https://…`: una imagen directa.

Si la foto de X no sale, prueba el ícono del sitio `<cuenta>.com`. Al final: `fuentes/logos/hoja.png`. Míralo: un
logo con disfraz o que no es el de la marca se vuelve a pedir con `sitio:`.
"""

import io
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

LADO = 256


def bajar(url: str) -> Image.Image:
    pedido = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(pedido, timeout=30) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGBA")


def fuentes(de: str) -> list[str]:
    if de.startswith("http"):
        return [de]
    if de.startswith("sitio:"):
        return [f"https://www.google.com/s2/favicons?domain={de[6:]}&sz=256"]
    cuenta = de[2:] if de.startswith("x:") else de
    return [f"https://unavatar.io/x/{cuenta}?fallback=false", f"https://www.google.com/s2/favicons?domain={cuenta}.com&sz=256"]


def uno(pedido: str, carpeta: Path) -> tuple[str, str]:
    nombre, _, de = pedido.partition("=")
    for url in fuentes(de or nombre):
        try:
            im = bajar(url)
        except Exception as e:  # noqa: BLE001
            ultimo = f"{type(e).__name__}: {e}"
            continue
        if min(im.size) < 64:
            ultimo = f"muy chico ({im.size[0]} px)"
            continue
        im.resize((LADO, LADO), Image.LANCZOS).save(carpeta / f"{nombre}.png")
        return nombre, f"listo ({im.size[0]} px, de {url.split('/')[2]})"
    return nombre, f"NO SALIÓ: {ultimo}"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    pedidos = sys.argv[1:]
    if not pedidos:
        sys.exit(__doc__)
    carpeta = Path("public/logos")
    carpeta.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(8) as hilos:
        for nombre, estado in hilos.map(lambda p: uno(p, carpeta), pedidos):
            print(f"{nombre}: {estado}")
    logos = sorted(carpeta.glob("*.png"))
    hoja = Image.new("RGBA", (LADO * len(logos), LADO + 10), "white")
    for i, p in enumerate(logos):
        hoja.paste(Image.open(p).convert("RGBA"), (i * LADO, 0), Image.open(p).convert("RGBA"))
    Path("fuentes/logos").mkdir(parents=True, exist_ok=True)
    hoja.save("fuentes/logos/hoja.png")
    print(f"Hoja con los {len(logos)} logos: fuentes/logos/hoja.png ({', '.join(p.stem for p in logos)})")


if __name__ == "__main__":
    main()
