"""
Encuentra y quita de la narración los títulos de sección leídos ("Intro.", "El precio."...). Pasa cuando la voz se
graba o se genera leyendo el guion con sus encabezados `##` (episodio 5: los 14 títulos, 17.6 s). Se corre en la raíz
del episodio, después de `voz.py` (que ya llama a `avisar()` y dice si hace falta).

    python <skill>/scripts/quitar_titulos.py                lista los títulos que encontró en fuentes/voz/palabras.json
    python <skill>/scripts/quitar_titulos.py --cortar       además escribe fuentes/voz/sin_titulos.wav sin ellos

Después de cortar, vuelve a correr `voz.py fuentes/voz/sin_titulos.wav "<términos>"`: los tiempos cambian.

Un título cuenta como leído si sus palabras aparecen seguidas, en el orden de `guion.md`, con una pausa antes y otra
después, y empezando oración. Sus cifras valen también con letra ("## El 90 %" es "el noventa por ciento"), como las
escribe la voz. El corte va del final de la pausa anterior al inicio de la palabra siguiente, afinado con silencedetect.
"""

import difflib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
PAUSA = 0.2  # s de silencio que separan un título leído de lo que lo rodea
PARECIDO = 0.75  # Whisper escribe los nombres a su modo: "Youri" salió "Yuri"
UNIDADES = ("cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciseis "
            "diecisiete dieciocho diecinueve veinte veintiuno veintidos veintitres veinticuatro veinticinco veintiseis "
            "veintisiete veintiocho veintinueve").split()
DECENAS = "treinta cuarenta cincuenta sesenta setenta ochenta noventa".split()
CENTENAS = "ciento doscientos trescientos cuatrocientos quinientos seiscientos setecientos ochocientos novecientos".split()


def normal(s: str) -> list[str]:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.findall(r"[a-z0-9]+", s)


