import type { FondoComunidad } from '../../shared/types.ts'
import { deLaForma } from './recordado.ts'

/**
 * Cuándo el fondo de la comunidad (`Fondo.tsx`) sale en grande. El resto del tiempo es un renglón: su recuadro entero
 * ocupaba la pantalla en cada visita, hubiera cambiado algo o no. Sale en grande solo cuando trae noticia (`noticiaDe`):
 * la primera vez de cada reparto, cuando el monto dio un salto desde que lo viste, y en los últimos días. Al cerrarlo se
 * anota lo que viste (`Visto`, en esta computadora) y vuelve al renglón hasta la siguiente noticia.
 */
export interface Visto {
  periodo: string
  /** Lo que llevaba el fondo cuando cerraste el recuadro, por moneda. */
  montos: Record<string, number>
  cuando: number
  /** Ya viste el aviso de los últimos días de este reparto. */
  ultimos?: boolean
}

export type Noticia = { tipo: 'nuevo' } | { tipo: 'subio'; subio: FondoComunidad['montos'] } | { tipo: 'ultimos'; dias: number }

/** Un salto: lo que tiene que subir el fondo sobre lo que viste para abrirse solo. Menos que eso lo dice el renglón. */
export const SALTO = 0.2
/** Por una subida no se abre más de una vez en este tiempo. */
export const CADA = 20 * 3_600_000
/** Los días antes del reparto en que avisa, una vez. */
export const ULTIMOS = 3
const DIA = 86_400_000

/** Lo que subió cada moneda desde lo que viste. Vacío si no subió (o si lo visto es de otro reparto). */
export function subioDe(fondo: FondoComunidad, visto: Visto | null): FondoComunidad['montos'] {
  if (!visto || visto.periodo !== fondo.periodo) return []
  return fondo.montos.map((m) => ({ moneda: m.moneda, monto: Math.round((m.monto - (visto.montos[m.moneda] ?? 0)) * 100) / 100 })).filter((m) => m.monto > 0)
}

/** Los días que faltan para el reparto, hacia arriba y al menos uno. */
export const diasPara = (fondo: FondoComunidad, ahora: number) => Math.max(1, Math.ceil((Date.parse(fondo.cierra) - ahora) / DIA))

/** Por qué el fondo sale en grande ahora; `null` si no hay noticia. */
export function noticiaDe(fondo: FondoComunidad, visto: Visto | null, ahora: number): Noticia | null {
  if (!visto || visto.periodo !== fondo.periodo) return { tipo: 'nuevo' }
  const subio = subioDe(fondo, visto)
  if (ahora - visto.cuando >= CADA && subio.some((m) => m.monto >= SALTO * (visto.montos[m.moneda] ?? 0))) return { tipo: 'subio', subio }
  if (!visto.ultimos && Date.parse(fondo.cierra) - ahora <= ULTIMOS * DIA) return { tipo: 'ultimos', dias: diasPara(fondo, ahora) }
  return null
}

/** Lo que se anota al cerrar el recuadro. */
export function vistoDe(fondo: FondoComunidad, ahora: number): Visto {
  return {
    periodo: fondo.periodo,
    montos: Object.fromEntries(fondo.montos.map((m) => [m.moneda, m.monto])),
    cuando: ahora,
    ...(Date.parse(fondo.cierra) - ahora <= ULTIMOS * DIA ? { ultimos: true } : {})
  }
}

/**
 * Por dónde va el reparto, de 0 a 100: del día en que empieza a contar (`desde` en el primero; después, un mes antes de
 * su cierre) al día en que se reparte.
 */
export function avanceDe(fondo: FondoComunidad, ahora: number): { desde: string; avance: number } {
  const fin = Date.parse(fondo.cierra)
  const antes = new Date(fin)
  antes.setUTCMonth(antes.getUTCMonth() - 1)
  const inicio = fondo.desde ? Date.parse(fondo.desde) : antes.getTime()
  return { desde: new Date(inicio).toISOString(), avance: Math.round(Math.max(0, Math.min(1, (ahora - inicio) / Math.max(1, fin - inicio))) * 1000) / 10 }
}

const CLAVE = 'sloth-fondo-visto'

export function leerVisto(): Visto | null {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as unknown
    return deLaForma<Visto>(v, { periodo: '', montos: {}, cuando: 0 }) ? v : null
  } catch {
    return null
  }
}

export function guardarVisto(v: Visto) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(v))
  } catch {
    // Sin almacenamiento: vuelve a salir en grande la próxima vez.
  }
}
