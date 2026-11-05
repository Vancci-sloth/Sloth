import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import type { Card, OrigenEstilo } from '../shared/types.ts'
import { guardar } from './disco.ts'
import { bytes, json as enviar } from './http.ts'
import { huella, nombreCopia } from './originales.ts'

/**
 * Un estilo tuyo, en un archivo para compartirlo (`.sloth-estilo`): su skill y su card, para que otra Sloth lo instale
 * entre sus estilos. Se pasa como archivo o por la comunidad, en la sección Estilos, donde solo sale lo que el creador
 * aprobó (`licencias/src/comunidad.ts`).
 *
 * El archivo es gzip de: 4 bytes con el largo del manifiesto, el manifiesto (JSON) y los archivos uno tras otro, en el
 * orden y con el tamaño que dice. Lo que entra y lo que no:
 * - Solo la carpeta de su skill: ni `video-base` ni otra skill. Sin lo que cada quien junta al usarlo (`PERSONALES`) y sin
 *   lo que se instala o se rehace (`REHECHO`), y solo archivos de los tipos de `TIPOS`: nada de programas.
 * - Solo los paquetes de npm que ya usan los estilos de Sloth (`ajenos`): un estilo no trae dependencias nuevas. Los de
 *   Python son los del estilo del que partió (`basadoEn`, que lee `server/requisitos.ts`).
 * - `sloth`: la versión donde se hizo, que es la mínima para instalarlo. `usa`: la huella de cada archivo de `video-base`
 *   que nombra. Si al instalar alguno ya no es igual, Sloth ofrece adaptarlo a tu versión con «Nuevo estilo».
 * Instalar escribe solo en `<app>/skills/<id>` y en `data/tus-cards.json`. Lo de antes, al actualizar, va a
 * `data/skills-tuyas` como al borrar un estilo.
 */

export const FORMATO = 1
export const EXTENSION = '.sloth-estilo'
export const TIPO = 'application/x-sloth-estilo'

/** Lo más que pesa un paquete ya comprimido (lo mismo topa el Worker) y lo que ocupa abierto. */
export const PESO = 15 * 1024 * 1024
const ABIERTO = 60 * 1024 * 1024
const MAX_ARCHIVOS = 3000

/** Lo que junta quien usa el estilo: sus videos, su banco, sus huellas. Las poses del reel son de su persona. */
const PERSONALES = ['huellas', 'series/banco', 'modelos']
const PERSONALES_DE: Record<string, string[]> = { 'reel-collage': ['personaje'] }
/** Lo que se instala o se rehace solo. */
const REHECHO = new Set(['node_modules', 'out', '__pycache__', '.git', '.cache', '.venv'])
const TIPOS = new Set(['md', 'txt', 'json', 'py', 'mjs', 'cjs', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'woff', 'woff2', 'ttf', 'otf', 'wav', 'mp3', 'm4a', 'ogg', 'glb', 'gltf', 'ps1', 'sh', 'yml', 'yaml', 'csv'])
const SIN_TIPO = new Set(['LICENSE', 'README', 'NOTICE', '.gitkeep', '.gitignore'])
const TEXTO = new Set(['md', 'txt', 'json', 'py', 'mjs', 'cjs', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'svg', 'ps1', 'sh', 'yml', 'yaml', 'csv'])
/** Lo de la card que viaja; `cwd` no: el estilo trabaja donde todos los tuyos. */
const CAMPOS = ['title', 'description', 'icon', 'etapas', 'lote', 'editor', 'modelos', 'voz', 'clips'] as const
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/

export interface Manifiesto {
  formato: number
  id: string
  titulo: string
  /** La versión de Sloth donde se hizo. */
  sloth: string
  basadoEn?: string
  card: Partial<Card>
  /** La huella de cada archivo de video-base que nombra, como era en `sloth`. */
  usa: Record<string, string>
  archivos: { ruta: string; bytes: number }[]
}

/** Los estilos de Sloth que hay aquí: su skill y su carpeta. De ellos salen los paquetes de npm que se permiten. */
export interface DeSloth {
  skill: string
  carpeta: string
}

export class EstiloMalo extends Error {}

const extension = (ruta: string) => (/\.([a-z0-9]+)$/i.exec(ruta)?.[1] ?? '').toLowerCase()
const sirve = (ruta: string) => {
  const nombre = ruta.split('/').at(-1)!
  return SIN_TIPO.has(nombre) || TIPOS.has(extension(nombre))
}

