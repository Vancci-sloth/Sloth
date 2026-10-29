export type Proveedor = 'claude' | 'codex' | 'opencode'

/** Los ids de Codex y de OpenCode llevan prefijo para no mezclar catálogos ni sesiones de proveedores. */
export const proveedorDe = (model: string): Proveedor => (model.startsWith('codex:') ? 'codex' : model.startsWith('opencode:') ? 'opencode' : 'claude')

/**
 * Cómo se le dice a cada proveedor donde se habla de quien te ayuda, de tu plan o de tu cuenta: Codex corre con la cuenta
 * de ChatGPT. En el selector de modelos sigue siendo «Codex».
 */
export const NOMBRE_AGENTE = { claude: 'Claude', codex: 'ChatGPT', opencode: 'OpenCode' } as const
