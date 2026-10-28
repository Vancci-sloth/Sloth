// Los cuadros que se revisan, sacados del proyecto de Remotion sin renderizar el video, y sus hojas de contacto.
const USO = `
Uso, desde la carpeta del video:
  node <skill>/scripts/cuadros.mjs                  cada escena (c.escena) al 90 % de su tramo
  node <skill>/scripts/cuadros.mjs --t 1.2,3.4,8    esos segundos
  node <skill>/scripts/cuadros.mjs --cada 0.5       uno cada medio segundo (un tramo rápido, con --desde y --hasta)

  --escala 0.5    el tamaño de cada cuadro (por defecto la mitad: 960×540, o 540×960 en vertical)

Deja revision/cuadros/<segundo>.jpg y revision/hoja-01.png, -02… (16 cuadros cada una, con su segundo y su escena),
que es lo que se mira: un momento se revisa cuando ya terminó de entrar, no mientras se dibuja.
`
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const raiz = process.cwd()
const args = process.argv.slice(2)
const op = (n) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? args[i + 1] : undefined
}
if (args.includes('--ayuda') || !existsSync(join(raiz, 'src', 'edicion.json'))) {
  console.error(USO)
  process.exit(1)
}

const datos = JSON.parse(readFileSync(join(raiz, 'src', 'edicion.json'), 'utf8'))
const fps = datos.fps
const escenaEn = (f) => datos.escenas.find((e) => f >= e.f0 && f < e.f1)?.nombre ?? ''
let cuadros
if (op('t')) cuadros = op('t').split(',').map((s) => Math.round(Number(s) * fps))
else if (op('cada')) {
  const paso = Number(op('cada'))
  const desde = Number(op('desde') ?? 0)
  const hasta = Number(op('hasta') ?? datos.duracion / fps)
  cuadros = []
  for (let t = desde; t < hasta; t += paso) cuadros.push(Math.round(t * fps))
} else cuadros = datos.escenas.map((e) => Math.min(e.f1 - 1, Math.round(e.f0 + (e.f1 - e.f0) * 0.9)))
cuadros = [...new Set(cuadros.filter((f) => f >= 0 && f < datos.duracion))].sort((a, b) => a - b)
if (!cuadros.length) {
  console.error('No hay cuadros que sacar: sin escenas en la edición (c.escena en build.py), pide --t o --cada.')
  process.exit(1)
}

const desdeProyecto = createRequire(join(raiz, 'package.json'))
const { openBrowser, renderStill, selectComposition } = desdeProyecto('@remotion/renderer')
// Empaqueta en una carpeta de %TEMP% que se borra al terminar (video-base): cada revisión dejaba una de 1.15 GB.
const { empaquetar } = createRequire(import.meta.url)(join(process.env.SLOTH_SKILLS || join(homedir(), '.claude', 'skills'), 'video-base', 'scripts', 'remotion.cjs'))

const salida = join(raiz, 'revision', 'cuadros')
rmSync(salida, { recursive: true, force: true })
mkdirSync(salida, { recursive: true })
const { serveUrl, soltar } = await empaquetar(raiz)
const navegador = await openBrowser('chrome', { chromiumOptions: { gl: 'angle' } })
const composition = await selectComposition({ serveUrl, id: 'Documental', puppeteerInstance: navegador })
const escala = Number(op('escala') ?? 0.5)
// El segundo, con ceros delante para que se ordenen bien: 0012.40 s.
const nombre = (f) => `${(f / fps).toFixed(2).padStart(7, '0')} s.jpg`
for (const f of cuadros) {
  await renderStill({ composition, serveUrl, frame: f, output: join(salida, nombre(f)), imageFormat: 'jpeg', jpegQuality: 85, scale: escala, puppeteerInstance: navegador })
}
await navegador.close({ silent: true })
soltar()

// Las hojas, de 16 en 16, con hoja.mjs de video-base.
const hoja = join(process.env.SLOTH_SKILLS || join(homedir(), '.claude', 'skills'), 'video-base', 'scripts', 'hoja.mjs')
for (const h of ['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((n) => join(raiz, 'revision', `hoja-${n}.png`))) rmSync(h, { force: true })
for (let i = 0; i * 16 < cuadros.length; i++) {
  const tanda = cuadros.slice(i * 16, i * 16 + 16)
  const destino = resolve(raiz, 'revision', `hoja-${String(i + 1).padStart(2, '0')}.png`)
  const rotulos = tanda.map((f) => escenaEn(f).replaceAll('|', '/').slice(0, 40)).join('|')
  execFileSync('node', [hoja, ...tanda.map((f) => join(salida, nombre(f))), destino, '--rotulos', rotulos], { stdio: 'inherit' })
}
console.log(`cuadros: ${cuadros.length} en revision/cuadros y ${Math.ceil(cuadros.length / 16)} hoja(s) en revision/`)
