"""
Música de fondo libre de derechos, sintetizada aquí mismo: senos, ruido y filtros, sin muestras de nadie (como la de El
Diff, `video-el-diff/plantilla/audio/sintetizar.py`). Un pulso tranquilo de 92 BPM, con pad, bajo, un arpegio suave y
una batería apenas marcada, para ir debajo de una voz sin pelear con ella.

    python -B -X utf8 musica.py <segundos> <salida.wav> [--semilla N]
    python -B -X utf8 musica.py --poner <video.mp4> [--pista <audio>] [--nivel -34]

La primera forma escribe un WAV de 48 kHz, estéreo y 16 bits, del largo pedido, con entrada y salida suaves. Con la
misma semilla y el mismo largo sale igual; si `salida` ya existe con ese largo, no la rehace. Necesita numpy y scipy.

La segunda le pone música bajo la voz a un video, sin tocar la imagen (`-c:v copy`) y en el mismo archivo: la `--pista`
que se le dé (se repite si es corta) o, sin ella, una sintetizada del largo del video junto a él (`<video>.musica.wav`).
Va a `--nivel` LUFS (−34 por omisión: unos 20 LU bajo una voz a −14), se aparta cuando habla la voz
(`sidechaincompress`) y un limitador deja el pico bajo −1 dBTP. Es para quien da el video por terminado en la voz:
corre después del render y antes de `comprobar.mjs`.
"""

import shutil
import subprocess
import sys
import wave
from pathlib import Path

SR = 48000


def _args() -> tuple[float, Path, int]:
    a = sys.argv[1:]
    semilla = int(a[a.index("--semilla") + 1]) if "--semilla" in a else 11
    pos = [x for i, x in enumerate(a) if not x.startswith("--") and (i == 0 or a[i - 1] != "--semilla")]
    if len(pos) != 2:
        sys.exit(__doc__)
    return float(pos[0]), Path(pos[1]), semilla


def duracion_de(video: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def mezclar(video: Path, pista: Path | None, nivel: float) -> None:
    """Mezcla la música bajo la voz de `video` (ver el encabezado). Sin `pista`, la sintetiza."""
    dur = duracion_de(video)
    if pista is None:
        pista = video.with_name(video.stem + ".musica.wav")
        subprocess.run([sys.executable, "-B", "-X", "utf8", str(Path(__file__)), f"{dur:.3f}", str(pista)], check=True)
    filtros = (
        f"[1:a]atrim=0:{dur:.3f},asetpts=N/SR/TB,aresample=48000,aformat=channel_layouts=stereo,"
        f"loudnorm=I={nivel}:TP=-9:LRA=11,aresample=48000,afade=t=in:d=1.5,afade=t=out:st={max(dur - 2.5, 0):.3f}:d=2.5[m];"
        "[0:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[v][sc];"
        "[m][sc]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=400[md];"
        "[v][md]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.85:level=false[a]"
    )
    tmp = video.with_name(video.stem + ".musica-tmp.mp4")
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", str(video), "-stream_loop", "-1", "-i", str(pista),
                    "-filter_complex", filtros, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "320k",
                    "-movflags", "+faststart", str(tmp)], check=True)
    try:
        tmp.replace(video)
    except PermissionError:
        # Sloth tiene el video abierto (lo sirve al panel): en Windows no deja reemplazarlo, pero sí copiar encima.
        shutil.copyfile(tmp, video)
        tmp.unlink()
    print(f"música: {pista.name}, bajo la voz")


def main() -> None:
    if "--poner" in sys.argv:
        a = sys.argv[1:]
        valor = lambda k, d=None: a[a.index(k) + 1] if k in a else d
        mezclar(Path(valor("--poner")), Path(valor("--pista")) if valor("--pista") else None, float(valor("--nivel", -34)))
        return
    duracion, salida, semilla = _args()
    n = int(round(duracion * SR))
    # Si ya está y dura lo mismo, no se rehace (numpy y scipy solos tardan unos segundos en cargar).
    if salida.exists():
        with wave.open(str(salida)) as w:
            if w.getnframes() == n and w.getframerate() == SR:
                print(f"listo (ya estaba): {salida}")
                return

    import numpy as np
    from scipy.io import wavfile
    from scipy.signal import butter, sosfilt

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
        pista[i : i + m] += x[:m] * gan

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

    bpm = 92
    pulso = 60 / bpm
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
    tiempo = np.arange(total) / SR
    aire = filtro(rng.standard_normal(total), "band", [300, 2500]) * 0.01
    mezcla = 0.5 * pads + 0.22 * arpegio + 0.55 * graves + 0.4 * bateria + aire
    mezcla = mezcla[:n]
    tiempo = tiempo[:n]
    # Entrada de 1.5 s y salida de 2.5 s.
    mezcla *= np.minimum(1, tiempo / 1.5) * np.minimum(1, np.maximum(0, (duracion - tiempo) / 2.5))
    izq = mezcla + 0.05 * np.roll(arpegio[:n], 240)
    der = mezcla + 0.05 * np.roll(arpegio[:n], -240)
    x = np.tanh(np.stack([izq, der], axis=1) * 1.1)
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.8
    salida.parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(str(salida), SR, (x * 32767).astype(np.int16))
    print(f"listo: {salida} ({duracion:.1f} s)")


if __name__ == "__main__":
    main()
