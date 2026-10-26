// Todas las búsquedas de una vez y lo hallado leído en paralelo: lo que antes eran 10 a 15 rondas de WebSearch, con el
// modelo pensando un minuto entre cada una, en unos segundos.
//
//   node <skill>/scripts/buscar.mjs "consulta 1" "consulta 2" ... [--n 5] [--horas 72]
//
// - Primero el radar de Sloth (`server/radar`): las cuentas de X que importan, los blogs de los laboratorios, los medios
//   de tecnología, Hacker News y GitHub Trending, leídos en segundo plano. Busca en milisegundos, no cuesta nada y casi
//   todo llega ya leído entero. Necesita a Sloth abierto.
// - Si además hay llave EXA_API_KEY (Exa, que trae el texto de cada página) o PERPLEXITY_API_KEY (Perplexity Search),
//   también busca en la web. Las llaves son variables de entorno del usuario de Windows.
// Sin radar ni llave sale con el código 3: busca con WebSearch (todas en un mismo mensaje) y lee lo hallado con leer.mjs.
//
// `--n`: resultados por consulta (5). `--horas`: solo lo publicado en las últimas N horas. Cada página queda en
// `fuentes/textos/` (ver leer.mjs) y se imprime, por consulta, una línea por resultado con su archivo.
import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { CARPETA, guardarIndice, leerIndice, leerTodas, linea, nombreDe } from './leer.mjs'

/** Una llave: la del proceso o, si Sloth la guardó después de arrancar, la del registro. */
function llave(nombre) {
  if (process.env[nombre]) return process.env[nombre]
  try {
    const r = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', nombre], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return /REG_\w+\s+(.+)$/m.exec(r)?.[1].trim() ?? ''
  } catch {
    return ''
  }
}

const args = process.argv.slice(2)
const opcion = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 ? args.splice(i, 2)[1] : d
}
const N = Number(opcion('--n', 5))
const HORAS = opcion('--horas')
const consultas = args
if (!consultas.length) {
  console.error('Uso: node buscar.mjs "consulta" ["consulta" ...] [--n 5] [--horas 72]')
  process.exit(1)
}
const EXA = llave('EXA_API_KEY')
const PERPLEXITY = llave('PERPLEXITY_API_KEY')

async function post(url, cuerpo, cabeceras = {}) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cabeceras }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(30000) })
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

const desde = HORAS ? new Date(Date.now() - Number(HORAS) * 3600e3) : null
const fecha = (ms) => (ms ? new Date(ms).toISOString() : null)

/** El radar de Sloth: por consulta, lo más pertinente y reciente, con el texto de lo que ya leyó entero. */
async function radar() {
  // El puerto del servidor de Sloth, que el agente hereda (`server/index.ts`).
  const puerto = process.env.PORT ?? 4848
  const d = await post(`http://127.0.0.1:${puerto}/api/radar/buscar`, { consultas, n: N, horas: HORAS ? Number(HORAS) : undefined, textos: true })
  return d.resultados.map(({ docs }) => docs.map((h) => ({
    url: h.url, titulo: h.titulo, fecha: fecha(h.fecha), texto: h.texto, extra: [h.fuente, h.extra].filter(Boolean).join(' · ')
  })))
}

async function exa(q) {
  const d = await post('https://api.exa.ai/search', {
    query: q, type: 'auto', numResults: N,
    ...(desde ? { startPublishedDate: desde.toISOString() } : {}),
    // Lo de hace horas: la página se lee en vivo si su copia en Exa es de antes de la ventana.
    contents: { text: true, ...(HORAS ? { maxAgeHours: Math.min(720, Number(HORAS)) } : {}) }
  }, { 'x-api-key': EXA })
  return d.results.map((r) => ({ url: r.url, titulo: r.title, fecha: r.publishedDate ?? null, texto: r.text, extra: 'Exa' }))
}

async function perplexity(q) {
  const recencia = !HORAS ? undefined : HORAS <= 1 ? 'hour' : HORAS <= 24 ? 'day' : HORAS <= 168 ? 'week' : HORAS <= 744 ? 'month' : 'year'
  const d = await post('https://api.perplexity.ai/search', { query: q, max_results: N, search_type: 'fast', ...(recencia ? { search_recency_filter: recencia } : {}) },
    { Authorization: `Bearer ${PERPLEXITY}` })
  return d.results.map((r) => ({ url: r.url, titulo: r.title, fecha: r.date ?? r.last_updated ?? null, extra: 'Perplexity' }))
}

