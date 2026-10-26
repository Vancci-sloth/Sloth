"""
El disco de los estilos de video: un solo node_modules por plantilla, los temporales que deja Remotion y el espacio
antes de renderizar. Lo usan `video-explicativo`, `video-documental` y `reel-collage` (El Diff tiene lo suyo en su
`comun.py`, igual que esto). Sloth hace lo mismo desde Opciones → Espacio en disco (`server/espacio.ts`): si cambias
dónde vive algo aquí, cámbialo allí.

    from espacio import comprobar_disco, enlazar_modulos, limpiar_temporales
"""

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from sloth import turno

TEMP = Path(tempfile.gettempdir())
# Un render deja varios GB de temporales; con el disco lleno se cae todo (el render, los agentes y Sloth).
DISCO_MINIMO_GB = 8
# Las carpetas node_modules compartidas, una por plantilla y versión de su package-lock.
MODULOS = Path(os.environ.get("LOCALAPPDATA") or Path.home() / ".cache") / "sloth-modulos"
# Las cachés de webpack que se guardan por carpeta de módulos: Remotion hace una nueva (~210 MB) cada vez que cambia su
# configuración y no borra nunca las viejas. En nuevo-12 llegaron a 27 (5.7 GB).
CACHES_QUE_QUEDAN = 2


def limpiar_temporales(horas: float = 6) -> None:
    """
    Borra de %TEMP% lo que dejan los renders con más de `horas` sin tocar: las carpetas `remotion-*` (el proyecto
    empaquetado, con una copia de todo `public/`, y los videos que baja el render) y `ed-rev-*`. Remotion no las borra
    cuando el proceso se corta, y en Windows a veces tampoco al terminar bien: en un día fueron 16, 22 GB.
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
                         "lleno se cae todo (el render, los agentes y Sloth). Pide al usuario que libere espacio (en Sloth: "
                         "Opciones → Espacio en disco) antes de seguir.")


def _completo(nm: Path) -> bool:
    return (nm / "remotion").is_dir() and (nm / "@remotion" / "cli").is_dir()


def _es_enlace(p: Path) -> bool:
    return p.is_symlink() or (hasattr(p, "is_junction") and p.is_junction())


def podar_cache(nm: Path, quedan: int = CACHES_QUE_QUEDAN) -> None:
    """De las cachés de webpack de un node_modules, deja las `quedan` más nuevas de cada tipo y borra las demás."""
    for tipo in (nm / ".cache" / "webpack").glob("remotion-*"):
        variantes = sorted((d for d in tipo.iterdir() if d.is_dir()), key=lambda d: d.stat().st_mtime, reverse=True)
        for d in variantes[quedan:]:
            shutil.rmtree(d, ignore_errors=True)


def _copiar(origen: Path, destino: Path) -> None:
    if os.name != "nt":
        shutil.copytree(origen, destino, symlinks=True)
        return
    # robocopy devuelve 1 cuando copió archivos: no es error (solo >= 8 lo es). Sin .cache: es la del otro proyecto.
    r = subprocess.run(["robocopy", str(origen), str(destino), "/E", "/MT:16", "/XD", str(origen / ".cache"),
                        "/NFL", "/NDL", "/NJH", "/NJS", "/NP"])
    if r.returncode >= 8:
        raise SystemExit(f"robocopy falló ({r.returncode})")


def _arbol(lock: bytes) -> dict:
    """Lo que instala un package-lock: sus paquetes sin la raíz (la raíz cambia con package.json, el árbol no siempre)."""
    paquetes = dict(json.loads(lock).get("packages", {}))
    paquetes.pop("", None)
    return paquetes


def casa_de(estilo: str, plantilla: Path) -> Path:
    """La carpeta compartida de una plantilla: `<estilo>-<huella de su package-lock>`. Sloth la calcula igual."""
    huella = hashlib.sha1((plantilla / "package-lock.json").read_bytes()).hexdigest()[:10]
    return MODULOS / f"{estilo}-{huella}"


def _compartidos(estilo: str, plantilla: Path, vecinos: list[Path]) -> Path:
    """
    El node_modules compartido de la plantilla. La primera vez lo llena: con el de un video viejo del mismo árbol (copiar
    tarda menos que `npm ci`) o, si no hay, con `npm ci`. Los videos de un lote esperan su turno.
    """
    lock = (plantilla / "package-lock.json").read_bytes()
    casa = casa_de(estilo, plantilla)
    nm = casa / "node_modules"
    casa.mkdir(parents=True, exist_ok=True)
    with turno(f"modulos-{casa.name}", "Esperando: otro video está instalando node_modules."):
        if not _completo(nm):
            shutil.rmtree(nm, ignore_errors=True)
            for archivo in ("package.json", "package-lock.json"):
                shutil.copy2(plantilla / archivo, casa / archivo)
            arbol = _arbol(lock)
            origen = next((v for v in vecinos if _completo(v) and not _es_enlace(v) and (v.parent / "package-lock.json").exists()
                           and _arbol((v.parent / "package-lock.json").read_bytes()) == arbol), None)
            if origen:
                print(f"copiando node_modules de {origen.parent.name} a {nm} (una sola vez) ...")
                _copiar(origen, nm)
            else:
                print(f"instalando node_modules en {nm} (una sola vez, tarda unos minutos) ...")
                subprocess.run("npm ci --no-audit --no-fund --loglevel=error", cwd=casa, shell=True, check=True)
        podar_cache(nm)
    return nm


def enlazar_modulos(raiz: Path, estilo: str, plantilla: Path, vecinos: list[Path] = ()) -> None:
    """
    Que el proyecto tenga su `node_modules`: una unión (junction) a la carpeta que comparten todos los videos de la
    plantilla, en %LOCALAPPDATA%/sloth-modulos/<estilo>-<huella>. Antes cada video copiaba el suyo (~1 GB): 14 videos
    explicativos eran 17 GB. Si alguien lo borró para hacer espacio, se vuelve a enlazar. Un video con su propia carpeta
    completa se queda como está (Sloth la cambia por el enlace al liberar espacio, si su package-lock es el mismo).
    `vecinos`: node_modules de otros videos de donde copiarlo la primera vez, en vez de bajarlo.
    """
    propio = raiz / "node_modules"
    if _completo(propio):
        return
    if propio.is_symlink():
        os.unlink(propio)  # un enlace roto: apunta a una carpeta que ya no está
    elif _es_enlace(propio):
        os.rmdir(propio)
    elif propio.exists():
        shutil.rmtree(propio)  # una copia a medias
    nm = _compartidos(estilo, plantilla, list(vecinos))
    if os.name != "nt":
        os.symlink(nm, propio, target_is_directory=True)
    else:
        # cmd responde en la página de códigos de la consola (OEM), no en UTF-8.
        r = subprocess.run(["cmd", "/c", "mklink", "/J", str(propio), str(nm)], capture_output=True)
        if r.returncode != 0:
            raise SystemExit(f"no se pudo enlazar node_modules: {(r.stdout + r.stderr).decode('oem', errors='replace')}")
    print(f"node_modules -> {nm}")
