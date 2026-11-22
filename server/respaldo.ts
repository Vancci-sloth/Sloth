/**
 * Tu Sloth en otra computadora (ADR 0020). Con su clave, cada Sloth guarda sola una copia de lo suyo en la nube del cobro
 * (`licencias/src/respaldo.ts`), y al escribir esa clave en otra computadora, o al abrir una que ya la tenía, Sloth ofrece
 * traerla (`web/src/Respaldo.tsx`). Es de todos los que tienen clave, también la de la cuenta gratis.
 *
 * Qué entra en la copia (`juntar`):
 * - Tus estilos: sus cards (`data/tus-cards.json`) y sus skills enteras, con lo que juntaste al usarlos (huellas, banco,
 *   poses), sin lo que se rehace (`node_modules`, `out`) ni programas, como al compartirlos (`archivosDe`, estilos.ts).
 * - Tus chats (`data/sessions`), del más nuevo al más viejo, los que quepan.
 * - «Sobre ti» y las marcas de tus canales (`marca.json` y `marcas/` de la carpeta de trabajo de cada estilo).
 * No entran los videos ni sus carpetas (pesan GB), los modelos 3D, ni nada con lo que se entra a algo: las cuentas de los
 * agentes, de Google y de las redes, y las llaves de API se vuelven a conectar en cada computadora.
 *
 * El paquete es como el de un estilo: gzip de 4 bytes con el largo del manifiesto, el manifiesto (JSON) y los archivos uno
 * tras otro. Pesa hasta `PESO_RESPALDO`: si no cabe, van menos chats y, si aún no, los estilos sin lo personal.
 *
 * Traerla (`traer`) no pisa nada: un estilo o un chat que ya está aquí se queda como está, «Sobre ti» solo entra si aquí
 * está vacío y una marca, si aquí no hay una con ese nombre. Un chat que llega no tiene sesión del agente que retomar: su
 * siguiente mensaje abre una con el resumen de lo hablado (`resumir`, como un relevo), en la carpeta de su estilo de aquí.
 *
 * La copia sube sola en la app que se vende: a los dos minutos de abrir y cada `MIRAR`, si algo cambió (`huellaDe`, sin
 * leer los archivos) y pasó `CADA` desde la última; sin cambios, se renueva al mes para que el cobro no la borre.
 * - `GET /api/respaldo`: cómo va y las copias de tus otras computadoras (`EstadoRespaldo`). Con `?clave` (recién
 *   escrita), `preguntar` es la primera que trae algo; sin él, la primera con un estilo que aquí no está y por la que aún
 *   no se preguntó.
 * - `POST /api/respaldo/traer` `{equipo}`: la baja y la pone aquí (`Traido`).
 * - `POST /api/respaldo/luego` `{equipo}`: «Ahora no»: no se vuelve a preguntar sola por esa computadora.
 * - `POST /api/respaldo/guardar` `{guardar}`: enciende o apaga la copia de esta computadora; apagada, se borra de la nube.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { gunzip, gzip } from 'node:zlib'
import { type EstadoRespaldo, PESO_RESPALDO, type RespaldoNube, type ResumenRespaldo, type Traido } from '../shared/respaldo.ts'
import type { Card, SessionMeta } from '../shared/types.ts'
import { VENTA } from '../shared/venta.ts'
import { guardar } from './disco.ts'
import { archivosDe, PERSONALES } from './estilos.ts'
import { cuerpo, json as enviar } from './http.ts'
import { COBRO } from './licencia.ts'

export const FORMATO = 1
/** Lo más que se lee para una copia, antes de comprimir. */
const CRUDO = 80 * 1024 * 1024
/** Lo más que ocupa abierta una copia que llega. */
const ABIERTO = 2 * CRUDO
const MAX_ARCHIVOS = 20_000
/** Lo personal de cualquier estilo, que se queda fuera si la copia no cabe con ello. */
const PERSONAL = [...PERSONALES, 'personaje']
/** Cada cuánto se mira si hay algo nuevo que guardar, lo menos que pasa entre dos copias y cuándo se renueva una igual. */
const MIRAR = 3 * 3600_000
const CADA = 3600_000
const RENOVAR = 30 * 24 * 3600_000
/** Los estilos que caben en el resumen, que viaja en la dirección. */
const EN_RESUMEN = 40

