// Comprueba un vídeo terminado contra la especificación de salida antes de darlo por hecho.
const USO = `
Uso:
  node comprobar.mjs <video.mp4> [--duracion 10] [--fps 30] [--tamano 1080x1920] [--lufs -14] [--pico -1] [--negro-ok]

Mira: H.264 en yuv420p, el tamaño, los fps, el número exacto de fotogramas, el audio (AAC, 48 kHz, estéreo), la
sonoridad y el true peak, faststart, cuadros negros y que el primer fotograma no esté vacío. Lo que no pases no se
compara (solo se informa). Sale con 1 si algo falla.
  --negro-ok   los tramos negros son a propósito (un corte a negro buscado).
`
import { openSync, readSync, closeSync } from 'node:fs'
import { resolve } from 'node:path'
import { ffmpeg, opciones, probar, sonoridad, uso } from './ffmpeg.mjs'

const o = opciones()
uso(o, 1, USO)
const video = resolve(o._[0])
const filas = []
const fila = (que, valor, bien, nota = '') => filas.push({ que, valor: String(valor), bien, nota })

const info = probar(video, ['-count_packets'])
const v = info.streams.find((s) => s.codec_type === 'video')
const a = info.streams.find((s) => s.codec_type === 'audio')
if (!v) {
  console.error('El archivo no tiene vídeo.')
  process.exit(1)
}

const [fn, fd] = v.r_frame_rate.split('/').map(Number)
const fps = fn / fd
const fotogramas = Number(v.nb_read_packets)
const duracion = Number(info.format.duration)
fila('códec', `${v.codec_name} ${v.profile ?? ''} ${v.pix_fmt}`, v.codec_name === 'h264' && v.pix_fmt === 'yuv420p')
fila('tamaño', `${v.width}×${v.height}`, o.tamano ? `${v.width}x${v.height}` === o.tamano : null)
fila('fps', +fps.toFixed(3), o.fps ? Math.abs(fps - Number(o.fps)) < 0.001 : null)
if (o.duracion) {
  const esperados = Math.round(Number(o.duracion) * Number(o.fps ?? fps))
  fila('fotogramas', fotogramas, fotogramas === esperados, `esperados ${esperados}`)
} else fila('fotogramas', fotogramas, null, `${(fotogramas / fps).toFixed(3)} s`)
fila('duración del archivo', `${duracion.toFixed(3)} s`, null)

if (a) {
  fila('audio', `${a.codec_name} ${a.sample_rate} Hz ${a.channels} canales`, a.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2)
  const s = sonoridad(video)
  const lufs = Number(o.lufs ?? -14)
  const pico = Number(o.pico ?? -1)
  fila('sonoridad', `${s.lufs.toFixed(1)} LUFS`, Math.abs(s.lufs - lufs) <= 1, `objetivo ${lufs}`)
  fila('true peak', `${s.pico.toFixed(1)} dBTP`, s.pico <= pico + 0.1, `≤ ${pico}`)
} else fila('audio', 'no tiene', false)

// faststart: el índice (moov) va antes de los datos (mdat), para que el vídeo empiece a sonar sin bajarlo entero.
{
  const fd = openSync(video, 'r')
  const buf = Buffer.alloc(1 << 20)
  const n = readSync(fd, buf, 0, buf.length, 0)
  closeSync(fd)
  const cab = buf.subarray(0, n)
  const moov = cab.indexOf('moov')
  const mdat = cab.indexOf('mdat')
  fila('faststart', moov >= 0 && (mdat < 0 || moov < mdat) ? 'sí' : 'no', moov >= 0 && (mdat < 0 || moov < mdat))
}

// Cuadros negros y primer fotograma vacío.
{
  const err = ffmpeg(['-i', video, '-map', '0:v:0', '-vf', 'blackdetect=d=0.05:pix_th=0.08', '-an', '-f', 'null', '-'])
  const negros = [...err.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => `${(+m[1]).toFixed(2)}–${(+m[2]).toFixed(2)} s`)
  fila('cuadros negros', negros.length ? negros.join(', ') : 'ninguno', negros.length === 0 || Boolean(o['negro-ok']))
  // Un fotograma vacío es plano: lo más claro y lo más oscuro casi iguales. Se miran el 0 y el de 0,3 s.
  const e2 = ffmpeg(['-i', video, '-map', '0:v:0', '-vf', `select='lt(t\\,0.31)*(eq(n\\,0)+eq(n\\,${Math.round(0.3 * fps)}))',signalstats,metadata=print`, '-an', '-f', 'null', '-'])
  const rangos = [...e2.matchAll(/YMIN=(\d+)[\s\S]*?YMAX=(\d+)/g)].map((m) => Number(m[2]) - Number(m[1]))
  const vacio = rangos.length > 0 && rangos.every((r) => r < 12)
  fila('arranque', vacio ? 'vacío (un color plano)' : 'con imagen', !vacio, 'fotogramas 0 y 0,3 s')
}

const ancho = Math.max(...filas.map((f) => f.que.length))
let mal = 0
for (const f of filas) {
  const marca = f.bien === null ? '·' : f.bien ? '✔' : '✘'
  if (f.bien === false) mal++
  console.log(`${marca} ${f.que.padEnd(ancho)}  ${f.valor}${f.nota ? `  (${f.nota})` : ''}`)
}
console.log(mal ? `\n${mal} cosa(s) fallan en ${video}` : `\nTodo en orden: ${video}`)
process.exit(mal ? 1 : 0)
