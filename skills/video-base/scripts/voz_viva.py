"""
Whisper cargado y esperando, para que cada transcripción con una NVIDIA (`transcribir.py` y `transcribir-ajeno.py` de
python/procesos) no lo cargue otra vez. Con el proceso de siempre, importar torch y WhisperX y cargar el modelo tardó
36 s con la máquina tranquila y de 3 a 10 min con varios videos a la vez (torch/lib son 4 GB que, con la memoria llena,
se vuelven a leer cada vez); transcribir y alinear 6 min de voz ya cargado, 20 s. Aquí se carga una vez (ADR 0008).

Lo arranca `proceso()` de sloth.py la primera vez que hace falta, ya con el turno de la GPU, y lo espera. Corre con el
Python de Sloth, escucha en un puerto local que anota en %TEMP%/sloth-voz.json y se cierra solo tras 10 min sin pedidos
(ocupa unos 2,6 GB de la tarjeta). Cada pedido es una línea JSON, `{"proceso": "transcribir.py", "files", "options"}`;
contesta con las líneas de avance (`@progreso 0.42`) y al final una línea con `{"ok": respuesta}` o `{"error": "..."}`.
`{"salir": true}` lo cierra: lo manda `transcribir-lote.py`, que carga su propio Whisper y con los dos no caben en 6 GB.

No toma el turno de la GPU: lo tiene quien pide, y así atiende de uno en uno.
"""

import gc
import importlib
import json
import os
import socket
import sys
import tempfile
import time
import traceback
from pathlib import Path

# Como en sloth.py: los de SLOTH_PROCESOS o, sin ella, los de la app donde vive esta skill.
PROCESOS = Path(os.environ.get("SLOTH_PROCESOS") or Path(__file__).resolve().parents[3] / "python" / "procesos")
PUERTO = Path(tempfile.gettempdir()) / "sloth-voz.json"
INACTIVO = 10 * 60
PROCESOS_VIVOS = ("transcribir.py", "transcribir-ajeno.py")

sys.path.insert(0, str(PROCESOS))
os.chdir(PROCESOS)
# Lo que las bibliotecas impriman no tiene adónde ir.
sys.stdout = sys.stderr

import interfaz  # noqa: E402
import transcribir  # noqa: E402

transcribir.kept = {}
modulos = {nombre: importlib.import_module(nombre.removesuffix(".py")) for nombre in PROCESOS_VIVOS}


def atender(f, pedido: dict) -> None:
    def avance(linea: str) -> None:
        f.write((linea + "\n").encode("utf-8"))
        f.flush()

    interfaz.sink = avance
    try:
        respuesta = {"ok": modulos[pedido["proceso"]].transcribe(list(pedido["files"]), dict(pedido.get("options") or {}))}
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        respuesta = {"error": f"{type(e).__name__}: {e}"}
    finally:
        interfaz.sink = None
    f.write((json.dumps(respuesta, ensure_ascii=False) + "\n").encode("utf-8"))
    f.flush()


def main() -> None:
    import torch

    servidor = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    servidor.bind(("127.0.0.1", 0))
    servidor.listen(8)
    servidor.settimeout(60)
    # Carga Whisper y el alineador antes de anunciarse: el primer pedido ya no espera.
    from sloth import MODELOS as modelos
    transcribir.load_whisper(modelos, "cuda", [])
    transcribir.load_aligner(modelos, "voxpopuli-es", "cuda")
    temporal = PUERTO.with_suffix(".tmp")
    temporal.write_text(json.dumps({"puerto": servidor.getsockname()[1], "pid": os.getpid()}), encoding="utf-8")
    temporal.replace(PUERTO)
    ultimo = time.time()
    salir = False
    while not salir and time.time() - ultimo < INACTIVO:
        try:
            conexion, _ = servidor.accept()
        except socket.timeout:
            continue
        conexion.settimeout(None)
        with conexion, conexion.makefile("rwb") as f:
            try:
                pedido = json.loads(f.readline())
            except ValueError:
                continue
            if pedido.get("salir"):
                salir = True
                transcribir.kept.clear()
                gc.collect()
                torch.cuda.empty_cache()
                f.write(b'{"ok": true}\n')
                f.flush()
            elif pedido.get("ping"):
                f.write(b'{"ok": true}\n')
                f.flush()
            else:
                atender(f, pedido)
        ultimo = time.time()
    try:
        if json.loads(PUERTO.read_text(encoding="utf-8")).get("pid") == os.getpid():
            PUERTO.unlink()
    except (OSError, ValueError):
        pass


if __name__ == "__main__":
    main()
