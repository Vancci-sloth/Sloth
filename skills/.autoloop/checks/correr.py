"""
Corre un script de la skill como lo corre el agente (`python <skill>/scripts/final.py ...`), pero sin abrir el
Explorador al final: en el banco, cada ronda abriría una ventana. Así el banco no le pide nada a la skill.

    python correr.py <script> [args...]
"""

import runpy
import subprocess
import sys
from pathlib import Path

_run = subprocess.run


def run(cmd, *a, **k):
    if isinstance(cmd, str) and cmd.lstrip().lower().startswith("explorer"):
        return subprocess.CompletedProcess(cmd, 0)
    return _run(cmd, *a, **k)


subprocess.run = run
script = Path(sys.argv[1]).resolve()
sys.argv = [str(script), *sys.argv[2:]]
sys.path.insert(0, str(script.parent))
runpy.run_path(str(script), run_name="__main__")
