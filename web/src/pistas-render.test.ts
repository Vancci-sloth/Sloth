import assert from 'node:assert/strict'
import test from 'node:test'
import { pistasDeRender } from './pistas-render'

test('un MP4 terminado ocupa toda su duración y su onda usa el audio del mismo archivo', () => {
  const resultado = pistasDeRender({ ruta: 'out/anuncio.mp4', t: 123 }, 20)
  assert.equal(resultado.escenas.length, 1)
  assert.equal(resultado.escenas[0].hasta, 20)
  assert.deepEqual(resultado.pistas, [{ ruta: 'out/anuncio.mp4', t: 123, desde: 0, hasta: 20, recorte: 0 }])
  assert.notDeepEqual(pistasDeRender({ ruta: 'out/otro.mp4', t: 456 }, 10), resultado)
})

test('sin archivo o sin metadatos todavía no se inventa una duración', () => {
  for (const duracion of [0, -1, NaN, Infinity]) assert.deepEqual(pistasDeRender({ ruta: 'out/video.mp4', t: 0 }, duracion), { escenas: [], pistas: [] })
  assert.deepEqual(pistasDeRender(undefined, 20), { escenas: [], pistas: [] })
})
