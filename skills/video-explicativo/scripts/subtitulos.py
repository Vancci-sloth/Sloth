"""
El primer borrador de subtitulos.txt, sacado de guion.md: lo mecánico, para que solo quede marcar lo que importa.

    python -B -X utf8 <skill>/scripts/subtitulos.py [--pisa]     (desde la raíz del proyecto)

- Parte el guion en frases y cada frase en renglones de unas 30 letras (máximo 34), por las comas o antes de «y»,
  «que», «pero», «para»… Así salieron los de los videos anteriores: mediana 25 letras, el 90 % con 37 o menos.
- Las cifras dichas en letra las deja como se ven y como se dicen: «diez dólares» → `$10=diez_dólares`, «noventa y
  seis por ciento» → `96%=noventa_y_seis_por_ciento`, «dos mil quince» → `2015=dos_mil_quince`, «setecientos mil» →
  `700,000=setecientos_mil`. Del 0 al 9 sin unidad se quedan en letra. Las horas («siete cuarenta») no las toca.
- Las comillas rectas pasan a «».

No marca nada: las negritas (`*palabra*`), la caja (`[palabra]`, una por frase) y los íconos (`{Icono}palabra`) los
pone quien lo revisa, y también parte distinto un renglón que quede mal. No pisa un subtitulos.txt que ya existe
(con --pisa, sí).
"""

import re
import sys
import unicodedata
from pathlib import Path

LARGO = 34
CABECERA = ("# Una frase por renglón. *negrita*, [caja de selección], {Icono}palabra (nombre de Phosphor o imagen de "
            "public, nunca emoji), visto=dicho_con_guiones.")

UNIDADES = {"cero": 0, "uno": 1, "un": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7,
            "ocho": 8, "nueve": 9, "diez": 10, "once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15,
            "dieciseis": 16, "diecisiete": 17, "dieciocho": 18, "diecinueve": 19, "veinte": 20, "veintiuno": 21,
            "veintiun": 21, "veintiuna": 21, "veintidos": 22, "veintitres": 23, "veinticuatro": 24, "veinticinco": 25,
            "veintiseis": 26, "veintisiete": 27, "veintiocho": 28, "veintinueve": 29}
DECENAS = {"treinta": 30, "cuarenta": 40, "cincuenta": 50, "sesenta": 60, "setenta": 70, "ochenta": 80, "noventa": 90}
CENTENAS = {"cien": 100, "ciento": 100, "doscientos": 200, "doscientas": 200, "trescientos": 300, "trescientas": 300,
            "cuatrocientos": 400, "cuatrocientas": 400, "quinientos": 500, "quinientas": 500, "seiscientos": 600,
            "seiscientas": 600, "setecientos": 700, "setecientas": 700, "ochocientos": 800, "ochocientas": 800,
            "novecientos": 900, "novecientas": 900}
CORTE_ANTES = {"y", "que", "pero", "para", "porque", "cuando", "como", "con", "en", "sin", "hasta", "desde", "donde",
               "mientras", "aunque", "si", "o", "ni"}
# Después de estas no se corta: dejarían colgando lo que sigue («antes se / filtraron», «con tu / compañía»).
NO_CORTE_DESPUES = {"se", "me", "te", "le", "les", "lo", "la", "los", "las", "nos", "el", "un", "una", "unos", "unas",
                    "su", "sus", "mi", "mis", "tu", "tus", "de", "del", "a", "al", "y", "que", "en", "por", "con", "no"}


def plano(p: str) -> str:
    p = unicodedata.normalize("NFD", p.lower())
    return re.sub(r"[^a-zñ]", "", "".join(c for c in p if unicodedata.category(c) != "Mn"))


def valor(w: str) -> int | None:
    w = plano(w)
    return UNIDADES.get(w, DECENAS.get(w, CENTENAS.get(w)))


PUNTO = re.compile(r"[,.;:?!»\"]+$")


