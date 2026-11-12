import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Modelo3D } from '../../shared/types'
import { buscar, casi, indexar } from './buscar3d'

const modelo = (id: string, nombre: string, etiquetas: string[] = [], descripcion = ''): Modelo3D =>
  ({ id, nombre, resumen: '', categoria: 'Objetos', descripcion, hace: [], etiquetas, exporta: [], usa: [] }) as unknown as Modelo3D

const lista = [
  modelo('camion-trailer', 'Camión con tráiler', ['transporte']),
  modelo('esfera-reloj', 'Esfera de reloj de torre'),
  modelo('engranaje', 'Engranaje de latón', ['reloj', 'mecanismo']),
  modelo('boveda', 'Bóveda', ['caja fuerte', 'banco']),
  modelo('pulmones', 'Pulmones', [], 'Dos pulmones que respiran'),
  modelo('cofre', 'Cofre del tesoro', ['botín']),
  modelo('llorona', 'La Llorona', ['fantasma']),
  modelo('carro', 'Carro', ['coche', 'auto']),
  modelo('canal-noche', 'Canal de noche', ['agua']),
  modelo('letrero-led', 'Letrero LED', ['anuncio']),
  modelo('dino-rex', 'Dino Rex', ['dinosaurio', 't rex']),
]
const indices = lista.map(indexar)
const ids = (texto: string) =>
  buscar(indices, texto)
    .sort((a, b) => b.puntos - a.puntos)
    .map((r) => r.modelo.id)

test('encuentra en plural, sin acentos, junto y con una letra de error', () => {
  assert.deepEqual(ids('camiones'), ['camion-trailer'])
  assert.deepEqual(ids('CAMION'), ['camion-trailer'])
  assert.ok(ids('relojes').includes('esfera-reloj'))
  assert.deepEqual(ids('cajafuerte'), ['boveda'])
  assert.deepEqual(ids('pulmnes'), ['pulmones'])
  assert.deepEqual(ids('bovda'), ['boveda'])
})

test('el que lo dice en su nombre sale antes que el que lo trae en sus etiquetas', () => {
  assert.deepEqual(ids('reloj'), ['esfera-reloj', 'engranaje'])
})

test('cada palabra tiene que estar, y sin palabras salen todos', () => {
  assert.deepEqual(ids('reloj banco'), [])
  assert.equal(ids('').length, lista.length)
  assert.equal(ids('xyz').length, 0)
})

test('un pedazo de en medio de una palabra no cuenta', () => {
  assert.deepEqual(ids('oro'), [])
  assert.deepEqual(ids('redes'), [])
  assert.deepEqual(ids('tres'), [])
})

test('la letra de error solo cuenta si la palabra no está bien escrita en ningún modelo', () => {
  assert.deepEqual(ids('coche'), ['carro'])
  assert.deepEqual(ids('noche'), ['canal-noche'])
  assert.deepEqual(ids('coches'), ['carro'])
})

test('los artículos no cuentan, junta desde 4 letras y la misma familia vale si no hay otra cosa', () => {
  assert.deepEqual(ids('el dinosaurio'), ['dino-rex'])
  assert.deepEqual(ids('trex'), ['dino-rex'])
  assert.deepEqual(ids('engrane'), ['engranaje'])
  assert.deepEqual(ids('reloj').slice(0, 1), ['esfera-reloj'])
})

test('casi: una letra de más, de menos o cambiada', () => {
  assert.ok(casi('pulmon', 'pulmn'))
  assert.ok(casi('reloj', 'relij'))
  assert.ok(!casi('carro', 'carta'))
})
