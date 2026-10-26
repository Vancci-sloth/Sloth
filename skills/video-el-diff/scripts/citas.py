"""
Busca la cita de cada dato en lo ya leído, sin modelo: de todos los textos de `fuentes/textos/` saca las oraciones que
llevan las cifras y las palabras del dato, y escribe una ficha con la mejor. Tarda menos de un segundo; el 19 de octubre,
seis subagentes Haiku tardaron 2.5 minutos en lo mismo. Se corre en la raíz del episodio.

    python <skill>/scripts/citas.py [fuentes/datos.json]

`fuentes/datos.json` es la lista de lo que dirá el guion: `[{"dato": "...", "claves": "..."}]`. El dato lleva sus cifras
en dígitos; `claves` (opcional) son las palabras con que lo dice la fuente, en su idioma («bookmarks», «seed round»): sin
ellas solo cuentan las cifras y los nombres. Deja `fuentes/fichas/citas.json`, que `verificar.py` comprueba, y por cada
dato imprime la cita elegida y las dos que le siguen. La cita es la que mejor cuadra, no necesariamente la que lo prueba:
léelas, cambia la que no diga el dato por otra de la lista y busca las que salen SIN CITA.

Correrlo otra vez (con datos nuevos al final de `datos.json`) solo busca los nuevos: las fichas que ya estaban se quedan
como las dejaste, aunque les hayas cambiado la cita o el dato (cada ficha recuerda en `pedido` el dato que la pidió). La
de un dato que ya no está en `datos.json` (porque lo corregiste allí) se quita y el dato nuevo se busca. Para buscarlas
todas de cero, borra `fuentes/fichas/citas.json`.
"""

import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verificar import TEXTOS, cifras, clave, claves_de, importantes, nombra, partes, raices  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

# Hasta dónde se junta: una cita de dos oraciones, como mucho, y no más larga que esto.
LARGO = 420


def oraciones(linea: str) -> list[str]:
    return [o.strip() for o in re.split(r"(?<=[.!?…])\s+(?=[\"“'(\[¿¡A-Z0-9@#$])", linea) if o.strip()]


def pasajes(texto: str) -> list[str]:
    """Cada oración, y cada dos seguidas (en un párrafo o en dos seguidos: un post pone cada frase en su párrafo), sin
    pasar de LARGO."""
    sale = []
    lineas = [re.sub(r"\s+", " ", l).strip() for l in texto.splitlines()]
    previa = ""
    for linea in lineas:
        if not linea:
            continue
        os_ = oraciones(linea)
        sale += [o for o in os_ if len(o) <= LARGO * 2]
        sale += [f"{a} {b}" for a, b in zip(os_, os_[1:]) if len(a) + len(b) < LARGO]
        if previa and len(previa) + len(os_[0]) < LARGO:
            sale.append(f"{previa}\n{os_[0]}")
        previa = os_[-1]
    return sale