def en_letra(n: int) -> str:
    """Un número como lo dice la voz, sin tildes (`normal` las quita): 2019, "dos mil diecinueve"."""
    if n < 30:
        return UNIDADES[n]
    if n < 100:
        return DECENAS[n // 10 - 3] + (f" y {UNIDADES[n % 10]}" if n % 10 else "")
    if n < 1000:
        return "cien" if n == 100 else CENTENAS[n // 100 - 1] + (f" {en_letra(n % 100)}" if n % 100 else "")
    if n < 1_000_000:
        miles = "mil" if n < 2000 else f"{en_letra(n // 1000)} mil"
        return miles + (f" {en_letra(n % 1000)}" if n % 1000 else "")
    return str(n)


def con_letra(texto: str) -> str:
    """El texto con sus cifras dichas: "GPT-5.5 sube 90 %" es "GPT-cinco punto cinco sube noventa por ciento"."""
    texto = re.sub(r"(?<=\d)[.,](?=\d{3}\b)", "", texto)  # 1,100 es mil cien
    texto = re.sub(r"(\d+)[.,](\d+)", lambda m: f"{en_letra(int(m[1]))} punto {en_letra(int(m[2]))}", texto)
    texto = re.sub(r"\d+", lambda m: en_letra(int(m[0])), texto)
    return texto.replace("%", " por ciento")


def parrafos(guion: Path) -> list[str]:
    """
    Lo que se narra desde el primer `##`, sin títulos, para medir el guion y comprobar la voz. Sin `##`, se narra
    todo.
    """
    texto = guion.read_text(encoding="utf8")
    inicio = re.search(r"^## ", texto, re.M)
    cuerpo = re.sub(r"^#+ .*$", "", texto[inicio.start() if inicio else 0:], flags=re.M)
    return [" ".join(p.split()) for p in re.split(r"\n\s*\n", cuerpo) if p.strip()]


def titulos(guion: Path) -> list[str]:
    return [m.group(1).strip() for m in re.finditer(r"^## (.+)$", guion.read_text(encoding="utf8"), re.M)]


def buscar(palabras: list[dict], encabezados: list[str]) -> list[tuple[str, int, int]]:
    """(título, índice de su primera palabra, índice de la última) de cada título leído, en orden."""
    norm = [" ".join(normal(w["text"])) for w in palabras]
    hallados, desde = [], 0
    for t in encabezados:
        formas = {tuple(normal(t)), tuple(normal(con_letra(t)))}  # la voz trae las cifras con letra (o con dígitos)
        hallado = None
        for i in range(desde, len(palabras)):
            for fichas in formas:
                n = len(fichas)
                if not n or i + n > len(palabras) or not all(
                        difflib.SequenceMatcher(None, a, b).ratio() >= PARECIDO for a, b in zip(norm[i:i + n], fichas)):
                    continue
                # empieza oración: "Ahora, los peros." es texto del guion, no el título "Los peros"
                antes = i == 0 or (palabras[i]["start"] - palabras[i - 1]["end"] >= PAUSA
                                   and palabras[i - 1]["text"].rstrip().endswith((".", "?", "!", ":")))
                despues = i + n == len(palabras) or palabras[i + n]["start"] - palabras[i + n - 1]["end"] >= PAUSA
                if antes and despues:
                    hallado = (t, i, i + n - 1)
                    break
            if hallado:
                hallados.append(hallado)
                desde = hallado[2] + 1
                break
    return hallados


def avisar(raiz: Path = Path.cwd()) -> list[tuple[str, int, int]]:
    """Lo llama voz.py: imprime un aviso si la narración trae títulos leídos."""
    palabras = json.loads((raiz / "fuentes/voz/palabras.json").read_text(encoding="utf8"))["words"]
    h = buscar(palabras, titulos(raiz / "guion.md"))
    if h:
        print(f"\nAVISO: la voz leyó {len(h)} títulos de sección: {', '.join(t for t, _, _ in h)}.")
        print("Quítalos con `python <skill>/scripts/quitar_titulos.py --cortar` y vuelve a correr voz.py con "
              "fuentes/voz/sin_titulos.wav.")
    return h


def cortar(raiz: Path, hallados: list[tuple[str, int, int]]) -> None:
    palabras = json.loads((raiz / "fuentes/voz/palabras.json").read_text(encoding="utf8"))["words"]
    src, dst = raiz / "fuentes/voz/original.wav", raiz / "fuentes/voz/sin_titulos.wav"
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", str(src), "-af", "silencedetect=noise=-35dB:d=0.08",
                        "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    sil = list(zip([float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)],
                   [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]))

    def fin_silencio(t: float) -> float | None:
        s = min(sil, key=lambda s: abs(s[1] - t), default=None)
        return s[1] if s and abs(s[1] - t) < 0.35 else None

    cortes = []
    for t, a, b in hallados:
        h0 = palabras[a]["start"]
        sig = palabras[b + 1]["start"] if b + 1 < len(palabras) else palabras[b]["end"] + 0.3
        f0, f1 = fin_silencio(h0), fin_silencio(sig)
        c0 = 0.0 if a == 0 else (f0 - 0.03 if f0 else h0 - 0.05)
        c1 = f1 - 0.06 if f1 else sig - 0.08
        cortes.append((round(max(0.0, c0), 3), round(c1, 3)))
        print(f"  {t}: {cortes[-1][0]:.2f}–{cortes[-1][1]:.2f} s")
    expr = "+".join(f"between(t,{a},{b})" for a, b in cortes)
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", str(src), "-af",
                    f"aselect='not({expr})',asetpts=N/SR/TB", str(dst)], check=True)
    print(f"quitados {sum(b - a for a, b in cortes):.2f} s en {len(cortes)} cortes -> {dst}")


def main() -> None:
    raiz = Path.cwd()
    hallados = avisar(raiz)
    for t, a, b in hallados:
        print(f"  {t}: palabras {a}–{b}")
    if not hallados:
        print("la voz no trae títulos leídos")
    elif "--cortar" in sys.argv:
        cortar(raiz, hallados)


if __name__ == "__main__":
    main()
