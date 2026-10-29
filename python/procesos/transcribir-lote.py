"""
Transcribe muchos vídeos ajenos de una vez: los de TikTok e Instagram de la investigación de Ideas
(`server/ideas/transcribir.ts`). Es `transcribir-ajeno.py` con Whisper cargado una sola vez, que lleva más que
transcribir un vídeo corto, y el idioma reconocido en cada archivo.

Recibe WAV de 16 kHz, mono y 16 bits, la misma opción `modelos` y, si hay, `terminos`: cómo se escriben los nombres del
nicho, para que Whisper no oiga «Cloud» donde dicen «Claude». Contesta con `{ruta: {"idioma", "segmentos"}}`, un
archivo por ruta; sin voz (música, solo texto en pantalla), `segmentos` va vacío. El que no se puede transcribir va con
`{"error"}` y no para a los demás.

Espera su turno en la GPU con el candado de `turno_gpu()` (`video-base/scripts/sloth.py`): Whisper ocupa unos 3 GB de los
6, y si un vídeo se está transcribiendo a la vez no caben los dos. Mientras espera, lo dice en la salida de errores. Por
lo mismo, con el turno cierra la voz viva (`video-base/scripts/voz_viva.py`), que tiene otro Whisper cargado.
"""

import json
import os
import socket
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

if sys.platform == "win32":
    import msvcrt
else:
    import fcntl

import parakeet
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


def close_live_voice() -> None:
    """Cierra la voz viva, si está (`_soltar_voz()` de sloth.py), y espera a que suelte la tarjeta."""
    try:
        port = json.loads((Path(tempfile.gettempdir()) / "sloth-voz.json").read_text(encoding="utf8"))["puerto"]
        with socket.create_connection(("127.0.0.1", port), timeout=10) as c, c.makefile("rwb") as f:
            c.settimeout(60)
            f.write(b'{"salir": true}\n')
            f.flush()
            f.readline()
    except (OSError, ValueError, KeyError):
        pass


def transcribe(files: list[str], options: dict) -> dict:
    if parakeet.engine(Path(options["modelos"])).startswith("parakeet"):
        return with_parakeet(files, options)

    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    answer = {}
    with gpu_turn():
        close_live_voice()
        whisper =load_foreign_whisper(Path(options["modelos"]), device, options.get("terminos"))
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


def with_parakeet(files: list[str], options: dict) -> dict:
    """Sin NVIDIA: Parakeet, cargado una vez para todos (`transcribir-ajeno.py` dice cómo sale el idioma)."""
    answer = {}
    with gpu_turn():
        model = parakeet.load(Path(options["modelos"]))
        for i, file in enumerate(files):
            try:
                segments = parakeet.segments(parakeet.chunks(model, read_voice(file), lambda f, i=i: progress((i + f) / len(files)), terms=options.get("terminos")))
                answer[file] = {"idioma": parakeet.language(" ".join(s["text"] for s in segments)), "segmentos": segments}
            except Exception as error:
                answer[file] = {"error": f"{type(error).__name__}: {error}"}
            progress((i + 1) / len(files))
    return answer


if __name__ == "__main__":
    run(transcribe)
