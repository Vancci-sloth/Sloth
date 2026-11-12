"""
El director de El Diff: de `guion.md` y `momentos.json` (lo único que escribe el agente) a `guion.json`, lo que dibuja la
plantilla. Hace lo que antes escribían a mano diez agentes, escena por escena: parte la voz en beats, encuadra cada captura
en su cita, la resalta y la traduce, encadena las tomas de una misma página, acomoda rótulos y recortes donde no tapan
lo citado y pone el logo y la despedida de la marca. El formato de `momentos.json`, en SKILL.md.

    python -X utf8 <skill>/scripts/director.py revisa      comprueba momentos.json contra guion.md, sin material (1 s)
    python -X utf8 <skill>/scripts/director.py             escribe guion.json, src/lineas.json y material.md

Se corre en la raíz del episodio; lo llama `hacer.py`. Un momento es `{"palabra": …}` más **una** base (lo que llena la
escena) y lo que va encima; sin base, sigue la escena anterior con algo nuevo encima:

    base    "fuente" + "cita" (+ "es", "cajas")   la captura de la página, encuadrada y resaltada en la cita
            "clip" (+ "desde")                    un video: el id de `clips`, o "tema@62" (el video del tema, en ese segundo)
            "titular" (+ "color", "emoji")        texto enorme, para un remate
            "imagen"                              una foto de public/ (o el id de `imagenes`)
            "meme" (+ "etiquetas")                una plantilla de meme por su nombre (memes.py)
            "diagrama"                            cajas y flechas que entran en su palabra: el mecanismo, explicado
            "v"                                   una escena de ESCENAS.md tal cual (tarjetas, duelo, meme…)
    encima  "rotulo"   texto, o {"texto", "estilo", "color", "giro", "y"}, o una lista
            "logo"     el id de `logos` (o una lista): la pegatina de la empresa, en su nombre
            "ovalo", "flecha", "mano"   un texto de la captura (o una lista) que se rodea o se señala
            "sello"    el veredicto en una palabra, de golpe («FALSO»), o {"texto", "color"}
            "persona"  el id de `personas`: su recorte, con su placa la primera vez
            "entra"    "flash", "barrido" o "glitch" en vez del corte seco
            "encima"   elementos de «Encima» de ESCENAS.md tal cual
"""

import contextlib
import hashlib
import io
import json
import re
import sys
import textwrap
import unicodedata
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SKILL.parent / "video-base" / "scripts"))
sys.path.insert(0, str(SKILL / "scripts"))
import memes  # noqa: E402
from momentos import anclar, busca, guardar, leer, normal, palabras_de, parar  # noqa: E402

RAIZ = Path.cwd()
PUBLICO = RAIZ / "public"
TEMA = "clips/tema.mp4"
BASES = ("fuente", "clip", "titular", "imagen", "meme", "diagrama", "v")
ANOTACIONES = ("ovalo", "flecha", "mano")
COLORES = {"fuego", "sol", "rojo", "verde", "azul", "crema"}
ESTILOS = {"crema", "rojo", "banda", "placa"}
ENTRADAS = {"flash", "barrido", "glitch", "papel"}
EMPUJE = 0.05  # lo que se acerca una captura en 12 s: en los Code Report ninguna se queda quieta
MESES = {"enero": "ENE", "febrero": "FEB", "marzo": "MAR", "abril": "ABR", "mayo": "MAY", "junio": "JUN", "julio": "JUL",
         "agosto": "AGO", "septiembre": "SEP", "setiembre": "SEP", "octubre": "OCT", "noviembre": "NOV", "diciembre": "DIC"}
# La voz va a unas 3 palabras por segundo (largo.py). Lo medido en los Code Report (REFERENCIAS.md): algo nuevo en
# pantalla cada 1.6 a 2.5 s y de 4 a 7 rótulos por minuto.
POR_SEGUNDO = 3.0
LARGO = 30  # palabras: un momento de más de 10 s sin que nada cambie se siente parado
RITMO = 11  # palabras por cambio, de media, contando los que pone el director: con lo de encima, algo nuevo cada 2 s
ROTULOS_POR_MINUTO = 3
CHISTES_POR_MINUTO = 1
CITA_MAXIMA = 200  # caracteres: cuatro renglones de una captura para el celular; más ya no se lee ni deja sitio a lo de encima
PRUEBA = 0.4  # la parte de la voz que va sobre material real (capturas y clips)
SUELTAS = 6  # palabras sin momento que se le dan al siguiente sin protestar


def slug(t: str) -> str:
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-") or "seccion"


def formato() -> str:
    """El de `nuevo.py`, en src/formato.json (en un episodio de antes del director, en `FORMATO` de su guion.py)."""
    f, viejo = RAIZ / "src" / "formato.json", RAIZ / "guion.py"
    if f.exists():
        return json.loads(f.read_text(encoding="utf8")).get("formato", "vertical")
    m = re.search(r'^FORMATO = "(\w+)"', viejo.read_text(encoding="utf8"), re.M) if viejo.exists() else None
    return m.group(1) if m else "vertical"


def marca() -> dict:
    sys.path.insert(0, str(SKILL / "scripts"))
    from comun import marca as de_la_carpeta
    return de_la_carpeta(RAIZ)


def narrado(md: str) -> tuple[list[str], dict[int, str]]:
    """
    Lo que lee la voz (lo mismo que `textoParaVoz` de Sloth: todo menos los encabezados y los comentarios), palabra por
    palabra, y en qué palabra empieza cada sección `##`.
    """
    crudas, secciones = [], {}
    for linea in re.sub(r"<!--[\s\S]*?-->", "", md).splitlines():
        if linea.startswith("#"):
            if linea.startswith("## "):
                secciones[len(crudas)] = slug(linea[3:])
            continue
        crudas += linea.split()
    return crudas, secciones


class Guion:
    """El guion ya partido: sus palabras, las que se comparan (sin signos) y dónde cae cada una."""

    def __init__(self) -> None:
        archivo = RAIZ / "guion.md"
        if not archivo.exists():
            sys.exit("✗ Falta guion.md en la raíz del episodio.")
        self.crudas, self.secciones = narrado(archivo.read_text(encoding="utf8"))
        pares = [(normal(w), i) for i, w in enumerate(self.crudas)]
        self.dichas = [n for n, _ in pares if n]
        self.cruda_de = [i for n, i in pares if n]  # de la palabra dicha a su palabra cruda

    def texto(self, a: int, b: int) -> str:
        return " ".join(self.crudas[a:b])


def automaticos(g: Guion, mc: dict) -> tuple[list[dict], list[str]]:
    """Los beats que nadie escribe porque salen de la marca: la tarjeta de la fecha, la despedida y la invitación."""
    autos, errores = [], []
    texto, inicios, pos = "", [], 0
    for w in g.crudas:
        inicios.append(pos)
        pos += len(w) + 1
    texto = " ".join(g.crudas)
    palabra_en = lambda c: max(i for i, x in enumerate(inicios) if x <= c)
    m = re.search(r"\bEs (?:\w+ )?(\d{1,2}) de (\w+) de (\d{4}),? y estás viendo [^.!?]*[.!?]", texto)
    if m:
        dia, mes, anio = m.groups()
        autos.append({"desde": palabra_en(m.start()), "hasta": palabra_en(m.end() - 1) + 1, "id": "logo",
                      "v": {"tipo": "logo", "fecha": f"{dia} {MESES.get(mes.lower(), mes[:3].upper())}, {anio}"}})
    else:
        errores.append("guion.md no trae la frase del logo: «Es <día> de <mes> de <año>, y estás viendo <nombre>.»")
    for clave, v in (("despedida", {"tipo": "logo", "final": True}), ("invitacion", {"tipo": "logo", "invitacion": True})):
        frase = (mc.get(clave) or "").strip()
        if not frase:
            continue
        n, i, vez = len(palabras_de(frase)), -1, 1
        while (j := busca(g.dichas, frase, vez)) >= 0:  # la última vez que se dice
            i, vez = j, vez + 1
        if i < 0:
            errores.append(f"guion.md no dice la {clave} de la marca tal cual: «{frase}»")
            continue
        fin = g.cruda_de[i + n] if i + n < len(g.dichas) else len(g.crudas)
        autos.append({"desde": g.cruda_de[i], "hasta": fin, "id": "cierre", "v": v})
    return autos, errores


