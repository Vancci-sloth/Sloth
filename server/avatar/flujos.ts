import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VENTA } from '../../shared/venta.ts'
import { guardar } from '../disco.ts'
import type { FlujoApi } from './comfy.ts'

/**
 * Los flujos de ComfyUI con que Sloth sincroniza los labios de un video del personaje con la voz, y qué pide cada uno:
 * los nodos (sus clases, que ComfyUI dice en `/object_info`) y los pesos (con su tamaño exacto, para saber si están
 * enteros). Sloth no baja ni instala nada de esto: cómo hacerlo está en `skills/video-base/AVATAR.md`.
 *
 * Un flujo es un JSON en formato API (`Save (API Format)` de ComfyUI) más un `mapeo`: en qué nodo va el video, la imagen
 * y el audio, y cuál guarda el resultado. `latentsync.json` viene hecho (`flujos/`). MuseTalk, el de respaldo, depende de
 * su nodo, que cambia a menudo: lo exportas de ComfyUI y lo importas en Opciones → Avatar; el mapeo se adivina por el
 * tipo de cada nodo (`mapearFlujo`). Los de `data/avatar/flujos/` mandan sobre los de la app.
 */

export interface Peso {
  url: string
  /** Dónde queda, desde la carpeta de ComfyUI (la que tiene `main.py`). */
  destino: string
  bytes: number
}

export interface FlujoDef {
  id: string
  nombre: string
  vramGB: number
  nota: string
  /** Las clases de nodo que pide, y de qué repositorio sale cada una. */
  nodos: { clase: string; repo: string }[]
  pesos: Peso[]
  flujo: 'incluido' | 'importar'
  licencia: string
  fuente: string
}

const HF = 'https://huggingface.co'
const VHS = { clase: 'VHS_VideoCombine', repo: 'Kosinkadink/ComfyUI-VideoHelperSuite' }

export const FLUJOS: FlujoDef[] = [
  {
    id: 'latentsync',
    nombre: 'LatentSync 1.5',
    vramGB: 8,
    nota: 'Cambia los labios de un video del personaje (o de una foto hecha video quieto) para que digan tu audio. La 1.5 pide 8 GB de VRAM (la 1.6, 18 GB): el nodo trae la 1.6, y con estos pesos corre la 1.5.',
    nodos: [{ clase: 'LatentSyncNode', repo: 'ShmuelRonen/ComfyUI-LatentSyncWrapper' }, VHS],
    pesos: [
      { url: `${HF}/ByteDance/LatentSync-1.5/resolve/main/latentsync_unet.pt`, destino: 'custom_nodes/ComfyUI-LatentSyncWrapper/checkpoints/latentsync_unet.pt', bytes: 5072348184 },
      { url: `${HF}/ByteDance/LatentSync-1.5/resolve/main/whisper/tiny.pt`, destino: 'custom_nodes/ComfyUI-LatentSyncWrapper/checkpoints/whisper/tiny.pt', bytes: 75572083 }
    ],
    flujo: 'incluido',
    licencia: 'LatentSync (ByteDance): Apache-2.0. ComfyUI-VideoHelperSuite: GPL-3.0. Sloth no los trae: los instala el usuario.',
    fuente: 'https://github.com/bytedance/LatentSync'
  },
  {
    id: 'musetalk',
    nombre: 'MuseTalk',
    vramGB: 6,
    nota: 'El de respaldo: más rápido y ligero, algo menos fino. Su nodo cambia a menudo, así que su flujo no viene hecho: abre el ejemplo del nodo en ComfyUI, expórtalo en formato API e impórtalo aquí. La primera vez baja sus pesos solo.',
    nodos: [{ clase: 'muse_talk_sampler', repo: 'kijai/ComfyUI-MuseTalk-KJ' }, VHS],
    pesos: [],
    flujo: 'importar',
    licencia: 'MuseTalk (TMElyralab): MIT; los modelos que usa traen sus propias licencias. ComfyUI-VideoHelperSuite: GPL-3.0.',
    fuente: 'https://github.com/TMElyralab/MuseTalk'
  }
]

export const flujoDe = (id: string) => FLUJOS.find((f) => f.id === id)

/** Si el peso está entero en la carpeta de ComfyUI. */
export const pesoPuesto = (raiz: string, p: Peso) => existsSync(join(raiz, p.destino)) && statSync(join(raiz, p.destino)).size === p.bytes

// ── El JSON de cada flujo ─────────────────────────────────────────────────────────────────────────────────────────

export interface Mapeo {
  video?: { nodo: string; campo: string }
  imagen?: { nodo: string; campo: string }
  audio?: { nodo: string; campo: string }
  semilla?: { nodo: string; campo: string }
  /** El nodo que guarda el video (el que sale en `/history`). */
  salida: string
}

export interface FlujoGuardado {
  nombre?: string
  nota?: string
  mapeo: Mapeo
  prompt: FlujoApi
}

// Compilada (`scripts/compilar.mjs`), el servidor va en un solo archivo, server/index.mjs, y los flujos a su lado.
const AQUI = VENTA ? join(dirname(fileURLToPath(import.meta.url)), 'avatar') : dirname(fileURLToPath(import.meta.url))

