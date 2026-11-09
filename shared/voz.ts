import type { Card, FuenteVoz, VozStudio } from './types.ts'

/**
 * Lo que comparten el servidor de la voz (`server/voz/`), su MCP y el compositor: la línea `Voz:` que lleva el primer
 * mensaje de un video, cómo se leen las voces del panel de AI Studio, cuándo un WAV bajado está entero y cómo se juntan
 * los trozos que dan Fish Audio y ElevenLabs.
 */

/** La guía que siguen las skills con la línea `Voz:` (en `SLOTH_SKILLS`). */
const GUIA = 'video-base/VOZ.md'

/** El nombre de cada motor que no es AI Studio, como se ve en Sloth. */
export const MOTORES: Record<FuenteVoz, string> = { fish: 'Fish Audio', elevenlabs: 'ElevenLabs', vc: 'Sloth' }

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
 * La línea de la música de fondo, encendida en el menú «Voz»: solo en las cards cuyo estilo la sabe poner (`musica`).
 * Apagada, no lleva línea y el video sale sin música.
 */
export function lineaMusica(card: Pick<Card, 'musica'>, encendida: boolean): string {
  return card.musica && encendida ? 'Música: de fondo, sintetizada y libre de derechos, bajo la voz.' : ''
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

// ── Cómo se ve y se busca una voz ──────────────────────────────────────────────────────────────────────────────────

/**
 * Las palabras con que AI Studio, Fish Audio y ElevenLabs dicen cómo suena una voz, en español y en femenino (es «la
 * voz»). Lo que no está aquí se queda como viene.
 */
const PALABRAS: Record<string, string> = {
  quiet: 'tranquila', intimate: 'íntima', warm: 'cálida', approachable: 'cercana', gentle: 'suave', relaxed: 'relajada',
  direct: 'directa', helpful: 'servicial', cool: 'fresca', confident: 'segura', clear: 'clara', energetic: 'enérgica',
  colorful: 'colorida', crisp: 'nítida', eager: 'entusiasta', friendly: 'amable', deep: 'profunda', velvety: 'aterciopelada',
  light: 'ligera', precise: 'precisa', calm: 'calmada', comforting: 'reconfortante', engaging: 'cautivadora',
  professional: 'profesional', empathetic: 'empática', conversational: 'conversacional', poised: 'serena',
  resonant: 'resonante', soothing: 'relajante', bright: 'brillante', upbeat: 'alegre', breathy: 'susurrante',
  firm: 'firme', smooth: 'suave', mature: 'madura', youthful: 'juvenil', casual: 'casual', lively: 'animada',
  informative: 'informativa', knowledgeable: 'experta', easygoing: 'tranquila', excitable: 'entusiasta', forward: 'directa',
  even: 'pareja', gravelly: 'rasposa', breezy: 'fresca', 'easy-going': 'tranquila', natural: 'natural', engaged: 'atenta', 'laid-back': 'relajada',
  chill: 'tranquila', character: 'personaje', 'character-voice': 'personaje', entertainment: 'entretenimiento',
  'social-media': 'redes', medium: 'media', soft: 'suave', serious: 'seria', authoritative: 'con autoridad', narration: 'narración',
  narrative: 'narración', storytelling: 'narración', news: 'noticias', calmada: 'calmada', male: 'hombre', female: 'mujer',
  old: 'mayor', young: 'joven', 'middle-aged': 'edad media', middle_aged: 'edad media', 'middle aged': 'edad media', adult: 'edad media', classy: 'elegante', cute: 'tierna', pleasant: 'agradable',
  sassy: 'atrevida', australian: 'australiana', hyped: 'emocionada', rough: 'áspera', formal: 'formal', mexico: 'mexicana',
  spain: 'de España', colombia: 'colombiana', argentina: 'argentina', chile: 'chilena', peru: 'peruana', venezuela: 'venezolana', senior: 'mayor', child: 'infantil', teen: 'adolescente', neutral: 'neutra', funny: 'graciosa',
  happy: 'alegre', sad: 'triste', angry: 'enojada', dramatic: 'dramática', emotional: 'emotiva', expressive: 'expresiva',
  social_media: 'redes', 'social media': 'redes', characters: 'personajes', characters_animation: 'personajes', narrative_story: 'narración',
  conversational_ai: 'asistente', entertainment_tv: 'televisión', advertisement: 'anuncios', educational: 'educativa',
  informative_educational: 'educativa', podcast: 'pódcast', audiobook: 'audiolibro', gaming: 'videojuegos', asmr: 'ASMR',
  spanish: 'español', english: 'inglés', mexican: 'mexicana', latin: 'latina', american: 'estadounidense', british: 'británica',
  argentine: 'argentina', colombian: 'colombiana', peninsular: 'de España', castilian: 'de España', 'latin american': 'latina'
}

/** Los usos con que AI Studio agrupa sus voces, como sustantivos: valen igual para una voz de hombre que de mujer. */
const GRUPOS: Record<string, string> = {
  tutor: 'Tutoría', 'commercial voiceover': 'Locución comercial', instructional: 'Instrucción', podcast: 'Pódcast',
  storyteller: 'Narración', 'digital assistant': 'Asistente digital', 'call center': 'Centro de llamadas',
  concierge: 'Recepción', 'tech support': 'Soporte técnico', professional: 'Profesional'
}

/** El tono de una voz, del más grave al más agudo, como lo dice AI Studio («Medium-low pitch»). */
export const TONOS = ['grave', 'media', 'aguda'] as const
export type Tono = (typeof TONOS)[number]
const TONO: Record<string, { texto: string; tono: Tono }> = {
  deep: { texto: 'muy grave', tono: 'grave' }, 'very low': { texto: 'muy grave', tono: 'grave' }, low: { texto: 'grave', tono: 'grave' },
  'medium-low': { texto: 'media grave', tono: 'grave' }, medium: { texto: 'media', tono: 'media' },
  'medium-high': { texto: 'media aguda', tono: 'aguda' }, high: { texto: 'aguda', tono: 'aguda' }, 'very high': { texto: 'muy aguda', tono: 'aguda' },
  // Las voces de antes lo dicen así: «Soft · Higher pitch».
  lower: { texto: 'grave', tono: 'grave' }, 'lower middle': { texto: 'media grave', tono: 'grave' }, middle: { texto: 'media', tono: 'media' },
  'upper middle': { texto: 'media aguda', tono: 'aguda' }, higher: { texto: 'aguda', tono: 'aguda' }
}

const primeraMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Una palabra o etiqueta en español, si se sabe («warm» → «cálida»). */
export function palabraEnEspanol(p: string): string {
  const w = p.trim().toLowerCase()
  // ElevenLabs escribe algunos acentos con su idioma delante y guiones: «es-latin-american».
  const sinIdioma = w.replace(/^es[-_]/, '').replace(/[-_]/g, ' ')
  return PALABRAS[w] ?? PALABRAS[sinIdioma] ?? p.trim()
}

/** El uso de un grupo de AI Studio en español («Call Center» → «Centro de llamadas»). */
export function grupoEnEspanol(g: string): string {
  return GRUPOS[g.trim().toLowerCase()] ?? g
}

/**
 * Cómo suena una voz, dicho en español: «Warm and approachable · Low pitch» → «Cálida y cercana · grave»; unas
 * etiquetas sueltas («male, calm, narration») → «Hombre, calmada, narración». Y su tono, si lo dice.
 */
export function comoSuena(descripcion: string): { texto: string; tono?: Tono } {
  let tono: Tono | undefined
  const partes = descripcion.split('·').map((parte) => {
    const p = parte.trim().replace(/\.$/, '')
    const t = /^(.+?)\s+pitch$/i.exec(p)
    if (t && TONO[t[1].toLowerCase()]) return (tono = TONO[t[1].toLowerCase()].tono), TONO[t[1].toLowerCase()].texto
    const y = /^([\w-]+) and ([\w-]+)$/i.exec(p)
    if (y) return primeraMayuscula(`${palabraEnEspanol(y[1])} y ${palabraEnEspanol(y[2])}`)
    return primeraMayuscula(p.split(/\s*,\s*/).map(palabraEnEspanol).join(', '))
  })
  tono ??= /\b(deep|low)\b/i.test(descripcion) ? 'grave' : /\bhigh\b/i.test(descripcion) ? 'aguda' : undefined
  return { texto: partes.filter(Boolean).join(' · '), ...(tono ? { tono } : {}) }
}

/**
 * La muestra pública de una voz de AI Studio: la que su panel toca al pulsar su botón de oír (vista el 6 de noviembre de 2026). Solo
 * la hay en inglés; en español hay que generarla.
 */
export const muestraDeStudio = (nombre: string) =>
  ANTIGUAS.has(nombre.toLowerCase()) ? `https://www.gstatic.com/aistudio/voices/samples/${nombre}.wav` : `https://www.gstatic.com/aistudio/voices/samples/daikon/en-us-${nombre.toLowerCase()}.wav`
/** Las 30 voces de antes de Gemini 3.8 (Kore, Puck…): su muestra está en otra carpeta. */
const ANTIGUAS = new Set(
  'zephyr puck charon kore fenrir leda orus aoede callirrhoe autonoe enceladus iapetus umbriel algieba despina erinome algenib rasalgethi laomedeia achernar alnilam schedar gacrux pulcherrima achird zubenelgenubi vindemiatrix sadachbia sadaltager sulafat'.split(' ')
)

/** Lo que se compara al buscar: sin mayúsculas ni acentos. */
export const paraBuscar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * ¿Encaja la voz con lo que se busca? Cada palabra buscada tiene que estar en alguno de sus textos (nombre, cómo suena
 * en inglés y en español, su uso, su motor), sin importar acentos ni el orden: «grave narradora», «mujer calida».
 */
export function encaja(busqueda: string, textos: string[]): boolean {
  const palabras = paraBuscar(busqueda).split(/\s+/).filter(Boolean)
  if (!palabras.length) return true
  const todo = paraBuscar(textos.join(' '))
  return palabras.every((p) => todo.includes(p))
}

/**
 * Las voces del panel filtrado por género: entonces AI Studio las da todas en una lista, sin grupos (unas 70, contra
 * las 3 por grupo que enseña sin filtro). Cada una es su nombre y debajo cómo suena; la de arriba («Current voice») no.
 */
export function vocesDeLista(texto: string): { nombre: string; descripcion: string }[] {
  const r = texto.split('\n').map((l) => l.trim()).filter(Boolean)
  const voces: { nombre: string; descripcion: string }[] = []
  for (let i = 0; i < r.length; i++) {
    if (r[i] === 'Current' || !/^[\p{L}][\p{L}\p{N}' -]*$/u.test(r[i])) continue
    const desc = r[i + 1] === 'Current' ? r[i + 2] : r[i + 1]
    if (!desc || !/·.*pitch/i.test(desc) || voces.some((v) => v.nombre === r[i])) continue
    voces.push({ nombre: r[i], descripcion: desc.replace(/\.\s*·/, ' ·') })
  }
  return voces
}

/**
 * Las voces del menú: las de los grupos (con su uso), con el género que dicen las listas filtradas, y detrás las que
 * solo salen en esas listas, en «Más voces».
 */
export function juntarVoces(grupos: VozStudio[], porGenero: Partial<Record<'mujer' | 'hombre', { nombre: string; descripcion: string }[]>>): VozStudio[] {
  const genero = new Map<string, 'mujer' | 'hombre'>()
  for (const [g, voces] of Object.entries(porGenero) as ['mujer' | 'hombre', { nombre: string }[]][]) for (const v of voces) genero.set(v.nombre, g)
  const conGenero = (v: VozStudio): VozStudio => (genero.has(v.nombre) ? { ...v, genero: genero.get(v.nombre)! } : v)
  const vistas = new Set(grupos.map((v) => v.nombre))
  const mas = (Object.entries(porGenero) as ['mujer' | 'hombre', { nombre: string; descripcion: string }[]][])
    .flatMap(([g, voces]) => voces.map((v) => ({ ...v, grupo: 'Más voces', genero: g })))
    .filter((v) => !vistas.has(v.nombre) && (vistas.add(v.nombre), true))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
  return [...grupos.map(conGenero), ...mas]
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
 * Lo que se narra de un guion en Markdown, lo mismo que copia «Copiar» de Sloth: sin títulos, encabezados, comentarios
 * ni la línea del corte de datos del video explicativo (la que se salta su `subtitulos.py`), y cada párrafo en un
 * renglón. La voz la leía en alto cuando no se quitaba aquí (el de estafas del 3 de noviembre).
 */
export function textoParaVoz(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#+ .*$/gm, '')
    .replace(/^\s*(Corte de datos|Datos al)\b.*$/gm, '')
    .split(/\n\s*\n/)
    .map((p) => p.split(/\s+/).join(' ').trim())
    .filter(Boolean)
    .join('\n\n')
}
