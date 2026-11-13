import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { textosDelVideo } from './redes/index.ts'

test('el texto de un episodio de El Diff sale de su guion.py, y los package.json no cuentan', (t) => {
  const d = mkdtempSync(join(tmpdir(), 'sloth-textos-'))
  t.after(() => rmSync(d, { recursive: true, force: true }))
  writeFileSync(join(d, 'guion.py'), 'TITULO = "Sam Altman y la RAM"')
  writeFileSync(join(d, 'package.json'), '{}')
  writeFileSync(join(d, 'otro.py'), 'no = "cuenta"')
  const c = textosDelVideo(d)
  assert.match(c, /===== guion\.py =====\nTITULO = "Sam Altman y la RAM"/)
  assert.doesNotMatch(c, /package\.json|otro\.py/)
})

test('lo que mejor cuenta el video va primero, y sin nada que leer queda vacío', (t) => {
  const d = mkdtempSync(join(tmpdir(), 'sloth-textos-'))
  t.after(() => rmSync(d, { recursive: true, force: true }))
  assert.equal(textosDelVideo(d), '')
  writeFileSync(join(d, 'notas.txt'), 'n')
  writeFileSync(join(d, 'guion.md'), 'g')
  writeFileSync(join(d, 'short.json'), 's')
  assert.deepEqual([...textosDelVideo(d).matchAll(/===== (.+) =====/g)].map((m) => m[1]), ['short.json', 'guion.md', 'notas.txt'])
})
