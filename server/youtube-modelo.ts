import type { Model } from '../shared/types.ts'

/** Las recomendaciones usan exclusivamente el modelo elegido en la revisión, validado contra el catálogo de Sloth. */
export function modeloYoutube(pedido: { model?: unknown; effort?: unknown }, modelos: Model[]): { model: string; effort?: string } {
  if (typeof pedido.model !== 'string' || !pedido.model) throw new Error('Elige el agente y modelo para las recomendaciones de YouTube.')
  const modelo = modelos.find((m) => m.id === pedido.model)
  if (!modelo) throw new Error('Ese modelo no está en el catálogo de Sloth. Actualiza la revisión y elige otro.')
  if (pedido.effort !== undefined && (typeof pedido.effort !== 'string' || !modelo.efforts.includes(pedido.effort))) throw new Error('Elige un esfuerzo que admita ese modelo.')
  return { model: modelo.id, effort: typeof pedido.effort === 'string' ? pedido.effort : modelo.defaultEffort }
}
