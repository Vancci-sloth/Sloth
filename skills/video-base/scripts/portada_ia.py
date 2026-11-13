"""
La portada generada con IA, con lo que el usuario eligió en el menú «Imágenes» del compositor (la línea `Imágenes:`):
un modelo de Google Flow (por la API de Sloth, `SLOTH_URL`) o ChatGPT (el `image_gen` de Codex). Pensada para correr de
fondo desde el principio, mientras se hacen la voz y el render: no mira el video, parte del título, el estilo y las
referencias (el personaje del canal, el protagonista, las fotos que adjuntó el usuario). El pedido es el de PORTADA.md.

    python -B -X utf8 portada_ia.py <con> <salida.png> --titulo "<2 a 5 palabras>" --estilo "<del estilo>" \
        --que "<qué se ve>" [--ref <imagen>]... [--horizontal]

`<con>`: `chatgpt` o un modelo de imagen de Flow («Nano Banana 2.1»). Deja `<salida>` ya a su tamaño: 1080×1920 en
vertical (la portada que `portada.mjs` pega de primer cuadro) y 1280×720 en horizontal (la miniatura de YouTube), y
junto a ella `<salida>.json` con cómo va: `{"estado": "generando" | "lista" | "fallo", "por": …, "gasto": …}`, que lee
quien la espera. Sale con 0 si la dejó y con 1 si no, diciendo por qué en una línea: sin cuenta (`codex login status`
≠ 0, o Flow sin cuentas), Flow pide confirmar los derechos de las referencias, o el proveedor falló. Quien la lanzó usa
entonces su portada de respaldo. No gasta créditos de Flow (las imágenes son gratis); con ChatGPT gasta una imagen de la
cuota del plan.

Lanzarla otra vez con lo mismo (título, estilo, referencias, proveedor) no la pide de nuevo: si ya está, sale al
momento, y si otra la está generando, la deja.
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

CHATGPT = "chatgpt"
URL = os.environ.get("SLOTH_URL", "http://127.0.0.1:4848").rstrip("/")
# Lo más que se espera al proveedor: después, quien la pidió ya usó su respaldo.
TOPE = 8 * 60

VERTICAL = ("a vertical {formato} cover image for a short video on TikTok and Instagram Reels. {estilo} {que} "
            "Big bold title text in Spanish, exactly: \"{titulo}\" (keep every accent), huge, high contrast with a thick outline "
            "or shadow, readable at thumbnail size. Keep the title and the main subject inside the central area: between 20% "
            "and 66% of the height and between 20% and 75% of the width. The title in two or three lines, no wider than 55% of "
            "the image. The main subject complete (never cut by a straight edge), not too big: its bottom ends above 66% of "
            "the height. The edges are background only, no text near them. No other text, no logos, no watermarks, no "
            "borders, no UI.")
HORIZONTAL = ("a horizontal {formato} thumbnail for a YouTube video. {estilo} {que} Big bold title text in Spanish, exactly: "
              "\"{titulo}\" (keep every accent), huge, high contrast with a thick outline or shadow, readable at thumbnail size. "
              "The title on one side, in two or three lines, no wider than 45% of the image; the main subject on the other "
              "side, complete (never cut by a straight edge). Keep the title and the main subject between 15% and 85% of the "
              "height (the top and bottom get cropped to 16:9) and away from the bottom-right corner (YouTube covers it with "
              "the video length). The edges are background only. No other text, no logos, no watermarks, no borders, no UI.")


class Falla(Exception):
    pass


def opcion(args: list[str], nombre: str, varias: bool = False):
    vistos = []
    while nombre in args:
        i = args.index(nombre)
        if i + 1 >= len(args):
            sys.exit(__doc__)
        vistos.append(args[i + 1])
        del args[i:i + 2]
    return vistos if varias else (vistos[-1] if vistos else "")


def escribir(estado: Path, datos: dict) -> None:
    tmp = estado.with_suffix(".tmp")
    tmp.write_text(json.dumps(datos, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, estado)


def ffmpeg(*args: str) -> None:
    r = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", *args], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        raise Falla(f"ffmpeg: {r.stderr.strip()[-300:]}")


def pedir(ruta: str, datos: dict | None = None, espera: float = 15) -> dict:
    req = urllib.request.Request(URL + ruta, data=json.dumps(datos).encode() if datos is not None else None,
                                 headers={"content-type": "application/json"}, method="POST" if datos is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=espera) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            raise Falla(json.loads(e.read()).get("error") or f"Sloth respondió {e.code}")
        except ValueError:
            raise Falla(f"Sloth respondió {e.code}")
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        raise Falla(f"no contesta Sloth en {URL}")


def con_flow(modelo: str, prompt: str, refs: list[Path], horizontal: bool, crudo: Path) -> str:
    estado = pedir("/api/flow")
    if not estado.get("cuentas"):
        raise Falla("no hay cuenta de Google en Flow (Opciones → Google Flow)")
    if refs and not estado.get("derechos"):
        raise Falla("Flow pide confirmar los derechos de las imágenes de referencia (Opciones → Google Flow)")
    t = pedir("/api/flow/generar", {"tipo": "imagen", "modelo": modelo, "formato": "16:9" if horizontal else "9:16",
                                    "prompt": prompt, "referencias": [str(r) for r in refs], "salida": str(crudo)})
    hasta = time.time() + TOPE
    while t.get("estado") in ("en-fila", "generando") and time.time() < hasta:
        t = pedir(f"/api/flow/trabajos/{t['id']}?esperar=45", espera=60)
    if t.get("estado") == "error":
        raise Falla(f"Flow: {t.get('error')}")
    if t.get("estado") != "lista" or not crudo.exists():
        raise Falla("Flow no la terminó a tiempo")
    cuenta = f", con {t['cuenta']}" if t.get("cuenta") else ""
    return f"Flow ({t.get('modelo', modelo)}{cuenta}): {t.get('creditos', 0)} créditos"


def con_chatgpt(prompt: str, refs: list[Path], horizontal: bool, carpeta: Path) -> tuple[Path, str]:
    if not shutil.which("codex"):
        raise Falla("no está Codex (la cuenta de ChatGPT se conecta en Opciones → Agentes)")
    if subprocess.run(["codex", "login", "status"], capture_output=True).returncode:
        raise Falla("no hay cuenta de ChatGPT conectada (Opciones → Agentes)")
    tam = "3:2 (1536x1024)" if horizontal else "2:3 (1024x1536)"
    texto = ("Use your built-in image_gen tool (do not draw with code). Generate exactly one image with image_gen. "
             "Do not run commands and do not save or copy files. Reply only: ok\n\n" + prompt.replace("{tam}", tam))
    inicio = time.time()
    # El PNG lo deja Codex en $CODEX_HOME/generated_images/<hilo>/: se toma de ahí. Pedirle que lo copie fallaba en
    # Windows («setup refresh had errors», 25 de octubre) y lo dejaba solo ahí.
    cmd = ["codex", "exec", "--skip-git-repo-check", "--json", "-s", "read-only", "-C", str(carpeta), "-"]
    for r in refs:
        cmd += ["-i", str(r)]
    try:
        r = subprocess.run(cmd, input=texto, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=TOPE)
    except subprocess.TimeoutExpired:
        raise Falla("ChatGPT no la terminó a tiempo")
    hilo, tokens, error = "", 0, ""
    for l in r.stdout.splitlines():
        try:
            e = json.loads(l)
        except ValueError:
            continue
        if e.get("type") == "thread.started":
            hilo = e.get("thread_id", "")
        elif e.get("type") == "turn.completed":
            u = e.get("usage") or {}
            tokens += int(u.get("input_tokens") or 0) + int(u.get("output_tokens") or 0)
        elif e.get("type") in ("error", "turn.failed"):
            error = str(e.get("message") or (e.get("error") or {}).get("message") or e)
    hechas = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex") / "generated_images"
    candidatas = list((hechas / hilo).glob("*.png")) if hilo else []
    if not candidatas and hechas.exists():
        # Sin el hilo, la más nueva de las que salieron después de pedirla.
        candidatas = [p for p in hechas.glob("*/*.png") if p.stat().st_mtime >= inicio]
    if not candidatas:
        raise Falla(f"ChatGPT no generó la imagen{': ' + error[:300] if error else ''}" + ("" if r.returncode == 0 else f" (codex salió con {r.returncode}: {r.stderr.strip()[-200:]})"))
    hecha = max(candidatas, key=lambda p: p.stat().st_mtime)
    return hecha, f"ChatGPT: una imagen de la cuota de tu plan ({tokens:,} tokens)".replace(",", " ")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    titulo, estilo, que = opcion(args, "--titulo"), opcion(args, "--estilo"), opcion(args, "--que")
    refs = [Path(r).resolve() for r in opcion(args, "--ref", True)]
    horizontal = "--horizontal" in args
    if horizontal:
        args.remove("--horizontal")
    if len(args) != 2 or not titulo:
        sys.exit(__doc__)
    con, salida = args[0], Path(args[1]).resolve()
    refs = [r for r in refs if r.is_file()]
    estado = salida.with_name(salida.name + ".json")
    huella = json.dumps([con, titulo, estilo, que, horizontal, [[str(r), r.stat().st_size, int(r.stat().st_mtime)] for r in refs]], ensure_ascii=False)
    firma = hashlib.sha1(huella.encode()).hexdigest()
    antes = {}
    try:
        antes = json.loads(estado.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    if antes.get("firma") == firma:
        if antes.get("estado") == "lista" and salida.exists():
            print(f"✓ portada con IA: ya estaba ({antes.get('gasto', '')}, nada nuevo)")
            return
        if antes.get("estado") == "generando" and time.time() - antes.get("desde", 0) < TOPE + 60:
            print("la portada con IA ya se está generando en otro proceso")
            return
    salida.parent.mkdir(parents=True, exist_ok=True)
    trabajo = salida.parent / "ia"
    trabajo.mkdir(exist_ok=True)
    inicio = time.time()
    escribir(estado, {"firma": firma, "estado": "generando", "desde": inicio, "con": con})
    try:
        # Las referencias, en PNG de 1024 px como mucho (las poses son .webp; Flow y Codex leen PNG seguro).
        listas = []
        for k, r in enumerate(refs[:4]):
            destino = trabajo / f"ref-{k + 1}.png"
            ffmpeg("-i", str(r), "-frames:v", "1", "-vf", "scale='min(1024,iw)':-2", str(destino))
            listas.append(destino)
        cuerpo = (HORIZONTAL if horizontal else VERTICAL).format(formato="{tam}", estilo=estilo.strip(), que=que.strip(), titulo=titulo)
        if con == CHATGPT:
            crudo, gasto = con_chatgpt(cuerpo, listas, horizontal, trabajo)
        else:
            crudo = trabajo / "generada.jpg"
            gasto = con_flow(con, cuerpo.replace("{tam}", "16:9" if horizontal else "9:16"), listas, horizontal, crudo)
        w, h = (1280, 720) if horizontal else (1080, 1920)
        ffmpeg("-i", str(crudo), "-frames:v", "1", "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos,crop={w}:{h}", str(salida))
    except Falla as e:
        escribir(estado, {"firma": firma, "estado": "fallo", "por": str(e), "segundos": round(time.time() - inicio)})
        print(f"✗ portada con IA: {e}")
        sys.exit(1)
    except Exception as e:  # lo que no se esperaba también cae al respaldo, sin romper el video
        escribir(estado, {"firma": firma, "estado": "fallo", "por": f"{type(e).__name__}: {e}", "segundos": round(time.time() - inicio)})
        raise
    escribir(estado, {"firma": firma, "estado": "lista", "gasto": gasto, "segundos": round(time.time() - inicio), "hecha": time.time()})
    print(f"✓ portada con IA en {time.time() - inicio:.0f} s: {salida} ({gasto})")


main()
