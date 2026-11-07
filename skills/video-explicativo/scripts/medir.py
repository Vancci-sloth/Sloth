"""Mide cuánto se mueve y qué tan lleno está el centro de la pantalla de varios videos (final.py lo corre).

    python -X utf8 medir.py <video> [<video>...]

El centro es donde va lo que se explica, sin el texto ni el personaje: en vertical, la franja de 22 % a 70 % del alto
(entre el texto de arriba y el personaje de abajo); en horizontal, de 5 % a 72 % del alto y de 5 % a 66 % del ancho
(arriba del texto y a la izquierda del personaje). El formato lo dice el video.
- quieto: % del tiempo en que el centro no cambia de un cuadro al siguiente.
- movimiento: cambio medio del centro por cuadro (0–255).
- novedades/min: picos de cambio (algo nuevo que entra o se reacomoda) por minuto.
- lleno: % del centro que no es fondo.
- parado: el tramo más largo (s) en que casi nada se mueve (cambio medio < 0.5 en cada segundo).
- parpadeos: cuadros sueltos en que algo aparece y se va (cambia contra los dos vecinos, que son casi iguales entre sí),
  en toda la pantalla.

Marca con ✘ quieto > 25 %, movimiento < 2.5 y parado > 4 s. Berachain (se sintió vivo) dio 14 %, 3.60 y 1.8 s;
SQUID (se sintió quieto), 45 %, 1.76 y 6 s. Y cualquier parpadeo de más del 2 % de la pantalla: en el de estafas (3 de
noviembre) fueron las costillas de la cúpula que la cámara cruzaba al entrar (3.5–11 %); en otros tres videos, lo más
alto que no era parpadeo quedó en 1.2 % (un cambio de tema).
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


def centro(todo, horizontal: bool):
    """El centro de la pantalla, de los cuadros en gris y en chico (180×320 o 320×180 el cuadro entero)."""
    _, h, w = todo.shape
    if horizontal:
        return todo[:, int(h * 0.05):int(h * 0.72), int(w * 0.05):int(w * 0.66)]
    return todo[:, int(h * 0.22):int(h * 0.70)]


def parpadeos(todo) -> list[tuple[float, float]]:
    """Los cuadros que cambian contra sus dos vecinos cuando los vecinos son casi iguales: (segundo, % de la pantalla)."""
    a = np.abs(np.diff(todo, axis=0))  # a[i]: del cuadro i al i+1
    salto = np.array([((np.minimum(a[n - 1], a[n]) > 40) & (np.abs(todo[n + 1] - todo[n - 1]) < 12)).mean() * 100
                      for n in range(1, len(todo) - 1)])
    salto = np.concatenate([[0], salto, [0]])
    return [(n / 30, salto[n]) for n in range(1, len(salto) - 1)
            if salto[n] > 2 and salto[n] > 3 * max(salto[n - 1], salto[n + 1])]


def main() -> None:
    print(f"{'video':42} {'quieto':>7} {'movim.':>7} {'nov/min':>8} {'lleno':>6} {'parado':>7}")
    for v in sys.argv[1:]:
        horizontal = es_horizontal(v)
        todo = cuadros(v, *((320, 180) if horizontal else (180, 320)))
        c = centro(todo, horizontal)
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
        parado = largo = fin = 0
        for i, s in enumerate(seg):
            largo = largo + 1 if s else 0
            if largo > parado:
                parado, fin = largo, i + 1
        desde, parado = (fin - parado) / 30, parado / 30
        print(f"{v[-42:]:42} {quieto:6.0f}% {dif.mean():7.2f} {len(grupos) / minutos:8.0f} {lleno:5.0f}% {parado:6.1f}s")
        if quieto > 25 or dif.mean() < 2.5 or parado > 4:
            print("✘ poco movimiento (quieto ≤ 25 %, movimiento ≥ 2.5, parado ≤ 4 s): la cámara la pone el director (src/director/guion.ts)."
                  + (f" Lo más parado va de {desde:.1f} a {desde + parado:.1f} s." if parado > 4 else ""))
        if malos := parpadeos(todo):
            print("✘ parpadea en " + ", ".join(f"{t:.2f} s ({p:.0f} %)" for t, p in malos) + ": algo sale un solo cuadro. Míralo "
                  "cuadro a cuadro: ffmpeg -ss <s-0.1> -i <video> -frames:v 6 …")


if __name__ == "__main__":
    main()
