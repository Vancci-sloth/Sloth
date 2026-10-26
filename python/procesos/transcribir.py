"""
Transcribe una voz en español con WhisperX large-v3-turbo y da el tiempo de cada palabra con un alineador.

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
import wave
from pathlib import Path

import numpy as np

import modelos_transcripcion as models
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


def load_whisper(folder: Path, device: str, terms: list[str], numerals_in_words: bool = False):
    import whisperx

    return whisperx.load_model(
        str(models.WHISPER.folder(folder)),
        device,
        compute_type="float16" if device == "cuda" else "int8",
        threads=threads(device),
        language=LANGUAGE,
        asr_options={
            "hotwords": ", ".join(terms) if terms else None,
            "initial_prompt": INITIAL_PROMPT,
            # Sin dígitos ni "%", "$" o "£": Whisper los dice con letra ("por ciento"), que el alineador sí sitúa.
            "suppress_numerals": numerals_in_words,
        },
        local_files_only=True,
    )


def load_foreign_whisper(folder: Path, device: str, terms: list[str] | None = None):
    """
    Whisper para la voz de otros (`transcribir-ajeno.py`, `transcribir-lote.py`): sin idioma fijo, que reconoce en los
    primeros 30 s de cada archivo, y sin texto inicial. `terms` son pistas de cómo se escriben los nombres del nicho
    (sin ellas, Whisper oía «Cloud» donde decían «Claude»); sin `terms`, como siempre.
    """
    import whisperx

    return whisperx.load_model(
        str(models.WHISPER.folder(folder)),
        device,
        compute_type="float16" if device == "cuda" else "int8",
        threads=threads(device),
        asr_options={"hotwords": ", ".join(terms)} if terms else None,
        local_files_only=True,
    )


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

    aligner = models.aligner(name)
    if isinstance(aligner, models.TorchaudioModel):
        return whisperx.load_align_model(LANGUAGE, device, model_name=aligner.bundle, model_dir=str(aligner.folder(folder)))
    return whisperx.load_align_model(LANGUAGE, device, model_name=str(aligner.folder(folder)), model_cache_only=True)


def device_and_terms(options: dict) -> tuple[str, list[str]]:
    import torch

    terms = [str(term).strip() for term in options.get("terminos") or [] if str(term).strip()]
    return ("cuda" if torch.cuda.is_available() else "cpu"), terms


def transcribe(files: list[str], options: dict) -> dict:
    import whisperx

    folder = Path(options["modelos"])
    device, terms = device_and_terms(options)
    voices = [read_voice(f) for f in files]
    n = len(voices)

    whisper = load_whisper(folder, device, terms, bool(options.get("cifras_en_letra")))
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
    progress(1)
    return {"words": words[0], "trozos": words} if n > 1 else {"words": words[0]}


if __name__ == "__main__":
    run(transcribe)
