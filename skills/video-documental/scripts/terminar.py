"""
El video terminado: render de Remotion, el sonido masterizado para redes y la comprobación. No publica nada.

    python -I -B -X utf8 <skill>/scripts/terminar.py <video> [--borrador]

1. Renderiza la imagen (render.cjs de video-base, sin audio) en out/_render.mp4, en H.264 yuv420p y bt709. Los cuadros
   de cada clip van ya sacados a imágenes (cuadros_render.cjs): con el video viajando cuadro a cuadro de FFmpeg a
   Chrome, un vertical de 60 s tardó 8 min; así, 70 s.
2. Masteriza public/sonido.wav (la voz, la cama y los efectos que deja el director) a −14 LUFS (masterizar.mjs de
   video-base), con el pico bajo −2 dBTP: el AAC sube los clics hasta un decibelio y el archivo tiene que quedar bajo −1.
3. Los junta en out/final.mp4 (AAC 48 kHz, faststart) y lo comprueba (comprobar.mjs: el tamaño de la edición, 30 fps, la
   duración, el sonido). Los negros se aceptan: la tarjeta negra y el final lo son a propósito.

--borrador: a la mitad de tamaño y sin masterizar, en out/borrador.mp4, para verlo entero rápido.
Después: `transcribir.py <video> --comparar out/final.mp4` (que la cama no se haya comido ninguna palabra).
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
BASE = Path(os.environ.get("SLOTH_SKILLS") or SKILL.parent) / "video-base" / "scripts"
sys.path.insert(0, str(BASE))
from espacio import comprobar_disco  # noqa: E402


def correr(cmd, cwd, fatal=True):
    r = subprocess.run(cmd, cwd=cwd)
    if r.returncode and fatal:
        sys.exit(f"terminar: falló {' '.join(map(str, cmd))}")
    return r.returncode


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
        sys.exit(f"terminar: {v} no tiene src/edicion.json: corre hacer.py primero")
    datos = json.loads((v / "src" / "edicion.json").read_text(encoding="utf-8"))
    sonido = v / "public" / "sonido.wav"
    if not datos.get("audio") or not sonido.exists():
        sys.exit("terminar: la edición no tiene sonido (public/sonido.wav): el director lo deja al final")
    out = v / "out"
    out.mkdir(exist_ok=True)
    render = out / ("_borrador.mp4" if borrador else "_render.mp4")
    comprobar_disco(v)  # barre los temporales de renders cortados y para si no cabe otro
    # Dos tercios de los núcleos dibujando: con la mitad (lo de Remotion) sobraba máquina; con todos, se pisan.
    correr(["node", str(BASE / "render.cjs"), str(render), "--id=Documental", "--muted", "--crf=18", "--x264-preset=veryfast",
            "--pixel-format=yuv420p", "--color-space=bt709", "--concurrency=66%",
            f"--antes={SKILL / 'scripts' / 'cuadros_render.cjs'}", '--props={"cuadros":true}', *(["--scale=0.5"] if borrador else [])], v)
    final = out / ("borrador.mp4" if borrador else "final.mp4")
    tmp = out / f"_{final.name}"
    master = out / "_master.wav"
    dur = datos["duracion"] / datos["fps"]
    # El pico, medido ya en AAC: los clics suben al codificarse. Con −2 casi siempre basta; si no, −3.
    for pico in ((None,) if borrador else ("-2", "-3", "-4")):
        if pico:
            correr(["node", str(BASE / "masterizar.mjs"), str(sonido), str(master), "--pico", pico], v)
        correr(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(render), "-i", str(master if pico else sonido), "-map", "0:v:0",
                "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", str(tmp)], v)
        if not pico:
            break
        mal = correr(["node", str(BASE / "comprobar.mjs"), str(tmp), "--duracion", f"{dur:.3f}", "--fps", "30",
                      "--tamano", f"{datos['ancho']}x{datos['alto']}", "--lufs", "-14", "--pico", "-1", "--negro-ok"], v, fatal=pico == "-4")
        if not mal:
            break
    poner(tmp, final)
    render.unlink(missing_ok=True)
    master.unlink(missing_ok=True)
    # En vertical, la portada de video-base (PORTADA.md) de primer fotograma: un render nuevo no la pierde.
    if not borrador and datos["alto"] > datos["ancho"] and (v / "portada.png").exists():
        correr(["node", str(BASE / "portada.mjs"), str(final), str(v / "portada.png")], v)
    print(f"terminar: {final}")


if __name__ == "__main__":
    main()
