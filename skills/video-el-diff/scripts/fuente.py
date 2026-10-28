"""
Baja un video de YouTube (o X) y lo transcribe con WhisperX, con los procesos de Sloth.

    python fuente.py <url> <carpeta>          p. ej. fuentes/tema  o  fuentes/estilo

Deja en <carpeta>: video.mp4 (hasta 1080p), video.info.json, voz.wav (16 kHz), transcripcion.json y
transcripcion.txt (con [m:ss] por segmento). Imprime título, canal, fecha y la transcripción.

Si otro episodio ya bajó ese video de YouTube, lo enlaza de ahí en vez de bajarlo (y su transcripción, aunque el
video haya que bajarlo otra vez porque aquella copia quedó en 360p). Los episodios de un lote bajan de uno en uno.

Si la descarga falla o sale de menos de 720p, la reintenta una vez con el cliente web_embedded (como metraje.py) y se
queda con la mejor. Un video.mp4 de menos de 720p se vuelve a intentar cada vez que se corre; el de antes solo se
cambia por uno mejor.
"""

import glob
import json
import os
import re
import shutil
import sys
from pathlib import Path

from comun import MODELOS, proceso, sloth, turno_youtube, wav16k

YOUTUBE = re.compile(r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|live/|embed/)|youtu\.be/)([\w-]{11})")
# Donde dejan sus fuentes los episodios: los vecinos de este (la carpeta de trabajo de la card; se corre en la raíz del
# episodio).
EPISODIOS = [f"{glob.escape(str(Path.cwd().parent))}/*/fuentes"]
# Lo que no sirve para sacar clips ni cuadros.
MINIMO = 720
# El único reintento, el mismo de metraje.py: en octubre de 2026, web_embedded daba 1080p cuando la descarga normal pedía
# «Sign in to confirm you're not a bot» o daba 360p (mweb solo da 360p). Probar más clientes acabó en 429 el 8 de octubre.
REINTENTO = ("--extractor-args", "youtube:player_client=web_embedded")


def altura(carpeta: Path) -> int:
    info = carpeta / "video.info.json"
    return (json.loads(info.read_text(encoding="utf8")).get("height") or 0) if info.exists() else 0


def copias(vid: str, carpeta: Path) -> list[Path]:
    """Las carpetas de otros episodios donde ya está ese video. yt-dlp escribe el `id` primero en su video.info.json, que
    pesa ~2 MB: basta con leer el principio."""
    vistas, halladas, marca = {carpeta}, [], f'{{"id": "{vid}"'.encode()
    for raiz in EPISODIOS:
        for info in glob.glob(f"{raiz}/*/video.info.json") + glob.glob(f"{raiz}/*/*/video.info.json"):
            d = Path(info).parent.resolve()
            if d in vistas:
                continue
            vistas.add(d)
            with open(info, "rb") as f:
                if f.read(len(marca)) == marca:
                    halladas.append(d)
    return halladas


def enlazar(origen: Path, carpeta: Path, archivos: tuple[str, ...]) -> None:
    """Un enlace duro no vuelve a ocupar los GB del video; si no se puede (otra unidad), una copia."""
    for a in archivos:
        try:
            os.link(origen / a, carpeta / a)
        except OSError:
            shutil.copy2(origen / a, carpeta / a)
    print(f"-- {', '.join(archivos)}: ya estaba en {origen} --")


def quitar(carpeta: Path) -> None:
    """Quita el video de la carpeta. Si era un enlace duro a otro episodio, el de allá se queda."""
    for a in ("video.mp4", "video.info.json"):
        (carpeta / a).unlink(missing_ok=True)


