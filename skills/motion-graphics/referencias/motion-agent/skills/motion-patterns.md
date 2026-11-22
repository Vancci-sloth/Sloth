# SKILL · Movimiento, tipografía cinética y biblioteca de patrones deterministas

> **Cuándo cargar:** Al escribir animaciones: timing, easing, cámara, texto, y cualquier verbo del catálogo (blurIn, cursorClick, countUp…).
> **Fuente:** §7, §8, Anexo A (Master Knowledge Base v2, texto original sin reescribir). Los números § remiten a `skills/router.md` → índice.

> **Atajo en este repo:** `MG.ease.*`, `MG.seg/win/interp/lerp`, `MG.mulberry32` y `MG.ease.spring` (resorte analítico) ya existen en `runtime/mg-runtime.js`. Los patrones del Anexo A usan GSAP; en estilo función-de-t equivalen a `seg()` + `ease`.

---

# 7. Movimiento: principios, timing, easing y cámara

## 7.1 Los 12 principios aplicados a motion graphics

Squash & stretch (conservar volumen aparente), anticipación, puesta en escena, pose a pose / continuo, seguimiento y solapamiento, entrada/salida suave, arcos, acción secundaria, timing, exageración, volumen coherente, atractivo. En motion graphics se aplican a tipografía, iconos, formas y UI, no solo a personajes. La acción secundaria **refuerza** la principal; si distrae, se elimina.

## 7.2 Timing y spacing

- **Timing** = cuánto dura una acción. **Spacing** = cómo se reparte el cambio entre fotogramas (la curva).
- Duración proporcional a **distancia, masa percibida e importancia**; no usar el mismo valor para todo.
- Puntos de partida para video **[P/H]** (valores de sistemas de diseño de UI, ajustados al medio; en video suelen funcionar algo más largos):

| Acción | Duración |
|---|---|
| Entrada/salida de escena con blur | 0,10–0,25 s |
| Entrada de un elemento | 0,4–0,8 s |
| Stagger entre elementos | 0,04–0,14 s |
| Zoom de cámara rápido / retroceso | 0,55–0,75 s / 0,8–1,0 s |
| Contador numérico | 0,7–1,0 s |
| Destello / pulso | 0,15–0,3 s |
| Escena completa | 1,0–2,6 s (pieza rápida) |
| Hold de lectura | ≈ 0,3 s por palabra + 0,4 s de asentamiento |

- Elementos pequeños y ligeros: más rápidos; grandes o "pesados": más lentos y con menos rebote.
- Para reducir movimiento (accesibilidad), Material 3 sugiere dejar la duración en un 10–20 % de la estándar o desactivar **[C]**.

## 7.3 Easing por intención

| Intención | GSAP | Curva equivalente / nota |
|---|---|---|
| Entrada principal | `expo.out`, `power3.out` | Llega rápido, frena suave |
| Salida | `power2.in` | Acelera al irse |
| Desplazamiento A→B, cámara | `expo.inOut`, `power3.inOut` | Acelera y frena |
| Estándar de UI (Material 3) | `cubic-bezier(0.2, 0, 0, 1)` | Neutro, profesional **[C]** |
| Pop con rebote | `back.out(1.2–2.5)` | Solo si el objeto es "elástico" |
| Elástico / rebote | `elastic.out`, `bounce.out` | Con carácter justificado |
| Contadores | `power2.out` | Rápido al inicio, frena al final |
| Ambiente | `sine.inOut`, `none` | Natural / constante |
| Dibujo de trazo | `power2.inOut` | Fluido |

Reglas:

- **No lineal** para movimiento orgánico; lineal solo en mecanismos, loops técnicos o desplazamientos continuos.
- El rebote es una decisión de personalidad, no un acabado universal; los sistemas modernos de movimiento recomiendan usarlo con moderación **[C]**.
- Resortes: se parametrizan por rigidez, amortiguación y masa, o por "duración percibida + rebote" (enfoque de Apple). Útil para elementos que deben "sentirse vivos" **[C]**.

### Resorte determinista en forma cerrada

```js
// Resorte amortiguado sin estado: x(t) con x(0)=0, v(0)=0, objetivo 1.
// Para zeta >= 1 se usa amortiguamiento crítico (aproximación suficiente en motion graphics).
function spring(t, opts = {}) {
  const stiffness = opts.stiffness ?? 170;
  const damping = opts.damping ?? 20;
  const mass = opts.mass ?? 1;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - (1 + w0 * t) * Math.exp(-w0 * t);
}

// Úsalo como ease de GSAP (el progreso 0..1 se reescala a segundos).
const springEase = (seconds, opts) => (p) => (p >= 1 ? 1 : spring(p * seconds, opts));

// gsap.to(obj, { x: 400, duration: 1.2, ease: springEase(1.2, { stiffness: 220, damping: 18 }) });
```

