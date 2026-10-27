/** Los ids de Codex llevan prefijo para no mezclar catálogos ni sesiones de proveedores. */
export const proveedorDe = (model: string): 'claude' | 'codex' => model.startsWith('codex:') ? 'codex' : 'claude'

/**
 * Cómo se le dice a cada proveedor donde se habla de quien te ayuda, de tu plan o de tu cuenta: Codex corre con la cuenta
 * de ChatGPT. En el selector de modelos sigue siendo «Codex».
 */
export const NOMBRE_AGENTE = { claude: 'Claude', codex: 'ChatGPT' } as const
