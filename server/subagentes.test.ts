import assert from 'node:assert/strict'
import test from 'node:test'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AgentEvent } from '../shared/types.ts'
import { reader } from './claude.ts'
import { buildTimeline, delHilo, lineaDeSubagente, type Item, type Subagente } from '../web/src/items.ts'

/** Los avisos de tareas, con los campos que mandó el SDK en una prueba real con un subagente que corre un comando. */
const sistema = (m: Record<string, unknown>) => ({ type: 'system', uuid: 'u', session_id: 's', ...m }) as unknown as SDKMessage

test('Claude: cada subagente avisa cuándo empieza y cómo acaba; sus comandos en segundo plano no', () => {
  const events: AgentEvent[] = []
  const leer = reader({ cwd: '.', model: 'haiku', onEvent: (e) => events.push(e), onProviderSession: () => {} }, { idle: true, max: 0, measure: () => {}, tareas: [], detenido: false })
  leer(sistema({ subtype: 'background_tasks_changed', tasks: [{ task_id: 'a1', task_type: 'local_agent', description: 'Dos' }] }))
  leer(sistema({ subtype: 'task_started', task_id: 'a1', tool_use_id: 'toolu_dos', description: 'Dos', task_type: 'local_agent', is_backgrounded: true }))
  leer(sistema({ subtype: 'task_started', task_id: 'b1', tool_use_id: 'toolu_bash', description: 'Sleep 5 seconds', task_type: 'local_bash', parent_task_id: 'a1' }))
  leer(sistema({ subtype: 'task_notification', task_id: 'b1', tool_use_id: 'toolu_bash', status: 'completed', output_file: '', summary: 'Sleep 5 seconds' }))
  leer(sistema({ subtype: 'task_notification', task_id: 'a1', tool_use_id: 'toolu_dos', status: 'completed', output_file: 'a1.output', summary: 'dos' }))
  const subagentes = events.filter((e) => e.t === 'subagent')
  assert.deepEqual(subagentes.map((e) => [e.id, e.status]), [['toolu_dos', 'running'], ['toolu_dos', 'completed']])
  assert.ok(subagentes[1].at >= subagentes[0].at)
})

test('Claude: la compactación avisa cuántos tokens quedaron y vuelve a medir el contexto', () => {
  const events: AgentEvent[] = []
  let medidas = 0
  const leer = reader({ cwd: '.', model: 'haiku', onEvent: (e) => events.push(e), onProviderSession: () => {} }, { idle: false, max: 0, measure: () => medidas++, tareas: [], detenido: false })
  // Lo que mandó el SDK en una prueba real con /compact.
  leer(sistema({ subtype: 'compact_boundary', compact_metadata: { trigger: 'manual', pre_tokens: 20017, post_tokens: 1773 } }))
  assert.deepEqual(events, [{ t: 'info', text: 'Claude compactó el contexto: de 20,017 a 1,773 tokens.' }])
  assert.equal(medidas, 1)
})

/** El subagente que lanzó la herramienta `id`. */
const de = (items: Item[], id: string): Subagente => {
  const item = items.find((i) => i.kind === 'tool' && i.id === id)
  assert.ok(item?.kind === 'tool' && item.subagente)
  return item.subagente
}

