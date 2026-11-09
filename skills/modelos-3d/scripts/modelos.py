"""
La biblioteca de modelos 3D: buscar uno antes de hacerlo, traerlo al proyecto y guardar los nuevos.

    python -B -X utf8 modelos.py buscar [palabra…]        qué hay que sirva (sin palabras, todo)
    python -B -X utf8 modelos.py lista                     una línea por modelo: id, qué es y sus props
    python -B -X utf8 modelos.py usar <id> [<id>…]         lo copia al proyecto, con lo que necesita [--pisa]
    python -B -X utf8 modelos.py iconos <nombre> […]       íconos de Phosphor a public/iconos (para Icono3D)
    python -B -X utf8 modelos.py guardar <id> --nombre "…" --resumen "…" --categoria "…" --descripcion "…"
                                          --hace "a; b" --etiquetas "a, b" [--cuadro N]
    python -B -X utf8 modelos.py vista <id> [<id>…]        vuelve a sacar su miniatura
    python -B -X utf8 modelos.py nuevo <id> [--nombre "…"] [--descripcion "…"]
                                          un modelo sin video: arma aquí un proyecto de prueba y el andamio
    python -B -X utf8 modelos.py importar <archivo.glb> --nombre "…" --proyecto <carpeta nueva> [--categoria "…"]
                                          [--licencia "…"]   mete un .glb hecho fuera (lo usa Sloth, sin agente)

Todo menos `buscar` e `importar` se corre en la carpeta del proyecto (la que tiene package.json). Un modelo vive en el proyecto en
src/modelos/<id>.tsx (con src/modelos/comun.tsx) y sus archivos en public/modelos/<id>/; en la biblioteca, en
modelos/<id>/ con su modelo.json y su vista (vista.webp, la foto, y vista.webm, la cámara que se mece). Cada proyecto lleva su copia: guardar una versión nueva no rompe
los videos ya hechos. La biblioteca de cada quien empieza vacía: los que trae la plantilla del explicativo (la moneda, con
lo que usa) están en plantilla/<id>/, que `usar` encuentra y `buscar` y Sloth no enseñan.
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
PLANTILLA = BIBLIOTECA / "plantilla"
# Lo único que un modelo puede importar, además de comun y otros modelos: lo demás le llega por props.
PERMITIDOS = re.compile(r"^(react|react-dom|three|three/.+|@react-three/fiber|remotion|@remotion/.+)$")
ORDEN = ["nombre", "resumen", "categoria", "descripcion", "hace", "etiquetas", "exporta", "usa", "iconos", "cuadro", "caja", "frente", "actua", "origen", "creado", "actualizado"]
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


def carpeta(id_: str) -> Path:
    """Donde está el modelo: en la biblioteca o, si no, entre los de la plantilla."""
    for base in (MODELOS, PLANTILLA):
        if (base / id_ / "modelo.json").exists():
            return base / id_
    sys.exit(f"No hay «{id_}» en la biblioteca. Mira lo que hay: python -B -X utf8 {Path(__file__).name} buscar")


def ficha(id_: str) -> dict:
    return json.loads((carpeta(id_) / "modelo.json").read_text("utf-8"))


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


def props_de(id_: str) -> str:
    """Las props del componente de un modelo con su valor por omisión («abierto=0, nivel=0.85»), sin gris, apaga ni fondo."""
    texto = (carpeta(id_) / f"{id_}.tsx").read_text("utf-8")
    nombre = next((n for n in ficha(id_)["exporta"] if not n.endswith("Props") and n != "Muestra"), "")
    m = re.search(rf"export const {nombre}\s*:[^=]*=\s*\(\{{([^}}]*)\}}", texto)
    if not m:
        return ""
    fuera = []
    for parte in m.group(1).split(","):
        # Solo los espacios de fuera y los que rodean el «=»: quitarlos todos dejaba los textos sin espacios y el agente los
        # copiaba así («Tupaqueteestáretenido» en el celular de la paquetería).
        parte = re.sub(r"\s*=\s*", "=", " ".join(parte.split()))
        if parte and parte.split("=")[0] not in ("gris", "apaga", "fondo"):
            fuera.append(parte)
    return ", ".join(fuera)


def lista() -> None:
    """Una línea por modelo: su id, qué es y sus props. Para elegir de una vez los de un video (hacer.py los trae)."""
    for id_ in todos():
        m = ficha(id_)
        props = props_de(id_)
        print(f"{id_}: {m.get('resumen') or m['nombre']}" + (f" ({props})" if props else "") + (f" · ACTÚA con `{m['actua']}`" if m.get("actua") else ""))


# ── Un modelo sin video: el proyecto de prueba, el andamio y los .glb hechos fuera ─────────────────────────────────────

EXPLICATIVO = BIBLIOTECA.parent / "video-explicativo" / "plantilla"
ID_VALIDO = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")


def pascal(id_: str) -> str:
    return "".join(p.capitalize() for p in id_.split("-"))


def slug(texto: str) -> str:
    """«Caja fuerte» → caja-fuerte (como `idDe` de server/modelos3d-acciones.ts)."""
    return re.sub(r"[^a-z0-9]+", "-", plano(texto)).strip("-") or "modelo"


def proyecto_prueba(destino: Path, sin_modulos: bool = False) -> None:
    """
    Hace de `destino` el proyecto más pequeño donde se prueba un modelo y se le saca la vista: el package.json, el
    tsconfig y el remotion.config de la plantilla del explicativo, y su node_modules, el que comparten esos videos
    (un enlace, no una copia). Cada hilo de «Nuevo modelo» tiene el suyo, en su carpeta: dos a la vez no se pisan.
    """
    destino.mkdir(parents=True, exist_ok=True)
    if not (destino / "package.json").exists():
        for f in ("package.json", "package-lock.json", "tsconfig.json", "remotion.config.ts"):
            shutil.copyfile(EXPLICATIVO / f, destino / f)
        print(f"proyecto de prueba: {destino}", flush=True)
    for d in ("src/modelos", "public/modelos"):
        (destino / d).mkdir(parents=True, exist_ok=True)
    shutil.copyfile(BIBLIOTECA / "comun.tsx", destino / "src" / "modelos" / "comun.tsx")
    if not sin_modulos:
        sys.path.insert(0, str(BIBLIOTECA.parent / "video-base" / "scripts"))
        from espacio import enlazar_modulos  # noqa: PLC0415

        enlazar_modulos(destino, "video-explicativo", EXPLICATIVO)


def quitar_proyecto(raiz_: Path) -> None:
    """Borra un proyecto de prueba. Su node_modules es un enlace a la carpeta compartida: se quita el enlace, no lo de dentro."""
    nm = raiz_ / "node_modules"
    if nm.is_symlink():
        nm.unlink()
    elif hasattr(nm, "is_junction") and nm.is_junction():
        os.rmdir(nm)
    if nm.exists():
        sys.exit(f"{nm} no es un enlace: no se borra el proyecto de prueba.")
    shutil.rmtree(raiz_, ignore_errors=True)


ANDAMIO = """// {nombre}: {descripcion}
// Mide 1 de lado y se para en el piso, en el origen. Cambia esta cabecera por lo que de verdad es: qué es, para qué sirve,
// cuánto mide y dónde está su origen. Lo que es de cada video (colores, imágenes, tiempos) le llega por props.
import React from "react";
import * as THREE from "three";
import {{ RoundedBoxGeometry }} from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export const {componente}: React.FC<{{ color?: string; pos?: [number, number, number] }}> = ({{ color = "#e8a33d", pos = [0, 0, 0] }}) => {{
  // Sustituye este cubo por el modelo: biseles, materiales con brillo (clearcoat) y castShadow.
  const caja = React.useMemo(() => new RoundedBoxGeometry(1, 1, 1, 4, 0.06), []);
  return (
    <group position={{pos}}>
      <mesh geometry={{caja}} position={{[0, 0.5, 0]}} castShadow>
        <meshPhysicalMaterial color={{new THREE.Color(color)}} roughness={{0.4}} clearcoat={{0.6}} />
      </mesh>
    </group>
  );
}};

