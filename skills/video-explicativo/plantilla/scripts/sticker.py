"""
Vuelve una imagen un recorte de collage: borde blanco grueso y cortado a mano (un poco irregular, como con tijera).

    python -B scripts/sticker.py <entrada> <salida.png> [--caja] [--borde 0.035] [--lado 900]

- Sin `--caja`: el borde sigue la silueta. Si la imagen no trae transparencia, la recorta primero con rembg
  (`alfa()` de video-base/recorte.py, con el Python del sistema, que es el que tiene rembg).
- Con `--caja`: la imagen va sobre un pedazo de papel rectangular de bordes chuecos. Para logos de solo letras
  (Nasdaq, Balancer) y capturas, que con borde de silueta pierden los huecos entre letras.
- `--borde`: grosor del borde en fracción del lado mayor. `--lado`: tamaño máximo de la salida.

La sombra no va aquí: la pone el video (CSS), así cambia con el tema.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path.home() / ".claude" / "skills" / "video-base" / "scripts"))
from recorte import alfa  # noqa: E402

BLANCO = (255, 255, 255)


def ruido(tam: tuple[int, int], escala: float, semilla: int) -> np.ndarray:
    """Ruido suave entre -1 y 1: lo que hace que el corte no sea perfecto."""
    rng = np.random.default_rng(semilla)
    chico = (max(2, int(tam[0] / escala)), max(2, int(tam[1] / escala)))
    base = Image.fromarray((rng.random((chico[1], chico[0])) * 255).astype(np.uint8))
    return np.asarray(base.resize(tam, Image.BICUBIC)).astype(np.float32) / 127.5 - 1


def contorno(rgba: Image.Image, borde: float, semilla: int) -> Image.Image:
    r = max(8, int(max(rgba.size) * borde))
    pad = r * 2
    lienzo = Image.new("RGBA", (rgba.width + 2 * pad, rgba.height + 2 * pad), (0, 0, 0, 0))
    lienzo.alpha_composite(rgba, (pad, pad))
    a = lienzo.getchannel("A").point(lambda v: 255 if v > 100 else 0)
    # Dilatar a trozos (un MaxFilter enorme es lento) y suavizar: el umbral con ruido da el corte de tijera.
    grande = a
    for _ in range(max(1, r // 6)):
        grande = grande.filter(ImageFilter.MaxFilter(13))
    suave = np.asarray(grande.filter(ImageFilter.GaussianBlur(r * 0.45))).astype(np.float32)
    umbral = 128 + ruido(lienzo.size, r * 3.2, semilla) * 45
    papel = np.where(suave > umbral, 255, 0).astype(np.uint8)
    papel = Image.fromarray(papel).filter(ImageFilter.GaussianBlur(0.8))
    fondo = Image.new("RGBA", lienzo.size, BLANCO + (0,))
    fondo.putalpha(papel)
    fondo.alpha_composite(lienzo)
    return fondo.crop(fondo.getchannel("A").getbbox())


def caja(rgba: Image.Image, borde: float, semilla: int) -> Image.Image:
    m = max(14, int(max(rgba.size) * borde * 1.4))
    w, h = rgba.width + 2 * m, rgba.height + 2 * m
    holgura = m
    lienzo = Image.new("RGBA", (w + 2 * holgura, h + 2 * holgura), (0, 0, 0, 0))
    # Un rectángulo con las esquinas movidas unos px y los lados ondulados: papel cortado a mano.
    rng = np.random.default_rng(semilla)
    yy, xx = np.mgrid[0 : lienzo.height, 0 : lienzo.width].astype(np.float32)
    onda = ruido(lienzo.size, m * 1.8, semilla + 1) * m * 0.22
    x0, y0 = holgura + rng.uniform(-3, 3), holgura + rng.uniform(-3, 3)
    x1, y1 = holgura + w + rng.uniform(-3, 3), holgura + h + rng.uniform(-3, 3)
    dentro = (xx > x0 + onda) & (xx < x1 - onda) & (yy > y0 + onda) & (yy < y1 - onda)
    papel = Image.fromarray((dentro * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    fondo = Image.new("RGBA", lienzo.size, BLANCO + (0,))
    fondo.putalpha(papel)
    fondo.alpha_composite(rgba, (holgura + m, holgura + m))
    return fondo.crop(fondo.getchannel("A").getbbox())


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        sys.exit(__doc__)
    opciones = sys.argv[1:]
    borde = float(opciones[opciones.index("--borde") + 1]) if "--borde" in opciones else 0.035
    lado = int(opciones[opciones.index("--lado") + 1]) if "--lado" in opciones else 900
    args = [a for a in args if a not in (str(borde), str(lado))]
    entrada, salida = Path(args[0]), Path(args[1])
    im = Image.open(entrada)
    rgba = im.convert("RGBA") if "--caja" in opciones else alfa(entrada)
    rgba.thumbnail((lado, lado), Image.LANCZOS)
    semilla = sum(map(ord, entrada.stem))
    hecho = caja(rgba, borde, semilla) if "--caja" in opciones else contorno(rgba, borde, semilla)
    salida.parent.mkdir(parents=True, exist_ok=True)
    hecho.save(salida, optimize=True)
    print(salida, hecho.size)


if __name__ == "__main__":
    main()