def anclar_en_orden(momentos: list[dict], dichas: list[str]) -> tuple[list[int], list[str]]:
    """
    En qué palabra del guion cae cada momento: la primera vez que se dice su `palabra` **después** del momento anterior,
    así una palabra que se repite no pide contar veces (`vez` sigue valiendo, contada desde el principio, por si hace
    falta saltarse una). En la corrida larga del eval, tres momentos se anclaron antes que su anterior por eso.

    Un momento escrito fuera de su sitio cuya `palabra` se dice una sola vez en todo el guion no tiene otro lugar donde
    caer: se ancla ahí y `planear` lo pone en su orden. En la tercera corrida larga, de doce vueltas de `--revisa`, la
    mayoría fueron por eso.
    """
    indices, errores, antes = [], [], -1
    for k, mo in enumerate(momentos):
        que = f"momento {k + 1} («{mo.get('palabra', '')}»)"
        palabra = str(mo.get("palabra", ""))
        i = busca(dichas, palabra, int(mo["vez"])) if mo.get("vez") else busca(dichas, palabra, 1, antes + 1)
        if i < 0 and not mo.get("vez") and busca(dichas, palabra) >= 0 and busca(dichas, palabra, 2) < 0:
            indices.append(busca(dichas, palabra))  # fuera de orden, y sin duda de dónde va
            continue
        if i < 0:
            ya = busca(dichas, palabra) >= 0
            errores.append(f"{que}: el guion no dice «{palabra}»" + (" después del momento anterior: van en el orden en que se dicen" if ya else
                                                                    " (de una a tres palabras seguidas, tal como están en guion.md)"))
        elif i <= antes:
            errores.append(f"{que}: con ese `vez` cae antes que el momento anterior; quítale `vez`: se toma la primera vez después de él")
        antes = max(antes, i)
        indices.append(i)
    return indices, errores


def que_de(mo: dict, k: int) -> str:
    """Cómo se nombra un momento en un ✗: con su número en momentos.json (los que añade el director no lo corren)."""
    return ("automático" if mo.get("_auto") else f"momento {mo.get('_n', k + 1)}") + f" («{mo.get('palabra', '')}»)"


NUMERO = re.compile(r"[$€£]?\d[\d.,]*\d%?|[$€£]?\d%?")
digitos = lambda t: re.sub(r"\D", "", t)


def densificar(m: dict, momentos: list[dict], indices: list[int], g: "Guion", autos: list[dict]) -> tuple[list[int], int]:
    """
    Las capas que no hace falta escribir, cada una en su palabra: la pegatina de un logo de `logos` la primera vez que la
    voz dice su nombre sobre una captura, un clip, un meme o una foto, y el óvalo en la cifra de la cita que se ve cuando
    la voz dice esa cifra. En las referencias es lo que más entra (REFERENCIAS.md: el logo por sustantivo, la cifra en su
    fuente), y en las corridas largas del eval eran 71 de los 111 momentos que escribió el agente, uno por uno.

    Van como momentos sin base (`_auto`), entre los escritos, y el resto del director no los distingue. Se saltan si caen a
    menos de tres palabras del cambio anterior, si el momento ya trae ese logo o ya anota esa cifra, o con `"quieto"`.
    `"auto": false` en momentos.json los apaga.
    """
    if m.get("auto") is False:
        return indices, 0
    dicho: dict[str, str] = {}
    for id_, de in (m.get("logos") or {}).items():
        dicho.setdefault(normal(id_), id_)
        if isinstance(de, str) and de.startswith("sitio:"):
            dicho.setdefault(normal(de[6:].split("/")[0].removeprefix("www.").split(".")[0]), id_)
    dicho.pop("", None)
    de_la_marca = {i for a in autos for i in range(a["desde"], a["hasta"])}
    nuevos: list[tuple[int, dict]] = []
    base, cita, vistos, rodeados = None, "", set(), set()
    for k, mo in enumerate(momentos):
        if base_de(mo):
            base, cita, vistos, rodeados = base_de(mo), (mo.get("cita") or "") if base_de(mo) == "fuente" else "", set(), set()
        vistos |= set(logos_de(mo))
        rodeados |= {digitos(t) for _, t, _ in anotados(mo)}
        fin = indices[k + 1] if k + 1 < len(momentos) else len(g.dichas)
        # Hasta la tarjeta de la marca, si cae en medio: después de ella no hay toma que seguir.
        fin = next((j for j in range(indices[k], fin) if g.cruda_de[j] in de_la_marca), fin)
        ultimo = indices[k]
        if mo.get("quieto") or fin - indices[k] < 1:
            continue
        for j in range(indices[k], fin):
            cruda = g.crudas[g.cruda_de[j]]
            if g.cruda_de[j] in de_la_marca:
                continue
            capa: dict = {}
            logo = dicho.get(g.dichas[j])
            if logo and logo not in vistos and base in ("fuente", "clip", "meme", "imagen"):
                capa["logo"] = logo
            if cita and re.search(r"\d", cruda) and digitos(cruda) not in rodeados:
                ficha = next((t for t in NUMERO.findall(cita) if digitos(t) == digitos(cruda)), None)
                if ficha:
                    capa["ovalo"] = ficha
            if not capa:
                continue
            if j == indices[k]:
                # En la palabra del propio momento: se le suma lo que no trae.
                if "logo" in capa and not mo.get("logo"):
                    mo["logo"] = capa["logo"]
                    vistos.add(capa["logo"])
                if "ovalo" in capa and not any(mo.get(a) for a in ANOTACIONES):
                    mo["ovalo"] = capa["ovalo"]
                    rodeados.add(digitos(capa["ovalo"]))
                continue
            if j - ultimo < 3 or fin - j < 2:
                continue
            nuevos.append((j, {"palabra": g.dichas[j], "_auto": True, **capa}))
            vistos |= {capa["logo"]} if "logo" in capa else set()
            rodeados |= {digitos(capa["ovalo"])} if "ovalo" in capa else set()
            ultimo = j
        # Una cita que se queda más de cuatro segundos sin que entre nada: a la mitad, el óvalo en una cifra suya que aún
        # no se rodeó, la diga la voz en dígitos o con letra.
        medio = ultimo + (fin - ultimo) // 2
        if cita and fin - ultimo > RITMO + 3 and g.cruda_de[medio] not in de_la_marca:
            ficha = next((t for t in NUMERO.findall(cita) if len(t) > 1 and digitos(t) not in rodeados), None)
            if ficha:
                nuevos.append((medio, {"palabra": g.dichas[medio], "_auto": True, "ovalo": ficha}))
                rodeados.add(digitos(ficha))
    if nuevos:
        todos = sorted([*zip(indices, momentos), *nuevos], key=lambda par: par[0])
        momentos[:] = [mo for _, mo in todos]
        indices = [i for i, _ in todos]
    return indices, len(nuevos)


def anotados(mo: dict) -> list[tuple[str, str, int]]:
    """Lo que un momento rodea, señala o enmarca en su captura: (tipo, texto, ocurrencia)."""
    fuera = []
    for tipo in (*ANOTACIONES, "cajas"):
        x = mo.get(tipo)
        for a in (x if isinstance(x, list) else [x] if x else []):
            fuera.append((tipo, a, 1) if isinstance(a, str) else (tipo, str(a.get("texto", "")), int(a.get("ocurrencia", 1))))
    return fuera


