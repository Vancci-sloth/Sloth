/**
 * La llave de la API de Claude con que trabaja el modo «Solo en el celular»: la de cada quien, de console.anthropic.com,
 * guardada en el llavero del celular (en la web de prueba, en `localStorage`). Nunca sale del celular salvo hacia la API.
 */
import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const CLAVE = 'sloth.anthropic'
let llave: string | null | undefined
const oyentes = new Set<() => void>()

export async function cargarLlave() {
  try {
    llave = Platform.OS === 'web' ? (globalThis.localStorage?.getItem(CLAVE) ?? null) : await SecureStore.getItemAsync(CLAVE)
  } catch {
    llave = null
  }
  oyentes.forEach((f) => f())
}

export async function guardarLlave(nueva: string | null) {
  const v = nueva?.trim() || null
  if (Platform.OS === 'web') v ? globalThis.localStorage?.setItem(CLAVE, v) : globalThis.localStorage?.removeItem(CLAVE)
  else if (v) await SecureStore.setItemAsync(CLAVE, v)
  else await SecureStore.deleteItemAsync(CLAVE)
  llave = v
  oyentes.forEach((f) => f())
}

export const llaveClaude = () => llave ?? null

export function useLlave(): string | null | undefined {
  return useSyncExternalStore(
    (f) => (oyentes.add(f), () => oyentes.delete(f)),
    () => llave
  )
}

/** Las que empiezan como una llave de la API de Anthropic. */
export const pareceLlave = (t: string) => /^sk-ant-[\w-]{20,}$/.test(t.trim())
