"""
El video terminado: render de Remotion, el sonido masterizado para YouTube y la comprobación. No publica nada.

    python -I -B -X utf8 <skill>/scripts/terminar.py <video> [--borrador]

1. Renderiza la imagen (`npx remotion render`, sin audio) en out/_render.mp4, en H.264 yuv420p y bt709.
2. Masteriza public/sonido.wav (la voz, la cama y los efectos que deja build.py) a −14 LUFS y −1 dBTP
   (masterizar.mjs de video-base).
3. Los junta en out/final.mp4 (AAC 48 kHz, faststart) y lo comprueba (comprobar.mjs: el tamaño de la edición, 1920×1080 o 1080×1920, 30 fps, la duración,
   el sonido). Los negros se aceptan: la tarjeta negra y el final lo son a propósito.

--borrador: a la mitad de tamaño y sin masterizar, en out/borrador.mp4, para verlo entero rápido.
Después: `transcribir.py <video> --comparar out/final.mp4` (que la cama no se haya comido ninguna palabra).
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path

BASE = Path(os.environ.get("SLOTH_SKILLS") or Path.home() / ".claude" / "skills") / "video-base" / "scripts"
sys.path.insert(0, str(BASE))
from espacio import comprobar_disco  # noqa: E402


def correr(cmd, cwd, shell=False):
    r = subprocess.run(cmd, cwd=cwd, shell=shell)
    if r.returncode:
        sys.exit(f"terminar: falló {cmd if isinstance(cmd, str) else ' '.join(map(str, cmd))}")


def poner(tmp: Path, salida: Path) -> None:
    """Si el estudio de Sloth está enseñando la salida, Windows no deja reemplazarla: se reintenta y, si no, se aparta."""
    for _ in range(20):
        try:
            return os.replace(tmp, salida)
        except PermissionError:
            time.sleep(0.5)
    apartado = salida.with_name(f"_viejo-{int(time.time())}-{salida.name}")
    os.replace(salida, apartado)
    os.replace(tmp, salida)


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    borrador = "--borrador" in sys.argv
    if len(args) != 1:
        sys.exit(__doc__)
    v = Path(args[0]).resolve()
    if not (v / "src" / "edicion.json").exists():
        sys.exit(f"terminar: {v} no tiene src/edicion.json: corre build.py primero")
    datos = json.loads((v / "src" / "edicion.json").read_text(encoding="utf-8"))
    sonido = v / "public" / "sonido.wav"
    if not datos.get("audio") or not sonido.exists():
        sys.exit("terminar: la edición no tiene sonido (public/sonido.wav): build.py lo deja al final")
    out = v / "out"
    out.mkdir(exist_ok=True)
    render = out / ("_borrador.mp4" if borrador else "_render.mp4")
    escala = " --scale=0.5" if borrador else ""
    comprobar_disco(v)  # barre los temporales de renders cortados y para si no cabe otro
    correr(f'npx --no-install remotion render src/index.ts Documental "{render}" --muted --codec=h264 --crf=16 '
           f'--pixel-format=yuv420p --color-space=bt709 --log=error{escala}', v, shell=True)
    if borrador:
        master = sonido
    else:
        master = out / "_master.wav"
        correr(["node", str(BASE / "masterizar.mjs"), str(sonido), str(master)], v)
    final = out / ("borrador.mp4" if borrador else "final.mp4")
    tmp = out / f"_{final.name}"
    correr(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(render), "-i", str(master), "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", str(tmp)], v)
    poner(tmp, final)
    render.unlink(missing_ok=True)
    if not borrador:
        master.unlink(missing_ok=True)
        dur = datos["duracion"] / datos["fps"]
        correr(["node", str(BASE / "comprobar.mjs"), str(final), "--duracion", f"{dur:.3f}", "--fps", "30",
                "--tamano", f"{datos['ancho']}x{datos['alto']}", "--lufs", "-14", "--pico", "-1", "--negro-ok"], v)
        # En vertical, la portada de video-base (PORTADA.md) de primer fotograma: un render nuevo no la pierde.
        if datos["alto"] > datos["ancho"] and (v / "portada.png").exists():
            correr(["node", str(BASE / "portada.mjs"), str(final), str(v / "portada.png")], v)
    print(f"terminar: {final}")


if __name__ == "__main__":
    main()
