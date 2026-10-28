// La portada sin Codex: un cuadro del propio vídeo de fondo y el título encima, grande y con contorno, dentro de la zona
// que se ve en la cuadrícula del perfil (o, en horizontal, en la miniatura de YouTube). Es la de respaldo cuando no hay
// cuenta de ChatGPT (PORTADA.md de video-base).
const USO = `
Uso:
  node portada_sin_ia.mjs <video.mp4> <portada.png> --titulo "De dos a cinco palabras" [--t 12.5] [--fuente letra.ttf] [--color "#ffd84a"] [--horizontal]

--t           el segundo del cuadro de fondo (por defecto, el 40 % del vídeo): el de su mejor momento.
--fuente      la letra del estilo (.ttf, .otf, .woff o .woff2); sin ella, Arial Black.
--color       el color del título (por defecto, blanco); el contorno es negro.
--horizontal  la miniatura de YouTube de un vídeo horizontal: 1280x720, el título en la mitad izquierda. Va al final.

Deja un PNG de 1080x1920. Después, como siempre: node portada.mjs <video.mp4> <portada.png>.
Con --horizontal, uno de 1280x720 que no entra en el vídeo: no se corre portada.mjs.
`
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { abrirChrome } from './chrome.mjs'
import { ffmpeg, opciones, probar, uso } from './ffmpeg.mjs'

const o = opciones()
uso(o, 2, USO)
if (typeof o.titulo !== 'string' || !o.titulo.trim()) {
  console.error(USO.trim())
  process.exit(2)
}
const video = resolve(o._[0])
const salida = resolve(o._[1])
const horizontal = !!o.horizontal
const [W, H] = horizontal ? [1280, 720] : [1080, 1920]
// La zona que se ve en la cuadrícula y no tapan el texto ni los botones (PORTADA.md): de 300 a 1350 de alto y de 120
// a 860 de ancho. En horizontal, la mitad izquierda sin el 5 % de los bordes: abajo a la derecha YouTube pone la duración.
const ZONA = horizontal ? { arriba: 64, abajo: 656, izquierda: 64, derecha: 640 } : { arriba: 300, abajo: 1350, izquierda: 120, derecha: 860 }

const duracion = Number(probar(video).format.duration) || 0
const t = o.t !== undefined ? Number(o.t) : duracion * 0.4
const temporal = mkdtempSync(join(tmpdir(), 'portada-sin-ia-'))
try {
  const cuadro = join(temporal, 'cuadro.jpg')
  ffmpeg(['-ss', String(t), '-i', video, '-frames:v', '1', '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`, '-q:v', '2', cuadro])
  const fuente = o.fuente && existsSync(resolve(o.fuente)) ? pathToFileURL(resolve(o.fuente)).href : null
  const escapar = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const html = `<!doctype html><meta charset="utf-8"><style>
${fuente ? `@font-face { font-family: Estilo; src: url("${fuente}"); }` : ''}
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
body { background: url("data:image/jpeg;base64,${readFileSync(cuadro).toString('base64')}") center / cover; }
.sombra { position: absolute; inset: 0; background: ${horizontal ? 'linear-gradient(90deg, rgba(0,0,0,.6), rgba(0,0,0,.1) 65%)' : 'radial-gradient(ellipse at 45% 42%, rgba(0,0,0,.15), rgba(0,0,0,.55))'}; }
.titulo {
  position: absolute; left: ${ZONA.izquierda}px; width: ${ZONA.derecha - ZONA.izquierda}px; top: ${ZONA.arriba}px;
  height: ${ZONA.abajo - ZONA.arriba}px; display: flex; align-items: center; justify-content: center; text-align: center;
  font-family: ${fuente ? 'Estilo, ' : ''}'Arial Black', Impact, sans-serif; font-weight: 900; line-height: 1.02;
  color: ${typeof o.color === 'string' ? o.color : '#fff'}; -webkit-text-stroke: 0.09em #000; paint-order: stroke fill;
  text-shadow: 0 0.06em 0.12em rgba(0,0,0,.6); overflow-wrap: break-word;
}
</style><div class="sombra"></div><div class="titulo"><span id="t">${escapar(o.titulo.trim())}</span></div>`
  writeFileSync(join(temporal, 'portada.html'), html)

  const chrome = await abrirChrome({ ancho: W, alto: H })
  try {
    const cargada = new Promise((r) => chrome.alEvento('Page.loadEventFired', r))
    await chrome.enviar('Page.navigate', { url: pathToFileURL(join(temporal, 'portada.html')).href })
    await cargada
    // La letra más grande que cabe: de dos a cuatro renglones que no pasen de la mitad de la zona de alto.
    await chrome.evaluar(`(async () => {
      await document.fonts.ready
      const t = document.getElementById('t'), caja = t.parentElement
      for (let px = 210; px >= 60; px -= 4) {
        caja.style.fontSize = px + 'px'
        if (t.offsetWidth <= caja.clientWidth && t.offsetHeight <= caja.clientHeight * 0.55) break
      }
    })()`)
    const { imagen } = await chrome.capturar('png')
    writeFileSync(salida, await imagen)
  } finally {
    await chrome.cerrar()
  }
  console.log(salida)
} finally {
  rmSync(temporal, { recursive: true, force: true })
}
