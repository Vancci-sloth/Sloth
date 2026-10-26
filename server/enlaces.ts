import { lookup } from 'node:dns/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { BlockList, isIP } from 'node:net'
import type { Enlace } from '../shared/types.ts'

/**
 * La tarjeta de un enlace pegado en el inicio: su título, su miniatura y su sitio. YouTube, TikTok y Vimeo los dan por su
 * oEmbed; las demás páginas, por sus etiquetas `og:` (o su `<title>`), leyendo solo el principio. Solo `http` y `https`,
 * con un tiempo máximo, y nunca hacia la propia computadora ni la red de casa (`publica`), tampoco por una redirección.
 * Lo leído se recuerda (`TOPE` enlaces, los últimos que se pidieron); lo que no dio título se vuelve a mirar pasados unos
 * minutos, por si la página estaba caída.
 */

const TOPE = 200
const REINTENTO = 5 * 60_000
const ESPERA = 6000
/** Lo más que se lee de una página. Las etiquetas `og:` van en el `<head>`: casi siempre se corta antes, al cerrarlo. */
const MAX_BYTES = 400_000
const AGENTE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

/** Loopback, redes privadas y enlace local: un enlace pegado no puede hacer que Sloth pida algo a la red de casa. */
const PRIVADAS = new BlockList()
for (const [red, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16]] as const) PRIVADAS.addSubnet(red, bits, 'ipv4')
for (const [red, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10]] as const) PRIVADAS.addSubnet(red, bits, 'ipv6')
const privada = (ip: string) => {
  const v4 = /^::ffff:(d+.d+.d+.d+)$/i.exec(ip)?.[1] // una IPv4 escrita como IPv6
  return v4 ? PRIVADAS.check(v4, 'ipv4') : PRIVADAS.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4')
}

/** Si la dirección es `http(s)` y todas las IP de su host son de internet. */
async function publica(u: URL): Promise<boolean> {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname.replace(/^[|]$/g, '')
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true }).catch(() => [])).map((a) => a.address)
  return ips.length > 0 && !ips.some(privada)
}

/** `fetch` que sigue a mano las redirecciones (hasta 5) y comprueba cada salto con `publica`. `null` si alguno no vale. */
async function pedir(u: URL, init: RequestInit): Promise<{ r: Response; final: URL } | null> {
  for (let salto = 0; salto <= 5; salto++) {
    if (!(await publica(u))) return null
    const r = await fetch(u, { ...init, redirect: 'manual' })
    const a = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null
    if (!a) return { r, final: u }
    await r.body?.cancel().catch(() => {})
    u = new URL(a, u)
  }
  return null
}

/** De la más vieja a la más nueva: al pasar del tope sale la primera. */
const leidos = new Map<string, { enlace: Promise<Enlace>; caduca: number }>()

/** `GET /api/enlace?url=…`. */
export async function enlacesApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname !== '/api/enlace' || req.method !== 'GET') return false
  const enlace = await recordado(url.searchParams.get('url') ?? '')
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(enlace))
  return true
}

function recordado(destino: string): Promise<Enlace> {
  const visto = leidos.get(destino)
  leidos.delete(destino)
  if (visto && visto.caduca > Date.now()) {
    leidos.set(destino, visto)
    return visto.enlace
  }
  const entrada = { enlace: leerEnlace(destino), caduca: Infinity }
  leidos.set(destino, entrada)
  void entrada.enlace.then((e) => {
    if (!e.titulo) entrada.caduca = Date.now() + REINTENTO
  })
  for (const viejo of leidos.keys()) {
    if (leidos.size <= TOPE) break
    leidos.delete(viejo)
  }
  return entrada.enlace
}

