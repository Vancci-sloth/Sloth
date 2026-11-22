import {test} from 'node:test'
import assert from 'node:assert/strict'
import {pedidoParaTitulo, tituloInicial, tituloGenerado} from './titulos.ts'

test('descarta archivos adjuntos y configuración, conserva la petición', () => {
  const pedido = '"C:\\Users\\ana\\Mis videos\\referencia.mp4"\nCrea un anuncio de Deezer\n\nFormato: horizontal\nVoz: Iago\nImágenes: Google Flow\nCarpeta: ejemplo'
  assert.equal(pedidoParaTitulo(pedido), 'Crea un anuncio de Deezer')
  assert.equal(tituloInicial(pedido, 'Motion Graphics'), 'Crea un anuncio de Deezer')
  assert.equal(tituloInicial('"C:\\Videos\\ejemplo.mp4"', 'Motion Graphics'), 'Motion Graphics')
})
test('el título propuesto debe ser corto y sin rutas ni varias líneas', () => {
  assert.equal(tituloGenerado('«Deezer: tu próximo ritmo»'), 'Deezer: tu próximo ritmo')
  for (const valor of ['C:\\Videos\\ejemplo.mp4', 'Título\nExplicación', 'x'.repeat(81), '', 'https://deezer.com'])
    assert.equal(tituloGenerado(valor), undefined)
})
