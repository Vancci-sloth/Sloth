import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { leerHistorial, primerUsuario } from './historial.ts'
import { guardar } from './disco.ts'
import { buildTimeline } from '../web/src/items.ts'

test('la vista compacta sobrevive al reinicio, se invalida al escribir y conserva salidas y estados', async (t) => {
  const base = resolve('data')
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, 'prueba-historial-'))
  t.after(() => {
    assert.ok(dir.startsWith(base + '\\') || dir.startsWith(base + '/'))
    rmSync(dir, { recursive: true, force: true })
  })
  const file = join(dir, 'hilo.jsonl'), vista = join(dir, 'vistas/hilo.json')
  guardar(file, [
    { t: 'tool', id: 'a', name: 'Bash', input: { command: 'prueba' } },
    { t: 'tool_update', id: 'a', output: 'viejo', error: true },
    { t: 'tool_update', id: 'a', output: 'actual' },
    { t: 'tool_update', id: 'a', delta: ' y final', done: true },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
  const [a, b] = await Promise.all([leerHistorial(file, vista), leerHistorial(file, vista)])
  assert.equal(a, b, 'dos ventanas comparten una lectura')
  assert.equal(a.length, 4)
  assert.equal(a[1].t === 'tool_update' && a[1].output, undefined)
  assert.equal(a[1].t === 'tool_update' && a[1].error, true)
  assert.deepEqual(await leerHistorial(file, vista), a)
  assert.equal(JSON.parse(readFileSync(vista, 'utf8')).version, 1)
  appendFileSync(file, JSON.stringify({ t: 'tool_update', id: 'a', output: 'nuevo', done: true }) + '\n')
  const nueva = await leerHistorial(file, vista)
  assert.equal(nueva.length, 5)
  const item = buildTimeline(nueva)[0]
  assert.equal(item.kind === 'tool' && item.output, 'nuevo')
  assert.equal(item.kind === 'tool' && item.error, true)
  guardar(vista, '{roto')
  assert.deepEqual(await leerHistorial(file, vista), nueva, 'una caché dañada se reconstruye')
})

test('el primer mensaje se lee del principio, aunque el registro sea enorme o tenga líneas dañadas', (t) => {
  const base = resolve('data')
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, 'prueba-primer-usuario-'))
  t.after(() => {
    assert.ok(dir.startsWith(base + '\\') || dir.startsWith(base + '/'))
    rmSync(dir, { recursive: true, force: true })
  })
  const file = join(dir, 'hilo.jsonl')
  // Más largo que un trozo de lectura, con letras de varios bytes partidas entre dos trozos.
  const usuario = { t: 'user', text: 'á漢🦥'.repeat(20000) + '\nIdea: canal/idea', at: 1 }
  guardar(file, '{línea dañada}\n' + JSON.stringify({ t: 'info', text: 'Inicio' }) + '\n' + JSON.stringify(usuario) + '\n')
  // Lo de después no se lee: leer 64 MB de más tardaría segundos.
  truncateSync(file, 64 * 1024 * 1024)
  const antes = performance.now()
  assert.deepEqual(primerUsuario(file), usuario)
  assert.ok(performance.now() - antes < 500)
  guardar(file, JSON.stringify({ t: 'info', text: 'Aún sin mensaje' }))
  assert.equal(primerUsuario(file), undefined)
  appendFileSync(file, '\n' + JSON.stringify(usuario))
  assert.deepEqual(primerUsuario(file), usuario, 'la última línea, sin salto al final, también cuenta')
  assert.equal(primerUsuario(join(dir, 'no-existe.jsonl')), undefined)
})