/** Lo que se sabe de un enlace. Nunca falla: sin nada que enseñar, vuelve solo con el sitio (o vacío, si no es una URL). */
export async function leerEnlace(destino: string): Promise<Enlace> {
  let u: URL
  try {
    u = new URL(destino)
  } catch {
    return { url: destino, sitio: '' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { url: destino, sitio: '' }
  const base: Enlace = { url: u.href, sitio: u.hostname.replace(/^www\./, '') }
  // Un solo reloj para todo: el oEmbed y, si no sirvió, la página.
  const signal = AbortSignal.timeout(ESPERA)
  try {
    const oembed = oembedDe(u)
    if (oembed) {
      // Un video privado o borrado no tiene oEmbed: queda la página.
      const r = (await pedir(new URL(oembed), { signal, headers: { 'user-agent': AGENTE } }))?.r
      const d = r?.ok ? ((await r.json()) as { title?: string; thumbnail_url?: string; author_name?: string; provider_name?: string }) : (await r?.body?.cancel(), null)
      if (d?.title) return { ...base, titulo: limpio(d.title), imagen: await imagenValida(limpio(d.thumbnail_url), u), autor: limpio(d.author_name), sitio: d.provider_name || base.sitio }
    }
    return { ...base, ...(await etiquetas(u, signal)) }
  } catch {
    return base
  }
}

function oembedDe(u: URL): string | null {
  const host = u.hostname.toLowerCase()
  const url = encodeURIComponent(u.href)
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return `https://www.youtube.com/oembed?format=json&url=${url}`
  if (/(^|\.)tiktok\.com$/.test(host)) return `https://www.tiktok.com/oembed?url=${url}`
  if (/(^|\.)vimeo\.com$/.test(host)) return `https://vimeo.com/api/oembed.json?url=${url}`
  return null
}

/** El título, la imagen y el sitio de una página, de sus `<meta>` y su `<title>`. */
async function etiquetas(u: URL, signal: AbortSignal): Promise<Partial<Enlace>> {
  const { html, final } = await principio(u, signal)
  const metas = new Map<string, string>()
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = new Map([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((a) => [a[1].toLowerCase(), a[2] ?? a[3]]))
    const clave = (attrs.get('property') ?? attrs.get('name'))?.toLowerCase()
    const valor = attrs.get('content')
    if (clave && valor && !metas.has(clave)) metas.set(clave, valor)
  }
  const titulo = limpio(metas.get('og:title') ?? metas.get('twitter:title') ?? /<title[^>]*>([^<]*)/i.exec(html)?.[1])
  const imagen = await imagenValida(limpio(metas.get('og:image') ?? metas.get('og:image:url') ?? metas.get('twitter:image')), final)
  const sitio = limpio(metas.get('og:site_name'))
  return { titulo, imagen, ...(sitio ? { sitio } : {}) }
}

/**
 * El principio de una página HTML: se lee por partes y se corta al cerrar el `<head>` o al llegar a `MAX_BYTES`. `final`
 * es la dirección tras las redirecciones, para resolver una imagen relativa.
 */
async function principio(u: URL, signal: AbortSignal): Promise<{ html: string; final: URL }> {
  const pedido = await pedir(u, { signal, headers: { 'user-agent': AGENTE, accept: 'text/html,application/xhtml+xml', 'accept-language': 'es,en;q=0.8' } })
  if (!pedido) return { html: '', final: u }
  const { r, final } = pedido
  const tipo = r.headers.get('content-type') ?? ''
  if (!r.ok || !r.body || (tipo && !/html/i.test(tipo))) {
    await r.body?.cancel().catch(() => {})
    return { html: '', final }
  }
  let decoder: TextDecoder
  try {
    decoder = new TextDecoder(/charset=["']?([\w-]+)/i.exec(tipo)?.[1] ?? 'utf-8')
  } catch {
    decoder = new TextDecoder()
  }
  const lector = r.body.getReader()
  let html = ''
  let leidos = 0
  try {
    while (leidos < MAX_BYTES) {
      const { done, value } = await lector.read()
      if (done) break
      const trozo = value.subarray(0, MAX_BYTES - leidos)
      leidos += trozo.length
      html += decoder.decode(trozo, { stream: true })
      if (/<\/head>/i.test(html.slice(-(trozo.length + 8)))) break
    }
  } finally {
    await lector.cancel().catch(() => {})
  }
  return { html, final }
}

const ENTIDADES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }

/** Sin entidades HTML ni espacios de más. `undefined` si queda vacío. */
function limpio(texto?: string): string | undefined {
  const t = texto
    ?.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] !== '#') return ENTIDADES[e.toLowerCase()] ?? m
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m
    })
    .replace(/\s+/g, ' ')
    .trim()
  return t || undefined
}

/** Una imagen que el navegador pueda pedir: absoluta, `http(s)` y de internet (la pide el navegador, también a la red de casa). */
async function imagenValida(imagen: string | undefined, base: URL): Promise<string | undefined> {
  if (!imagen) return
  try {
    const u = new URL(imagen, base)
    return (await publica(u)) ? u.href : undefined
  } catch {
    return
  }
}
