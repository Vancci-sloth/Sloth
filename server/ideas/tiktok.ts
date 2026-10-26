import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Page } from 'playwright-core'
import { idiomaDe } from '../../shared/ideas.ts'
import type { VideoYT } from '../../shared/types.ts'
import { bajar, conPestana as enPestana, dormir, type Red, sesionTikTok } from './navegador-investigacion.ts'
import { correr, Detenido } from './youtube.ts'

/**
 * TikTok para Ideas: buscar lo que escribe tu público, leer los comentarios de un video y leer cuentas. Buscar y comentar
 * piden sesión, y van por la página web con la cuenta de investigación de TikTok, en su navegador
 * (`navegador-investigacion.ts`). No se firma nada: la página pide su JSON y Sloth lo lee al pasar, como en las
 * herramientas de desarrollo. Las cuentas van por yt-dlp, sin sesión y sin el navegador.
 */

// Lo del navegador se pedía aquí antes de que Instagram también buscara: sigue saliendo de aquí.
export { abiertoInvestigacion, abrirInvestigacion, cuentaInvestigacion } from './navegador-investigacion.ts'

const CAMBIO = 'TikTok no devolvió resultados de búsqueda: ¿cambió su página?'

export class SinSesionTikTok extends Error {
  constructor(m = 'La cuenta de investigación de TikTok no tiene sesión: ábrela desde Ideas y entra con el QR.') {
    super(m)
  }
}
export class Captcha extends Error {
  constructor(m = 'TikTok pide resolver un captcha en la ventana de la cuenta de investigación.') {
    super(m)
  }
}

export interface Autor {
  usuario: string
  nombre: string
  seguidores?: number
}
/** Un video de TikTok (o de Instagram, en `instagram.ts` e `instagram-web.ts`) tal como se leyó. `portada` caduca en un día: se baja enseguida. */
export interface Hallado {
  video: Omit<VideoYT, 'de' | 'visto'>
  autor: Autor
  portada?: string
  /**
   * En Instagram, el enlace directo al archivo del video, para transcribirlo (`transcribir.ts`). Caduca como la portada:
   * vale solo durante la vuelta. TikTok no lo necesita: yt-dlp lo baja por su página.
   */
  descarga?: string
}

/** El ritmo de una persona entre una acción de página y la siguiente: TikTok frena a quien va más rápido. */
const respiro = (signal: AbortSignal) => dormir(3000 + Math.random() * 3000, signal)

/**
 * Lo que se ve de un captcha: su contenedor, o su texto en un diálogo. Con `todo`, también el texto de la página entera,
 * solo cuando lo esperado no llegó: en una página de resultados, «puzzle» puede ser el tema de un video.
 */
function hayCaptcha(page: Page, todo = false): Promise<boolean> {
  return page
    .evaluate((todo) => {
      const re = /deslizador|puzle|puzzle|captcha/i
      const visible = (e: Element) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      }
      if ([...document.querySelectorAll('[id*=captcha i], [class*=captcha i]')].some(visible)) return true
      const dondeMirar = todo ? [document.body] : [...document.querySelectorAll('[role=dialog]')]
      return dondeMirar.some((e) => !!e && visible(e) && re.test((e as HTMLElement).innerText ?? ''))
    }, todo)
    .catch(() => false)
}

/**
 * TikTok en el navegador de investigación: con su sesión, y si pide un captcha, la pestaña se queda al frente para
 * resolverlo. `todo`: se vio solo por su texto, y es lo que se vuelve a mirar; si se vio su contenedor, basta con que
 * desaparezca.
 */
const TIKTOK: Red = {
  red: 'tiktok',
  async sesion(ctx) {
    if (!(await sesionTikTok(ctx))) throw new SinSesionTikTok()
  },
  async retener(e, page) {
    if (!(e instanceof Captcha)) return null
    const todo = !(await hayCaptcha(page))
    return () => hayCaptcha(page, todo)
  }
}
const conPestana = <T>(app: string, signal: AbortSignal, fn: (page: Page) => Promise<T>) => enPestana(app, signal, TIKTOK, fn)