## 7.4 Coreografía

Una secuencia profesional organiza: entrada → anticipación → acción principal → acento → reacción → asentamiento → hold → salida. Reglas:

- Nada arranca todo a la vez: **stagger, solape y contrapunto**.
- **Un acento por instante.** Dos acentos simultáneos se cancelan.
- Cada elemento principal **se asienta** antes del siguiente beat; el defecto típico de los modelos es "cumplir el beat y romper el tiempo entre beats" **[B]**.
- Los holds son parte del diseño: una pausa deliberada comunica tanto como un movimiento.

## 7.5 Cámara

**Cámara 2D virtual.** Todas las escenas viven en un `#world` con coordenadas fijas; una función coloca cualquier punto del mundo en el centro de la pantalla:

```js
const cam   = (tx, ty, s)          => ({ x: 640 - tx * s, y: 360 - ty * s, scale: s });
const camAt = (tx, ty, sx, sy, s)  => ({ x: sx - tx * s,  y: sy - ty * s,  scale: s });
// gsap.set("#world", { transformOrigin: "0 0" });
// tl.to("#world", { ...cam(298, 175, 5.5), duration: 0.55, ease: "expo.inOut" }, 1.0);
```

(Para lienzos de 1920×1080 sustituir 640/360 por 960/540.)

- **Match cut**: un mismo elemento en la **misma coordenada del mundo** en dos escenas; mientras la cámara está muy cerca se cruza una por otra y parece que el elemento "se transformó".
- **Motion blur** de cámara: `filter: blur()` breve (≤ 0,3 s) durante el zoom rápido.
- **Cortes**: `set` posterior a la terminación del tween previo (margen ≥ 0,01 s).
- **Cámara 3D** (Three.js): perspectiva, FOV, órbita, dolly; conducir con el tiempo del seek, **no** con el reloj interno de la librería.
- Cada movimiento de cámara debe tener motivo (revelar, enfatizar, conectar); evitar zooms decorativos.

---


# 8. Tipografía cinética y texto

La tipografía puede ser imagen, textura, ritmo y transición. En 2026 sigue siendo la tendencia más citada, sobre todo porque mucho contenido se ve sin sonido **[C]**; pero en piezas de producto el texto en movimiento tiende a ser **líneas sueltas entre pantallas**, no el video entero **[B]**.

## 8.1 Reglas

1. **Maquetar para la trayectoria, no solo para el estado final.** Cada palabra tiene un *slot* reservado; si el texto entra desde direcciones distintas, comprobar solapes en tiempos intermedios (§13.3). Es el fallo de texto más frecuente de los modelos **[B]**.
2. **Medir con las fuentes ya cargadas.** `measureText` o `getBoundingClientRect` antes de `fonts.ready` dan anchos falsos.
3. **Copy variable**: el texto cambia de longitud (en español suele ocupar más que en inglés **[P]**). Usar anchos fluidos, ajuste automático de tamaño y límite de líneas.
4. **No animar cada letra sin motivo**; el movimiento debe mejorar la lectura o expresar una idea.
5. **Revelado con máscara** (`overflow:hidden`, `clip-path`) en vez de fundido genérico. SplitText (ahora gratuito, rehecho, más ligero, con accesibilidad y `mask:"lines"`) simplifica el trabajo **[A]**.
6. **Máquina de escribir**: probar siempre el último fotograma; el texto debe llegar completo y quedarse (error real observado: se detenía una letra antes) **[B]**.
7. **Glifos**: comprobar que la fuente tiene `¿ ¡ ñ á é í ó ú ü` y comillas tipográficas.
8. **Contraste y zona segura** para el texto sobre imagen o video.
9. **Accesibilidad**: el texto no debe depender solo del movimiento (§15).

## 8.2 Subtítulos y karaoke

- Para subtítulos animados se necesita **tiempo por palabra** (`{ id, text, start, end }`). Transcribir con Whisper u otro ASR con marcas de palabra; algunos TTS devuelven las marcas, otros no (en HyperFrames, la voz de HeyGen las incluye; otras opciones requieren transcribir el audio) **[A]**.
- Agrupar de 3 a 7 palabras por frase y resaltar la palabra activa es un patrón consolidado **[C]**.
- Respetar zonas seguras de plataforma: los subtítulos automáticos de la propia app ya ocupan la parte inferior (§14.3).

