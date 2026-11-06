import type { Card, FuenteVoz, VozStudio } from './types.ts'

/**
 * Lo que comparten el servidor de la voz (`server/voz/`), su MCP y el compositor: la línea `Voz:` que lleva el primer
 * mensaje de un video, cómo se leen las voces del panel de AI Studio, cuándo un WAV bajado está entero y cómo se juntan
 * los trozos que dan Fish Audio y ElevenLabs.
 */

/** La guía que siguen las skills con la línea `Voz:` (en `SLOTH_SKILLS`). */
const GUIA = 'video-base/VOZ.md'

/** El nombre de cada motor que no es AI Studio, como se ve en Sloth. */
export const MOTORES: Record<FuenteVoz, string> = { fish: 'Fish Audio', elevenlabs: 'ElevenLabs', vc: 'Voices Cloning' }

/**
 * De qué motor es una voz: las de Fish Audio, ElevenLabs y Voices Cloning van con su prefijo (`fish:<id>`,
 * `elevenlabs:<id>`, `vc:<id>`); lo demás es el nombre de una voz de AI Studio (`Fola`).
 */
export function motorDe(voz: string): { motor: FuenteVoz | 'ai-studio'; id: string } {
  const m = /^(fish|elevenlabs|vc):(.+)$/.exec(voz.trim())
  return m ? { motor: m[1] as FuenteVoz, id: m[2] } : { motor: 'ai-studio', id: voz.trim() }
}

/**
 * La línea del primer mensaje con la voz elegida en el compositor. `voz`: una voz de AI Studio (su nombre) o de Fish
 * Audio o ElevenLabs (`fish:<id>`, y `nombre` el que se ve), que genera el agente; vacía, la manda el usuario. Un estilo
 * que hace la suya (`propia`, el reel con edge-tts) no lleva línea si no eliges otra. Sin elección posible (`voz: false`,
 * el documental), tampoco.
 */
export function lineaVoz(card: Pick<Card, 'voz'>, voz: string, nombre?: string): string {
  if (card.voz === false) return ''
  if (!voz) return card.voz?.propia ? '' : `Voz: la manda el usuario; no la generes (${GUIA}).`
  const { motor } = motorDe(voz)
  if (motor === 'ai-studio') return `Voz: genérala tú en AI Studio con la voz ${voz} (cómo, en ${GUIA}).`
  return `Voz: genérala tú con ${MOTORES[motor]}, voz «${nombre || voz}»: en generar_voz pon la voz ${voz} (cómo, en ${GUIA}).`
}

/**
 * Parte lo que se narra en trozos de hasta `max` letras, por párrafos (y, si uno no cabe, por frases), para las API
 * que no aceptan un guion entero en un pedido.
 */
export function trozosParaVoz(texto: string, max: number): string[] {
  const piezas = texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length <= max ? [p] : (p.match(/[^.!?…]+(?:[.!?…]+["»”)]*\s*|$)/g) ?? [p]).map((f) => f.trim()).filter(Boolean)))
  const trozos: string[] = []
  for (const p of piezas) {
    const ultimo = trozos.at(-1)
    if (ultimo && ultimo.length + 2 + p.length <= max) trozos[trozos.length - 1] = `${ultimo}\n\n${p}`
    else for (let i = 0; i < p.length; i += max) trozos.push(p.slice(i, i + max))
  }
  return trozos
}

/** El audio de un WAV PCM: su formato y sus muestras. Un WAV de una API que se manda a trozos no dice su tamaño: se toma hasta el final. */
export function pcmDeWav(b: Uint8Array): { frecuencia: number; canales: number; bits: number; datos: Uint8Array } | null {
  if (b.length < 44) return null
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const txt = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])
  if (txt(0) !== 'RIFF' || txt(8) !== 'WAVE') return null
  let formato: { frecuencia: number; canales: number; bits: number } | null = null
  for (let o = 12; o + 8 <= b.length; ) {
    const tam = v.getUint32(o + 4, true)
    if (txt(o) === 'fmt ') formato = { canales: v.getUint16(o + 10, true), frecuencia: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) }
    // Uno que se manda a trozos dice 0 o el máximo: se toma hasta el final.
    if (txt(o) === 'data') return formato && { ...formato, datos: b.subarray(o + 8, tam && o + 8 + tam <= b.length ? o + 8 + tam : b.length) }
    o += 8 + tam + (tam % 2)
  }
  return null
}

/** Un WAV PCM con estas muestras seguidas, y `silencio` segundos callados entre una y otra. */
export function wavDePcm(trozos: Uint8Array[], frecuencia: number, canales = 1, bits = 16, silencio = 0): Uint8Array<ArrayBuffer> {
  const porMuestra = canales * (bits / 8)
  const callado = new Uint8Array(Math.round(silencio * frecuencia) * porMuestra)
  const partes = trozos.flatMap((t, i) => (i ? [callado, t] : [t]))
  const tam = partes.reduce((s, p) => s + p.length, 0)
  const wav = new Uint8Array(44 + tam)
  const v = new DataView(wav.buffer)
  const poner = (o: number, s: string) => [...s].forEach((c, i) => (wav[o + i] = c.charCodeAt(0)))
  poner(0, 'RIFF')
  v.setUint32(4, 36 + tam, true)
  poner(8, 'WAVE')
  poner(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, canales, true)
  v.setUint32(24, frecuencia, true)
  v.setUint32(28, frecuencia * porMuestra, true)
  v.setUint16(32, porMuestra, true)
  v.setUint16(34, bits, true)
  poner(36, 'data')
  v.setUint32(40, tam, true)
  let o = 44
  for (const p of partes) wav.set(p, o), (o += p.length)
  return wav
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
