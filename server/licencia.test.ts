import assert from 'node:assert/strict'
import proceso, { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
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

test('en Windows, el equipo sigue saliendo del MachineGuid: si cambia, ninguna licencia vale', { skip: process.platform !== 'win32' }, async () => {
  const salida = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true })
  const guid = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(salida)![1]
  assert.equal(await equipoDeEstaComputadora(), createHash('sha256').update(`sloth:${guid}`).digest('hex').slice(0, 32))
})
