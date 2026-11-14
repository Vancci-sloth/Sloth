"""
Las palabras de un video, cada una con su tiempo, para sus subtítulos en la Entrega (`server/subtitulos.ts`): sin
agente ni IA de pago, con el transcriptor local de Sloth (Whisper con NVIDIA, Parakeet sin ella) y el mismo alineador
que las voces de los videos. Lo demás (los renglones, el .srt y grabarlos en el video) lo hace el servidor.

    python subtitulos.py <video> <palabras.json>

Escribe `[{"text", "start", "end"}, ...]`, en segundos. Lo que va diciendo («Transcribiendo: 40 % (faltan 12 s).») sale
por la salida, y el servidor lo enseña tal cual.
"""

import json
import sys
from pathlib import Path

from sloth import MODELOS, proceso, wav16k


def main(video: Path, salida: Path) -> None:
    # Junto a la salida y no en %TEMP%: en la carpeta de los subtítulos del video.
    voz = salida.with_name("voz.16k.wav")
    try:
        try:
            wav16k(video, voz)
        except Exception:
            raise SystemExit("No pude sacar el sonido del video: ¿tiene audio?")
        palabras = proceso("transcribir.py", [str(voz)], {"modelos": str(MODELOS), "alineador": "voxpopuli-es"})["words"]
    finally:
        voz.unlink(missing_ok=True)
    salida.write_text(json.dumps(palabras, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
