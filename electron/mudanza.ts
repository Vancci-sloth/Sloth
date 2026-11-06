/**
 * Llevar lo pesado de Sloth a otro disco (Opciones → Espacio en disco, «Cambiar de disco…»): tus videos (`app/trabajo`),
 * la IA local (el Python de Sloth y sus modelos, `%APPDATA%/youtube`), los agentes bajados (`%APPDATA%/sloth/piezas`) y
 * las dependencias que comparten los videos (`sloth-modulos`). Cada carpeta pasa a `<elegida>/Sloth/<nombre>` y en su
 * sitio queda un enlace (en Windows, una unión, que no pide permisos): el servidor, las skills y los scripts siguen con las
 * mismas rutas. Tus hilos (`app/data`) se quedan: la ventana los tiene abiertos y pesan poco.
 *
 * Si Sloth se instaló en otro disco que el de tu usuario (el instalador deja elegir la carpeta), lo pesado nace junto a
 * ella, en `app/` (`junto`), y el instalador lo conserva al actualizar (scripts/instalador.nsh). Lo usa main.ts, con el
 * servidor parado: si algo lo tiene abierto, no se mueve nada.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, rmdirSync, rmSync, statfsSync, statSync, symlinkSync } from 'node:fs'
import { copyFile, lstat, mkdir, readdir, readlink, stat, symlink, utimes } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

const WINDOWS = process.platform === 'win32'

/** Una carpeta pesada: dónde la buscan Sloth y sus scripts (`enlace`) y su nombre en el disco nuevo. */
export interface Pesada {
  nombre: string
  enlace: string
}

