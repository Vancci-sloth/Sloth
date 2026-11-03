import { spawn } from 'node:child_process'
import { programaDe, type Proveedor } from '../shared/providers.ts'
import type { VersionClaude } from '../shared/types.ts'
import { rutaAgente, versionFija, versionVisible } from './agentes.ts'

/**
 * La versión de cada agente, que Opciones enseña en su fila: la del programa que se usa (`server/agentes.ts`), que llega
 * con cada versión de Sloth o con «Actualizar los agentes». Sin él, no está instalado.
 */
export type Agente = Proveedor

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

export function version(agente: Agente): VersionClaude {
  if (!rutaAgente(agente)) return { instalada: null }
  // DeepSeek corre en Claude Code: su versión es la de Claude Code.
  return { instalada: versionVisible(programaDe(agente)) ?? versionFija(agente) ?? null }
}
