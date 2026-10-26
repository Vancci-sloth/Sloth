import { marked, type Tokens } from 'marked'

/**
 * Markdown a HTML, sin HTML crudo. Lo que se dibuja lo escribe un agente que lee páginas de fuera (y en Ideas cita
 * comentarios de YouTube): un `<img onerror>` copiado tal cual correría en esta página, que puede usar la API de Sloth.
 * Por eso el HTML del texto sale escrito, salvo unas pocas etiquetas sin atributos, y los enlaces no pueden ejecutar nada.
 */
const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const INOFENSIVAS = /&lt;(\/?)(br|kbd|sub|sup|b|i|em|strong|u|s|mark|details|summary)\s*\/?&gt;/gi
/** Sin esquema (relativa, `#ancla`), una letra de unidad (`C:\…`), o web y correo. */
const segura = (href: string) => {
  const limpia = href.replace(/[\u0000-\u0020]/g, '').toLowerCase()
  return !/^[a-z][a-z0-9+.-]+:/.test(limpia) || /^(https?|mailto):/.test(limpia)
}

marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    html: ({ text }: Tokens.HTML | Tokens.Tag) => escapar(text).replace(INOFENSIVAS, '<$1$2>'),
    link(token: Tokens.Link) {
      return segura(token.href) ? false : this.parser.parseInline(token.tokens)
    },
    image: (token: Tokens.Image) => (segura(token.href) ? false : escapar(token.text))
  }
})

export const markdown = (texto: string) => marked.parse(texto, { async: false }) as string

/**
 * El mismo HTML que `markdown`, partido en sus bloques (párrafos, listas, código…). Un mensaje que el agente aún escribe
 * solo cambia en el último: el chat pinta cada bloque una vez y rehace solo ese (`Timeline.tsx`).
 */
export function bloquesDeMarkdown(texto: string): string[] {
  const tokens = marked.lexer(texto)
  // Cada bloque con las definiciones de enlaces del texto entero (`[uno][1]` … `[1]: https://…`).
  return tokens.flatMap((t) => (t.type === 'space' ? [] : [marked.parser(Object.assign([t], { links: tokens.links }))]))
}
