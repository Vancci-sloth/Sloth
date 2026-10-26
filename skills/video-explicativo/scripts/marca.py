"""
La marca de quien hace los videos: de qué habla su canal, cómo habla, quién narra abajo y a dónde invita el cierre.
Vive en `marca.json`, en la carpeta de la card (donde se crean los proyectos; en Sloth, `trabajo/video-explicativo`),
y es la misma para todos sus videos. Sus personajes propios, en `personajes/<id>/` junto a ella.

    python -B -X utf8 <skill>/scripts/marca.py ver
    python -B -X utf8 <skill>/scripts/marca.py guardar '<json>'
    python -B -X utf8 <skill>/scripts/marca.py aplicar <proyecto>
    python -B -X utf8 <skill>/scripts/marca.py personaje <id> <proyecto>
    python -B -X utf8 <skill>/scripts/marca.py guardar-personaje <id> <proyecto> "<descripción en inglés>"

- `ver`: la marca y lo que le falta (lo que hay que preguntarle al usuario).
- `guardar`: suma esos campos a la marca (`{"cierre": {"red": "instagram"}}` cambia solo la red). Si `cierre.avatar`
  es una imagen de otra carpeta (un adjunto del chat), la copia a `marca/` y guarda esa.
- `aplicar`: pone en el proyecto el personaje (sus poses en public/perro y su índice), la foto de la tarjeta y
  src/datos/marca.json, que lee la plantilla. nuevo.py lo hace al crear el proyecto; vuelve a correrlo si la marca
  cambió después.
- `personaje`: vacía el personaje del proyecto para hacer ahí uno nuevo (ver personaje/NUEVO.md).
- `guardar-personaje`: guarda el que se hizo en el proyecto en `personajes/<id>/` (sus poses, su índice, su foto base
  y cómo se describe a Codex) y lo pone en la marca.

    {"nicho": "cocina fácil para gente que trabaja", "habla": "español de México, de tú", "personaje": "perro",
     "cierre": {"red": "instagram", "nombre": "@cocina.facil", "avatar": "marca/avatar.jpg",
                "frase": "Si quieres más recetas así, sígueme en Instagram: arroba cocina punto fácil."}}

`personaje`: `perro` (el de la skill), `ninguno` o el id de uno propio. `cierre.red`: telegram, whatsapp, instagram,
tiktok, youtube, x, web o ninguna. `cierre.frase` es la última frase de cada guion; con red `ninguna` no hace falta.
"""

import json
import shutil
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
REDES = ("telegram", "whatsapp", "instagram", "tiktok", "youtube", "x", "web", "ninguna")


def carpeta_de_la_card(aqui: Path | None = None) -> Path:
    """La carpeta donde se crean los proyectos: la actual, o la de arriba si se está dentro de un proyecto."""
    aqui = aqui or Path.cwd()
    return aqui.parent if (aqui / "remotion.config.ts").exists() else aqui


def leer(carpeta: Path) -> dict:
    ruta = carpeta / "marca.json"
    return json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else {}


def faltan(m: dict) -> list[str]:
    """Lo que hay que preguntarle al usuario antes del guion."""
    c = m.get("cierre") or {}
    falta = [k for k in ("nicho", "personaje") if not m.get(k)]
    if c.get("red") not in REDES:
        falta.append("cierre.red")
    elif c["red"] != "ninguna":
        falta += [f"cierre.{k}" for k in ("nombre", "frase") if not c.get(k)]
    return falta


def guardar(carpeta: Path, cambios: dict) -> dict:
    m = leer(carpeta)
    cierre = {**(m.get("cierre") or {}), **(cambios.pop("cierre", None) or {})}
    m.update(cambios)
    if cierre:
        m["cierre"] = cierre
    if cierre.get("red") and cierre["red"] not in REDES:
        sys.exit(f"Red «{cierre['red']}» desconocida: {', '.join(REDES)}.")
    avatar = cierre.get("avatar")
    if avatar and Path(avatar).is_absolute():
        origen = Path(avatar)
        if not origen.exists():
            sys.exit(f"No existe la foto {origen}.")
        (carpeta / "marca").mkdir(exist_ok=True)
        destino = carpeta / "marca" / f"avatar{origen.suffix.lower()}"
        shutil.copy(origen, destino)
        cierre["avatar"] = destino.relative_to(carpeta).as_posix()
    (carpeta / "marca.json").write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return m