/**
 * Lo que llegó ya leído (del radar o de Exa) se guarda como lo guardaría leer.mjs, y entra en su índice. Devuelve las
 * URLs que guardó: leerTodas las encuentra en el índice, pero no son «(ya estaba)».
 */
function guardarLeidas(hallados) {
  const indice = leerIndice()
  const usados = new Set(Object.values(indice).map((e) => e.archivo.replace(/\.md$/, '')))
  const nuevos = {}
  mkdirSync(CARPETA, { recursive: true })
  for (const h of hallados) {
    if (!h.texto || indice[h.url] || nuevos[h.url]) continue
    const n = nombreDe(h.url, usados)
    const leido = new Date().toISOString()
    writeFileSync(join(CARPETA, `${n}.md`), `URL: ${h.url}\nLeído: ${leido} (${h.extra?.startsWith('Exa') ? 'por Exa' : 'del radar de Sloth'})\nTítulo: ${h.titulo ?? ''}\nPublicado: ${h.fecha ?? 'no lo dice'}\n---\n\n${h.texto}\n`)
    nuevos[h.url] = { archivo: `${n}.md`, titulo: h.titulo, fecha: h.fecha, leido, enlaces: [] }
  }
  guardarIndice(nuevos)
  return new Set(Object.keys(nuevos))
}

const t0 = Date.now()
const web = EXA ? exa : PERPLEXITY ? perplexity : null
const [delRadar, deLaWeb] = await Promise.all([
  radar().catch((e) => ({ error: e.cause?.code === 'ECONNREFUSED' ? 'Sloth no está abierto' : e.message })),
  web ? Promise.all(consultas.map((q) => web(q).catch((e) => ({ error: e.message })))) : null
])
if (delRadar.error && !web) {
  console.error(`Sin radar (${delRadar.error}) ni llave de búsqueda (EXA_API_KEY o PERPLEXITY_API_KEY). Busca con WebSearch, todas ` +
    'las consultas en un mismo mensaje, y lee los resultados con `node <skill>/scripts/leer.mjs <url> ...`.')
  process.exit(3)
}
const porConsulta = consultas.map((q, i) => ({
  q,
  rs: [...(delRadar.error ? [] : delRadar[i]), ...(deLaWeb?.[i]?.error ? [] : deLaWeb?.[i] ?? [])],
  error: [delRadar.error && `radar: ${delRadar.error}`, deLaWeb?.[i]?.error && `web: ${deLaWeb[i].error}`].filter(Boolean).join(' · ')
}))
const hallados = porConsulta.flatMap((c) => c.rs)
const recien = guardarLeidas(hallados)
const t1 = Date.now()
// Lo que llegó leído ya está en el índice; leerTodas lee solo lo demás (posts de X, repos y páginas sin texto entero).
const leidas = new Map((await leerTodas([...new Set(hallados.map((h) => h.url))])).map((r) => [r.url, r]))
for (const { q, rs, error } of porConsulta) {
  console.log(`\n## ${q}${error ? `\n(${error})` : ''}${rs.length ? '' : '\nNada: búscala con WebSearch.'}`)
  for (const h of rs) {
    const r = leidas.get(h.url)
    console.log(`${linea({ ...r, fecha: h.fecha ?? r?.fecha, ya: r?.ya && !recien.has(h.url) })}\n  ${h.url}${h.extra ? ` · ${h.extra}` : ''}`)
  }
}
const fuentes = [!delRadar.error && 'radar', EXA ? 'Exa' : PERPLEXITY ? 'Perplexity' : null].filter(Boolean).join(' y ')
console.log(`\n${consultas.length} búsquedas (${fuentes}) en ${((t1 - t0) / 1000).toFixed(1)} s; ${leidas.size} páginas leídas en ${((Date.now() - t1) / 1000).toFixed(1)} s más.`)
console.log('Lo que no esté aquí (lo de hace meses, una biografía, una página que el radar no sigue): WebSearch, todas en un mismo mensaje, y leer.mjs.')
