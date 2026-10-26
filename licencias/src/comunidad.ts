/**
 * La comunidad de Sloth: lo que la gente hace con Sloth y cómo lo hace, en un feed como el de Skool
 * (`web/src/Comunidad.tsx`). Entra quien tiene una clave activa (una cuenta gratis o un apoyo) en una computadora que ya la usa (las cabeceras
 * `x-sloth-clave` y `x-sloth-equipo`, que pone `server/comunidad.ts`), y el creador, con la llave `PUBLICAR`: él fija,
 * borra lo de cualquiera, publica en Anuncios, dice cómo va cada mejora y revisa lo reportado. De cada miembro se ve su
 * `id`, su nombre y su foto, nunca su clave.
 *
 * En D1 (migración 0004): `miembros`, `publicaciones`, `comentarios` (con sus respuestas, de un solo nivel), los me gusta
 * de cada una (`likes`, `likes_comentarios`), los `reportes` y los `avisos` de cada miembro: te comentaron, te
 * respondieron, te dieron me gusta, cambió tu mejora, hay un anuncio. Lo que reportan `OCULTAR` personas deja de verse
 * (salvo para quien lo escribió y el creador) hasta que el creador lo revisa. Las imágenes y los videos van a R2
 * (`DESCARGAS`, bajo `comunidad/`) con un nombre al azar, y `GET /comunidad/archivo/<llave>` los sirve sin preguntar quién
 * eres, para que `<img>` y `<video>` los carguen directo.
 *
 * - `GET /comunidad?categoria=&antes=`: quién eres, los números de la comunidad y una página del feed: las fijadas y luego
 *   lo que tuvo actividad más reciente. `antes` es la `actividad` de la última que ya tienes.
 * - `POST /comunidad/publicar` `{categoria, titulo, texto, adjuntos}`.
 * - `GET /comunidad/p/<id>`: una, con sus comentarios. `POST /comunidad/p/<id>` `{categoria?, titulo?, texto?,
 *   adjuntos?, fijada?, estado?}` la cambia; `/borrar`, `/megusta`, `/comentar` `{texto, responde?}`, `/reportar`
 *   `{motivo}` y `/revisada` (el creador quita sus reportes).
 * - `POST /comunidad/c/<id>/borrar`, `/megusta`, `/reportar` y `/revisada`: lo mismo para un comentario.
 * - `GET /comunidad/avisos` (`?cuenta`: solo cuántos sin leer) y `POST /comunidad/avisos/leidos`.
 * - `POST /comunidad/roadmap` `{meta}`: tu voto de qué sigue (uno por miembro; el de un Fundador vale dos). Da la votación.
 * - `POST /comunidad/perfil` `{nombre?, foto?, creditos?}`: `creditos`, solo un Fundador (sale en `GET /creditos`).
 * - `PUT /comunidad/archivo`, con el archivo de cuerpo y su `content-type`: una imagen o un video (sus primeros
 *   segundos, que recorta `server/comunidad.ts`; el entero se enlaza en el texto). Da su llave.
 */
import type { AdjuntoComunidad, Autor, AvisoComunidad, CategoriaComunidad, ComentarioComunidad, FeedComunidad, PublicacionComunidad, RoadmapComunidad } from '../../shared/types.ts'
import { CLAVE, EQUIPO, type Env, type Fila, Rechazo, cuerpo, iguales, json, letras, servir, vigencia } from './index.ts'

export const CATEGORIAS: CategoriaComunidad[] = ['general', 'hice', 'ayuda', 'mejoras', 'anuncios']

/** Las metas del roadmap que se votan: las mismas de sloth.vancci.org («Lo que viene»). Si cambian allá, cambian aquí. */
export const METAS = [
  { id: 'firma', titulo: 'Sloth firmada por Apple' },
  { id: 'youtube', titulo: 'Publicar en YouTube' },
  { id: 'meta', titulo: 'Publicar en Instagram y Facebook' },
  { id: 'tiktok', titulo: 'Publicar en TikTok' },
  { id: 'tienda', titulo: 'La tienda de estilos' }
]
/** La clave del creador en `miembros`. */
const CREADOR = 'admin'
const PAGINA = 20
const MAX_COMENTARIOS = 500
/** Lo más que pesa un archivo. Un video son sus primeros segundos: unos pocos MB. */
const PESO = { imagen: 10 * 1024 * 1024, video: 50 * 1024 * 1024 }
const TIPOS: Record<string, { tipo: 'imagen' | 'video'; ext: string }> = {
  'image/png': { tipo: 'imagen', ext: 'png' },
  'image/jpeg': { tipo: 'imagen', ext: 'jpg' },
  'image/webp': { tipo: 'imagen', ext: 'webp' },
  'image/gif': { tipo: 'imagen', ext: 'gif' },
  'video/mp4': { tipo: 'video', ext: 'mp4' },
  'video/webm': { tipo: 'video', ext: 'webm' },
  'video/quicktime': { tipo: 'video', ext: 'mov' }
}
const LLAVE = /^[a-z0-9]{20}\.(png|jpg|webp|gif|mp4|webm|mov)$/
const IMAGEN = /\.(png|jpg|webp|gif)$/
const ID = /^[a-z0-9]+$/
/** Lo más que publica, comenta o reporta cada miembro en un día: que un error o un abuso no llene la comunidad. */
const AL_DIA = { publicaciones: 10, comentarios: 100, reportes: 20 }
/** Con tantos reportes de personas distintas, una publicación o un comentario deja de verse hasta que el creador lo revise. */
export const OCULTAR = 3
/** Cada cuánto se anota que alguien entró. */
const VISTO = 10 * 60_000
const DIA = 24 * 3600_000
/** Cuánto se guardan los avisos. */
const AVISOS = 60 * DIA

