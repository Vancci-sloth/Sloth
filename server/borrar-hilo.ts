import { randomUUID } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync, renameSync, rmSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import type { SessionMeta } from '../shared/types.ts'
import { guardar } from './disco.ts'

/** El nombre de lo apartado para borrarse (`moverProyectos`). */
const PREFIJO = '.sloth-borrando-'

export function dentroDe(carpeta: string, ruta: string) {
  const rel = relative(carpeta, ruta)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep))
}

export function rutaReal(ruta: string) {
  try { return realpathSync(ruta) }
  catch { return undefined }
}

export function carpetasDelHilo(meta: SessionMeta, hilos: SessionMeta[], primero?: string): string[] {
  const raiz = rutaReal(meta.cwd)
  if (!raiz) return []
  // Los hilos anteriores conservan el nombre original en la línea que agregó Sloth al primer mensaje.
  const original = primero?.match(/(?:^|\n)Carpeta: ([\p{L}\p{N}_-]+)\s*$/u)?.[1]
  const propias = new Set([...(meta.carpetasGeneradas ?? []), meta.lote?.carpeta, !meta.carpetasGeneradas && original === meta.carpeta ? original : undefined])
  const compartidas = hilos.filter((h) => h.id !== meta.id).flatMap((h) =>
    [h.carpeta ?? h.lote?.carpeta, ...(h.carpetasGeneradas ?? [])].flatMap((nombre) => {
      // Un chat sin subcarpeta comparte el directorio de la card. Solo se protege su cwd si vive dentro del proyecto.
      const ruta = rutaReal(nombre ? join(h.cwd, nombre) : h.cwd)
      return ruta ? [{ ruta, protegeDentro: !!nombre || h.running || !!h.background?.length }] : []
    }))
  return [...propias].flatMap((nombre) => {
    if (!nombre || !/^[\p{L}\p{N}_-]+$/u.test(nombre)) return []
    const ruta = join(raiz, nombre)
    if (!lstatSync(ruta, { throwIfNoEntry: false })?.isDirectory()) return []
    if (compartidas.some((otra) => dentroDe(ruta, otra.ruta) || (otra.protegeDentro && dentroDe(otra.ruta, ruta)))) return []
    return [ruta]
  })
}

/** Retira las carpetas de la galería al instante. El trabajo recursivo queda fuera del hilo principal. */
export function moverProyectos(carpetas: string[]) {
  const movidas: { ruta: string; temporal: string }[] = []
  const restaurar = () => {
    for (const { ruta, temporal } of movidas.reverse()) renameSync(temporal, ruta)
  }
  try {
    for (const ruta of carpetas) {
      const temporal = join(dirname(ruta), `${PREFIJO}${randomUUID()}`)
      renameSync(ruta, temporal)
      movidas.push({ ruta, temporal })
    }
  } catch (error) {
    restaurar()
    throw error
  }
  return {
    restaurar,
    /** Borra lo apartado. Devuelve lo que no se pudo (un archivo en uso): va a `pendientes`, que lo reintenta. */
    async limpiar(): Promise<string[]> {
      const borradas = await Promise.allSettled(movidas.map(({ temporal }) => rm(temporal, { recursive: true, force: true, maxRetries: 3 })))
      return movidas.flatMap(({ temporal }, i) => (borradas[i].status === 'rejected' ? [temporal] : []))
    }
  }
}

/**
 * Lo apartado que no se pudo borrar (un video abierto en otro programa, un archivo que Windows aún tiene tomado): se anota
 * en `archivo` y `reintentar` lo vuelve a intentar al arrancar el servidor y en cada borrado, hasta que se va. Solo borra
 * lo que es de `moverProyectos` (su nombre empieza por `.sloth-borrando-`): un archivo editado a mano no borra nada más.
 */
export function pendientes(archivo: string) {
  const leer = (): string[] => {
    try {
      const lista: unknown = JSON.parse(readFileSync(archivo, 'utf8'))
      return Array.isArray(lista) ? lista.filter((r): r is string => typeof r === 'string' && isAbsolute(r) && basename(r).startsWith(PREFIJO)) : []
    } catch {
      return []
    }
  }
  const escribir = (lista: string[]) => (lista.length ? guardar(archivo, `${JSON.stringify(lista, null, 2)}\n`) : rmSync(archivo, { force: true }))
  return {
    anotar(rutas: string[]) {
      if (rutas.length) escribir([...new Set([...leer(), ...rutas])])
    },
    async reintentar() {
      const quedan: string[] = []
      for (const ruta of leer()) await rm(ruta, { recursive: true, force: true, maxRetries: 3 }).catch(() => quedan.push(ruta))
      escribir(quedan)
      return quedan
    }
  }
}
