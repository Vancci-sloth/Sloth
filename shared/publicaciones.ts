import type { Card } from './types'

/**
 * «Organizar en chat», en la revisión de YouTube: un chat con tu agente para mejorar títulos, descripciones y el calendario
 * de los videos que elegiste. No es un estilo ni hace videos, así que no sale en el inicio; trabaja en
 * `<trabajo>/organizar-publicaciones` y cambia los borradores por la API de YouTube de Sloth.
 */
export const PUBLICACIONES_CARD: Card = {
  id: 'organizar-publicaciones',
  title: 'Organizar publicaciones',
  description: 'Prepara títulos, descripciones y un calendario con tu agente.',
  icon: 'hilo',
  cwd: '',
}
