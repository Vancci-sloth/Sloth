"""
Recorta fotos del personaje a public/personaje/<pose>.png: fondo transparente y cortadas al contenido, limpias, sin
borde ni sombra, como los recortes de los reels de referencia.

    python -B recortar.py <pose>=<foto> [<pose>=<foto> ...] [--guardar]

Si la foto ya trae transparencia, se respeta su alfa; si no, se recorta con rembg (`isnet-general-use`;
`birefnet-portrait` pesa 973 MB). La pose `cabeza` corta en la barbilla y desvanece el cuello, para pegarla sobre otro
cuerpo (una armadura, un disfraz).
Con --guardar, además copia cada pose a la biblioteca de la skill (`personaje/`), para los reels que siguen. Fuera de la
carpeta de un reel (la primera vez, antes de que haya biblioteca) solo se puede con --guardar, y van directo a ella.
"""

import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw

from comun import PROYECTO, SKILL
from recorte import alfa  # de video-base: el mismo recorte que usa El Diff


def cabeza(rgba: Image.Image) -> Image.Image:
    """Corta en la barbilla: la fila más angosta del alfa entre el 60 y el 90 % del alto (el cuello)."""
    a = rgba.getchannel("A")
    filas = [(sum(1 for x in range(0, a.width, 4) if a.getpixel((x, y)) > 128), y) for y in range(int(a.height * 0.6), int(a.height * 0.9), 4)]
    corte = min(filas)[1] + int(a.height * 0.065)  # con 3 % el desvanecido se comía la barba
    cab = rgba.crop((0, 0, rgba.width, corte))
    m = Image.new("L", cab.size, 255)
    d = ImageDraw.Draw(m)
    for i in range(70):
        d.line((0, corte - 70 + i, cab.width, corte - 70 + i), fill=int(255 * (1 - i / 70)))
    cab.putalpha(Image.composite(cab.getchannel("A"), Image.new("L", cab.size, 0), m))
    return cab.crop(cab.getchannel("A").getbbox())


def main() -> None:
    pares = [a.split("=", 1) for a in sys.argv[1:] if "=" in a]
    if not pares:
        sys.exit(__doc__)
    biblioteca = SKILL / "personaje"
    # Fuera de un reel (la primera vez, sin biblioteca aún), las poses van directo a la biblioteca.
    en_reel = (PROYECTO / "package.json").exists()
    if not en_reel and "--guardar" not in sys.argv:
        sys.exit("Fuera de la carpeta de un reel, recorta con --guardar: las poses van a la biblioteca.")
    salida = PROYECTO / "public" / "personaje" if en_reel else biblioteca
    salida.mkdir(parents=True, exist_ok=True)
    if "--guardar" in sys.argv:
        biblioteca.mkdir(exist_ok=True)
    for pose, foto in pares:
        rec = alfa(Path(foto))
        if pose == "cabeza":
            rec = cabeza(rec)
        rec.save(salida / f"{pose}.png")
        if "--guardar" in sys.argv and salida != biblioteca:
            shutil.copy(salida / f"{pose}.png", biblioteca / f"{pose}.png")
        print(f"{pose}: {rec.size}")


main()
