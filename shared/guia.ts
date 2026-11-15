import type { GuiaEstilo } from './types.ts'

/**
 * La guía de uso de un estilo: la plantilla que se llena al compartirlo en la comunidad, igual para todos, para que
 * quien lo instala sepa cómo usarlo sin adivinar. Va junto a lo que hace (el texto de su publicación, la `description`
 * de su card). La llena quien lo comparte (`CompartirEstilo` en `web/src/Estilos.tsx`), ya escrita si «Nuevo estilo» la
 * dejó en su card; el Worker no publica un estilo sin ella (`estiloEnSuSitio` en `licencias/src/comunidad.ts`), y al
 * instalarlo queda en su card, a la vista donde se usa (`web/src/Guia.tsx`).
 */
export const CAMPOS_GUIA: { id: keyof GuiaEstilo; titulo: string; pista: string; max: number; opcional?: true }[] = [
  { id: 'das', titulo: 'Qué le das', pista: 'Lo que pones tú cada vez. Por ejemplo: solo el tema; la voz la grabas cuando te da el guion.', max: 200 },
  { id: 'entrega', titulo: 'Qué te entrega', pista: 'Por ejemplo: un video de 30 a 60 segundos, vertical u horizontal, con su portada.', max: 200 },
  { id: 'ejemplo', titulo: 'Ejemplo de lo que le escribes', pista: 'Un mensaje listo para mandar. Por ejemplo: Hazme un video de por qué el cielo es azul.', max: 400 },
  { id: 'necesita', titulo: 'Qué necesita', pista: 'Lo que hace falta aparte de Sloth, si algo. Por ejemplo: Google Flow con créditos, o fotos tuyas.', max: 200, opcional: true }
]

/** Lo menos que dice un campo obligatorio: con menos, no explica nada. */
const MINIMO = 8

/** La guía limpia: cada campo recortado a su tope, sin los vacíos. Sin ningún campo, nada. */
export function guiaDe(valor: unknown): GuiaEstilo | undefined {
  if (!valor || typeof valor !== 'object') return
  const g: Record<string, string> = {}
  for (const c of CAMPOS_GUIA) {
    const v = (valor as Record<string, unknown>)[c.id]
    const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, c.max) : ''
    if (t) g[c.id] = t
  }
  return Object.keys(g).length ? (g as unknown as GuiaEstilo) : undefined
}

/** El título del primer campo obligatorio que falta o que no dice nada; '' si la guía está completa. */
export function faltaEnGuia(g: Partial<GuiaEstilo> | undefined): string {
  return CAMPOS_GUIA.find((c) => !c.opcional && (g?.[c.id] ?? '').trim().length < MINIMO)?.titulo ?? ''
}
