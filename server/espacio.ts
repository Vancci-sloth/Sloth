import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statfsSync, statSync, symlinkSync } from 'node:fs'
import { lstat, readdir, readFile, rm } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { Card, Espacio, GrupoEspacio, IdEspacio } from '../shared/types.ts'
import { carpetasDe, folderOf, terminados } from './etapas.ts'
import type { Sessions } from './sessions.ts'
import { TRABAJO_DEV } from './trabajo.ts'

/**
 * Opciones → Espacio en disco: lo que Sloth y sus estilos de video dejan y ya no hace falta, y borrarlo. Lo seguro (los
 * temporales de Remotion, los pedazos de render de los videos terminados, las dependencias repetidas, las cachés viejas)
 * lo borra solo cada 6 horas cuando nada trabaja; lo demás (los videos bajados de internet, otro Python, los adjuntos
 * sueltos) solo con su botón. Nunca toca un video terminado, una grabación ni la carpeta de un hilo que trabaja.
 *
 * Las dependencias de los videos se comparten como en `skills/video-base/scripts/espacio.py` (y `comun.py` de El Diff):
 * una carpeta por plantilla en %LOCALAPPDATA%, enlazada desde cada video. Si cambias dónde viven, cámbialo allí también.
 */

const HORA = 3600_000
const DIA = 24 * HORA
const CADA = 6 * HORA
/** Las cachés de webpack que quedan por node_modules: Remotion hace una nueva (~210 MB) cada vez que cambia algo. */
const CACHES_QUE_QUEDAN = 2
const LOCAL = process.env.LOCALAPPDATA || join(homedir(), '.cache')

const GRUPOS: Record<IdEspacio, Omit<GrupoEspacio, 'id' | 'bytes' | 'cuantos'>> = {
  temporales: { nombre: 'Temporales de los renders', detalle: 'Lo que Remotion deja en la carpeta temporal al empaquetar y renderizar. Nada lo vuelve a usar.', seguro: true },
  renders: { nombre: 'Pedazos de render', detalle: 'Las partes que se guardan para no renderizar todo otra vez, de videos terminados o que no tocas hace días. Los videos finales se quedan; si cambias uno, su siguiente render tarda más.', seguro: true },
  modulos: { nombre: 'Dependencias repetidas', detalle: 'Cada video traía su propia copia de lo mismo (cerca de 1 GB). Queda una sola, que comparten todos.', seguro: true },
  caches: { nombre: 'Cachés viejas del empaquetado', detalle: 'Remotion guarda una nueva cada vez que cambia algo y nunca borra las viejas. Quedan las dos más nuevas.', seguro: true },
  perfiles: { nombre: 'Perfiles viejos del navegador', detalle: 'Copias de respaldo de perfiles del navegador que ya se cambiaron.', seguro: true },
  fuentes: { nombre: 'Videos bajados de internet', detalle: 'Los originales de videos que terminaste hace más de una semana. El video final no los usa; si lo rehaces, se vuelven a bajar.', seguro: false },
  python: { nombre: 'Otra copia del Python de Sloth', detalle: 'Una instalación vieja de la IA local (torch, Whisper) que Sloth ya no usa.', seguro: false },
  adjuntos: { nombre: 'Adjuntos de hilos borrados', detalle: 'Imágenes y audios que pegaste en hilos que ya no existen, de hace más de una semana.', seguro: false }
}

/** Algo que se puede borrar: una carpeta o un archivo, o un cambio (`hacer`) como poner un enlace en lugar de una copia. */
interface Candidato {
  grupo: IdEspacio
  ruta: string
  bytes: number
  hacer?: () => Promise<void>
}

export interface OpcionesEspacio {
  app: string
  sessions: Sessions
  cards: () => Card[]
  /** Por qué ahora no conviene tocar nada (un agente trabajando, una subida); `null` si nada trabaja. */
  ocupado: () => string | null
  /** La carpeta del Python de Sloth que se usa (`<piezas>/python/<id>`), si está entero; si no, null. */
  python: () => Promise<string | null>
}

