"""
Transcribe una voz en español y da el tiempo de cada palabra con un alineador. Con una NVIDIA, con WhisperX
large-v3-turbo; sin ella, con Parakeet (`parakeet.py`, que dice cuál elige y por qué), unas cinco veces más rápido en el
procesador, y el mismo alineador encima si hay torch (si no, los tiempos de Parakeet).

Recibe un WAV de 16 kHz, mono y 16 bits (`wav16k()` de quien lo lanza lo saca de la voz con FFmpeg). Opciones:
`modelos` (la carpeta de los modelos, `%APPDATA%/youtube/modelos`, con los modelos ya puestos: aquí no se baja nada),
`alineador` (ver `modelos_transcripcion.py`), `terminos` (palabras que la voz dice y Whisper podría escribir mal,
como nombres propios: van como pistas) y `cifras_en_letra` (apagada si no llega: Whisper escribe "noventa y nueve
punto dos" y no "99.2", que el alineador no sabe situar y que corre hasta 2 s a sus vecinas).

Whisper empieza con un texto inicial lleno de muletillas (`INITIAL_PROMPT`). No hace que las escriba, pero lo vuelve
más literal: deja las autocorrecciones y las repeticiones que sin él se come, y así se compara con el Guion lo que de
verdad se dijo.

Contesta con `{"words": [{"text", "start", "end"}, ...]}`, con los tiempos en segundos desde el principio del
archivo. Con varios archivos (los trozos de una voz que Whisper transcribió mal entera), carga los modelos una sola vez
y añade `"trozos"`: las palabras de cada archivo, en orden; `words` sigue siendo las del primero. Toda palabra lleva inicio y fin: la que el alineador no sabe situar (p. ej. una cifra) ocupa el hueco
entre sus vecinas.
"""

import gc
import os
import time
import wave
from pathlib import Path

import numpy as np

import medidas
import modelos_transcripcion as models
import parakeet
from interfaz import progress, run

SAMPLE_RATE = 16000
LANGUAGE = "es"
# La transcripción se lleva casi todo el tiempo; alinear, el resto.
TRANSCRIBING = 0.8
INITIAL_PROMPT = "Eh, bueno, este... o sea, mmm, pues eso, eh."


def read_voice(file: str) -> np.ndarray:
    with wave.open(file, "rb") as voice:
        if (voice.getframerate(), voice.getnchannels(), voice.getsampwidth()) != (SAMPLE_RATE, 1, 2):
            raise ValueError("La voz tiene que llegar en WAV de 16 kHz, mono y 16 bits.")
        samples = np.frombuffer(voice.readframes(voice.getnframes()), dtype=np.int16)
    return samples.astype(np.float32) / 32768.0