---


# Anexo A. Biblioteca de patrones deterministas

Convenciones: `tl` es una `gsap.timeline({ paused: true })` finita; tiempos absolutos en segundos; todos los patrones usan `fromTo` y son funciones puras del tiempo. Las utilidades (`mulberry32`, `spring`, `cam`) están en §4.2, §7.3 y §7.5. Los 20 patrones del manual original que no aparecen aquí siguen siendo válidos, **salvo** las correcciones de §4.5.

## A.0 Plantilla HTML mínima compatible con el contrato

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Pieza</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
  :root { --bg: #f6f3ec; --text: #111111; --accent: #e8472e; }
  html, body { height: 100%; margin: 0; overflow: hidden; background: #000; }
  #stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px;
           transform-origin: 0 0; background: var(--bg); overflow: hidden; isolation: isolate; }
  .sc { position: absolute; inset: 0; display: grid; place-items: center; }
  #headline { margin: 0; font: 900 220px/1 "Archivo Black", "Arial Black", Impact, sans-serif;
              color: var(--text); opacity: 0; }
  #rp { position: fixed; right: 14px; bottom: 14px; z-index: 9; }
  .render #rp { display: none; }
</style>
</head>
<body>
<main id="stage">
  <section class="sc" id="s1"><h1 id="headline" data-qa="text">Respira.</h1></section>
  <canvas id="fx" width="1920" height="1080" style="position:absolute;inset:0;pointer-events:none"></canvas>
</main>
<button id="rp" type="button">Replay</button>
<script>
(() => {
  const RENDER = new URLSearchParams(location.search).has("render");
  if (RENDER) document.documentElement.classList.add("render");

  const FPS = 60, DURATION = 5, W = 1920, H = 1080;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const quantize = (t) => Math.round(t * FPS) / FPS;

  // Escala el lienzo en la vista previa; en render queda a escala 1.
  const stage = document.getElementById("stage");
  const fit = () => {
    if (RENDER) { stage.style.transform = "none"; return; }
    const k = Math.min(innerWidth / W, innerHeight / H);
    stage.style.transform = `translate(${(innerWidth - W * k) / 2}px, ${(innerHeight - H * k) / 2}px) scale(${k})`;
  };
  addEventListener("resize", fit);
  fit();

  const tl = gsap.timeline({ paused: true });
  tl.fromTo("#headline", { y: 60, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.8, ease: "expo.out" }, 0.3);
  tl.to("#headline", { autoAlpha: 0, duration: 0.3, ease: "power2.in" }, DURATION - 0.6);
  tl.to({}, { duration: 0.01 }, DURATION);

  const ctx = document.getElementById("fx").getContext("2d");
  const drawCanvas = (t) => { ctx.clearRect(0, 0, W, H); /* capas procedurales en función de t */ };

  window.__mg = {
    duration: DURATION, fps: FPS, width: W, height: H, ready: false,
    seek(t) {
      const q = clamp(quantize(t), 0, DURATION);
      tl.totalTime(q, false);
      drawCanvas(q);
    },
  };

  // Vista previa interactiva (no se usa en render).
  let start = 0, playing = !RENDER;
  const loop = (now) => {
    if (playing) window.__mg.seek(((now - start) / 1000) % DURATION);
    requestAnimationFrame(loop);
  };
  document.getElementById("rp").addEventListener("click", () => { start = performance.now(); playing = true; });

  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => {
    window.__mg.seek(0);
    window.__mg.ready = true;
    if (playing) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        playing = false;
        window.__mg.seek(DURATION - 1 / FPS);
      } else {
        start = performance.now();
        requestAnimationFrame(loop);
      }
    }
  });
})();
</script>
</body>
</html>
```

## A.1 Utilidades

```js
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const pr = (t, a, b) => clamp((t - a) / (b - a));   // progreso 0→1 entre a y b
// Patrón fundamental: E.curva(pr(t, inicio, fin))
const E = {
  out: (x) => 1 - Math.pow(1 - x, 3),
  expo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  io: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
};
```

## A.2 `blurIn` / `blurOut`

```js
const blurIn = (tl, sel, at, d = 0.6) =>
  tl.fromTo(sel,
    { autoAlpha: 0, scale: 1.15, filter: "blur(22px)" },
    { autoAlpha: 1, scale: 1, filter: "blur(0px)", duration: d, ease: "expo.out" }, at);

const blurOut = (tl, sel, at, d = 0.2) =>
  tl.to(sel, { autoAlpha: 0, filter: "blur(14px)", duration: d, ease: "power2.in" }, at);
