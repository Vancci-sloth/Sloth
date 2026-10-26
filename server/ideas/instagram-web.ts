import type { Page, Response } from 'playwright-core'
import { idiomaDe } from '../../shared/ideas.ts'
import { bajar, conPestana, dormir, navegador, type Red, sesionInstagram } from './navegador-investigacion.ts'
import type { Hallado } from './tiktok.ts'

/**
 * La búsqueda de Instagram para Ideas: cada frase que se busca en TikTok se busca también aquí. La API de Meta no deja
 * buscar (por hashtag pide la revisión «Instagram Public Content Access»), así que va por la página, con una cuenta de
 * Instagram desechable que solo investiga, en el navegador de investigación (`navegador-investigacion.ts`). Como en
 * TikTok, la página pide su JSON y Sloth lo lee al pasar. La búsqueda no da vistas: las da la cuenta de cada Reel, leída con
 * la API oficial (`instagram.ts`).
 */

const CAMBIO = 'Instagram no devolvió resultados de búsqueda: ¿cambió su página?'
/** Donde la página de Instagram pide sus datos. */
const GRAPHQL = /instagram\.com\/(api\/graphql|graphql\/query)/
/** Las páginas a las que Instagram manda cuando quiere que una persona verifique la cuenta, o cuando la suspende. */
const CONTROL = /instagram\.com\/(challenge|checkpoint|accounts\/suspended|accounts\/disabled)/
/**
 * Entre el final de una búsqueda y el principio de la siguiente, al menos esto, más un respiro: Instagram es más duro que
 * TikTok con una cuenta que busca mucho. En la investigación casi nunca hace falta esperarlo (entre una y otra van la
 * búsqueda de TikTok y sus cuentas); sí cuando Claude busca varias seguidas.
 */
const ENTRE = 45_000
/** Cuántas veces se baja, como mucho, para juntar los Reels que se piden: cada bajada trae 24 publicaciones. */
const BAJADAS = 3

export class SinSesionInstagram extends Error {
  constructor(m = 'La cuenta de investigación de Instagram no tiene sesión: ábrela desde Ideas y entra con ella.') {
    super(m)
  }
}
/** Instagram pide verificar la cuenta de investigación, o la frenó: no se busca más hasta que lo resuelvas. */
export class ControlInstagram extends Error {
  constructor(m = 'Instagram pide verificar la cuenta de investigación en su ventana.') {
    super(m)
  }
}

/** Si la cuenta de investigación de Instagram tiene sesión, abriendo su navegador si hace falta. */
export const hayInstagram = async (app: string) => sesionInstagram(await navegador(app))

/** Instagram en el navegador de investigación. Si pide verificar la cuenta, su página se queda al frente mientras siga ahí. */
const INSTAGRAM: Red = {
  red: 'instagram',
  async sesion(ctx) {
    if (!(await sesionInstagram(ctx))) throw new SinSesionInstagram()
  },
  async retener(e, page) {
    return e instanceof ControlInstagram && CONTROL.test(page.url()) ? async () => CONTROL.test(page.url()) : null
  }
}

/** El ritmo de una persona entre una acción de página y la siguiente, algo más lento que en TikTok. */
const respiro = () => 5000 + Math.random() * 4000
/** Cuándo acabó la última búsqueda. */
let ultima = 0

/** Una página de la búsqueda (`cursor`: de dónde sigue; la primera, `''`), o un aviso de Instagram. */
type Llegada = { cursor: string; serp: any } | { aviso: Error }

/**
 * Lo que dice una respuesta de la página. La búsqueda se reconoce por su forma (`xdt_fbsearch__top_serp_graphql`): la
 * página pide a la vez otras cosas, como su feed, que trae Reels que no son de la búsqueda (con «faceless videos ai» salió
 * uno de humor). Lo demás se ignora, salvo que diga que hay que entrar o verificar la cuenta.
 */
async function leer(r: Response): Promise<Llegada | null> {
  const d = await r
    .text()
    .then((t) => JSON.parse(t))
    .catch(() => null)
  if (!d) return null
  if (d.require_login || d.message === 'login_required') return { aviso: new SinSesionInstagram() }
  if (d.message === 'checkpoint_required' || d.checkpoint_url) return { aviso: new ControlInstagram() }
  if (d.message === 'feedback_required') return { aviso: new ControlInstagram('Instagram frenó a la cuenta de investigación («Inténtalo más tarde»): deja de buscar unas horas.') }
  const serp = d.data?.xdt_fbsearch__top_serp_graphql
  if (!serp) return null
  const vars = new URLSearchParams(r.request().postData() ?? '').get('variables')
  const after = (() => {
    try {
      return JSON.parse(vars ?? '{}').after
    } catch {}
  })()
  return { cursor: typeof after === 'string' ? after : '', serp }
}

/** Lo que llega de la búsqueda, en el orden en que se termina de leer. */
function escuchar(page: Page) {
  const llegadas: Llegada[] = []
  page.on('response', (r) => {
    if (GRAPHQL.test(r.url())) void leer(r).then((l) => l && llegadas.push(l))
  })
  return llegadas
}

