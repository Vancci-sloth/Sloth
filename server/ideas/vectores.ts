import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { esOutlier, idiomaDe } from '../../shared/ideas.ts'
import type { Temas, Transcripcion, VideoYT } from '../../shared/types.ts'
import { guardar } from '../disco.ts'
import { rutaPythonSloth } from '../requisitos.ts'
import type { Ctx } from './investigar.ts'
import { enLineas } from './resumen.ts'
import { Detenido } from './youtube.ts'

/**
 * Cada video de la investigación convertido en un vector de lo que dice (su título o descripción y su transcripción), con
 * un modelo multilingüe local (`python/procesos/vectores.py`): así se agrupan por tema aunque usen otras palabras u otro
 * idioma, se ve si lo que funciona en inglés ya existe en español y se buscan videos parecidos. En la carpeta del canal:
 *
 * - `vectores.bin`: los vectores en float32, una fila por video;
 * - `vectores.json`: su índice, con el modelo, el tamaño de cada vector, el id de cada fila y la huella de su texto (el
 *   que cambia, porque llegó su transcripción, se vuelve a vectorizar; los demás no);
 * - `temas.json`: los temas (`Temas`).
 *
 * Son un extra: sin el Python de Sloth, o si el modelo no se puede bajar (la primera vez, unos 490 MB), un paso lo dice y
 * la investigación sigue.
 */

const PROCESOS = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'python', 'procesos')
const MODELOS = join(process.env.APPDATA ?? '', 'youtube', 'modelos')
/** El modelo de `vectores.py` (`MODELO`): unos vectores de otro no se mezclan con los suyos. */
const MODELO = 'intfloat/multilingual-e5-small@614241f6'
/** De la descripción y de la transcripción se toman tantas palabras: e5 lee hasta 512 tokens. */
const PALABRAS_TITULO = 150
const PALABRAS_DICHO = 400
/** Bajar el modelo la primera vez y vectorizar en el procesador pueden tardar; más que esto, algo se trabó. */
const PLAZO = 20 * 60_000

interface Indice {
  modelo: string
  dim: number
  /** El video de cada fila de `vectores.bin`. */
  ids: string[]
  /** La huella del texto con que se vectorizó cada fila. */
  huellas: string[]
}

/** La transcripción de un video, si ya la tiene. */
export function transcripcion(carpeta: string, id: string): Transcripcion | null {
  try {
    return JSON.parse(readFileSync(join(carpeta, 'transcripciones', `${id}.json`), 'utf8')) as Transcripcion
  } catch {
    return null
  }
}

/** Las primeras `n` palabras de un texto, en una línea. */
function palabras(texto: string, n: number) {
  const ps = texto.split(/\s+/).filter(Boolean)
  return ps.slice(0, n).join(' ')
}

/**
 * Lo que dice un video: su título o descripción y lo que se habla en él, o solo el título si no hay transcripción. Y su
 * idioma: el que se habla, si se transcribió con voz; si no, el de su texto.
 */
function dicho(carpeta: string, v: VideoYT): { texto: string; idioma?: string } {
  const t = transcripcion(carpeta, v.id)
  const habla = t?.texto ? palabras(t.texto, PALABRAS_DICHO) : ''
  const texto = [palabras(v.titulo, PALABRAS_TITULO), habla].filter(Boolean).join('\n')
  return { texto, idioma: (t?.segmentos.length ? t.idioma : undefined) ?? v.idioma ?? idiomaDe(texto) }
}

const huella = (texto: string) => createHash('sha1').update(texto).digest('hex').slice(0, 12)

/** Los float32 de un archivo. Copiados: un archivo chico llega en un trozo del búfer que Node comparte. */
const floats = (archivo: string) => {
  const b = readFileSync(archivo)
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length))
}

