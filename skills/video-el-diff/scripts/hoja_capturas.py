"""
Hoja de contacto de capturas al tamaño de un celular: cada una a 360 px de ancho (lo que mide la zona de la escena en
la pantalla de un teléfono), con su nombre, en filas de 6. Lo alto se corta a 640 px: lo de abajo no cabe en la zona.

    python hoja_capturas.py <salida.png> <png> [<png> ...]

La deja `capturar.mjs --hoja`: quien la revisa ve de un vistazo si cada una se lee, en vez de abrirlas una por una.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ANCHO, ALTO, COLUMNAS, ETIQUETA = 360, 640, 6, 22


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    salida, pngs = Path(sys.argv[1]), sys.argv[2:]
    filas = (len(pngs) + COLUMNAS - 1) // COLUMNAS
    hoja = Image.new("RGB", (COLUMNAS * (ANCHO + 8), filas * (ALTO + ETIQUETA + 8)), (24, 24, 28))
    letra = ImageFont.truetype("arial.ttf", 16)
    pinta = ImageDraw.Draw(hoja)
    for i, png in enumerate(pngs):
        with Image.open(png) as im:
            im = im.convert("RGB")
            im = im.resize((ANCHO, max(1, round(im.height * ANCHO / im.width))), Image.LANCZOS).crop((0, 0, ANCHO, ALTO))
        x, y = (i % COLUMNAS) * (ANCHO + 8), (i // COLUMNAS) * (ALTO + ETIQUETA + 8)
        pinta.text((x + 2, y + 2), Path(png).name, fill=(240, 220, 120), font=letra)
        hoja.paste(im, (x, y + ETIQUETA))
    salida.parent.mkdir(parents=True, exist_ok=True)
    hoja.save(salida)
    print("hoja:", salida)


main()