/**
 * Espera a que lleguen más de `n` páginas de la búsqueda, hasta 25 s, mirando si Instagram mandó a entrar o a verificar la
 * cuenta. `null` si no llegaron.
 */
async function esperar(page: Page, llegadas: Llegada[], n: number, signal: AbortSignal) {
  const hasta = Date.now() + 25_000
  for (;;) {
    if (page.url().includes('/accounts/login')) throw new SinSesionInstagram()
    if (CONTROL.test(page.url())) throw new ControlInstagram()
    const aviso = llegadas.find((l) => 'aviso' in l)
    if (aviso && 'aviso' in aviso) throw aviso.aviso
    const paginas = llegadas.filter((l): l is { cursor: string; serp: any } => 'serp' in l)
    if (new Set(paginas.map((p) => p.cursor)).size > n) return paginas
    if (Date.now() > hasta) return null
    await dormir(500, signal)
  }
}

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined)

/** Lo que dura un video, de su manifiesto DASH (`mediaPresentationDuration="PT53.27S"`): la búsqueda no lo da aparte. */
function duracion(manifiesto: unknown) {
  const m = /mediaPresentationDuration="PT(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?"/.exec(String(manifiesto ?? ''))
  return m ? Math.round(Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) || undefined : undefined
}

/** La descripción en una línea y cortada, como la corta `instagram.ts`: el mismo Reel no cambia de título al leer su cuenta. */
function cortar(texto: string, max = 150) {
  const t = texto.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/**
 * Un Reel de la búsqueda. Solo videos (`media_type` 2; hoy todo video de Instagram es un Reel): las fotos (1) y los
 * carruseles (8) no compiten con un video vertical.
 */
function deBusqueda(it: any): Hallado | null {
  const usuario: string | undefined = it?.user?.username
  if (!it?.code || !usuario || it.media_type !== 2) return null
  const texto: string = it.caption?.text ?? ''
  return {
    video: {
      id: String(it.code),
      red: 'instagram',
      url: `https://www.instagram.com/reel/${it.code}/`,
      titulo: cortar(texto),
      idioma: idiomaDe(texto),
      canal: `@${usuario}`,
      canalId: usuario.toLowerCase(),
      // La búsqueda no da vistas (`view_count` llega vacío): las da su cuenta, al leerla.
      vistas: 0,
      // Con los likes ocultos, `like_count` no es el de verdad.
      likes: it.like_and_view_counts_disabled ? undefined : num(it.like_count),
      comentarios: num(it.comment_count),
      fecha: num(it.taken_at) ? new Date(it.taken_at * 1000).toISOString().slice(0, 10) : undefined,
      segundos: duracion(it.video_dash_manifest),
      // La búsqueda de hoy no lo trae (el feed, sí): si un día lo trae, se lee.
      ...(it.is_paid_partnership === true ? { pagado: true } : {})
    },
    autor: { usuario, nombre: it.user.full_name || usuario },
    portada: it.image_versions2?.candidates?.[0]?.url,
    descarga: it.video_versions?.[0]?.url
  }
}

/**
 * Los Reels que da Instagram al buscar `termino`, en su orden, hasta `max`: cada página trae 24 publicaciones, y se baja
 * hasta juntarlos. Una búsqueda sin resultados devuelve `[]`; si la página cargó y la búsqueda no llegó, Instagram cambió
 * algo y se dice, en vez de dar una búsqueda vacía que no lo es.
 */
export function buscarInstagram(app: string, termino: string, signal: AbortSignal, max = 30): Promise<Hallado[]> {
  return conPestana(app, signal, INSTAGRAM, async (page) => {
    const llegadas = escuchar(page)
    await dormir(Math.max(0, ultima + ENTRE - Date.now()) + respiro(), signal)
    try {
      await page.goto(`https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(termino)}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      const hallados = new Map<string, Hallado>()
      const cursores = new Set<string>()
      for (let bajadas = 0; ; bajadas++) {
        const paginas = await esperar(page, llegadas, cursores.size, signal)
        if (!paginas) {
          // La primera página tiene que llegar; si no llega una de las siguientes, basta con lo que ya hay.
          if (!cursores.size) throw new Error(CAMBIO)
          break
        }
        let mas = false
        for (const { cursor, serp } of paginas) {
          if (cursores.has(cursor)) continue
          cursores.add(cursor)
          mas = !!serp.page_info?.has_next_page
          for (const it of ((serp.edges ?? []) as any[]).flatMap((e) => e?.node?.items ?? [])) {
            const h = deBusqueda(it)
            if (h && !hallados.has(h.video.id)) hallados.set(h.video.id, h)
          }
        }
        if (hallados.size >= max || !mas || bajadas >= BAJADAS) break
        await dormir(respiro(), signal)
        await bajar(page, signal)
      }
      return [...hallados.values()].slice(0, max)
    } finally {
      ultima = Date.now()
    }
  })
}
