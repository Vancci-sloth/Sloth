"""
Renderiza el episodio en su formato (el de `FORMATO` en guion.py: 1080x1920 o 1920x1080) y lo deja listo para subir. Se
corre en la raíz del proyecto, en segundo plano. Si otro episodio está renderizando, espera su turno (`turno_render` en
comun.py).

    python <skill>/scripts/final.py

1. Lo renderiza por tramos en out/partes/, con el renderizador web de Remotion en Edge sin ventana (render_web.mjs): el
   propio Edge pinta cada cuadro y la tarjeta lo codifica, con varios Edge a la vez. Un tramo es un párrafo de
   guion.json, partido en pedazos de hasta PEDAZO cuadros para que los Edge se repartan parejo. Cada tramo lleva en el
   nombre una huella de lo que lo dibuja (sus escenas, las vecinas y la cadena de `sigue` de la que vienen, todas las
   marcas de sus capturas en el episodio, sus archivos de public/, el código de src/): uno que no cambió no se vuelve a
   renderizar. Los 6.5 minutos del episodio de Photon tardaron 72 s (el render de siempre, con fotos de Chrome y FFmpeg,
   6.8 min); corregir una escena es renderizar sus pedazos.
   En vertical, si existe portada.png, va delante como un tramo más de un cuadro (PORTADA.md de video-base): cambiarla es
   renderizar ese cuadro y volver a unir.
2. Une los tramos sin recodificar: el video H.264 y el audio en PCM, que pegado sale idéntico, muestra por muestra.
3. out/el-diff-final.mp4: el audio a -14 LUFS con el pico real por debajo de -1.5 dBTP medidos en el AAC 256k
   (`masterizar` de comun.py: limitador y ganancia lineal), el video copiado, faststart. Se escribe aparte y se renombra
   al terminar: uno cortado no queda como bueno.
4. revision/final_hoja.png: seis cuadros del final para revisarlo.
5. Abre el Explorador con el archivo seleccionado.
"""

import hashlib
import json
import math
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

from comun import comprobar_disco, enlazar_modulos, ffmpeg, masterizar, reemplazar, sonoridad, turno_render

PEDAZO = 750  # cuadros (25 s): 11,676 cuadros en 16 pedazos para 4 Edge
BITRATE = 20_000_000  # H.264 a 20 Mbps: VMAF 97 contra el x264 de antes, que pesaba un 25 % más
MOTOR = f"render web, h264 {BITRATE}, pcm"  # va en la huella: otro motor u otro bitrate no se pega sin recodificar


def estado(f: Path, public: Path) -> str:
    """Nombre, tamaño y fecha: cambia si el archivo cambia, no si el proyecto se mueve de carpeta."""
    s = f.stat()
    return f"{f.relative_to(public).as_posix()}:{s.st_size}:{s.st_mtime_ns}"


def rutas(o, public: Path) -> list[Path]:
    """Los archivos de public/ que nombra una escena (capturas, clips, emojis)."""
    if isinstance(o, dict):
        return [r for v in o.values() for r in rutas(v, public)]
    if isinstance(o, list):
        return [r for v in o for r in rutas(v, public)]
    if isinstance(o, str) and "/" in o and len(o) < 200 and (public / o).is_file():
        return [(public / o).resolve()]
    return []


def huella_base(raiz: Path, linea: dict):
    """Lo que cambia todo lo renderizado: el código, la voz y la música. La usa final.py."""
    public = (raiz / "public").resolve()
    comun = hashlib.sha1()
    for f in sorted(p for p in (raiz / "src").rglob("*") if p.is_file() and p.name != "timeline.json"):
        comun.update(f.read_bytes())
    comun.update((raiz / "package-lock.json").read_bytes() if (raiz / "package-lock.json").exists() else b"")
    comun.update(json.dumps(linea["parrafos"]).encode())
    comun.update(json.dumps([linea.get("formato"), linea.get("gancho")]).encode())  # el rótulo de arriba sale en todo
    comun.update(MOTOR.encode())
    for d in ("audio", "voz"):
        for f in sorted((public / d).rglob("*")) if (public / d).exists() else []:
            if f.is_file():
                comun.update(estado(f, public).encode())
    return comun


def huella_beats(h, beats: list[dict], public: Path) -> None:
    """Suma a `h` unos beats y los archivos de public/ que nombran."""
    h.update(json.dumps(beats, sort_keys=True).encode())
    for f in sorted(set(rutas(beats, public))):
        h.update(estado(f, public).encode())


