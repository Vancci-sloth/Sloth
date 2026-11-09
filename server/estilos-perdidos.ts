import { existsSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Card } from '../shared/types.ts'
import { guardar } from './disco.ts'
import { baseDe, type DeSloth } from './estilos.ts'
import { nombreCopia } from './originales.ts'

/**
 * Los estilos tuyos que se quedan sin card. Su skill vive en `<app>/skills/<id>`, que ninguna versión toca, pero su card
 * se pierde si no está en `data/tus-cards.json`: un agente de «Nuevo estilo» que la puso en `cards.json` (cada versión de
 * Sloth lo reemplaza), uno que no llegó a escribirla o un `tus-cards.json` que no se puede leer. En la app que se vende,
 * al arrancar y al acabar cada turno de un hilo de «Nuevo estilo»:
 * - `mudarTuyas`: una card de `cards.json` con una skill que no trae Sloth pasa a `tus-cards.json`. También cada vez que
 *   cambia `cards.json`, para que la siguiente versión ya no se la lleve.
 * - `recuperarEstilos`: cada carpeta de `<app>/skills` que es un estilo (su SKILL.md usa video-base), que no trae Sloth y
 *   que ninguna card usa, recupera su card: la última que escribió un hilo de «Nuevo estilo», y si no hay, una hecha con
 *   su SKILL.md y la card del estilo de Sloth del que partió. Un estilo que borraste no vuelve: su carpeta ya no está ahí.
 */

/** La card que lanza la skill `crear-estilo`: sus hilos escriben las cards de los estilos tuyos. */
const NUEVO_ESTILO = 'nuevo-estilo'
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
/** Lo de la card del estilo de Sloth que hereda uno tuyo rehecho. `lote` no: su prefijo es de ese estilo. */
const HEREDA = ['icon', 'etapas', 'voz', 'clips', 'musica', 'editor'] as const

interface Rutas {
  app: string
  /** Las skills como las trae esta versión (`SLOTH_SKILLS_ORIGINALES`): lo que está ahí es de Sloth. */
  originales: string
}

const rutas = (app: string) => ({ cardsJson: join(app, 'cards.json'), tusCards: join(app, 'data', 'tus-cards.json'), skills: join(app, 'skills') })

/** Las dos cosas, al arrancar. Devuelve los ids de los estilos que movió o recuperó. */
export function cuidarEstilos(o: Rutas): string[] {
  return [...mudarTuyas(o), ...recuperarEstilos(o)]
}

/** Pasa a `tus-cards.json` las cards de `cards.json` que no son de Sloth. Devuelve sus ids. */
export function mudarTuyas(o: Rutas): string[] {
  const { cardsJson, tusCards } = rutas(o.app)
  const lista = leer(cardsJson)
  const tuyas = lista?.filter((c) => typeof c?.id === 'string' && c.id && typeof c.skill === 'string' && !existsSync(join(o.originales, c.skill))) ?? []
  if (!tuyas.length) return []
  const propias = abrirTusCards(tusCards)
  for (const t of tuyas) {
    const { cwd: _cwd, tuya: _tuya, ...card } = t
    const i = propias.findIndex((c) => c.id === t.id)
    if (i >= 0) propias[i] = card
    else propias.push(card)
  }
  // Primero las tuyas: si algo falla después, la card está en los dos y no se pierde.
  guardar(tusCards, JSON.stringify(propias, null, 2) + '\n')
  guardar(cardsJson, JSON.stringify(lista!.filter((c) => !tuyas.includes(c)), null, 2) + '\n')
  return tuyas.map((c) => c.id!)
}

/** Devuelve su card a cada estilo de `<app>/skills` que se quedó sin ella. Devuelve sus ids. */
export function recuperarEstilos(o: Rutas): string[] {
  const { cardsJson, tusCards, skills } = rutas(o.app)
  const deSloth = leer(cardsJson) ?? []
  const propias = existsSync(tusCards) ? leer(tusCards) : []
  const todas = [...deSloth, ...(propias ?? [])]
  const usadas = new Set(todas.flatMap((c) => [c.id, c.skill]))
  const sinCard = carpetas(skills).filter(
    (s) => ID.test(s) && !usadas.has(s) && !existsSync(join(o.originales, s)) && /video-base/.test(texto(join(skills, s, 'SKILL.md')))
  )
  if (!sinCard.length) return []
  const lista = propias ?? abrirTusCards(tusCards)
  const estilos: DeSloth[] = deSloth.filter((c) => c.skill && c.etapas?.length && existsSync(join(skills, c.skill))).map((c) => ({ skill: c.skill!, carpeta: join(skills, c.skill!) }))
  for (const id of sinCard) {
    const { cwd: _cwd, tuya: _tuya, ...card } = deHilos(join(o.app, 'data', 'sessions'), id) ?? rehecha(id, join(skills, id), estilos, deSloth)
    lista.push({ ...card, id, skill: id })
  }
  guardar(tusCards, JSON.stringify(lista, null, 2) + '\n')
  return sinCard
}

/**
 * Las cards de `tus-cards.json` para añadirle otras. Si no se puede leer, Sloth ya no enseñaba ninguna: no se pisa, se
 * aparta a su lado (`tus-cards <fecha> que no se leía.json`), por si alguien quiere lo que tenía, y se empieza de nuevo.
 */
