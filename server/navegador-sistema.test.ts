import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buscarChrome, buscarEdge, elegirNavegador, type Entorno, guardarPreferencia, leerPreferencia, marcaDe } from './navegador-sistema.ts'

const entorno = (plataforma: NodeJS.Platform, hay: string[], extra: Partial<Entorno> = {}): Entorno => ({
  plataforma,
  env: {},
  casa: plataforma === 'win32' ? 'C:\\Users\\ana' : plataforma === 'darwin' ? '/Users/ana' : '/home/ana',
  existe: (r) => hay.includes(r),
  ...extra
})

test('Chrome en Windows: Program Files, (x86), el de solo tu usuario y, al final, el registro', () => {
  const env = { PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local' }
  const pf = join('C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
  const x86 = join('C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe')
  const local = join('C:\\Users\\ana\\AppData\\Local', 'Google', 'Chrome', 'Application', 'chrome.exe')
  assert.equal(buscarChrome(entorno('win32', [pf, local], { env })), pf)
  assert.equal(buscarChrome(entorno('win32', [x86], { env })), x86)
  assert.equal(buscarChrome(entorno('win32', [local], { env })), local)
  assert.equal(buscarChrome(entorno('win32', ['D:\\Apps\\chrome.exe'], { env, registro: (p) => (p === 'chrome.exe' ? 'D:\\Apps\\chrome.exe' : null) })), 'D:\\Apps\\chrome.exe')
  assert.equal(buscarChrome(entorno('win32', [], { env, registro: () => null })), null)
})

test('Chrome en Mac: en /Applications o en ~/Applications; sin Edge no pasa nada', () => {
  const app = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const mio = join('/Users/ana', 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')
  assert.equal(buscarChrome(entorno('darwin', [app])), app)
  assert.equal(buscarChrome(entorno('darwin', [mio])), mio)
  assert.equal(buscarEdge(entorno('darwin', [app])), null)
  assert.deepEqual(elegirNavegador('edge', { chrome: app, edge: null }), { marca: 'chrome', exe: app })
})

test('Chrome en Linux: las rutas de siempre y, si no, el PATH (google-chrome, chromium)', () => {
  assert.equal(buscarChrome(entorno('linux', ['/usr/bin/google-chrome-stable'])), '/usr/bin/google-chrome-stable')
  assert.equal(buscarChrome(entorno('linux', [join('/home/ana/bin', 'chromium')], { env: { PATH: '/nada:/home/ana/bin' } })), join('/home/ana/bin', 'chromium'))
  assert.equal(buscarChrome(entorno('linux', [], { env: { PATH: '/usr/local/bin' } })), null)
})

test('SLOTH_CHROME manda si existe', () => {
  assert.equal(buscarChrome(entorno('linux', ['/x/chrome', '/usr/bin/google-chrome'], { env: { SLOTH_CHROME: '/x/chrome' } })), '/x/chrome')
  assert.equal(buscarChrome(entorno('linux', ['/usr/bin/google-chrome'], { env: { SLOTH_CHROME: '/no/esta' } })), '/usr/bin/google-chrome')
})

test('la preferencia: sin elegir no cambia nada; Chrome o Edge si lo pides, y cae al otro si falta', () => {
  const hay = { chrome: '/c', edge: '/e' }
  assert.equal(elegirNavegador('automatico', hay), null)
  assert.deepEqual(elegirNavegador('chrome', hay), { marca: 'chrome', exe: '/c' })
  assert.deepEqual(elegirNavegador('edge', hay), { marca: 'edge', exe: '/e' })
  assert.deepEqual(elegirNavegador('chrome', { chrome: null, edge: '/e' }), { marca: 'edge', exe: '/e' })
  assert.equal(elegirNavegador('chrome', { chrome: null, edge: null }), null)
})

test('qué navegador es un ejecutable', () => {
  assert.equal(marcaDe('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'), 'edge')
  assert.equal(marcaDe('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'), 'edge')
  assert.equal(marcaDe('/usr/bin/microsoft-edge-stable'), 'edge')
  assert.equal(marcaDe('/usr/bin/google-chrome'), 'chrome')
})

test('la preferencia se guarda y se lee; sin archivo o rota, automatico', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sloth-nav-'))
  try {
    const archivo = join(dir, 'sub', 'pref.json')
    assert.equal(leerPreferencia(archivo), 'automatico')
    guardarPreferencia('edge', archivo)
    assert.equal(leerPreferencia(archivo), 'edge')
    guardarPreferencia('chrome', archivo)
    assert.equal(leerPreferencia(archivo), 'chrome')
    writeFileSync(archivo, '{"navegador":"firefox"}')
    assert.equal(leerPreferencia(archivo), 'automatico')
    assert.throws(() => guardarPreferencia('firefox' as 'chrome', archivo))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
