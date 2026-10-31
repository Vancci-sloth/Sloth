"""
El Python de Sloth y sus procesos (yt-dlp, WhisperX), para los scripts de Python de cualquier estilo.

    import sys; sys.path.insert(0, "<base>/scripts")
    from sloth import sloth, proceso, wav16k, MODELOS

Siempre con -E -s -B -X utf8, las mismas banderas de la app: sin -B, Python reescribe sus .pyc, la app cree que el
entorno se dañó y vuelve a bajar 4 GB. Ya pasó dos veces.
"""

import json
import os
import re
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


def _tomar(f) -> bool:
    """El candado del sistema sobre `f`, sin esperar. False si lo tiene otro."""
    try:
        f.seek(0)
        if sys.platform == "win32":
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return True
    except OSError:
        return False


def _soltar(f) -> None:
    f.seek(0)
    if sys.platform == "win32":
        msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
    else:
        fcntl.flock(f.fileno(), fcntl.LOCK_UN)


class _Fila:
    """
    Quién sigue en un turno: el de menor `prioridad` y, entre iguales, el que llegó antes. Sin ella ganaba el primero en
    mirar, y una voz que llegó a las 14:55 pasó por delante de otra de las 14:49 (ADR 0011). Cada uno que espera es un
    archivo en %TEMP%/sloth-<nombre>.fila con su candado puesto: si su proceso muere, el siguiente lo ve suelto y lo quita.
    """

    def __init__(self, nombre: str, prioridad: int):
        carpeta = Path(tempfile.gettempdir()) / f"sloth-{nombre}.fila"
        carpeta.mkdir(exist_ok=True)
        self.ruta = carpeta / f"{prioridad}-{time.time_ns()}-{os.getpid()}"
        self.f = open(self.ruta, "a+b")
        while not _tomar(self.f):  # otro lo está mirando en este instante
            time.sleep(0.05)

    def me_toca(self) -> bool:
        for otro in sorted(self.ruta.parent.iterdir(), key=lambda r: r.name):
            if otro.name >= self.ruta.name:
                return True
            try:
                with open(otro, "r+b") as f:
                    if not _tomar(f):
                        return False
                    _soltar(f)
                otro.unlink()
            except OSError:  # se fue mientras se miraba
                continue
        return True

    def salir(self) -> None:
        self.f.close()
        self.ruta.unlink(missing_ok=True)


@contextmanager
def turno(nombre: str, espera: str, prioridad: int | None = None):
    """
    Uno a la vez en toda la máquina: los procesos de un lote, que empiezan juntos, pasan de uno en uno. El candado es
    del sistema (%TEMP%/sloth-<nombre>.lock): si el proceso muere, se suelta solo. Con `prioridad`, se pasa en orden (`_Fila`).
    """
    fila = _Fila(nombre, prioridad) if prioridad is not None else None
    with open(Path(tempfile.gettempdir()) / f"sloth-{nombre}.lock", "a+b") as f:
        avisado = False
        try:
            while not ((fila is None or fila.me_toca()) and _tomar(f)):
                if not avisado:
                    print(espera, flush=True)
                    avisado = True
                time.sleep(3)
        finally:
            if fila:
                fila.salir()
        try:
            yield
        finally:
            _soltar(f)


def turno_gpu(voz: bool = False):
    """
    WhisperX ocupa unos 3 GB de los 6 de la GPU y el escritorio ya usa 1: dos a la vez no caben. Sin NVIDIA, WhisperX
    transcribe en el procesador (`int8`) y usa todos sus núcleos: tampoco gana nada con dos a la vez. Con `voz`, la que
    grabó el usuario, que tiene a su video esperando, pasa antes que el material de cualquier otro.
    """
    return turno("gpu", "Esperando: otro vídeo está transcribiendo.", 0 if voz else 1)


def turno_youtube():
    """
    YouTube, de uno en uno. En el lote del 8 de octubre bajaron 11 episodios a la vez desde la misma IP: YouTube
    respondió 429 y «Sign in to confirm you're not a bot», y 10 de los 11 vídeos del tema quedaron en 360p.
    """
    return turno("youtube", "Esperando a YouTube: hay otra descarga en curso.")


def _segundos(archivos: list[str]) -> float:
    """Lo que duran los WAV, o 0 si alguno no se puede leer."""
    import wave

    try:
        total = 0.0
        for a in archivos:
            with wave.open(a, "rb") as w:
                total += w.getnframes() / w.getframerate()
        return total
    except (OSError, wave.Error, EOFError):
        return 0.0


def _tiempo(s: float) -> str:
    return f"unos {max(1, round(s / 5) * 5)} s" if s < 90 else f"unos {round(s / 60)} min"