interface Miembro {
  id: string
  clave: string
  nombre: string
  foto: string | null
  creado: string
  visto: string
  /** 1: un Fundador que quiere salir en los créditos de sloth.vancci.org. */
  creditos: number
  /** No es columna: la calcula `INSIGNIA` al leerlo. */
  insignia?: Autor['insignia'] | null
}

interface Guardada {
  id: string
  autor: string
  categoria: CategoriaComunidad
  titulo: string
  texto: string
  adjuntos: string
  fijada: number
  estado: 'haciendo' | 'hecha' | null
  creada: string
  editada: string | null
  actividad: string
  comentarios: number
  likes: number
  reportes: number
  ultimo_comentario: string | null
}

interface ComentarioGuardado {
  id: string
  publicacion: string
  autor: string
  texto: string
  creada: string
  responde: string | null
  likes: number
  reportes: number
}

/** Un adjunto como se guarda: sin URLs, que dependen de `ORIGEN`. */
type Adjunto = Pick<AdjuntoComunidad, 'tipo' | 'llave' | 'poster' | 'vertical'>

export async function comunidad(req: Request, env: Env, url: URL): Promise<Response> {
  const ruta = url.pathname
  // Lo único libre: los archivos, que se piden por un nombre que no se adivina.
  const archivo = /^\/comunidad\/archivo\/([^/]+)$/.exec(ruta)
  if (archivo && (req.method === 'GET' || req.method === 'HEAD')) return servirArchivo(req, env, archivo[1])

  const yo = await quien(req, env)
  if (ruta === '/comunidad' && req.method === 'GET') return json(await feed(env, yo, url))
  if (ruta === '/comunidad/publicar' && req.method === 'POST') return json(await publicar(env, yo, await cuerpo(req)))
  if (ruta === '/comunidad/perfil' && req.method === 'POST') return json(await perfil(env, yo, await cuerpo(req)))
  if (ruta === '/comunidad/roadmap' && req.method === 'POST') {
    const meta = String((await cuerpo(req)).meta ?? '')
    if (!METAS.some((m) => m.id === meta)) throw new Rechazo(400, 'Esa meta no está en el roadmap.')
    await env.DB.prepare('INSERT INTO votos (miembro, meta, creado) VALUES (?, ?, ?) ON CONFLICT (miembro) DO UPDATE SET meta = excluded.meta, creado = excluded.creado')
      .bind(yo.id, meta, new Date().toISOString())
      .run()
    return json(await roadmap(env, yo))
  }
  if (ruta === '/comunidad/avisos' && req.method === 'GET') return json(await avisos(env, yo, url.searchParams.has('cuenta')))
  if (ruta === '/comunidad/avisos/leidos' && req.method === 'POST') {
    await env.DB.prepare('UPDATE avisos SET leido = 1 WHERE para = ? AND leido = 0').bind(yo.id).run()
    return json({ ok: true })
  }
  if (ruta === '/comunidad/archivo' && req.method === 'PUT') return json(await subir(req, env))

  const p = /^\/comunidad\/p\/([a-z0-9]+)(?:\/(borrar|megusta|comentar|reportar|revisada))?$/.exec(ruta)
  if (p && req.method === 'GET' && !p[2]) return json(await abrir(env, yo, p[1]))
  if (p && req.method === 'POST') {
    const pub = await env.DB.prepare('SELECT * FROM publicaciones WHERE id = ?').bind(p[1]).first<Guardada>()
    if (!pub || !laVe(pub, yo)) throw new Rechazo(404, 'Esa publicación ya no existe.')
    if (p[2] === 'megusta') return json(await megusta(env, yo, pub))
    if (p[2] === 'comentar') return json(await comentar(env, yo, pub, await cuerpo(req)))
    if (p[2] === 'borrar') return json(await borrar(env, yo, pub))
    if (p[2] === 'reportar') return json(await reportar(env, yo, 'publicaciones', pub, await cuerpo(req)))
    if (p[2] === 'revisada') return json(await revisada(env, yo, 'publicaciones', pub.id))
    return json(await cambiar(env, yo, pub, await cuerpo(req)))
  }
  const c = /^\/comunidad\/c\/([a-z0-9]+)\/(borrar|megusta|reportar|revisada)$/.exec(ruta)
  if (c && req.method === 'POST') {
    const com = await env.DB.prepare('SELECT * FROM comentarios WHERE id = ?').bind(c[1]).first<ComentarioGuardado>()
    if (!com) throw new Rechazo(404, 'Ese comentario ya no existe.')
    if (c[2] === 'borrar') return json(await borrarComentario(env, yo, com))
    if (c[2] === 'megusta') return json(await megustaComentario(env, yo, com))
    if (c[2] === 'reportar') return json(await reportar(env, yo, 'comentarios', com, await cuerpo(req)))
    return json(await revisada(env, yo, 'comentarios', com.id))
  }
  throw new Rechazo(404, 'No existe')
}

/**
 * Quién pide: el creador, con la llave `PUBLICAR`, o una clave activa en una computadora que la usa. Quien entra por
 * primera vez queda como miembro, sin nombre: lo pone al publicar o comentar. Las claves de un mismo correo (su cuenta
 * gratis y la de su apoyo) son el mismo miembro.
 */
