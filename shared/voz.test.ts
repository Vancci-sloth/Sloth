import assert from 'node:assert/strict'
import { test } from 'node:test'
import { comoSuena, encaja, grupoEnEspanol, juntarVoces, lineaMusica, lineaVoz, motorDe, muestraDeStudio, pcmDeWav, segundosWav, textoParaVoz, trozosParaVoz, vocesDeLista, vocesDelPanel, wavDePcm } from './voz.ts'

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

test('la línea Música: solo encendida y en un estilo que la sabe poner', () => {
  assert.match(lineaMusica({ musica: true }, true), /^Música: de fondo/)
  assert.equal(lineaMusica({ musica: true }, false), '')
  assert.equal(lineaMusica({}, true), '')
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

test('las voces de Fish Audio, ElevenLabs y Voices Cloning van con su prefijo; lo demás es AI Studio', () => {
  assert.deepEqual(motorDe('vc:voz-123'), { motor: 'vc', id: 'voz-123' })
  assert.equal(lineaVoz({}, 'vc:voz-123', 'Enya'), 'Voz: genérala tú con Sloth, voz «Enya»: en generar_voz pon la voz vc:voz-123 (cómo, en video-base/VOZ.md).')
  assert.deepEqual(motorDe('fish:8ef4a238'), { motor: 'fish', id: '8ef4a238' })
  assert.deepEqual(motorDe('elevenlabs:21m00Tcm'), { motor: 'elevenlabs', id: '21m00Tcm' })
  assert.deepEqual(motorDe('Fola'), { motor: 'ai-studio', id: 'Fola' })
  assert.equal(lineaVoz({}, 'fish:8ef4a238', 'Mi voz'), 'Voz: genérala tú con Fish Audio, voz «Mi voz»: en generar_voz pon la voz fish:8ef4a238 (cómo, en video-base/VOZ.md).')
  assert.match(lineaVoz({ voz: { propia: 'Voz de edge-tts' } }, 'elevenlabs:x'), /^Voz: genérala tú con ElevenLabs/)
})

test('el guion se parte por párrafos en trozos que caben, y una frase larga por frases', () => {
  assert.deepEqual(trozosParaVoz('Uno.\n\nDos.\n\nTres.', 12), ['Uno.\n\nDos.', 'Tres.'])
  assert.deepEqual(trozosParaVoz('Una frase. Otra frase. Y otra.', 15), ['Una frase.', 'Otra frase.', 'Y otra.'])
  assert.ok(trozosParaVoz('x'.repeat(25), 10).every((t) => t.length <= 10))
  assert.equal(trozosParaVoz('x'.repeat(25), 10).join(''), 'x'.repeat(25))
})

test('los trozos de PCM se juntan en un WAV entero, con su respiro entre uno y otro', () => {
  const uno = pcmDeWav(wav(24000))!
  assert.deepEqual({ ...uno, datos: uno.datos.length }, { frecuencia: 24000, canales: 1, bits: 16, datos: 48000 })
  const junto = wavDePcm([uno.datos, uno.datos], 24000, 1, 16, 0.5)
  assert.equal(segundosWav(junto), 2.5)
  // Uno que se mandó a trozos no dice su tamaño: se lee hasta el final.
  const sinTam = Buffer.from(wav(100))
  sinTam.writeUInt32LE(0, 40)
  assert.equal(pcmDeWav(sinTam)!.datos.length, 200)
})

test('la línea del corte de datos no se narra', () => {
  const md = '# La pulsera\n\nCorte de datos: 3 de noviembre de 2026.\n\nUn astronauta te escribe.\n'
  assert.equal(textoParaVoz(md), 'Un astronauta te escribe.')
})

test('cómo suena una voz se dice en español, con su tono', () => {
  assert.deepEqual(comoSuena('Warm and approachable · Low pitch'), { texto: 'Cálida y cercana · grave', tono: 'grave' })
  assert.deepEqual(comoSuena('Gentle and relaxed · Very high pitch'), { texto: 'Suave y relajada · muy aguda', tono: 'aguda' })
  assert.deepEqual(comoSuena('Direct and helpful · Medium-low pitch'), { texto: 'Directa y servicial · media grave', tono: 'grave' })
  // Las etiquetas de Fish Audio y ElevenLabs.
  assert.deepEqual(comoSuena('male, old, narration, deep'), { texto: 'Hombre, mayor, narración, profunda', tono: 'grave' })
  assert.equal(comoSuena('female, young, mexican').texto, 'Mujer, joven, mexicana')
  // Los acentos de ElevenLabs con su idioma delante.
  assert.equal(comoSuena('male, adult, es-latin-american').texto, 'Hombre, edad media, latina')
  assert.equal(comoSuena('male, old, narrative_story').texto, 'Hombre, mayor, narración')
  // Lo que no se sabe queda como viene.
  assert.equal(comoSuena('Anime girl').texto, 'Anime girl')
  assert.equal(grupoEnEspanol('Storyteller'), 'Narración')
  assert.equal(grupoEnEspanol('Algo nuevo'), 'Algo nuevo')
})

test('se busca por cualquier palabra, sin acentos ni orden', () => {
  const textos = ['Enzo', 'Crisp and eager · Low pitch', 'Nítida y entusiasta · grave', 'Narración', 'Storyteller']
  assert.ok(encaja('grave narración', textos))
  assert.ok(encaja('gra nar', textos))
  assert.ok(encaja('NARRACION  nitida', textos))
  assert.ok(encaja('storyteller', textos))
  assert.ok(!encaja('aguda', textos))
  assert.ok(encaja('', textos))
})

test('la muestra de AI Studio sale del nombre de la voz; las de antes, de otra carpeta', () => {
  assert.equal(muestraDeStudio('Fola'), 'https://www.gstatic.com/aistudio/voices/samples/daikon/en-us-fola.wav')
  assert.equal(muestraDeStudio('Kore'), 'https://www.gstatic.com/aistudio/voices/samples/Kore.wav')
})

// El panel filtrado por género (Feminine), como lo dio su `innerText` el 6 de noviembre de 2026: todas en una lista.
const FEMENINAS = `Speaker settings
close
VOICE
Current voice
Fola
play_arrow
search
Feminine
arrow_drop_down
Pitch
arrow_drop_down
Cleo
Warm and engaging. · Medium-high pitch
favorite
sync
play_arrow
check
Fola
Current
Clear and friendly. · Medium pitch
favorite
sync
play_arrow
Kore
Firm · Middle pitch
favorite
sync
play_arrow`

test('filtrado por género, el panel da todas; se juntan con las de los grupos y su género', () => {
  const mujeres = vocesDeLista(FEMENINAS)
  assert.deepEqual(mujeres, [
    { nombre: 'Cleo', descripcion: 'Warm and engaging · Medium-high pitch' },
    { nombre: 'Fola', descripcion: 'Clear and friendly · Medium pitch' },
    { nombre: 'Kore', descripcion: 'Firm · Middle pitch' }
  ])
  const grupos = [{ nombre: 'Fola', descripcion: 'Clear and friendly · Medium pitch', grupo: 'Call Center' }, { nombre: 'Daro', descripcion: 'Confident and clear · Low pitch', grupo: 'Call Center' }]
  assert.deepEqual(juntarVoces(grupos, { mujer: mujeres, hombre: [{ nombre: 'Daro', descripcion: '' }] }), [
    { nombre: 'Fola', descripcion: 'Clear and friendly · Medium pitch', grupo: 'Call Center', genero: 'mujer' },
    { nombre: 'Daro', descripcion: 'Confident and clear · Low pitch', grupo: 'Call Center', genero: 'hombre' },
    { nombre: 'Cleo', descripcion: 'Warm and engaging · Medium-high pitch', grupo: 'Más voces', genero: 'mujer' },
    { nombre: 'Kore', descripcion: 'Firm · Middle pitch', grupo: 'Más voces', genero: 'mujer' }
  ])
  // Sin listas (la página cambió), quedan las de los grupos tal cual.
  assert.deepEqual(juntarVoces(grupos, {}), grupos)
  assert.deepEqual(comoSuena('Firm · Middle pitch'), { texto: 'Firme · media', tono: 'media' })
})
