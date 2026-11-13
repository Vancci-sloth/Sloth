"""
Crea el proyecto de un video en la carpeta `<nombre>`, tal cual (la de la línea `Carpeta:` de Sloth, o
`explicado-<tema>` fuera de Sloth): copia la plantilla de Remotion, la marca (el personaje con sus poses en
public/perro, la foto y la red del cierre: `marca.py aplicar`), enlaza node_modules al que comparten todos los videos
explicativos (espacio.py de video-base: antes cada uno copiaba el suyo, ~1 GB) y,
de skills/modelos-3d/plantilla, el ícono 3D (`Icono3D`, con `comun.tsx`): el protagonista lo elige cada video. Al final empaqueta
el proyecto una vez (render.cjs --empaqueta): el primer empaquetado de un proyecto tarda ~40 s y los siguientes ~10,
así el render de hacer.py no los paga. Al terminar deja `.listo`, que hacer.py espera.

    python -B nuevo.py <nombre> [--formato vertical|horizontal] [--marca <nombre>] [--musica] [--imagenes <con>] [--adjunta <imagen>]…

Va en el directorio actual (Sloth lanza la card en `trabajo/video-explicativo`, y su panel de etapas busca ahí la
carpeta del video); dentro de un proyecto, junto a él. Deja también una voz muda, para que la plantilla se vea en Remotion Studio antes de que llegue la del
usuario.

`--formato` es el de la línea `Formato:` del mensaje (sin ella, vertical): queda en src/datos/formato.json, del que
leen la plantilla (el tamaño y dónde va cada cosa, `ZONA` en src/tema.ts) y final.py. Un video nace en un formato y
no cambia: el otro es otro video. `--marca` es la de la línea `Marca:` (sin ella, la de siempre; ver marca.py).
`--musica`, si el mensaje trae `Música: de fondo`: deja src/datos/musica.json, y final.py le pone música bajo la voz.
`--imagenes`, lo de la línea `Imágenes:`: `chatgpt` o el modelo de Flow («Nano Banana 2.1»). Deja src/datos/imagenes.json,
y hacer.py genera con eso la portada, de fondo mientras hace la voz y el render (portada_ia.py de video-base). Cada
`--adjunta` (las `Imagen adjunta:` del mensaje) se copia a fuentes/adjuntas/: la portada las toma de referencia.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

from marca import aplicar

SKILL = Path(__file__).resolve().parent.parent
MODELOS = SKILL.parent / "modelos-3d" / "scripts" / "modelos.py"


def main() -> None:
    args = sys.argv[1:]
    formato = "vertical"
    if "--formato" in args:
        i = args.index("--formato")
        formato = args[i + 1] if i + 1 < len(args) else ""
        del args[i:i + 2]
    musica = "--musica" in args
    if musica:
        args.remove("--musica")
    imagenes = ""
    if "--imagenes" in args:
        i = args.index("--imagenes")
        imagenes = args[i + 1].strip() if i + 1 < len(args) else ""
        del args[i:i + 2]
        if not imagenes:
            sys.exit(__doc__)
    adjuntas = []
    while "--adjunta" in args:
        i = args.index("--adjunta")
        if i + 1 >= len(args):
            sys.exit(__doc__)
        adjuntas.append(Path(args[i + 1]))
        del args[i:i + 2]
    marca = None
    if "--marca" in args:
        i = args.index("--marca")
        marca = args[i + 1] if i + 1 < len(args) else ""
        del args[i:i + 2]
        if not marca:
            sys.exit(__doc__)
    if len(args) != 1 or formato not in ("vertical", "horizontal"):
        sys.exit(__doc__)
    aqui = Path.cwd()
    # Dentro de un proyecto (tiene package.json), junto a él: si no, saldría un video dentro de otro.
    if (aqui / "package.json").exists():
        aqui = aqui.parent
    destino = aqui / args[0]
    if destino.exists():
        sys.exit(f"{destino} ya existe: usa otro nombre (puede ser de otra sesión haciendo el mismo video).")
    # El modelo de vectores de huellas.py, cargándose ya (~11 s) para cuando se busque si el tema ya se hizo.
    sys.path.insert(0, str(SKILL.parent / "video-base" / "scripts"))
    from espacio import enlazar_modulos
    from sloth import calentar_vectores

    # La carpeta, lo primero: el agente escribe ahí guion.md y momentos.json mientras esto sigue.
    shutil.copytree(SKILL / "plantilla", destino, ignore=shutil.ignore_patterns("__pycache__"))
    calentar_vectores()
    (destino / "src" / "datos" / "formato.json").write_text(json.dumps({"formato": formato}) + "\n", encoding="utf-8", newline="\n")
    if musica:
        (destino / "src" / "datos" / "musica.json").write_text("{}\n", encoding="utf-8", newline="\n")
    if imagenes:
        con = "chatgpt" if imagenes.lower() in ("chatgpt", "codex") else imagenes
        (destino / "src" / "datos" / "imagenes.json").write_text(json.dumps({"con": con}, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    for k, a in enumerate(a for a in adjuntas if a.is_file()):
        (destino / "fuentes" / "adjuntas").mkdir(parents=True, exist_ok=True)
        shutil.copy(a, destino / "fuentes" / "adjuntas" / f"{k + 1}-{a.name}")
    aplicar(destino, marca)
    for d in ("fuentes/voz", "fuentes/datos", "fuentes/logos", "public/logos", "perro/bocas", "revision", "out"):
        (destino / d).mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "10", str(destino / "public" / "voz.wav")], check=True)

    # node_modules: un enlace al que comparten todos los videos de este estilo. La primera vez sale del de un video viejo
    # de la carpeta de la card (todos son de este estilo) o de npm ci.
    vecinos = list(aqui.glob("*/node_modules"))
    enlazar_modulos(destino, "video-explicativo", SKILL / "plantilla", [p for p in vecinos if p.parent != destino])
    # El ícono 3D, que usan casi todos los videos, con lo común de los modelos (modelos-3d/plantilla).
    subprocess.run([sys.executable, "-B", "-X", "utf8", str(MODELOS), "usar", "icono-3d"], cwd=destino, check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["node", str(SKILL / "scripts" / "render.cjs"), "--empaqueta"], cwd=destino, check=True)
    # hacer.py espera esta marca: renderizar mientras esto empaqueta pisaría la caché de webpack.
    (destino / ".listo").write_text("", encoding="utf-8")
    print(f"listo ({formato}): {destino}")


main()
