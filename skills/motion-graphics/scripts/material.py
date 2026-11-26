"""
El material generado de un video de Motion Graphics: las imágenes y los clips que piden sus planos `imagen` y `clip`.
Corre de fondo mientras `hacer.py` hace la música y la portada, y una sola vez por pedido.

    python -B -X utf8 material.py <raíz> [--con <chatgpt|modelo de Flow>] [--clips "<modelo>"]
                                  [--resolucion 720p] [--tope 10]

Lee `revision/plan.json` y deja en `material/`:

- `<id>.jpg` por cada plano `imagen` (Flow `generar_imagen`, que no gasta créditos, o ChatGPT con Codex).
- `<id>.mp4` por cada plano `clip` (Flow `generar_video`), y sus cuadros ya sacados en `<id>/f0000.jpg…`, que es lo
  que dibuja el director: un cuadro por el que pide el video, sin que nadie tenga que buscar dentro del MP4.
- `estado.json`: cómo va cada pedido y lo que gastó, que es lo que lee `hacer.py` al esperarlo.

El `<id>` es la huella de lo que se pidió (tipo, modelo, formato y texto): **si el archivo ya está, no se vuelve a
pedir**. Cambiar una palabra del `pide` es otro pedido; volver a correr el mismo video no gasta nada. Flow además
descarta por su cuenta los pedidos repetidos, así que un reintento tampoco paga dos veces.

Lo que no sale, no rompe el video: el plano se queda con su campo de color y su texto, y `hacer.py` lo dice.
"""
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
SKILLS = Path(os.environ["SLOTH_SKILLS"]) if os.environ.get("SLOTH_SKILLS") else SKILL.parent
BASE = SKILLS / "video-base" / "scripts"
sys.path.insert(0, str(BASE))
import portada_ia  # noqa: E402  (pedir, con_chatgpt, con_flow y Falla: el mismo camino que la portada)
from momentos import guardar, opcion  # noqa: E402

# Lo que no escribe el agente: cómo se ve todo lo generado de este estilo. Va pegado a cada pedido.
ESTILO = ("Shot for a motion graphics piece: one clear subject, centred, simple strong lighting, plain uncluttered "
          "background, high contrast, no text, no logos, no watermarks, no user interface, no borders, no split frames.")
ESTILO_CLIP = ESTILO + " One continuous shot, no cuts, slow steady camera move, the subject stays in frame throughout."
TOPE = 10 * 60


def huella(*partes: str) -> str:
    return hashlib.sha1("\n".join(partes).encode()).hexdigest()[:12]


def pedidos_de(plan: dict, con: str, clips: str, resolucion: str, raiz: Path | None = None) -> list[dict]:
    """
    Un pedido por plano con material, con su id ya calculado: lo usan `material.py` y la cuenta de `--revisa`.

    El id es la huella de lo que se pide, y en un clip con `sigue` **entra también su primer cuadro**: si cambia el
    plano anterior, el clip ya no es el mismo y hay que volver a pedirlo. Sin `raiz` (la cuenta de `--revisa`, cuando
    la semilla aún no está dibujada) el id no se usa para nada más que contar.
    """
    formato = "16:9" if plan["ancho"] > plan["alto"] else "9:16"
    lista = []
    for i, e in enumerate(plan["escenas"]):
        if e["plano"] == "imagen" and e.get("pide"):
            prompt = f"{e['pide'].strip().rstrip('.')}. {ESTILO}"
            lista.append({"n": i, "tipo": "imagen", "prompt": prompt, "formato": formato,
                          "modelo": "" if con == portada_ia.CHATGPT else con,
                          "id": huella("imagen", con, formato, prompt)})
        elif e["plano"] == "clip" and e.get("pide"):
            prompt = f"{e['pide'].strip().rstrip('.')}. {ESTILO_CLIP}"
            semilla = ""
            if raiz and e.get("sigue") and e.get("semilla") and (raiz / e["semilla"]).is_file():
                semilla = hashlib.sha1((raiz / e["semilla"]).read_bytes()).hexdigest()[:12]
            lista.append({"n": i, "tipo": "video", "prompt": prompt, "formato": formato, "modelo": clips,
                          "resolucion": resolucion, "sigue": bool(e.get("sigue")),
                          "id": huella("video", clips, resolucion, formato, prompt, semilla)})
    return lista


