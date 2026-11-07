/**
 * El puerto de la Sloth instalada. Si en su puerto (4848) ya contesta una Sloth de OTRA carpeta (el repo en desarrollo,
 * otra instalación), no se engancha a ella: busca el siguiente puerto libre (Windows reserva algunos: esos se saltan) y
 * levanta ahí su servidor. Si la que contesta es la suya (misma carpeta de app), se engancha como siempre
 * (`scripts/start.mjs` ve que ya corre y no levanta otro).
 */
import { createServer } from 'node:net'
import { resolve } from 'node:path'

/** Lo que hay en un puerto: nada, una Sloth (con su carpeta de app, si se supo) u otra cosa. */
export type EnPuerto = { hay: 'nada' } | { hay: 'sloth'; app?: string } | { hay: 'otro' }

export interface Elegir {
  inicial: number
  app: string
  consultar: (puerto: number) => Promise<EnPuerto>
  libre: (puerto: number) => Promise<boolean>
  /** Cuántos puertos probar después del inicial. */
  intentos?: number
}

const misma = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase()

/** El puerto para esta Sloth y si ya corre ahí su servidor (`propio`). */
export async function elegirPuerto(o: Elegir): Promise<{ puerto: number; propio: boolean }> {
  for (let puerto = o.inicial; puerto <= o.inicial + (o.intentos ?? 60); puerto++) {
    const hay = await o.consultar(puerto)
    if (hay.hay === 'sloth' && hay.app && misma(hay.app, o.app)) return { puerto, propio: true }
    if (hay.hay !== 'nada') continue
    if (await o.libre(puerto)) return { puerto, propio: false }
  }
  throw new Error(`No encontré un puerto libre entre ${o.inicial} y ${o.inicial + (o.intentos ?? 60)}.`)
}

/** Qué contesta `/api/state` en `puerto`: la carpeta de app de la Sloth que responde (`app`), o nada si no hay respuesta. */
export async function consultarPuerto(puerto: number, espera = 2000): Promise<EnPuerto> {
  try {
    const r = await fetch(`http://localhost:${puerto}/api/state`, { signal: AbortSignal.timeout(espera) })
    if (!r.ok) return { hay: 'otro' }
    const d = (await r.json().catch(() => null)) as { app?: unknown } | null
    return d && typeof d.app === 'string' ? { hay: 'sloth', app: d.app } : { hay: 'otro' }
  } catch {
    return { hay: 'nada' }
  }
}

/** Si se puede escuchar en `puerto` como lo hace el servidor (127.0.0.1 y, si existe, ::1). */
export async function puertoLibre(puerto: number): Promise<boolean> {
  const probar = (host: string) =>
    new Promise<boolean | null>((listo) => {
      const s = createServer()
      s.once('error', (e: NodeJS.ErrnoException) => listo(e.code === 'EADDRNOTAVAIL' || e.code === 'EAFNOSUPPORT' ? null : false))
      s.listen(puerto, host, () => s.close(() => listo(true)))
    })
  return (await probar('127.0.0.1')) === true && (await probar('::1')) !== false
}