def main() -> None:
    archivo = Path(sys.argv[1] if len(sys.argv) > 1 else "fuentes/datos.json")
    datos = json.loads(archivo.read_text(encoding="utf8"))
    indice = TEXTOS / "indice.json"
    if not indice.exists():
        sys.exit("No hay textos leídos: fuentes/textos/indice.json no existe.")
    candidatos: list[tuple[str, str, set[str], list[str]]] = []  # (pasaje, url, raíces, cifras)
    vistos: set[str] = set()
    cabezas: dict[str, str] = {}
    for url, e in json.loads(indice.read_text(encoding="utf8")).items():
        f = TEXTOS / e["archivo"]
        # La misma página leída dos veces (con y sin `?s=20`) no repite sus citas.
        if not f.exists() or clave(url) in vistos:
            continue
        vistos.add(clave(url))
        cuerpo, cabezas[url] = partes(f.read_text(encoding="utf8"))
        for p in pasajes(cuerpo):
            candidatos.append((p, url, raices(p), cifras(p)))
    if not candidatos:
        sys.exit("Los textos leídos están vacíos.")
    # Lo raro pesa más que lo común: «SageCut» dice mucho más que «video».
    df = Counter(r for _, _, rs, _ in candidatos for r in rs)
    n = len(candidatos)
    idf = lambda r: math.log(n / (1 + df[r]))  # noqa: E731
    tope = math.log(n)

    salida = Path("fuentes/fichas/citas.json")
    # Lo que ya estaba se queda: el 19 de octubre, al añadir 15 datos, se perdieron las citas corregidas a mano.
    previas = json.loads(salida.read_text(encoding="utf8")) if salida.exists() else []
    ya = {f.get("pedido", f.get("dato")): f for f in previas}
    fichas, sin, nuevas = [], 0, 0
    for i, d in enumerate(datos, 1):
        dato = d["dato"] if isinstance(d, dict) else str(d)
        if dato in ya:
            fichas.append(ya.pop(dato))
            continue
        nuevas += 1
        busca = f"{dato} {claves_de(d)}"
        palabras, numeros = raices(busca), set(cifras(busca))
        # Los nombres y las claves que no salen en ningún texto también cuentan en lo que pesaría la cita llena: si
        # no, un dato inventado («Zorblax compró…») cuadraba con la primera oración que compartía una palabra.
        fuerza = importantes(dato, claves_de(d))

        def puntos(c):
            p, _, rs, cs = c
            # Sin ninguna palabra del dato no es su cita, aunque comparta una cifra («600M» no son 600 guardados).
            if not palabras & rs:
                return 0
            # Una cifra de un dígito («3 planes») dice menos que «3,153».
            s = sum(tope * (0.3 if len(x) == 1 else 1) for x in numeros if x in cs)
            s += sum(idf(r) for r in palabras & rs)
            return s / (1 + len(p) / 600)

        # Lo que pesaría una cita con todas las palabras y cifras del dato: con menos de un tercio, es dudosa.
        lleno = sum(tope * (0.3 if len(x) == 1 else 1) for x in numeros) + sum(idf(r) for r in palabras if df[r] or r in fuerza)

        orden = sorted(candidatos, key=puntos, reverse=True)
        mejores: list[tuple[str, str, set[str], list[str]]] = []
        for c in orden:
            if puntos(c) <= 0 or len(mejores) == 3:
                break
            if not any(c[0] in m[0] or m[0] in c[0] for m in mejores):
                mejores.append(c)
        print(f"\n{i}. {dato}")
        if not mejores:
            print("   SIN CITA: no está en lo leído; búscala.")
            sin += 1
            continue
        for k, c in enumerate(mejores):
            p, url, _, cs = c
            faltan = [x for x in numeros if x not in cs]
            marca = "→" if k == 0 else " "
            aviso = f"  [no trae {', '.join(faltan)}]" if faltan else ""
            # La de verificar.py (PALABRAS, para un dato sin cifras) también: si no la pasa, aquí ya se ve.
            if k == 0 and (puntos(c) * (1 + len(p) / 600) < lleno / 3 or not (numeros or nombra(fuerza, p, cabezas[url]))):
                aviso += "  [DUDOSA: cuadra poco; ¿son dos datos?, ¿la dice con otras palabras?]"
            print(f" {marca} «{p}»\n     {url}{aviso}")
        p, url = mejores[0][0], mejores[0][1]
        fichas.append({"dato": dato, "cita": p, "url": url, "pedido": dato,
                       "otras": [{"cita": m[0], "url": m[1]} for m in mejores[1:]]})

    # Las escritas a mano (sin `pedido`) se quedan, al final; las de un dato que ya no está en datos.json, no: verificar.py
    # seguía fallando con la ficha vieja de un dato ya corregido.
    viejas = [f for f in ya.values() if "pedido" in f]
    fichas += [f for f in ya.values() if "pedido" not in f]
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(json.dumps(fichas, ensure_ascii=False, indent=1), encoding="utf8")
    print(f"\n{len(fichas)} fichas en {salida}: {nuevas - sin} nuevas, {len(fichas) - nuevas + sin} que ya estaban,"
          f" {len(viejas)} quitadas (su dato ya no está en datos.json) y {sin} datos sin cita. Revisa las nuevas y corre"
          " verificar.py.")


if __name__ == "__main__":
    main()
