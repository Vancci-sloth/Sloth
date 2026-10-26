"""
Verifica las fichas de la investigación sin volver a buscar: cada cita tiene que estar, literal, en el texto guardado de
su página (`fuentes/textos/`, de leer.mjs, preinvestigar.mjs o buscar.mjs), y cada cifra del dato tiene que estar en su
cita. Se corre en la raíz del episodio.

    python <skill>/scripts/verificar.py [carpeta o .json ...]      (por omisión, fuentes/fichas/*.json)

Una ficha: {"dato": "lo que dirá el guion, con sus cifras en dígitos", "cita": "el texto copiado tal cual de la página",
"url": "https://..."}; `archivo` en vez de `url` si el texto no es de una página. Mayúsculas, espacios, comillas y
guiones curvos no cuentan. Imprime BIEN, CITA (no está en la página: con lo más parecido que sí está), CIFRA (la cifra
del dato no sale en su cita), PALABRAS (un dato sin cifras cuya cita, con el título y el autor de su página, no trae ni
una cuarta parte de sus nombres y sus `claves`) o, sin argumentos, SIN FICHA (un dato de `fuentes/datos.json` que no
tiene la suya), y sale con error si alguna falla. Las que fallan son las únicas que se vuelven a buscar.
"""

import difflib
import json
import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import urlsplit

sys.stdout.reconfigure(encoding="utf-8")

TEXTOS = Path("fuentes/textos")
EQUIV = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "‐": "-", "‑": "-", "–": "-", "—": "-", " ": " "})
VACIAS = set("""
a al algo ante como con contra cual cuando de del desde donde dos el ella ellas ellos en entre era es esa ese eso esta
este esto fue ha han hay la las le les lo los mas me mi muy no nos o otra otro para pero por que se sea ser si sin sobre
son su sus tambien te tiene tu un una uno unos unas y ya yo dijo dice segun casi unas unos
the and for that with this from are was were has have had its it's not but you your our their they them his her she he
will would can could about into than then also just more most some such what which who whom how when where why all any
""".split())
# De los nombres y las claves de un dato sin cifras, cuántos tiene que traer su cita. Medido el 23 de octubre en 240
# fichas de 10 episodios: con 0.25 caen 4 (tres con la cita equivocada) y 9 de cada 10 citas de otro dato.
PALABRAS = 0.25


def norm(t: str) -> str:
    """Para comparar: minúsculas, comillas y guiones rectos, sin invisibles, sin las «>» de una cita en Markdown y con un
    espacio entre palabras (una cita que cruza dos líneas citadas también se encuentra)."""
    t = re.sub(r"(?m)^[ \t]*>[ \t]?", "", t)
    t = re.sub(r"[­​⁠﻿]", "", t.translate(EQUIV).lower())
    return re.sub(r"\s+", " ", t).strip()


def plano(t: str) -> str:
    """Sin acentos y en minúsculas: «decisión» y «decision» son la misma palabra."""
    return "".join(c for c in unicodedata.normalize("NFKD", t.lower()) if not unicodedata.combining(c))


def raices(t: str) -> set[str]:
    """Las palabras con contenido, cortadas a 5 letras: «bookmarks» y «bookmarked» cuentan como una."""
    return {w[:5] for w in re.findall(r"[a-z][a-z0-9]+", plano(t)) if len(w) > 2 and w not in VACIAS}


def claves_de(d) -> str:
    """Las `claves` de una entrada de datos.json, que a veces llegan como lista."""
    c = d.get("claves", "") if isinstance(d, dict) else ""
    return " ".join(c) if isinstance(c, list) else str(c)


def importantes(dato: str, claves: str) -> set[str]:
    """Lo que la fuente tiene que decir con esas letras, en cualquier idioma: los nombres del dato (con mayúscula o con
    dígitos, como «GPT-5») y sus claves. Las demás palabras del dato van en español y la fuente casi siempre no."""
    nombres = [w for w in re.findall(r"[\w.+-]+", dato) if w[:1].isupper() or (re.search(r"\d", w) and re.search(r"[^\W\d_]", w))]
    return raices(claves) | raices(" ".join(nombres))


def nombra(k: set[str], cita: str, cabeza: str) -> bool:
    """Si la cita, con la cabeza de su página, trae al menos la parte PALABRAS de lo importante del dato."""
    return not k or len(k & raices(f"{cita} {cabeza}")) >= PALABRAS * len(k)


def partes(texto: str) -> tuple[str, str]:
    """El cuerpo de un texto guardado y su cabeza: el título y el primer renglón (en un post, su autor). Una cita de
    alguien no lleva su nombre."""
    cabeza, _, cuerpo = texto.partition("\n---\n")
    if not cuerpo:
        cabeza, cuerpo = "", cabeza
    return cuerpo, cabeza + " " + (cuerpo.strip().splitlines() or [""])[0]


