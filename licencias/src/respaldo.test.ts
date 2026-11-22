import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PESO_RESPALDO, resumenLimpio } from '../../shared/respaldo.ts'
import { cabe, listar, llaveDe, TOTAL } from './respaldo.ts'

const ficha = (equipo: string, guardado: string, clave = 'SLOTH-AAAA-BBBB-CCCC-DDDD', resumen = '{"estilos":[{"id":"receta-rapida","titulo":"Receta rápida"}],"chats":3}') => ({ clave, equipo, nombre: equipo.toUpperCase(), bytes: 1000, resumen, guardado })

test('una copia cabe si no pasa de su peso ni llena lo de todas: así no sale de lo gratis de R2', () => {
  assert.equal(cabe(0, PESO_RESPALDO), true)
  assert.equal(cabe(0, PESO_RESPALDO + 1), false)
  assert.equal(cabe(TOTAL - 1000, 1000), true)
  assert.equal(cabe(TOTAL - 1000, 1001), false)
  assert.equal(cabe(0, 0), false)
  // Todas juntas quedan muy por debajo de los 10 GB gratis, con sitio para los instaladores y la comunidad.
  assert.ok(TOTAL <= 6 * 1024 ** 3)
})

test('la lista: una copia por computadora, la más nueva primero, y cuál es la de quien pregunta', () => {
  const lista = listar(
    [
      ficha('portatil', '2026-11-14T10:00:00.000Z'),
      ficha('escritorio', '2026-11-15T10:00:00.000Z'),
      // La portátil cambió de la clave de su cuenta a la de su apoyo: vale la más nueva.
      ficha('portatil', '2026-11-15T12:00:00.000Z', 'SLOTH-EEEE-FFFF-GGGG-HHHH', 'esto no es JSON')
    ],
    'escritorio'
  )
  assert.deepEqual(lista.map((r) => [r.equipo, r.guardado.slice(8, 13), r.esta]), [
    ['portatil', '15T12', false],
    ['escritorio', '15T10', true]
  ])
  // Un resumen que no se puede leer cuenta como vacío.
  assert.deepEqual([lista[0].estilos, lista[0].chats], [[], 0])
  assert.deepEqual(lista[1].estilos, [{ id: 'receta-rapida', titulo: 'Receta rápida' }])
  assert.equal(lista[1].nombre, 'ESCRITORIO')
})

test('cada copia va en su sitio, por clave y computadora', () => {
  assert.equal(llaveDe('SLOTH-AAAA-BBBB-CCCC-DDDD', '3f9a0c1e7b2d4a6f8e0c1b3d5f7a9c2e'), 'respaldos/SLOTH-AAAA-BBBB-CCCC-DDDD/3f9a0c1e7b2d4a6f8e0c1b3d5f7a9c2e')
})

test('el resumen que manda la app se limpia: solo estilos con nombre válido y un número de chats', () => {
  assert.deepEqual(resumenLimpio({ estilos: [{ id: 'receta-rapida', titulo: 'Receta' }, { id: '../malo', titulo: 'x' }, { id: 'sin-titulo' }, 'nada'], chats: 12 }), {
    estilos: [
      { id: 'receta-rapida', titulo: 'Receta' },
      { id: 'sin-titulo', titulo: 'sin-titulo' }
    ],
    chats: 12
  })
  assert.deepEqual(resumenLimpio(null), { estilos: [], chats: 0 })
  assert.deepEqual(resumenLimpio({ estilos: 'x', chats: -3 }), { estilos: [], chats: 0 })
  assert.equal(resumenLimpio({ estilos: Array.from({ length: 300 }, (_, i) => ({ id: `e${i}`, titulo: 'x'.repeat(200) })) }).estilos.length, 100)
  assert.equal(resumenLimpio({ estilos: [{ id: 'a', titulo: 'x'.repeat(200) }] }).estilos[0].titulo.length, 80)
})
