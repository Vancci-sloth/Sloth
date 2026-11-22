/**
 * Tu Sloth en otra computadora (ADR 0020): lo que comparten la app (`server/respaldo.ts`), el cobro
 * (`licencias/src/respaldo.ts`) y la pantalla (`web/src/Respaldo.tsx`).
 */

/** Lo más que pesa una copia ya comprimida. Lo topa la app al armarla y el cobro al recibirla. */
export const PESO_RESPALDO = 25 * 1024 * 1024

/** Qué trae una copia, para decirlo antes de bajarla. */
export interface ResumenRespaldo {
  estilos: { id: string; titulo: string }[]
  chats: number
}

/** La copia de una computadora, como la lista el cobro. */
export interface RespaldoNube extends ResumenRespaldo {
  equipo: string
  /** El nombre de esa computadora. */
  nombre: string
  bytes: number
  /** Cuándo se guardó (ISO). */
  guardado: string
  /** Si es la de la computadora que pregunta. */
  esta: boolean
}

/** Lo que enseña Opciones y lo que decide si se pregunta (`GET /api/respaldo`). */
export interface EstadoRespaldo {
  /** Si hay una clave activa en esta computadora: sin ella no hay copia. */
  cuenta: boolean
  /** Si esta computadora guarda su copia (encendido mientras no se apague). */
  guardar: boolean
  /** Cuándo subió la última (ISO). */
  subido?: string
  error?: string
  /** Las copias de tus otras computadoras, de la más nueva a la más vieja. */
  otros: RespaldoNube[]
  /** La que toca ofrecer ahora, si hay. */
  preguntar?: RespaldoNube
}

/** Lo que entró al traer una copia. Lo que ya estaba aquí no se toca ni se cuenta. */
export interface Traido {
  /** Los títulos de los estilos que entraron. */
  estilos: string[]
  chats: number
  sobreTi: boolean
  marcas: number
}

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** El resumen de una copia, limpio: lo manda la app y lo guarda el cobro, que no se fía. */
export function resumenLimpio(valor: unknown): ResumenRespaldo {
  const v = (valor && typeof valor === 'object' ? valor : {}) as { estilos?: unknown; chats?: unknown }
  const estilos = (Array.isArray(v.estilos) ? v.estilos : [])
    .filter((e): e is { id: string; titulo?: unknown } => !!e && typeof e === 'object' && typeof (e as { id?: unknown }).id === 'string' && (e as { id: string }).id.length <= 60 && ID.test((e as { id: string }).id))
    .slice(0, 100)
    .map((e) => ({ id: e.id, titulo: String(e.titulo ?? e.id).slice(0, 80) }))
  const chats = Number(v.chats)
  return { estilos, chats: Number.isInteger(chats) && chats > 0 ? Math.min(chats, 100_000) : 0 }
}
