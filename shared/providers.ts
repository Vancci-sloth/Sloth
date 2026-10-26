/** Los ids de Codex llevan prefijo para no mezclar catálogos ni sesiones de proveedores. */
export const proveedorDe = (model: string): 'claude' | 'codex' => model.startsWith('codex:') ? 'codex' : 'claude'
