import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { VersionClaude } from '../shared/types.ts'
import { VENTA } from '../shared/venta.ts'
import { CodexRpc } from './codex-rpc.ts'

/**
 * La versión de cada agente y el botón que la pone al día, como en los ajustes de T3 Code. Los dos son paquetes de este
 * repo: se actualizan con npm y, si la app no funciona con el nuevo, vuelve el de antes.
 *
 * - Claude es `@anthropic-ai/claude-agent-sdk`, que trae su propio Claude Code. Solo dentro del rango que declara
 *   package.json (`^0.3.296`): en un SDK 0.x, la cifra de en medio (0.4) cambia su API, y saltar a ella podía dejar la app
 *   sin arrancar. Se comprueba con el typecheck, y Sloth se reinicia para cargarlo.
 * - Codex es `@openai/codex`, que sube la cifra de en medio cada semana: se acepta cualquier 0.x más nueva. Sloth no
 *   importa su código, solo le habla a su app-server, así que se comprueba abriéndolo; no hace falta reiniciar, porque
 *   cada uso lo abre otra vez.
 */
export type Agente = 'claude' | 'codex'

type Publicada = { version: string; claudeCodeVersion?: string }

const AGENTES: Record<Agente, { paquete: string; nombre: string; version(p: Publicada): string | undefined; fijas?: number; comprobar(app: string): Promise<unknown> }> = {
  claude: { paquete: '@anthropic-ai/claude-agent-sdk', nombre: 'Claude Code', version: (p) => p.claudeCodeVersion, comprobar: (app) => correr('npm run typecheck', app) },
  codex: { paquete: '@openai/codex', nombre: 'Codex', version: (p) => p.version, fijas: 1, comprobar: abrirCodex },
}

/** Abre el app-server instalado y le pregunta por la cuenta, lo primero que hace Sloth con él. Sin sesión también contesta. */
async function abrirCodex() {
  const rpc = new CodexRpc()
  try {
    await rpc.ready
    await rpc.request('account/read', { refreshToken: false })
  } finally {
    rpc.close()
  }
}

/** `0.3.296` → [0, 3, 296]. Las de prueba (`1.0.0-beta.1`) no cuentan. */
const cifras = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : null)

/**
 * Si la versión `v` cabe en el rango de package.json: desde la que nombra, sin tocar las cifras que fija. `^` fija hasta
 * la primera que no es 0 (`^0.3.2` no llega a 0.4, `^1.2.3` no llega a 2); `~`, las dos primeras; sin prefijo, las tres.
 * `fijas` cambia cuántas fija, sea cual sea el prefijo.
 */
export function cabe(v: string, rango: string, fijas?: number): boolean {
  const a = cifras(v)
  const b = cifras(rango.replace(/^[\^~]/, ''))
  if (!a || !b) return false
  fijas ??= rango.startsWith('^') ? (b[0] ? 1 : b[1] ? 2 : 3) : rango.startsWith('~') ? 2 : 3
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return i >= fijas && a[i] > b[i]
  return true
}

async function npm(ruta: string, ms: number) {
  const res = await fetch(`https://registry.npmjs.org/${ruta}`, { signal: AbortSignal.timeout(ms) })
  if (!res.ok) throw new Error(`npm respondió ${res.status}`)
  return res.json()
}

/**
 * La versión del paquete más nueva que cabe en el rango de package.json. Primero pregunta por la última, que es poco; solo
 * si se salió del rango lee la lista entera (~1 MB). `null` si no se pudo preguntar (sin internet).
 */
async function nueva(app: string, agente: Agente): Promise<Publicada | null> {
  const { paquete, fijas } = AGENTES[agente]
  const rango: string = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).dependencies[paquete]
  try {
    const ultima: Publicada = await npm(`${paquete}/latest`, 5000)
    if (cabe(ultima.version, rango, fijas)) return ultima
    const caben = (Object.values((await npm(paquete, 20000)).versions) as Publicada[]).filter((p) => cabe(p.version, rango, fijas))
    const orden = (p: Publicada) => cifras(p.version)!.reduce((n, c) => n * 1e6 + c, 0)
    return caben.sort((x, y) => orden(x) - orden(y)).at(-1) ?? null
  } catch {
    return null
  }
}

/** Corre un comando y devuelve lo que escribió. Si falla, el error lleva el final de la salida. */
export function correr(comando: string, cwd: string): Promise<string> {
  return new Promise((ok, falla) => {
    const proc = spawn(comando, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let salida = ''
    proc.stdout.on('data', (d) => (salida += d))
    proc.stderr.on('data', (d) => (salida += d))
    proc.on('error', falla)
    proc.on('exit', (code) => (code === 0 ? ok(salida.trim()) : falla(new Error(salida.trim().slice(-600) || `${comando} salió con código ${code}`))))
  })
}

/** La que se reconoce (la de Claude Code, no la del SDK). `ultima` es la más nueva a la que se puede actualizar. */
export async function version(app: string, agente: Agente): Promise<VersionClaude> {
  const a = AGENTES[agente]
  let instalada: string | null = null
  try {
    instalada = a.version(JSON.parse(readFileSync(join(app, 'node_modules', a.paquete, 'package.json'), 'utf8'))) ?? null
  } catch {
    // No está instalado.
  }
  // La app que se vende no se actualiza sola: no puede comprobar sus tipos, y los agentes llegan con la siguiente versión.
  if (VENTA || !instalada) return { instalada, ultima: null }
  const n = await nueva(app, agente)
  return { instalada, ultima: (n && a.version(n)) ?? null }
}

/**
 * Pone el paquete en la versión más nueva que cabe en el rango y comprueba que la app funcione con él. Si no, deja
 * package.json, package-lock.json y node_modules como estaban y lanza el error. Quien llama tiene que cerrar antes los
 * procesos del agente (Windows no deja reemplazar un `.exe` en uso) y, con Claude, reiniciar después, porque el SDK viejo
 * sigue cargado en este servidor.
 */
export async function actualizar(app: string, agente: Agente) {
  const a = AGENTES[agente]
  if (VENTA) throw new Error(`${a.nombre} se actualiza con la siguiente versión de Sloth.`)
  const n = await nueva(app, agente)
  if (!n) throw new Error('No se pudo preguntar a npm por la versión nueva. ¿Hay internet?')
  const archivos = ['package.json', 'package-lock.json'].map((f) => join(app, f))
  const antes = archivos.map((f) => readFileSync(f, 'utf8'))
  await correr(`npm install ${a.paquete}@${n.version}`, app)
  try {
    await a.comprobar(app)
  } catch (error) {
    archivos.forEach((f, i) => writeFileSync(f, antes[i]))
    const vuelta = await correr('npm install', app).then(
      () => '',
      (e) => `\n\nY no se pudo volver a instalar la de antes: corre «npm install» en ${app}. ${e.message}`
    )
    throw new Error(`Con ${a.paquete} ${n.version} la app no pasa la comprobación, así que sigue la versión de antes.\n\n${error instanceof Error ? error.message : error}${vuelta}`)
  }
}
