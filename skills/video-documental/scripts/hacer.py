"""
El documental entero en un comando, de fondo: de `momentos.json` (lo único que escribe el agente: qué se ve en cada
palabra de la grabación) a `out/final.mp4`, medido, con su portada y su hoja de cuadros para mirarlo. Es el mismo motor
que el explicativo (`video-base/MOTOR.md`): aquí el guion ya está dicho, es la grabación.

    python -I -B -X utf8 <skill>/scripts/hacer.py --revisa     solo revisa momentos.json contra la grabación (un segundo)
    python -I -B -X utf8 <skill>/scripts/hacer.py              todo: material, edición, render, medida y portada
    python -I -B -X utf8 <skill>/scripts/hacer.py --material   solo baja y trata el material (revision/material.jpg)

Desde la raíz del proyecto (la carpeta que dejó `nuevo.py`). En orden, y para en el primer ✗ diciendo todo lo que hay
que arreglar de una vez:
1. Comprueba momentos.json: cada `palabra` en la grabación y en orden, cada cosa de `material`, las formas, el ritmo
   (un momento cada dos segundos o menos), cuánto sale la cara y cuánto es imagen en movimiento.
2. Baja y trata todo el material en paralelo (material.py) y, a la vez, recorta a quien habla para la frase estrella
   (`mega`, `mundo`). Lo ya bajado no se baja otra vez. Deja FUENTES.md (de dónde salió cada cosa y qué derechos hay
   que revisar) y revision/material.jpg.
3. La cama de música, si el proyecto trae una canción en public/assets/music/ (bed-mix.py: se corta bajo `remate`).
4. El director (components/director.py) arma la edición: src/edicion.json y el sonido.
5. Render, sonido a −14 LUFS, out/final.mp4 y su comprobación (terminar.py); que no se haya tapado ninguna palabra
   (transcribir.py --comparar); la medida (medir.py) y la portada: el cuadro de la palabra roja.
"""

import hashlib
import json
import os
import subprocess
import sys
import threading
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
BASE = SKILL.parent / "video-base" / "scripts"
RAIZ = Path.cwd()
PY = [sys.executable, "-I", "-B", "-X", "utf8"]
# Los scripts de la skill buscan video-base por SLOTH_SKILLS: que sea la de esta copia, no la de la app instalada.
os.environ.setdefault("SLOTH_SKILLS", str(SKILL.parent))
sys.path.insert(0, str(BASE))
sys.path.insert(0, str(SKILL / "scripts"))
sys.path.insert(0, str(SKILL / "components"))
from momentos import Reloj, hoja, leer, parar  # noqa: E402

CAMARA = RAIZ / "public" / "assets" / "media" / "cam_raw.mp4"
MUSICA = (".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac")
MULETILLAS = {"eh", "em", "este", "mmm", "mm", "ah", "o", "y", "pues"}


