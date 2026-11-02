import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { registerHooks } from 'node:module'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'

/** Proceso y transporte simulados; se ejercita el ciclo de vida real sin cuentas ni programas instalados. */
class Proceso extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  muerto = false
  kill() {
    if (this.muerto) return false
    this.muerto = true
    this.emit('exit', 0)
    if (!tubosAbiertos) this.emit('close', 0)
    return true
  }
}
const procesos: Proceso[] = []
let tubosAbiertos = false
let anunciar = true
let fallaInfo = false
let fallaInstruccion = false
let estadoOAuth = 'pending'
let intentos = 0
let esperarModelo: Promise<unknown> | undefined
let esperarRetiro: Promise<void> | undefined
let agregados = 0
const cliente = {
  server: { info: async () => { if (fallaInfo) throw new Error('No respondió') } },
  event: { async *subscribe({ signal }: { signal: AbortSignal }) { await new Promise<void>((ok) => signal.addEventListener('abort', () => ok(), { once: true })) } },
  credential: { list: async () => [{ integrationID: 'opencode', active: true, value: { metadata: {} } }] },
  integration: {
    get: async () => ({ data: { methods: [{ id: 'device' }] } }),
    oauth: {
      connect: async () => { intentos++; return { data: { attemptID: 'intento', url: 'https://cuenta.example', instructions: 'code: abc' } } },
      status: async () => ({ data: { status: estadoOAuth } }), cancel: async () => {}
    }
  },
  experimental: { usage: { limits: async () => ({ data: {} }) } },
  model: { list: async () => { if (esperarModelo) await esperarModelo; return { data: [] } } },
  session: {
    get: async () => ({ id: 'guardada' }), create: async () => ({ id: 'nueva' }),
    instructions: { entry: { put: async () => { if (fallaInstruccion) throw new Error('No se pudo preparar') } } },
    prompt: async () => {}, interrupt: async () => {}, remove: async () => {}
  },
  mcp: { add: async () => { agregados++ }, remove: async () => { if (esperarRetiro) await esperarRetiro } }
}
const entorno = {
  cliente,
  spawn: () => {
    const p = new Proceso()
    procesos.push(p)
    if (anunciar) queueMicrotask(() => p.stdout.emit('data', Buffer.from('listening on http://127.0.0.1:9999')))
    return p
  }
}
;(globalThis as any).__slothOpenCodePrueba = entorno
const modulos: Record<string, string> = {
  'node:child_process': 'export const spawn = (...args) => globalThis.__slothOpenCodePrueba.spawn(...args)',
  'node:fs': 'export const existsSync = () => true; export const mkdirSync = () => {}',
  '@opencode/client': 'export const OpenCode = { make: () => globalThis.__slothOpenCodePrueba.cliente }',
  './agentes.ts': 'export const asegurarAgente = async () => "opencode"; export const rutaAgente = () => "opencode"',
  './instrucciones.ts': 'export const INSTRUCCIONES = "Prueba"',
  './navegador-agente.ts': 'export const navegadorAgente = () => ({playwright:{command:"node",args:[]}})',
  './voz/index.ts': 'export const mcpVoz = () => ({})',
  './flow/index.ts': 'export const mcpFlow = () => ({})',
  './skills.ts': 'export const SKILLS = "skills"'
}
registerHooks({ resolve(specifier, context, next) {
  if (/\/(?:opencode|cuenta-opencode)\.ts(?:\?|$)/.test(context.parentURL ?? '') && modulos[specifier]) {
    return { url: 'data:text/javascript,' + encodeURIComponent(modulos[specifier]), shortCircuit: true }
  }
  return next(specifier, context)
} })
const { conexion, soltarConexion, startOpenCode, redactarOpenCode } = await import('./opencode.ts')
const { conectarOpenCode, cancelarOpenCode } = await import('./cuenta-opencode.ts')
const avanzar = async () => { for (let i = 0; i < 8; i++) await setImmediate() }
test.beforeEach((t) => {
  assert.ok('mock' in t)
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  anunciar = true
  fallaInfo = fallaInstruccion = tubosAbiertos = false
  esperarModelo = undefined
  esperarRetiro = undefined
  estadoOAuth = 'pending'
  t.after(() => { procesos.forEach((p) => p.kill()) })
})

