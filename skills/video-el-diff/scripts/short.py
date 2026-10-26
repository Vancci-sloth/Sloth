"""
Prepara el proyecto de un short con el material de su plan (ver SHORTS.md). Se corre en la raíz del short, recién
creado con `nuevo.py`.

    python <skill>/scripts/short.py <ruta del plan> <id>

1. `fuentes/tema` es una unión (junction) a la del plan, y `fuentes/plan`, a todo su `fuentes`: el video del tema, su
   transcripción, las capturas y sus copias se leen de ahí, sin bajar ni capturar nada de nuevo. Lo que el short capture
   va a su propio `fuentes/material`: el plan lo comparten todos los shorts.
2. `public/clips/tema.mp4` es un enlace duro al del plan, que ya viene recodificado: no ocupa disco otra vez.
3. `fuentes/plan-material.md` es el `material.md` del plan con sus rutas `fuentes/...` cambiadas a `fuentes/plan/...`:
   de ahí salen las filas del `material.md` del short, con archivos que existen desde aquí.
4. `short.json` es la entrada de este short en `shorts.json` del plan (su SMP, sus puntos y su gancho), con la ruta del
   plan.
"""

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")


def unir(enlace: Path, destino: Path) -> None:
    """`enlace` apunta a `destino` (una unión de Windows). La carpeta vacía que dejó nuevo.py se quita antes."""
    if enlace.is_junction():
        os.rmdir(enlace)
    elif enlace.exists():
        if any(p.is_file() for p in enlace.rglob("*")):
            sys.exit(f"{enlace} ya tiene archivos: no la reemplazo por la del plan")
        shutil.rmtree(enlace)  # las subcarpetas vacías de nuevo.py
    # cmd responde en la página de códigos de la consola (OEM), no en UTF-8.
    r = subprocess.run(["cmd", "/c", "mklink", "/J", str(enlace), str(destino)], capture_output=True)
    if r.returncode != 0:
        sys.exit(f"no se pudo enlazar {enlace}: {(r.stdout + r.stderr).decode('oem', errors='replace')}")


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("uso: python short.py <ruta del plan> <id>")
    plan, sid = Path(sys.argv[1]).resolve(), sys.argv[2]
    raiz = Path.cwd()
    if not (raiz / "guion.py").exists():
        sys.exit("córrelo en la raíz del proyecto del short (donde está guion.py), después de nuevo.py")
    shorts = json.loads((plan / "shorts.json").read_text(encoding="utf8"))["shorts"]
    mio = next((s for s in shorts if s["id"] == sid), None)
    if not mio:
        sys.exit(f"{plan / 'shorts.json'} no tiene un short «{sid}»: hay {', '.join(s['id'] for s in shorts)}")

    if (plan / "fuentes" / "tema").is_dir():
        unir(raiz / "fuentes" / "tema", plan / "fuentes" / "tema")
    unir(raiz / "fuentes" / "plan", plan / "fuentes")
    tema = plan / "public" / "clips" / "tema.mp4"
    if tema.exists():
        destino = raiz / "public" / "clips" / "tema.mp4"
        destino.parent.mkdir(parents=True, exist_ok=True)
        if not destino.exists():
            os.link(tema, destino)
    else:
        print(f"El plan no dejó {tema}: recodifica el video del tema aquí (paso 2 de la fase 2).")
    if (plan / "material.md").exists():
        filas = re.sub(r"\bfuentes([\\/])", r"fuentes\1plan\1", (plan / "material.md").read_text(encoding="utf8"))
        (raiz / "fuentes" / "plan-material.md").write_text(filas, encoding="utf8")

    (raiz / "short.json").write_text(json.dumps({**mio, "plan": str(plan), "de": len(shorts)}, ensure_ascii=False, indent=1),
                                      encoding="utf8")
    print(f"{sid} de {len(shorts)}: {mio['smp']}")
    for p in mio.get("puntos", []):
        print(f"  - {p}")


if __name__ == "__main__":
    main()
