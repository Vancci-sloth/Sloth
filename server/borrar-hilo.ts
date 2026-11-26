import { randomUUID } from 'node:crypto'
import { lstatSync, realpathSync, renameSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import type { SessionMeta } from '../shared/types.ts'

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
  // Los hilos anteriores conservan el nombre original en la línea que agregó VyMotion al primer mensaje.
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
      const temporal = join(dirname(ruta), `.vymotion-borrando-${randomUUID()}`)
      renameSync(ruta, temporal)
      movidas.push({ ruta, temporal })
    }
  } catch (error) {
    restaurar()
    throw error
  }
  return {
    restaurar,
    async limpiar() {
      const borradas = await Promise.allSettled(movidas.map(({ temporal }) => rm(temporal, { recursive: true, force: true, maxRetries: 3 })))
      const fallos = borradas.filter((resultado) => resultado.status === 'rejected')
      if (fallos.length) throw new AggregateError(fallos.map((fallo) => fallo.reason), 'Quedaron archivos temporales sin eliminar.')
    }
  }
}
