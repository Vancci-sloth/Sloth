"""
El paso 2 de la fase 2, en segundos y sin agente: pone en public/ lo que juntó la fase 1. Se corre en la raíz del
episodio, y otra vez si llegó material nuevo (lo que ya está no se repite).

    python <skill>/scripts/material.py

- fuentes/material/web/ y tuits/ → public/web/
- fuentes/material/personas/, memes/ y logos/ → public/web/personas/, public/web/memes/ y public/web/logos/
- fuentes/material/videos/ → public/videos/, recodificados como los pide public/ (30 fps, -bf 0 -g 15); el metraje de
  metraje.py ya llega ahí así
- fuentes/tema/video.mp4 → public/clips/tema.mp4, recodificado igual. Es lo más lento (unos 5 minutos en el-diff-8):
  córrelo de fondo en cuanto baje el video, en la fase 1, y otra vez al empezar las escenas, que ya no tarda

En el-diff-7 (25 de octubre) esto lo hacía el agente de las escenas a mano, y se le iban 4 minutos antes de lanzar a
los que escriben.
"""

import shutil
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from comun import ffmpeg

RECODIFICAR = ["-c:v", "libx264", "-crf", "18", "-bf", "0", "-g", "15", "-r", "30", "-pix_fmt", "yuv420p", "-an"]


def al_dia(origen: Path, destino: Path) -> bool:
    return destino.exists() and destino.stat().st_mtime >= origen.stat().st_mtime


def recodificar(origen: Path, destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_name(destino.stem + ".parcial.mp4")
    ffmpeg("-i", str(origen), *RECODIFICAR, str(parcial))
    parcial.replace(destino)


def main() -> None:
    raiz = Path.cwd()
    m, public = raiz / "fuentes" / "material", raiz / "public"
    if not (raiz / "guion.py").exists():
        sys.exit("córrelo en la raíz del episodio (donde está guion.py)")
    copiadas = 0
    for sub, destino in [("web", "web"), ("tuits", "web"), ("personas", "web/personas"), ("memes", "web/memes"), ("logos", "web/logos")]:
        for f in sorted((m / sub).glob("*")) if (m / sub).exists() else []:
            if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"):
                d = public / destino / f.name
                if not al_dia(f, d):
                    d.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(f, d)
                    copiadas += 1
    # Los videos van a public/videos/ vengan de videos/ o de memes/ (el agente de captura deja ahí el metraje de los
    # chistes: en el-diff-9, gta6.mp4).
    trabajos = [(f, public / "videos" / (f.stem + ".mp4")) for sub in ("videos", "memes") if (m / sub).exists()
                for f in sorted((m / sub).glob("*")) if f.is_file() and f.suffix.lower() in (".mp4", ".mov", ".webm", ".mkv")]
    tema = raiz / "fuentes" / "tema" / "video.mp4"
    if tema.exists():
        trabajos.append((tema, public / "clips" / "tema.mp4"))
    trabajos = [(o, d) for o, d in trabajos if not al_dia(o, d)]
    with ThreadPoolExecutor(3) as pool:
        list(pool.map(lambda t: recodificar(*t), trabajos))
    print(f"material: {copiadas} imágenes a public/web/, {len(trabajos)} videos recodificados"
          + ("" if tema.exists() else "; aún no está fuentes/tema/video.mp4"))
    print("Rutas para guion.py: web/<archivo>, web/personas/, web/memes/, web/logos/, videos/<nombre>.mp4, clips/tema.mp4 "
          "y recortes/ (los deja el agente de captura).")


if __name__ == "__main__":
    main()
