import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CABEZA_SUGERENCIAS, cabezaDeFalta, faltaDeRespuesta } from './revision.ts'

test('de la respuesta de la revisión sale la lista de lo que falta, tal como se dijo', () => {
  const texto = [cabezaDeFalta('Datos curiosos'), '- El paso de la voz no lee la línea Voz: del mensaje.\n- Su card no tiene la etapa «Revisión».', 'Arréglalo (puedes pegarle esta lista a «Nuevo estilo») y pulsa «Compartir» otra vez en su card.', 'Si algo de esto no aplica, contesta aquí.'].join('\n\n')
  assert.deepEqual(faltaDeRespuesta(texto), { falta: ['El paso de la voz no lee la línea Voz: del mensaje.', 'Su card no tiene la etapa «Revisión».'], sugerencias: [] })
})

test('lo que no frena va aparte, y lo que sigue a las listas no cuenta', () => {
  const texto = [cabezaDeFalta('Recetas'), '- Falta el paso del render.', 'Arréglalo y pulsa «Compartir» otra vez.', `${CABEZA_SUGERENCIAS}\n- Nombra la línea Imágenes:.\n- Un acento roto en su card.`, 'Si algo de esto no aplica, contesta aquí.\n- esto ya no es de ninguna lista'].join('\n\n')
  assert.deepEqual(faltaDeRespuesta(texto), { falta: ['Falta el paso del render.'], sugerencias: ['Nombra la línea Imágenes:.', 'Un acento roto en su card.'] })
})

test('un renglón partido en dos sigue siendo uno, y los saltos de Windows no estorban', () => {
  const texto = `${cabezaDeFalta('Recetas')}\r\n\r\n- El paso 3 no dice\r\nqué hacer en Mac.\r\n- Otro.\r\n\r\nArréglalo.`
  assert.deepEqual(faltaDeRespuesta(texto)?.falta, ['El paso 3 no dice qué hacer en Mac.', 'Otro.'])
})

test('lo que no es un «le falta» no se lee: otro comentario, o la revisión diciendo que se aprobó', () => {
  assert.equal(faltaDeRespuesta('Gracias por compartirlo, se ve muy bien.\n\n- una lista cualquiera'), undefined)
  assert.equal(faltaDeRespuesta('Revisión automática de Sloth: «Recetas» se aprobó y ya sale en la tienda. No tienes que hacer nada.'), undefined)
  assert.equal(faltaDeRespuesta('Revisión automática de Sloth: «Recetas» cumple lo que necesita para estar en la tienda.'), undefined)
  // Citada dentro de otro comentario, tampoco: la respuesta empieza por ahí.
  assert.equal(faltaDeRespuesta(`Me dijeron esto:\n${cabezaDeFalta('Recetas')}\n\n- Algo.`), undefined)
})

test('un título con comillas dentro se lee igual', () => {
  assert.deepEqual(faltaDeRespuesta(`${cabezaDeFalta('El «mejor» estilo')}\n\n- Algo.`)?.falta, ['Algo.'])
})
