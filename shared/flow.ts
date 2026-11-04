/**
 * Lo que comparten el servidor de Flow (`server/flow/`), el compositor y sus pruebas: los modelos que ofrece, lo más que
 * gasta un pedido sin permiso, cómo se leen el costo y lo que baja, la línea `Imágenes:` del primer mensaje y el reparto
 * de los pedidos entre las cuentas de Google.
 */

export const MODELOS_IMAGEN = ['Nano Banana 2.1', 'Nano Banana Pro', 'Nano Banana 2 Lite']
export const MODELOS_VIDEO = ['Veo 3.1 - Lite', 'Veo 3.1 - Fast', 'Veo 3.1 - Quality', 'Omni 1.1 Flash']

/** Las proporciones de cada tipo, con el icono de su botón en Flow (el texto cambia con el idioma; el icono, no). */
export const FORMATOS_VIDEO: Record<string, string> = { '9:16': 'crop_9_16', '16:9': 'crop_16_9' }
export const FORMATOS_IMAGEN: Record<string, string> = { ...FORMATOS_VIDEO, '1:1': 'crop_square', '4:3': 'crop_landscape', '3:4': 'crop_portrait' }

/** En el menú «Imágenes», ChatGPT (el `image_gen` de Codex). Lo demás que se elige ahí es un modelo de Flow. */
export const IMAGEN_CHATGPT = 'chatgpt'

/**
 * Con qué se generan las imágenes: lo elegido si se puede usar y, si no, ChatGPT o Flow, lo que esté conectado. Vacío si
 * no hay ninguno.
 */
export function imagenPosible(elegida: string, hay: { chatgpt: boolean; google: boolean }): string {
  if (elegida === IMAGEN_CHATGPT ? hay.chatgpt : MODELOS_IMAGEN.includes(elegida) && hay.google) return elegida
  return hay.chatgpt ? IMAGEN_CHATGPT : hay.google ? MODELOS_IMAGEN[0] : ''
}

/** La línea del primer mensaje con lo elegido en el menú «Imágenes», que siguen las skills (`video-base/FLOW.md`). */
export function lineaImagenes(imagen: string): string {
  if (!imagen) return ''
  if (imagen === IMAGEN_CHATGPT) return 'Imágenes: con ChatGPT (Codex), no con Google Flow (video-base/FLOW.md).'
  return `Imágenes: genéralas en Google Flow con ${imagen}, no con ChatGPT (cómo, en video-base/FLOW.md).`
}

/** Lo más que gasta un pedido si no se dice otro tope: alcanza para Lite y Fast, no para Quality (100). */
export const TOPE_CREDITOS = 20

/**
 * Cómo llama Flow a sus créditos en el panel, según el idioma de la cuenta: «créditos», o «puntos» en el español de
 * España («La generación consumirá 10 puntos», visto el 3 de noviembre de 2026).
 */
export const PALABRA_CREDITOS = /cr[eé]dit|puntos?\b|points?\b/i

/**
 * Los créditos que costará lo elegido, del panel de Flow («La generación usará 10 créditos», en el idioma de la cuenta).
 * `null` si no lo dice: sin saber el costo no se genera.
 */
export function creditosDe(texto: string): number | null {
  const renglon = texto.split('\n').filter((r) => /\d/.test(r) && PALABRA_CREDITOS.test(r)).at(-1)
  const n = renglon?.match(/\d+/)?.[0]
  return n === undefined ? null : Number(n)
}

/** Lo que le queda a una cuenta, del menú de su cuenta en Flow: sus créditos y, si se renuevan cada día, cuándo (ms). */
export interface Saldo {
  creditos: number
  renueva?: number
}

/** Lo que puede separar la hora que dice Flow de la de ahora en una cuenta sin gastar (redondeo de minutos). */
const HOLGURA = 5 * 60_000

/**
 * El saldo, del texto del menú de la cuenta (visto el 3 de noviembre de 2026): «20 créditos de Google Flow» y «Los
 * créditos se actualizan todos los días a la(s) 12:02 p.m.», o en el español de España «50 puntos de Google Flow» y «…a
 * diario a las 17:11». La hora es la del equipo, como la de Edge: `renueva` es la próxima vez que llega. Una cuenta que
 * aún no gastó dice la hora de ahora (se leyó dos veces, y la hora cambió con el reloj): entonces no hay `renueva`.
 * `null` si no dice cuántos quedan.
 */
export function saldoDe(texto: string, ahora: number): Saldo | null {
  const renglones = texto.split('\n')
  const i = renglones.findIndex((r) => /^\s*\d[\d.,]*\s+(cr[eé]ditos?|puntos?|credits?|points?)\b/i.test(r))
  if (i < 0) return null
  const creditos = Number(renglones[i].match(/\d[\d.,]*/)![0].replace(/[.,]/g, ''))
  const diario = renglones.slice(i + 1, i + 3).find((r) => /d[ií]a|diari|daily|day/i.test(r))
  const h = diario?.match(/(\d{1,2}):(\d{2})\s*(?:([ap])\.?\s*m\.?)?/i)
  if (!h) return { creditos }
  const hora = h[3] ? (Number(h[1]) % 12) + (h[3].toLowerCase() === 'p' ? 12 : 0) : Number(h[1])
  const d = new Date(ahora)
  d.setHours(hora, Number(h[2]), 0, 0)
  if (d.getTime() <= ahora) d.setDate(d.getDate() + 1)
  const falta = d.getTime() - ahora
  return falta < HOLGURA || falta > 24 * 60 * 60_000 - HOLGURA ? { creditos } : { creditos, renueva: d.getTime() }
}

