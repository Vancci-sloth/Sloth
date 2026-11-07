import { execFileSync } from 'node:child_process'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { guardar } from './disco.ts'

/**
 * Los archivos con llaves (las de los agentes en `data/agentes.json`, `acceso.ts`, y fuera de Windows las de Opciones en
 * `variables.json`, `opciones.ts`) se guardan cifrados con AES-256-GCM. La llave maestra son 32 bytes al azar:
 * - En Windows, protegidos con DPAPI del usuario (`ProtectedData`, `CurrentUser`) en `llave-maestra.dpapi`: solo ese
 *   usuario de Windows, en esa computadora, los abre. Se desprotegen una vez por arranque, la primera vez que hacen falta.
 * - En Mac y Linux, en `llave-maestra`, con permisos 600.
 * Un archivo en texto plano de antes se lee igual y se vuelve a guardar cifrado (`leerSecreto`). Ni la llave ni el
 * contenido van al registro ni a la consola: los errores dicen solo el motivo.
 *
 * `SLOTH_SIN_CIFRAR=1` lo apaga: se sigue leyendo lo cifrado, pero lo que se guarda va en texto plano, como antes.
 */

/** La carpeta `data/` de la app: ahí va la llave maestra si no se dice otra. */
export const DATOS = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'data')
const FORMATO = 'sloth-aes-256-gcm-1'

export interface Cifrado {
  formato: typeof FORMATO
  iv: string
  tag: string
  datos: string
}

export const esCifrado = (x: unknown): x is Cifrado =>
  !!x && typeof x === 'object' && (x as Cifrado).formato === FORMATO && typeof (x as Cifrado).datos === 'string'

export function cifrar(texto: string, llave: Buffer): Cifrado {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', llave, iv)
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return { formato: FORMATO, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), datos: datos.toString('base64') }
}

export function descifrar(c: Cifrado, llave: Buffer): string {
  const d = createDecipheriv('aes-256-gcm', llave, Buffer.from(c.iv, 'base64'))
  d.setAuthTag(Buffer.from(c.tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(c.datos, 'base64')), d.final()]).toString('utf8')
}

/** DPAPI por PowerShell. Los bytes van por una variable de entorno, no en la línea de comandos. */
function dpapi(accion: 'Protect' | 'Unprotect', base64: string): Buffer {
  const ps = `Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::${accion}([Convert]::FromBase64String($env:SLOTH_DPAPI), $null, 'CurrentUser'))`
  const salida = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    env: { ...process.env, SLOTH_DPAPI: base64 },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
    timeout: 60_000
  })
  return Buffer.from(salida.trim(), 'base64')
}

const maestras = new Map<string, Buffer>()

/** La llave maestra de la carpeta `datos` (por omisión, `data/` de la app); la crea si aún no existe. */
export function llaveMaestra(datos = DATOS): Buffer {
  const ya = maestras.get(datos)
  if (ya) return ya
  mkdirSync(datos, { recursive: true })
  let llave: Buffer
  if (process.platform === 'win32') {
    const archivo = join(datos, 'llave-maestra.dpapi')
    if (existsSync(archivo)) llave = dpapi('Unprotect', readFileSync(archivo, 'utf8').trim())
    else {
      llave = randomBytes(32)
      const protegida = dpapi('Protect', llave.toString('base64'))
      // Antes de guardarla, se comprueba que DPAPI la devuelve igual.
      if (!dpapi('Unprotect', protegida.toString('base64')).equals(llave)) throw new Error('DPAPI no devolvió la llave maestra.')
      guardar(archivo, protegida.toString('base64'))
    }
  } else {
    const archivo = join(datos, 'llave-maestra')
    if (existsSync(archivo)) {
      chmodSync(archivo, 0o600)
      llave = Buffer.from(readFileSync(archivo, 'utf8').trim(), 'base64')
    } else {
      llave = randomBytes(32)
      guardar(archivo, llave.toString('base64'))
      chmodSync(archivo, 0o600)
    }
  }
  if (llave.length !== 32) throw new Error('La llave maestra no es válida (no mide 32 bytes).')
  maestras.set(datos, llave)
  return llave
}

/**
 * Lee un JSON de secretos: cifrado, lo descifra; en texto plano (de antes), lo devuelve y lo vuelve a guardar cifrado.
 * Sin archivo, `undefined`.
 */
export function leerSecreto<T>(archivo: string, datos = DATOS): T | undefined {
  if (!existsSync(archivo)) return undefined
  const crudo = JSON.parse(readFileSync(archivo, 'utf8')) as unknown
  if (esCifrado(crudo)) return JSON.parse(descifrar(crudo, llaveMaestra(datos))) as T
  if (!sinCifrar()) guardarSecreto(archivo, crudo, datos)
  return crudo as T
}

const sinCifrar = () => process.env.SLOTH_SIN_CIFRAR === '1'

/** Guarda `valor` cifrado. Comprueba que se descifra igual antes de reemplazar el archivo, para no perder nada. */
export function guardarSecreto(archivo: string, valor: unknown, datos = DATOS) {
  mkdirSync(dirname(archivo), { recursive: true })
  if (sinCifrar()) guardar(archivo, JSON.stringify(valor, null, 2))
  else {
    const llave = llaveMaestra(datos)
    const texto = JSON.stringify(valor)
    const c = cifrar(texto, llave)
    if (descifrar(c, llave) !== texto) throw new Error('No se pudo cifrar el archivo de secretos.')
    guardar(archivo, JSON.stringify(c, null, 2))
  }
  // Solo de quien la guardó: son llaves.
  if (process.platform !== 'win32') chmodSync(archivo, 0o600)
}
