"""
La narración con edge-tts (o con una voz de AI Studio), frase por frase y pegada como los jump cuts del reel de
referencia.

    python voz.py [--oir]

Lee `guion.json` de la raíz del proyecto:

    {"voz": "es-MX-JorgeNeural", "rate": "+25%", "antes": 1.5,
     "frases": [{"texto": "lo que dice el guion", "dicho": "como lo pronuncia el TTS", "pausa": 0.6}, ...]}

Con `"studio": "Fola"`, cada frase la genera Sloth en Google AI Studio con esa voz (VOZ.md de video-base) en vez de
edge-tts: AI Studio no da el tiempo de cada palabra, así que se reparte por letras dentro de su frase. Cada frase se
pide aparte y queda en fuentes/voz/fNN.wav: al cambiar el guion, solo se vuelven a pedir las que cambiaron.
`antes` son los segundos en que el clip del gancho suena solo, antes de la primera palabra. `dicho` es opcional (si
falta, se lee `texto`); `pausa` también: segundos de silencio después de la frase. Deja public/voz.wav (48 kHz, nivelado a -12 LUFS) y public/voz.json (inicio y fin de cada
frase y de cada palabra, en segundos). Con --oir la transcribe con WhisperX y la imprime, para comprobar que se
entiende.
"""

import asyncio
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

import edge_tts
import numpy as np

from comun import PROYECTO, ffmpeg

SR = 48000
HUECO = 0.07  # entre frases: el reel corta casi pegado
UMBRAL = 0.012


async def sintetizar(texto: str, voz: str, rate: str, destino: Path) -> list[dict]:
    com = edge_tts.Communicate(texto, voz, rate=rate, boundary="WordBoundary")
    palabras, audio = [], bytearray()
    async for c in com.stream():
        if c["type"] == "audio":
            audio += c["data"]
        elif c["type"] == "WordBoundary":
            palabras.append({"w": c["text"], "a": c["offset"] / 1e7, "b": (c["offset"] + c["duration"]) / 1e7})
    destino.write_bytes(audio)
    return palabras


def pedir(ruta: str, datos: dict | None = None) -> dict:
    url = os.environ.get("SLOTH_URL", "http://127.0.0.1:4848") + ruta
    pedido = urllib.request.Request(url, data=json.dumps(datos).encode() if datos else None, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(pedido, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"AI Studio: {json.load(e).get('error', e)}")


def studio(texto: str, voz: str, destino: Path) -> None:
    """La frase con una voz de AI Studio, que genera Sloth en la cuenta de Google del usuario."""
    t = pedir("/api/voz/generar", {"texto": texto, "voz": voz, "salida": str(destino.resolve())})
    while t["estado"] in ("en-fila", "generando"):
        t = pedir(f"/api/voz/trabajos/{t['id']}?esperar=40")
    if t["estado"] == "error":
        sys.exit(f"AI Studio: {t['error']}")


def repartir(texto: str, a: float, b: float) -> list[dict]:
    """Los tiempos de cada palabra entre `a` y `b`, por cuántas letras tiene."""
    palabras = texto.split()
    pesos = [max(1, len(re.sub(r"\W", "", w))) for w in palabras]
    total, hecho, salida = sum(pesos), 0, []
    for w, p in zip(palabras, pesos):
        salida.append({"w": w, "a": a + (b - a) * hecho / total, "b": a + (b - a) * (hecho + p) / total})
        hecho += p
    return salida


def leer(archivo: Path) -> np.ndarray:
    r = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(archivo), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32)


def niveles(x: np.ndarray) -> tuple[np.ndarray, int]:
    w = int(SR * 0.01)
    n = len(x) // w
    return np.sqrt((x[: n * w].reshape(n, w) ** 2).mean(1)), w


def recorte(x: np.ndarray) -> tuple[int, int]:
    rms, w = niveles(x)
    voz = np.where(rms > UMBRAL)[0]
    return max(0, voz[0] * w - int(SR * 0.03)), min(len(x), (voz[-1] + 1) * w + int(SR * 0.06))


