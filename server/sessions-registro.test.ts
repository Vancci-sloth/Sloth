import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import type { AgentOptions } from './agent.ts'
import { Sessions } from './sessions.ts'

test('el registro abierto escribe cada evento en el disco al momento, y el hilo se borra con él abierto', (t) => {
  const base = resolve('data')
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, 'prueba-sesiones-registro-'))
  let emitir!: AgentOptions['onEvent']
  const crear = () => new Sessions(dir, () => {}, () => {}, () => {}, () => {}, (opts) => {
    emitir = opts.onEvent
    return { send() {}, steer() {}, async interrupt() {}, close() {} }
  })
  const a = crear()
  t.after(() => {
    a.closeAll()
    rmSync(dir, { recursive: true, force: true })
  })
  const meta = a.create({ cardId: 'prueba', title: 'Prueba', model: 'codex:prueba', cwd: dir })
  const registro = join(dir, `${meta.id}.jsonl`)
  const lineas = () => readFileSync(registro, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  a.send(meta.id, 'Hola')
  emitir({ t: 'text', id: 'x', delta: 'Uno' })
  // Sin cerrar nada: lo de cada evento ya está en el disco.
  assert.deepEqual(lineas().map((e) => e.t), ['user', 'turn_start', 'text'])
  emitir({ t: 'text', id: 'x', delta: ' dos' })
  assert.equal(lineas().at(-1).delta, ' dos')
  // Cerrado por quieto, el siguiente evento lo vuelve a abrir y sigue al final.
  a.cerrarRegistros(true)
  emitir({ t: 'turn_end', at: Date.now(), ok: true })
  assert.deepEqual(lineas().map((e) => e.t), ['user', 'turn_start', 'text', 'text', 'turn_end'])
  // Lo lee igual otro Sloth (tras un reinicio).
  a.closeAll()
  assert.equal(crear().get(meta.id)!.events.length, 5)
  // Borrar el hilo con su registro abierto (en Windows, un archivo abierto no siempre se deja borrar).
  emitir({ t: 'info', text: 'algo' })
  a.remove(meta.id)
  assert.equal(existsSync(registro), false)
})