/** Los archivos de una carpeta, con su ruta relativa (con `/`), sin lo que no viaja. */
function archivosDe(carpeta: string, fuera: string[]): string[] {
  const lista: string[] = []
  const ver = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const ruta = relative(carpeta, join(dir, d.name)).split(sep).join('/')
      if (d.isDirectory()) {
        if (!REHECHO.has(d.name) && !d.name.startsWith('_') && !fuera.some((f) => ruta === f || ruta.endsWith(`/${f}`))) ver(join(dir, d.name))
      } else if (d.isFile() && sirve(ruta)) lista.push(ruta)
    }
  }
  ver(carpeta)
  return lista.sort()
}

/**
 * El estilo de Sloth del que partió un estilo tuyo: el que dice su card y, si no lo dice (uno de antes), el que comparte
 * más archivos con él, que «Nuevo estilo» copia uno y lo cambia.
 */
export function baseDe(card: Card, carpeta: string, deSloth: DeSloth[]): string | undefined {
  if (card.basadoEn && deSloth.some((s) => s.skill === card.basadoEn)) return card.basadoEn
  const suyos = new Set(archivosDe(carpeta, []))
  let mejor: { skill: string; n: number } | undefined
  for (const s of deSloth) {
    const n = archivosDe(s.carpeta, []).filter((r) => suyos.has(r)).length
    if (n && (!mejor || n > mejor.n)) mejor = { skill: s.skill, n }
  }
  return mejor?.skill
}

/** Los paquetes de npm que piden sus `package.json` y que ningún estilo de Sloth usa. */
export function ajenos(archivos: Map<string, Buffer>, deSloth: DeSloth[]): string[] {
  const nombres = (texto: string) => {
    try {
      const p = JSON.parse(texto) as Record<string, Record<string, string> | undefined>
      return Object.keys({ ...p.dependencies, ...p.devDependencies, ...p.optionalDependencies, ...p.peerDependencies })
    } catch {
      return []
    }
  }
  const permitidos = new Set(
    deSloth.flatMap((s) => {
      const p = join(s.carpeta, 'plantilla', 'package.json')
      return existsSync(p) ? nombres(readFileSync(p, 'utf8')) : []
    })
  )
  const pide = [...archivos].filter(([r]) => r.split('/').at(-1) === 'package.json').flatMap(([, b]) => nombres(b.toString('utf8')))
  return [...new Set(pide.filter((n) => !permitidos.has(n)))].sort()
}

/** Los archivos de video-base que nombra el estilo y que existen en `base`, con su huella. */
function usaDe(archivos: Map<string, Buffer>, base: string): Record<string, string> {
  const usa: Record<string, string> = {}
  for (const [ruta, datos] of archivos) {
    if (!TEXTO.has(extension(ruta))) continue
    for (const m of datos.toString('utf8').matchAll(/video-base\/([\w.\/-]+\.[a-z0-9]+)/gi)) {
      const archivo = m[1]
      const donde = join(base, ...archivo.split('/'))
      if (!usa[archivo] && !archivo.includes('..') && existsSync(donde) && statSync(donde).isFile()) usa[archivo] = huella(donde)
    }
  }
  return Object.fromEntries(Object.entries(usa).sort(([a], [b]) => a.localeCompare(b)))
}

/** Lo que viaja de la card, sin lo de esta computadora. */
function cardLimpia(card: Partial<Card>): Partial<Card> {
  const limpia: Record<string, unknown> = {}
  for (const k of CAMPOS) if (card[k] !== undefined) limpia[k] = card[k]
  if (typeof limpia.title !== 'string' || !limpia.title.trim()) throw new EstiloMalo('El estilo no tiene título.')
  limpia.title = String(limpia.title).slice(0, 80)
  limpia.description = String(limpia.description ?? '').slice(0, 400)
  if (limpia.etapas !== undefined && !Array.isArray(limpia.etapas)) throw new EstiloMalo('Las etapas del estilo no son una lista.')
  // Lo que `listo` y `muestra` buscan es dentro de la carpeta del video.
  for (const e of (limpia.etapas ?? []) as Record<string, unknown>[]) {
    for (const k of ['listo', 'muestra']) if (typeof e[k] === 'string' && ((e[k] as string).includes('..') || /^([a-z]:|[\\/])/i.test(e[k] as string))) throw new EstiloMalo('Una etapa del estilo busca fuera de su carpeta.')
  }
  return limpia as Partial<Card>
}

