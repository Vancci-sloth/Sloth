"""
El kit: las piezas con que se arma cada video, en una hoja (KIT.md) que sale del código, y la manera de sumarle una pieza
nueva hecha a mano en un video.

    python -B -X utf8 <skill>/scripts/kit.py hoja                 rehace KIT.md (después de cambiar una pieza)
    python -B -X utf8 <skill>/scripts/kit.py comprobar            sale con 1 si KIT.md no es la del código (comprobar-skills)
    python -B -X utf8 <skill>/scripts/kit.py guardar <nombre>     desde la raíz del proyecto: sube src/piezas/<nombre>.tsx
                                                                  a la plantilla (--pisa para reemplazar la que ya está)

En KIT.md entra cada `export` de los archivos del kit que lleva su comentario `/** … */` justo encima: qué es y sus props.
Por eso cada pieza exportada se documenta, o `comprobar` falla. Una pieza que se guarda vive sola en su archivo, solo
importa lo que es de todos los videos (el tema, el tiempo, otras piezas, la cámara) y nada de lo de un video (guion.ts,
sus escenas, sus datos), y desde el siguiente video ya viene en la plantilla.
"""

import re
import shutil
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
SRC = SKILL / "plantilla" / "src"
MODELOS = SKILL.parent / "modelos-3d"
KIT = SKILL / "KIT.md"

# Los archivos del kit, en el orden de la hoja: dónde están en el proyecto y lo que dice su sección. Los 3D vienen de la
# biblioteca de modelos (modelos-3d), que los copia a src/modelos/.
ARCHIVOS = [
    (SRC / "tiempo.ts", "src/tiempo.ts", "El tiempo: todo se ata a la palabra que lo dispara, nunca a cuadros escritos a mano."),
    (SRC / "mundo" / "encuadra.ts", "src/mundo/encuadra.ts", "Las tomas: qué tiene que verse en cada idea; la cámara sale sola."),
    (SRC / "mundo" / "EnMundo.tsx", "src/mundo/EnMundo.tsx", "Lo 2D clavado en el mundo 3D: se mueve con la cámara."),
    (SRC / "piezas" / "ui.tsx", "src/piezas/ui.tsx", "Cómo entra y sale cada cosa, y lo que marca un texto."),
    (SRC / "piezas" / "diagrama.tsx", "src/piezas/diagrama.tsx", "Las piezas chicas: píldoras, fichas, logos."),
    (SRC / "piezas" / "iconos.tsx", "src/piezas/iconos.tsx", "Íconos de Phosphor, cualquiera por su nombre (https://phosphoricons.com). Nunca emojis."),
    (SRC / "piezas" / "tarjetas.tsx", "src/piezas/tarjetas.tsx", "Las pruebas y los datos en su tarjeta."),
    (SRC / "piezas" / "reddit.tsx", "src/piezas/reddit.tsx", "Un post de Reddit rehecho."),
    (SRC / "escenas" / "comun.tsx", "src/escenas/comun.tsx", "Lo que comparten los capítulos: indicadores, botones, el cierre de la marca."),
    (MODELOS / "comun.tsx", "src/modelos/comun.tsx", "Lo 3D de todos los modelos: quién está en escena y cuándo."),
    (MODELOS / "plantilla" / "icono-3d" / "icono-3d.tsx", "src/modelos/icono-3d.tsx", "Un logo o un ícono extruido."),
]
# Lo que se exporta para otra cosa que el video (las vistas de la biblioteca).
FUERA = {"Muestra"}

# Una pieza que se guarda solo importa lo que es de todos los videos.
PERMITIDOS = re.compile(r"^(react|remotion|three|@remotion/|@react-three/|@phosphor-icons/|\./|\.\./(tema|tiempo|marca|piezas/|mundo/(camara|EnMundo)|escenas/comun|modelos/comun))")

DOC_EXPORT = re.compile(r"/\*\*((?:(?!\*/).)*?)\*/\s*\n\s*export\s+(?:const|function|type)\s+(\w+)", re.S)
EXPORT = re.compile(r"^export\s+const\s+([A-Z]\w*)\s*:\s*React\.FC", re.M)


def limpio(texto: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"^\s*\*\s?", "", texto, flags=re.M)).strip()


def hasta_cerrar(texto: str, i: int, fin: str) -> str:
    """De `i` hasta el primer `fin` que no esté dentro de llaves, paréntesis o corchetes (sin contar el `>` de un `=>`)."""
    hondo = 0
    for k in range(i, len(texto)):
        ch = texto[k]
        # Antes que las llaves: el `)` que cierra los parámetros es el `fin` (sin esto, las funciones salían sin firma).
        if hondo == 0 and ch in fin and not (ch == ">" and texto[k - 1] == "="):
            return texto[i:k]
        if ch in "{([":
            hondo += 1
        elif ch in "})]":
            hondo -= 1
    return texto[i:]


def firma(texto: str, desde: int) -> str:
    """Las props de un componente (`React.FC<{…}>`), los parámetros de una función o lo que es un tipo, en una línea."""
    resto = texto[desde:]
    if m := re.match(r"\s*:\s*React\.FC<", resto):
        f = hasta_cerrar(texto, desde + m.end(), ">")
    elif m := re.match(r"\s*=\s*(?:<[^>]*>\s*)?\(", resto):
        f = "(" + hasta_cerrar(texto, desde + m.end(), ")") + ")"
        # Lo que devuelve, si lo dice (`encuadra(t): { pos; mira; d }`).
        tras = desde + m.end() + len(f) - 1
        if r := re.match(r"\s*:\s*", texto[tras:]):
            f += ": " + hasta_cerrar(texto, tras + r.end(), "=").strip()
    elif m := re.match(r"\s*=\s*", resto):
        f = hasta_cerrar(texto, desde + m.end(), ";\n")
    else:
        return ""
    f = re.sub(r"\s+", " ", f).strip()
    return f if len(f) <= 260 else ""