/** Lo que se lleva, con las mismas rutas que usan server/requisitos.ts, server/agentes.ts y video-base (espacio.py). */
export function pesadas(app: string, env: NodeJS.ProcessEnv = process.env): Pesada[] {
  const datos = env.APPDATA || (process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support') : env.XDG_CONFIG_HOME || join(homedir(), '.config'))
  return [
    { nombre: 'trabajo', enlace: join(app, 'trabajo') },
    { nombre: 'ia', enlace: join(datos, 'youtube') },
    { nombre: 'piezas', enlace: join(datos, 'sloth', 'piezas') },
    { nombre: 'modulos', enlace: join(env.LOCALAPPDATA || join(homedir(), '.cache'), 'sloth-modulos') }
  ]
}

/** Dónde está de verdad: lo que hay tras el enlace, o la misma ruta si aún no existe. */
export const real = (ruta: string) => (existsSync(ruta) ? realpathSync(ruta) : ruta)

/** Dónde están tus videos ahora: lo que enseña Opciones. */
export const donde = (app: string) => real(join(app, 'trabajo'))

const dentro = (hijo: string, padre: string) => {
  const r = relative(resolve(padre), resolve(hijo))
  return !r || (!r.startsWith('..') && !isAbsolute(r))
}

/** La carpeta `Sloth` en la que se eligió (o la elegida, si ya se llama así). */
export const destinoDe = (elegida: string) => (basename(elegida).toLowerCase() === 'sloth' ? elegida : join(elegida, 'Sloth'))

/**
 * Por qué no se puede llevar ahí, o `null`. `prohibidas`: donde el instalador o una versión nueva borran (la carpeta de
 * Sloth.exe, la app).
 */
export function porQueNo(destino: string, lista: Pesada[], prohibidas: string[]): string | null {
  if (prohibidas.some((p) => dentro(destino, p))) return 'Esa carpeta es de la instalación de Sloth, que se cambia en cada versión. Elige otra.'
  for (const p of lista) {
    const r = real(p.enlace)
    const a = join(destino, p.nombre)
    const igual = resolve(a).toLowerCase() === resolve(r).toLowerCase()
    if (dentro(destino, r) || (!igual && dentro(r, a))) return `Esa carpeta está dentro de lo que se va a mover (${r}). Elige otra.`
    if (!igual && existsSync(a) && readdirSync(a).length) return `Ya hay una carpeta «${p.nombre}» con cosas en ${destino}. Elige otra.`
  }
  return null
}

/** Cuántos bytes hay que copiar: lo que ya está en el mismo disco solo cambia de nombre. */
export async function porCopiar(destino: string, lista: Pesada[]): Promise<number> {
  const disco = dispositivo(destino)
  let n = 0
  for (const p of lista) if (existsSync(p.enlace) && statSync(real(p.enlace)).dev !== disco) n += await tamano(real(p.enlace))
  return n
}

/** Lo libre en el disco de esa carpeta (aunque aún no exista). */
export function libre(ruta: string): number {
  try {
    const s = statfsSync(existente(ruta))
    return s.bavail * s.bsize
  } catch {
    return Infinity
  }
}

/**
 * Lleva cada una a `destino`. Antes de copiar nada se le cambia el nombre en su sitio (`.mudando`): si algo la tiene
 * abierta, Windows no deja y se para ahí, sin tocarla. Si falla al copiar, lo copiado se borra y vuelve como estaba.
 */
export async function mudar(destino: string, lista: Pesada[], avance: (bytes: number) => void): Promise<void> {
  mkdirSync(destino, { recursive: true })
  for (const p of lista) await mudarUna(p.enlace, join(destino, p.nombre), avance)
  avance(0)
}

async function mudarUna(enlace: string, a: string, avance: (bytes: number) => void) {
  if (!existsSync(enlace)) {
    // Aún no existe (o el enlace apunta a algo que ya no está): nace en el destino.
    mkdirSync(a, { recursive: true })
    return enlazar(enlace, a)
  }
  const r = realpathSync(enlace)
  if (resolve(r).toLowerCase() === resolve(a).toLowerCase()) return
  const aparte = `${r}.mudando`
  await soltar(() => renameSync(r, aparte), r)
  try {
    mkdirSync(dirname(a), { recursive: true })
    rmSync(a, { recursive: true, force: true }) // vacía, si existe (porQueNo)
    if (statSync(aparte).dev === dispositivo(dirname(a))) renameSync(aparte, a)
    else await copiar(aparte, a, avance)
  } catch (e) {
    rmSync(a, { recursive: true, force: true })
    renameSync(aparte, r)
    throw e
  }
  enlazar(enlace, a)
  // La copia de antes. Si no se deja borrar, ya no estorba: el enlace apunta a la nueva.
  try {
    rmSync(aparte, { recursive: true, force: true })
    if (!readdirSync(dirname(r)).length) rmdirSync(dirname(r))
  } catch {
    // Se queda; Espacio en disco no la cuenta, pero tampoco la usa nadie.
  }
}

/** El enlace en el sitio de siempre. Uno roto que quedó de antes se quita primero. */
function enlazar(enlace: string, a: string) {
  if (esLink(enlace)) rmSync(enlace, { force: true })
  mkdirSync(dirname(enlace), { recursive: true })
  symlinkSync(a, enlace, 'junction')
}

/** Recién instalada en otro disco: lo pesado que aún no existe nace junto a la app, en ese disco. */
export function junto(app: string, lista: Pesada[]) {
  for (const p of lista) {
    if (p.nombre === 'trabajo' || existsSync(p.enlace) || raiz(p.enlace) === raiz(app)) continue
    const a = join(app, p.nombre)
    mkdirSync(a, { recursive: true })
    enlazar(p.enlace, a)
  }
}

/** Si Sloth se cortó a media mudanza (se fue la luz), lo que estaba apartado vuelve a su sitio. */
export function recuperar(lista: Pesada[]) {
  for (const p of lista) {
    const aparte = `${p.enlace}.mudando`
    if (existsSync(p.enlace) || !existsSync(aparte)) continue
    if (esLink(p.enlace)) rmSync(p.enlace, { force: true })
    renameSync(aparte, p.enlace)
  }
}

const raiz = (ruta: string) => (WINDOWS ? resolve(ruta).slice(0, 2).toLowerCase() : '/')

/** Tras parar el servidor, Windows tarda un poco en soltar lo que tenía abierto: se reintenta unos segundos. */
async function soltar(hacer: () => void, ruta: string) {
  for (let i = 0; ; i++) {
    try {
      return hacer()
    } catch (e) {
      const codigo = (e as NodeJS.ErrnoException).code
      if (i < 20 && (codigo === 'EBUSY' || codigo === 'EPERM' || codigo === 'EACCES')) await new Promise((ok) => setTimeout(ok, 500))
      else throw new Error(`Algo está usando ${ruta} y no se puede mover. Cierra lo que lo tenga abierto (una carpeta, un video, el Explorador) y vuelve a intentarlo.`, { cause: e })
    }
  }
}

/** Copia una carpeta con sus fechas (Espacio en disco las mira) y sus enlaces tal cual, contando los bytes. */
export async function copiar(de: string, a: string, avance: (bytes: number) => void) {
  await mkdir(a, { recursive: true })
  for (const e of await readdir(de, { withFileTypes: true })) {
    const o = join(de, e.name)
    const d = join(a, e.name)
    if (e.isSymbolicLink()) {
      const destino = await readlink(o)
      let carpeta = false
      try {
        carpeta = (await stat(o)).isDirectory()
      } catch {
        // Roto: se copia igual.
      }
      // Un enlace a un archivo pide permisos en Windows: sin ellos, va el archivo.
      await symlink(destino, d, carpeta ? 'junction' : 'file').catch(() => (carpeta ? Promise.reject(new Error(`No se pudo copiar el enlace ${o}`)) : copyFile(o, d)))
    } else if (e.isDirectory()) await copiar(o, d, avance)
    else {
      const s = await lstat(o)
      await copyFile(o, d)
      await utimes(d, s.atime, s.mtime)
      avance(s.size)
    }
  }
  const s = await lstat(de)
  await utimes(a, s.atime, s.mtime)
}

async function tamano(ruta: string): Promise<number> {
  let n = 0
  for (const e of await readdir(ruta, { withFileTypes: true }).catch(() => [])) {
    const r = join(ruta, e.name)
    if (e.isDirectory()) n += await tamano(r)
    else if (e.isFile()) n += (await lstat(r).catch(() => ({ size: 0 }))).size
  }
  return n
}

function esLink(ruta: string) {
  try {
    return lstatSync(ruta).isSymbolicLink()
  } catch {
    return false
  }
}

/** La carpeta más cercana que ya existe. */
function existente(ruta: string) {
  let r = resolve(ruta)
  while (!existsSync(r) && dirname(r) !== r) r = dirname(r)
  return r
}

const dispositivo = (ruta: string) => statSync(existente(ruta)).dev
