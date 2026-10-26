import { idiomaDe } from '../../shared/ideas.ts'
import type { Hallado } from './tiktok.ts'
import { Detenido, Pausa } from './youtube.ts'

/**
 * Instagram para Ideas: los Reels de otras cuentas, y los tuyos, con sus vistas, por `business_discovery` de la Graph API
 * de Facebook. Es la vía oficial y no un scraper porque no hay otra: sin sesión, Instagram responde 429 a quien lee sus
 * páginas, y con sesión bloquea la cuenta que lo hace. Pide un token de Meta con inicio de sesión con Facebook y una
 * Página vinculada a tu cuenta profesional (⚙ Opciones → Llaves de API); no es el token de la nube, que publica. Solo deja
 * ver cuentas de empresa o de creador, y desde el 22-abr-2026 da `view_count` por Reel (vistas pagadas y orgánicas
 * juntas). Límite: 4800 × las impresiones de tu cuenta cada 24 h.
 */

const GRAPH = 'https://graph.facebook.com/v25.0'
/** Cuántas de las últimas publicaciones de una cuenta se leen; de ellas, solo cuentan los Reels. */
const POSTS = 30
const CAMPOS = `username,name,followers_count,media_count,media.limit(${POSTS}){id,caption,like_count,comments_count,view_count,timestamp,media_product_type,media_type,permalink,thumbnail_url,media_url}`

export class NoEsProfesional extends Error {
  constructor(usuario: string) {
    super(`@${usuario} no es una cuenta profesional de Instagram, o no existe: la API solo deja ver cuentas de empresa o de creador.`)
  }
}

const CADUCO = 'El token de Meta caducó o ya no vale: pon uno nuevo en ⚙ Opciones → Llaves de API.'
/** Los códigos de «vas demasiado rápido»: de la app (4), del usuario (17), de la Página (32), de la llamada (613) y de la cuenta de Instagram (80002). */
const LIMITE = new Set([4, 17, 32, 613, 80002])

interface ErrorMeta {
  code?: number
  message?: string
  error_user_title?: string
  error_user_msg?: string
}

/**
 * Cuánto se lleva gastado del límite de Meta para tu cuenta de Instagram, según la última respuesta (la cabecera
 * `x-business-use-case-usage`): el mayor de sus porcentajes, en cuántos minutos se recupera si se llenó, y cuándo se leyó. En una vuelta
 * con 13 frases se llenó a la mitad (2026-10-11): la investigación lo mira para parar a tiempo, sin pausas inútiles.
 */
export const usoMeta = { porcentaje: 0, minutos: 0, en: 0 }

/** Meta llegó a su límite de llamadas. Es una `Pausa`: si se recupera pronto, se espera; si no, Instagram queda para otra vuelta. */
export class LimiteMeta extends Pausa {}

function anotarUso(res: Response) {
  const h = res.headers.get('x-business-use-case-usage')
  if (!h) return
  try {
    const usos = Object.values(JSON.parse(h) as Record<string, { call_count?: number; total_time?: number; total_cputime?: number; estimated_time_to_regain_access?: number }[]>).flat()
    usoMeta.porcentaje = Math.max(0, ...usos.map((u) => Math.max(u.call_count ?? 0, u.total_time ?? 0, u.total_cputime ?? 0)))
    usoMeta.minutos = Math.max(0, ...usos.map((u) => u.estimated_time_to_regain_access ?? 0))
    usoMeta.en = Date.now()
  } catch {}
}

/** Una llamada a la Graph API, con sus errores en español. Con `usuario`, que no lo encuentre es que no es profesional. */
async function graph<T>(ruta: string, params: Record<string, string>, token: string, signal: AbortSignal, usuario?: string): Promise<T> {
  const q = new URLSearchParams({ ...params, access_token: token })
  let res: Response
  try {
    res = await fetch(`${GRAPH}/${ruta}?${q}`, { signal })
  } catch (e) {
    if (signal.aborted) throw new Detenido('Detenida')
    throw new Error(`No llegué a Meta: ${(e as Error).message}`)
  }
  anotarUso(res)
  const json = (await res.json().catch(() => null)) as (T & { error?: ErrorMeta }) | null
  if (signal.aborted) throw new Detenido('Detenida')
  const e = json?.error
  if (e) {
    if (usuario && (e.code === 110 || /Invalid user id|Cannot find User/i.test(`${e.message} ${e.error_user_title}`))) throw new NoEsProfesional(usuario)
    if (e.code === 190) throw new Error(CADUCO)
    if (e.code !== undefined && LIMITE.has(e.code))
      throw new LimiteMeta(`Meta llegó al límite de llamadas de tu Instagram${usoMeta.minutos ? ` (se recupera en unos ${usoMeta.minutos} min)` : ''}.`)
    throw new Error(`La API de Meta respondió: ${e.error_user_msg || e.message}`)
  }
  if (!res.ok || !json) throw new Error(`La API de Meta respondió ${res.status}.`)
  return json
}

