// Lo que comparten los scripts de la base: correr FFmpeg y FFprobe, leer la sonoridad y las opciones de la línea de
// comandos. Sin dependencias: solo Node y FFmpeg en el PATH.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

/** Corre FFmpeg y devuelve su salida de errores (ahí escribe sus medidas). Falla si FFmpeg falla. */
export function ffmpeg(args) {
  // -nostdin: dentro de un ciclo de la shell, FFmpeg se come la entrada del ciclo.
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024
  })
  if (r.error) throw new Error(`No pude lanzar FFmpeg: ${r.error.message}. ¿Está en el PATH?`)
  if (r.status !== 0) throw new Error(`FFmpeg falló:\n${r.stderr.slice(-3000)}`)
  return r.stderr
}

/** Un FFmpeg que recibe por la entrada (imágenes por tubería). Devuelve el proceso y una promesa de su fin. */
export function ffmpegTubo(args) {
  const p = spawn('ffmpeg', ['-hide_banner', '-y', '-v', 'error', ...args], { stdio: ['pipe', 'inherit', 'inherit'] })
  const fin = new Promise((ok, mal) => p.on('close', (c) => (c === 0 ? ok() : mal(new Error(`FFmpeg salió con ${c}`)))))
  return { p, fin }
}

/** Escribe en la tubería respetando la contrapresión. */
export async function escribir(p, buf) {
  if (!p.stdin.write(buf)) await new Promise((r) => p.stdin.once('drain', r))
}

/** FFprobe en JSON: formato y pistas. */
export function probar(archivo, extra = []) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', ...extra, archivo], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  if (r.status !== 0) throw new Error(`FFprobe no pudo leer ${archivo}:\n${r.stderr}`)
  return JSON.parse(r.stdout)
}

/**
 * Sonoridad integrada (LUFS) y true peak (dBTP) con `ebur128`, que es la medida de las plataformas. Una sola medida para
 * toda la base: antes cada script medía a su manera.
 */
export function sonoridad(archivo) {
  const err = ffmpeg(['-i', archivo, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'])
  const resumen = err.slice(err.lastIndexOf('Summary:'))
  const i = /I:\s+(-?[\d.]+|-inf) LUFS/.exec(resumen)?.[1]
  const tp = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(resumen)?.[1]
  const num = (s) => (s === undefined || s === '-inf' ? -Infinity : Number(s))
  return { lufs: num(i), pico: num(tp) }
}

/** Ruta para `drawtext` en Windows: los dos puntos de `C:` rompen el filtro si no se escapan. */
export const rutaFiltro = (ruta) => ruta.replaceAll('\\', '/').replace(/^([A-Za-z]):/, '$1\\:')

/** Arial, la de Mac o, en Linux, la que se le parece (Liberation Sans) o DejaVu, que traen casi todos. */
export const FUENTE = rutaFiltro(
  [
    'C:/Windows/Fonts/arial.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
  ].find((f) => existsSync(f)) ?? 'C:/Windows/Fonts/arial.ttf'
)

/**
 * Opciones `--clave valor` y `--bandera`; lo demás son posicionales. `--clave=valor` también vale.
 * Devuelve `{ _: [posicionales], clave: valor | true }`.
 */
export function opciones(argv = process.argv.slice(2)) {
  const o = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      o._.push(a)
      continue
    }
    const [k, v] = a.slice(2).split(/=(.*)/s)
    if (v !== undefined) o[k] = v
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) o[k] = argv[++i]
    else o[k] = true
  }
  return o
}

/** Sale con el texto de uso si faltan posicionales. */
export function uso(o, n, texto) {
  if (o._.length < n || o.ayuda || o.help) {
    console.error(texto.trim())
    process.exit(2)
  }
}
