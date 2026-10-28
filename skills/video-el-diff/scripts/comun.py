"""Lo que comparten los scripts: el Python de Sloth y sus procesos, FFmpeg y el espacio de los renders."""

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

# El Python de Sloth, sus modelos, sus procesos, los turnos y FFmpeg son los de video-base (`sloth.py`), que sabe dónde
# los deja la app en cada computadora. Al final de la ruta: los scripts de esta skill ganan a los de igual nombre de la base.
sys.path.append(str(Path(__file__).resolve().parents[2] / "video-base" / "scripts"))
from sloth import (BANDERAS, MODELOS, PROCESOS, ffmpeg, proceso, python_sloth, sloth, turno,  # noqa: E402,F401
                   turno_gpu, turno_youtube, wav16k)


def turno_render():
    """
    Un render a la vez en la máquina. Dos a la vez se reparten el procesador y la tarjeta y tardan más que uno tras
    otro: el 19 de octubre, dos episodios renderizando juntos tardaron 20 min en lo que uno solo hace en 12.
    """
    return turno("render", "Esperando turno: otro episodio está renderizando.")


TEMP = Path(tempfile.gettempdir())
# Un render deja varios GB de temporales; con el disco lleno se cae todo (el render, los agentes y Sloth).
DISCO_MINIMO_GB = 8


def limpiar_temporales(horas: float = 6) -> None:
    """
    Borra de %TEMP% lo que dejan los episodios de antes del render web cuando se cortan, con más de `horas` sin tocar:
    las carpetas `remotion-*` de sus renders y `ed-rev-*` de su revisar.mjs. Remotion no las borra nunca: en el lote del
    7 de octubre fueron 143 carpetas, 18 GB, y llenaron el disco. Los perfiles de Edge los barre chrome.mjs de video-base.
    """
    limite = time.time() - horas * 3600
    for d in [*TEMP.glob("remotion-*"), *TEMP.glob("ed-rev-*")]:
        try:
            if d.is_dir() and d.stat().st_mtime < limite:
                shutil.rmtree(d, ignore_errors=True)
        except OSError:
            pass


def comprobar_disco(raiz: Path, minimo_gb: float = DISCO_MINIMO_GB) -> None:
    """Para antes de renderizar si el disco no aguanta un render. Primero barre los temporales viejos."""
    limpiar_temporales()
    libre = shutil.disk_usage(raiz).free / 1e9
    if libre < minimo_gb:
        raise SystemExit(f"Quedan {libre:.1f} GB libres en el disco y un render deja varios GB de temporales. Con el disco "
                         "lleno se cae todo (el render, los agentes y Sloth). Pide al usuario que libere espacio antes de seguir.")


PLANTILLA = Path(__file__).resolve().parent.parent / "plantilla"


def marca(raiz: Path) -> dict:
    """
    La marca del noticiero (ver «La marca» en el SKILL): la de la carpeta de trabajo, que es la que el usuario cambia; si
    no hay, la que el episodio copió al crearse; si tampoco, la de la plantilla.
    """
    for f in (raiz.parent / "marca.json", raiz / "src" / "marca.json", PLANTILLA / "src" / "marca.json"):
        if f.exists():
            return json.loads(f.read_text(encoding="utf8"))
    return {}


MODULOS = Path(os.environ.get("LOCALAPPDATA") or Path.home() / ".cache") / "video-el-diff" / "modulos"


def _completo(nm: Path) -> bool:
    return (nm / "remotion").is_dir() and (nm / "@remotion" / "cli").is_dir()


def _arbol(lock: bytes) -> dict:
    """Lo que instala un package-lock: sus paquetes sin la raíz (la raíz cambia con package.json, el árbol no siempre)."""
    paquetes = dict(json.loads(lock).get("packages", {}))
    paquetes.pop("", None)
    return paquetes


