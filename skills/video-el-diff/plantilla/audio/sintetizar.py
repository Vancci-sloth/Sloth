"""
Sintetiza la música de fondo (lo-fi a 84 BPM), sin muestras de nadie: todo sale de senos, ruido y filtros. Escribe
public/audio/musica.wav (44.1 kHz, estéreo, 16 bits), tan larga como la voz.
"""

import json
import sys
import wave
from pathlib import Path

SR = 44100
RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "audio"
DURACION = json.loads((RAIZ / "src" / "timeline.json").read_text(encoding="utf8"))["duracion"] + 1.0
MUESTRAS = int(DURACION * SR) + SR  # las de `musica()`

# La música solo depende de lo que dura la voz: si ya está y dura lo mismo, no se rehace. Se mira antes de cargar numpy
# y scipy, que solos tardan unos 10 s.
if __name__ == "__main__" and (SALIDA / "musica.wav").exists():
    with wave.open(str(SALIDA / "musica.wav")) as w:
        if w.getnframes() == MUESTRAS:
            print("listo (la música ya dura lo que la voz)")
            sys.exit()

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

rng = np.random.default_rng(7)


def t_(dur):
    return np.arange(int(dur * SR)) / SR


def filtro(x, tipo, f, orden=2):
    sos = butter(orden, f, btype=tipo, fs=SR, output="sos")
    return sosfilt(sos, x)


def nota(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def guardar(nombre, x, pico=0.89):
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    x = x / (np.max(np.abs(x)) + 1e-9) * pico
    wavfile.write(SALIDA / f"{nombre}.wav", SR, (x * 32767).astype(np.int16))


# ---------- instrumentos ----------

def rhodes(f, dur, vel=1.0):
    t = t_(dur)
    env = np.exp(-t * 1.6) * (1 - np.exp(-t * 300))
    tono = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 5)
            + 0.12 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t * 9))
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.2 * t)
    return tono * env * trem * vel


def bajo(f, dur):
    t = t_(dur)
    env = np.minimum(1, t * 80) * np.exp(-t * 2.2)
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)
    return np.tanh(1.6 * x) * env


def bombo():
    t = t_(0.5)
    f = 45 + 85 * np.exp(-t * 28)
    fase = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(fase) * np.exp(-t * 7) + 0.3 * filtro(rng.standard_normal(len(t)), "low", 900) * np.exp(-t * 60)


def caja():
    t = t_(0.35)
    ruido = filtro(rng.standard_normal(len(t)), "band", [900, 5000]) * np.exp(-t * 16)
    tono = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 25)
    return 0.8 * ruido + 0.6 * tono


def platillo(abierto=False):
    t = t_(0.3 if abierto else 0.06)
    return filtro(rng.standard_normal(len(t)), "high", 7000) * np.exp(-t * (12 if abierto else 70))


def poner(pista, x, inicio, gan=1.0):
    i = int(inicio * SR)
    if i >= len(pista):
        return
    n = min(len(x), len(pista) - i)
    pista[i : i + n] += x[:n] * gan


# ---------- música ----------

def musica(duracion):
    bpm = 84
    pulso = 60 / bpm
    compas = 4 * pulso
    n = int(duracion * SR) + SR
    acordes = [  # Dbmaj9, Cm7, Fm9, Ebsus/Bb
        [61, 65, 68, 72, 75],
        [60, 63, 67, 70, 74],
        [65, 68, 72, 75, 79],
        [63, 67, 70, 72, 77],
    ]
    raices = [37, 36, 41, 39]
    teclas = np.zeros(n)
    graves = np.zeros(n)
    bateria = np.zeros(n)
    k = bombo()
    s = caja()
    compases = int(duracion / compas) + 2
    for c in range(compases):
        t0 = c * compas
        ac = acordes[c % 4]
        # acorde arpegiado apenas (lo-fi), con una repetición a la mitad
        for j, m in enumerate(ac):
            poner(teclas, rhodes(nota(m), compas * 0.95, 0.5), t0 + j * 0.012)
            poner(teclas, rhodes(nota(m), compas * 0.45, 0.22), t0 + 2.5 * pulso + j * 0.01)
        r = nota(raices[c % 4])
        poner(graves, bajo(r, pulso * 1.4), t0)
        poner(graves, bajo(r, pulso * 0.9), t0 + 1.75 * pulso)
        poner(graves, bajo(r * (1.5 if c % 2 else 1), pulso * 0.8), t0 + 3.0 * pulso)
        # batería con swing
        poner(bateria, k, t0, 1.0)
        poner(bateria, k, t0 + 1.75 * pulso, 0.7)
        poner(bateria, k, t0 + 2.5 * pulso, 0.85)
        poner(bateria, s, t0 + pulso, 0.7)
        poner(bateria, s, t0 + 3 * pulso, 0.7)
        for h in range(8):
            sw = 0.04 if h % 2 else 0.0
            poner(bateria, platillo(h == 7 and c % 4 == 3), t0 + h * pulso / 2 + sw, 0.22 if h % 2 else 0.3)
    teclas = filtro(teclas, "low", 2600)
    bateria = filtro(bateria, "low", 7500)
    # bombeo: la música se aparta un poco en cada bombo
    tiempo = np.arange(n) / SR
    fase = (tiempo % pulso) / pulso
    bombeo = 0.72 + 0.28 * np.minimum(1, fase * 4)
    crujido = np.zeros(n)
    for _ in range(int(duracion * 14)):
        i = rng.integers(0, n - 40)
        crujido[i : i + 40] += rng.standard_normal(40) * np.exp(-np.arange(40) / 6) * rng.uniform(0.2, 1)
    soplido = filtro(rng.standard_normal(n), "band", [400, 3000]) * 0.015
    mezcla = 0.55 * teclas * bombeo + 0.7 * graves * bombeo + 0.62 * bateria + 0.08 * crujido + soplido
    # entrada y salida suaves
    mezcla *= np.minimum(1, tiempo / 1.5) * np.minimum(1, np.maximum(0, (duracion + 0.8 - tiempo) / 2.5))
    izq = mezcla + 0.04 * np.roll(teclas, 300)
    der = mezcla + 0.04 * np.roll(teclas, -300)
    return np.tanh(np.stack([izq, der], axis=1) * 1.2)


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    guardar("musica", musica(DURACION), pico=0.8)
    print("listo")


if __name__ == "__main__":
    main()
