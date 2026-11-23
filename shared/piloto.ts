/**
 * El piloto (`server/piloto.ts`, Redes → Piloto): lo que comparten el servidor y la interfaz. Un brief de la marca y dos
 * modos aparte. El manual hace los videos que pidas al pulsar y los deja por revisar; el automático, apagado por
 * defecto, los hace solo cada día y los programa solo en la cola de redes.
 */

export const IDIOMAS_PILOTO = { es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés' } as const
export type IdiomaPiloto = keyof typeof IDIOMAS_PILOTO

/** Lo que el agente sabe de la marca. Lo usan los dos modos. */
export interface BriefPiloto {
  /** De qué trata la marca. */
  marca: string
  /** A quién le habla. */
  publico: string
  /** Dolores o temas; rotan de un video a otro. */
  temas: string[]
  /** Ganchos opcionales, que también rotan; sin ellos, el agente los saca del tema. */
  ganchos: string[]
  /** Llamada a la acción, suave y al final. */
  cta: string
  idioma: IdiomaPiloto
  tono: string
  /** El estilo de video (el id de su card); vacío, el explicativo. */
  cardId: string
}

/** El automático: apagado hasta que lo enciendes a propósito. */
export interface AutoPiloto {
  encendido: boolean
  /** Cuántos videos hace como mucho en un día. */
  tope: number
}

export interface ConfigPiloto {
  brief: BriefPiloto
  auto: AutoPiloto
}

export const TOPE_MAX = 6
/** Cuántos pide el manual de una vez, como mucho. */
export const MANUAL_MAX = 6

export const BRIEF_VACIO: BriefPiloto = { marca: '', publico: '', temas: [], ganchos: [], cta: '', idioma: 'es', tono: '', cardId: '' }
export const CONFIG_POR_DEFECTO: ConfigPiloto = { brief: BRIEF_VACIO, auto: { encendido: false, tope: 1 } }

export type ModoPiloto = 'manual' | 'auto'
/** `haciendo`: su hilo trabaja o espera turno. `por_revisar`: del manual, terminado. `programado`: del automático, en la cola. */
export type EstadoTurno = 'haciendo' | 'por_revisar' | 'programado' | 'error'

/** Un video del piloto: de qué modo es, su hilo y cómo acabó. */
export interface TurnoPiloto {
  id: string
  modo: ModoPiloto
  /** El día en que se pidió, `AAAA-MM-DD` en la hora de esta computadora: el tope del automático cuenta por día. */
  fecha: string
  cardId: string
  gancho: string
  tema: string
  sesion: string
  /** El video terminado. */
  ruta?: string
  estado: EstadoTurno
  error?: string
  creado: number
}

/** `GET /api/piloto`. */
export interface VistaPiloto {
  config: ConfigPiloto
  ultimos: TurnoPiloto[]
  estilos: { id: string; title: string }[]
  /** Lo de hoy del automático, para que se vea qué va a hacer. */
  hoy: {
    /** Los que ya pidió hoy. */
    hechos: number
    /** Las horas del ritmo de redes de hoy; vacío si hoy no toca. */
    horas: string[]
    /** Hay una red conectada donde programar. */
    conectada: boolean
  }
}

/** Lo que falta para que el piloto pueda hacer un video (vacío si nada). */
export function faltaEnBrief(b: BriefPiloto): string | undefined {
  if (!b.marca.trim()) return 'Cuenta de qué trata la marca primero.'
}