/** Empaqueta un estilo tuyo. `carpeta` es su skill; `base`, la carpeta de video-base. */
export function empaquetar(o: { card: Card; carpeta: string; sloth: string; base: string; deSloth: DeSloth[] }): { paquete: Buffer; manifiesto: Manifiesto } {
  const { card } = o
  if (!card.tuya || !card.skill) throw new EstiloMalo('Solo se comparten los estilos tuyos.')
  if (!existsSync(join(o.carpeta, 'SKILL.md'))) throw new EstiloMalo(`La skill de «${card.title}» no tiene SKILL.md.`)
  const basadoEn = baseDe(card, o.carpeta, o.deSloth)
  const rutas = archivosDe(o.carpeta, [...PERSONALES, ...(basadoEn ? (PERSONALES_DE[basadoEn] ?? []) : [])])
  if (rutas.length > MAX_ARCHIVOS) throw new EstiloMalo(`Tiene ${rutas.length} archivos; un estilo lleva hasta ${MAX_ARCHIVOS}.`)
  const archivos = new Map(rutas.map((r) => [r, readFileSync(join(o.carpeta, ...r.split('/')))]))
  const npm = ajenos(archivos, o.deSloth)
  if (npm.length) throw new EstiloMalo(`Usa paquetes de npm que Sloth no trae (${npm.join(', ')}). Un estilo compartido solo usa lo que ya usan los de Sloth.`)
  const manifiesto: Manifiesto = {
    formato: FORMATO,
    id: card.skill,
    titulo: card.title,
    sloth: o.sloth,
    ...(basadoEn ? { basadoEn } : {}),
    card: cardLimpia(card),
    usa: usaDe(archivos, o.base),
    archivos: rutas.map((ruta) => ({ ruta, bytes: archivos.get(ruta)!.length }))
  }
  const cabeza = Buffer.from(JSON.stringify(manifiesto), 'utf8')
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(cabeza.length)
  const paquete = gzipSync(Buffer.concat([largo, cabeza, ...rutas.map((r) => archivos.get(r)!)]), { level: 9 })
  if (paquete.length > PESO) throw new EstiloMalo(`Pesa ${mb(paquete.length)}; un estilo pesa hasta ${mb(PESO)}. Quita de su carpeta lo que no haga falta (videos de ejemplo, imágenes grandes).`)
  return { paquete, manifiesto }
}

const mb = (b: number) => `${(b / 1024 ** 2).toFixed(1)} MB`

/** Abre un paquete y comprueba que es un estilo y que no escribe fuera de su carpeta. */
export function leerPaquete(paquete: Buffer): { manifiesto: Manifiesto; archivos: Map<string, Buffer> } {
  if (paquete.length > PESO) throw new EstiloMalo(`Pesa más de ${mb(PESO)}: no es un estilo de Sloth.`)
  let todo: Buffer
  try {
    todo = gunzipSync(paquete, { maxOutputLength: ABIERTO })
  } catch {
    throw new EstiloMalo('Ese archivo no es un estilo de Sloth, o está dañado.')
  }
  const largo = todo.length >= 4 ? todo.readUInt32BE(0) : 0
  let m: Manifiesto
  try {
    m = JSON.parse(todo.subarray(4, 4 + largo).toString('utf8'))
  } catch {
    throw new EstiloMalo('Ese archivo no es un estilo de Sloth, o está dañado.')
  }
  if (typeof m?.formato !== 'number') throw new EstiloMalo('Ese archivo no es un estilo de Sloth.')
  if (m.formato > FORMATO) throw new EstiloMalo('Ese estilo es de una Sloth más nueva: actualiza la tuya para instalarlo.')
  if (typeof m.id !== 'string' || !ID.test(m.id) || m.id.length > 60) throw new EstiloMalo('El nombre del estilo no es válido.')
  if (typeof m.sloth !== 'string' || !/^\d+\.\d+\.\d+$/.test(m.sloth)) throw new EstiloMalo('El estilo no dice de qué versión de Sloth es.')
  if (!Array.isArray(m.archivos) || m.archivos.length > MAX_ARCHIVOS) throw new EstiloMalo('La lista de archivos del estilo no es válida.')
  const archivos = new Map<string, Buffer>()
  let desde = 4 + largo
  for (const a of m.archivos) {
    const ruta = String(a?.ruta ?? '')
    const partes = ruta.split('/')
    if (!ruta || ruta.includes('\\') || ruta.includes(':') || partes.some((p) => !p || p === '.' || p === '..') || !sirve(ruta))
      throw new EstiloMalo(`El estilo trae un archivo que no se instala: ${ruta.slice(0, 120)}`)
    if (!Number.isInteger(a.bytes) || a.bytes < 0 || desde + a.bytes > todo.length) throw new EstiloMalo('El estilo está dañado: faltan archivos.')
    archivos.set(ruta, todo.subarray(desde, desde + a.bytes))
    desde += a.bytes
  }
  if (!archivos.has('SKILL.md')) throw new EstiloMalo('El estilo no trae su SKILL.md.')
  m.card = cardLimpia(m.card ?? {})
  m.titulo = m.card.title!
  if (typeof m.usa !== 'object' || !m.usa) m.usa = {}
  if (m.basadoEn !== undefined && (typeof m.basadoEn !== 'string' || !ID.test(m.basadoEn))) delete m.basadoEn
  return { manifiesto: m, archivos }
}

