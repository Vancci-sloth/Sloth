"""sonido.py — el sonido entero del video: la voz (o la premezcla de voz y cama) más las pistas de efectos.

    python -I -B -X utf8 <skill>/scripts/sonido.py <base.wav> <sfx-cues.txt> <salida.wav> [--dur 46.4]

Lo llama `build.py` al final de cada armado (`mezclar()`), así el monitor en vivo de Sloth suena igual que el render:
`public/sonido.wav` es la única pista de audio del proyecto de Remotion.

sfx-cues.txt lo escriben los dispositivos (Comp.write_cues); una pista por línea:
    <time>  <sound>  <gain>
  time  = when the FILE starts, in seconds. The devices already pre-roll each cue by its
          transient, so the click lands on the frame the picture changes. Don't hand-edit.
  sound = a name under <skill>/sfx/ without the extension (ev1kit/click_3, ev1/tick),
          or a path to any audio file.
  gain  = linear volume.
'#' lines and blank lines are skipped.

The audio is rebuilt at 48 kHz stereo: the base (voice + bed) plus every cue, through a peak
limiter at -1 dBFS (no auto-levelling). Sale en WAV de 16 bits, que el navegador reproduce seguro. El nivel final para
YouTube lo pone `terminar.py` (masterizar.mjs de video-base).
"""
import argparse, os, subprocess, sys
import numpy as np
import soundfile as sf

SR = 48000
SFX = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sfx')


def decode(p):
    raw = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', p, '-map', '0:a:0', '-ac', '2', '-ar', str(SR),
                          '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def resolve(name):
    if os.path.isfile(name):
        return name
    for ext in ('', '.wav', '.mp3', '.aif', '.aiff', '.flac'):
        p = os.path.join(SFX, name + ext)
        if os.path.isfile(p):
            return p
    sys.exit(f"sonido: unknown sound '{name}' (looked in {os.path.normpath(SFX)}); run scripts/synth-sfx.py")


_cache = {}


def load(path):
    if path not in _cache:
        if path.endswith(('.wav', '.flac', '.aif', '.aiff')):
            x, sr = sf.read(path, dtype='float32', always_2d=True)
        else:
            x, sr = decode(path), SR
        if sr != SR:   # rare: resample through ffmpeg
            x, sr = decode(path), SR
        if x.shape[1] == 1:
            x = np.repeat(x, 2, axis=1)
        x = x[:, :2].copy()
        n = min(len(x), int(0.006 * SR))     # 6 ms fade-in so no file starts on a click of its own
        x[:n] *= np.linspace(0, 1, n, dtype=np.float32)[:, None]
        _cache[path] = x
    return _cache[path]


def mezclar(base, cues, salida, dur=None):
    """base (o None: silencio) + las pistas de `cues` -> `salida` (WAV). Dura `dur` s, o lo que dure la base."""
    x = decode(base) if base and os.path.exists(base) else np.zeros((0, 2), np.float32)
    n = int(round((dur if dur else len(x) / SR) * SR))
    x = np.pad(x, ((0, max(0, n - len(x))), (0, 0)))[:n]
    k = 0
    for line in open(cues, encoding='utf-8'):
        parts = line.split('#', 1)[0].split()
        if not parts:
            continue
        t, name = float(parts[0]), parts[1]
        g = float(parts[2]) if len(parts) > 2 else 0.12
        s = load(resolve(name)) * g
        a = int(round(max(0.0, t) * SR))
        if a >= n:
            continue
        m = min(len(s), n - a)
        x[a:a + m] += s[:m]
        k += 1
    os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
    tmp = salida + '.tmp.wav'
    enc = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                            '-af', 'alimiter=limit=0.891:level=0:attack=2:release=40', '-c:a', 'pcm_s16le', tmp],
                           stdin=subprocess.PIPE)
    enc.stdin.write(x.astype(np.float32).tobytes())
    enc.stdin.close()
    if enc.wait():
        sys.exit('sonido: ffmpeg failed')
    poner(tmp, salida)
    return k


def poner(tmp, salida):
    """Si el estudio de Sloth está leyendo la salida, Windows no deja reemplazarla: se reintenta y, si no, se copia encima."""
    import shutil, time
    for _ in range(10):
        try:
            return os.replace(tmp, salida)
        except PermissionError:
            time.sleep(0.3)
    shutil.copyfile(tmp, salida)
    os.remove(tmp)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('base')
    ap.add_argument('cues')
    ap.add_argument('salida')
    ap.add_argument('--dur', type=float, default=None)
    a = ap.parse_args()
    k = mezclar(a.base, a.cues, a.salida, a.dur)
    print(f'sonido: {k} cues -> {a.salida}')


if __name__ == '__main__':
    main()
