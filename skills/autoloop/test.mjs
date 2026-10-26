// Prueba del árbitro en un repo temporal: node test.mjs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOOP = join(dirname(fileURLToPath(import.meta.url)), 'autoloop.mjs')
const dir = mkdtempSync(join(tmpdir(), 'autoloop-'))
const sh = (cmd, ...args) => execFileSync(cmd, args, { cwd: dir, encoding: 'utf8' })
const loop = (...args) => sh('node', LOOP, ...args)
const value = (v) => writeFileSync(join(dir, 'value.txt'), String(v))
const states = () => readFileSync(join(dir, '.autoloop/results.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t')[4])

try {
  sh('git', 'init', '-q', '-b', 'main')
  sh('git', 'config', 'user.email', 't@t')
  sh('git', 'config', 'user.name', 't')
  value(1)
  sh('git', 'add', '.')
  sh('git', 'commit', '-qm', 'inicio')

  loop('init', 't')
  const config = { command: 'node -e "console.log(\'score: \' + require(\'fs\').readFileSync(\'value.txt\', \'utf8\'))"', score: '^score: (\\d+)', better: 'higher', done: '^score: 3' }
  writeFileSync(join(dir, '.autoloop/config.json'), JSON.stringify(config))
  writeFileSync(join(dir, '.autoloop/checks/valor.mjs'), '// el check')
  loop('lock', 'f1')

  assert.match(loop('round', 'base'), /keep/)
  value(2)
  assert.match(loop('round', 'sube a 2'), /keep/)
  value(1)
  assert.match(loop('round', 'baja a 1'), /discard/)
  assert.equal(readFileSync(join(dir, 'value.txt'), 'utf8'), '2', 'el discard deshace el cambio')
  writeFileSync(join(dir, '.autoloop/config.json'), JSON.stringify({ ...config, better: 'lower' }))
  assert.match(loop('round', 'cambia el juez'), /trampa/)
  assert.equal(JSON.parse(readFileSync(join(dir, '.autoloop/config.json'), 'utf8')).better, 'higher', 'la trampa se deshace')
  value(3)
  assert.match(loop('round', 'sube a 3'), /hecho: sí/)
  // Con margen, una mejora más pequeña que el margen no cuenta.
  writeFileSync(join(dir, '.autoloop/config.json'), JSON.stringify({ ...config, margen: 0.5 }))
  loop('lock', 'f2')
  assert.match(loop('round', 'base 2'), /keep/)
  value(4)
  assert.match(loop('round', 'sube a 4, solo un 33 %'), /discard/)
  value(5)
  assert.match(loop('round', 'sube a 5, un 67 %'), /keep/)
  assert.deepEqual(states(), ['lock', 'keep', 'keep', 'discard', 'trampa', 'keep', 'lock', 'keep', 'discard', 'keep'])
  // fin: .autoloop sale de la rama y los checks quedan, versionados, en la carpeta.
  loop('fin', 'bancos/t')
  const enGit = sh('git', 'ls-files').split('\n')
  assert.ok(!enGit.some((f) => f.startsWith('.autoloop/')), '.autoloop ya no va en la rama')
  assert.ok(enGit.includes('bancos/t/checks/valor.mjs') && enGit.includes('bancos/t/config.json'), 'los checks, en la carpeta')
  console.log('ok')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