/** -1, 0 o 1, como `a` frente a `b` (versiones x.y.z). */
export function compararVersion(a: string, b: string): number {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1
  return 0
}

/** Los archivos de video-base que el estilo usa y que en esta Sloth ya no son como cuando se hizo (o ya no están). */
export function cambiadosDesde(m: Manifiesto, base: string): string[] {
  return Object.entries(m.usa)
    .filter(([archivo, h]) => {
      const donde = join(base, ...archivo.split('/'))
      return archivo.includes('..') || !existsSync(donde) || huella(donde) !== h
    })
    .map(([archivo]) => archivo)
}

export interface Instalado {
  id: string
  titulo: string
  /** Si ya lo tenías y se puso al día. */
  actualizado: boolean
  /** Lo de video-base que cambió desde la Sloth donde se hizo: si hay algo, conviene adaptarlo. */
  adaptar: string[]
  sloth: string
}

/**
 * Instala un paquete entre tus estilos. Uno que ya tienes con el mismo nombre se pone al día si vino de lo mismo (la misma
 * publicación, o los dos de un archivo); si es tuyo o de otro, no se toca.
 */
export function instalar(o: {
  paquete: Buffer
  app: string
  tusCards: string
  cards: Card[]
  sloth: string
  base: string
  deSloth: DeSloth[]
  origen?: Omit<OrigenEstilo, 'sloth'>
}): Instalado {
  const { manifiesto: m, archivos } = leerPaquete(o.paquete)
  if (compararVersion(o.sloth, m.sloth) < 0) throw new EstiloMalo(`Este estilo se hizo con Sloth ${m.sloth} y tienes la ${o.sloth}: actualiza Sloth para instalarlo.`)
  const npm = ajenos(archivos, o.deSloth)
  if (npm.length) throw new EstiloMalo(`Usa paquetes de npm que Sloth no trae (${npm.join(', ')}). No se instala.`)
  const ya = o.cards.find((c) => c.id === m.id || c.skill === m.id)
  const mismo = !!ya?.tuya && !!ya.origen && ya.skill === m.id && (ya.origen.publicacion ?? '') === (o.origen?.publicacion ?? '')
  if (ya && !mismo) throw new EstiloMalo(ya.tuya ? `Ya tienes un estilo «${ya.title}» con el nombre ${m.id}. Bórralo o cámbiale el nombre para instalar este.` : `${m.id} es un estilo de Sloth.`)
  const skills = join(o.app, 'skills')
  const destino = join(skills, m.id)
  if (!mismo && existsSync(destino)) throw new EstiloMalo(`Ya hay una skill ${m.id} en tu Sloth. Bórrala o cámbiale el nombre para instalar este.`)

  // Se escribe aparte y entra de una vez: un estilo a medias no se ve nunca.
  const nuevo = join(skills, `.instalando-${m.id}`)
  rmSync(nuevo, { recursive: true, force: true })
  try {
    for (const [ruta, datos] of archivos) {
      const a = join(nuevo, ...ruta.split('/'))
      mkdirSync(dirname(a), { recursive: true })
      writeFileSync(a, datos)
    }
    if (mismo && existsSync(destino)) {
      const copia = join(o.app, 'data', 'skills-tuyas', nombreCopia(`antes de actualizar ${m.id}`))
      mkdirSync(copia, { recursive: true })
      renameSync(destino, join(copia, m.id))
    }
    renameSync(nuevo, destino)
  } catch (error) {
    rmSync(nuevo, { recursive: true, force: true })
    if (error instanceof EstiloMalo) throw error
    throw new EstiloMalo(`No se pudo instalar: ${error instanceof Error ? error.message : error}. Si algo tiene abierto un archivo del estilo, ciérralo y vuelve a intentarlo.`)
  }

  const card = { ...m.card, id: m.id, skill: m.id, ...(m.basadoEn ? { basadoEn: m.basadoEn } : {}), origen: { ...o.origen, sloth: m.sloth } } as Partial<Card>
  const lista = existsSync(o.tusCards) ? (JSON.parse(readFileSync(o.tusCards, 'utf8')) as Partial<Card>[]) : []
  const i = lista.findIndex((c) => c.id === m.id)
  if (i >= 0) lista[i] = card
  else lista.push(card)
  mkdirSync(dirname(o.tusCards), { recursive: true })
  guardar(o.tusCards, JSON.stringify(lista, null, 2) + '\n')
  return { id: m.id, titulo: m.titulo, actualizado: mismo, adaptar: cambiadosDesde(m, o.base), sloth: m.sloth }
}

