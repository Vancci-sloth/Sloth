/**
 * Las piezas movidas a mano de cada modelo 3D (`server/modelos3d-ediciones.ts`): se leen al abrirlo y se guardan, con una
 * pausa corta, cada vez que el visor avisa de un cambio. Cada pieza va por su ruta en el árbol del modelo (`0/2`) con lo
 * que cambió respecto a la original: `p` (mover), `r` (girar, en radianes) y `s` (escalar, en factores).
 */

export type PiezaEditada = { p?: number[]; r?: number[]; s?: number[] }
export type Ediciones = Record<string, PiezaEditada>
/** La herramienta de la barra del visor: `ver` no cambia nada; las otras tres toman la pieza elegida. */
export type HerramientaEdicion = 'ver' | 'mover' | 'girar' | 'escalar'

const pendientes = new Map<string, ReturnType<typeof setTimeout>>()

export async function cargarEdiciones(id: string): Promise<Ediciones> {
  try {
    const res = await fetch(`/api/modelos3d/ediciones/${encodeURIComponent(id)}`)
    return res.ok ? ((await res.json()) as Ediciones) : {}
  } catch {
    return {}
  }
}

/** Manda el mapa entero del modelo al servidor; `true` si quedó guardado. */
async function enviarEdiciones(id: string, ediciones: Ediciones): Promise<boolean> {
  try {
    const res = await fetch(`/api/modelos3d/ediciones/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ediciones),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Guardado inmediato (el botón «Guardar cambios»): cancela el automático pendiente y manda ya. */
export function guardarEdicionesYa(id: string, ediciones: Ediciones): Promise<boolean> {
  clearTimeout(pendientes.get(id))
  pendientes.delete(id)
  return enviarEdiciones(id, ediciones)
}