async function quien(req: Request, env: Env): Promise<Miembro> {
  const ahora = Date.now()
  let clave = CREADOR
  if (!env.PUBLICAR || !iguales(req.headers.get('authorization') ?? '', `Bearer ${env.PUBLICAR}`)) {
    clave = (req.headers.get('x-sloth-clave') ?? '').replace(/\s+/g, '').toUpperCase()
    const equipo = req.headers.get('x-sloth-equipo') ?? ''
    const fila =
      CLAVE.test(clave) && EQUIPO.test(equipo)
        ? await env.DB.prepare('SELECT l.estado, l.pagado_hasta FROM licencias l JOIN equipos e ON e.clave = l.clave WHERE l.clave = ? AND e.equipo = ?')
            .bind(clave, equipo)
            .first<Pick<Fila, 'estado' | 'pagado_hasta'>>()
        : null
    if (!fila || !vigencia(fila, ahora).activa) throw new Rechazo(401, 'Para entrar a la comunidad, crea tu cuenta gratis de Sloth.')
  }
  const m =
    (await env.DB.prepare(`SELECT m.*, ${INSIGNIA} FROM miembros m JOIN licencias l ON l.clave = m.clave WHERE l.email = (SELECT email FROM licencias WHERE clave = ?) ORDER BY m.creado LIMIT 1`)
      .bind(clave)
      .first<Miembro>()) ?? (await env.DB.prepare(`SELECT m.*, ${INSIGNIA} FROM miembros m WHERE m.clave = ?`).bind(clave).first<Miembro>())
  if (m) {
    if (ahora - Date.parse(m.visto) > VISTO) await env.DB.prepare('UPDATE miembros SET visto = ? WHERE id = ?').bind(new Date(ahora).toISOString(), m.id).run()
    return m
  }
  const hoy = new Date(ahora).toISOString()
  await env.DB.prepare('INSERT INTO miembros (id, clave, creado, visto) VALUES (?, ?, ?, ?) ON CONFLICT (clave) DO NOTHING').bind(nuevoId(), clave, hoy, hoy).run()
  return (await env.DB.prepare(`SELECT m.*, ${INSIGNIA} FROM miembros m WHERE m.clave = ?`).bind(clave).first<Miembro>())!
}

/**
 * La insignia del miembro `m`, por el correo de su clave: `fundador` si un apoyo suyo entró entre los primeros y se
 * pagó (para siempre), `apoya` mientras tenga uno pagado y sin vencer.
 */
const INSIGNIA = `(SELECT CASE WHEN MAX(li.fundador = 1 AND li.autorizada IS NOT NULL) THEN 'fundador'
  WHEN MAX(julianday(li.pagado_hasta) > julianday('now')) THEN 'apoya' END
  FROM licencias li WHERE li.plan IN ('mensual', 'anual') AND li.modo = 'produccion'
  AND li.email = (SELECT lc.email FROM licencias lc WHERE lc.clave = m.clave)) AS insignia`

const nuevoId = () => letras(12).toLowerCase()
const urlDe = (env: Env, llave: string) => `${env.ORIGEN}/comunidad/archivo/${llave}`
const autor = (env: Env, m: Pick<Miembro, 'id' | 'nombre' | 'foto' | 'clave' | 'insignia'>): Autor => ({
  id: m.id,
  nombre: m.nombre,
  ...(m.foto ? { foto: urlDe(env, m.foto) } : {}),
  ...(m.clave === CREADOR ? { creador: true } : m.insignia ? { insignia: m.insignia } : {})
})
const esCreador = (m: Miembro) => m.clave === CREADOR
/** Lo reportado por `OCULTAR` personas solo lo ven quien lo escribió y el creador. */
const laVe = (x: { autor: string; reportes: number }, yo: Miembro) => x.reportes < OCULTAR || x.autor === yo.id || esCreador(yo)

/**
 * Un aviso para `para` de lo que hizo `de`. Nadie se avisa a sí mismo. Con `unaVez`, no se repite (quitar y volver a
 * dar me gusta no avisa dos veces).
 */