def _anunciar(voz: float, cargado: bool) -> None:
    """
    Dice cuánto tardará en este equipo transcribir `voz` segundos de voz, de lo que midieron las anteriores en
    `equipo.json` (ver `python/procesos/medidas.py`); con Whisper ya cargado (`cargado`), sin la carga.
    """
    medida = {}
    try:
        medida = json.loads((MODELOS.parent / "equipo.json").read_text(encoding="utf-8")).get("voz") or {}
    except (OSError, ValueError):
        pass
    minutos = f"{int(voz // 60)}:{int(voz % 60):02d}"
    carga = 0 if cargado else medida.get("carga", 0)
    estimado = f"; en este equipo, {_tiempo(carga + medida['veces'] * voz)}" if medida.get("veces") else ""
    print(f"Transcribo {minutos} de voz{estimado}.", flush=True)


def _avance(voz: float):
    """Lo que dice cada 10 % cuánto lleva y cuánto falta: en una computadora lenta, sin eso, parecía colgado."""
    inicio = time.time()
    dicho = 0

    def avisar(parte: float) -> None:
        nonlocal dicho
        if voz and parte >= (dicho + 1) / 10 and parte < 1:
            dicho = int(parte * 10)
            falta = (time.time() - inicio) * (1 - parte) / parte
            print(f"Transcribiendo: {dicho * 10} % (faltan {_tiempo(falta)}).", flush=True)

    return avisar


def _correr(nombre: str, entrada: str, voz: float) -> tuple[int, str, str]:
    """Corre el proceso y, si transcribe `voz` segundos de voz, dice antes cuánto tardará y luego cuánto falta."""
    import threading

    if voz:
        _anunciar(voz, cargado=False)
    p = subprocess.Popen([str(python_sloth()), *BANDERAS, nombre], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, encoding="utf8", cwd=PROCESOS)
    errores: list[str] = []
    avisar = _avance(voz)

    def leer() -> None:
        for linea in p.stderr:
            if linea.startswith("@progreso"):
                avisar(float(linea.split()[1]))
            else:
                errores.append(linea)

    hilo = threading.Thread(target=leer, daemon=True)
    hilo.start()
    # Sin communicate(): la salida de errores ya la lee `leer`. El proceso lee toda la entrada antes de contestar.
    p.stdin.write(entrada)
    p.stdin.close()
    salida = p.stdout.read()
    p.wait()
    hilo.join()
    return p.returncode, salida, "".join(errores)


def _aparte(script: Path, registro: Path | None = None) -> subprocess.Popen | None:
    """
    Arranca `script` con el Python de Sloth, suelto de quien lo lanza (sigue vivo cuando este script acaba), con su
    salida en `registro` si se da. None si no se pudo.
    """
    salida = open(registro, "w", encoding="utf-8") if registro else subprocess.DEVNULL
    aparte = dict(close_fds=True, stdin=subprocess.DEVNULL, stdout=salida, stderr=salida)
    try:
        if sys.platform != "win32":
            return subprocess.Popen([str(python_sloth()), *BANDERAS, str(script)], start_new_session=True, **aparte)
        base = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
        for flags in (base | subprocess.CREATE_BREAKAWAY_FROM_JOB, base):
            try:
                return subprocess.Popen([str(python_sloth()), *BANDERAS, str(script)], creationflags=flags, **aparte)
            except OSError:
                continue
        return None
    finally:
        if registro:
            salida.close()


VOZ_VIVA = Path(__file__).resolve().parent / "voz_viva.py"
PUERTO_VOZ = Path(tempfile.gettempdir()) / "sloth-voz.json"
REGISTRO_VOZ = Path(tempfile.gettempdir()) / "sloth-voz.log"
# Los procesos que atiende voz_viva.py.
VOZ_PROCESOS = ("transcribir.py", "transcribir-ajeno.py")
# Lo más que se espera a que cargue: con la máquina muy ocupada, una carga tardó 10 min.
VOZ_ARRANQUE = 15 * 60


def _whisper_en_gpu() -> bool:
    """
    Si aquí transcribe Whisper en una NVIDIA: el Python de Sloth es el de CUDA (`-cu128-`, como `motorDe` de
    server/requisitos.ts). Sin ella, Parakeet carga en 4 s y no hace falta tenerlo cargado.
    """
    if os.environ.get("SLOTH_MOTOR"):
        return False
    try:
        carpeta = python_sloth().relative_to(APPDATA / "youtube" / "piezas" / "python").parts[0]
    except (SystemExit, ValueError):
        return False
    return re.search(r"-cu\d+", carpeta) is not None