def rotulos_de(mo: dict) -> list[dict]:
    r = mo.get("rotulo")
    lista = r if isinstance(r, list) else [r] if r else []
    return [{"texto": x} if isinstance(x, str) else dict(x) for x in lista]


def cambios_de(mo: dict) -> int:
    """Lo que entra en pantalla en un momento además de su base: rótulos, pegatinas, anotaciones y las piezas de un diagrama."""
    lista = lambda x: x if isinstance(x, list) else [x] if x else []
    d = mo.get("diagrama") or {}
    return (len(rotulos_de(mo)) + len(logos_de(mo)) + sum(len(lista(mo.get(k))) for k in (*ANOTACIONES, "cajas")) + bool(mo.get("sello"))
            + bool(mo.get("persona")) + len(d.get("nodos") or []) + len(d.get("flechas") or []) + len(d.get("cambios") or []))


def diagrama_mal(d: dict, logos: dict) -> list[str]:
    """Lo que falla en un diagrama, sin mirar la voz: ids repetidos, flechas y cambios a nodos que no hay, logos sin bajar."""
    nodos = d.get("nodos") or []
    ids = [n.get("id") for n in nodos]
    mal = []
    if not 2 <= len(nodos) <= 8:
        mal.append(f"lleva {len(nodos)} nodos: de 2 a 8 (más no se leen en un celular)")
    if len(set(ids)) != len(ids) or not all(ids):
        mal.append("cada nodo lleva un `id` distinto")
    mal += [f"el nodo «{n.get('id')}» no lleva `texto`" for n in nodos if not str(n.get("texto") or "").strip()]
    mal += [f"el nodo «{n['id']}»: su texto pasa de 22 letras por renglón (pártelo con \\n o acórtalo)" for n in nodos
            if max((len(r) for r in str(n.get("texto") or "").split("\n")), default=0) > 22]
    mal += [f"el logo «{n['logo']}» del nodo «{n.get('id')}» no está en `logos`" for n in nodos if n.get("logo") and n["logo"] not in logos]
    mal += [f"la flecha {f.get('de')} → {f.get('a')} va a un nodo que no hay" for f in d.get("flechas") or [] if f.get("de") not in ids or f.get("a") not in ids]
    mal += [f"el cambio de «{c.get('id')}» va a un nodo que no hay, o no lleva `en`" for c in d.get("cambios") or [] if c.get("id") not in ids or not c.get("en")]
    return mal


def logos_de(mo: dict) -> list[str]:
    x = mo.get("logo")
    return x if isinstance(x, list) else [x] if x else []


def base_de(mo: dict) -> str | None:
    return next((b for b in BASES if mo.get(b) is not None), None)


