"""
Crea el proyecto de un reel, `reel-<nombre>`: copia la plantilla de Remotion, la biblioteca de poses del personaje a
public/personaje (y suma a src/poses.ts las que la plantilla no nombra) y enlaza node_modules al que comparten todos los
reels (espacio.py de video-base).

    python -B nuevo.py <nombre> [--formato vertical|horizontal]

El formato es el de la línea `Formato:` del mensaje (sin ella, vertical): queda en `FORMATO` de src/datos.ts, del que
leen la composición (1080x1920 o 1920x1080) y los scripts.

Va en el directorio actual (Sloth lanza la card en `trabajo/reel-collage`, y su panel de etapas busca ahí la carpeta
del reel); dentro de otro proyecto, junto a él.
"""

import argparse
import re
import shutil
from pathlib import Path

from comun import FORMATOS, SKILL
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


def poner_formato(datos_ts: Path, formato: str) -> None:
    """El formato en `FORMATO` de src/datos.ts: de ahí salen el tamaño de la composición y el de los scripts."""
    texto, n = re.subn(r'(?m)^export const FORMATO = "\w+"', f'export const FORMATO = "{formato}"',
                       datos_ts.read_text(encoding="utf8"))
    if n != 1:
        raise SystemExit(f"No encontré `export const FORMATO = \"...\"` en {datos_ts}.")
    datos_ts.write_text(texto, encoding="utf8", newline="\n")


def main() -> None:
    a = argparse.ArgumentParser(usage=__doc__)
    a.add_argument("nombre")
    a.add_argument("--formato", choices=FORMATOS, default="vertical")
    a = a.parse_args()
    if not (PERSONAJE / "POSES.md").exists():
        raise SystemExit("No hay biblioteca de poses: pídele al usuario sus fotos y su voz (\"El personaje\" en SKILL.md).")
    aqui = Path.cwd()
    # Dentro de un proyecto (tiene package.json, como otro reel), junto a él: si no, saldría un reel dentro de otro.
    if (aqui / "package.json").exists():
        aqui = aqui.parent
    destino = aqui / f"reel-{a.nombre}"
    if destino.exists():
        raise SystemExit(f"{destino} ya existe: usa otro nombre (puede ser de otra sesión haciendo el mismo reel).")
    shutil.copytree(SKILL / "plantilla", destino)
    shutil.copytree(PERSONAJE, destino / "public" / "personaje", ignore=shutil.ignore_patterns("*.md"))
    sumar_poses(destino / "src" / "poses.ts")
    poner_formato(destino / "src" / "datos.ts", a.formato)
    for d in ("public/img", "fuentes/estilo", "fuentes/tema", "fuentes/material", "fuentes/scripts", "revision", "out"):
        (destino / d).mkdir(parents=True, exist_ok=True)

    # La primera vez, del de otro reel viejo: los episodios de El Diff tienen su propia plantilla y sus versiones pueden ser otras.
    vecinos = [p for p in aqui.glob("reel-*/node_modules") if p.parent != destino]
    enlazar_modulos(destino, "reel-collage", SKILL / "plantilla", vecinos)
    print(f"listo ({a.formato}): {destino}")


main()
