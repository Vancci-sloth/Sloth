import type { FuenteProbada, FuenteRadar } from '../../shared/types.ts'
import { aTexto, nombreDe, validar } from './fuentes.ts'
import { canonica, entidades, traer } from './leer.ts'

/**
 * Antes de añadir una fuente al radar se prueba: un feed que no responde o una cuenta que no existe no entra. También
 * convierte lo que pega el usuario en una fuente: una cuenta de X (`@cuenta` o su enlace), un subreddit, la dirección de
 * un feed o de una página (si la página anuncia su feed, se usa el feed), «Hacker News», «GitHub Trending» o unas
 * palabras, que se buscan en Google Noticias.
 */

/** Cuánto espera cada prueba: proponer prueba una veintena a la vez y no debe tardar más que esto. */
const ESPERA = 12_000

/** La búsqueda de Google Noticias de unas palabras, como feed. En español, o en inglés con `ingles`. */
export function googleNoticias(consulta: string, ingles = false): FuenteRadar {
  const region = ingles ? 'hl=en-US&gl=US&ceid=US:en' : 'hl=es-419&gl=MX&ceid=MX:es-419'
  return { tipo: 'rss', nombre: `${ingles ? 'Google News' : 'Google Noticias'}: ${consulta}`, url: `https://news.google.com/rss/search?q=${encodeURIComponent(consulta)}&${region}` }
}

/**
 * Los artículos de una página sin feed: los enlaces que cuelgan de su dirección y terminan en un nombre con guiones
 * (`/noticias/gana-verstappen-en-mexico`), que es como se nombran casi siempre.
 */
export function patronDe(url: string): string {
  const u = new URL(url)
  const base = `${u.origin}${u.pathname.replace(/\/+$/, '')}`.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  return `^${base}/(?:[^?#]*/)?[^/?#]*[-_][^/?#]*[-_][^/?#]{2,}$`
}

/**
 * El nombre de un feed o una página, de su `<title>`. De «Autosport - Formula 1, MotoGP and motorsport news», la parte
 * que es el sitio: «Autosport».
 */
