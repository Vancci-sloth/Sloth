/** Las etiquetas del compositor y de la burbuja: hilos, enlaces, citas y «Nuevo diseño». Viven aparte para que Composer.tsx solo exporte componentes. */

/** La referencia a otro hilo que copia el menú de la barra lateral. Al agente le llega tal cual; a la vista, como etiqueta. */
export function threadRef(title: string, id: string, app: string): string {
  return `Hilo de Sloth «${title}» (id ${id}), su historial está en ${app}\\data\\sessions\\${id}.jsonl`
}
export const THREAD = /Hilo de Sloth «(.*?)» \(id \w+\), su historial está en [^\n]*?\.jsonl/

/** El globo de diálogo que distingue la etiqueta de un hilo cuando ya no se sabe de qué card es (hilo borrado). */
export const THREAD_ICON = 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'

/** Un enlace. Acaba en algo que no sea puntuación, para no tragarse el punto o el paréntesis de la frase. */
export const LINK = /https?:\/\/[^\s<>"'«»]*[^\s<>"'«».,;:!?)\]]/

/** El eslabón de cadena que distingue la etiqueta de un enlace. */
export const LINK_ICON = 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'

/** El encargo de «＋ Crear skill», sobre las cards del inicio. Al agente le llega tal cual; a la vista, como la etiqueta «Nuevo diseño». */
export const DESIGN = 'Crea una skill nueva en ~/.claude/skills que'

/** El destello que distingue la etiqueta «Nuevo diseño». */
export const DESIGN_ICON = 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z'

/**
 * Una cita del chat, como en T3 Code: se elige texto de la conversación y entra al campo como etiqueta. Al agente le
 * llega como bloque `>` de Markdown en sus propias líneas, con una línea en blanco que la separa de lo que escribas.
 */
export function quoteRef(text: string): string {
  return `\n${text.trim().split('\n').map((l) => `> ${l}`.trimEnd()).join('\n')}\n\n`
}
/** El bloque `>` que deja `quoteRef`, para verlo otra vez como etiqueta en la burbuja. El grupo es el bloque. */
export const QUOTE = /(?:^|\n)((?:>[^\n]*(?:\n|$))+)\n?/

/** El texto citado, sin los `>` del principio de cada línea. */
export function quoteText(block: string): string {
  return block.replace(/\n$/, '').split('\n').map((l) => l.replace(/^> ?/, '')).join('\n')
}

/** Las comillas que distinguen la etiqueta de una cita. */
export const QUOTE_ICON =
  'M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2zM5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z'

/** El aviso con el que la conversación le pasa una cita al compositor. */
export const QUOTE_EVENT = 'sloth:cita'

/** La etiqueta «Nuevo diseño» en HTML, para empezar con ella un borrador. Guarda el encargo entero, que es lo que se manda. */
export function designChipHtml(): string {
  return `<span class="chip design-chip" contenteditable="false" data-ref="${DESIGN}" title="${DESIGN}"><svg class="chip-icon" viewBox="0 0 24 24"><path d="${DESIGN_ICON}"/></svg><span class="chip-name">Nuevo diseño</span></span>`
}

/** Lo que enseña la etiqueta de un enlace: el sitio, y el resto en gris. */
export function linkParts(url: string): [string, string] {
  try {
    const u = new URL(url)
    return [u.host.replace(/^www\./, ''), decodeURI(u.pathname + u.search + u.hash).replace(/\/$/, '')]
  } catch {
    return [url, '']
  }
}

/** El icono de la card de cada hilo, por id: el mismo que lleva en la barra lateral. Lo llena App. */
export const threadIcons = new Map<string, string>()
export const threadIconOf = (ref: string) => threadIcons.get(/\(id (\w+)\)/.exec(ref)?.[1] ?? '')

/** Una invocación al inicio del mensaje. Las rutas y los enlaces siguen siendo texto normal. */
export function invocacion(text: string): { nombre: string; tipo: string; inicio: number } | undefined {
  const match = /^[ \t]*(\/[a-z][a-z0-9-]*)(?=\s|$)/i.exec(text)
  if (!match) return
  const nombre = match[1]
  return { nombre, tipo: nombre === '/compact' ? 'Comando' : 'Skill', inicio: match[0].length - nombre.length }
}

/** El símbolo de Claude de un hilo abre «Pedir una mejora» (`PedirMejora.tsx`) con el hilo y lo que pasó en él. */
export const MEJORA_EVENT = 'sloth:pedir-mejora'
export const pedirMejora = (detalle: { hilo: string; cita?: string }) => dispatchEvent(new CustomEvent(MEJORA_EVENT, { detail: detalle }))
