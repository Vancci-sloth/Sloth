"""
Adapta el video a una narración grabada por fuera, en lugar de la de edge-tts.

Toma la transcripción con tiempos por palabra de fuentes/voz/palabras.json (WhisperX, con los procesos de
Sloth) y la empareja con las palabras del guion. Las que coinciden fijan el tiempo; las que no (cifras, nombres que
el guion escribe como se pronuncian) se reparten el hueco entre sus vecinas según su largo. Un beat sin palabras
(`say` vacío, "…") ocupa la pausa tras la última palabra del anterior.

Escribe src/timeline.json con un solo audio, public/voz/narracion.wav.
"""

import difflib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FPS = 30
INICIO = 0.3  # el audio empieza aquí; la voz ya trae su propio silencio inicial
ADELANTO = 0.05  # el corte de un beat va justo antes de su primera palabra
ADELANTO_PARRAFO = 0.15  # y un poco más en el primero de cada párrafo, para la interferencia
COLA = 0.8  # tras la última palabra
MINIMO = 0.9  # parte del guion que tiene que estar en la voz

sys.stdout.reconfigure(encoding="utf-8")


def palabras(texto: str) -> list[str]:
    return [p for p in texto.split() if re.search(r"\w", p)]


def normal(p: str) -> str:
    p = unicodedata.normalize("NFD", p.lower())
    return "".join(c for c in p if c.isalnum() and unicodedata.category(c) != "Mn")


def duracion(archivo: Path) -> float:
    salida = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(archivo)],
        capture_output=True, text=True, check=True,
    )
    return float(salida.stdout.strip())


def tiempos(guion_pal: list[str], oidas: list[dict]) -> tuple[list[tuple[float, float]], int]:
    a = [normal(p) for p in guion_pal]
    b = [normal(w["text"]) for w in oidas]
    fijo: list[tuple[float, float] | None] = [None] * len(a)
    pareja: list[int | None] = [None] * len(a)  # la palabra oída que le toca a cada una del guion
    emparejadas = 0
    for bloque in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(bloque.size):
            w = oidas[bloque.b + k]
            fijo[bloque.a + k] = (w["start"], w["end"])
            pareja[bloque.a + k] = bloque.b + k
            emparejadas += 1
    # Rellena los huecos entre anclas, repartiendo por número de letras. Si entre las dos anclas hay palabras oídas
    # sin pareja (la cifra "6.1" donde el guion dice "seis punto uno"), el hueco es lo que duran ellas: así no se
    # come la pausa que haya antes o después.
    i = 0
    while i < len(a):
        if fijo[i] is not None:
            i += 1
            continue
        j = i
        while j < len(a) and fijo[j] is None:
            j += 1
        bi = pareja[i - 1] + 1 if i > 0 else 0
        bj = pareja[j] if j < len(a) else len(oidas)
        if bj > bi:
            desde, hasta = oidas[bi]["start"], oidas[bj - 1]["end"]
        else:
            desde = fijo[i - 1][1] if i > 0 else 0.0
            hasta = fijo[j][0] if j < len(a) else oidas[-1]["end"]
        largos = [max(1, len(a[k])) for k in range(i, j)]
        total = sum(largos)
        t = desde
        for k, largo in zip(range(i, j), largos):
            d = (hasta - desde) * largo / total
            fijo[k] = (t, t + d)
            t += d
        i = j
    return fijo, emparejadas


def main() -> None:
    guion = json.loads((RAIZ / "guion.json").read_text(encoding="utf8"))
    oidas = json.loads((RAIZ / "fuentes" / "voz" / "palabras.json").read_text(encoding="utf8"))["words"]
    wav = RAIZ / "public" / "voz" / "narracion.wav"

    lista = []  # (parrafo, beat, palabra)
    for parrafo in guion["parrafos"]:
        for b in parrafo["beats"]:
            for p in palabras(b["say"]):
                lista.append((parrafo["id"], b, p))
    marcas, emparejadas = tiempos([p for _, _, p in lista], oidas)
    parte = emparejadas / max(1, len(lista))
    print(f"{emparejadas}/{len(lista)} palabras del guion ({parte:.0%}) encontradas en la voz ({len(oidas)} oídas)")
    if parte < MINIMO:
        print(f"AVISO: menos del {MINIMO:.0%}: el `say` de guion.py no coincide con lo que se grabó (o faltan escenas).")

    beats = []
    k = 0
    ultima = 0.0  # fin de la última palabra dicha
    for parrafo in guion["parrafos"]:
        for n, b in enumerate(parrafo["beats"]):
            cuantas = len(palabras(b["say"]))
            mis = [(lista[k + i][2], marcas[k + i]) for i in range(cuantas)]
            k += cuantas
            adelanto = ADELANTO_PARRAFO if n == 0 else ADELANTO
            inicio = INICIO + (mis[0][1][0] - adelanto if mis else ultima)
            inicio = max(inicio, beats[-1]["inicio"]) if beats else 0.0
            ultima = mis[-1][1][1] if mis else ultima
            beats.append({
                "id": b["id"],
                "inicio": round(inicio, 3),
                "palabras": [{"t": t, "s": round(INICIO + s, 3), "e": round(INICIO + e, 3)} for t, (s, e) in mis],
                "v": b["v"],
            })
    largo = duracion(wav)
    total = max(INICIO + largo, round(INICIO + ultima, 3) + COLA)
    for i, b in enumerate(beats):
        b["fin"] = beats[i + 1]["inicio"] if i + 1 < len(beats) else total
    linea = {
        "fps": FPS,
        "formato": guion.get("formato", "vertical"),  # Video.tsx: un short (vertical) se compone entero en 1080x1920
        "gancho": guion.get("gancho", ""),  # el rótulo fijo de arriba de un short
        "duracion": total,
        "parrafos": [{"id": "narracion", "src": "voz/narracion.wav", "inicio": INICIO, "duracion": largo}],
        "beats": beats,
    }
    (RAIZ / "src" / "timeline.json").write_text(json.dumps(linea, ensure_ascii=False, indent=1), encoding="utf8")
    print(f"{len(beats)} beats, {total:.1f} s")
    for b in beats:
        texto = " ".join(p["t"] for p in b["palabras"][:6])
        print(f"{b['id']} {b['inicio']:7.2f} {b['fin'] - b['inicio']:5.2f}s {b['v']['tipo']:<12} {texto}")


if __name__ == "__main__":
    main()
