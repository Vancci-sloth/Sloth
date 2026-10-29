import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lineaVoz, segundosWav, textoParaVoz, vocesDelPanel } from './voz.ts'

// El principio del panel de voces de AI Studio, como lo dio su `innerText` el 29 de octubre de 2026.
const PANEL = `Speaker settings
close
VOICE
Current voice
Fola
play_arrow
search
add
New voice
Language
arrow_drop_down
Use case
arrow_drop_down
Tutor
View all 7
Bodi
Quiet and intimate. · Low pitch
favorite
play_arrow
Lumi
Warm and approachable. · Low pitch
favorite
play_arrow
Call Center
View all 7
Daro
Confident and clear. · Low pitch
favorite
play_arrow
check
Fola
Current
Clear and friendly. · Medium pitch
favorite
play_arrow`

test('las voces del panel salen con su grupo, también la que está puesta', () => {
  assert.deepEqual(vocesDelPanel(PANEL), [
    { nombre: 'Bodi', descripcion: 'Quiet and intimate · Low pitch', grupo: 'Tutor' },
    { nombre: 'Lumi', descripcion: 'Warm and approachable · Low pitch', grupo: 'Tutor' },
    { nombre: 'Daro', descripcion: 'Confident and clear · Low pitch', grupo: 'Call Center' },
    { nombre: 'Fola', descripcion: 'Clear and friendly · Medium pitch', grupo: 'Call Center' }
  ])
})

test('la línea Voz: según lo elegido y el estilo', () => {
  assert.match(lineaVoz({}, 'Fola'), /^Voz: genérala tú en AI Studio con la voz Fola \(cómo, en video-base\/VOZ\.md\)\.$/)
  assert.match(lineaVoz({}, ''), /^Voz: la manda el usuario/)
  assert.equal(lineaVoz({ voz: { propia: 'Voz de edge-tts' } }, ''), '')
  assert.match(lineaVoz({ voz: { propia: 'Voz de edge-tts' } }, 'Kore'), /voz Kore/)
  assert.equal(lineaVoz({ voz: false }, 'Fola'), '')
})

/**
 * Un WAV de 24 kHz, 16 bits y mono con `muestras` muestras, que dice 96.000 bytes por segundo, como el de AI Studio;
 * `corte` le quita bytes del final, como a medio bajar.
 */
function wav(muestras: number, corte = 0) {
  const datos = muestras * 2
  const b = Buffer.alloc(44 + datos)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + datos, 4)
  b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(24000, 24)
  b.writeUInt32LE(96000, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(datos, 40)
  return b.subarray(0, b.length - corte)
}

test('un WAV entero dice cuánto dura; uno a medio bajar, no', () => {
  assert.equal(segundosWav(wav(24000 * 3)), 3)
  assert.equal(segundosWav(wav(24000 * 3, 100)), null)
  assert.equal(segundosWav(Buffer.from('no es un wav, aunque sea largo: 0123456789012345678901234567890')), null)
})

test('del guion se narra lo de debajo de los encabezados, sin ellos ni comentarios', () => {
  const md = '# El título\n\n## Gancho\n\nHola,\nesto se dice.\n\n<!-- nota para mí -->\n\n## Cierre\n\nY esto también.\n'
  assert.equal(textoParaVoz(md), 'Hola, esto se dice.\n\nY esto también.')
})
