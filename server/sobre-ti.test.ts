import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conSobreTi } from './sobre-ti.ts'

test('sin nada contado, las instrucciones quedan igual', () => {
  assert.equal(conSobreTi('Base', ''), 'Base')
})

test('lo contado va después de las instrucciones, entre sus etiquetas', () => {
  const r = conSobreTi('Base', 'Tengo un canal de cocina.')
  assert.ok(r.startsWith('Base\n'))
  assert.match(r, /<sobre-ti>\nTengo un canal de cocina\.\n<\/sobre-ti>$/)
})
