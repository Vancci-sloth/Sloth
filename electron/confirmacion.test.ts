import assert from 'node:assert/strict'
import test from 'node:test'
import { esEntradaDeRiesgo, queQuiere, revisarEntrada, type Sondeo } from './confirmacion.ts'

const sondeo = (p: Partial<Sondeo>): Sondeo => ({ texto: '', envia: false, post: false, sitio: 'ejemplo.com', ...p })

test('solo el clic izquierdo al pulsar y Enter al bajar la tecla son de riesgo', () => {
  assert.equal(esEntradaDeRiesgo('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left' }), 'clic')
  assert.equal(esEntradaDeRiesgo('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left' }), null)
  assert.equal(esEntradaDeRiesgo('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'right' }), null)
  assert.equal(esEntradaDeRiesgo('Input.dispatchMouseEvent', { type: 'mouseMoved' }), null)
  assert.equal(esEntradaDeRiesgo('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter' }), 'enter')
  assert.equal(esEntradaDeRiesgo('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a' }), null)
  assert.equal(esEntradaDeRiesgo('Page.navigate', {}), null)
})

test('qué se le pregunta a la persona', () => {
  assert.equal(queQuiere(sondeo({ texto: 'Publicar' })), 'Publicar')
  assert.equal(queQuiere(sondeo({ texto: 'Siguiente', envia: true, post: true })), 'enviar un formulario')
  assert.equal(queQuiere(sondeo({ texto: 'Buscar', envia: true, post: false })), null)
  assert.equal(queQuiere(sondeo({ texto: 'Ver más' })), null)
})

test('permitir deja pasar y bloquear devuelve un mensaje para el agente', async () => {
  const preguntas: string[] = []
  const hacer = (respuesta: boolean) => ({
    evaluar: async () => sondeo({ texto: 'Pay now', sitio: 'tienda.mx' }),
    preguntar: async (a: string, s: string) => (preguntas.push(`${a}|${s}`), respuesta)
  })
  assert.equal(await revisarEntrada('Input.dispatchMouseEvent', { type: 'mousePressed', x: 10, y: 20 }, hacer(true)), null)
  const bloqueo = await revisarEntrada('Input.dispatchMouseEvent', { type: 'mousePressed', x: 10, y: 20 }, hacer(false))
  assert.match(bloqueo ?? '', /bloqueó la acción «Pay now» en tienda\.mx/)
  assert.deepEqual(preguntas, ['Pay now|tienda.mx', 'Pay now|tienda.mx'])
})

test('lo que no es de riesgo no pregunta, y si la página no responde, sigue', async () => {
  let preguntado = false
  const preguntar = async () => ((preguntado = true), false)
  assert.equal(await revisarEntrada('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1, y: 1 }, { evaluar: async () => sondeo({ texto: 'Ver más' }), preguntar }), null)
  assert.equal(await revisarEntrada('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1, y: 1 }, { evaluar: async () => Promise.reject(new Error('x')), preguntar }), null)
  assert.equal(await revisarEntrada('Input.dispatchKeyEvent', { type: 'keyDown', key: 'x' }, { evaluar: async () => sondeo({ texto: 'Delete' }), preguntar }), null)
  assert.equal(preguntado, false)
})
