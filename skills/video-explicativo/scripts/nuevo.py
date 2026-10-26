"""
Crea el proyecto de un video en la carpeta `<nombre>`, tal cual (la de la línea `Carpeta:` de Sloth, o
`explicado-<tema>` fuera de Sloth): copia la plantilla de Remotion, la marca (el personaje con sus poses en
public/perro, la foto y la red del cierre: `marca.py aplicar`), enlaza node_modules al que comparten todos los videos
explicativos (espacio.py de video-base: antes cada uno copiaba el suyo, ~1 GB) y,
de la biblioteca de modelos 3D (skills/modelos-3d), la moneda que la plantilla trae de protagonista. Al final empaqueta
el proyecto una vez (render.cjs --empaqueta): el primer empaquetado de un proyecto tarda ~40 s y los siguientes ~10,
así el primer borrador no los paga.

    python -B nuevo.py <nombre>

Va en el directorio actual (Sloth lanza la card en `trabajo/video-explicativo`, y su panel de etapas busca ahí la
carpeta del video); dentro de un proyecto, junto a él. Solo si esa carpeta está en git y git no la ignora, en C:\\dev
(si existe). Deja también una voz muda, para que la plantilla se vea en Remotion Studio antes de que llegue la del
usuario.
"""

import shutil
import subprocess
import sys
from pathlib import Path

from marca import aplicar

SKILL = Path(__file__).resolve().parent.parent
MODELOS = SKILL.parent / "modelos-3d" / "scripts" / "modelos.py"
DEV = Path("C:/dev")


def fuera_de_git(carpeta: Path) -> bool:
    try:
        dentro = subprocess.run(["git", "rev-parse", "--is-inside-work-tree"], cwd=carpeta, capture_output=True).returncode == 0
        ignorada = subprocess.run(["git", "check-ignore", "-q", "."], cwd=carpeta, capture_output=True).returncode == 0
    except FileNotFoundError:  # sin git en la computadora: nada está en git
        return True
    return not dentro or ignorada


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    aqui = Path.cwd()
    # Dentro de un proyecto (tiene package.json), junto a él: si no, saldría un video dentro de otro.
    if (aqui / "package.json").exists():
        aqui = aqui.parent
    raiz = aqui if fuera_de_git(aqui) or not DEV.exists() else DEV
    destino = raiz / sys.argv[1]
    if destino.exists():
        sys.exit(f"{destino} ya existe: usa otro nombre (puede ser de otra sesión haciendo el mismo video).")
    # El modelo de vectores de huellas.py, cargándose ya (~11 s) para cuando se busque si el tema ya se hizo.
    sys.path.insert(0, str(SKILL.parent / "video-base" / "scripts"))
    from espacio import enlazar_modulos
    from sloth import calentar_vectores

    calentar_vectores()
    shutil.copytree(SKILL / "plantilla", destino, ignore=shutil.ignore_patterns("__pycache__"))
    aplicar(destino)
    for d in ("fuentes/voz", "fuentes/datos", "fuentes/logos", "public/logos", "perro/bocas", "revision", "out"):
        (destino / d).mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "10", str(destino / "public" / "voz.wav")], check=True)

    # node_modules: un enlace al que comparten todos los videos de este estilo. La primera vez sale del de un video viejo
    # (en la carpeta de la card todos son de este estilo; en C:\dev, los `explicado-*`) o de npm ci.
    vecinos = [*(raiz.glob("*/node_modules") if raiz != DEV else []), *DEV.glob("explicado-*/node_modules")]
    enlazar_modulos(destino, "video-explicativo", SKILL / "plantilla", [p for p in vecinos if p.parent != destino])
    # La protagonista de la plantilla, de la biblioteca (con los íconos que usa, que salen de node_modules).
    subprocess.run([sys.executable, "-B", "-X", "utf8", str(MODELOS), "usar", "moneda"], cwd=destino, check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["node", str(SKILL / "scripts" / "render.cjs"), "--empaqueta"], cwd=destino, check=True)
    print(f"listo: {destino}")


main()
