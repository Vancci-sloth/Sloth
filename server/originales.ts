import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { CambioSkill } from '../shared/types.ts'

/**
 * Las skills tal como las trae esta versión de Sloth y lo que el usuario les cambió: lo que su agente editó cuando le
 * pidió «guarda este cambio». La app que se vende las trae en `resources/skills` (Electron se lo dice al servidor en
 * `SLOTH_SKILLS_ORIGINALES`). La card enseña «Con tus cambios» y vuelve a la original. Antes de pisar algo cambiado, se
 * guarda una copia en `data/skills-tuyas/<fecha> <motivo>/`, al volver a la original y al estrenar una versión
 * (`prepararSkills`, electron/main.ts).
 * Solo cuentan los archivos que trae la original: lo que la skill guarda de tus videos (huellas, banco, modelos 3D) es
 * aparte y no se toca.
 */

/** Lo que instalan los scripts de una skill dentro de su carpeta, que no es de ella. */
const BASURA = new Set(['__pycache__', 'node_modules', '.git', '.cache'])

/** La huella de un archivo, sin contar los finales de línea: un agente en Windows puede guardarlo con CRLF sin cambiarlo. */
export function huella(file: string) {
  const texto = readFileSync(file).toString('latin1').replaceAll('\r\n', '\n')
  return createHash('sha256').update(texto, 'latin1').digest('hex').slice(0, 16)
}

/** Los archivos de una carpeta, con su ruta relativa y `/`. */
export function archivos(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile())
    .map((f) => relative(dir, join(f.parentPath, f.name)).replaceAll('\\', '/'))
    .filter((r) => !r.split('/').some((p) => BASURA.has(p)))
}

/** Las huellas de todas las skills de una carpeta, por `<skill>/<archivo>`. */
export function huellas(raiz: string): Record<string, string> {
  return Object.fromEntries(archivos(raiz).map((r) => [r, huella(join(raiz, r))]))
}

/** Lo de la skill `original` que ya no es igual en `actual` o que ya no está. */
export function cambiosDe(original: string, actual: string, skill: string): CambioSkill[] {
  return archivos(original).flatMap((archivo) => {
    const f = join(actual, archivo)
    if (!existsSync(f)) return [{ skill, archivo, borrado: true }]
    return huella(f) === huella(join(original, archivo)) ? [] : [{ skill, archivo }]
  })
}

/** El nombre de la carpeta de una copia: la fecha, que ordena, y por qué se hizo. */
export function nombreCopia(motivo: string, ahora = new Date()) {
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())} ${dos(ahora.getHours())}.${dos(ahora.getMinutes())} ${motivo}`
}

/** Copia lo cambiado de cada skill (`carpeta(skill)`) a `destino/<skill>/<archivo>`. Lo borrado no tiene qué copiar. */
export function respaldar(cambios: CambioSkill[], carpeta: (skill: string) => string, destino: string) {
  for (const c of cambios) {
    if (c.borrado) continue
    const a = join(destino, c.skill, c.archivo)
    mkdirSync(dirname(a), { recursive: true })
    copyFileSync(join(carpeta(c.skill), c.archivo), a)
  }
}

/** Vuelve a poner en `actual` esos archivos de la `original`. Lo demás de la carpeta se queda. */
export function restaurar(original: string, actual: string, cuales: string[]) {
  for (const archivo of cuales) {
    const de = join(original, archivo)
    if (!existsSync(de) || !statSync(de).isFile()) continue
    mkdirSync(dirname(join(actual, archivo)), { recursive: true })
    copyFileSync(de, join(actual, archivo))
  }
}
