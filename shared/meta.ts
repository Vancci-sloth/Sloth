/**
 * Meta Muse (`server/meta/`): lo que comparten el servidor, su MCP y la interfaz. Muse no tiene modelos ni opciones que
 * elegir: es un agente de chat, y lo que se le pide (la proporción, de qué imagen parte) va dicho en el mensaje.
 */

export const URL_MUSE = 'https://muse.ai/'

/** Las proporciones que se le piden; Muse respeta las que se dicen con «exactamente» (lo probó useapi.net). */
export const FORMATOS_META = ['9:16', '16:9', '1:1', '4:3', '3:4']

/** Las imágenes que acepta un mensaje de Muse (useapi.net: hasta 9 por pedido). */
export const MAX_IMAGENES_META = 9

export interface PedidoMeta {
  tipo: 'imagen' | 'video'
  prompt: string
  formato: string
  /** Con `primerCuadro`, la primera de las imágenes es donde empieza el video. */
  primerCuadro: boolean
  /** Cuántas imágenes van adjuntas, contando el primer cuadro. */
  imagenes: number
}

/**
 * El mensaje que se le manda a Muse. Lo que pide el agente va al final, tal cual; antes, lo que Sloth necesita: uno
 * solo, en esa proporción y sin preguntas, porque nadie va a contestarlas.
 */
export function mensajeMeta(p: PedidoMeta): string {
  const referencias = p.imagenes - (p.primerCuadro ? 1 : 0)
  const partes = [`Genera ${p.tipo === 'video' ? 'un solo video' : 'una sola imagen'} en formato exactamente ${p.formato}`]
  if (p.primerCuadro) partes.push('que empiece en la primera imagen adjunta: anímala igual, sin redibujarla')
  if (referencias > 0) partes.push(p.primerCuadro ? `con los personajes y objetos de las otras ${referencias === 1 ? 'imagen adjunta' : `${referencias} imágenes adjuntas`}, iguales` : `a partir de ${referencias === 1 ? 'la imagen adjunta' : `las ${referencias} imágenes adjuntas`}: los mismos personajes y objetos, iguales`)
  return `${partes.join(', ')}. No preguntes ni ofrezcas opciones: genéralo directo.\n\n${p.prompt.trim()}`
}

/**
 * Lo usado de la semana, como lo dice Configuración → General de muse.ai: el porcentaje (de su barra) y las líneas de
 * texto que lo acompañan (el plan y cuándo se restablece), en el idioma de la cuenta. `leido`, cuándo se leyó (ms).
 */
export interface UsoMeta {
  porcentaje: number
  detalle: string
  leido: number
}

/** Un pedido a Muse, como lo ven el agente y la interfaz. `gasto`: lo que subió el uso de la semana (puntos de %). */
export interface TrabajoMeta {
  id: string
  estado: 'en-fila' | 'generando' | 'lista' | 'error'
  tipo: 'imagen' | 'video'
  archivo?: string
  gasto?: number
  uso?: UsoMeta
  /** Lo que dijo Muse al entregarlo, si dijo algo. */
  texto?: string
  /** La cuenta de Meta con que se genera o se generó. */
  cuenta?: string
  error?: string
}

/** Por qué una cuenta no genera por un rato: gastó su semana o se le fue la sesión. */
export type MotivoMeta = 'uso' | 'sesion'

/** Lo que descansa cada motivo. Volver a probar no gasta: cada pedido lee el uso antes de pedir. */
export const DESCANSO_META: Record<MotivoMeta, number> = { uso: 6 * 60 * 60_000, sesion: 10 * 60_000 }

/** Una cuenta de Meta en Opciones. `abierta`: tiene su ventana abierta y no genera hasta que la cierres. */
export interface CuentaMeta {
  correo: string
  generando: boolean
  abierta: boolean
  uso?: UsoMeta
  descansa?: { hasta: number; motivo: MotivoMeta }
}

/** Opciones → Meta Muse. `agregando`: la ventana para entrar con otra cuenta sigue abierta. `navegador`: Edge, o Chrome en Mac. */
export interface EstadoMeta {
  cuentas: CuentaMeta[]
  agregando: boolean
  leyendo: boolean
  navegador: string
  enFila: number
  error?: string
}

/** Hasta cuántas cuentas de Meta, y cuántos pedidos a la vez (cada uno en su Edge, de cuentas distintas). */
export const MAX_CUENTAS_META = 50
export const A_LA_VEZ_META = 2

/** Lo que el reparto sabe de cada cuenta. `acabo`: cuándo terminó su último pedido (ms), 0 si nunca. */
export interface UsoCuentaMeta {
  correo: string
  ocupada: boolean
  porcentaje?: number
  descansa?: { hasta: number }
  acabo: number
}

/**
 * A qué cuenta va un pedido: la libre con menos usado de la semana (así se gastan parejo), y entre iguales, la que lleva
 * más sin generar. Sin leer cuenta como 0: así se lee pronto. Las que descansan o ya lo probaron no cuentan.
 * `esperar`: las que pueden están ocupadas; `ninguna`: ninguna puede.
 */
export function elegirCuentaMeta(cuentas: UsoCuentaMeta[], ahora: number, probadas: string[] = []): string | 'esperar' | 'ninguna' {
  const pueden = cuentas.filter((c) => !probadas.includes(c.correo) && !(c.descansa && c.descansa.hasta > ahora))
  if (!pueden.length) return 'ninguna'
  const libres = pueden.filter((c) => !c.ocupada)
  if (!libres.length) return 'esperar'
  return libres.sort((a, b) => (a.porcentaje ?? 0) - (b.porcentaje ?? 0) || a.acabo - b.acabo)[0].correo
}

/** `detalle`, de los renglones junto a la barra: sin el del porcentaje, que ya está en número. */
export function usoDe(porcentaje: string | null, texto: string, leido: number): UsoMeta | null {
  const n = Number(porcentaje)
  if (!porcentaje?.trim() || !Number.isFinite(n)) return null
  const detalle = texto
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r && !/\d+\s*%/.test(r))
    .join(' · ')
  return { porcentaje: n, detalle, leido }
}
