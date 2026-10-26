/**
 * Una pasada del radar, en su propio proceso (lo lanza `index.ts` cada 5 minutos; también se puede correr a mano con
 * `node --import tsx server/radar/rastrear.ts`): mira las fuentes a las que ya les toca, lee entera cada página nueva y
 * la guarda en la base. Lo que ya está no se vuelve a leer. Las páginas se leen con un `fetch` y el texto se saca del
 * HTML sin navegador: lo que un sitio no deja leer así queda con lo que traía el feed, y se lee con Edge al usarlo.
 * En otro proceso porque leer cientos de páginas no debe frenar al servidor, y uno que se trabe se corta solo.
 */
import { existsSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { abrirBase, type Doc } from './base.ts'
import { CADA, leerFuentes, nombreDe, type Fuente } from './fuentes.ts'
import { canonica, entidades, traer } from './leer.ts'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CARPETA = join(APP, 'data', 'radar')
/** Lo de un feed o de X anterior a esto no entra (un feed puede traer años); lo que se vio hace más de BORRAR, se borra. */
const DIAS = 30
const BORRAR = 120
/** Páginas nuevas que lee cada fuente por pasada: la primera vez, lo atrasado se reparte entre varias. */
const POR_FUENTE = 25
/** Una página entera tiene al menos esto; menos es un muro de pago o una página que se arma con JavaScript. */
const PALABRAS = 120

// Un servidor que corta la respuesta a medias puede tumbar a undici, el fetch de Node, fuera de toda promesa: esa página
// se pierde (su fetch acaba por el plazo) y la pasada sigue.
process.on('uncaughtException', (e) => console.error(`(se siguió tras un error de red: ${e.message})`))

const ahora = Date.now()
const desde = ahora - DIAS * 864e5

// Una pasada a la vez, aunque el servidor se reinicie a la mitad y lance otra.
const candado = join(CARPETA, 'rastreando')
if (existsSync(candado) && ahora - statSync(candado).mtimeMs < 10 * 60_000) process.exit(0)
const db = abrirBase(join(CARPETA, 'radar.db'))
writeFileSync(candado, String(process.pid))

const existe = db.prepare('select 1 from docs where url = ?')
const insertar = db.prepare(`insert or ignore into docs (url, fuente, titulo, fecha, visto, completo, extra, texto)
  values (?, ?, ?, ?, ?, ?, ?, ?)`)
const ya = (url: string) => Boolean(existe.get(url))
function guardar(d: Doc): number {
  const r = insertar.run(d.url, d.fuente, d.titulo, d.fecha, d.visto, d.completo ? 1 : 0, d.extra, d.texto.slice(0, 200_000))
  return Number(r.changes)
}

// ——— Leer ———

/** El texto de un trozo de HTML, con un párrafo por línea. */
function htmlATexto(html: string): string {
  const s = html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|template|iframe|nav|header|footer|aside|form|button|dialog|select)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/?(p|div|h[1-6]|tr|section|article|blockquote|pre|ul|ol|table|figure|figcaption|main)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  return entidades(s)
    .split('\n')
    .map((l) => l.replace(/[ 	 ]+/g, ' ').trim())
    // Las viñetas sueltas de un menú o de una lista de enlaces.
    .map((l) => (/^[-*•·|]$/.test(l) ? '' : l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const meta = (html: string, ...nombres: string[]) => {
  for (const n of nombres) {
    const m = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${n}["'][^>]*>`, 'i').exec(html)?.[0]
    const v = m && /content=["']([^"']*)["']/i.exec(m)?.[1]
    if (v) return entidades(v).trim()
  }
  return null
}

function fechaDe(s: string | null | undefined): number | null {
  if (!s) return null
  const t = Date.parse(s.trim())
  return Number.isFinite(t) && t > 0 ? t : null
}

/** El artículo de una página: el `<article>` más grande, o `<main>`, o el cuerpo; con su título y su fecha. */
function articulo(html: string): { titulo: string | null; fecha: number | null; texto: string } {
  const limpio = html.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => (/application\/ld\+json/i.test(m) ? m : ''))
  const titulo = meta(limpio, 'og:title', 'twitter:title') ?? (/<title[^>]*>([^<]*)<\/title>/i.exec(limpio)?.[1] ? entidades(/<title[^>]*>([^<]*)<\/title>/i.exec(limpio)![1]).trim() : null)
  const fecha = fechaDe(meta(limpio, 'article:published_time', 'og:published_time', 'date', 'publish-date', 'parsely-pub-date', 'datePublished'))
    ?? fechaDe(/"datePublished"\s*:\s*"([^"]+)"/.exec(limpio)?.[1])
    ?? fechaDe(/<time[^>]+datetime=["']([^"']+)["']/i.exec(limpio)?.[1])
  const articulos = [...limpio.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((m) => m[0]).sort((a, b) => b.length - a.length)
  const region = (articulos[0] && articulos[0].length > 3000 ? articulos[0] : null)
    ?? /<main\b[\s\S]*<\/main>/i.exec(limpio)?.[0]
    ?? /<body\b[\s\S]*<\/body>/i.exec(limpio)?.[0]
    ?? limpio
  return { titulo, fecha, texto: htmlATexto(region) }
}

const palabras = (t: string) => t.split(/\s+/).filter(Boolean).length

interface Pendiente {
  url: string
  fuente: string
  titulo?: string | null
  fecha?: number | null
  /** Lo que trae el feed o el post: si la página no se deja leer, queda esto. */
  resumen?: string
  extra?: string | null
}

/** Lee la página de una entrada y la guarda; si no se deja, guarda lo que traía. Devuelve si entró algo nuevo. */
async function leerYGuardar(p: Pendiente): Promise<number> {
  const url = canonica(p.url)
  if (!url || ya(url)) return 0
  p = { ...p, url }
  let titulo = p.titulo ?? null, fecha = p.fecha ?? null, texto = '', completo = false
  // Lo que se lee mejor con su API (un post, un repo, un PDF, un video) lo lee leer.mjs al usarlo.
  if (!/^https:\/\/(x\.com|twitter\.com|github\.com|www\.youtube\.com|youtu\.be)\//.test(p.url) && !/\.pdf($|\?)/i.test(p.url)) {
    try {
      const a = articulo(await traer(p.url))
      titulo ||= a.titulo
      fecha ??= a.fecha
      if (palabras(a.texto) >= PALABRAS) [texto, completo] = [a.texto, true]
    } catch { /* Queda el resumen. */ }
  }
  if (!completo && p.resumen && palabras(p.resumen) >= PALABRAS) [texto, completo] = [p.resumen, true]
  texto ||= p.resumen ?? ''
  if (!texto && !titulo) return 0
  return guardar({ url: p.url, fuente: p.fuente, titulo, fecha, visto: Date.now(), completo, extra: p.extra ?? null, texto })
}

async function enParalelo<T>(cosas: T[], n: number, hacer: (c: T) => Promise<number>): Promise<number> {
  let i = 0, total = 0
  await Promise.all(Array.from({ length: Math.min(n, cosas.length) }, async () => {
    while (i < cosas.length) total += await hacer(cosas[i++]).catch(() => 0)
  }))
  return total
}

// ——— Cada tipo de fuente ———

const etiqueta = (item: string, ...nombres: string[]) => {
  for (const n of nombres) {
    const m = new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`, 'i').exec(item)
    if (m?.[1]?.trim()) return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim()
  }
  return null
}

async function rss(f: Extract<Fuente, { tipo: 'rss' }>): Promise<number> {
  const xml = await traer(f.url)
  const items = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/g) ?? []
  if (!items.length) throw new Error('el feed no trae entradas')
  const nuevos: Pendiente[] = []
  for (const item of items) {
    const href = /<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(item)?.[1]
      ?? /<link\b[^>]*href=["']([^"']+)["']/i.exec(item)?.[1]
      ?? etiqueta(item, 'link')
    const url = href && canonica(href.trim(), f.url)
    const fecha = fechaDe(etiqueta(item, 'pubDate', 'published', 'dc:date', 'updated'))
    if (!url || ya(url) || (fecha && fecha < desde)) continue
    const cuerpo = etiqueta(item, 'content:encoded', 'content', 'description', 'summary')
    const titulo = etiqueta(item, 'title')
    nuevos.push({ url, fuente: nombreDe(f), titulo: titulo && htmlATexto(titulo), fecha, resumen: cuerpo ? htmlATexto(entidades(cuerpo)) : undefined })
  }
  return enParalelo(nuevos.slice(0, POR_FUENTE), 4, leerYGuardar)
}

async function pagina(f: Extract<Fuente, { tipo: 'pagina' }>): Promise<number> {
  const html = await traer(f.url)
  const urls = [...new Set([...html.matchAll(/href=["']([^"'#]+)["']/g)].map((m) => canonica(m[1], f.url)))]
    .filter((u): u is string => !!u && f.enlaces.test(u) && !ya(u))
  return enParalelo(urls.slice(0, POR_FUENTE), 4, (url) => leerYGuardar({ url, fuente: nombreDe(f) }))
}

interface Post {
  url: string
  id: string
  text: string
  raw_text?: { facets?: Array<{ type: string; replacement?: string }> }
  author: { screen_name: string; name: string }
  created_timestamp: number
  likes?: number
  reposts?: number
  replies?: number
  views?: number
  bookmarks?: number
  quote?: Post
  replying_to?: { screen_name: string } | null
  reposted_by?: { screen_name: string } | null
}

const cifrasPost = (p: Post) =>
  [`${p.likes ?? 0} likes`, `${p.reposts ?? 0} reposts`, `${p.replies ?? 0} respuestas`, p.views ? `${p.views} vistas` : '', p.bookmarks ? `${p.bookmarks} guardados` : '']
    .filter(Boolean).join(' · ')

async function x(f: Extract<Fuente, { tipo: 'x' }>): Promise<number> {
  // FxTwitter a veces responde 404 o sin posts a una cuenta que existe: al segundo o tercer intento los trae.
  let posts: Post[] = []
  let fallo: unknown = null
  for (let intento = 0; intento < 3 && !posts.length; intento++) {
    if (intento) await new Promise((r) => setTimeout(r, 2000 * intento))
    try {
      posts = ((JSON.parse(await traer(`https://api.fxtwitter.com/2/profile/${f.cuenta}/statuses`, 'json')) as { results?: Post[] }).results) ?? []
    } catch (e) {
      fallo = e
    }
  }
  if (!posts.length) throw fallo ?? new Error('FxTwitter no trajo posts')
  let nuevos = 0
  const enlaces: Pendiente[] = []
  for (const p of posts) {
    const fecha = p.created_timestamp * 1000
    if (fecha < desde) continue
    const fuente = nombreDe(f)
    const fechaTexto = new Date(fecha).toISOString().slice(0, 16).replace('T', ' ')
    const cita = p.quote?.author ? `\n\n> Cita a @${p.quote.author.screen_name} (${p.quote.author.name}): ${p.quote.text.replace(/\n+/g, '\n> ')}\n> ${p.quote.url}` : ''
    const respuesta = p.replying_to?.screen_name ? `En respuesta a @${p.replying_to.screen_name}\n` : ''
    if (!p.author?.screen_name) continue
    const texto = `@${p.author.screen_name} (${p.author.name}) · ${fechaTexto} UTC · ${cifrasPost(p)}\n${p.url}\n\n${respuesta}${p.text}${cita}`
    if (!ya(p.url))
      nuevos += guardar({ url: p.url, fuente, titulo: `Post de @${p.author.screen_name}`, fecha, visto: Date.now(), completo: false, extra: p.reposted_by ? `reposteado por @${p.reposted_by.screen_name}` : null, texto })
    // Lo que enlaza el post es casi siempre la fuente primaria: el anuncio, el paper, el repo.
    for (const fa of [...(p.raw_text?.facets ?? []), ...(p.quote?.raw_text?.facets ?? [])])
      if (fa.type === 'url' && fa.replacement && !/^https?:\/\/(x|twitter|t)\.(com|co)\//.test(fa.replacement))
        enlaces.push({ url: fa.replacement, fuente, fecha: null, extra: `enlazado por ${p.url}` })
  }
  return nuevos + (await enParalelo(enlaces.slice(0, POR_FUENTE), 3, leerYGuardar))
}

async function hn(): Promise<number> {
  const api = `https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=200&numericFilters=points>=60,created_at_i>${Math.floor(ahora / 1000) - 3 * 86400}`
  const { hits } = JSON.parse(await traer(api, 'json')) as { hits: Array<{ objectID: string; title: string; url?: string; points: number; num_comments: number; created_at_i: number; story_text?: string }> }
  const pendientes: Pendiente[] = hits.map((h) => {
    const hilo = `https://news.ycombinator.com/item?id=${h.objectID}`
    return {
      url: h.url || hilo, fuente: 'hn', titulo: h.title, fecha: h.url ? null : h.created_at_i * 1000,
      resumen: h.story_text ? htmlATexto(h.story_text) : h.title,
      extra: `Hacker News: ${h.points} puntos, ${h.num_comments} comentarios · ${hilo}`
    }
  })
  return enParalelo(pendientes.filter((p) => !ya(p.url)).slice(0, POR_FUENTE * 2), 6, leerYGuardar)
}

async function github(): Promise<number> {
  const html = await traer('https://github.com/trending?since=daily')
  const filas = html.match(/<article class="Box-row[\s\S]*?<\/article>/g) ?? []
  if (!filas.length) throw new Error('GitHub Trending cambió: no hay filas')
  return enParalelo(filas, 4, async (fila) => {
    const repo = /<h2[\s\S]*?href="\/([^"/]+\/[^"/]+)"/.exec(fila)?.[1]
    if (!repo) return 0
    const url = `https://github.com/${repo}`
    if (ya(url)) return 0
    const descripcion = htmlATexto(/<p class="col-9[^"]*">([\s\S]*?)<\/p>/.exec(fila)?.[1] ?? '')
    const hoy = /([\d,]+) stars today/.exec(fila)?.[1]
    const readme = await traer(`https://raw.githubusercontent.com/${repo}/HEAD/README.md`).catch(() => '')
    return guardar({
      url, fuente: 'github', titulo: `GitHub ${repo}`, fecha: null, visto: Date.now(), completo: false,
      extra: hoy ? `${hoy} estrellas hoy en GitHub Trending` : null, texto: `${repo}: ${descripcion}\n\n${readme.slice(0, 30_000)}`
    })
  })
}

const LEER: { [T in Fuente['tipo']]: (f: Extract<Fuente, { tipo: T }>) => Promise<number> } = { x, rss, pagina, hn, github }

// ——— La pasada ———

const ultimas = new Map((db.prepare('select nombre, ultima from fuentes').all() as Array<{ nombre: string; ultima: number }>).map((f) => [f.nombre, f.ultima]))
// Las que eligió el usuario (`data/radar/fuentes.json`) o las de siempre. Lo que ya leyó una fuente que quitó se queda en
// la base hasta que se borra por viejo.
const toca = leerFuentes(APP).fuentes.filter((f) => (ultimas.get(nombreDe(f)) ?? 0) + CADA[f.tipo] <= ahora)
const marcar = db.prepare(`insert into fuentes (nombre, ultima, error, nuevos) values (?, ?, ?, ?)
  on conflict (nombre) do update set ultima = excluded.ultima, error = excluded.error, nuevos = excluded.nuevos`)
const resumen: string[] = []
// Cualquier pasada que se trabe más de 8 minutos se corta: la siguiente sigue donde quedó.
const corte = setTimeout(() => { rmSync(candado, { force: true }); process.exit(2) }, 8 * 60_000)
await enParalelo(toca, 6, async (f) => {
  try {
    const n = await (LEER[f.tipo] as (f: Fuente) => Promise<number>)(f)
    marcar.run(nombreDe(f), Date.now(), null, n)
    if (n) resumen.push(`${nombreDe(f)}: ${n}`)
    return n
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    marcar.run(nombreDe(f), Date.now(), error.slice(0, 300), 0)
    resumen.push(`${nombreDe(f)}: ERROR ${error.slice(0, 120)}`)
    return 0
  }
})
// Por cuándo se vio, no por su fecha: un artículo viejo de un índice se borraría y se volvería a leer en cada pasada.
const borrados = db.prepare('delete from docs where visto < ?').run(ahora - BORRAR * 864e5).changes
clearTimeout(corte)
db.close()
rmSync(candado, { force: true })
console.log(`${new Date().toISOString()} · ${toca.length} fuentes en ${((Date.now() - ahora) / 1000).toFixed(0)} s${borrados ? ` · ${borrados} viejos borrados` : ''}\n${resumen.join('\n')}`)
