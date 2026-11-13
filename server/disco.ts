import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, openSync, readSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { promisify } from 'node:util'

/**
 * La carpeta con sus nombres largos, para vigilarla con `fs.watch` y `recursive`. Con un nombre corto de Windows
 * («C:\Users\RUNNER~1\AppData\…», como llega `%TEMP%` en muchas máquinas), libuv aborta el proceso entero al primer
 * cambio («Assertion failed: !_wcsnicmp(filename, dir, dirlen)», fs-event.c), sin un error que atrapar. Así fallaba
 * `modelos3d.test.ts` en Windows en GitHub, y así se habría caído Sloth con una carpeta que le llegara en esa forma.
 * Si la carpeta no existe, lanza, como `watch`.
 */
export const largo = (carpeta: string): string => realpathSync.native(carpeta)

/**
 * Escribe un archivo entero de una vez: primero en un temporal y después lo cambia por el bueno. Si se corta a la mitad
 * (se apaga la computadora, se llena el disco), queda el archivo de antes, no uno a medias que ya no se puede leer.
 */
export function guardar(archivo: string, texto: string | Uint8Array) {
  const tmp = `${archivo}.tmp`
  writeFileSync(tmp, texto)
  try {
    renameSync(tmp, archivo)
  } catch {
    // Windows no deja reemplazar un archivo que otro programa tiene abierto (el antivirus, el indexador): va directo.
    writeFileSync(archivo, texto)
    rmSync(tmp, { force: true })
  }
}

const execFileP = promisify(execFile)

/**
 * Manda archivos a la Papelera de reciclaje de Windows, de donde se pueden recuperar. Devuelve los que siguen en su sitio:
 * en uso, o porque cancelaste el aviso de Windows. Las rutas van por una variable de entorno y no dentro del comando,
 * para que ninguna comilla las rompa, de cien en cien para no pasar su límite.
 */
export async function aLaPapelera(rutas: string[]): Promise<string[]> {
  if (process.platform !== 'win32') {
    await aLaPapeleraFuera(rutas)
    return rutas.filter((r) => existsSync(r))
  }
  const ps =
    "Add-Type -AssemblyName Microsoft.VisualBasic; foreach ($r in ($env:SLOTH_PAPELERA | ConvertFrom-Json)) { try { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($r, 'OnlyErrorDialogs', 'SendToRecycleBin') } catch { [Console]::Error.WriteLine($_.Exception.Message) } }; exit 0"
  for (let i = 0; i < rutas.length; i += 100) {
    const { stderr } = await execFileP('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { env: { ...process.env, SLOTH_PAPELERA: JSON.stringify(rutas.slice(i, i + 100)) } })
    if (stderr.trim()) console.error('papelera:', stderr.trim())
  }
  return rutas.filter((r) => existsSync(r))
}

/**
 * En Mac, a la Papelera por el Finder, que deja «Devolver» (la primera vez, macOS pregunta si Sloth puede usar el
 * Finder); en Linux, con `gio trash`, la de GNOME y casi todos los escritorios. Las rutas van como argumentos.
 */
const PAPELERA_MAC = [
  'on run rutas',
  '  repeat with r in rutas',
  '    try',
  '      tell application "Finder" to delete (POSIX file (r as text) as alias)',
  '    on error e',
  '      log e',
  '    end try',
  '  end repeat',
  'end run'
].join('\n')

async function aLaPapeleraFuera(rutas: string[]) {
  for (let i = 0; i < rutas.length; i += 100) {
    const parte = rutas.slice(i, i + 100)
    try {
      const { stderr } = process.platform === 'darwin' ? await execFileP('osascript', ['-e', PAPELERA_MAC, ...parte]) : await execFileP('gio', ['trash', '--', ...parte])
      if (stderr.trim()) console.error('papelera:', stderr.trim())
    } catch (error) {
      console.error('papelera:', error instanceof Error ? error.message : error)
    }
  }
}

const MIB = 1024 * 1024
const huellas = new Map<string, string>()

/**
 * Lo que identifica el contenido de un video sin leerlo entero: sha256 de su tamaño, su primer MiB y su último MiB (en un
 * MP4 ahí van el índice, que cambia con cualquier cambio de un cuadro, y el final de los datos). Se calcula una vez por
 * versión del archivo (ruta, tamaño y fecha). `''` si no existe. La usan las redes, para saber qué se hizo con cada video,
 * y la galería de cada estilo, para enseñar una vez el mismo video copiado en dos carpetas.
 */
export function huella(ruta: string): string {
  let size: number
  let mtime: number
  try {
    ;({ size, mtimeMs: mtime } = statSync(ruta))
  } catch {
    return ''
  }
  const clave = `${ruta}|${size}|${mtime}`
  let h = huellas.get(clave)
  if (h) return h
  const hash = createHash('sha256').update(String(size))
  const b = Buffer.alloc(Math.min(MIB, size))
  const fd = openSync(ruta, 'r')
  try {
    hash.update(b.subarray(0, readSync(fd, b, 0, b.length, 0)))
    hash.update(b.subarray(0, readSync(fd, b, 0, b.length, Math.max(0, size - MIB))))
  } finally {
    closeSync(fd)
  }
  h = hash.digest('hex')
  huellas.set(clave, h)
  return h
}
