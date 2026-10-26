"""
Junta las imágenes de revisión (revision/bNN_<suf>.jpg) de los beats de src/timeline.json en hojas con el id de cada
beat. Las de beats que ya no existen (de un guion de antes) no entran.

    python hojas.py 95                 todas (revision/hoja_95_N.png)
    python hojas.py 95 b05,b31,b52     solo esos beats, de 4 en 4 en hojas de 2x2 más grandes (revision/hoja_95_sel_N.png)

En vertical, todas van en hojas de 6x2 a 360x640, el tamaño de un celular, y la selección a 540x960; en horizontal, de
4x4 a 480x270 y la selección a 960x540. Revisar en hojas cuesta mucho menos que abrir cada beat suelto.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent


def resumen(b: dict) -> str:
    """
    Lo que el revisor de una hoja necesita de cada beat, en dos renglones: lo que dice la voz y lo que se ve. Va junto a
    la hoja (hoja_95_N.md): guion.json entero pesa unos 250 KB y cada revisor leía todo para mirar doce beats.
    """
    v = b["v"]
    que = [v.get("tipo", "")] + [f"{k}: {v[k]}" for k in ("img", "src", "texto", "fuente", "etiqueta") if isinstance(v.get(k), str)]
    for m in v.get("marcas", []):
        es = " ".join(r["t"] for r in (m.get("es") or {}).get("lineas", []))
        que.append(f"{m.get('tipo', 'marca')} en «{m.get('en', '')}»" + (f", traducida: «{es}»" if es else ""))
    for e in v.get("encima", []):
        que.append(f"{e.get('tipo')} «{e.get('texto') or e.get('img') or ''}» en «{e.get('en', '')}»")
    dice = " ".join(p["t"] for p in b.get("palabras", []))
    return f"- {b['id']} ({b['inicio']:.1f} s): «{dice}»\n  " + " · ".join(q for q in dict.fromkeys(que) if q)  # una marca de varios renglones sale una vez


suf = sys.argv[1] if len(sys.argv) > 1 else "95"
solo = sys.argv[2].split(",") if len(sys.argv) > 2 else None
linea = json.loads((RAIZ / "src" / "timeline.json").read_text(encoding="utf8"))
ids = [b["id"] for b in linea["beats"] if not solo or b["id"] in solo]
fs = [RAIZ / "revision" / f"{i}_{suf}.jpg" for i in ids]
faltan = [i for i, f in zip(ids, fs) if not f.exists()]
if faltan:
    print(f"sin imagen (corre `node revisar.mjs 0.{suf}`): {', '.join(faltan)}")
fs = [f for f in fs if f.exists()]
vertical = linea.get("formato") == "vertical"
if vertical:
    cols, filas, (w, h) = (2, 2, (540, 960)) if solo else (6, 2, (360, 640))
else:
    cols, filas, (w, h) = (2, 2, (960, 540)) if solo else (4, 4, (480, 270))
por_hoja = cols * filas
# Las hojas de una corrida anterior, que con menos beats se quedarían sueltas entre las nuevas.
for vieja in (RAIZ / "revision").glob(f"hoja_{suf}_sel_*.png" if solo else f"hoja_{suf}_[0-9]*.png"):
    vieja.unlink()
    vieja.with_suffix(".md").unlink(missing_ok=True)
for k in range(0, len(fs), por_hoja):
    hoja = Image.new("RGB", (cols * w, filas * h))
    for i, f in enumerate(fs[k: k + por_hoja]):
        im = Image.open(f).resize((w, h))
        d = ImageDraw.Draw(im)
        d.rectangle((0, 0, 48, 16), fill="black")
        d.text((4, 3), f.name.split("_")[0], fill="yellow")
        hoja.paste(im, ((i % cols) * w, (i // cols) * h))
    nombre = RAIZ / "revision" / (f"hoja_{suf}_sel_{k // por_hoja + 1}.png" if solo else f"hoja_{suf}_{k // por_hoja + 1}.png")
    hoja.save(nombre)
    beats = {b["id"]: b for b in linea["beats"]}
    nombre.with_suffix(".md").write_text("\n".join(resumen(beats[f.name.split("_")[0]]) for f in fs[k: k + por_hoja]) + "\n",
                                         encoding="utf8")
    print(nombre.relative_to(RAIZ).as_posix())
