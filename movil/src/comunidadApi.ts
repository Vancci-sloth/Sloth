/**
 * La comunidad, con o sin computadora. Conectado a ella, va por su puerta (`/api/comunidad`, que pone tu cuenta). Sin
 * ella, va directo al cobro (`COBRO`) con la credencial de la comunidad que el celular guardó la última vez que estuvo
 * conectado (`/api/comunidad/credencial`: tu clave de Sloth y su equipo, o la llave del creador), en el llavero del celular.
 */
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { COBRO } from '../../shared/cobro'
import { api, cabeceras, cuerpoDe, ErrorApi } from './api'
import { conexion } from './conexion'
import { modoActual } from './modo'

type Credencial = { clave: string; equipo: string } | { llave: string }
const CLAVE = 'sloth.comunidad'
let credencial: Credencial | null | undefined

const guardado = {
  leer: async () => (Platform.OS === 'web' ? (globalThis.localStorage?.getItem(CLAVE) ?? null) : SecureStore.getItemAsync(CLAVE)),
  escribir: async (v: string) => (Platform.OS === 'web' ? globalThis.localStorage?.setItem(CLAVE, v) : SecureStore.setItemAsync(CLAVE, v))
}

export async function cargarCredencial() {
  try {
    const t = await guardado.leer()
    credencial = t ? (JSON.parse(t) as Credencial) : null
  } catch {
    credencial = null
  }
}

/** La credencial guardada: también abre el candado del celular (`candado.ts`). */
export const credencialGuardada = () => credencial

/** Con la computadora conectada: guarda su credencial de la comunidad para cuando el celular vaya solo. */
export async function recordarCredencial() {
  try {
    const c = await api<Partial<{ clave: string; equipo: string; llave: string }>>('/api/comunidad/credencial')
    const nueva: Credencial | null = c.llave ? { llave: c.llave } : c.clave && c.equipo ? { clave: c.clave, equipo: c.equipo } : null
    if (!nueva) return
    credencial = nueva
    await guardado.escribir(JSON.stringify(nueva))
  } catch { /* Una Sloth sin cuenta de la comunidad: nada que guardar. */ }
}

const porComputadora = () => modoActual() === 'computadora' && !!conexion()

/** `ruta` es la del Worker (`/comunidad?…`, `/comunidad/p/<id>`); con la computadora lleva `/api` delante. */
export async function comunidad<T = any>(ruta: string, body?: unknown): Promise<T> {
  if (porComputadora()) return api<T>(`/api${ruta}`, body)
  if (!credencial) throw new ErrorApi('Para ver la comunidad sin tu computadora, conéctate a ella una vez: el celular guarda tu cuenta de la comunidad.', 401)
  const quien: Record<string, string> = 'llave' in credencial ? { authorization: `Bearer ${credencial.llave}` } : { 'x-sloth-clave': credencial.clave, 'x-sloth-equipo': credencial.equipo }
  let r: Response
  try {
    r = await fetch(`${COBRO}${ruta}`, body === undefined ? { headers: quien } : { method: 'POST', headers: { ...quien, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new ErrorApi('Sin internet: revisa tu conexión.', 0)
  }
  const j = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new ErrorApi(j.error ?? `La comunidad respondió ${r.status}`, r.status)
  return j
}

/** Sube una foto a la comunidad y da su adjunto (`llave` y `url`). */
export async function subirFotoComunidad(uri: string, tipo: string): Promise<{ llave: string; url: string }> {
  const cuerpo = (await cuerpoDe(uri)) as any
  let r: Response
  if (porComputadora()) r = await fetch(`${conexion()!.base}/api/comunidad/archivo?tipo=${encodeURIComponent(tipo)}`, { method: 'POST', headers: cabeceras(), body: cuerpo })
  else {
    if (!credencial) throw new ErrorApi('Conéctate una vez a tu computadora para publicar desde el celular.', 401)
    const quien: Record<string, string> = 'llave' in credencial ? { authorization: `Bearer ${credencial.llave}` } : { 'x-sloth-clave': credencial.clave, 'x-sloth-equipo': credencial.equipo }
    r = await fetch(`${COBRO}/comunidad/archivo`, { method: 'PUT', headers: { ...quien, 'content-type': tipo }, body: cuerpo })
  }
  const j = (await r.json().catch(() => ({}))) as { llave?: string; url?: string; error?: string }
  if (!r.ok || !j.llave || !j.url) throw new ErrorApi(j.error ?? 'No se pudo subir tu foto.', r.status)
  return { llave: j.llave, url: j.url }
}
