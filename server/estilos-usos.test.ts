import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Card } from '../shared/types.ts'
import { pendientes } from './estilos-usos.ts'

const card = (id: string, publicacion?: string): Card =>
  ({ id, title: id, description: '', icon: 'video', etapas: [{ nombre: 'Video', listo: '*.mp4' }], ...(publicacion ? { origen: { publicacion, sloth: '0.4.0' } } : {}) }) as unknown as Card

test('solo se avisan los videos de estilos de la comunidad, una vez cada archivo', () => {
  const videos = (c: Card) => (c.id === 'tuyo' ? [{ ruta: 'a.mp4' }] : [{ ruta: 'x.mp4' }, { ruta: 'y.mp4' }, { ruta: 'copia-de-x.mp4' }])
  // La copia de un video tiene su misma huella.
  const huellas: Record<string, string> = { 'a.mp4': 'aaaa', 'x.mp4': 'xxxx', 'copia-de-x.mp4': 'xxxx', 'y.mp4': 'yyyy' }
  const enviados = new Set(['pub1:yyyy'])
  const lista = pendientes([card('tuyo'), card('de-ana', 'pub1')], videos, enviados, (r) => huellas[r])
  assert.deepEqual(lista, [{ publicacion: 'pub1', tipo: 'video', huella: 'xxxx', llave: 'pub1:xxxx', ruta: 'x.mp4' }])
})

test('un video sin huella (se borró a medio camino) no se avisa', () => {
  assert.deepEqual(pendientes([card('de-ana', 'pub1')], () => [{ ruta: 'ido.mp4' }], new Set(), () => ''), [])
})
