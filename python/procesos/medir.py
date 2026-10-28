"""
Mide cuánto tarda la voz en esta computadora sin esperar a una de verdad, para Opciones → Tu equipo (`server/equipo.ts`)
y para decir cuánto falta desde la primera vez (`medidas.py`). Pasa 30 s de ruido rosa por lo mismo que una voz: Parakeet
y el alineador. El que más trabaja con el ruido y con la voz es el codificador, que tarda lo mismo con los dos; el
ruido se queda corto en lo que escribe, y por eso se le suma `MARGEN`. Las transcripciones de verdad lo corrigen después.

Con Whisper (una NVIDIA) no mide: con ruido no transcribe nada (lo calla su detector de voz) y se quedaría corto.

Recibe solo `modelos` y contesta `{"motor", "veces", "carga"}`, o `{"motor"}` si no midió.
"""

import time
from pathlib import Path

import numpy as np

import medidas
import parakeet
from interfaz import progress, run

SECONDS = 30
MARGEN = 1.15


def pink_noise(seconds: float) -> np.ndarray:
    """Ruido rosa (cae 3 dB por octava, como la voz), a -20 dBFS."""
    n = int(seconds * parakeet.SAMPLE_RATE)
    spectrum = np.fft.rfft(np.random.default_rng(7).standard_normal(n))
    spectrum /= np.sqrt(np.maximum(np.arange(len(spectrum)), 1))
    noise = np.fft.irfft(spectrum, n)
    return (noise / np.abs(noise).max() * 0.1).astype(np.float32)


def measure(files: list[str], options: dict) -> dict:
    folder = Path(options["modelos"])
    engine = parakeet.engine(folder)
    if not engine.startswith("parakeet"):
        return {"motor": engine}
    voice = pink_noise(SECONDS)
    started = time.perf_counter()
    model = parakeet.load(folder)
    load = time.perf_counter() - started
    started = time.perf_counter()
    parakeet.chunks(model, voice, lambda f: progress(f / 2))
    work = time.perf_counter() - started
    del model
    if engine == "parakeet":
        from alineador import Aligner

        started = time.perf_counter()
        aligner = Aligner(folder, "voxpopuli-es")
        load += time.perf_counter() - started
        started = time.perf_counter()
        aligner.emissions(voice)
        work += time.perf_counter() - started
    medidas.note_voice(folder, engine, work * MARGEN, SECONDS, load, fresh=True)
    progress(1)
    return {"motor": engine, **{k: v for k, v in medidas.read(folder)["voz"].items() if k in ("veces", "carga")}}


if __name__ == "__main__":
    run(measure)