```

## A.3 `popIn`

```js
const popIn = (tl, sel, at) =>
  tl.fromTo(sel,
    { scale: 0, rotation: -140, autoAlpha: 0 },
    { scale: 1, rotation: 0, autoAlpha: 1, duration: 0.7, ease: "back.out(1.6)" }, at);
```

## A.4 `maskReveal` por líneas (SplitText gratuito)

```js
async function buildTitle(tl) {
  gsap.registerPlugin(SplitText);
  await document.fonts.ready;                 // medir con la fuente ya cargada
  const split = SplitText.create("#headline", { type: "lines,words", mask: "lines" });
  tl.from(split.lines, { yPercent: 110, duration: 0.8, ease: "expo.out", stagger: 0.08 }, 0.2);
  return tl;                                   // registrar la timeline DESPUÉS de construirla
}
```

Registrar la timeline en el contrato solo cuando la construcción asíncrona haya terminado.

## A.5 `typewriter` con último carácter garantizado y cursor determinista

```js
function typewriter(tl, el, text, at, dur) {
  const s = { n: 0 };
  tl.fromTo(s, { n: 0 }, {
    n: text.length,
    duration: dur,
    ease: "none",
    onUpdate: () => {
      el.textContent = text.slice(0, Math.min(text.length, Math.floor(s.n + 1e-6)));
    },
  }, at);
}

// Cursor: parpadeo dentro de la timeline (finito y reproducible). Estado inicial en CSS (opacity:0).
function blink(tl, el, from, to, period = 0.5) {
  let on = true;
  for (let t = from; t < to; t += period) {
    tl.set(el, { opacity: on ? 1 : 0 }, t);
    on = !on;
  }
  tl.set(el, { opacity: 0 }, to);
}
```

Prueba obligatoria en QA: el último fotograma del texto debe contener **todos** los caracteres y mantenerse ≥ 0,3 s.

## A.6 `countUp`

```js
function countUp(tl, el, to, at, dur, ease = "power2.out") {
  const o = { v: 0 };
  tl.fromTo(o, { v: 0 }, {
    v: to, duration: dur, ease,
    onUpdate: () => { el.textContent = String(Math.round(o.v)); },
  }, at);
}
```

## A.7 `drawStroke` (SVG con `pathLength="1"`)

```html
<circle class="arc" cx="80" cy="80" r="70" pathLength="1"
        stroke-dasharray="1" stroke-dashoffset="1" transform="rotate(-90 80 80)"
        fill="none" stroke="#e8472e" stroke-width="8" stroke-linecap="round"/>
