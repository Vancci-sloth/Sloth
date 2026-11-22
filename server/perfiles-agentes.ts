/**
 * Varias cuentas de Claude y de ChatGPT (Codex), cada una en su carpeta. La de siempre es la «original»
 * (`ORIGINAL`): la configuración que el agente ya usaba (`~/.claude` y `~/.codex` en la app que se vende; `data/claude` en
 * la copia del repo). No se mueve ni se copia: quien ya tenía su cuenta conectada la conserva tal cual. Las que se agregan
 * en Opciones viven en `data/cuentas-<agente>/<id>` (su `CLAUDE_CONFIG_DIR` o su `CODEX_HOME`), con las skills enlazadas.
 *
 * `perfiles.json` guarda cuál se usa en los hilos nuevos (`activa`) y el correo de cada una (`quien`). Si al volver a
 * autorizar una entra otro correo, la cuenta queda `bloqueado` hasta autorizarla con el suyo: un hilo nunca cambia de
 * cuenta sin que se elija. Cada hilo recuerda la suya (`SessionMeta.perfilClaude`, `perfilAgente`): su sesión vive en la
 * carpeta de esa cuenta. Las llaves de API no van aquí: siguen en `server/acceso.ts`.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { entornoSinLlaves } from './acceso.ts'
import { guardar } from './disco.ts'
import { SKILLS } from './skills.ts'

/** La cuenta que el agente ya usaba antes de que hubiera más. */
export const ORIGINAL = 'original'
export type AgenteConCuentas = 'claude' | 'codex'
export type PerfilCuenta = { id: string; quien?: string; bloqueado?: boolean }
export type CuentasAgente = { activa: string; perfiles: PerfilCuenta[] }

const NOMBRE: Record<AgenteConCuentas, string> = { claude: 'Claude', codex: 'ChatGPT' }
/** Donde está Sloth: lo pone `server/index.ts` al arrancar (las pruebas, el suyo). */
let raizApp = resolve('.')
export const ponerAppPerfiles = (app: string) => void (raizApp = app)

export function perfilesAgente(p: AgenteConCuentas, app = raizApp) {
  const nombre = NOMBRE[p]
  const raiz = join(app, 'data', `cuentas-${p}`)
  const archivo = join(raiz, 'perfiles.json')
  const leer = (): CuentasAgente => {
    try {
      const datos = JSON.parse(readFileSync(archivo, 'utf8')) as CuentasAgente
      return { activa: typeof datos.activa === 'string' ? datos.activa : ORIGINAL, perfiles: Array.isArray(datos.perfiles) ? datos.perfiles : [] }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return { activa: ORIGINAL, perfiles: [] }
    }
  }
  const escribir = (estado: CuentasAgente) => {
    mkdirSync(raiz, { recursive: true })
    guardar(archivo, JSON.stringify(estado, null, 2))
  }
  const ruta = (id: string) => {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error(`No hay esa cuenta de ${nombre}.`)
    return join(raiz, id)
  }
  const autorizada = (estado: CuentasAgente, id: string) => id === ORIGINAL || estado.perfiles.some((c) => c.id === id && c.quien && !c.bloqueado)
  return {
    leer,
    autorizada: (id: string) => autorizada(leer(), id),
    /** Una cuenta vacía, para autorizarla: su carpeta con las skills de Sloth enlazadas. */
    nueva() {
      const estado = leer()
      const id = randomUUID()
      const dir = ruta(id)
      mkdirSync(dir, { recursive: true, mode: 0o700 })
      try {
        if (existsSync(SKILLS)) symlinkSync(resolve(SKILLS), join(dir, 'skills'), 'junction')
      } catch (error) {
        console.error(`No se pudieron enlazar las skills en ${dir}: ${error instanceof Error ? error.message : error}`)
      }
      estado.perfiles.push({ id })
      escribir(estado)
      return id
    },
    /** La que usan los hilos nuevos. */
    usar(id: string) {
      const estado = leer()
      if (!autorizada(estado, id)) throw new Error(`Autoriza primero esa cuenta de ${nombre}.`)
      estado.activa = id
      escribir(estado)
    },
    /** Al terminar de autorizarla: su correo. Otro correo que el de antes la bloquea. */
    autorizar(id: string, quien: string) {
      const estado = leer()
      if (id === ORIGINAL) {
        estado.activa = id
        return escribir(estado)
      }
      const perfil = estado.perfiles.find((c) => c.id === id)
      if (!perfil) throw new Error(`No hay esa cuenta de ${nombre}.`)
      if (perfil.quien && perfil.quien.toLowerCase() !== quien.toLowerCase()) {
        perfil.bloqueado = true
        escribir(estado)
        throw new Error(`Entró ${quien}, no ${perfil.quien}. Vuelve a autorizar esta cuenta con su correo.`)
      }
      perfil.quien = quien
      delete perfil.bloqueado
      estado.activa = id
      escribir(estado)
    },
    /** Quita una de las agregadas y su carpeta (su sesión). La original no se quita aquí: se cierra su sesión. */
    quitar(id: string) {
      if (id === ORIGINAL) throw new Error('La cuenta original no se quita: cierra su sesión.')
      const estado = leer()
      const dir = ruta(id)
      estado.perfiles = estado.perfiles.filter((c) => c.id !== id)
      if (estado.activa === id) estado.activa = ORIGINAL
      escribir(estado)
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
    },
    /** La carpeta de su configuración; la original, `undefined` (la de siempre). */
    configuracion(id: string) {
      return id === ORIGINAL ? undefined : ruta(id)
    }
  }
}

/** La carpeta de la cuenta que usan los hilos nuevos de ese agente, o `undefined` si es la original. */
export function perfilActivo(p: AgenteConCuentas) {
  const cuentas = perfilesAgente(p)
  return cuentas.configuracion(cuentas.leer().activa)
}

/** Lo que va en el entorno de Claude Code con una cuenta agregada: su carpeta, y ninguna llave ni otra API. */
export const variablesPerfilClaude = (dir: string) => ({
  CLAUDE_CONFIG_DIR: dir,
  CLAUDE_SECURESTORAGE_CONFIG_DIR: dir,
  ANTHROPIC_API_KEY: '',
  ANTHROPIC_AUTH_TOKEN: '',
  CLAUDE_CODE_OAUTH_TOKEN: '',
  ANTHROPIC_BASE_URL: '',
  CLAUDE_CODE_USE_BEDROCK: '',
  CLAUDE_CODE_USE_VERTEX: '',
  CLAUDE_CODE_USE_FOUNDRY: ''
})

export const entornoPerfilClaude = (dir: string): Record<string, string> => ({ ...(entornoSinLlaves() as Record<string, string>), ...variablesPerfilClaude(dir) })
