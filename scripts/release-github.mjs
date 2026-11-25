// Las notas de la release de GitHub de una versión (`.github/workflows/venta.yml`): lo que trae (novedad.txt) y dónde
// se baja. Con PARA_TODOS=1 sale para todos de inmediato; si no, quien apoya la tiene 7 días antes.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const novedad = readFileSync(join(import.meta.dirname, '..', 'novedad.txt'), 'utf8').trim()
const cuando = process.env.PARA_TODOS
  ? 'Sale para todos de inmediato.'
  : 'Quien apoya a Sloth la recibe hoy; los demás, en 7 días, desde «Actualizar» en la app.'

process.stdout.write(`${novedad}

${cuando}

**Descargar Sloth (gratis):** [Windows](https://api.sloth.vancci.org/descargar) · [Mac](https://api.sloth.vancci.org/descargar?so=mac) · [Mac con macOS 12](https://api.sloth.vancci.org/descargar?so=mac12) · [Linux](https://api.sloth.vancci.org/descargar?so=linux) · [sloth.vancci.org](https://sloth.vancci.org)

Si ya la tienes, se actualiza desde la propia app. Sloth es una app gratis para hacer videos con IA para TikTok, Reels, Shorts y YouTube, con la IA que ya tengas: [las IA y sus modelos](https://sloth.vancci.org/ias) · [los estilos](https://sloth.vancci.org/estilos) · [preguntas](https://sloth.vancci.org/preguntas).
`)
