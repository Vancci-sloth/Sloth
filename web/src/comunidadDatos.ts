import type { CategoriaComunidad, ComentarioComunidad, FeedComunidad, OrdenComunidad, PublicacionComunidad } from '../../shared/types'
import { api } from './api'

/**
 * Lo que la Comunidad ya pidió al Worker, para enseñarlo al instante y ponerlo al día después: la lista de cada sección y
 * orden (con las páginas que ya bajaste) y cada publicación abierta con sus comentarios. Vive mientras Sloth está abierto;
 * la primera página de «Todo» se queda también en esta computadora (`GUARDADA`), así la comunidad sale aunque sea la
 * primera vez que la abres hoy. De ahí solo salen publicaciones: quién eres, tus avisos y el roadmap vienen siempre del
 * último pedido de esta sesión (`ultimo`), nunca de una copia vieja.
 *
 * También adelanta, sin cargar de más al Worker (D1 tiene tope): una sección al pasar por su pestaña
 * (`precargarVista`), una publicación al detenerte en ella (`precargarPublicacion`) y la página siguiente del feed
 * antes de llegar al final. Publicar o borrar lo deja al día con `olvidar`.
 */

export type Vista = { seccion: CategoriaComunidad | ''; orden: OrdenComunidad }
export type Guardado = { lista: PublicacionComunidad[]; mas: boolean }
type Abierta = { publicacion: PublicacionComunidad; comentarios: ComentarioComunidad[] }

const GUARDADA = 'comunidad:guardada'
const TODO = '|actividad'
const listas = new Map<string, Guardado>()
const enCamino = new Map<string, Promise<FeedComunidad>>()
const abiertas = new Map<string, Abierta>()
const abriendo = new Map<string, Promise<Abierta>>()
let ultimo: FeedComunidad | null = null
/** Lo que borraste en esta sesión: ningún pedido que llegue tarde la vuelve a traer. */
const borradas = new Set<string>()

const clave = (v: Vista) => `${v.seccion}|${v.orden}`
export const consulta = (v: Vista, extra: Record<string, string> = {}) =>
  new URLSearchParams({ ...(v.seccion ? { categoria: v.seccion } : {}), ...(v.orden !== 'actividad' ? { orden: v.orden } : {}), ...extra }).toString()

try {
  const g = JSON.parse(localStorage.getItem(GUARDADA) ?? 'null') as Guardado | null
  if (g && Array.isArray(g.lista)) listas.set(TODO, { lista: g.lista, mas: !!g.mas })
} catch {
  // Sin nada guardado (o ilegible): se pide.
}

/** Las publicaciones que ya se tienen de esa vista, si se tienen. */
export const guardado = (v: Vista) => listas.get(clave(v))
/** Quién eres, tus avisos, el roadmap y los números: lo último que llegó en esta sesión (o, si no, nada). */
export const ultimoFeed = () => ultimo

export function guardar(v: Vista, g: Guardado) {
  listas.set(clave(v), g)
  if (clave(v) === TODO) escribirTodo(g)
}
/** Lo de este momento (con tu nombre, tus avisos o tu voto ya cambiados aquí) para la próxima vez. */
export const recordar = (f: FeedComunidad) => void (ultimo = f)

function escribirTodo(g: Guardado) {
  try {
    localStorage.setItem(GUARDADA, JSON.stringify({ lista: g.lista.slice(0, 20), mas: g.mas || g.lista.length > 20 }))
  } catch {
    // Sin espacio: solo se pierde que salga al instante la próxima vez.
  }
}

/** La primera página de una vista. Si ya va un pedido igual, se espera ese. */
export function pedir(v: Vista, fresco = false): Promise<FeedComunidad> {
  const k = clave(v)
  const ya = enCamino.get(k)
  // Tras escribir algo (fresco), uno que ya iba podría traer lo de antes: se pide otro.
  if (ya && !fresco) return ya
  const q = consulta(v)
  const pedido = api<FeedComunidad>(`/api/comunidad${q ? `?${q}` : ''}`)
    .then((f) => ((ultimo = f), { ...f, publicaciones: f.publicaciones.filter((p) => !borradas.has(p.id)) }))
    .finally(() => enCamino.delete(k))
  enCamino.set(k, pedido)
  return pedido
}

/** Al pasar por la pestaña de una sección que aún no se tiene: que al elegirla ya esté. */
export function precargarVista(v: Vista) {
  if (listas.has(clave(v)) || enCamino.has(clave(v))) return
  pedir(v).then(
    (f) => listas.has(clave(v)) || guardar(v, { lista: f.publicaciones, mas: f.mas }),
    () => {}
  )
}

/** Una publicación con sus comentarios: la que ya se tiene o, si no, la pide (una sola vez a la vez). */
export function pedirPublicacion(id: string): Promise<Abierta> {
  const ya = abriendo.get(id)
  if (ya) return ya
  const pedido = api<Abierta>(`/api/comunidad/p/${id}`).then(
    (a) => (borradas.has(id) || abiertas.set(id, a), abriendo.delete(id), a),
    (e: unknown) => (abriendo.delete(id), Promise.reject(e))
  )
  abriendo.set(id, pedido)
  return pedido
}

