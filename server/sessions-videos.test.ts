import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { AgentEvent, SessionMeta } from '../shared/types.ts'
import { avisoDeVideos, VIDEOS_SIN_AVISO } from '../shared/limites.ts'
import type { AgentOptions } from './agent.ts'
import { Sessions } from './sessions.ts'

function preparar(t: test.TestContext) {
  const dir = mkdtempSync(join(tmpdir(), 'sloth-videos-'))
  const emitir = new Map<string, AgentOptions['onEvent']>()
  const recibido = new Map<string, string[]>()
  const anota = (hilo: string, texto: string) => void recibido.set(hilo, [...(recibido.get(hilo) ?? []), texto])
  const sessions = new Sessions(dir, () => {}, () => {}, () => {}, () => {}, (opts) => {
    emitir.set(opts.hilo!, opts.onEvent)
    return { send: (texto: string) => anota(opts.hilo!, texto), steer: (texto: string) => anota(opts.hilo!, texto), compact() {}, async interrupt() {}, close() {} }
  })
  sessions.esVideo = (meta) => meta.cardId === 'video'
  t.after(() => {
    sessions.closeAll()
    rmSync(dir, { recursive: true, force: true })
  })
  const hilo = (cardId = 'video') => sessions.create({ cardId, cwd: dir, title: 'Prueba', model: 'codex:gpt-prueba' })
  const acaba = (meta: SessionMeta) => emitir.get(meta.id)!({ t: 'turn_end', at: Date.now(), ok: true } as AgentEvent)
  const fondo = (meta: SessionMeta, tasks: string[]) => emitir.get(meta.id)!({ t: 'background', tasks })
  return { sessions, hilo, acaba, fondo, recibido }
}

test(`hasta ${VIDEOS_SIN_AVISO} videos no hay aviso; con más, lo hay y dice cuántos serían`, () => {
  assert.equal(avisoDeVideos(0), undefined)
  assert.equal(avisoDeVideos(1), undefined)
  assert.match(avisoDeVideos(2)!, /Ya hay 2 videos trabajando y con este serían 3/)
  assert.match(avisoDeVideos(1, 3)!, /Ya hay 1 video trabajando y con estos serían 4/)
  assert.match(avisoDeVideos(0, 5)!, /^Son 5 videos\./)
  assert.equal(avisoDeVideos(0, 2), undefined)
})

test('Sloth no frena videos: un tercero confirmado arranca enseguida, sin cola', (t) => {
  const h = preparar(t)
  const [a, b, c] = [h.hilo(), h.hilo(), h.hilo()]
  for (const [m, texto] of [[a, 'uno'], [b, 'dos'], [c, 'tres']] as const) h.sessions.send(m.id, texto)
  assert.equal(h.sessions.videosTrabajando(), 3)
  assert.deepEqual(h.recibido.get(c.id), ['tres'])
  assert.equal(c.pendiente, undefined)
})

test('solo pregunta lo que pone a trabajar un video más', (t) => {
  const h = preparar(t)
  const [quieto, trabajando, deFondo, otro] = [h.hilo(), h.hilo(), h.hilo(), h.hilo('ideas')]
  h.sessions.send(trabajando.id, 'uno')
  h.sessions.send(deFondo.id, 'dos')
  h.fondo(deFondo, ['escenas'])
  h.acaba(deFondo)

  assert.equal(h.sessions.sumaVideo(quieto), true)
  assert.equal(h.sessions.sumaVideo(trabajando), false)
  assert.equal(h.sessions.sumaVideo(deFondo), false)
  assert.equal(h.sessions.sumaVideo(otro), false)
  h.fondo(deFondo, [])
})
