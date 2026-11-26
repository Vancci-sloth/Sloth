"""
La voz de un video, para los estilos del motor ([MOTOR.md](../MOTOR.md)): conseguirla y saber en qué segundo dice cada
palabra. Lo usan Low-Poly y Motion Graphics; antes estaba solo en el `hacer.py` de Low-Poly.

    from voz import conseguir, palabras
    conseguir(raiz, args, guion_txt, reloj)   # deja fuentes/voz/original.wav (48 kHz, sin silencio en las puntas)
    ps = palabras(raiz, reloj)                # [{"w": …, "s": 1.23, "e": 1.48}, …], de WhisperX

`args` trae `--studio <Voz>` (la genera AI Studio por la API de VyMotion, la línea `Voz:` del mensaje; ver
[VOZ.md](../VOZ.md)) o `--audio <archivo>` (la que grabó el usuario). Sin ninguna de las dos, se queda con la que ya
haya y, si no hay, lo dice.

Las dos cosas se guardan y no se repiten mientras no cambien: la voz mientras el guion (o el archivo) sea el mismo, y
las palabras mientras la voz sea la misma. Corregir un momento no vuelve a pedir la voz; cambiar el guion, sí.
"""
import hashlib
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

from momentos import guardar

# Sin el silencio largo de las puntas: deja 0,15 s antes de la primera palabra y 0,4 después de la última.
PUNTAS = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,"
          "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.4,areverse")


def huella(*partes) -> str:
    h = hashlib.sha1()
    for p in partes:
        h.update(p if isinstance(p, bytes) else str(p).encode("utf-8"))
    return h.hexdigest()[:16]


def pedir(ruta: str, datos: dict | None = None) -> dict:
    url = os.environ.get("SLOTH_URL", "http://127.0.0.1:4848") + ruta
    pedido = urllib.request.Request(url, data=json.dumps(datos).encode() if datos else None,
                                    headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(pedido, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"✗ AI Studio: {json.load(e).get('error', e)} (si es la cuenta o la cuota, VOZ.md de video-base: «Si falla»)")
    except urllib.error.URLError as e:
        sys.exit(f"✗ VyMotion no contesta en {url}: {e.reason}")


def conseguir(raiz: Path, args: list[str], guion_txt: str, reloj) -> None:
    """fuentes/voz/original.wav (48 kHz, sin el silencio de las puntas), solo si el guion o el audio cambiaron."""
    carpeta = raiz / "fuentes" / "voz"
    carpeta.mkdir(parents=True, exist_ok=True)
    marca = carpeta / "hecha.json"
    antes = json.loads(marca.read_text(encoding="utf-8")) if marca.exists() else {}
    if "--studio" in args:
        nombre = args[args.index("--studio") + 1]
        clave = huella("studio", nombre, guion_txt)
        if antes.get("clave") == clave and (carpeta / "original.wav").exists():
            reloj.paso("voz: la de antes (el guion no cambió)")
            return
        reloj.paso(f"voz de AI Studio ({nombre})…")
        salida = carpeta / "ai-studio.wav"
        t = pedir("/api/voz/generar", {"voz": nombre, "archivo": str((raiz / "guion.md").resolve()),
                                       "salida": str(salida.resolve())})
        while t["estado"] in ("en-fila", "generando"):
            t = pedir(f"/api/voz/trabajos/{t['id']}?esperar=40")
        if t["estado"] == "error":
            sys.exit(f"✗ AI Studio: {t['error']} (VOZ.md de video-base: «Si falla»)")
        audio = salida
    elif "--audio" in args:
        audio = Path(args[args.index("--audio") + 1]).expanduser()
        if not audio.exists():
            sys.exit(f"✗ No encuentro el audio {audio}.")
        clave = huella("audio", audio.stat().st_size, audio.stat().st_mtime_ns, audio.name)
        if antes.get("clave") == clave and (carpeta / "original.wav").exists():
            reloj.paso("voz: la de antes")
            return
        reloj.paso("tu voz…")
    else:
        if not (carpeta / "original.wav").exists():
            sys.exit("✗ Aún no hay voz: corre hacer.py con --studio <Voz> (la línea `Voz:`) o con --audio <archivo> (la del usuario).")
        return
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(audio), "-vn", "-af", PUNTAS, "-ac", "2",
                    "-c:a", "pcm_s16le", "-ar", "48000", str(carpeta / "original.wav")], check=True)
    (carpeta / "palabras.json").unlink(missing_ok=True)
    guardar(marca, {"clave": clave})


def palabras(raiz: Path, reloj) -> list[dict]:
    """Las palabras de la voz con su segundo (WhisperX de VyMotion), guardadas mientras la voz no cambie."""
    carpeta = raiz / "fuentes" / "voz"
    archivo, original = carpeta / "palabras.json", carpeta / "original.wav"
    clave = huella(original.read_bytes())
    if archivo.exists():
        d = json.loads(archivo.read_text(encoding="utf-8"))
        if d.get("clave") == clave:
            return d["palabras"]
    reloj.paso("transcribo la voz…")
    from sloth import MODELOS, proceso, wav16k  # el Python de VyMotion y su WhisperX: solo hace falta aquí
    v16 = carpeta / "voz.16k.wav"
    wav16k(original, v16)
    t = raiz / "terminos.txt"
    terminos = [x.strip() for x in t.read_text(encoding="utf-8").splitlines() if x.strip()] if t.exists() else []
    try:
        d = proceso("transcribir.py", [str(v16)], {"modelos": str(MODELOS), "alineador": "voxpopuli-es",
                                                   "terminos": terminos, "cifras_en_letra": True})
    finally:
        v16.unlink(missing_ok=True)
    ps = [{"w": p["text"], "s": round(p["start"], 3), "e": round(p["end"], 3)} for p in d["words"]]
    if not ps:
        sys.exit("✗ La voz no trae palabras: ¿se oye?")
    guardar(archivo, {"clave": clave, "palabras": ps})
    return ps
