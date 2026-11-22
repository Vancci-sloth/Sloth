# SKILL · Contrato de render determinista ("seek, no play") y anti-patrones

> **Cuándo cargar:** SIEMPRE antes de escribir HTML de una composición.
> **Fuente:** §4.1–4.3, §4.5, §18 (Master Knowledge Base v2, texto original sin reescribir). Los números § remiten a `skills/router.md` → índice.

---

## Implementación en ESTE repo (léelo primero)

El contrato `window.__mg` ya está implementado en `runtime/mg-runtime.js`. **No lo reescribas**: úsalo.

```html
<script src="../../runtime/mg-runtime.js"></script>          <!-- + gsap local si lo usas -->
<script>
  const { seg, win, lerp, interp, ease, mulberry32 } = MG;
  function render(t) { /* posiciona TODO para el instante t; sin estado oculto */ }
  MG.register({ duration: 12, fps: 60, width: 1920, height: 1080, render });
  // Con GSAP: MG.register({ ..., render: MG.fromGsap(tl) })   // tl finita y paused:true
</script>
```

- `MG.register` cuantiza el tiempo a fotograma, espera `document.fonts.ready`, pone `ready=true`, y en `?render=1` ancla el stage en (0,0) sin escala; fuera de render monta una vista previa con scrub que usa **la misma ruta `seek`** que el render.
- El `<div id="stage">` es el lienzo (tamaño nativo). Todo el contenido va dentro.
- Para verificar: `node tools/lint.mjs <html>` → `node tools/qa.mjs <html>` → `node tools/sheet.mjs <html>`.
- Las secciones 4.2 (referencia GSAP+Canvas) y 4.4 (render) de abajo describen el contrato y alternativas; el render real de este repo está en `skills/render-cli.md`.

---

## 4.1 Idea central

Toda pieza es una **función pura del tiempo**: dado `t`, el fotograma es siempre el mismo. El navegador no "reproduce"; un controlador le pide posicionarse en `t`, captura y repite. Esto da: scrub, pausa en cualquier fotograma, render reproducible, paridad entre vista previa y MP4, y revisión por muestreo. **[A]** (es el diseño de HyperFrames y de Remotion) **[P]** (para Canvas propio, ya era la regla del manual original).

> El mismo `t` debe producir el mismo píxel en cualquier máquina. Si no, el agente no puede diagnosticar defectos, porque no puede reproducirlos.


## 4.2 Contrato mínimo que debe exponer toda composición

```js
// Contrato universal del sistema. Cualquier motor (Canvas, DOM+GSAP, Three.js, Lottie)
// debe poder colgarse de esta interfaz.
window.__mg = {
  duration: 15,        // segundos
  fps: 60,
  width: 1920,
  height: 1080,
  ready: false,        // true cuando fuentes, imágenes y timeline están listos
  seek(t) {
    // Posiciona TODO en el instante t. Debe ser síncrono o devolver una promesa.
  },
};
```

### Implementación de referencia (DOM + GSAP + Canvas)

```js
(() => {
  const FPS = 60;
  const DURATION = 15;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const quantize = (t) => Math.round(t * FPS) / FPS;

  // PRNG con semilla: mismo resultado en cada fotograma y en cada máquina.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Timeline finita, pausada, con estados iniciales explícitos (fromTo).
  const tl = gsap.timeline({ paused: true });
  tl.fromTo("#title", { y: 48, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7, ease: "expo.out" }, 0.2);
  tl.to({}, { duration: 0.01 }, DURATION); // fija la duración total

  const canvas = document.querySelector("#fx");
  const ctx = canvas.getContext("2d");

  function drawCanvas(t) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // El grano usa semilla = índice de fotograma, nunca Math.random().
    const rnd = mulberry32(Math.round(t * FPS) + 1);
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 1500; i++) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(rnd() * canvas.width, rnd() * canvas.height, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  window.__mg = {
    duration: DURATION,
    fps: FPS,
    width: 1920,
    height: 1080,
    ready: false,
    seek(t) {
      const q = clamp(quantize(t), 0, DURATION);
      tl.totalTime(q, false); // posiciona la timeline GSAP
      drawCanvas(q);          // dibuja capas procedurales
    },
  };

  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => {
    window.__mg.seek(0);
    window.__mg.ready = true;
  });
})();
```

### Compatibilidad con HyperFrames **[A]**