/**
 * Tus cuentas de Instagram (las de tus Páginas de Facebook), una vez por token: la API pregunta por otra cuenta desde una
 * tuya, y a las tuyas además les da sus guardados y compartidos.
 */
let tuyas: { token: string; cuentas: { id: string; usuario: string }[] } | null = null

async function cuentasTuyas(token: string, signal: AbortSignal) {
  if (tuyas?.token === token) return tuyas.cuentas
  const { data } = await graph<{ data?: { instagram_business_account?: { id: string; username: string } }[] }>('me/accounts', { fields: 'instagram_business_account{id,username}' }, token, signal)
  const cuentas = (data ?? []).flatMap((p) => (p.instagram_business_account ? [{ id: p.instagram_business_account.id, usuario: p.instagram_business_account.username.toLowerCase() }] : []))
  if (!cuentas.length) throw new Error('El token de Meta no ve ninguna Página de Facebook vinculada a una cuenta profesional de Instagram: vincula una y pon el token otra vez en ⚙ Opciones → Llaves de API.')
  tuyas = { token, cuentas }
  return cuentas
}

interface Media {
  id: string
  caption?: string
  like_count?: number
  comments_count?: number
  view_count?: number
  timestamp: string
  media_product_type?: string
  media_type?: string
  permalink?: string
  thumbnail_url?: string
  /** El archivo: `business_discovery` solo lo da de las fotos; el de tus Reels, `archivosTuyos`. */
  media_url?: string
}

interface Descubierta {
  username: string
  name?: string
  followers_count?: number
  media?: { data?: Media[]; paging?: { cursors?: { after?: string } } }
}

const esReel = (m: Media) => m.media_product_type === 'REELS' || m.media_type === 'VIDEO'

/**
 * Hacia atrás, en páginas de este tamaño y como mucho estas, se buscan los Reels de la búsqueda que no están entre los
 * últimos de su cuenta: Instagram enseña al buscar Reels populares de hace meses, y sin esto solo 1 de 30 tenía vistas.
 */
const PAGINA = 50
const PAGINAS_ATRAS = 3

/**
 * Una cuenta de Instagram y sus últimos Reels (`videos`), como los da `business_discovery`. Si es tuya, cada Reel lleva
 * además sus guardados y compartidos, que Meta solo le da al dueño. `buscados` son códigos de Reels suyos que salieron en
 * una búsqueda: los que no están entre los últimos se buscan hacia atrás y vuelven en `anteriores`, con sus vistas, sin
 * entrar en la mediana de la cuenta (que es la de hoy).
 */
