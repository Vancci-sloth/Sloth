"""
Une los clips de una frutinovela en el video final. Se corre desde la raíz del proyecto:

    python <skill>/scripts/unir.py <nombre> [--formato vertical|horizontal] [--sin-subtitulos] [--sin-recortar] [--hasta NN=s ...]

Toma `clips/esc-*.mp4` en orden y transcribe cada uno con el Whisper de Sloth. Corta el final muerto de cada clip, el
segundo o dos en que nadie habla ni se mueve, a 0,35 s de su última palabra, salvo `--sin-recortar`. `--hasta 03=7.6`
acaba el clip `esc-03` en ese segundo: para lo que pasa tras la última palabra (los golpes en la puerta del cliffhanger). Los lleva al
tamaño del formato (Veo da 720p) a 30 fps, une su audio y lo masteriza (`masterizar.mjs` de video-base, −14 LUFS y
−1 dBTP). Deja lo que dicen en `revision/transcripcion.txt`, para compararlo con el guion, y salvo `--sin-subtitulos`
lo pone encima en bloques de hasta tres palabras, con la más larga en amarillo. Deja `out/frutinovela-<nombre>.mp4`.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
SKILL = Path(__file__).resolve().parent.parent
BASE = SKILL.parent / "video-base" / "scripts"
sys.path.insert(0, str(BASE))
from sloth import ffmpeg_h264  # noqa: E402  la NVIDIA si hay, o x264 (video-base)

PROYECTO = Path.cwd()
FORMATOS = {"vertical": (1080, 1920), "horizontal": (1920, 1080)}
FPS = 30
PALABRAS = 3
# Lo que queda del clip tras su última palabra, y lo menos que dura un clip cortado.
MARGEN = 0.35
MINIMO = 2.0


def con_audio(clip: Path) -> bool:
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(clip)], capture_output=True, text=True)
    return bool(r.stdout.strip())


def duracion(clip: Path) -> float:
    """La de su imagen: el audio de Flow dura 8,04 s y la imagen 8,0, y cortar en la del archivo adelantaba el audio un
    cuadro por clip (y el video salía con menos fotogramas de los que dice su duración)."""
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration:format=duration", "-of", "default=nw=1:nk=1", str(clip)], capture_output=True, text=True, check=True)
    valores = [float(v) for v in r.stdout.split() if v.replace(".", "", 1).isdigit()]
    return valores[0]


def corte(clip: Path, segmentos: list[dict]) -> float:
    """
    Dónde acaba el clip: poco después de su última palabra. Veo deja de 1 a 2 s al final en que nadie habla ni se mueve,
    y con ruido de fondo, así que el silencio no se puede medir: se corta en lo que oye Whisper. Sin voz, entero. En un
    cuadro exacto, para que los fotogramas cuadren.
    """
    total = duracion(clip)
    if not segmentos:
        return total
    return min(total, round(max(segmentos[-1]["end"] + MARGEN, MINIMO) * FPS) / FPS)


def unir(clips: list[Path], cortes: list[float], ancho: int, alto: int, salida: Path) -> None:
    """Todos al mismo tamaño, fps y audio, cada uno hasta su corte, y uno tras otro. Un clip sin audio va con silencio."""
    entradas = [a for c in clips for a in ("-i", str(c))]
    filtros = []
    n = len(clips)
    for i, (c, fin) in enumerate(zip(clips, cortes)):
        filtros.append(f"[{i}:v]trim=end={fin:.3f},setpts=PTS-STARTPTS,scale={ancho}:{alto}:force_original_aspect_ratio=increase,crop={ancho}:{alto},setsar=1,fps={FPS},format=yuv420p[v{i}]")
        if con_audio(c):
            # Un desvanecido de 60 ms en el corte: sin él, chasquea.
            filtros.append(f"[{i}:a]atrim=end={fin:.3f},asetpts=PTS-STARTPTS,afade=t=out:st={max(fin - 0.06, 0):.3f}:d=0.06,aresample=48000,aformat=channel_layouts=stereo[a{i}]")
        else:
            # El silencio entra después de los clips: es la entrada que sigue.
            filtros.append(f"[{entradas.count('-i')}:a]anull[a{i}]")
            entradas += ["-f", "lavfi", "-t", f"{fin:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
    filtros.append("".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[v][a]")
    ffmpeg_h264(lambda h264: [*entradas, "-filter_complex", ";".join(filtros), "-map", "[v]", "-map", "[a]", *h264, "-c:a", "pcm_s16le", str(salida)], crf=16)


def tiempo(s: float) -> str:
    cs = round(s * 100)
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def bloques(segmentos: list[dict]) -> list[tuple[float, float, str]]:
    """Cada segmento, en bloques de hasta PALABRAS palabras; su tiempo se reparte por lo largo de cada bloque."""
    salida = []
    for s in segmentos:
        palabras = s["text"].split()
        if not palabras:
            continue
        grupos = [palabras[i : i + PALABRAS] for i in range(0, len(palabras), PALABRAS)]
        largo = sum(len(" ".join(g)) for g in grupos)
        t = s["start"]
        for g in grupos:
            fin = t + (s["end"] - s["start"]) * len(" ".join(g)) / largo
            salida.append((t, fin, " ".join(g)))
            t = fin
    return salida


def ass(bloques_: list[tuple[float, float, str]], ancho: int, alto: int) -> str:
    """Blanco con contorno negro y la palabra más larga de cada bloque en amarillo. En vertical, encima de la interfaz de TikTok."""
    letra = round(ancho * 0.075) if alto > ancho else round(alto * 0.085)
    margen = round(alto * 0.27) if alto > ancho else round(alto * 0.08)
    cabeza = (
        "[Script Info]\nScriptType: v4.00+\n"
        f"PlayResX: {ancho}\nPlayResY: {alto}\nWrapStyle: 0\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Base,Arial Black,{letra},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,{round(letra * 0.12)},{round(letra * 0.06)},2,60,60,{margen},1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )
    lineas = []
    for ini, fin, texto in bloques_:
        palabras = re.sub(r"[{}\\]", "", texto).upper().split()
        larga = max(range(len(palabras)), key=lambda i: len(re.sub(r"\W", "", palabras[i])))
        palabras[larga] = "{\\c&H0000FFFF&}" + palabras[larga] + "{\\c&H00FFFFFF&}"
        lineas.append(f"Dialogue: 0,{tiempo(ini)},{tiempo(fin)},Base,,0,0,0,,{' '.join(palabras)}")
    return cabeza + "\n".join(lineas) + "\n"


def main() -> None:
    # `--hasta NN=s`: dónde acaba ese clip, en vez de su corte (lo que suena o pasa tras la última palabra).
    hasta = {}
    for i, a in enumerate(sys.argv):
        if a == "--hasta" and i + 1 < len(sys.argv):
            n, s = sys.argv[i + 1].split("=")
            hasta[f"esc-{int(n):02d}"] = float(s)
    valores = {sys.argv[i + 1] for i, a in enumerate(sys.argv) if a in ("--hasta", "--formato") and i + 1 < len(sys.argv)}
    args = [a for a in sys.argv[1:] if not a.startswith("--") and a not in valores]
    if not args:
        sys.exit(__doc__)
    nombre = args[0]
    formato = sys.argv[sys.argv.index("--formato") + 1] if "--formato" in sys.argv else "vertical"
    if formato not in FORMATOS:
        sys.exit('--formato es "vertical" u "horizontal".')
    ancho, alto = FORMATOS[formato]
    clips = sorted((PROYECTO / "clips").glob("esc-*.mp4"))
    if not clips:
        sys.exit("No hay clips en clips/esc-*.mp4.")
    revision = PROYECTO / "revision"
    revision.mkdir(exist_ok=True)
    (PROYECTO / "out").mkdir(exist_ok=True)
    from sloth import transcribir  # el Python de Sloth y Whisper, de video-base

    # Clip por clip: de todo junto, Whisper puede dar un solo segmento largo y los subtítulos caerían donde no se habla.
    # Con lo que oye en cada uno se corta su final muerto (`corte`), salvo `--sin-recortar`.
    segmentos, renglones, cortes, inicio = [], [], [], 0.0
    for c in clips:
        propios = transcribir(c).get("segmentos", []) if con_audio(c) else []
        fin = duracion(c) if "--sin-recortar" in sys.argv else corte(c, propios)
        if c.stem in hasta:
            fin = min(duracion(c), round(hasta[c.stem] * FPS) / FPS)
        cortes.append(fin)
        segmentos += [{**s, "start": s["start"] + inicio, "end": min(s["end"], fin) + inicio} for s in propios if s["start"] < fin]
        renglones.append(f"{c.stem} ({inicio:.1f}-{inicio + fin:.1f} s, de {duracion(c):.1f}): {' '.join(s['text'].strip() for s in propios) or '(sin voz)'}")
        inicio += fin
    (revision / "transcripcion.txt").write_text("\n".join(renglones) + "\n", encoding="utf-8", newline="\n")

    crudo = revision / "crudo.mkv"
    print(f"Uniendo {len(clips)} clips a {ancho}x{alto}: {inicio:.1f} s…")
    unir(clips, cortes, ancho, alto, crudo)

    audio = revision / "audio.wav"
    subprocess.run(["node", str(BASE / "masterizar.mjs"), str(crudo), str(audio)], check=True)
    (revision / "transcripcion.json").write_text(json.dumps(segmentos, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")

    final = PROYECTO / "out" / f"frutinovela-{nombre}.mp4"
    video = ["-vf", "subtitles=subtitulos.ass"] if "--sin-subtitulos" not in sys.argv else []
    if video:
        (revision / "subtitulos.ass").write_text(ass(bloques(segmentos), ancho, alto), encoding="utf-8", newline="\n")
    # Desde revision/: la ruta del filtro `subtitles` en Windows (C:\…) rompe su sintaxis.
    ffmpeg_h264(
        lambda h264: ["-i", crudo.name, "-i", audio.name, "-map", "0:v", "-map", "1:a", *video,
                      *h264, "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
                      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final)],
        crf=18, cwd=revision,
    )
    print(f"Listo: {final}")
    print(f"Transcripción, para compararla con el guion: {revision / 'transcripcion.txt'}")


if __name__ == "__main__":
    main()
