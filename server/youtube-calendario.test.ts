import assert from 'node:assert/strict'
import test from 'node:test'
import { diasYoutube } from '../shared/youtube-fechas.ts'

const publicacion = (id: string, dia: number, hora = 18, mes = 9, año = 2026) => ({ id, titulo: `Video ${id}`, cuando: new Date(año, mes, dia, hora).toISOString() })

test('el calendario agrupa por día local, conserva lo de hoy y cuenta varios videos sin asumir un ritmo fijo', () => {
  const ahora = new Date(2026, 9, 13, 12)
  const c = diasYoutube([publicacion('pasado', 12), publicacion('hoy', 13, 0), publicacion('noche', 13, 23), publicacion('a', 14), publicacion('b', 14, 20), publicacion('c', 16)], ahora)
  assert.equal(c.total, 5)
  assert.equal(c.hoy, '2026-10-13')
  assert.equal(c.ultimo, '2026-10-16')
  assert.equal(c.siguiente, '2026-10-15')
  assert.equal(c.dias.find((d) => d.dia === c.hoy)?.publicaciones.length, 2)
  assert.equal(c.dias.find((d) => d.dia === '2026-10-14')?.publicaciones.length, 2)
  assert.equal(c.dias.find((d) => d.dia === '2026-10-15')?.publicaciones.length, 0)
})

test('muestra la siguiente fecha libre después de una semana cubierta y guarda fechas lejanas sin llenar meses vacíos', () => {
  const c = diasYoutube(Array.from({ length: 7 }, (_, i) => publicacion(String(i), 14 + i)), new Date(2026, 9, 13, 12))
  assert.equal(c.siguiente, '2026-10-21')
  assert.equal(c.dias.length, 9)
  const lejos = diasYoutube([publicacion('futuro', 1, 18, 2, 2027)], new Date(2026, 9, 13, 12))
  assert.equal(lejos.ultimo, '2027-03-01')
  assert.equal(lejos.dias.length, 15)
  assert.equal(lejos.dias.at(-1)?.publicaciones[0].id, 'futuro')
})

test('sin programas muestra días libres y los cambios de mes y año conservan su fecha local', () => {
  const vacio = diasYoutube([], new Date(2026, 11, 31, 23))
  assert.equal(vacio.total, 0)
  assert.equal(vacio.siguiente, '2027-01-01')
  assert.equal(vacio.dias.length, 7)
  const cambio = diasYoutube([publicacion('mañana', 1, 0, 0, 2027)], new Date(2026, 11, 31, 23))
  assert.equal(cambio.siguiente, '2027-01-02')
  assert.equal(cambio.ultimo, '2027-01-01')
})
