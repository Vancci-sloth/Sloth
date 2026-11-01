import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import test from 'node:test'
import { preguntarAlRegistro } from './registro.ts'

test('el registro contesta aunque el servidor lance programas largos en ese momento', { skip: process.platform !== 'win32' }, async (t) => {
  const largos: ReturnType<typeof spawn>[] = []
  t.after(() => largos.forEach((p) => p.kill()))
  // Uno que nace mientras \`reg\` corre hereda sus tuberías: con ellas, la respuesta esperaba a que ese acabara.
  const reloj = setInterval(() => largos.push(spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'], { stdio: 'ignore', windowsHide: true })), 2)
  t.after(() => clearInterval(reloj))
  const antes = performance.now()
  const salida = await preguntarAlRegistro(['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'])
  clearInterval(reloj)
  assert.match(salida, /MachineGuid\s+REG_SZ\s+\S+/)
  assert.ok(performance.now() - antes < 4000, 'no espera a los otros programas')
})
