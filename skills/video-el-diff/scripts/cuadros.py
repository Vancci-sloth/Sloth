"""
Para ver el material antes de decidir cámaras y marcas.

    python cuadros.py hoja <video> <desde> <hasta> <paso> <salida.png>
    python cuadros.py hoja <video> <seg1,seg2,...> <salida.png>
        Hoja de miniaturas con el segundo de cada una: para encontrar el momento exacto de un clip.

    python cuadros.py rejilla <imagen | video@segundo> [<salida.png>] [--guardar <cuadro.png>]
        La imagen (o el cuadro de ese segundo del video) con una cuadrícula rotulada en PÍXELES ORIGINALES, para leer
        las coordenadas de `vista`, `camara` y `marcas`. Con --guardar, además guarda el cuadro a resolución completa
        (sirve como captura fija cuando el clip se mueve).
"""

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw


def cuadro(video: str, t: float, destino: Path, ancho: int | None = None) -> None:
    vf = ["-vf", f"scale={ancho}:-1"] if ancho else []
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-ss", str(t), "-i", video, "-frames:v", "1", *vf, "-update", "1", str(destino)], check=True)


def duracion(video: str) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video], capture_output=True, text=True)
    return float(r.stdout.strip())


def hoja(video: str, ts: list[float], salida: str) -> None:
    fin = duracion(video) - 0.1
    fuera = [t for t in ts if t > fin]
    ts = [t for t in ts if t <= fin]
    if not ts:
        sys.exit(f"{video} dura {fin + 0.1:.1f} s: ninguno de esos segundos cae dentro")
    if fuera:
        print(f"{video} dura {fin + 0.1:.1f} s: sin los segundos {', '.join(f'{t:g}' for t in fuera)}")
    with tempfile.TemporaryDirectory() as tmp:
        ims = []
        for i, t in enumerate(ts):
            f = Path(tmp) / f"{i}.png"
            cuadro(video, t, f, 400)
            ims.append(Image.open(f).convert("RGB"))
        w, h = ims[0].size
        cols = 6
        s = Image.new("RGB", (w * cols, h * ((len(ims) + cols - 1) // cols)))
        d = ImageDraw.Draw(s)
        for i, (t, im) in enumerate(zip(ts, ims)):
            x, y = (i % cols) * w, (i // cols) * h
            s.paste(im, (x, y))
            d.rectangle([x, y, x + 56, y + 16], fill="black")
            d.text((x + 3, y + 2), f"{t:g}", fill="yellow")
        s.save(salida)
    print(salida, s.size)


def rejilla(entrada: str, salida: str | None, guardar: str | None) -> None:
    if "@" in entrada and not Path(entrada).exists():
        video, t = entrada.rsplit("@", 1)
        destino = Path(guardar) if guardar else Path(tempfile.mkdtemp()) / "cuadro.png"
        destino.parent.mkdir(parents=True, exist_ok=True)
        cuadro(video, float(t), destino)
        im = Image.open(destino).convert("RGB")
    else:
        im = Image.open(entrada).convert("RGB")
    if salida is None:
        print(guardar, im.size)
        return
    W, H = im.size
    ancho = min(1400, W) if W <= 1400 else 1100
    esc = ancho / W
    paso = 100 if W <= 2000 else 200
    im2 = im.resize((ancho, int(H * esc)))
    d = ImageDraw.Draw(im2)
    for x in range(0, W, paso):
        d.line([(x * esc, 0), (x * esc, im2.height)], fill=(255, 0, 255))
        d.text((x * esc + 2, 2), str(x), fill=(255, 0, 255))
    for y in range(0, H, paso):
        d.line([(0, y * esc), (ancho, y * esc)], fill=(0, 200, 255))
        d.text((2, y * esc + 2), str(y), fill=(0, 200, 255))
    im2.save(salida)
    print(salida, f"original {W}x{H}, rejilla cada {paso} px")


def ruta(r: str) -> str:
    """Acepta rutas relativas a la carpeta actual o a public/, como ubicar.py (clips/tema.mp4@12, web/x.png)."""
    base, _, seg = r.partition("@")
    if not Path(base).exists() and (Path("public") / base).exists():
        base = str(Path("public") / base)
    if not Path(base).exists():
        sys.exit(f"no existe {base} (ni aquí ni en public/)")
    return f"{base}@{seg}" if seg else base


def main() -> None:
    a = sys.argv[1:]
    guardar = None
    if "--guardar" in a:
        i = a.index("--guardar")
        guardar = a[i + 1]
        a = a[:i] + a[i + 2:]
    if a[:1] == ["hoja"] and len(a) == 6:
        desde, hasta, paso = float(a[2]), float(a[3]), float(a[4])
        hoja(ruta(a[1]), [round(desde + k * paso, 2) for k in range(int((hasta - desde) / paso + 1e-6) + 1)], a[5])
    elif a[:1] == ["hoja"] and len(a) == 4:
        hoja(ruta(a[1]), [float(x) for x in a[2].split(",")], a[3])
    elif a[:1] == ["rejilla"] and len(a) in (2, 3) and (len(a) == 3 or guardar):
        rejilla(ruta(a[1]), a[2] if len(a) == 3 else None, guardar)
    else:
        sys.exit(__doc__)


main()
