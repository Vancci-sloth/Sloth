import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import type { Card, EstiloAnterior } from '../shared/types.ts'
import { guardar } from './disco.ts'
import { abrirTusCards } from './estilos-perdidos.ts'
import { huella } from './originales.ts'

/**
 * Cuando una versión de Sloth cambia mucho un estilo, quien lo usaba puede quedarse también con el de antes. El estilo
 * de Sloth se actualiza igual; el de antes queda entre los tuyos, tal cual, y nadie lo cambia.
 *
 * - Quien cambia un estilo a fondo le pone `cambio` a su card en cards.json: la fecha (lo que lo distingue de otro
 *   cambio), qué cambió en palabras del usuario, el enlace de la comparación y lo de la card de antes que ya no es igual.
 * - Al estrenar la versión, antes de poner sus skills (`prepararSkills`, electron/main.ts), `guardarAnteriores` copia la
 *   carpeta de cada estilo con un `cambio` que el usuario aún no tenía a `data/estilos-anteriores/<skill>/`.
 * - Sloth enseña el aviso a todos, hasta que lo leen (`web/src/EstiloCambio.tsx`). Quien tenía el de antes elige:
 *   «Guardar también el de antes» lo pone entre sus estilos (`conservarAnterior`) y «Usar solo el nuevo» borra la copia
 *   (`olvidarAnterior`). Quien no lo tenía (instaló de cero) solo lo lee. Lo leído va a `estilos-leidos.json`.
 * Lo que cada quien junta al usarlo (huellas, banco, modelos 3D) se queda en el de Sloth: la copia no lo lleva.
 */

const CARPETA = 'estilos-anteriores'
/** Lo que no se copia: se instala o se rehace solo, o es lo que junta cada quien (se queda en el de Sloth). */
const FUERA = new Set(['node_modules', 'out', '__pycache__', '.cache', '.git', 'huellas', 'modelos'])
const FUERA_RUTA = ['series/banco']
/** El último cambio de cada estilo que este usuario ya tiene. */
const VISTOS = 'estilos-vistos.json'
/** El último aviso de cada estilo que este usuario ya leyó y contestó. */
const LEIDOS = 'estilos-leidos.json'

interface Guardado {
  /** El `cambio.fecha` de la versión nueva: el de antes es el de hasta ese día. */
  fecha: string
  texto: string
  compara?: string
  /** La card del de antes: la de Sloth con lo que dice `cambio.antes`. */
  card: Partial<Card>
  /** Los archivos de video-base que nombra y que esta versión cambió: con ellos, «Nuevo estilo» lo adapta. */
  adaptar: string[]
}

/** Lo que va de la card de Sloth a la del de antes. `modelos` no: el de antes iba con lo que eligiera el usuario. */
const CAMPOS = ['title', 'description', 'icon', 'version', 'etapas', 'lote', 'editor', 'voz', 'clips', 'musica'] as const

/** «7 nov 2026», de `2026-11-07`. */
export function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return a && m && d ? `${d} ${meses[m - 1]} ${a}` : fecha
}

/**
 * Al estrenar una versión, antes de pisar las skills: guarda la carpeta de cada estilo que esta versión cambia (`cambio`
 * en sus `cards`, las de la versión nueva) y que el usuario ya tenía. `originales`: las huellas de las skills como las
 * trajo la versión de antes (`data/skills-originales.json`), para saber qué de video-base cambió; `nuevas`, la carpeta
 * de las skills de esta. Cada cambio se anota como visto aunque la copia falle: si no, al volver a intentarlo con las
 * skills ya puestas, se guardaría el nuevo como si fuera el de antes. Devuelve los estilos que guardó.
 */
