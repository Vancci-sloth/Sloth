import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromiumDelSistema, chromiumElegido, comoLanzar, perfilDe } from './chromium.ts'
import { marcaDe } from './navegador-sistema.ts'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

test('en Mac, la ventana para entrar con Google se abre con open, que la trae al frente', () => {
  assert.deepEqual(comoLanzar(CHROME, ['--user-data-dir=/x', 'https://accounts.google.com/'], true, 'darwin'), [
    'open',
    '-n',
    '-a',
    '/Applications/Google Chrome.app',
    '--args',
    '--user-data-dir=/x',
    'https://accounts.google.com/'
  ])
})

test('sin ventana, o fuera de Mac, se lanza directo', () => {
  assert.deepEqual(comoLanzar(CHROME, ['--headless=new'], false, 'darwin'), [CHROME, '--headless=new'])
  assert.deepEqual(comoLanzar('C:\\Edge\\msedge.exe', ['https://x'], true, 'win32'), ['C:\\Edge\\msedge.exe', 'https://x'])
})

test('con «automático» el navegador y el perfil son los de siempre; si eliges el otro, perfil aparte', () => {
  const hay = { chrome: '/usr/bin/google-chrome', edge: '/opt/microsoft/msedge/msedge' }
  assert.equal(chromiumElegido(true, 'automatico', hay) === chromiumDelSistema(true), true)
  assert.equal(perfilDe('/d/voz/perfil', true, 'automatico', hay), '/d/voz/perfil')
  assert.equal(chromiumElegido(true, 'edge', hay), hay.edge)
  assert.equal(chromiumElegido(false, 'chrome', hay), hay.chrome)
  // En esta máquina de pruebas el de siempre puede ser cualquiera de los dos: el perfil nuevo solo aparece si cambia la marca.
  const habitual = marcaDe(chromiumDelSistema(true) ?? (process.platform === 'win32' ? 'msedge' : 'chrome'))
  assert.equal(perfilDe('/d/voz/perfil', true, 'edge', hay), habitual === 'edge' ? '/d/voz/perfil' : '/d/voz/perfil-edge')
  assert.equal(perfilDe('/d/voz/perfil', true, 'chrome', hay), habitual === 'chrome' ? '/d/voz/perfil' : '/d/voz/perfil-chrome')
})
