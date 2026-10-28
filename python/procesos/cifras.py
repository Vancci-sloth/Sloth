"""
Las cifras escritas con dígitos, dichas con letra en español: «2025» → «dos mil veinticinco», «214.000» → «doscientos
catorce mil», «1,5» → «uno coma cinco», «15%» → «quince por ciento», «$15» → «quince dólares».

Parakeet escribe las cifras con dígitos y el alineador no las sabe situar (corre a sus vecinas): `parakeet.py` las pasa
a letra cuando le piden `cifras_en_letra`, como hace Whisper. Un punto o una coma seguidos de tres dígitos separan miles
(«214.000», «1,500»); con otra cantidad, son decimales («99.2», «1,5»).
"""

import re

UNIDADES = (
    "cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete "
    "dieciocho diecinueve veinte veintiuno veintidós veintitrés veinticuatro veinticinco veintiséis veintisiete "
    "veintiocho veintinueve"
).split()
DECENAS = {3: "treinta", 4: "cuarenta", 5: "cincuenta", 6: "sesenta", 7: "setenta", 8: "ochenta", 9: "noventa"}
CENTENAS = {1: "ciento", 2: "doscientos", 3: "trescientos", 4: "cuatrocientos", 5: "quinientos", 6: "seiscientos",
            7: "setecientos", 8: "ochocientos", 9: "novecientos"}
MONEDAS = {"$": ("dólar", "dólares"), "€": ("euro", "euros"), "£": ("libra", "libras")}

CIFRA = re.compile(
    r"(?P<moneda>[$€£])?(?P<entero>\d{1,3}(?:[.,]\d{3})+(?!\d)|\d+)(?:(?P<sep>[.,])(?P<frac>\d+))?(?P<pct>%)?"
)


def _menor_de_mil(n: int) -> str:
    if n < 30:
        return UNIDADES[n]
    if n < 100:
        d, u = divmod(n, 10)
        return DECENAS[d] + (f" y {UNIDADES[u]}" if u else "")
    if n == 100:
        return "cien"
    c, r = divmod(n, 100)
    return CENTENAS[c] + (f" {_menor_de_mil(r)}" if r else "")


def _apocope(t: str) -> str:
    """Delante de «mil» o «millones», «uno» pierde la o: «veintiún mil», «treinta y un millones»."""
    if t.endswith("veintiuno"):
        return t[:-len("veintiuno")] + "veintiún"
    return t[:-3] + "un" if t.endswith("uno") else t


def entero(n: int) -> str:
    if n < 1000:
        return _menor_de_mil(n)
    if n < 10**6:
        m, r = divmod(n, 1000)
        cabeza = "mil" if m == 1 else f"{_apocope(_menor_de_mil(m))} mil"
        return cabeza + (f" {_menor_de_mil(r)}" if r else "")
    if n < 10**12:
        m, r = divmod(n, 10**6)
        cabeza = "un millón" if m == 1 else f"{_apocope(entero(m))} millones"
        return cabeza + (f" {entero(r)}" if r else "")
    return " ".join(UNIDADES[int(d)] for d in str(n))


def _cifra(m: re.Match) -> str:
    digitos = re.sub(r"[.,]", "", m["entero"])
    # Un cero delante («007») se dice dígito a dígito.
    dichas = [entero(int(digitos))] if not (len(digitos) > 1 and digitos[0] == "0") else [UNIDADES[int(d)] for d in digitos]
    if m["frac"]:
        frac = m["frac"]
        dichas.append("punto" if m["sep"] == "." else "coma")
        dichas += [UNIDADES[int(d)] for d in frac] if frac[0] == "0" or len(frac) > 2 else [entero(int(frac))]
    if m["pct"]:
        dichas.append("por ciento")
    if m["moneda"]:
        una, varias = MONEDAS[m["moneda"]]
        if not m["frac"]:
            dichas[0] = _apocope(dichas[0])  # «un dólar», «veintiún dólares»
        dichas.append(una if digitos.lstrip("0") == "1" and not m["frac"] else varias)
    return " ".join(dichas)


def en_letra(texto: str) -> str:
    """El texto con cada cifra dicha con letra; lo demás, igual. Un «%» suelto es «por ciento»."""
    texto = CIFRA.sub(_cifra, texto)
    return re.sub(r"(?<!\w)%", "por ciento", texto)
