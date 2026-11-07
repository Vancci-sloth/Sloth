import assert from 'node:assert/strict'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { test } from 'node:test'
import { enviarAudio, muestraPermitida } from './voz/muestras.ts'

test('las muestras solo se bajan de AI Studio, Fish Audio y ElevenLabs, y sin subir de carpeta', () => {
  assert.ok(muestraPermitida('https://www.gstatic.com/aistudio/voices/samples/daikon/en-us-fola.wav'))
  assert.ok(muestraPermitida('https://www.gstatic.com/aistudio/voices/samples/Kore.wav'))
  assert.ok(muestraPermitida('https://platform.r2.fish.audio/task/2e3ba59461ca46a5bc5056e1a6af0ac8.mp3'))
  assert.ok(muestraPermitida('https://storage.googleapis.com/eleven-public-prod/database/workspace/a2b/voices/x/y.mp3'))
  // La de una voz de tu cuenta de ElevenLabs.
  assert.ok(muestraPermitida('https://api.us.elevenlabs.io/v1/voices/ZCh4e9eZSUf41K4cmCEL/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20i'))
  assert.ok(!muestraPermitida('https://api.us.elevenlabs.io/v1/text-to-speech/ZCh4e9eZSUf41K4cmCEL?payload=x'), 'otra ruta de su API')
  assert.ok(!muestraPermitida('https://api.elevenlabs.io.evil.example/v1/voices/x/previews/audio?payload=x'))
  // Las de Voices Cloning, con .mp3 o sin él.
  assert.ok(muestraPermitida('https://www.voicescloning.art/api/media/svLOzN3jnOU-sBjXgUGm'))
  assert.ok(muestraPermitida('https://www.voicescloning.art/api/media/vPfjjAiIOpaQOwYnG2UI_qGp0gOJwynZ.mp3'))
  assert.ok(!muestraPermitida('https://www.voicescloning.art/api/v1/voices'), 'su API no es una muestra')
  assert.ok(!muestraPermitida('https://storage.googleapis.com/eleven-public-de-otro/x.mp3'), 'otro bucket')
  assert.ok(!muestraPermitida('https://www.gstatic.com/aistudio/voices/samples/../../otra.js'))
  assert.ok(!muestraPermitida('http://platform.r2.fish.audio/task/x.mp3'), 'sin https')
  assert.ok(!muestraPermitida('https://evil.example/https://www.gstatic.com/aistudio/voices/samples/x.wav'))
  assert.ok(!muestraPermitida('https://platform.r2.fish.audio/task/x.mp3?redirect=https://evil.example'))
  // Lo que `fetch` volvería `..` (lo encontró la revisión del eval).
  assert.ok(!muestraPermitida('https://storage.googleapis.com/eleven-public-prod/%2e%2e/otro-bucket/x.mp3'))
  assert.ok(!muestraPermitida('https://www.gstatic.com/aistudio/voices/samples/%2E%2E/%2e%2e/x.js'))
  assert.ok(!muestraPermitida('https://platform.r2.fish.audio/task/a%2fb.mp3'))
})

/** Lo que manda `enviarAudio` a una petición con esta cabecera `Range`. */
function pedir(range?: string) {
  const r = { status: 0, cabeceras: {} as Record<string, unknown>, cuerpo: new Uint8Array() as Uint8Array }
  const res = {
    writeHead(status: number, cabeceras: Record<string, unknown> = {}) {
      r.status = status
      r.cabeceras = cabeceras
      return this
    },
    end(cuerpo?: Uint8Array) {
      if (cuerpo) r.cuerpo = cuerpo
      return this
    }
  } as unknown as ServerResponse
  enviarAudio({ headers: range ? { range } : {} } as IncomingMessage, res, Uint8Array.from({ length: 10 }, (_, i) => i), 'audio/wav', 60)
  return r
}

test('un audio va con su tamaño y, si el reproductor pide un rango, solo ese trozo', () => {
  const todo = pedir()
  assert.equal(todo.status, 200)
  assert.equal(todo.cabeceras['content-length'], 10)
  assert.equal(todo.cabeceras['accept-ranges'], 'bytes')
  const desde = pedir('bytes=0-')
  assert.equal(desde.status, 206)
  assert.equal(desde.cabeceras['content-range'], 'bytes 0-9/10')
  const trozo = pedir('bytes=2-4')
  assert.deepEqual([...trozo.cuerpo], [2, 3, 4])
  assert.equal(trozo.cabeceras['content-length'], 3)
  assert.deepEqual([...pedir('bytes=-3').cuerpo], [7, 8, 9])
  assert.equal(pedir('bytes=20-').status, 416)
})
