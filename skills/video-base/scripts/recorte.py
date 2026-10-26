"""
Recorta fotos: fondo transparente, cortadas al contenido y, si quieres, con el borde blanco fino de tijera de los
collages.

    python -B recorte.py <foto> <salida.png> [--borde]
    python -B recorte.py <carpeta> <carpeta-salida> [--borde]

Si la foto ya trae transparencia, se respeta su alfa; si no, se recorta con rembg (`isnet-general-use`, ya descargado;
`birefnet-portrait` pesa 973 MB y la descarga se cortó). Desde otro script: `from recorte import alfa, borde`.
"""

import sys
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

sys.stdout.reconfigure(encoding="utf-8")


def alfa(foto: Path) -> Image.Image:
    im = ImageOps.exif_transpose(Image.open(foto))
    if max(im.size) > 2600:
        im.thumbnail((2600, 2600), Image.LANCZOS)
    if im.mode == "RGBA" and im.getchannel("A").getextrema()[0] < 10:
        rgba = im
    else:
        from rembg import new_session, remove
        rgba = remove(im.convert("RGB"), session=new_session("isnet-general-use"), post_process_mask=True)
    a = rgba.getchannel("A").point(lambda v: 0 if v < 24 else v)
    rgba.putalpha(a)
    return rgba.crop(a.getbbox())


def borde(rgba: Image.Image) -> Image.Image:
    """El borde blanco de tijera: unos 3 px por cada 780 de ancho, un poco suavizado."""
    g = max(3, rgba.width // 260)
    lienzo = Image.new("RGBA", (rgba.width + 4 * g, rgba.height + 4 * g), (0, 0, 0, 0))
    a = Image.new("L", lienzo.size, 0)
    a.paste(rgba.getchannel("A"), (2 * g, 2 * g))
    contorno = a.point(lambda v: 255 if v > 90 else 0).filter(ImageFilter.MaxFilter(2 * g + 1)).filter(ImageFilter.GaussianBlur(0.8))
    lienzo.paste(Image.new("RGBA", lienzo.size, (255, 255, 255, 235)), (0, 0), contorno)
    lienzo.alpha_composite(rgba, (2 * g, 2 * g))
    return lienzo


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        sys.exit(__doc__)
    origen, destino = Path(args[0]), Path(args[1])
    if origen.is_dir():
        destino.mkdir(parents=True, exist_ok=True)
        pares = [(f, destino / (f.stem + ".png")) for f in sorted(origen.iterdir()) if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")]
    else:
        destino.parent.mkdir(parents=True, exist_ok=True)
        pares = [(origen, destino)]
    for f, d in pares:
        rec = alfa(f)
        if "--borde" in sys.argv:
            rec = borde(rec)
        rec.save(d)
        print(f"{d} {rec.size}")


if __name__ == "__main__":
    main()