test('un solo servidor para usos simultáneos; se cierra tras el último y una consulta nueva cancela el cierre', async (t) => {
  const [a, b] = await Promise.all([conexion(), conexion()])
  assert.equal(a, b)
  const p = procesos.at(-1)!
  soltarConexion(a)
  t.mock.timers.tick(70_000)
  assert.equal(p.muerto, false)
  soltarConexion(b)
  t.mock.timers.tick(30_000)
  const c = await conexion()
  assert.equal(c, a)
  t.mock.timers.tick(70_000)
  assert.equal(p.muerto, false)
  soltarConexion(c)
  t.mock.timers.tick(60_000)
  assert.equal(p.muerto, true)
  const d = await conexion()
  assert.notEqual(d, a)
  soltarConexion(d)
})

test('un servidor cerrado cuyos tubos siguen abiertos no deja esperando al siguiente hilo', async (t) => {
  const a = await conexion()
  soltarConexion(a)
  tubosAbiertos = true
  t.mock.timers.tick(60_000)
  assert.equal(procesos.at(-1)!.muerto, true)
  const b = await conexion()
  assert.notEqual(b, a)
  soltarConexion(b)
})

test('un arranque sin dirección o con un servidor que falla no deja procesos huérfanos', async (t) => {
  anunciar = false
  const sinDireccion = conexion()
  const rechazo = assert.rejects(sinDireccion, /tardó demasiado/)
  await avanzar()
  t.mock.timers.tick(60_000)
  await rechazo
  assert.equal(procesos.at(-1)!.muerto, true)
  anunciar = true
  fallaInfo = true
  await assert.rejects(conexion(), /No respondió/)
  assert.equal(procesos.at(-1)!.muerto, true)
})

test('el inicio de sesión comparte un intento y conserva el servidor hasta cancelar', async (t) => {
  const antes = intentos
  await Promise.all([conectarOpenCode(), conectarOpenCode()])
  assert.equal(intentos, antes + 1)
  const p = procesos.at(-1)!
  t.mock.timers.tick(600_000)
  await avanzar()
  assert.equal(p.muerto, false)
  await cancelarOpenCode()
  t.mock.timers.tick(60_000)
  assert.equal(p.muerto, true)
})

test('el código vencido libera el servidor aunque ya no se mire Opciones', async (t) => {
  await conectarOpenCode()
  const p = procesos.at(-1)!
  estadoOAuth = 'expired'
  t.mock.timers.tick(30_000)
  await avanzar()
  t.mock.timers.tick(60_000)
  assert.equal(p.muerto, true)
})

test('cerrar un hilo mientras arranca libera su reserva sin dejar oyentes', async (t) => {
  let soltar!: () => void
  esperarModelo = new Promise<void>((ok) => { soltar = ok })
  const s = await conexion()
  soltarConexion(s)
  const run = startOpenCode({ cwd: 'prueba', model: 'opencode:opencode/prueba', onEvent() {}, onProviderSession() {} })
  await avanzar()
  run.close()
  soltar()
  await avanzar()
  assert.equal(s.oyentes.size, 0)
  t.mock.timers.tick(60_000)
  assert.equal(procesos.at(-1)!.muerto, true)
})

test('un redactor que falla al preparar el turno limpia su reloj y libera el servidor', async (t) => {
  fallaInstruccion = true
  await assert.rejects(redactarOpenCode('opencode:opencode/prueba', 'prueba', 'Hola', [], 'Prueba'), /No se pudo preparar/)
  t.mock.timers.tick(180_000)
  await avanzar()
  assert.equal(procesos.at(-1)!.muerto, true)
})

test('retomar un hilo espera la retirada de sus MCP anteriores para no borrar los nuevos', async (t) => {
  const opts = { cwd: 'prueba', model: 'opencode:opencode/prueba', hilo: 'compartido', onEvent() {}, onProviderSession() {} }
  const a = startOpenCode(opts)
  await avanzar()
  const n = agregados
  let soltar!: () => void
  esperarRetiro = new Promise<void>((ok) => { soltar = ok })
  a.close()
  const b = startOpenCode(opts)
  await avanzar()
  assert.equal(agregados, n)
  soltar()
  await avanzar()
  assert.equal(agregados, n + 1)
  b.close()
  await avanzar()
  t.mock.timers.tick(60_000)
  assert.equal(procesos.at(-1)!.muerto, true)
})

test('un agente que falla al prepararse se descarta para poder reintentarlo', async (t) => {
  fallaInstruccion = true
  let salidas = 0
  const run = startOpenCode({ cwd: 'prueba', model: 'opencode:opencode/prueba', onEvent() {}, onProviderSession() {}, onExit() { salidas++ } })
  run.send('Hola')
  await avanzar()
  assert.equal(salidas, 1)
  t.mock.timers.tick(60_000)
  assert.equal(procesos.at(-1)!.muerto, true)
})
