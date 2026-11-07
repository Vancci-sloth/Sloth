import assert from 'node:assert/strict'
import { createServer as http } from 'node:http'
import { createServer, type Server } from 'node:net'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { consultarPuerto, elegirPuerto, type EnPuerto, puertoLibre } from './puerto.ts'

const APP = 'C:\\Users\\Ana\\AppData\\Local\\Programs\\Sloth\\app'

function con(mapa: Record<number, EnPuerto>, ocupados: number[] = []) {
  const vistos: number[] = []
  return {
    vistos,
    consultar: async (p: number) => (vistos.push(p), mapa[p] ?? { hay: 'nada' as const }),
    libre: async (p: number) => !ocupados.includes(p)
  }
}

test('con nada en 4848, la instalada usa 4848 y levanta su servidor', async () => {
  const d = con({})
  assert.deepEqual(await elegirPuerto({ inicial: 4848, app: APP, ...d }), { puerto: 4848, propio: false })
})

test('si en 4848 está su propio servidor (misma carpeta, sin importar mayúsculas), se engancha', async () => {
  const d = con({ 4848: { hay: 'sloth', app: APP.toLowerCase() } })
  assert.deepEqual(await elegirPuerto({ inicial: 4848, app: APP, ...d }), { puerto: 4848, propio: true })
})

test('si en 4848 está el repo en desarrollo, salta los reservados por Windows y usa el siguiente libre', async () => {
  const reservados = Array.from({ length: 19 }, (_, i) => 4849 + i) // 4849 a 4867
  const d = con({ 4848: { hay: 'sloth', app: 'C:\\codigo\\sloth' } }, reservados)
  assert.deepEqual(await elegirPuerto({ inicial: 4848, app: APP, ...d }), { puerto: 4868, propio: false })
})

test('una Sloth sin carpeta conocida u otro programa en el puerto tampoco son suyos', async () => {
  const d = con({ 5100: { hay: 'sloth' }, 5101: { hay: 'otro' } })
  assert.deepEqual(await elegirPuerto({ inicial: 5100, app: APP, ...d }), { puerto: 5102, propio: false })
})

test('sin puerto libre, error claro', async () => {
  const d = con({}, [5000, 5001, 5002])
  await assert.rejects(elegirPuerto({ inicial: 5000, app: APP, intentos: 2, ...d }), /No encontré un puerto libre/)
})

const escuchar = (s: Server | ReturnType<typeof http>) => new Promise<number>((r) => s.listen(0, '127.0.0.1', () => r((s.address() as AddressInfo).port)))

test('consultarPuerto lee la carpeta de app de /api/state; otra cosa es «otro»; sin respuesta, nada', async (t) => {
  let cuerpo = JSON.stringify({ app: 'C:\\codigo\\sloth', sessions: [] })
  const s = http((_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(cuerpo))
  t.after(() => s.close())
  const p = await escuchar(s)
  assert.deepEqual(await consultarPuerto(p), { hay: 'sloth', app: 'C:\\codigo\\sloth' })
  cuerpo = '<html></html>'
  assert.deepEqual(await consultarPuerto(p), { hay: 'otro' })
  s.close()
  assert.deepEqual(await consultarPuerto(p, 500), { hay: 'nada' })
})

test('puertoLibre: no, si ya escucha alguien; sí, cuando se cierra', async () => {
  const s = createServer()
  const p = await escuchar(s)
  assert.equal(await puertoLibre(p), false)
  await new Promise((r) => s.close(r))
  assert.equal(await puertoLibre(p), true)
})
