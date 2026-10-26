"""
La guardia de las capturas: sale 0 si el OCR de la imagen (sus primeros 9000 px: el OCR de Windows no pasa de 10000)
trae la frase y ningún renglón que sea solo «Loading…» o «Cargando…», con sus puntos (la página a medio cargar:
openai.com en la ronda 18; sin puntos puede ser texto partido, como «model loading» en un issue angosto). Usa una
copia congelada de ubicar.py, para que cambiar la herramienta no cambie el juez.

    python guardia.py <png> "<frase>"
"""
import re
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from ubicar import buscar, ocr  # noqa: E402

png, frase = Path(sys.argv[1]).resolve(), sys.argv[2]
im = Image.open(png)
if im.height > 9000:
    png = AQUI / f"arriba-{png.name}"
    im.crop((0, 0, im.width, 9000)).save(png)
buscar(str(png), frase)
for l in ocr(str(png))["lineas"]:
    renglon = " ".join(w["t"] for w in l["palabras"])
    if re.fullmatch(r"(?i)\W*(loading|cargando)\s*(\.{2,}|…)\W*", renglon):
        sys.exit(f'la página está a medio cargar: un renglón dice "{renglon}"')