function aviso(env: Env, para: string, de: Miembro, tipo: AvisoComunidad['tipo'], publicacion: string, extra: { comentario?: string; texto?: string; unaVez?: boolean } = {}): D1PreparedStatement[] {
  if (para === de.id) return []
  const valores = [nuevoId(), para, de.id, tipo, publicacion, extra.comentario ?? null, extra.texto ?? '', new Date().toISOString()]
  if (!extra.unaVez) return [env.DB.prepare('INSERT INTO avisos (id, para, de, tipo, publicacion, comentario, texto, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(...valores)]
  return [
    env.DB.prepare(
      'INSERT INTO avisos (id, para, de, tipo, publicacion, comentario, texto, creado) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM avisos WHERE para = ? AND de = ? AND tipo = ? AND publicacion = ? AND comentario IS ?)'
    ).bind(...valores, para, de.id, tipo, publicacion, extra.comentario ?? null)
  ]
}

/** La página del feed, con quién eres y los números de la comunidad. */
async function feed(env: Env, yo: Miembro, url: URL): Promise<FeedComunidad> {
  const categoria = url.searchParams.get('categoria') ?? ''
  const antes = url.searchParams.get('antes') ?? ''
  const donde: string[] = []
  const valores: (string | number)[] = []
  if (categoria) {
    if (!CATEGORIAS.includes(categoria as CategoriaComunidad)) throw new Rechazo(400, 'Esa sección no existe.')
    donde.push('categoria = ?')
    valores.push(categoria)
  }
  if (!esCreador(yo)) donde.push('(reportes < ? OR autor = ?)'), valores.push(OCULTAR, yo.id)
  // Las fijadas van solo en la primera página; las siguientes siguen por actividad.
  if (antes) donde.push('fijada = 0 AND actividad < ?'), valores.push(antes)
  const sql = `SELECT * FROM publicaciones${donde.length ? ` WHERE ${donde.join(' AND ')}` : ''} ORDER BY ${antes ? '' : 'fijada DESC, '}actividad DESC LIMIT ${PAGINA + 1}`
  const haceUnDia = new Date(Date.now() - DIA).toISOString()
  const ahora = new Date().toISOString()
  const [pubs, cuentas] = await env.DB.batch([
    env.DB.prepare(sql).bind(...valores),
    env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM licencias WHERE estado IN ('authorized', 'gratis') OR pagado_hasta > ?) AS miembros,
        (SELECT COUNT(DISTINCT clave) FROM equipos WHERE visto > ?) AS activos,
        (SELECT COUNT(*) FROM publicaciones WHERE autor = ?) AS publicaciones,
        (SELECT COUNT(*) FROM comentarios WHERE autor = ?) AS comentarios,
        (SELECT COUNT(*) FROM avisos WHERE para = ? AND leido = 0) AS avisos`
    ).bind(ahora, haceUnDia, yo.id, yo.id, yo.id)
  ])
  const filas = pubs.results as unknown as Guardada[]
  const n = cuentas.results[0] as { miembros: number; activos: number; publicaciones: number; comentarios: number; avisos: number }
  return {
    yo: { ...autor(env, yo), creditos: !!yo.creditos, publicaciones: n.publicaciones, comentarios: n.comentarios },
    miembros: n.miembros,
    activos: n.activos,
    avisos: n.avisos,
    roadmap: await roadmap(env, yo),
    publicaciones: await armar(env, yo, filas.slice(0, PAGINA)),
    mas: filas.length > PAGINA
  }
}

/** Las publicaciones como las ve `yo`: con su autor, si le gustan y las caras de los últimos que comentaron. */
async function armar(env: Env, yo: Miembro, filas: Guardada[]): Promise<PublicacionComunidad[]> {
  if (!filas.length) return []
  const ids = filas.map((f) => f.id)
  const marcas = ids.map(() => '?').join(', ')
  const [gustan, comentaron] = await env.DB.batch([
    env.DB.prepare(`SELECT publicacion FROM likes WHERE miembro = ? AND publicacion IN (${marcas})`).bind(yo.id, ...ids),
    env.DB.prepare(
      `SELECT publicacion, autor FROM (
        SELECT publicacion, autor, ROW_NUMBER() OVER (PARTITION BY publicacion ORDER BY MAX(creada) DESC) AS n
        FROM comentarios WHERE publicacion IN (${marcas}) GROUP BY publicacion, autor
      ) WHERE n <= 5 ORDER BY publicacion, n`
    ).bind(...ids)
  ])
  const caras = comentaron.results as { publicacion: string; autor: string }[]
  const autores = await miembros(env, [...filas.map((f) => f.autor), ...caras.map((c) => c.autor)])
  const leGustan = new Set((gustan.results as { publicacion: string }[]).map((g) => g.publicacion))
  return filas.map((f) => ({
    id: f.id,
    autor: autores.get(f.autor) ?? { id: f.autor, nombre: '' },
    categoria: f.categoria,
    titulo: f.titulo,
    texto: f.texto,
    adjuntos: (JSON.parse(f.adjuntos) as Adjunto[]).map((a) => ({ ...a, url: urlDe(env, a.llave), ...(a.poster ? { posterUrl: urlDe(env, a.poster) } : {}) })),
    fijada: !!f.fijada,
    ...(f.estado ? { estado: f.estado } : {}),
    creada: f.creada,
    ...(f.editada ? { editada: f.editada } : {}),
    actividad: f.actividad,
    likes: f.likes,
    megusta: leGustan.has(f.id),
    comentarios: f.comentarios,
    ...(f.ultimo_comentario ? { ultimoComentario: f.ultimo_comentario } : {}),
    comentaron: caras.filter((c) => c.publicacion === f.id).flatMap((c) => autores.get(c.autor) ?? []),
    ...(esCreador(yo) && f.reportes ? { reportes: f.reportes } : {})
  }))
}

async function miembros(env: Env, ids: string[]): Promise<Map<string, Autor>> {
  const unicos = [...new Set(ids)]
  const mapa = new Map<string, Autor>()
  // D1 acepta hasta 100 valores por consulta.
  for (let i = 0; i < unicos.length; i += 90) {
    const parte = unicos.slice(i, i + 90)
    const { results } = await env.DB.prepare(`SELECT m.id, m.clave, m.nombre, m.foto, ${INSIGNIA} FROM miembros m WHERE m.id IN (${parte.map(() => '?').join(', ')})`).bind(...parte).all<Miembro>()
    for (const m of results) mapa.set(m.id, autor(env, m))
  }
  return mapa
}

/** Una publicación, con sus comentarios (del más viejo al más nuevo; las respuestas dicen a cuál responden). */
async function abrir(env: Env, yo: Miembro, id: string): Promise<{ publicacion: PublicacionComunidad; comentarios: ComentarioComunidad[] }> {
  const f = await env.DB.prepare('SELECT * FROM publicaciones WHERE id = ?').bind(id).first<Guardada>()
  if (!f || !laVe(f, yo)) throw new Rechazo(404, 'Esa publicación ya no existe.')
  const [todos, gustan] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM comentarios WHERE publicacion = ? ORDER BY creada LIMIT ${MAX_COMENTARIOS}`).bind(id),
    env.DB.prepare('SELECT l.comentario FROM likes_comentarios l JOIN comentarios c ON c.id = l.comentario WHERE c.publicacion = ? AND l.miembro = ?').bind(id, yo.id)
  ])
  const comentarios = (todos.results as unknown as ComentarioGuardado[]).filter((c) => laVe(c, yo))
  const leGustan = new Set((gustan.results as { comentario: string }[]).map((g) => g.comentario))
  const autores = await miembros(env, comentarios.map((c) => c.autor))
  const [publicacion] = await armar(env, yo, [f])
  return {
    publicacion,
    comentarios: comentarios
      // Las respuestas a un comentario que ya no se ve, tampoco.
      .filter((c) => !c.responde || comentarios.some((x) => x.id === c.responde))
      .map((c) => comentarioComo(env, yo, c, autores.get(c.autor), leGustan.has(c.id)))
  }
}

