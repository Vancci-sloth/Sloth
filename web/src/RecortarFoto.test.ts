import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encuadre } from './encuadre'

const LADO = 280

/** Lo que ocupa la foto en el círculo, ya girada. */
const ocupa = (an: number, al: number, giro: number, escala: number) =>
  giro % 180 !== 0 ? { ancho: al * escala, alto: an * escala } : { ancho: an * escala, alto: al * escala }

test('la foto llena el círculo venga como venga', () => {
  // Apaisada, de pie, cuadrada y una tira muy larga, con y sin giro.
  for (const [an, al] of [[1920, 1080], [1080, 1920], [600, 600], [4000, 300], [300, 4000]])
    for (const giro of [0, 90, 180, 270]) {
      const { escala } = encuadre({ an, al, giro, zoom: 1, lado: LADO, x: 0, y: 0 })
      const { ancho, alto } = ocupa(an, al, giro, escala)
      assert.ok(ancho >= LADO - 1e-9 && alto >= LADO - 1e-9, `${an}x${al} girada ${giro} deja hueco: ${ancho}x${alto}`)
    }
})

test('al arrastrar lejos, la foto se queda donde cabe', () => {
  for (const giro of [0, 90]) {
    const v = encuadre({ an: 1920, al: 1080, giro, zoom: 1.5, lado: LADO, x: 99_999, y: -99_999 })
    const { ancho, alto } = ocupa(1920, 1080, giro, v.escala)
    // Movida hasta su tope, la orilla de la foto llega justo al borde del círculo, no más adentro.
    assert.equal(v.x, (ancho - LADO) / 2)
    assert.equal(v.y, -(alto - LADO) / 2)
  }
})

test('sin acercar, una foto apaisada solo se mueve a los lados', () => {
  const v = encuadre({ an: 1920, al: 1080, giro: 0, zoom: 1, lado: LADO, x: 500, y: 500 })
  assert.ok(v.x > 0, 'debería poder correrse a los lados')
  assert.equal(v.y, 0, 'de arriba abajo ya está justa')
})

test('acercar da margen para mover en los dos sentidos', () => {
  const quieta = encuadre({ an: 600, al: 600, giro: 0, zoom: 1, lado: LADO, x: 400, y: 400 })
  assert.deepEqual({ x: quieta.x, y: quieta.y }, { x: 0, y: 0 })
  const cerca = encuadre({ an: 600, al: 600, giro: 0, zoom: 2, lado: LADO, x: 400, y: 400 })
  assert.equal(cerca.x, LADO / 2)
  assert.equal(cerca.y, LADO / 2)
})

test('una foto sin medidas no rompe las cuentas', () => {
  const v = encuadre({ an: 0, al: 0, giro: 0, zoom: 1, lado: LADO, x: 10, y: 10 })
  assert.ok(Number.isFinite(v.escala) && Number.isFinite(v.x) && Number.isFinite(v.y))
})
