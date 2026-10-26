"""
La biblioteca de modelos 3D: buscar uno antes de hacerlo, traerlo al proyecto y guardar los nuevos.

    python -B -X utf8 modelos.py buscar [palabra…]        qué hay que sirva (sin palabras, todo)
    python -B -X utf8 modelos.py usar <id> [<id>…]         lo copia al proyecto, con lo que necesita [--pisa]
    python -B -X utf8 modelos.py iconos <nombre> […]       íconos de Phosphor a public/iconos (para Icono3D)
    python -B -X utf8 modelos.py guardar <id> --nombre "…" --resumen "…" --categoria "…" --descripcion "…"
                                          --hace "a; b" --etiquetas "a, b" [--cuadro N]
    python -B -X utf8 modelos.py vista <id> [<id>…]        vuelve a sacar su miniatura

Todo menos `buscar` se corre en la carpeta del proyecto (la que tiene package.json). Un modelo vive en el proyecto en
src/modelos/<id>.tsx (con src/modelos/comun.tsx) y sus archivos en public/modelos/<id>/; en la biblioteca, en
modelos/<id>/ con su modelo.json y su vista (vista.webp, la foto, y vista.webm, la cámara que se mece). Cada proyecto lleva su copia: guardar una versión nueva no rompe
los videos ya hechos.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from datetime import date
from pathlib import Path

BIBLIOTECA = Path(__file__).resolve().parent.parent
MODELOS = BIBLIOTECA / "modelos"
# Lo único que un modelo puede importar, además de comun y otros modelos: lo demás le llega por props.
PERMITIDOS = re.compile(r"^(react|react-dom|three|three/.+|@react-three/fiber|remotion|@remotion/.+)$")
ORDEN = ["nombre", "resumen", "categoria", "descripcion", "hace", "etiquetas", "exporta", "usa", "iconos", "cuadro", "origen", "creado", "actualizado"]
# Los tipos de modelo, en el orden en que Sloth los enseña. Uno nuevo se suma ahí, con su «para».
CATEGORIAS = [c["nombre"] for c in json.loads((BIBLIOTECA / "categorias.json").read_text("utf-8"))]
# Lo que la ficha tiene que traer cuando el modelo es nuevo.
PIDE = {
    "nombre": "su nombre («Caja fuerte»)",
    "resumen": "para qué sirve en pocas palabras («Caja fuerte que se abre»)",
    "categoria": f"su tipo ({', '.join(CATEGORIAS)})",
    "descripcion": "qué es y para qué sirve, en una o dos frases",
    "hace": "lo que puede hacer, separado por «;» («se abre; el candado se abre»)",
    "etiquetas": "las palabras con que se buscaría, separadas por comas",
}


def ficha(id_: str) -> dict:
    ruta = MODELOS / id_ / "modelo.json"
    if not ruta.exists():
        sys.exit(f"No hay «{id_}» en la biblioteca. Mira lo que hay: python -B -X utf8 {Path(__file__).name} buscar")
    return json.loads(ruta.read_text("utf-8"))


def todos() -> list[str]:
    return sorted(p.parent.name for p in MODELOS.glob("*/modelo.json"))


def plano(texto: str) -> str:
    """En minúsculas y sin acentos, para comparar."""
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")


def raiz(palabra: str) -> str:
    """El principio de la palabra, para que «monedas» encuentre «moneda» y «bloqueo», «bloqueado»."""
    p = plano(palabra)
    return p if len(p) <= 5 else p[: max(5, len(p) - 2)]


def buscar(palabras: list[str]) -> None:
    raices = [raiz(p) for p in palabras]
    filas = []
    for id_ in todos():
        m = ficha(id_)
        texto = plano(" ".join([id_, m["nombre"], m.get("resumen", ""), m.get("categoria", ""), m["descripcion"], *m.get("hace", []), *m["etiquetas"], *m["exporta"]]))
        puntos = sum(r in texto for r in raices)
        if raices and not puntos:
            continue
        filas.append((-puntos, id_, m))
    if not filas:
        print(f"Ninguno con «{' '.join(palabras)}». Hazlo con el formato de la biblioteca y guárdalo (SKILL.md, «Uno nuevo»).")
        print(f"Los que hay: {', '.join(todos())}")
        return
    for _, id_, m in sorted(filas):
        print(f"{id_} · {m['nombre']} · {m.get('categoria', '?')}  ({', '.join(m['exporta'])})")
        print(f"  {m['descripcion']}")
        if m.get("hace"):
            print(f"  hace: {'; '.join(m['hace'])}")
        print(f"  etiquetas: {', '.join(m['etiquetas'])}")
        vista = MODELOS / id_ / "vista.webp"
        print(f"  vista: {vista if vista.exists() else '(sin vista)'}  · de {m.get('origen', '?')}")
    print(f"\n{len(filas)} de {len(todos())}. Para traerlo: python -B -X utf8 {Path(__file__).name} usar <id>")


def proyecto() -> Path:
    aqui = Path.cwd()
    if not (aqui / "package.json").exists():
        sys.exit("Córrelo en la carpeta del proyecto (la que tiene package.json).")
    return aqui


def copia(origen: Path, destino: Path, pisa: bool) -> None:
    if destino.exists() and destino.read_bytes() != origen.read_bytes():
        if not pisa:
            print(f"  {destino.relative_to(Path.cwd())} ya existe y es distinto al de la biblioteca: se deja el tuyo (con --pisa, el de la biblioteca)")
            return
    destino.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(origen, destino)


def iconos(nombres: list[str]) -> None:
    """Los íconos de Phosphor (peso fill) que extruye Icono3D, de node_modules a public/iconos/<nombre>.svg."""
    fuente = Path("node_modules/@phosphor-icons/core/assets/fill")
    if not fuente.exists():
        sys.exit("No está @phosphor-icons/core en node_modules: npm i @phosphor-icons/core")
    destino = Path("public/iconos")
    destino.mkdir(parents=True, exist_ok=True)
    for n in nombres:
        svg = fuente / f"{n}-fill.svg"
        if not svg.exists():
            sys.exit(f"Phosphor no tiene «{n}»: búscalo en https://phosphoricons.com (el nombre en minúsculas con guiones)")
        # Sin el color del SVG: el ícono va del color que pida Icono3D.
        (destino / f"{n}.svg").write_text(svg.read_text("utf-8").replace(' fill="currentColor"', ""), "utf-8", newline="\n")


def usar(ids: list[str], pisa: bool = False, callado: bool = False) -> None:
    raiz_ = proyecto()
    orden: list[str] = []

    def junta(id_: str) -> None:
        if id_ in orden:
            return
        for otro in ficha(id_)["usa"]:
            junta(otro)
        orden.append(id_)

    for id_ in ids:
        junta(id_)
    src = raiz_ / "src" / "modelos"
    copia(BIBLIOTECA / "comun.tsx", src / "comun.tsx", pisa)
    for id_ in orden:
        m = ficha(id_)
        copia(MODELOS / id_ / f"{id_}.tsx", src / f"{id_}.tsx", pisa)
        archivos = MODELOS / id_ / "archivos"
        if archivos.exists():
            for a in archivos.rglob("*"):
                if a.is_file():
                    copia(a, raiz_ / "public" / "modelos" / id_ / a.relative_to(archivos), pisa)
        iconos(m["iconos"])
        if not callado:
            print(f'{id_}: import {{ {", ".join(m["exporta"])} }} from "../modelos/{id_}";')


def vista(ids: list[str]) -> None:
    raiz_ = proyecto()
    if not (raiz_ / "node_modules" / "@remotion" / "renderer").exists():
        sys.exit("Al proyecto le falta node_modules (con @remotion/renderer y @remotion/three).")
    src = raiz_ / "src" / "modelos"
    faltan = [i for i in ids if not (src / f"{i}.tsx").exists()]
    if faltan:
        usar(faltan, callado=True)
    # Con su número de proceso: varios agentes pueden sacar vistas a la vez en el mismo proyecto.
    n = f"_{os.getpid()}"
    muestras = raiz_ / "src" / "modelos" / f"_muestras{n}.ts"
    vitrina = raiz_ / "src" / "modelos" / f"_vitrina{n}.tsx"
    corre = raiz_ / "out" / f"_vitrina{n}.mjs"
    lineas = ['import type React from "react";']
    lineas += [f'import {{ Muestra as m{i} }} from "./{id_}";' for i, id_ in enumerate(ids)]
    lineas.append("export const MUESTRAS: Record<string, React.FC> = {")
    lineas += [f'  "{id_}": m{i},' for i, id_ in enumerate(ids)]
    lineas.append("};")
    try:
        muestras.write_text("\n".join(lineas) + "\n", "utf-8", newline="\n")
        vitrina_ = (BIBLIOTECA / "vitrina.tsx").read_text("utf-8").replace('"./_muestras"', f'"./_muestras{n}"')
        vitrina.write_text(vitrina_, "utf-8", newline="\n")
        corre.parent.mkdir(exist_ok=True)
        corre_ = (BIBLIOTECA / "scripts" / "vitrina.mjs").read_text("utf-8").replace("src/modelos/_vitrina.tsx", f"src/modelos/_vitrina{n}.tsx")
        corre.write_text(corre_, "utf-8", newline="\n")
        pares = [f"{id_}:{ficha(id_).get('cuadro', 0)}" for id_ in ids]
        r = subprocess.run(["node", str(corre), str(MODELOS), *pares], cwd=raiz_)
        if r.returncode:
            sys.exit("No salió la vista: mira el error de arriba (la Muestra tiene que verse sola, sin el resto del video).")
    finally:
        for temporal in (muestras, vitrina, corre):
            temporal.unlink(missing_ok=True)


def guardar(id_: str, dados: dict[str, str | None], cuadro: int | None, sin_vista: bool) -> None:
    raiz_ = proyecto()
    fuente = raiz_ / "src" / "modelos" / f"{id_}.tsx"
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", id_):
        sys.exit("El id va en minúsculas con guiones: «caja-fuerte».")
    if not fuente.exists():
        sys.exit(f"No está {fuente}: el modelo va en src/modelos/<id>.tsx.")
    texto = fuente.read_text("utf-8")
    if not re.search(r"^export const Muestra\b", texto, re.M):
        sys.exit("Le falta `export const Muestra: React.FC`: el modelo en un estado que se entienda, para su vista.")
    comun = raiz_ / "src" / "modelos" / "comun.tsx"
    if comun.exists() and comun.read_bytes() != (BIBLIOTECA / "comun.tsx").read_bytes():
        sys.exit("src/modelos/comun.tsx no es el de la biblioteca: lo que necesite este modelo va en su propio archivo.")
    usa = []
    for de in re.findall(r'from "([^"]+)"', texto):
        if de.startswith("./"):
            if de[2:] != "comun":
                ficha(de[2:])  # tiene que estar ya en la biblioteca
                usa.append(de[2:])
        elif not PERMITIDOS.match(de):
            sys.exit(f"Importa «{de}»: un modelo solo usa react, three, @react-three/fiber, remotion, ./comun y otros modelos. Lo del video (colores, imágenes) le llega por props.")
    exporta = [n for n in re.findall(r"^export (?:const|function|type) (\w+)", texto, re.M) if n != "Muestra"]
    # Los íconos de Phosphor que nombra entre comillas (y que el proyecto tiene en public/iconos).
    iconos_ = sorted(p.stem for p in (raiz_ / "public" / "iconos").glob("*.svg") if f'"{p.stem}"' in texto)

    destino = MODELOS / id_
    previo = json.loads((destino / "modelo.json").read_text("utf-8")) if (destino / "modelo.json").exists() else {}
    faltan = [f"--{k}: {v}" for k, v in PIDE.items() if not dados.get(k) and not previo.get(k)]
    if faltan:
        sys.exit("\n  ".join(["Falta en su ficha:", *faltan]))
    if dados.get("categoria") and dados["categoria"] not in CATEGORIAS:
        sys.exit(f"«{dados['categoria']}» no es un tipo: {', '.join(CATEGORIAS)}. Si de verdad hace falta otro, súmalo a categorias.json.")
    if len(dados.get("resumen") or "") > 45:
        sys.exit("El resumen es para leerse de un vistazo en Sloth: 45 letras como mucho.")
    lista = lambda texto, sep: [x.strip() for x in texto.split(sep) if x.strip()]  # noqa: E731
    hoy = date.today().isoformat()
    m = {
        **previo,
        "nombre": dados.get("nombre") or previo.get("nombre"),
        "resumen": dados.get("resumen") or previo.get("resumen"),
        "categoria": dados.get("categoria") or previo.get("categoria"),
        "descripcion": dados.get("descripcion") or previo.get("descripcion"),
        "hace": lista(dados["hace"], ";") if dados.get("hace") else previo.get("hace", []),
        "etiquetas": lista(dados["etiquetas"], ",") if dados.get("etiquetas") else previo.get("etiquetas", []),
        "exporta": exporta,
        "usa": sorted(set(usa)),
        "iconos": iconos_,
        "cuadro": cuadro if cuadro is not None else previo.get("cuadro", 0),
        "origen": previo.get("origen", raiz_.name),
        "creado": previo.get("creado", hoy),
        "actualizado": hoy,
    }
    destino.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(fuente, destino / f"{id_}.tsx")
    # Sus archivos, tal como están en el proyecto.
    publicos = raiz_ / "public" / "modelos" / id_
    if (destino / "archivos").exists():
        shutil.rmtree(destino / "archivos")
    if publicos.exists() and any(publicos.iterdir()):
        shutil.copytree(publicos, destino / "archivos")
    (destino / "modelo.json").write_text(json.dumps({k: m[k] for k in ORDEN}, ensure_ascii=False, indent=2) + "\n", "utf-8", newline="\n")
    print(f"{'actualizado' if previo else 'nuevo'}: {destino}", flush=True)
    if not sin_vista:
        vista([id_])


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="orden", required=True)
    sub.add_parser("buscar").add_argument("palabras", nargs="*")
    u = sub.add_parser("usar")
    u.add_argument("ids", nargs="+")
    u.add_argument("--pisa", action="store_true", help="cambia la copia del proyecto por la de la biblioteca")
    sub.add_parser("iconos").add_argument("nombres", nargs="+")
    g = sub.add_parser("guardar")
    g.add_argument("id")
    for campo in PIDE:
        g.add_argument(f"--{campo}")
    g.add_argument("--cuadro", type=int, help="el cuadro de la Muestra que sale en la vista")
    g.add_argument("--sin-vista", action="store_true")
    sub.add_parser("vista").add_argument("ids", nargs="+")
    a = p.parse_args()
    if a.orden == "buscar":
        buscar(a.palabras)
    elif a.orden == "usar":
        usar(a.ids, a.pisa)
    elif a.orden == "iconos":
        proyecto()
        iconos(a.nombres)
        print(", ".join(f"public/iconos/{n}.svg" for n in a.nombres))
    elif a.orden == "guardar":
        guardar(a.id, {k: getattr(a, k) for k in PIDE}, a.cuadro, a.sin_vista)
    else:
        vista(a.ids)


main()
