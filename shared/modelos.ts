/**
 * El modelo de un hilo nuevo y el de sus subagentes, igual en la computadora (`web/src/Modelos.tsx`) y en el celular
 * (`movil/`). «Optimizado» usa lo medido para la card; sin medir, lo último que elegiste a mano. «Avanzado» deja elegirlo.
 */
import type { Model, ModelosConf, ModeloTarea } from './types.ts'
import { proveedorDe, type Proveedor } from './providers.ts'

/** Un modelo del catálogo con su esfuerzo. */
export interface Choice {
  model: string
  effort?: string
}

/** Sin medir y sin nada elegido a mano, el hilo va en Opus con esfuerzo alto: lo mejor en las dos skills que se midieron. */
const POR_DEFECTO: ModeloTarea = { model: 'claude-opus-5-5', effort: 'high' }
/** Con ChatGPT y sin Claude, la card va en «Avanzado» con GPT-6.1 Terra en medio, mientras no elijas otro. */
export const CON_CHATGPT: Avanzado = { principal: { model: 'codex:gpt-6.1-terra', effort: 'medium' }, tareas: {} }
/**
 * Sin Claude ni ChatGPT, el modelo gratis de OpenCode con que va un hilo nuevo: el que mejor siguió las skills en las
 * pruebas, si sigue en el catálogo (cambia solo); si no, el primero.
 */
const OPENCODE_PRIMERO = 'opencode:opencode/big-pickle'
export function conOpenCode(models: Model[]): Avanzado | undefined {
  const gratis = models.filter((m) => proveedorDe(m.id) === 'opencode' && !m.precio)
  const m = gratis.find((x) => x.id === OPENCODE_PRIMERO) ?? gratis[0]
  return m && { principal: { model: m.id }, tareas: {} }
}
/** Con otro agente (Grok, Cursor…) y sin Claude, ChatGPT ni OpenCode: su primer modelo, con su esfuerzo de siempre. */
export function conPrimero(models: Model[], p: Proveedor): Avanzado | undefined {
  const m = models.find((x) => proveedorDe(x.id) === p)
  return m && { principal: { model: m.id, effort: m.defaultEffort }, tareas: {} }
}

/** Lo que el usuario cambió en «Avanzado». Sin esto, la card va en «Optimizado». */
export type Avanzado = { principal?: Choice; tareas: Record<string, { model: string; effort: string }> }
export type Tarea = { nombre: string; para: string; model: string; effort: string; medido?: string }

/**
 * El modelo del hilo y el de cada subagente, según el modo. En «Optimizado», el hilo va en lo medido para la card; sin
 * medir (o si el catálogo no lo trae), en `ultimo`, lo último que elegiste a mano; y si nunca elegiste, en `POR_DEFECTO`.
 */
export function elegirModelos(conf: ModelosConf | undefined, models: Model[], avanzado: Avanzado | undefined, ultimo?: Choice) {
  const optimo =
    (conf?.principal && valido(models, conf.principal)) ||
    (ultimo && valido(models, ultimo)) ||
    valido(models, POR_DEFECTO) ||
    (models[0] && valido(models, { model: models[0].id }))
  const choice = (avanzado?.principal && valido(models, avanzado.principal)) || optimo
  return { choice, tareas: subagentes(choice) }
}

/**
 * Los subagentes, en el modelo y el esfuerzo del hilo, con el alias que pide la herramienta Agent de Claude (`opus`,
 * `sonnet`, `haiku`, `fable`). Codex y OpenCode no lo leen: sus subagentes ya van en su modelo.
 */
export function subagentes(choice: Choice | undefined): Tarea[] {
  const alias = proveedorDe(choice?.model ?? '') === 'claude' && choice?.model.match(/claude-(opus|sonnet|haiku|fable)/)?.[1]
  return alias ? [{ nombre: 'todos', para: 'Captura, escenas, revisión y los demás', model: alias, effort: choice?.effort ?? '' }] : []
}

/** La línea que la skill lee para elegir el modelo de cada subagente: `Subagentes: todos = haiku high.` */
export const lineaSubagentes = (tareas: Tarea[]) => (tareas.length ? `Subagentes: ${tareas.map((t) => `${t.nombre} = ${t.model}${t.effort ? ` ${t.effort}` : ''}`).join('; ')}.` : '')

/**
 * Lo que cuesta y tarda un minuto de video con un modelo, de lo medido en la card (`porMinuto`): «$0.45 · 4 min». Con
 * `effort`, solo lo medido con ese esfuerzo; sin él, con su esfuerzo de siempre o, si no se midió así, con el que se
 * midió, que entonces se nombra. Sin medir, nada.
 */
export function textoPorMinuto(conf: ModelosConf | undefined, model: string, effort?: string, deSiempre?: string): string | undefined {
  const medidas = (conf?.porMinuto ?? []).filter((p) => p.model === model.replace('[1m]', ''))
  const exacta = medidas.find((p) => p.effort === (effort ?? deSiempre))
  const p = exacta ?? (effort ? undefined : medidas.sort((a, b) => a.usd - b.usd)[0])
  return p && `${exacta ? '' : `${p.effort} · `}$${p.usd.toFixed(2)} · ${Math.max(1, Math.round(p.minutos))} min`
}

/** Un modelo del catálogo con un esfuerzo que admite. Una elección vieja guardada puede decir `claude-opus-5-5[1m]`: es el mismo. */
export function valido(models: Model[], c: { model: string; effort?: string }): Choice | undefined {
  const m = models.find((x) => x.id === c.model.replace('[1m]', ''))
  if (!m) return undefined
  return { model: m.id, effort: m.efforts.includes(c.effort ?? '') ? c.effort : m.defaultEffort }
}

/** Los modelos del catálogo por agente, en el orden del menú: los gratis antes que los de pago. */
export function gruposModelos(models: Model[]) {
  return [
    { id: 'claude', label: 'Anthropic' },
    { id: 'codex', label: 'OpenAI' },
    { id: 'opencode', label: 'OpenCode · gratis' },
    // Los de pago de OpenCode, debajo de los gratis: se cobran del saldo de la cuenta.
    { id: 'opencode', label: 'OpenCode · de pago (de tu saldo, por millón de tokens)', pago: true },
    { id: 'deepseek', label: 'DeepSeek · beta' },
    { id: 'freellmapi', label: 'FreeLLMAPI · beta · gratis' },
    { id: 'openrouter', label: 'OpenRouter · beta · gratis' },
    { id: 'openrouter', label: 'OpenRouter · beta · de pago (de tus créditos, por millón de tokens)', pago: true },
    { id: 'grok', label: 'Grok · beta' },
    { id: 'antigravity', label: 'Antigravity · beta' },
    { id: 'gemini', label: 'Gemini · beta' },
    { id: 'cursor', label: 'Cursor' },
    { id: 'muse', label: 'Muse Code (Meta)' },
    { id: 'pi', label: 'Pi · beta · gratis' },
    { id: 'pi', label: 'Pi · beta · de pago (por millón de tokens)', pago: true },
  ].map((p) => ({
    // Con su logo en la lista (`Picker`): de un vistazo se ve de quién es cada modelo.
    proveedor: p.id as Proveedor,
    label: p.label,
    options: models
      .filter((m) => proveedorDe(m.id) === p.id && !!m.precio === !!p.pago)
      .map((m) => ({ value: m.id, label: m.precio ? `${m.label} · ${m.precio}` : m.label })),
  })).filter((g) => g.options.length > 0)
}
