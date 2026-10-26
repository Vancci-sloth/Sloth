"""
Avisa dónde el alineador corrió los tiempos de la voz. No sabe cómo suena "99.2" o "2019": les da 20 a 100 ms y
desplaza las palabras vecinas hasta 2 s. Así una escena empieza antes o después de que la voz diga su frase, y el
porcentaje de `adaptar.py` no lo detecta. voz.py pide las cifras con letra ("noventa y nueve punto dos"), que sí sabe
situar: si aun así sale `CIFRA`, es que voz.py volvió a los dígitos.

    python <skill>/scripts/cifras.py      (en la raíz del episodio; voz.py ya lo hace con `revisar()`)

Cada oración empieza después de una pausa. Lista las oraciones cuyo inicio, según fuentes/voz/palabras.json, no cae
junto al final de un silencio (ffmpeg silencedetect), con los silencios cercanos: ahí está el inicio real. Se corrige
editando los tiempos de esas palabras en palabras.json (guarda una copia antes) y se vuelve a correr hasta que no
quede ninguna con cifra cerca. Un arreglo automático que repartía el tiempo por oración lo hizo peor (movió 227
palabras contra 15), por eso solo avisa.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
TOLERANCIA = 0.3
# Acaban en punto sin cerrar la oración: siglas ("I.J.", "EE.UU.", "a.m."), una inicial ("J.") y tratamientos. Con las
# cifras en letra salen más: a veces Whisper escribe "Opus V.C." por "Opus cinco punto cinco".
SIGLA = re.compile(r"(?:[^\W\d_]{1,2}\.){2,}|[A-ZÁÉÍÓÚÑ]\.|(?:Sr|Sra|Dr|Dra|vs|Bros)\.")


def cierra(palabra: str) -> bool:
    """Si la palabra termina una oración."""
    p = palabra.strip().rstrip("\"'»”)")
    return p.endswith((".", "?", "!", "…")) and not SIGLA.fullmatch(p.lstrip("\"'«“(¿¡"))


def silencios(wav: Path) -> list[tuple[float, float]]:
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", str(wav), "-af", "silencedetect=noise=-35dB:d=0.12",
                        "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    ini = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    fin = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    return list(zip(ini, fin))


def revisar(w: list[dict], sil: list[tuple[float, float]]) -> None:
    """Imprime las oraciones de `w` (las palabras) cuyo inicio no cae junto al final de un silencio de `sil`."""
    finales = [b for _, b in sil]
    avisos = 0
    for i in range(1, len(w)):
        if not cierra(w[i - 1]["text"]):
            continue
        t = w[i]["start"]
        if any(abs(t - b) <= TOLERANCIA for b in finales):
            continue
        cerca = [f"{b:.2f}" for b in finales if abs(t - b) < 3]
        vecinas = w[max(0, i - 6):i + 4]
        cifra = any(any(c.isdigit() for c in y["text"]) for y in vecinas)
        frase = " ".join(y["text"] for y in w[i:i + 6])
        print(f"{'CIFRA ' if cifra else '      '}{t:7.2f} s  «{frase}…»  silencios terminan en: {', '.join(cerca) or 'ninguno a 3 s'}")
        avisos += 1
    print(f"{avisos} oraciones sin pausa antes; las marcadas CIFRA son casi seguro tiempos corridos")


def main() -> None:
    dv = Path("fuentes/voz")
    w = json.loads((dv / "palabras.json").read_text(encoding="utf8"))["words"]
    revisar(w, silencios(dv / "voz16k.wav"))


if __name__ == "__main__":
    main()