def correr(cmd: list[str], que: str, fatal: bool = True) -> str:
    r = subprocess.run(cmd, cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", errors="replace")
    salida = (r.stdout + r.stderr).strip()
    if r.returncode and fatal:
        sys.exit(f"✗ {que} falló:\n" + salida[-2500:])
    return salida


def recortes(momentos: list[dict], errores: list[str]) -> None:
    """
    El recorte de quien habla (matte.py, en la GPU) de cada momento con `mega` o `mundo`, desde su palabra. Con el
    mismo tramo ya hecho, no se rehace. Si falla, el momento va sin recorte y se dice: no tumba el video.
    """
    import director
    for x in momentos:
        if not x.get("recorte"):
            continue
        desde = director.mega_en(x) if x.get("mega") and x.get("forma") != "mundo" else x["t0"]
        dura = x["t1"] - desde
        firma = hashlib.sha1(f"{desde:.3f}-{dura:.3f}-{CAMARA.stat().st_mtime_ns}".encode()).hexdigest()[:10]
        salida = RAIZ / "public" / "assets" / "media" / f"recorte-{firma}.webm"
        if not salida.exists():
            r = subprocess.run(PY + [str(SKILL / "scripts" / "matte.py"), "--plate", str(CAMARA), "--start", f"{desde:.4f}",
                                     "--dur", f"{dura:.4f}", "--out", str(salida)], cwd=RAIZ, capture_output=True, text=True,
                               encoding="utf-8", errors="replace")
            if r.returncode or not salida.exists():
                salida.unlink(missing_ok=True)
                errores.append(f"momento {x['k'] + 1}: no salió el recorte ({(r.stderr or r.stdout).strip()[-200:]}); va sin la palabra detrás de la cabeza")
                continue
        x["recorte_archivo"] = f"assets/media/{salida.name}"


def cama(m: dict, p: dict, reloj: Reloj) -> None:
    """La voz con la canción del usuario debajo: suena desde el cuadro 0, baja bajo el negro y se corta bajo el remate."""
    premezcla = RAIZ / "work" / "premix.wav"
    carpeta = RAIZ / "public" / "assets" / "music"
    cancion = next((f for f in sorted(carpeta.glob("*")) if f.suffix.lower() in MUSICA), None) if carpeta.exists() else None
    if m.get("musica"):
        cancion = RAIZ / "public" / "assets" / "music" / str(m["musica"])
        if not cancion.exists():
            sys.exit(f"✗ No está la canción public/assets/music/{m['musica']}")
    if not cancion:
        premezcla.unlink(missing_ok=True)
        return
    rampas = []
    for x in p["momentos"]:
        ve = x.get("ve")
        if x.get("remate"):
            rampas += ["--ramp", f"{x['t0']:.3f},{x['t1']:.3f},-70,0.012"]
        elif ve == "negro" or ve == "maquina":
            rampas += ["--ramp", f"{x['t0']:.3f},{x['t1']:.3f},-8"]
    reloj.paso(f"la cama de música ({cancion.name})…")
    correr(PY + [str(SKILL / "scripts" / "bed-mix.py"), "--voice", "public/assets/media/vo.wav", "--song", str(cancion),
                 "--song-at", str(float(m.get("musica_desde", 0))), "--dur", f"{p['dur']:.3f}", "--under", "5.5",
                 "--voice-end", f"{p['fin']:.3f}", *rampas, "--out", str(premezcla)], "la cama de música")


def portada(t: float | None, video: Path, vertical: bool) -> Path | None:
    """
    La portada: el cuadro de la palabra roja ya entera (el primer `mega`; si no hay, la primera palabra `grande`), con
    la cara cruda o su material: el segundo lo dice el director. En vertical va de primer fotograma; en horizontal
    queda de miniatura (1280×720).
    """
    if t is None:
        return None
    salida = RAIZ / "portada.png"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(video), "-frames:v", "1",
                    *([] if vertical else ["-vf", "scale=1280:720:flags=lanczos"]), str(salida)], cwd=RAIZ, check=True)
    if vertical:
        correr(["node", str(BASE / "portada.mjs"), str(video), str(salida)], "la portada")
    return salida


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    revisa, solo_material = "--revisa" in args, "--material" in args
    if [a for a in args if a not in ("--revisa", "--material")]:
        sys.exit(__doc__)
    if not (RAIZ / "remotion.config.ts").exists():
        sys.exit("Córrelo desde la raíz del proyecto (la carpeta que dejó nuevo.py, donde está remotion.config.ts).")
    palabras = RAIZ / "work" / "tx" / "words.json"
    if not palabras.exists():
        sys.exit("✗ Falta la transcripción (work/tx/words.json): nuevo.py la deja; si no, transcribir.py .")
    m = leer(RAIZ)
    words = json.loads(palabras.read_text(encoding="utf-8"))
    if not words:
        sys.exit("✗ La grabación no trae palabras: ¿se oye la voz?")
    import director  # lee el formato del video (formato.txt) de esta carpeta
    import material
    words = director.despegar(words)
    p = director.plan(m, words)
    cosas = p["material"]  # lo de `material` y las referencias puestas tal cual en `ve`
    parar(p["errores"] + material.revisar(cosas))
    if revisa:
        print(f"✓ momentos.json bien: {len(p['momentos'])} momentos para {p['fin']:.0f} s, la cara el {p['cara']:.0%}. "
              "Ya puedes lanzar hacer.py de fondo")
        return
    reloj = Reloj(RAIZ)
    vertical = director.VERTICAL
    reloj.paso(f"momentos.json bien; bajando y tratando {len(cosas)} cosas"
               + (" y recortando la frase estrella" if any(x.get("recorte") for x in p["momentos"]) else ""))
    avisos: list[str] = []
    hilo = threading.Thread(target=recortes, args=(p["momentos"], avisos))
    hilo.start()
    hecho, errores = material.traer(RAIZ, cosas, p["duras"])
    marcados = material.fuentes(RAIZ, cosas, hecho)
    hoja_material = material.hoja(RAIZ, hecho)
    if errores:
        hilo.join()
        sys.exit("✗ material (cambia la referencia en momentos.json y vuelve a correr hacer.py: lo demás ya está bajado):\n  "
                 + "\n  ".join(errores))
    lentos = sorted(((h.get("s", 0), i) for i, h in hecho.items()), reverse=True)[:2]
    print("  material listo" + (f" (lo más lento: {', '.join(f'{i} {s:.0f} s' for s, i in lentos if s >= 5)})" if lentos and lentos[0][0] >= 5 else ""), flush=True)
    if solo_material:
        hilo.join()
        print(f"✓ material listo: mira {hoja_material}")
        return
    if hilo.is_alive():
        reloj.paso("el recorte de la frase estrella…")
    hilo.join()
    for a in avisos:
        print("  ⚠ " + a, flush=True)
    cama(m, p, reloj)
    reloj.paso("la edición…")
    datos = director.armar(m, words, hecho, p)
    # La portada de un render anterior no se pega a este: sale de este video, al final.
    (RAIZ / "portada.png").unlink(missing_ok=True)
    reloj.paso(f"render ({round(p['dur'] * 30)} cuadros)…")
    print("  " + correr(PY + [str(SKILL / "scripts" / "terminar.py"), "."], "el render").splitlines()[-1], flush=True)
    video = RAIZ / "out" / "final.mp4"
    # Lo que queda va a la vez: que se oiga cada palabra (en la GPU), la medida y la hoja. La portada, al final, que
    # cambia el primer fotograma del archivo que los otros están leyendo.
    reloj.paso("comprobando que se oye cada palabra, la medida y la hoja…")
    salidas: dict[str, str] = {}
    hilos = [threading.Thread(target=lambda: salidas.update(oido=correr(PY + [str(SKILL / "scripts" / "transcribir.py"), ".", "--comparar", "out/final.mp4"],
                                                                         "la comprobación de la voz", fatal=False))),
             threading.Thread(target=lambda: salidas.update(medida=correr(PY + [str(SKILL / "scripts" / "medir.py"), "."], "la medida", fatal=False)))]
    for h in hilos:
        h.start()
    mira = [hoja(video, RAIZ / "revision" / "hoja.png", cada=1.0, columnas=8, ancho=240 if not vertical else 150)]
    for h in hilos:
        h.join()
    if "Esperando:" in salidas.get("oido", ""):
        reloj.nota("espera", "la GPU estaba ocupada con otro video: este paso tardó de más")
    # Una muletilla que el transcriptor a veces escribe y a veces no («eh,») no es una palabra tapada.
    def tapadas_en(oido: str) -> list[str]:
        return [l for l in oido.splitlines() if "se dijo «" in l
                and not all(w in MULETILLAS for w in director.palabras_de(l.split("«", 1)[1].split("»", 1)[0]))]

    tapadas = tapadas_en(salidas.get("oido", ""))
    for l in tapadas[:8]:
        print("  ⚠ no se oye bien:" + l, flush=True)
    for l in salidas.get("medida", "").splitlines():
        print("  " + l, flush=True)
    foto = portada(datos.get("portada"), video, vertical)
    if marcados:
        print("  Derechos por revisar (FUENTES.md), díselo al usuario:\n    " + "\n    ".join(marcados), flush=True)
    # Una sola imagen que mirar: la hoja del video. El material y la portada quedan por si algo no se ve bien.
    print(f"  El material está en {hoja_material}" + (f" y la portada, en {foto}" if foto else "") + ".", flush=True)
    reloj.listo(video, mira)


main()
