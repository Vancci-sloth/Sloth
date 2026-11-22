/**
 * El candado de la app: el creador decide en el cobro (`CELULAR_SOLO_APOYO`, `licencias/src/celular.ts`) si la app del
 * celular es solo para quienes apoyan Sloth, sin sacar otra versión. Al abrir y al volver a ella cada `CADA`, se le
 * pregunta con el identificador de este celular y una clave de Sloth: la que se escribió aquí (`Candado`) o la de la
 * computadora que el celular guardó (`comunidadApi.ts`); con la llave del creador, siempre abre. Lo que contesta se guarda
 * en el llavero, y la regla de cuándo cierra está en `reglaCandado.ts`.
 * La pantalla del candado no ofrece pagar ni enlaza a donde se paga: Google Play no lo deja fuera de su cobro.
 */
import { useSyncExternalStore } from 'react'
import { AppState, Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { COBRO } from '../../shared/cobro'
import { credencialGuardada } from './comunidadApi'
import { cerrada, type Sabido } from './reglaCandado'

export interface Candado extends Sabido {
  /** El identificador de este celular, al azar la primera vez. */
  equipo: string
  /** La clave que se escribió en el celular. */
  clave?: string
  email?: string
  /** Lo que dijo el cobro de esa clave (no la encontró, ya está en otros celulares). */
  error?: string
  revisado?: number
}

/** Para probarlo contra `wrangler dev` (`EXPO_PUBLIC_COBRO=http://10.0.2.2:8787` en el emulador). */
const BASE = process.env.EXPO_PUBLIC_COBRO || COBRO
const LLAVE = 'sloth.candado'
const CADA = 6 * 3600_000
let candado: Candado = { equipo: '' }
const oyentes = new Set<() => void>()

const guardado = {
  leer: async () => (Platform.OS === 'web' ? (globalThis.localStorage?.getItem(LLAVE) ?? null) : SecureStore.getItemAsync(LLAVE)),
  escribir: async (v: string) => (Platform.OS === 'web' ? globalThis.localStorage?.setItem(LLAVE, v) : SecureStore.setItemAsync(LLAVE, v))
}

function poner(nuevo: Candado) {
  candado = nuevo
  oyentes.forEach((f) => f())
  void guardado.escribir(JSON.stringify(nuevo)).catch(() => {})
}

export async function cargarCandado() {
  try {
    const t = await guardado.leer()
    if (t) candado = JSON.parse(t) as Candado
  } catch { /* Sin lo guardado, se pregunta otra vez. */ }
  if (!candado.equipo) poner({ ...candado, equipo: `cel-${Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('')}` })
}

/** Le pregunta al cobro. Sin internet, se queda con lo último que dijo. */
async function preguntar(clave = candado.clave): Promise<Candado> {
  const credencial = credencialGuardada()
  const creador: Record<string, string> = credencial && 'llave' in credencial ? { authorization: `Bearer ${credencial.llave}` } : {}
  const usar = clave ?? (credencial && 'clave' in credencial ? credencial.clave : undefined)
  let r: Response
  try {
    r = await fetch(`${BASE}/celular`, { method: 'POST', headers: { ...creador, 'content-type': 'application/json' }, body: JSON.stringify({ equipo: candado.equipo, clave: usar }) })
  } catch {
    throw new Error('Sin internet: revisa tu conexión.')
  }
  const j = (await r.json().catch(() => ({}))) as Sabido & { email?: string; error?: string }
  // Un tropiezo del cobro no cierra nada: vale lo de antes.
  if (r.status >= 500) throw new Error(j.error ?? `El cobro de Sloth respondió ${r.status}.`)
  const ahora = Date.now()
  if (!r.ok) return { ...candado, apoya: false, email: undefined, error: j.error, revisado: ahora }
  return { ...candado, cobra: j.cobra, apoya: j.apoya, hasta: j.hasta, email: j.email, error: undefined, revisado: ahora }
}

export async function revisarCandado() {
  try {
    poner(await preguntar())
  } catch { /* Sin internet: vale lo de antes. */ }
}

/** Desde el candado: prueba la clave y, si el cobro la encontró, la guarda aunque hoy no apoye (abrirá cuando apoye). */
export async function entrarConClave(texto: string) {
  const clave = texto.replace(/\s+/g, '').toUpperCase()
  if (!/^SLOTH(-[2-9A-HJ-NP-Z]{4}){4}$/.test(clave)) throw new Error('Eso no parece una clave de Sloth: es como SLOTH-XXXX-XXXX-XXXX-XXXX.')
  const nuevo = await preguntar(clave)
  if (nuevo.error) throw new Error(nuevo.error)
  poner({ ...nuevo, clave })
  if (cerrada(nuevo, Date.now())) throw new Error(`La clave de ${nuevo.email ?? 'esa cuenta'} no tiene un apoyo activo hoy.`)
}

AppState.addEventListener('change', (a) => {
  if (a === 'active' && candado.equipo && Date.now() - (candado.revisado ?? 0) > CADA) void revisarCandado()
})

export function useCandado(): Candado {
  return useSyncExternalStore(
    (f) => (oyentes.add(f), () => oyentes.delete(f)),
    () => candado
  )
}

export { cerrada }