def clave(url: str) -> str:
    """La URL sin esquema, www, consulta, ancla ni barra final: `?s=20` de x.com no la vuelve otra página."""
    u = urlsplit(url)
    return (u.netloc.lower().removeprefix("www.") + u.path).rstrip("/")


def cifras(t: str) -> list[str]:
    """Las cifras del texto, sin separadores de miles: «1,200» y «1200» son la misma; «$3.50» queda «3.50»."""
    sale = []
    # «1) mide…, 2) lee…»: los números de una lista no son cifras; el «(3)» de «501(c)(3)» sí.
    t = re.sub(r"(?<![\w.(])\d{1,2}\)\s", " ", t)
    for m in re.finditer(r"\d+(?:[,. ]\d+)*", t):
        c = m.group().replace(" ", "")
        # Una coma o punto seguida de exactamente tres dígitos es de miles; si no, es decimal.
        c = re.sub(r"[,.](?=\d{3}(?!\d))", "", c).replace(",", ".")
        sale.append(c.rstrip("."))
    return sale


def textos() -> dict[str, Path]:
    indice = TEXTOS / "indice.json"
    if not indice.exists():
        return {}
    return {clave(url): TEXTOS / e["archivo"] for url, e in json.loads(indice.read_text(encoding="utf8")).items()}


def parecido(cita: str, texto: str) -> str:
    """El trozo de la página que más se parece a la cita, para ver si cambió una palabra o es otra cosa."""
    m = difflib.SequenceMatcher(None, texto, cita, autojunk=False).find_longest_match(0, len(texto), 0, len(cita))
    ini = max(0, m.a - m.b - 20)
    return texto[ini:ini + len(cita) + 40]


def main() -> None:
    rutas = [Path(a) for a in sys.argv[1:]] or [Path("fuentes/fichas")]
    archivos = [f for r in rutas for f in (sorted(r.glob("*.json")) if r.is_dir() else [r])]
    fichas = [f for a in archivos for f in json.loads(a.read_text(encoding="utf8"))]
    # Sin argumentos, también lo que pide el guion: cada dato de datos.json con su ficha (la que lo pidió o la del mismo
    # texto), y sus claves para la prueba de PALABRAS.
    datos = Path("fuentes/datos.json")
    pedidos = json.loads(datos.read_text(encoding="utf8")) if not sys.argv[1:] and datos.exists() else []
    claves = {(d["dato"] if isinstance(d, dict) else str(d)): claves_de(d) for d in pedidos}
    if not fichas and not claves:
        sys.exit("No hay fichas: " + ", ".join(map(str, rutas)))
    por_url = textos()
    leidos: dict[Path, tuple[str, str]] = {}
    malas = 0
    for f in fichas:
        dato, cita = f.get("dato", ""), f.get("cita", "")
        archivo = Path(f["archivo"]) if f.get("archivo") else por_url.get(clave(f.get("url", "")))
        donde = f.get("url") or f.get("archivo")
        if not archivo or not archivo.exists():
            print(f"SIN TEXTO  {dato}\n           {donde} no está leída: léela con leer.mjs")
            malas += 1
            continue
        if archivo not in leidos:
            cuerpo, cabeza = partes(archivo.read_text(encoding="utf8"))
            leidos[archivo] = norm(cuerpo), cabeza
        (texto, cabeza), c = leidos[archivo], norm(cita)
        if not c or c not in texto:
            print(f"CITA       {dato}\n           «{cita}»\n           lo más parecido en {archivo.name}: «{parecido(c, texto)}»")
            malas += 1
            continue
        faltan = [n for n in cifras(dato) if n not in cifras(cita)]
        if faltan:
            print(f"CIFRA      {dato}\n           {', '.join(faltan)} no sale en «{cita}» ({donde})")
            malas += 1
            continue
        k = importantes(dato, claves.get(f.get("pedido", dato), ""))
        if not cifras(dato) and not nombra(k, cita, cabeza):
            print(f"PALABRAS   {dato}\n           «{cita}» no dice casi nada de lo que nombra el dato ({donde}): ¿es su cita?")
            malas += 1
            continue
        print(f"BIEN       {dato}")
    con_ficha = {x for f in fichas for x in (f.get("pedido"), f.get("dato"))}
    sin = [d for d in claves if d not in con_ficha]
    for d in sin:
        print(f"SIN FICHA  {d}\n           está en fuentes/datos.json y no tiene ficha: búscale la cita (citas.py) o quítalo")
    print(f"\n{len(fichas) - malas} de {len(fichas)} fichas cuadran con su fuente"
          + (f"; {len(sin)} datos de fuentes/datos.json sin ficha." if sin else "."))
    if malas or sin:
        sys.exit(1)


if __name__ == "__main__":
    main()
