import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import test from 'node:test'
import { CLAUDE_ORIGINAL, entornoPerfilAgente, entornoPerfilClaude, guardarLlavePerfil, llavePerfil, perfilesAgente, perfilesClaude } from './perfiles-agentes.ts'

test('guarda diez cuentas en directorios independientes y recuerda la elegida', t => {
  const base = resolve('data')
  mkdirSync(base, { recursive: true })
  const app = mkdtempSync(join(base, 'prueba-cuentas-claude-'))
  t.after(() => {
    assert.ok(app.startsWith(base + sep))
    rmSync(app, { recursive: true, force: true })
  })
  const gestion = perfilesClaude(app)
  assert.equal(gestion.leer().activa, CLAUDE_ORIGINAL)
  assert.equal(gestion.configuracion(CLAUDE_ORIGINAL), undefined)
  const cuentas = Array.from({ length: 10 }, (_, i) => {
    const id = gestion.nuevo()
    assert.throws(() => gestion.usar(id), /Autoriza/)
    gestion.autorizar(id, `cuenta${i}@ejemplo.test`)
    return id
  })
  assert.equal(new Set(cuentas.map(gestion.configuracion)).size, 10)
  gestion.usar(cuentas[2])
  assert.equal(perfilesClaude(app).leer().activa, cuentas[2])
  assert.throws(() => gestion.autorizar(cuentas[2], 'otra@ejemplo.test'), /correo original/)
  assert.throws(() => gestion.usar(cuentas[2]), /Autoriza/)
  gestion.autorizar(cuentas[2], 'cuenta2@ejemplo.test')
  const dir = gestion.configuracion(cuentas[2])!
  const env = entornoPerfilClaude(dir)
  assert.equal(env.CLAUDE_CONFIG_DIR, dir)
  assert.equal(env.CLAUDE_SECURESTORAGE_CONFIG_DIR, dir)
  assert.equal(env.ANTHROPIC_API_KEY, '')
  assert.throws(() => gestion.configuracion('../ajeno'), /desconocido/)
})

test('cada proveedor tiene su selección y sus llaves independientes', t => {
  const base = resolve('data')
  mkdirSync(base, { recursive: true })
  const app = mkdtempSync(join(base, 'prueba-perfiles-'))
  t.after(() => {
    assert.ok(app.startsWith(base + sep))
    rmSync(app, { recursive: true, force: true })
  })
  const gemini = perfilesAgente('gemini', app)
  const pi = perfilesAgente('pi', app)
  const trabajo = gemini.nuevo()
  const personal = gemini.nuevo()
  const otro = pi.nuevo()
  guardarLlavePerfil(gemini.configuracion(trabajo)!, 'secreto-trabajo')
  guardarLlavePerfil(gemini.configuracion(personal)!, 'secreto-personal')
  gemini.autorizar(trabajo, 'Trabajo')
  gemini.autorizar(personal, 'Personal')
  pi.autorizar(otro, 'Cuenta de Pi')
  gemini.usar(trabajo)
  assert.equal(llavePerfil(gemini.configuracion(trabajo)!), 'secreto-trabajo')
  assert.equal(llavePerfil(gemini.configuracion(personal)!), 'secreto-personal')
  assert.equal(gemini.leer().activa, trabajo)
  assert.equal(pi.leer().activa, otro)
  assert.equal(entornoPerfilAgente('pi', pi.configuracion(otro)).PI_CODING_AGENT_DIR, pi.configuracion(otro))
  assert.ok(!JSON.stringify(gemini.leer()).includes('secreto'))
})