const NUBE = process.env.SLOTH_COBRO || COBRO
const SIN_CONEXION = 'No hay conexión con la nube de Sloth. Revisa tu internet e intenta otra vez.'
const SIN_CUENTA = 'Para traer tu Sloth de otra computadora, escribe tu clave de Sloth.'

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
const HILO = /^[a-z0-9]{6,24}$/
const comprimir = promisify(gzip)
const abrir = promisify(gunzip)

export class RespaldoMalo extends Error {}

class Rechazo extends Error {
  status: number
  constructor(status: number, mensaje: string) {
    super(mensaje)
    this.status = status
  }
}

/** De dónde sale la copia de esta computadora. */
export interface Fuentes {
  app: string
  /** Las cards de aquí, con su carpeta de trabajo (`cwd`). */
  cards: Card[]
  /** Los hilos, del más nuevo al más viejo. */
  hilos: Pick<SessionMeta, 'id'>[]
  /** La versión de Sloth. */
  sloth: string
  /** El nombre de esta computadora. */
  nombre: string
}

export interface ManifiestoRespaldo extends ResumenRespaldo {
  formato: number
  sloth: string
  nombre: string
  fecha: string
  archivos: { ruta: string; bytes: number }[]
}

/** Un archivo de la copia: dónde va en ella y de dónde sale (del disco, o ya leído). */
interface Entrada {
  ruta: string
  archivo?: string
  datos?: Buffer
  bytes: number
  mtime: number
}

function entrada(ruta: string, archivo: string): Entrada | undefined {
  try {
    const s = statSync(archivo)
    return s.isFile() ? { ruta, archivo, bytes: s.size, mtime: Math.floor(s.mtimeMs) } : undefined
  } catch {
    return
  }
}

/** Lo que entra en la copia, sin leerlo: lo de siempre (`fijas`) y cada chat con sus dos archivos. */
function juntar(f: Fuentes, fuera: string[] = []): { fijas: Entrada[]; chats: Entrada[][]; resumen: ResumenRespaldo } {
  const fijas: Entrada[] = []
  const poner = (e?: Entrada) => e && fijas.push(e)

  // Tus estilos: sus cards como están en tus-cards.json y la skill de cada uno, si no es la de un estilo de Sloth.
  const tuyas = f.cards.filter((c) => c.tuya && ID.test(c.id))
  let crudas: Partial<Card>[] = []
  try {
    crudas = JSON.parse(readFileSync(join(f.app, 'data', 'tus-cards.json'), 'utf8'))
  } catch {}
  const suyas = (Array.isArray(crudas) ? crudas : []).filter((c) => tuyas.some((t) => t.id === c?.id))
  if (suyas.length) {
    const datos = Buffer.from(`${JSON.stringify(suyas, null, 2)}\n`)
    fijas.push({ ruta: 'tus-cards.json', datos, bytes: datos.length, mtime: 0 })
  }
  const deSloth = new Set(f.cards.filter((c) => !c.tuya).map((c) => c.skill ?? c.id))
  for (const skill of new Set(tuyas.map((c) => c.skill ?? c.id))) {
    const carpeta = join(f.app, 'skills', skill)
    if (deSloth.has(skill) || !ID.test(skill) || !existsSync(join(carpeta, 'SKILL.md'))) continue
    for (const r of archivosDe(carpeta, fuera)) poner(entrada(`skills/${skill}/${r}`, join(carpeta, ...r.split('/'))))
  }

  poner(entrada('sobre-ti.json', join(f.app, 'data', 'sobre-ti.json')))

  // Las marcas de tus canales, en la carpeta de trabajo de cada estilo.
  for (const c of f.cards) {
    if (!c.etapas?.length || !ID.test(c.id) || !c.cwd) continue
    poner(entrada(`marcas/${c.id}/marca.json`, join(c.cwd, 'marca.json')))
    let nombres: string[] = []
    try {
      nombres = readdirSync(join(c.cwd, 'marcas'))
    } catch {}
    for (const n of nombres) if (marcaBuena(n)) poner(entrada(`marcas/${c.id}/marcas/${n}`, join(c.cwd, 'marcas', n)))
  }

  const chats: Entrada[][] = []
  for (const h of f.hilos) {
    if (!HILO.test(h.id)) continue
    const meta = entrada(`chats/${h.id}.json`, join(f.app, 'data', 'sessions', `${h.id}.json`))
    const registro = entrada(`chats/${h.id}.jsonl`, join(f.app, 'data', 'sessions', `${h.id}.jsonl`))
    if (meta) chats.push(registro ? [meta, registro] : [meta])
  }
  return { fijas, chats, resumen: { estilos: tuyas.slice(0, EN_RESUMEN).map((c) => ({ id: c.id, titulo: c.title })), chats: chats.length } }
}

