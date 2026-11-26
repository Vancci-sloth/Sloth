import { closeSync, createReadStream, mkdirSync, openSync, readFileSync, readSync, rmSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'
import { gzip, gunzip, gunzipSync } from 'node:zlib'
import type { AgentEvent } from '../shared/types.ts'
import { guardar } from './disco.ts'

type Usuario = Extract<AgentEvent, { t: 'user' }>

/**
 * El primer mensaje del usuario de un registro, leído desde el principio hasta dar con él (casi siempre es la primera
 * línea). Ideas y Mejoras unen los hilos por ese mensaje: cargar entero el historial de cada uno, unos 400 MB, congelaba
 * el servidor medio segundo al abrirlas.
 */
export function primerUsuario(file: string): Usuario | undefined {
  let fd: number
  try {
    fd = openSync(file, 'r')
  } catch {
    return undefined
  }
  const leer = (linea: Buffer): Usuario | undefined => {
    try {
      const e = JSON.parse(linea.toString()) as AgentEvent
      return e.t === 'user' ? e : undefined
    } catch {
      return undefined // una línea dañada no tapa las siguientes
    }
  }
  try {
    const trozo = Buffer.alloc(64 * 1024)
    let resto = Buffer.alloc(0)
    for (let n; (n = readSync(fd, trozo)); ) {
      resto = Buffer.concat([resto, trozo.subarray(0, n)])
      for (let fin; (fin = resto.indexOf(10)) !== -1; resto = resto.subarray(fin + 1)) {
        const e = leer(resto.subarray(0, fin))
        if (e) return e
      }
    }
    return leer(resto)
  } finally {
    closeSync(fd)
  }
}

const comprimir = promisify(gzip)
const descomprimir = promisify(gunzip)
const MINIMO_PARA_COMPRIMIR = 64 * 1024
let comprimiendo = false

function vistaValida(texto: string, fuente: { size: number; mtimeMs: number }) {
  const vista = JSON.parse(texto)
  if (vista.version === 1 && vista.bytes === fuente.size && vista.mtime === fuente.mtimeMs && Array.isArray(vista.events))
    return vista as { events: AgentEvent[]; terminado?: boolean }
}

export function leerVistaSync(vista: string, fuente: { size: number; mtimeMs: number }) {
  try { return vistaValida(readFileSync(vista, 'utf8'), fuente) }
  catch { /* Puede estar comprimida. */ }
  try { return vistaValida(gunzipSync(readFileSync(vista + '.gz')).toString(), fuente) }
  catch { return undefined }
}

async function guardarVista(file: string, vista: string, fuente: { size: number; mtimeMs: number }, texto: string, soloComprimida = false) {
  try {
    const bytes = Buffer.byteLength(texto)
    let comprimida: Buffer | undefined
    if (bytes >= MINIMO_PARA_COMPRIMIR && !comprimiendo) {
      comprimiendo = true
      try { comprimida = await comprimir(texto, { level: 1 }) }
      finally { comprimiendo = false }
    }
    // El hilo puede haber cambiado o desaparecido mientras se comprimía.
    const actual = statSync(file, { throwIfNoEntry: false })
    if (actual?.size !== fuente.size || actual.mtimeMs !== fuente.mtimeMs) return
    mkdirSync(dirname(vista), { recursive: true })
    if (comprimida && comprimida.length < bytes) {
      guardar(vista + '.gz', comprimida)
      rmSync(vista, { force: true })
    } else if (!soloComprimida) {
      guardar(vista, texto)
      rmSync(vista + '.gz', { force: true })
    }
  } catch { /* El historial sigue disponible aunque no se pueda guardar su caché. */ }
}

/** Vista regenerable del JSONL: solo la última salida de cada herramienta, con los mismos índices que el original. */
const lecturas = new Map<string, Promise<AgentEvent[]>>()
export function leerHistorial(file: string, vista: string): Promise<AgentEvent[]> {
  const previa = lecturas.get(file)
  if (previa) return previa
  const lectura = construir(file, vista).finally(() => lecturas.delete(file))
  lecturas.set(file, lectura)
  return lectura
}

async function construir(file: string, vista: string): Promise<AgentEvent[]> {
  const fuente = await stat(file).catch((e) => { if (e.code === 'ENOENT') return undefined; throw e })
  if (!fuente) return []
  try {
    const texto = await readFile(vista, 'utf8')
    const guardada = vistaValida(texto, fuente)
    if (guardada) {
      if (texto.length >= MINIMO_PARA_COMPRIMIR) void guardarVista(file, vista, fuente, texto, true)
      return guardada.events
    }
  } catch { /* Puede estar comprimida. */ }
  try {
    const texto = (await descomprimir(await readFile(vista + '.gz'))).toString()
    const guardada = vistaValida(texto, fuente)
    if (guardada) return guardada.events
  } catch { /* Sin vista válida se reconstruye del registro original. */ }
  const events: AgentEvent[] = []
  const salidas = new Map<string, number[]>()
  const input = createReadStream(file)
  let terminado = false
  input.on('data', (chunk: Buffer) => { terminado = chunk[chunk.length - 1] === 10 })
  const lines = createInterface({ input, crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line) continue
    let e: AgentEvent
    try { e = JSON.parse(line) }
    catch { continue } // Una línea incompleta no impide leer el resto.
    if (e.t === 'tool_update' && (e.output !== undefined || e.delta !== undefined)) {
      const anteriores = salidas.get(e.id) ?? []
      if (e.output !== undefined) {
        for (const i of anteriores) {
          const previo = events[i] as Extract<AgentEvent, { t: 'tool_update' }>
          const { output: _, delta: __, ...resto } = previo
          events[i] = resto
        }
        salidas.set(e.id, [events.length])
      } else { anteriores.push(events.length); salidas.set(e.id, anteriores) }
    }
    events.push(e)
  }
  void guardarVista(file, vista, fuente, JSON.stringify({ version: 1, bytes: fuente.size, mtime: fuente.mtimeMs, terminado, events }))
  return events
}
