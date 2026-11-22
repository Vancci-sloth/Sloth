/**
 * Cuándo se cierra la app (`candado.ts`), sin nada de React Native para probarla con Node. Lo que dijo el cobro la última
 * vez (`licencias/src/celular.ts`): si `cobra`, abre solo a quien `apoya` y mientras no pase `hasta` sin volver a
 * preguntar. Si nunca contestó, abre: el candado solo cierra cuando el cobro lo pidió.
 */
export interface Sabido {
  cobra?: boolean
  apoya?: boolean
  hasta?: string
}

export function cerrada(s: Sabido | null | undefined, ahora: number): boolean {
  if (!s?.cobra) return false
  return !(s.apoya && s.hasta && Date.parse(s.hasta) > ahora)
}
