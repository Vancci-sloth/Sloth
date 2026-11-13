"""
La medida de un documental terminado, contra lo que se midió en las referencias (reference/look.md §3, SKILL.md):

    python -I -B -X utf8 <skill>/scripts/medir.py <video>          (la carpeta del proyecto; sale con 1 si hay algún ✘)

De la edición (work/edicion-datos.json, que deja el director): cuántas veces cambia la imagen por minuto, lo más largo
sin un cambio, cuánto sale la cara y cuánto del tiempo es imagen en movimiento. Del mp4: los negros que no tocan (una
imagen que no cargó sale negra y nada más lo dice) y los cambios que de verdad se ven (un corte a una imagen casi igual
no cuenta). Lo que mide lo pone el director, no momentos.json: un ✘ aquí dice que falta algo en el director, y no
para la entrega de un video.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

# Las referencias van de 60 a 180 imágenes por minuto; el cuerpo de un video largo respira a 1,2–2,0 s por imagen.
CORTES_MIN = 40
LARGO_MAX = 3.0
CARA = (0.195, 0.45)
MOVIMIENTO_MIN = 0.45


def medir(raiz: Path) -> tuple[dict, list[str]]:
    datos = json.loads((raiz / "work" / "edicion-datos.json").read_text(encoding="utf-8"))
    video = raiz / "out" / "final.mp4"
    fallas = []
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", str(video), "-an", "-vf",
                        "blackdetect=d=0.25:pix_th=0.08:pic_th=0.985,select='gt(scene,0.18)',metadata=print:file=-", "-f", "null", "-"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    salida = r.stdout + r.stderr
    vistos = len(re.findall(r"lavfi\.scene_score", salida))
    negros = [(float(a), float(b)) for a, b in re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", salida)]
    esperados = datos.get("negros", [])
    # El primer momento abre desde negro (el mosaico) y cada tarjeta negra lo es a propósito.
    de_mas = [(a, b) for a, b in negros if a > 0.5 and not any(a >= ea - 0.2 and b <= eb + 0.2 for ea, eb in esperados)]
    fin = max(datos["fin"], 1)
    datos["vistos_por_minuto"] = round(vistos / fin * 60, 1)
    datos["negros_de_mas"] = [[round(a, 2), round(b, 2)] for a, b in de_mas]
    if datos["cortes_por_minuto"] < CORTES_MIN:
        fallas.append(f"ritmo: {datos['cortes_por_minuto']:.0f} cambios de imagen por minuto (≥ {CORTES_MIN})")
    if datos["mas_largo"] > LARGO_MAX:
        fallas.append(f"quieto: {datos['mas_largo']:.1f} s sin que cambie la imagen (≤ {LARGO_MAX:g})")
    if not CARA[0] <= datos["cara"] <= CARA[1]:
        fallas.append(f"cara: sale el {datos['cara']:.0%} del tiempo ({CARA[0]:.0%} a {CARA[1]:.0%})")
    if datos["movimiento"] < MOVIMIENTO_MIN:
        fallas.append(f"movimiento: el {datos['movimiento']:.0%} del tiempo es imagen en movimiento (≥ {MOVIMIENTO_MIN:.0%})")
    for a, b in de_mas:
        fallas.append(f"negro: de {a:.1f} a {b:.1f} s la imagen es negra y no toca (¿una imagen que no cargó?)")
    return datos, fallas


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    raiz = Path(sys.argv[1]).resolve()
    datos, fallas = medir(raiz)
    print(f"video {datos['dur']:.1f} s · {datos['cortes_por_minuto']:.0f} cambios/min (se ven {datos['vistos_por_minuto']:.0f}) · "
          f"lo más largo sin cambio {datos['mas_largo']:.1f} s · cara {datos['cara']:.0%} · en movimiento {datos['movimiento']:.0%} · "
          f"{datos['sonidos']} sonidos")
    for f in fallas:
        print("✘ " + f)
    (raiz / "revision").mkdir(exist_ok=True)
    (raiz / "revision" / "medida.json").write_text(json.dumps({**datos, "fallas": fallas, "cortes": None}, ensure_ascii=False, indent=1) + "\n",
                                                   encoding="utf-8", newline="\n")
    sys.exit(1 if fallas else 0)


if __name__ == "__main__":
    main()
