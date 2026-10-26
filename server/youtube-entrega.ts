import type { AgentEvent } from '../shared/types.ts'

/** Recupera entregas editoriales de archivos y mensajes, sin confundirlas con los rótulos del montaje. */
export function textosDeEntrega(events: AgentEvent[]): string[] {
  const mensajes = new Map<string, string>()
  for (const e of events) if (e.t === 'text' && !e.parent) mensajes.set(e.id, (mensajes.get(e.id) ?? '') + e.delta)
  return [...mensajes.values()].filter((s) => /t[ií]tulo|miniatura|thumbnail/i.test(s)).slice(-15)
}

export function leerEntrega(texto: string) {
  const seccion = (patron: string) => new RegExp(`^#{1,6}[^\\n]*${patron}[^\\n]*\\n([\\s\\S]*?)(?=^#{1,6} |$(?![\\s\\S]))`, 'im').exec(texto)?.[1]?.trim() ?? ''
  const limpio = (s: string) => {
    const citado = /^(?:«([^»]+)»|“([^”]+)”|"([^"\n]+)"|\*\*([^*\n]+)\*\*)/.exec(s.trim())
    return (citado?.slice(1).find(Boolean) ?? s.replace(/\*\*/g, '').replace(/^[>\s]+/, '').trim()).trim()
  }
  const titulos = seccion('t[ií]tulos?')
  const lineas = [...texto.matchAll(/^\s*(?:[-*]\s+)?(?:\*\*)?T[ií]tulo( (?:recomendado|propuesto|para YouTube|de YouTube))?(?:\s*\([^\n)]*\))?(?:\*\*)?\s*:(?:\*\*)?\s*(.+)$/gim)]
  const inline = [...lineas].sort((a, b) => Number(!!b[1]) - Number(!!a[1])).map((m) => limpio(m[2])).find((s) => s && [...s].length <= 100)
  const titulo = inline ?? limpio((titulos.split('\n').find((s) => s.trim()) ?? '').replace(/^\d+[.)]\s+/, ''))
  const alternativas = [...`${titulos}\n${seccion('alternativas')}`.matchAll(/^\d+[.)]\s+(\*\*[^*\n]+\*\*|«[^»]+»|“[^”]+”)/gm)].map((m) => limpio(m[1])).filter((s) => s !== titulo && [...s].length <= 100).slice(0, 4)
  const descripcion = seccion('descripci[oó]n') || /^\s*(?:[-*]\s+)?\*\*(?:Primera l[ií]nea de la )?[Dd]escripci[oó]n[^:\n]*:\*\*\s*([\s\S]*?)(?=\n\s*[-*] \*\*|\n#{1,6} |$(?![\s\S]))/m.exec(texto)?.[1]?.trim() || ''
  const miniaturas = [...texto.matchAll(/^\s*(?:[-*]\s+)?(?:\*\*)?[Mm]iniatura(?: recomendada)?(?:\*\*)?\s*:(?:\*\*)?\s*([\s\S]*?)(?=\n\s*[-*] \*\*|\n#{1,6} |$(?![\s\S]))/gm)]
  const miniatura = seccion('miniatura') || miniaturas.at(-1)?.[1]?.trim() || ''
  return { titulo: titulo && [...titulo].length <= 100 ? titulo : '', alternativas, descripcion, miniatura: miniatura.slice(0, 12_000) }
}
