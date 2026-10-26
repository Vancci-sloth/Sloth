// Pone la portada como primer fotograma de un vídeo vertical: es lo que TikTok, Reels y Shorts enseñan de portada y en
// la cuadrícula del perfil. Cómo se hace la imagen: PORTADA.md de video-base.
const USO = `
Uso:
  node portada.mjs <video.mp4> <portada.png>

Añade la imagen como un solo fotograma delante del vídeo (y el audio se corre ese fotograma, para que no se desfase), en
el mismo archivo. La imagen se ajusta al tamaño del vídeo cubriéndolo: lo que sobra de los lados se recorta. Un vídeo que
ya tenía portada (lo marca en sus metadatos) cambia la suya: correrlo dos veces no suma dos.
`
import { mkdtempSync, openSync, readSync, closeSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { ffmpeg, opciones, probar, uso } from './ffmpeg.mjs'

const MARCA = 'sloth-portada'
// Los presets de x264, del más usado al menos: el que da las mismas cabeceras que el vídeo es el suyo.
const PRESETS = ['medium', 'slow', 'slower', 'fast', 'veryslow', 'faster', 'veryfast', 'superfast', 'ultrafast']

const o = opciones()
uso(o, 2, USO)
const video = resolve(o._[0])
const imagen = resolve(o._[1])

const info = probar(video)
const v = info.streams.find((s) => s.codec_type === 'video')
const a = info.streams.find((s) => s.codec_type === 'audio')
if (!v) throw new Error(`${video} no tiene vídeo.`)
const { width: W, height: H } = v
const [fn, fd] = v.r_frame_rate.split('/').map(Number)
const fps = `${fn}/${fd}`
const yaTenia = info.format.tags?.comment === MARCA
// Las muestras de audio que dura un fotograma: el silencio que se pone delante (y el que se quita si ya tenía portada).
const muestras = a ? Math.round((Number(a.sample_rate) * fd) / fn) : 0

const img = probar(imagen).streams[0]
const escala = Math.max(W / img.width, H / img.height)
const sobra = [Math.round(img.width * escala) - W, Math.round(img.height * escala) - H]

const extradata = (archivo) =>
  JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_streams', '-show_data', '-of', 'json', archivo], { encoding: 'utf8' }).stdout)
    .streams[0]?.extradata

/**
 * Sin recodificar el vídeo: se codifica solo el fotograma de la portada con x264, con los mismos ajustes que el vídeo
 * (su crf, que x264 deja escrito en el archivo, y el preset cuyas cabeceras SPS/PPS salen idénticas), y se pega
 * delante; el audio se copia corrido un fotograma. Así el vídeo no pasa por una segunda compresión y tarda un segundo
 * en vez de recodificarlo entero. En un vídeo del explicativo, los 2451 fotogramas y el audio salieron idénticos.
 * Devuelve false si no se puede (otro códec, otros ajustes, una portada de antes que sí recodificó): entonces se
 * recodifica como siempre.
 */
function sinRecodificar(salida, dir) {
  if (v.codec_name !== 'h264') return false
  const buf = Buffer.alloc(2_000_000)
  const f = openSync(video, 'r')
  readSync(f, buf, 0, buf.length, 0)
  closeSync(f)
  const ajustes = /x264 - core .*?options: ([ -~]*)/s.exec(buf.toString('latin1'))?.[1] ?? ''
  const crf = /\brc=crf\b/.test(ajustes) && /\bcrf=([\d.]+)/.exec(ajustes)?.[1]
  if (!crf) return false
  const llaves = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'packet=flags', '-of', 'csv=p=0', '-read_intervals', '%+#2', video], { encoding: 'utf8' })
    .stdout.trim().split(/\s+/)
  // Una portada puesta así es su propio fotograma clave y el vídeo sigue con otro: se quita sin recodificar.
  if (yaTenia && !llaves[1]?.startsWith('K')) return false

  const portada = join(dir, 'portada.mp4')
  // El color, como el del vídeo: la imagen se pasa a YUV con su matriz y su rango, y lleva sus mismas etiquetas (un PNG
  // trae las suyas, que ganan a -color_primaries y -color_trc: por eso van en setparams).
  const sabido = (x) => x && x !== 'unknown' && x !== 'unspecified'
  const matriz = { bt709: 'bt709', bt470bg: 'bt470', smpte170m: 'smpte170m', bt2020nc: 'bt2020' }[v.color_space]
  const escalar = `scale=${W}:${H}:force_original_aspect_ratio=increase${matriz ? `:out_color_matrix=${matriz}` : ''}` +
    `${sabido(v.color_range) ? `:out_range=${v.color_range}` : ''}`
  const etiquetas = [['color_primaries', v.color_primaries], ['color_trc', v.color_transfer], ['colorspace', v.color_space], ['range', v.color_range]]
    .filter(([, x]) => sabido(x)).map(([k, x]) => `${k}=${x}`).join(':')
  const color = [['-color_range', v.color_range], ['-colorspace', v.color_space], ['-color_primaries', v.color_primaries],
    ['-color_trc', v.color_transfer], ['-chroma_sample_location', v.chroma_location]].filter(([, x]) => sabido(x)).flat()
  const objetivo = extradata(video)
  const preset = PRESETS.find((p) => {
    ffmpeg(['-v', 'error', '-framerate', fps, '-i', imagen,
      '-vf', `${escalar},crop=${W}:${H},setsar=${(v.sample_aspect_ratio ?? '1:1').replace(':', '/')},format=${v.pix_fmt}` +
        (etiquetas ? `,setparams=${etiquetas}` : ''),
      '-frames:v', '1', '-c:v', 'libx264', '-preset', p, '-crf', crf, '-pix_fmt', v.pix_fmt, ...color, '-r', fps,
      '-video_track_timescale', v.time_base.split('/')[1], portada])
    return extradata(portada) === objetivo
  })
  if (!preset) return false

  const resto = join(dir, 'resto.mp4')
  ffmpeg(['-v', 'error', '-i', video, '-map', '0:v', '-c', 'copy', ...(yaTenia ? ['-bsf:v', 'noise=drop=eq(n\\,0)'] : []), resto])
  const lista = join(dir, 'lista.txt')
  writeFileSync(lista, `file '${portada.replaceAll('\\', '/')}'\nfile '${resto.replaceAll('\\', '/')}'\n`)
  const unido = join(dir, 'unido.mp4')
  ffmpeg(['-v', 'error', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', unido])
  // El audio ya venía corrido si tenía portada; si no, se corre un fotograma (sin recodificarlo).
  ffmpeg(['-v', 'error', '-i', unido, ...(a && !yaTenia ? ['-itsoffset', (fd / fn).toFixed(6)] : []), '-i', video,
    '-map', '0:v', ...(a ? ['-map', '1:a'] : []), '-c', 'copy', '-metadata', `comment=${MARCA}`, '-movflags', '+faststart', salida])
  const hecho = probar(salida).streams.find((s) => s.codec_type === 'video')
  return Number(hecho.nb_frames) === Number(v.nb_frames) + (yaTenia ? 0 : 1)
}

/** Recodifica el vídeo entero con la portada delante (x264 crf 16): lo de siempre, cuando no se puede sin recodificar. */
function recodificar(salida) {
  // La portada, en bt709 de rango limitado como el vídeo: con la matriz por defecto (bt601) los colores salen corridos.
  const filtros = [
    `[1:v]scale=${W}:${H}:force_original_aspect_ratio=increase:out_color_matrix=bt709:out_range=tv,crop=${W}:${H},setsar=1,format=yuv420p,trim=end_frame=1[p]`,
    `[0:v]${yaTenia ? 'trim=start_frame=1,setpts=PTS-STARTPTS,' : ''}setsar=1,format=yuv420p[v]`,
    `[p][v]concat=n=2:v=1:a=0[vo]`
  ]
  if (a) filtros.push(`[0:a]${yaTenia ? `atrim=start_sample=${muestras},asetpts=PTS-STARTPTS,` : ''}adelay=delays=${muestras}S:all=1[ao]`)
  ffmpeg([
    '-v', 'error',
    '-i', video,
    '-framerate', fps, '-i', imagen,
    '-filter_complex', filtros.join(';'),
    '-map', '[vo]', ...(a ? ['-map', '[ao]'] : []),
    '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', fps,
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    ...(a ? ['-c:a', 'aac', '-b:a', '320k', '-ar', a.sample_rate, '-ac', String(a.channels)] : []),
    '-metadata', `comment=${MARCA}`,
    '-movflags', '+faststart',
    salida
  ])
}

const tmp = video.replace(/\.mp4$/i, '') + '.portada-tmp.mp4'
const dir = mkdtempSync(join(tmpdir(), 'portada-'))
let como = 'sin recodificar el vídeo'
try {
  let ok = false
  try {
    ok = sinRecodificar(tmp, dir)
  } catch (e) {
    console.error(`Sin recodificar no salió (${String(e.message).split('\n')[0]}): recodifico.`)
  }
  if (!ok) {
    como = 'recodificando el vídeo'
    recodificar(tmp)
  }
  try {
    renameSync(tmp, video)
  } catch (err) {
    if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err
    // Sloth tiene el vídeo abierto (lo sirve al panel): Windows no deja reemplazarlo, pero sí apartarlo y borrarlo.
    const viejo = `${tmp}.viejo`
    renameSync(video, viejo)
    renameSync(tmp, video)
    rmSync(viejo, { force: true })
  }
} finally {
  rmSync(tmp, { force: true })
  rmSync(dir, { recursive: true, force: true })
}
const recorte = sobra[0] > 2 ? `; se recortaron ${sobra[0]} px de ancho` : sobra[1] > 2 ? `; se recortaron ${sobra[1]} px de alto` : ''
console.log(`${yaTenia ? 'Portada cambiada' : 'Portada puesta'} en ${video}, ${como} (${W}×${H}${recorte})`)