function comentarioComo(env: Env, yo: Miembro, c: ComentarioGuardado, a: Autor | undefined, megusta: boolean): ComentarioComunidad {
  return {
    id: c.id,
    autor: a ?? { id: c.autor, nombre: '' },
    texto: c.texto,
    creada: c.creada,
    ...(c.responde ? { responde: c.responde } : {}),
    likes: c.likes,
    megusta,
    ...(esCreador(yo) && c.reportes ? { reportes: c.reportes } : {})
  }
}

/** Lo que se escribe, ya limpio y recortado. */
function texto(valor: unknown, max: number): string {
  return String(valor ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function categoriaDe(valor: unknown, yo: Miembro): CategoriaComunidad {
  const c = String(valor ?? '') as CategoriaComunidad
  if (!CATEGORIAS.includes(c)) throw new Rechazo(400, 'Elige en qué sección va.')
  if (c === 'anuncios' && !esCreador(yo)) throw new Rechazo(403, 'En Anuncios solo publica el creador de Sloth.')
  return c
}

/** Los adjuntos que se pueden guardar: archivos de la comunidad, a lo más 10 y un solo video. */
export function adjuntosDe(valor: unknown): Adjunto[] {
  if (!Array.isArray(valor)) return []
  const lista = valor.flatMap((a): Adjunto[] => {
    if (!a || typeof a !== 'object') return []
    const { tipo, llave, poster, vertical } = a as Record<string, unknown>
    if ((tipo !== 'imagen' && tipo !== 'video') || typeof llave !== 'string' || !LLAVE.test(llave)) return []
    if ((tipo === 'imagen') !== IMAGEN.test(llave)) return []
    return [
      {
        tipo,
        llave,
        ...(tipo === 'video' && typeof poster === 'string' && LLAVE.test(poster) && IMAGEN.test(poster) ? { poster } : {}),
        ...(tipo === 'video' && typeof vertical === 'boolean' ? { vertical } : {})
      }
    ]
  })
  const video = lista.findIndex((a) => a.tipo === 'video')
  return lista.filter((a, i) => a.tipo === 'imagen' || i === video).slice(0, 10)
}

/** Sin nombre no se publica ni se comenta: así nadie es «alguien». */
function sinNombre(yo: Miembro) {
  if (!yo.nombre) throw new Rechazo(400, 'Antes, dinos cómo te llamas: así te ven los demás.')
}

async function hoyHizo(env: Env, tabla: 'publicaciones' | 'comentarios' | 'reportes', yo: Miembro): Promise<number> {
  const quien = tabla === 'reportes' ? 'miembro' : 'autor'
  const cuando = tabla === 'reportes' ? 'creado' : 'creada'
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ${quien} = ? AND ${cuando} > ?`).bind(yo.id, new Date(Date.now() - DIA).toISOString()).first<{ n: number }>()
  return r?.n ?? 0
}

async function publicar(env: Env, yo: Miembro, c: Record<string, unknown>): Promise<PublicacionComunidad> {
  sinNombre(yo)
  const categoria = categoriaDe(c.categoria, yo)
  const titulo = texto(c.titulo, 140)
  const cuerpoTexto = texto(c.texto, 20_000)
  const adjuntos = adjuntosDe(c.adjuntos)
  if (!titulo && !cuerpoTexto && !adjuntos.length) throw new Rechazo(400, 'Escribe algo o agrega una imagen.')
  if (!esCreador(yo) && (await hoyHizo(env, 'publicaciones', yo)) >= AL_DIA.publicaciones)
    throw new Rechazo(429, `Ya publicaste ${AL_DIA.publicaciones} veces hoy. Mañana sigues.`)
  const ahora = new Date().toISOString()
  const f: Guardada = { id: nuevoId(), autor: yo.id, categoria, titulo, texto: cuerpoTexto, adjuntos: JSON.stringify(adjuntos), fijada: 0, estado: null, creada: ahora, editada: null, actividad: ahora, comentarios: 0, likes: 0, reportes: 0, ultimo_comentario: null }
  await env.DB.batch([
    env.DB.prepare('INSERT INTO publicaciones (id, autor, categoria, titulo, texto, adjuntos, creada, actividad) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(
      f.id,
      f.autor,
      f.categoria,
      f.titulo,
      f.texto,
      f.adjuntos,
      f.creada,
      f.actividad
    ),
    // Un anuncio les llega a todos.
    ...(categoria === 'anuncios'
      ? [
          env.DB.prepare("INSERT INTO avisos (id, para, de, tipo, publicacion, creado) SELECT lower(hex(randomblob(6))), id, ?, 'anuncio', ?, ? FROM miembros WHERE id != ?").bind(
            yo.id,
            f.id,
            ahora,
            yo.id
          )
        ]
      : [])
  ])
  return (await armar(env, yo, [f]))[0]
}

/** Quien la escribió cambia lo suyo; el creador, además, la fija y dice cómo va una mejora (y se le avisa a quien la pidió). */
async function cambiar(env: Env, yo: Miembro, f: Guardada, c: Record<string, unknown>): Promise<PublicacionComunidad> {
  const suya = f.autor === yo.id
  const creador = esCreador(yo)
  const contenido = c.titulo !== undefined || c.texto !== undefined || c.adjuntos !== undefined || c.categoria !== undefined
  if (contenido && !suya && !creador) throw new Rechazo(403, 'Solo quien la escribió puede cambiarla.')
  if ((c.fijada !== undefined || c.estado !== undefined) && !creador) throw new Rechazo(403, 'Eso solo lo hace el creador de Sloth.')
  const nueva: Guardada = { ...f }
  if (c.categoria !== undefined) nueva.categoria = categoriaDe(c.categoria, yo)
  if (c.titulo !== undefined) nueva.titulo = texto(c.titulo, 140)
  if (c.texto !== undefined) nueva.texto = texto(c.texto, 20_000)
  if (c.adjuntos !== undefined) nueva.adjuntos = JSON.stringify(adjuntosDe(c.adjuntos))
  if (contenido && !nueva.titulo && !nueva.texto && nueva.adjuntos === '[]') throw new Rechazo(400, 'No puede quedar vacía: bórrala.')
  if (contenido) nueva.editada = new Date().toISOString()
  if (c.fijada !== undefined) nueva.fijada = c.fijada ? 1 : 0
  if (c.estado !== undefined) nueva.estado = c.estado === 'haciendo' || c.estado === 'hecha' ? c.estado : null
  if (nueva.categoria !== 'mejoras') nueva.estado = null
  await env.DB.batch([
    env.DB.prepare('UPDATE publicaciones SET categoria = ?, titulo = ?, texto = ?, adjuntos = ?, fijada = ?, estado = ?, editada = ? WHERE id = ?').bind(
      nueva.categoria,
      nueva.titulo,
      nueva.texto,
      nueva.adjuntos,
      nueva.fijada,
      nueva.estado,
      nueva.editada,
      f.id
    ),
    ...(nueva.estado && nueva.estado !== f.estado ? aviso(env, f.autor, yo, 'estado', f.id, { texto: nueva.estado }) : [])
  ])
  // Lo que se quitó al editar ya no se usa.
  await quitarArchivos(env, llavesDe(f.adjuntos).filter((l) => !llavesDe(nueva.adjuntos).includes(l)))
  return (await armar(env, yo, [nueva]))[0]
}

async function borrar(env: Env, yo: Miembro, f: Guardada): Promise<{ ok: true }> {
  if (f.autor !== yo.id && !esCreador(yo)) throw new Rechazo(403, 'Solo quien la escribió puede borrarla.')
  const suyos = 'SELECT id FROM comentarios WHERE publicacion = ?'
  await env.DB.batch([
    env.DB.prepare('DELETE FROM likes WHERE publicacion = ?').bind(f.id),
    env.DB.prepare(`DELETE FROM likes_comentarios WHERE comentario IN (${suyos})`).bind(f.id),
    env.DB.prepare(`DELETE FROM reportes WHERE objeto = ? OR objeto IN (${suyos})`).bind(f.id, f.id),
    env.DB.prepare('DELETE FROM avisos WHERE publicacion = ?').bind(f.id),
    env.DB.prepare('DELETE FROM comentarios WHERE publicacion = ?').bind(f.id),
    env.DB.prepare('DELETE FROM publicaciones WHERE id = ?').bind(f.id)
  ])
  await quitarArchivos(env, llavesDe(f.adjuntos))
  return { ok: true }
}

async function megusta(env: Env, yo: Miembro, f: Guardada): Promise<{ likes: number; megusta: boolean }> {
  const puesto = await env.DB.prepare('INSERT INTO likes (publicacion, miembro) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(f.id, yo.id).run()
  const ahora = puesto.meta.changes > 0
  const [, r] = await env.DB.batch([
    ahora ? aviso(env, f.autor, yo, 'gusta', f.id, { unaVez: true })[0] ?? env.DB.prepare('SELECT 1') : env.DB.prepare('DELETE FROM likes WHERE publicacion = ? AND miembro = ?').bind(f.id, yo.id),
    env.DB.prepare('UPDATE publicaciones SET likes = (SELECT COUNT(*) FROM likes WHERE publicacion = ?) WHERE id = ? RETURNING likes').bind(f.id, f.id)
  ])
  return { likes: (r.results[0] as { likes: number } | undefined)?.likes ?? 0, megusta: ahora }
}

async function megustaComentario(env: Env, yo: Miembro, c: ComentarioGuardado): Promise<{ likes: number; megusta: boolean }> {
  const puesto = await env.DB.prepare('INSERT INTO likes_comentarios (comentario, miembro) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(c.id, yo.id).run()
  const ahora = puesto.meta.changes > 0
  const [, r] = await env.DB.batch([
    ahora
      ? aviso(env, c.autor, yo, 'gustaComentario', c.publicacion, { comentario: c.id, unaVez: true })[0] ?? env.DB.prepare('SELECT 1')
      : env.DB.prepare('DELETE FROM likes_comentarios WHERE comentario = ? AND miembro = ?').bind(c.id, yo.id),
    env.DB.prepare('UPDATE comentarios SET likes = (SELECT COUNT(*) FROM likes_comentarios WHERE comentario = ?) WHERE id = ? RETURNING likes').bind(c.id, c.id)
  ])
  return { likes: (r.results[0] as { likes: number } | undefined)?.likes ?? 0, megusta: ahora }
}

/** Un comentario, o la respuesta a uno (siempre al de primer nivel). Se avisa a quien escribió la publicación y a quien respondes. */
async function comentar(env: Env, yo: Miembro, f: Guardada, c: Record<string, unknown>): Promise<ComentarioComunidad> {
  sinNombre(yo)
  const t = texto(c.texto, 5000)
  if (!t) throw new Rechazo(400, 'Escribe tu comentario.')
  if (!esCreador(yo) && (await hoyHizo(env, 'comentarios', yo)) >= AL_DIA.comentarios) throw new Rechazo(429, 'Ya comentaste mucho hoy. Mañana sigues.')
  let padre: ComentarioGuardado | null = null
  if (c.responde) {
    padre = ID.test(String(c.responde)) ? await env.DB.prepare('SELECT * FROM comentarios WHERE id = ? AND publicacion = ?').bind(String(c.responde), f.id).first<ComentarioGuardado>() : null
    if (!padre) throw new Rechazo(404, 'El comentario al que respondes ya no existe.')
  }
  const ahora = new Date().toISOString()
  const id = nuevoId()
  const responde = padre ? (padre.responde ?? padre.id) : null
  await env.DB.batch([
    env.DB.prepare('INSERT INTO comentarios (id, publicacion, autor, texto, creada, responde) VALUES (?, ?, ?, ?, ?, ?)').bind(id, f.id, yo.id, t, ahora, responde),
    env.DB.prepare('UPDATE publicaciones SET comentarios = comentarios + 1, actividad = ?, ultimo_comentario = ? WHERE id = ?').bind(ahora, ahora, f.id),
    ...(padre ? aviso(env, padre.autor, yo, 'respondio', f.id, { comentario: id }) : []),
    ...(padre?.autor !== f.autor ? aviso(env, f.autor, yo, 'comento', f.id, { comentario: id }) : [])
  ])
  return { id, autor: autor(env, yo), texto: t, creada: ahora, ...(responde ? { responde } : {}), likes: 0, megusta: false }
}

/** Un comentario y, si es de primer nivel, sus respuestas. */
async function borrarComentario(env: Env, yo: Miembro, c: ComentarioGuardado): Promise<{ ok: true }> {
  if (c.autor !== yo.id && !esCreador(yo)) throw new Rechazo(403, 'Solo quien lo escribió puede borrarlo.')
  const ellos = 'SELECT id FROM comentarios WHERE id = ? OR responde = ?'
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM likes_comentarios WHERE comentario IN (${ellos})`).bind(c.id, c.id),
    env.DB.prepare(`DELETE FROM reportes WHERE objeto IN (${ellos})`).bind(c.id, c.id),
    env.DB.prepare(`DELETE FROM avisos WHERE comentario IN (${ellos})`).bind(c.id, c.id),
    env.DB.prepare('DELETE FROM comentarios WHERE id = ? OR responde = ?').bind(c.id, c.id),
    env.DB.prepare(
      'UPDATE publicaciones SET comentarios = (SELECT COUNT(*) FROM comentarios WHERE publicacion = ?), ultimo_comentario = (SELECT MAX(creada) FROM comentarios WHERE publicacion = ?) WHERE id = ?'
    ).bind(c.publicacion, c.publicacion, c.publicacion)
  ])
  return { ok: true }
}

