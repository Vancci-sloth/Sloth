"""
Lo que tarda la voz en esta computadora, para decir cuánto falta (`proceso()` de video-base/scripts/sloth.py) y
enseñarlo en Opciones → Tu equipo (`server/equipo.ts`). Va en `equipo.json`, junto a la carpeta de los modelos
(`%APPDATA%/youtube/equipo.json`), con lo que mide cada transcripción:

    {"voz": {"motor": "parakeet", "veces": 0.21, "carga": 4.1, "fecha": "2026-10-27"}, "render": {...}}

`veces` es lo que tarda cada segundo de voz, sin la carga; con el mismo motor se promedia con lo anterior, para que una
vez con la máquina ocupada no lo mueva todo. Lo del render lo escribe el render de cada estilo (`render.cjs`).
"""

import json
import os
import time
from pathlib import Path


def path(models: Path) -> Path:
    return Path(models).parent / "equipo.json"


def read(models: Path) -> dict:
    try:
        return json.loads(path(models).read_text(encoding="utf8"))
    except (OSError, ValueError):
        return {}


def note_voice(models: Path, engine: str, seconds: float, voice: float, load: float, fresh: bool = False) -> None:
    """
    Apunta una transcripción: `seconds` de trabajo para `voice` segundos de voz, y `load` de cargar el motor. `fresh`
    (lo que mide `medir.py`) reemplaza lo de antes en vez de promediarse.
    """
    if voice < 5:
        return
    data = read(models)
    times = seconds / voice
    before = data.get("voz") or {}
    if before.get("motor") == engine and not fresh:
        times = (before["veces"] + times) / 2
        load = (before.get("carga", load) + load) / 2
    data["voz"] = {"motor": engine, "veces": round(times, 3), "carga": round(load, 1), "fecha": time.strftime("%Y-%m-%d")}
    target = path(models)
    temp = target.with_name(f"{target.name}.{os.getpid()}.tmp")
    try:
        temp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf8")
        os.replace(temp, target)
    except OSError:
        temp.unlink(missing_ok=True)
