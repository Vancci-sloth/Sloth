"""Revisa la sincronía con la voz: cuadros seguidos del video, cada uno con su tiempo y, debajo, la envolvente de la
voz durante ese cuadro. En vertical, la franja de los subtítulos; en horizontal, que no los lleva, el cuadro entero
(los cortes de escena).

    python <skill>/scripts/sincronia.py out/el-diff-final.mp4 <desde_s> <segundos> <png> [cada_n_fotogramas]

Una palabra se pinta de amarillo en el cuadro donde su envolvente empieza a subir; una escena entra con su frase.
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

video, desde, largo, png = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), Path(sys.argv[4])
paso = int(sys.argv[5]) if len(sys.argv) > 5 else 3
fps = 30
n = int(largo * fps / paso)
tmp = png.parent / "sinc"
tmp.mkdir(parents=True, exist_ok=True)
ancho, alto = map(int, subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                       "-of", "csv=p=0", video], capture_output=True, text=True, check=True).stdout.split(","))
vertical = alto > ancho
w, h = (360, 140) if vertical else (360, 203)
recorte = "crop=1080:420:0:1250," if vertical else ""
subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-ss", f"{desde:.3f}", "-i", video, "-t", f"{largo:.3f}",
                "-vf", f"select='not(mod(n\\,{paso}))',{recorte}scale={w}:{h}", "-fps_mode", "passthrough", str(tmp / "c_%03d.png")], check=True)
pcm = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-ss", f"{desde:.3f}", "-i", video, "-t", f"{largo:.3f}",
                      "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], capture_output=True, check=True).stdout
a = np.abs(np.frombuffer(pcm, dtype=np.int16).astype(np.float32))
ref = np.percentile(a[: len(a) // 40 * 40].reshape(-1, 40).mean(1), 97) + 1  # escala: el 97 % de la envolvente
cuadros = sorted(tmp.glob("c_*.png"))[:n]
cols = 4
filas = (len(cuadros) + cols - 1) // cols
hoja = Image.new("RGB", (cols * w, filas * (h + 40)), "black")
for i, c in enumerate(cuadros):
    t0 = desde + i * paso / fps
    x, y = (i % cols) * w, (i // cols) * (h + 40)
    hoja.paste(Image.open(c), (x, y))
    d = ImageDraw.Draw(hoja)
    d.text((x + 4, y + 2), f"{t0:.2f}s", fill="yellow")
    # envolvente del audio durante este cuadro y los `paso` siguientes
    i0, i1 = int((t0 - desde) * 8000), int((t0 - desde + paso / fps) * 8000)
    seg = a[i0:i1]
    if len(seg):
        bloques = np.array_split(seg, 60)
        for k, b in enumerate(bloques):
            v = min(36, float(b.mean()) / ref * 36) if len(b) else 0
            d.line((x + 10 + k * 5.6, y + h + 38, x + 10 + k * 5.6, y + h + 38 - v), fill="cyan", width=4)
hoja.save(png)
print(png)