const marcaBuena = (nombre: string) => /^[^\\/:]{1,80}\.json$/.test(nombre) && !nombre.startsWith('.')

/**
 * La huella de lo que entraría en la copia, sin leer los archivos (su ruta, su tamaño y su fecha): si es la de la última
 * que subió, no hay nada nuevo que guardar. Vacía si no hay nada que copiar.
 */
export function huellaDe(f: Fuentes): string {
  const { fijas, chats } = juntar(f)
  const todas = [...fijas, ...chats.flat()]
  if (!todas.length) return ''
  const h = createHash('sha256')
  for (const e of todas) h.update(`${e.ruta}\0${e.bytes}\0${e.mtime}\0`).update(e.datos ?? '')
  return h.digest('hex')
}

/** Arma la copia de esta computadora. Si no cabe en `tope`, van menos chats y, si aún no, los estilos sin lo personal. */
export async function armar(f: Fuentes, tope = PESO_RESPALDO): Promise<{ paquete: Buffer; manifiesto: ManifiestoRespaldo }> {
  for (const fuera of [[], PERSONAL]) {
    const { fijas, chats, resumen } = juntar(f, fuera)
    const peso = (es: Entrada[]) => es.reduce((n, e) => n + e.bytes, 0)
    let crudo = peso(fijas)
    if (crudo > CRUDO || fijas.length > MAX_ARCHIVOS) continue
    let n = 0
    while (n < chats.length && crudo + peso(chats[n]) <= CRUDO && fijas.length + 2 * (n + 1) <= MAX_ARCHIVOS) crudo += peso(chats[n++])
    for (;;) {
      const leidos: { ruta: string; datos: Buffer }[] = []
      for (const e of [...fijas, ...chats.slice(0, n).flat()]) {
        // Uno que se borró mientras tanto (un chat eliminado) no va.
        const datos = e.datos ?? (await readFile(e.archivo!).catch(() => undefined))
        if (datos) leidos.push({ ruta: e.ruta, datos })
      }
      const manifiesto: ManifiestoRespaldo = {
        formato: FORMATO,
        sloth: f.sloth,
        nombre: f.nombre,
        fecha: new Date().toISOString(),
        estilos: resumen.estilos,
        chats: n,
        archivos: leidos.map((l) => ({ ruta: l.ruta, bytes: l.datos.length }))
      }
      const cabeza = Buffer.from(JSON.stringify(manifiesto), 'utf8')
      const largo = Buffer.alloc(4)
      largo.writeUInt32BE(cabeza.length)
      const paquete = await comprimir(Buffer.concat([largo, cabeza, ...leidos.map((l) => l.datos)]))
      if (paquete.length <= tope) return { paquete, manifiesto }
      if (!n) break
      n = Math.floor(n / 2)
    }
  }
  throw new RespaldoMalo(`Tus estilos pesan más de ${Math.round(tope / 1024 ** 2)} MB, lo más que lleva la copia en la nube. Quita de sus carpetas lo que no haga falta (videos de ejemplo, imágenes grandes).`)
}

