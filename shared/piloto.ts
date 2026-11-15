/**
 * Piloto automático (`server/piloto.ts`): lo que comparten el servidor y Opciones. Apagado por defecto. Con un brief
 * simple de la marca, Sloth hace solo unos videos por día, cada uno en su hilo, y los mete a la cola de redes.
 */

export const IDIOMAS_PILOTO = { es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés' } as const
export type IdiomaPiloto = keyof typeof IDIOMAS_PILOTO

export interface ConfigPiloto {
  encendido: boolean
  /** De qué trata la marca. */
  marca: string
  /** A quién le habla. */
  publico: string
  /** Dolores o temas, uno por línea en la interfaz. */
  temas: string[]
  /** Ganchos opcionales; sin ellos, el agente los saca de los temas. */
  ganchos: string[]
  /** Llamada a la acción, suave y al final. */
  cta: string
  idioma: IdiomaPiloto
  tono: string
  /** De 1 a 6. */
  videosPorDia: number
  /** `HH:MM`, en la hora de esta computadora. */
  horarios: string[]
  /** El estilo de video (el id de su card). */
  cardId: string
  /** Si se programan solos en las redes; si no, quedan para revisarlos. */
  publicarSolo: boolean
  modelo?: string
  esfuerzo?: string
}

export const CONFIG_POR_DEFECTO: ConfigPiloto = {
  encendido: false,
  marca: '',
  publico: '',
  temas: [],
  ganchos: [],
  cta: '',
  idioma: 'es',
  tono: '',
  videosPorDia: 1,
  horarios: ['13:00'],
  cardId: '',
  publicarSolo: false
}

export type EstadoTurno = 'hilo' | 'por_revisar' | 'programado' | 'error'

/** Un video del piloto: un horario de un día, su hilo y cómo acabó. */
export interface TurnoPiloto {
  id: string
  /** `AAAA-MM-DD` y `HH:MM`. */
  fecha: string
  hora: string
  instante: string
  cardId: string
  gancho: string
  tema: string
  /** Si al terminar se programa solo (se fija al crearlo). */
  solo: boolean
  sesion?: string
  /** El video terminado. */
  ruta?: string
  estado: EstadoTurno
  error?: string
  creado: number
}

export interface VistaPiloto {
  config: ConfigPiloto
  zona: string
  /** Los horarios de hoy y mañana y si ya tienen turno. */
  proximos: { fecha: string; hora: string; estado: EstadoTurno | 'libre' | 'pasado'; turno?: string }[]
  ultimos: TurnoPiloto[]
  estilos: { id: string; title: string }[]
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/

/** Qué falta o está mal en lo que se quiere guardar (vacío si está bien). */
export function validarConfig(c: Partial<ConfigPiloto>): string[] {
  const e: string[] = []
  if (c.videosPorDia !== undefined && !(Number.isInteger(c.videosPorDia) && c.videosPorDia >= 1 && c.videosPorDia <= 6)) e.push('Los videos por día van de 1 a 6.')
  if (c.horarios?.some((h) => !HORA.test(h))) e.push('Los horarios van como HH:MM, por ejemplo 13:00.')
  if (c.idioma !== undefined && !(c.idioma in IDIOMAS_PILOTO)) e.push('Ese idioma no está.')
  return e
}
