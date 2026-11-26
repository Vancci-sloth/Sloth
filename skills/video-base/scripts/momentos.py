"""
El motor común de los estilos que se hacen con `momentos.json` (el explicativo, el documental…): el agente escribe qué
se ve en cada palabra y el `hacer.py` de su estilo hace todo lo demás de fondo. Aquí está lo que esos `hacer.py`
comparten; el contrato entero, en MOTOR.md de video-base.

    import sys; sys.path.insert(0, "<base>/scripts")
    from momentos import Reloj, anclar, busca, hoja, leer, normal, palabras_de, parar, tiras, pares

La portada con IA también es de todos (`con_imagenes`, `pedir_portada`, `esperar_portada`; PORTADA.md).

Solo la biblioteca estándar y FFmpeg: corre con el `python` del sistema y con el de VyMotion.
"""

import atexit
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
from pathlib import Path


def normal(s: str) -> str:
    """Una palabra como se compara: minúsculas, sin acentos, tildes ni signos («Niñez,» es «ninez»; se quedan % y $)."""
    s = unicodedata.normalize("NFD", s.lower())
    return re.sub(r"[^a-z0-9%$]", "", "".join(c for c in s if unicodedata.category(c) != "Mn"))


def palabras_de(texto: str) -> list[str]:
    return [w for w in (normal(p) for p in texto.split()) if w]


def busca(lista: list[str], frase: str, vez: int = 1, desde: int = 0) -> int:
    """Dónde empieza `frase` (la vez `vez`, contando desde `desde`) en la lista de palabras ya normalizadas, o -1."""
    b = palabras_de(frase)
    if not b:
        return -1
    vistas = 0
    for i in range(desde, len(lista) - len(b) + 1):
        if lista[i:i + len(b)] == b:
            vistas += 1
            if vistas == vez:
                return i
    return -1


def anclar(momentos: list[dict], dichas: list[str], donde: str) -> tuple[list[int], list[str]]:
    """
    En qué palabra de lo dicho cae cada momento (su `palabra`, de una a tres seguidas), y lo que falla: una que no se
    dice o un momento antes que el anterior. Sin `vez`, es la primera vez que se dice después del momento anterior (lo
    que casi siempre se quiere: «que el» se dice tres veces y toca la que sigue); con `vez`, esa vez contando desde el
    principio. `donde` es de dónde salen las palabras («el guion», «la voz», «la grabación»). El índice es -1 si falla.
    """
    indices, errores, antes = [], [], -1
    for k, mo in enumerate(momentos):
        que = f"momento {k + 1} («{mo.get('palabra', '')}»)"
        frase = str(mo.get("palabra", ""))
        if mo.get("vez"):
            vez = int(mo["vez"])
            i = busca(dichas, frase, vez)
        else:
            vez = 1
            i = busca(dichas, frase, 1, antes + 1)
        if i < 0 and busca(dichas, frase) < 0:
            errores.append(f"{que}: {donde} no dice «{frase}»")
        elif i < 0 or i <= antes:
            errores.append(f"{que}: va antes que el momento anterior en {donde} (o en la misma palabra)"
                           + (f": no se dice {vez} veces" if i < 0 and vez > 1 else "") + ": ordénalos como se dicen")
            i = -1
        antes = max(antes, i)
        indices.append(i)
    return indices, errores


def leer(raiz: Path, nombre: str = "momentos.json") -> dict:
    """momentos.json de la raíz del proyecto; si no está o no es JSON, para diciendo qué pasa."""
    archivo = raiz / nombre
    if not archivo.exists():
        sys.exit(f"✗ Falta {nombre} en la raíz del proyecto ({raiz}).")
    try:
        return json.loads(archivo.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"✗ {nombre} no es JSON: {e}")


def parar(errores: list[str], de: str = "momentos.json") -> None:
    """Todo lo que falla, de una vez: cada ✗ suelto le cuesta al agente una vuelta entera."""
    if errores:
        sys.exit(f"✗ {de}:\n  " + "\n  ".join(errores))