export const Muestra: React.FC = () => <{componente} />;
"""


def nuevo(id_: str, nombre: str | None, descripcion: str | None) -> None:
    if not ID_VALIDO.fullmatch(id_):
        sys.exit("El id va en minúsculas con guiones: «caja-fuerte».")
    if (MODELOS / id_ / "modelo.json").exists() or (PLANTILLA / id_ / "modelo.json").exists():
        sys.exit(f"Ya hay un «{id_}» en la biblioteca: mejóralo (SKILL.md, 3) o elige otro id.")
    raiz_ = Path.cwd()
    proyecto_prueba(raiz_)
    destino = raiz_ / "src" / "modelos" / f"{id_}.tsx"
    if destino.exists():
        sys.exit(f"src/modelos/{id_}.tsx ya existe: sigue con él.")
    destino.write_text(ANDAMIO.format(nombre=nombre or id_, descripcion=descripcion or "", componente=pascal(id_)), "utf-8", newline="\n")
    print(f"andamio: src/modelos/{id_}.tsx")
    print(f"Siguiente: escribe el modelo ahí (SKILL.md, 4), `vista {id_}`, mírala, y `guardar {id_} --nombre … --resumen … --categoria … --descripcion … --hace … --etiquetas …`.")


# Lo que GLTFLoader de three abre (con Draco y Meshopt, que el componente le pone). Un .glb que exige otra cosa no se importa.
ABRE = {"KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_mesh_quantization", "KHR_texture_transform", "KHR_lights_punctual",
        "EXT_texture_webp", "EXT_texture_avif", "EXT_mesh_gpu_instancing"}


def leer_glb(ruta: Path) -> dict:
    """El JSON de un .glb, después de ver que se puede abrir: que es un .glb, que trae todo dentro y que nada pide lo que three no lee."""
    with ruta.open("rb") as f:
        cabeza = f.read(20)
        if len(cabeza) < 20 or cabeza[:4] != b"glTF":
            sys.exit("El archivo no es un .glb (no empieza con «glTF»). Si es un .gltf, expórtalo como .glb, con todo dentro.")
        largo = int.from_bytes(cabeza[12:16], "little")
        if cabeza[16:20] != b"JSON":
            sys.exit("El .glb está dañado: no trae su descripción.")
        try:
            datos = json.loads(f.read(largo))
        except ValueError:
            sys.exit("El .glb está dañado: su descripción no se lee.")
    fuera = [x["uri"] for x in [*datos.get("buffers", []), *datos.get("images", [])] if x.get("uri") and not x["uri"].startswith("data:")]
    if fuera:
        sys.exit(f"El .glb busca archivos que no vienen dentro ({', '.join(fuera[:3])}): expórtalo como .glb con las texturas incluidas.")
    pide = [e for e in datos.get("extensionsRequired", []) if e not in ABRE and not e.startswith("KHR_materials_")]
    if "KHR_texture_basisu" in pide:
        sys.exit("El .glb trae texturas KTX2 (KHR_texture_basisu), que Sloth todavía no abre: expórtalo con texturas PNG, JPG o WebP.")
    if pide:
        sys.exit(f"El .glb pide {', '.join(pide)}, que Sloth todavía no abre: expórtalo sin esa extensión.")
    return datos


IMPORTADO = """// {nombre}: modelo 3D importado de un archivo .glb. Se centra en el origen, apoyado en el piso, y se escala
// para que lo más alto mida `alto` (1.5 por omisión). Quieto, salvo que se le pase `giro` (grados por segundo).{licencia}
import {{ useLoader }} from "@react-three/fiber";
import React, {{ useMemo }} from "react";
import {{ staticFile, useCurrentFrame, useVideoConfig }} from "remotion";
import * as THREE from "three";
import {{ GLTFLoader }} from "three/examples/jsm/loaders/GLTFLoader.js";
import {{ clone }} from "three/examples/jsm/utils/SkeletonUtils.js";{importa}