def threads(device: str) -> int:
    """
    En el procesador, un hilo por núcleo físico (la mitad de los lógicos): en uno de 6 núcleos, 30 s de voz pasan de 15 s
    con los 4 de WhisperX a 11. Con NVIDIA no cuenta.
    """
    return max(4, (os.cpu_count() or 8) // 2) if device == "cpu" else 4


def free(device: str) -> None:
    """Suelta la memoria del modelo anterior antes de cargar el siguiente: en una GPU de 6 GB no caben los dos."""
    gc.collect()
    if device == "cuda":
        import torch

        torch.cuda.empty_cache()


def timed_words(segments: list[dict]) -> list[dict]:
    """Las palabras de todos los segmentos, cada una con inicio y fin."""
    words = []

    def add(word: dict, start: float, end: float) -> None:
        words.append({"text": word["word"].strip(), "start": round(float(start), 3), "end": round(float(max(start, end)), 3)})

    for segment in segments:
        found = [w for w in segment.get("words", []) if w.get("word", "").strip()]
        previous_end = segment["start"]
        i = 0
        while i < len(found):
            if found[i].get("start") is not None:
                end = found[i].get("end", found[i]["start"])
                add(found[i], found[i]["start"], end)
                previous_end = end
                i += 1
                continue
            # Las que van seguidas sin tiempo se reparten el hueco entre la anterior y la siguiente que lo tiene.
            after = i
            while after < len(found) and found[after].get("start") is None:
                after += 1
            gap_end = found[after]["start"] if after < len(found) else segment["end"]
            step = max(0.0, gap_end - previous_end) / (after - i)
            for k, word in enumerate(found[i:after]):
                add(word, previous_end + k * step, previous_end + (k + 1) * step)
            previous_end = gap_end
            i = after
    return words


# Whisper, su detector de voz y los alineadores ya cargados, cuando los procesos los corre la voz viva
# (`video-base/scripts/voz_viva.py`), que atiende todas las voces con un solo Python. Importar torch y WhisperX y cargarlos
# tardaba de 36 s a 10 min según lo ocupada que estuviera la máquina (los 4 GB de torch/lib vuelven a leerse cada vez);
# transcribir y alinear 6 min de voz ya cargado, 20 s. Un proceso suelto lo deja en None: carga, usa y suelta.
kept: dict | None = None


def whisper_model(folder: Path, device: str, **options):
    """`whisperx.load_model` con Whisper y su detector de voz guardados en `kept`, si los hay."""
    import whisperx

    model, vad = (kept or {}).get(("whisper", device), (None, None))
    pipeline = whisperx.load_model(
        str(models.WHISPER.folder(folder)),
        device,
        compute_type="float16" if device == "cuda" else "int8",
        threads=threads(device),
        model=model,
        vad_model=vad,
        local_files_only=True,
        **options,
    )
    if kept is not None:
        kept[("whisper", device)] = (pipeline.model, pipeline.vad_model)
    return pipeline


def load_whisper(folder: Path, device: str, terms: list[str], numerals_in_words: bool = False):
    return whisper_model(
        folder,
        device,
        language=LANGUAGE,
        asr_options={
            "hotwords": ", ".join(terms) if terms else None,
            "initial_prompt": INITIAL_PROMPT,
            # Sin dígitos ni "%", "$" o "£": Whisper los dice con letra ("por ciento"), que el alineador sí sitúa.
            "suppress_numerals": numerals_in_words,
        },
    )


def load_foreign_whisper(folder: Path, device: str, terms: list[str] | None = None):
    """
    Whisper para la voz de otros (`transcribir-ajeno.py`, `transcribir-lote.py`): sin idioma fijo, que reconoce en los
    primeros 30 s de cada archivo, y sin texto inicial. `terms` son pistas de cómo se escriben los nombres del nicho
    (sin ellas, Whisper oía «Cloud» donde decían «Claude»); sin `terms`, como siempre.
    """
    return whisper_model(folder, device, asr_options={"hotwords": ", ".join(terms)} if terms else None)


def said(transcript: dict) -> dict:
    """Lo dicho, sin alinear: `{"idioma", "segmentos": [{"start", "end", "text"}, ...]}`, sin los segmentos vacíos."""
    segments = [
        {"start": round(float(segment["start"]), 3), "end": round(float(segment["end"]), 3), "text": segment["text"].strip()}
        for segment in transcript["segments"]
        if segment["text"].strip()
    ]
    return {"idioma": transcript.get("language"), "segmentos": segments}


def load_aligner(folder: Path, name: str, device: str):
    import whisperx

    if kept is not None and ("aligner", name, device) in kept:
        return kept[("aligner", name, device)]
    aligner = models.aligner(name)
    if isinstance(aligner, models.TorchaudioModel):
        loaded = whisperx.load_align_model(LANGUAGE, device, model_name=aligner.bundle, model_dir=str(aligner.folder(folder)))
    else:
        loaded = whisperx.load_align_model(LANGUAGE, device, model_name=str(aligner.folder(folder)), model_cache_only=True)
    if kept is not None:
        kept[("aligner", name, device)] = loaded
    return loaded


def terms_of(options: dict) -> list[str]:
    return [str(term).strip() for term in options.get("terminos") or [] if str(term).strip()]


def device_and_terms(options: dict) -> tuple[str, list[str]]:
    import torch

    return ("cuda" if torch.cuda.is_available() else "cpu"), terms_of(options)


def transcribe(files: list[str], options: dict) -> dict:
    folder = Path(options["modelos"])
    engine = parakeet.engine(folder)
    voices = [read_voice(f) for f in files]
    started = time.perf_counter()
    if engine.startswith("parakeet"):
        words, load = with_parakeet(voices, options, engine)
    else:
        words, load = with_whisper(voices, options)
    # Con Whisper ya cargado (la voz viva) no hubo carga: la que se apunta es la de un proceso suelto.
    medidas.note_voice(folder, engine, time.perf_counter() - started - load, sum(len(v) for v in voices) / SAMPLE_RATE,
                       None if kept is not None else load)
    progress(1)
    return {"words": words[0], "trozos": words} if len(voices) > 1 else {"words": words[0]}


def with_parakeet(voices: list[np.ndarray], options: dict, engine: str) -> tuple[list[list[dict]], float]:
    """
    Las palabras de cada voz con Parakeet, afinadas con el alineador si hay torch (`engine` es `parakeet`): el de
    `alineador.py`, que no importa WhisperX, o WhisperX con uno de Hugging Face. Cada trozo de Parakeet se alinea aparte:
    si el alineador no sitúa todas sus palabras, se quedan las de Parakeet.
    """
    folder = Path(options["modelos"])
    n = len(voices)
    align = engine == "parakeet" and bool(options.get("alineador"))
    # Lo que se lleva Parakeet del total cuando se alinea (17 s contra 12 s en una voz de 147 s).
    share = 0.6 if align else 1.0
    terms = terms_of(options)
    started = time.perf_counter()
    model = parakeet.load(folder)
    load = time.perf_counter() - started
    done = [
        parakeet.chunks(model, voice, lambda f, k=k: progress(share * (k + f) / n), bool(options.get("cifras_en_letra")), terms)
        for k, voice in enumerate(voices)
    ]
    del model
    if not align:
        return [rounded([w for c in chunks for w in c["words"]]) for chunks in done], load

    # Parakeet fuera antes de cargar el alineador: juntos, una voz de 11 min llegaba a 2,5 GB.
    free("cpu")
    started = time.perf_counter()
    align_chunk = chunk_aligner(folder, options["alineador"])
    load += time.perf_counter() - started
    words = []
    for k, (voice, chunks) in enumerate(zip(voices, done)):
        found = []
        for i, chunk in enumerate(chunks):
            found += align_chunk(voice, chunk) if chunk["words"] else []
            progress(share + (1 - share) * (k + (i + 1) / len(chunks)) / n)
        words.append(rounded(found))
    del align_chunk
    free("cpu")
    return words, load


def chunk_aligner(folder: Path, name: str):
    """Lo que alinea un trozo de Parakeet en el procesador: `(voz, trozo) -> palabras`."""
    if isinstance(models.aligner(name), models.TorchaudioModel):
        from alineador import Aligner

        return Aligner(folder, name).chunk

    import whisperx

    align_model, metadata = load_aligner(folder, name, "cpu")

    def align(voice: np.ndarray, chunk: dict) -> list[dict]:
        segment = {"text": " ".join(w["text"] for w in chunk["words"]), "start": chunk["start"], "end": chunk["end"]}
        aligned = timed_words(whisperx.align([segment], align_model, metadata, voice, "cpu")["segments"])
        return aligned if len(aligned) == len(chunk["words"]) else chunk["words"]

    return align


def rounded(words: list[dict]) -> list[dict]:
    return [{"text": w["text"], "start": round(float(w["start"]), 3), "end": round(float(max(w["start"], w["end"])), 3)} for w in words]


def with_whisper(voices: list[np.ndarray], options: dict) -> tuple[list[list[dict]], float]:
    import whisperx

    folder = Path(options["modelos"])
    device, terms = device_and_terms(options)
    n = len(voices)

    started = time.perf_counter()
    whisper = load_whisper(folder, device, terms, bool(options.get("cifras_en_letra")))
    load = time.perf_counter() - started
    transcripts = []
    for k, voice in enumerate(voices):
        transcripts.append(whisper.transcribe(
            voice, language=LANGUAGE, progress_callback=lambda percent, k=k: progress(TRANSCRIBING * (k + percent / 100) / n)
        ))
    del whisper
    free(device)

    align_model, metadata = load_aligner(folder, options["alineador"], device)
    words = []
    for k, (voice, transcript) in enumerate(zip(voices, transcripts)):
        aligned = whisperx.align(
            transcript["segments"],
            align_model,
            metadata,
            voice,
            device,
            progress_callback=lambda percent, k=k: progress(TRANSCRIBING + (1 - TRANSCRIBING) * (k + percent / 100) / n),
        )
        words.append(timed_words(aligned["segments"]))
    del align_model
    free(device)
    return words, load


if __name__ == "__main__":
    run(transcribe)
