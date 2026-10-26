"""
Prepara la narración que grabó el usuario. Se corre en la raíz del proyecto del episodio.

    python <skill>/scripts/voz.py <audio> [termino1,termino2,...] [--forzar]

1. Pasa el audio a WAV (un WAV se copia; lo demás, el m4a del celular, mp3, ogg, opus, aac, flac, webm o mp4, se
   convierte con FFmpeg) y saca su versión de 16 kHz.
2. Lo transcribe con tiempos por palabra (transcribir.py de Sloth, alineador voxpopuli-es). Los términos (nombres
   propios, marcas) van como pistas a Whisper. Las cifras salen con letra ("noventa y nueve punto dos"): con dígitos,
   el alineador no las sabe situar y corre las palabras vecinas. Si así Whisper se salta voz, vuelve a transcribir con
   dígitos y se queda con la que deje menos voz sin palabras.
   Lo compara con guion.md (comprobar_voz.py): si el audio es de otro video, para ahí sin tocar la voz que ya había
   (`--forzar` sigue igual); también avisa de los párrafos que la voz se saltó y de los tramos que dijo dos veces.
   Hasta aquí todo va a temporales: aprobada la voz, queda en fuentes/voz/original.wav, voz16k.wav y palabras.json.
3. La nivela a -19.4 LUFS con limitador en public/voz/narracion.wav (48 kHz), el nivel que espera la mezcla.
4. Avisa si la voz leyó los títulos de sección de guion.md (quitar_titulos.py los corta).
5. Lista, como cifras.py, las oraciones cuyo inicio quedó corrido (no empiezan después de una pausa).

Después: `python voz/adaptar.py` empareja las palabras con guion.json y escribe src/timeline.json.
"""

import json
import os
import shutil
import sys
import wave
from pathlib import Path

from cifras import revisar, silencios
from comun import MODELOS, enlazar_modulos, ffmpeg, marca, proceso, sonoridad, wav16k
from comprobar_voz import comprobar
from quitar_titulos import avisar, parrafos

sys.stdout.reconfigure(encoding="utf-8")
OBJETIVO = -19.4
HUECO = 3  # s de voz sin palabras: Whisper se saltó un tramo


def voz_sin_palabras(palabras: list[dict], voz: Path, sil: list[tuple[float, float]]) -> tuple[float, float]:
    """
    El tramo más largo de voz (lo que no es silencio) entre dos palabras seguidas, y dónde empieza. Con las cifras en
    letra, Whisper a veces se atasca en una frase llena de cifras: en un short escribió "Haiku, ¿no?" cuatro veces y se
    saltó 12 s. Con dígitos, no.
    """
    with wave.open(str(voz)) as w:
        dura = w.getnframes() / w.getframerate()
    peor, fin = (0.0, 0.0), 0.0
    for p in [*palabras, {"start": dura, "end": dura}]:
        if p["start"] - fin >= 1:
            callado = sum(max(0.0, min(b, p["start"]) - max(a, fin)) for a, b in sil)
            peor = max(peor, (p["start"] - fin - callado, fin))
        fin = p["end"]
    return peor


def main() -> None:
    forzar = "--forzar" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--forzar"]
    if not args:
        sys.exit("uso: python voz.py <audio> [terminos,separados,por,comas] [--forzar]")
    raiz = Path.cwd()
    if not (raiz / "guion.py").exists():
        sys.exit("córrelo en la raíz del proyecto del episodio (donde está guion.py)")
    audio = Path(args[0])
    if not audio.is_file():
        sys.exit(f"no encuentro el audio {audio}")
    guion = raiz / "guion.md"
    if guion.exists():
        parrafos(guion)  # si guion.md no se lee, que truene ahora y no después de transcribir
    terminos = [t.strip() for t in args[1].split(",") if t.strip()] if len(args) > 1 else []
    nombre = marca(raiz).get("nombre")
    enlazar_modulos(raiz)  # la fase 2 renderiza: si borraron node_modules para hacer espacio, vuelve
    dv = raiz / "fuentes" / "voz"
    dv.mkdir(parents=True, exist_ok=True)
    original = dv / "original.wav"
    # La voz nueva va a temporales: si no es de este guion, la de antes queda entera.
    mismo = audio.resolve() == original.resolve()
    nueva = original if mismo else dv / "_nueva.wav"
    nueva16k = dv / "_nueva16k.wav"
    try:
        if not mismo:
            with open(audio, "rb") as f:
                es_wav = f.read(12)[8:12] == b"WAVE"
            if es_wav:
                shutil.copyfile(audio, nueva)
            else:
                ffmpeg("-i", str(audio), "-vn", "-ar", "48000", "-c:a", "pcm_s16le", str(nueva))
                print(f"{audio.name} -> WAV")
        wav16k(nueva, nueva16k)

        opciones = {"modelos": str(MODELOS), "alineador": "voxpopuli-es", "terminos": terminos + ([nombre] if nombre else [])}
        d = proceso("transcribir.py", [str(nueva16k)], {**opciones, "cifras_en_letra": True})
        if not d["words"]:
            sys.exit("La transcripción no trae ninguna palabra: el audio no tiene voz o está casi mudo. Revisa el archivo.")
        sil = silencios(nueva16k)
        hueco, donde = voz_sin_palabras(d["words"], nueva16k, sil)
        # Si trae dígitos, ese transcribir.py no conoce `cifras_en_letra` (SLOTH_PROCESOS apunta a una copia vieja):
        # repetir daría lo mismo.
        if hueco > HUECO and not any(c.isdigit() for p in d["words"] for c in p["text"]):
            print(f"Con las cifras en letra, Whisper se saltó {hueco:.0f} s de voz desde {donde:.1f} s: vuelvo a transcribir con dígitos.")
            d2 = proceso("transcribir.py", [str(nueva16k)], opciones)
            hueco2, _ = voz_sin_palabras(d2["words"], nueva16k, sil)
            if hueco2 < hueco:
                d = d2
                print(f"Con dígitos quedan {hueco2:.0f} s sin palabras: me quedo con esa.")
            else:
                print(f"Con dígitos quedan {hueco2:.0f} s sin palabras: sigo con las cifras en letra.")
        palabras = d["words"]
        print(f"{len(palabras)} palabras, {palabras[-1]['end']:.1f} s")
        print(" ".join(w["text"] for w in palabras))
        if guion.exists() and not comprobar(raiz, palabras) and not forzar:
            antes = " La voz de antes sigue en fuentes/voz y public/voz." if not mismo and original.exists() else ""
            sys.exit("Para aquí: no armes el video con esta voz. Si de verdad es la de este guion (lo cambiaste al grabar), "
                     f"vuelve a correr con --forzar.{antes}")

        if not mismo:
            os.replace(nueva, original)
        os.replace(nueva16k, dv / "voz16k.wav")
    finally:
        for t in (nueva, nueva16k):
            if t != original:
                t.unlink(missing_ok=True)
    (dv / "palabras.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf8")

    medida = sonoridad(original)["lufs"]
    ganancia = OBJETIVO - medida
    salida = raiz / "public" / "voz" / "narracion.wav"
    salida.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg("-i", str(original), "-af", f"volume={ganancia:.1f}dB,alimiter=limit=0.89:level=false,aresample=48000",
           "-c:a", "pcm_s16le", str(salida))
    final = sonoridad(salida)
    print(f"voz: {medida:.1f} LUFS -> {final['lufs']:.1f} LUFS, pico {final['pico']:.1f} dBTP ({ganancia:+.1f} dB)")
    if guion.exists():
        avisar(raiz)
    revisar(palabras, sil)


if __name__ == "__main__":
    main()
