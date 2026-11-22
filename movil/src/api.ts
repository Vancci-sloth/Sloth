/**
 * Hablar con Sloth desde el celular: como `web/src/api.ts`, pero con la dirección y la llave de la conexión. Todo pasa
 * por la puerta del celular (`server/celular.ts`), que lo reenvía a Sloth como si viniera de la computadora.
 */
import { Alert, Platform } from 'react-native'
import { File } from 'expo-file-system'
import { conLlave } from './enlace'
import { conexion } from './conexion'

export class ErrorApi extends Error {
  constructor(mensaje: string, readonly status: number) {
    super(mensaje)
  }
}

function base() {
  const c = conexion()
  if (!c) throw new ErrorApi('Sin conectar a tu computadora.', 0)
  return c
}

export const cabeceras = (): Record<string, string> => ({ authorization: `Bearer ${base().llave}` })

/** Una ruta de Sloth con la llave puesta: para los videos, las imágenes y lo que se baja. */
export const urlDe = (ruta: string) => {
  const c = base()
  return conLlave(c.base, c.llave, ruta)
}

/** Sloth pregunta antes de pasar de dos videos a la vez (`AvisoVideos.tsx` en la computadora): aquí, con un aviso del sistema. */
function confirmar(aviso: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(aviso) ?? false)
  return new Promise((ok) =>
    Alert.alert('¿Seguir?', aviso, [
      { text: 'No', style: 'cancel', onPress: () => ok(false) },
      { text: 'Seguir', onPress: () => ok(true) }
    ], { cancelable: true, onDismiss: () => ok(false) })
  )
}

/**
 * Lo que solo lee se vuelve a pedir si Sloth se está reiniciando (unos 15 s); lo que cambia algo, no, porque pudo haber
 * llegado.
 */
async function pedir(ruta: string, body?: unknown): Promise<Response> {
  const c = base()
  for (let i = 0; ; i++) {
    try {
      const init: RequestInit = body === undefined
        ? { headers: cabeceras() }
        : { method: 'POST', headers: { ...cabeceras(), 'content-type': 'application/json' }, body: JSON.stringify(body) }
      const r = await fetch(`${c.base}${ruta}`, init)
      if (r.status !== 502 || body !== undefined || i >= 10) return r
    } catch {
      if (body !== undefined || i >= 10) throw new ErrorApi('No se pudo hablar con tu computadora: revisa que Sloth esté abierta y que sigas en su Wi-Fi.', 0)
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
}

export async function api<T = any>(ruta: string, body?: unknown): Promise<T> {
  const res = await pedir(ruta, body)
  const data = (await res.json().catch(() => {
    throw new ErrorApi(res.status === 404 ? 'Tu Sloth aún no conoce esta función: actualízala en la computadora.' : `Sloth respondió ${res.status}`, res.status)
  })) as any
  if (data?.confirmar) {
    if (await confirmar(data.error)) return api<T>(ruta, { ...(body as object), masDeDos: true })
    throw new ErrorApi('', res.status)
  }
  if (!res.ok) throw new ErrorApi(data?.error ?? `Sloth respondió ${res.status}`, res.status)
  return data as T
}

/** Un archivo del celular como cuerpo de un pedido, tal cual: el `fetch` de Expo acepta un `File`; en la web, un Blob. */
export const cuerpoDe = async (uri: string): Promise<Blob | File> => (Platform.OS === 'web' ? (await fetch(uri)).blob() : new File(uri))

/**
 * Sube un archivo del celular (una foto, un video, tu voz) a `data/attachments` de la computadora y devuelve su ruta
 * allí, la que se manda en `images`. Con `wav`, Sloth lo pasa a WAV (lo que piden las etapas de voz).
 */
export async function subir(uri: string, nombre: string, opciones: { wav?: boolean } = {}): Promise<string> {
  const c = base()
  const url = `${c.base}/api/upload?name=${encodeURIComponent(nombre)}${opciones.wav ? '&wav' : ''}`
  const r = await fetch(url, { method: 'POST', headers: cabeceras(), body: (await cuerpoDe(uri)) as any })
  const data = (await r.json().catch(() => ({}))) as { path?: string; error?: string }
  if (!r.ok || !data.path) throw new ErrorApi(data.error ?? `No se pudo subir «${nombre}»`, r.status)
  return data.path
}
