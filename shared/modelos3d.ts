import type { Card } from './types.ts'

/**
 * Los hilos de «Nuevo modelo» (en «Modelos 3D»): una card que no sale en el inicio, como las de Ideas. Cada hilo trabaja
 * en su propia carpeta (`server/modelos3d-acciones.ts`), así que no lleva `cwd`.
 */
export const MODELO3D_CARD: Card = {
  id: 'modelo-3d',
  title: 'Modelo 3D',
  description: 'Un modelo 3D nuevo para la biblioteca, hecho a partir de lo que describes.',
  skill: 'modelos-3d',
  icon: 'cubo',
  cwd: ''
}
