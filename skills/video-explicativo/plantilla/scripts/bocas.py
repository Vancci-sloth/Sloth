"""
Pega solo la boca abierta sobre la foto de cada pose, para que el perro hable sin que nada más se mueva.

    python -B scripts/bocas.py [pose …]

Codex rehace la foto entera al abrirle la boca (perro/bocas/boca_<pose>.png): el pelo, la sudadera y hasta el encuadre
cambian un poco, y alternar las dos fotos haría temblar al perro. Aquí se alinea la foto nueva con la original
(correlación de fase), se busca la mancha donde más cambió (la boca), y solo esa mancha, con el borde difuminado, se
pega sobre la original. Deja perro/bocas/abierta_<pose>.png, del mismo tamaño que la original; perro.py la recorta con
la misma silueta que la cerrada.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

RAIZ = Path(__file__).resolve().parent.parent
BOCAS = RAIZ / "perro" / "bocas"


def original(pose: str) -> Path:
    return RAIZ / "perro" / ("perro.png" if pose == "normal" else f"pose_{pose}.png")


def desplazamiento(a: np.ndarray, b: np.ndarray) -> tuple[int, int]:
    """Cuánto hay que mover b para que caiga sobre a (correlación de fase sobre gris)."""
    fa, fb = np.fft.fft2(a), np.fft.fft2(b)
    r = fa * np.conj(fb)
    r /= np.abs(r) + 1e-9
    pico = np.unravel_index(np.argmax(np.abs(np.fft.ifft2(r))), a.shape)
    dy, dx = (int(p) if p < s // 2 else int(p) - s for p, s in zip(pico, a.shape))
    return dy, dx


def pegar(pose: str) -> Path:
    cerrada = Image.open(original(pose)).convert("RGB")
    abierta = Image.open(BOCAS / f"boca_{pose}.png").convert("RGB").resize(cerrada.size, Image.LANCZOS)
    a = np.asarray(cerrada).astype(np.float32)
    b = np.asarray(abierta).astype(np.float32)
    dy, dx = desplazamiento(a.mean(axis=2), b.mean(axis=2))
    if abs(dy) > 40 or abs(dx) > 40:
        dy = dx = 0  # una correlación disparatada: mejor no mover
    b = np.roll(b, (dy, dx), axis=(0, 1))

    # Dónde cambió de verdad: la diferencia suavizada, sin el ruido fino del pelo.
    dif = np.abs(ndimage.gaussian_filter(a, (6, 6, 0)) - ndimage.gaussian_filter(b, (6, 6, 0))).mean(axis=2)
    lado = cerrada.width
    marca = dif > 28
    etiquetas, n = ndimage.label(marca)
    if not n:
        raise SystemExit(f"{pose}: la boca nueva no cambió nada")
    # La mancha con más cambio acumulado, que no toque el borde de la foto.
    pesos = ndimage.sum(dif, etiquetas, range(1, n + 1))
    mancha = etiquetas == (int(np.argmax(pesos)) + 1)
    ys, xs = np.nonzero(mancha)
    margen = int(lado * 0.035)
    y0, y1 = max(0, ys.min() - margen), min(lado, ys.max() + margen)
    x0, x1 = max(0, xs.min() - margen), min(lado, xs.max() + margen)
    caja = np.zeros_like(marca)
    caja[y0:y1, x0:x1] = True
    # La máscara: lo que cambió dentro de la caja, dilatado y difuminado para que no se note la costura.
    m = ndimage.binary_dilation(marca & caja, iterations=int(lado * 0.02)) & caja
    m = ndimage.gaussian_filter(m.astype(np.float32), lado * 0.008)[..., None]
    hecha = a * (1 - m) + b * m
    salida = BOCAS / f"abierta_{pose}.png"
    Image.fromarray(np.clip(hecha, 0, 255).astype(np.uint8)).save(salida, optimize=True)
    print(f"{pose}: movida {dx},{dy} px; boca en x {x0}–{x1}, y {y0}–{y1}")
    return salida


def main() -> None:
    poses = sys.argv[1:] or [p.stem.removeprefix("boca_") for p in sorted(BOCAS.glob("boca_*.png"))]
    for pose in poses:
        pegar(pose)


if __name__ == "__main__":
    main()
