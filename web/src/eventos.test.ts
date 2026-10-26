import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentEvent } from '../../shared/types.ts'

/** El servidor de mentira: cada hilo con sus eventos, y las respuestas se sueltan a mano para ver lo que pasa entre medias. */
const servidor = new Map<string, AgentEvent[]>()
const pendientes: (() => void)[] = []
let pedidos: string[] = []
globalThis.fetch = (async (url: string) => {
  const id = /sessions\/([\w-]+)\/historial/.exec(url)![1]
  pedidos.push(id)
  const events = [...(servidor.get(id) ?? [])]
  await new Promise<void>((ok) => pendientes.push(ok))
  return new Response(JSON.stringify({ meta: { id }, events }), { status: 200, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

const { eventos, resumenDe } = await import('./eventos.ts')
// Lo que ve la pantalla: lo que guarda el almacén para cada hilo.
const ve = (id: string) => eventos.lista(id)
const soltar = async () => {
  while (pendientes.length) pendientes.shift()!()
  for (let i = 0; i < 5; i++) await new Promise((ok) => setTimeout(ok, 0))
}
const texto = (n: number): AgentEvent => ({ t: 'text', id: 'x', delta: `${n} ` })
const trabaja = new Set<string>()

test('el abierto se pide una vez; lo que llega mientras tanto se junta, y un hueco lo vuelve a pedir', async () => {
  servidor.set('a', [texto(0), texto(1)])
  eventos.conexion(true)
  eventos.abrir('a', (id) => trabaja.has(id))
  assert.equal(ve('a'), undefined)
  // Llega el evento 2 antes que la respuesta (que no lo trae): no se pierde.
  servidor.get('a')!.push(texto(2))
  eventos.llegan('a', { from: 2, events: [texto(2)] })
  await soltar()
  assert.equal(ve('a')?.length, 3)
  eventos.llegan('a', { from: 3, events: [texto(3)] })
  assert.equal(ve('a')?.length, 4)
  // Lo repetido no se duplica.
  eventos.llegan('a', { from: 3, events: [texto(3)] })
  assert.equal(ve('a')?.length, 4)
  // Un hueco (falta el 4): se pide entero otra vez.
  servidor.get('a')!.push(texto(3), texto(4), texto(5))
  pedidos = []
  eventos.llegan('a', { from: 5, events: [texto(5)] })
  assert.deepEqual(pedidos, ['a'])
  await soltar()
  assert.equal(ve('a')?.length, 6)
})

test('volver a un hilo quieto no lo pide otra vez; uno que trabajó sin mirarlo, sí', async () => {
  servidor.set('b', [texto(0)])
  eventos.abrir('b', (id) => trabaja.has(id))
  await soltar()
  pedidos = []
  eventos.abrir('a', (id) => trabaja.has(id))
  assert.deepEqual(pedidos, [], 'a sigue guardado')
  assert.equal(ve('a')?.length, 6)
  // b empieza un turno mientras miras a: lo guardado de b ya no vale.
  eventos.cambio('b')
  assert.equal(ve('b'), undefined)
  eventos.abrir('b', (id) => trabaja.has(id))
  assert.deepEqual(pedidos, ['b'])
  await soltar()
  // Dejar uno que trabaja no lo guarda: sus eventos dejan de llegar.
  trabaja.add('b')
  eventos.abrir('a', (id) => trabaja.has(id))
  assert.equal(ve('b'), undefined)
  trabaja.delete('b')
})

test('al reconectar, el chat abierto se sigue viendo hasta que llega lo nuevo', async () => {
  eventos.conexion(false)
  servidor.get('a')!.push(texto(6), texto(7))
  eventos.conexion(true)
  const antes = ve('a')
  assert.equal(antes?.length, 6, 'no se vacía')
  // Lo que llega antes de la respuesta no toca lo viejo (iría con hueco) y se junta con lo nuevo.
  servidor.get('a')!.push(texto(8))
  eventos.llegan('a', { from: 8, events: [texto(8)] })
  assert.equal(ve('a'), antes)
  await soltar()
  assert.equal(ve('a')?.length, 9)
  eventos.llegan('a', { from: 9, events: [texto(9)] })
  assert.equal(ve('a')?.length, 10)
})

test('el resumen suma solo lo nuevo y no cambia de objeto si nada cambió', () => {
  const ev: AgentEvent[] = [
    { t: 'turn_start', at: 1000 },
    { t: 'context', used: 10, max: 100 },
    { t: 'turn_end', at: 3000, ok: true, costUsd: 0.5, tokens: { input: 10, cacheRead: 5, output: 7 } as never }
  ]
  const r1 = resumenDe(ev)
  assert.deepEqual({ cost: r1.cost, read: r1.read, out: r1.out, ms: r1.ms, used: r1.context?.used }, { cost: 0.5, read: 15, out: 7, ms: 2000, used: 10 })
  const mas = [...ev, texto(1)]
  assert.equal(resumenDe(mas), r1, 'un trozo de texto no cambia el resumen')
  const r2 = resumenDe([...mas, { t: 'turn_start', at: 5000 }, { t: 'turn_end', at: 6000, ok: false }])
  assert.equal(r2.sinCosto, 1)
  assert.equal(r2.ms, 3000)
  assert.equal(r2.revision, r1.revision + 1)
})