def tramos(raiz: Path) -> list[tuple[str, int, int, str]]:
    """(nombre, primer cuadro, último cuadro, huella) de cada párrafo."""
    linea = json.loads((raiz / "src" / "timeline.json").read_text(encoding="utf8"))
    guion = json.loads((raiz / "guion.json").read_text(encoding="utf8"))
    fps, public = linea["fps"], (raiz / "public").resolve()
    total = math.ceil(linea["duracion"] * fps)  # igual que DURACION en Video.tsx
    beats = linea["beats"]
    indice = {b["id"]: i for i, b in enumerate(beats)}
    comun = huella_base(raiz, linea)

    # Lo que conCitas (Video.tsx) junta de todo el episodio para encuadrar cada captura en vertical: las marcas y el foco
    # de cada imagen, estén en el beat que estén. Mover una marca de b127 cambia el encuadre de b118, en otro tramo.
    citas: dict[str, list] = {}
    for x in beats if linea.get("formato") == "vertical" else []:
        if x["v"].get("tipo") == "captura" and x["v"].get("img"):
            citas.setdefault(x["v"]["img"], []).append([x["v"].get("marcas"), x["v"].get("foco")])

    inicios = [round(beats[indice[p["beats"][0]["id"]]]["inicio"] * fps) for p in guion["parrafos"] if p["beats"]]
    inicios[0] = 0
    nombres = [p["id"] for p in guion["parrafos"] if p["beats"]]
    salida = []
    for i, (nombre, a) in enumerate(zip(nombres, inicios)):
        b = (inicios[i + 1] if i + 1 < len(inicios) else total) - 1
        if b < a:
            continue  # un párrafo que la voz aún no dice: no dura nada
        # Una escena se encadena con la anterior y la siguiente (encadena() de Video.tsx): entran las vecinas, y si la
        # primera sigue la toma de otra (`sigue`), toda la cadena hasta la que la empieza.
        dentro = [j for j, x in enumerate(beats) if round(x["inicio"] * fps) <= b and round(x["fin"] * fps) >= a]
        cerca = []
        if dentro:
            j0 = max(0, min(dentro) - 1)
            while j0 > 0 and beats[j0]["v"].get("sigue"):
                j0 -= 1
            cerca = beats[j0: max(dentro) + 2]
        h = comun.copy()
        h.update(f"{a}-{b}".encode())
        huella_beats(h, cerca, public)
        imgs = sorted({x["v"]["img"] for x in cerca if x["v"].get("tipo") == "captura" and x["v"].get("img")})
        h.update(json.dumps([citas.get(img) for img in imgs], sort_keys=True).encode())
        # El párrafo, en pedazos parejos de hasta PEDAZO cuadros; cada uno con su huella.
        n = math.ceil((b - a + 1) / PEDAZO)
        cortes = [a + round(k * (b - a + 1) / n) for k in range(n + 1)]
        for k in range(n):
            hk = hashlib.sha1(f"{h.hexdigest()}:{cortes[k]}".encode()).hexdigest()[:10]
            salida.append((f"{i + 1:02d}-{nombre}" + (f"-{k + 1}" if n > 1 else ""), cortes[k], cortes[k + 1] - 1, hk))
    return salida


def plantilla_vieja(raiz: Path) -> None:
    """El render web no acepta <OffthreadVideo> ni el <Audio> de remotion: los episodios de antes traen esa plantilla."""
    video = (raiz / "src" / "Video.tsx").read_text(encoding="utf8")
    viejos = [p.relative_to(raiz).as_posix() for p in sorted((raiz / "src").rglob("*.tsx"))
              if re.search(r'import \{[^}]*\bOffthreadVideo\b[^}]*\} from "remotion"', p.read_text(encoding="utf8"))]
    if viejos or "@remotion/media" not in video:
        raise SystemExit("Este episodio trae la plantilla de antes del render web (<OffthreadVideo> o el <Audio> de remotion"
                         f"{': ' + ', '.join(viejos) if viejos else ''}). Copia de <skill>/plantilla/src a src/ Video.tsx, "
                         "piezas.tsx y los de escenas/ que nombra (compáralos antes: si el episodio los cambió, pasa esos "
                         "cambios a mano) y vuelve a correr final.py.")


def tramo_portada(raiz: Path, linea: dict) -> tuple[str, int, int, str]:
    """
    La portada como un tramo más, de un cuadro, que va delante (PORTADA.md de video-base). La dibuja el mismo Edge y la
    codifica la misma tarjeta que el resto, así que se pega sin recodificar: antes portada.mjs volvía a codificar el
    episodio entero con x264 (92 s y una segunda compresión).
    """
    h = hashlib.sha1((raiz / "portada.png").read_bytes())
    h.update(json.dumps([MOTOR, linea.get("formato")]).encode())
    h.update((Path(__file__).parent / "render_web.mjs").read_bytes())  # el componente que la dibuja
    return ("00-portada", 0, 0, h.hexdigest()[:10])


