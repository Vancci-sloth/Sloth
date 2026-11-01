import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import type { Card, ServerPush, SessionMeta } from '../shared/types.ts'
import type { Sessions } from './sessions.ts'

const vigilantes: { cerrado: boolean; cambio(evento: string, ruta: string): void }[] = []
;(globalThis as any).__slothVigilarPrueba = (_ruta: string, _opciones: unknown, cambio: (evento: string, ruta: string) => void) => {
  const w = Object.assign(new EventEmitter(), { cerrado: false, cambio, close() { w.cerrado = true } })
  vigilantes.push(w)
  return w
}
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'node:fs' && /\/etapas\.ts$/.test(context.parentURL ?? '')) {
    return { url: 'data:text/javascript,export * from "node:fs";export const watch=(...args)=>globalThis.__slothVigilarPrueba(...args)', shortCircuit: true }
  }
  return next(specifier, context)
} })
const { cerrarVigilantesOciosos, etapasApi } = await import('./etapas.ts')

test('los vigilantes activos se conservan; los ociosos se cierran y se reabren al volver al hilo', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() })
  const dir = mkdtempSync(join(tmpdir(), 'sloth-vigilantes-'))
  t.after(() => {
    t.mock.timers.tick(600_000)
    cerrarVigilantesOciosos([])
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()))
    rmSync(dir, { recursive: true, force: true })
  })
  const meta: SessionMeta = { id: 'hilo', cardId: 'prueba', title: 'Prueba', model: 'claude-prueba', cwd: dir, createdAt: 0, updatedAt: 0, running: false }
  const card: Card = { id: 'prueba', title: 'Prueba', description: '', cwd: dir, etapas: [{ nombre: 'Guion', listo: '*.md', muestra: '*.md' }] }
  const sessions = { meta: () => meta, list: () => [meta] } as unknown as Sessions
  const avisos: ServerPush[] = []
  const abrir = () => etapasApi({ method: 'GET' } as IncomingMessage, { writeHead() {}, end() {} } as unknown as ServerResponse, new URL('http://localhost/api/sessions/hilo/etapas'), sessions, [card], (a) => avisos.push(a), async (f) => f)
  await abrir()
  const primero = vigilantes.at(-1)!
  await abrir()
  assert.equal(vigilantes.at(-1), primero, 'una carpeta comparte su vigilante')
  t.mock.timers.tick(600_000)
  cerrarVigilantesOciosos([dir])
  assert.equal(primero.cerrado, false)
  primero.cambio('change', 'guion.md')
  t.mock.timers.tick(300)
  assert.equal(avisos.length, 1)
  t.mock.timers.tick(300_000)
  cerrarVigilantesOciosos([])
  assert.equal(primero.cerrado, true)
  await abrir()
  assert.notEqual(vigilantes.at(-1), primero)
  vigilantes.at(-1)!.cambio('change', 'guion.md')
  t.mock.timers.tick(300)
  assert.equal(avisos.length, 2)
})