export function espacio(o: OpcionesEspacio) {
  let liberando = false

  /** Si un hilo de un estilo de video trabaja (o dejó algo de fondo) en esa carpeta, o en una que la contiene. */
  function enUso(carpeta: string): boolean {
    const estilos = new Set(o.cards().filter((c) => c.etapas?.length).map((c) => c.id))
    return o.sessions.list().some((s) => estilos.has(s.cardId) && (s.running || !!s.background?.length) && (dentro(folderOf(s), carpeta) || dentro(carpeta, folderOf(s))))
  }

  async function candidatos(auto: boolean): Promise<Candidato[]> {
    const ahora = Date.now()
    const lista: Candidato[] = []
    const poner = async (grupo: IdEspacio, ruta: string, hacer?: () => Promise<void>, bytes?: number) =>
      lista.push({ grupo, ruta, bytes: bytes ?? (await tamano(ruta)), hacer })

    // Los temporales de Remotion: un render en marcha toca los suyos, y uno de horas no deja pasar tanto sin tocarlos.
    const limite = ahora - (auto ? 6 : 1) * HORA
    for (const nombre of listar(tmpdir())) {
      if (!nombre.startsWith('remotion-') && !nombre.startsWith('ed-rev-')) continue
      const ruta = join(tmpdir(), nombre)
      if (esCarpeta(ruta) && mtime(ruta) < limite) await poner('temporales', ruta)
    }

    // Las carpetas de los videos.
    const enlazadas = new Set<string>()
    const vistos = new Set<string>() // los videos bajados, una vez aunque estén enlazados en dos carpetas
    const propias: { card: Card; carpeta: string; nm: string; edad: number }[] = []
    for (const card of o.cards().filter((c) => c.etapas?.length && c.skill)) {
      for (const carpeta of carpetasDe(card)) {
        const nm = join(carpeta, 'node_modules')
        const destino = enlace(nm)
        if (destino) enlazadas.add(clave(destino))
        if (enUso(carpeta)) continue
        const edad = ahora - ultimoCambio(carpeta)
        const hecho = terminados(card, carpeta).length > 0
        // Los de un video terminado, o de uno que nadie toca hace días (a medias o abandonado: sus pedazos sin final).
        const viejo = edad >= (hecho ? (auto ? 3 : 0) : auto ? 14 : 3) * DIA
        if (viejo) for (const r of regenerables(carpeta)) await poner('renders', r)
        if (hecho && !auto && edad >= 7 * DIA) {
          for (const v of bajados(carpeta, vistos)) await poner('fuentes', v.ruta, undefined, v.bytes)
        }
        if (!destino && esCarpeta(nm) && (!auto || edad >= DIA)) propias.push({ card, carpeta, nm, edad })
      }
    }

    // Las dependencias propias: si son las mismas que las de su plantilla, se cambian por un enlace a las compartidas.
    const tamanos = new Map<string, number>()
    for (const p of propias) {
      const plantilla = join(o.app, 'skills', p.card.skill!, 'plantilla')
      const casa = casaDe(p.card.skill!, plantilla)
      if (casa && completo(p.nm) && mismoArbol(join(p.carpeta, 'package-lock.json'), join(plantilla, 'package-lock.json'))) {
        // El mismo árbol pesa lo mismo: se mide una vez por estilo (son ~40.000 archivos) y la caché aparte.
        if (!tamanos.has(casa)) tamanos.set(casa, await tamano(p.nm, ['.cache']))
        const bytes = tamanos.get(casa)! + (await tamano(join(p.nm, '.cache')))
        lista.push({ grupo: 'modulos', ruta: p.nm, bytes, hacer: () => compartir(p.nm, casa, plantilla) })
        enlazadas.add(clave(join(casa, 'node_modules')))
      } else {
        for (const c of cachesViejas(p.nm)) await poner('caches', c)
      }
    }

    // Las carpetas compartidas: las de un package-lock que ya no es el de ninguna plantilla ni enlaza ningún video
    // (las de antes de una actualización) sobran; de las demás, solo sobran sus cachés viejas. Las que sobran, solo con el
    // botón: otra copia de Sloth en la misma computadora (la de desarrollo y la instalada) puede tener videos enlazados ahí.
    const vigentes = new Set(o.cards().filter((c) => c.skill).map((c) => casaDe(c.skill!, join(o.app, 'skills', c.skill!, 'plantilla'))).filter(Boolean).map((c) => clave(c!)))
    for (const e of enlacesDeOtrasCopias()) enlazadas.add(e)
    for (const casa of casasCompartidas()) {
      if (!vigentes.has(clave(casa)) && !enlazadas.has(clave(join(casa, 'node_modules')))) {
        if (!auto) await poner('modulos', casa)
      } else for (const c of cachesViejas(join(casa, 'node_modules'))) await poner('caches', c)
    }

    // Los perfiles viejos del navegador: data/<algo>/perfil-viejo-*.
    const datos = join(o.app, 'data')
    for (const d of listar(datos)) for (const p of listar(join(datos, d))) if (p.startsWith('perfil-viejo')) await poner('perfiles', join(datos, d, p))

    if (!auto) {
      // Otro Python de Sloth: solo si el que se usa está entero.
      const elegido = await o.python()
      if (elegido) {
        const pythones = dirname(elegido)
        for (const id of listar(pythones)) if (clave(join(pythones, id)) !== clave(elegido) && esCarpeta(join(pythones, id))) await poner('python', join(pythones, id))
      }
      for (const a of await adjuntosSueltos(o.app, ahora - 7 * DIA)) await poner('adjuntos', a)
    }
    return lista
  }

  function resumen(lista: Candidato[], liberado?: number): Espacio {
    const grupos = (Object.keys(GRUPOS) as IdEspacio[]).map((id) => {
      const suyos = lista.filter((c) => c.grupo === id)
      return { id, ...GRUPOS[id], bytes: suyos.reduce((n, c) => n + c.bytes, 0), cuantos: suyos.length }
    })
    const { libre, total } = disco(o.app)
    return { libre, total, grupos, ...(liberado !== undefined ? { liberado } : {}) }
  }

  async function revisar(): Promise<Espacio> {
    return resumen(await candidatos(false))
  }

  /** Borra lo de esos grupos (por defecto, los seguros). Lo que no se pudo borrar (en uso) se queda para la próxima. */
  async function liberar(ids?: IdEspacio[], auto = false): Promise<Espacio> {
    if (liberando) throw new Error('Ya se está liberando espacio. Espera a que termine.')
    liberando = true
    try {
      const quiero = new Set(ids ?? (Object.keys(GRUPOS) as IdEspacio[]).filter((id) => GRUPOS[id].seguro))
      let liberado = 0
      for (const c of (await candidatos(auto)).filter((c) => quiero.has(c.grupo))) {
        try {
          if (c.hacer) await c.hacer()
          else await rm(c.ruta, { recursive: true, force: true, maxRetries: 2 })
          if (c.hacer || !existsSync(c.ruta)) liberado += c.bytes
        } catch (e) {
          console.log(`espacio: no pude liberar ${c.ruta}: ${e instanceof Error ? e.message : e}`)
        }
      }
      if (liberado) console.log(`espacio: liberé ${legible(liberado)}${auto ? ' (solo, sin que nada trabajara)' : ''}.`)
      return resumen(await candidatos(false), liberado)
    } finally {
      liberando = false
    }
  }

  // Solo, cada 6 horas (y unos minutos después de arrancar), si nada trabaja.
  const solo = () => {
    if (o.ocupado() || liberando) return
    liberar(undefined, true).catch((e) => console.log(`espacio: ${e instanceof Error ? e.message : e}`))
  }
  setTimeout(solo, 3 * 60_000).unref()
  setInterval(solo, CADA).unref()

  async function api(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    if (path !== '/api/espacio') return false
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(data))
    }
    try {
      if (req.method === 'GET') return send(200, await revisar()), true
      if (req.method !== 'POST') return false
      let texto = ''
      for await (const parte of req) texto += parte
      const { grupos } = (texto ? JSON.parse(texto) : {}) as { grupos?: IdEspacio[] }
      if (grupos?.some((g) => !GRUPOS[g])) return send(400, { error: 'No conozco ese grupo.' }), true
      send(200, await liberar(grupos))
    } catch (e) {
      send(409, { error: e instanceof Error ? e.message : String(e) })
    }
    return true
  }

  return { revisar, liberar, api }
}