def bajar(url: str, carpeta: Path, yt: bool) -> None:
    """Cada intento baja a su carpeta aparte; al final queda el de más altura, el que ya había incluido."""
    intentos = [()] + ([REINTENTO] if yt else [])
    with turno_youtube():
        for i, extra in enumerate(intentos):
            tmp = carpeta / f"bajando-{i}"
            shutil.rmtree(tmp, ignore_errors=True)
            tmp.mkdir()
            if i:
                print("\n-- reintento con el cliente web_embedded de YouTube --")
            # yt-dlp como módulo: el .exe de uv del Python de Sloth no arranca.
            sloth("-m", "yt_dlp", *extra, "-f", "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
                  "--merge-output-format", "mp4", "-o", "video.mp4", "--write-info-json", "--no-progress", url, cwd=tmp)
            if (tmp / "video.mp4").exists() and (not yt or altura(tmp) >= MINIMO):
                break
    hechos = [d for d in carpeta.glob("bajando-*") if (d / "video.mp4").exists() and (d / "video.info.json").exists()]
    mejor = max(hechos, key=altura, default=None)
    if mejor and (not (carpeta / "video.mp4").exists() or altura(mejor) > altura(carpeta)):
        quitar(carpeta)
        for a in ("video.mp4", "video.info.json"):
            (mejor / a).rename(carpeta / a)
    for d in carpeta.glob("bajando-*"):
        shutil.rmtree(d, ignore_errors=True)
    if not (carpeta / "video.mp4").exists():
        sys.exit("yt-dlp no pudo bajar el video (arriba dice por qué). No pruebes otros clientes: acaban en 429.")


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("uso: python fuente.py <url> <carpeta>")
    url, carpeta = sys.argv[1], Path(sys.argv[2]).resolve()
    carpeta.mkdir(parents=True, exist_ok=True)
    video, t = carpeta / "video.mp4", carpeta / "transcripcion.json"
    yt = YOUTUBE.search(url)
    # El de menos de 720p se intenta otra vez: es para lo que se vuelve a correr.
    bajo = bool(yt) and video.exists() and altura(carpeta) < MINIMO
    otras = copias(yt.group(1), carpeta) if yt and (bajo or not (video.exists() and t.exists())) else []
    if not video.exists() or bajo:
        mejor = max((d for d in otras if (d / "video.mp4").exists()), key=altura, default=None)
        if mejor and altura(mejor) >= MINIMO:
            quitar(carpeta)
            enlazar(mejor, carpeta, ("video.mp4", "video.info.json"))
        else:
            bajar(url, carpeta, bool(yt))
    info = json.loads((carpeta / "video.info.json").read_text(encoding="utf8"))
    print(f"{info.get('title')} | {info.get('channel')} | {info.get('upload_date')} | {info.get('duration')} s")
    if yt and (info.get("height") or 0) < MINIMO:
        print(f"\nAVISO: el video quedó en {info.get('height')}p: YouTube frenó la descarga. Sirve para la transcripción, "
              "no para clips ni cuadros. Vuelve a correr fuente.py antes de sacar clips, cuando no haya otro lote bajando: "
              "lo intenta otra vez. Si el original no tiene más resolución, déjalo.\n")

    voz = carpeta / "voz.wav"
    if not t.exists():
        hecha = next((d for d in otras if (d / "transcripcion.json").exists() and (d / "voz.wav").exists()), None)
        if hecha:
            enlazar(hecha, carpeta, tuple(a for a in ("voz.wav", "transcripcion.json") if not (carpeta / a).exists()))
    if not voz.exists():
        wav16k(video, voz)
    if not t.exists():
        d = proceso("transcribir-ajeno.py", [str(voz)], {"modelos": str(MODELOS)})
        t.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf8")
    d = json.loads(t.read_text(encoding="utf8"))
    lineas = [f"[{int(s['start'] // 60)}:{s['start'] % 60:04.1f}] {s['text']}" for s in d["segmentos"]]
    (carpeta / "transcripcion.txt").write_text("\n".join(lineas), encoding="utf8")
    print(f"idioma: {d.get('idioma')}")
    print("\n".join(lineas))


main()
