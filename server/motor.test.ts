import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import { guardar } from './disco.ts'

const ffmpegs: { proc: EventEmitter & { stdout: EventEmitter }; archivo: string }[] = []
const contextos: { cerrado: boolean; rebuild(): Promise<unknown>; dispose(): void }[] = []
let esperarBuild: Promise<void> | undefined
const entorno = {
  spawn: (_cmd: string, args: string[]) => {
    const proc = Object.assign(new EventEmitter(), { stdout: new EventEmitter() })
    ffmpegs.push({ proc, archivo: args[args.indexOf('-i') + 1] })
    return proc
  },
  contexto: () => {
    const ctx = {
      cerrado: false,
      async rebuild() {
        if (esperarBuild) await esperarBuild
        return { outputFiles: [{ text: 'video' }], metafile: { inputs: { 'src/index.ts': {} } } }
      },
      dispose() { ctx.cerrado = true }
    }
    contextos.push(ctx)
    return ctx
  }
}
;(globalThis as any).__slothMotorPrueba = entorno
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'node:child_process' && /\/motor\.ts$/.test(context.parentURL ?? '')) {
    return { url: 'data:text/javascript,export const spawn = (...args) => globalThis.__slothMotorPrueba.spawn(...args)', shortCircuit: true }
  }
  return next(specifier, context)
} })
const { motorDe, cerrarMotoresOciosos, servirMotor, servirOnda } = await import('./motor.ts')
const avanzar = async () => { for (let i = 0; i < 4; i++) await setImmediate() }

function carpeta(t: test.TestContext) {
  const dir = mkdtempSync(join(tmpdir(), 'sloth-motor-'))
  t.after(() => {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()))
    rmSync(dir, { recursive: true, force: true })
  })
  return dir
}
function respuesta() {
  const r = { estado: 0, headers: {} as Record<string, string>, cuerpo: '' }
  const res = Object.assign(new EventEmitter(), { destroyed: false, writeHead(code: number, headers: Record<string, string>) { r.estado = code; r.headers = headers }, end(body: string) { r.cuerpo = body } }) as unknown as ServerResponse
  return { r, res }
}
function acabarOnda(valor = 32767, code = 0) {
  const { proc } = ffmpegs.at(-1)!
  const pcm = Buffer.alloc(320)
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(valor, i)
  // Un trozo impar conserva el byte que falta para la siguiente lectura.
  proc.stdout.emit('data', pcm.subarray(0, 101))
  proc.stdout.emit('data', pcm.subarray(101))
  proc.emit('close', code)
}
const pedirOnda = async (file: string) => {
  const { r, res } = respuesta()
  await servirOnda(res, file)
  return r
}

test('las ondas comparten FFmpeg, conservan el formato y se recalculan al cambiar el archivo', async (t) => {
  const file = join(carpeta(t), 'voz.wav')
  guardar(file, 'audio')
  const n = ffmpegs.length
  const a = pedirOnda(file)
  const b = pedirOnda(file)
  await avanzar()
  assert.equal(ffmpegs.length, n + 1)
  acabarOnda()
  for (const r of await Promise.all([a, b])) {
    assert.equal(r.estado, 200)
    assert.deepEqual(JSON.parse(r.cuerpo), { porSegundo: 50, picos: [255] })
    assert.equal(r.headers['cache-control'], 'no-cache')
  }
  await pedirOnda(file)
  assert.equal(ffmpegs.length, n + 1)
  guardar(file, 'otro audio')
  const nuevo = pedirOnda(file)
  await avanzar()
  acabarOnda(0)
  assert.deepEqual(JSON.parse((await nuevo).cuerpo).picos, [0])
})

test('muchas pistas se calculan de una en una y un fallo no bloquea las siguientes', async (t) => {
  const dir = carpeta(t)
  const n = ffmpegs.length
  const pedidos = [0, 1, 2].map((i) => {
    const file = join(dir, `${i}.wav`)
    guardar(file, 'audio')
    return pedirOnda(file)
  })
  for (let i = 0; i < 3; i++) {
    await avanzar()
    assert.equal(ffmpegs.length, n + i + 1)
    acabarOnda(100, i === 0 ? 1 : 0)
  }
  assert.deepEqual((await Promise.all(pedidos)).map((r) => r.estado), [500, 200, 200])
  const reintento = pedirOnda(join(dir, '0.wav'))
  await avanzar()
  acabarOnda()
  assert.equal((await reintento).estado, 200)
})