export function guardarAnteriores(o: { cards: Card[]; skills: string; nuevas: string; datos: string; originales: Record<string, string> }): string[] {
  const vistos = leer<Record<string, string>>(join(o.datos, VISTOS)) ?? {}
  const guardados: string[] = []
  for (const card of o.cards) {
    const c = card.cambio
    if (!c || !card.skill || card.tuya || vistos[card.skill] === c.fecha) continue
    vistos[card.skill] = c.fecha
    const carpeta = join(o.skills, card.skill)
    // Una instalación nueva no tiene de antes.
    if (!existsSync(join(carpeta, 'SKILL.md'))) continue
    const destino = join(o.datos, CARPETA, card.skill)
    try {
      rmSync(destino, { recursive: true, force: true })
      cpSync(carpeta, destino, { recursive: true, filter: (r) => sigue(carpeta, r) })
      const anterior: Record<string, unknown> = Object.fromEntries(CAMPOS.filter((k) => card[k] !== undefined).map((k) => [k, card[k]]))
      for (const [k, v] of Object.entries(c.antes ?? {})) {
        if (v === null) delete anterior[k]
        else anterior[k] = v
      }
      const guardado: Guardado = { fecha: c.fecha, texto: c.texto, ...(c.compara ? { compara: c.compara } : {}), card: anterior as Partial<Card>, adaptar: aAdaptar(destino, o.originales, o.nuevas) }
      guardar(join(o.datos, CARPETA, `${card.skill}.json`), JSON.stringify(guardado, null, 2))
      guardados.push(card.skill)
    } catch (error) {
      rmSync(destino, { recursive: true, force: true })
      console.error(`No se pudo guardar el ${card.skill} de antes: ${error instanceof Error ? error.message : error}`)
    }
  }
  mkdirSync(o.datos, { recursive: true })
  guardar(join(o.datos, VISTOS), JSON.stringify(vistos, null, 2))
  return guardados
}

function sigue(raiz: string, ruta: string): boolean {
  const r = relative(raiz, ruta).split(sep).join('/')
  if (!r) return true
  return !r.split('/').some((p) => FUERA.has(p)) && !FUERA_RUTA.some((f) => r === f || r.startsWith(`${f}/`))
}

/**
 * Los archivos de video-base que nombra la skill guardada (`video-base/VOZ.md` o, en sus pasos, `<base>/scripts/huellas.py`)
 * y que la versión nueva trae distintos o ya no trae.
 */
function aAdaptar(carpeta: string, originales: Record<string, string>, nuevas: string): string[] {
  const nombra = new Set<string>()
  const ver = (dir: string) => {
    for (const f of readdirSeguro(dir)) {
      const p = join(dir, f.name)
      if (f.isDirectory()) ver(p)
      else if (/\.(md|py|mjs|cjs|js|ts|tsx|txt|json)$/.test(f.name)) {
        for (const m of readFileSync(p, 'utf8').matchAll(/(?:video-base|<base>)\/([\w./-]+\.[a-z0-9]+)/gi)) if (!m[1].includes('..')) nombra.add(m[1])
      }
    }
  }
  ver(carpeta)
  return [...nombra]
    .filter((a) => {
      const antes = originales[`video-base/${a}`]
      if (!antes) return false
      const nuevo = join(nuevas, 'video-base', ...a.split('/'))
      return !existsSync(nuevo) || huella(nuevo) !== antes
    })
    .sort()
}

/**
 * El aviso de una card de Sloth que cambió: con su copia del de antes si la hay, y si no, el de su `cambio` mientras este
 * usuario no lo haya leído. `null` si no hay nada que avisar.
 */
export function anteriorDe(card: Card, datos: string): EstiloAnterior | null {
  if (!card.skill || card.tuya) return null
  const g = leer<Guardado>(join(datos, CARPETA, `${card.skill}.json`))
  if (g && existsSync(join(datos, CARPETA, card.skill, 'SKILL.md')))
    return { fecha: g.fecha, texto: g.texto, ...(g.compara ? { compara: g.compara } : {}), titulo: tituloDe(card, g.fecha), guardado: true }
  const c = card.cambio
  if (!c || leer<Record<string, string>>(join(datos, LEIDOS))?.[card.skill] === c.fecha) return null
  return { fecha: c.fecha, texto: c.texto, ...(c.compara ? { compara: c.compara } : {}), titulo: tituloDe(card, c.fecha), guardado: false }
}

