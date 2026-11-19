import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { EstiloTienda } from '../../shared/types.ts'
import { fichasDe, hayFiltros, opcionesDe, ordenar, pasa } from './tiendaFiltros.ts'

let n = 0
/** Un estilo de la tienda con lo que miran los filtros. */
function estilo(titulo: string, c: { texto?: string; autor?: string; vertical?: boolean | null; likes?: number; videos?: number; entrega?: string; porAprobar?: boolean } = {}): EstiloTienda {
  const id = `p${++n}`
  return {
    publicacion: {
      id,
      titulo,
      texto: c.texto ?? '',
      autor: { id: c.autor ?? 'a1', nombre: c.autor ?? 'Ana' },
      adjuntos: [
        { tipo: 'estilo', llave: `${id}.estilo`, url: '', ...(c.entrega ? { guia: { das: 'El tema', entrega: c.entrega, ejemplo: 'Hazme uno' } } : {}) },
        ...(c.vertical === null ? [] : [{ tipo: 'video' as const, llave: `${id}.mp4`, url: '', ...(c.vertical === undefined ? {} : { vertical: c.vertical }) }])
      ],
      likes: c.likes ?? 0,
      creada: `2026-11-${String(10 + n).padStart(2, '0')}T12:00:00.000Z`,
      ...(c.porAprobar ? { porAprobar: true } : {})
    },
    descargas: 0,
    videos: c.videos ?? 0,
    personas: 0,
    variantes: 0,
    mes: { personas: 0, videos: 0, variantes: 0, puntos: 0 },
    participa: false,
    estimado: []
  } as unknown as EstiloTienda
}

const cronica = estilo('CRÓNICA 3D', { texto: 'Documentales en miniatura de 60 a 90 s', likes: 4 })
const drama = estilo('Animal Drama', { texto: 'Drama y rap de animales antropomórficos', vertical: false, autor: 'Beto', likes: 3 })
const memes = estilo('Memes recreados', { texto: 'Recrea el meme de moda', vertical: null, porAprobar: true })
const jaula = estilo('La Jaula', { entrega: 'Un cuento con moraleja en 3D tipo Pixar', autor: 'Beto', videos: 2 })
const todos = [cronica, drama, memes, jaula]
const id = (l: { e: EstiloTienda }[]) => l.map((f) => f.e.publicacion.titulo)

test('los temas salen del título, del principio del texto y de lo que entrega, sin acentos ni mayúsculas', () => {
  const [a, b, c, d] = fichasDe(todos, null)
  assert.deepEqual(a.temas, ['3d', 'explicar'])
  assert.deepEqual(b.temas, ['historias', 'animales'])
  assert.deepEqual(c.temas, ['humor'])
  // «La Jaula» no dice nada en su título: lo dice lo que entrega, en su guía.
  assert.deepEqual(d.temas, ['3d', 'historias'])
  // Lo que viene muy abajo en un texto largo no lo vuelve de ese tema.
  assert.deepEqual(fichasDe([estilo('Reel Cristal', { texto: `${'x'.repeat(500)} con un perro` })], null)[0].temas, [])
})

test('la forma es la de su video: sin decirlo es vertical, y sin video no tiene', () => {
  assert.deepEqual(fichasDe(todos, null).map((f) => f.forma), ['vertical', 'horizontal', undefined, 'vertical'])
})

test('se busca en el título, el texto, la guía y el nombre de quien lo compartió; cada palabra tiene que estar', () => {
  const fichas = fichasDe(todos, null)
  const con = (q: string) => id(fichas.filter((f) => pasa(f, { q })))
  assert.deepEqual(con('cronica'), ['CRÓNICA 3D'])
  assert.deepEqual(con('beto'), ['Animal Drama', 'La Jaula'])
  assert.deepEqual(con('MORALEJA pixar'), ['La Jaula'])
  assert.deepEqual(con('drama cuento'), [])
  assert.equal(con('  ').length, 4)
})

test('los filtros se suman, y cada opción dice cuántos da con lo demás ya elegido', () => {
  const fichas = fichasDe(todos, null)
  assert.deepEqual(id(fichas.filter((f) => pasa(f, { q: '', tema: '3d', forma: 'vertical' }))), ['CRÓNICA 3D', 'La Jaula'])
  assert.deepEqual(id(fichas.filter((f) => pasa(f, { q: '', autor: { id: 'Beto', nombre: 'Beto' }, tema: 'historias' }))), ['Animal Drama', 'La Jaula'])
  const libres = opcionesDe(fichas, { q: '' })
  assert.deepEqual(libres.temas.map((t) => [t.id, t.n]), [['3d', 2], ['historias', 2], ['explicar', 1], ['humor', 1], ['animales', 1]])
  assert.deepEqual([libres.vertical, libres.horizontal, libres.revision, libres.nuevos], [2, 1, 1, 0])
  // Con «Historias» elegido: las formas cuentan solo las historias, y los temas, lo que hay en cada forma.
  const historias = opcionesDe(fichas, { q: '', tema: 'historias' })
  assert.deepEqual([historias.vertical, historias.horizontal], [1, 1])
  const horizontales = opcionesDe(fichas, { q: '', forma: 'horizontal' })
  assert.deepEqual(horizontales.temas.map((t) => t.id), ['historias', 'animales'])
  // El tema elegido no desaparece aunque lo demás lo deje en cero: hay que poder quitarlo.
  assert.deepEqual(opcionesDe(fichas, { q: 'memes', tema: '3d' }).temas.map((t) => [t.id, t.n]), [['3d', 0], ['humor', 1]])
  assert.equal(hayFiltros({ q: ' ' }), false)
  assert.equal(hayFiltros({ q: '', forma: 'vertical' }), true)
})

test('nuevo para ti es el que no habías visto; la primera vez, ninguno', () => {
  assert.deepEqual(fichasDe(todos, null).map((f) => f.nuevo), [false, false, false, false])
  const fichas = fichasDe(todos, new Set([cronica.publicacion.id, drama.publicacion.id]))
  assert.deepEqual(id(fichas.filter((f) => pasa(f, { q: '', nuevos: true }))), ['Memes recreados', 'La Jaula'])
  assert.equal(opcionesDe(fichas, { q: '' }).nuevos, 2)
})

test('se ordena como en el cobro: de más a menos y, empatados, el más nuevo primero', () => {
  const t = (l: EstiloTienda[]) => l.map((e) => e.publicacion.titulo)
  assert.deepEqual(t(ordenar(todos, 'favoritos')), ['CRÓNICA 3D', 'Animal Drama', 'La Jaula', 'Memes recreados'])
  assert.deepEqual(t(ordenar(todos, 'usados')), ['La Jaula', 'Memes recreados', 'Animal Drama', 'CRÓNICA 3D'])
  assert.deepEqual(t(ordenar(todos, 'nuevos')), ['La Jaula', 'Memes recreados', 'Animal Drama', 'CRÓNICA 3D'])
  // No cambia la lista que le dan.
  assert.equal(todos[0], cronica)
})