const clave = (ruta: string) => resolve(ruta).toLowerCase()

function dentro(padre: string, ruta: string): boolean {
  const rel = relative(resolve(padre), resolve(ruta))
  return !rel.startsWith('..') && !isAbsolute(rel)
}

function listar(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function esCarpeta(ruta: string): boolean {
  try {
    return lstatSync(ruta).isDirectory()
  } catch {
    return false
  }
}

function mtime(ruta: string): number {
  try {
    return statSync(ruta).mtimeMs
  } catch {
    return 0
  }
}

/** Adónde lleva un enlace (en Windows, también una junction), o nada si no es un enlace. */
function enlace(ruta: string): string | undefined {
  try {
    if (!lstatSync(ruta).isSymbolicLink()) return
    return realpathSync(ruta)
  } catch {
    return
  }
}

/** Lo último que cambió en la carpeta de un video: lo de arriba y lo de `out/`, sin bajar más (es rápido). */
function ultimoCambio(carpeta: string): number {
  let t = mtime(carpeta)
  for (const d of [carpeta, join(carpeta, 'out')]) for (const n of listar(d)) if (n !== 'node_modules') t = Math.max(t, mtime(join(d, n)))
  return t
}

/**
 * Lo que un render vuelve a hacer solo: los pedazos (`out/partes`, `out/redes/partes`), los empaquetados de revisar
 * (`_bundle_rev`) y lo que dejan los renders cortados (`_render-*`, `_viejo-*`, `*.remotion-in-progress`). Nunca un
 * enlace, ni nada fuera de `out/`.
 */
export function regenerables(carpeta: string): string[] {
  const out = join(carpeta, 'out')
  const hallados: string[] = []
  const mirar = (dir: string, nivel: number) => {
    for (const n of listar(dir)) {
      const ruta = join(dir, n)
      let st
      try {
        st = lstatSync(ruta)
      } catch {
        continue
      }
      if (st.isSymbolicLink()) continue
      if (st.isDirectory()) {
        if (n === '_bundle_rev' || (n === 'partes' && (dir === out || dir === join(out, 'redes')))) hallados.push(ruta)
        else if (n !== 'node_modules' && nivel < 3) mirar(ruta, nivel + 1)
      } else if (/^_(render|viejo)-/.test(n) || n.endsWith('.remotion-in-progress')) hallados.push(ruta)
    }
  }
  if (esCarpeta(out)) mirar(out, 0)
  return hallados
}

/**
 * Los videos que `fuente.py` bajó de internet (`fuentes/<algo>/video.mp4`, con su `video.info.json`, que dice de dónde),
 * contados una vez aunque estén enlazados desde otro video.
 */
export function bajados(carpeta: string, vistos = new Set<string>()): { ruta: string; bytes: number }[] {
  const fuentes = join(carpeta, 'fuentes')
  return listar(fuentes).flatMap((d) => {
    const ruta = join(fuentes, d, 'video.mp4')
    if (!existsSync(join(fuentes, d, 'video.info.json'))) return []
    try {
      const st = lstatSync(ruta)
      if (!st.isFile()) return []
      const id = `${st.dev}:${st.ino}`
      const bytes = vistos.has(id) ? 0 : st.size
      vistos.add(id)
      return [{ ruta, bytes }]
    } catch {
      return []
    }
  })
}

const completo = (nm: string) => esCarpeta(join(nm, 'remotion')) && esCarpeta(join(nm, '@remotion', 'cli'))

/** La carpeta compartida de una plantilla, como la calculan `espacio.py` (`<estilo>-<huella>`) y `comun.py` de El Diff. */
export function casaDe(skill: string, plantilla: string): string | undefined {
  let lock: Buffer
  try {
    lock = readFileSync(join(plantilla, 'package-lock.json'))
  } catch {
    return
  }
  const huella = createHash('sha1').update(lock).digest('hex').slice(0, 10)
  return skill === 'video-el-diff' ? join(LOCAL, 'video-el-diff', 'modulos', huella) : join(LOCAL, 'sloth-modulos', `${skill}-${huella}`)
}

/**
 * Adónde enlazan los node_modules de los videos de las otras copias de Sloth que puede haber en la computadora (la
 * instalada y la del repo, que trabaja en `TRABAJO_DEV`), que no salen en las cards de esta.
 */
function enlacesDeOtrasCopias(): string[] {
  return [join(LOCAL, 'Programs', 'sloth', 'app', 'trabajo'), TRABAJO_DEV]
    .flatMap((raiz) => listar(raiz).flatMap((card) => listar(join(raiz, card)).map((v) => join(raiz, card, v, 'node_modules'))))
    .map(enlace)
    .filter((e): e is string => !!e)
    .map(clave)
}

function casasCompartidas(): string[] {
  return [join(LOCAL, 'sloth-modulos'), join(LOCAL, 'video-el-diff', 'modulos')].flatMap((d) => listar(d).map((n) => join(d, n)).filter(esCarpeta))
}

/** Lo que instala un package-lock, sin la raíz (que cambia con package.json aunque el árbol no), en orden. */
function arbol(lock: string): string {
  const paquetes = { ...(JSON.parse(readFileSync(lock, 'utf8')).packages ?? {}) }
  delete paquetes['']
  return JSON.stringify(ordenado(paquetes))
}

function ordenado(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(ordenado)
  if (!x || typeof x !== 'object') return x
  return Object.fromEntries(Object.keys(x).sort().map((k) => [k, ordenado((x as Record<string, unknown>)[k])]))
}

export function mismoArbol(a: string, b: string): boolean {
  try {
    return arbol(a) === arbol(b)
  } catch {
    return false
  }
}

/** Cambia el node_modules propio de un video por un enlace al compartido. Si aún no hay compartido, el propio pasa a serlo. */
export async function compartir(nm: string, casa: string, plantilla: string): Promise<void> {
  const compartido = join(casa, 'node_modules')
  if (completo(compartido)) await rm(nm, { recursive: true, force: true, maxRetries: 2 })
  else {
    await rm(compartido, { recursive: true, force: true })
    mkdirSync(casa, { recursive: true })
    for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(plantilla, f), join(casa, f))
    renameSync(nm, compartido) // el mismo disco: no copia nada
  }
  symlinkSync(compartido, nm, process.platform === 'win32' ? 'junction' : 'dir')
  for (const c of cachesViejas(compartido)) await rm(c, { recursive: true, force: true })
}