def cifras(palabras: list[str]) -> list[str]:
    """Junta las cifras dichas en letra en una ficha `visto=dicho_con_guiones`."""
    salida, i = [], 0
    while i < len(palabras):
        j, total, actual, ultimo = i, 0, 0, None
        while j < len(palabras):
            w = plano(palabras[j])
            sig = plano(palabras[j + 1]) if j + 1 < len(palabras) else ""
            # «un», «una» solos no son cifra («un SIM swap»), pero sí «un millón» o «cincuenta y un».
            if w in ("un", "una", "uno") and sig not in ("mil", "millon", "millones") and j == i:
                break
            if w == "y":
                if ultimo == "d" and sig in UNIDADES and UNIDADES[sig] < 10 and not PUNTO.search(palabras[j]):
                    j += 1
                    continue
                break
            if w == "mil":
                total, actual, ultimo = total + (actual or 1) * 1000, 0, "m"
            elif w in ("millon", "millones"):
                total, actual, ultimo = ((total + actual) or 1) * 1_000_000, 0, "M"
            elif w in CENTENAS and ultimo not in ("c", "d", "u"):
                actual, ultimo = actual + CENTENAS[w], "c"
            elif w in DECENAS and ultimo not in ("d", "u"):
                actual, ultimo = actual + DECENAS[w], "d"
            elif w in UNIDADES and ultimo != "u":
                actual, ultimo = actual + UNIDADES[w], "u"
            else:
                break
            j += 1
            if PUNTO.search(palabras[j - 1]):
                break
        tramo = palabras[i:j]
        if not tramo:
            salida.append(palabras[i])
            i += 1
            continue
        n = total + actual
        resto = [plano(p) for p in palabras[j:j + 2]]
        unidad, extra = "", 0
        if not PUNTO.search(tramo[-1]):
            if resto[:1] in (["dolares"], ["dolar"]):
                unidad, extra = "$", 1
            elif resto[:2] == ["por", "ciento"]:
                unidad, extra = "%", 2
            elif resto[:1] == ["centavos"]:
                unidad, extra = "¢", 1
        planos = [plano(p) for p in tramo]
        # Una hora: «a las once cincuenta y ocho» → 11:58, «a las doce y ocho» → 12:08.
        if i > 0 and plano(palabras[i - 1]) in ("las", "la") and 1 <= n <= 12 and not unidad and not PUNTO.search(tramo[-1]):
            k = j + (1 if j < len(palabras) and plano(palabras[j]) == "y" else 0)
            minutos = cifras_simples(palabras[k:k + 4])
            if minutos:
                m, largo = minutos
                dicho = palabras[i:k + largo]
                fin = PUNTO.search(dicho[-1])
                salida.append(f"{n}:{m:02d}={'_'.join(PUNTO.sub('', p) for p in dicho)}{fin.group(0) if fin else ''}")
                i = k + largo
                continue
        if n < 10 and not unidad and "mil" not in planos:
            salida += tramo
            i = j
            continue
        dicho = tramo + palabras[j:j + extra]
        fin = PUNTO.search(dicho[-1])
        cola = fin.group(0) if fin else ""
        dicho = [PUNTO.sub("", p) for p in dicho]
        ano = 1900 <= n <= 2099 and planos[:2] in (["dos", "mil"], ["mil", "novecientos"])
        if unidad == "$":
            visto = f"${n:,}"
        elif unidad:
            visto = f"{n}{unidad}"
        else:
            visto = str(n) if ano or n < 10000 else f"{n:,}"
        salida.append(f"{visto}={'_'.join(dicho)}{cola}")
        i = j + extra
    return salida


def cifras_simples(palabras: list[str]) -> tuple[int, int] | None:
    """Un número del 1 al 59 al principio («cincuenta y ocho», «ocho», «trece»): su valor y cuántas palabras ocupa."""
    p = [plano(w) for w in palabras]
    if p and p[0] in DECENAS and len(p) > 2 and p[1] == "y" and p[2] in UNIDADES and UNIDADES[p[2]] < 10:
        if not PUNTO.search(palabras[0]) and not PUNTO.search(palabras[1]):
            return DECENAS[p[0]] + UNIDADES[p[2]], 3
    if p and p[0] in DECENAS and DECENAS[p[0]] < 60:
        return DECENAS[p[0]], 1
    if p and p[0] in UNIDADES and p[0] not in ("un", "una", "uno") and UNIDADES[p[0]] < 30:
        return UNIDADES[p[0]], 1
    return None


def visible(renglon: str) -> int:
    return sum(len(p.split("=")[0].replace("_", " ")) + 1 for p in renglon.split()) - 1


def partir(fichas: list[str]) -> list[list[str]]:
    """Parte una frase en renglones de LARGO letras como mucho, por una coma o antes de una palabra de enlace, lo más
    cerca de la mitad."""
    if visible(" ".join(fichas)) <= LARGO or len(fichas) < 2:
        return [fichas]
    mitad = visible(" ".join(fichas)) / 2
    mejores = []
    for k in range(1, len(fichas)):
        izq = visible(" ".join(fichas[:k]))
        if fichas[k - 1].endswith((",", ":", ";")):
            peso = 0
        elif plano(fichas[k - 1]) in NO_CORTE_DESPUES:
            peso = 40
        elif plano(fichas[k]) in CORTE_ANTES:
            peso = 6
        else:
            peso = 14
        mejores.append((abs(izq - mitad) + peso, k))
    _, k = min(mejores)
    return partir(fichas[:k]) + partir(fichas[k:])


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    raiz = Path.cwd()
    salida = raiz / "subtitulos.txt"
    if salida.exists() and "--pisa" not in sys.argv[1:]:
        sys.exit("Ya hay subtitulos.txt: con --pisa lo rehace desde el guion.")
    lineas = (raiz / "guion.md").read_text(encoding="utf-8").splitlines()
    texto = " ".join(l.strip() for l in lineas if l.strip() and not l.startswith("#")
                     and not re.match(r"^(Corte de datos|Datos al)", l.strip()))
    # Las comillas rectas, de dos en dos, pasan a «».
    texto = re.sub(r'"([^"]*)"', r"«\1»", texto)
    frases = re.findall(r"[^.?!]+[.?!]+»?|[^.?!]+$", texto)
    renglones = []
    for f in frases:
        fichas = cifras(f.split())
        renglones += [" ".join(r) for r in partir(fichas)]
    salida.write_text(CABECERA + "\n" + "\n".join(renglones) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(renglones)} renglones en {salida.name}. Ahora márcalos: *negrita*, [caja] (una por frase) y {{Icono}}.")


if __name__ == "__main__":
    main()
