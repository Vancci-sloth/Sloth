import type { AgentEvent } from '../shared/types.ts'

/** Cuánto lleva el resumen, en letras: unos 7.000 tokens, que caben de sobra en el modelo más pequeño (131.072). */
const TOPE = 24_000
const POR_MENSAJE = 2_000
const ARCHIVOS = 30

const corto = (texto: string) => (texto.length > POR_MENSAJE ? `${texto.slice(0, POR_MENSAJE)}…` : texto)

/**
 * Lo que se le da a una sesión nueva cuando la anterior del agente ya no sirve (`relevar` en sessions.ts): sale del
 * historial de Sloth, sin gastar al modelo, porque la sesión vieja ya no contesta. Los mensajes del usuario y lo último que
 * dijo el agente en cada turno, sin sus errores. Siempre el primer mensaje, que es el encargo, y luego los más recientes.
 */
export function resumenDelHilo(events: AgentEvent[], carpeta?: string): string {
  const mensajes: string[] = []
  const archivos = new Set<string>()
  let dicho = ''
  let dichoId = ''
  const cerrar = (ok: boolean) => {
    if (ok && dicho.trim()) mensajes.push(`Tú: ${corto(dicho.trim())}`)
    dicho = dichoId = ''
  }
  for (const e of events) {
    if (e.t === 'user') {
      cerrar(true)
      mensajes.push(`Usuario: ${corto(e.text)}${e.images?.length ? `\n(Adjuntó: ${e.images.join(', ')})` : ''}`)
    } else if (e.t === 'text' && !e.parent) {
      if (e.id !== dichoId) dicho = ''
      dichoId = e.id
      dicho += e.delta
    } else if (e.t === 'turn_end') cerrar(e.ok)
    else if (e.t === 'tool' && !e.parent && /^(Edit|Write)$/.test(e.name)) {
      const ruta = (e.input as { file_path?: string } | null)?.file_path
      if (ruta) archivos.add(ruta)
    }
  }
  cerrar(false)
  const [primero, ...resto] = mensajes
  const recientes: string[] = []
  let letras = primero?.length ?? 0
  for (const m of resto.reverse()) {
    if (letras + m.length > TOPE) break
    letras += m.length
    recientes.unshift(m)
  }
  const omitidos = resto.length - recientes.length
  return [
    '(Tu sesión anterior ya no daba más y Sloth te abrió esta. Abajo está lo que se habló, resumido. Lo que hiciste sigue en los archivos: revísalos antes de rehacer nada.)',
    '<historial>',
    primero,
    ...(omitidos ? [`(${omitidos} mensajes omitidos)`] : []),
    ...recientes,
    ...(carpeta ? [`Carpeta del trabajo: ${carpeta}`] : []),
    ...(archivos.size ? [`Archivos que tocaste: ${[...archivos].slice(-ARCHIVOS).join(', ')}`] : []),
    '</historial>'
  ].filter(Boolean).join('\n\n')
}
