// Lee muchas páginas a la vez y guarda su texto, para investigar y verificar sin que el modelo las abra una por una.
// Cada una queda en `fuentes/textos/<nombre>.md` (la URL, cuándo se leyó, el título, la fecha de publicación y el
// texto), y `fuentes/textos/indice.json` dice qué archivo es cada URL. Lo que se leyó hace menos de 6 horas no se
// vuelve a pedir.
//
//   node <skill>/scripts/leer.mjs <url> [<url> ...] [--edges 6]
//
// - Un post de X va por la API de FxTwitter (x.com no se deja leer sin navegador): el post, la cita, el hilo y las
//   respuestas con sus likes.
// - Un repo de GitHub, por su API (con el token de `gh` si lo hay): estrellas, fechas, licencia, el último release y
//   el README. Un archivo de un repo, crudo.
// - Un PDF (un paper de arXiv), con pypdf del Python del sistema o con pdftotext. Sin ninguno, de arXiv queda el
//   resumen; de lo demás, el error lo dice.
// - Lo demás, en varios Edge sin ventana a la vez (los de `pagina.mjs`), sin imágenes, videos ni fuentes: el texto del
//   artículo o, si no lo hay, de la página entera.
// Lo usan también preinvestigar.mjs y buscar.mjs; verificar.py busca las citas en estos textos.
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { abrir } from './pagina.mjs'

export const CARPETA = resolve('fuentes', 'textos')
const INDICE = join(CARPETA, 'indice.json')
const VIGENTE = 6 * 3600 * 1000
const AGENTE = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36' }

export const leerIndice = () => (existsSync(INDICE) ? JSON.parse(readFileSync(INDICE, 'utf8')) : {})

/** Guarda el índice mezclado con lo que haya escrito otro proceso mientras tanto (temporal y reemplazo). */
export function guardarIndice(nuevos) {
  mkdirSync(CARPETA, { recursive: true })
  const todo = { ...leerIndice(), ...nuevos }
  writeFileSync(INDICE + '.tmp', JSON.stringify(todo, null, 1))
  renameSync(INDICE + '.tmp', INDICE)
}

/** Un nombre de archivo legible y estable para la URL: dominio y ruta, sin lo raro, de 90 caracteres como mucho. */
export function nombreDe(url, usados) {
  const u = new URL(url)
  let n = (u.hostname.replace(/^www\./, '') + u.pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 90)
  for (let i = 2, base = n; usados.has(n); i++) n = `${base}-${i}`
  usados.add(n)
  return n
}