export async function cuentaInstagram(
  usuario: string,
  token: string,
  signal: AbortSignal,
  buscados: string[] = []
): Promise<{ nombre: string; usuario: string; seguidores?: number; videos: Hallado[]; anteriores: Hallado[] }> {
  const u = usuario.trim().replace(/^@/, '').toLowerCase()
  // Va dentro de la consulta: solo lo que puede llevar un usuario de Instagram.
  if (!/^[\w.]{1,30}$/.test(u)) throw new NoEsProfesional(u)
  const cuentas = await cuentasTuyas(token, signal)
  const tuya = cuentas.find((c) => c.usuario === u)
  const desde = (tuya ?? cuentas[0]).id
  const { business_discovery: b } = await graph<{ business_discovery?: Descubierta }>(desde, { fields: `business_discovery.username(${u}){${CAMPOS}}` }, token, signal, u)
  if (!b) throw new NoEsProfesional(u)
  const autor = { usuario: b.username, nombre: b.name || b.username, seguidores: b.followers_count }
  const hallado = (m: Media): Hallado => ({
    video: {
      id: codigo(m.permalink) ?? m.id,
      red: 'instagram',
      url: m.permalink,
      titulo: cortar(m.caption ?? ''),
      idioma: idiomaDe(m.caption ?? ''),
      canal: `@${b.username}`,
      canalId: b.username.toLowerCase(),
      vistas: m.view_count ?? 0,
      likes: m.like_count,
      comentarios: m.comments_count,
      fecha: m.timestamp.slice(0, 10)
    },
    autor,
    portada: m.thumbnail_url,
    descarga: m.media_url
  })
  const reels = (b.media?.data ?? []).filter(esReel)
  const videos = reels.map(hallado)
  if (tuya) await metricasTuyas(reels, videos, token, signal)
  if (tuya) await archivosTuyos(tuya.id, videos, token, signal)

  const anteriores: Hallado[] = []
  const faltan = new Set(buscados.filter((c) => !videos.some((h) => h.video.id === c)))
  let cursor = b.media?.paging?.cursors?.after
  for (let n = 0; faltan.size && cursor && n < PAGINAS_ATRAS; n++) {
    const campos = CAMPOS.replace(`media.limit(${POSTS})`, `media.after(${cursor}).limit(${PAGINA})`)
    const r = await graph<{ business_discovery?: Descubierta }>(desde, { fields: `business_discovery.username(${u}){${campos}}` }, token, signal, u)
    for (const m of (r.business_discovery?.media?.data ?? []).filter(esReel)) {
      const h = hallado(m)
      if (faltan.delete(h.video.id)) anteriores.push(h)
    }
    cursor = r.business_discovery?.media?.paging?.cursors?.after
  }
  return { ...autor, videos, anteriores }
}

/**
 * Los guardados y compartidos de tus Reels, de diez en diez. Si Meta pide ir más despacio, los que faltan se quedan sin
 * ellos: las vistas ya valen solas.
 */
async function metricasTuyas(reels: Media[], videos: Hallado[], token: string, signal: AbortSignal) {
  for (let i = 0; i < reels.length; i += 10)
    try {
      await Promise.all(reels.slice(i, i + 10).map(async (m, j) => Object.assign(videos[i + j].video, await metricas(m.id, token, signal))))
    } catch (e) {
      if (e instanceof Pausa) return
      throw e
    }
}

/**
 * El archivo de tus Reels (`media_url`), para transcribirlos: `business_discovery` no lo da de ningún Reel, ni de los
 * tuyos (2026-10-11), y tu cuenta sí, en una llamada. Si falla, se quedan sin él.
 */
async function archivosTuyos(id: string, videos: Hallado[], token: string, signal: AbortSignal) {
  try {
    const { data } = await graph<{ data?: { permalink?: string; media_url?: string }[] }>(`${id}/media`, { fields: 'permalink,media_url', limit: String(POSTS) }, token, signal)
    const archivos = new Map((data ?? []).map((m) => [codigo(m.permalink), m.media_url]))
    for (const h of videos) h.descarga ??= archivos.get(h.video.id)
  } catch (e) {
    if (e instanceof Detenido) throw e
  }
}

type Insights = { data?: { name: string; values?: { value?: number }[]; total_value?: { value?: number } }[] }

/** Las de un Reel (`/insights`). Si una métrica falla, se omite. */
async function metricas(id: string, token: string, signal: AbortSignal) {
  const pedir = (metric: string) =>
    graph<Insights>(`${id}/insights`, { metric }, token, signal).then(
      (r) => (r.data ?? []).map((d) => [d.name, d.total_value?.value ?? d.values?.[0]?.value] as const),
      (e) => {
        if (e instanceof Detenido || e instanceof Pausa) throw e
        return null
      }
    )
  // Las dos en una llamada; si falla, cada una por su lado, para no perder la que sí está.
  const datos = new Map((await pedir('saved,shares')) ?? [...((await pedir('saved')) ?? []), ...((await pedir('shares')) ?? [])])
  return { guardados: datos.get('saved'), compartidos: datos.get('shares') }
}

/** El código del Reel en su enlace (`instagram.com/reel/<código>/` o `/p/<código>/`): es su id, como en `urlVertical`. */
const codigo = (enlace?: string) => (enlace && /instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([\w-]+)/.exec(enlace)?.[1]) || undefined

/** La descripción en una línea y cortada: es el `titulo` del video. */
function cortar(texto: string, max = 150) {
  const t = texto.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}