def aplicar(proyecto: Path) -> None:
    carpeta = proyecto.resolve().parent
    m = leer(carpeta)
    cierre = m.get("cierre") or {}
    personaje = m.get("personaje") or "perro"
    # Las poses: las del perro (también sin narrador: la plantilla las importa) o las de uno propio.
    origen = carpeta / "personajes" / personaje
    if personaje in ("perro", "ninguno") or not origen.exists():
        if personaje not in ("perro", "ninguno"):
            print(f"No está el personaje «{personaje}» en {carpeta / 'personajes'}: va el perro.")
        poses, indice, foto = SKILL / "personaje" / "perro", SKILL / "personaje" / "personaje.json", SKILL / "plantilla" / "public" / "img" / "avatar.jpg"
    else:
        poses, indice = origen / "poses", origen / "personaje.json"
        foto = next(iter(sorted(origen.glob("avatar.*"))), None) or origen / "base.png"
    destino = proyecto / "public" / "perro"
    shutil.rmtree(destino, ignore_errors=True)
    shutil.copytree(poses, destino)
    shutil.copy(indice, proyecto / "src" / "datos" / "personaje.json")
    # La foto de la tarjeta: la de la marca, o la cara del personaje; sin ninguna, el logo de la red.
    elegida = carpeta / cierre["avatar"] if cierre.get("avatar") else foto if personaje != "ninguno" else None
    avatar = None
    if elegida and elegida.exists():
        avatar = f"img/avatar{elegida.suffix.lower()}"
        (proyecto / "public" / "img").mkdir(parents=True, exist_ok=True)
        if elegida.resolve() != (proyecto / "public" / avatar).resolve():
            shutil.copy(elegida, proyecto / "public" / avatar)
    datos = {"red": cierre.get("red") or "ninguna", "nombre": cierre.get("nombre") or "", "personaje": personaje}
    if avatar:
        datos["avatar"] = avatar
    (proyecto / "src" / "datos" / "marca.json").write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def vaciar_personaje(proyecto: Path) -> None:
    """El proyecto sin narrador: ni poses ni fotos, para que perro.py arme solo las del nuevo."""
    for carpeta in (proyecto / "public" / "perro", proyecto / "perro"):
        shutil.rmtree(carpeta, ignore_errors=True)
    (proyecto / "perro" / "bocas").mkdir(parents=True)
    (proyecto / "src" / "datos" / "personaje.json").write_text('{"poses": {}, "anclas": {}}\n', encoding="utf-8")


def guardar_personaje(id_: str, proyecto: Path, descripcion: str) -> None:
    carpeta = proyecto.resolve().parent
    destino = carpeta / "personajes" / id_
    if not (proyecto / "src" / "datos" / "personaje.json").exists() or not any((proyecto / "public" / "perro").glob("*.webp")):
        sys.exit("El proyecto no tiene poses recortadas: corre antes scripts/perro.py.")
    shutil.rmtree(destino / "poses", ignore_errors=True)
    shutil.copytree(proyecto / "public" / "perro", destino / "poses")
    shutil.copy(proyecto / "src" / "datos" / "personaje.json", destino / "personaje.json")
    if (proyecto / "perro" / "perro.png").exists():
        shutil.copy(proyecto / "perro" / "perro.png", destino / "base.png")
    (destino / "descripcion.txt").write_text(descripcion.strip() + "\n", encoding="utf-8")
    guardar(carpeta, {"personaje": id_})
    print(f"Personaje {id_} guardado en {destino}.")


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ("ver", "guardar", "aplicar", "personaje", "guardar-personaje"):
        sys.exit(__doc__)
    orden = sys.argv[1]
    if orden == "personaje" and len(sys.argv) == 4:
        vaciar_personaje(Path(sys.argv[3]))
        print(f"Sin personaje en {sys.argv[3]}: haz el nuevo en perro/ (ver personaje/NUEVO.md).")
        return
    if orden == "guardar-personaje" and len(sys.argv) == 5:
        guardar_personaje(sys.argv[2], Path(sys.argv[3]), sys.argv[4])
        return
    if orden in ("personaje", "guardar-personaje"):
        sys.exit(__doc__)
    if orden == "aplicar":
        if len(sys.argv) != 3:
            sys.exit(__doc__)
        aplicar(Path(sys.argv[2]))
        print(f"Marca aplicada en {sys.argv[2]}.")
        return
    carpeta = carpeta_de_la_card()
    m = guardar(carpeta, json.loads(sys.argv[2])) if orden == "guardar" else leer(carpeta)
    print(json.dumps(m, ensure_ascii=False, indent=2) if m else f"Sin marca todavía en {carpeta}.")
    falta = faltan(m)
    print(f"Falta: {', '.join(falta)}" if falta else "Completa.")


if __name__ == "__main__":
    main()
