import assert from 'node:assert/strict'
import { test } from 'node:test'
import { consultaBarra, filtrarBarra } from './menu-estilos.ts'

const ESTILOS = [
  { id: 'video-el-diff', titulo: 'El Diff', skill: 'video-el-diff' },
  { id: 'video-explicativo', titulo: 'Video explicativo', skill: 'video-explicativo' },
  { id: 'reel-collage', titulo: 'Reel de comedia', skill: 'reel-collage' },
  { id: 'video-documental', titulo: 'Documental', skill: 'video-documental' },
  { id: 'frutinovela', titulo: 'Frutinovela', skill: 'frutinovela' },
  { id: 'nuevo-estilo', titulo: 'Nuevo estilo', skill: 'crear-estilo' }
]
const titulos = (q: string) => filtrarBarra(ESTILOS, q).map((e) => e.titulo)

test('el menú sale con «/» y unas letras al principio, sin espacios', () => {
  assert.equal(consultaBarra('/'), '')
  assert.equal(consultaBarra('/doc'), 'doc')
  assert.equal(consultaBarra('/doc algo'), undefined)
  assert.equal(consultaBarra('hola /doc'), undefined)
  assert.equal(consultaBarra(''), undefined)
})

test('primero los que empiezan por lo escrito, luego por una palabra, la skill y lo demás', () => {
  assert.deepEqual(titulos('d'), ['Documental', 'El Diff', 'Reel de comedia', 'Video explicativo'])
  assert.deepEqual(titulos('doc'), ['Documental'])
  assert.deepEqual(titulos('expli'), ['Video explicativo'])
  assert.deepEqual(titulos('collage'), ['Reel de comedia'])
})

test('sin tildes ni mayúsculas, y vacío da todos en su orden', () => {
  assert.deepEqual(titulos('DOCU'), ['Documental'])
  assert.deepEqual(titulos(''), ESTILOS.map((e) => e.titulo))
  assert.deepEqual(titulos('zzz'), [])
})
