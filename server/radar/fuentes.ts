import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FuenteRadar } from '../../shared/types.ts'
import { guardar } from '../disco.ts'

/**
 * Lo que lee el radar. Las elige el usuario en Opciones → Radar (`data/radar/fuentes.json`); sin elegir, valen las de
 * siempre (`DE_SIEMPRE`), de donde sale casi todo lo que cuenta un noticiero de tecnología. Cada tipo dice cada cuánto
 * se vuelve a mirar. Una cuenta o un feed que deje de existir solo marca su error en `GET /api/radar`.
 *
 * - `x`: los posts de una cuenta de X (por FxTwitter) y las páginas que enlazan.
 * - `rss`: un feed RSS o Atom; cada entrada se lee entera desde su página.
 * - `pagina`: una página índice sin feed (el blog de Anthropic): sus enlaces que cuadran con `enlaces` se leen enteros.
 * - `hn`: lo que pasa de 60 puntos en Hacker News, con la página que enlaza.
 * - `github`: los repos de GitHub Trending del día, con su README.
 */

/** Como `FuenteRadar`, con el patrón de una página ya como RegExp. */
export type Fuente = Exclude<FuenteRadar, { tipo: 'pagina' }> | { tipo: 'pagina'; nombre: string; url: string; enlaces: RegExp }

const MIN = 60_000

/** Cada cuánto se mira una fuente de cada tipo. */
export const CADA: Record<Fuente['tipo'], number> = { x: 20 * MIN, rss: 30 * MIN, pagina: 60 * MIN, hn: 15 * MIN, github: 3 * 60 * MIN }

export const nombreDe = (f: Fuente) => (f.tipo === 'x' ? `x:@${f.cuenta}` : f.tipo === 'hn' || f.tipo === 'github' ? f.tipo : `${f.tipo}:${f.nombre}`)

const CUENTAS = [
  // Laboratorios y su gente
  'OpenAI', 'OpenAIDevs', 'ChatGPTapp', 'sama', 'gdb', 'AnthropicAI', 'claudeai', 'bcherny', 'GoogleDeepMind', 'GoogleAI',
  'GeminiApp', 'googleaidevs', 'OfficialLoganK', 'sundarpichai', 'demishassabis', 'JeffDean', 'xai', 'elonmusk', 'AIatMeta',
  'MistralAI', 'deepseek_ai', 'Alibaba_Qwen', 'Kimi_Moonshot', 'nvidia', 'huggingface', 'ClementDelangue', 'Microsoft',
  'satyanadella', 'mustafasuleyman', 'Apple', 'perplexity_ai', 'AravSrinivas',
  // Herramientas de programación y producto
  'cursor_ai', 'github', 'vercel', 'rauchg', 'Replit', 'amasad', 'cognition', 'windsurf', 'figma', 'NotionHQ', 'supabase',
  // Video, imagen y voz
  'midjourney', 'runwayml', 'LumaLabsAI', 'elevenlabsio', 'pika_labs', 'krea_ai', 'higgsfield_ai',
  // Robots y hardware
  'figure_robot', 'Tesla_Optimus', 'Tesla', 'SpaceX',
  // Quienes cuentan las noticias y las filtraciones primero
  'karpathy', 'ylecun', 'AndrewYNg', 'testingcatalog', 'btibor91', 'swyx', 'simonw', 'levelsio', 't3dotgg', 'theo',
  'ThePrimeagen', 'steipete', 'kimmonismus', 'rowancheung', 'bindureddy', 'chatgpt21', 'arcprize',
  'lmarena_ai', 'ArtificialAnlys', 'EpochAIResearch', 'emollick', 'mckaywrigley', 'skirano', 'deedydas'
]

