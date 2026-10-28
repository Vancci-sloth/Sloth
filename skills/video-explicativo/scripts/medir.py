"""Mide cuánto se mueve y qué tan lleno está el centro de la pantalla de varios videos (final.py lo corre).

    python -X utf8 medir.py [--borrador] <video> [<video>...]

El centro es donde va lo que se explica, sin el texto ni el personaje: en vertical, la franja de 22 % a 70 % del alto
(entre el texto de arriba y el personaje de abajo); en horizontal, de 5 % a 72 % del alto y de 5 % a 66 % del ancho
(arriba del texto y a la izquierda del personaje). El formato lo dice el video.
- quieto: % del tiempo en que el centro no cambia de un cuadro al siguiente.
- movimiento: cambio medio del centro por cuadro (0–255).
- novedades/min: picos de cambio (algo nuevo que entra o se reacomoda) por minuto.
- lleno: % del centro que no es fondo.
- parado: el tramo más largo (s) en que casi nada se mueve (cambio medio < 0.5 en cada segundo).

Marca con ✘ quieto > 25 %, movimiento < 2.5 y parado > 4 s. Berachain (se sintió vivo) dio 14 %, 3.60 y 1.8 s;
SQUID (se sintió quieto), 45 %, 1.76 y 6 s. Con --borrador (el de final.py, a media resolución) quieto marca desde
30 %: a media resolución los cambios chicos no se ven y sale unos 5 puntos más alto (Celsius: 26 % contra 21 %; el
movimiento y el parado salen iguales).
"""

import subprocess
import sys

import numpy as np

def es_horizontal(video: str) -> bool:
    cmd = ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", video]
    ancho, alto = map(int, subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip().split(",")[:2])
    return ancho > alto


def cuadros(video: str, w: int, h: int):
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-i", video, "-vf", f"fps=30,scale={w}:{h},format=gray", "-f", "rawvideo", "-"]
    datos = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(datos, dtype=np.uint8).reshape(-1, h, w).astype(np.int16)


def centro(video: str):
    """Los cuadros del centro de la pantalla, en gris y en chico (180×320 o 320×180 el cuadro entero)."""
    if es_horizontal(video):
        w, h = 320, 180
        return cuadros(video, w, h)[:, int(h * 0.05):int(h * 0.72), int(w * 0.05):int(w * 0.66)]
    w, h = 180, 320
    return cuadros(video, w, h)[:, int(h * 0.22):int(h * 0.70)]


def main() -> None:
    print(f"{'video':42} {'quieto':>7} {'movim.':>7} {'nov/min':>8} {'lleno':>6} {'parado':>7}")
    videos = [v for v in sys.argv[1:] if v != "--borrador"]
    tope = 30 if "--borrador" in sys.argv[1:] else 25
    for v in videos:
        c = centro(v)
        dif = np.abs(np.diff(c, axis=0)).mean(axis=(1, 2))
        quieto = (dif < 0.25).mean() * 100
        # Picos: un cuadro que cambia mucho más que su entorno.
        umbral = max(1.5, np.percentile(dif, 90))
        picos = [i for i in range(1, len(dif) - 1) if dif[i] > umbral and dif[i] >= dif[i - 1] and dif[i] >= dif[i + 1]]
        # Agrupar picos a menos de 6 cuadros.
        grupos = [p for k, p in enumerate(picos) if k == 0 or p - picos[k - 1] > 6]
        minutos = len(c) / 30 / 60
        fondo = np.median(c[:, :, :4], axis=(1, 2))[:, None, None]  # cada cuadro con su fondo (oscuro o claro)
        lleno = (np.abs(c - fondo) > 18).mean() * 100
        # Parado: el tramo más largo en que la media de cada segundo (30 cuadros) no llega a 0.5.
        seg = np.convolve(dif, np.ones(30) / 30, mode="same") < 0.5
        parado = largo = 0
        for s in seg:
            largo = largo + 1 if s else 0
            parado = max(parado, largo)
        parado /= 30
        print(f"{v[-42:]:42} {quieto:6.0f}% {dif.mean():7.2f} {len(grupos) / minutos:8.0f} {lleno:5.0f}% {parado:6.1f}s")
        if quieto > tope or dif.mean() < 2.5 or parado > 4:
            print("✘ poco movimiento: ver \"Que se mueva\" en MUNDO.md. Arréglalo con margen, un 10 % mejor que el mínimo "
                  "(quieto 3 puntos menos, movimiento 2.8, parado 3.5 s): justo en el límite vuelve a fallar y cuesta otro borrador.")


if __name__ == "__main__":
    main()
