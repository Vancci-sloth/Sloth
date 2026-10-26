"""
Reparte las escenas entre los agentes que las escriben a la vez (paso 3 de la fase 2, «En paralelo»). Se corre en la
raíz del episodio, con guion.md entregado:

    python <skill>/scripts/repartir.py [--palabras 120] [--gancho "LÍNEA 1 / LÍNEA 2"]

1. Parte lo que se narra en bloques de unas `--palabras` (120: unos 12 a 15 beats), sin cortar una oración; una sección
   larga queda en dos o más bloques con el mismo id de párrafo, que guion.py junta.
2. Pone en `parrafos` de guion.py un `*bloque("<n>")` por bloque y, en su lugar, el logo y el final, que no escribe nadie
   (salen de la marca). Con `--gancho`, también el `GANCHO`.
3. Escribe fuentes/escenas/encargo.md: lo que todos leen y la tabla de quién escribe qué. Así cada agente se lanza con
   una línea («Lee fuentes/escenas/encargo.md y escribe el bloque 4»): en el-diff-7, escribir diez encargos largos uno
   tras otro tardó 2 minutos antes de que empezara el último.

Imprime cuántos bloques salieron: lanza ese número de agentes, todos en un mismo mensaje.
"""

import argparse
import json
import re
import unicodedata
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]


def slug(t: str) -> str:
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-") or "seccion"


