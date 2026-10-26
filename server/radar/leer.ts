/**
 * Traer una página o un feed como lo haría Edge, y lo que se repite al leerlos: las entidades de HTML y la URL canónica.
 * Lo usan la pasada del radar (`rastrear.ts`) y la prueba de una fuente nueva (`probar.ts`).
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'

export async function traer(url: string, tipo: 'texto' | 'json' = 'texto', ms = 20_000): Promise<string> {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: tipo === 'json' ? 'application/json' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(ms),
    redirect: 'follow'
  })
  if (!r.ok) throw new Error(`${r.status} en ${url}`)
  const tipoDe = r.headers.get('content-type') ?? ''
  if (tipo === 'texto' && !/html|xml|text|rss|atom/.test(tipoDe)) throw new Error(`no es una página (${tipoDe})`)
  const texto = await r.text()
  return texto.length > 5_000_000 ? texto.slice(0, 5_000_000) : texto
}

const NOMBRADAS: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™', middot: '·', bull: '•', times: '×', euro: '€'
}
export function entidades(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
    }
    return NOMBRADAS[e.toLowerCase()] ?? m
  })
}

/** La URL sin ancla, sin `utm_*` ni barra final: la misma página enlazada de dos maneras es un solo documento. */
export function canonica(url: string, base?: string): string | null {
  try {
    const u = new URL(entidades(url), base)
    if (!/^https?:$/.test(u.protocol)) return null
    u.hash = ''
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref$|ref_src$|s$|source$)/.test(k)) u.searchParams.delete(k)
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '')
    return u.href
  } catch {
    return null
  }
}
