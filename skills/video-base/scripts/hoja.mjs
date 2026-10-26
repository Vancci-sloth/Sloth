// Hoja de contacto: muchos cuadros en una sola imagen, con su tiempo encima. Es lo que se mira (y lo que mira el
// revisor) en vez de abrir cuadros sueltos: cuesta unas seis veces menos y se ve el ritmo.
const USO = `
Uso:
  node hoja.mjs <video.mp4> <hoja.png> [--n 16 | --cada 0.5 | --t 1,2.5,4] [--desde 0 --hasta 10]
  node hoja.mjs <carpeta | imagen...> <hoja.png>          los PNG o JPG de una carpeta

  --columnas n       por defecto 6 en vertical y 4 en horizontal
  --ancho px         el ancho de cada celda (por defecto 360: el de un móvil)
  --rotulos "a|b|c"  un texto por cuadro, junto a su tiempo (la frase o el momento)
  --recorte x,y,w,h  solo esa zona de cada cuadro, en píxeles del original (un detalle, un reproductor dentro del vídeo)
  --vecino           reduce con vecino más cercano (que no se emborrone un borde duro)
  --zonas            pinta encima lo que tapa la interfaz de TikTok y Shorts (vertical) o el margen del 5 % (horizontal)
  --recomprimir 3M   antes de sacar los cuadros, recodifica a ese bitrate y a 720 px de ancho, como hacen las
                     plataformas: así se ve si el grano y los detalles finos sobreviven
`
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { FUENTE, ffmpeg, opciones, probar, uso } from './ffmpeg.mjs'

/** Zonas seguras de TikTok y Shorts sobre 1080×1920: arriba, abajo, derecha (botones) e izquierda. */
export const ZONAS = { arriba: 220, abajo: 480, derecha: 160, izquierda: 80 }

const texto = (s) => s.replace(/\\/g, '\\\\\\\\').replace(/'/g, "\u2019").replace(/:/g, '\\:').replace(/%/g, '\\%')

function capaZonas(ancho, alto) {
  if (alto > ancho) {
    const k = ancho / 1080
    const r = (x, y, w, h) => `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=red@0.28:t=fill`
    return [
      r(0, 0, 'iw', Math.round(ZONAS.arriba * k)),
      r(0, `ih-${Math.round(ZONAS.abajo * k)}`, 'iw', Math.round(ZONAS.abajo * k)),
      r(`iw-${Math.round(ZONAS.derecha * k)}`, 0, Math.round(ZONAS.derecha * k), 'ih'),
      r(0, 0, Math.round(ZONAS.izquierda * k), 'ih')
    ].join(',')
  }
  return `drawbox=x=iw*0.05:y=ih*0.05:w=iw*0.9:h=ih*0.9:color=yellow@0.9:t=${Math.max(2, Math.round(ancho / 480))}`
}

function main() {
  const o = opciones()
  uso(o, 2, USO)
  const salida = resolve(o._.at(-1))
  const entradas = o._.slice(0, -1).map((p) => resolve(p))
  const tmp = mkdtempSync(join(tmpdir(), 'hoja-'))
  try {
    let celdas // [{ archivo, t?, etiqueta }]
    let ancho, alto
    const primera = entradas[0]
    const esVideo = entradas.length === 1 && statSync(primera).isFile() && ['.mp4', '.mov', '.webm', '.mkv'].includes(extname(primera).toLowerCase())
    if (esVideo) {
      let video = primera
      if (o.recomprimir) {
        video = join(tmp, 'recomprimido.mp4')
        const b = String(o.recomprimir)
        ffmpeg(['-v', 'error', '-i', primera, '-an', '-vf', 'scale=720:-2', '-c:v', 'libx264', '-b:v', b, '-maxrate', b, '-bufsize', b.replace(/(\d+)/, (n) => 2 * n), video])
      }
      const info = probar(video)
      const v = info.streams.find((s) => s.codec_type === 'video')
      ;[ancho, alto] = [v.width, v.height]
      const dur = Number(info.format.duration)
      const desde = Number(o.desde ?? 0)
      const hasta = Math.min(dur, Number(o.hasta ?? dur))
      let tiempos
      if (o.t) tiempos = String(o.t).split(',').map(Number)
      else if (o.cada) {
        tiempos = []
        for (let t = desde; t < hasta - 1e-6; t += Number(o.cada)) tiempos.push(t)
      } else {
        const n = Number(o.n ?? 16)
        tiempos = Array.from({ length: n }, (_, i) => desde + ((i + 0.5) * (hasta - desde)) / n)
      }
      const rotulos = o.rotulos ? String(o.rotulos).split('|') : []
      celdas = tiempos.map((t, i) => ({ archivo: video, t, etiqueta: `${t.toFixed(2)} s${rotulos[i] ? ` ${rotulos[i]}` : ''}` }))
    } else {
      const archivos = entradas.flatMap((p) =>
        statSync(p).isDirectory()
          ? readdirSync(p).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort().map((f) => join(p, f))
          : [p]
      )
      if (!archivos.length) throw new Error('No hay imágenes')
      const v = probar(archivos[0]).streams[0]
      ;[ancho, alto] = [v.width, v.height]
      const rotulos = o.rotulos ? String(o.rotulos).split('|') : []
      celdas = archivos.map((archivo, i) => ({ archivo, etiqueta: `${basename(archivo, extname(archivo))}${rotulos[i] ? ` ${rotulos[i]}` : ''}` }))
    }

    // Las zonas se pintan sobre el cuadro entero; el recorte va después, y desde ahí se mide la celda.
    const zonas = o.zonas ? [capaZonas(ancho, alto)] : []
    let recorte = []
    if (o.recorte) {
      const [x, y, rw, rh] = String(o.recorte).split(',').map(Number)
      recorte = [`crop=${rw}:${rh}:${x}:${y}`]
      ;[ancho, alto] = [rw, rh]
    }
    const vertical = alto > ancho
    const w = Number(o.ancho ?? 360)
    const h = Math.round((w * alto) / ancho / 2) * 2
    const columnas = Number(o.columnas ?? (vertical ? 6 : 4))
    const letra = Math.max(14, Math.round(w / 20))
    const filtros = [
      ...zonas,
      ...recorte,
      `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=${o.vecino ? 'neighbor' : 'bicubic'}`,
      `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`
    ]
    celdas.forEach((c, i) => {
      const rotulo = `drawbox=x=0:y=0:w=iw:h=${letra + 10}:color=black@0.85:t=fill,drawtext=fontfile='${FUENTE}':text='${texto(c.etiqueta)}':x=6:y=5:fontsize=${letra}:fontcolor=yellow`
      ffmpeg(['-v', 'error', ...(c.t !== undefined ? ['-ss', String(c.t)] : []), '-i', c.archivo, '-frames:v', '1', '-update', '1',
        '-vf', [...filtros, rotulo].join(','), join(tmp, `c${String(i).padStart(4, '0')}.png`)])
    })
    const filas = Math.ceil(celdas.length / columnas)
    ffmpeg(['-v', 'error', '-framerate', '1', '-i', join(tmp, 'c%04d.png'), '-vf', `tile=${columnas}x${filas}:padding=4:color=black`, '-frames:v', '1', '-update', '1', salida])
    console.log(`${salida} · ${celdas.length} cuadros en ${columnas}×${filas}${o.recomprimir ? ` · recomprimido a ${o.recomprimir}` : ''}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

try {
  main()
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