/** Reporta lo de otro, una vez por persona; se le avisa al creador. Con `OCULTAR` reportes deja de verse. */
async function reportar(env: Env, yo: Miembro, tabla: 'publicaciones' | 'comentarios', x: { id: string; autor: string; publicacion?: string }, c: Record<string, unknown>): Promise<{ ok: true }> {
  if (x.autor === yo.id) throw new Rechazo(400, 'No puedes reportar lo tuyo: bórralo.')
  const motivo = texto(c.motivo, 300)
  if (!motivo) throw new Rechazo(400, 'Dinos por qué lo reportas.')
  if ((await hoyHizo(env, 'reportes', yo)) >= AL_DIA.reportes) throw new Rechazo(429, 'Ya reportaste mucho hoy. Si algo es grave, escríbele al creador.')
  const puesto = await env.DB.prepare('INSERT INTO reportes (objeto, miembro, motivo, creado) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING').bind(x.id, yo.id, motivo, new Date().toISOString()).run()
  if (!puesto.meta.changes) return { ok: true }
  const publicacion = x.publicacion ?? x.id
  await env.DB.batch([
    env.DB.prepare(`UPDATE ${tabla} SET reportes = (SELECT COUNT(*) FROM reportes WHERE objeto = ?) WHERE id = ?`).bind(x.id, x.id),
    env.DB.prepare(
      "INSERT INTO avisos (id, para, de, tipo, publicacion, comentario, texto, creado) SELECT ?, id, ?, 'reporte', ?, ?, ?, ? FROM miembros WHERE clave = ? AND id != ?"
    ).bind(nuevoId(), yo.id, publicacion, tabla === 'comentarios' ? x.id : null, motivo, new Date().toISOString(), CREADOR, yo.id)
  ])
  return { ok: true }
}