def _copia_igual(lock: bytes) -> Path | None:
    """
    Un node_modules ya instalado con el mismo árbol: el de otra huella de la carpeta compartida (un package.json que
    solo declaró lo que ya llegaba colgado) o el de un episodio viejo con su copia propia. Copiarlo tarda menos que `npm ci`.
    """
    arbol = _arbol(lock)
    candidatos = [*MODULOS.glob("*/node_modules")]
    for d in (Path.cwd(), Path.cwd().parent):
        candidatos += [nm for nm in d.glob("*/node_modules") if not nm.is_junction()]
    for nm in candidatos:
        l = nm.parent / "package-lock.json"
        if _completo(nm) and l.exists() and _arbol(l.read_bytes()) == arbol:
            return nm
    return None


def _copiar(origen: Path, destino: Path) -> None:
    if os.name != "nt":
        shutil.copytree(origen, destino, symlinks=True)
        return
    # robocopy devuelve 1 cuando copió archivos: no es error (solo >= 8 lo es).
    r = subprocess.run(["robocopy", str(origen), str(destino), "/E", "/MT:16", "/NFL", "/NDL", "/NJH", "/NJS", "/NP"])
    if r.returncode >= 8:
        raise SystemExit(f"robocopy falló ({r.returncode})")


def _compartidos() -> Path:
    """La carpeta node_modules del package-lock de la plantilla. La primera vez la llena; los episodios de un lote esperan su turno."""
    lock = (PLANTILLA / "package-lock.json").read_bytes()
    huella = hashlib.sha1(lock).hexdigest()[:10]
    casa = MODULOS / huella
    nm = casa / "node_modules"
    casa.mkdir(parents=True, exist_ok=True)
    with turno(f"modulos-{huella}", "Esperando: otro episodio está instalando node_modules."):
        if not _completo(nm):
            shutil.rmtree(nm, ignore_errors=True)
            for archivo in ("package.json", "package-lock.json"):
                shutil.copy2(PLANTILLA / archivo, casa / archivo)
            origen = _copia_igual(lock)
            if origen:
                print(f"copiando node_modules de {origen} a {nm} (una sola vez) ...")
                _copiar(origen, nm)
            else:
                print(f"instalando node_modules en {nm} (una sola vez) ...")
                subprocess.run("npm ci", cwd=casa, shell=True, check=True)
    return nm


def enlazar_modulos(raiz: Path) -> None:
    """
    Que el proyecto tenga su `node_modules`: una unión (junction) a la carpeta que comparten todos los episodios con el
    mismo package-lock, en %LOCALAPPDATA%/video-el-diff/modulos/<huella>. Cada copia pesaba 0.93 GB y el lote del 7 de
    octubre llevaba 27. Si alguien la borró para hacer espacio, se vuelve a enlazar sola. Un episodio viejo con su
    propia carpeta completa se queda como está.
    """
    propio = raiz / "node_modules"
    if _completo(propio):
        return
    if propio.is_symlink():
        os.unlink(propio)  # un enlace roto: apunta a una carpeta que ya no está
    elif propio.is_junction():
        os.rmdir(propio)
    elif propio.exists():
        shutil.rmtree(propio)  # una copia a medias
    nm = _compartidos()
    if os.name != "nt":
        os.symlink(nm, propio, target_is_directory=True)
    else:
        # cmd responde en la página de códigos de la consola (OEM), no en UTF-8.
        r = subprocess.run(["cmd", "/c", "mklink", "/J", str(propio), str(nm)], capture_output=True)
        if r.returncode != 0:
            raise SystemExit(f"no se pudo enlazar node_modules: {(r.stdout + r.stderr).decode('oem', errors='replace')}")
    print(f"node_modules -> {nm}")


