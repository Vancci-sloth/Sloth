"""
Crea el proyecto de un video documental desde la grabación, en `<nombre>` (el de la línea `Carpeta:` de Sloth):

    python -I -B -X utf8 <skill>/scripts/nuevo.py <grabación> [<otra toma>…] <nombre> [--vertical]

Con varias tomas, las junta en el orden en que vienen. Al acabar transcribe la voz (work/tx/words.json) y enseña lo
dicho frase por frase con su segundo: con eso se escribe momentos.json.

Va en el directorio actual (Sloth lanza la card en `trabajo/video-documental`, y su panel de etapas busca ahí la
carpeta); dentro de un proyecto, junto a él. Deja:

  package.json, src/                      la plantilla: Remotion dibuja src/edicion.json, que escribe el director (hacer.py)
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
# Los demás scripts de la skill buscan video-base por SLOTH_SKILLS: que sea la de esta copia.
os.environ.setdefault("SLOTH_SKILLS", str(SKILL.parent))
sys.path.insert(0, str(SKILL.parent / "video-base" / "scripts"))
from espacio import enlazar_modulos  # noqa: E402
from sloth import ffmpeg_h264  # noqa: E402  la NVIDIA si hay, o x264


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
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", *args], check=True)


def grabacion(destino: Path, origen: Path, vertical: bool = False) -> None:
    media = destino / "public" / "assets" / "media"
    (destino / "fuentes").mkdir(exist_ok=True)
    src = destino / "fuentes" / f"grabacion{origen.suffix.lower()}"
    try:
        os.link(origen, src)
    except OSError:
        shutil.copy(origen, src)
    w, h = (1080, 1920) if vertical else (1920, 1080)
    ffmpeg_h264(lambda h264: [
        "-i", str(src), "-map", "0:v:0", "-vf",
        f"fps=30,scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2",
        *h264, "-g", "30", "-keyint_min", "30", "-pix_fmt", "yuv420p",
        "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-an",
        str(media / "cam_raw.mp4")], crf=14)
    ffmpeg("-i", str(src), "-map", "0:a:0", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s24le", str(media / "vo.wav"))


def juntar(destino: Path, tomas: list[Path], vertical: bool) -> Path:
    """Varias tomas, una tras otra y en el orden en que vienen, en una sola grabación (fuentes/grabacion.mkv)."""
    w, h = (1080, 1920) if vertical else (1920, 1080)
    (destino / "fuentes").mkdir(exist_ok=True)
    salida = destino / "fuentes" / "grabacion.mkv"
    entradas = [x for t in tomas for x in ("-i", str(t))]
    filtros = "".join(f"[{k}:v:0]fps=30,scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1[v{k}];"
                      f"[{k}:a:0]aresample=48000,aformat=channel_layouts=stereo[a{k}];" for k in range(len(tomas)))
    filtros += "".join(f"[v{k}][a{k}]" for k in range(len(tomas))) + f"concat=n={len(tomas)}:v=1:a=1[v][a]"
    print(f"juntando {len(tomas)} tomas -> fuentes/grabacion.mkv")
    ffmpeg_h264(lambda h264: [*entradas, "-filter_complex", filtros, "-map", "[v]", "-map", "[a]", *h264, "-pix_fmt", "yuv420p",
                              "-c:a", "pcm_s16le", str(salida)], crf=14)
    return salida


def transcribir(destino: Path) -> None:
    """Las palabras de la toma con su tiempo y, a la vista, lo dicho frase por frase con su segundo: de ahí salen las
    `palabra` de momentos.json."""
    r = subprocess.run([sys.executable, "-I", "-B", "-X", "utf8", str(SKILL / "scripts" / "transcribir.py"), str(destino)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        sys.exit(f"nuevo: la transcripción falló:\n{(r.stdout + r.stderr)[-1500:]}\nCuando se arregle: transcribir.py \"{destino}\"")
    for aviso in (l for l in r.stdout.splitlines() if "OJO" in l):
        print(aviso)
    if "Esperando:" in r.stdout:
        print("(la transcripción esperó a que otro video soltara la GPU)")
    palabras = json.loads((destino / "work" / "tx" / "words.json").read_text(encoding="utf-8"))
    if not palabras:
        sys.exit("nuevo: la grabación no trae palabras: ¿se oye la voz?")
    print(f"\nLo que dice la grabación: {len(palabras)} palabras, {palabras[-1]['e']:.1f} s. Entre corchetes, el segundo en que se "
          "dice lo que sigue. Con esto se escribe momentos.json (cada `palabra` sale de aquí, tal cual): no abras words.json.")
    linea, marca = [], -9.0
    for p in palabras:
        # Una marca al empezar cada frase y cada dos segundos o así: es el paso al que cambia la imagen.
        if not linea or p["s"] - marca >= 1.8:
            linea.append(f"[{p['s']:.1f}]")
            marca = p["s"]
        linea.append(p["w"])
        if p["w"].rstrip().endswith((".", "?", "!", "…")):
            print("  " + " ".join(linea))
            linea = []
    if linea:
        print("  " + " ".join(linea))
    # Lo que hacer.py va a exigir para lo que dura esta toma: dicho antes, sale a la primera.
    dura = palabras[-1]["e"]
    pide = [f"{int(dura / 2.2) + 1} momentos o más (uno cada dos segundos o menos)",
            f"tu cara de {dura * 0.25:.0f} a {dura * 0.35:.0f} s en total, en tramos de 1,2 a 2,5 s y nunca dos seguidos",
            "un clip en la mitad o más de los momentos de material", "`mega` en la frase estrella a cámara"]
    if dura > 25:
        pide += ["`grande` en dos palabras más", "una lista (`tarjetas`, `rafaga` o `muro`)", "un `negro`"]
    pide.append("y una `pagina` (con su `marca`) o un `post` de algo que se afirme")
    print(f"\nPara estos {dura:.0f} s, hacer.py exige: " + "; ".join(pide) + ".")
    print("Un nombre que salió mal escrito («Cloud» por «Claude») va en `palabra` como salió y, arriba, en `corrige` "
          "(`{\"Cloud\": \"Claude\"}`), para que los subtítulos lo escriban bien.")


def main() -> None:
    args = [a for a in sys.argv[1:] if a not in ("--vacio", "--vertical")]
    vacio = "--vacio" in sys.argv
    vertical = "--vertical" in sys.argv
    if len(args) < (1 if vacio else 2) or (vacio and len(args) != 1):
        sys.exit(__doc__)
    nombre = args[-1]
    tomas = [Path(a) for a in args[:-1]]
    aqui = Path.cwd()
    # Dentro de un proyecto (tiene package.json), junto a él: si no, saldría un video dentro de otro.
    if (aqui / "package.json").exists():
        aqui = aqui.parent
    destino = aqui / nombre
    if destino.exists():
        sys.exit(f"{destino} ya existe: usa otro nombre (puede ser de otra sesión haciendo el mismo video).")
    for t in tomas:
        if not t.is_file():
            sys.exit(f"No existe la grabación {t}")
    crear(destino, vertical)
    if not vacio:
        grabacion(destino, tomas[0] if len(tomas) == 1 else juntar(destino, tomas, vertical), vertical)
        transcribir(destino)
        print(f"\nEl proyecto: {destino}\nSigue: buscar.py desde esa carpeta, y momentos.json en ella con hacer.py")
    else:
        print(f"listo: {destino}")


if __name__ == "__main__":
    main()