/** El creador la revisó y se queda: sus reportes se borran y vuelve a verse. */
async function revisada(env: Env, yo: Miembro, tabla: 'publicaciones' | 'comentarios', id: string): Promise<{ ok: true }> {
  if (!esCreador(yo)) throw new Rechazo(403, 'Eso solo lo hace el creador de Sloth.')
  await env.DB.batch([env.DB.prepare('DELETE FROM reportes WHERE objeto = ?').bind(id), env.DB.prepare(`UPDATE ${tabla} SET reportes = 0 WHERE id = ?`).bind(id)])
  return { ok: true }
}

/** Tus avisos, del más nuevo al más viejo, y cuántos sin leer. Con `soloCuenta`, solo cuántos (para la barra lateral). */
async function avisos(env: Env, yo: Miembro, soloCuenta: boolean): Promise<{ avisos?: AvisoComunidad[]; sinLeer: number }> {
  const cuenta = env.DB.prepare('SELECT COUNT(*) AS n FROM avisos WHERE para = ? AND leido = 0').bind(yo.id)
  if (soloCuenta) return { sinLeer: (await cuenta.first<{ n: number }>())?.n ?? 0 }
  const [, filas, n] = await env.DB.batch([
    env.DB.prepare('DELETE FROM avisos WHERE para = ? AND creado < ?').bind(yo.id, new Date(Date.now() - AVISOS).toISOString()),
    env.DB.prepare(
      'SELECT a.*, p.titulo AS titulo, p.texto AS ptexto FROM avisos a LEFT JOIN publicaciones p ON p.id = a.publicacion WHERE a.para = ? ORDER BY a.creado DESC LIMIT 40'
    ).bind(yo.id),
    cuenta
  ])
  type Fila = { id: string; de: string; tipo: AvisoComunidad['tipo']; publicacion: string; comentario: string | null; texto: string; creado: string; leido: number; titulo: string | null; ptexto: string | null }
  const lista = filas.results as unknown as Fila[]
  const autores = await miembros(env, lista.map((a) => a.de))
  return {
    avisos: lista.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      de: autores.get(a.de) ?? { id: a.de, nombre: '' },
      publicacion: a.publicacion,
      sobre: a.titulo || (a.ptexto ?? '').slice(0, 80) || 'una publicación',
      ...(a.comentario ? { comentario: a.comentario } : {}),
      ...(a.texto ? { texto: a.texto } : {}),
      creado: a.creado,
      leido: !!a.leido
    })),
    sinLeer: (n.results[0] as { n: number }).n
  }
}

