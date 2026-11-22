/**
 * Dónde trabaja la app (ADR 0025): `celular`, sola en el teléfono con la llave de Claude de quien la usa, o
 * `computadora`, pidiéndole el trabajo a la Sloth de su computadora. Se elige en la bienvenida y se cambia en Más.
 */
import { useSyncExternalStore } from 'react'
import { recordado, recordar } from './recordar'

export type Modo = 'celular' | 'computadora'

let modo: Modo | undefined
const oyentes = new Set<() => void>()

/** Se lee después de `cargarRecordado`. */
export function cargarModo() {
  modo = recordado<Modo | undefined>('modo', undefined)
  oyentes.forEach((f) => f())
}

export function elegirModo(m: Modo | undefined) {
  modo = m
  recordar('modo', m)
  oyentes.forEach((f) => f())
}

export const modoActual = () => modo

export function useModo(): Modo | undefined {
  return useSyncExternalStore(
    (f) => (oyentes.add(f), () => oyentes.delete(f)),
    () => modo
  )
}

/** Un hilo de la computadora que abrir al entrar a ella (el que acaba de pasar «Seguir en la computadora»). */
let abrir: string | undefined
export const pedirAbrir = (id: string) => void (abrir = id)
export function tomarAbrir() {
  const id = abrir
  abrir = undefined
  return id
}
