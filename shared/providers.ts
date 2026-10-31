/**
 * Los agentes con que trabaja Sloth. Claude va sin prefijo; los demás llevan el suyo en el id del modelo
 * (`codex:gpt-5.6`, `grok:grok-build`) para no mezclar catálogos ni sesiones de proveedores.
 */
export const PROVEEDORES = ['claude', 'codex', 'opencode', 'deepseek', 'grok', 'antigravity', 'cursor', 'muse', 'pi'] as const
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
  grok: 'Grok',
  antigravity: 'Antigravity',
  cursor: 'Cursor',
  muse: 'Muse Code',
  pi: 'Pi'
}

/** El programa que corre a cada agente: DeepSeek usa el mismo Claude Code, con otra API (`server/deepseek.ts`). */
export const programaDe = (p: Proveedor) => (p === 'deepseek' ? 'claude' : p)
export type Programa = Exclude<Proveedor, 'deepseek'>
