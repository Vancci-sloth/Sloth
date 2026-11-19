import assert from 'node:assert/strict'
import test from 'node:test'
import { CAMPOS_GUIA, CON_QUE, faltaEnEstilo, faltaEnGuia, guiaDe, PARA_QUE_AGENTES, PRUEBA, pruebaDe, VIDEO_ENTERO } from './guia.ts'
import type { GuiaEstilo } from './types.ts'

const textos = { das: 'Solo el tema del video.', entrega: 'Un vertical de 30 segundos.', ejemplo: 'Hazme un video del ciclo del agua.' }
const guia: GuiaEstilo = { ...textos, herramientas: ['codigo', 'tu-voz'], agentes: ['claude'] }
const prueba = { agente: 'claude', modelo: 'claude-opus-5-5', costo: 0.487, segundos: 221.6, video: 45, evidencia: 'hhhhhhhhhhhhhhhhhhhh.hilo' }

test('la guía de uso se guarda limpia: cada campo en una línea y a su tope, sin lo vacío ni lo ajeno', () => {
  assert.deepEqual(guiaDe({ ...textos, das: '  Solo el\n\n tema   del video. ', necesita: '  ', otro: 'x', entrega: 7 }), { das: textos.das, ejemplo: textos.ejemplo })
  assert.equal(guiaDe({ ejemplo: 'e'.repeat(900) })?.ejemplo.length, CAMPOS_GUIA.find((c) => c.id === 'ejemplo')!.max)
  for (const nada of [undefined, null, 'texto', 3, {}, { das: ' ' }, { herramientas: ['magia'], agentes: 'claude' }]) assert.equal(guiaDe(nada), undefined)
})

test('con qué lo hace y con qué agentes funciona se eligen de una lista, la misma para todos', () => {
  assert.deepEqual(guiaDe({ herramientas: ['flow-clips', 'magia', 'flow-clips', 'codigo'], agentes: ['codex', 'un-agente-que-no-existe', 'claude'] }), { herramientas: ['flow-clips', 'codigo'], agentes: ['codex', 'claude'] })
})

test('dice qué falta en la guía, en el orden de la plantilla; lo opcional no falta', () => {
  assert.equal(faltaEnGuia(guia), '')
  assert.equal(faltaEnGuia({ ...guia, necesita: 'Google Flow con créditos.' }), '')
  assert.equal(faltaEnGuia(undefined), 'Qué le das')
  assert.equal(faltaEnGuia({ ...guia, entrega: 'Video' }), 'Qué te entrega')
  assert.equal(faltaEnGuia({ ...guia, ejemplo: undefined }), 'Ejemplo de lo que le escribes')
  // La de antes, solo con sus textos: le falta decir con qué lo hace y para qué agentes.
  assert.equal(faltaEnGuia(textos), CON_QUE)
  assert.equal(faltaEnGuia({ ...textos, herramientas: ['codigo'] }), PARA_QUE_AGENTES)
  assert.equal(faltaEnGuia({ ...guia, agentes: [] }), PARA_QUE_AGENTES)
})

test('la prueba dice con qué agente se hizo, cuánto costó y cuánto tardó; sin eso no es una prueba', () => {
  assert.deepEqual(pruebaDe(prueba), { agente: 'claude', modelo: 'claude-opus-5-5', costo: 0.49, segundos: 222, video: 45, evidencia: 'hhhhhhhhhhhhhhhhhhhh.hilo' })
  // Su evidencia es un archivo de la comunidad; lo que no lo sea, no se guarda.
  for (const otra of ['hhhhhhhhhhhhhhhhhhhh.png', 'https://otro.com/x.hilo', 7]) assert.equal(pruebaDe({ ...prueba, evidencia: otra })?.evidencia, undefined)
  // Un video hecho con un agente gratis cuesta cero, y cuenta.
  assert.equal(pruebaDe({ ...prueba, agente: 'opencode', costo: 0 })?.costo, 0)
  for (const mala of [undefined, 'texto', {}, { ...prueba, agente: 'otro' }, { ...prueba, modelo: ' ' }, { ...prueba, costo: -1 }, { ...prueba, costo: '0.5' }, { ...prueba, segundos: 0 }, { ...prueba, segundos: Infinity }])
    assert.equal(pruebaDe(mala), undefined)
  // Su evidencia: el resumen del hilo, recortado y solo con lo que existe.
  const hilo = { pedido: `  Hazme un video\n del ciclo del agua. ${'x'.repeat(900)}`, turnos: [{ segundos: 120.4, costo: 0.31234567, herramientas: 14 }, { segundos: 'mucho' }, { segundos: 101, costo: 0.17 }], usa: ['codigo', 'magia', 'codigo'], otro: 1 }
  const limpia = pruebaDe({ ...prueba, hilo })!.hilo!
  assert.equal(limpia.pedido.length, 600)
  assert.ok(limpia.pedido.startsWith('Hazme un video del ciclo del agua.'))
  assert.deepEqual(limpia.turnos, [{ segundos: 120, costo: 0.3123, herramientas: 14 }, { segundos: 101, costo: 0.17, herramientas: 0 }])
  assert.deepEqual(limpia.usa, ['codigo'])
  assert.equal(pruebaDe({ ...prueba, hilo: { pedido: 'x', turnos: [] } })!.hilo, undefined)
})

test('lo que le falta a un estilo para estar en la comunidad: qué hace, su guía, un video entero y su prueba', () => {
  const estilo = { tipo: 'estilo', guia, prueba }
  const video = { tipo: 'video' }
  assert.deepEqual(faltaEnEstilo([estilo, video], 'Recetas en 30 segundos.'), [])
  assert.deepEqual(faltaEnEstilo([estilo, video], ' '), ['Qué hace'])
  assert.deepEqual(faltaEnEstilo([estilo], 'Recetas.'), [VIDEO_ENTERO])
  assert.deepEqual(faltaEnEstilo([{ ...estilo, prueba: undefined }, video], 'Recetas.'), [PRUEBA])
  // Sin el hilo donde se hizo, no es una prueba: solo son números.
  assert.deepEqual(faltaEnEstilo([{ ...estilo, prueba: { ...prueba, evidencia: undefined } }, video], 'Recetas.'), [PRUEBA])
  // Uno de antes: con su guía de entonces y su video, sin nada más.
  assert.deepEqual(faltaEnEstilo([{ tipo: 'estilo', guia: textos }, video], 'Recetas.'), [CON_QUE, PRUEBA])
  assert.deepEqual(faltaEnEstilo([{ tipo: 'estilo' }], ''), ['Qué hace', 'Qué le das', VIDEO_ENTERO, PRUEBA])
})