| Concepto | Contrato propio | HyperFrames |
|---|---|---|
| Duración y tamaño | `__mg.duration/width/height` | `data-duration`, `data-width`, `data-height` en la raíz |
| Timeline | Variable local | `window.__timelines[<data-composition-id>] = tl` (finita, `paused:true`) |
| Control de tiempo | `__mg.seek(t)` | El motor llama a su propio `seek` y posiciona clips y timelines |
| Clips | Divs con estado | Elementos con `class="clip"`, `data-start`, `data-duration` |
| Variables | Constantes arriba del script | `data-composition-variables`, `getVariables()` |

Para usar HyperFrames, basta con registrar la timeline y declarar los atributos; la lógica de dibujo se mantiene.


## 4.3 Reglas de autor para que `seek(t)` sea fiable

| # | Regla | Motivo |
|---|---|---|
| 1 | Sin `Date.now()` ni `performance.now()` en lógica visual | Reloj real ≠ tiempo de render |
| 2 | Sin `Math.random()` sin semilla, ni `gsap.utils.random()`, ni `"random(...)"` en tweens | El linter de HyperFrames lo marca como `non_deterministic_code` **[A]** |
| 3 | Sin `repeat:-1`; usar repeticiones finitas o funciones periódicas de `t` | Una timeline infinita no tiene fin renderizable **[A]** |
| 4 | Sin CSS `transition` ni `@keyframes` sin controlador | Corren con el reloj del navegador; en un render en frío no coinciden (`css_transition_used`) **[A]** |
| 5 | Sin `requestAnimationFrame` propio, `setTimeout` ni `setInterval` para animar | No avanzan bajo control de fotograma |
| 6 | Sin red en tiempo de render | Variabilidad y fallos |
| 7 | Fuentes: esperar `document.fonts.ready`; en render, **embeber** en base64/locales en vez de `@import` remoto | Es una fuente de variación frecuente **[A]** |
| 8 | `<video>`: no dejar que el navegador lo reproduzca; **pre-extraer fotogramas con FFmpeg** y mostrarlos como imagen | El decodificador del navegador descarta fotogramas **[A]** |
| 9 | Cuantizar el tiempo al fotograma: `Math.round(t*fps)/fps` | Evita diferencias de un píxel entre rutas de cálculo **[A]** |
| 10 | Estados iniciales explícitos con `fromTo`; no ocultar elementos con `tl.set(...,0)` si deben ser invisibles en el fotograma 0 | Hay casos que no se pintan en el frame 0 (`gsap_timeline_set_initial_hide`) **[A]** |
| 11 | Medir DOM (`getBoundingClientRect`, `getTotalLength`) solo con fuentes cargadas y **fuera** de callbacks de timeline | Riesgo de orden de seek (`gsap_callback_dom_measurement`) **[A]** |
| 12 | Evitar valores relativos (`"+=100"`) cuando otra animación escribe la misma propiedad | El resultado depende del orden en que se hace seek **[A]** |
| 13 | Dos tweens activos sobre la misma propiedad: encadenar, no solapar | Salto visible [P] |
| 14 | Física con historial: paso fijo con caché, o forma cerrada (p. ej. resorte analítico, §7.3) | `render(t)` no vuelve determinista una simulación con estado |
| 15 | Estado final estable ≥ 0,3 s y sin fotograma vacío al final | Los modelos fallan aquí con frecuencia **[B]** |


## 4.5 Correcciones a los manuales originales

Estos puntos de los manuales anteriores funcionan en una vista previa interactiva pero **rompen el determinismo** en render. Se corrigen aquí y en el Anexo A.

| # | Dónde estaba | Problema | Corrección |
|---|---|---|---|
| 1 | Ecualizador: `scaleY: () => gsap.utils.random(.3,1)` | No determinista | Precalcular alturas con `mulberry32(seed)` antes de crear el tween |
| 2 | Cursor de texto con `@keyframes` infinito | Parpadeo con el reloj del navegador | Parpadeo dentro de la timeline con `set` escalonados (Anexo A.5) |
| 3 | Auroras de fondo fuera de la timeline con `repeat:-1` y posiciones `random()` | No reproducible, no scrubbable | Funciones periódicas de `t` (`sin`) o valores precalculados con semilla |
| 4 | Grano con `Math.random()` por fotograma | Cada render sale distinto | Semilla = índice de fotograma, o textura prefabricada con desplazamiento determinista |
| 5 | Bucle `requestAnimationFrame` con `dt` real | Válido para vista previa, inválido para render | Mantener el bucle solo si no hay `?render=1`; el render llama a `seek` |
| 6 | Captura con `screenshot` justo después de `seek` | Fotogramas a medias (fuentes, pintura) | Doble `requestAnimationFrame` + `fonts.ready`, o BeginFrame en Linux |
| 7 | `M.restart()` / `M.play(0)` | Correcto en preview | En render usar `totalTime(q,false)` con tiempo cuantizado |
| 8 | `M.call()`/`onUpdate` que cambian `textContent` | Seguros solo si son idempotentes | Asignar el texto como función pura del progreso; evitar efectos acumulativos |
| 9 | GSAP 3.12.5 fijado en las plantillas | Desfasado (desde 3.13 todo es gratuito, SplitText renovado) | Fijar una versión exacta reciente; comprobar que el CDN permitido la sirve |
| 10 | Fuentes con `@import` a Google Fonts | Variación de red en render | Embeber fuentes (base64 o archivos locales) para el render final |