/** Anota que este usuario ya leyó y contestó el aviso del cambio de `fecha`: ya no vuelve a salir. */
function marcarLeido(skill: string, fecha: string, datos: string) {
  const leidos = leer<Record<string, string>>(join(datos, LEIDOS)) ?? {}
  leidos[skill] = fecha
  mkdirSync(datos, { recursive: true })
  guardar(join(datos, LEIDOS), JSON.stringify(leidos, null, 2))
}

const tituloDe = (card: Pick<Card, 'title'>, fecha: string) => `${card.title} (hasta el ${fechaCorta(fecha)})`

/**
 * Pone el estilo de antes entre los tuyos: su skill en `<skills>/<skill>-<fecha>` (con ese nombre en su SKILL.md, para
 * que no se confunda con el de Sloth) y su card en `tusCards`, basada en el de Sloth (los paquetes de Python que pide).
 * La copia guardada se va: ya es tuya. Devuelve su card y lo de video-base que cambió desde entonces.
 */
export function conservarAnterior(o: { card: Card; datos: string; skills: string; tusCards: string }): { id: string; titulo: string; adaptar: string[] } {
  const { card } = o
  const g = leer<Guardado>(join(o.datos, CARPETA, `${card.skill}.json`))
  const de = join(o.datos, CARPETA, card.skill ?? '')
  if (!card.skill || !g || !existsSync(join(de, 'SKILL.md'))) throw new Error('Ya no está guardado el estilo de antes.')
  const id = `${card.skill}-${g.fecha}`
  const titulo = tituloDe(card, g.fecha)
  const destino = join(o.skills, id)
  if (!existsSync(destino)) {
    cpSync(de, destino, { recursive: true })
    const skill = join(destino, 'SKILL.md')
    writeFileSync(skill, renombrar(readFileSync(skill, 'utf8'), id, `Versión de «${card.title}» de hasta el ${fechaCorta(g.fecha)}, que el usuario conservó al actualizar Sloth; se usa solo desde su card.`))
  }
  // Uno que no se lee no se pisa con solo esta card: se aparta.
  const lista = abrirTusCards(o.tusCards)
  const nueva: Partial<Card> = { ...g.card, id, skill: id, title: titulo, basadoEn: card.skill }
  const i = lista.findIndex((c) => c.id === id)
  if (i >= 0) lista[i] = nueva
  else lista.push(nueva)
  mkdirSync(dirname(o.tusCards), { recursive: true })
  guardar(o.tusCards, JSON.stringify(lista, null, 2) + '\n')
  olvidarAnterior(card, o.datos)
  marcarLeido(card.skill, g.fecha, o.datos)
  return { id, titulo, adaptar: g.adaptar }
}

/** «Usar solo el nuevo», o «Leí toda la especificación» sin copia: se borra la copia, si la hay, y el aviso ya no sale. */
export function olvidarAnterior(card: Card, datos: string) {
  if (!card.skill) return
  const g = leer<Guardado>(join(datos, CARPETA, `${card.skill}.json`))
  rmSync(join(datos, CARPETA, card.skill), { recursive: true, force: true })
  rmSync(join(datos, CARPETA, `${card.skill}.json`), { force: true })
  const fecha = card.cambio?.fecha ?? g?.fecha
  if (fecha) marcarLeido(card.skill, fecha, datos)
}

/** El `name` del frontmatter de un SKILL.md, y su descripción con `prefijo` delante. */
export function renombrar(md: string, nombre: string, prefijo: string): string {
  const fin = md.startsWith('---') ? md.indexOf('\n---', 3) : -1
  if (fin < 0) return `---\nname: ${nombre}\ndescription: ${prefijo}\n---\n\n${md}`
  const cabeza = md
    .slice(0, fin)
    .replace(/^name:.*$/m, `name: ${nombre}`)
    .replace(/^description:\s*(.*)$/m, (_, d: string) => `description: ${JSON.stringify(`${prefijo} ${d.replace(/^["']|["']$/g, '')}`)}`)
  return cabeza + md.slice(fin)
}

function leer<T>(archivo: string): T | null {
  try {
    return JSON.parse(readFileSync(archivo, 'utf8')) as T
  } catch {
    return null
  }
}

function readdirSeguro(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}
