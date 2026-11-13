"""
El video terminado: renderiza una sola vez, lo comprueba y mide su ritmo. Lo corre hacer.py, después de la voz.

    python -B <skill>/scripts/final.py      (desde la raíz del proyecto)

Final (~2 min):
1. Renderiza con Remotion (render.cjs, que codifica mientras dibuja) directo a out/<carpeta>.mp4, que es lo que busca
   la etapa «Video» de Sloth: H.264 crf 14 (preset veryfast), yuv420p y bt709. El 3D va con la tarjeta de video
   (ANGLE); si va por software, render.cjs lo avisa. Antes iba con slow y crf 16: con 300 cuadros del de Ledger (27 de
   octubre), veryfast con crf 14 se ve igual (SSIM 0,9935 contra 0,9931, contra uno casi sin pérdida), tarda un 30 %
   menos con 6 Chrome y con 2 (el codificador deja de quitarle procesador al dibujo) y pesa un 33 % más.
   Antes se renderizaba y se volvía a codificar con ffmpeg: medido en el de Celsius, directo tarda 36 s menos y se
   parece más a los cuadros sin comprimir (PSNR 45.7 contra 42.2).
   Si el proyecto tiene src/datos/musica.json (nuevo.py --musica, por la línea `Música: de fondo`), le pone música bajo
   la voz sin tocar la imagen (musica.py de video-base): la sintetizada o, con `{"pista": "<ruta>"}`, la del usuario.
2. Pasa comprobar.mjs de video-base: tamaño, fps, sonoridad, pico, negros, arranque. Si algo sale con ✘, falla.
3. Mide el centro de la pantalla (medir.py): cuánto tiempo está quieto, cuánto se mueve y qué tan lleno está; y en
   toda la pantalla, los parpadeos (algo que sale un solo cuadro).
4. Guarda su huella con su hoja (huellas.py de video-base): los siguientes videos se comparan con él.
5. Antes de renderizar, dice qué hizo este video y no está guardado, para guardarlo mientras renderiza: los modelos de src/modelos/ que no están en la biblioteca (modelos-3d) y
   las piezas de src/piezas/ que no están en el kit. Un modelo 3D no se hace dos veces: de los ~46 de los primeros videos
   solo 6 llegaron a la biblioteca, y el del tamal dejó la olla y el metate en src/piezas.
6. En vertical, le pone la portada como primer cuadro si ya existe portada.png (PORTADA.md de video-base): un render
   nuevo no la pierde (hacer.py la hace de su primer cuadro). En horizontal no: su portada.png es la miniatura de YouTube y no entra en el video.

El formato (vertical u horizontal) es el de src/datos/formato.json, que dejó nuevo.py: con él se comprueba el tamaño.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
BASE = SKILL.parent / "video-base" / "scripts"


def horizontal(raiz: Path) -> bool:
    archivo = raiz / "src" / "datos" / "formato.json"
    return archivo.exists() and json.loads(archivo.read_text(encoding="utf-8")).get("formato") == "horizontal"


def correr(*cmd: str, **kw) -> None:
    print("›", " ".join(cmd), flush=True)
    subprocess.run(list(cmd), check=True, **kw)


def render(raiz: Path, salida: Path, *opciones: str) -> None:
    print(f"› render.cjs {' '.join(opciones)}", flush=True)
    subprocess.run(["node", str(SKILL / "scripts" / "render.cjs"), str(salida), *opciones], check=True, cwd=raiz)


def musica(raiz: Path, video: Path) -> None:
    """La música de fondo, si el video la pidió (src/datos/musica.json)."""
    archivo = raiz / "src" / "datos" / "musica.json"
    if not archivo.exists():
        return
    pista = json.loads(archivo.read_text(encoding="utf-8") or "{}").get("pista")
    correr(sys.executable, "-B", "-X", "utf8", str(BASE / "musica.py"), "--poner", str(video), *(["--pista", str(raiz / pista)] if pista else []))


def sin_guardar(raiz: Path) -> list[str]:
    """Lo que el video hizo a mano y no está en la biblioteca de modelos ni en el kit."""
    biblioteca = SKILL.parent / "modelos-3d"
    guardados = {"comun"} | {d.name for carpeta in ("modelos", "plantilla") for d in (biblioteca / carpeta).glob("*") if d.is_dir()}
    kit = {p.stem for p in (SKILL / "plantilla" / "src" / "piezas").glob("*.tsx")}
    faltan = [f"✗ el modelo `{p.stem}`: guárdalo con `modelos.py guardar {p.stem} …` (skill modelos-3d)"
              for p in sorted((raiz / "src" / "modelos").glob("*.tsx")) if p.stem not in guardados]
    for p in sorted((raiz / "src" / "piezas").glob("*.tsx")):
        if p.stem in kit:
            continue
        # Lo 3D se nota en lo que dibuja (`<mesh>` de react-three), aunque no importe three.
        if re.search(r'<(mesh|group|instancedMesh)\b|from "three"|@react-three/', p.read_text(encoding="utf-8")):
            faltan.append(f"✗ `src/piezas/{p.name}` es 3D: cada objeto es un modelo, en src/modelos/<id>.tsx y guardado con "
                          "`modelos.py guardar` (skill modelos-3d)")
        else:
            faltan.append(f"✗ la pieza `{p.stem}`: si sirve a otros videos, `kit.py guardar {p.stem}`")
    return faltan


def final(raiz: Path) -> None:
    video = raiz / "out" / f"{raiz.name}.mp4"
    # Antes del render: mientras renderiza (va en segundo plano) se guarda lo que falta, que no toca el proyecto.
    if faltan := sin_guardar(raiz):
        print("Sin guardar (guárdalo mientras renderiza; lo que solo sirve a este video, díselo al usuario):\n  " + "\n  ".join(faltan), flush=True)
    render(raiz, video, "--crf=14", "--x264-preset=veryfast", "--pixel-format=yuv420p", "--color-space=bt709")
    musica(raiz, video)
    tamano = "1920x1080" if horizontal(raiz) else "1080x1920"
    r = subprocess.run(["node", str(BASE / "comprobar.mjs"), str(video), "--tamano", tamano], capture_output=True, text=True, encoding="utf8")
    print(r.stdout[-1500:])
    if r.returncode != 0 or "✘" in r.stdout:
        sys.exit("comprobar.mjs encontró problemas: arréglalos antes de entregar.")
    correr(sys.executable, "-X", "utf8", str(SKILL / "scripts" / "medir.py"), str(video))
    correr(sys.executable, "-B", "-X", "utf8", str(BASE / "huellas.py"), "cerrar", str(SKILL), str(video))
    portada = raiz / "portada.png"
    if horizontal(raiz):
        if not portada.exists():
            print("Falta la miniatura de YouTube: hazla según «En horizontal» de PORTADA.md de video-base (portada.png, "
                  "1280×720). No va en el video: no corras portada.mjs.")
    elif portada.exists():
        correr("node", str(BASE / "portada.mjs"), str(video), str(portada))
    else:
        print("Falta la portada: hazla según PORTADA.md de video-base y ponla con portada.mjs.")
    print(f"listo: {video}")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    raiz = Path.cwd()
    if not (raiz / "remotion.config.ts").exists():
        sys.exit("Córrelo desde la raíz del proyecto (donde está remotion.config.ts).")
    final(raiz)


main()