---


# 18. Anti-patrones y errores comunes

| # | Síntoma | Causa | Solución |
|---|---|---|---|
| 1 | Texto que choca o sale del encuadre en pleno movimiento | Maquetado para el estado final | Slots por palabra, comprobación `overlap` en tiempos intermedios (§13.3) |
| 2 | Todo se ve pequeño, correcto pero sin presencia | Escalas conservadoras | Escalas mínimas y héroe grande (§5.2) |
| 3 | Movimientos lineales o que "tiemblan" | Falta de easing; ruido sin suavizar | Curvas por intención (§7.3); ruido suavizado y con semilla |
| 4 | Se cumple el brief pero se siente áspero | Timing entre beats | Asentamiento + hold por beat (§7.4) |
| 5 | Máquina de escribir se queda una letra corta | Redondeo del progreso | `Math.floor(n + ε)` con hold final y prueba del último fotograma (A.5) |
| 6 | Tarjeta final en blanco / frame vacío al final | Duración mal calculada | Estado final estable ≥ 0,3 s; QA del último fotograma |
| 7 | `backdrop-filter` se ve plano | Padre con `filter` crea un contexto nuevo | No usarlo; fondos semitransparentes con degradado |
| 8 | El corte de cámara "no corta" | `set` mientras el tween anterior aún corre | Terminar el tween antes; margen ≥ 0,01 s |
| 9 | Elementos en (0,0) o descolocados | Hijos `position:absolute` de un contenedor sin tamaño | Dar `position`/tamaño al contenedor |
| 10 | Salto brusco en una propiedad | Dos tweens activos sobre la misma propiedad | Encadenar o repartir propiedades |
| 11 | `boxShadow` no interpola | Distinto número de sombras en desde/hasta | Misma estructura |
| 12 | Replay deja elementos mal | Estado alterado fuera de la timeline | Solo tweens/`onUpdate` idempotentes; dos `span` con crossfade en vez de cambiar texto |
| 13 | Parpadeo del cursor choca con GSAP | CSS y GSAP animan `opacity` del mismo nodo | GSAP en el contenedor, CSS en el hijo, o parpadeo dentro de la timeline (A.5) |
| 14 | Chispas visibles en el fotograma 0 | `fromTo` desde `autoAlpha:1` | Empezar desde `scale:0` o `autoAlpha:0` |
| 15 | `translate(-50%,-50%)` se rompe al animar | GSAP reescribe `transform` | Centrar con grid o con `xPercent/yPercent` |
| 16 | Imágenes no cargan al publicar | CSP bloquea remotas | CSS/SVG/base64 |
| 17 | Texto "baila" al hacer zoom | Rasterizado de capa compuesta | Evitar `will-change`; el blur de movimiento lo enmascara |
| 18 | Animación arranca "rara" | Play antes de cargar la fuente | `document.fonts.ready` antes de `ready=true` |
| 19 | Arco SVG empieza en el lado equivocado | El `path` arranca en la esquina | Escribir el `path` desde el punto deseado |
| 20 | Contador no se reinicia | Valor fuera de la timeline | `fromTo(obj,{v:0},{v:N,onUpdate})` |
| 21 | `<use>` de un símbolo no se ve | Falta `viewBox` o tamaño | Definirlos |
| 22 | Render distinto en cada ejecución | `Math.random`, `Date.now`, `transition`, `repeat:-1`, fuentes remotas | §4.3 y §4.5 |
| 23 | Revisión "a ojo" que no encuentra nada | VLM con sesgo de posición | Pares con orden invertido y evidencia por fotograma (§13.5) |
| 24 | Efectos por defecto (glow, partículas, rebote en todo) | Confundir complejidad con calidad | Quitar y justificar cada efecto con el brief |

---