type Llegada = { url: string; texto: Promise<string> }

/** Lo que la página pide a `ruta`, leído al pasar, en el orden en que llega. */
function escuchar(page: Page, ruta: string) {
  const llegadas: Llegada[] = []
  page.on('response', (r) => {
    if (r.url().includes(ruta)) llegadas.push({ url: r.url(), texto: r.text().catch(() => '') })
  })
  return llegadas
}

async function json(l: Llegada): Promise<any> {
  try {
    return JSON.parse(await l.texto)
  } catch {
    return null
  }
}

/** Espera a que haya más de `n` respuestas, hasta 20 s, mirando si sale un captcha. `false` si no llegaron. */
async function esperar(page: Page, llegadas: Llegada[], n: number, signal: AbortSignal) {
  const hasta = Date.now() + 20_000
  while (llegadas.length <= n) {
    if (Date.now() > hasta) return false
    if (await hayCaptcha(page)) throw new Captcha()
    await dormir(500, signal)
  }
  return true
}

const num = (x: unknown) => (x === undefined || x === null || x === '' || !Number.isFinite(Number(x)) ? undefined : Number(x))
const dia = (segundos: unknown) => (num(segundos) ? new Date(Number(segundos) * 1000).toISOString().slice(0, 10) : undefined)

/** Un video de la búsqueda (`/api/search/item/full/`). Sus cifras vienen en `stats`, o como texto en `statsV2`. */
function deBusqueda(it: any): Hallado | null {
  const usuario: string | undefined = it?.author?.uniqueId
  const stat = (k: string) => num(it?.stats?.[k] ?? it?.statsV2?.[k])
  const vistas = stat('playCount')
  if (!it?.id || !usuario || vistas === undefined) return null
  return {
    video: {
      id: String(it.id),
      red: 'tiktok',
      canal: `@${usuario}`,
      canalId: usuario.toLowerCase(),
      url: `https://www.tiktok.com/@${usuario}/video/${it.id}`,
      titulo: it.desc ?? '',
      // TikTok dice el idioma de cada video (`un` si no lo sabe); si no viene, se deduce de la descripción.
      idioma: it.textLanguage && it.textLanguage !== 'un' ? String(it.textLanguage) : idiomaDe(it.desc ?? ''),
      fecha: dia(it.createTime),
      vistas,
      likes: stat('diggCount'),
      comentarios: stat('commentCount'),
      compartidos: stat('shareCount'),
      guardados: stat('collectCount'),
      segundos: num(it.video?.duration) || undefined
    },
    autor: { usuario, nombre: it.author?.nickname || usuario, seguidores: num(it.authorStats?.followerCount) },
    portada: it.video?.cover || it.video?.originCover || undefined
  }
}

/**
 * El `secUid` de cada usuario visto: con él, yt-dlp lee la cuenta sin el paso que le falla a ratos. Lo da la búsqueda, y
 * la primera lectura de la cuenta.
 */
const secUids = new Map<string, string>()

/**
 * Los videos que da TikTok al buscar `termino`, en su orden: 12 por página. Una búsqueda sin resultados devuelve `[]`;
 * si la página cargó y la búsqueda no llegó, TikTok cambió algo y se dice, en vez de dar una búsqueda vacía que no lo es.
 */
