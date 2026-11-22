export const APARTADOS_REDES = {
  produccion: 'Producción',
  ideas: 'Ideas',
  publicaciones: 'Publicaciones',
  calendario: 'Calendario',
  cuentas: 'Cuentas'
} as const

export type ApartadoRedes = keyof typeof APARTADOS_REDES

export function apartadoRedes(apartado?: string): ApartadoRedes {
  return apartado && Object.hasOwn(APARTADOS_REDES, apartado) ? apartado as ApartadoRedes : 'produccion'
}

export function rutaRedes(apartado: ApartadoRedes = 'produccion', canalId?: string) {
  if (apartado === 'produccion') return '#/redes'
  return `#/redes/${apartado}${apartado === 'ideas' && canalId ? `/${canalId}` : ''}`
}
