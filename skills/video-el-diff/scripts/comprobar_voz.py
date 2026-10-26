"""
Compara la voz transcrita con guion.md antes de armar nada. Lo llama `voz.py`; también se corre solo, en la raíz del
episodio, sobre fuentes/voz/palabras.json:

    python <skill>/scripts/comprobar_voz.py

1. **¿Es la voz de este guion?** Si menos de la mitad del guion aparece en la voz (en tramos de tres palabras seguidas o
   más), el WAV es de otro video y para. En el lote del 7 de octubre, el episodio 2 recibió el WAV del 5 y se armó
   entero, con cuatro renders, sobre una voz que no era suya.
2. **Párrafos que la voz se saltó** o dijo muy distinto.
3. **Tramos repetidos**: AI Studio a veces lee un párrafo dos veces (episodios 1 y 7 del lote). Da el tramo de la segunda
   lectura para cortarlo del WAV antes de volver a correr `voz.py`.

Las cifras no cuentan: el guion dice "99.2" y la voz llega como "noventa y nueve punto dos", o al revés.
"""

import difflib
import json
import sys
from collections import Counter
from pathlib import Path

from quitar_titulos import normal, parrafos

MINIMO = 0.5  # parte del guion que tiene que estar en la voz
SALTADO = 0.5  # un párrafo con menos de esto en la voz se avisa
SEGUIDAS = 3  # palabras seguidas que cuentan como coincidencia (sueltas, "de" y "que" coinciden en cualquier texto)
REPETIDO = 8  # palabras seguidas que, dichas más veces que en el guion, son un tramo repetido


def fichas(texto: str) -> list[str]:
    return [f for f in normal(texto) if not f.isdigit()]


def mmss(s: float) -> str:
    return f"{int(s // 60)}:{s % 60:04.1f}"


def comprobar(raiz: Path, palabras: list[dict]) -> bool:
    """Imprime lo que encontró. Devuelve False si la voz no es de este guion."""
    ps = [fichas(p) for p in parrafos(raiz / "guion.md")]
    guion = [f for p in ps for f in p]
    de_parrafo = [i for i, p in enumerate(ps) for _ in p]
    voz, cuando = [], []
    for w in palabras:
        for f in fichas(w["text"]):
            voz.append(f)
            cuando.append((w["start"], w["end"]))
    if not guion or not voz:
        print("comprobar_voz: no hay palabras que comparar")
        return True

    bloques = [b for b in difflib.SequenceMatcher(None, guion, voz, autojunk=False).get_matching_blocks() if b.size >= SEGUIDAS]
    dichas = {b.a + k for b in bloques for k in range(b.size)}
    parte = len(dichas) / len(guion)
    if parte < MINIMO:
        print(f"\nESTA VOZ NO PARECE DE ESTE GUION: solo el {parte:.0%} de guion.md está en ella. ¿Es el audio de otro video?")
        print(f"La voz empieza: «{' '.join(w['text'] for w in palabras[:25])}…»")
        return False
    print(f"\nLa voz dice el {parte:.0%} de guion.md.")

    for i, p in enumerate(ps):
        if not p:
            continue
        dicho = sum(1 for j, k in enumerate(de_parrafo) if k == i and j in dichas) / len(p)
        if dicho < SALTADO:
            print(f"  AVISO: la voz no dice (o dice muy distinto) el párrafo {i + 1}: «{' '.join(p[:14])}…» ({dicho:.0%})")

    # Un tramo de REPETIDO palabras dicho más veces que en el guion: la segunda lectura sobra.
    en_guion = Counter(tuple(guion[i:i + REPETIDO]) for i in range(len(guion) - REPETIDO + 1))
    vistos, sobran = Counter(), set()
    for i in range(len(voz) - REPETIDO + 1):
        g = tuple(voz[i:i + REPETIDO])
        vistos[g] += 1
        # Solo tramos del guion: si la voz dice las cifras con letra ("dos punto uno") y el guion con dígitos, una
        # frase con cifra que el guion dice dos veces no está en él y parecía repetida.
        if en_guion[g] and vistos[g] > en_guion[g]:
            sobran.update(range(i, i + REPETIDO))
    tramos = []
    for i in sorted(sobran):
        if tramos and i <= tramos[-1][1] + 1:
            tramos[-1][1] = i
        else:
            tramos.append([i, i])
    for a, b in tramos:
        print(f"  REPETIDO: la voz vuelve a decir «{' '.join(voz[a:a + 12])}…» de {mmss(cuando[a][0])} a {mmss(cuando[b][1])}. "
              "Corta ese tramo del WAV (ffmpeg, en el silencio de antes y el de después) y vuelve a correr voz.py.")
    return True


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raiz = Path.cwd()
    d = json.loads((raiz / "fuentes" / "voz" / "palabras.json").read_text(encoding="utf8"))
    sys.exit(0 if comprobar(raiz, d["words"]) else 1)
