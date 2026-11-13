import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nombreVc, sinSocio } from './voz/voices-cloning.ts'

test('las voces de Edge en Voices Cloning se nombran como persona y país, no con su nombre técnico', () => {
  assert.equal(nombreVc('es-AR-ElenaNeural'), 'Elena (Argentina)')
  assert.equal(nombreVc('es-MX-DaliaNeural'), 'Dalia (México)')
  assert.equal(nombreVc('es-ES-XimenaMultilingualNeural'), 'Ximena (España)')
  // Las demás, tal cual.
  assert.equal(nombreVc('Elias - Spanish, Natural, Storyteller'), 'Elias - Spanish, Natural, Storyteller')
})

test('los errores del cobro le llegan al cliente como de las voces de Sloth', () => {
  assert.equal(sinSocio('Se te acabaron los créditos de voz de Voices Cloning. Pídele más al creador de Sloth o usa otra voz.'), 'Se te acabaron los créditos de voz de Sloth. Pídele más al creador de Sloth o usa otra voz.')
  assert.equal(sinSocio('Voices Cloning tiene mucha demanda ahora.'), 'Las voces de Sloth tiene mucha demanda ahora.')
  assert.equal(sinSocio('Se llegó al tope del día de las voces de Voices Cloning en Sloth.'), 'Se llegó al tope del día de las voces de Sloth.')
  assert.equal(sinSocio('Tu usuario de voces de Voices Cloning está suspendido.'), 'Tu usuario de las voces de Sloth está suspendido.')
  assert.equal(sinSocio('Sin créditos.'), 'Sin créditos.')
})
