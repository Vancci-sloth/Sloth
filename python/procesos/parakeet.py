"""
Parakeet, el transcriptor de las computadoras sin NVIDIA: Parakeet TDT 0.6B v3 de NVIDIA (CC-BY-4.0) en ONNX y en int8,
con onnx-asr, sin torch. Entiende 25 idiomas de Europa, el español y el inglés entre ellos.

Medido con la misma voz de 147 s en un Core 5 210H, solo con el procesador: Whisper turbo tardó 106 s con 4 hilos, más
28–68 s en cargar (importa torch, transformers y pyannote); Parakeet, 22 s con 4 hilos y 29 s con 2, y cargó en 4 s. El
inicio de cada palabra quedó a 64 ms (mediana) del de WhisperX alineado: si hay torch, `transcribir.py` lo afina con el
alineador de siempre.

`engine()` elige el motor: Whisper si el torch del Python de Sloth es el de CUDA (se instaló así porque había una NVIDIA
que lo aguanta, `aguantaCuda` de server/requisitos.ts); si no, Parakeet si está puesto, y Whisper en el procesador si
aún no se bajó. `SLOTH_MOTOR` lo fuerza, para probar.

La voz va en trozos de hasta 30 s cortados en silencios: la memoria de Parakeet crece con el cuadrado de lo largo, y de
uno en uno se puede decir cuánto lleva.
"""

import difflib
import os
import re
import unicodedata
from collections.abc import Callable
from importlib.util import find_spec
from pathlib import Path

import numpy as np

import modelos_transcripcion as models
from cifras import en_letra

SAMPLE_RATE = 16000
# Con trozos de 15 s, Parakeet se equivocaba en más palabras del guion (97,5 % contra 98,3 % en una voz).
LONGEST = 30.0
# El corte se busca en el tramo más callado entre estos segundos y `LONGEST`.
SHORTEST = 20.0
STEP = 0.05
# Lo más que dura una palabra: la última antes de una pausa no se estira hasta la siguiente.
WORD = 1.0


def cuda_build() -> bool:
    """Si el torch instalado es el de CUDA, sin importarlo (tarda segundos): lo dice su `version.py`."""
    spec = find_spec("torch")
    if not spec or not spec.submodule_search_locations:
        return False
    version = Path(list(spec.submodule_search_locations)[0]) / "version.py"
    return version.exists() and re.search(r"^cuda\b[^=\n]*=\s*'", version.read_text(encoding="utf8"), re.M) is not None


def engine(folder: Path) -> str:
    """`whisper`, `parakeet` (con el alineador) o `parakeet-solo` (sin torch, que no alinea)."""
    forced = os.environ.get("SLOTH_MOTOR")
    if forced:
        return forced
    if cuda_build() or not find_spec("onnx_asr") or not models.PARAKEET.installed(folder):
        return "whisper"
    return "parakeet" if find_spec("torch") and find_spec("whisperx") else "parakeet-solo"


def load(folder: Path):
    import onnx_asr

    model = onnx_asr.load_model(
        "nemo-parakeet-tdt-0.6b-v3", str(models.PARAKEET.folder(folder)), quantization="int8", providers=["CPUExecutionProvider"]
    )
    return model.with_timestamps()


def cuts(voice: np.ndarray) -> list[tuple[int, int]]:
    """Los trozos de la voz, en muestras: hasta `LONGEST` s cada uno, cortados en el tramo más callado."""
    n, step = len(voice), int(SAMPLE_RATE * STEP)
    frames = n // step
    level = np.sqrt((voice[: frames * step].reshape(frames, step) ** 2).mean(axis=1)) if frames else np.zeros(0)
    pieces, start = [], 0
    while n - start > LONGEST * SAMPLE_RATE:
        a = (start + int(SHORTEST * SAMPLE_RATE)) // step
        b = (start + int(LONGEST * SAMPLE_RATE)) // step
        cut = (a + int(np.argmin(np.convolve(level[a:b], np.ones(4) / 4, mode="same")))) * step
        pieces.append((start, cut))
        start = cut
    pieces.append((start, n))
    return pieces


def chunks(model, voice: np.ndarray, report: Callable[[float], None], numerals_in_words: bool = False, terms: list[str] | None = None) -> list[dict]:
    """
    Los trozos transcritos, `{"start", "end", "words": [{"text", "start", "end"}]}`, en segundos desde el principio.
    `report` recibe cuánto lleva, de 0 a 1. Parakeet da el inicio de cada pieza de palabra; el final es el inicio de la
    siguiente, sin pasar de `WORD`. Con `terms`, los nombres mal escritos se corrigen (`with_terms`).
    """
    pieces = cuts(voice)
    done = []
    for a, b in pieces:
        # Un resto de menos de 0,1 s no lleva voz.
        result = model.recognize(voice[a:b], sample_rate=SAMPLE_RATE) if b - a > SAMPLE_RATE // 10 else None
        tokens = zip(result.tokens or [], result.timestamps or []) if result else []
        words: list[dict] = []
        for token, t in tokens:
            if token.startswith(" ") or not words:
                words.append({"text": token.strip(), "start": a / SAMPLE_RATE + t})
            else:
                words[-1]["text"] += token
        words = [w for w in words if w["text"]]
        end = b / SAMPLE_RATE
        for w, after in zip(words, [*words[1:], None]):
            w["end"] = min(after["start"] if after else end, w["start"] + WORD)
        if terms:
            words = with_terms(words, terms)
        if numerals_in_words:
            words = spoken(words)
        done.append({"start": a / SAMPLE_RATE, "end": end, "words": words})
        report(b / len(voice))
    return done