def piezas(archivo: Path) -> list[tuple[str, str, str]]:
    texto = archivo.read_text(encoding="utf-8")
    return [(m.group(2), firma(texto, m.end()), limpio(m.group(1))) for m in DOC_EXPORT.finditer(texto) if m.group(2) not in FUERA]


def sin_doc(archivo: Path) -> list[str]:
    texto = archivo.read_text(encoding="utf-8")
    documentados = {m.group(2) for m in DOC_EXPORT.finditer(texto)}
    return [n for n in EXPORT.findall(texto) if n not in documentados and n not in FUERA]


def hoja() -> str:
    lineas = [
        "# El kit",
        "",
        "Las piezas 2D y 3D de la plantilla, sacadas de su código por `scripts/kit.py hoja` (no se edita a mano: se cambia",
        "el comentario de la pieza y se rehace). Un video no las usa a mano: las pone el director (`src/director`) desde",
        "`momentos.json` (SKILL.md). Esta hoja es para lo único que se escribe a mano, una pieza que el director no tiene:",
        "`src/piezas/<nombre>.tsx`, que exporta un componente y se usa con `\"tarjeta\": { \"tipo\": \"pieza\", \"nombre\": …,",
        "\"props\": {…}, \"w\": …, \"h\": … }`. Recibe sus `props` y, además, `en` y `hasta`: los cuadros en que entra y sale.",
        "Si sirve a otros videos, `kit.py guardar <nombre>`.",
        "",
        "Los tiempos de una pieza propia salen de `en` o de `en(\"palabra\")` (de `src/tiempo.ts`), nunca de cuadros escritos",
        "a mano: si la voz cambia, todo se recorre solo.",
        "",
    ]
    for archivo, rel, seccion in ARCHIVOS:
        if not archivo.exists():
            continue
        lineas += [f"## `{rel}`", ""] + ([seccion, ""] if seccion else [])
        for n, f, doc in piezas(archivo):
            lineas.append(f"- **`{n}`**{f' `{f}`' if f else ''}: {doc}")
        lineas.append("")
    return "\n".join(lineas).rstrip() + "\n"


def comprobar() -> int:
    errores = []
    for archivo, _, _ in ARCHIVOS:
        if archivo.exists():
            errores += [f"{archivo.relative_to(SKILL.parent).as_posix()}: `{n}` se exporta sin su comentario /** … */" for n in sin_doc(archivo)]
    if not KIT.exists() or KIT.read_text(encoding="utf-8") != hoja():
        errores.append("KIT.md no es la del código: python -B -X utf8 video-explicativo/scripts/kit.py hoja")
    for e in errores:
        print(e)
    return 1 if errores else 0


def guardar(nombre: str, pisa: bool) -> None:
    raiz = Path.cwd()
    pieza = raiz / "src" / "piezas" / f"{nombre}.tsx"
    if not pieza.exists():
        sys.exit(f"No está {pieza}: pon la pieza sola en su archivo, src/piezas/{nombre}.tsx, y vuelve a correrlo.")
    texto = pieza.read_text(encoding="utf-8")
    if re.search(r'<(mesh|group|instancedMesh)\b|from "three"|@react-three/', texto):
        sys.exit("Es 3D: cada objeto es un modelo, en src/modelos/<id>.tsx, y va a la biblioteca con `modelos.py guardar` "
                 "(skill modelos-3d). El kit es de lo 2D.")
    ajenos =[m for m in re.findall(r'from\s+"([^"]+)"', texto) if not PERMITIDOS.match(m)]
    if ajenos:
        sys.exit(f"Importa lo de este video ({', '.join(ajenos)}): pásalo por props y vuelve a guardarla.")
    if faltan := sin_doc(pieza):
        sys.exit(f"Ponle su comentario /** … */ (qué es y para qué sirve) a: {', '.join(faltan)}.")
    destino = SRC / "piezas" / pieza.name
    if destino.exists() and not pisa:
        sys.exit(f"Ya hay una {destino.name} en el kit: cámbiale el nombre, o --pisa si la nueva la mejora.")
    shutil.copy(pieza, destino)
    ARCHIVOS.append((destino, f"src/piezas/{destino.name}", ""))
    KIT.write_text(hoja(), encoding="utf-8", newline="\n")
    print(f"Guardada en el kit: {destino}. Los videos que empiecen desde ahora ya la traen. Díselo al usuario.")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    # Las piezas que se guardaron con `guardar` también entran (las del kit de siempre ya están en ARCHIVOS).
    fijos = {a for a, _, _ in ARCHIVOS}
    ARCHIVOS.extend((a, f"src/piezas/{a.name}", "") for a in sorted((SRC / "piezas").glob("*.tsx")) if a not in fijos and a.name not in ("Subtitulos.tsx", "Personaje.tsx"))
    a = sys.argv[1:]
    if a[:1] == ["hoja"]:
        KIT.write_text(hoja(), encoding="utf-8", newline="\n")
        print(f"{KIT} al día.")
    elif a[:1] == ["comprobar"]:
        sys.exit(comprobar())
    elif a[:1] == ["guardar"] and len(a) > 1:
        guardar(a[1], "--pisa" in a)
    else:
        sys.exit(__doc__)


main()