/** Lo menos que cuesta un video (Omni Flash): con menos, la cuenta no hace ninguno hasta que se renueve. */
export const VIDEO_MAS_BARATO = 6

/** Cuántas cuentas de Google puede tener Flow en Sloth, y cuántas generan a la vez (cada una abre su Edge). */
export const MAX_CUENTAS = 50
export const A_LA_VEZ = 3

/**
 * Por qué descansa una cuenta: Flow no empezó su pedido porque no le quedan créditos (las imágenes siguen, no gastan),
 * porque la frenó por pedir mucho, o porque perdió la sesión.
 */
export type Motivo = 'creditos' | 'frenada' | 'sesion'

/** Lo que descansa cada motivo. Volver a probar no gasta (Flow no empezó), solo tarda: por eso no se espera más. */
export const DESCANSO: Record<Motivo, number> = { creditos: 3 * 60 * 60_000, frenada: 30 * 60_000, sesion: 10 * 60_000 }

/**
 * El motivo, de lo que dijo Flow al no empezar (su aviso, en el idioma de la cuenta). Sin aviso que se entienda, un video
 * es casi siempre que no quedan créditos; una imagen, que no gasta, que la frenó.
 */
export function motivoDeAviso(aviso: string, tipo: 'imagen' | 'video'): Motivo {
  if (/demasiad|too many|m[aá]s tarde|try again later|inusual|unusual|throttl/i.test(aviso)) return 'frenada'
  if (PALABRA_CREDITOS.test(aviso) || /cuota|quota|l[ií]mite|limit|agot|insuficient|insufficient|upgrade|mejora tu plan/i.test(aviso)) return 'creditos'
  return tipo === 'video' ? 'creditos' : 'frenada'
}

/** Una cuenta para el reparto: si está generando, cuándo generó por última vez y si descansa (hasta cuándo, en ms). */
export interface UsoCuenta {
  correo: string
  ocupada: boolean
  usada: number
  descansa?: { hasta: number; motivo: Motivo }
}

/** Si la cuenta puede hacer ese tipo ahora: sin créditos, las imágenes sí, que no gastan. */
export const puede = (c: UsoCuenta, tipo: 'imagen' | 'video', ahora: number) => !c.descansa || c.descansa.hasta <= ahora || (c.descansa.motivo === 'creditos' && tipo === 'imagen')

/**
 * A qué cuenta va un pedido: entre las libres que pueden y que aún no lo probaron, la que lleva más sin generar, para que
 * los créditos se gasten parejo. `esperar` si solo están ocupadas las que podrían; `ninguna` si ninguna puede.
 */
export function elegirCuenta(cuentas: UsoCuenta[], tipo: 'imagen' | 'video', ahora: number, probadas: string[] = []): string | 'esperar' | 'ninguna' {
  const sirven = cuentas.filter((c) => puede(c, tipo, ahora) && !probadas.includes(c.correo))
  const libre = sirven.filter((c) => !c.ocupada).sort((a, b) => a.usada - b.usada)[0]
  return libre ? libre.correo : sirven.length ? 'esperar' : 'ninguna'
}

/** Lo que es un archivo bajado de Flow, por sus primeros bytes: una sesión vencida baja una página, no el medio. */
export function tipoDeArchivo(b: Uint8Array): 'imagen' | 'video' | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'imagen'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'imagen'
  if (String.fromCharCode(...b.subarray(4, 8)) === 'ftyp') return 'video'
  return null
}

/** Las herramientas del MCP `flow` (`server/flow/mcp.mjs`), como salen en los hilos de cualquier agente. */
export const HERRAMIENTA_FLOW = /^mcp__flow__(generar_video|generar_imagen|estado_flow)$/

/** Un pedido ya hecho, leído de lo que respondió el MCP (`contar`): para el chat, que no pregunta al servidor. */
export interface HechoFlow {
  archivo: string
  modelo: string
  creditos: number
  cuenta?: string
  /** El id del pedido: el mismo pedido puede salir dos veces (un `estado_flow` de más), y se cuenta una. */
  pedido?: string
  quedan?: number
}

/**
 * Lo hecho, de la salida de una herramienta de Flow: «Lista: <archivo> (<modelo>, 10 créditos gastados, con <cuenta>,
 * pedido <id>). Les quedan 60 créditos a las cuentas.». Codex la da como el JSON del MCP (`{"content":[…]}`), y Claude
 * como su texto. `null` si no es un pedido hecho.
 */
export function hechoDeFlow(salida: string): HechoFlow | null {
  let texto = salida.trim()
  if (texto.startsWith('{')) {
    try {
      texto = (JSON.parse(texto) as { content?: { text?: string }[] }).content?.map((c) => c.text ?? '').join('\n') ?? ''
    } catch {
      return null
    }
  }
  const m = /^Lista: (.+?) \(([^,()]+), (\d+) créditos gastados(?:, con ([^,()]+?))?(?:, pedido (\w+))?\)\.(?: Les quedan (\d+) créditos)?/.exec(texto)
  if (!m) return null
  return { archivo: m[1], modelo: m[2], creditos: Number(m[3]), ...(m[4] ? { cuenta: m[4] } : {}), ...(m[5] ? { pedido: m[5] } : {}), ...(m[6] ? { quedan: Number(m[6]) } : {}) }
}
