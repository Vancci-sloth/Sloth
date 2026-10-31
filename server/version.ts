import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { programaDe, type Proveedor } from '../shared/providers.ts'
import type { VersionClaude } from '../shared/types.ts'
import { rutaAgente, versionFija } from './agentes.ts'

/**
 * La versión de cada agente, que Opciones enseña en su fila. Son paquetes de este repo y llegan al día con cada versión
 * de Sloth; aquí no se actualizan. Su programa se baja aparte, al elegirlos (`server/agentes.ts`): sin él, no está
 * instalado.
 */
export type Agente = Proveedor

type Publicada = { version: string; claudeCodeVersion?: string }

/** Los que trae la app como paquete; los demás fijan su versión al bajarse (`versionFija`, server/agentes.ts). */
const AGENTES: Partial<Record<Agente, { paquete: string; version(p: Publicada): string | undefined }>> = {
  // La que se reconoce es la de Claude Code, no la del SDK.
  claude: { paquete: '@anthropic-ai/claude-agent-sdk', version: (p) => p.claudeCodeVersion },
  codex: { paquete: '@openai/codex', version: (p) => p.version },
  opencode: { paquete: '@opencode/client', version: (p) => p.version },
}

/** Corre un comando y devuelve lo que escribió. Si falla, el error lleva el final de la salida. */
export function correr(comando: string, cwd: string, env?: Record<string, string>): Promise<string> {
  return new Promise((ok, falla) => {
    const proc = spawn(comando, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'], ...(env ? { env: { ...process.env, ...env } } : {}) })
    let salida = ''
    proc.stdout.on('data', (d) => (salida += d))
    proc.stderr.on('data', (d) => (salida += d))
    proc.on('error', falla)
    proc.on('exit', (code) => (code === 0 ? ok(salida.trim()) : falla(new Error(salida.trim().slice(-600) || `${comando} salió con código ${code}`))))
  })
}

export function version(app: string, agente: Agente): VersionClaude {
  // DeepSeek corre en Claude Code: su versión es la de Claude Code.
  const a = AGENTES[programaDe(agente)]
  if (!rutaAgente(agente)) return { instalada: null }
  if (!a) return { instalada: versionFija(agente) ?? null }
  try {
    return { instalada: a.version(JSON.parse(readFileSync(join(app, 'node_modules', a.paquete, 'package.json'), 'utf8'))) ?? null }
  } catch {
    return { instalada: null } // No está instalado.
  }
}