def bare(text: str) -> str:
    """Una palabra para comparar: minúsculas, sin acentos ni signos."""
    text = unicodedata.normalize("NFD", text.lower())
    return re.sub(r"[^a-z0-9ñ]", "", "".join(c for c in text if unicodedata.category(c) != "Mn"))


def with_terms(words: list[dict], terms: list[str]) -> list[dict]:
    """
    Los nombres de `terms` que Parakeet escribió mal, cambiados por el nombre: Whisper los recibe como pistas, Parakeet no
    («la Sada» por «Lazada»). Una, dos o tres palabras seguidas que, juntas, se parecen al nombre en un 80 % o más (y miden
    casi lo mismo) pasan a ser el nombre, con el tiempo de las que reemplaza repartido por letras entre sus palabras.
    """
    keys = [(bare(t), t) for t in terms if len(bare(t)) >= 5]
    if not keys:
        return words
    plain = [bare(w["text"]) for w in words]
    known = {bare(p) for t in terms for p in t.split()}

    def like(a: int, b: int, key: str) -> float:
        joined = "".join(plain[a:b])
        return difflib.SequenceMatcher(None, joined, key).ratio() if joined and abs(len(joined) - len(key)) <= 2 else 0

    out: list[dict] = []
    i = 0
    while i < len(words):
        best = None
        for n in (1, 2, 3):
            # Si ya está bien escrito, se deja; y cada palabra tiene que sumar al parecido: «un Ledger» no es «Ledger».
            if i + n > len(words) or any(p in known for p in plain[i:i + n]):
                break
            for key, term in keys:
                ratio = like(i, i + n, key)
                if ratio >= 0.8 and (n == 1 or ratio > max(like(i + 1, i + n, key), like(i, i + n - 1, key))):
                    if best is None or ratio > best[0]:
                        best = (ratio, n, term)
        if not best:
            out.append(words[i])
            i += 1
            continue
        _, n, term = best
        start, end = words[i]["start"], words[i + n - 1]["end"]
        mark = re.search(r"[^\w]*$", words[i + n - 1]["text"]).group()
        parts = term.split()
        total = sum(len(p) for p in parts)
        t = start
        for k, part in enumerate(parts):
            step = (end - start) * len(part) / total
            out.append({"text": part + (mark if k == len(parts) - 1 else ""), "start": t, "end": t + step})
            t += step
        i += n
    return out


def spoken(words: list[dict]) -> list[dict]:
    """Las palabras con las cifras dichas con letra; las que salen de una cifra se reparten su tiempo."""
    out = []
    for w in words:
        if not any(c.isdigit() or c == "%" for c in w["text"]):
            out.append(w)
            continue
        said = en_letra(w["text"]).split()
        step = (w["end"] - w["start"]) / max(1, len(said))
        out += [{"text": s, "start": w["start"] + k * step, "end": w["start"] + (k + 1) * step} for k, s in enumerate(said)]
    return out


def segments(done: list[dict], gap: float = 0.6, longest: float = 12.0) -> list[dict]:
    """
    Lo dicho en frases, `{"start", "end", "text"}`, como `said()` de transcribir.py: corta en cada punto final, en
    una pausa de `gap` s o al llegar a `longest` s.
    """
    out: list[dict] = []
    current: list[dict] = []

    def close() -> None:
        if current:
            out.append({"start": round(current[0]["start"], 3), "end": round(current[-1]["end"], 3),
                        "text": " ".join(w["text"] for w in current)})
            current.clear()

    for chunk in done:
        for w in chunk["words"]:
            if current and (w["start"] - current[-1]["end"] > gap or w["end"] - current[0]["start"] > longest):
                close()
            current.append(w)
            if w["text"][-1] in ".?!…":
                close()
        close()
    return out


# Las palabras que más se repiten en cada idioma: con ellas se dice en cuál va un texto (Parakeet no lo dice).
STOPWORDS = {
    "es": set("de la que el en y a los se del las un por con no una su para es al lo como más pero sus le ya o este".split()),
    "en": set("the of and to a in is you that it he was for on are as with his they i at be this have from".split()),
    "pt": set("de a o que e do da em um para é com não uma os no se na por mais as dos como mas foi ao".split()),
    "fr": set("de la le et les des en un du une que est pour qui dans à par plus pas au sur ne se ce il".split()),
    "it": set("di e il la che è per un in non una sono del mi ma ho lo ha le si con cosa gli da".split()),
    "de": set("der die und in den von zu das mit sich des auf für ist im dem nicht ein eine als auch es an".split()),
}


def language(text: str) -> str | None:
    """El idioma de un texto por sus palabras más comunes; `None` si es muy corto para saberlo."""
    words = re.findall(r"[^\W\d_]+", text.lower())
    if len(words) < 5:
        return None
    counts = {lang: sum(w in common for w in words) for lang, common in STOPWORDS.items()}
    best = max(counts, key=counts.get)
    return best if counts[best] else None
