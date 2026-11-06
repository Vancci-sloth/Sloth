import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import test from 'node:test'
import type { AgentEvent } from '../shared/types.ts'
import type { AgentOptions } from './agent.ts'
import { resumenDelHilo } from './relevo.ts'
import { Sessions } from './sessions.ts'

const at = 1

test('el resumen lleva el encargo, lo último de cada turno y los archivos, y no el error', () => {
  const r = resumenDelHilo([
    { t: 'user', text: 'Haz el video', at },
    { t: 'turn_start', at },
    { t: 'text', id: '1:0', delta: 'Empiezo' },
    { t: 'tool', id: 't', name: 'Write', input: { file_path: 'C:/v/guion.md' } },
    { t: 'text', id: '1:1', delta: 'Guion ' },
    { t: 'text', id: '1:1', delta: 'listo' },
    { t: 'turn_end', at, ok: true },
    { t: 'user', text: 'Sigue', at },
    { t: 'turn_start', at },
    { t: 'text', id: '2:0', delta: 'Requested token count exceeds…' },
    { t: 'turn_end', at, ok: false }
  ], 'C:/v')
  assert.match(r, /Usuario: Haz el video\n\nTú: Guion listo\n\nUsuario: Sigue\n\nCarpeta del trabajo: C:\/v\n\nArchivos que tocaste: C:\/v\/guion\.md/)
  assert.doesNotMatch(r, /Empiezo|Requested/)
})

test('un hilo enorme cabe: se queda con el encargo y lo más reciente', () => {
  const events: AgentEvent[] = Array.from({ length: 300 }, (_, i) => ({ t: 'user', text: `${i} ${'x'.repeat(5000)}`, at }))
  const r = resumenDelHilo(events)
  assert.ok(r.length < 26_000)
  assert.match(r, /Usuario: 0 /)
  assert.match(r, /Usuario: 299 /)
  assert.match(r, /mensajes omitidos/)
})

function preparar(t: test.TestContext, model = 'antigravity:x') {
  const dir = mkdtempSync(join(tmpdir(), 'sloth-relevo-'))
  const eventos: AgentEvent[] = []
  const enviados: string[] = []
  const skills: (string | undefined)[] = []
  const reanudar: (string | undefined)[] = []
  let opciones!: AgentOptions
  let cierres = 0
  const sessions = new Sessions(dir, (_, __, events) => eventos.push(...events), () => {}, () => {}, () => {}, (opts) => {
    opciones = opts
    reanudar.push(opts.resume)
    return { send(text, skill) { enviados.push(text); skills.push(skill?.name) }, steer() {}, async interrupt() {}, close() { cierres++ } }
  })
  const meta = sessions.create({ cardId: 'sloth', cwd: dir, title: 'Prueba', model })
  t.after(() => { sessions.closeAll(); rmSync(dir, { recursive: true, force: true }) })
  return { sessions, meta, eventos, enviados, skills, reanudar, cierres: () => cierres, emitir: (e: AgentEvent) => opciones.onEvent(e), sesion: (id: string) => opciones.onProviderSession(id) }
}

