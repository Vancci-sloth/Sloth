"""
El video terminado: renderiza, lo comprueba y mide su ritmo. Antes, un borrador para revisarlo entero sin gastar el render
final (en el de Celsius se renderizó tres veces por cosas que el borrador habría enseñado).

    python -B <skill>/scripts/final.py --borrador 1   (desde la raíz del proyecto; luego `--borrador 2`)
    python -B <skill>/scripts/final.py --borrador     (las dos mitades seguidas)
    python -B <skill>/scripts/final.py

Borrador (~1.5 min), en dos mitades para mirar la primera mientras se hace la segunda:
- `--borrador 1`: la primera mitad a media resolución (out/borrador-a.mp4) y su hoja, un cuadro cada 2 s, en
  revision/borrador-1.png.
- `--borrador 2`: la segunda (out/borrador-b.mp4); las junta en out/borrador.mp4, mide su ritmo (medir.py, con el umbral
  de quieto del borrador), deja la hoja de la segunda mitad en revision/borrador-2.png y la revisión de parecido
  (huellas.py parecidos, con ocho cuadros del borrador): revision/parecidos.jpg y la pregunta para el subagente.

Final (~2 min):
1. Renderiza con Remotion (render.cjs, que codifica mientras dibuja) directo a out/<carpeta>.mp4, que es lo que busca
   la etapa «Video» de Sloth: H.264 crf 16 (preset slow), yuv420p y bt709. El 3D va con la tarjeta de video (ANGLE).
   Antes se renderizaba y se volvía a codificar con ffmpeg: medido en el de Celsius, directo tarda 36 s menos y se
   parece más a los cuadros sin comprimir (PSNR 45.7 contra 42.2).
2. Pasa comprobar.mjs de video-base: tamaño, fps, sonoridad, pico, negros, arranque. Si algo sale con ✘, falla.
3. Mide el centro de la pantalla (medir.py): cuánto tiempo está quieto, cuánto se mueve y qué tan lleno está.
4. Guarda su huella con su hoja (huellas.py de video-base): los siguientes videos se comparan con él.
5. Le pone la portada como primer cuadro si ya existe portada.png (PORTADA.md de video-base): un render nuevo no la pierde.
"""

import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
BASE = SKILL.parent / "video-base" / "scripts"


def correr(*cmd: str, **kw) -> None:
    print("›", " ".join(cmd), flush=True)
    subprocess.run(list(cmd), check=True, **kw)


def render(raiz: Path, salida: Path, *opciones: str) -> None:
    print(f"› render.cjs {' '.join(opciones)}", flush=True)
    subprocess.run(["node", str(SKILL / "scripts" / "render.cjs"), str(salida), *opciones], check=True, cwd=raiz)


def duracion(video: Path) -> float:
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
                                capture_output=True, text=True, check=True).stdout)


def borrador(raiz: Path, mitad: str | None) -> None:
    out = raiz / "out"
    video = out / "borrador.mp4"
    (raiz / "revision").mkdir(exist_ok=True)
    # crf 12: con más compresión los cambios chicos se borran y medir.py lo da más quieto de lo que es.
    opciones = ("--scale=0.5", "--crf=12", "--x264-preset=veryfast", "--pixel-format=yuv420p")
    if mitad in (None, "1"):
        render(raiz, out / "borrador-a.mp4", *opciones, "--mitad=1")
        correr("node", str(BASE / "hoja.mjs"), str(out / "borrador-a.mp4"), str(raiz / "revision" / "borrador-1.png"), "--cada", "2")
        if mitad == "1":
            print("\nLanza ya `final.py --borrador 2` en segundo plano y, mientras, mira revision/borrador-1.png entera; "
                  "anota los arreglos y hazlos cuando termine el 2.")
            return
    render(raiz, out / "borrador-b.mp4", *opciones, "--mitad=2")
    lista = out / "borrador.txt"
    lista.write_text("file 'borrador-a.mp4'\nfile 'borrador-b.mp4'\n", encoding="utf8")
    correr("ffmpeg", "-nostdin", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lista), "-c", "copy", str(video))
    correr(sys.executable, "-X", "utf8", str(SKILL / "scripts" / "medir.py"), "--borrador", str(video))
    desde = f"{duracion(out / 'borrador-a.mp4'):.2f}"
    correr("node", str(BASE / "hoja.mjs"), str(video), str(raiz / "revision" / "borrador-2.png"), "--cada", "2", "--desde", desde)
    correr(sys.executable, "-B", "-X", "utf8", str(BASE / "huellas.py"), "parecidos", str(SKILL), str(video))
    print()
    print("Mira las dos hojas enteras: cada momento cuando ya terminó de entrar, nada tapado ni cortado, nada que asome.")


def final(raiz: Path) -> None:
    video = raiz / "out" / f"{raiz.name}.mp4"
    render(raiz, video, "--crf=16", "--x264-preset=slow", "--pixel-format=yuv420p", "--color-space=bt709")
    r = subprocess.run(["node", str(BASE / "comprobar.mjs"), str(video)], capture_output=True, text=True, encoding="utf8")
    print(r.stdout[-1500:])
    if r.returncode != 0 or "✘" in r.stdout:
        sys.exit("comprobar.mjs encontró problemas: arréglalos antes de entregar.")
    correr(sys.executable, "-X", "utf8", str(SKILL / "scripts" / "medir.py"), str(video))
    correr(sys.executable, "-B", "-X", "utf8", str(BASE / "huellas.py"), "cerrar", str(SKILL), str(video))
    portada = raiz / "portada.png"
    if portada.exists():
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
    a = sys.argv[1:]
    if "--borrador" in a:
        mitad = a[a.index("--borrador") + 1] if len(a) > a.index("--borrador") + 1 else None
        if mitad not in (None, "1", "2"):
            sys.exit("--borrador 1, --borrador 2 o --borrador solo.")
        borrador(raiz, mitad)
    else:
        final(raiz)


main()
