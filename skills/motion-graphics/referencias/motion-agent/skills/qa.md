# SKILL · QA profesional, accesibilidad y derechos

> **Cuándo cargar:** SIEMPRE antes de entregar; y al revisar defectos.
> **Fuente:** §13, §15, §16 (Master Knowledge Base v2, texto original sin reescribir). Los números § remiten a `skills/router.md` → índice.

> **En este repo:** `tools/lint.mjs` (L0 estático), `tools/qa.mjs` (L1–L3 en navegador y video), `tools/sheet.mjs` (revisión visual). Ver `skills/render-cli.md`.

---

# 13. QA profesional

> **El código que compila no es un video terminado.** Se evalúa el **render**.

## 13.1 Niveles

| Nivel | Qué comprueba | Cómo |
|---|---|---|
| L0 Estático | Sintaxis, contrato, reglas de determinismo | `node --check`, linter (`npx hyperframes lint` o equivalente propio), búsqueda de `Math.random`, `Date.now`, `repeat:-1`, `transition` |
| L1 Ejecución | Consola limpia, recursos, fuentes | Cargar la página, capturar errores y peticiones fallidas |
| L2 Geometría | Límites, solapes de texto, contraste en tiempos muestreados | Sondeo con `seek` (§13.3); `npx hyperframes check` abre el proyecto en un navegador y revisa layout, movimiento y contraste **[A]** |
| L3 Salida | Resolución, fps, duración, congelados, negros, sonoridad, primer/último fotograma | `ffprobe`, `freezedetect`, `blackdetect`, `ebur128` (§13.4) |
| L4 Visual | Composición, ritmo, acabado | Hojas de contacto, fotogramas clave, cámara lenta |
| L5 Pares | Mejor/peor frente a la versión anterior o a una referencia | Revisión por pares con orden invertido (§13.5) |

## 13.2 Sintaxis del JS embebido

```bash
python3 - <<'PY'
import re, subprocess, sys, tempfile, pathlib
html = pathlib.Path("src/index.html").read_text(encoding="utf-8")
scripts = re.findall(r"<script(?![^>]*src=)[^>]*>(.*?)</script>", html, flags=re.S)
for i, js in enumerate(scripts):
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
        f.write(js)
    r = subprocess.run(["node", "--check", f.name], capture_output=True, text=True)
    print(f"script {i}:", "OK" if r.returncode == 0 else r.stderr.strip())
PY
```

## 13.3 Geometría muestreada con `seek`

Marcar con `data-qa="text"` los elementos de texto que importan. Inyectar:

```js
window.__qa = {
  // checkBounds: true solo en los "holds"; el solape se comprueba siempre.
  probe(t, checkBounds = false, W = 1920, H = 1080, margin = 48) {
    window.__mg.seek(t);
    const els = [...document.querySelectorAll('[data-qa="text"]')];
    const vis = els
      .map((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const op = parseFloat(cs.opacity) * (cs.visibility === "hidden" ? 0 : 1);
        return { id: el.id || el.textContent.trim().slice(0, 24), r, op };
      })
      .filter((o) => o.op > 0.15 && o.r.width > 0 && o.r.height > 0);
    const issues = [];
    for (const o of vis) {
      if (checkBounds && (o.r.left < margin || o.r.top < margin || o.r.right > W - margin || o.r.bottom > H - margin)) {
        issues.push({ type: "bounds", t, id: o.id });
      }
    }
    for (let i = 0; i < vis.length; i++) {
      for (let j = i + 1; j < vis.length; j++) {
        const a = vis[i].r;
        const b = vis[j].r;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 4 && h > 4) issues.push({ type: "overlap", t, a: vis[i].id, b: vis[j].id });
      }
    }
    return issues;
  },
};
```

Conducirlo desde Playwright:

```python
dur = page.evaluate("window.__mg.duration")
hold_times = []  # segundos de "hold" tomados de spec.json (fin de cada beat)
times = sorted(set([i / 10 for i in range(int(dur * 10) + 1)] + hold_times))
issues = []
for t in times:
    is_hold = t in hold_times
    issues += page.evaluate("([t, b]) => window.__qa.probe(t, b)", [t, is_hold])
print(len(issues), "problemas")
```

