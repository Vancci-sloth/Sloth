/**
 * El Markdown de lo que escribe el agente, con los mismos tokens que la computadora (`marked`), dibujado con vistas de
 * React Native: el HTML no se interpreta, sale como texto.
 */
import { memo, type ReactNode } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { marked, type Token, type Tokens } from 'marked'
import { c, mono } from './tema'

export const Markdown = memo(function Markdown({ texto, color = c.text }: { texto: string; color?: string }) {
  const tokens = marked.lexer(texto)
  return <View style={s.raiz}>{tokens.map((t, i) => bloque(t, i, color))}</View>
})

function bloque(t: Token, k: number, color: string): ReactNode {
  switch (t.type) {
    case 'space':
      return null
    case 'heading':
      return (
        <Text key={k} style={[s.titulo, { color, fontSize: t.depth <= 1 ? 20 : t.depth === 2 ? 17.5 : 15.5 }]}>
          {enLinea((t as Tokens.Heading).tokens, color)}
        </Text>
      )
    case 'paragraph':
      return (
        <Text key={k} style={[s.parrafo, { color }]} selectable>
          {enLinea((t as Tokens.Paragraph).tokens, color)}
        </Text>
      )
    case 'code':
      return (
        <View key={k} style={s.codigo}>
          <Text style={s.codigoTexto} selectable>
            {(t as Tokens.Code).text}
          </Text>
        </View>
      )
    case 'blockquote':
      return (
        <View key={k} style={s.cita}>
          {(t as Tokens.Blockquote).tokens.map((x, i) => bloque(x, i, c.suave))}
        </View>
      )
    case 'list': {
      const l = t as Tokens.List
      return (
        <View key={k} style={s.lista}>
          {l.items.map((item, i) => (
            <View key={i} style={s.item}>
              <Text style={[s.vineta, { color: c.muted }]}>{item.task ? (item.checked ? '[x]' : '[ ]') : l.ordered ? `${Number(l.start || 1) + i}.` : '•'}</Text>
              <View style={{ flex: 1 }}>{item.tokens.map((x, j) => (x.type === 'text' ? <Text key={j} style={[s.parrafo, { color }]} selectable>{enLinea((x as Tokens.Text).tokens ?? [x], color)}</Text> : bloque(x, j, color)))}</View>
            </View>
          ))}
        </View>
      )
    }
    case 'table': {
      const tabla = t as Tokens.Table
      return (
        <View key={k} style={s.tabla}>
          {[tabla.header, ...tabla.rows].map((fila, i) => (
            <View key={i} style={[s.fila, i === 0 && s.filaCabeza]}>
              {fila.map((celda, j) => (
                <Text key={j} style={[s.celda, { color }, i === 0 && s.negrita]}>
                  {enLinea(celda.tokens, color)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )
    }
    case 'hr':
      return <View key={k} style={s.raya} />
    case 'text':
      return (
        <Text key={k} style={[s.parrafo, { color }]} selectable>
          {enLinea((t as Tokens.Text).tokens ?? [t], color)}
        </Text>
      )
    default:
      return 'raw' in t && t.raw.trim() ? (
        <Text key={k} style={[s.parrafo, { color }]} selectable>
          {t.raw}
        </Text>
      ) : null
  }
}

function enLinea(tokens: Token[] | undefined, color: string): ReactNode {
  return (tokens ?? []).map((t, k) => {
    switch (t.type) {
      case 'strong':
        return <Text key={k} style={s.negrita}>{enLinea((t as Tokens.Strong).tokens, color)}</Text>
      case 'em':
        return <Text key={k} style={s.cursiva}>{enLinea((t as Tokens.Em).tokens, color)}</Text>
      case 'del':
        return <Text key={k} style={s.tachado}>{enLinea((t as Tokens.Del).tokens, color)}</Text>
      case 'codespan':
        return <Text key={k} style={s.codigoLinea}>{(t as Tokens.Codespan).text}</Text>
      case 'br':
        return '\n'
      case 'link': {
        const l = t as Tokens.Link
        const web = /^https?:\/\//.test(l.href)
        return (
          <Text key={k} style={s.enlace} onPress={web ? () => void Linking.openURL(l.href) : undefined}>
            {enLinea(l.tokens, color)}
          </Text>
        )
      }
      case 'image':
        return <Text key={k} style={s.enlace}>{(t as Tokens.Image).text || 'imagen'}</Text>
      case 'escape':
      case 'text':
      case 'html':
        return 'tokens' in t && t.tokens?.length ? enLinea(t.tokens as Token[], color) : decodificar((t as Tokens.Text).text)
      default:
        return 'raw' in t ? t.raw : null
    }
  })
}

/** `marked` deja las entidades de HTML escapadas en el texto (`&amp;`, `&quot;`). */
const decodificar = (x: string) => x.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e] ?? _)

const s = StyleSheet.create({
  raiz: { gap: 8 },
  titulo: { fontWeight: '700', marginTop: 4 },
  parrafo: { fontSize: 15, lineHeight: 22 },
  negrita: { fontWeight: '700' },
  cursiva: { fontStyle: 'italic' },
  tachado: { textDecorationLine: 'line-through' },
  codigoLinea: { fontFamily: mono, fontSize: 13.5, color: c.amber2, backgroundColor: c.panel2 },
  codigo: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 8, padding: 10 },
  codigoTexto: { fontFamily: mono, fontSize: 12.5, color: c.text, lineHeight: 18 },
  cita: { borderLeftWidth: 3, borderLeftColor: c.line, paddingLeft: 10, gap: 6 },
  lista: { gap: 4 },
  item: { flexDirection: 'row', gap: 8 },
  vineta: { fontSize: 15, lineHeight: 22, minWidth: 14 },
  enlace: { color: c.amber, textDecorationLine: 'underline' },
  tabla: { borderWidth: 1, borderColor: c.line, borderRadius: 8, overflow: 'hidden' },
  fila: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.line },
  filaCabeza: { borderTopWidth: 0, backgroundColor: c.panel2 },
  celda: { flex: 1, padding: 6, fontSize: 13 },
  raya: { height: 1, backgroundColor: c.line, marginVertical: 4 }
})
