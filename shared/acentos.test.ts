import assert from 'node:assert/strict'
import test from 'node:test'
import { acentosBien } from './acentos.ts'

/** Como lo deja un agente que lee UTF-8 como si fuera de Windows y lo vuelve a guardar. */
const romper = (texto: string) => new TextDecoder('windows-1252').decode(new TextEncoder().encode(texto))

test('los acentos rotos se arreglan solos: lo que su autor escribió vuelve a leerse', () => {
  // Tal como llegaron en los estilos de la comunidad.
  assert.equal(acentosBien('Cuentos 3D CinematogrÃ¡ficos'), 'Cuentos 3D Cinematográficos')
  assert.equal(acentosBien('animales antropomÃ³rficos con trabajo'), 'animales antropomórficos con trabajo')
  assert.equal(acentosBien('RevisiÃ³n aprobada'), 'Revisión aprobada')
  assert.equal(acentosBien('Cuenta de Google Flow y crÃ©ditos. Las fotografÃ­as son opcionales; genera tÃº los personajes.'), 'Cuenta de Google Flow y créditos. Las fotografías son opcionales; genera tú los personajes.')
  for (const bien of ['áéíóúñü ÁÉÍÓÚÑÜ', '¿Qué pasaría si…?', '¡Año nuevo!', '«Decide tú»: “comillas”, ‘simples’ — y raya –', 'Precio: 5 € · Sloth™', 'CAMIÓN, ÚLTIMO, ÍNDICE, ÁRBOL'])
    assert.equal(acentosBien(romper(bien)), bien, bien)
})

test('lo que ya está bien no se toca, tampoco cuando se parece', () => {
  for (const bien of [
    'Cuentos 3D Cinematográficos',
    '«EDICIÓN» y «ACCIÓN»',
    '¿QUÉ… pasó?',
    'ÚLTIMO «AÑO»',
    'São Paulo, coração, NÃO',
    'olé¡ y más',
    'Emoji 🎬 y flechas → ←',
    'subt?tulos',
    ''
  ])
    assert.equal(acentosBien(bien), bien, bien)
  // Arreglado una vez, otra pasada no cambia nada.
  const una = acentosBien(romper('Diálogos, sonido y portada.'))
  assert.equal(acentosBien(una), una)
})
