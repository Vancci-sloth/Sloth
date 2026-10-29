import type { Card, VozStudio } from './types.ts'

/**
 * Lo que comparten el servidor de la voz (`server/voz/`), su MCP y el compositor: la línea `Voz:` que lleva el primer
 * mensaje de un video, cómo se leen las voces del panel de AI Studio y cuándo un WAV bajado está entero.
 */

/** La guía que siguen las skills con la línea `Voz:` (en `SLOTH_SKILLS`). */
const GUIA = 'video-base/VOZ.md'

/**
 * La línea del primer mensaje con la voz elegida en el compositor. `voz`: el nombre de una voz de AI Studio, que genera
 * el agente; vacía, la manda el usuario. Un estilo que hace la suya (`propia`, el reel con edge-tts) no lleva línea si no
 * eliges AI Studio. Sin elección posible (`voz: false`, el documental), tampoco.
 */
export function lineaVoz(card: Pick<Card, 'voz'>, voz: string): string {
  if (card.voz === false) return ''
  if (voz) return `Voz: genérala tú en AI Studio con la voz ${voz} (cómo, en ${GUIA}).`
  return card.voz?.propia ? '' : `Voz: la manda el usuario; no la generes (${GUIA}).`
}

/**
 * Las voces del panel «Speaker settings» de AI Studio, de su texto (`innerText`): cada grupo es un renglón seguido de
 * «View all N», y cada voz, su nombre y debajo cómo suena («Clear and friendly. · Medium pitch»). La que está puesta
 * lleva «Current» entre los dos. Lo de arriba («Current voice», los filtros) no es de ningún grupo y no cuenta.
 */
export function vocesDelPanel(texto: string): VozStudio[] {
  const r = texto.split('\n').map((l) => l.trim()).filter(Boolean)
  const voces: VozStudio[] = []
  const vistas = new Set<string>()
  let grupo = ''
  for (let i = 0; i < r.length; i++) {
    if (/^View all \d+$/i.test(r[i + 1] ?? '')) {
      grupo = r[i]
      continue
    }
    if (!grupo || r[i] === 'Current' || !/^[\p{L}][\p{L}\p{N}' -]*$/u.test(r[i])) continue
    const desc = r[i + 1] === 'Current' ? r[i + 2] : r[i + 1]
    if (!desc || !/·.*pitch/i.test(desc) || vistas.has(r[i])) continue
    vistas.add(r[i])
    voces.push({ nombre: r[i], descripcion: desc.replace(/\.\s*·/, ' ·'), grupo })
  }
  return voces
}

/**
 * Los segundos de un WAV PCM si está entero (el tamaño que dice su cabecera RIFF es el del archivo), o `null`: aún se
 * está escribiendo, o no es un WAV. Se miden con la frecuencia y el tamaño de cada muestra: el de AI Studio dice el
 * doble de bytes por segundo de los que lleva.
 */
export function segundosWav(b: Uint8Array): number | null {
  if (b.length < 44) return null
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const txt = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])
  if (txt(0) !== 'RIFF' || txt(8) !== 'WAVE' || v.getUint32(4, true) + 8 !== b.length) return null
  let porSegundo = 0
  for (let o = 12; o + 8 <= b.length; ) {
    const tam = v.getUint32(o + 4, true)
    if (txt(o) === 'fmt ') porSegundo = v.getUint32(o + 12, true) * v.getUint16(o + 20, true)
    if (txt(o) === 'data') return porSegundo ? tam / porSegundo : null
    o += 8 + tam + (tam % 2)
  }
  return null
}

/**
 * Lo que se narra de un guion en Markdown, como lo copia «Copiar» de Sloth: sin títulos, encabezados ni comentarios, y
 * cada párrafo en un renglón.
 */
export function textoParaVoz(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#+ .*$/gm, '')
    .split(/\n\s*\n/)
    .map((p) => p.split(/\s+/).join(' ').trim())
    .filter(Boolean)
    .join('\n\n')
}
