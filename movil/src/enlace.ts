/**
 * El enlace del QR de Opciones → Tu celular (`enlaceDe` en `server/celular.ts`): `slothmovil://conectar?d=<ip:puerto>,…&llave=…`.
 * Sin dependencias de React Native: lo prueba `enlace.test.ts`.
 */

export interface Destino {
  /** `http://ip:puerto`, en el orden en que se prueban. */
  direcciones: string[]
  llave: string
}

/** `192.168.1.5:4849`, `http://192.168.1.5:4849/` o `192.168.1.5` → `http://192.168.1.5:4849`. Vacía si no parece una dirección. */
export function normalizarDireccion(texto: string, puerto = 4849): string {
  let t = texto.trim().replace(/\/+$/, '')
  if (!t) return ''
  if (!/^https?:\/\//i.test(t)) t = `http://${t}`
  try {
    const u = new URL(t)
    if (!u.hostname) return ''
    return `${u.protocol}//${u.hostname}:${u.port || puerto}`
  } catch {
    return ''
  }
}

/** Lo que trae un QR o un enlace pegado; `null` si no es de Sloth. */
export function leerEnlace(texto: string): Destino | null {
  const m = /^slothmovil:\/\/conectar\?(.*)$/i.exec(texto.trim())
  if (!m) return null
  const params = new URLSearchParams(m[1])
  const llave = params.get('llave') ?? ''
  const direcciones = (params.get('d') ?? '')
    .split(',')
    .map((d) => normalizarDireccion(d))
    .filter(Boolean)
  return llave && direcciones.length ? { direcciones, llave } : null
}

/** La dirección del WebSocket de Sloth desde la de la API. */
export const wsDe = (base: string, llave: string) => `${base.replace(/^http/, 'ws')}/ws?llave=${encodeURIComponent(llave)}`

/** Una ruta de la API con la llave, para lo que no deja poner cabeceras: un video, una imagen, una descarga. */
export function conLlave(base: string, llave: string, ruta: string): string {
  const url = /^https?:\/\//.test(ruta) ? ruta : `${base}${ruta.startsWith('/') ? '' : '/'}${ruta}`
  return `${url}${url.includes('?') ? '&' : '?'}llave=${encodeURIComponent(llave)}`
}