const FEEDS: Array<[string, string]> = [
  ['OpenAI', 'https://openai.com/news/rss.xml'],
  ['Google DeepMind', 'https://deepmind.google/blog/rss.xml'],
  ['Google IA', 'https://blog.google/technology/ai/rss/'],
  ['Hugging Face', 'https://huggingface.co/blog/feed.xml'],
  ['NVIDIA', 'https://blogs.nvidia.com/feed/'],
  ['GitHub', 'https://github.blog/feed/'],
  ['Microsoft', 'https://blogs.microsoft.com/feed/'],
  ['Meta', 'https://about.fb.com/news/feed/'],
  ['Apple', 'https://www.apple.com/newsroom/rss-feed.rss'],
  ['Cloudflare', 'https://blog.cloudflare.com/rss/'],
  ['Vercel', 'https://vercel.com/atom'],
  ['Claude Code', 'https://github.com/anthropics/claude-code/releases.atom'],
  ['Codex', 'https://github.com/openai/codex/releases.atom'],
  ['TechCrunch IA', 'https://techcrunch.com/category/artificial-intelligence/feed/'],
  ['TechCrunch', 'https://techcrunch.com/feed/'],
  ['The Verge IA', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml'],
  ['The Verge', 'https://www.theverge.com/rss/index.xml'],
  ['Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index'],
  ['Wired IA', 'https://www.wired.com/feed/tag/ai/latest/rss'],
  ['Engadget', 'https://www.engadget.com/rss.xml'],
  ['The Register', 'https://www.theregister.com/headlines.atom'],
  ['404 Media', 'https://www.404media.co/rss/'],
  ['CNBC Tech', 'https://www.cnbc.com/id/19854910/device/rss/rss.html'],
  ['Decrypt', 'https://decrypt.co/feed'],
  ["Tom's Hardware", 'https://www.tomshardware.com/feeds/all'],
  ['9to5Mac', 'https://9to5mac.com/feed/'],
  ['9to5Google', 'https://9to5google.com/feed/'],
  ['The Information', 'https://www.theinformation.com/feed'],
  ['TestingCatalog', 'https://www.testingcatalog.com/rss/'],
  ['Simon Willison', 'https://simonwillison.net/atom/everything/'],
  ['Latent Space', 'https://www.latent.space/feed'],
  ['Interconnects', 'https://www.interconnects.ai/feed'],
  ['Import AI', 'https://importai.substack.com/feed'],
  ['Stratechery', 'https://stratechery.com/feed/']
]

const PAGINAS: Array<[string, string, RegExp]> = [
  ['Anthropic', 'https://www.anthropic.com/news', /^https:\/\/www\.anthropic\.com\/news\/[\w-]+$/],
  ['Anthropic ingeniería', 'https://www.anthropic.com/engineering', /^https:\/\/www\.anthropic\.com\/engineering\/[\w-]+$/],
  ['Claude', 'https://claude.com/blog', /^https:\/\/claude\.com\/blog\/[\w-]+$/],
  ['Mistral', 'https://mistral.ai/news', /^https:\/\/mistral\.ai\/news\/[\w-]+$/],
  ['Cursor', 'https://cursor.com/blog', /^https:\/\/cursor\.com\/blog\/[\w-]+$/]
]

export const DE_SIEMPRE: Fuente[] = [
  { tipo: 'hn' },
  { tipo: 'github' },
  ...FEEDS.map(([nombre, url]): Fuente => ({ tipo: 'rss', nombre, url })),
  ...PAGINAS.map(([nombre, url, enlaces]): Fuente => ({ tipo: 'pagina', nombre, url, enlaces })),
  ...CUENTAS.map((cuenta): Fuente => ({ tipo: 'x', cuenta }))
]

const archivo = (app: string) => join(app, 'data', 'radar', 'fuentes.json')

/** Como se guarda y viaja: el patrón de una página, en texto. */
export const aTexto = (f: Fuente): FuenteRadar => (f.tipo === 'pagina' ? { ...f, enlaces: f.enlaces.source } : f)

/** La fuente si está bien formada; si no, `null`. */
export function validar(f: FuenteRadar): Fuente | null {
  const texto = (v: unknown) => typeof v === 'string' && v.trim() !== ''
  const web = (v: unknown) => texto(v) && /^https?:\/\//.test(String(v))
  switch (f?.tipo) {
    case 'hn':
    case 'github':
      return { tipo: f.tipo }
    case 'x':
      return /^\w{1,15}$/.test(String(f.cuenta)) ? { tipo: 'x', cuenta: f.cuenta } : null
    case 'rss':
      return texto(f.nombre) && web(f.url) ? { tipo: 'rss', nombre: f.nombre.trim(), url: f.url.trim() } : null
    case 'pagina':
      try {
        return texto(f.nombre) && web(f.url) && texto(f.enlaces) ? { tipo: 'pagina', nombre: f.nombre.trim(), url: f.url.trim(), enlaces: new RegExp(f.enlaces) } : null
      } catch {
        return null
      }
    default:
      return null
  }
}

/** Las fuentes del radar: las del usuario si las cambió; si no, o si su archivo no se puede leer, las de siempre. */
export function leerFuentes(app: string): { fuentes: Fuente[]; deSiempre: boolean } {
  let texto: string
  try {
    texto = readFileSync(archivo(app), 'utf8')
  } catch {
    return { fuentes: DE_SIEMPRE, deSiempre: true }
  }
  try {
    return { fuentes: (JSON.parse(texto) as FuenteRadar[]).flatMap((f) => validar(f) ?? []), deSiempre: false }
  } catch (error) {
    console.error(`data/radar/fuentes.json tiene un error; el radar lee las de siempre. ${error instanceof Error ? error.message : error}`)
    return { fuentes: DE_SIEMPRE, deSiempre: true }
  }
}

/**
 * Guarda las fuentes que eligió el usuario, sin las mal formadas ni las repetidas. Dos con el mismo nombre y distinta
 * dirección no se pisan: la segunda se llama «Nombre 2». Con `null` vuelven las de siempre.
 */
export function guardarFuentes(app: string, lista: FuenteRadar[] | null) {
  if (!lista) return rmSync(archivo(app), { force: true })
  const fuentes: Fuente[] = []
  for (const f of lista.flatMap((f) => validar(f) ?? [])) {
    if (fuentes.some((g) => JSON.stringify(aTexto(g)) === JSON.stringify(aTexto(f)))) continue
    if ('nombre' in f) for (let n = 2, base = f.nombre; fuentes.some((g) => nombreDe(g) === nombreDe(f)); n++) f.nombre = `${base} ${n}`
    if (!fuentes.some((g) => nombreDe(g) === nombreDe(f))) fuentes.push(f)
  }
  mkdirSync(dirname(archivo(app)), { recursive: true })
  guardar(archivo(app), `${JSON.stringify(fuentes.map(aTexto), null, 2)}\n`)
}
