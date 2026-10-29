import { chmodSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Proveedor } from '../shared/providers.ts'
import type { LlaveAgente } from '../shared/types.ts'
import { guardar } from './disco.ts'

/**
 * Cómo paga cada agente: con su cuenta (la suscripción de Claude o de ChatGPT) o con una llave de API, que se cobra por
 * uso. Se cambia en Opciones → Agentes, y la llave se queda guardada para volver a ella sin pegarla otra vez. Los hilos
 * que ya trabajan siguen como empezaron; lo nuevo sale con lo elegido.
 *
 * Las llaves van en `data/agentes.json`, no en las variables del usuario: ahí las leerían también su Claude Code y su
 * Codex de la terminal, que dejarían de usar su suscripción.
 * - Claude: Claude Code usa `ANTHROPIC_API_KEY` antes que la cuenta. Va en el entorno de Sloth, que heredan todos sus
 *   `query` y `claude auth status`; con la cuenta se quita, también si venía de fuera.
 * - Codex: el app-server usa un proveedor propio que la lee de su entorno (`codexConLlave`), así el inicio de sesión de
 *   ChatGPT queda como estaba. `codex exec` de las skills (las imágenes) la lee de `CODEX_API_KEY`. Cada hilo sigue con
 *   lo que empezó: al retomarlo, Codex reenvía el razonamiento de los turnos anteriores cifrado (`encrypted_content`) por
 *   el servidor que lo hizo, el de ChatGPT o la API, y no se puede pasar de uno a otro.
 * - Claude sí se cambia a media conversación: el razonamiento que hizo otra cuenta (Sonnet 5.5, Haiku 5.5) la API lo
 *   descarta sin error, y el hilo sigue con sus mensajes y herramientas.
 */
const ARCHIVO = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'data', 'agentes.json')
const ENTORNO = { claude: 'ANTHROPIC_API_KEY', codex: 'CODEX_API_KEY' } as const
/** El proveedor de Codex con la llave, y la variable de donde la lee. */
const CODEX_API = 'sloth-api'
const CODEX_ENV = 'SLOTH_OPENAI_API_KEY'

type Guardado = Partial<Record<Proveedor, { llave?: string; api?: boolean }>>

let datos: Guardado = {}
try {
  datos = JSON.parse(readFileSync(ARCHIVO, 'utf8'))
} catch {
  // Sin archivo, los dos con su cuenta.
}
aplicar()

function aplicar() {
  for (const p of ['claude', 'codex'] as const) {
    const llave = llaveEnUso(p)
    if (llave) process.env[ENTORNO[p]] = llave
    else delete process.env[ENTORNO[p]]
  }
}

/** La llave, si el proveedor paga con ella. */
export function llaveEnUso(p: Proveedor) {
  return (datos[p]?.api && datos[p]?.llave) || undefined
}

/** Lo que Opciones sabe de la llave guardada: su final y si es con ella como se paga. */
export function llaveDe(p: Proveedor): LlaveAgente | undefined {
  const l = datos[p]?.llave
  return l ? { final: l.slice(-4), activa: !!datos[p]?.api } : undefined
}

/** Cómo se dice la cuenta cuando se paga con la llave. */
export const conLlave = (p: Proveedor) => ({ conectada: true, quien: `Llave de API …${datos[p]!.llave!.slice(-4)}`, llave: llaveDe(p) })

/**
 * Lo que el app-server de Codex necesita para trabajar con la llave, o nada si va con la cuenta de ChatGPT. Con `guardada`,
 * la que haya aunque ahora se pague con la cuenta: la de un hilo que empezó con ella (`SessionMeta.conLlave`).
 */
export function codexConLlave(guardada = false) {
  const llave = guardada ? datos.codex?.llave : llaveEnUso('codex')
  if (!llave) return undefined
  return {
    proveedor: CODEX_API,
    env: { [CODEX_ENV]: llave },
    config: {
      model_provider: CODEX_API,
      model_providers: { [CODEX_API]: { name: 'OpenAI', base_url: 'https://api.openai.com/v1', env_key: CODEX_ENV, wire_api: 'responses' } }
    }
  }
}

export type CodexLlave = NonNullable<ReturnType<typeof codexConLlave>>

/**
 * Cambia cómo paga `p`. `llave`: la nueva (se prueba antes de guardarla), `null` para quitarla (y volver a la cuenta),
 * o nada para usar la que ya estaba.
 */
export async function cambiarAcceso(p: Proveedor, api: boolean, llave?: string | null) {
  const nueva = llave === undefined ? datos[p]?.llave : llave?.trim() || undefined
  if (api && !nueva) throw new Error('Pega primero tu llave de API.')
  if (llave && nueva) await probar(p, nueva)
  datos = { ...datos, [p]: nueva ? { llave: nueva, api } : {} }
  mkdirSync(dirname(ARCHIVO), { recursive: true })
  guardar(ARCHIVO, JSON.stringify(datos, null, 2))
  // Solo de quien la guardó: son llaves.
  if (process.platform !== 'win32') chmodSync(ARCHIVO, 0o600)
  aplicar()
}

/** Pide la lista de modelos, que no gasta nada: así se sabe si la llave vale. */
async function probar(p: Proveedor, llave: string) {
  const res =
    p === 'claude'
      ? await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': llave, 'anthropic-version': '2023-06-01' } })
      : await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${llave}` } })
  if (res.ok) return
  const marca = p === 'claude' ? 'Anthropic' : 'OpenAI'
  if (res.status === 401 || res.status === 403) throw new Error(`${marca} no aceptó esa llave. Revísala y vuelve a pegarla.`)
  throw new Error(`${marca} respondió ${res.status}. Vuelve a intentarlo en un momento.`)
}
