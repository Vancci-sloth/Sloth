import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Chrome o Edge del sistema, con un perfil de Sloth y CDP, donde se entra con Google (la voz y Flow, `server/voz/`; las
 * redes, `server/redes/navegador.ts`): Google no deja entrar dentro de una app, y Safari no se deja manejar por CDP, así
 * que sin uno de los dos la sesión no tiene cómo pasar a Sloth.
 */

/** En Mac, Chrome y Edge también se instalan solo para tu usuario, en `~/Applications`. */
const enMac = (app: string, exe: string) => ['/Applications', join(homedir(), 'Applications')].map((d) => join(d, `${app}.app`, 'Contents', 'MacOS', exe))
const CHROME =
  process.platform === 'win32'
    ? []
    : process.platform === 'darwin'
      ? enMac('Google Chrome', 'Google Chrome')
      : ['/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
const EDGE =
  process.platform === 'win32'
    ? ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']
    : process.platform === 'darwin'
      ? enMac('Microsoft Edge', 'Microsoft Edge')
      : ['/opt/microsoft/msedge/msedge']

/** El primero que haya, Chrome antes que Edge si `chromePrimero`. */
export function chromiumDelSistema(chromePrimero: boolean): string | undefined {
  return (chromePrimero ? [...CHROME, ...EDGE] : [...EDGE, ...CHROME]).find((e) => existsSync(e))
}

export const nombreDe = (exe: string | undefined) => (exe && /edge/i.test(exe) ? 'Edge' : 'Chrome')

/** Lo que se dice si no hay ninguno: en Mac casi siempre es que solo hay Safari. */
export const SIN_CHROMIUM =
  process.platform === 'win32'
    ? 'No encontré Microsoft Edge, donde se entra con Google.'
    : process.platform === 'darwin'
      ? 'Para entrar con Google hace falta Google Chrome (o Microsoft Edge): Safari no deja pasar la sesión a Sloth. Instálalo desde google.com/chrome y vuelve a intentarlo.'
      : 'No encontré Google Chrome ni Microsoft Edge: instala uno para entrar con Google.'

/**
 * Lo abre con `args`. Con `ventana`, en Mac va por `open`: lanzado directo desde Sloth, macOS no lo trae al frente y la
 * ventana queda detrás, como si no se hubiera abierto. `-n` abre otro aunque ya tengas el tuyo abierto.
 */
export function lanzarChromium(exe: string, args: string[], ventana: boolean) {
  const [cmd, ...resto] = comoLanzar(exe, args, ventana)
  spawn(cmd, resto, { detached: true, stdio: 'ignore' }).unref()
}

/** El comando con que `lanzarChromium` lo abre. */
export const comoLanzar = (exe: string, args: string[], ventana: boolean, so = process.platform) =>
  ventana && so === 'darwin' ? ['open', '-n', '-a', exe.replace(/\/Contents\/MacOS\/[^/]+$/, ''), '--args', ...args] : [exe, ...args]
