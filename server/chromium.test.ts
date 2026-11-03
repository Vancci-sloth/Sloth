import assert from 'node:assert/strict'
import { test } from 'node:test'
import { comoLanzar } from './chromium.ts'

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