def planear(m: dict, g: Guion, mc: dict) -> tuple[list[dict], list[str], list[str]]:
    """
    Los beats, en orden: de qué palabra a qué palabra va cada uno y qué momento (o qué tarjeta de la marca) lo llena. No
    mira el material: es lo que comprueba `--revisa` en un segundo, con todo lo que falla de una vez.
    """
    momentos = m.get("momentos") or []
    momentos[:] = [mo for mo in momentos if not mo.get("_auto")]  # los de una pasada anterior
    if not momentos:
        return [], ["momentos.json no trae `momentos`"], []
    for k, mo in enumerate(momentos):
        mo.setdefault("_n", k + 1)  # su número en momentos.json, para nombrarlo aunque cambie de sitio
    indices, errores = anclar_en_orden(momentos, g.dichas)
    avisos: list[str] = []
    if not errores and indices != sorted(indices):
        # Los que venían fuera de orden, a su sitio (en el mismo `m`, que es el que leen los demás pasos).
        orden = sorted(range(len(momentos)), key=lambda k: indices[k])
        fuera = sum(a > b for a, b in zip(indices, indices[1:]))
        momentos[:] = [momentos[k] for k in orden]
        indices = [indices[k] for k in orden]
        movidos = [momentos[k].get("palabra", "") for k in range(len(momentos)) if any(momentos[k].get("_n", 0) < momentos[j].get("_n", 0) for j in range(k))]
        avisos.append(f"{fuera} momento(s) venían fuera de orden y van donde el guion dice su `palabra`"
                      + (f" (mira que sea donde querías: «{'», «'.join(movidos[:4])}»)" if movidos else ""))
    for k in range(1, len(indices)):
        if indices[k] >= 0 and indices[k] == indices[k - 1]:
            errores.append(f"{que_de(momentos[k], k)}: cae en la misma palabra que el anterior; júntalos en uno")
    autos, mas = automaticos(g, mc)
    errores += mas
    if not errores:
        indices, puestos = densificar(m, momentos, indices, g, autos)
        if puestos:
            avisos.append(f"el director puso {puestos} capas en su palabra (el óvalo en la cifra que se dice, el logo en el nombre "
                          "que se dice): esas no se escriben")
    fuentes, personas, clips, imagenes, logos = (m.get(k) or {} for k in ("fuentes", "personas", "clips", "imagenes", "logos"))

    # Las plantillas de meme, si algún momento pide una (la lista se guarda en la carpeta del noticiero).
    plantillas: set[str] = set()
    if any(mo.get("meme") for mo in momentos):
        try:
            plantillas = {memes.slug(x["nombre"]) for x in memes.lista(RAIZ.parent / "memes")}
        except Exception as e:  # noqa: BLE001 — sin internet no se comprueba aquí; lo dirá hacer.py al bajarla
            avisos.append(f"no pude leer la lista de memes ({e})")
    # Cada momento, bien formado. Una cita que vuelve lleva la traducción de su primera vez.
    traducidas: dict[str, str] = {}
    a_la_vista = alrededor = ""  # la cita de la captura que se está viendo (la del momento, o la del que sigue) y su párrafo
    junto = lambda t: re.sub(r"[^a-z0-9áéíóúñ$%]", "", t.lower())
    for k, mo in enumerate(momentos):
        que = que_de(mo, k)
        if base_de(mo) == "fuente":
            a_la_vista = mo.get("cita") or ""
            # Con la cita entra en el recorte su párrafo: lo que se anota puede estar en cualquiera de los dos.
            alrededor = parrafo_de(((m.get("fuentes") or {}).get(mo.get("fuente")) or {}).get("url"), a_la_vista)
        elif base_de(mo):
            a_la_vista = alrededor = ""
        for tipo, texto, _ in anotados(mo):
            if a_la_vista and junto(texto) not in junto(a_la_vista + alrededor):
                errores.append(f"{que}: `{tipo}` «{texto}» no está en la cita que se ve ni en su párrafo («{a_la_vista[:60]}…»): rodea o "
                               "señala palabras de ahí, tal cual, o cita la oración que las trae")
        if mo.get("cita"):
            mo.setdefault("es", traducidas.get(mo["cita"])) if mo["cita"] in traducidas else None
            if mo.get("es"):
                traducidas[mo["cita"]] = mo["es"]
        bases = [b for b in BASES if mo.get(b) is not None]
        if len(bases) > 1:
            errores.append(f"{que}: lleva {' y '.join(bases)}; un momento tiene una sola base (lo demás va encima o en otro momento)")
        if k == 0 and not bases:
            errores.append(f"{que}: el primero necesita su base (lo que se ve al abrir)")
        if mo.get("fuente") is not None:
            if mo["fuente"] not in fuentes:
                errores.append(f"{que}: la fuente «{mo['fuente']}» no está en `fuentes` (hay: {', '.join(fuentes) or 'ninguna'})")
            if len(mo.get("cita") or "") > CITA_MAXIMA and not mo.get("sin_marca"):
                errores.append(f"{que}: la cita mide {len(mo['cita'])} caracteres y llena la pantalla de letra chica: cita solo la "
                               f"parte de la oración que lo dice (hasta {CITA_MAXIMA}, y su `es`, lo mismo en español); lo demás de la "
                               "página se ve alrededor")
            if mo.get("cita") and en_ingles(mo["cita"]) and not mo.get("es") and not mo.get("sin_marca"):
                errores.append(f"{que}: la cita está en inglés y no lleva `es` (la oración entera en español, de su largo: "
                               f"de {round(len(mo['cita']) * 0.8)} a {round(len(mo['cita']) * 1.25)} caracteres)")
        elif mo.get("cita") or mo.get("es"):
            errores.append(f"{que}: lleva `cita` sin `fuente`")
        if isinstance(mo.get("clip"), str) and not mo["clip"].startswith("tema@") and mo["clip"] not in clips:
            errores.append(f"{que}: el clip «{mo['clip']}» no está en `clips` (hay: {', '.join(clips) or 'ninguno'}; el video del tema es \"tema@<segundo>\")")
        if mo.get("titular") is not None and mo.get("color", "fuego") not in COLORES:
            errores.append(f"{que}: el color del titular es uno de {', '.join(sorted(COLORES))}")
        if mo.get("meme") is not None and plantillas and memes.slug(mo["meme"]) not in plantillas:
            errores.append(f"{que}: no hay una plantilla de meme «{mo['meme']}»: los nombres, con `python <skill>/scripts/memes.py`")
        if mo.get("persona") is not None and mo["persona"] not in personas:
            errores.append(f"{que}: la persona «{mo['persona']}» no está en `personas` (hay: {', '.join(personas) or 'ninguna'})")
        for x in logos_de(mo):
            if x not in logos:
                errores.append(f"{que}: el logo «{x}» no está en `logos` (hay: {', '.join(logos) or 'ninguno'}); va como "
                               '`"logos": {"<id>": "sitio:<dominio>"}`')
        if mo.get("diagrama") is not None:
            errores += [f"{que}: el diagrama: {e}" for e in diagrama_mal(mo["diagrama"], logos)]
        if any(mo.get(k) for k in ANOTACIONES) and (base_de(mo) or "fuente") != "fuente":
            errores.append(f"{que}: `ovalo`, `flecha` y `mano` señalan un texto de una captura: van en un momento con `fuente` o que sigue a uno")
        if mo.get("entra") and mo["entra"] not in ENTRADAS:
            errores.append(f"{que}: `entra` es una de {', '.join(sorted(ENTRADAS))}")
        for r in rotulos_de(mo):
            if not str(r.get("texto") or "").strip():
                errores.append(f"{que}: un rótulo sin `texto`")
            elif r.get("estilo", "crema") not in ESTILOS:
                errores.append(f"{que}: el estilo de un rótulo es uno de {', '.join(sorted(ESTILOS))}")
            elif normal(r["texto"]) and busca(g.dichas, r["texto"]) >= 0 and len(palabras_de(r["texto"])) > 2:
                errores.append(f"{que}: el rótulo «{r['texto']}» copia lo que dice la voz; pone lo que la voz no dice (la cifra "
                               "exacta, el nombre, la fecha, la ironía)")
    for nombre, f in fuentes.items():
        if not str(f.get("url") or "").startswith("http"):
            errores.append(f"fuentes.{nombre}: falta su `url`")
        if not f.get("pie"):
            errores.append(f"fuentes.{nombre}: falta `pie`, lo que se lee bajo la captura («sitio.com · 29 oct 2026»)")
    # Una URL escrita de memoria que casi es la de una página leída: en la cuarta corrida larga costó un hacer.py entero
    # («no se dejó capturar y no está leída»). La URL se copia de fuentes/fichas/citas.json.
    sys.path.insert(0, str(SKILL / "scripts"))
    from verificar import clave, textos
    indice = RAIZ / "fuentes" / "textos" / "indice.json"
    leidas = {clave(u): u for u in (json.loads(indice.read_text(encoding="utf8")) if indice.exists() else {})}
    for nombre, f in fuentes.items():
        url = str(f.get("url") or "")
        if url.startswith("http") and leidas and clave(url) not in leidas and clave(url) not in textos():
            import difflib
            casi = difflib.get_close_matches(clave(url), list(leidas), n=1, cutoff=0.75)
            if casi:
                errores.append(f"fuentes.{nombre}: esa URL no es la de la página que leíste; la suya es {leidas[casi[0]]} (cópiala de "
                               "fuentes/fichas/citas.json, no de memoria)")
    errores += citas_en_su_pagina(m)
    if errores:
        return [], errores, avisos

    # De quién es cada palabra: primero las tarjetas de la marca, luego cada momento desde su palabra.
    n = len(g.crudas)
    de: list[object] = [None] * n
    for a in autos:
        for i in range(a["desde"], a["hasta"]):
            de[i] = a["id"] + str(a["desde"])
    inicio = [g.cruda_de[i] for i in indices]
    for k, mo in enumerate(momentos):
        if de[inicio[k]] is not None:
            errores.append(f"{que_de(mo, k)}: cae en la frase del logo o en la despedida, que pone la marca sola; quítalo")
            continue
        fin = inicio[k + 1] if k + 1 < len(momentos) else n
        i = inicio[k]
        while i < fin and de[i] is None:
            de[i] = k
            i += 1
    # Lo que quedó suelto (antes del primer momento, o tras una tarjeta de la marca) es del momento que sigue.
    i = 0
    while i < n:
        if de[i] is not None:
            i += 1
            continue
        j = i
        while j < n and de[j] is None:
            j += 1
        siguiente = de[j] if j < n and isinstance(de[j], int) else None
        if siguiente is None or j - i > SUELTAS:
            errores.append(f"«{g.texto(i, min(j, i + 8))}…» ({j - i} palabras) no tiene momento: pon uno que empiece ahí")
        else:
            for x in range(i, j):
                de[x] = siguiente
            inicio[siguiente] = i
        i = j
    if errores:
        return [], errores, avisos

    plan, i = [], 0
    while i < n:
        j = i
        while j < n and de[j] == de[i]:
            j += 1
        if isinstance(de[i], int):
            plan.append({"desde": i, "hasta": j, "k": de[i], "mo": momentos[de[i]]})
        else:
            plan.append({"desde": i, "hasta": j, "auto": next(a for a in autos if a["desde"] == i)})
        i = j
    # Después de una tarjeta de la marca no queda nada en pantalla: lo que sigue lleva su base.
    visto = False
    for b in plan:
        if "auto" in b:
            visto = False
        elif base_de(b["mo"]):
            visto = True
        elif not visto:
            errores.append(f"{que_de(b['mo'], b['k'])}: va justo después de la tarjeta de la marca y no lleva base: ponle lo que se ve "
                           "(una `fuente` con su cita, un `titular`, un `meme`…)")
    # Las secciones: cada `##` empieza en un beat (ahí va la interferencia) y da nombre a su párrafo.
    # Si un `##` cae a medio momento, la sección empieza en el momento que sigue (un par de segundos después): pedir un
    # momento justo ahí era un ✗ en cada episodio largo del eval, y la interferencia no necesita la palabra exacta.
    seccion, pendientes = "intro", sorted(g.secciones)
    for b in plan:
        while pendientes and pendientes[0] <= b["desde"]:
            seccion = g.secciones[pendientes.pop(0)]
            if "mo" in b:
                b["seccion"] = True
        b["parrafo"] = b["auto"]["id"] if "auto" in b else seccion

    # El ritmo, medido en palabras (3 por segundo).
    propios = [b for b in plan if "mo" in b]
    palabras = sum(b["hasta"] - b["desde"] for b in propios)
    for b in propios:
        largo = b["hasta"] - b["desde"]
        if largo > LARGO and not b["mo"].get("quieto") and cambios_de(b["mo"]) < largo / 8:
            errores.append(f"{que_de(b['mo'], b['k'])}: dura {largo} palabras (~{largo / POR_SEGUNDO:.0f} s) sin que "
                           "nada cambie; pártelo (otra cita de la misma página, un rótulo en su palabra, un recorte) o, si la "
                           "voz lee un documento, ponle `\"quieto\": true`")
    piezas = sum(len((b["mo"].get("diagrama") or {}).get(k) or []) for b in propios for k in ("nodos", "flechas", "cambios"))
    if palabras / (len(propios) + piezas) > RITMO:
        errores.append(f"va lento: {len(propios)} momentos para {palabras} palabras ({palabras / len(propios) / POR_SEGUNDO:.1f} s cada "
                       f"uno). Algo nuevo cada 3 s: unos {round(palabras / (RITMO - 1))} momentos")
    minutos = palabras / POR_SEGUNDO / 60
    n_rotulos = sum(len(rotulos_de(b["mo"])) for b in propios)
    if minutos >= 0.4 and n_rotulos / minutos < ROTULOS_POR_MINUTO:
        errores.append(f"{n_rotulos} rótulos en {minutos:.1f} min: van de 4 a 7 por minuto (la cifra exacta, el nombre, la fecha, "
                       "lo que la voz calla)")
    # Los chistes que solo están en la imagen: en las referencias son 6 por minuto; aquí se pide el piso.
    chistes = sum(bool(b["mo"].get(k)) for b in propios for k in ("meme", "clip", "sello")) + sum(bool(r.get("tacha")) for b in propios for r in rotulos_de(b["mo"]))
    if minutos >= 1 and chistes / minutos < CHISTES_POR_MINUTO:
        errores.append(f"{chistes} chistes visuales en {minutos:.1f} min: al menos uno por minuto (un `meme`, un `clip`, un `sello`, un "
                       "rótulo con `tacha`), en la frase que lo pide")
    # Material real: lo que va sobre una captura o un clip, contando lo que sigue sobre ellos.
    real, sobre = 0, False
    for b in propios:
        base = base_de(b["mo"])
        sobre = base in ("fuente", "clip") if base else sobre
        real += (b["hasta"] - b["desde"]) if sobre else 0
    if real / palabras < PRUEBA:
        errores.append(f"solo el {real / palabras:.0%} de la voz va sobre material real (capturas y clips): que pase del "
                       f"{PRUEBA:.0%}; un titular es para el remate, no para un dato que tiene fuente")
    if base_de(propios[0]["mo"]) == "titular":
        avisos.append("el episodio abre con un titular: abre con la prueba o el clip de la noticia, y el titular después")
    return plan, errores, avisos