def comprimir(x: np.ndarray, maximo=0.07):
    """Acorta a `maximo` s cada silencio interno: las comas del TTS respiran más que el reel. Devuelve el audio y la
    función que lleva un tiempo del audio original al comprimido."""
    rms, w = niveles(x)
    n = len(rms)
    quedan, cortes, i, quitado, k = [], [], 0, 0, 0
    while k < n:
        if rms[k] > UMBRAL:
            k += 1
            continue
        j = k
        while j < n and rms[j] <= UMBRAL:
            j += 1
        if (j - k) * w > maximo * SR and j < n:
            deja = int(maximo * SR)
            ini, fin = k * w + deja // 2, j * w - deja // 2
            quedan.append(x[i:ini])
            i = fin
            quitado += fin - ini
            cortes.append((ini / SR, fin / SR, quitado / SR))
        k = j
    quedan.append(x[i:])

    def mapa(t: float) -> float:
        antes = 0.0
        for ini, fin, acum in cortes:
            if t >= fin:
                antes = acum
            elif t > ini:
                return round(ini - (acum - (fin - ini)), 3)
        return round(max(0.0, t - antes), 3)
    return np.concatenate(quedan), mapa


def oir(wav: Path) -> None:
    from sloth import transcribir  # el Python de Sloth y WhisperX, de video-base
    d = transcribir(wav)
    print("\nlo que se oye:\n" + " ".join(s["text"].strip() for s in d["segmentos"]))


def main() -> None:
    g = json.loads((PROYECTO / "guion.json").read_text(encoding="utf8"))
    voz, rate, voz_studio = g.get("voz", "es-MX-JorgeNeural"), g.get("rate", "+25%"), g.get("studio")
    tmp = PROYECTO / "fuentes" / "voz"
    tmp.mkdir(parents=True, exist_ok=True)
    antes = float(g.get("antes", 0.0))
    pistas, salida, t = [np.zeros(int(SR * antes), dtype=np.float32)], [], antes
    for i, f in enumerate(g["frases"]):
        dicho = f.get("dicho", f["texto"])
        if voz_studio:
            archivo = tmp / f"f{i:02d}.wav"
            studio(dicho, voz_studio, archivo)
            x = leer(archivo)
            a, b = recorte(x)
            palabras = repartir(dicho, a / SR, b / SR)
        else:
            mp3 = tmp / f"f{i:02d}.mp3"
            palabras = asyncio.run(sintetizar(dicho, voz, rate, mp3))
            x = leer(mp3)
            a, b = recorte(x)
        x, mapa = comprimir(x[a:b])
        largo = len(x) / SR
        salida.append({
            "i": i, "texto": f["texto"], "dicho": f.get("dicho", f["texto"]), "inicio": round(t, 3), "fin": round(t + largo, 3),
            "palabras": [{"w": p["w"], "a": round(t + mapa(p["a"] - a / SR), 3), "b": round(t + mapa(p["b"] - a / SR), 3)} for p in palabras],
        })
        hueco = HUECO + f.get("pausa", 0.0)
        pistas += [x, np.zeros(int(SR * hueco), dtype=np.float32)]
        t += largo + hueco
    audio = np.concatenate(pistas)
    crudo = tmp / "voz_cruda.wav"
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", str(crudo)],
                   input=audio.tobytes(), check=True)
    (PROYECTO / "public").mkdir(exist_ok=True)
    ffmpeg("-i", str(crudo), "-af", "loudnorm=I=-12:TP=-1:LRA=11", "-ar", str(SR), str(PROYECTO / "public" / "voz.wav"))
    dur = len(audio) / SR
    if voz_studio:
        voz, rate = f"AI Studio {voz_studio}", ""
    (PROYECTO / "public" / "voz.json").write_text(json.dumps({"voz": voz, "rate": rate, "duracion": round(dur, 3), "frases": salida},
                                                             ensure_ascii=False, indent=1), encoding="utf8")
    palabras = sum(len(f["texto"].split()) for f in salida)
    print(f"{voz} {rate}: {dur:.2f} s, {palabras / dur:.2f} palabras/s")
    for f in salida:
        print(f"{f['i']:2d} {f['inicio']:6.2f}-{f['fin']:6.2f}  {f['texto']}")
    if "--oir" in sys.argv:
        oir(PROYECTO / "public" / "voz.wav")


main()
