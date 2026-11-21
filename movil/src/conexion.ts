/**
 * Con qué computadora habla el celular: su dirección y la llave del QR, guardadas en el llavero del celular (en la web,
 * que solo sirve para probar, en `localStorage`). `conectar` prueba las direcciones del QR una por una y se queda con la
 * primera que contesta que es Sloth.
 */
import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import type { Destino } from './enlace'

export interface Conexion {
  base: string
  llave: string
  /** El nombre de la computadora, para decir a cuál estás conectado. */
  equipo: string
  version: string
}

const CLAVE = 'sloth.conexion'

const guardado = {
  leer: async (): Promise<string | null> => (Platform.OS === 'web' ? globalThis.localStorage?.getItem(CLAVE) ?? null : SecureStore.getItemAsync(CLAVE)),
  escribir: async (v: string | null) => {
    if (Platform.OS === 'web') return v === null ? globalThis.localStorage?.removeItem(CLAVE) : globalThis.localStorage?.setItem(CLAVE, v)
    return v === null ? SecureStore.deleteItemAsync(CLAVE) : SecureStore.setItemAsync(CLAVE, v)
  }
}

/** `undefined` mientras se lee del llavero; `null`, sin conectar. */
let actual: Conexion | null | undefined
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((f) => f())

export const conexion = () => actual ?? null

export async function cargarConexion() {
  try {
    const texto = await guardado.leer()
    actual = texto ? (JSON.parse(texto) as Conexion) : null
  } catch {
    actual = null
  }
  avisar()
}

export function useConexion(): Conexion | null | undefined {
  return useSyncExternalStore(
    (f) => (oyentes.add(f), () => oyentes.delete(f)),
    () => actual
  )
}

/** Pide algo con tiempo límite: una dirección de otra red no contesta nunca, y no se puede esperar un minuto. */
async function conTiempo(url: string, init: RequestInit, ms: number): Promise<Response> {
  const corte = new AbortController()
  const t = setTimeout(() => corte.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: corte.signal })
  } finally {
    clearTimeout(t)
  }
}

/** Prueba cada dirección del QR y guarda la primera que es Sloth y acepta la llave. Si ninguna, dice por qué. */
export async function conectar(destino: Destino): Promise<Conexion> {
  let llaveMala = false
  let mensaje = ''
  for (const base of destino.direcciones) {
    try {
      const r = await conTiempo(`${base}/api/celular/hola`, { headers: { authorization: `Bearer ${destino.llave}` } }, 4000)
      if (r.status === 401 || r.status === 429) {
        llaveMala = true
        mensaje = ((await r.json().catch(() => ({}))) as { error?: string }).error ?? ''
        continue
      }
      const hola = (await r.json()) as { sloth?: boolean; equipo?: string; version?: string }
      if (!hola.sloth) continue
      const nueva: Conexion = { base, llave: destino.llave, equipo: hola.equipo ?? 'tu computadora', version: hola.version ?? '' }
      await guardado.escribir(JSON.stringify(nueva))
      actual = nueva
      motivo = ''
      avisar()
      return nueva
    } catch {
      /* Esa dirección no contesta: la siguiente. */
    }
  }
  if (llaveMala) throw new Error(mensaje || 'La llave ya no es la de tu Sloth: vuelve a escanear el código de Opciones → Tu celular.')
  throw new Error(
    'No se pudo llegar a tu computadora. Revisa que Sloth esté abierta con «Dejar entrar al celular» encendido, y que el celular esté en el mismo Wi-Fi (o los dos en Tailscale).'
  )
}

/** Por qué se desconectó solo (la llave cambió en la computadora): lo dice la pantalla de conectar. */
let motivo = ''
export const motivoDeSalida = () => motivo

export async function olvidarConexion(porque = '') {
  motivo = porque
  await guardado.escribir(null)
  actual = null
  avisar()
}
