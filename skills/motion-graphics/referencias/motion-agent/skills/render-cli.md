# SKILL · Herramientas de este repo (lint, QA, hoja de contactos, render)

> **Cuándo cargar:** al verificar o renderizar una composición.
> Requisitos: Node ≥ 20, `npm install`, `npm run setup` (Chromium de Playwright) y `ffmpeg`/`ffprobe` en el PATH.

## Comandos

| Comando | Qué hace | Cuándo |
|---|---|---|
| `node tools/lint.mjs <html>` | L0 estático: contrato `__mg`, `Math.random`, `Date.now`, `repeat:-1`, `transition`/`@keyframes`, recursos remotos, GSAP sin versión fija. Sale con código 1 si hay errores. | Después de **cada** edición |
| `node tools/qa.mjs <html> [--samples N] [--video out.mp4]` | En navegador: contrato, **determinismo** (mismo t → mismo píxel), texto fuera del encuadre, primer/último fotograma, consola, red bloqueada. Con `--video`: duración, etiquetas BT.709, segmentos congelados y negros. | Cuando lint esté en verde, y de nuevo sobre el MP4 final |
| `node tools/sheet.mjs <html\|mp4> --every 0.5` | Hojas de contactos 3×3 con etiqueta de tiempo. `--at 1.48,1.5,1.6` para tiempos exactos. | Para **mirar** la pieza: úsalo siempre antes de dar algo por bueno |
| `node tools/render.mjs <html> --preview` | Borrador rápido (½ tamaño, ≤30 fps, CRF 28). | Iteración |
| `node tools/render.mjs <html> --out out/x.mp4` | Render final: PNG por fotograma → H.264, BT.709 explícito, `+faststart`. `--scale 2` para más resolución, `--from/--to` para un tramo, `--audio mezcla.wav`, `--png-seq dir`. | Entrega |
| `node tools/fetch-fonts.mjs "Familia:400,700"` | Descarga fuentes a `runtime/fonts/` (necesita internet solo en ese momento). | Si lint dice `REMOTE` por fuentes |

## Cómo interpretar el QA
- **error** = bloquea la entrega. **warn** = decide con la hoja de contactos (a menudo es intencional: un negro de transición, una entrada fuera de cuadro).
- `determinismo` falla → hay estado fuera de `render(t)` (variable acumulada, aleatoriedad, CSS animado, fuente que carga tarde). Es el defecto más grave: sin él no se pueden reproducir los errores.
- `ultimo-fotograma` vacío → falta un estado final estable (anti-patrón #6). No hagas fundido a nada en la última escena.
- `sonda-propia` → la composición define `window.__qa.probe(t, true)` y devolvió incidencias (solapes, desbordes).

## Qué NO hace todavía
- No mide contraste ni solapes de forma genérica (solo si la composición aporta `__qa.probe`).
- No mezcla audio (usa los comandos de `audio.md` y pasa `--audio`).
- El render usa captura por CDP (`Page.captureScreenshot`), fiable y portable. Para render en CI de gran volumen, el KB §4.4 describe la variante BeginFrame en Linux.
