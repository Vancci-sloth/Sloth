import type { EstiloTienda, OrdenTienda } from '../../shared/types.ts'
import { coincide, sinAcentos } from './admin-formato.ts'

/**
 * Los filtros de la tienda de estilos (`Tienda.tsx`). La tienda llega entera y aquí se busca, se filtra y se ordena, sin
 * volver a pedir nada: cada clic responde al instante. Todo sale de lo que cada estilo ya dice de sí: sus temas, de su
 * título y su texto (`TEMAS`); su forma, de su video; y si es nuevo para ti, de los que ya habías visto en la tienda
 * (`vistosAntes`). Cada opción lleva cuántos estilos da con lo demás que ya elegiste, así ninguna deja la tienda vacía.
 */
export interface Filtros {
  /** Lo que se escribe en el buscador: cada palabra, en el título, el texto, la guía o el nombre de quien lo compartió. */
  q: string
  tema?: string
  forma?: 'vertical' | 'horizontal'
  /** Los que aún no habías visto en la tienda. */
  nuevos?: boolean
  /**
   * Solo el creador, que lo ve todo: los que faltan por aprobar, o los que ve toda la comunidad (aprobados y sin
   * ocultar por reportes), para ver la tienda como la ven los demás.
   */
  aprobacion?: 'revision' | 'publicos'
  /** Los de una persona: se llega desde su nombre en el visor. */
  autor?: { id: string; nombre: string }
}

/**
 * De qué va un estilo. Cada tema se reconoce por unas palabras en su título, el principio de su texto y lo que entrega:
 * nadie los etiqueta a mano, así que sirven también para los que ya estaban compartidos.
 */
export const TEMAS: { id: string; nombre: string; es: RegExp }[] = [
  { id: '3d', nombre: '3D', es: /\b3d\b|pixar/ },
  { id: 'historias', nombre: 'Historias', es: /historia|cuento|drama|novela|relato|fabula|serie|story/ },
  { id: 'explicar', nombre: 'Para explicar', es: /explica|documental|curiosidad|datos|infograf|ensayo|informativ|ingenieria|anatomia|medicina|educativ/ },
  { id: 'dibujo', nombre: 'Dibujados', es: /anime|cartoon|\b2d\b|stickman|ilustrad|dibujo|caricatura|paper/ },
  { id: 'humor', nombre: 'Humor', es: /comedia|meme|chiste|humor|parodia/ },
  { id: 'animales', nombre: 'Animales', es: /animal|perro|gato|dinosaurio|mascota/ },
  { id: 'terror', nombre: 'Terror', es: /terror|miedo|horror/ }
]

/** Un estilo con lo que hace falta para filtrarlo, ya calculado. */
export interface Ficha {
  e: EstiloTienda
  buscable: string
  temas: string[]
  forma?: 'vertical' | 'horizontal'
  nuevo: boolean
}

/** `vistos`: los estilos que ya habías visto en la tienda; `null` la primera vez, cuando ninguno cuenta como nuevo. */
export function fichasDe(estilos: EstiloTienda[], vistos: Set<string> | null): Ficha[] {
  return estilos.map((e) => {
    const p = e.publicacion
    const guia = p.adjuntos.find((a) => a.tipo === 'estilo')?.guia
    const video = p.adjuntos.find((a) => a.tipo === 'video')
    const deQueVa = sinAcentos([p.titulo, p.texto.slice(0, 400), guia?.entrega].filter(Boolean).join(' '))
    return {
      e,
      buscable: sinAcentos([p.titulo, p.texto, p.autor.nombre, guia?.das, guia?.entrega, guia?.ejemplo, guia?.necesita].filter(Boolean).join(' ')),
      temas: TEMAS.filter((t) => t.es.test(deQueVa)).map((t) => t.id),
      ...(video ? { forma: video.vertical === false ? ('horizontal' as const) : ('vertical' as const) } : {}),
      nuevo: !!vistos && !vistos.has(p.id)
    }
  })
}

/** Con tantos reportes una publicación se oculta a los demás (`OCULTAR` en `licencias/src/comunidad.ts`). */
const OCULTAR = 3