export const {componente}: React.FC<{{ alto?: number; giro?: number; pos?: [number, number, number] }}> = ({{ alto = 1.5, giro = 0, pos = [0, 0, 0] }}) => {{
  const gltf = useLoader(GLTFLoader, staticFile("modelos/{id}/modelo.glb"){extension});
  const frame = useCurrentFrame();
  const {{ fps }} = useVideoConfig();
  const {{ objeto, escala, base }} = useMemo(() => {{
    const objeto = clone(gltf.scene);
    objeto.traverse((o) => {{
      if ((o as THREE.Mesh).isMesh) {{
        o.castShadow = true;
        o.receiveShadow = true;
      }}
    }});
    const caja = new THREE.Box3().setFromObject(objeto);
    const tam = caja.getSize(new THREE.Vector3());
    const centro = caja.getCenter(new THREE.Vector3());
    return {{ objeto, escala: alto / Math.max(tam.y, 1e-6), base: new THREE.Vector3(-centro.x, -caja.min.y, -centro.z) }};
  }}, [gltf, alto]);
  return (
    <group position={{pos}} rotation={{[0, THREE.MathUtils.degToRad((giro * frame) / fps), 0]}}>
      <group scale={{escala}}>
        <primitive object={{objeto}} position={{base}} />
      </group>
    </group>
  );
}};