/** Adivina el mapeo de un flujo API por el tipo de sus nodos. `null` si no encuentra dónde poner el audio o dónde sale. */
export function mapearFlujo(prompt: FlujoApi): Mapeo | null {
  const nodos = Object.entries(prompt)
  const campo = (tipos: RegExp, nombre: string) => {
    const n = nodos.find(([, v]) => tipos.test(v.class_type) && nombre in v.inputs)
    return n ? { nodo: n[0], campo: nombre } : undefined
  }
  const audio = campo(/^(LoadAudio|VHS_LoadAudio(Upload)?)$/, 'audio')
  const salida = nodos.find(([, v]) => /^(VHS_VideoCombine|SaveVideo|SaveWEBM|SaveAnimatedWEBP)$/.test(v.class_type))?.[0]
  if (!audio || !salida) return null
  const semilla = nodos.find(([, v]) => typeof v.inputs.seed === 'number')
  return {
    video: campo(/^(VHS_LoadVideo|LoadVideo)$/, 'video'),
    imagen: campo(/^LoadImage$/, 'image'),
    audio,
    semilla: semilla ? { nodo: semilla[0], campo: 'seed' } : undefined,
    salida
  }
}

/** Si `x` es un flujo en formato API: nodos con `class_type` e `inputs`. La interfaz de ComfyUI exporta otro (`nodes`, `links`). */
export function esFlujoApi(x: unknown): x is FlujoApi {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false
  const v = Object.values(x as object)
  return v.length > 0 && v.every((n) => !!n && typeof n === 'object' && typeof (n as { class_type?: unknown }).class_type === 'string' && typeof (n as { inputs?: unknown }).inputs === 'object')
}

/** El flujo de `id`: el que importaste (en `carpeta`, `data/avatar/flujos`) o el que trae la app. `null` si aún no hay. */
export function leerFlujo(id: string, carpeta: string): FlujoGuardado | null {
  for (const archivo of [join(carpeta, `${id}.json`), join(AQUI, 'flujos', `${id}.json`)]) {
    if (!existsSync(archivo)) continue
    try {
      const g = JSON.parse(readFileSync(archivo, 'utf8')) as Partial<FlujoGuardado> & FlujoApi
      if (g.mapeo && g.prompt) return g as FlujoGuardado
      // Un flujo API pelado (lo que baja `Save (API Format)`) vale tal cual.
      if (esFlujoApi(g)) {
        const mapeo = mapearFlujo(g)
        if (mapeo) return { mapeo, prompt: g }
      }
    } catch {
      // Uno roto es como si no estuviera: se mira el siguiente.
    }
  }
  return null
}

/** Importa el flujo API que exportaste para `id`. Dice qué falta si no encuentra dónde poner el audio. */
export function importarFlujo(id: string, texto: string, carpeta: string): FlujoGuardado {
  const f = flujoDe(id)
  if (!f) throw new Error(`No conozco el flujo «${id}».`)
  let json: unknown
  try {
    json = JSON.parse(texto)
  } catch {
    throw new Error('Ese archivo no es un JSON.')
  }
  const dado = json as Partial<FlujoGuardado>
  const prompt = dado.prompt && dado.mapeo ? dado.prompt : json
  if (!esFlujoApi(prompt)) throw new Error('Ese JSON es el de la interfaz de ComfyUI: ábrelo en ComfyUI y expórtalo con «Save (API Format)» (si no sale, activa «Dev mode options» en sus ajustes).')
  const mapeo = dado.mapeo ?? mapearFlujo(prompt)
  if (!mapeo) throw new Error('No encuentro en ese flujo un nodo LoadAudio (el audio) y uno que guarde el video (VHS_VideoCombine o SaveVideo).')
  if (!mapeo.video && !mapeo.imagen) throw new Error('El flujo no tiene dónde poner el video (VHS_LoadVideo) ni la imagen (LoadImage) del personaje.')
  mkdirSync(carpeta, { recursive: true })
  const g: FlujoGuardado = { nombre: f.nombre, mapeo, prompt }
  guardar(join(carpeta, `${id}.json`), JSON.stringify(g))
  return g
}

/** Una copia del flujo con el video, la imagen, el audio y una semilla nueva. */
export function prepararFlujo(g: FlujoGuardado, entradas: { video?: string; imagen?: string; audio: string }): FlujoApi {
  const copia = structuredClone(g.prompt)
  const poner = (d: { nodo: string; campo: string } | undefined, valor: string | number, que: string) => {
    if (!d || !copia[d.nodo]) throw new Error(`Este flujo no tiene dónde poner ${que}.`)
    copia[d.nodo].inputs[d.campo] = valor
  }
  poner(g.mapeo.audio, entradas.audio, 'el audio')
  if (entradas.video) poner(g.mapeo.video, entradas.video, 'el video')
  if (entradas.imagen) poner(g.mapeo.imagen, entradas.imagen, 'la imagen')
  if (g.mapeo.semilla) poner(g.mapeo.semilla, Math.floor(Math.random() * 2 ** 31), 'la semilla')
  return copia
}
