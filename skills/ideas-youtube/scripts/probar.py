"""
Prueba frases de búsqueda en YouTube antes de ponerlas en el canal: cuántos videos largos da cada una, la mediana de sus
vistas y el más visto. Sirve para elegir las palabras con que el público pide el tema (la que da más mediana es la suya).

    python probar.py "crear videos con ia" "editar videos con ia" "automatizar videos con ia"

Usa el yt-dlp del Python de Sloth, siempre con -E -s -B -X utf8 (sin -B reescribe sus .pyc y la app de YouTube vuelve
a bajar 4 GB). Si no lo encuentra, el yt-dlp del Python con que se corre este script.
"""

import json
import os
import statistics
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
LARGO = 240  # 4 minutos: lo de menos son shorts


def python_ytdlp() -> list[str]:
    raiz = Path(os.environ.get("APPDATA", "")) / "youtube" / "piezas" / "python"
    # El mismo que elige Sloth (`elegirPython` en server/requisitos.ts): el suyo (`*-sloth`) y, entre iguales, el más nuevo.
    sloth = sorted(raiz.glob("*/python/python.exe"), key=lambda p: (p.relative_to(raiz).parts[0].endswith("-sloth"), p.stat().st_mtime))
    if sloth:
        return [str(sloth[-1]), "-E", "-s", "-B", "-X", "utf8"]
    return [sys.executable, "-X", "utf8"]


def mil(n: float) -> str:
    return f"{n / 1e6:.1f} M" if n >= 1e6 else f"{n / 1000:.0f} mil" if n >= 1000 else str(int(n))


def probar(frase: str) -> None:
    r = subprocess.run(
        [*python_ytdlp(), "-m", "yt_dlp", "-J", "--flat-playlist", "--no-warnings", "--extractor-args", "youtube:lang=es", f"ytsearch25:{frase}"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if r.returncode != 0:
        print(f"«{frase}»: no se pudo buscar ({r.stderr.strip().splitlines()[-1] if r.stderr.strip() else r.returncode})")
        return
    largos = [e for e in json.loads(r.stdout).get("entries") or [] if e and e.get("view_count") and (e.get("duration") or 0) >= LARGO]
    if not largos:
        print(f"«{frase}»: 0 videos largos")
        return
    mejor = max(largos, key=lambda e: e["view_count"])
    canales = len({e.get("channel_id") for e in largos})
    print(f"«{frase}»: {len(largos)} videos largos de {canales} canales · mediana {mil(statistics.median(e['view_count'] for e in largos))}"
          f" · el más visto: «{mejor.get('title')}» ({mil(mejor['view_count'])}, {mejor.get('channel')})")


for i, frase in enumerate(sys.argv[1:]):
    if i:
        time.sleep(2)  # un respiro entre búsquedas: YouTube frena a quien va muy rápido
    probar(frase)