def parrafo_de(url: str | None, cita: str) -> str:
    """El párrafo de la página (de su texto ya leído) donde está la cita, o nada si no se leyó o no la trae."""
    if not url or not cita:
        return ""
    sys.path.insert(0, str(SKILL / "scripts"))
    from verificar import clave, norm, textos
    archivo = textos().get(clave(url))
    if not archivo or not archivo.exists():
        return ""
    sin = lambda t: re.sub(r"\s+", "", norm(t))
    return next((l for l in archivo.read_text(encoding="utf8").splitlines() if sin(cita) in sin(l)), "")


def citas_en_su_pagina(m: dict) -> list[str]:
    """
    Cada cita, literal en el texto ya leído de su página (`fuentes/textos/`, de leer.mjs, buscar.mjs o
    preinvestigar.mjs): es la verificación del dato y lo que después se resalta, en una sola cosa. Una página que no se
    leyó no se comprueba aquí: lo dirá la captura.
    """
    sys.path.insert(0, str(SKILL / "scripts"))
    from verificar import clave, norm, parecido, textos
    leidos, errores, cache = textos(), [], {}
    # Un short de un plan: lo leído es del plan (short.py lo enlaza en fuentes/plan).
    del_plan = RAIZ / "fuentes" / "plan" / "textos"
    if (del_plan / "indice.json").exists():
        for url, e in json.loads((del_plan / "indice.json").read_text(encoding="utf8")).items():
            leidos.setdefault(clave(url), del_plan / e["archivo"])
    for k, mo in enumerate(m.get("momentos") or []):
        url = ((m.get("fuentes") or {}).get(mo.get("fuente")) or {}).get("url")
        archivo = leidos.get(clave(url)) if url and mo.get("cita") else None
        if not archivo or not archivo.exists():
            continue
        texto = cache.setdefault(archivo, norm(archivo.read_text(encoding="utf8")))
        junto = cache.setdefault(str(archivo), re.sub(r"\s+", "", texto))  # el código de una página cambia sus espacios
        for cita in [mo["cita"]] + [t for tipo, t, _ in anotados(mo) if tipo == "cajas"]:
            if re.sub(r"\s+", "", norm(cita)) not in junto:
                errores.append(f"{que_de(mo, k)}: la cita no está tal cual en {archivo.as_posix()}. "
                               f"Tú: «{cita}». La página: «{parecido(norm(cita), texto)}»")
    return errores


def en_ingles(frase: str) -> bool:
    """Como `ubicar.en_ingles`, sin cargar el OCR: por sus palabras."""
    ing = set("the of and to is are was were be been it its that this these those for on with as by at from has have had "
              "not will would can could should may might must just but or we you they he she our their his her than into "
              "about more most which who what when how why if so do does did an all also only over after said says new "
              "there here out up no yes".split())
    esp = set("el la los las de del que y en un una por para con es se su sus lo al más pero como este esta".split())
    ps = re.findall(r"[a-záéíóúñü']+", frase.lower())
    return sum(p in ing for p in ps) > sum(p in esp for p in ps) + 3 * bool(re.search(r"[áéíóúñ¿¡]", frase.lower()))


# --- las capturas ------------------------------------------------------------------------------------------------------


def citas_de(m: dict) -> dict[str, list[str]]:
    """Por fuente, sus citas distintas en el orden en que salen: cada una es un recorte de la página."""
    por: dict[str, list[str]] = {}
    for mo in m.get("momentos") or []:
        if mo.get("fuente") is None:
            continue
        lista = por.setdefault(mo["fuente"], [])
        if mo.get("cita") and mo["cita"] not in lista:
            lista.append(mo["cita"])
    return por


def png_de(m: dict, fuente: str, cita: str) -> str:
    """
    El archivo de public/ con el recorte de esa cita: `web/<fuente>-<huella de la cita>.png`. Va por la cita y no por su
    número para que quitar o mover un momento no cambie el nombre de las demás (y no se vuelvan a capturar). Sin cita, el
    de la primera de esa fuente; una fuente sin ninguna cita es `web/<fuente>.png`, la página como se ve al abrirla.
    """
    lista = citas_de(m)[fuente]
    cita = cita or (lista[0] if lista else "")
    return f"web/{fuente}-{hashlib.sha1(cita.encode()).hexdigest()[:8]}.png" if cita else f"web/{fuente}.png"


def lista_capturas(m: dict, hechas=lambda png: False) -> list[dict]:
    """
    La lista de capturar.mjs: una carga por página y un recorte por cita que falte (`hechas(png)` dice cuáles ya están).
    pagina.mjs los numera (`<fuente>-1.png`…, o `<fuente>.png` si es uno): `nombres` dice cómo se llama cada uno después.
    """
    fuera = []
    for fuente, citas in citas_de(m).items():
        f = m["fuentes"][fuente]
        extra = {k: f[k] for k in ("ancho", "alto", "escala", "tema", "elemento", "contexto") if k in f}
        faltan = [c for c in citas if not hechas(png_de(m, fuente, c))]
        if citas and not faltan or not citas and hechas(png_de(m, fuente, "")):
            continue
        base = f"fuentes/material/web/{fuente}--.png" if citas else f"fuentes/material/web/{fuente}.png"
        salen = [base] if len(faltan) <= 1 else [base.replace(".png", f"-{k + 1}.png") for k in range(len(faltan))]
        fuera.append({"url": f["url"], "png": base, **extra, **({"frase": faltan[0] if len(faltan) == 1 else faltan} if faltan else {}),
                      "nombres": {sale: "fuentes/material/" + png_de(m, fuente, c) for sale, c in zip(salen, faltan)}})
    return fuera


