"""
Transcribe muchos vídeos ajenos de una vez: los de TikTok e Instagram de la investigación de Ideas
(`server/ideas/transcribir.ts`). Es `transcribir-ajeno.py` con Whisper cargado una sola vez, que lleva más que
transcribir un vídeo corto, y el idioma reconocido en cada archivo.

Recibe WAV de 16 kHz, mono y 16 bits, la misma opción `modelos` y, si hay, `terminos`: cómo se escriben los nombres del
nicho, para que Whisper no oiga «Cloud» donde dicen «Claude». Contesta con `{ruta: {"idioma", "segmentos"}}`, un
archivo por ruta; sin voz (música, solo texto en pantalla), `segmentos` va vacío. El que no se puede transcribir va con
`{"error"}` y no para a los demás.

Espera su turno en la GPU con el candado de `turno_gpu()` (`video-base/scripts/sloth.py`): Whisper ocupa unos 3 GB de los
6, y si un vídeo se está transcribiendo a la vez no caben los dos. Mientras espera, lo dice en la salida de errores.
"""

import os
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

if sys.platform == "win32":
    import msvcrt
else:
    import fcntl

from interfaz import progress, run
from transcribir import free, load_foreign_whisper, read_voice, said

# Los trozos de voz de un mismo archivo que pasan juntos por Whisper: un Reel de un minuto son dos o tres.
BATCH = 8


@contextmanager
def gpu_turn():
    """El mismo candado que `turno()` de sloth.py (`%TEMP%/sloth-gpu.lock`): si el proceso muere, se suelta solo."""
    with open(Path(tempfile.gettempdir()) / "sloth-gpu.lock", "a+b") as lock:
        waiting = False
        while True:
            try:
                lock.seek(0)
                if sys.platform == "win32":
                    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if not waiting:
                    print("Esperando: otro vídeo está transcribiendo.", file=sys.stderr, flush=True)
                    waiting = True
                time.sleep(3)
        try:
            yield
        finally:
            lock.seek(0)
            if sys.platform == "win32":
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def transcribe(files: list[str], options: dict) -> dict:
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    answer = {}
    with gpu_turn():
        whisper = load_foreign_whisper(Path(options["modelos"]), device, options.get("terminos"))
        for i, file in enumerate(files):
            try:
                transcript = whisper.transcribe(
                    read_voice(file),
                    batch_size=BATCH,
                    progress_callback=lambda percent, i=i: progress((i + percent / 100) / len(files)),
                )
                answer[file] = said(transcript)
            except Exception as error:
                answer[file] = {"error": f"{type(error).__name__}: {error}"}
            progress((i + 1) / len(files))
        del whisper
        free(device)
    return answer


if __name__ == "__main__":
    run(transcribe)