def oraciones(texto: str) -> list[str]:
    return [o.strip() for o in re.split(r"(?<=[.!?…»])\s+(?=[¿¡«A-ZÁÉÍÓÚÑ0-9])", " ".join(texto.split())) if o.strip()]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--palabras", type=int, default=120)
    ap.add_argument("--gancho")
    a = ap.parse_args()
    raiz = Path.cwd()
    md = (raiz / "guion.md").read_text(encoding="utf8")
    secciones = [(m.group(1).strip(), m.group(2)) for m in re.finditer(r"^## ([^\n]+)\n(.*?)(?=^## |\Z)", md, re.M | re.S)]
    if not secciones:
        raise SystemExit("guion.md no tiene secciones `##`")

    # Bloques: (n, id, oraciones, si empieza la sección). El logo y el final van aparte.
    bloques, actual, fecha = [], None, None
    orden = []  # lo que va en `parrafos`, en orden: ("bloque", n) | ("logo",) | ("final",)
    for titulo, cuerpo in secciones:
        if titulo.lower() == "logo":
            fecha = re.search(r"Es (\d+) de (\w+) de (\d{4})", cuerpo)
            orden.append(("logo",))
            actual = None
            continue
        if titulo.lower() == "final":
            orden.append(("final",))
            actual = None
            continue
        pid, primera = slug(titulo), True
        for o in oraciones(cuerpo):
            if actual is None or len(" ".join(actual[2] + [o]).split()) > a.palabras:
                actual = [len(bloques) + 1, pid, [], primera]
                bloques.append(actual)
                orden.append(("bloque", actual[0]))
            actual[2].append(o)
            primera = False
        actual = None  # la sección siguiente empieza su bloque
    # Un bloque muy corto (el final de una sección) se junta con el anterior de la misma sección.
    for b in list(bloques):
        k = bloques.index(b)
        if k and len(" ".join(b[2]).split()) < a.palabras // 3 and bloques[k - 1][1] == b[1]:
            bloques[k - 1][2] += b[2]
            bloques.remove(b)
            orden.remove(("bloque", b[0]))
    numero = {b[0]: i + 1 for i, b in enumerate(bloques)}
    for b in bloques:
        b[0] = numero[b[0]]
    orden = [(x[0], numero[x[1]]) if x[0] == "bloque" else x for x in orden]

    # guion.py: `parrafos` con los bloques, el logo y el final.
    meses = {"enero": "ENE", "febrero": "FEB", "marzo": "MAR", "abril": "ABR", "mayo": "MAY", "junio": "JUN", "julio": "JUL",
             "agosto": "AGO", "septiembre": "SEP", "octubre": "OCT", "noviembre": "NOV", "diciembre": "DIC"}
    dia, mes, anio = fecha.groups() if fecha else ("1", "enero", "2026")
    renglones = []
    for x in orden:
        if x[0] == "bloque":
            renglones.append(f'    *bloque("{x[1]}"),')
        elif x[0] == "logo":
            renglones.append(f'    ("logo", [\n        (f"Es {dia} de {mes} de {anio}, y estás viendo {{MARCA[\'nombre\']}}.", '
                             f'{{"tipo": "logo", "fecha": "{dia} {meses.get(mes.lower(), mes[:3].upper())}, {anio}"}}),\n    ]),')
        else:
            renglones.append('    ("final", [\n        (MARCA["despedida"], {"tipo": "logo", "final": True}),\n'
                             '        *([(MARCA["invitacion"], {"tipo": "logo", "invitacion": True})] if MARCA.get("invitacion") else []),\n    ]),')
    g = (raiz / "guion.py").read_text(encoding="utf8")
    i, j = g.index("\nparrafos = ["), g.index("\nn = 0\n")
    g = g[:i] + "\n# Un párrafo por sección; los bloques los escriben los agentes de las escenas (repartir.py).\nparrafos = [\n" + \
        "\n".join(renglones) + "\n]\n" + g[j:]
    if a.gancho:
        # «LÍNEA 1 / LÍNEA 2»: el gancho va en dos renglones (blanco y rojo), separados por un salto de línea.
        gancho = json.dumps("\n".join(x.strip() for x in a.gancho.split("/")), ensure_ascii=False)
        g = re.sub(r'^GANCHO = .*$', lambda _: f"GANCHO = {gancho}", g, count=1, flags=re.M)
    (raiz / "guion.py").write_text(g, encoding="utf8")

    # El encargo de todos.
    esc = raiz / "fuentes" / "escenas"
    esc.mkdir(parents=True, exist_ok=True)
    filas = "\n".join(f"| {n} | `{pid}` | {'sí' if prim else 'no (sigue la sección)'} | «{os_[0][:70]}» | «{os_[-1][-70:]}» |"
                      for n, pid, os_, prim in bloques)
    (esc / "encargo.md").write_text(f"""# Las escenas de {raiz.name}

Eres uno de {len(bloques)} agentes que escriben a la vez las escenas de este episodio; cada uno, su bloque de la tabla.

1. Lee de una vez, en un mismo mensaje: el paso 3 de `{SKILL / 'SKILL.md'}` (Escenas), `{SKILL / 'ESCENAS.md'}`,
   `{SKILL / 'ejemplos' / 'vertical-guion.py'}`, `guion.md` (entero: el tono y los chistes que regresan), `material.md`
   y la lista de `public/` (`ls -R public/web public/videos public/recortes public/clips`). Las rutas van tal cual
   (`"web/x.png"`), sin constantes nuevas.
2. Escribe tu bloque en `fuentes/escenas/<n>.py`: una sola lista `[("<id>", [(frase, escena), ...])]` con las funciones
   de guion.py, sin `import` ni asignaciones. Tus `say`, juntos y en orden, son exactamente tus oraciones de guion.md,
   desde la primera hasta la última de la tabla, sin cambiar ni saltar palabras. El id es el de la tabla. Solo si la
   tabla dice «sí», tu primer beat lleva `seccion=True`; tu primer beat no lleva `sigue`.
3. Corre `python guion.py` y arregla todos los `aviso:` y `FALTA` de tu bloque (lo de otros bloques no es tuyo), hasta
   que no quede ninguno: cada aviso es algo que la revisión tendría que arreglar después, con otro render. Termina ahí y
   reporta en dos líneas. No toques otros archivos.

Lo que más se arregló en las revisiones (el-diff-7 y el-diff-8), para que no pase:
- Recortes y rótulos tapando la cita: sigue «Encima» de ESCENAS.md (en un beat con marcas, el recorte chico en una
  esquina de abajo y el rótulo fuera de la cita). Un rótulo no repite lo que dice la voz.
- Marcas heredadas: un beat con `sigue` que marca otra frase lleva `limpia=True` (guion.py lo avisa).
- Escenas en tira: una imagen más ancha que alta, o un clip en `encuadre="ajusta"` sin `vista` (guion.py lo avisa).
- La imagen corresponde a lo que dice la voz en ese beat, no al siguiente; una página se usa ya dibujada.

| Bloque | Párrafo | Empieza la sección | Desde | Hasta |
|---|---|---|---|---|
{filas}
""", encoding="utf8")
    print(f"{len(bloques)} bloques ({', '.join(str(len(' '.join(b[2]).split())) for b in bloques)} palabras); guion.py y "
          f"fuentes/escenas/encargo.md listos. Lanza {len(bloques)} agentes en un mismo mensaje, cada uno con: "
          f"«Lee {esc / 'encargo.md'} y escribe el bloque <n>.»")


if __name__ == "__main__":
    main()
