# SKILL · Análisis de referencias: video → especificación

> **Cuándo cargar:** Cuando el usuario aporte un video/imagen de referencia (modos fiel o inspiración).
> **Fuente:** §11 (Master Knowledge Base v2, texto original sin reescribir). Los números § remiten a `skills/router.md` → índice.

> **Atajo en este repo:** `node tools/sheet.mjs referencia.mp4 --every 0.5` genera hojas de contactos 3×3 para ver el video sin reproducirlo; luego `--every 0.1` en los cortes difíciles.

---

# 11. Análisis de referencias e investigación

## 11.1 Inspección técnica

```bash
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate,pix_fmt,channels,sample_rate \
  -of default=nw=1 ref.mp4
```

Registrar duración, resolución, fps, códec, audio y número aproximado de escenas.

## 11.2 Muestreo en dos pasadas

```bash
mkdir -p frames
# Pasada 1: estructura (2–3 fps)
ffmpeg -v error -i ref.mp4 -vf "fps=3,scale=427:-1" frames/f_%03d.jpg

# Cortes de escena (candidatos): imprime los tiempos donde cambia la imagen
ffmpeg -i ref.mp4 -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep pts_time

# Pasada 2: solo transiciones difíciles (4–6 fps, o más)
ffmpeg -v error -ss 6.0 -t 1.5 -i ref.mp4 -vf "fps=8,scale=640:-1" frames/t_%03d.jpg
```

Hoja de contacto con marcas de tiempo:

```python
from PIL import Image, ImageDraw
import glob

FPS = 3
files = sorted(glob.glob("frames/f_*.jpg"))
for k in range(0, len(files), 12):
    sub = files[k:k + 12]
    ims = [Image.open(f) for f in sub]
    w, h = ims[0].size
    cols = 3
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (w * cols, h * rows))
    for i, im in enumerate(ims):
        ImageDraw.Draw(im).text((6, 4), f"t={(k + i) / FPS:.2f}s", fill=(255, 255, 0))
        sheet.paste(im, ((i % cols) * w, (i // cols) * h))
    sheet.save(f"sheet_{k // 12}.jpg", quality=88)
```

Una hoja de contacto **no** muestra el movimiento: revisar también clips a velocidad normal y en cámara lenta.

## 11.3 Ficha por escena

| Campo | Contenido |
|---|---|
| Tiempo | Inicio y fin exactos |
| Elementos | Texto **exacto**, iconos, formas, capturas |
| Composición | Posición, escala, alineación y jerarquía (px del lienzo) |
| Color | Fondo, acentos, valores HEX |
| Acción | Qué cambia y en qué orden |
| Timing | Duración, holds, solapes |
| Easing | Curva observada o hipótesis |
| Cámara | Zoom, pan, tilt, perspectiva |
| Profundidad | Capas, blur, oclusión |
| Sonido | Música, voz, impactos, transiciones |
| Entrada / salida | Estado inicial y final |
| **Confianza** | Observado · Medido · Inferido · Desconocido |

### Conversión de coordenadas

```text
x_px = (x_fotograma / ancho_fotograma) * ANCHO_LIENZO
y_px = (y_fotograma / alto_fotograma)  * ALTO_LIENZO
tamaño_base = tamaño_observado / escala_de_cámara   (si hay zoom en ese instante)
```

### No inventar precisión

Distinguir siempre:

- **Observado**: visible o audible directamente.
- **Medido**: estimado con fotogramas o análisis de audio.
- **Inferido**: explicación probable (p. ej. la curva de easing).
- **Desconocido**: no se puede determinar.

## 11.4 Protocolo de investigación continua (web y redes)

Objetivo: alimentar `design.md` y la biblioteca de patrones con **evidencia**, sin copiar activos ajenos.

1. **Fuentes primarias primero**: documentación y repositorios oficiales (versión, licencia, API), artículos de ingeniería de los autores, estudios con datos.
2. **Estudios con datos descargables** sirven para calibrar números (p. ej. el estudio de 100 videos de UI publica su conjunto codificado en JSON/CSV; para videos de producto de software reporta un tiempo mediano de ~1:14–1:18, ~8,4–8,6 cambios de escena por minuto y la primera pantalla de producto hacia los 13–18 s **[B]**).
3. **Redes sociales**: las plataformas no se rastrean masivamente ni se descargan activos sin permiso. Procedimiento:
   - la persona aporta **enlaces o archivos** de referencia;
   - el agente los analiza con §11.1–11.3;
   - registra solo **principios** (ritmo, jerarquía, easing, cámara), no activos (logo, texto, ilustración, música).
4. **Ficha de referencia**: URL, fecha de acceso, autor, licencia, qué se aprende, nivel de evidencia (A/B/C), patrón resultante, prueba que lo valida.
5. **Cadencia**: revisar tendencias cada trimestre y versiones/licencias **cada vez** que se use una API o librería.
6. **Cada hallazgo se convierte en un test**: una regla vale si el QA puede comprobarla (§13).
7. **Distinguir ruido de señal**: un blog con titular llamativo no es un dato; preferir muestras, fechas y metodología.

## 11.5 Fidelidad

En una **recreación fiel** no se añade nada que no esté en la referencia (partículas, glow, textos, movimientos). Si el usuario pide expresamente "sin partículas", se eliminan todos los puntos y símbolos flotantes. Sustituir logos de terceros por formas genéricas y dejar la marca en constantes editables (`BRAND`, `CREDIT`).

---
