import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { aLaPapelera } from './disco.ts'

// Solo en Mac, donde los videos no se borraban: va de verdad a la Papelera, y sin el respaldo de `~/.Trash` (que avisa
// por `console.error`), para saber que macOS aceptó moverlo. Los nombres llevan lo que rompe un comando mal armado.
test('en Mac, un video va a la Papelera sin pedir permiso para el Finder', { skip: process.platform !== 'darwin' }, async (t) => {
  const carpeta = mkdtempSync(join(tmpdir(), 'sloth-papelera-'))
  t.after(() => rmSync(carpeta, { recursive: true, force: true }))
  const avisos = t.mock.method(console, 'error', () => {})
  const videos = ['1. TÍTULO.mp4', "el 'bueno' (final).mp4"].map((n) => join(carpeta, n))
  for (const v of videos) writeFileSync(v, 'video')

  assert.deepEqual(await aLaPapelera(videos), [])
  assert.ok(videos.every((v) => !existsSync(v)))
  assert.deepEqual(avisos.mock.calls.map((c) => c.arguments), [])

  // Uno que ya no está no rompe nada ni deja otro sin mover.
  const otro = join(carpeta, 'otro.mp4')
  writeFileSync(otro, 'video')
  assert.deepEqual(await aLaPapelera([videos[0], otro]), [])
  assert.ok(!existsSync(otro))
})
