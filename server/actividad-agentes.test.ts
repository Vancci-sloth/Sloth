import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fechaActividad } from '../shared/actividad-agentes.ts'
import type { AgentEvent, SessionMeta } from '../shared/types.ts'
import { actividadAgentes } from './actividad-agentes.ts'
import { guardar } from './disco.ts'

test('agrupa los turnos de un hilo traspasado por agente, modelo registrado y día', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sloth-actividad-'))
  const archivo = join(dir, 'hilo.jsonl')
  t.after(() => rm(dir, { recursive: true, force: true }))

  const at = Date.now()
  const tokens = { input: 23, output: 5, cacheRead: 8 }
  const eventos: AgentEvent[] = [
    { t: 'turn_end', ok: true, at: at - 100 * 864e5, tokens },
    { t: 'turn_end', ok: true, at, tokens },
    { t: 'info', text: 'El hilo pasa de Claude a ChatGPT: tu próximo mensaje le lleva lo hablado, la carpeta y la skill.' },
    { t: 'turn_end', ok: true, at, model: 'codex:gpt', tokens },
    { t: 'turn_end', ok: false, at, model: 'codex:gpt' },
    { t: 'turn_end', ok: true, at, model: 'codex:otro', tokens }
  ]
  guardar(archivo, eventos.map(e => JSON.stringify(e)).join('\n') + '\n{"t":"turn_end"')
  const hilo: SessionMeta = { id: 'hilo', cardId: 'prueba', title: 'Hilo', model: 'codex:otro', cwd: dir, createdAt: at, updatedAt: at, running: false }
  const consultar = actividadAgentes(dir, () => [hilo, { ...hilo, id: 'sin-registro' }])
  const [claude, codex] = await Promise.all([consultar('claude'), consultar('codex')])
  const fecha = fechaActividad(new Date(at))
  assert.deepEqual(claude, [{ ...tokens, fecha, modelo: undefined, turnos: 1, turnosFallidos: 0, turnosConTokens: 1 }])
  assert.deepEqual(codex, [
    { ...tokens, fecha, modelo: 'codex:gpt', turnos: 2, turnosFallidos: 1, turnosConTokens: 1 },
    { ...tokens, fecha, modelo: 'codex:otro', turnos: 1, turnosFallidos: 0, turnosConTokens: 1 }
  ])
})
