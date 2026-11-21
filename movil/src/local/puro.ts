/**
 * Lo del agente del celular que no toca el teléfono ni la red: los modelos y lo que cuestan, las instrucciones que
 * recibe, cómo se ve una búsqueda en la web y qué rutas puede tocar. Lo prueba `puro.test.ts` sin el celular.
 */
import { OPCIONES, UN_VIDEO_POR_HILO } from '../../../shared/instrucciones'

/** Los modelos del modo celular: los de la API de Anthropic, con sus precios por millón de tokens (noviembre de 2026). */
export const MODELOS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', detalle: 'El mejor: guiones y dudas difíciles', entrada: 4, salida: 20, cacheLeida: 0.2, busquedaNueva: true },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', detalle: 'Rápido y bueno, cuesta la mitad', entrada: 2, salida: 10, cacheLeida: 0.1, busquedaNueva: true },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', detalle: 'El más barato, para ideas rápidas', entrada: 0.1, salida: 0.5, cacheLeida: 0.01, busquedaNueva: false }
] as const
export type ModeloLocal = (typeof MODELOS)[number]['id']
export const MODELO_POR_DEFECTO: ModeloLocal = 'claude-opus-5-5'
export const modeloDe = (id: string) => MODELOS.find((m) => m.id === id) ?? MODELOS[0]

/** Una búsqueda en la web cuesta 10 dólares cada mil. */
const POR_BUSQUEDA = 0.01

export interface Uso {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
  server_tool_use?: { web_search_requests?: number | null } | null
}

/** Lo que costó una respuesta, en dólares: escribir en la caché cuesta 1,25 veces la entrada y leerla, su precio aparte. */
export function costoDe(modelo: string, u: Uso): number {
  const m = modeloDe(modelo)
  const millon = 1_000_000
  return (
    (u.input_tokens * m.entrada +
      (u.cache_creation_input_tokens ?? 0) * m.entrada * 1.25 +
      (u.cache_read_input_tokens ?? 0) * m.cacheLeida +
      u.output_tokens * m.salida) /
      millon +
    (u.server_tool_use?.web_search_requests ?? 0) * POR_BUSQUEDA
  )
}

/** Una ruta que dio el agente, en partes y dentro de la carpeta del hilo; `null` si intenta salirse. */
export function rutaSegura(ruta: string): string[] | null {
  if (/^([a-z]:|[\\/])/i.test(ruta.trim())) return null
  const partes = ruta.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.')
  if (!partes.length || partes.some((p) => p === '..')) return null
  return partes
}

/** Lo que se ve de una búsqueda o una página leída: los títulos con su enlace, o el error. */
export function resumenWeb(contenido: unknown): { texto: string; error: boolean } {
  if (Array.isArray(contenido)) {
    const lineas = contenido.map((r: any) => `${r?.title ?? 'Sin título'} · ${r?.url ?? ''}`)
    return { texto: lineas.join('\n') || 'Sin resultados', error: false }
  }
  const c = contenido as any
  if (c?.type?.endsWith?.('error')) return { texto: `No se pudo: ${c.error_code ?? 'error'}`, error: true }
  if (c?.url) return { texto: `${c.document?.title ?? c.url}\n${c.url}`, error: false }
  return { texto: '', error: false }
}

export interface EstiloLocal {
  id: string
  title: string
  description: string
  icon?: string
  version?: string
  voz?: false | { propia: string }
  musica?: boolean
  guia?: { das: string; entrega: string; ejemplo: string; necesita?: string }
  etapas: { nombre: string; fase?: string; espera?: string }[]
  skill: string
  instrucciones: string
}

/**
 * Las instrucciones del agente del celular: siempre iguales para un estilo, así la API las guarda en su caché y cada
 * mensaje cuesta menos. Lo que cambia (lo que pides) va en el mensaje.
 */
export function instrucciones(estilo: EstiloLocal | undefined, sobreTi: string): string {
  return [
    `Eres el agente de Sloth, una app que hace videos, y trabajas en el celular de quien la usa, sin computadora. Aquí no hay terminal, Python, FFmpeg, Remotion ni navegador: tienes la búsqueda en la web (web_search y web_fetch) y los archivos de la carpeta de este hilo (escribir_archivo, leer_archivo, listar_archivos), con rutas relativas a ella.`,
    estilo
      ? `Sigue el estilo «${estilo.title}» (abajo, su skill completa) en todo lo que no necesita correr programas: entender el pedido, investigar con fuentes primarias, escribir el guion y lo demás que la skill pide escribir, con sus mismos nombres de archivo (guion.md, fuentes/investigacion.md, momentos.json…), y revisarlo con la misma vara. Cuando el siguiente paso pida correr un script, renderizar, generar voz o imágenes, o una herramienta que aquí no hay, no lo simules ni inventes su resultado: dilo en una línea y termina el turno. Quien usa Sloth toca «Seguir en la computadora» y su computadora sigue desde ahí con estos archivos.`
      : `Ayuda con lo que te pidan sobre sus videos: ideas, investigación con fuentes y guiones, en archivos de la carpeta del hilo.`,
    `Lo que el usuario adjunta queda en adjuntos/ de la carpeta: las fotos las ves; su voz grabada (.m4a) no la puedes oír, pero la computadora la usará.`,
    `Escribe en español, claro y breve: lo lee en el celular.`,
    OPCIONES,
    UN_VIDEO_POR_HILO.replace('con «Nuevo chat» arriba a la izquierda y la card del estilo', 'desde Inicio con la card del estilo'),
    sobreTi.trim() ? `<sobre_quien_usa_sloth>\n${sobreTi.trim()}\n</sobre_quien_usa_sloth>` : '',
    estilo ? `<estilo nombre="${estilo.title}">\n${estilo.instrucciones}\n</estilo>` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}
