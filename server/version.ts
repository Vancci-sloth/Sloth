import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { VersionClaude } from '../shared/types.ts'
import { VENTA } from '../shared/venta.ts'

/**
 * La versión de Claude Code y el botón que la pone al día, como en los ajustes de T3 Code. Claude es el paquete
 * `@anthropic-ai/claude-agent-sdk` de este repo, que trae su propio Claude Code: se actualiza con npm y Sloth se reinicia
 * para cargarlo. Solo dentro del rango que declara package.json (`^0.3.296`): en un SDK 0.x, la cifra de en medio (0.4)
 * cambia su API, y saltar a ella podía dejar la app sin arrancar.
 */
const SDK = '@anthropic-ai/claude-agent-sdk'

/** `0.3.296` → [0, 3, 296]. Las de prueba (`1.0.0-beta.1`) no cuentan. */
const cifras = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : null)

/**
 * Si la versión `v` cabe en el rango de package.json: desde la que nombra, sin tocar las cifras que fija. `^` fija hasta
 * la primera que no es 0 (`^0.3.2` no llega a 0.4, `^1.2.3` no llega a 2); `~`, las dos primeras; sin prefijo, las tres.
 */
function cabe(v: string, rango: string): boolean {
  const a = cifras(v)
  const b = cifras(rango.replace(/^[\^~]/, ''))
  if (!a || !b) return false
  const fijas = rango.startsWith('^') ? (b[0] ? 1 : b[1] ? 2 : 3) : rango.startsWith('~') ? 2 : 3
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return i >= fijas && a[i] > b[i]
  return true
}

async function npm(ruta: string, ms: number) {
  const res = await fetch(`https://registry.npmjs.org/${ruta}`, { signal: AbortSignal.timeout(ms) })
  if (!res.ok) throw new Error(`npm respondió ${res.status}`)
  return res.json()
}

type Publicada = { version: string; claudeCodeVersion?: string }

/**
 * La versión del SDK más nueva que cabe en el rango de package.json. Primero pregunta por la última, que es poco; solo si
 * se salió del rango lee la lista entera (~1 MB). `null` si no se pudo preguntar (sin internet).
 */
async function nueva(app: string): Promise<Publicada | null> {
  const rango: string = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).dependencies[SDK]
  try {
    const ultima: Publicada = await npm(`${SDK}/latest`, 5000)
    if (cabe(ultima.version, rango)) return ultima
    const caben = (Object.values((await npm(SDK, 20000)).versions) as Publicada[]).filter((p) => cabe(p.version, rango))
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

/** La de Claude Code, no la del SDK: es la que se reconoce. `ultima` es la más nueva a la que se puede actualizar. */
export async function versionClaude(app: string): Promise<VersionClaude> {
  const sdk = JSON.parse(readFileSync(join(app, 'node_modules', SDK, 'package.json'), 'utf8'))
  // La app que se vende no se actualiza sola: no puede comprobar sus tipos, y Claude Code llega con la siguiente versión.
  if (VENTA) return { instalada: sdk.claudeCodeVersion ?? null, ultima: null }
  return { instalada: sdk.claudeCodeVersion ?? null, ultima: (await nueva(app))?.claudeCodeVersion ?? null }
}

/** La de Codex (`@openai/codex` de este repo). Llega al día con Sloth: aquí solo se enseña, no se actualiza. */
export function versionCodex(app: string): VersionClaude {
  try {
    return { instalada: JSON.parse(readFileSync(join(app, 'node_modules', '@openai', 'codex', 'package.json'), 'utf8')).version ?? null, ultima: null }
  } catch {
    return { instalada: null, ultima: null }
  }
}

/**
 * Pone el SDK en la versión más nueva que cabe en el rango y comprueba los tipos. Si la app no compila con ella, deja
 * package.json, package-lock.json y node_modules como estaban y lanza el error. Quien llama tiene que cerrar antes los
 * procesos de Claude (Windows no deja reemplazar un `.exe` en uso) y reiniciar después, porque el SDK viejo sigue cargado
 * en este servidor.
 */
export async function actualizar(app: string) {
  if (VENTA) throw new Error('Claude Code se actualiza con la siguiente versión de Sloth.')
  const n = await nueva(app)
  if (!n) throw new Error('No se pudo preguntar a npm por la versión nueva. ¿Hay internet?')
  const archivos = ['package.json', 'package-lock.json'].map((f) => join(app, f))
  const antes = archivos.map((f) => readFileSync(f, 'utf8'))
  await correr(`npm install ${SDK}@${n.version}`, app)
  try {
    await correr('npm run typecheck', app)
  } catch (error) {
    archivos.forEach((f, i) => writeFileSync(f, antes[i]))
    const vuelta = await correr('npm install', app).then(
      () => '',
      (e) => `\n\nY no se pudo volver a instalar la de antes: corre «npm install» en ${app}. ${e.message}`
    )
    throw new Error(`Con el SDK ${n.version} la app no pasa la comprobación de tipos, así que sigue la versión de antes.\n\n${error instanceof Error ? error.message : error}${vuelta}`)
  }
}