async function json(url, cabeceras = {}) {
  const r = await fetch(url, { headers: { ...AGENTE, ...cabeceras }, signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`${r.status} en ${url}`)
  return r.json()
}

let tokenGh
function tokenGitHub() {
  if (tokenGh !== undefined) return tokenGh
  tokenGh = process.env.GITHUB_TOKEN ?? ''
  if (!tokenGh) try { tokenGh = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch {}
  return tokenGh
}

// ---------- Posts de X, por FxTwitter ----------

/** Los enlaces de un post: los de su texto (ya sin t.co) y el de su tarjeta. */
function enlacesDe(s) {
  const fuera = []
  for (const f of s?.raw_text?.facets ?? []) if (f.type === 'url') fuera.push(f.replacement ?? f.original)
  if (s?.embed_card?.url) fuera.push(s.embed_card.url)
  return fuera.filter((u) => u && /^https?:/.test(u) && !/^https?:\/\/(t\.co|x\.com|twitter\.com)\//.test(u))
}

function post(s, sangria = '') {
  const a = s.author ?? {}
  const cifras = [`${s.likes ?? 0} likes`, `${s.reposts ?? 0} reposts`, `${s.replies ?? 0} respuestas`, s.views ? `${s.views} vistas` : null, s.bookmarks ? `${s.bookmarks} guardados` : null].filter(Boolean)
  let t = `${sangria}@${a.screen_name} (${a.name}) · ${s.created_at} · ${cifras.join(' · ')}\n${sangria}${s.url}\n\n${s.text}\n`
  if (s.community_note) t += `\nNota de la comunidad: ${s.community_note.text ?? JSON.stringify(s.community_note)}\n`
  if (s.quote) t += `\n> Cita a:\n${post(s.quote, '> ').replace(/\n(?!> )/g, '\n> ')}\n`
  return t
}

async function leerPost(url) {
  const id = /\/status\/(\d+)/.exec(url)[1]
  const d = await json(`https://api.fxtwitter.com/2/conversation/${id}`)
  const s = d.status
  if (!s) throw new Error('FxTwitter no lo encontró (¿borrado o privado?)')
  const autor = s.author?.screen_name
  let texto = post(s)
  const hilo = (d.thread ?? []).filter((t) => t.id !== s.id)
  if (hilo.length) texto += `\n## Hilo\n\n${hilo.map((t) => post(t)).join('\n')}`
  const respuestas = [...(d.replies ?? [])].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
  if (respuestas.length) texto += `\n## Respuestas (de más a menos likes)\n\n${respuestas.map((t) => post(t)).join('\n')}`
  // Los enlaces que importan: los del post, su cita, su hilo y las respuestas del propio autor.
  const enlaces = [s, s.quote, ...hilo, ...respuestas.filter((t) => t.author?.screen_name === autor)].flatMap(enlacesDe)
  // El post que cita también es fuente: su texto ya va aquí, pero sus respuestas y su hilo no.
  if (s.quote?.url) enlaces.unshift(s.quote.url)
  return { titulo: `Post de @${autor}`, fecha: s.created_at, texto, enlaces }
}

// ---------- GitHub, por su API ----------

async function leerRepo(duenio, repo) {
  const tk = tokenGitHub()
  const cab = { Accept: 'application/vnd.github+json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) }
  const api = `https://api.github.com/repos/${duenio}/${repo}`
  const [r, release, readme] = await Promise.all([
    json(api, cab),
    json(`${api}/releases/latest`, cab).catch(() => null),
    fetch(`${api}/readme`, { headers: { ...AGENTE, ...cab, Accept: 'application/vnd.github.raw' }, signal: AbortSignal.timeout(20000) }).then((x) => (x.ok ? x.text() : ''))
  ])
  const datos = [
    `${r.full_name}: ${r.description ?? ''}`,
    `${r.stargazers_count} estrellas · ${r.forks_count} forks · ${r.open_issues_count} issues abiertos · licencia ${r.license?.spdx_id ?? 'ninguna'}`,
    `Creado ${r.created_at} · último push ${r.pushed_at}${r.homepage ? ` · sitio ${r.homepage}` : ''}`,
    release ? `Último release: ${release.tag_name} (${release.name ?? ''}) el ${release.published_at}` : 'Sin releases'
  ]
  return { titulo: `GitHub ${r.full_name}`, fecha: r.created_at, texto: `${datos.join('\n')}\n\n## README\n\n${readme}`, enlaces: r.homepage ? [r.homepage] : [] }
}

async function leerCrudo(url) {
  const r = await fetch(url, { headers: AGENTE, signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`${r.status} en ${url}`)
  return { titulo: url.split('/').pop(), fecha: null, texto: await r.text(), enlaces: [] }
}

// ---------- PDFs ----------

const ARXIV = /^(export\.)?arxiv\.org$/
// El PDF entra por stdin; con -P, la carpeta del episodio no entra en sys.path.
const PYPDF = 'import io, sys, pypdf; r = pypdf.PdfReader(io.BytesIO(sys.stdin.buffer.read())); sys.stdout.write("\\n\\n".join(p.extract_text() or "" for p in r.pages))'

/** El texto de un PDF, con lo que haya en la máquina; null si no hay con qué. */
function textoDePdf(buf) {
  for (const [cmd, args] of [['python', ['-X', 'utf8', '-P', '-c', PYPDF]], ['pdftotext', ['-enc', 'UTF-8', '-', '-']]]) {
    try {
      const t = execFileSync(cmd, args, { input: buf, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 1 << 28, timeout: 60000 })
      if (t.trim()) return t
    } catch {}
  }
  return null
}

async function leerPdf(url) {
  const r = await fetch(url, { headers: AGENTE, signal: AbortSignal.timeout(30000) })
  if (!r.ok) throw new Error(`${r.status} en ${url}`)
  const buf = Buffer.from(await r.arrayBuffer())
  // Un «.pdf» que contesta con una página (un muro, una portada): va al navegador.
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw Object.assign(new Error('no es un PDF'), { edge: true })
  const titulo = decodeURIComponent(new URL(url).pathname.split('/').pop())
  const texto = textoDePdf(buf)
  if (texto) return { titulo, fecha: null, texto, enlaces: [] }
  const id = ARXIV.test(new URL(url).hostname) && /\/pdf\/(.+?)(\.pdf)?$/.exec(new URL(url).pathname)?.[1]
  if (!id) throw new Error('es un PDF y no hay con qué leerlo: ni pypdf en el Python del sistema ni pdftotext')
  // Sin con qué leer el PDF, de arXiv al menos el título, la fecha y el resumen, por su API.
  const xml = await (await fetch(`https://export.arxiv.org/api/query?id_list=${id}`, { headers: AGENTE, signal: AbortSignal.timeout(20000) })).text()
  const campo = (n) => new RegExp(`<entry>[\\s\\S]*?<${n}>([\\s\\S]*?)</${n}>`).exec(xml)?.[1].replace(/\s+/g, ' ').trim()
  if (!campo('summary')) throw new Error(`es un PDF sin con qué leerlo, y arXiv no trae ${id}`)
  return { titulo: campo('title'), fecha: campo('published') ?? null, enlaces: [],
    texto: `${campo('title')}\n\n${campo('summary')}\n\n(Solo el resumen de arXiv: no hay pypdf ni pdftotext para leer el PDF entero.)` }
}

/** Lo que se lee sin navegador, o null. */
function directo(url) {
  const u = new URL(url)
  if (/\.pdf$/i.test(u.pathname) || (ARXIV.test(u.hostname) && u.pathname.startsWith('/pdf/'))) return () => leerPdf(url)
  if (/^(x|twitter|mobile\.twitter)\.com$/.test(u.hostname.replace(/^www\./, '')) && /\/status\/\d+/.test(u.pathname)) return () => leerPost(url)
  if (u.hostname === 'github.com') {
    const [, duenio, repo, que, rama, ...ruta] = u.pathname.split('/')
    if (duenio && repo && (!que || (que === 'tree' && !ruta.length))) return () => leerRepo(duenio, repo.replace(/\.git$/, ''))
    if (que === 'blob' && rama && ruta.length) return () => leerCrudo(`https://raw.githubusercontent.com/${duenio}/${repo}/${rama}/${ruta.join('/')}`)
  }
  if (u.hostname === 'raw.githubusercontent.com' || /\.(md|txt|json)$/i.test(u.pathname)) return () => leerCrudo(url)
  return null
}

// ---------- Lo demás, en Edge ----------

const EXTRAER = `(() => {
  const meta = (s) => document.querySelector(s)?.getAttribute('content')
  let fecha = meta('meta[property="article:published_time"]') || meta('meta[name="date"]') || meta('meta[itemprop="datePublished"]') ||
    document.querySelector('time[datetime]')?.getAttribute('datetime') || null
  if (!fecha) for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { const j = JSON.parse(s.textContent); const d = [j].flat().flatMap((x) => x?.['@graph'] ?? [x]).find((x) => x?.datePublished)?.datePublished
      if (d) { fecha = d; break } } catch {}
  }
  const todo = document.body?.innerText ?? ''
  const art = document.querySelector('article') ?? document.querySelector('main')
  const texto = art && art.innerText.length > 0.3 * todo.length ? art.innerText : todo
  return { titulo: document.title, fecha, texto, url: location.href }
})()`

async function abrirLector() {
  const c = await abrir()
  // Para leer no hacen falta imágenes, videos ni fuentes: es lo que más tarda en llegar.
  await c.enviar('Fetch.enable', { patterns: ['Image', 'Media', 'Font'].map((resourceType) => ({ resourceType })) })
  c.alEvento('Fetch.requestPaused', (e) => c.enviar('Fetch.failRequest', { requestId: e.requestId, errorReason: 'BlockedByClient' }).catch(() => {}))
  await c.enviar('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1600, deviceScaleFactor: 1, mobile: false })
  // La respuesta de cada página: su código HTTP y su tipo.
  c.respuestas = new Map()
  c.alEvento('Network.responseReceived', (e) => { if (e.type === 'Document') c.respuestas.set(e.loaderId, e.response) })
  return c
}

async function leerEnEdge(c, url) {
  const lista = new Promise((r) => c.alEvento('Page.domContentEventFired', r))
  const { loaderId, errorText } = await c.enviar('Page.navigate', { url })
  const resp = c.respuestas.get(loaderId)
  // Un PDF sin «.pdf» en la URL: Edge lo baja en vez de abrirlo.
  if (/pdf/i.test(resp?.mimeType ?? '')) return leerPdf(url)
  if (resp?.status >= 400) throw new Error(`${resp.status} en ${url}`)
  if (errorText) throw new Error(`${errorText} en ${url}`)
  await Promise.race([lista, new Promise((r) => setTimeout(r, 20000).unref())])
  await c.quieta(6000)
  const r = await c.evaluar(EXTRAER)
  if (!r.texto.trim()) throw new Error('la página no trae texto (¿un muro de login, solo imágenes?)')
  if (/404|not found|no encontrad/i.test(r.titulo) && r.texto.split(/\s+/).length < 600) throw new Error(`no existe (${r.titulo})`)
  return { ...r, enlaces: [] }
}

const conTope = (p, ms, que) => Promise.race([p, new Promise((_, mal) => setTimeout(() => mal(new Error(`${que}: más de ${ms / 1000} s`)), ms).unref())])

/**
 * Lee las URLs (las de menos de 6 h, del índice) y devuelve, en el mismo orden, `{ url, archivo, titulo, fecha,
 * palabras, enlaces }` o `{ url, error }`.
 */
export async function leerTodas(urls, { edges = 6 } = {}) {
  const indice = leerIndice()
  const usados = new Set(Object.values(indice).map((e) => e.archivo.replace(/\.md$/, '')))
  const salida = new Map()
  const nuevos = {}
  const enEdge = []
  const guardar = (url, r) => {
    const n = nombreDe(url, usados)
    const leido = new Date().toISOString()
    mkdirSync(CARPETA, { recursive: true })
    writeFileSync(join(CARPETA, `${n}.md`), `URL: ${url}\nLeído: ${leido}\nTítulo: ${r.titulo ?? ''}\nPublicado: ${r.fecha ?? 'no lo dice'}\n---\n\n${r.texto}\n`)
    nuevos[url] = { archivo: `${n}.md`, titulo: r.titulo, fecha: r.fecha, leido, enlaces: r.enlaces }
    salida.set(url, { url, archivo: join('fuentes', 'textos', `${n}.md`), titulo: r.titulo, fecha: r.fecha, palabras: r.texto.split(/\s+/).length, enlaces: r.enlaces })
  }
  const pendientes = [...new Set(urls)].filter((url) => {
    const e = indice[url]
    if (e && Date.now() - Date.parse(e.leido) < VIGENTE && existsSync(join(CARPETA, e.archivo))) {
      salida.set(url, { url, archivo: join('fuentes', 'textos', e.archivo), titulo: e.titulo, fecha: e.fecha, palabras: readFileSync(join(CARPETA, e.archivo), 'utf8').split(/\s+/).length, enlaces: e.enlaces ?? [], ya: true })
      return false
    }
    return true
  })
  await Promise.all(pendientes.map(async (url) => {
    let f
    try { f = directo(url) } catch { salida.set(url, { url, error: 'no es una URL' }); return }
    if (!f) return enEdge.push(url)
    try { guardar(url, await conTope(f(), 30000, url)) } catch (e) {
      // Si la API no puede (un repo privado, un post que FxTwitter no ve), queda el navegador.
      if (e.edge || /github\.com|x\.com|twitter\.com/.test(url)) enEdge.push(url)
      else salida.set(url, { url, error: e.message })
    }
  }))
  if (enEdge.length) {
    const cola = [...enEdge]
    await Promise.all(Array.from({ length: Math.min(edges, cola.length) }, async () => {
      let c = await abrirLector()
      try {
        for (let url; (url = cola.shift()); ) {
          try { guardar(url, await conTope(leerEnEdge(c, url), 45000, url)) } catch (e) {
            salida.set(url, { url, error: e.message.split('\n')[0] })
            await c.cerrar().catch(() => {})
            c = await abrirLector()
          }
        }
      } finally { await c.cerrar().catch(() => {}) }
    }))
  }
  guardarIndice(nuevos)
  return urls.map((u) => salida.get(u) ?? { url: u, error: 'no se leyó' })
}

/** Una línea por URL, para la consola del agente. */
export function linea(r) {
  if (r.error) return `ERROR ${r.url}: ${r.error}`
  return `${r.archivo} · ${r.palabras} palabras · ${r.fecha ?? 'sin fecha'} · ${r.titulo ?? ''}${r.ya ? ' (ya estaba)' : ''}`
}

// Con la ruta real: llamado por el enlace de ~/.claude/skills, argv[1] no es la del módulo y no haría nada.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const i = args.indexOf('--edges')
  const edges = i >= 0 ? Number(args.splice(i, 2)[1]) : 6
  if (!args.length) {
    console.error('Uso: node leer.mjs <url> [<url> ...] [--edges 6]')
    process.exit(1)
  }
  const t0 = Date.now()
  const rs = await leerTodas(args, { edges })
  console.log(rs.map(linea).join('\n'))
  console.log(`\n${rs.filter((r) => !r.error).length} de ${rs.length} en ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}
