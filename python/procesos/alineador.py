"""
El alineador del camino de Parakeet, sin WhisperX: el mismo modelo (`voxpopuli-es`, un wav2vec2 de torchaudio) con el
alineamiento forzado de torchaudio (`forced_align`). Importar `whisperx.alignment` trae transformers, nltk y pandas: 11 s
más que torch solo con todo ya en memoria (medido en un Core 5 210H), y mucho más con un disco viejo. Aquí solo se
importan torch y torchaudio.

Recibe los trozos que transcribió Parakeet (`parakeet.chunks`) y le pone a cada palabra su inicio y su fin. Con las
voces de cuatro videos, sus inicios quedan a 6–9 ms (mediana; 22–25 ms el p90) de los de WhisperX en la GPU, contra
68–92 ms con los de Parakeet solo. Una palabra sin letras que el modelo conozca (una cifra, un símbolo) toma el hueco entre sus vecinas; un
trozo que no se deja alinear se queda con los tiempos de Parakeet.

Solo sirve con los alineadores de torchaudio (`TorchaudioModel`); con uno de Hugging Face, `transcribir.py` usa WhisperX.
"""

from pathlib import Path

import numpy as np

import modelos_transcripcion as models

SAMPLE_RATE = 16000
# Las muestras entre un cuadro y el siguiente, y las que oye cada uno (las capas convolucionales de wav2vec2).
HOP = 320
RECEPTIVE = 400
WINDOW = 500
CONTEXT = 50


class Aligner:
    def __init__(self, folder: Path, name: str):
        import torch
        import torchaudio

        model = models.aligner(name)
        if not isinstance(model, models.TorchaudioModel):
            raise ValueError(f"«{name}» no es un alineador de torchaudio.")
        bundle = getattr(torchaudio.pipelines, model.bundle)
        self.torch = torch
        self.model = bundle.get_model(dl_kwargs={"model_dir": str(model.folder(folder))}).eval()
        self.labels = {c: i for i, c in enumerate(bundle.get_labels())}

    def chunk(self, voice: np.ndarray, chunk: dict) -> list[dict]:
        """Las palabras de un trozo de Parakeet, con los tiempos del alineador."""
        import torchaudio.functional as F

        torch, words = self.torch, chunk["words"]
        targets: list[int] = []
        owners: list[int] = []
        for i, w in enumerate(words):
            letters = [self.labels[c] for c in w["text"].lower() if c in self.labels and c not in "-|"]
            if not letters:
                continue
            if targets:
                targets.append(self.labels["|"])
                owners.append(-1)
            targets += letters
            owners += [i] * len(letters)
        a, b = int(chunk["start"] * SAMPLE_RATE), int(chunk["end"] * SAMPLE_RATE)
        if not targets or b - a < RECEPTIVE * 2:
            return words
        emission = self.emissions(voice[a:b])
        try:
            path, scores = F.forced_align(emission, torch.tensor([targets], dtype=torch.int32), blank=0)
        except RuntimeError:
            # Más letras que cuadros: el trozo no cabe en su audio.
            return words
        spans = F.merge_tokens(path[0], scores[0].exp())
        if len(spans) != len(targets):
            return words
        # Cada cuadro, en el centro de lo que oye: contando desde su borde, todo salía 10 ms antes que con WhisperX.
        frame, center = HOP / SAMPLE_RATE, chunk["start"] + RECEPTIVE / 2 / SAMPLE_RATE
        timed: list[dict | None] = [None] * len(words)
        for span, owner in zip(spans, owners):
            if owner < 0:
                continue
            start, end = center + span.start * frame, center + span.end * frame
            if timed[owner] is None:
                timed[owner] = {"text": words[owner]["text"], "start": start, "end": end}
            else:
                timed[owner]["end"] = end
        return fill(words, timed, chunk["start"], chunk["end"])

    def emissions(self, audio: np.ndarray):
        """
        Lo que oye el modelo en cada cuadro de 20 ms (`HOP` muestras), en ventanas de `WINDOW` cuadros con `CONTEXT` de
        más a cada lado, que se descarta: de una vez, un trozo de 30 s llevaba la memoria de 1,2 a 2,5 GB. El cuadro k
        oye las muestras [k·HOP, k·HOP + RECEPTIVE), así que cada ventana empieza justo en su cuadro.
        """
        torch = self.torch
        frames = (len(audio) - RECEPTIVE) // HOP + 1
        parts = []
        with torch.inference_mode():
            for first in range(0, frames, WINDOW):
                last = min(first + WINDOW, frames)
                a, b = max(0, first - CONTEXT), min(frames, last + CONTEXT)
                piece = np.ascontiguousarray(audio[a * HOP:(b - 1) * HOP + RECEPTIVE])
                emission, _ = self.model(torch.from_numpy(piece).unsqueeze(0))
                parts.append(emission[:, first - a:last - a])
            return torch.log_softmax(torch.cat(parts, dim=1), dim=-1)


def fill(words: list[dict], timed: list[dict | None], start: float, end: float) -> list[dict]:
    """Las que el alineador no situó, seguidas, se reparten el hueco entre la anterior y la siguiente que sí."""
    out = []
    i = 0
    previous = start
    while i < len(words):
        if timed[i] is not None:
            out.append(timed[i])
            previous = timed[i]["end"]
            i += 1
            continue
        after = i
        while after < len(words) and timed[after] is None:
            after += 1
        gap_end = timed[after]["start"] if after < len(words) else end
        step = max(0.0, gap_end - previous) / (after - i)
        out += [{"text": w["text"], "start": previous + k * step, "end": previous + (k + 1) * step} for k, w in enumerate(words[i:after])]
        previous = gap_end
        i = after
    return out