async function perfil(env: Env, yo: Miembro, c: Record<string, unknown>): Promise<Autor> {
  const nombre = c.nombre === undefined ? yo.nombre : texto(c.nombre, 40).replace(/\s+/g, ' ')
  if (!nombre) throw new Rechazo(400, 'Escribe tu nombre.')
  let foto = yo.foto
  if (c.foto !== undefined) {
    foto = typeof c.foto === 'string' && LLAVE.test(c.foto) && IMAGEN.test(c.foto) ? c.foto : null
    if (c.foto && !foto) throw new Rechazo(400, 'La foto debe ser una imagen.')
  }
  if (c.creditos === true && yo.insignia !== 'fundador') throw new Rechazo(403, 'Los créditos de la página son de los Fundadores.')
  const creditos = c.creditos === undefined ? yo.creditos : c.creditos === true ? 1 : 0
  await env.DB.prepare('UPDATE miembros SET nombre = ?, foto = ?, creditos = ? WHERE id = ?').bind(nombre, foto, creditos, yo.id).run()
  if (yo.foto && yo.foto !== foto) await quitarArchivos(env, [yo.foto])
  return { ...autor(env, { ...yo, nombre, foto }), creditos: !!creditos }
}

/** La votación del roadmap, como la ve `yo`: los votos de cada meta (el de un Fundador vale dos) y el suyo. */
async function roadmap(env: Env, yo: Miembro): Promise<RoadmapComunidad> {
  const { results } = await env.DB.prepare(`SELECT v.miembro, v.meta, ${INSIGNIA} FROM votos v JOIN miembros m ON m.id = v.miembro`).all<{ miembro: string; meta: string; insignia: string | null }>()
  const votos = new Map<string, number>()
  for (const v of results) votos.set(v.meta, (votos.get(v.meta) ?? 0) + (v.insignia === 'fundador' ? 2 : 1))
  const mio = results.find((v) => v.miembro === yo.id)?.meta
  return { metas: METAS.map((m) => ({ ...m, votos: votos.get(m.id) ?? 0 })), ...(mio ? { mio } : {}) }
}

/** Los nombres de los Fundadores que pidieron salir en los créditos de sloth.vancci.org, del primero al último. */
export async function creditos(env: Env): Promise<string[]> {
  const { results } = await env.DB.prepare(`SELECT m.nombre, ${INSIGNIA} FROM miembros m WHERE m.creditos = 1 AND m.nombre != '' ORDER BY m.creado`).all<Pick<Miembro, 'nombre' | 'insignia'>>()
  return results.filter((m) => m.insignia === 'fundador').map((m) => m.nombre)
}

/** El tipo de un archivo y su llave nueva, si se acepta y no pesa de más. */
function aceptar(contentType: string, bytes: number): { tipo: 'imagen' | 'video'; llave: string; contentType: string } {
  const ct = contentType.split(';')[0].trim().toLowerCase()
  const t = TIPOS[ct]
  if (!t) throw new Rechazo(415, 'Solo se suben imágenes (PNG, JPG, WebP, GIF) y videos (MP4, WebM, MOV).')
  if (!bytes) throw new Rechazo(411, 'Falta el tamaño del archivo.')
  if (bytes > PESO[t.tipo]) throw new Rechazo(413, `${t.tipo === 'video' ? 'El video' : 'La imagen'} pesa más de ${pesoLegible(PESO[t.tipo])}.`)
  return { tipo: t.tipo, llave: `${letras(20).toLowerCase()}.${t.ext}`, contentType: ct }
}
const pesoLegible = (b: number) => `${b / 1024 ** 2} MB`
const metadatos = (contentType: string) => ({ httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' } })

/** Una imagen o un video. */
async function subir(req: Request, env: Env): Promise<{ llave: string; url: string }> {
  const bytes = Number(req.headers.get('content-length'))
  const a = aceptar(req.headers.get('content-type') ?? '', bytes)
  if (!req.body) throw new Rechazo(411, 'Falta el archivo.')
  await env.DESCARGAS.put(`comunidad/${a.llave}`, req.body, metadatos(a.contentType))
  return { llave: a.llave, url: urlDe(env, a.llave) }
}

async function servirArchivo(req: Request, env: Env, llave: string): Promise<Response> {
  const cabeza = LLAVE.test(llave) ? await env.DESCARGAS.head(`comunidad/${llave}`) : null
  if (!cabeza) throw new Rechazo(404, 'No existe')
  return servir(req, env, `comunidad/${llave}`, cabeza.size, {
    'content-type': cabeza.httpMetadata?.contentType ?? 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable'
  })
}

function llavesDe(adjuntos: string): string[] {
  return (JSON.parse(adjuntos) as Adjunto[]).flatMap((a) => [a.llave, ...(a.poster ? [a.poster] : [])])
}

async function quitarArchivos(env: Env, llaves: string[]) {
  if (llaves.length) await env.DESCARGAS.delete(llaves.map((l) => `comunidad/${l}`))
}
