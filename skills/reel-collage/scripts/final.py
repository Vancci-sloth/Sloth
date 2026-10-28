"""
Render final en el tamaño de su formato (1080x1920 o 1920x1080, `FORMATO` de src/datos.ts), audio masterizado para
redes (-14 LUFS, true peak <= -1 dBTP) y comprobación.

    python -B final.py <nombre>          deja out/reel-<nombre>.mp4 (el panel de etapas de Sloth busca out/reel-*.mp4)

En vertical, si ya está `portada.png`, la vuelve a poner de primer fotograma. En horizontal no: ahí `portada.png` es la
miniatura de YouTube y no entra en el video (PORTADA.md de video-base).

A veces Remotion falla al mezclar el audio ("remotion-audio-mixing ... No such file or directory", una carpeta temporal
que no llegó a crear): se reintenta. El MP4 crudo se borra antes de renderizar, para que un fallo nunca deje pasar uno
viejo al paso del audio (en el primer reel, así salió un final con las siluetas de marcador).

El master y la comprobación son los de video-base (`masterizar.mjs`, `comprobar.mjs`), los mismos de todos los estilos.
"""

import subprocess
import sys

from comun import CONCURRENCIA, PROYECTO, base, ffmpeg, formato, tamano
from espacio import comprobar_disco  # de video-base, que comun.py pone en sys.path


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    crudo = PROYECTO / "out" / "crudo.mp4"
    audio = PROYECTO / "out" / "audio.wav"
    final = PROYECTO / "out" / f"reel-{sys.argv[1].removeprefix('reel-')}.mp4"
    comprobar_disco(PROYECTO)  # barre los temporales de renders cortados y para si no cabe otro
    for intento in (1, 2, 3):
        crudo.unlink(missing_ok=True)
        # Rango limitado a mano: Remotion saca yuvj420p (rango completo) y hay reproductores que lo ven lavado. Con solo
        # --pixel-format=yuv420p sigue saliendo así; hace falta también --color-space=bt709.
        r = subprocess.run("npx remotion render src/index.ts Reel out/crudo.mp4 --crf=16 --pixel-format=yuv420p "
                           f"--color-space=bt709 --concurrency={CONCURRENCIA} --log=error",
                           shell=True, cwd=PROYECTO)
        if r.returncode == 0 and crudo.exists():
            break
        print(f"-- el render falló (intento {intento}), reintento --")
    else:
        sys.exit("El render falló tres veces.")
    base("masterizar.mjs", str(crudo), str(audio))
    ffmpeg("-i", str(crudo), "-i", str(audio), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "320k",
           "-ar", "48000", "-ac", "2", "-shortest", "-movflags", "+faststart", str(final))
    crudo.unlink()
    audio.unlink()
    base("comprobar.mjs", str(final), "--tamano", tamano())
    portada = PROYECTO / "portada.png"
    if formato() == "horizontal":
        # La miniatura de YouTube, aparte: nunca se pega en el video.
        if not portada.exists():
            print("Falta la miniatura: hazla según «En horizontal» de PORTADA.md de video-base (sin portada.mjs).")
    # La portada como primer cuadro (PORTADA.md de video-base): si ya se hizo, un render nuevo no la pierde.
    elif portada.exists():
        base("portada.mjs", str(final), str(portada))
    else:
        print("Falta la portada: hazla según PORTADA.md de video-base y ponla con portada.mjs.")


main()
