import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Card } from '../shared/types.ts'
import { limpiarAfinado, pedidoAfinar } from './afinar.ts'

const hueco = (etiqueta: string, opciones = ['a', 'b']) => ({ etiqueta, pregunta: `${etiqueta} entera`, opciones })

test('sin texto, o con algo que no es la respuesta, no hay afinado', () => {
  assert.equal(limpiarAfinado(null), undefined)
  assert.equal(limpiarAfinado({ texto: '  ', huecos: [] }), undefined)
  assert.equal(limpiarAfinado('hola'), undefined)
})

test('cada marca apunta a su hueco, numerados en el orden en que salen', () => {
  const r = limpiarAfinado({ texto: 'Cierra con {{2}} y habla de {{1}}.', huecos: [hueco('¿qué ciudad?'), hueco('¿a dónde?')] })
  assert.equal(r?.texto, 'Cierra con {{1}} y habla de {{2}}.')
  assert.deepEqual(r?.huecos.map((h) => h.etiqueta), ['¿a dónde?', '¿qué ciudad?'])
})

test('una marca sin hueco se quita, y un hueco que no sale en el texto no llega', () => {
  const r = limpiarAfinado({ texto: 'Habla de {{1}} en {{4}}.', huecos: [hueco('¿qué?'), hueco('¿sobra?')] })
  assert.equal(r?.texto, 'Habla de {{1}} en .')
  assert.equal(r?.huecos.length, 1)
})

test('un hueco sin opciones o sin etiqueta no cuenta, y las opciones no se repiten', () => {
  const r = limpiarAfinado({ texto: '{{1}} {{2}} {{3}}', huecos: [hueco('¿uno?', []), { pregunta: 'sin etiqueta', opciones: ['x'] }, hueco('¿tres?', ['si', 'si', ' no '])] })
  assert.equal(r?.texto, '{{1}}')
  assert.deepEqual(r?.huecos[0].opciones, ['si', 'no'])
})

test('como mucho tres huecos; el mismo hueco dos veces es uno', () => {
  const r = limpiarAfinado({ texto: '{{1}} {{1}} {{2}} {{3}} {{4}}', huecos: [hueco('1'), hueco('2'), hueco('3'), hueco('4')] })
  assert.equal(r?.texto, '{{1}} {{1}} {{2}} {{3}}')
  assert.equal(r?.huecos.length, 3)
})

test('el agente lee el estilo, su guía y lo que escribiste, sin la marca si no hay', () => {
  const card = { id: 'x', title: 'El "Diff"', description: 'Un noticiero.', cwd: '.', guia: { das: 'un tema', entrega: 'un video', ejemplo: 'hazlo' } } as Card
  const p = pedidoAfinar(card, 'lo de la tortilla')
  assert.match(p, /<estilo nombre="El 'Diff'">\nUn noticiero\.\n<\/estilo>/)
  assert.match(p, /Qué le das: un tema/)
  assert.match(p, /<lo_que_escribio>\nlo de la tortilla\n<\/lo_que_escribio>$/)
  assert.doesNotMatch(p, /<marca>/)
  assert.match(pedidoAfinar(card, 'algo', '{"nombre":"Mi canal"}'), /<marca>\n\{"nombre":"Mi canal"\}\n<\/marca>/)
})