test('Claude llega al límite a media tarea y el hilo pasa a ChatGPT con lo hablado, sus tareas y la skill', async (t) => {
  const h = preparar(t, 'claude-opus-5-5')
  h.sessions.send(h.meta.id, 'Haz el video de 45 escenas', { name: 'video-explicativo' })
  h.sesion('de-claude')
  h.emitir({ t: 'text', id: 'a', delta: 'Escena 23 lista, sigo con la 24.' })
  h.emitir({ t: 'tool', id: 'p', name: 'TodoWrite', input: { todos: [{ content: 'Escenas 1-23', status: 'completed' }, { content: 'Escena 24', status: 'in_progress' }] } })
  h.emitir({ t: 'text', id: 'b', delta: "You've hit your 5-hour limit · resets 6:50pm" })
  h.emitir({ t: 'turn_end', at, ok: false, error: "You've hit your 5-hour limit · resets 6:50pm" })
  // El error recuerda de quién era, aunque el hilo pase a otro.
  const fin = h.eventos.findLast((e) => e.t === 'turn_end')
  assert.equal(fin?.t === 'turn_end' && fin.agente, 'claude')

  h.sessions.setModel(h.meta.id, 'codex:gpt-5.6', 'high')
  assert.equal(h.cierres(), 1)
  assert.equal(h.meta.providerSessionId, undefined)
  assert.equal(h.meta.vieneDe, 'claude')
  assert.ok(h.eventos.some((e) => e.t === 'info' && /de Claude a ChatGPT/.test(e.text)))

  h.sessions.send(h.meta.id, 'Sigue donde te quedaste.')
  const pasado = h.enviados[1]
  assert.match(pasado, /lo llevaba Claude/)
  assert.match(pasado, /Claude: Escena 23 lista/)
  assert.match(pasado, /\[x\] Escenas 1-23\n- \[en curso\] Escena 24/)
  assert.match(pasado, /\.jsonl/)
  assert.doesNotMatch(pasado, /hit your/)
  assert.match(pasado, /<\/historial>\n\nSigue donde te quedaste\.$/)
  // Sesión nueva, y vuelve a pedir la skill del hilo.
  assert.deepEqual(h.reanudar, [undefined, undefined])
  assert.equal(h.skills[1], 'video-explicativo')
  h.sesion('de-codex')
  assert.equal(h.meta.vieneDe, undefined)
})

test('cambiar de modelo sin cambiar de agente no abre otra sesión', (t) => {
  const h = preparar(t, 'claude-opus-5-5')
  h.sessions.send(h.meta.id, 'Hola')
  h.sesion('de-claude')
  h.emitir({ t: 'turn_end', at, ok: true })
  h.sessions.setModel(h.meta.id, 'claude-sonnet-5-5')
  assert.equal(h.meta.providerSessionId, 'de-claude')
  assert.equal(h.meta.resumir, undefined)
})

test('una sesión agotada se cambia por otra, con el resumen, y el hilo sigue solo', async (t) => {
  const h = preparar(t)
  h.sessions.send(h.meta.id, 'Haz el video')
  h.sesion('vieja')
  h.emitir({ t: 'turn_end', at, ok: false, error: 'Se pasó', caida: true, relevo: 'sigue' })
  await setTimeout(10)
  assert.equal(h.cierres(), 1)
  assert.deepEqual(h.reanudar, [undefined, undefined])
  assert.equal(h.meta.running, true)
  assert.match(h.enviados[1], /<historial>[\s\S]*Usuario: Haz el video[\s\S]*<\/historial>\n\nSigue con lo que estabas haciendo/)
  h.sesion('nueva')
  assert.equal(h.meta.resumir, undefined)
  // La siguiente vez ya no lleva resumen.
  h.emitir({ t: 'turn_end', at, ok: true })
  h.sessions.send(h.meta.id, 'Otra cosa')
  assert.equal(h.enviados[2], 'Otra cosa')
  assert.deepEqual(h.reanudar, [undefined, undefined])
})

test('sin retomar para siempre: tras dos relevos seguidos espera a que le escribas', async (t) => {
  const h = preparar(t)
  h.sessions.send(h.meta.id, 'Haz el video')
  for (let i = 0; i < 3; i++) {
    h.emitir({ t: 'turn_end', at, ok: false, error: 'Se pasó', caida: true, relevo: 'sigue' })
    await setTimeout(10)
  }
  assert.equal(h.enviados.length, 3)
  assert.equal(h.meta.running, false)
  assert.ok(h.eventos.some((e) => e.t === 'info' && e.text.startsWith('Tu próximo mensaje')))
  h.sessions.send(h.meta.id, 'Vuelve')
  assert.match(h.enviados[3], /<historial>[\s\S]*\n\nVuelve$/)
})

test('un relevo que espera no arranca solo: lo lleva el siguiente mensaje', async (t) => {
  const h = preparar(t)
  h.sessions.send(h.meta.id, 'Haz el video')
  h.sesion('vieja')
  h.emitir({ t: 'turn_end', at, ok: false, error: 'lo detuviste', relevo: 'espera' })
  await setTimeout(10)
  assert.equal(h.enviados.length, 1)
  assert.equal(h.meta.running, false)
  h.sessions.send(h.meta.id, 'Cámbialo')
  assert.match(h.enviados[1], /<historial>[\s\S]*Cámbialo$/)
})