Notas:

- La comprobación de **límites** solo es válida en los *holds* (una entrada desde fuera de pantalla es legítima). La de **solapes** vale en todo momento salvo capas que se superponen a propósito (marcarlas con otro atributo y excluirlas).
- `getBoundingClientRect` incluye transformaciones; en render el lienzo debe estar a escala 1.
- Añadir el cálculo de **contraste** (color del texto frente al color de fondo muestreado en el fotograma) en el mismo bucle.

## 13.4 Salida de video con FFmpeg

```bash
# Congelados: >1 s sin cambios (revisar si es un hold intencional)
ffmpeg -i out.mp4 -vf "freezedetect=n=0.001:d=1" -f null - 2>&1 | grep -E "freeze_(start|end)"

# Fotogramas negros
ffmpeg -i out.mp4 -vf "blackdetect=d=0.1:pix_th=0.10" -f null - 2>&1 | grep black_start

# Primer y último fotograma
ffmpeg -y -i out.mp4 -frames:v 1 first.png
ffmpeg -y -sseof -0.05 -i out.mp4 -frames:v 1 last.png

# Sonoridad
ffmpeg -i out.mp4 -af ebur128=peak=true -f null - 2>&1 | tail -n 12
```

Reglas: ningún congelado sin hold declarado en la especificación; primer y último fotograma **no** vacíos; picos < −1 dBTP **[P]**.

## 13.5 Revisión visual y por pares

**Procedimiento**

1. Hoja de contacto de toda la pieza (≥ 4 fps en transiciones).
2. Fotogramas de `t−1/fps`, `t`, `t+1/fps` en cada corte, entrada y salida críticas.
3. Reproducción a velocidad normal y a media velocidad.
4. Primer y último fotograma; replay completo; scrub adelante/atrás si es interactivo.

**Rúbrica de 5 ejes** (la usa el benchmark; un criterio de evaluación por eje evita el "me gusta / no me gusta" global) **[B]**:

| Eje | Pregunta |
|---|---|
| Engagement | ¿Detiene la mirada? ¿Hay gancho? |
| Prompt-Intent | ¿Cumple brief, mensaje y marca? |
| Composition | Jerarquía, contraste, tipografía, equilibrio, escala |
| Temporal | Timing, easing, cadencia, transiciones, asentamiento |
| Craft | Recortes, alineaciones, artefactos, limpieza |

**Revisión por pares (A/B)**

- Comparar la versión nueva con la anterior (o con una referencia), **eje por eje**.
- **Ejecutar la comparación dos veces con el orden intercambiado**; los VLM generalistas tienen sesgo de posición y preferencia por su propia familia **[B]**. Preferir un modelo distinto del que generó el código.
- Un VLM puede **alucinar fallos** o no ver fallos de un solo fotograma; confirmar cada defecto señalando fotograma y elemento.
- Una afirmación vale si cita **timecode + elemento + problema observable**.

**Formato de defecto**

```json
{
  "id": "D-014",
  "severity": "high",
  "timecode": "00:06.20",
  "scene": "s03",
  "element": "#headline",
  "axis": "composition",
  "observed": "El titular se corta por el borde derecho",
  "probableCause": "El slot de 1500 px no contempla el texto en español",
  "fix": "Reducir tracking y fijar ajuste automático de tamaño",
  "acceptance": "bounds sin incidencias en t=6.0–7.0"
}
```

Severidades: **Crítico** (rompe el mensaje o el archivo), **Alto** (se nota de inmediato), **Medio**, **Bajo**.

**Criterio de aceptación:** cero Críticos y Altos; Medios documentados; todos los chequeos automáticos verdes.

## 13.6 Corrección quirúrgica

1. Identificar escena, intervalo, elemento y propiedad.
2. Describir el defecto observable y su causa probable.
3. Corregir **solo lo necesario**.
4. Re-renderizar el intervalo afectado (±0,5 s).
5. **Comprobar que los demás fotogramas no cambiaron**: con render determinista, los fotogramas fuera del intervalo deben ser **idénticos** (comparar hashes de los PNG). Si cambian, la corrección tuvo un efecto lateral.
6. Comparar antes y después y anotar el resultado en el informe.

