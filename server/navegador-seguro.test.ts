import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { argumentos, lanzarNavegador, nuevoNavegador, procesoDelPerfil, puertoDelPerfil } from './navegador-seguro.ts'
import { conectarCDP } from './playwright.ts'

test('los argumentos: depurador solo en 127.0.0.1, sin bienvenida, y nunca sin perfil de Sloth', () => {
  const a = argumentos(5123, ['--user-data-dir=/v/perfil', '--remote-debugging-port=9222', '--remote-debugging-address=0.0.0.0', 'about:blank'])
  assert.deepEqual(a, ['--remote-debugging-port=5123', '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check', '--user-data-dir=/v/perfil', 'about:blank'])
  assert.ok(!a.includes('--remote-debugging-address=0.0.0.0'))
  assert.throws(() => argumentos(1, ['about:blank']), /propio perfil/)
  // Los fijos no se repiten si ya venían.
  assert.equal(argumentos(1, ['--user-data-dir=/p', '--no-first-run']).filter((x) => x === '--no-first-run').length, 1)
})

test('lanza con un proceso simulado: anota puerto y ejecutable, y los suelta al salir', async () => {
  const llamadas: { exe: string; args: string[] }[] = []
  const proceso = Object.assign(new EventEmitter(), { kill: () => proceso.emit('exit', 0), unref() {} })
  const nav = nuevoNavegador()
  await lanzarNavegador(nav, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--user-data-dir=/v/voz-chrome'], {
    puerto: async () => 40123,
    spawn: ((exe: string, args: string[]) => (llamadas.push({ exe, args }), proceso)) as never
  })
  assert.equal(nav.valor, 40123)
  assert.equal(nav.exe, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  assert.ok(llamadas[0].args.includes('--remote-debugging-address=127.0.0.1'))
  assert.ok(llamadas[0].args.includes('--remote-debugging-port=40123'))
  proceso.kill()
  assert.equal(nav.valor, 0)
  assert.equal(nav.proceso, null)
  assert.equal(nav.exe, null)
})

test('un ejecutable que no se puede lanzar no tumba nada', async () => {
  const proceso = Object.assign(new EventEmitter(), { kill() {}, unref() {} })
  const nav = nuevoNavegador()
  await lanzarNavegador(nav, '/no/esta', ['--user-data-dir=/p'], { puerto: async () => 1, spawn: (() => proceso) as never })
  proceso.emit('error', new Error('ENOENT'))
  assert.equal(nav.valor, 0)
})

test('antes de lanzar, cierra el navegador que se quedó con el perfil (si no, el nuevo sale al instante y el puerto queda en 0)', async () => {
  const orden: string[] = []
  const proceso = Object.assign(new EventEmitter(), { kill() {}, unref() {} })
  await lanzarNavegador(nuevoNavegador(), 'chrome', ['--user-data-dir=/v/voz'], {
    liberar: async (p) => void orden.push(`liberar ${p}`),
    puerto: async () => (orden.push('puerto'), 5),
    spawn: (() => (orden.push('spawn'), proceso)) as never
  })
  assert.deepEqual(orden, ['liberar /v/voz', 'puerto', 'spawn'])
})

test('el puerto anotado en el perfil (DevToolsActivePort), o 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sloth-perfil-'))
  try {
    assert.equal(puertoDelPerfil(dir), 0)
    writeFileSync(join(dir, 'DevToolsActivePort'), '46545\n/devtools/browser/abc\n')
    assert.equal(puertoDelPerfil(dir), 46545)
    writeFileSync(join(dir, 'DevToolsActivePort'), 'basura')
    assert.equal(puertoDelPerfil(dir), 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('el puerto de un huérfano, por su línea de órdenes (el principal, no sus hijos)', () => {
  const perfil = 'C:\\Sloth\\data\\voz\\perfil-chrome'
  const lineas = [
    '12 "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --type=renderer --user-data-dir="C:\\Sloth\\data\\voz\\perfil-chrome" --remote-debugging-port=1',
    '811876 "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=46545 --remote-debugging-address=127.0.0.1 --user-data-dir="C:\\Sloth\\data\\voz\\perfil-chrome" --headless=new',
    '7 "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=999 --user-data-dir=C:\\otro'
  ]
  assert.deepEqual(procesoDelPerfil(lineas, perfil), { pid: 811876, puerto: 46545 })
  assert.equal(procesoDelPerfil(lineas, 'C:\\nada'), null)
  // Un perfil que empieza igual que otro no es el mismo.
  assert.equal(procesoDelPerfil(['5 chrome --user-data-dir=/home/a/voz2 --remote-debugging-port=1'], '/home/a/voz'), null)
  assert.deepEqual(procesoDelPerfil(['  4000 /usr/bin/chrome --remote-debugging-port=4000 --user-data-dir=/home/a/voz'], '/home/a/voz'), { pid: 4000, puerto: 4000 })
  assert.deepEqual(procesoDelPerfil(['9 chrome --user-data-dir=/home/a/voz --headless=new'], '/home/a/voz'), { pid: 9, puerto: 0 })
})

test('conectarse al puerto 0 avisa claro, no con ECONNREFUSED 127.0.0.1:80', async () => {
  await assert.rejects(conectarCDP('http://127.0.0.1:0'), /no arrancó/)
  await assert.rejects(conectarCDP('ws://127.0.0.1:0/x'), /no arrancó/)
})
