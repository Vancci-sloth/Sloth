"""
Recorta fotos: fondo transparente, cortadas al contenido y, si quieres, con el borde blanco fino de tijera de los
collages.

    python -B recorte.py <foto> <salida.png> [--borde] [--lienzo] [--conservar='[{...}]']
    python -B recorte.py <carpeta> <carpeta-salida> [--borde]

Si la foto ya trae transparencia, se respeta su alfa; si no, se recorta con rembg (`isnet-general-use`, ya descargado;
`birefnet-portrait` pesa 973 MB y la descarga se cortó). Desde otro script: `from recorte import alfa, borde`.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

sys.stdout.reconfigure(encoding="utf-8")


def alfa(foto: Path, lienzo: bool = False, conservar: tuple = ()) -> Image.Image:
    with Image.open(foto) as archivo:
        original = ImageOps.exif_transpose(archivo)
    im = original.copy() if lienzo else original
    if max(im.size) > 2600:
        im.thumbnail((2600, 2600), Image.LANCZOS)
    if im.mode == "RGBA" and im.getchannel("A").getextrema()[0] < 10:
        rgba = im
    else:
        from rembg import new_session, remove
        rgba = remove(im.convert("RGB"), session=new_session("isnet-general-use"), post_process_mask=True)
    a = rgba.getchannel("A").point(lambda v: 0 if v < 24 else v)
    if lienzo:
        resultado = original.convert("RGBA")
        resultado.putalpha(a.resize(original.size, Image.LANCZOS))
        if conservar:
            mascara = Image.new("1", original.size)
            dibujo = ImageDraw.Draw(mascara)
            for zona in conservar:
                contorno = zona.get("contorno")
                if contorno:
                    puntos = [(round(p["x"] * original.width / 100), round(p["y"] * original.height / 100))
                              for p in contorno]
                    dibujo.polygon(puntos, fill=1)
                else:
                    x, y, ancho, alto = (zona[k] / 100 for k in ("x", "y", "ancho", "alto"))
                    izquierda, arriba = round(x * original.width), round(y * original.height)
                    derecha, abajo = round((x + ancho) * original.width), round((y + alto) * original.height)
                    if derecha > izquierda and abajo > arriba:
                        dibujo.rectangle((izquierda, arriba, derecha - 1, abajo - 1), fill=1)
            resultado.paste(original.convert("RGBA"), mask=mascara)
        return resultado
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
    conservar = json.loads(next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--conservar=")), "[]"))
    if origen.is_dir():
        destino.mkdir(parents=True, exist_ok=True)
        pares = [(f, destino / (f.stem + ".png")) for f in sorted(origen.iterdir()) if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")]
    else:
        destino.parent.mkdir(parents=True, exist_ok=True)
        pares = [(origen, destino)]
    for f, d in pares:
        rec = alfa(f, "--lienzo" in sys.argv, conservar)
        if "--borde" in sys.argv:
            rec = borde(rec)
        rec.save(d)
        print(f"{d} {rec.size}")


if __name__ == "__main__":
    main()
