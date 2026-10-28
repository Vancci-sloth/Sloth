import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { VersionClaude } from '../shared/types.ts'

/**
 * La versión de cada agente, que Opciones enseña en su fila. Los dos son paquetes de este repo y llegan al día con cada
 * versión de Sloth; aquí no se actualizan.
 */
export type Agente = 'claude' | 'codex'

type Publicada = { version: string; claudeCodeVersion?: string }

const AGENTES: Record<Agente, { paquete: string; version(p: Publicada): string | undefined }> = {
  // La que se reconoce es la de Claude Code, no la del SDK.
  claude: { paquete: '@anthropic-ai/claude-agent-sdk', version: (p) => p.claudeCodeVersion },
  codex: { paquete: '@openai/codex', version: (p) => p.version },
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

export function version(app: string, agente: Agente): VersionClaude {
  const a = AGENTES[agente]
  try {
    return { instalada: a.version(JSON.parse(readFileSync(join(app, 'node_modules', a.paquete, 'package.json'), 'utf8'))) ?? null }
  } catch {
    return { instalada: null } // No está instalado.
  }
}
