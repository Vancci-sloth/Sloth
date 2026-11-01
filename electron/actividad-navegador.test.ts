import assert from 'node:assert/strict'
import test from 'node:test'
import { actividadNavegador } from './actividad-navegador.ts'

const vaciar = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

test('dos herramientas solapadas mantienen despierta la página hasta acabar la última y vuelven a reposo', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const cambios: boolean[] = []
  const actividad = actividadNavegador((ahorro) => { cambios.push(ahorro) })
  let soltarA!: () => void
  let soltarB!: () => void
  const a = actividad.usar(() => new Promise<void>((ok) => { soltarA = ok }))
  const b = actividad.usar(() => new Promise<void>((ok) => { soltarB = ok }))
  await vaciar()
  assert.deepEqual(cambios, [true, false])
  soltarA(); await a
  t.mock.timers.tick(30_000)
  await vaciar()
  assert.deepEqual(cambios, [true, false], 'una herramienta larga sigue protegida')
  soltarB(); await b
  t.mock.timers.tick(5000)
  await vaciar()
  assert.deepEqual(cambios, [true, false, true])
  actividad.cerrar()
})

test('un fallo libera el uso; visible sigue despierta, y cerrada no deja relojes ni cambios tardíos', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const cambios: boolean[] = []
  const actividad = actividadNavegador((ahorro) => { cambios.push(ahorro) })
  await assert.rejects(actividad.usar(async () => { throw new Error('falló') }))
  actividad.ver(true)
  t.mock.timers.tick(10_000)
  await vaciar()
  assert.equal(cambios.at(-1), false)
  actividad.ver(false)
  actividad.cerrar()
  t.mock.timers.tick(10_000)
  await vaciar()
  assert.equal(cambios.at(-1), false)
})
