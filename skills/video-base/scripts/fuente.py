"""
Baja un video (YouTube, X, Instagram) y lo transcribe con WhisperX, con el Python de Sloth.

    python -B fuente.py <url> <carpeta>          p. ej. fuentes/tema  o  fuentes/estilo

Deja en <carpeta>: video.mp4 (hasta 1080p), video.info.json, voz.wav (16 kHz), transcripcion.json y
transcripcion.txt (con [m:ss] por segmento). Imprime título, canal, fecha y la transcripción.

Si otro vídeo ya bajó ese video de YouTube, lo enlaza de ahí en vez de bajarlo (y su transcripción, aunque el video
haya que bajarlo otra vez porque aquella copia quedó en 360p). Los vídeos de un lote bajan de YouTube de uno en uno.

Si YouTube pide "Sign in to confirm you're not a bot" (pasa desde octubre de 2026, y las cookies de Edge no se pueden
descifrar), lo vuelve a intentar con el cliente `web_embedded` de yt-dlp, que da 1080p (como el fuente.py de El Diff), y
si el video no deja insertarse, con `mweb`, que sin PO token solo da 360p: avisa.
"""

import glob
import json
import os
import re
import shutil
import sys
from pathlib import Path

from sloth import MODELOS, PROCESOS, proceso, sloth, turno_youtube, wav16k

YOUTUBE = re.compile(r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|live/|embed/)|youtu\.be/)([\w-]{11})")
# Donde dejan sus fuentes los vídeos: los de las cards de Sloth (`<app>/trabajo/<card>/<vídeo>`, la app de PROCESOS).
PROYECTOS = [(PROCESOS.parents[1] / "trabajo").as_posix() + "/*/*/fuentes"]
# Lo que no sirve para sacar clips ni cuadros: el formato 18 (640x360) que da el cliente mweb.
MINIMO = 720
# Los clientes de YouTube con que se reintenta, en orden. Probar más acabó en 429 el 8 de octubre de 2026.
REINTENTOS = ("web_embedded", "mweb")


def altura(carpeta: Path) -> int:
    return json.loads((carpeta / "video.info.json").read_text(encoding="utf8")).get("height") or 0


def copias(vid: str, carpeta: Path) -> list[Path]:
    """Las carpetas de otros vídeos donde ya está ese video. yt-dlp escribe el `id` primero en su video.info.json, que
    pesa ~2 MB: basta con leer el principio."""
    vistas, halladas, marca = {carpeta}, [], f'{{"id": "{vid}"'.encode()
    for raiz in PROYECTOS:
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


def bajar(url: str, carpeta: Path) -> None:
    # yt-dlp como módulo: el .exe de uv del Python de Sloth no arranca.
    with turno_youtube():
        r = sloth("-m", "yt_dlp", "-f", "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b", "--merge-output-format",
                  "mp4", "-o", "video.mp4", "--write-info-json", "--no-progress", url, cwd=carpeta)
        for cliente in REINTENTOS:
            if r.returncode == 0:
                return
            print(f"\n-- reintento con el cliente {cliente} de YouTube --")
            r = sloth("-m", "yt_dlp", "--extractor-args", f"youtube:player_client={cliente}", "-f", "bv*[height<=1080]+ba/b",
                      "--merge-output-format", "mp4", "-o", "video.mp4", "--write-info-json", "--no-progress", url, cwd=carpeta)
    if r.returncode:
        sys.exit("yt-dlp no pudo bajar el video (arriba dice por qué).")


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    url, carpeta = sys.argv[1], Path(sys.argv[2]).resolve()
    carpeta.mkdir(parents=True, exist_ok=True)
    video, t = carpeta / "video.mp4", carpeta / "transcripcion.json"
    yt = YOUTUBE.search(url)
    otras = copias(yt.group(1), carpeta) if yt and not (video.exists() and t.exists()) else []
    if not video.exists():
        mejor = max((d for d in otras if (d / "video.mp4").exists()), key=altura, default=None)
        if mejor and altura(mejor) >= MINIMO:
            enlazar(mejor, carpeta, ("video.mp4", "video.info.json"))
        else:
            bajar(url, carpeta)
    info = json.loads((carpeta / "video.info.json").read_text(encoding="utf8"))
    print(f"{info.get('title')} | {info.get('channel') or info.get('uploader')} | {info.get('upload_date')} | {info.get('duration')} s")
    if yt and (info.get("height") or 0) < MINIMO:
        print(f"\nAVISO: el video quedó en {info.get('height')}p: YouTube frenó la descarga. Sirve para la transcripción, "
              "no para clips ni cuadros. Bórralo (video.mp4 y video.info.json) y vuelve a correr fuente.py cuando no haya "
              "otro lote bajando; si el original no tiene más resolución, déjalo.\n")

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