/**
 * Lo que pide cada opción. Los demás ven lo aprobado o pre-aprobado, y lo que tiene una versión a la vista mientras se
 * revisa otra (`publicaAun`), sin lo oculto por reportes, que solo le llegan al creador.
 */
const APROBACION = {
  revision: (e: EstiloTienda) => !!e.publicacion.porAprobar,
  publicos: (e: EstiloTienda) => (!e.publicacion.porAprobar || !!e.publicacion.publicaAun) && (e.publicacion.reportes ?? 0) < OCULTAR
}

export function pasa(f: Ficha, x: Filtros): boolean {
  if (x.tema && !f.temas.includes(x.tema)) return false
  if (x.forma && f.forma !== x.forma) return false
  if (x.nuevos && !f.nuevo) return false
  if (x.aprobacion && !APROBACION[x.aprobacion](f.e)) return false
  if (x.autor && f.e.publicacion.autor.id !== x.autor.id) return false
  return !x.q.trim() || coincide(f.buscable, x.q)
}

/** Si hay algo elegido o escrito. */
export const hayFiltros = (x: Filtros) => !!(x.q.trim() || x.tema || x.forma || x.nuevos || x.aprobacion || x.autor)

/** Cuántos estilos da cada opción con lo demás que ya está elegido. Los temas que no dan ninguno no salen. */
export function opcionesDe(fichas: Ficha[], x: Filtros) {
  const con = (cambio: Partial<Filtros>) => fichas.filter((f) => pasa(f, { ...x, ...cambio })).length
  return {
    temas: TEMAS.map((t) => ({ id: t.id, nombre: t.nombre, n: con({ tema: t.id }) })).filter((t) => t.n > 0 || t.id === x.tema),
    vertical: con({ forma: 'vertical' }),
    horizontal: con({ forma: 'horizontal' }),
    nuevos: con({ nuevos: true }),
    revision: con({ aprobacion: 'revision' }),
    publicos: con({ aprobacion: 'publicos' })
  }
}

const POR: Record<OrdenTienda, (e: EstiloTienda) => number | string> = {
  favoritos: (e) => e.publicacion.likes,
  usados: (e) => e.videos,
  descargas: (e) => e.descargas,
  ganando: (e) => e.mes.puntos,
  nuevos: (e) => e.publicacion.creada
}

/** Como los ordena el cobro (`tienda` en `licencias/src/tienda.ts`): de más a menos y, empatados, el más nuevo primero. */
export function ordenar(estilos: EstiloTienda[], orden: OrdenTienda): EstiloTienda[] {
  const clave = POR[orden]
  return [...estilos].sort((a, b) => {
    const x = clave(a)
    const y = clave(b)
    return x === y ? b.publicacion.creada.localeCompare(a.publicacion.creada) : x < y ? 1 : -1
  })
}

const VISTOS = 'sloth-tienda-vistos'
// Lo visto antes de esta vez que se abrió Sloth: lo nuevo sigue marcado mientras la app esté abierta.
let antes: Set<string> | null | undefined

/** Los estilos que ya habías visto en la tienda antes de abrir Sloth esta vez; `null` si es tu primera vez. */
export function vistosAntes(): Set<string> | null {
  if (antes !== undefined) return antes
  try {
    const v = JSON.parse(localStorage.getItem(VISTOS) ?? 'null') as unknown
    antes = Array.isArray(v) ? new Set(v.filter((x): x is string => typeof x === 'string')) : null
  } catch {
    antes = null
  }
  return antes
}

/** Anota que ya viste estos, para la próxima vez. */
export function anotarVistos(ids: string[]) {
  try {
    const ya = JSON.parse(localStorage.getItem(VISTOS) ?? '[]') as unknown
    localStorage.setItem(VISTOS, JSON.stringify([...new Set([...(Array.isArray(ya) ? ya : []), ...ids])].slice(-2000)))
  } catch {
    // Sin almacenamiento: la próxima vez ninguno sale como nuevo.
  }
}
