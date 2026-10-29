"""
La interfaz de todos los procesos de `python/procesos`, estrecha y estable.

Los lanza `proceso()` (de `video-base/scripts/sloth.py` o de `video-el-diff/scripts/comun.py`) con el Python de Sloth,
desde esta carpeta, y le pasa por la entrada un JSON con los archivos que tiene que mirar y sus opciones:
`{"files": ["C:/...", ...], "options": {...}}`. El proceso contesta por la salida con un único JSON y sale con 0. Si
falla, sale con 1 y la última línea de su salida de errores dice por qué. Todo lo demás que escriba (avisos de las
bibliotecas) va a la salida de errores, así la salida solo lleva la respuesta. Cuánto lleva lo avisa con `progress`,
en líneas propias de la salida de errores (`@progreso 0.4200`): `proceso()` de sloth.py las lee para decir cuánto falta.
La voz viva (`video-base/scripts/voz_viva.py`) corre los mismos procesos sin lanzarlos y manda esas líneas por su
conexión (`sink`).
"""

import json
import sys
import traceback
from collections.abc import Callable
from typing import Any


PROGRESS = "@progreso"
# Adónde va cada línea de avance; sin nada, a la salida de errores.
sink: Callable[[str], None] | None = None


def progress(fraction: float) -> None:
    """Avisa de cuánto lleva el proceso, de 0 a 1, en la salida de errores."""
    line = f"{PROGRESS} {min(1.0, max(0.0, fraction)):.4f}"
    if sink:
        sink(line)
    else:
        print(line, file=sys.__stderr__, flush=True)


def run(process: Callable[[list[str], dict[str, Any]], Any]) -> None:
    answer = sys.stdout
    # Lo que las bibliotecas impriman no debe mezclarse con la respuesta.
    sys.stdout = sys.stderr
    try:
        request = json.load(sys.stdin)
        result = process(list(request["files"]), dict(request.get("options") or {}))
    except Exception as error:
        traceback.print_exc()
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
    json.dump(result, answer, ensure_ascii=False)
    answer.flush()
