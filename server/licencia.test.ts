import assert from 'node:assert/strict'
import proceso, { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { equipoDeEstaComputadora, licencia } from './licencia.ts'

test('saber qué computadora es no detiene el arranque, y quien lo necesita espera a saberlo', async (t) => {
  const app = mkdtempSync(join(tmpdir(), 'sloth-licencia-'))
  t.after(() => rmSync(app, { recursive: true, force: true }))
  const lanzar = t.mock.method(proceso, 'execFileSync')
  syncBuiltinESMExports()
  const l = licencia(app)
  assert.equal(lanzar.mock.callCount(), 0, 'preguntarle al sistema no va en este hilo')
  // Sin clave no hay credencial, y la respuesta llega cuando ya se sabe el equipo.
  assert.equal(await l.credencial(), undefined)
})

test('al abrir con lo guardado ya vencido, la credencial espera a lo que diga el cobro: quien apoya no pregunta por lo nuevo sin su clave', async (t) => {
  const app = mkdtempSync(join(tmpdir(), 'sloth-licencia-'))
  t.after(() => rmSync(app, { recursive: true, force: true }))
  mkdirSync(join(app, 'data'))
  // Una semana sin abrir Sloth: la clave sigue ahí, pero lo que firmó el cobro ya no vale.
  writeFileSync(join(app, 'data', 'licencia.json'), JSON.stringify({ clave: 'SLOTH-AAAA-BBBB-CCCC-DDDD' }))
  let contestar = (_: Response) => {}
  let pedidas = 0
  t.mock.method(globalThis, 'fetch', () => (pedidas++, new Promise<Response>((ok) => (contestar = ok))))
  const l = licencia(app)
  let lista = false
  const credencial = l.credencial().then((c) => ((lista = true), c))
  while (!pedidas) await new Promise((ok) => setTimeout(ok, 20))
  await new Promise((ok) => setTimeout(ok, 50))
  assert.equal(lista, false, 'no contesta sin la clave mientras el cobro no responde')
  // El cobro dice que esa clave ya no existe: entonces sí, sin credencial.
  contestar(new Response('{"error":"No encontramos esa clave."}', { status: 404 }))
  assert.equal(await credencial, undefined)
})

test('en Windows, el equipo sigue saliendo del MachineGuid: si cambia, ninguna licencia vale', { skip: process.platform !== 'win32' }, async () => {
  const salida = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true })
  const guid = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(salida)![1]
  assert.equal(await equipoDeEstaComputadora(), createHash('sha256').update(`sloth:${guid}`).digest('hex').slice(0, 32))
})