export function buscarTikTok(app: string, termino: string, signal: AbortSignal, paginas = 2): Promise<Hallado[]> {
  return conPestana(app, signal, async (page) => {
    const llegadas = escuchar(page, '/api/search/item/full/')
    await respiro(signal)
    // TikTok localiza por el país de la cuenta: buscando en inglés, la mitad sale en español. Pedir la página en inglés
    // sube los resultados en inglés (de 5 a 10 de 24, el 2026-10-11).
    const lang = idiomaDe(termino) === 'en' ? '&lang=en' : ''
    await page.goto(`https://www.tiktok.com/search/video?q=${encodeURIComponent(termino)}${lang}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    if (page.url().includes('/login')) throw new SinSesionTikTok()
    if (!(await esperar(page, llegadas, 0, signal))) {
      if (await hayCaptcha(page, true)) throw new Captcha()
      throw new Error(CAMBIO)
    }
    const hallados = new Map<string, Hallado>()
    // Al cargar, TikTok puede pedir la misma página dos veces, o ya varias (cuatro el 2026-10-11): cada página es un
    // `cursor`, y se leen `paginas`, ni más ni menos, para que todos los términos se midan igual.
    const cursores = new Set<string>()
    let mas = true
    for (let i = 0; ; ) {
      for (; i < llegadas.length && cursores.size < paginas; i++) {
        const cursor = new URL(llegadas[i].url).searchParams.get('cursor') ?? '0'
        if (cursores.has(cursor)) continue
        const d = await json(llegadas[i])
        // Llega con `status_code` 403 y sus 12 videos, y la página los enseña: lo que cuenta es que traiga la lista.
        if (!Array.isArray(d?.item_list) && d?.status_code !== 0) {
          if (await hayCaptcha(page, true)) throw new Captcha()
          // La primera página tiene que llegar bien; si falla una de las siguientes, basta con lo que ya hay.
          if (!cursores.size) throw new Error(d ? `${CAMBIO} (${d.status_msg || d.status_code})` : CAMBIO)
          mas = false
          break
        }
        cursores.add(cursor)
        mas = !!d.has_more
        for (const it of (d.item_list ?? []) as any[]) {
          const h = deBusqueda(it)
          if (!h || hallados.has(h.video.id)) continue
          hallados.set(h.video.id, h)
          if (it.author?.secUid) secUids.set(h.video.canalId, it.author.secUid)
        }
      }
      if (cursores.size >= paginas || !mas) break
      // TikTok suele pedir la segunda página sola, un segundo después de la primera: lo que ya llegó se lee antes de bajar,
      // y al bajar se espera algo más de lo leído, no de lo que ya hay (se perdía la segunda y quedaban 12).
      await respiro(signal)
      if (i < llegadas.length) continue
      await bajar(page, signal)
      if (!(await esperar(page, llegadas, i, signal))) break
    }
    return [...hallados.values()]
  })
}

/**
 * Los comentarios con más likes de un video, de los que TikTok enseña primero: qué le pide la gente a ese video. Al abrir
 * su página, la lista se pide al pulsar el ícono de comentarios (o sola, si la página ya los enseña).
 */
export function comentariosTikTok(app: string, usuario: string, id: string, signal: AbortSignal, n = 5): Promise<{ texto: string; likes: number }[]> {
  return conPestana(app, signal, async (page) => {
    const llegadas = escuchar(page, '/api/comment/list/')
    await respiro(signal)
    await page.goto(`https://www.tiktok.com/@${usuario.replace(/^@/, '')}/video/${id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    if (page.url().includes('/login')) throw new SinSesionTikTok()
    await respiro(signal)
    if (!llegadas.length) {
      if (await hayCaptcha(page)) throw new Captcha()
      const icono = page.locator('[data-e2e="comment-icon"], [data-e2e="browse-comment-icon"]').first()
      await icono.click({ timeout: 20_000 }).catch(async () => {
        if (await hayCaptcha(page, true)) throw new Captcha()
        throw new Error('No encontré los comentarios del video: ¿ya no está, o cambió la página de TikTok?')
      })
    }
    if (!(await esperar(page, llegadas, 0, signal))) {
      if (await hayCaptcha(page, true)) throw new Captcha()
      throw new Error('TikTok no devolvió los comentarios del video: ¿cambió su página?')
    }
    const d = await json(llegadas[0])
    if (!Array.isArray(d?.comments) && d?.status_code !== 0) throw new Error(`TikTok no devolvió los comentarios del video${d ? ` (${d.status_msg || d.status_code})` : ''}.`)
    // Sin comentarios, TikTok manda `comments: null`.
    return ((d.comments ?? []) as any[])
      .filter((c) => c?.text)
      .map((c) => ({ texto: String(c.text), likes: num(c.digg_count) ?? 0 }))
      .sort((a, b) => b.likes - a.likes)
      .slice(0, n)
  })
}

/**
 * Los últimos 30 videos de una cuenta, por yt-dlp: sin sesión y sin el navegador. No da seguidores. Por su nombre, yt-dlp
 * falla a ratos al sacar el id de la cuenta («secondary user ID», 2 de 3 veces el 2026-10-11): se reintenta, y con el
 * `secUid` ya sabido se lee directo (`tiktokuser:`), que no falla.
 */
export async function cuentaTikTok(usuario: string, signal: AbortSignal): Promise<{ nombre: string; usuario: string; videos: Hallado[] }> {
  const u = usuario.replace(/^@/, '').toLowerCase()
  const leer = (url: string) => correr(['--flat-playlist', '--playlist-end', '30', url], signal)
  const sec = secUids.get(u)
  let d: any
  for (let intento = 1; !d; intento++)
    try {
      d = await leer(sec ? `tiktokuser:${sec}` : `https://www.tiktok.com/@${u}`)
      if (!d) throw new Error(`yt-dlp no devolvió la cuenta @${u}.`)
    } catch (e) {
      if (sec || intento >= 3 || !/secondary user ID/i.test((e as Error).message)) throw e
      await respiro(signal)
    }
  if (typeof d.id === 'string' && d.id !== u) secUids.set(u, d.id)
  const entradas = ((d.entries ?? []) as any[]).filter((e) => e?.id && typeof e.view_count === 'number')
  const primero = entradas[0] ?? {}
  const suyo: string = primero.uploader || u
  const nombre: string = primero.channel || suyo
  const videos: Hallado[] = entradas.map((e) => {
    const de: string = e.uploader || suyo
    return {
      video: {
        id: String(e.id),
        red: 'tiktok' as const,
        canal: `@${de}`,
        canalId: de.toLowerCase(),
        url: `https://www.tiktok.com/@${de}/video/${e.id}`,
        titulo: e.description ?? e.title ?? '',
        // yt-dlp no da el idioma: se deduce de la descripción.
        idioma: idiomaDe(e.description ?? e.title ?? ''),
        fecha: dia(e.timestamp),
        vistas: e.view_count,
        likes: num(e.like_count),
        comentarios: num(e.comment_count),
        compartidos: num(e.repost_count),
        guardados: num(e.save_count),
        segundos: num(e.duration) || undefined
      },
      autor: { usuario: de, nombre: e.channel || nombre },
      portada: ((e.thumbnails ?? []) as any[]).find((t) => t.id === 'cover')?.url ?? e.thumbnails?.[0]?.url
    }
  })
  // TikTok pone arriba hasta tres fijados, y luego lo demás del más nuevo al más viejo. Los fijados son los del principio
  // hasta el último salto atrás en el tiempo: el último fijado es más viejo que el video que le sigue.
  const t = videos.map((h) => num(entradas.find((e) => String(e.id) === h.video.id)?.timestamp) ?? 0)
  let fijados = 0
  for (let i = 0; i < Math.min(3, t.length - 1); i++) if (t[i] && t[i + 1] && t[i] < t[i + 1]) fijados = i + 1
  for (const h of videos.slice(0, fijados)) h.video.fijado = true
  return { nombre, usuario: suyo, videos }
}

/** Baja una portada a `destino`. Si ya existe, no la baja. `false` si no se pudo (caducó, o no es una imagen). */
export async function bajarPortada(url: string, destino: string, signal: AbortSignal): Promise<boolean> {
  if (existsSync(destino)) return true
  try {
    const r = await fetch(url, { signal })
    if (!r.ok || !r.headers.get('content-type')?.startsWith('image/')) return false
    const datos = Buffer.from(await r.arrayBuffer())
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(`${destino}.tmp`, datos)
    renameSync(`${destino}.tmp`, destino)
    return true
  } catch (e) {
    if (signal.aborted) throw new Detenido('Detenida')
    return false
  }
}