```bash
# Comparar dos secuencias de fotogramas por hash
( cd frames_v1 && sha256sum f_*.png ) > v1.sha
( cd frames_v2 && sha256sum f_*.png ) > v2.sha
diff v1.sha v2.sha | head
```

Mantener **golden frames** (fotogramas de referencia en tiempos clave) para detectar regresiones; compararlos con un umbral de similitud estructural (SSIM).

---


# 15. Accesibilidad

Aplica a HTML interactivo y a video publicado en la web.

| Requisito | Qué hacer |
|---|---|
| **Destellos** (WCAG 2.3.1, nivel A) | Nada que destelle más de 3 veces por segundo, salvo por debajo de los umbrales de destello general y rojo. Cuidar glitch, estrobos y cambios de luminosidad completos. Herramienta de análisis: PEAT **[A/C]** |
| **Pausar, detener, ocultar** (2.2.2) | Controles de pausa en contenido que se mueve automáticamente en la web |
| **Subtítulos** (1.2.2) y **audiodescripción** (1.2.5) | Subtítulos para todo el audio; audiodescripción cuando la imagen transmite información que no está en el audio **[C]** |
| **`prefers-reduced-motion`** | Respetarlo en vistas previas interactivas: "reducir, no eliminar" (quitar desplazamientos, mantener fundidos) |
| **Contraste** | Texto ≥ 4,5:1 como mínimo de partida |
| **No depender solo del movimiento** | Toda información clave debe estar también como texto/estática |
| **Autoplay con sonido** | No arrancar con sonido sin acción del usuario |

```js
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduce) {
  // Vista previa: mostrar el estado final y no reproducir en bucle.
  window.__mg.seek(window.__mg.duration - 1 / window.__mg.fps);
}
```

---


# 16. Derechos, licencias y procedencia

> Esta sección es orientativa, **no es asesoría legal**. Las licencias cambian: leer el texto de la **versión concreta** antes de comercializar.

| Elemento | Qué se sabe (nov 2026) | Qué hacer |
|---|---|---|
| **GSAP** | Desde la 3.13 es **gratuito, incluso para uso comercial, con todos los plugins** (SplitText, MorphSVG, etc.). La licencia es la "Standard No Charge" de Webflow (vigente desde el 30 abr 2025) y **no es MIT**, aunque algunas fuentes la describen así. Su texto limita el uso dentro de herramientas que permitan a los usuarios **crear animaciones mediante una interfaz visual** parecida a la de Webflow ("productos competidores") sin permiso escrito **[A]** | Si el producto final expone un **editor visual de animación** a terceros, leer la licencia y, si procede, pedir autorización. Si solo genera video/HTML con código, el caso es distinto; confirmar |
| **HyperFrames** | Apache 2.0 según su repositorio **[A]** | Conservar avisos de licencia |
| **Remotion** | Licencia propia; gratuita para individuos y equipos pequeños, de pago por encima de cierto tamaño; se anunciaron cambios para la v5 **[C]** | Revisar la licencia vigente antes de usarla en un producto comercial |
| **Three.js, Lottie, Rive, Motion, Anime.js, Theatre.js** | Cada una con su licencia | Verificar la de la versión instalada |
| **Fuentes** | Distinguir licencia web, de aplicación y de video/embebido | Registrar licencia; para render, fuentes locales (§4.3) |
| **Música y efectos** | Licencia de uso en video y plataformas | Registrar origen y licencia |
| **Imágenes, video y capturas** | Derechos de autor, derechos de imagen y datos personales | Usar solo recursos suministrados o con licencia |
| **Marcas de terceros** | No reproducir logos ni identidades sin autorización | Sustituir por formas genéricas y dejar `BRAND`/`CREDIT` editables |
| **Contenido generado por IA** | Términos del proveedor y posible obligación de etiquetado | Marcar la procedencia en `ASSETS.md` |

**Procedencia:** mantener `ASSETS.md` con, para cada recurso: origen, autor, licencia, fecha, si es suministrado, externo o generado, y dónde se usa.

---
