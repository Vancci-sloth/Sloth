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

/**
 * Lo que la revisión le contesta a su autor cuando a su estilo le falta algo para aprobarse: un comentario del creador en
 * su publicación (`respuestaAlAutor` en `server/estilos-revision.ts`). La app de su autor lo vuelve a leer de ahí
 * (`faltaDeRespuesta`) para decírselo donde lo ve, con su lista: en el menú, en un aviso y en su estilo
 * (`web/src/EstiloRevisado.tsx`). Así empieza desde que hay revisión (19 de noviembre de 2026): cambiar estas frases
 * deja sin aviso a quien ya tiene su respuesta.
 */
export const DE_LA_REVISION = 'Revisión automática de Sloth:'
export const cabezaDeFalta = (titulo: string) => `${DE_LA_REVISION} a «${titulo}» le falta esto para aprobarse:`
export const CABEZA_SUGERENCIAS = 'De paso, esto no lo frena, pero lo mejora:'
const ES_FALTA = /^Revisión automática de Sloth: a «.*» le falta esto para aprobarse:$/

/**
 * Lo que pide una respuesta de la revisión: lo que frena (`falta`) y lo que solo lo mejora (`sugerencias`), cada cosa
 * como la dijo. Nada si el texto no es un «le falta» (otro comentario, o la revisión diciendo que se aprobó).
 */
export function faltaDeRespuesta(texto: string): { falta: string[]; sugerencias: string[] } | undefined {
  const [cabeza = '', ...lineas] = texto.replace(/\r\n/g, '\n').trim().split('\n')
  if (!ES_FALTA.test(cabeza.trim())) return undefined
  const r = { falta: [] as string[], sugerencias: [] as string[] }
  let en: keyof typeof r | undefined = 'falta'
  // El renglón de antes era de la lista: lo que siga sin su guion es su continuación.
  let pegado = false
  for (const cruda of lineas) {
    const l = cruda.trim()
    if (!l) pegado = false
    else if (l === CABEZA_SUGERENCIAS) (en = 'sugerencias'), (pegado = false)
    else if (l.startsWith('- ')) {
      if (en) r[en].push(l.slice(2).trim())
      pegado = !!en
    } else if (pegado && en) r[en][r[en].length - 1] += ` ${l}`
    // Otro párrafo («Arréglalo…», «Si algo no aplica…»): esa lista se acabó.
    else en = undefined
  }
  return r
}