/** Si la ruta es de las que lleva una copia y no sale de su sitio. */
function rutaBuena(ruta: string): boolean {
  const partes = ruta.split('/')
  if (!ruta || ruta.includes('\\') || ruta.includes(':') || partes.some((p) => !p || p === '.' || p === '..')) return false
  if (ruta === 'tus-cards.json' || ruta === 'sobre-ti.json') return true
  if (partes[0] === 'skills') return partes.length >= 3 && ID.test(partes[1])
  if (partes[0] === 'marcas') return ID.test(partes[1] ?? '') && ((partes.length === 3 && partes[2] === 'marca.json') || (partes.length === 4 && partes[2] === 'marcas' && marcaBuena(partes[3])))
  if (partes[0] === 'chats') return partes.length === 2 && /^[a-z0-9]{6,24}\.jsonl?$/.test(partes[1])
  return false
}

/** Abre una copia y comprueba que lo es y que nada en ella escribe fuera de su sitio. */
export async function leer(paquete: Buffer): Promise<{ manifiesto: ManifiestoRespaldo; archivos: Map<string, Buffer> }> {
  const mala = new RespaldoMalo('Esa copia no se puede leer. La otra computadora guarda una nueva en cuanto abras Sloth ahí.')
  let todo: Buffer
  try {
    todo = await abrir(paquete, { maxOutputLength: ABIERTO })
  } catch {
    throw mala
  }
  const largo = todo.length >= 4 ? todo.readUInt32BE(0) : 0
  let m: ManifiestoRespaldo
  try {
    m = JSON.parse(todo.subarray(4, 4 + largo).toString('utf8'))
  } catch {
    throw mala
  }
  if (typeof m?.formato !== 'number' || !Array.isArray(m.archivos) || m.archivos.length > MAX_ARCHIVOS) throw mala
  if (m.formato > FORMATO) throw new RespaldoMalo('Esa copia es de una Sloth más nueva: actualiza esta para traerla.')
  const archivos = new Map<string, Buffer>()
  let desde = 4 + largo
  for (const a of m.archivos) {
    const ruta = String(a?.ruta ?? '')
    if (!rutaBuena(ruta) || !Number.isInteger(a.bytes) || a.bytes < 0 || desde + a.bytes > todo.length) throw mala
    archivos.set(ruta, todo.subarray(desde, desde + a.bytes))
    desde += a.bytes
  }
  return { manifiesto: m, archivos }
}

/** Dónde se pone lo que llega. */
export interface Destino {
  app: string
  /** Las cards de aquí, releídas cada vez: cambian al entrar los estilos. */
  cards(): Card[]
  hilos: { tiene(id: string): boolean; poner(meta: SessionMeta, registro: string): boolean }
  sobreTi: { leer(): string; guardar(texto: string): void }
}

