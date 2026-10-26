"""
Metraje encontrado para los chistes: el meme en video, la escena de la película, la caricatura, el noticiero. Se baja
solo el tramo que se usa, listo para `clip(0, src="videos/<nombre>.mp4")`.

    python metraje.py buscar "<qué>" [n]
        Busca en YouTube y lista n candidatos (8 por defecto): duración, canal, título y URL. Busca en inglés y con el
        nombre del momento ("pulp fiction royale with cheese scene", "he-man mirror", "slap fight meme").

    python metraje.py bajar <url> <desde> <hasta> public/videos/<nombre>.mp4 [--llenar | --tal-cual]
        Baja solo ese tramo (segundos del original, o m:ss), lo recodifica como pide public/ (30 fps, -bf 0 -g 15, sin
        audio) y lo deja en 1920x1080: si no es 16:9, centrado sobre el fondo del episodio, así las coordenadas de `clip()`
        siguen siendo de 1920x1080. Con --llenar recorta las orillas para llenar el cuadro (una caricatura en 4:3, un meme
        con bandas negras). Con --tal-cual conserva su tamaño (para ponerlo dentro de una captura con `video=`).
        Deja junto a él una hoja de cuadros (<nombre>-hoja.png) para comprobar que es el momento que querías.

YouTube va de uno en uno en toda la máquina (`turno_youtube`). Si la descarga normal falla o sale de menos de 720p,
reintenta una vez con el cliente web_embedded, que en octubre de 2026 sí daba 1080p (como fuente.py), y se queda con la
mejor de las dos.
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from comun import sloth, turno_youtube

FONDO = "0x0d0d10"  # COLOR.fondo de la plantilla


def segundos(t: str) -> float:
    s = 0.0
    for parte in t.split(":"):
        s = s * 60 + float(parte)
    return s


def buscar(que: str, n: int) -> None:
    # Sin turno: una búsqueda es una petición ligera, no una descarga. En el-diff-10 (25 de octubre), nueve búsquedas de
    # cuatro agentes de clip esperaron en fila detrás de la descarga del video del tema, y los clips tardaron 17 minutos.
    r = sloth("-m", "yt_dlp", f"ytsearch{n}:{que}", "--flat-playlist", "--dump-json", "--no-warnings",
              capture_output=True, text=True, encoding="utf8")
    if r.returncode != 0:
        sys.exit(r.stderr[-1500:])
    for linea in r.stdout.splitlines():
        e = json.loads(linea)
        d = e.get("duration") or 0
        print(f"{int(d // 60)}:{int(d % 60):02d} | {e.get('channel') or e.get('uploader') or '?'} | {e.get('title')}\n"
              f"      https://www.youtube.com/watch?v={e['id']}")


def alto(video: Path) -> int:
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height", "-of",
                        "csv=p=0", str(video)], capture_output=True, text=True)
    return int(r.stdout.strip() or 0)


def bajar(url: str, desde: float, hasta: float, salida: Path, tal_cual: bool, llenar: bool) -> None:
    salida.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        crudo, otro = Path(tmp) / "crudo.mp4", Path(tmp) / "otro.mp4"
        base = ["-m", "yt_dlp", "-f", "bv*[height<=1080]+ba/b", "--merge-output-format", "mp4", "--download-sections",
                f"*{desde}-{hasta}", "--force-keyframes-at-cuts", "--no-progress", "--no-warnings"]
        with turno_youtube():
            sloth(*base, "-o", str(crudo), url)
            if "youtu" in url and (not crudo.exists() or alto(crudo) < 720):
                print("-- reintento con el cliente web_embedded --", flush=True)
                sloth(*base, "--extractor-args", "youtube:player_client=web_embedded", "-o", str(otro), url)
                if otro.exists() and (not crudo.exists() or alto(otro) > alto(crudo)):
                    otro.replace(crudo)
        if not crudo.exists():
            sys.exit("yt-dlp no pudo bajar el tramo (arriba dice por qué). No pruebes otros clientes: acaban en 429.")
        print(f"bajado a {alto(crudo)}p")
        if tal_cual:
            vf = "fps=30"
        elif llenar:
            # Quita antes las bandas negras que traiga el video, para llenar con la imagen y no con las bandas.
            vf = "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30"
            caja = subprocess.run(["ffmpeg", "-nostdin", "-v", "info", "-i", str(crudo), "-vf", "cropdetect=24:2:0",
                                   "-frames:v", "90", "-f", "null", "-"], capture_output=True, text=True,
                                  encoding="utf8", errors="replace").stderr.rsplit("crop=", 1)
            if len(caja) == 2:
                vf = f"crop={caja[1].split()[0]}," + vf
        else:
            vf = (f"scale=1920:1080:force_original_aspect_ratio=decrease,"
                  f"pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color={FONDO},setsar=1,fps=30")
        subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", str(crudo), "-vf", vf, "-c:v", "libx264",
                        "-crf", "18", "-bf", "0", "-g", "15", "-pix_fmt", "yuv420p", "-an", str(salida)], check=True)
    dura = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                 str(salida)], capture_output=True, text=True).stdout.strip())
    hoja = salida.with_name(salida.stem + "-hoja.png")
    pasos = ",".join(f"{dura * i / 8:.2f}" for i in range(8))
    subprocess.run([sys.executable, str(Path(__file__).with_name("cuadros.py")), "hoja", str(salida), pasos, str(hoja)],
                   check=True)
    print(f"{salida} ({dura:.1f} s) · hoja: {hoja}")


def main() -> None:
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    if len(a) >= 2 and a[0] == "buscar":
        buscar(a[1], int(a[2]) if len(a) > 2 else 8)
    elif len(a) == 5 and a[0] == "bajar":
        bajar(a[1], segundos(a[2]), segundos(a[3]), Path(a[4]), "--tal-cual" in sys.argv, "--llenar" in sys.argv)
    else:
        sys.exit(__doc__)


main()