# --- de momentos a escenas ---------------------------------------------------------------------------------------------


class Director:
    def __init__(self, m: dict, g: Guion, mc: dict, ajustes: dict[int, set[str]] | None = None) -> None:
        # `ajustes`: por momento, lo que tapó su cita la vez anterior («logos», «rotulos») y va esta vez al otro lado.
        self.ajustes, self.actual = ajustes or {}, -1
        self.recorridas: set = set()  # las páginas que ya salieron: la primera toma de cada una baja hasta su cita
        sys.path.insert(0, str(RAIZ))
        import ubicar  # el del episodio: lee su public/ y guarda su OCR
        self.u, self.m, self.g, self.mc = ubicar, m, g, mc
        self.formato = formato()
        ubicar.fijar_formato(self.formato)
        self.pantalla = (1080, 1156) if self.formato == "vertical" else (1920, 1080)
        self.faltan: set[str] = set()
        self.errores: list[str] = []
        self.avisos: list[str] = []
        self.con_placa: set[str] = set()
        self.material: list[tuple[str, str, str]] = []

    def hay(self, archivo: str) -> bool:
        if self.u.existe(archivo):
            return True
        self.faltan.add(archivo.split("@")[0])
        return False

    def tam(self, img: str) -> tuple[int, int]:
        if not self.hay(img):
            return self.pantalla
        from PIL import Image
        with Image.open(PUBLICO / img) as im:
            return im.size

    def clara(self, img: str) -> bool:
        """Una página de fondo claro (el resaltador cambia de mezcla): por la luz de la captura entera."""
        from PIL import Image, ImageStat
        with Image.open(PUBLICO / img) as im:
            return ImageStat.Stat(im.convert("L").resize((64, 64))).mean[0] > 140

    def intenta(self, que: str, f, *a, **kw):
        """
        Lo que `ubicar` no encuentra para con SystemExit; aquí se junta con lo demás y se dice de una vez. Sus avisos de
        traducción no se repiten: lo que no cabe limpio en su lugar va en una nota (`captura`).
        """
        ruido = io.StringIO()
        try:
            with contextlib.redirect_stderr(ruido):
                return f(*a, **kw)
        except SystemExit as e:
            self.errores.append(f"{que}: {e}")
            return None
        finally:
            for linea in ruido.getvalue().splitlines():
                if linea.startswith("aviso:") and "aparece" in linea:
                    self.avisos.append(f"{que}: {linea[7:]}; la segunda es `\"ocurrencia\": 2` en el momento (la cita) o "
                                       '`{"texto": "…", "ocurrencia": 2}` en su óvalo, flecha o caja')

    def trae(self, img: str, cita: str) -> bool:
        try:
            return bool(cita) and bool(self.u.buscar(img, cita))
        except SystemExit:
            return False

    def captura(self, que: str, mo: dict, previo: dict | None) -> dict:
        fuente, cita = mo["fuente"], mo.get("cita") or ""
        img = png_de(self.m, fuente, cita)
        # Si la cita está en la captura que ya se ve (la misma página), la cámara baja a ella: una sola toma.
        misma = previo and previo.get("tipo") == "captura" and previo.get("_fuente") == fuente
        if misma and previo["img"] != img and self.hay(previo["img"]) and self.trae(previo["img"], cita):
            img = previo["img"]
        w, h = self.tam(img)
        v: dict = {"tipo": "captura", "img": img, "w": w, "h": h, "_fuente": fuente, "_cita": cita, "empuje": self.m.get("empuje", EMPUJE)}
        sigue = bool(misma and previo["img"] == img)
        aqui = self.hay(img)
        zona = self.intenta(que, self.u.zona, img, cita) if aqui and cita else None
        if sigue:
            v["sigue"] = True
            if cita and cita != previo.get("_cita"):
                v["limpia"] = True
                if zona:
                    v["camara"] = [{"r": zona, "t": 0, "dura": 14}]
        else:
            v["fuente"] = self.m["fuentes"][fuente]["pie"]
            if zona:
                v["vista"] = zona
            if aqui and self.clara(img):
                v["claro"] = True
        marcas = []
        if aqui and cita and not mo.get("sin_marca") and not (sigue and cita == previo.get("_cita")):
            # En su lugar solo si mide como el inglés (de 75 a 130 %): más corta deja huecos y más larga no cabe.
            en_sitio = mo.get("es") if mo.get("es") and 0.75 <= len(mo["es"]) / len(cita) <= 1.3 else None
            hechas = self.intenta(que, self.u.marca_texto, img, cita, t=0, es=en_sitio,
                                  **{k: mo[k] for k in ("peso", "italica", "serif", "ocurrencia") if k in mo}) or []
            if hechas and hechas[0].get("ingles") and mo.get("es"):
                # La traducción no quedó limpia en su lugar (la cita es un pedazo de su oración, o el español deja un
                # hueco): el inglés se queda resaltado y el español va en una nota abajo. El 19 de octubre, 30 de 89
                # traducciones salieron a medias, y arreglar cada una era otra vuelta del agente.
                del hechas[0]["ingles"]
                v["_nota"] = "\n".join(textwrap.wrap(mo["es"], 38))
            marcas += hechas
        cajas = mo.get("cajas") or []
        for c in cajas if isinstance(cajas, list) else [cajas]:  # una sola llega a veces como texto, no como lista
            c = {"texto": c} if isinstance(c, str) else c
            if aqui:
                # Una caja que no se encuentra en la captura no tumba el episodio: va sin ella, y se dice (en la tercera
                # corrida corta costó un hacer.py entero, con un ValueError sin momento ni frase).
                n = len(self.errores)
                try:
                    caja = self.intenta(que, self.u.caja_texto, img, c["texto"], ocurrencia=int(c.get("ocurrencia", 1)), **({"en": c["en"]} if c.get("en") else {"t": 0}))
                except ValueError:
                    caja = None
                if caja is None:
                    del self.errores[n:]
                    self.avisos.append(f"{que}: la caja «{c['texto']}» no está en la captura; va sin ella")
                if caja and caja.get("ingles") and len(c["texto"].split()) > 5:
                    self.errores.append(f"{que}: la caja «{c['texto']}» es una oración en inglés: va como `cita` con su `es`; "
                                        "en caja van un nombre, una cifra o código")
                elif caja:
                    caja.pop("ingles", None)
                    marcas.append(caja)
        marcas += self.anotaciones(que, mo, img) if aqui else []
        if marcas:
            v["marcas"] = marcas
        self.material.append((mo["palabra"], f"{self.m['fuentes'][fuente]['pie']} ({self.m['fuentes'][fuente]['url']})" + (f" · «{cita}»" if cita else ""), f"public/{img}"))
        return v

    def anotaciones(self, que: str, mo: dict, img: str) -> list[dict]:
        """El óvalo, la flecha y la mano sobre un texto de la captura: se dibujan donde está, y siguen a la cámara."""
        fuera = []
        for tipo, texto, ocurrencia in anotados(mo):
            if tipo == "cajas":
                continue
            try:
                with contextlib.redirect_stderr(io.StringIO()):
                    caja = self.u.caja_texto(img, texto, t=0, ocurrencia=ocurrencia)
            except SystemExit:
                # No está en este recorte: el episodio sale sin esa anotación, y se dice.
                self.avisos.append(f"{que}: `{tipo}` «{texto}» no está en la captura; va sin él")
                continue
            caja.pop("ingles", None)
            fuera.append({**caja, "tipo": tipo})
        return fuera

    def clip(self, mo: dict, previo: dict | None) -> dict:
        c = mo["clip"]
        if isinstance(c, str) and c.startswith("tema@"):
            src, desde = TEMA, float(c.split("@")[1])
        else:
            datos = self.m["clips"][c] if isinstance(c, str) else c
            src, desde = f"videos/{c}.mp4" if isinstance(c, str) else datos["src"], 0
        desde = mo.get("desde", desde)
        self.hay(src)
        v = {"tipo": "captura", "clip": src, "desde": desde, "completo": True}
        for k in ("encuadre", "etiqueta", "velocidad"):
            if k in mo:
                v[k] = mo[k]
        if self.formato == "vertical" and "encuadre" not in v and src != TEMA:
            v["encuadre"] = "ajusta"  # un meme o una escena se ven enteros; el recorte es para una parte del video del tema
        self.material.append((mo["palabra"], "metraje" if src != TEMA else f"el video del tema, segundo {desde:g}", f"public/{src}"))
        return v

    def base(self, que: str, mo: dict, previo: dict | None) -> dict | None:
        tipo = base_de(mo)
        if tipo == "fuente":
            return self.captura(que, mo, previo)
        if tipo == "clip":
            return self.clip(mo, previo)
        if tipo == "titular":
            v = {"tipo": "titular", "texto": mo["titular"], "color": mo.get("color", "fuego")}
            for k, clave in (("emoji", "emoji"), ("emoji2", "emoji2")):
                if mo.get(k):
                    v[clave] = f"emoji/{mo[k]}.png"
                    self.hay(v[clave])
            if mo.get("persona"):
                v["img"] = f"recortes/{mo['persona']}.png"
                self.hay(v["img"])
            return v
        if tipo == "imagen":
            img = mo["imagen"]
            img = f"web/img-{img}.jpg" if img in (self.m.get("imagenes") or {}) else img
            w, h = self.tam(img)
            self.material.append((mo["palabra"], (self.m.get("imagenes") or {}).get(mo["imagen"], {}).get("url", "imagen"), f"public/{img}"))
            return {"tipo": "captura", "img": img, "w": w, "h": h, "encuadre": mo.get("encuadre", "cubre"), **({"fuente": mo["pie"]} if mo.get("pie") else {})}
        if tipo == "diagrama":
            d = json.loads(json.dumps(mo["diagrama"]))
            for n in d.get("nodos") or []:
                if n.get("logo"):
                    n["logo"] = f"logos/{n['logo']}.png"
                    self.hay(n["logo"])
            self.material.append((mo["palabra"], "gráfico propio: diagrama", "—"))
            return {"tipo": "diagrama", **d}
        if tipo == "meme":
            img = f"web/meme-{memes.slug(mo['meme'])}.jpg"
            self.hay(img)
            self.material.append((mo["palabra"], f"meme: {mo['meme']}", f"public/{img}"))
            return {"tipo": "meme", "img": img, **({"etiquetas": mo["etiquetas"]} if mo.get("etiquetas") else {})}
        if tipo == "v":
            return dict(mo["v"])
        return None

    def encima(self, mo: dict, v: dict, cuando: dict) -> list[dict]:
        """
        Rótulos y recortes donde no tapan lo citado. La vista de una captura se centra en su cita, así que quedan libres
        arriba y abajo: el primer rótulo va abajo, el segundo arriba, y el recorte, chico, en una esquina de abajo. Fue la
        mayoría de los arreglos de las revisiones a mano (el-diff-7 y el-diff-8).
        """
        con_cita = v.get("tipo") == "captura" and bool(v.get("img")) and (v.get("marcas") or v.get("_cita"))
        fuera = []
        sitios = [0.88, 0.12, 0.5] if con_cita else [0.84, 0.14, 0.5]
        mover = self.ajustes.get(self.actual, set())
        if "rotulos" in mover:
            sitios = [sitios[1], sitios[0], sitios[2]]
        # Las pegatinas: las que ya estaban en esta toma se quedan quietas y las nuevas caen de golpe, hasta tres, en las
        # esquinas de arriba (a media altura si arriba va un rótulo o abajo la nota de la traducción).
        nuevos = [x for x in logos_de(mo) if x not in v.get("_logos", [])]
        v["_logos"] = (v.get("_logos", []) + nuevos)[-3:]
        alto_logos = 0.3 if v.get("_nota") and "nota" in mover or len(rotulos_de(mo)) > 1 else 0.1
        # Si tapan la cita, bajan, y se quedan abajo lo que dure la toma (que no brinquen de un momento a otro). También
        # cuando el rótulo de arriba la tapaba: la cita abre la página, y la pegatina de la esquina cae sobre su renglón.
        if "logos" in mover or ("rotulos" in mover and v.get("_nota") and "nota" not in mover):
            v["_logos_alto"] = 0.6 if v.get("_nota") else 0.86
        alto_logos = v.get("_logos_alto", alto_logos)
        for i, x in enumerate(v["_logos"]):
            self.hay(f"logos/{x}.png")
            fuera.append({"tipo": "logo", "img": f"logos/{x}.png", "x": (0.88, 0.12, 0.88)[i], "y": alto_logos + (0.17 if i == 2 else 0), "tam": 150,
                          "giro": (8, -10, -6)[i], **(cuando if x in nuevos else {"t": 0, "quieto": True})})
        if v.get("_nota"):
            # Abajo de la cita; si la cita es tan alta que la nota cae sobre ella (`mover`), arriba.
            arriba = "nota" in mover
            fuera.append({"tipo": "rotulo", "estilo": "traduccion", "texto": v["_nota"], "t": 0 if v.get("sigue") and not v.get("marcas") else 0.12,
                          "y": 0.13 if arriba else 0.86})
            # El rótulo, al lado que deja libre la nota; si ahí está la cita (`mover`: la cita abre la página y la vista
            # no puede centrarla), en medio, sobre el texto que no se cita. En la tercera corrida larga el cambio de lado
            # se perdía aquí y el rótulo seguía sobre la cita.
            sitios = [0.9, 0.5] if arriba else [0.1, 0.5]
            if "rotulos" in mover:
                sitios.reverse()
        persona = mo.get("persona") if v.get("tipo") != "titular" else None
        if persona:
            datos = self.m["personas"][persona]
            archivo = f"recortes/{persona}.png"
            self.hay(archivo)
            x = datos.get("x", 0.82)
            chico = con_cita and self.formato == "vertical"
            # El recorte chico va en la esquina de abajo; si ahí está la cita (`mover`), a la izquierda y arriba de ella.
            sube = chico and "persona" in mover
            pegado = {"tipo": "pegado", "img": archivo, **cuando, "x": 0.85 if chico else x, "alto": 0.3 if chico else 0.72,
                      "entra": "sube" if chico else ("izquierda" if x < 0.5 else "derecha")}
            if sube:
                pegado.update(x=0.16, alto=0.26, entra="golpe", y=0.42 if "nota" in mover else 0.24)
            fuera.append(pegado)
            if datos.get("placa") and persona not in self.con_placa:
                self.con_placa.add(persona)
                fuera.append({"tipo": "rotulo", "texto": datos["placa"], "estilo": "placa", **cuando, "x": pegado["x"],
                              "y": pegado["y"] + 0.16 if sube else 0.93, "tam": 44 if chico else 56})
            if not sube:
                sitios = [s for s in sitios if s <= 0.5] if chico else [0.14, 0.5]
        for r in rotulos_de(mo):
            texto = str(r["texto"])
            cifra = bool(re.search(r"\d", texto)) and not re.search(r"\b(LUN|MAR|MI[ÉE]|JUE|VIE|S[ÁA]B|DOM|" + "|".join(MESES.values()) + r")\b", texto.upper())
            estilo = r.get("estilo") or ("banda" if cifra else "crema")
            e = {"tipo": "rotulo", "texto": texto, "estilo": estilo, **cuando}
            if estilo == "banda":
                e["color"] = r.get("color", "amarilla")
            if estilo in ("banda", "rojo"):
                e["giro"] = r.get("giro", -6)
            numero = re.search(r"\d[\d.,]*\d|\d", texto)
            anio = bool(numero) and re.fullmatch(r"(19|20)\d\d", numero.group()) and not re.search(r"[$€£%]", texto)
            if cifra and estilo == "banda" and "corre" not in r and "tacha" not in r and numero and not anio and int(digitos(numero.group()) or 0) >= 20:
                e["corre"] = 0  # la cifra cuenta hasta la suya (`"corre": false` en el rótulo la deja quieta)
            e["y"] = r["y"] if "y" in r else sitios.pop(0) if sitios else 0.5
            for k in ("x", "tam", "giro", "color", "tinta", "hasta", "minusculas", "tacha"):
                if k in r:
                    e[k] = r[k]
            if isinstance(r.get("corre"), (int, float)) and not isinstance(r.get("corre"), bool):
                e["corre"] = r["corre"]
            fuera.append(e)
        if mo.get("sello"):
            sello = {"texto": mo["sello"]} if isinstance(mo["sello"], str) else mo["sello"]
            fuera.append({"tipo": "rotulo", "estilo": "sello", "texto": sello["texto"], "color": sello.get("color", "roja"), **cuando,
                          "x": sello.get("x", 0.56), "y": sello.get("y", (0.9 if "sello" in mover else 0.7) if con_cita else 0.55)})
        return fuera + list(mo.get("encima") or [])

    def compilar(self, plan: list[dict]) -> dict:
        g = self.g
        salida = {"voz": "grabada", "formato": self.formato,
                  "gancho": "\n".join(x.strip() for x in str(self.m.get("gancho") or "").split("/") if x.strip()), "parrafos": []}
        previo: dict | None = None  # la base que se está viendo
        ultimo: dict | None = None  # el último beat escrito
        n = 0
        for b in plan:
            say = g.texto(b["desde"], b["hasta"])
            if "auto" in b:
                v, que = dict(b["auto"]["v"]), ""
                previo = None
            else:
                mo = b["mo"]
                que = que_de(mo, b["k"])
                self.actual = b["k"]
                v = self.base(que, mo, previo)
                if v is None and previo is not None and previo.get("tipo") != "captura":
                    # Sobre un titular o una escena propia no hay toma que seguir: lo nuevo se pega encima del mismo beat,
                    # en su palabra (o a esa altura del beat, si la palabra ya salió antes).
                    antes = palabras_de(ultimo["say"])
                    primera = palabras_de(mo["palabra"])[0]
                    cuando = {"en": primera} if not any(w.startswith(primera) for w in antes) else None
                    ultimo["say"] += " " + say
                    total = len(palabras_de(ultimo["say"]))
                    ultimo["v"].setdefault("encima", []).extend(self.encima(mo, ultimo["v"], cuando or {"t": round(len(antes) / total, 2)}))
                    continue
                if v is None:
                    # Sigue la toma de la captura o del clip anterior, con algo nuevo encima.
                    v = {k: previo[k] for k in ("tipo", "img", "w", "h", "clip", "desde", "completo", "encuadre", "empuje", "_fuente", "_cita", "_nota", "_logos", "_logos_alto") if k in previo}
                    v["sigue"] = True
                    if v.get("img") and self.hay(v["img"]) and (notas := self.anotaciones(que, mo, v["img"])):
                        v["marcas"] = notas
                enc = self.encima(mo, v, {"t": 0})
                if enc:
                    v["encima"] = enc
                # El corte seco es lo normal; el chiste (un meme, un clip) entra con un parpadeo, y la captura de otra página
                # cae como un papel sobre la que se estaba viendo.
                otra_pagina = (v.get("tipo") == "captura" and v.get("img") and not v.get("sigue") and base_de(mo) == "fuente"
                               and previo is not None and previo.get("tipo") == "captura" and previo.get("_fuente") != v.get("_fuente"))
                entra = mo.get("entra") or ("flash" if base_de(mo) in ("meme", "clip") else "papel" if otra_pagina else None)
                # La primera vez que sale una página, la toma baja desde su encabezado hasta la cita.
                if v.get("tipo") == "captura" and v.get("img") and not v.get("sigue") and base_de(mo) == "fuente" and v.get("_fuente") not in self.recorridas:
                    self.recorridas.add(v.get("_fuente"))
                    v["recorre"] = True
                if entra:
                    v["entra"] = entra
                previo = v
            if b.get("seccion"):
                v["seccion"] = True
            n += 1
            if not salida["parrafos"] or salida["parrafos"][-1]["id"] != b["parrafo"]:
                salida["parrafos"].append({"id": b["parrafo"], "beats": []})
            ultimo = {"id": f"b{n:02d}", "say": say, "v": v, **({"momento": b["k"] + 1} if "mo" in b else {})}
            salida["parrafos"][-1]["beats"].append(ultimo)
        for p in salida["parrafos"]:
            for beat in p["beats"]:
                for k in [k for k in beat["v"] if k.startswith("_")]:
                    del beat["v"][k]
        return salida