function titulo(xml: string, url: string): string {
  const sitio = new URL(url).hostname.replace(/^www\./, '').split('.')[0].replace(/[^a-z0-9]/g, '')
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(xml)?.[1]
  const entero = t ? entidades(t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1')).replace(/\s+/g, ' ').trim() : ''
  const letras = (p: string) => p.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')
  const parte = entero.split(/\s+[-|\\–—:·]\s+/).find((p) => letras(p) && (sitio.includes(letras(p)) || letras(p).includes(sitio)))
  return (parte ?? entero).slice(0, 50) || new URL(url).hostname.replace(/^www\./, '')
}
const entradas = (xml: string) => (xml.match(/<(item|entry)\b/g) ?? []).length
const esFeed = (xml: string) => /<(rss|feed|rdf:RDF)\b/i.test(xml.slice(0, 2000))

/** Lo que pegó el usuario, como fuente. Lanza un error si no se entiende o no responde. */
export async function interpretar(texto: string): Promise<FuenteRadar> {
  const t = texto.trim()
  if (/^(hn|hacker ?news)$/i.test(t)) return { tipo: 'hn' }
  if (/^github( trending)?$/i.test(t)) return { tipo: 'github' }
  const cuenta = /^@(\w{1,15})$/.exec(t)?.[1] ?? /^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/(\w{1,15})\/?(?:[?#].*)?$/i.exec(t)?.[1]
  if (cuenta) return { tipo: 'x', cuenta }
  const sub = /^(?:https?:\/\/)?(?:www\.|old\.)?reddit\.com\/r\/(\w+)/i.exec(t)?.[1] ?? /^r\/(\w+)$/i.exec(t)?.[1]
  if (sub) return { tipo: 'rss', nombre: `r/${sub}`, url: `https://www.reddit.com/r/${sub}/.rss` }
  if (!/^https?:\/\/|^[\w-]+(\.[\w-]+)+(\/|$)/i.test(t)) {
    if (t.length < 2 || t.length > 80) throw new Error('Escribe la dirección de una página, una cuenta de X (@cuenta) o unas palabras para buscar.')
    return googleNoticias(t)
  }
  const url = canonica(/^https?:\/\//i.test(t) ? t : `https://${t}`)
  if (!url) throw new Error('Esa dirección no es válida.')
  const contenido = await traer(url, 'texto', ESPERA).catch((e) => {
    throw new Error(`La página no respondió (${e instanceof Error ? e.message : e}).`)
  })
  if (esFeed(contenido)) return { tipo: 'rss', nombre: titulo(contenido, url), url }
  // La página anuncia su feed: se lee ese, que trae cada noticia con su fecha.
  const anunciado = [...contenido.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .find((l) => /rel=["']alternate["']/i.test(l) && /type=["']application\/(rss|atom)\+xml["']/i.test(l))
  const href = anunciado && /href=["']([^"']+)["']/i.exec(anunciado)?.[1]
  const feed = href && canonica(href, url)
  if (feed) {
    const xml = await traer(feed, 'texto', ESPERA).catch(() => '')
    if (esFeed(xml) && entradas(xml)) return { tipo: 'rss', nombre: titulo(contenido, url), url: feed }
  }
  return { tipo: 'pagina', nombre: titulo(contenido, url), url, enlaces: patronDe(url) }
}

const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`

/** Prueba una fuente: si responde y qué trae. No guarda nada. */
export async function probar(f: FuenteRadar): Promise<FuenteProbada> {
  const lista = validar(f)
  if (!lista) return { fuente: f, id: '', ok: false, detalle: 'Le faltan datos o no tiene una dirección válida.' }
  const id = nombreDe(lista)
  const fuente = aTexto(lista)
  const bien = (detalle: string): FuenteProbada => ({ fuente, id, ok: true, detalle })
  const mal = (detalle: string): FuenteProbada => ({ fuente, id, ok: false, detalle })
  try {
    switch (lista.tipo) {
      case 'hn':
        return bien('Lo más votado de Hacker News')
      case 'github':
        return bien('Los proyectos del día en GitHub')
      case 'rss': {
        const xml = await traer(lista.url, 'texto', ESPERA)
        if (!esFeed(xml)) return mal('No es un feed: pega la dirección de la página y lo busco.')
        const n = entradas(xml)
        return n ? bien(plural(n, 'noticia', 'noticias')) : mal('El feed responde, pero no trae noticias.')
      }
      case 'pagina': {
        const html = await traer(lista.url, 'texto', ESPERA)
        const n = new Set([...html.matchAll(/href=["']([^"'#]+)["']/g)].map((m) => canonica(m[1], lista.url)).filter((u) => u && lista.enlaces.test(u))).size
        return n ? bien(plural(n, 'artículo enlazado', 'artículos enlazados')) : mal('La página responde, pero no se ven artículos en ella.')
      }
      case 'x': {
        // FxTwitter a veces responde vacío a una cuenta que existe: un segundo intento.
        for (let intento = 0; intento < 2; intento++) {
          const j = await traer(`https://api.fxtwitter.com/2/profile/${lista.cuenta}/statuses`, 'json', ESPERA).then((t) => JSON.parse(t) as { results?: unknown[] }, () => null)
          if (j?.results?.length) return bien(plural(j.results.length, 'post reciente', 'posts recientes'))
        }
        return mal('No se encontraron posts de esa cuenta.')
      }
    }
  } catch (e) {
    return mal(`No respondió (${(e instanceof Error ? e.message : String(e)).replace(/ en https?:\/\/\S+/, '')}).`)
  }
}

/** Prueba varias, de seis en seis. */
export async function probarVarias(fuentes: FuenteRadar[]): Promise<FuenteProbada[]> {
  const probadas: FuenteProbada[] = new Array(fuentes.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(6, fuentes.length) }, async () => {
    while (i < fuentes.length) {
      const k = i++
      probadas[k] = await probar(fuentes[k])
    }
  }))
  return probadas
}
