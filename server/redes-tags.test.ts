import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sinTagsEnTexto } from './redes/index.ts'

test('los #hashtags del texto pasan a los hashtags, sin repetir', () => {
  assert.deepEqual(sinTagsEnTexto('Prometió frenar a los hackers #IA y le salió al revés #CallOfDuty\n#ia #Gaming', ['ElDiff', 'IA']), {
    texto: 'Prometió frenar a los hackers y le salió al revés',
    tags: ['ElDiff', 'IA', 'CallOfDuty', 'Gaming']
  })
})

test('un # que no es hashtag se queda en el texto', () => {
  assert.deepEqual(sinTagsEnTexto('Es el número #1 y C# no cambia', []), { texto: 'Es el número #1 y C# no cambia', tags: [] })
})
