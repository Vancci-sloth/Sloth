/**
 * Lo que comparten el servidor de Flow (`server/flow/`), el compositor y sus pruebas: los modelos que ofrece, lo más que
 * gasta un pedido sin permiso, cómo se leen el costo y lo que baja, y la línea `Imágenes:` del primer mensaje.
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
 * Los créditos que costará lo elegido, del panel de Flow («La generación usará 10 créditos», en el idioma de la cuenta).
 * `null` si no lo dice: sin saber el costo no se genera.
 */
export function creditosDe(texto: string): number | null {
  const renglon = texto.split('\n').filter((r) => /\d/.test(r) && /cr[eé]dit/i.test(r)).at(-1)
  const n = renglon?.match(/\d+/)?.[0]
  return n === undefined ? null : Number(n)
}

/** Lo que es un archivo bajado de Flow, por sus primeros bytes: una sesión vencida baja una página, no el medio. */
export function tipoDeArchivo(b: Uint8Array): 'imagen' | 'video' | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'imagen'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'imagen'
  if (String.fromCharCode(...b.subarray(4, 8)) === 'ftyp') return 'video'
  return null
}