export function abrirTusCards(tusCards: string): Partial<Card>[] {
  if (!existsSync(tusCards)) return []
  const lista = leer(tusCards)
  if (lista) return lista
  renameSync(tusCards, join(dirname(tusCards), `tus-cards ${nombreCopia('que no se leía')}.json`))
  return []
}

/** La última card de `id` que un hilo de «Nuevo estilo» escribió (en un Write o un Edit, o en un comando). */
export function deHilos(sesiones: string, id: string): Partial<Card> | undefined {
  const hilos = carpetasDe(sesiones, (f) => f.endsWith('.json'))
    .map((f) => ({ f, meta: leerObjeto(join(sesiones, f)) }))
    .filter((h) => h.meta?.cardId === NUEVO_ESTILO)
    .sort((a, b) => Number(a.meta?.createdAt ?? 0) - Number(b.meta?.createdAt ?? 0))
  let hallada: Partial<Card> | undefined
  for (const h of hilos) {
    for (const linea of texto(join(sesiones, h.f.replace(/\.json$/, '.jsonl'))).split('\n')) {
      if (!linea.includes(id) || !linea.includes('"tool"')) continue
      try {
        const e = JSON.parse(linea) as { t?: string; input?: unknown }
        if (e.t === 'tool') for (const s of textos(e.input)) hallada = ultimaCard(s, id) ?? hallada
      } catch {
        // Una línea a medias.
      }
    }
  }
  return hallada
}

/** La última card completa de `id` dentro de un texto: el objeto JSON que lleva `"skill": "<id>"`, con su título. */
function ultimaCard(s: string, id: string): Partial<Card> | undefined {
  let ultima: Partial<Card> | undefined
  for (const m of s.matchAll(new RegExp(`"skill"\\s*:\\s*"${id}"`, 'g'))) {
    const ini = abre(s, m.index)
    const fin = ini < 0 ? -1 : cierra(s, ini)
    if (fin < 0) continue
    try {
      const c = JSON.parse(s.slice(ini, fin + 1)) as Partial<Card>
      if (c?.id === id && typeof c.title === 'string' && c.title.trim()) ultima = c
    } catch {
      // No era la card entera.
    }
  }
  return ultima
}

/** La `{` del objeto que contiene la posición `i`. */
function abre(s: string, i: number): number {
  for (let hondo = 0; i >= 0; i--) {
    if (s[i] === '}') hondo++
    else if (s[i] === '{' && hondo-- === 0) return i
  }
  return -1
}

/** La `}` que cierra la `{` de `ini`, sin contar las que van dentro de un texto. */
function cierra(s: string, ini: number): number {
  let hondo = 0
  let enTexto = false
  for (let i = ini; i < s.length; i++) {
    const ch = s[i]
    if (enTexto) {
      if (ch === '\\') i++
      else if (ch === '"') enTexto = false
    } else if (ch === '"') enTexto = true
    else if (ch === '{') hondo++
    else if (ch === '}' && --hondo === 0) return i
  }
  return -1
}

/** Una card hecha con lo que hay: el título y la descripción de su SKILL.md, y lo demás del estilo de Sloth del que partió. */
function rehecha(id: string, carpeta: string, estilos: DeSloth[], deSloth: Partial<Card>[]): Partial<Card> {
  const md = texto(join(carpeta, 'SKILL.md'))
  const fin = md.startsWith('---') ? md.indexOf('\n---', 3) : -1
  const cabeza = fin < 0 ? '' : md.slice(0, fin)
  const cuerpo = fin < 0 ? md : md.slice(fin + 4)
  const title = /^#\s+(.+)$/m.exec(cuerpo)?.[1].trim().slice(0, 80) || id.charAt(0).toUpperCase() + id.slice(1).replaceAll('-', ' ')
  const desc = (/^description:\s*(.*)$/m.exec(cabeza)?.[1] ?? '').trim().replace(/^["']|["']$/g, '')
  const description = (/^.+?\.(?=\s|$)/.exec(desc)?.[0] ?? desc).slice(0, 300)
  const basadoEn = baseDe({ id, skill: id } as Card, carpeta, estilos)
  const base = deSloth.find((c) => c.skill === basadoEn)
  const hereda = Object.fromEntries(HEREDA.filter((k) => base?.[k] !== undefined).map((k) => [k, base![k]]))
  return { title, description, icon: 'video', ...hereda, version: '1.0', ...(basadoEn ? { basadoEn } : {}) }
}

function* textos(v: unknown): Generator<string> {
  if (typeof v === 'string') yield v
  else if (v && typeof v === 'object') for (const x of Object.values(v)) yield* textos(x)
}

function leer(archivo: string): Partial<Card>[] | null {
  try {
    // Con BOM, como lo deja PowerShell.
    const v = JSON.parse(readFileSync(archivo, 'utf8').replace(/^﻿/, '')) as unknown
    return Array.isArray(v) ? (v as Partial<Card>[]) : null
  } catch {
    return null
  }
}

function leerObjeto(archivo: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(archivo, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function texto(archivo: string): string {
  try {
    return readFileSync(archivo, 'utf8')
  } catch {
    return ''
  }
}

const carpetas = (dir: string) => {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  } catch {
    return []
  }
}

const carpetasDe = (dir: string, sirve: (f: string) => boolean) => {
  try {
    return readdirSync(dir).filter(sirve)
  } catch {
    return []
  }
}
