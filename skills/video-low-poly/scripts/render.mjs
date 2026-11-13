// Dibuja un video Low-Poly en Chrome sin ventana, con la tarjeta: abre kit/pagina.html, llama a seek(i / fps) en cada
// cuadro, lo captura y lo pasa a FFmpeg. Cada cuadro es el promedio de sus sub-render (64 en el estilo), que dan el
// desenfoque de movimiento, la profundidad de campo y las sombras suaves de verdad: así se ve igual que la referencia.
const USO = `
Uso:
  node render.mjs <raíz> --plan revision/plan.json --salida revision/_imagen.mp4 [--sonido revision/_efectos.wav] [--voz]
  node render.mjs <raíz> --plan revision/plan.json --fotos 0,2.5,6 --carpeta revision/fotos [--muestras 8]
  node render.mjs <raíz> --estilo ref.js ...      un estilo suelto (la referencia tal cual), en vez del plan

<raíz>       la carpeta del proyecto: el plan y el estilo se leen de ahí.
--ancho/--alto  el cuadro (sin ellos, los del plan, o 1920×1080).
--muestras   sub-render por cuadro (sin él, los del estilo). --fps, 30.
--sonido     además, el sonido del estilo en un WAV; con --voz, en su mezcla para ir bajo una voz.
--fotos      solo esos segundos, en JPG, a --carpeta: para mirar el encuadre sin el render entero.
`
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.SLOTH_SKILLS ? join(process.env.SLOTH_SKILLS, 'video-base', 'scripts') : join(SKILL, '..', 'video-base', 'scripts')
const { abrirChrome } = await import('file://' + join(BASE, 'chrome.mjs').replaceAll('\\', '/'))
const { ajustesH264, codificadorH264, escribir, ffmpegTubo, opciones, uso } = await import('file://' + join(BASE, 'ffmpeg.mjs').replaceAll('\\', '/'))

const o = opciones()
uso(o, 1, USO)
const raiz = resolve(o._[0])
const plan = o.plan ? JSON.parse(readFileSync(join(raiz, o.plan), 'utf8')) : null
const W = Number(o.ancho || plan?.ancho || 1920), H = Number(o.alto || plan?.alto || 1080)
const FPS = Number(o.fps || 30)

// Un servidor de archivos de solo lectura: /kit/ es la carpeta del estilo y /p/ la del proyecto. Los módulos de
// JavaScript no cargan desde file://.
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' }
const servidor = createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const [, zona, ...resto] = ruta.split('/')
  const raices = { kit: join(SKILL, 'kit'), p: raiz }
  const base = raices[zona]
  const archivo = base && resolve(base, ...resto)
  if (!archivo || !(archivo + sep).startsWith(base + sep) || !existsSync(archivo) || !statSync(archivo).isFile()) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': TIPOS[extname(archivo)] || 'application/octet-stream', 'cache-control': 'no-store' })
  createReadStream(archivo).pipe(res)
})
await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
const puerto = servidor.address().port

const consulta = new URLSearchParams({ ancho: W, alto: H })
if (o.plan) consulta.set('plan', '/p/' + o.plan.replaceAll('\\', '/'))
else if (o.estilo) consulta.set('estilo', '/p/' + o.estilo.replaceAll('\\', '/'))
else uso({ _: [] }, 1, USO)
if (o.muestras) consulta.set('muestras', o.muestras)

const inicio = Date.now()
const chrome = await abrirChrome({ ancho: W, alto: H, gpu: 'si-hay' })
let salida = 0
try {
  await chrome.enviar('Page.navigate', { url: `http://127.0.0.1:${puerto}/kit/pagina.html?${consulta}` })
  // Construir el mundo (triangular el terreno, plegar las nubes) tarda unos segundos.
  for (let i = 0; ; i++) {
    const estado = await chrome.evaluar('window.listo ? "listo" : window.fallo || ""').catch(() => '')
    if (estado === 'listo') break
    if (estado) throw new Error('la página falló:\n' + estado)
    if (i > 600) throw new Error('la página no terminó de construir el mundo en 2 min')
    await new Promise((r) => setTimeout(r, 200))
  }
  const dura = await chrome.evaluar('window.DURATION')
  const renderer = await chrome.evaluar('(() => { const g = document.createElement("canvas").getContext("webgl2"); const d = g && g.getExtension("WEBGL_debug_renderer_info"); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : "?" })()')
  for (const a of await chrome.evaluar('window.avisos')) console.log('⚠ ' + a)
  if (/SwiftShader|WARP|Basic Render/i.test(renderer)) console.log(`⚠ Chrome dibuja sin la tarjeta (${renderer}): va a tardar mucho más.`)

  if (o.sonido) {
    const b64 = await chrome.evaluar(`window.sonido(${o.voz ? 'true' : 'false'})`)
    mkdirSync(dirname(resolve(raiz, o.sonido)), { recursive: true })
    writeFileSync(resolve(raiz, o.sonido), Buffer.from(b64, 'base64'))
  }

  if (o.fotos) {
    const carpeta = resolve(raiz, o.carpeta || 'revision/fotos')
    mkdirSync(carpeta, { recursive: true })
    for (const t of String(o.fotos).split(',').map(Number)) {
      await chrome.evaluar(`seek(${Math.min(t, dura)})`)
      const { imagen } = await chrome.capturar('jpeg', 92)
      writeFileSync(join(carpeta, `t${t.toFixed(2).padStart(6, '0')}.jpg`), await imagen)
    }
    console.log(`✓ ${String(o.fotos).split(',').length} fotos en ${carpeta} (${((Date.now() - inicio) / 1000).toFixed(0)} s)`)
  } else if (o.salida) {
    const n = Math.round(dura * FPS)
    const destino = resolve(raiz, o.salida)
    mkdirSync(dirname(destino), { recursive: true })
    const cod = codificadorH264()
    const { p, fin } = ffmpegTubo(['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', ...ajustesH264(cod, 14),
      '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', destino])
    // La captura de un cuadro se copia y se comprime mientras la página ya dibuja el siguiente.
    let antes = null, avisado = Date.now()
    for (let i = 0; i < n; i++) {
      await chrome.evaluar(`seek(${i / FPS})`)
      const { imagen } = await chrome.capturar('jpeg', 95)
      if (antes) await escribir(p, await antes)
      antes = imagen
      if (Date.now() - avisado > 15000) {
        avisado = Date.now()
        const s = (Date.now() - inicio) / 1000
        console.log(`  render: cuadro ${i + 1} de ${n} (${s.toFixed(0)} s; faltan ~${((s / (i + 1)) * (n - i - 1)).toFixed(0)} s)`)
      }
    }
    if (antes) await escribir(p, await antes)
    p.stdin.end()
    await fin
    console.log(`✓ ${n} cuadros (${dura.toFixed(2)} s) en ${((Date.now() - inicio) / 1000).toFixed(0)} s con ${renderer}`)
  }
} catch (e) {
  console.error('✗ render: ' + (e.message || e))
  salida = 1
} finally {
  await chrome.cerrar()
  servidor.close()
}
process.exit(salida)
