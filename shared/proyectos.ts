/**
 * Proyectos y series: un proyecto agrupa hilos y videos de una marca o canal, con su memoria (`MEMORIA.md`)
 * que el agente lee al empezar; una serie es un formato fijo dentro del proyecto, con su propia memoria. Viven en
 * `data/proyectos/<id>/` (`server/proyectos.ts`). Aquí, lo que comparten el servidor y la interfaz.
 */

/** Los colores de un proyecto, con nombre: cada uno es una variable de la paleta de Sloth (`web/src/styles.css`). */
export const COLORES_PROYECTO = {
  ambar: { nombre: 'Ámbar', css: 'var(--amber)' },
  oro: { nombre: 'Oro', css: 'var(--amber-2)' },
  verde: { nombre: 'Verde', css: 'var(--ok)' },
  rojo: { nombre: 'Rojo', css: 'var(--bad)' },
  gris: { nombre: 'Gris', css: 'var(--muted)' }
} as const

export type ColorProyecto = keyof typeof COLORES_PROYECTO

export const esColor = (c: unknown): c is ColorProyecto => typeof c === 'string' && Object.hasOwn(COLORES_PROYECTO, c)

/** Lo que se dibuja de un color guardado; uno desconocido sale en ámbar. */
export const cssDeColor = (c?: string) => (esColor(c) ? COLORES_PROYECTO[c].css : COLORES_PROYECTO.ambar.css)

/** Una serie de un proyecto: `series/<id>/serie.json`, con su `MEMORIA.md` al lado. */
export interface SerieProyecto {
  id: string
  nombre: string
  creado: number
  /** Archivada: fuera de la barra y de los selectores, sin borrarse. */
  archivado?: boolean
}

/** Un proyecto: `proyecto.json`, con su `MEMORIA.md` y sus series. */
export interface Proyecto {
  id: string
  nombre: string
  color: ColorProyecto
  /** La ruta o URL de su logo, si tiene. */
  logo?: string
  creado: number
  archivado?: boolean
  series: SerieProyecto[]
}

/** Quita tildes y pasa a minúsculas, para comparar nombres o hacer ids. */
export const normalizar = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

/** Un id legible a partir del nombre: `Noticias de la semana` es `noticias-de-la-semana`. */
export const idDe = (nombre: string) => normalizar(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'proyecto'

/**
 * Si una serie del proyecto es la misma que una del banco de la skill (`video-base/series/` o las suyas): mismo id o
 * mismo nombre sin tildes. Entonces el compositor manda también la línea `Serie:` de la skill.
 */
export function serieDelBanco<T extends { id: string; nombre: string }>(serie: { id: string; nombre: string }, banco: T[]): T | undefined {
  const n = normalizar(serie.nombre)
  return banco.find((b) => b.id === serie.id || normalizar(b.nombre) === n || idDe(b.nombre) === serie.id)
}
