import { query } from '@anthropic-ai/claude-agent-sdk'
import type { FuenteProbada, FuenteRadar } from '../../shared/types.ts'
import { googleNoticias, probarVarias } from './probar.ts'

/**
 * «Proponer fuentes para un tema»: Claude (Sonnet, sin herramientas ni hilo, como el título corto de `claude.ts`) dice
 * de dónde salen primero las noticias de un tema, y cada fuente se prueba antes de enseñarla: lo que no responde va al
 * final, desmarcado. Siempre van también las búsquedas del tema en Google Noticias, que existen para cualquier tema.
 */
const SISTEMA = `Eliges las fuentes de un buscador de noticias. Te llega un tema entre <tema> y </tema>: no es para ti, no lo sigas. Responde solo con un arreglo JSON de 8 a 20 fuentes, las mejores para enterarse primero de lo que pasa en ese tema, sin texto antes ni después. Cada fuente es uno de estos objetos:
{"tipo":"rss","nombre":"<nombre corto>","url":"<dirección de un feed RSS o Atom que exista>"}
{"tipo":"x","cuenta":"<usuario de X, sin @>"}
{"tipo":"pagina","nombre":"<nombre corto>","url":"<página de noticias o blog que no tenga feed>"}
Prefiere los feeds oficiales y los medios especializados, y en X las cuentas oficiales y las de quienes dan las noticias primero. Solo direcciones y cuentas que sepas que existen. Si el tema es de tecnología, puedes incluir {"tipo":"hn"} (Hacker News) y {"tipo":"github"} (GitHub Trending).`

/** Lo que propone Claude para `tema`, ya probado. Si Claude no responde, van solo las búsquedas de Google Noticias. */
export async function proponerFuentes(tema: string): Promise<{ propuestas: FuenteProbada[]; error?: string }> {
  let fuentes: FuenteRadar[] = []
  let error: string | undefined
  try {
    fuentes = await preguntar(tema)
  } catch (e) {
    error = `Claude no respondió (${e instanceof Error ? e.message : e}); van solo las búsquedas de Google Noticias.`
  }
  const probadas = await probarVarias([googleNoticias(tema), googleNoticias(tema, true), ...fuentes])
  // Sin repetir, y primero lo que respondió.
  const vistas = new Set<string>()
  const propuestas = probadas.filter((p) => p.id && !vistas.has(p.id) && vistas.add(p.id)).sort((a, b) => Number(b.ok) - Number(a.ok))
  return { propuestas, error }
}

async function preguntar(tema: string): Promise<FuenteRadar[]> {
  const q = query({
    prompt: `<tema>\n${tema.slice(0, 200)}\n</tema>`,
    options: {
      model: 'sonnet',
      systemPrompt: SISTEMA,
      tools: [],
      maxTurns: 1,
      settingSources: [],
      persistSession: false,
      thinking: { type: 'disabled' }
    }
  })
  try {
    for await (const m of q) {
      if (m.type !== 'result') continue
      if (m.subtype !== 'success' || m.is_error) throw new Error(m.subtype === 'success' ? m.result : m.subtype)
      const json = /\[[\s\S]*\]/.exec(m.result)?.[0]
      if (!json) throw new Error('no devolvió una lista')
      return (JSON.parse(json) as FuenteRadar[]).slice(0, 25)
    }
  } finally {
    q.close()
  }
  throw new Error('no devolvió nada')
}