test('la caché de ondas conserva 32 archivos recientes y suelta los anteriores', async (t) => {
  const dir = carpeta(t)
  for (let i = 0; i < 33; i++) {
    if (i === 32) await pedirOnda(join(dir, '0.wav'))
    const file = join(dir, `${i}.wav`)
    guardar(file, 'audio')
    const pedido = pedirOnda(file)
    await avanzar()
    acabarOnda()
    await pedido
  }
  const n = ffmpegs.length
  await pedirOnda(join(dir, '0.wav'))
  assert.equal(ffmpegs.length, n, 'el archivo que se volvió a mirar sigue guardado')
  const viejo = pedirOnda(join(dir, '1.wav'))
  await avanzar()
  assert.equal(ffmpegs.length, n + 1, 'el más antiguo se soltó')
  acabarOnda()
  await viejo
})

test('salir del editor descarta ondas en espera sin cancelar la que otra ventana sigue necesitando', async (t) => {
  const dir = carpeta(t)
  for (const file of ['activa', 'dejada', 'compartida']) guardar(join(dir, `${file}.wav`), 'audio')
  const activa = pedirOnda(join(dir, 'activa.wav'))
  const dejada = respuesta()
  const compartida = respuesta()
  const a = servirOnda(dejada.res, join(dir, 'dejada.wav'))
  const b = servirOnda(compartida.res, join(dir, 'compartida.wav'))
  const c = pedirOnda(join(dir, 'compartida.wav'))
  await avanzar()
  for (const res of [dejada.res, compartida.res]) { res.destroyed = true; res.emit('close') }
  const n = ffmpegs.length
  acabarOnda()
  await avanzar()
  assert.equal(ffmpegs.length, n + 1)
  assert.equal(ffmpegs.at(-1)!.archivo, join(dir, 'compartida.wav'))
  acabarOnda()
  await Promise.all([activa, a, b, c])
  assert.equal(dejada.r.cuerpo, '')
  assert.equal(compartida.r.cuerpo, '')
  assert.equal((await c).estado, 200)
})

function proyecto(t: test.TestContext) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() })
  const dir = carpeta(t)
  for (const parte of ['src', 'node_modules/@remotion/player', 'node_modules/remotion', 'node_modules/esbuild/lib']) mkdirSync(join(dir, parte), { recursive: true })
  guardar(join(dir, 'src/index.ts'), 'registerRoot')
  guardar(join(dir, 'node_modules/esbuild/lib/main.js'), 'module.exports = { context: async () => globalThis.__slothMotorPrueba.contexto() }')
  t.after(() => {
    t.mock.timers.tick(600_000)
    cerrarMotoresOciosos([])
  })
  return dir
}

test('el motor visible conserva su compilador; el que se dejó libera recursos y vuelve con otra versión', async (t) => {
  const dir = proyecto(t)
  motorDe(dir, () => {})
  await avanzar()
  const antes = motorDe(dir, () => {})!
  const ctx = contextos.at(-1)!
  assert.ok(antes.v > 0)
  t.mock.timers.tick(600_000)
  cerrarMotoresOciosos([dir])
  await avanzar()
  assert.equal(ctx.cerrado, false)
  cerrarMotoresOciosos([])
  await avanzar()
  assert.equal(ctx.cerrado, true)
  const { res, r } = respuesta()
  servirMotor(res, dir, 'motor.js', '/')
  assert.equal(r.estado, 404)
  motorDe(dir, () => {})
  await avanzar()
  assert.ok(motorDe(dir, () => {})!.v > antes.v)
})

test('cerrar un motor mientras compila no lo vuelve a publicar al terminar', async (t) => {
  const dir = proyecto(t)
  let soltar!: () => void
  esperarBuild = new Promise<void>((ok) => { soltar = ok })
  motorDe(dir, () => {})
  await avanzar()
  t.mock.timers.tick(600_000)
  cerrarMotoresOciosos([])
  soltar()
  esperarBuild = undefined
  await avanzar()
  const { res, r } = respuesta()
  servirMotor(res, dir, 'motor.js', '/')
  assert.equal(r.estado, 404)
  assert.equal(contextos.at(-1)!.cerrado, true)
})
