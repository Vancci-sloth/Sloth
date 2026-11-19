/**
 * Los agentes con que trabaja Sloth. Claude va sin prefijo; los demás llevan el suyo en el id del modelo
 * (`codex:gpt-5.6`, `grok:grok-build`) para no mezclar catálogos ni sesiones de proveedores.
 */
export const PROVEEDORES = ['claude', 'codex', 'opencode', 'deepseek', 'openrouter', 'freellmapi', 'grok', 'antigravity', 'gemini', 'cursor', 'muse', 'pi'] as const
export type Proveedor = (typeof PROVEEDORES)[number]

export const proveedorDe = (model: string): Proveedor => {
  const p = model.split(':', 1)[0] as Proveedor
  return model.includes(':') && PROVEEDORES.includes(p) ? p : 'claude'
}

/**
 * Cómo se le dice a cada proveedor donde se habla de quien te ayuda, de tu plan o de tu cuenta: Codex corre con la cuenta
 * de ChatGPT. En el selector de modelos sigue siendo «Codex».
 */
export const NOMBRE_AGENTE: Record<Proveedor, string> = {
  claude: 'Claude',
  codex: 'ChatGPT',
  opencode: 'OpenCode',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
  freellmapi: 'FreeLLMAPI',
  grok: 'Grok',
  antigravity: 'Antigravity',
  gemini: 'Gemini',
  cursor: 'Cursor',
  muse: 'Muse Code',
  pi: 'Pi'
}

/** Los que no traen programa: trabajan en el Claude Code de Sloth, con otra API (`server/otra-api.ts`). */
const EN_CLAUDE = ['deepseek', 'openrouter', 'freellmapi'] as const
export type Programa = Exclude<Proveedor, (typeof EN_CLAUDE)[number]>

/** El programa que corre a cada agente: DeepSeek, OpenRouter y FreeLLMAPI usan el mismo Claude Code. */
export const programaDe = (p: Proveedor): Programa => ((EN_CLAUDE as readonly Proveedor[]).includes(p) ? 'claude' : (p as Programa))
