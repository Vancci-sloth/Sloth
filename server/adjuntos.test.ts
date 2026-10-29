import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { nombreAdjunto } from './agent.ts'
import { Sessions } from './sessions.ts'

test('el nombre de un adjunto queda sin espacios, comillas, paréntesis ni acentos', () => {
  assert.equal(nombreAdjunto('WhatsApp Image 2026-10-26 at 10.46.24 PM (1).jpeg'), 'WhatsApp-Image-2026-10-26-at-10.46.24-PM-1.jpeg')
  assert.equal(nombreAdjunto(`Foto de "Juan" y María's.png`), 'Foto-de-Juan-y-Maria-s.png')
  assert.equal(nombreAdjunto('Generated Audio October 27, 2026 - 8_28PM.wav'), 'Generated-Audio-October-27-2026-8_28PM.wav')
  assert.equal(nombreAdjunto('año.png'), 'ano.png')
  assert.equal(nombreAdjunto('“”'), 'archivo')
})

test('el agente recibe la ruta de cada imagen adjunta, y el hilo enseña el mensaje tal cual', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sloth-adjuntos-'))
  const mandado: string[] = []
  const mostrado: string[] = []
  const sessions = new Sessions(dir, (_, __, events) => events.forEach((e) => e.t === 'user' && mostrado.push(e.text)), () => {}, () => {}, () => {}, () => ({
    send(text) { mandado.push(text) },
    steer(text) { mandado.push(text) },
    async interrupt() {},
    close() {}
  }))
  t.after(() => {
    sessions.closeAll()
    rmSync(dir, { recursive: true, force: true })
  })
  const meta = sessions.create({ cardId: 'sloth', cwd: dir, title: 'Prueba', model: 'codex:gpt-prueba' })
  const imagen = join(dir, '1-foto.png')
  sessions.send(meta.id, 'Ponla en el video', undefined, [imagen])
  assert.equal(mandado[0], `Ponla en el video\n\nImagen adjunta: ${imagen}`)
  assert.equal(mostrado[0], 'Ponla en el video')
  sessions.send(meta.id, 'Sin imagen')
  assert.equal(mandado.at(-1), 'Sin imagen')
})
