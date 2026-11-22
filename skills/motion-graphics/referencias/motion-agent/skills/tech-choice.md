# SKILL · Elección de tecnología y arquitectura de proyecto

> **Cuándo cargar:** Al decidir DOM+GSAP vs Canvas vs Three.js vs Lottie, o al estructurar un proyecto.
> **Fuente:** §9 (Master Knowledge Base v2, texto original sin reescribir). Los números § remiten a `skills/router.md` → índice.

---

# 9. Elección de tecnología y arquitectura de proyecto

## 9.1 Selección por entregable

| Entregable | Opción recomendada | Alternativa |
|---|---|---|
| MP4 / WebM generado por agentes, piezas en lote | HTML + GSAP con el contrato de §4, renderizado con HyperFrames o con el arnés propio | Remotion (si el equipo ya trabaja en React) |
| HTML interactivo (replay, scrub, controles) | DOM + CSS + SVG + GSAP; Canvas para capas procedurales | Motion (UI), Theatre.js (con editor) |
| Generativo / partículas / texturas | Canvas 2D con `render(t)` y PRNG con semilla | WebGL/WebGPU si hay miles de elementos |
| 3D | Three.js conducido por `seek` | Blender/Houdini para render offline avanzado |
| Iconos, logos animados, UI reutilizable | Lottie / dotLottie (con verificación de runtime) | Rive si debe reaccionar a estados |
| Explicativo vectorial con diagramas | Motion Canvas o SVG + GSAP | — |
| Experimento visual | p5.js | — |

## 9.2 Canvas, SVG, DOM y WebGL

| Medio | Úsalo para | Evita |
|---|---|---|
| **DOM + CSS** | Texto, tarjetas, interfaces, layouts | Miles de nodos animados |
| **SVG** | Vectores, trazos (`pathLength=1` + `strokeDashoffset`), máscaras, morphs, iconos | Efectos raster pesados |
| **Canvas 2D** | Dibujo procedural, partículas, grano, estelas, tramas (Truchet), composición raster | Maquetar texto largo o UI compleja |
| **WebGL / WebGPU** | 3D, shaders, postproceso, muchos elementos | Mezclar con relojes propios sin adaptador |
| **GSAP** | Orquestación de cualquier propiedad numérica, stagger, plugins | Usarlo sin `paused:true` en piezas para render |

GSAP puede usarse **solo como motor matemático** sobre objetos JS planos y dibujar tú mismo cada fotograma (técnica del showreel original): una sola timeline controlada con `tl.totalTime(t)` que escribe valores en un objeto que luego dibuja Canvas.

## 9.3 Estructura de proyecto

```text
proyecto/
├─ brief.md              Brief y modo (fiel / inspiración / original)
├─ design.md             Sistema visual y personalidad de movimiento
├─ spec.json             Especificación (§12)
├─ src/
│  ├─ index.html         Composición (o una composición por escena)
│  ├─ runtime/           mg-runtime.js, prng.js, easing.js, camera.js
│  ├─ scenes/            scene-01.js, scene-02.js …
│  └─ styles.css
├─ assets/
│  ├─ fonts/             Fuentes locales y licencia
│  ├─ img/  audio/  video-frames/
│  └─ voz.words.json     Marcas por palabra
├─ renders/              Previews y finales (con fecha y hash)
├─ qa/                   Hojas de contacto, informes, golden frames
└─ README.md             Decisiones, incertidumbres, licencias, cómo renderizar
```

## 9.4 Rendimiento

- Preferir `transform` y `opacity`; reservar `left/top/width/height` para morphs breves.
- `filter: blur()` solo en transiciones cortas (≤ 0,3 s) y no sobre contenedores enormes durante mucho tiempo.
- Cientos de elementos simultáneos animados es el límite práctico para vista previa fluida (< ~150 en los proyectos originales). En render offline el coste es tiempo, no fps, pero **conviene** que la vista previa siga siendo usable.
- Generar repetidos (barras, píxeles, tarjetas) por JS, con semilla.
- Prerrenderizar elementos costosos y repetitivos.
- Preview a menor resolución/fps; render final en Linux (§4.4).

## 9.5 Entorno restringido (artefactos publicados)

Reglas del entorno original, a respetar cuando el HTML se publique como página alojada (no re-verificadas en esta investigación; confirmar en el entorno de destino):

- Scripts solo desde CDN permitidos (cdnjs preferido, jsDelivr/npm, Tailwind CDN, jQuery CDN) con **versión exacta fijada**.
- Hojas de estilo externas solo de Google Fonts, siempre con fuente de reserva en cascada.
- Sin imágenes remotas ni peticiones a otros sitios: todo se dibuja por código o se embebe (`data:`).
- Tamaño total < 16 MB.
- Almacenamiento del navegador permitido pero privado y opcional (`try/catch`).
- `viewport-fit=cover` y `env(safe-area-inset-*)` para móviles.
- Si GSAP no carga, **asignar valores finales** para que nada quede invisible (fallback).

## 9.6 Formatos de salida

| Formato | Uso | Cautela |
|---|---|---|
| MP4 H.264 `yuv420p` | Compatibilidad máxima (web, redes) | Etiquetar y convertir a BT.709 (§4.4) |
| WebM VP9 | Web | Alfa en WebM no es fiable en Safari **[C]** |
| MOV con alfa (ProRes 4444) | Composición en editores | Archivos grandes |
| Secuencia PNG | Máxima calidad, transparencia | Peso |
| GIF | Bucles cortos | 256 colores, sin audio; preferir MP4/WebM en bucle |
| Lottie / dotLottie | UI vectorial | No todas las funciones de After Effects son compatibles; probar en el runtime final |
| HTML interactivo | Reproducción en navegador | Respetar `prefers-reduced-motion` (§15) |

---
