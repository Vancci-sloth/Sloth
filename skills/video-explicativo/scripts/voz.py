"""
La voz del video de principio a fin, en un comando que va en segundo plano: mientras corre (~1.5 min) se escribe el
mundo, que no la necesita (los tiempos `en("…")` se leen de src/datos/voz.json al dibujar).

    python -B -X utf8 <skill>/scripts/voz.py --studio <Voz>     la genera Sloth en AI Studio con guion.md (VOZ.md de video-base)
    python -B -X utf8 <skill>/scripts/voz.py <audio>            la que mandó el usuario (m4a, mp3, ogg, un video…)
    python -B -X utf8 <skill>/scripts/voz.py --frases           subtitulos.txt cambió: empareja otra vez y acelera (segundos)

Desde la raíz del proyecto. Hace en orden: (con --studio) pide la voz a Sloth y la espera; la pasa a
fuentes/voz/original.wav sin el silencio de las puntas; alinear.py (la nivela, la transcribe y empareja los subtítulos)
y acelerar.py (al ritmo del estilo). Deja public/voz.wav y src/datos/voz.json. Antes eran cuatro o cinco llamadas del
agente y una espera a ciegas (en el de estafas, `sleep 60`); ahora avisa al terminar.

Sale con 1 si algo falla, y repite los ⚠ de alinear.py (palabras seguidas que faltan: pregúntale al usuario).
"""

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path.cwd()
VOZ = RAIZ / "fuentes" / "voz"


def pedir(ruta: str, datos: dict | None = None) -> dict:
    url = os.environ.get("SLOTH_URL", "http://127.0.0.1:4848") + ruta
    pedido = urllib.request.Request(url, data=json.dumps(datos).encode() if datos else None, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(pedido, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"✗ AI Studio: {json.load(e).get('error', e)} (si es la cuenta o la cuota, VOZ.md de video-base: «Si falla»)")
    except urllib.error.URLError as e:
        sys.exit(f"✗ Sloth no contesta en {url}: {e.reason}")


def studio(voz: str) -> Path:
    """La pide a Sloth, que la genera en AI Studio con la cuenta de Google del usuario, y la espera."""
    salida = VOZ / "ai-studio.wav"
    t = pedir("/api/voz/generar", {"voz": voz, "archivo": str((RAIZ / "guion.md").resolve()), "salida": str(salida.resolve())})
    while t["estado"] in ("en-fila", "generando"):
        t = pedir(f"/api/voz/trabajos/{t['id']}?esperar=40")
    if t["estado"] == "error":
        sys.exit(f"✗ AI Studio: {t['error']} (VOZ.md de video-base: «Si falla»)")
    print(f"voz de AI Studio: {t.get('segundos')} s, {t.get('voz')}, {t.get('palabras')} palabras", flush=True)
    return salida


def correr(que: str, *cmd: str) -> str:
    r = subprocess.run(list(cmd), capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=RAIZ)
    if r.returncode:
        sys.exit(f"✗ {que}:\n{(r.stderr or r.stdout).strip()[-1500:]}")
    return r.stdout


def preparar() -> None:
    """alinear.py y acelerar.py, con lo que importa de lo que dicen."""
    py = [sys.executable, "-I", "-B", "-X", "utf8"]
    original = VOZ / "original.wav"
    if len(sys.argv) > 1 and sys.argv[1] == "--frases":
        out = correr("alinear.py", *py, "scripts/alinear.py", "--frases")
    else:
        out = correr("alinear.py", *py, "scripts/alinear.py", str(original))
    for l in out.splitlines():
        if "⚠" in l or "✗" in l:
            print(l)
    print(correr("acelerar.py", *py, "scripts/acelerar.py", str(original), str(VOZ / "voz-lenta.json")).strip().splitlines()[-1])


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if not (RAIZ / "remotion.config.ts").exists():
        sys.exit("Córrelo desde la raíz del proyecto (donde está remotion.config.ts).")
    a = sys.argv[1:]
    inicio = time.time()
    if a == ["--frases"]:
        preparar()
    else:
        if len(a) == 2 and a[0] == "--studio":
            audio = studio(a[1])
        elif len(a) == 1 and not a[0].startswith("--"):
            audio = Path(a[0])
        else:
            sys.exit(__doc__)
        VOZ.mkdir(parents=True, exist_ok=True)
        # Sin el silencio largo de las puntas: deja 0.15 s antes de la primera palabra y 0.25 después de la última.
        puntas = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,"
                  "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.25,areverse")
        correr("ffmpeg", "ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(audio), "-vn", "-af", puntas, "-c:a", "pcm_s16le", "-ar", "48000",
               str(VOZ / "original.wav"))
        preparar()
    datos = json.loads((RAIZ / "src" / "datos" / "voz.json").read_text(encoding="utf-8"))
    # Cada palabra con el segundo en que empieza: para elegir las de `en("…")` sin abrir voz.json.
    print(" ".join(f"{p['w']}@{p['s']:.1f}" for p in datos["palabras"]))
    print(f"✓ voz lista en {time.time() - inicio:.0f} s: {len(datos['palabras'])} palabras, {datos['duracion']:.1f} s "
          "(public/voz.wav, src/datos/voz.json).")


main()
