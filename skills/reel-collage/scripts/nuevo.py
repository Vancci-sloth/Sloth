"""
Crea el proyecto de un reel, `reel-<nombre>`: copia la plantilla de Remotion, la biblioteca de poses del personaje a
public/personaje (y suma a src/poses.ts las que la plantilla no nombra) y enlaza node_modules al que comparten todos los
reels (espacio.py de video-base).

    python -B nuevo.py <nombre>

Va en el directorio actual (Sloth lanza la card en `trabajo/reel-collage`, y su panel de etapas busca ahí la carpeta
del reel); dentro de otro proyecto, junto a él.
"""

import re
import shutil
import sys
from pathlib import Path

from comun import SKILL
from espacio import enlazar_modulos  # de video-base, que comun.py pone en sys.path

PERSONAJE = SKILL / "personaje"


def sumar_poses(poses_ts: Path) -> None:
    """
    src/poses.ts nombra solo las poses que hay en la biblioteca: las de la plantilla que el usuario no mandó se quitan
    (así `tsc` avisa si el guion pide una que no existe), y las suyas que la plantilla no nombra entran con alto 650.
    """
    hay = {p.stem for p in PERSONAJE.glob("*.png")}
    lineas = poses_ts.read_text(encoding="utf8").splitlines(keepends=True)
    linea = re.compile(r"^\s+(\w+): \{ src:")
    texto = "".join(l for l in lineas if not (m := linea.match(l)) or m.group(1) in hay)
    nombradas = set(re.findall(r"^\s+(\w+): \{ src:", texto, re.M)) | {"cabeza"}
    suyas = "".join(f'  {n}: {{ src: "personaje/{n}.png", alto: 650 }},\n' for n in sorted(hay - nombradas))
    poses_ts.write_text(texto.replace("} as const satisfies", f"{suyas}}} as const satisfies", 1), encoding="utf8", newline="\n")


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    if not (PERSONAJE / "POSES.md").exists():
        sys.exit("No hay biblioteca de poses: pídele al usuario sus fotos y su voz (\"El personaje\" en SKILL.md).")
    aqui = Path.cwd()
    # Dentro de un proyecto (tiene package.json, como otro reel), junto a él: si no, saldría un reel dentro de otro.
    if (aqui / "package.json").exists():
        aqui = aqui.parent
    destino = aqui / f"reel-{sys.argv[1]}"
    if destino.exists():
        sys.exit(f"{destino} ya existe: usa otro nombre (puede ser de otra sesión haciendo el mismo reel).")
    shutil.copytree(SKILL / "plantilla", destino)
    shutil.copytree(PERSONAJE, destino / "public" / "personaje", ignore=shutil.ignore_patterns("*.md"))
    sumar_poses(destino / "src" / "poses.ts")
    for d in ("public/img", "fuentes/estilo", "fuentes/tema", "fuentes/material", "fuentes/scripts", "revision", "out"):
        (destino / d).mkdir(parents=True, exist_ok=True)

    # La primera vez, del de otro reel viejo: los episodios de El Diff tienen su propia plantilla y sus versiones pueden ser otras.
    vecinos = [p for p in aqui.glob("reel-*/node_modules") if p.parent != destino]
    enlazar_modulos(destino, "reel-collage", SKILL / "plantilla", vecinos)
    print(f"listo: {destino}")


main()
