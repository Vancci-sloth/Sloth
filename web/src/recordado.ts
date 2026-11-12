import { type DependencyList, useEffect, useState } from 'react'

/**
 * Lo que el inicio pregunta al servidor al abrirse (las series de un estilo, sus marcas, si hay ChatGPT) llegaba un
 * momento después y metía un selector más en la barra del compositor, que saltaba de fila. Así arranca con lo último
 * que se supo (en memoria y en esta computadora) y solo cambia si el servidor dice otra cosa.
 */
const enMemoria = new Map<string, unknown>()
const CLAVE = (clave: string) => `sloth-recordado:${clave}`

/**
 * Lo guardado solo vale si tiene la forma de `inicial`: lista donde va una lista, el mismo tipo, y un objeto con cada
 * clave de `inicial` y de su forma; si no, se usa `inicial`.
 */
export function deLaForma<T>(v: unknown, inicial: T): v is T {
  // Una lista, sin huecos (`[null]` también dejaba la app en blanco).
  if (Array.isArray(inicial)) return Array.isArray(v) && v.every((x) => x !== null && x !== undefined)
  if (inicial !== null && typeof inicial === 'object') {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
    return Object.entries(inicial).every(([k, x]) => deLaForma((v as Record<string, unknown>)[k], x))
  }
  return typeof v === typeof inicial
}

function leer<T>(clave: string, inicial: T): T {
  if (enMemoria.has(clave)) return enMemoria.get(clave) as T
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE(clave)) ?? 'null') as unknown
    return deLaForma(guardado, inicial) ? guardado : inicial
  } catch {
    return inicial
  }
}

/** `cargar` da el valor de ahora (o `inicial` si falla); mientras llega, se usa el último sabido. */
export function useRecordado<T>(clave: string, inicial: T, cargar: () => Promise<T>, deps: DependencyList): T {
  const [valor, setValor] = useState(() => leer(clave, inicial))
  useEffect(() => {
    let vivo = true
    setValor(leer(clave, inicial))
    const saber = (v: T) => {
      enMemoria.set(clave, v)
      try {
        // Si falló, se olvida: la próxima vez no arranca con algo que ya no vale.
        if (v === inicial) localStorage.removeItem(CLAVE(clave))
        else localStorage.setItem(CLAVE(clave), JSON.stringify(v))
      } catch {}
      if (vivo) setValor(v)
    }
    cargar().then(
      (v) => saber(deLaForma(v, inicial) ? v : inicial),
      () => saber(inicial)
    )
    return () => {
      vivo = false
    }
  }, deps)
  return valor
}
