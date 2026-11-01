import assert from 'node:assert/strict'
import proceso, { execFileSync } from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import test from 'node:test'
import { leer, variablesDeReg, variablesListas } from './opciones.ts'

test('de la respuesta de reg salen todas las variables, con sus espacios', () => {
  const salida = '\r\nHKEY_CURRENT_USER\\Environment\r\n    Path    REG_EXPAND_SZ    C:\\Program Files\\Sloth;%USERPROFILE%\\bin\r\n    TEMP    REG_EXPAND_SZ    %USERPROFILE%\\Temp\r\n    SLOTH_VACIA    REG_SZ    \r\n    MI LLAVE    REG_SZ    abc def\r\n\r\n'
  assert.deepEqual(variablesDeReg(salida), [
    ['Path', 'C:\\Program Files\\Sloth;%USERPROFILE%\\bin'],
    ['TEMP', '%USERPROFILE%\\Temp'],
    ['SLOTH_VACIA', ''],
    ['MI LLAVE', 'abc def']
  ])
})

test('en Windows, leer contesta sin lanzar nada lo mismo que preguntarle a reg', { skip: process.platform !== 'win32' }, async (t) => {
  await variablesListas
  const salida = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', 'TEMP'], { encoding: 'utf8', windowsHide: true })
  const lanzar = t.mock.method(proceso, 'execFileSync')
  syncBuiltinESMExports()
  assert.equal(leer('TEMP'), /REG_\w+\s+(.+)$/m.exec(salida)?.[1].trim())
  assert.equal(leer('SLOTH_ESTA_NO_EXISTE'), '')
  assert.equal(lanzar.mock.callCount(), 0, 'la que no está no lanza reg')
})