def main() -> None:
    raiz = Path.cwd()
    out, rev = raiz / "out", raiz / "revision"
    dir_partes = out / "partes"
    dir_partes.mkdir(parents=True, exist_ok=True)
    rev.mkdir(exist_ok=True)

    t0 = time.time()
    enlazar_modulos(raiz)
    plantilla_vieja(raiz)
    linea = json.loads((raiz / "src" / "timeline.json").read_text(encoding="utf8"))
    vertical = linea.get("formato") == "vertical"
    plan = tramos(raiz)
    if vertical and (raiz / "portada.png").exists():
        plan.insert(0, tramo_portada(raiz, linea))
    videos = [dir_partes / f"{nombre}-{huella}.mov" for nombre, a, b, huella in plan]
    faltan = [(nombre, a, b, v) for (nombre, a, b, _), v in zip(plan, videos) if not v.exists()]
    if faltan:
        with turno_render():
            comprobar_disco(raiz)
            encargo = out / "encargo.json"
            encargo.write_text(json.dumps({"bitrate": BITRATE, "tramos": [
                {"nombre": n, "desde": a, "hasta": b, "salida": str(v), "tipo": "portada" if n == "00-portada" else "video"}
                for n, a, b, v in faltan]}), encoding="utf8")
            try:
                r = subprocess.run(["node", str(Path(__file__).parent / "render_web.mjs"), str(encargo)], cwd=raiz)
            finally:
                encargo.unlink(missing_ok=True)
            if r.returncode:
                raise SystemExit("El render no terminó (arriba dice por qué). Lo que sí salió se queda en out/partes: "
                                 "volver a correr final.py rehace solo lo que falta.")
    for viejo in set(dir_partes.iterdir()) - set(videos):
        viejo.unlink()  # tramos de versiones anteriores
    print(f"tramos: {len(faltan)} renderizados, {len(plan) - len(faltan)} ya estaban")
    final = out / "el-diff-final.mp4"
    al_dia = final.exists() and all(v.stat().st_mtime < final.stat().st_mtime for v in videos)
    if al_dia:
        print(f"{final} ya estaba al día: no cambió ningún tramo.")
    else:
        lista = dir_partes / "lista.txt"
        lista.write_text("".join(f"file '{v.name}'\n" for v in videos), encoding="utf8")
        try:
            # El audio unido (PCM, unos 70 MB) se masteriza aparte; el master se guarda con la huella de ese audio, así
            # que cambiar solo la portada o una escena muda no lo repite.
            mezcla = out / "mezcla.wav"
            ffmpeg("-f", "concat", "-safe", "0", "-i", str(lista), "-map", "0:a", "-c", "copy", str(mezcla))
            master = out / f"master-{hashlib.sha1(mezcla.read_bytes()).hexdigest()[:10]}.m4a"
            if not master.exists():
                for viejo in out.glob("master-*.m4a"):
                    viejo.unlink()
                masterizar(mezcla, master)
            mezcla.unlink()
            f = sonoridad(master)
            # El color se etiqueta BT.709 de rango limitado, como lo dejaba portada.mjs al recodificar: Edge marca la
            # transferencia como sRGB y deja el resto sin decir en el H.264. Solo cambia la cabecera, no los cuadros.
            temporal = out / "el-diff-final.parcial.mp4"
            ffmpeg("-f", "concat", "-safe", "0", "-i", str(lista), "-i", str(master), "-map", "0:v", "-map", "1:a", "-c", "copy",
                   "-bsf:v", "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0",
                   "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
                   "-movflags", "+faststart", str(temporal))
            reemplazar(temporal, final)
        finally:
            lista.unlink(missing_ok=True)
        print(f"final: {f['lufs']:.1f} LUFS, pico {f['pico']:.1f} dBTP, medidos en el AAC")
        hoja(final, rev, vertical)
    if vertical and not (raiz / "portada.png").exists():
        print("Falta la portada: hazla según PORTADA.md de video-base y vuelve a correr final.py, que la pone.")
    print(f"{final} (en {(time.time() - t0) / 60:.1f} min)  ·  revisa revision/final_hoja.png")
    if os.name == "nt":
        subprocess.run(f'explorer.exe /select,"{final}"', shell=True)
    elif sys.platform == "darwin":
        subprocess.run(["open", "-R", str(final)])


def hoja(final: Path, rev: Path, vertical: bool) -> None:
    """Seis cuadros del final en revision/final_hoja.png: a 360x640 (el tamaño de un celular) en vertical, a 640x360 en horizontal."""
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(final)],
                               capture_output=True, text=True).stdout)
    w, h = (360, 640) if vertical else (640, 360)
    cols = 6 if vertical else 3
    lienzo = Image.new("RGB", (cols * w, (6 // cols) * h))
    cs = [rev / f"final_{i}.png" for i in range(6)]
    with ThreadPoolExecutor(6) as pool:
        list(pool.map(lambda i: ffmpeg("-ss", f"{dur * (i + 0.5) / 6:.2f}", "-i", str(final), "-frames:v", "1", "-vf", f"scale={w}:{h}",
                                       "-update", "1", str(cs[i])), range(6)))
    for i, c in enumerate(cs):
        lienzo.paste(Image.open(c), ((i % cols) * w, (i // cols) * h))
    lienzo.save(rev / "final_hoja.png")
    print(f"final: {dur:.1f} s")


if __name__ == "__main__":
    main()
