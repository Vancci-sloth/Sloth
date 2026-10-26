"""
Crea el proyecto de un episodio de El Diff en <carpeta actual>/<nombre> a partir de la plantilla de la skill.

    python nuevo.py el-diff-3 --formato vertical|horizontal

El formato es el de la línea `Formato:` del mensaje (sin ella, vertical) y queda en `FORMATO` de `guion.py`. Copia el
motor (Remotion, escenas, scripts, emojis, memes y efectos) y crea las carpetas de trabajo. La marca del noticiero
(`marca.json` de la carpeta actual) va a `src/marca.json`; sin ella, queda la de la plantilla. `node_modules` no se
copia: es una unión a la carpeta que comparten todos los episodios (`enlazar_modulos` de comun.py); en una computadora
nueva, la primera vez se instala (unos minutos).
"""

import argparse
import json
import re
import shutil
from pathlib import Path

from comun import PLANTILLA, enlazar_modulos

CARPETAS = [
    "fuentes/tema", "fuentes/estilo", "fuentes/voz", "fuentes/scripts",
    "fuentes/material/web", "fuentes/material/tuits", "fuentes/material/videos", "fuentes/material/personas",
    "public/web", "public/clips", "public/videos", "public/recortes", "public/voz", "out", "revision",
]

# El comentario que va sobre `FORMATO` en guion.py, según el formato.
FORMATOS = {
    "vertical": "# El episodio va en vertical, 1080x1920, compuesto para el celular: cada escena se dibuja en la zona de 1080x1156 y\n"
                "# `zona()` da rectángulos con esa forma (ver «El lienzo vertical» en ESCENAS.md de la skill).\n",
    "horizontal": "# El episodio va en horizontal, 1920x1080: cada escena llena la pantalla y `zona()` da rectángulos de 16:9 (ver\n"
                  "# «El lienzo horizontal» en ESCENAS.md de la skill).\n",
}


def main() -> None:
    p = argparse.ArgumentParser(description="Crea un episodio en la carpeta actual.")
    p.add_argument("nombre")
    p.add_argument("--formato", choices=FORMATOS, default="vertical")
    a = p.parse_args()
    # Los episodios se crean donde trabaja el agente (en Sloth, trabajo/video-el-diff).
    destino = Path.cwd() / a.nombre
    if destino.exists() and any(destino.iterdir()):
        raise SystemExit(f"{destino} ya existe y no está vacía")
    shutil.copytree(PLANTILLA, destino, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "node_modules", "vivo.js"))
    for c in CARPETAS:
        (destino / c).mkdir(parents=True, exist_ok=True)
    guion = destino / "guion.py"
    texto, n = re.subn(r'(?m)^(?:#.*\n)*FORMATO = "\w+"\n', FORMATOS[a.formato] + f'FORMATO = "{a.formato}"\n',
                       guion.read_text(encoding="utf8"), count=1)
    if not n:
        raise SystemExit("no encontré `FORMATO = ...` en el guion.py de la plantilla")
    guion.write_text(texto, encoding="utf8")
    # El atajo de revisión llama al script de la skill: va con su ruta, que no depende de ~/.claude/skills.
    atajo = destino / "revisar.mjs"
    atajo.write_text(atajo.read_text(encoding="utf8").replace("const SKILL = null;", f"const SKILL = {json.dumps(PLANTILLA.parent.as_posix())};"),
                     encoding="utf8")
    marca = Path.cwd() / "marca.json"
    if marca.exists():
        shutil.copy2(marca, destino / "src" / "marca.json")
    else:
        print("sin marca.json en la carpeta de trabajo: el episodio lleva la marca de la plantilla (El Noticiero)")
    enlazar_modulos(destino)
    print(f"listo ({a.formato}): {destino}")


if __name__ == "__main__":
    main()