/** Un hilo que lanza dos subagentes en segundo plano y acaba su turno mientras ellos siguen. */
const hilo: AgentEvent[] = [
  { t: 'user', text: 'Haz el video', at: 1 },
  { t: 'turn_start', at: 1 },
  { t: 'tool', id: 'uno', name: 'Agent', input: { description: 'Captura', prompt: 'Captura las fuentes', model: 'sonnet', effort: 'medium', run_in_background: true } },
  { t: 'background', tasks: ['Captura'] },
  { t: 'subagent', id: 'uno', status: 'running', at: 1000 },
  { t: 'tool_update', id: 'uno', output: 'Async agent launched successfully.', done: true },
  { t: 'tool', id: 'dos', name: 'Agent', input: { description: 'Pantalla', prompt: 'Recorre el video' } },
  { t: 'background', tasks: ['Captura', 'Pantalla'] },
  { t: 'subagent', id: 'dos', status: 'running', at: 2000 },
  { t: 'tool_update', id: 'dos', output: 'Async agent launched successfully.', done: true },
  { t: 'tool', id: 'c0', name: 'Bash', input: { command: 'ls', description: 'Lista las fuentes' }, parent: 'uno' },
  { t: 'text', id: 'm1', delta: 'Los dos siguen trabajando.' },
  { t: 'turn_end', at: 3000, ok: true },
  { t: 'tool', id: 'c1', name: 'Bash', input: { command: 'node pagina.mjs', description: 'Captura la página' }, parent: 'uno' },
  { t: 'tool', id: 'p1', name: 'Read', input: { file_path: 'C:\\video\\hoja.png' }, parent: 'dos' },
  { t: 'tool_update', id: 'p1', output: '[imagen]', done: true },
  { t: 'text', id: 'p2', delta: 'La **tabla** de momentos\nestá lista.', parent: 'dos' },
  { t: 'subagent', id: 'dos', status: 'completed', at: 9000 },
  { t: 'background', tasks: ['Captura'] }
]

test('el hilo enseña una fila por subagente, y lo suyo va dentro de ella aunque el turno haya acabado', () => {
  const items = buildTimeline(hilo)
  const uno = de(items, 'uno')
  const dos = de(items, 'dos')
  assert.deepEqual(delHilo(items).map((i) => i.key), ['u0', 'tool:uno', 'tool:dos', 'text:m1', 'end12'])
  assert.deepEqual([uno.titulo, uno.encargo, uno.modelo, uno.esfuerzo, uno.estado, uno.desde], ['Captura', 'Captura las fuentes', 'sonnet', 'medium', 'running', 1000])
  // El fin del turno no da por acabado lo que el subagente sigue haciendo.
  assert.deepEqual(uno.items.map((i) => i.kind === 'tool' && i.done), [false, false])
  assert.equal(lineaDeSubagente(uno), 'Comando · Captura la página · node pagina.mjs')
  assert.deepEqual([dos.estado, dos.desde, dos.hasta], ['completed', 2000, 9000])
  assert.equal(lineaDeSubagente(dos), 'La tabla de momentos está lista.')
})

test('si el segundo plano se vacía sin que avise de su fin, el subagente se cortó; si vuelve a empezar, cuenta desde ahí', () => {
  const cortado = buildTimeline([...hilo, { t: 'background', tasks: [] }])
  const uno = de(cortado, 'uno')
  assert.equal(uno.estado, 'stopped')
  assert.ok(uno.items.every((i) => i.kind !== 'tool' || i.done))
  // Su fila dice en qué estaba cuando se cortó.
  assert.equal(lineaDeSubagente(uno), 'Comando · Captura la página · node pagina.mjs')
  assert.equal(de(cortado, 'dos').estado, 'completed')
  const retomado = de(buildTimeline([...hilo, { t: 'background', tasks: [] }, { t: 'subagent', id: 'uno', status: 'running', at: 20000 }]), 'uno')
  assert.deepEqual([retomado.estado, retomado.desde], ['running', 20000])
})

test('en un hilo de antes, sin avisos, trabaja mientras su título sigue en segundo plano', () => {
  const antes = hilo.filter((e) => e.t !== 'subagent')
  assert.deepEqual([de(buildTimeline(antes), 'uno').estado, de(buildTimeline(antes), 'dos').estado], ['running', 'completed'])
  const sinFondo = de(buildTimeline([...antes, { t: 'background', tasks: [] }]), 'uno')
  assert.deepEqual([sinFondo.estado, sinFondo.desde], ['completed', undefined])
})

test('lo de una herramienta que no lanza subagentes sigue suelto en el hilo', () => {
  const items = buildTimeline([
    { t: 'tool', id: 'x', name: 'Bash', input: { command: 'ls' } },
    { t: 'text', id: 'h', delta: 'De un subagente sin su herramienta', parent: 'perdido' }
  ])
  assert.deepEqual(delHilo(items).map((i) => i.key), ['tool:x', 'text:h'])
})