/** 1900 → «1.900». */
const num = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** El índice y sus vectores, si son de este modelo y cuadran entre sí; si no, vacíos: se vectoriza todo de nuevo. */
function leerVectores(carpeta: string): { indice: Indice; filas: Float32Array } {
  try {
    const indice = JSON.parse(readFileSync(join(carpeta, 'vectores.json'), 'utf8')) as Indice
    const filas = floats(join(carpeta, 'vectores.bin'))
    if (indice.modelo === MODELO && indice.huellas.length === indice.ids.length && filas.length === indice.ids.length * indice.dim) return { indice, filas }
  } catch {}
  return { indice: { modelo: MODELO, dim: 0, ids: [], huellas: [] }, filas: new Float32Array(0) }
}

/**
 * Vectoriza los `videos` que aún no tienen vector o cuyo texto cambió, y vuelve a agrupar en temas todos los `videos` (los
 * del perfil de hoy). Los pasos dicen qué hizo. Si Python o el modelo fallan, un paso lo dice, `temas.json` se queda como
 * estaba y no lanza nada; solo `Detenido`, si se detiene la investigación.
 */
export async function vectorizar(carpeta: string, videos: VideoYT[], ctx: Pick<Ctx, 'paso' | 'avance' | 'signal'>): Promise<void> {
  const python = rutaPythonSloth()
  if (!python) return void ctx.paso('temas', 'Sin el Python de Sloth no agrupo los videos por tema.', 'Instálalo en Opciones, en lo que necesitan los estilos.')
  ctx.avance(0, 1, 'Temas · lo que dice cada video')
  const textos = videos.map((v) => ({ v, ...dicho(carpeta, v) })).filter((t) => t.texto)
  let { indice, filas } = leerVectores(carpeta)
  const fila = new Map(indice.ids.map((id, i) => [id, i]))
  const faltan = textos.flatMap((t) => {
    const h = huella(t.texto)
    const i = fila.get(t.v.id)
    return i === undefined || indice.huellas[i] !== h ? [{ ...t, huella: h }] : []
  })
  const tmp = mkdtempSync(join(tmpdir(), 'sloth-vectores-'))
  try {
    if (faltan.length) {
      const fase = `Temas · vectorizando ${num(faltan.length)} videos`
      ctx.avance(0, faltan.length, fase)
      const entrada = join(tmp, 'textos.jsonl')
      const salida = join(tmp, 'vectores.bin')
      writeFileSync(entrada, faltan.map((t) => JSON.stringify({ id: t.v.id, texto: t.texto })).join('\n') + '\n')
      const r = await vectoresPy<{ dim: number; modelo: string }>(python, [entrada], { modo: 'vectorizar', salida, modelos: MODELOS }, ctx.signal, {
        avance: (f) => ctx.avance(Math.round(f * faltan.length), faltan.length, fase),
        // La primera vez baja el modelo antes de empezar: unos minutos sin avance.
        linea: (l) => {
          if (!l.startsWith('Bajando el modelo de vectores')) return
          ctx.paso('temas', 'Bajo el modelo de vectores (unos 490 MB): solo la primera vez, tarda unos minutos.')
          ctx.avance(0, faltan.length, 'Temas · bajando el modelo de vectores')
        }
      })
      // Lo nuevo reemplaza su fila, y lo que no tenía fila va al final.
      const nuevos = floats(salida)
      const total = new Set([...indice.ids, ...faltan.map((t) => t.v.id)]).size
      const juntas = new Float32Array(total * r.dim)
      juntas.set(filas)
      indice = { modelo: r.modelo, dim: r.dim, ids: [...indice.ids], huellas: [...indice.huellas] }
      for (const [k, t] of faltan.entries()) {
        let i = fila.get(t.v.id)
        if (i === undefined) fila.set(t.v.id, (i = indice.ids.push(t.v.id) - 1))
        indice.huellas[i] = t.huella
        juntas.set(nuevos.subarray(k * r.dim, (k + 1) * r.dim), i * r.dim)
      }
      filas = juntas
      // Primero los vectores y luego el índice: si se corta en medio, no cuadran y la vuelta siguiente vectoriza todo. Como
      // `guardar()`, por un temporal; si Windows no deja reemplazarlo (el antivirus lo tiene abierto), va directo.
      const bin = join(carpeta, 'vectores.bin')
      const datos = Buffer.from(filas.buffer, filas.byteOffset, filas.byteLength)
      writeFileSync(`${bin}.tmp`, datos)
      try {
        renameSync(`${bin}.tmp`, bin)
      } catch {
        writeFileSync(bin, datos)
        rmSync(`${bin}.tmp`, { force: true })
      }
      guardar(join(carpeta, 'vectores.json'), JSON.stringify(indice))
    }

    ctx.avance(0, 1, 'Temas · agrupando')
    const conVector = textos.filter((t) => fila.has(t.v.id))
    const metadatos = join(tmp, 'videos.jsonl')
    writeFileSync(
      metadatos,
      conVector.map((t) => JSON.stringify({ fila: fila.get(t.v.id), id: t.v.id, cuenta: t.v.canalId, idioma: t.idioma, outlier: esOutlier(t.v), x: t.v.x, texto: t.texto })).join('\n') + '\n'
    )
    const temas = await vectoresPy<Temas>(python, [metadatos, join(carpeta, 'vectores.bin')], { modo: 'temas' }, ctx.signal)
    guardar(join(carpeta, 'temas.json'), enLineas(temas) + '\n')
    ctx.avance(1, 1, 'Temas listos')
    if (!temas.temas.length) return void ctx.paso('temas', `Muy pocos videos para agrupar por tema (${conVector.length}).`)
    const conTema = temas.temas.reduce((n, t) => n + t.ids.length, 0)
    const otros = Object.values(temas.enEspanol)
    const sinEspanol = otros.filter((ps) => !ps.length).length
    ctx.paso(
      'temas',
      `${temas.temas.length} temas en ${num(conTema)} videos`,
      [
        `Los más grandes: ${temas.temas
          .slice(0, 3)
          .map((t) => `«${t.nombre}» (${t.ids.length})`)
          .join(', ')}.`,
        otros.length && `De ${otros.length} outliers en otros idiomas, ${sinEspanol} aún no ${sinEspanol === 1 ? 'tiene' : 'tienen'} nada parecido en español.`
      ]
        .filter(Boolean)
        .join(' ')
    )
  } catch (e) {
    if (e instanceof Detenido || ctx.signal.aborted) throw new Detenido('Detenida')
    ctx.paso('error', 'No pude agrupar los videos por tema: se intenta otra vez en la próxima vuelta.', (e as Error).message)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/**
 * Los `n` videos más parecidos a uno de la investigación (`id`, con su vector, sin Python) o a un texto (se vectoriza como
 * búsqueda, con una llamada a Python de unos segundos), del más parecido al menos. La similitud es el coseno de los
 * vectores de e5: casi nada baja de 0,75, y lo que habla de lo mismo suele pasar de 0,85. Con `entre`, solo esos videos.
 */
export async function parecidos(
  carpeta: string,
  consulta: { id?: string; texto?: string },
  n = 10,
  o: { entre?: Set<string>; signal?: AbortSignal } = {}
): Promise<{ id: string; similitud: number }[]> {
  const { indice, filas } = leerVectores(carpeta)
  if (!indice.ids.length) throw new Error('Este canal aún no tiene vectores: se hacen al investigar.')
  const dim = indice.dim
  let q: Float32Array
  if (consulta.id) {
    const i = indice.ids.indexOf(consulta.id)
    if (i < 0) throw new Error(`El video ${consulta.id} aún no tiene vector: se hace al investigar.`)
    q = filas.subarray(i * dim, (i + 1) * dim)
  } else if (consulta.texto?.trim()) {
    const python = rutaPythonSloth()
    if (!python) throw new Error('Sin el Python de Sloth no puedo vectorizar el texto: busca con el id de un video.')
    const tmp = mkdtempSync(join(tmpdir(), 'sloth-vectores-'))
    try {
      const entrada = join(tmp, 'consulta.jsonl')
      const salida = join(tmp, 'consulta.bin')
      writeFileSync(entrada, JSON.stringify({ id: 'consulta', texto: consulta.texto.trim() }) + '\n')
      await vectoresPy(python, [entrada], { modo: 'vectorizar', tipo: 'query', salida, modelos: MODELOS }, o.signal ?? new AbortController().signal)
      q = floats(salida)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  } else throw new Error('Falta qué buscar: un texto o el id de un video.')

  const hallados: { id: string; similitud: number }[] = []
  for (const [i, id] of indice.ids.entries()) {
    if (id === consulta.id || (o.entre && !o.entre.has(id))) continue
    let s = 0
    for (let k = 0, base = i * dim; k < dim; k++) s += filas[base + k] * q[k]
    hallados.push({ id, similitud: Math.round(s * 1000) / 1000 })
  }
  return hallados.sort((a, b) => b.similitud - a.similitud).slice(0, n)
}

/**
 * Corre `vectores.py` con el Python de Sloth y sus banderas, y devuelve su respuesta. `avance` recibe lo que lleva, de 0 a
 * 1, y `linea`, cada línea que no es de avance (avisos). Si falla, con su última línea de error; si se detiene la
 * investigación, lo mata.
 */
function vectoresPy<T>(
  python: string,
  files: string[],
  options: Record<string, unknown>,
  signal: AbortSignal,
  o: { avance?: (f: number) => void; linea?: (l: string) => void } = {}
): Promise<T> {
  return new Promise((ok, mal) => {
    if (signal.aborted) return mal(new Detenido('Detenida'))
    const p = spawn(python, ['-E', '-s', '-B', '-X', 'utf8', 'vectores.py'], { cwd: PROCESOS, windowsHide: true })
    let out = ''
    let resto = ''
    let ultima = ''
    let vencido = false
    const leer = (linea: string) => {
      const l = linea.trim()
      const m = /^@progreso ([\d.]+)/.exec(l)
      if (m) return o.avance?.(Number(m[1]))
      if (!l) return
      ultima = l
      o.linea?.(l)
    }
    p.stdout.setEncoding('utf8').on('data', (d) => (out += d))
    p.stderr.setEncoding('utf8').on('data', (d: string) => {
      const lineas = (resto + d).split(/\r?\n/)
      resto = lineas.pop() ?? ''
      lineas.forEach(leer)
    })
    const matar = () => p.kill()
    signal.addEventListener('abort', matar, { once: true })
    const reloj = setTimeout(() => ((vencido = true), matar()), PLAZO)
    const fin = () => (clearTimeout(reloj), signal.removeEventListener('abort', matar))
    p.on('error', (e) => (fin(), mal(e)))
    p.on('close', (code) => {
      fin()
      leer(resto)
      if (signal.aborted) return mal(new Detenido('Detenida'))
      if (vencido) return mal(new Error(`vectores.py tardó más de ${PLAZO / 60_000} minutos.`))
      if (code !== 0) return mal(new Error(ultima || `vectores.py salió con ${code}.`))
      let r: T & { modelo?: string }
      try {
        r = JSON.parse(out)
      } catch {
        return mal(new Error('vectores.py no devolvió lo esperado.'))
      }
      if (r.modelo !== undefined && r.modelo !== MODELO) return mal(new Error(`vectores.py usa ${r.modelo} y vectores.ts espera ${MODELO}: pon el mismo en los dos.`))
      ok(r)
    })
    p.stdin.on('error', () => {})
    p.stdin.end(JSON.stringify({ files, options }))
  })
}