/** Al detenerte en una publicación: que sus comentarios ya estén cuando la abras. Una vez por sesión. */
export function precargarPublicacion(id: string) {
  if (!abiertas.has(id) && !abriendo.has(id)) void pedirPublicacion(id).catch(() => {})
}

/** Lo que ya se tiene de una publicación abierta. */
export const abiertaGuardada = (id: string) => abiertas.get(id)
export const guardarAbierta = (id: string, a: Abierta) => abiertas.set(id, a)

/**
 * Tras escribir: con `borrada`, esa publicación sale de todo lo guardado (también del buscador); sin ella (una nueva), lo
 * guardado de las otras vistas deja de valer, y se vuelve a pedir al entrar.
 */
export function olvidar(k: Vista, borrada?: string) {
  if (borrada) {
    // Lo que venía en camino y llegue después tampoco la vuelve a meter.
    borradas.add(borrada)
    abiertas.delete(borrada)
    if (indice) indice = indice.filter((x) => x.id !== borrada)
    dispatchEvent(new Event(BORRADA))
    for (const [c, g] of listas) {
      const lista = g.lista.filter((p) => p.id !== borrada)
      if (lista.length === g.lista.length) continue
      listas.set(c, { ...g, lista })
      if (c === TODO) escribirTodo({ ...g, lista })
    }
    return
  }
  for (const c of [...listas.keys()]) if (c !== clave(k)) listas.delete(c)
}

/** Sin cuenta (401): nada de lo guardado se enseña, ni aquí ni la próxima vez. */
export function olvidarTodo() {
  listas.clear()
  abiertas.clear()
  indice = null
  ultimo = null
  try {
    localStorage.removeItem(GUARDADA)
  } catch {
    // Sin acceso: no había nada.
  }
}

/** Avisa al buscador que una publicación se borró: lo que trajo del Worker ya no vale. */
export const BORRADA = 'sloth-comunidad-borrada'

/**
 * Lo que el buscador encuentra al instante: el título (o el principio del texto) de cada publicación que puedes ver, sin
 * comentarios ni adjuntos, con su sección, autor y fechas (`/comunidad/indice`, las 2.000 más activas). Se pide una vez
 * por sesión, al enfocar el buscador: pesa poco y le ahorra al Worker una búsqueda por cada cosa reciente.
 */
export type EnIndice = Pick<PublicacionComunidad, 'id' | 'titulo' | 'texto' | 'categoria' | 'creada' | 'actividad'> & { autor: string }
let indice: EnIndice[] | null = null
let pidiendoIndice: Promise<void> | null = null
export function pedirIndice() {
  pidiendoIndice ??= api<{ publicaciones: EnIndice[] }>('/api/comunidad/indice').then(
    (r) => void (indice = r.publicaciones.filter((p) => !borradas.has(p.id))),
    () => void (pidiendoIndice = null)
  )
  return pidiendoIndice
}
export const indiceListo = () => indice

/** Todas las publicaciones que ya se tienen, sin repetir: donde busca el buscador mientras llega lo del Worker. */
export function conocidas(): PublicacionComunidad[] {
  const vistas = new Map<string, PublicacionComunidad>()
  for (const g of listas.values()) for (const p of g.lista) if (!vistas.has(p.id)) vistas.set(p.id, p)
  for (const a of abiertas.values()) vistas.set(a.publicacion.id, a.publicacion)
  return [...vistas.values()].filter((p) => !borradas.has(p.id))
}

/**
 * Las palabras de lo que se busca, como las compara el Worker (`palabrasDe` en `licencias/src/comunidad.ts`): en
 * minúsculas y sin acentos, con la ñ.
 */
export const palabrasDe = (q: string) =>
  q
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u0302\u0304-\u036f]/g, '')
    .normalize('NFC')
    // La ã y la õ (portugués) llevan la misma marca que la ñ: van aparte.
    .replace(/ã/g, 'a')
    .replace(/õ/g, 'o')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 6)

/** Lo mismo que hace el Worker, con lo que ya se tiene: cada palabra en el título o el texto; primero en el título. */
export function buscarAqui<T extends Pick<PublicacionComunidad, 'titulo' | 'texto' | 'actividad'>>(q: string, entre: T[]): T[] {
  const palabras = palabrasDe(q)
  if (!palabras.length) return []
  const plano = (t: string) => palabrasDe(t).join(' ')
  return entre
    .map((p) => ({ p, titulo: plano(p.titulo), todo: `${plano(p.titulo)} ${plano(p.texto)}` }))
    .filter((x) => palabras.every((w) => x.todo.includes(w)))
    .sort((a, b) => +palabras.every((w) => b.titulo.includes(w)) - +palabras.every((w) => a.titulo.includes(w)) || b.p.actividad.localeCompare(a.p.actividad))
    .map((x) => x.p)
}