/** Las cachés de webpack de un node_modules que sobran: todas menos las `CACHES_QUE_QUEDAN` más nuevas de cada tipo. */
export function cachesViejas(nm: string): string[] {
  const webpack = join(nm, '.cache', 'webpack')
  return listar(webpack)
    .filter((t) => t.startsWith('remotion-'))
    .flatMap((t) =>
      listar(join(webpack, t))
        .map((h) => join(webpack, t, h))
        .filter(esCarpeta)
        .sort((a, b) => mtime(b) - mtime(a))
        .slice(CACHES_QUE_QUEDAN)
    )
}

/**
 * Los adjuntos (`data/attachments/<hora>-<nombre>`) que ya no nombra nadie: ni un hilo (`data/sessions`) ni lo demás de
 * `data/*.json` (las redes, la comunidad, YouTube). Se reconocen por su hora, que va delante de su nombre.
 */
export async function adjuntosSueltos(app: string, antesDe: number): Promise<string[]> {
  const dir = join(app, 'data', 'attachments')
  const viejos = listar(dir).filter((n) => /^\d{13}-/.test(n) && mtime(join(dir, n)) < antesDe)
  if (!viejos.length) return []
  const nombrados = new Set<string>()
  const leer = async (archivo: string) => {
    try {
      for (const m of (await readFile(archivo, 'utf8')).matchAll(/\d{13}-/g)) nombrados.add(m[0])
    } catch {}
  }
  const sesiones = join(app, 'data', 'sessions')
  for (const n of listar(sesiones)) await leer(join(sesiones, n))
  for (const n of listar(join(app, 'data'))) if (n.endsWith('.json')) await leer(join(app, 'data', n))
  return viejos.filter((n) => !nombrados.has(n.slice(0, 14))).map((n) => join(dir, n))
}

/** Lo que pesa una carpeta (o un archivo), sin seguir enlaces ni entrar en `saltar`. Sin bloquear el servidor. */
async function tamano(ruta: string, saltar: string[] = []): Promise<number> {
  let st
  try {
    st = await lstat(ruta)
  } catch {
    return 0
  }
  if (st.isSymbolicLink()) return 0
  if (!st.isDirectory()) return st.size
  let entradas
  try {
    entradas = await readdir(ruta)
  } catch {
    return 0
  }
  let n = 0
  for (let i = 0; i < entradas.length; i += 64) {
    const tanda = entradas.slice(i, i + 64).filter((e) => !saltar.includes(e))
    n += (await Promise.all(tanda.map((e) => tamano(join(ruta, e))))).reduce((a, b) => a + b, 0)
  }
  return n
}

function disco(ruta: string): { libre: number; total: number } {
  try {
    const s = statfsSync(ruta)
    return { libre: s.bavail * s.bsize, total: s.blocks * s.bsize }
  } catch {
    return { libre: 0, total: 0 }
  }
}

export function legible(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`
}
