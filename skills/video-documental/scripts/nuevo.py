"""
Crea el proyecto de un video documental desde la grabación, en `<nombre>` (el de la línea `Carpeta:` de Sloth):

    python -I -B -X utf8 <skill>/scripts/nuevo.py <grabación> <nombre> [--vertical]

Va en el directorio actual (Sloth lanza la card en `trabajo/video-documental`, y su panel de etapas busca ahí la
carpeta); dentro de un proyecto, junto a él. Deja:

  package.json, src/, build.py, PLAN.md   la plantilla: Remotion dibuja src/edicion.json, que escribe build.py
  public/assets/ev1/                      tokens.css y fonts/, las del estilo
  fuentes/grabacion.<ext>                 la grabación (enlace duro si se puede: no ocupa más disco). Fuera de public/:
                                          Remotion copia public/ entero cada vez que empaqueta, y no la usa
  public/assets/media/cam_raw.mp4         la cámara, CRUDA: 30 fps constantes, un cuadro clave por segundo, sin grade
  public/assets/media/vo.wav              la voz, 48 kHz
  public/assets/{img,clips,captures,music}/   work/tx/   out/   revision/
  node_modules                            un enlace al que comparten todos los documentales (espacio.py de video-base)

Sin grabación (`--vacio`), solo el proyecto: lo usa prueba.py.

--vertical (el mensaje trae `Formato: vertical`): el video es de 1080x1920, para TikTok, Reels y Shorts. Lo apunta en
formato.txt, que leen los dispositivos, ev1_treat, ev1_clip, matte y terminar; sin él, todo es 1920x1080.
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SKILL.parent / "video-base" / "scripts"))
from espacio import enlazar_modulos  # noqa: E402


def modulos(destino: Path) -> None:
    """node_modules: un enlace al que comparten todos los documentales. La primera vez sale del de otro documental viejo."""
    vecinos = [p for p in destino.parent.glob("*/node_modules") if p.parent != destino]
    enlazar_modulos(destino, "video-documental", SKILL / "plantilla", vecinos)


def crear(destino: Path, vertical: bool = False) -> None:
    """La plantilla, las fuentes del estilo, las carpetas y node_modules. En vertical, formato.txt y el cuadro de 1080x1920."""
    shutil.copytree(SKILL / "plantilla", destino, ignore=shutil.ignore_patterns("__pycache__", "node_modules"))
    if vertical:
        (destino / "formato.txt").write_text("vertical\n", encoding="utf-8")
        e = destino / "src" / "edicion.json"
        d = json.loads(e.read_text(encoding="utf-8"))
        d["ancho"], d["alto"] = 1080, 1920
        e.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    ev1 = destino / "public" / "assets" / "ev1"
    shutil.copytree(SKILL / "assets" / "fonts", ev1 / "fonts")
    shutil.copy(SKILL / "assets" / "tokens.css", ev1)
    for d in ("public/assets/media", "public/assets/img", "public/assets/clips", "public/assets/captures",
              "public/assets/music", "work/tx", "out", "revision"):
        (destino / d).mkdir(parents=True, exist_ok=True)
    modulos(destino)


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-stats", "-y", *args], check=True)


def grabacion(destino: Path, origen: Path, vertical: bool = False) -> None:
    media = destino / "public" / "assets" / "media"
    (destino / "fuentes").mkdir(exist_ok=True)
    src = destino / "fuentes" / f"grabacion{origen.suffix.lower()}"
    try:
        os.link(origen, src)
    except OSError:
        shutil.copy(origen, src)
    w, h = (1080, 1920) if vertical else (1920, 1080)
    print(f"cámara -> public/assets/media/cam_raw.mp4 (cruda, {w}x{h}, 30 fps constantes)")
    ffmpeg("-i", str(src), "-map", "0:v:0", "-vf",
           f"fps=30,scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2",
           "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-g", "30", "-keyint_min", "30", "-pix_fmt", "yuv420p",
           "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-an",
           str(media / "cam_raw.mp4"))
    print("voz -> public/assets/media/vo.wav")
    ffmpeg("-i", str(src), "-map", "0:a:0", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s24le", str(media / "vo.wav"))


def main() -> None:
    args = [a for a in sys.argv[1:] if a not in ("--vacio", "--vertical")]
    vacio = "--vacio" in sys.argv
    vertical = "--vertical" in sys.argv
    if len(args) != (1 if vacio else 2):
        sys.exit(__doc__)
    nombre = args[-1]
    aqui = Path.cwd()
    # Dentro de un proyecto (tiene package.json), junto a él: si no, saldría un video dentro de otro.
    if (aqui / "package.json").exists():
        aqui = aqui.parent
    destino = aqui / nombre
    if destino.exists():
        sys.exit(f"{destino} ya existe: usa otro nombre (puede ser de otra sesión haciendo el mismo video).")
    if not vacio and not Path(args[0]).is_file():
        sys.exit(f"No existe la grabación {args[0]}")
    crear(destino, vertical)
    if not vacio:
        grabacion(destino, Path(args[0]), vertical)
        d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                            str(destino / "public" / "assets" / "media" / "cam_raw.mp4")], capture_output=True, text=True).stdout.strip()
        print(f"\n{destino}  ({float(d):.1f} s)")
        print(f"sigue: python -I -B -X utf8 {SKILL / 'scripts' / 'transcribir.py'} \"{destino}\"")
    else:
        print(f"listo: {destino}")


if __name__ == "__main__":
    main()