/**
 * Lo de esta computadora: tus estilos, guardar uno como archivo, instalar el que llega y abrir uno para revisarlo.
 * - `GET /api/estilos`: tus estilos, con de dónde vino cada uno (`origen`).
 * - `POST /api/estilos/<card>/archivo`: lo guarda en Descargas como `<id>.sloth-estilo`. Da `{ruta}`.
 * - `POST /api/estilos/importar`, con el archivo de cuerpo: lo instala (`Instalado`).
 * Lo de la comunidad (subirlo, instalarlo de una publicación, revisarlo) está en `server/comunidad.ts`, que usa este.
 */
export function estilos(app: string, cards: () => Card[]) {
  const tusCards = join(app, 'data', 'tus-cards.json')
  const sloth = (JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')) as { version: string }).version
  const skills = join(app, 'skills')
  const base = () => join(skills, 'video-base')
  const deSloth = (): DeSloth[] =>
    cards()
      .filter((c) => !c.tuya && c.skill && c.etapas?.length && existsSync(join(skills, c.skill)))
      .map((c) => ({ skill: c.skill!, carpeta: join(skills, c.skill!) }))

  function empaquetarCard(id: string) {
    const card = cards().find((c) => c.id === id)
    if (!card) throw new EstiloMalo('Ese estilo ya no está.')
    return empaquetar({ card, carpeta: join(skills, card.skill ?? id), sloth, base: base(), deSloth: deSloth() })
  }

  const instalarPaquete = (paquete: Buffer, origen?: Omit<OrigenEstilo, 'sloth'>) =>
    instalar({ paquete, app, tusCards, cards: cards(), sloth, base: base(), deSloth: deSloth(), origen })

  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const ruta = url.pathname
    if (ruta !== '/api/estilos' && !ruta.startsWith('/api/estilos/')) return false
    const metodo = req.method ?? 'GET'
    try {
      if (ruta === '/api/estilos' && metodo === 'GET') {
        return enviar(res, 200, cards().filter((c) => c.tuya).map((c) => ({ id: c.id, title: c.title, description: c.description, icon: c.icon, ...(c.origen ? { origen: c.origen } : {}) })))
      }
      const archivo = /^\/api\/estilos\/([\w-]+)\/archivo$/.exec(ruta)
      if (archivo && metodo === 'POST') {
        const { paquete, manifiesto } = empaquetarCard(archivo[1])
        const carpeta = join(homedir(), 'Downloads')
        mkdirSync(carpeta, { recursive: true })
        const destino = join(carpeta, `${manifiesto.id}${EXTENSION}`)
        writeFileSync(destino, paquete)
        return enviar(res, 200, { ruta: destino })
      }
      if (ruta === '/api/estilos/importar' && metodo === 'POST') return enviar(res, 200, instalarPaquete(await bytes(req)))
      return false
    } catch (e) {
      return enviar(res, e instanceof EstiloMalo ? 400 : 500, { error: e instanceof Error ? e.message : String(e) })
    }
  }

  return { api, empaquetarCard, instalarPaquete }
}

/** Abre un paquete en `destino`, sin instalarlo: para leerlo antes de aprobarlo. */
export function desempacar(paquete: Buffer, destino: string): Manifiesto {
  const { manifiesto, archivos } = leerPaquete(paquete)
  rmSync(destino, { recursive: true, force: true })
  for (const [ruta, datos] of archivos) {
    const a = join(destino, ...ruta.split('/'))
    mkdirSync(dirname(a), { recursive: true })
    writeFileSync(a, datos)
  }
  writeFileSync(join(destino, 'estilo.json'), JSON.stringify({ ...manifiesto, archivos: undefined }, null, 2) + '\n')
  return manifiesto
}
