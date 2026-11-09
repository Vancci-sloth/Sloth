"""
Música de fondo libre de derechos, sintetizada aquí mismo: senos, ruido y filtros, sin muestras de nadie. Un pulso
tranquilo de 92 BPM, con pad, bajo, un arpegio suave y una batería apenas marcada, para ir debajo de una voz sin
pelear con ella. La enciende la línea `Música: de fondo` del mensaje (el menú «Voz» del compositor, en las cards con
`musica`).

    python -B -X utf8 musica.py --poner <video.mp4> [--pista <audio>] [--bajo 10]
    python -B -X utf8 musica.py <segundos> <salida.wav> [--semilla N]

`--poner` le pone música bajo la voz a un video terminado, en el mismo archivo y sin tocar la imagen (`-c:v copy`): la
`--pista` que se le dé (una que el usuario tenga derecho a usar; se repite si es corta) o, sin ella, una sintetizada
del largo del video. Va `--bajo` LU bajo la voz cuando nadie habla (10 por omisión) y se aparta unos 8 dB más cuando
hablan (`sidechaincompress`, con la voz de llave): mientras hablan queda unos 16 dB bajo la voz. Con 14 LU y 4:1
(21 dB bajo la voz, medido en el de minar criptomonedas) casi no se oía. La mezcla la masteriza `masterizar.mjs`
(−14 LUFS, true peak ≤ −1,5 dBTP antes del AAC, que sube unas décimas) y al final se mide el MP4: debe quedar en
−14 LUFS y ≤ −1 dBTP. Corre después del render y antes de `comprobar.mjs`; los temporales van a la carpeta temporal
del sistema, no junto al video.

Siempre se mezcla desde el audio del render, nunca encima del resultado: el MP4 con música lleva la marca
`Sloth: con música` en su pista de audio, y con ella `--poner` no hace nada. Correrlo dos veces da lo mismo; para otra
música, se renderiza otra vez.

La segunda forma solo escribe la música: un WAV de 48 kHz, estéreo y 16 bits, del largo pedido, con entrada y salida
suaves. Con la misma semilla y el mismo largo sale igual. Necesita numpy y scipy.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SR = 48000
MARCA = "Sloth: con música"
AQUI = Path(__file__).resolve().parent


def sintetizar(duracion: float, salida: Path, semilla: int = 11) -> None:
    """Escribe en `salida` la música de `duracion` segundos (ver el encabezado)."""
    import numpy as np
    from scipy.io import wavfile
    from scipy.signal import butter, sosfilt

    n = int(round(duracion * SR))
    rng = np.random.default_rng(semilla)

    def t_(dur: float):
        return np.arange(int(dur * SR)) / SR

    def filtro(x, tipo, f, orden=2):
        return sosfilt(butter(orden, f, btype=tipo, fs=SR, output="sos"), x)

    def nota(midi: float) -> float:
        return 440.0 * 2 ** ((midi - 69) / 12)

    def poner(pista, x, inicio, gan=1.0):
        i = int(inicio * SR)
        if i >= len(pista):
            return
        m = min(len(x), len(pista) - i)
        pista[i:i + m] += x[:m] * gan

    def pad(f, dur):
        t = t_(dur)
        env = np.minimum(1, t / 0.8) * np.minimum(1, np.maximum(0, (dur - t) / 0.9))
        x = sum(np.sin(2 * np.pi * f * d * t + rng.uniform(0, 6.28)) for d in (0.997, 1.0, 1.004))
        return x * env / 3

    def pluck(f, dur):
        t = t_(dur)
        env = np.exp(-t * 6) * (1 - np.exp(-t * 400))
        return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 10)) * env

    def bajo(f, dur):
        t = t_(dur)
        env = np.minimum(1, t * 60) * np.exp(-t * 1.8)
        return np.tanh(1.4 * (np.sin(2 * np.pi * f * t) + 0.2 * np.sin(2 * np.pi * 2 * f * t))) * env

    def bombo():
        t = t_(0.45)
        fase = 2 * np.pi * np.cumsum(48 + 70 * np.exp(-t * 30)) / SR
        return np.sin(fase) * np.exp(-t * 8)

    def chasquido():
        t = t_(0.08)
        return filtro(rng.standard_normal(len(t)), "high", 6000) * np.exp(-t * 60)

    pulso = 60 / 92
    compas = 4 * pulso
    total = n + SR
    # Am9, Fmaj7, Cmaj9, G6: abierto y sin tensión, ni triste ni de anuncio.
    acordes = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 69], [48, 55, 59, 62, 64], [55, 59, 62, 64, 67]]
    raices = [45, 41, 48, 43]
    pads, arpegio, graves, bateria = (np.zeros(total) for _ in range(4))
    k, ch = bombo(), chasquido()
    for c in range(int(duracion / compas) + 2):
        t0 = c * compas
        ac = acordes[c % 4]
        for m in ac[:4]:
            poner(pads, pad(nota(m), compas * 1.05), t0)
        for j in range(8):
            poner(arpegio, pluck(nota(ac[(j * 2) % len(ac)] + 12), pulso * 0.9), t0 + j * pulso / 2, 0.5 if j % 2 else 0.7)
        r = nota(raices[c % 4])
        poner(graves, bajo(r, pulso * 1.6), t0)
        poner(graves, bajo(r, pulso * 1.2), t0 + 2 * pulso, 0.8)
        for b in range(4):
            poner(bateria, k, t0 + b * pulso, 0.9 if b % 2 == 0 else 0.55)
            poner(bateria, ch, t0 + b * pulso + pulso / 2, 0.35)
    pads = filtro(pads, "low", 1800)
    arpegio = filtro(arpegio, "band", [400, 5000])
    bateria = filtro(bateria, "low", 9000)
    aire = filtro(rng.standard_normal(total), "band", [300, 2500]) * 0.01
    mezcla = (0.5 * pads + 0.22 * arpegio + 0.55 * graves + 0.4 * bateria + aire)[:n]
    tiempo = np.arange(n) / SR
    # Entrada de 1.5 s y salida de 2.5 s.
    mezcla *= np.minimum(1, tiempo / 1.5) * np.minimum(1, np.maximum(0, (duracion - tiempo) / 2.5))
    izq = mezcla + 0.05 * np.roll(arpegio[:n], 240)
    der = mezcla + 0.05 * np.roll(arpegio[:n], -240)
    x = np.tanh(np.stack([izq, der], axis=1) * 1.1)
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.8
    salida.parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(str(salida), SR, (x * 32767).astype(np.int16))


def ffmpeg(*args: str) -> str:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *args], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        sys.exit(f"✗ FFmpeg falló:\n{r.stderr[-2000:]}")
    return r.stderr


def sonoridad(archivo: Path) -> tuple[float, float]:
    """LUFS integrados y true peak (dBTP), con `ebur128` como `comprobar.mjs`."""
    err = ffmpeg("-i", str(archivo), "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-")
    resumen = err[err.rfind("Summary:"):]
    i = re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", resumen)
    tp = re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", resumen)
    num = lambda m: float("-inf") if not m or m.group(1) == "-inf" else float(m.group(1))
    return num(i), num(tp)


def pista_de_audio(video: Path) -> dict | None:
    r = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", "-select_streams", "a:0", str(video)],
                       capture_output=True, text=True, encoding="utf-8", check=True)
    datos = json.loads(r.stdout)
    pistas = datos.get("streams") or []
    return {"duracion": float(datos["format"]["duration"]), **pistas[0]} if pistas else None


def reemplazar(tmp: Path, video: Path) -> None:
    try:
        tmp.replace(video)
    except PermissionError:
        # Sloth tiene el video abierto (lo sirve al panel): en Windows no deja reemplazarlo, pero sí copiar encima.
        shutil.copyfile(tmp, video)
        tmp.unlink()


def poner(video: Path, pista: Path | None, bajo: float) -> None:
    """Mezcla la música bajo la voz de `video` (ver el encabezado)."""
    audio = pista_de_audio(video)
    if not audio:
        sys.exit(f"✗ {video.name} no trae audio: la música va bajo la voz.")
    if (audio.get("tags") or {}).get("handler_name") == MARCA:
        print(f"{video.name} ya tiene música: no se pone dos veces (para otra, renderízalo otra vez).")
        return
    dur = audio["duracion"]
    sintetizada = pista is None
    with tempfile.TemporaryDirectory(prefix="sloth-musica-") as d:
        tmp = Path(d)
        voz = tmp / "voz.wav"
        ffmpeg("-v", "error", "-i", str(video), "-map", "0:a:0", "-ar", str(SR), "-ac", "2", "-c:a", "pcm_f32le", str(voz))
        if sintetizada:
            pista = tmp / "musica.wav"
            sintetizar(dur, pista)
        lufs_voz, _ = sonoridad(voz)
        lufs_musica, _ = sonoridad(pista)
        if lufs_voz == float("-inf"):
            sys.exit(f"✗ {video.name} está en silencio: la música va bajo la voz.")
        # Sin voz, `bajo` LU por debajo de ella; cuando hablan, el compresor la baja unos 8 dB más (la voz a −14 LUFS
        # pasa de sobra el umbral de 0,05; con 3:1, quita ~8). La llave es la voz con efectos: también baja con ellos.
        ganancia = lufs_voz - bajo - lufs_musica
        fundidos = "" if sintetizada else f",afade=t=in:d=1.5,afade=t=out:st={max(dur - 2.5, 0):.3f}:d=2.5"
        filtros = (
            f"[1:a]aresample={SR},aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:{dur:.3f},asetpts=N/SR/TB,"
            f"volume={ganancia:.2f}dB{fundidos}[m];"
            "[0:a]asplit=2[v][llave];"
            "[m][llave]sidechaincompress=threshold=0.05:ratio=3:attack=30:release=450:knee=4[md];"
            "[v][md]amix=inputs=2:duration=first:normalize=0[a]"
        )
        mezcla = tmp / "mezcla.wav"
        ffmpeg("-v", "error", "-i", str(voz), "-stream_loop", "-1", "-i", str(pista), "-filter_complex", filtros, "-map", "[a]",
               "-c:a", "pcm_f32le", str(mezcla))
        master = tmp / "master.wav"
        # −1,5 y no −1: el AAC sube el true peak unas décimas.
        r = subprocess.run(["node", str(AQUI / "masterizar.mjs"), str(mezcla), str(master), "--lufs", "-14", "--pico", "-1.5"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode:
            sys.exit(f"✗ masterizar.mjs:\n{r.stdout}{r.stderr}")
        salida = video.with_name(f".{video.stem}.musica.mp4")
        try:
            ffmpeg("-v", "error", "-i", str(video), "-i", str(master), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                   "-c:a", "aac", "-b:a", "320k", "-map_metadata", "0", "-metadata:s:a:0", f"handler_name={MARCA}",
                   "-movflags", "+faststart", str(salida))
            reemplazar(salida, video)
        finally:
            salida.unlink(missing_ok=True)
    lufs, pico = sonoridad(video)
    print(f"música: {'sintetizada' if sintetizada else pista.name}, {bajo:g} LU bajo la voz → {lufs:.1f} LUFS, "
          f"pico {pico:.1f} dBTP")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    a = sys.argv[1:]

    def valor(k: str) -> str | None:
        if k not in a:
            return None
        i = a.index(k)
        if i + 1 >= len(a):
            sys.exit(__doc__)
        v = a[i + 1]
        del a[i:i + 2]
        return v

    video, pista, bajo, semilla = valor("--poner"), valor("--pista"), valor("--bajo"), valor("--semilla")
    if video:
        if a or not Path(video).is_file() or (pista and not Path(pista).is_file()):
            sys.exit(__doc__)
        poner(Path(video).resolve(), Path(pista).resolve() if pista else None, float(bajo or 10))
        return
    if len(a) != 2:
        sys.exit(__doc__)
    sintetizar(float(a[0]), Path(a[1]), int(semilla or 11))
    print(f"listo: {a[1]} ({float(a[0]):.1f} s)")


if __name__ == "__main__":
    main()
