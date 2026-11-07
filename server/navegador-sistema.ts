import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { OpcionNavegador, MarcaNavegador, PreferenciaNavegador } from '../shared/types.ts'
import { guardar } from './disco.ts'

/**
 * El Chrome y el Edge instalados, y cuál prefiere el usuario (Opciones → Navegador). Con `chrome` o `edge`, el agente
 * navega en una ventana de ese navegador (`server/chrome-agente.ts`) y la voz, las redes y Google (`server/chromium.ts`)
 * lo abren a él. Siempre con un perfil de Sloth (`--user-data-dir`), nunca el tuyo.
 *
 * La preferencia vive en `data/navegador-preferencia.json`: `automatico` (por omisión) deja todo como estaba, con el
 * navegador integrado para el agente; `chrome` y `edge` lo cambian.
 */

/**
 * Dónde se guarda la preferencia: `data/` de la carpeta de Sloth, que el servidor fija al arrancar (`usarCarpeta`). Sin
 * `import.meta` aquí: la ventana (`electron/google.ts`) compila este módulo a CJS y le pasa el archivo de su carpeta.
 */
let carpeta = process.cwd()
export const usarCarpeta = (app: string) => void (carpeta = app)
export const archivoPreferencia = (app = carpeta) => join(app, 'data', 'navegador-preferencia.json')

/** Lo que se mira de la computadora: inyectable en las pruebas. */
export interface Entorno {
  plataforma: NodeJS.Platform
  env: Record<string, string | undefined>
  casa: string
  existe(ruta: string): boolean
  /** La ruta que el registro de Windows da a un programa (App Paths), o `null`. */
  registro?(programa: string): string | null
}

/** Donde instala Chrome cada sistema, en orden. Sin el registro ni el PATH: eso lo mira `buscarChrome`. */
export function rutasChrome(e: Pick<Entorno, 'plataforma' | 'env' | 'casa'>): string[] {
  if (e.plataforma === 'win32')
    return [e.env.PROGRAMFILES ?? 'C:\\Program Files', e.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', e.env.LOCALAPPDATA ?? join(e.casa, 'AppData', 'Local')].map((p) =>
      join(p, 'Google', 'Chrome', 'Application', 'chrome.exe')
    )
  if (e.plataforma === 'darwin') return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', join(e.casa, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')]
  return ['/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium']
}

/** Igual, Edge. */
export function rutasEdge(e: Pick<Entorno, 'plataforma' | 'env' | 'casa'>): string[] {
  if (e.plataforma === 'win32')
    return [e.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', e.env.PROGRAMFILES ?? 'C:\\Program Files', e.env.LOCALAPPDATA ?? join(e.casa, 'AppData', 'Local')].map((p) =>
      join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    )
  if (e.plataforma === 'darwin') return ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', join(e.casa, 'Applications', 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge')]
  return ['/opt/microsoft/msedge/msedge', '/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable']
}

/** Un programa en el PATH (Linux): la primera carpeta que lo tenga. */
function enPath(e: Entorno, nombres: string[]): string | null {
  const carpetas = (e.env.PATH ?? '').split(e.plataforma === 'win32' ? ';' : ':').filter(Boolean)
  for (const n of nombres) for (const c of carpetas) if (e.existe(join(c, n))) return join(c, n)
  return null
}

/** Chrome instalado: la variable `SLOTH_CHROME` si la pusiste, sus rutas de siempre, el registro (Windows) o el PATH (Linux). */
export function buscarChrome(e: Entorno = entornoReal()): string | null {
  if (e.env.SLOTH_CHROME && e.existe(e.env.SLOTH_CHROME)) return e.env.SLOTH_CHROME
  const fija = rutasChrome(e).find((r) => e.existe(r))
  if (fija) return fija
  if (e.plataforma === 'win32') {
    const reg = e.registro?.('chrome.exe')
    return reg && e.existe(reg) ? reg : null
  }
  return e.plataforma === 'linux' ? enPath(e, ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) : null
}

/** Edge instalado. */
export function buscarEdge(e: Entorno = entornoReal()): string | null {
  const fija = rutasEdge(e).find((r) => e.existe(r))
  if (fija) return fija
  if (e.plataforma === 'win32') {
    const reg = e.registro?.('msedge.exe')
    return reg && e.existe(reg) ? reg : null
  }
  return e.plataforma === 'linux' ? enPath(e, ['microsoft-edge', 'microsoft-edge-stable']) : null
}

/** El valor por omisión de `HKLM|HKCU\...\App Paths\<programa>`. */
function delRegistro(programa: string): string | null {
  for (const raiz of ['HKLM', 'HKCU'])
    try {
      const salida = execFileSync('reg', ['query', `${raiz}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${programa}`, '/ve'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
        timeout: 5000
      })
      const ruta = /REG_\w+\s+(.+)$/m.exec(salida)?.[1].trim().replace(/^"|"$/g, '')
      if (ruta) return ruta
    } catch {
      // No está en esta raíz.
    }
  return null
}

export const entornoReal = (): Entorno => ({ plataforma: process.platform, env: process.env, casa: homedir(), existe: existsSync, registro: delRegistro })

/** Lo detectado, una vez por arranque (el registro es un proceso). `fresco` vuelve a mirar (Opciones lo pide al abrirse). */
let detectado: { chrome: string | null; edge: string | null } | null = null
export function detectados(fresco = false) {
  if (!detectado || fresco) detectado = { chrome: buscarChrome(), edge: buscarEdge() }
  return detectado
}

const PREFERENCIAS: PreferenciaNavegador[] = ['automatico', 'chrome', 'edge']

export function leerPreferencia(archivo = archivoPreferencia()): PreferenciaNavegador {
  try {
    const p = JSON.parse(readFileSync(archivo, 'utf8')).navegador
    return PREFERENCIAS.includes(p) ? p : 'automatico'
  } catch {
    return 'automatico'
  }
}

export function guardarPreferencia(p: PreferenciaNavegador, archivo = archivoPreferencia()) {
  if (!PREFERENCIAS.includes(p)) throw new Error(`Navegador desconocido: ${p}`)
  mkdirSync(dirname(archivo), { recursive: true })
  guardar(archivo, JSON.stringify({ navegador: p }, null, 1))
}

/**
 * El navegador que pide la preferencia: el elegido y, si no está instalado, el otro. `null` con `automatico` o si no hay
 * ninguno.
 */
export function elegirNavegador(p: PreferenciaNavegador, hay: { chrome: string | null; edge: string | null }): { marca: MarcaNavegador; exe: string } | null {
  if (p === 'automatico') return null
  const orden: MarcaNavegador[] = p === 'edge' ? ['edge', 'chrome'] : ['chrome', 'edge']
  for (const marca of orden) if (hay[marca]) return { marca, exe: hay[marca]! }
  return null
}

/** Chrome o Edge, según el ejecutable. */
export const marcaDe = (exe: string): MarcaNavegador => (/msedge|microsoft edge|microsoft-edge/i.test(exe) ? 'edge' : 'chrome')

export const nombreMarca = (m: MarcaNavegador) => (m === 'chrome' ? 'Chrome' : 'Edge')

export function estadoNavegador(fresco = false): OpcionNavegador {
  const hay = detectados(fresco)
  const preferencia = leerPreferencia()
  return { preferencia, chrome: hay.chrome, edge: hay.edge, usa: elegirNavegador(preferencia, hay)?.marca ?? null }
}
