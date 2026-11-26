import assert from 'node:assert/strict'
import { test } from 'node:test'
import { afinarPrompt, leerAfinado } from './afinar-prompt.ts'

test('Afinar acepta preguntas concretas con opciones y conserva el texto en UTF-8', () => {
  const pregunta = { pregunta: '¿Qué tono prefieres?', opciones: ['Documental', 'Divertido', 'Documental', ''] }
  const salida = '```json\n' + JSON.stringify({ prompt: 'Explica el origen del Perú.', preguntas: [pregunta, { pregunta: '¿Cuál?', opciones: [''] }] }) + '\n```'
  const propuesta = leerAfinado(salida, 'Un video sobre Perú', 4000, false)
  assert.deepEqual(propuesta, { prompt: 'Explica el origen del Perú.', preguntas: [{ ...pregunta, opciones: ['Documental', 'Divertido'] }] })
  assert.deepEqual(leerAfinado(salida, 'Un video sobre Perú', 4000, true), { prompt: propuesta.prompt, preguntas: [] })
})

test('Afinar rechaza una propuesta que pierde, repite o reordena las referencias', () => {
  const original = 'Explica [[VYMOTION_REF_1]] con [[VYMOTION_REF_2]]'
  const salida = (prompt: string) => JSON.stringify({ prompt, preguntas: [] })
  assert.equal(leerAfinado(salida(original + ' en 20 segundos.'), original, 4000, false).prompt, original + ' en 20 segundos.')
  for (const variante of [
    'Explica [[VYMOTION_REF_1]]',
    original + ' [[VYMOTION_REF_2]]',
    'Explica [[VYMOTION_REF_2]] con [[VYMOTION_REF_1]]'
  ]) assert.throws(() => leerAfinado(salida(variante), original, 4000, false), /cambió una referencia/)
})

test('Afinar rechaza resultados incompletos y modelos que el servidor no ofrece', async () => {
  assert.throws(() => leerAfinado('Listo.', 'Mi borrador', 4000, false), /propuesta válida/)
  assert.throws(() => leerAfinado('{"prompt":"Listo."}', 'Mi borrador', 4000, false), /prompt completo/)
  await assert.rejects(afinarPrompt({ tipo: 'imagen', prompt: 'Atardecer', modelo: 'codex:gpt' }, []), /modelo disponible/)
})
