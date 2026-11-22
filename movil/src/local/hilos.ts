/**
 * Los hilos del modo «Solo en el celular»: viven en el teléfono (`<documentos>/estado/`), no en una computadora. Cada uno
 * guarda los mismos `AgentEvent` que un hilo de Sloth (así se dibuja con `buildTimeline` de la computadora) y la
 * conversación con la API tal cual se mandó, que se añade sin reescribir para que el razonamiento guardado siga valiendo.
 */
import { useSyncExternalStore } from 'react'
import type Anthropic from '@anthropic-ai/sdk'
import { Directory, File, Paths } from 'expo-file-system'
import type { AgentEvent } from '../../../shared/types'
import { borrarCarpeta } from './archivos'

export interface HiloLocal {
  id: string
  cardId: string
  title: string
  model: string
  createdAt: number
  updatedAt: number
  running: boolean
  /** Si su último turno acabó bien. Falta si aún no acabó ninguno. */
  acaboBien?: boolean
  archived?: boolean
}

type Estado = { events: AgentEvent[]; messages: Anthropic.Beta.BetaMessageParam[] }

const dir = () => new Directory(Paths.document, 'estado')
const indice = () => new File(dir(), 'indice.json')
const archivoDe = (id: string) => new File(dir(), `${id}.json`)

let hilos: HiloLocal[] = []
const estados = new Map<string, Estado>()
const oyentesLista = new Set<() => void>()
const oyentesHilo = new Map<string, Set<() => void>>()

const avisarLista = () => oyentesLista.forEach((f) => f())
const avisarHilo = (id: string) => oyentesHilo.get(id)?.forEach((f) => f())

async function escribir(f: File, datos: unknown) {
  if (!dir().exists) dir().create({ intermediates: true, idempotent: true })
  if (!f.exists) f.create()
  await f.write(JSON.stringify(datos))
}

export async function cargarHilos() {
  try {
    hilos = indice().exists ? (JSON.parse(await indice().text()) as HiloLocal[]) : []
    // Un hilo que trabajaba cuando se cerró la app ya no trabaja: su turno se cortó con ella.
    hilos = hilos.map((h) => (h.running ? { ...h, running: false, acaboBien: false } : h))
  } catch {
    hilos = []
  }
  avisarLista()
}

const guardarIndice = () => escribir(indice(), hilos)

/** Mientras el agente escribe llegan muchos eventos: el hilo se guarda como mucho una vez por segundo. */
const pendientes = new Map<string, ReturnType<typeof setTimeout>>()
function guardarPronto(id: string) {
  if (pendientes.has(id)) return
  pendientes.set(id, setTimeout(() => void guardarYa(id), 1000))
}
export async function guardarYa(id: string) {
  clearTimeout(pendientes.get(id))
  pendientes.delete(id)
  const e = estados.get(id)
  if (e) await escribir(archivoDe(id), e)
}

async function estadoDe(id: string): Promise<Estado> {
  const ya = estados.get(id)
  if (ya) return ya
  let e: Estado = { events: [], messages: [] }
  try {
    if (archivoDe(id).exists) e = JSON.parse(await archivoDe(id).text()) as Estado
  } catch { /* Un hilo ilegible se abre vacío. */ }
  estados.set(id, e)
  return e
}

export const hiloLocal = (id: string) => hilos.find((h) => h.id === id)
export const mensajesDe = async (id: string) => (await estadoDe(id)).messages
export const eventosDe = async (id: string) => (await estadoDe(id)).events

export async function crearHilo(h: Omit<HiloLocal, 'createdAt' | 'updatedAt' | 'running'>): Promise<HiloLocal> {
  const ahora = Date.now()
  const nuevo: HiloLocal = { ...h, createdAt: ahora, updatedAt: ahora, running: false }
  hilos = [nuevo, ...hilos]
  estados.set(h.id, { events: [], messages: [] })
  avisarLista()
  await guardarIndice()
  return nuevo
}

export function cambiarHilo(id: string, parte: Partial<HiloLocal>) {
  hilos = hilos.map((h) => (h.id === id ? { ...h, ...parte, updatedAt: parte.updatedAt ?? Date.now() } : h))
  avisarLista()
  void guardarIndice()
}

/** Añade eventos al hilo. Los trozos de un mismo bloque de texto los junta `buildTimeline`, como en Sloth. */
export async function agregar(id: string, ...nuevos: AgentEvent[]) {
  const e = await estadoDe(id)
  e.events = [...e.events, ...nuevos]
  avisarHilo(id)
  guardarPronto(id)
}

/** Añade a la conversación con la API. Nunca se reescribe lo de antes. */
export async function agregarMensajes(id: string, ...m: Anthropic.Beta.BetaMessageParam[]) {
  const e = await estadoDe(id)
  e.messages = [...e.messages, ...m]
  guardarPronto(id)
}

export async function borrarHilo(id: string) {
  hilos = hilos.filter((h) => h.id !== id)
  estados.delete(id)
  avisarLista()
  await guardarIndice()
  if (archivoDe(id).exists) archivoDe(id).delete()
  borrarCarpeta(id)
}

export function useHilosLocales(): HiloLocal[] {
  return useSyncExternalStore(
    (f) => (oyentesLista.add(f), () => oyentesLista.delete(f)),
    () => hilos
  )
}

/** Los eventos de un hilo; `undefined` mientras se leen del teléfono la primera vez. */
export function useEventosLocal(id: string): AgentEvent[] | undefined {
  return useSyncExternalStore(
    (f) => {
      let s = oyentesHilo.get(id)
      if (!s) oyentesHilo.set(id, (s = new Set()))
      s.add(f)
      if (!estados.has(id)) void estadoDe(id).then(() => avisarHilo(id))
      return () => s.delete(f)
    },
    () => estados.get(id)?.events
  )
}