/** Pone aquí lo de una copia que aquí no está. Nada de lo que ya hay se toca. */
export async function traer(paquete: Buffer, d: Destino): Promise<Traido> {
  const { manifiesto, archivos } = await leer(paquete)
  const traido: Traido = { estilos: [], chats: 0, sobreTi: false, marcas: 0 }
  const json = <T>(ruta: string): T | undefined => {
    try {
      return JSON.parse(archivos.get(ruta)!.toString('utf8')) as T
    } catch {
      return
    }
  }

  // Los estilos: su skill entra entera de una vez y su card, a tus-cards.json.
  const llegan = json<Partial<Card>[]>('tus-cards.json')
  const aqui = d.cards()
  const skills = join(d.app, 'skills')
  const nuevas: Partial<Card>[] = []
  for (const c of Array.isArray(llegan) ? llegan : []) {
    const skill = c?.skill ?? c?.id
    if (typeof c?.id !== 'string' || !ID.test(c.id) || typeof skill !== 'string' || !ID.test(skill) || typeof c.title !== 'string') continue
    if (aqui.some((x) => x.id === c.id) || nuevas.some((x) => x.id === c.id)) continue
    const suyos = [...archivos].filter(([r]) => r.startsWith(`skills/${skill}/`))
    const destino = join(skills, skill)
    if (suyos.length) {
      // Una skill con ese nombre que aquí ya es de otra cosa no se pisa; la de un estilo que llegó antes en esta copia, sí vale.
      if (existsSync(destino) && !nuevas.some((x) => (x.skill ?? x.id) === skill)) continue
      if (!existsSync(destino)) {
        const nuevo = join(skills, `.trayendo-${skill}`)
        rmSync(nuevo, { recursive: true, force: true })
        try {
          for (const [ruta, datos] of suyos) {
            const a = join(nuevo, ...ruta.split('/').slice(2))
            mkdirSync(dirname(a), { recursive: true })
            writeFileSync(a, datos)
          }
          renameSync(nuevo, destino)
        } catch (error) {
          rmSync(nuevo, { recursive: true, force: true })
          throw new RespaldoMalo(`No se pudo traer el estilo «${c.title}»: ${error instanceof Error ? error.message : error}`)
        }
      }
    } else if (!existsSync(destino)) continue
    // La carpeta de la otra computadora no viaja: trabaja donde todos los tuyos.
    const { cwd, tuya: _, ...card } = c as Partial<Card> & { tuya?: boolean }
    nuevas.push({ ...card, ...(cwd?.includes('{app}') ? { cwd } : {}) })
    traido.estilos.push(c.title)
  }
  if (nuevas.length) {
    const tusCards = join(d.app, 'data', 'tus-cards.json')
    let lista: Partial<Card>[] = []
    try {
      lista = JSON.parse(readFileSync(tusCards, 'utf8'))
    } catch {}
    mkdirSync(dirname(tusCards), { recursive: true })
    guardar(tusCards, `${JSON.stringify([...(Array.isArray(lista) ? lista : []), ...nuevas], null, 2)}\n`)
  }

  const sobre = json<{ texto?: unknown }>('sobre-ti.json')?.texto
  if (typeof sobre === 'string' && sobre.trim() && !d.sobreTi.leer()) {
    d.sobreTi.guardar(sobre)
    traido.sobreTi = true
  }

  const cards = d.cards()
  for (const [ruta, datos] of archivos) {
    if (!ruta.startsWith('marcas/')) continue
    const [, id, ...resto] = ruta.split('/')
    const cwd = cards.find((c) => c.id === id)?.cwd
    if (!cwd || existsSync(join(cwd, ...resto))) continue
    mkdirSync(dirname(join(cwd, ...resto)), { recursive: true })
    writeFileSync(join(cwd, ...resto), datos)
    traido.marcas++
  }

  for (const ruta of archivos.keys()) {
    const id = /^chats\/([a-z0-9]+)\.json$/.exec(ruta)?.[1]
    const meta = id && json<SessionMeta>(ruta)
    if (!id || !meta || meta.id !== id || d.hilos.tiene(id)) continue
    const card = cards.find((c) => c.id === meta.cardId)
    if (!card || typeof meta.title !== 'string' || typeof meta.model !== 'string' || typeof meta.updatedAt !== 'number') continue
    // Sin lo de la otra computadora: su agente, lo que corría de fondo y el video del lote que esperaba turno (que aquí arrancaría solo).
    const { providerSessionId, conLlave: _, background: __, pendiente: ___, retomas: ____, vieneDe: _____, ...resto } = meta
    const lineas = [(archivos.get(`chats/${id}.jsonl`)?.toString('utf8') ?? '').replace(/\n*$/, '')]
    if (meta.running) lineas.push(JSON.stringify({ t: 'turn_end', at: Date.now(), ok: false, error: 'seguía trabajando en la otra computadora cuando se guardó la copia.' }))
    lineas.push(JSON.stringify({ t: 'info', text: `Este chat viene de «${manifiesto.nombre || 'tu otra computadora'}». Sus videos y archivos se quedaron allá${providerSessionId ? '; tu próximo mensaje sigue desde un resumen de lo hablado' : ''}.` }))
    const registro = `${lineas.filter(Boolean).join('\n')}\n`
    if (d.hilos.poner({ ...resto, cwd: card.cwd, running: false, ...(providerSessionId ? { resumir: true } : {}) }, registro)) traido.chats++
  }
  return traido
}

