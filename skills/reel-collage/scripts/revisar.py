"""
Render rápido a media escala y hoja de cuadros para revisar.

    python -B revisar.py [s1,s2,...] [--sin-render]

Deja out/borrador.mp4 y revision/hoja.png: un cuadro al 85 % de cada frase (cuando ya entró todo lo de esa frase) más
los segundos que se pidan, que sirven para revisar movimiento (la entrada de un personaje, un impacto, una pausa). La
hoja la hace `hoja.mjs` de video-base, la misma de todos los estilos: en vertical, 6 columnas de 360 px de ancho; en
horizontal, 4 de 480x270, el tamaño al que se tiene que leer todo (FORMATO.md de video-base).
"""

import json
import subprocess
import sys

from comun import CONCURRENCIA, PROYECTO, base, formato
from espacio import limpiar_temporales  # de video-base, que comun.py pone en sys.path


def main() -> None:
    extra = [a for a in sys.argv[1:] if not a.startswith("--")]
    borrador = PROYECTO / "out" / "borrador.mp4"
    if "--sin-render" not in sys.argv:
        limpiar_temporales()
        subprocess.run(f"npx remotion render src/index.ts Reel out/borrador.mp4 --scale=0.5 --concurrency={CONCURRENCIA} --log=error",
                       shell=True, cwd=PROYECTO, check=True)
    voz = json.loads((PROYECTO / "public" / "voz.json").read_text(encoding="utf8"))
    tiempos = [(f["inicio"] + 0.85 * (f["fin"] - f["inicio"]), f"{f['i']}: {f['texto'][:34]}") for f in voz["frases"]]
    if extra:
        tiempos += [(float(s), "") for s in extra[0].split(",")]
    tiempos.sort()
    (PROYECTO / "revision").mkdir(exist_ok=True)
    celdas = ["--columnas", "4", "--ancho", "480"] if formato() == "horizontal" else ["--columnas", "6"]
    base("hoja.mjs", str(borrador), str(PROYECTO / "revision" / "hoja.png"),
         "--t", ",".join(f"{t:.3f}" for t, _ in tiempos),
         "--rotulos", "|".join(e.replace("|", "/") for _, e in tiempos), *celdas)


main()
