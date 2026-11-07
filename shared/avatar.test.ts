import assert from 'node:assert/strict'
import { test } from 'node:test'
import { esMotor, lineaAvatar, MOTORES, motorDeLinea } from './avatar.ts'

test('sin motor, o con sprites, no hay línea Avatar: es lo de siempre', () => {
  assert.equal(lineaAvatar(undefined), '')
  assert.equal(lineaAvatar('sprites'), '')
  assert.equal(lineaAvatar('otro'), '')
  assert.equal(lineaAvatar('heygen'), 'Avatar: heygen (cómo, en video-base/AVATAR.md; si no se puede, usa sprites).')
})

test('la línea Avatar se lee de vuelta, y solo con un motor que existe', () => {
  for (const m of MOTORES.filter((x) => x.id !== 'sprites')) assert.equal(motorDeLinea(`Hazlo.\n\n${lineaAvatar(m.id)}`), m.id)
  assert.equal(motorDeLinea('Avatar: inventado'), undefined)
  assert.ok(esMotor('comfyui-local') && !esMotor('nube'))
})