export const Muestra: React.FC = () => <{componente} />;
"""
# Draco: el decodificador va con el modelo (public/modelos/<id>/draco/, ~250 KB), servido en local; así `usar` lo lleva a cada video.
DRACO = ("draco_wasm_wrapper.js", "draco_decoder.wasm")


def importar(ruta: str, nombre: str, categoria: str, licencia: str | None, proyecto_: str, sin_modulos: bool = False, sin_vista: bool = False) -> None:
    """
    Un .glb hecho fuera (Sketchfab, Blender…) a la biblioteca, con su vista. Se mueve (no se copia) a un proyecto de
    prueba nuevo en `proyecto_`, de ahí `guardar` lo lleva a la biblioteca, y al final ese proyecto se borra: queda una sola
    copia, la de la biblioteca.
    """
    origen = Path(ruta).resolve()
    if not origen.is_file():
        sys.exit(f"No encuentro {ruta}.")
    datos = leer_glb(origen)
    if categoria not in CATEGORIAS:
        sys.exit(f"«{categoria}» no es un tipo: {', '.join(CATEGORIAS)}.")
    id_ = slug(nombre)
    if (MODELOS / id_ / "modelo.json").exists():
        sys.exit(f"Ya hay un modelo «{id_}» en la biblioteca: ponle otro nombre.")
    usados = set(datos.get("extensionsUsed", []))
    draco, meshopt = "KHR_draco_mesh_compression" in usados, "EXT_meshopt_compression" in usados
    raiz_ = Path(proyecto_).resolve()
    if raiz_.exists() and any(raiz_.iterdir()):
        sys.exit(f"{raiz_} no está vacía: el proyecto de prueba de una importación va en una carpeta nueva.")
    try:
        proyecto_prueba(raiz_, sin_modulos)
        archivos = raiz_ / "public" / "modelos" / id_
        archivos.mkdir(parents=True)
        shutil.move(origen, archivos / "modelo.glb")
        if draco:
            libs = raiz_ / "node_modules" / "three" / "examples" / "jsm" / "libs" / "draco" / "gltf"
            (archivos / "draco").mkdir()
            for f in DRACO:
                if (libs / f).exists():
                    shutil.copyfile(libs / f, archivos / "draco" / f)
                elif not sin_modulos:
                    sys.exit(f"Falta {libs / f} para abrir un .glb con Draco.")
        importa, partes = "", []
        if draco:
            importa += '\nimport { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";'
            partes.append(f'    const draco = new DRACOLoader();\n    draco.setDecoderPath(staticFile("modelos/{id_}/draco/{DRACO[1]}").replace(/[^/]+$/, ""));\n    loader.setDRACOLoader(draco);')
        if meshopt:
            importa += '\nimport { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";'
            partes.append("    loader.setMeshoptDecoder(MeshoptDecoder);")
        extension = ", (loader) => {\n" + "\n".join(partes) + "\n  }" if partes else ""
        (raiz_ / "src" / "modelos" / f"{id_}.tsx").write_text(
            IMPORTADO.format(nombre=nombre, id=id_, componente=pascal(id_), importa=importa, extension=extension,
                             licencia=f"\n// Licencia: {licencia}" if licencia else ""),
            "utf-8",
            newline="\n",
        )
        os.chdir(raiz_)
        palabras = [w for w in plano(nombre).split() if len(w) > 2]
        guardar(
            id_,
            {
                "nombre": nombre,
                "resumen": nombre[:45],
                "categoria": categoria,
                "descripcion": f"{nombre}, un modelo 3D importado de un archivo .glb.{f' Licencia: {licencia}.' if licencia else ''}",
                "hace": "se escala a la altura que le pidas; gira sobre sí mismo",
                "etiquetas": ", ".join(dict.fromkeys([*palabras, plano(nombre), "importado"])),
            },
            None,
            sin_vista,
        )
        m = MODELOS / id_ / "modelo.json"
        ficha_ = json.loads(m.read_text("utf-8"))
        ficha_["origen"] = "importado"
        m.write_text(json.dumps(ficha_, ensure_ascii=False, indent=2) + "\n", "utf-8", newline="\n")
        print(f"importado: {id_}", flush=True)
    except BaseException:
        # A medias no se queda en la biblioteca: sin vista, Sloth lo enseñaría roto. Antes no estaba (se miró arriba).
        shutil.rmtree(MODELOS / id_, ignore_errors=True)
        raise
    finally:
        os.chdir(raiz_.parent)
        quitar_proyecto(raiz_)


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
        copia(carpeta(id_) / f"{id_}.tsx", src / f"{id_}.tsx", pisa)
        archivos = carpeta(id_) / "archivos"
        if archivos.exists():
            for a in archivos.rglob("*"):
                if a.is_file():
                    copia(a, raiz_ / "public" / "modelos" / id_ / a.relative_to(archivos), pisa)
        iconos(m["iconos"])
        if not callado:
            print(f'{id_}: import {{ {", ".join(m["exporta"])} }} from "../modelos/{id_}";')
            # Su cabecera (qué es, cuánto mide, dónde está su origen y sus props): así no hay que abrir el archivo.
            for linea in (carpeta(id_) / f"{id_}.tsx").read_text("utf-8").splitlines():
                if not linea.startswith("//"):
                    break
                print("   " + linea[2:].strip())


def de_fondo() -> dict:
    """
    Con qué lanzar el render de la vista para que vaya con prioridad baja (su Chrome la hereda): la saca casi siempre un
    subagente mientras el agente del video revisa el suyo. En el de la alerta falsa (3 de noviembre), con dos subagentes
    sacando vistas, cada `revisar.py` tardó 30–55 s en vez de 14–22. En Windows va en el lanzamiento (bajar la del propio
    Python no pasa a sus hijos); en Mac y Linux, `nice`, que sí se hereda.
    """
    if sys.platform == "win32":
        return {"creationflags": 0x4000}  # BELOW_NORMAL_PRIORITY_CLASS
    return {"preexec_fn": lambda: os.nice(10)}


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
        r = subprocess.run(["node", str(corre), str(MODELOS), *pares], cwd=raiz_, **de_fondo())
        if r.returncode:
            sys.exit("No salió la vista: mira el error de arriba (la Muestra tiene que verse sola, sin el resto del video).")
    finally:
        for temporal in (muestras, vitrina, corre):
            temporal.unlink(missing_ok=True)


def guardar(id_: str, dados: dict[str, str | None], cuadro: int | None, sin_vista: bool, caja: str | None = None, frente: bool = False, actua: str | None = None) -> None:
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
    # Uno de la plantilla que se mejora pasa a la biblioteca con su ficha.
    previas = [b / id_ / "modelo.json" for b in (MODELOS, PLANTILLA) if (b / id_ / "modelo.json").exists()]
    previo = json.loads(previas[0].read_text("utf-8")) if previas else {}
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
        "caja": [float(x) for x in caja.split(",")] if caja else previo.get("caja"),
        "frente": True if frente else previo.get("frente"),
        "actua": actua or previo.get("actua"),
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
    (destino / "modelo.json").write_text(json.dumps({k: m[k] for k in ORDEN if m.get(k) is not None}, ensure_ascii=False, indent=2) + "\n", "utf-8", newline="\n")
    print(f"{'actualizado' if previo else 'nuevo'}: {destino}", flush=True)
    if not sin_vista:
        vista([id_])


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="orden", required=True)
    sub.add_parser("buscar").add_argument("palabras", nargs="*")
    sub.add_parser("lista")
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
    g.add_argument("--actua", help="la prop que lo hace moverse solo todo el video mientras vale más de 0 (pica, late, respira)")
    g.add_argument("--frente", action="store_true", help="tiene cara (un reloj, un celular, una persona): el video no lo enseña de lado")
    g.add_argument("--caja", help="ancho,alto,fondo: solo si es mucho más alto que ancho (un celular, una botella)")
    sub.add_parser("vista").add_argument("ids", nargs="+")
    n = sub.add_parser("nuevo")
    n.add_argument("id")
    n.add_argument("--nombre")
    n.add_argument("--descripcion")
    im = sub.add_parser("importar")
    im.add_argument("ruta")
    im.add_argument("--nombre", required=True)
    im.add_argument("--proyecto", required=True, help="una carpeta nueva para el proyecto de prueba, que se borra al terminar")
    im.add_argument("--categoria", default="Objetos")
    im.add_argument("--licencia")
    im.add_argument("--sin-modulos", action="store_true", help="sin node_modules ni vista (para las pruebas)")
    a = p.parse_args()
    if a.orden == "buscar":
        buscar(a.palabras)
    elif a.orden == "lista":
        lista()
    elif a.orden == "usar":
        usar(a.ids, a.pisa)
    elif a.orden == "iconos":
        proyecto()
        iconos(a.nombres)
        print(", ".join(f"public/iconos/{n}.svg" for n in a.nombres))
    elif a.orden == "guardar":
        guardar(a.id, {k: getattr(a, k) for k in PIDE}, a.cuadro, a.sin_vista, a.caja, a.frente, a.actua)
    elif a.orden == "nuevo":
        nuevo(a.id, a.nombre, a.descripcion)
    elif a.orden == "importar":
        importar(a.ruta, a.nombre, a.categoria, a.licencia, a.proyecto, a.sin_modulos, a.sin_modulos)
    else:
        vista(a.ids)


main()