def guardar(archivo: Path, datos) -> None:
    """Un JSON entero o nada: temporal y reemplazo, que el estudio lo relee en cuanto cambia."""
    archivo.parent.mkdir(parents=True, exist_ok=True)
    tmp = archivo.with_name(archivo.name + ".tmp")
    tmp.write_text(json.dumps(datos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    os.replace(tmp, archivo)


class Reloj:
    """
    Los pasos de un `hacer.py`, con su segundo: los dice («[  12 s] render…») y, al salir, deja cuánto tardó cada uno
    en `revision/tiempos.json`, acabe bien o en ✗: los minutos de máquina de un video, sin leer la transcripción del
    agente.
    """

    def __init__(self, raiz: Path):
        self.raiz, self.inicio, self.pasos, self.video = raiz, time.time(), [], None
        atexit.register(self._cerrar)

    def paso(self, texto: str) -> None:
        ahora = time.time() - self.inicio
        if self.pasos:
            self.pasos[-1]["s"] = round(ahora - self.pasos[-1]["en"], 1)
        self.pasos.append({"paso": texto.split("\n")[0][:80], "en": round(ahora, 1)})
        print(f"[{ahora:5.0f} s] {texto}", flush=True)

    def nota(self, clave: str, valor) -> None:
        """Algo que decir del paso que corre (que esperó a la GPU de otro video, por ejemplo): va a `tiempos.json`."""
        if self.pasos:
            self.pasos[-1][clave] = valor

    def listo(self, video: Path, mira: list[Path]) -> None:
        """La última línea de todo `hacer.py`: «✓ listo» es lo que busca `npm run medir-videos`."""
        self.video = video
        self.paso(f"✓ listo: {video}\n  Mira " + " y ".join(str(m) for m in mira) + ".")

    def _cerrar(self) -> None:
        if not self.pasos:
            return
        total = time.time() - self.inicio
        self.pasos[-1].setdefault("s", round(total - self.pasos[-1]["en"], 1))
        try:
            guardar(self.raiz / "revision" / "tiempos.json",
                    {"total": round(total, 1), "listo": bool(self.video), "video": str(self.video) if self.video else None,
                     "pasos": self.pasos})
        except OSError:
            pass


def opcion(args: list[str], nombre: str) -> str | None:
    """El valor que sigue a `nombre` en `args`, que se queda sin los dos; None si no viene."""
    if nombre not in args:
        return None
    i = args.index(nombre)
    if i + 1 >= len(args) or args[i + 1].startswith("--"):
        sys.exit(f"✗ {nombre} lleva su valor")
    valor = args[i + 1]
    del args[i:i + 2]
    return valor


def con_imagenes(raiz: Path, pedido: str | None) -> str:
    """
    Con qué se genera la portada de este video: lo de la línea `Imágenes:` del mensaje, que llega a `hacer.py` con
    `--imagenes chatgpt` o `--imagenes "<modelo de Flow>"` (`pedido`) y se queda apuntado en `portada/imagenes.json`
    para las corridas que sigan sin él. Vacío si el usuario no eligió con qué: el estilo pone su portada de respaldo.
    """
    apunte = raiz / "portada" / "imagenes.json"
    if pedido is not None:
        con = "chatgpt" if pedido.strip().lower() in ("chatgpt", "codex") else pedido.strip()
        guardar(apunte, {"con": con})
        return con
    try:
        return json.loads(apunte.read_text(encoding="utf-8")).get("con") or ""
    except (OSError, ValueError):
        return ""


def _decir(texto: str) -> None:
    print("  " + texto, flush=True)


def pedir_portada(raiz: Path, con: str, titulo: str, estilo: str, que: str, refs: list[Path] | tuple = (),
                  horizontal: bool = False, decir=None) -> subprocess.Popen | None:
    """
    La portada con IA de todo estilo, de fondo desde ya (portada_ia.py), con lo que el usuario eligió en «Imágenes»
    (`con`: `chatgpt` o un modelo de Flow; vacío, nada). No mira el video, que aún no existe: va del `titulo` (de dos a
    cinco palabras), de cómo se ve el estilo (`estilo`, en inglés: su mundo, sus colores, su letra), de lo que cuenta
    este video (`que`) y de las imágenes de referencia que ya haya (`refs`: el personaje, el protagonista, una foto).
    Queda en `portada/ia.png`, a 1080×1920 o a 1280×720 con `horizontal`; se recoge con `esperar_portada`.
    """
    titulo = re.sub(r"[.,;:]+$", "", " ".join(titulo.split()))
    if not con or not titulo:
        return None
    decir = decir or _decir
    salida = raiz / "portada" / "ia.png"
    salida.parent.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, "-B", "-X", "utf8", str(Path(__file__).with_name("portada_ia.py")), con, str(salida),
           "--titulo", titulo, "--estilo", estilo, "--que", que,
           *[x for r in refs if Path(r).is_file() for x in ("--ref", str(r))], *(["--horizontal"] if horizontal else [])]
    log = open(salida.parent / "ia.log", "w", encoding="utf-8")
    decir(f"portada con IA ({'ChatGPT' if con == 'chatgpt' else 'Flow, ' + con}), de fondo mientras se hace el video")
    return subprocess.Popen(cmd, cwd=raiz, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)


def esperar_portada(raiz: Path, proceso: subprocess.Popen | None, desde: float, respaldo: str, tope: float = 90,
                    decir=None) -> Path | None:
    """
    La portada con IA que pidió `pedir_portada`, si llegó: se espera `tope` segundos como mucho (casi siempre ya está:
    tarda de 30 a 90 s, y el video, más). Si no llegó o falló, None, y dice por qué y que va `respaldo` («la del cuadro
    del titular»). `desde` es cuándo arrancó este `hacer.py`: una de antes que no cambió no gastó nada nuevo.
    """
    if not proceso:
        return None
    decir = decir or _decir
    salida, estado = raiz / "portada" / "ia.png", raiz / "portada" / "ia.png.json"
    hasta = time.time() + tope
    leido: dict = {}
    while time.time() < hasta:
        if proceso.poll() is not None:
            try:
                leido = json.loads(estado.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                leido = {}
            # Si otro hacer.py ya la estaba generando, este sale al momento: se espera a aquel por su estado.
            if leido.get("estado") != "generando":
                break
        time.sleep(1)
    else:
        # No se mata: si llega, queda en portada/ia.png, y otro hacer.py la toma sin pedirla otra vez.
        decir(f"la portada con IA no llegó en {tope:.0f} s: va {respaldo} (si llega, queda en portada/ia.png)")
        return None
    if leido.get("estado") == "lista" and salida.exists():
        if leido.get("hecha", 0) < desde:
            decir(f"portada con IA: la de antes, que no cambió (nada nuevo gastado; aquella: {leido.get('gasto', '?')})")
        else:
            decir(f"portada con IA lista en {leido.get('segundos', '?')} s, mientras se hacía el video. Gastó: {leido.get('gasto', '?')}")
        return salida
    decir(f"la portada con IA no salió ({leido.get('por') or 'mira portada/ia.log'}): va {respaldo}")
    return None


def duracion(video: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
                       capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def hoja(video: Path, salida: Path, cada: float = 1.5, columnas: int = 6, ancho: int = 300) -> Path:
    """Un cuadro cada `cada` segundos en una sola imagen: lo que el agente mira al terminar, de un vistazo."""
    salida.parent.mkdir(parents=True, exist_ok=True)
    filas = max(1, -(-int(duracion(video) / cada) // columnas))
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{cada / 2:.2f}", "-i", str(video), "-vf",
                    f"fps=1/{cada},scale={ancho}:-1,tile={columnas}x{filas}:padding=4", "-frames:v", "1", str(salida)], check=True)
    return salida


def tiras(video: Path, carpeta: Path, fps: float = 2, columnas: int = 8, filas: int = 4, ancho: int = 240) -> list[Path]:
    """
    Para juzgar un video: los cuadros seguidos, a `fps` por segundo, en tiras `tira-N.jpg` con su segundo en cada uno.
    Con uno cada 1,5 s el movimiento no se ve, y sin él no se puede juzgar si entretiene.
    """
    carpeta.mkdir(parents=True, exist_ok=True)
    for vieja in carpeta.glob("tira-*.jpg"):
        vieja.unlink()
    rotulo = (f"drawtext=text='%{{pts\\:hms}}':x=6:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6,"
              if sys.platform != "win32" else
              "drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='%{pts\\:hms}':x=6:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6,")
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(video), "-vf",
                    f"fps={fps},scale={ancho}:-2,{rotulo}tile={columnas}x{filas}:padding=3", "-q:v", "4",
                    str(carpeta / "tira-%d.jpg")], check=True)
    return sorted(carpeta.glob("tira-*.jpg"), key=lambda p: int(p.stem.split("-")[1]))


def pares(a: Path, b: Path, carpeta: Path, cada: float = 2, columnas: int = 4, ancho: int = 240) -> list[Path]:
    """El antes (izquierda) y el después (derecha) lado a lado, en los mismos segundos: `<carpeta>/par-N.jpg`."""
    carpeta.mkdir(parents=True, exist_ok=True)
    for viejo in carpeta.glob("par-*.jpg"):
        viejo.unlink()
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(a), "-i", str(b), "-filter_complex",
                    f"[0:v]fps=1/{cada},scale={ancho}:-2[a];[1:v]fps=1/{cada},scale={ancho}:-2[b];"
                    f"[a][b]hstack=inputs=2:shortest=1,pad=iw+12:ih+12:6:6:white,tile={columnas}x3:padding=3",
                    "-q:v", "4", str(carpeta / "par-%d.jpg")], check=True)
    return sorted(carpeta.glob("par-*.jpg"), key=lambda p: int(p.stem.split("-")[1]))
