import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VENTA } from '../shared/venta.ts'

/** Este repo, cuando Sloth corre desde aquí. */
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** Donde trabaja la copia del repo: fuera de él. Espacio en disco la mira también desde la instalada. */
export const TRABAJO_DEV = join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'sloth-dev', 'trabajo')

/**
 * La carpeta donde trabajan los hilos de video y de Ideas: `<app>/trabajo` en la app que se vende. Corriendo desde el
 * repo va fuera de él, porque dentro Claude y Codex leerían en cada hilo las reglas para programar Sloth (CLAUDE.md y
 * AGENTS.md), y un video de prueba no se haría como en la computadora de un cliente.
 */
export const carpetaTrabajo = (app: string) => (!VENTA && resolve(app) === REPO ? TRABAJO_DEV : join(app, 'trabajo'))
