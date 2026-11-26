import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { entornoSinLlaves, llaveGuardada } from './acceso.ts'
import { guardar } from './disco.ts'
import { SKILLS } from './skills.ts'
import { NOMBRE_AGENTE, type Proveedor } from '../shared/providers.ts'

/** Id reservado para la configuración que el proveedor ya usaba antes de crear perfiles. */
export const CLAUDE_ORIGINAL = 'original'
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
type Perfil = { id: string; quien?: string; bloqueado?: boolean }
type Estado = { activa: string; perfiles: Perfil[] }

export function perfilesAgente(p: Proveedor, app = APP) {
  const nombre = NOMBRE_AGENTE[p]
  const raiz = join(app, 'data', `cuentas-${p}`)
  const archivo = join(raiz, 'perfiles.json')
  const leer = (): Estado => {
    try { return JSON.parse(readFileSync(archivo, 'utf8')) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return { activa: CLAUDE_ORIGINAL, perfiles: [] }
    }
  }
  const escribir = (estado: Estado) => {
    mkdirSync(raiz, { recursive: true })
    guardar(archivo, JSON.stringify(estado, null, 2))
  }
  const ruta = (id: string) => {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error(`Perfil de ${nombre} desconocido.`)
    return join(raiz, id)
  }
  return {
    leer,
    nuevo() {
      const estado = leer()
      const id = randomUUID()
      const dir = ruta(id)
      mkdirSync(dir, { recursive: true, mode: 0o700 })
      const skills = join(dir, 'skills')
      if ((p === 'claude' || p === 'codex' || p === 'deepseek') && existsSync(SKILLS)) symlinkSync(resolve(SKILLS), skills, 'junction')
      estado.perfiles.push({ id })
      escribir(estado)
      return id
    },
    usar(id: string) {
      const estado = leer()
      if (id !== CLAUDE_ORIGINAL && !estado.perfiles.some(p => p.id === id && p.quien && !p.bloqueado)) throw new Error(`Autoriza esa cuenta de ${nombre} primero.`)
      estado.activa = id
      escribir(estado)
    },
    autorizar(id: string, quien: string) {
      if (id === CLAUDE_ORIGINAL) return
      const estado = leer()
      const perfil = estado.perfiles.find(p => p.id === id)
      if (!perfil) throw new Error(`Perfil de ${nombre} desconocido.`)
      if (perfil.quien && perfil.quien.toLowerCase() !== quien.toLowerCase()) {
        perfil.bloqueado = true
        escribir(estado)
        throw new Error('Se autorizó otra cuenta. Vuelve a autorizar este perfil con su correo original.')
      }
      perfil.quien = quien
      delete perfil.bloqueado
      estado.activa = id
      escribir(estado)
    },
    configuracion(id: string) {
      return id === CLAUDE_ORIGINAL ? undefined : ruta(id)
    }
  }
}

export const perfilesClaude = (app?: string) => perfilesAgente('claude', app)

export const PERFILES_VENTANA = ['grok', 'muse', 'pi'] as const
export const PERFILES_LLAVE = ['deepseek', 'gemini', 'cursor'] as const
const CON_PERFIL = new Set<Proveedor>(['codex', ...PERFILES_VENTANA, ...PERFILES_LLAVE])
export const tienePerfiles = (p: Proveedor) => CON_PERFIL.has(p)

export function entornoPerfilAgente(p: Proveedor, dir?: string | null): Record<string, string> {
  if (!dir) return {}
  if (p === 'grok') return { GROK_HOME: dir, XAI_API_KEY: '', GROK_API_KEY: '' }
  if (p === 'muse') return { XDG_CONFIG_HOME: join(dir, 'config'), XDG_DATA_HOME: join(dir, 'datos'), META_API_KEY: '' }
  if (p === 'pi') return { PI_CODING_AGENT_DIR: dir }
  return {}
}

export function guardarLlavePerfil(dir: string, llave: string) {
  const archivo = join(dir, 'llave')
  guardar(archivo, llave)
  if (process.platform !== 'win32') chmodSync(archivo, 0o600)
}

export const llavePerfil = (dir: string) => readFileSync(join(dir, 'llave'), 'utf8')

export const perfilActivo = (p: Proveedor) => {
  const perfiles = perfilesAgente(p)
  return perfiles.configuracion(perfiles.leer().activa)
}

export function llaveDelPerfil(p: Proveedor, dir: string | null | undefined = perfilActivo(p)) {
  return dir ? llavePerfil(dir) : llaveGuardada(p)
}

export const variablesPerfilClaude = (dir: string) => ({
  CLAUDE_CONFIG_DIR: dir, CLAUDE_SECURESTORAGE_CONFIG_DIR: dir,
  ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', CLAUDE_CODE_OAUTH_TOKEN: '', ANTHROPIC_BASE_URL: '',
  CLAUDE_CODE_USE_BEDROCK: '', CLAUDE_CODE_USE_VERTEX: '', CLAUDE_CODE_USE_FOUNDRY: ''
})

export const entornoPerfilClaude = (dir: string) => ({ ...entornoSinLlaves(), ...variablesPerfilClaude(dir) })
