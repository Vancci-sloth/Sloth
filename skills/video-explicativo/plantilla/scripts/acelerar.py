"""
Acerca la voz al ritmo del estilo (224 palabras por minuto): acorta las pausas largas y la acelera un poco.

    python -I -B scripts/acelerar.py <voz.wav> <voz.json de esa voz> [--tempo 1.12] [--pausa 0.18]

Va después de alinear.py: con los tiempos por palabra de esa voz, cada hueco de más de `pausa` segundos se acorta a
`pausa`, cortando solo dentro del tramo callado que mide el propio audio (así no se come el final de una palabra que el
alineador cerró antes de tiempo). Las uniones llevan un fundido de 8 ms. Luego ffmpeg la acelera con `atempo`, que no
cambia el tono.

No vuelve a transcribir: Whisper se salta tramos enteros de una voz rápida. Como se sabe qué se quitó y cuánto se
aceleró, los tiempos de cada palabra se trasladan tal cual. Deja fuentes/voz/rapida.wav, la voz nivelada en
public/voz.wav y src/datos/voz.json con los tiempos nuevos y la boca medida otra vez.
"""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))
from alinear import BASE, nivel_por_cuadro  # noqa: E402

SR = 48000
RESPIRO = 20  # dB bajo la voz: lo que queda debajo (silencio y respiraciones) se puede quitar


def leer(wav: Path) -> np.ndarray:
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-i", str(wav), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()


def pausas(x: np.ndarray, palabras: list[dict], pausa: float) -> list[tuple[int, int]]:
    """Los tramos (en muestras) que se quitan: lo que sobra del silencio más largo de cada hueco entre palabras."""
    paso = SR // 100
    rms = np.sqrt(np.convolve(x**2, np.ones(paso) / paso, mode="same") + 1e-12)
    umbral = np.percentile(rms[rms > 1e-4], 70) * 10 ** (-RESPIRO / 20)
    quitar = []
    for a, b in zip(palabras, palabras[1:]):
        if b["s"] - a["e"] <= pausa + 0.08:
            continue
        i0, i1 = int(a["e"] * SR), int(b["s"] * SR)
        callado = rms[i0:i1] < umbral
        if not callado.any():
            continue
        bordes = np.flatnonzero(np.diff(np.r_[0, callado.astype(np.int8), 0]))
        c0, c1 = max(zip(bordes[::2], bordes[1::2]), key=lambda t: t[1] - t[0])
        sobra = (c1 - c0) / SR - pausa
        if sobra <= 0.03:
            continue
        medio = i0 + (c0 + c1) // 2
        quitar.append((medio - int(sobra * SR / 2), medio + int(sobra * SR / 2)))
    return quitar


def cortar(x: np.ndarray, quitar: list[tuple[int, int]]) -> np.ndarray:
    fundido = int(0.008 * SR)
    rampa = np.linspace(0, 1, fundido, dtype=np.float32)
    trozos, desde = [], 0
    for q0, q1 in [*quitar, (len(x), len(x))]:
        trozo = x[desde:q0].copy()
        if desde:
            trozo[:fundido] *= rampa
        if q0 < len(x):
            trozo[-fundido:] *= rampa[::-1]
        trozos.append(trozo)
        desde = q1
    return np.concatenate(trozos)


def main() -> None:
    opciones = sys.argv[1:]
    tempo = float(opciones[opciones.index("--tempo") + 1]) if "--tempo" in opciones else 1.12
    pausa = float(opciones[opciones.index("--pausa") + 1]) if "--pausa" in opciones else 0.18
    args = [a for k, a in enumerate(opciones) if not a.startswith("--") and (k == 0 or not opciones[k - 1].startswith("--"))]
    if len(args) != 2:
        sys.exit(__doc__)
    entrada, tiempos = Path(args[0]), Path(args[1])
    datos = json.loads(tiempos.read_text(encoding="utf8"))
    x = leer(entrada)
    quitar = pausas(x, datos["palabras"], pausa)
    y = cortar(x, quitar)
    print(f"{len(quitar)} pausas acortadas: {len(x) / SR:.1f} s → {len(y) / SR:.1f} s; con tempo {tempo}: {len(y) / SR / tempo:.1f} s")

    rapida = RAIZ / "fuentes" / "voz" / "rapida.wav"
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
           "-af", f"atempo={tempo}", "-c:a", "pcm_s24le", str(rapida)]
    subprocess.run(cmd, input=y.tobytes(), check=True)
    voz = RAIZ / "public" / "voz.wav"
    subprocess.run(["node", str(BASE / "masterizar.mjs"), str(rapida), str(voz)], check=True)

    # Cada tiempo viejo, menos lo que se quitó antes de él, entre el tempo.
    inicios = np.array([q0 for q0, _ in quitar])
    quitado = np.cumsum([q1 - q0 for q0, q1 in quitar])

    def nuevo(t: float) -> float:
        m = t * SR
        k = int(np.searchsorted(inicios, m, side="right"))
        antes = quitado[k - 1] if k else 0
        if k and m < quitar[k - 1][1]:  # cae dentro de un corte: va al punto de la unión
            antes -= quitar[k - 1][1] - m
        return round(float(m - antes) / SR / tempo, 3)

    datos["palabras"] = [{"w": p["w"], "s": nuevo(p["s"]), "e": nuevo(p["e"])} for p in datos["palabras"]]
    datos["duracion"] = round(len(y) / SR / tempo, 3)
    datos["boca"] = nivel_por_cuadro(voz)
    (RAIZ / "src" / "datos" / "voz.json").write_text(json.dumps(datos, ensure_ascii=False), encoding="utf8")
    n = len(datos["palabras"])
    print(f"{n} palabras en {datos['duracion']} s: {n / datos['duracion'] * 60:.0f} palabras por minuto")


if __name__ == "__main__":
    main()
