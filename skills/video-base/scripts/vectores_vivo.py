"""
El modelo de vectores de Sloth (multilingual-e5, `python/procesos/vectores.py`) cargado y esperando, para que cada
`huellas.py` no lo cargue otra vez: con el proceso de siempre, buscar o revisar un texto nuevo tarda ~18 s (importar
torch y leer el modelo); aquí, menos de un segundo.

Lo arranca `vectorizar()` de sloth.py la primera vez que hace falta (y `nuevo.py`, al crear un video, para que ya esté
listo). Corre con el Python de Sloth, escucha en un puerto local que anota en %TEMP%/sloth-vectores.json y se cierra
solo tras 10 min sin pedidos. Cada pedido es una línea JSON como la entrada de un proceso de Sloth
(`{"files": [...], "options": {...}}`) y contesta otra con la respuesta de `vectores.process`, o `{"error": "..."}`.

Siempre en el procesador: los pedidos de huellas son pocos textos (vectores.py usa la tarjeta desde 64), y así no
pelea la GPU con WhisperX ni con un render.
"""

import json
import os
import socket
import sys
import tempfile
import time
from pathlib import Path

# Como en sloth.py: los de SLOTH_PROCESOS o, sin ella, los de la app donde vive esta skill.
PROCESOS = Path(os.environ.get("SLOTH_PROCESOS") or Path(__file__).resolve().parents[3] / "python" / "procesos")
PUERTO = Path(tempfile.gettempdir()) / "sloth-vectores.json"
# Ocupa ~1 GB: se va antes de los renders (las búsquedas de un video caen en sus primeros minutos).
INACTIVO = 10 * 60

sys.path.insert(0, str(PROCESOS))
os.chdir(PROCESOS)

import torch  # noqa: E402
import transformers  # noqa: E402

import vectores  # noqa: E402

torch.cuda.is_available = lambda: False

# vectores.encode lee el modelo en cada llamada: aquí se lee una vez y se guarda.
_cargados: dict = {}
for clase in (transformers.AutoModel, transformers.AutoTokenizer):
    original = clase.from_pretrained.__func__

    def una_vez(cls, ruta, *a, _original=original, **kw):
        clave = (cls.__name__, str(ruta))
        if clave not in _cargados:
            _cargados[clave] = _original(cls, ruta, *a, **kw)
        return _cargados[clave]

    clase.from_pretrained = classmethod(una_vez)


def main() -> None:
    servidor = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    servidor.bind(("127.0.0.1", 0))
    servidor.listen(8)
    servidor.settimeout(60)
    # Carga el modelo antes de anunciarse: el primer pedido ya no espera.
    from sloth import MODELOS as modelos
    if vectores.E5.installed(modelos):
        vectores.encode(["query: hola"], vectores.E5.folder(modelos), "cpu")
    temporal = PUERTO.with_suffix(".tmp")
    temporal.write_text(json.dumps({"puerto": servidor.getsockname()[1], "pid": os.getpid()}), encoding="utf-8")
    temporal.replace(PUERTO)
    ultimo = time.time()
    while time.time() - ultimo < INACTIVO:
        try:
            conexion, _ = servidor.accept()
        except socket.timeout:
            continue
        with conexion, conexion.makefile("rwb") as f:
            try:
                pedido = json.loads(f.readline())
                respuesta = vectores.process(pedido["files"], pedido["options"])
            except Exception as e:  # noqa: BLE001
                respuesta = {"error": f"{type(e).__name__}: {e}"}
            f.write((json.dumps(respuesta) + "\n").encode("utf-8"))
            f.flush()
        ultimo = time.time()
    try:
        if json.loads(PUERTO.read_text(encoding="utf-8")).get("pid") == os.getpid():
            PUERTO.unlink()
    except (OSError, ValueError):
        pass


if __name__ == "__main__":
    main()