def sonoridad(archivo: Path) -> dict:
    """
    Sonoridad integrada (`lufs`) y pico real (`pico`, dBTP) con `ebur128`, la medida de las plataformas y la de
    `sonoridad` en ffmpeg.mjs de video-base. Mide lo mismo que `loudnorm` en una vigésima parte del tiempo: 1 s contra
    23 en los 6 min de un episodio (loudnorm sube todo a 192 kHz).
    """
    # -vn: sin él, FFmpeg también decodifica el video (un segundo de cada pasada, para nada).
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-nostats", "-i", str(archivo), "-vn", "-af", "ebur128=peak=true",
                        "-f", "null", "-"], capture_output=True, text=True, encoding="utf8", errors="replace")
    resumen = r.stderr[r.stderr.rfind("Summary:"):]
    i = re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", resumen)
    tp = re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", resumen)
    if r.returncode or not i or not tp:
        raise SystemExit(f"FFmpeg no pudo medir la sonoridad de {archivo}:\n{r.stderr[-2000:]}")
    return {"lufs": float(i[1]), "pico": float(tp[1])}  # float("-inf") vale: es el silencio


LUFS = -14
TOPE = -1.5  # dBTP, medido en el archivo final (ya en AAC)


def masterizar(audio: Path, salida: Path, retraso: int = 0) -> dict:
    """
    Deja el audio de `audio` a -14 LUFS con el pico real por debajo de -1.5 dBTP, medidos en el AAC 256k que escribe en
    `salida` (.m4a). `retraso`: muestras de silencio delante (la portada, que es el primer cuadro). Devuelve
    `{"lufs", "pico"}` medidos en el AAC.

    La mezcla trae picos de sobra (la voz a -19.4 LUFS llega con -3 dBTP): subirla 5 dB sin más los pasaba de 0. Por eso
    un limitador a 192 kHz (ve los picos entre muestras) recorta los picos con margen, y la ganancia, una sola para todo
    el audio (lineal), se ajusta hasta que lo limitado da -14. El AAC sube el pico unas décimas: si se pasa del tope, se
    baja el limitador y se codifica otra vez. Antes medía con loudnorm y codificaba el AAC en cada vuelta: en des-to, 6
    minutos; así, uno, casi todo el AAC (el codificador rápido de FFmpeg tarda 7 s, pero mete más ruido en los agudos).
    Se escribe a un temporal y se renombra al final: uno cortado no queda como bueno.
    """
    ganancia = LUFS - sonoridad(audio)["lufs"]
    limite = TOPE - 1.0
    limitado = salida.with_name(salida.stem + ".limitado.wav")
    temporal = salida.with_name(salida.stem + ".parcial" + salida.suffix)
    try:
        for _ in range(3):
            for _ in range(4):
                ffmpeg("-i", str(audio), "-vn", "-af", f"volume={ganancia:.2f}dB,aresample=192000,alimiter=limit="
                       f"{10 ** (limite / 20):.4f}:attack=1:release=60:level=false,aresample=48000", "-c:a", "pcm_f32le",
                       str(limitado))
                falta = LUFS - sonoridad(limitado)["lufs"]
                if abs(falta) <= 0.1:
                    break
                ganancia += falta  # el limitador se come algo de volumen: se sube lo que falte
            ffmpeg("-i", str(limitado), "-af", f"adelay=delays={retraso}S:all=1" if retraso else "anull", "-c:a", "aac",
                   "-b:a", "256k", str(temporal))
            hecho = sonoridad(temporal)
            if hecho["pico"] <= TOPE:
                break
            limite -= hecho["pico"] - TOPE + 0.1
    finally:
        limitado.unlink(missing_ok=True)
    reemplazar(temporal, salida)
    return hecho


def reemplazar(temporal: Path, destino: Path) -> None:
    """Pone `temporal` en lugar de `destino`. Si Sloth lo tiene abierto (lo sirve al panel), Windows no deja reemplazarlo,
    pero sí apartarlo y borrarlo después."""
    try:
        os.replace(temporal, destino)
    except PermissionError:
        viejo = destino.with_name(destino.name + ".viejo")
        viejo.unlink(missing_ok=True)
        os.replace(destino, viejo)
        os.replace(temporal, destino)
        try:
            viejo.unlink()
        except OSError:
            pass
