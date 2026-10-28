"""
Las palabras de la toma con su tiempo, para cortar sobre ellas: work/tx/words.json y work/tx/transcript.txt.

    python -I -B -X utf8 <skill>/scripts/transcribir.py <video>
    python -I -B -X utf8 <skill>/scripts/transcribir.py <video> --comparar out/final.mp4

Transcribe public/assets/media/vo.wav con el transcriptor de Sloth (WhisperX large-v3-turbo y el alineador del español,
`python/procesos/transcribir.py`), con los nombres de `terminos.txt` (uno por línea, si existe) como pistas, y sigue
con snap-onsets.py. Avisa de los tramos con voz y sin palabras: Whisper a veces se salta uno entero; léelos antes de
construir. Los nombres mal oídos se corrigen a mano en words.json, sin tocar los tiempos.

--comparar: transcribe el video terminado y dice qué palabras de la toma no se oyen en él (la cama o un golpe se
comieron una consonante: en las referencias, «Claude did.» salió «Flaw dead»).

words.json: [{"w": "Hola", "s": 0.0, "e": 0.24}, ...]
"""

import difflib
import json
import os
import re
import subprocess
import sys
import unicodedata
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(os.environ.get("SLOTH_SKILLS") or Path.home() / ".claude" / "skills") / "video-base" / "scripts"))
from sloth import MODELOS, proceso, wav16k  # noqa: E402

SKILL = Path(__file__).resolve().parent.parent


def palabras(wav: Path, video: Path) -> list[dict]:
    v16 = video / "work" / "tx" / f"{wav.stem}.16k.wav"
    wav16k(wav, v16)
    t = video / "terminos.txt"
    terminos = [x.strip() for x in t.read_text(encoding="utf-8").splitlines() if x.strip()] if t.exists() else []
    try:
        d = proceso("transcribir.py", [str(v16)], {"modelos": str(MODELOS), "alineador": "voxpopuli-es",
                                                    "terminos": terminos, "cifras_en_letra": True})
        huecos(d["words"], v16)
    finally:
        v16.unlink(missing_ok=True)
    return [{"w": p["text"], "s": round(p["start"], 3), "e": round(p["end"], 3)} for p in d["words"]]


def huecos(ws: list[dict], v16: Path, paso: float = 0.05) -> None:
    """Los tramos de 2 s o más sin palabras en los que se oye voz al menos un 30 % del tiempo."""
    with wave.open(str(v16), "rb") as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
    n = int(16000 * paso)
    rms = np.sqrt((x[: len(x) // n * n].reshape(-1, n) ** 2).mean(axis=1))
    voz = rms > 0.3 * (np.percentile(rms, 95) + 1e-9)
    bordes = [0.0] + [t for p in ws for t in (p["start"], p["end"])] + [len(voz) * paso]
    for a, b in zip(bordes[::2], bordes[1::2]):
        if b - a >= 2 and voz[int(a / paso):int(b / paso)].mean() >= 0.3:
            print(f"  OJO: {a:.1f}–{b:.1f} s tiene voz y ninguna palabra: escúchalo antes de construir")


def normal(w: str) -> str:
    w = unicodedata.normalize("NFKD", w.lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in w if not unicodedata.combining(c)))


def comparar(video: Path, final: Path) -> None:
    toma = json.loads((video / "work" / "tx" / "words.json").read_text(encoding="utf-8"))
    wav = video / "work" / "tx" / "final.wav"
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", str(final), "-map", "0:a:0", str(wav)], check=True)
    try:
        oido = palabras(wav, video)
    finally:
        wav.unlink(missing_ok=True)
    a, b = [normal(p["w"]) for p in toma], [normal(p["w"]) for p in oido]
    faltan = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op in ("delete", "replace"):
            faltan.append((toma[i1]["s"], " ".join(p["w"] for p in toma[i1:i2]), " ".join(p["w"] for p in oido[j1:j2])))
    if not faltan:
        print("comparar: se oye todo lo que se dijo.")
    for t, dicho, oye in faltan:
        print(f"  {t:7.2f} s  se dijo «{dicho}»  y se oye «{oye or '(nada)'}»")


def main() -> None:
    if len(sys.argv) not in (2, 4) or (len(sys.argv) == 4 and sys.argv[2] != "--comparar"):
        sys.exit(__doc__)
    video = Path(sys.argv[1]).resolve()
    if len(sys.argv) == 4:
        return comparar(video, (video / sys.argv[3]) if not Path(sys.argv[3]).is_absolute() else Path(sys.argv[3]))
    ws = palabras(video / "public" / "assets" / "media" / "vo.wav", video)
    tx = video / "work" / "tx"
    (tx / "words_raw.json").unlink(missing_ok=True)   # snap-onsets parte de la transcripción nueva
    (tx / "words.json").write_text(json.dumps(ws, ensure_ascii=False, indent=0), encoding="utf-8")
    frases, linea = [], []
    for p in ws:
        linea.append(p["w"])
        if p["w"].rstrip().endswith((".", "?", "!", "…")):
            frases.append(" ".join(linea))
            linea = []
    (tx / "transcript.txt").write_text("\n".join(frases + ([" ".join(linea)] if linea else [])) + "\n", encoding="utf-8")
    print(f"transcribir: {len(ws)} palabras -> {tx / 'words.json'}")
    subprocess.run([sys.executable, "-I", "-B", "-X", "utf8", str(SKILL / "scripts" / "snap-onsets.py"), str(video)], check=True)


if __name__ == "__main__":
    main()