def flow_video(p: dict, salida: Path, primer_cuadro: Path | None, tope: int) -> str:
    estado = portada_ia.pedir("/api/flow")
    if not estado.get("cuentas"):
        raise portada_ia.Falla("no hay cuenta de Google en Flow (Opciones → Google Flow)")
    if primer_cuadro and not estado.get("derechos"):
        raise portada_ia.Falla("Flow pide confirmar los derechos de las imágenes (Opciones → Google Flow)")
    cuerpo = {"tipo": "video", "modelo": p["modelo"], "formato": p["formato"], "prompt": p["prompt"],
              "salida": str(salida), "tope": tope}
    if p.get("resolucion"):
        cuerpo["resolucion"] = p["resolucion"]
    if primer_cuadro:
        cuerpo["primerCuadro"] = str(primer_cuadro)
    t = portada_ia.pedir("/api/flow/generar", cuerpo)
    hasta = time.time() + TOPE
    while t.get("estado") in ("en-fila", "generando") and time.time() < hasta:
        t = portada_ia.pedir(f"/api/flow/trabajos/{t['id']}?esperar=45", espera=60)
    if t.get("estado") == "error":
        raise portada_ia.Falla(f"Flow: {t.get('error')}")
    if t.get("estado") != "lista" or not salida.exists():
        raise portada_ia.Falla("Flow no lo terminó a tiempo")
    quedan = f", quedan {t['quedan']}" if t.get("quedan") is not None else ""
    return f"Flow ({t.get('modelo', p['modelo'])}): {t.get('creditos', 0)} créditos{quedan}"


def sacar_cuadros(video: Path, carpeta: Path, ancho: int, alto: int, fps: int, dura: float,
                  cuadrado: bool = False, repetir: bool = False) -> int:
    """
    Los cuadros del clip, ya recortados al cuadro del video: el director dibuja imágenes, no busca dentro de un MP4
    (seguir un video cuadro a cuadro en Chrome no da siempre el mismo resultado).
    """
    carpeta.mkdir(parents=True, exist_ok=True)
    for viejo in carpeta.glob("f*.jpg"):
        viejo.unlink()
    if cuadrado:
        lado = min(ancho, alto)
        escala = f"scale={lado}:{lado}:force_original_aspect_ratio=decrease,pad={lado}:{lado}:-1:-1:color=black"
    else:
        escala = f"scale={ancho}:{alto}:force_original_aspect_ratio=increase,crop={ancho}:{alto}"
    bucle = ["-stream_loop", "-1"] if repetir else []
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", *bucle, "-i", str(video), "-t", f"{dura:.3f}",
                    "-vf", f"fps={fps},{escala}", "-q:v", "4", str(carpeta / "f%04d.jpg")], check=True)
    return len(list(carpeta.glob("f*.jpg")))


def main() -> None:
    args = sys.argv[1:]
    con = opcion(args, "--con") or ""
    clips = opcion(args, "--clips") or "Veo 3.1 - Lite"
    resolucion = opcion(args, "--resolucion") or ""
    tope = int(opcion(args, "--tope") or 20)
    if not args:
        sys.exit(__doc__)
    raiz = Path(args[0]).resolve()
    plan = json.loads((raiz / "revision" / "plan.json").read_text(encoding="utf-8"))
    carpeta = raiz / "material"
    carpeta.mkdir(exist_ok=True)
    estado = {"hecho": False, "piezas": {}}

    def apuntar():
        guardar(carpeta / "estado.json", estado)

    for p in pedidos_de(plan, con, clips, resolucion, raiz):
        escena = plan["escenas"][p["n"]]
        salida = carpeta / (p["id"] + (".mp4" if p["tipo"] == "video" else ".jpg"))
        pieza = {"plano": escena["plano"], "archivo": str(salida.relative_to(raiz)).replace("\\", "/")}
        if salida.exists():
            pieza |= {"estado": "lista", "gasto": "ya estaba, no se volvió a pedir"}
        elif not con and p["tipo"] == "imagen":
            pieza |= {"estado": "fallo", "por": "el mensaje no trae la línea «Imágenes:»: nadie con quien generarla"}
        else:
            print(f"· {p['tipo']} del plano {p['n'] + 1}…", flush=True)
            desde = time.time()
            try:
                if p["tipo"] == "video":
                    primero = raiz / escena["semilla"] if p.get("sigue") and escena.get("semilla") else None
                    pieza |= {"estado": "lista", "gasto": flow_video(p, salida, primero, tope)}
                elif con == portada_ia.CHATGPT:
                    hecho, gasto = portada_ia.con_chatgpt(p["prompt"], [], p["formato"] == "16:9", carpeta)
                    hecho.replace(salida)
                    pieza |= {"estado": "lista", "gasto": gasto}
                else:
                    crudo = carpeta / (p["id"] + ".crudo.jpg")
                    gasto = portada_ia.con_flow(p["modelo"], p["prompt"], [], p["formato"] == "16:9", crudo)
                    crudo.replace(salida)
                    pieza |= {"estado": "lista", "gasto": gasto}
                pieza["segundos"] = round(time.time() - desde)
            except Exception as err:  # lo que falle se queda sin material, pero el video sale igual
                pieza |= {"estado": "fallo", "por": str(err)}
        if pieza["estado"] == "lista" and p["tipo"] == "video":
            pieza["cuadros"] = str((carpeta / p["id"]).relative_to(raiz)).replace("\\", "/")
            pieza["n"] = sacar_cuadros(salida, carpeta / p["id"], plan["ancho"], plan["alto"], plan["fps"], escena["dura"])
        estado["piezas"][str(p["n"])] = pieza
        apuntar()
    estado["hecho"] = True
    apuntar()


if __name__ == "__main__":
    main()
