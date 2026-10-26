"""
El Python de Sloth y sus procesos (yt-dlp, WhisperX), para los scripts de Python de cualquier estilo.

    import sys; sys.path.insert(0, "<base>/scripts")
    from sloth import sloth, proceso, wav16k, MODELOS

Siempre con -E -s -B -X utf8, las mismas banderas de la app: sin -B, Python reescribe sus .pyc, la app cree que el
entorno se dañó y vuelve a bajar 4 GB. Ya pasó dos veces.
"""

import json
import os
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

if sys.platform == "win32":
    import msvcrt
else:
    import fcntl

sys.stdout.reconfigure(encoding="utf-8")

# Fuera de Windows, Sloth pone APPDATA (scripts/start.mjs); sin Sloth, la misma carpeta que elige él.
APPDATA = Path(os.environ.get("APPDATA") or (Path.home() / "Library" / "Application Support" if sys.platform == "darwin"
                                             else Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config")))
MODELOS = APPDATA / "youtube" / "modelos"
# Los pone Sloth en SLOTH_PROCESOS (también sirve para probar los de otra copia de la app sin tocar la que se usa); sin
# ella, los de la app donde vive esta skill (`<app>/skills/video-base/scripts`, aunque se llame por ~/.claude/skills).
PROCESOS = Path(os.environ.get("SLOTH_PROCESOS") or Path(__file__).resolve().parents[3] / "python" / "procesos")
BANDERAS = ["-E", "-s", "-B", "-X", "utf8"]


def python_sloth() -> Path:
    exe = "python/python.exe" if sys.platform == "win32" else "python/bin/python3"
    raiz = APPDATA / "youtube" / "piezas" / "python"
    candidatos = list(raiz.glob(f"*/{exe}"))
    if not candidatos:
        raise SystemExit(f"No encontré el Python de Sloth en {raiz}")
    # Como `elegirPython` de Sloth (server/requisitos.ts): el que instaló Sloth (`*-sloth`) y, entre iguales, el más nuevo.
    # Si cada uno eligiera otro, Sloth revisaría uno y las skills usarían el otro.
    return max(candidatos, key=lambda p: (p.relative_to(raiz).parts[0].endswith("-sloth"), p.stat().st_mtime))


def sloth(*args: str, **kw) -> subprocess.CompletedProcess:
    return subprocess.run([str(python_sloth()), *BANDERAS, *args], **kw)


@contextmanager
def turno(nombre: str, espera: str):
    """
    Uno a la vez en toda la máquina: los procesos de un lote, que empiezan juntos, pasan de uno en uno. El candado es
    del sistema (%TEMP%/sloth-<nombre>.lock): si el proceso muere, se suelta solo.
    """
    with open(Path(tempfile.gettempdir()) / f"sloth-{nombre}.lock", "a+b") as f:
        avisado = False
        while True:
            try:
                f.seek(0)
                if sys.platform == "win32":
                    msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if not avisado:
                    print(espera, flush=True)
                    avisado = True
                time.sleep(3)
        try:
            yield
        finally:
            f.seek(0)
            if sys.platform == "win32":
                msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)


def turno_gpu():
    """
    WhisperX ocupa unos 3 GB de los 6 de la GPU y el escritorio ya usa 1: dos a la vez no caben. Sin NVIDIA, WhisperX
    transcribe en el procesador (`int8`) y usa todos sus núcleos: tampoco gana nada con dos a la vez.
    """
    return turno("gpu", "Esperando: otro vídeo está transcribiendo.")


def turno_youtube():
    """
    YouTube, de uno en uno. En el lote del 8 de octubre bajaron 11 episodios a la vez desde la misma IP: YouTube
    respondió 429 y «Sign in to confirm you're not a bot», y 10 de los 11 vídeos del tema quedaron en 360p.
    """
    return turno("youtube", "Esperando a YouTube: hay otra descarga en curso.")


def proceso(nombre: str, archivos: list[str], opciones: dict) -> dict:
    """Corre un proceso de Sloth (python/procesos/<nombre>.py): JSON por stdin, JSON en la última línea de stdout."""
    entrada = json.dumps({"files": archivos, "options": opciones})
    with turno_gpu():
        r = sloth(nombre, input=entrada, capture_output=True, text=True, encoding="utf8", cwd=PROCESOS)
    if r.returncode != 0:
        raise SystemExit(f"{nombre} falló:\n{r.stderr[-3000:]}")
    salida = r.stdout
    for marca in ('{"words"', '{"idioma"', '{"n"'):
        i = salida.rfind(marca)
        if i >= 0:
            return json.JSONDecoder().raw_decode(salida[i:])[0]
    raise SystemExit(f"{nombre} no devolvió JSON:\n{salida[-2000:]}")


VECTORES_VIVO = Path(__file__).resolve().parent / "vectores_vivo.py"
PUERTO_VECTORES = Path(tempfile.gettempdir()) / "sloth-vectores.json"


def _pedir_vectores(pedido: dict) -> dict | None:
    """El pedido al modelo ya cargado (vectores_vivo.py), o None si no está."""
    import socket

    try:
        puerto = json.loads(PUERTO_VECTORES.read_text(encoding="utf-8"))["puerto"]
        with socket.create_connection(("127.0.0.1", puerto), timeout=120) as c, c.makefile("rwb") as f:
            f.write((json.dumps(pedido) + "\n").encode("utf-8"))
            f.flush()
            return json.loads(f.readline())
    except (OSError, ValueError, KeyError):
        return None


def calentar_vectores() -> None:
    """Arranca vectores_vivo.py si no está, sin esperarlo (carga el modelo en ~15 s)."""
    if _pedir_vectores({"files": [], "options": {"modo": "ping"}}) is not None:
        return
    with turno("vectores", "Esperando: otro proceso está arrancando el modelo de vectores."):
        if _pedir_vectores({"files": [], "options": {"modo": "ping"}}) is not None:
            return
        PUERTO_VECTORES.unlink(missing_ok=True)
        aparte = dict(close_fds=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if sys.platform != "win32":
            subprocess.Popen([str(python_sloth()), *BANDERAS, str(VECTORES_VIVO)], start_new_session=True, **aparte)
            return
        base = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
        for flags in (base | subprocess.CREATE_BREAKAWAY_FROM_JOB, base):
            try:
                subprocess.Popen([str(python_sloth()), *BANDERAS, str(VECTORES_VIVO)], creationflags=flags, **aparte)
                return
            except OSError:
                continue


def vectorizar(archivo: str, opciones: dict) -> dict:
    """Como `proceso("vectores.py", [archivo], opciones)`, con el modelo ya cargado si se puede: el primer pedido lo
    arranca y lo espera (hasta 90 s); si no responde, el proceso de siempre."""
    pedido = {"files": [archivo], "options": opciones}
    r = _pedir_vectores(pedido)
    if r is None:
        calentar_vectores()
        limite = time.time() + 90
        while r is None and time.time() < limite:
            time.sleep(1)
            if PUERTO_VECTORES.exists():
                r = _pedir_vectores(pedido)
    if r is None or "error" in r:
        return proceso("vectores.py", [archivo], opciones)
    return r


def ffmpeg(*args: str) -> None:
    # -nostdin: dentro de un ciclo de la shell, ffmpeg se come la entrada del ciclo.
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", *args], check=True)


def wav16k(origen: Path, destino: Path) -> None:
    ffmpeg("-i", str(origen), "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(destino))


def transcribir(wav: Path) -> dict:
    """WhisperX sobre un WAV cualquiera: `{"idioma", "segmentos": [{"start", "end", "text"}]}`."""
    v = wav.with_name(wav.stem + ".16k.wav")
    wav16k(wav, v)
    try:
        return proceso("transcribir-ajeno.py", [str(v)], {"modelos": str(MODELOS)})
    finally:
        v.unlink(missing_ok=True)