def cargar() -> tuple[dict, Guion, dict]:
    return leer(RAIZ), Guion(), marca()


def revisar(m: dict, g: Guion, mc: dict) -> list[dict]:
    plan, errores, avisos = planear(m, g, mc)
    for a in avisos:
        print(f"aviso: {a}")
    parar(errores)
    return plan


def escribir(m: dict, g: Guion, mc: dict, plan: list[dict], ajustes: dict[int, set[str]] | None = None) -> tuple[dict, Director]:
    """guion.json, los renglones de cada captura (para el encuadre vertical) y material.md, lo que enseña la etapa «Material»."""
    d = Director(m, g, mc, ajustes)
    guion = d.compilar(plan)
    guardar(RAIZ / "guion.json", guion)
    capturas = sorted({b["v"]["img"] for p in guion["parrafos"] for b in p["beats"]
                       if b["v"].get("tipo") == "captura" and b["v"].get("img") and d.u.existe(b["v"]["img"])})
    d.u.guardar(RAIZ / "src" / "lineas.json", json.dumps({img: d.u.renglones(img) for img in capturas}))
    filas = "\n".join(f"| {frase} | {fuente} | {archivo} |" for frase, fuente, archivo in d.material)
    (RAIZ / "material.md").write_text(f"# Material\n\n| Desde | Fuente | Archivo |\n|---|---|---|\n{filas}\n", encoding="utf8", newline="\n")
    return guion, d


def sin_traducir(guion: dict) -> list[str]:
    return [f'{b["id"]} (momento {b.get("momento", "?")}): "{x["ingles"]}"' for p in guion["parrafos"] for b in p["beats"]
            for x in b["v"].get("marcas") or [] if isinstance(x, dict) and x.get("ingles")]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    orden = sys.argv[1] if len(sys.argv) > 1 else ""
    m, g, mc = cargar()
    plan = revisar(m, g, mc)
    if orden == "revisa":
        print(f"✓ momentos.json bien: {len(plan)} beats")
    else:
        guion, d = escribir(m, g, mc, plan)
        print(sum(len(p["beats"]) for p in guion["parrafos"]), "beats")
        if d.faltan:
            print("FALTA (aún no está en public/):", ", ".join(sorted(d.faltan)))
        for a in d.avisos:
            print(f"aviso: {a}")
        if pendientes := sin_traducir(guion):
            print(f"FALTA TRADUCIR ({len(pendientes)}):", "; ".join(pendientes))
        parar(d.errores)


if __name__ == "__main__":
    main()