def _pedir_voz(pedido: dict, avisar=None) -> dict | None:
    """
    El pedido a Whisper ya cargado (voz_viva.py), pasando a `avisar` cada avance: su respuesta (`{"ok"}` o `{"error"}`),
    o None si no está o se cortó.
    """
    import socket

    try:
        puerto = json.loads(PUERTO_VOZ.read_text(encoding="utf-8"))["puerto"]
        with socket.create_connection(("127.0.0.1", puerto), timeout=10) as c, c.makefile("rwb") as f:
            c.settimeout(None)
            f.write((json.dumps(pedido) + "\n").encode("utf-8"))
            f.flush()
            for linea in f:
                texto = linea.decode("utf-8")
                if not texto.startswith("@progreso"):
                    return json.loads(texto)
                if avisar:
                    avisar(float(texto.split()[1]))
    except (OSError, ValueError, KeyError):
        pass
    return None


def _soltar_voz() -> None:
    """Cierra la voz viva, si está: suelta su Whisper de la tarjeta."""
    _pedir_voz({"salir": True})


def _arrancar_voz() -> bool:
    """Arranca voz_viva.py y lo espera hasta que tiene Whisper cargado. False si no llegó."""
    print("Cargo Whisper una vez; las siguientes voces ya no lo esperan.", flush=True)
    PUERTO_VOZ.unlink(missing_ok=True)
    p = _aparte(VOZ_VIVA, REGISTRO_VOZ)
    limite = time.time() + VOZ_ARRANQUE
    while p and p.poll() is None and time.time() < limite:
        if PUERTO_VOZ.exists() and _pedir_voz({"ping": True}) is not None:
            return True
        time.sleep(1)
    if p and p.poll() is None:
        p.kill()
    return False


def _con_voz_viva(nombre: str, archivos: list[str], opciones: dict, voz: float) -> dict | None:
    """
    El proceso con Whisper ya cargado (voz_viva.py), que arranca si no está. None si no se pudo: entonces va el proceso
    de siempre, que también dice por qué falló, y la voz viva se cierra antes para no ocupar la tarjeta con dos Whisper.
    """
    if _pedir_voz({"ping": True}) is None and not _arrancar_voz():
        print("Whisper no quedó cargado: transcribo con el proceso de siempre.", flush=True)
        return None
    if voz:
        _anunciar(voz, cargado=True)
    r = _pedir_voz({"proceso": nombre, "files": archivos, "options": opciones}, _avance(voz))
    if r is None or "error" in r:
        print(f"Whisper ya cargado falló ({(r or {}).get('error', 'se cortó')}): lo repito con el proceso de siempre.",
              flush=True)
        _soltar_voz()
        return None
    return r["ok"]


def calentar_voz() -> None:
    """
    Deja Whisper cargado antes de que haga falta, con el turno de la GPU: lo lanza Sloth cuando un video empieza a
    trabajar (`server/voz-viva.ts`). Sin NVIDIA no hace nada: Parakeet carga en 4 s.
    """
    if _whisper_en_gpu():
        with turno_gpu():
            if _pedir_voz({"ping": True}) is None:
                _arrancar_voz()


def proceso(nombre: str, archivos: list[str], opciones: dict) -> dict:
    """
    Corre un proceso de Sloth (python/procesos/<nombre>.py): JSON por stdin, JSON en la última línea de stdout. Con una
    NVIDIA, las transcripciones van a Whisper ya cargado (voz_viva.py): cargarlo en cada una tardaba de 36 s a 10 min.
    """
    entrada = json.dumps({"files": archivos, "options": opciones})
    voz = _segundos(archivos) if nombre.startswith("transcribir") else 0
    with turno_gpu(voz=nombre == "transcribir.py"):
        if nombre in VOZ_PROCESOS and _whisper_en_gpu():
            r = _con_voz_viva(nombre, archivos, opciones, voz)
            if r is not None:
                return r
        codigo, salida, errores = _correr(nombre, entrada, voz)
    if codigo != 0:
        raise SystemExit(f"{nombre} falló:\n{errores[-3000:]}")
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
        _aparte(VECTORES_VIVO)


def vectorizar(archivo: str, opciones: dict) -> dict:
    """Como `proceso("vectores.py", [archivo], opciones)`, con el modelo ya cargado si se puede: el primer pedido lo
    arranca y lo espera (hasta 90 s); si no responde, el proceso de siempre."""
    # El Python de Sloth sin torch (Mac con Intel) no tiene vectores: que quien llama compare por palabras sin esperar.
    if "-onnx-" in str(python_sloth()):
        raise SystemExit("este equipo no tiene el modelo de vectores (su Python de Sloth no lleva torch)")
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


if __name__ == "__main__" and sys.argv[1:] == ["calentar-voz"]:
    calentar_voz()
