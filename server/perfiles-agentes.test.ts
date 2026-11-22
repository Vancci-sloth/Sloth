import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { entornoPerfilClaude, ORIGINAL, perfilesAgente, ponerAppPerfiles } from './perfiles-agentes.ts'
import { Sessions } from './sessions.ts'
import type { AgentOptions } from './agent.ts'

test('las cuentas agregadas viven cada una en su carpeta; la original no se mueve y un correo distinto bloquea la cuenta', (t) => {
  const app = mkdtempSync(join(tmpdir(), 'sloth-cuentas-'))
  t.after(() => rmSync(app, { recursive: true, force: true }))
  const claude = perfilesAgente('claude', app)
  assert.deepEqual(claude.leer(), { activa: ORIGINAL, perfiles: [] })
  assert.equal(claude.configuracion(ORIGINAL), undefined)
  const ids = Array.from({ length: 3 }, (_, i) => {
    const id = claude.nueva()
    assert.throws(() => claude.usar(id), /Autoriza/)
    claude.autorizar(id, `cuenta${i}@ejemplo.test`)
    return id
  })
  assert.equal(new Set(ids.map(claude.configuracion)).size, 3)
  assert.ok(ids.every((id) => existsSync(claude.configuracion(id)!)))
  claude.usar(ids[1])
  assert.equal(perfilesAgente('claude', app).leer().activa, ids[1])
  assert.throws(() => claude.autorizar(ids[1], 'otra@ejemplo.test'), /Vuelve a autorizar/)
  assert.equal(claude.autorizada(ids[1]), false)
  claude.autorizar(ids[1], 'CUENTA1@ejemplo.test')
  assert.equal(claude.autorizada(ids[1]), true)
  assert.throws(() => claude.configuracion('../ajena'), /No hay esa cuenta/)
  // Una cuenta agregada no hereda ninguna llave ni otra API.
  const env = entornoPerfilClaude(claude.configuracion(ids[0])!)
  assert.equal(env.CLAUDE_CONFIG_DIR, claude.configuracion(ids[0]))
  assert.equal(env.ANTHROPIC_API_KEY, '')
  assert.equal(env.ANTHROPIC_BASE_URL, '')
  // Quitar la activa vuelve a la original; ChatGPT lleva las suyas aparte.
  claude.quitar(ids[1])
  assert.equal(claude.leer().activa, ORIGINAL)
  assert.equal(perfilesAgente('codex', app).leer().perfiles.length, 0)
  assert.throws(() => claude.quitar(ORIGINAL), /original/)
})

test('un hilo nuevo usa la cuenta activa y se queda con ella; uno de antes sigue con la original', (t) => {
  const app = mkdtempSync(join(tmpdir(), 'sloth-cuentas-hilo-'))
  t.after(() => rmSync(app, { recursive: true, force: true }))
  // Las cuentas de esta prueba, no las de `data/` del repo.
  ponerAppPerfiles(app)
  t.after(() => ponerAppPerfiles(process.cwd()))
  const configs: (string | undefined)[] = []
  let sesion = 1
  const sesiones = new Sessions(join(app, 'hilos'), () => {}, () => {}, () => {}, () => {}, (opts: AgentOptions) => {
    configs.push(opts.configClaude)
    return { send() { opts.onProviderSession(`s${sesion++}`) }, steer() {}, async interrupt() {}, close() {} }
  })
  t.after(() => sesiones.closeAll())
  const segunda = perfilesAgente('claude', app).nueva()
  perfilesAgente('claude', app).autorizar(segunda, 'otra@ejemplo.test')
  const viejo = sesiones.create({ cardId: 'x', title: 'Viejo', model: 'claude-sonnet-5-5', cwd: app })
  sesiones.meta(viejo.id)!.providerSessionId = 'de-antes'
  const nuevo = sesiones.create({ cardId: 'x', title: 'Nuevo', model: 'claude-sonnet-5-5', cwd: app })
  sesiones.send(viejo.id, 'hola')
  sesiones.send(nuevo.id, 'hola')
  assert.equal(sesiones.meta(viejo.id)?.perfilClaude, ORIGINAL)
  assert.equal(sesiones.meta(nuevo.id)?.perfilClaude, segunda)
  assert.deepEqual(configs, [undefined, perfilesAgente('claude', app).configuracion(segunda)])
})
