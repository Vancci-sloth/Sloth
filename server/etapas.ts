import { closeSync, createReadStream, existsSync, fstatSync, globSync, mkdirSync, openSync, readdirSync, readSync, type Stats, statSync, watch } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, extname, isAbsolute, join, matchesGlob, relative, resolve, sep } from 'node:path'
import { enCurso } from '../shared/etapas.ts'
import type { Archivo, Avance, AvanceCorto, Card, CarpetaDeVideo, MarcasDeRedes, Render, ServerPush, SessionMeta, VideoFinal, VideoHecho, VideosDeTodos } from '../shared/types.ts'
import { IMAGE_TYPES } from './agent.ts'
import { aLaPapelera, huella } from './disco.ts'
import { motorDe, servirMotor, servirOnda } from './motor.ts'
import type { Sessions } from './sessions.ts'

/**
 * El avance de una sesión para el estudio de video, leído de los archivos que deja el agente, no de lo que dice. Las etapas
 * las declara la card en `cards.json`. Quitarlo es borrar este archivo y `web/src/Etapas.*`, y las líneas marcadas
 * «panel de etapas».
 */

const TYPES: Record<string, string> = {
  ...IMAGE_TYPES,
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  // La vista en vivo del editor es una página con su script, que carga además lo que tenga al lado.
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

/** Para avisar a la interfaz por el WebSocket (`broadcast` de server/index.ts). */
type Avisar = (msg: ServerPush) => void

/** Una ruta, para compararla con otra: con `/` y en minúsculas. */
const normal = (ruta: string) => ruta.replaceAll('\\', '/').toLowerCase().replace(/\/$/, '')

/** Si dos carpetas son la misma, escritas con `/` o con `\`, o en mayúsculas o minúsculas. */
export const mismaCwd = (a: string, b: string) => normal(a) === normal(b)

type Dir = { name: string; t: number }

/** Las subcarpetas de `cwd` (sin las ocultas ni `node_modules`), por su nombre en minúsculas, con cuándo cambiaron. */
function subcarpetas(cwd: string): Map<string, Dir> {
  const dirs = new Map<string, Dir>()
  try {
    for (const d of readdirSync(cwd, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('.') || d.name === 'node_modules') continue
      dirs.set(d.name.toLowerCase(), { name: d.name, t: statSync(join(cwd, d.name), { throwIfNoEntry: false })?.mtimeMs ?? 0 })
    }
  } catch {}
  return dirs
}

/**
 * El nombre de una subcarpeta de `cwd` que existe, como está en el disco, o nada. Es la que elige el usuario para un hilo:
 * un nombre solo, sin separadores ni `..`, así que no sale de `cwd`.
 */
export function carpetaValida(cwd: string, nombre: string): string | undefined {
  return subcarpetas(cwd).get(nombre.toLowerCase())?.name
}

/** La carpeta de un hilo: la que le nombró Sloth al crearlo o eligió el usuario, o la de su lote. */
const suyaDe = (s: SessionMeta) => s.carpeta ?? s.lote?.carpeta

/**
 * Las carpetas de video de `cwd`, de la que cambió hace menos a la más vieja, con el título del hilo que la tiene (el que
 * se movió hace menos), si lo hay.
 */
function carpetasDeVideo(cwd: string, sessions: Sessions): CarpetaDeVideo[] {
  const hilos = sessions.list().filter((s) => mismaCwd(s.cwd, cwd))
  return [...subcarpetas(cwd).values()]
    .sort((a, b) => b.t - a.t)
    .map((d) => ({ nombre: d.name, hilo: hilos.find((s) => suyaDe(s)?.toLowerCase() === d.name.toLowerCase())?.title }))
}

/**
 * La carpeta de un hilo dentro de `cwd` (`''` si es el propio `cwd`). La card trabaja en `cwd`, pero cada video va en su
 * carpeta: la nombra Sloth al crear el hilo (la de un lote va en `lote`), o la elige el usuario. Un hilo de antes de que
 * se nombrara no tiene, y los de Ideas trabajan en la carpeta de su canal.
 */
const carpetaDe = (meta: SessionMeta) => suyaDe(meta) ?? ''

/** Dónde deja sus archivos el hilo: su carpeta dentro de `cwd`, o `cwd`. */
export function folderOf(meta: SessionMeta): string {
  const carpeta = carpetaDe(meta)
  return carpeta ? join(meta.cwd, carpeta) : meta.cwd
}

/** Un MP4 que cambió hace menos de esto se sigue escribiendo (un render, una copia): aún no está terminado. */
const FRESCO = 5000
/** Cuándo deja de estar fresco el primer MP4 que se dejó fuera, para volver a avisar entonces (`etapasApi`). */
let frescoHasta = Infinity

/**
 * Si un archivo ya cuenta, para el panel y para los videos terminados. Uno vacío no: un `guion.md` recién creado aún no
 * es un guion. Un MP4 que se sigue escribiendo tampoco. Las carpetas sí.
 */
function cuenta(st: Stats, ruta: string, ahora: number): boolean {
  if (!st.isFile()) return true
  if (!st.size) return false
  if (!/\.mp4$/i.test(ruta) || ahora - st.mtimeMs >= FRESCO) return true
  frescoHasta = Math.min(frescoHasta, st.mtimeMs + FRESCO)
  return false
}

/** Lo que coincide con el glob y ya cuenta, con su `stat`. */
function listos(folder: string, pattern: string): { ruta: string; st: Stats }[] {
  const ahora = Date.now()
  return globSync(pattern, { cwd: folder }).flatMap((ruta) => {
    const st = statSync(join(folder, ruta), { throwIfNoEntry: false })
    return st && cuenta(st, ruta, ahora) ? [{ ruta: ruta.replaceAll('\\', '/'), st }] : []
  })
}

function files(folder: string, pattern: string): Archivo[] {
  return listos(folder, pattern)
    .map(({ ruta, st }) => ({ ruta, t: st.mtimeMs }))
    .sort((a, b) => a.t - b.t)
}

/** El último archivo que coincide con el glob, si hay alguno. */
const one = (folder: string, pattern?: string) => (pattern ? files(folder, pattern).at(-1) : undefined)

/** Dónde deja sus videos un estilo: cada carpeta dentro de `cwd`. */
export function carpetasDe(card: Card): string[] {
  try {
    return readdirSync(card.cwd, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
      .map((d) => resolve(card.cwd, d.name))
  } catch {
    return []
  }
}

/**
 * Si un MP4 es vertical (más alto que ancho), leído de su cabecera (el `tkhd` de su pista de video), sin abrirlo entero
 * ni llamar a ffprobe. `undefined` si no se pudo leer. Se guarda por archivo y fecha.
 */
export function esVertical(file: string, t: number): boolean | undefined {
  const clave = `${file}|${t}`
  if (!formas.has(clave)) formas.set(clave, leerForma(file))
  return formas.get(clave)
}
const formas = new Map<string, boolean | undefined>()

function leerForma(file: string): boolean | undefined {
  let fd: number
  try {
    fd = openSync(file, 'r')
  } catch {
    return undefined
  }
  try {
    const size = fstatSync(fd).size
    const cab = Buffer.alloc(16)
    // Las cajas de arriba, hasta el `moov` (al principio o al final, según quién escribió el MP4).
    for (let pos = 0; pos + 8 <= size; ) {
      readSync(fd, cab, 0, 16, pos)
      let largo = cab.readUInt32BE(0)
      let salto = 8
      if (largo === 1) (largo = Number(cab.readBigUInt64BE(8))), (salto = 16)
      else if (largo === 0) largo = size - pos
      if (largo < salto) return undefined
      if (cab.toString('latin1', 4, 8) === 'moov') {
        const moov = Buffer.alloc(largo - salto)
        readSync(fd, moov, 0, moov.length, pos + salto)
        for (const [tipo, trak] of cajas(moov)) {
          if (tipo !== 'trak') continue
          const tkhd = [...cajas(trak)].find(([t]) => t === 'tkhd')?.[1]
          if (!tkhd || tkhd.length < 8) continue
          // El ancho y el alto (16.16) son lo último del `tkhd`; una pista de audio los tiene en cero.
          const ancho = tkhd.readUInt32BE(tkhd.length - 8)
          const alto = tkhd.readUInt32BE(tkhd.length - 4)
          if (ancho && alto) return alto > ancho
        }
        return undefined
      }
      pos += largo
    }
  } catch {
  } finally {
    closeSync(fd)
  }
  return undefined
}

/** Las cajas de un trozo de MP4: su tipo y su contenido. */
function* cajas(b: Buffer): Generator<[string, Buffer]> {
  for (let p = 0; p + 8 <= b.length; ) {
    const largo = b.readUInt32BE(p)
    if (largo < 8 || p + largo > b.length) return
    yield [b.toString('latin1', p + 4, p + 8), b.subarray(p + 8, p + largo)]
    p += largo
  }
}

/** Los videos terminados de una carpeta: los de la etapa «Video», si está hecha. Los que empiezan por `_` son a medias. */
export function terminados(card: Card, folder: string): Archivo[] {
  return (card.etapas ?? [])
    .filter((e) => e.nombre === 'Video' && e.muestra && listos(folder, e.listo).length)
    .flatMap((e) => files(folder, e.muestra!))
    .filter((a) => a.ruta.endsWith('.mp4') && !basename(a.ruta).startsWith('_'))
}

/**
 * Los videos terminados de un hilo: los de `terminados`, primero el de la etapa que va antes. Cada uno con el nombre con
 * que se descarga y se copia: su carpeta de video y su archivo (si dos se llaman igual, su ruta entera), o solo el
 * archivo si ya se llama como la carpeta (`reel-cielo.mp4`).
 */
export function finalesDe(meta: SessionMeta, card: Card, folder = folderOf(meta)): VideoFinal[] {
  const archivos = terminados(card, folder)
  const delante = carpetaDe(meta) || basename(folder)
  return archivos.map((a) => {
    const solo = basename(a.ruta)
    const nombre = archivos.some((b) => b !== a && basename(b.ruta) === solo) ? a.ruta.replaceAll('/', '-') : solo
    return { ...a, nombre: nombre.replace(/\.\w+$/, '').toLowerCase() === delante.toLowerCase() ? nombre : `${delante} - ${nombre}` }
  })
}

/**
 * «Haz otra versión» sin pisar la actual: el hilo pasa a una carpeta nueva junto a la suya (`reel-cielo-v2`, `-v3`…),
 * y el agente hace ahí la otra. La de antes se queda como está, con su video, en la galería del estilo y en su copia.
 */
function otraVersion(meta: SessionMeta, sessions: Sessions): { antes: string; nueva: string } {
  const antes = carpetaDe(meta)
  // `-v2` se quita solo si es una versión de verdad: la carpeta sin él existe. `gpt-v5` es un tema, no una versión.
  const sin = antes.replace(/-v\d+$/i, '')
  const base = sin !== antes && existsSync(join(meta.cwd, sin)) ? sin : antes
  const usadas = new Set([...subcarpetas(meta.cwd).keys(), ...sessions.list().flatMap((s) => (mismaCwd(s.cwd, meta.cwd) ? [(suyaDe(s) ?? '').toLowerCase()] : []))])
  let k = 2
  while (usadas.has(`${base}-v${k}`.toLowerCase())) k++
  const nueva = `${base}-v${k}`
  mkdirSync(join(meta.cwd, nueva), { recursive: true })
  sessions.setCarpeta(meta.id, nueva)
  return { antes, nueva }
}

/**
 * `GET /api/cards/<id>/videos`: los videos terminados de un estilo, los de sus hilos y los de carpetas de fuera, del más
 * nuevo al más viejo. `GET /api/cards/<id>/video?ruta=…` sirve uno. `GET /api/videos`, para «Mis videos»: los de todos
 * los estilos juntos, con sus marcas de redes (`marcas`, de `server/redes/`), sacadas de la misma lista: el disco se
 * recorre una vez. Un video que sale en dos estilos (una card duplicada mira las mismas carpetas) va una vez, con el
 * primero. `POST /api/videos/borrar` manda uno a la Papelera. Devuelve si atendió la petición.
 */
export async function videosApi(req: IncomingMessage, res: ServerResponse, url: URL, sessions: Sessions, cards: Card[], marcas?: (videos: VideoHecho[]) => Promise<MarcasDeRedes | undefined>, cuadro?: (video: string) => Promise<string>): Promise<boolean> {
  if (url.pathname === '/api/videos' && req.method === 'GET') {
    const porRuta = new Map<string, VideoHecho>()
    for (const c of cards) if (c.etapas?.length) for (const v of videosDe(c, sessions)) if (!porRuta.has(v.ruta)) porRuta.set(v.ruta, v)
    const videos = [...porRuta.values()].sort((a, b) => b.t - a.t)
    return json(res, 200, { videos, redes: await marcas?.(videos) } satisfies VideosDeTodos)
  }
  // El ✕ de un video terminado: su archivo va a la Papelera; lo demás de su carpeta se queda. No si un agente trabaja en
  // ella, ni si espera en la cola de una red (fallaría sin archivo): ahí se descarta antes.
  if (url.pathname === '/api/videos/borrar' && req.method === 'POST') {
    let texto = ''
    for await (const trozo of req) texto += trozo
    const ruta = String(JSON.parse(texto || '{}').ruta ?? '')
    const video = cards.flatMap((c) => (c.etapas?.length ? videosDe(c, sessions) : [])).find((v) => v.ruta === ruta)
    if (!video) return json(res, 404, { error: 'Ese video ya no está.' })
    const estilos = new Set(cards.filter((c) => c.etapas?.length).map((c) => c.id))
    const trabaja = sessions.list().some((s) => {
      const rel = relative(resolve(folderOf(s)), ruta)
      return estilos.has(s.cardId) && (s.running || !!s.background?.length) && !rel.startsWith('..') && !isAbsolute(rel)
    })
    if (trabaja) return json(res, 409, { error: 'Un agente trabaja en su carpeta. Espera a que termine.' })
    const ps = (await marcas?.([video]))?.publicaciones[ruta] ?? []
    if (ps.some((p) => p.estado === 'cola' || p.estado === 'subiendo')) return json(res, 409, { error: 'Está en la cola de una red: descártalo ahí (✕ en su insignia) antes de borrarlo.' })
    if ((await aLaPapelera([ruta])).length) return json(res, 409, { error: 'Windows no lo dejó mover a la Papelera: puede que otro programa lo tenga abierto.' })
    return json(res, 200, { ok: true })
  }
  const m =/^\/api\/cards\/([\w-]+)\/(videos|video)$/.exec(url.pathname)
  if (!m || req.method !== 'GET') return false
  const card = cards.find((c) => c.id === m[1])
  if (!card) return json(res, 404, { error: 'No existe' })
  const carpetas = carpetasDe(card)

  if (m[2] === 'video') {
    // Solo sirve lo que está dentro de las carpetas del estilo.
    const file = resolve(url.searchParams.get('ruta') ?? '')
    if (!carpetas.some((f) => file.startsWith(f + sep))) return json(res, 403, { error: 'Fuera de las carpetas del estilo' })
    // `&cuadro`: su primer cuadro, en pequeño, para su tarjeta (`server/miniaturas.ts`). Si FFmpeg falla, no hay imagen y la
    // tarjeta se ve al reproducirlo.
    if (url.searchParams.has('cuadro') && cuadro) return servir(req, res, await cuadro(file).catch(() => ''))
    return servir(req, res, file)
  }

  return json(res, 200, videosDe(card, sessions))
}

/** Los videos terminados de un estilo, del más nuevo al más viejo. También los usan las redes (`server/redes/`). */
export function videosDe(card: Card, sessions: Sessions): VideoHecho[] {
  // La carpeta de cada hilo sale de su meta. Si dos hilos tienen la misma (uno siguió el episodio de otro), sus videos
  // son del que la hizo, el primero.
  const hilos = new Map<string, SessionMeta>()
  for (const meta of sessions.list().filter((s) => s.cardId === card.id && suyaDe(s))) {
    const folder = resolve(folderOf(meta))
    if ((hilos.get(folder)?.createdAt ?? Infinity) > meta.createdAt) hilos.set(folder, meta)
  }
  // El mismo video copiado en dos carpetas (un episodio rehecho con otro modelo) sale una vez: se reconoce por su
  // contenido, como en las redes. Por el tamaño no: dos videos distintos pueden pesar lo mismo, y uno no salía.
  const vistos = new Set<string>()
  const videos: VideoHecho[] = []
  for (const folder of carpetasDe(card)) {
    const hilo = hilos.get(folder)
    for (const a of terminados(card, folder)) {
      const file = join(folder, a.ruta)
      const h = huella(file)
      if (!h || vistos.has(h)) continue
      vistos.add(h)
      videos.push({
        src: `/api/cards/${card.id}/video?ruta=${encodeURIComponent(file)}&t=${Math.round(a.t)}`,
        titulo: hilo?.title ?? basename(folder),
        archivo: a.ruta,
        ruta: file,
        t: a.t,
        sessionId: hilo?.id,
        cardId: card.id,
        vertical: esVertical(file, a.t)
      })
    }
  }
  return videos.sort((a, b) => b.t - a.t)
}

/** El video terminado más nuevo de un estilo, sin mirar sus hilos: es el que enseña su card (`server/previas.ts`). */
export function ultimoVideo(card: Card): Archivo | undefined {
  let ultimo: Archivo | undefined
  for (const folder of carpetasDe(card))
    for (const a of terminados(card, folder)) if (!ultimo || a.t > ultimo.t) ultimo = { ruta: join(folder, a.ruta), t: a.t }
  return ultimo
}

/**
 * Los globs de lo que enseña el panel de una card, también las entradas del final (cambiarlas lo deja viejo). Lo demás
 * (los trozos de un render, `node_modules`) no le importa.
 */
function globsDe(card: Card): string[] {
  const ed = card.editor
  return [
    ...(card.etapas ?? []).flatMap((e) => [e.listo, e.muestra]),
    ...(ed ? [ed.guion, ed.linea, ed.video, ed.cuadros?.replace('{id}', '*'), ed.vivo?.replace(/[^/]*$/, '*')] : []),
    ...(ed?.entradas ?? []).filter((g) => !g.startsWith('!'))
  ].filter((g): g is string => !!g)
}

/** Lo que nunca es entrada de un render: dependencias, cachés y lo que sale de él. Un glob ancho no entra ahí. */
const NO_ENTRADAS = ['**/node_modules', '**/.git', '**/__pycache__', 'out']

/**
 * La entrada más nueva del video `final`, si cambió después de él: el final quedó viejo. Las `entradas` son globs de la
 * carpeta del hilo; las que empiezan por `!` se quitan.
 */
function cambioTras(folder: string, entradas: string[], final: Archivo): Archivo | undefined {
  const exclude = [...NO_ENTRADAS, ...entradas.filter((g) => g.startsWith('!')).map((g) => g.slice(1))]
  let nueva: Archivo | undefined
  for (const ruta of globSync(entradas.filter((g) => !g.startsWith('!')), { cwd: folder, exclude })) {
    const st = statSync(join(folder, ruta), { throwIfNoEntry: false })
    if (st?.isFile() && st.mtimeMs > (nueva?.t ?? final.t)) nueva = { ruta: ruta.replaceAll('\\', '/'), t: st.mtimeMs }
  }
  return nueva
}

/**
 * El monitor de la fase Video, el mismo para todos los estilos: el motor en vivo (`server/motor.ts`), la vista en vivo de
 * la skill si la trae y los renders, cada uno con la entrada que cambió después de él. Con `editor` (El Diff), su página en
 * vivo y su video final, con las `entradas` de la card; sin él, solo sus renders (`rendersDe`). `avisar` relee el avance
 * de quien mira la carpeta cuando el motor tiene otra versión.
 */
function monitorDe(sessionId: string, card: Card, folder: string, etapas: Avance['etapas'], avisar: () => void): Avance['monitor'] {
  const ed = card.editor
  const estado = motorDe(folder, avisar, (ed?.entradas ?? []).filter((g) => g.startsWith('!')).map((g) => g.slice(1)))
  const motor = estado && { url: `/api/sessions/${sessionId}/motor`, ...estado }
  if (!ed) return { motor, renders: rendersDe(etapas, folder) }
  // La vista en vivo cambia cuando se vuelve a armar: su `t` es el del archivo más nuevo de su carpeta. Antes de que haya
  // escenas, la de la plantilla está vacía (salía negro): no se enseña.
  const vivo = one(folder, ed.guion) && one(folder, ed.vivo)
  if (vivo && ed.vivo) vivo.t = Math.max(vivo.t, one(folder, `${ed.vivo.replace(/[^/]*$/, '')}*`)?.t ?? 0)
  const video = one(folder, ed.video)
  // Después del final, los demás videos de la fase (los cortes, o la otra forma de un episodio de antes).
  const otros = rendersDe(etapas, folder).filter((a) => a.ruta !== video?.ruta)
  return {
    motor,
    vivo: vivo ? { url: `/api/sessions/${sessionId}/vivo/${vivo.ruta.split('/').map(encodeURIComponent).join('/')}`, t: vivo.t } : undefined,
    // El final quedó viejo si cambió una de sus entradas después del render; sin `entradas`, el guion.
    renders: [...(video ? [{ ...video, viejo: cambioTras(folder, ed.entradas ?? [ed.guion], video), vertical: esVertical(join(folder, video.ruta), video.t) }] : []), ...otros]
  }
}

/**
 * Los renders de un estilo sin editor: los videos de la fase Video, del de la etapa más avanzada al de la primera (y en
 * cada una, del más nuevo al más viejo).
 */
function rendersDe(etapas: Avance['etapas'], folder: string): Render[] {
  return etapas
    .filter((e) => e.fase === 'video')
    .reverse()
    .flatMap((e) => e.archivos.filter((a) => /\.(mp4|webm)$/i.test(a.ruta)).reverse())
    .map((a) => ({ ...a, vertical: a.ruta.endsWith('.mp4') ? esVertical(join(folder, a.ruta), a.t) : undefined }))
}

/**
 * Barra lateral: cómo va el video de un hilo (`server/avances.ts`), con lo mismo que lee el estudio (sus etapas y cuáles
 * están hechas), sin listar lo que enseña cada una. `fresco`: cuándo deja de escribirse un MP4 que aún no contó, para
 * volver a mirar entonces.
 */
export function avanceCorto(meta: SessionMeta, card: Card): { avance: AvanceCorto; fresco?: number } {
  const folder = folderOf(meta)
  frescoHasta = Infinity
  const etapas = (card.etapas ?? []).map((e) => ({ ...e, hecha: listos(folder, e.listo).length > 0 }))
  const { current, saltada } = enCurso(etapas)
  const va = etapas[current]
  const avance: AvanceCorto = {
    // Como en el estudio, una etapa sin fase va en Idea.
    fase: va && (va.fase ?? 'idea'),
    etapa: va?.nombre,
    espera: va?.espera ? true : undefined,
    hechas: etapas.filter((e, i) => e.hecha || saltada(i)).length,
    total: etapas.length
  }
  return { avance, fresco: frescoHasta < Infinity ? frescoHasta : undefined }
}

/**
 * Lo que le falta al video de un hilo para estar terminado, los nombres de sus etapas, con lo mismo que lee el estudio.
 * Nada si ya está o si lo que sigue lo tiene que dar el usuario (una etapa con `espera`, como su voz). Para que Sloth le
 * pida al agente que siga si cerró su turno a medias (`Sessions`).
 */
export function queFalta(meta: SessionMeta, card: Card): string[] {
  const folder = folderOf(meta)
  const etapas = (card.etapas ?? []).map((e) => ({ ...e, hecha: listos(folder, e.listo).length > 0 }))
  const { current, saltada } = enCurso(etapas)
  if (current < 0 || etapas[current].espera) return []
  return etapas.filter((e, i) => i >= current && !e.hecha && !saltada(i)).map((e) => e.nombre)
}

/** Los `cwd` que se vigilan, con los globs de su card. */
const vigiladas = new Map<string, { globs: string[] }>()

/**
 * Avisa a la interfaz cuando cambia la carpeta de un hilo (`{ type: 'etapas' }`), para que relea su avance solo entonces
 * y no cada dos segundos. Vigila el `cwd` de una card desde que alguien mira uno de sus hilos. Los cambios se juntan: se
 * avisa 300 ms después del último y, mientras no paran (un render), como mucho cada 2 s.
 */
function vigilar(cwd: string, card: Card, sessions: Sessions, avisar: Avisar) {
  const clave = normal(cwd)
  const ya = vigiladas.get(clave)
  if (ya) return void (ya.globs = globsDe(card))
  const vigilada = { globs: globsDe(card) }
  // La primera parte de cada ruta que cambió, que es la carpeta del hilo; `*` si no se sabe cuál.
  let partes = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let desde = 0
  const repartir = () => {
    timer = undefined
    const cambiadas = partes
    partes = new Set()
    for (const s of sessions.list()) {
      if (!mismaCwd(s.cwd, cwd)) continue
      const suya = carpetaDe(s).toLowerCase()
      // Sin carpeta propia (trabaja en `cwd`), cualquier cambio puede ser suyo.
      if (!suya || cambiadas.has(suya) || cambiadas.has('*')) avisar({ type: 'etapas', sessionId: s.id })
    }
  }
  let w: ReturnType<typeof watch>
  try {
    w = watch(cwd, { recursive: true }, (_evento, nombre) => {
      const ruta = nombre?.replaceAll('\\', '/')
      if (ruta && /(^|\/)(node_modules|\.git)(\/|$)/.test(ruta)) return
      const [primera, ...resto] = ruta?.split('/') ?? ['*']
      // Una carpeta que nace, se borra o cambia de nombre puede ser la de un hilo; dentro de ella, solo lo que enseña el
      // panel, visto desde la carpeta del hilo o desde `cwd`.
      if (ruta && resto.length && !vigilada.globs.some((g) => matchesGlob(resto.join('/'), g) || matchesGlob(ruta, g))) return
      partes.add(primera.toLowerCase())
      const ahora = Date.now()
      if (!timer) desde = ahora
      else if (ahora - desde < 2000) clearTimeout(timer)
      else return
      timer = setTimeout(repartir, 300)
    })
  } catch {
    return // Aún no existe: se vuelve a intentar cuando alguien mire otra vez.
  }
  w.on('error', () => {
    w.close()
    vigiladas.delete(clave)
  })
  vigiladas.set(clave, vigilada)
}

const reavisos = new Map<string, ReturnType<typeof setTimeout>>()

/** Vuelve a avisar del hilo a la hora `cuando`, aunque su carpeta no cambie. */
function reavisar(sessionId: string, cuando: number, avisar: Avisar) {
  clearTimeout(reavisos.get(sessionId))
  const timer = setTimeout(() => {
    reavisos.delete(sessionId)
    avisar({ type: 'etapas', sessionId })
  }, cuando - Date.now() + 200)
  reavisos.set(sessionId, timer)
}

/**
 * `GET /api/sessions/<id>/etapas`, `GET /api/sessions/<id>/archivo?ruta=…`, `GET /api/sessions/<id>/vivo/<ruta>`,
 * `GET /api/sessions/<id>/motor` (y `/motor/motor.js`), `GET /api/sessions/<id>/onda?ruta=…`,
 * `GET`/`POST /api/sessions/<id>/carpeta` y `POST /api/sessions/<id>/version`.
 * Devuelve si atendió la petición. `avisar` manda `{ type: 'etapas' }` cuando cambia la carpeta de un hilo que alguien
 * mira. Una imagen pedida con `&mini` sale en pequeño (`miniatura`, de `server/miniaturas.ts`); un archivo pedido con
 * `&descarga=<nombre>`, se descarga con ese nombre.
 */
export async function etapasApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  sessions: Sessions,
  cards: Card[],
  avisar: Avisar,
  miniatura: (file: string) => Promise<string>
): Promise<boolean> {
  const m = /^\/api\/sessions\/([\w-]+)\/(etapas|archivo|carpeta|vivo|motor|onda|imagen|version)(?:\/(.+))?$/.exec(url.pathname)
  const metodos = m?.[2] === 'carpeta' ? ['GET', 'POST'] : m?.[2] === 'version' ? ['POST'] : ['GET']
  // `vivo` va siempre con su ruta; `motor`, con o sin ella (la página o su script); las demás, sin.
  const ruta = m?.[2] === 'vivo' ? !!m[3] : m?.[2] === 'motor' || !m?.[3]
  if (!m || !ruta || !metodos.includes(req.method ?? '')) return false
  const meta = sessions.meta(m[1])
  if (!meta) return json(res, 404, { error: 'No existe' })
  const card = cards.find((c) => c.id === meta.cardId)
  // Lo que el agente está mirando: una imagen que leyó, para enseñarla en el chat. Puede estar fuera de la carpeta del
  // hilo (una de otro video de su card), pero no fuera de donde trabaja su card. Sin caché: una hoja se rehace en el sitio.
  if (m[2] === 'imagen') {
    const file = resolve(url.searchParams.get('ruta') ?? '')
    const dentro = file.toLowerCase().startsWith(resolve(meta.cwd).toLowerCase() + sep)
    if (!dentro || !IMAGE_TYPES[extname(file).toLowerCase()]) return json(res, 403, { error: 'No es una imagen de donde trabaja este hilo' })
    return servir(req, res, file, 'no-cache')
  }

  // Sin etapas («Nuevo estilo»), el hilo no tiene una carpeta suya.
  const folder = card?.etapas?.length ? folderOf(meta) : meta.cwd
  /** Relee el avance de todos los hilos que miran esta carpeta: más de uno puede seguir el mismo video. */
  const avisarCarpeta = (f: string) => {
    for (const s of sessions.list()) if (mismaCwd(folderOf(s), f)) avisar({ type: 'etapas', sessionId: s.id })
  }

  if (m[2] === 'etapas') {
    if (card) vigilar(meta.cwd, card, sessions, avisar)
    frescoHasta = Infinity
    const ed = card?.editor
    let editor: Avance['editor']
    if (ed) {
      // `revision/{id}_95.jpg`: el id de cada escena sale del nombre del archivo.
      const [pre, post] = (ed.cuadros ?? '').split('{id}')
      const cuadros: Record<string, Archivo> = {}
      if (ed.cuadros) for (const a of files(folder, `${pre}*${post}`)) cuadros[a.ruta.slice(pre.length, a.ruta.length - post.length)] = a
      editor = { guion: one(folder, ed.guion), linea: one(folder, ed.linea), cuadros }
    }
    const etapas = (card?.etapas ?? []).map((e) => {
      // El nacimiento y no la última edición: rehacer un archivo no mueve la etapa en el tiempo.
      const born = listos(folder, e.listo).map(({ st }) => st.birthtimeMs)
      return { ...e, hecha: born.length > 0, hechaEn: born.length ? Math.min(...born) : undefined, archivos: e.muestra ? files(folder, e.muestra) : [] }
    })
    const conEtapas = card?.etapas?.length ? card : undefined
    const avance: Avance = {
      carpeta: folder,
      etapas,
      editor,
      monitor: conEtapas && monitorDe(meta.id, conEtapas, folder, etapas, () => avisarCarpeta(folder)),
      finales: conEtapas && finalesDe(meta, conEtapas, folder)
    }
    // Un MP4 que se seguía escribiendo no contó. Cuando acabe no cambia nada más en la carpeta: se avisa entonces.
    if (frescoHasta < Infinity) reavisar(meta.id, frescoHasta, avisar)
    return json(res, 200, avance)
  }

  // La carpeta del hilo, y cambiarla por otra que ya existe en `cwd`: un hilo que sigue el video de otro, uno que trabajó
  // en otra, o uno de antes de que Sloth nombrara la suya.
  if (m[2] === 'carpeta') {
    if (!card?.etapas?.length) return json(res, 400, { error: 'Este hilo no tiene carpeta de video' })
    if (req.method === 'GET') return json(res, 200, { actual: carpetaDe(meta), carpetas: carpetasDeVideo(meta.cwd, sessions) })
    let text = ''
    for await (const chunk of req) text += chunk
    const pide = String((JSON.parse(text || '{}') as { carpeta?: string }).carpeta ?? '')
    const carpeta = carpetaValida(meta.cwd, pide)
    if (!carpeta) return json(res, 400, { error: `No hay una carpeta «${pide}» en ${meta.cwd}` })
    sessions.setCarpeta(meta.id, carpeta)
    avisar({ type: 'etapas', sessionId: meta.id })
    return json(res, 200, { actual: carpeta })
  }

  if (m[2] === 'version') {
    if (!card?.etapas?.length || !carpetaDe(meta)) return json(res, 400, { error: 'Este hilo no tiene una carpeta de video propia' })
    if (meta.running || meta.background?.length || meta.pendiente) return json(res, 409, { error: 'El agente sigue con este video: espera a que termine.' })
    const { antes, nueva } = otraVersion(meta, sessions)
    sessions.steer(
      meta.id,
      `Haz otra versión de este video, distinta de la actual: el mismo tema, formato y duración, con otro enfoque (otra idea visual, otro ritmo, otra música). ` +
        `No toques la actual, que se queda en la carpeta «${antes}»: trabaja desde ahora en la carpeta «${nueva}», que ya está creada junto a ella, y copia de «${antes}» solo lo que quieras reutilizar. ` +
        `Deja en «${nueva}» todos los archivos de la nueva versión, con los nombres de siempre, como en un video nuevo.`
    )
    avisar({ type: 'etapas', sessionId: meta.id })
    return json(res, 200, { carpeta: nueva })
  }

  // El motor en vivo: su página lee lo de `public/` por la ruta de la vista en vivo.
  if (m[2] === 'motor') return servirMotor(res, folder, m[3], `/api/sessions/${meta.id}/vivo`)

  // Solo sirve lo que está dentro de la carpeta de la sesión. La vista en vivo va por ruta y no por `?ruta=`: su página
  // pide su script y los archivos de `public/` con rutas relativas, que no llevan `?t=`, así que no se guardan.
  const vivo = m[2] === 'vivo'
  const file = resolve(folder, vivo ? decodeURIComponent(m[3]) : (url.searchParams.get('ruta') ?? ''))
  if (!file.startsWith(resolve(folder) + sep)) return json(res, 403, { error: 'Fuera de la carpeta' })
  if (m[2] === 'onda') return servirOnda(res, file)
  if (url.searchParams.has('mini') && IMAGE_TYPES[extname(file).toLowerCase()]) {
    const mini = await miniatura(file).catch((e) => {
      if (existsSync(file)) console.error(`La miniatura de ${file} falló: ${e instanceof Error ? e.message : e}`)
      return file
    })
    return servir(req, res, mini)
  }
  return servir(req, res, file, vivo ? 'no-cache' : undefined, url.searchParams.get('descarga') ?? undefined)
}

/**
 * Manda un archivo del disco. Los videos se piden por tramos para poder adelantarlos. Va con su fecha y su huella (tamaño
 * y fecha al milisegundo, como nginx): con `no-cache`, el navegador pregunta cada vez si cambió y, si no, se le contesta
 * 304 sin volver a mandarlo. La vista en vivo carga así cientos de MB de `public/` sin bajarlos en cada recarga. Con
 * `descarga`, el navegador lo guarda con ese nombre en vez de abrirlo.
 */
export function servir(req: IncomingMessage, res: ServerResponse, file: string, cache = 'max-age=31536000, immutable', descarga?: string): true {
  let st: Stats
  try {
    st = statSync(file)
  } catch {
    return json(res, 404, { error: 'No existe' })
  }
  const { size } = st
  const etag = `"${size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`
  const fecha = st.mtime.toUTCString()
  // La ruta lleva `?t=<mtime>`: si el archivo cambia, cambia la URL. La de la vista en vivo no: esa pregunta.
  const validar = { etag, 'last-modified': fecha, 'cache-control': cache }
  const tiene = req.headers['if-none-match']
  if (tiene ? tiene.split(/\s*,\s*/).some((e) => e === '*' || e.replace(/^W\//, '') === etag) : req.headers['if-modified-since'] === fecha) {
    res.writeHead(304, validar)
    res.end()
    return true
  }
  const head: Record<string, string> = { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'accept-ranges': 'bytes', ...validar }
  if (descarga) {
    // Un nombre de archivo, sin rutas ni lo que Windows no deja; las tildes van aparte, que la cabecera es ASCII.
    const nombre = basename(descarga.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-')) || basename(file)
    head['content-disposition'] = `attachment; filename="${nombre.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
  // Un tramo de lo que el navegador ya tiene a medias (`If-Range`) solo vale si el archivo no cambió; si cambió, va entero.
  const otro = req.headers['if-range'] && req.headers['if-range'] !== etag && req.headers['if-range'] !== fecha
  if (!range || (!range[1] && !range[2]) || otro) {
    res.writeHead(200, { ...head, 'content-length': size })
    createReadStream(file).pipe(res)
    return true
  }
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
  if (start > end) {
    res.writeHead(416, { 'content-range': `bytes */${size}` })
    res.end()
    return true
  }
  res.writeHead(206, { ...head, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}` })
  createReadStream(file, { start, end }).pipe(res)
  return true
}

function json(res: ServerResponse, status: number, data: unknown): true {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(data))
  return true
}
