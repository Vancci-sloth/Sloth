import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
// @ts-expect-error: el generador es JavaScript y no trae tipos.
import { texto } from '../../scripts/estilos.mjs'

test('los estilos del celular van al día con cards.json y las skills (si no: node scripts/estilos.mjs en movil/)', () => {
  const guardado = readFileSync(join(import.meta.dirname, 'estilos.json'), 'utf8').replace(/\r\n/g, '\n')
  assert.equal(guardado, texto())
})