interface Opciones {
  app: string
  cards(): Card[]
  sessions: { list(): SessionMeta[]; meta(id: string): SessionMeta | undefined; traer(meta: SessionMeta, registro: string): boolean }
  /** La clave activa de esta computadora (`credencial` de `server/licencia.ts`). */
  credencial(): Promise<{ clave: string; equipo: string } | undefined>
  sobreTi: Destino['sobreTi']
}

/** `data/respaldo.json`. */
interface Guardado {
  /** `false` si se apagó la copia de esta computadora. */
  guardar?: boolean
  /** La huella (`huellaDe`) y la fecha de la última que subió. */
  huella?: string
  subido?: string
  error?: string
  /** Las computadoras por cuya copia ya se preguntó. */
  preguntado?: Record<string, string>
}

export function respaldo(o: Opciones) {
  const archivo = join(o.app, 'data', 'respaldo.json')
  const sloth = (JSON.parse(readFileSync(join(o.app, 'package.json'), 'utf8')) as { version: string }).version
  let g: Guardado = {}
  try {
    g = JSON.parse(readFileSync(archivo, 'utf8'))
  } catch {}

  function anotar(cambio: Guardado) {
    g = { ...g, ...cambio }
    mkdirSync(dirname(archivo), { recursive: true })
    guardar(archivo, `${JSON.stringify(g, null, 2)}\n`)
  }

  const fuentes = (): Fuentes => ({ app: o.app, cards: o.cards(), hilos: o.sessions.list(), sloth, nombre: hostname() })

  async function nube(c: { clave: string; equipo: string }, ruta: string, init: { metodo?: string; cuerpo?: Buffer } = {}): Promise<Response> {
    let r: Response
    try {
      r = await fetch(`${NUBE}${ruta}`, {
        method: init.metodo ?? 'GET',
        headers: { 'x-sloth-clave': c.clave, 'x-sloth-equipo': c.equipo, ...(init.cuerpo ? { 'content-type': 'application/octet-stream' } : {}) },
        body: init.cuerpo ? new Uint8Array(init.cuerpo) : undefined,
        // Una copia tarda en subir y en bajar.
        signal: AbortSignal.timeout(init.cuerpo || /^\/respaldo\/./.test(ruta) ? 300_000 : 30_000)
      })
    } catch {
      throw new Rechazo(502, SIN_CONEXION)
    }
    if (!r.ok) throw new Rechazo(r.status, ((await r.json().catch(() => ({}))) as { error?: string }).error ?? `La nube de Sloth respondió ${r.status}.`)
    return r
  }

  let subiendo: Promise<void> | undefined
  /** Sube la copia de esta computadora si hay algo nuevo que guardar. Una a la vez. */
  function subir(): Promise<void> {
    return (subiendo ??= (async () => {
      const c = await o.credencial()
      if (!c || g.guardar === false) return
      const f = fuentes()
      const huella = huellaDe(f)
      const hace = g.subido ? Date.now() - Date.parse(g.subido) : Infinity
      if (!huella || hace < CADA || (huella === g.huella && hace < RENOVAR)) return
      try {
        const { paquete, manifiesto } = await armar(f)
        const resumen: ResumenRespaldo = { estilos: manifiesto.estilos, chats: manifiesto.chats }
        await nube(c, `/respaldo?nombre=${encodeURIComponent(f.nombre)}&resumen=${encodeURIComponent(JSON.stringify(resumen))}`, { metodo: 'PUT', cuerpo: paquete })
        anotar({ huella, subido: new Date().toISOString(), error: undefined })
      } catch (e) {
        // «Hace un momento» (429) no es un error: la siguiente va sola.
        if (!(e instanceof Rechazo && e.status === 429)) anotar({ error: e instanceof Error ? e.message : String(e) })
      }
    })().finally(() => (subiendo = undefined)))
  }

  if (VENTA) {
    setTimeout(() => void subir(), 120_000).unref()
    setInterval(() => void subir(), MIRAR).unref()
  }

  const otrosDe = async (c: { clave: string; equipo: string }) =>
    ((await (await nube(c, '/respaldo')).json()) as { respaldos: RespaldoNube[] }).respaldos.filter((r) => !r.esta && (r.estilos.length || r.chats))

  let trayendo = false

  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const ruta = url.pathname
    if (ruta !== '/api/respaldo' && !ruta.startsWith('/api/respaldo/')) return false
    const metodo = req.method ?? 'GET'
    try {
      const c = await o.credencial()
      if (ruta === '/api/respaldo' && metodo === 'GET') {
        const estado: EstadoRespaldo = { cuenta: !!c, guardar: g.guardar !== false, subido: g.subido, error: g.error, otros: [] }
        if (!c) return enviar(res, 200, estado)
        try {
          estado.otros = await otrosDe(c)
        } catch (e) {
          return enviar(res, 200, { ...estado, error: estado.error ?? (e instanceof Error ? e.message : String(e)) })
        }
        const reciente = url.searchParams.has('clave')
        const aqui = new Set(o.cards().map((x) => x.id))
        estado.preguntar = estado.otros.find((r) => reciente || (!g.preguntado?.[r.equipo] && r.estilos.some((s) => !aqui.has(s.id))))
        // Con la clave recién escrita, esta computadora empieza a guardar la suya.
        if (reciente) void subir()
        return enviar(res, 200, estado)
      }
      if (metodo !== 'POST') return false
      const pedido = await cuerpo<{ equipo?: string; guardar?: boolean }>(req)
      const equipo = String(pedido.equipo ?? '')
      if (ruta === '/api/respaldo/luego' && /^[\w-]{8,64}$/.test(equipo)) {
        anotar({ preguntado: { ...g.preguntado, [equipo]: new Date().toISOString() } })
        return enviar(res, 200, { ok: true })
      }
      if (ruta === '/api/respaldo/traer') {
        if (!c) throw new Rechazo(401, SIN_CUENTA)
        if (!/^[\w-]{8,64}$/.test(equipo)) throw new Rechazo(400, 'Falta de qué computadora.')
        if (trayendo) throw new Rechazo(409, 'Ya se está trayendo una copia. Espera a que termine.')
        trayendo = true
        try {
          const paquete = Buffer.from(await (await nube(c, `/respaldo/${equipo}`)).arrayBuffer())
          const traido = await traer(paquete, { app: o.app, cards: o.cards, hilos: { tiene: (id) => !!o.sessions.meta(id), poner: (meta, registro) => o.sessions.traer(meta, registro) }, sobreTi: o.sobreTi })
          anotar({ preguntado: { ...g.preguntado, [equipo]: new Date().toISOString() } })
          return enviar(res, 200, traido)
        } finally {
          trayendo = false
        }
      }
      if (ruta === '/api/respaldo/guardar') {
        anotar({ guardar: pedido.guardar !== false, ...(pedido.guardar === false ? { huella: undefined, subido: undefined, error: undefined } : {}) })
        if (pedido.guardar === false) {
          if (c) await nube(c, '/respaldo', { metodo: 'DELETE' })
        } else void subir()
        return enviar(res, 200, { guardar: g.guardar !== false })
      }
      return false
    } catch (e) {
      const estado = e instanceof Rechazo ? (e.status < 500 || e.status === 507 ? e.status : 502) : e instanceof RespaldoMalo ? 400 : 500
      return enviar(res, estado, { error: e instanceof Error ? e.message : String(e) })
    }
  }

  return { api, subir }
}
