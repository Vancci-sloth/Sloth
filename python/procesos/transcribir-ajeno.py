"""
Transcribe la voz de un vídeo ajeno con WhisperX large-v3-turbo, en el idioma que hable, para sacar de él un Tema.

A diferencia de `transcribir.py`, no fija el español (Whisper lo reconoce en los primeros 30 s), no lleva el texto
inicial con muletillas ni alinea: de un vídeo ajeno solo hacen falta sus ideas, no el tiempo de cada palabra. Por eso
basta con el modelo de Whisper. Para muchos vídeos de una vez, `transcribir-lote.py`, que lo carga una sola vez.

Recibe un WAV de 16 kHz, mono y 16 bits (`wav16k()` de quien lo lanza lo saca del vídeo con FFmpeg). Opciones:
`modelos` (la carpeta de los modelos, `%APPDATA%/youtube/modelos`, con Whisper ya puesto: aquí no se baja nada).

Contesta con `{"idioma": "en", "segmentos": [{"start", "end", "text"}, ...]}`, con los tiempos en segundos desde el
principio del archivo.

Sin NVIDIA va con Parakeet (`parakeet.py`), que entiende 25 idiomas de Europa y no dice cuál oyó: el idioma sale de las
palabras más comunes del texto (`parakeet.language`).
"""

from pathlib import Path

import parakeet
from interfaz import progress, run
from transcribir import free, load_foreign_whisper, read_voice, said


def with_parakeet(model, voice) -> dict:
    """Lo dicho, como `said()`: en frases, con su idioma."""
    segments = parakeet.segments(parakeet.chunks(model, voice, progress))
    return {"idioma": parakeet.language(" ".join(s["text"] for s in segments)), "segmentos": segments}


def transcribe(files: list[str], options: dict) -> dict:
    folder = Path(options["modelos"])
    voice = read_voice(files[0])
    if parakeet.engine(folder).startswith("parakeet"):
        return with_parakeet(parakeet.load(folder), voice)

    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    whisper = load_foreign_whisper(folder, device)
    transcript = whisper.transcribe(voice, progress_callback=lambda percent: progress(percent / 100))
    del whisper
    free(device)
    progress(1)
    return said(transcript)


if __name__ == "__main__":
    run(transcribe)
