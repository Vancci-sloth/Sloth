// Dibuja el video en Chrome sin ventana: abre kit/pagina.html con el plan, llama a seek(i / fps) en cada cuadro, lo
// captura y se lo pasa a FFmpeg. El director es canvas 2D, así que va un dibujo por cuadro (sin acumular muestras):
// un vertical de 15 s sale en menos de un minuto.
const USO = `
Uso:
  node render.mjs <raíz> --plan revision/plan.json --salida revision/_imagen.mp4 [--fps 30]
  node render.mjs <raíz> --plan revision/plan.json --portada revision/portada-estilo.png
  node render.mjs <raíz> --plan revision/plan.json --fotos 0,1.9,3.8 --carpeta revision/fotos
  node render.mjs <raíz> --plan revision/plan.json --semillas 4:7.46,7:13.1   material/semilla-<n>.jpg

<raíz>       la carpeta del video: el plan se lee de ahí.
--fps        30 si no se dice (el plan manda).
--fotos      solo esos segundos, en JPG: para mirar un encuadre sin el render entero.
`
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.SLOTH_SKILLS ? join(process.env.SLOTH_SKILLS, 'video-base', 'scripts') : join(SKILL, '..', 'video-base', 'scripts')
const url = (p) => 'file://' + p.replaceAll('\\', '/')
const { abrirChrome } = await import(url(join(BASE, 'chrome.mjs')))
const { ajustesH264, codificadorH264, escribir, ffmpegTubo, opciones, uso } = await import(url(join(BASE, 'ffmpeg.mjs')))

const o = opciones()
uso(o, 1, USO)
const raiz = resolve(o._[0])
const plan = JSON.parse(readFileSync(join(raiz, o.plan || 'revision/plan.json'), 'utf8'))
const W = plan.ancho
const H = plan.alto
const FPS = Number(o.fps || plan.fps || 30)

// Un servidor de solo lectura: /kit/ es el kit del estilo y /p/ la carpeta del video. Los módulos de JavaScript no
// cargan desde file://.
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
const consulta = new URLSearchParams({ plan: '/p/' + (o.plan || 'revision/plan.json').replaceAll('\\', '/') })

const inicio = Date.now()
const chrome = await abrirChrome({ ancho: W, alto: H, gpu: 'si-hay' })
let salida = 0
try {
  await chrome.enviar('Page.navigate', { url: `http://127.0.0.1:${puerto}/kit/pagina.html?${consulta}` })
  for (let i = 0; ; i++) {
    const estado = await chrome.evaluar('window.listo ? "listo" : window.fallo || ""').catch(() => '')
    if (estado === 'listo') break
    if (estado) throw new Error('la página falló:\n' + estado)
    if (i > 150) throw new Error('la página no cargó en 30 s')
    await new Promise((r) => setTimeout(r, 200))
  }
  const dura = await chrome.evaluar('window.DURATION')

  if (o.portada) {
    await chrome.evaluar('window.portada()')
    const { imagen } = await chrome.capturar('png')
    const destino = resolve(raiz, o.portada)
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, await imagen)
    console.log(`✓ portada del estilo en ${o.portada}`)
  } else if (o.semillas) {
    // El cuadro del que arranca un clip: Flow lo anima desde ahí y la pieza no salta al entrar al material.
    const carpeta = resolve(raiz, 'material')
    mkdirSync(carpeta, { recursive: true })
    for (const par of String(o.semillas).split(',')) {
      const [n, t] = par.split(':')
      await chrome.evaluar(`semilla(${Math.min(Number(t), dura)})`)
      const { imagen } = await chrome.capturar('jpeg', 95)
      writeFileSync(join(carpeta, `semilla-${n}.jpg`), await imagen)
    }
    console.log(`✓ ${String(o.semillas).split(',').length} semilla(s) en material/`)
  } else if (o.fotos) {
    const carpeta = resolve(raiz, o.carpeta || 'revision/fotos')
    mkdirSync(carpeta, { recursive: true })
    for (const t of String(o.fotos).split(',').map(Number)) {
      await chrome.evaluar(`seek(${Math.min(t, dura)})`)
      const { imagen } = await chrome.capturar('jpeg', 92)
      writeFileSync(join(carpeta, `t${t.toFixed(2).padStart(6, '0')}.jpg`), await imagen)
    }
    console.log(`✓ ${String(o.fotos).split(',').length} fotos en ${carpeta}`)
  } else if (o.salida) {
    const n = Math.round(dura * FPS)
    const destino = resolve(raiz, o.salida)
    mkdirSync(dirname(destino), { recursive: true })
    const cod = codificadorH264()
    const { p, fin } = ffmpegTubo(['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', ...ajustesH264(cod, 14),
      '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', destino])
    // La captura de un cuadro se comprime mientras la página ya dibuja el siguiente.
    let antes = null
    let avisado = Date.now()
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
    console.log(`✓ ${n} cuadros (${dura.toFixed(2)} s) en ${((Date.now() - inicio) / 1000).toFixed(0)} s`)
  } else {
    uso({ _: [] }, 1, USO)
  }
} catch (e) {
  console.error('✗ render: ' + (e.message || e))
  salida = 1
} finally {
  await chrome.cerrar()
  servidor.close()
}
process.exit(salida)
