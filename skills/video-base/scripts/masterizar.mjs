// Masteriza el audio para redes: −14 LUFS integrados y true peak ≤ −1 dBTP, en WAV de 48 kHz, 24 bits y estéreo.
const USO = `
Uso:
  node masterizar.mjs <entrada> <salida.wav> [--lufs -14] [--pico -1]

La entrada puede ser cualquier archivo con audio (WAV crudo, MP3, un MP4). Ajusta la ganancia y limita el pico con
sobremuestreo (el true peak es entre muestras), mide y repite hasta clavar las dos cifras. Si no las clava, falla.
Quita lo de debajo de 30 Hz: retumbe que el móvil no reproduce y que se come el margen.
`
import { copyFileSync, renameSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { ffmpeg, opciones, sonoridad, uso } from './ffmpeg.mjs'

/**
 * Pone el temporal en su sitio. Si el estudio de Sloth está reproduciendo la salida, Windows no deja renombrar encima
 * (EPERM o EBUSY): se reintenta un momento y, si sigue abierta, se copia encima, que sí se puede, y se borra el temporal.
 */
function reemplazar(tmp, salida) {
  for (let i = 0; ; i++) {
    try {
      return renameSync(tmp, salida)
    } catch (e) {
      if (e.code !== 'EPERM' && e.code !== 'EBUSY') throw e
      if (i === 4) break
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
    }
  }
  copyFileSync(tmp, salida)
  rmSync(tmp, { force: true })
}

const o = opciones()
uso(o, 2, USO)
const entrada = resolve(o._[0])
const salida = resolve(o._[1])
const objetivo = Number(o.lufs ?? -14)
const techo = Number(o.pico ?? -1)

const antes = sonoridad(entrada)
if (!Number.isFinite(antes.lufs)) {
  console.error('La entrada está en silencio: no hay nada que masterizar.')
  process.exit(1)
}

// El limitador va a 192 kHz para ver los picos entre muestras; deja 0,3 dB de margen a la vuelta a 48 kHz.
let ganancia = objetivo - antes.lufs
let limite = techo - 0.3
let medida
const tmp = salida + '.tmp.wav'
for (let i = 0; i < 6; i++) {
  const lin = Math.min(1, Math.max(0.0625, 10 ** (limite / 20)))
  ffmpeg(['-v', 'error', '-i', entrada, '-vn', '-af',
    `highpass=f=30,volume=${ganancia.toFixed(2)}dB,aresample=192000,alimiter=limit=${lin.toFixed(4)}:attack=1:release=60:level=false,aresample=48000:resampler=soxr`,
    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', tmp])
  medida = sonoridad(tmp)
  const faltan = objetivo - medida.lufs
  const sobra = medida.pico - techo
  if (Math.abs(faltan) <= 0.3 && sobra <= 0) break
  // El limitador se come volumen: se sube la ganancia lo que falte; si el pico se pasa, se baja el techo.
  ganancia += faltan
  if (sobra > 0) limite -= sobra + 0.1
}
reemplazar(tmp, salida)
const ok = Math.abs(objetivo - medida.lufs) <= 0.5 && medida.pico <= techo + 0.05
console.log(`${salida}`)
console.log(`antes ${antes.lufs.toFixed(1)} LUFS, pico ${antes.pico.toFixed(1)} dBTP → ahora ${medida.lufs.toFixed(1)} LUFS, pico ${medida.pico.toFixed(1)} dBTP`)
if (!ok) {
  console.error(`No llegó a ${objetivo} LUFS con el pico ≤ ${techo} dBTP. Si la mezcla es muy dinámica, comprímela antes.`)
  process.exit(1)
}
