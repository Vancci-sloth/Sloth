import type { Card } from './types.ts'

/**
 * Los hilos que revisan un estilo de la comunidad antes de aprobarlo (`server/estilos-revision.ts`): una card que no sale
 * en el inicio, como las de Ideas, y solo en la computadora del creador. Su agente solo puede leer (`soloLeer`).
 */
export const REVISION_CARD: Card = {
  id: 'revision-estilo',
  title: 'Revisión de un estilo',
  description: 'Lo que dice tu agente de un estilo de la comunidad antes de que lo apruebes.',
  icon: 'escudo',
  cwd: ''
}