```

```js
tl.fromTo(".arc", { strokeDashoffset: 1 }, { strokeDashoffset: 0.04, duration: 0.9, ease: "power2.out" }, 1.0);
```

## A.8 Cámara virtual y match cut

Ver §7.5 (`cam`, `camAt`). Ejemplo de acercamiento seguido de retroceso con desenfoque de movimiento:

```js
const camFull = (tx, ty, s) => ({ x: 960 - tx * s, y: 540 - ty * s, scale: s });
gsap.set("#world", { transformOrigin: "0 0" });
tl.to("#world", { ...camFull(298, 175, 5.5), duration: 0.55, ease: "expo.inOut" }, 1.0);
tl.to("#world", { filter: "blur(3px)", duration: 0.28, yoyo: true, repeat: 1, ease: "sine.inOut" }, 1.0);
tl.to("#world", { ...camFull(960, 540, 1), duration: 0.9, ease: "expo.out" }, 1.55);
```

## A.9 `morph` cápsula → botón

```js
tl.to(".pill", { width: 380, height: 94, borderRadius: 99, backgroundColor: "#1ed760", duration: 0.8, ease: "expo.inOut" }, 3.1);
tl.fromTo(".bt", { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, 3.7);
```

## A.10 `equalizer` con semilla (corrige el original)

```js
function equalizer(tl, sel, at, seed = 42) {
  const rnd = mulberry32(seed);
  const bars = gsap.utils.toArray(sel);
  const mid = (bars.length - 1) / 2;
  bars.forEach((b, i) => {
    const h = 0.3 + rnd() * 0.7;
    const d = 0.16 + rnd() * 0.14;
    tl.fromTo(b, { scaleY: 0.1 }, {
      scaleY: h, duration: d, repeat: 5, yoyo: true, ease: "sine.inOut",
    }, at + Math.abs(i - mid) * 0.012);
  });
}
```

## A.11 `orbitArc` (estado único `S`)

```js
function orbitArc(tl, cards, at) {
  const S = { spread: 0, drift: -8 };
  const place = () => cards.forEach((c) => {
    const a = ((c.a + S.drift * c.k) * Math.PI) / 180;
    gsap.set(c.el, {
      x: 960 + Math.cos(a) * c.rx * S.spread - 62,
      y: c.cy + Math.sin(a) * c.ry * S.spread - 62,
      rotation: c.rot + (1 - S.spread) * 240 * c.k,
      scale: c.sc * (0.25 + 0.75 * S.spread),
    });
  });
  tl.fromTo(S, { spread: 0 }, { spread: 1, duration: 1.15, ease: "expo.out", onUpdate: place }, at);
  tl.fromTo(S, { drift: -8 }, { drift: 8, duration: 2.5, ease: "none", onUpdate: place }, at);
}
```

## A.12 Estela / smear (Canvas, función pura de `t`)

```js
function drawSmear(ctx, cx, cy, r, v, dirX, dirY, color) {
  // v: velocidad normalizada 0..1 (p. ej. diferencia numérica de la curva de easing)
  const ghosts = 6;
  for (let i = ghosts; i >= 0; i--) {
    const back = i * v * 40;
    ctx.globalAlpha = i === 0 ? 1 : 0.16;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx - dirX * back, cy - dirY * back, r * (1 + v * 9 * (i === 0 ? 1 : 0.4)), r, Math.atan2(dirY, dirX), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
```

## A.13 Tiempo "a pasos" (look de recorte / stop-motion)

```js
// Congela capas concretas a 12 fps sin tocar el resto de la pieza.
const onTwos = (t, fps = 12) => Math.floor(t * fps + 1e-6) / fps;
// En la capa: drawLayer(onTwos(t));  (el resto de la escena sigue usando t)
```

## A.14 Conversión de un `<video>` a fotogramas (render determinista)

```bash
# Pre-extraer a la misma cadencia del render y servir los fotogramas como imágenes
mkdir -p assets/video-frames/clip
ffmpeg -i assets/clip.mp4 -vf "fps=60" -q:v 2 assets/video-frames/clip/f_%05d.jpg
```

```js
// En seek(t): mostrar el fotograma correspondiente (índice a partir de 1).
const frameIdx = (t, start, fps = 60) => Math.max(1, Math.floor((t - start) * fps + 1e-6) + 1);
// img.src = `assets/video-frames/clip/f_${String(frameIdx(t, 2)).padStart(5, "0")}.jpg`;
```

## A.15 `liquidGlass` con refracción física SVG determinista

Técnica de vidrio líquido (macOS Sequoia / VisionOS) mediante filtros SVG combinados (`feTurbulence` + `feDisplacementMap` y mapas de normales en `feImage`). Supera el simple `backdrop-filter: blur()` genérico simulando refracción óptica real y bisel especular.

```html
<!-- Filtro de refracción líquida -->
<svg style="display: none">
  <filter id="liquid-glass-filter" x="0%" y="0%" width="100%" height="100%">
    <feTurbulence id="liquid-noise" type="fractalNoise" baseFrequency="0.008 0.008" numOctaves="2" seed="92" result="noise" />
    <feGaussianBlur in="noise" stdDeviation="0.02" result="blur" />
    <feDisplacementMap id="liquid-disp" in="SourceGraphic" in2="blur" scale="75" xChannelSelector="R" yChannelSelector="G" />
  </filter>
</svg>
```

```css
/* Card con bisel de grosor 3D y refracción */
.glass-liquid-card {
  position: relative;
  border-radius: 30px;
}
.glass-liquid-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 2px 2px 0px -2px rgba(255, 255, 255, 0.7), inset 0 0 3px 1px rgba(255, 255, 255, 0.7);
  background-color: rgba(255, 255, 255, 0.05);
  pointer-events: none;
  z-index: 1;
}
.glass-liquid-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  backdrop-filter: blur(4px);
  filter: url(#liquid-glass-filter);
  isolation: isolate;
  z-index: -1;
}
```

```js
// Conciliación con el contrato seek(t): la perturbación óptica es función matemática pura de t
function updateLiquidGlass(t) {
  const noise = document.getElementById('liquid-noise');
  if (noise) {
    const fX = 0.008 + Math.sin(t * 1.5) * 0.002;
    const fY = 0.008 + Math.cos(t * 1.1) * 0.002;
    noise.setAttribute('baseFrequency', `${fX} ${fY}`);
  }
}
// Llamar updateLiquidGlass(t) dentro de seek(t)
```

---
