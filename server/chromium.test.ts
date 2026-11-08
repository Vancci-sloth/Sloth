import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromiumDeComando, comoLanzar, nombreDe } from './chromium.ts'

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

test('del registro de Windows solo se toma un Chromium, con o sin comillas', () => {
  assert.equal(chromiumDeComando(String.raw`"C:\Program Files\Google\Chrome\Application\chrome.exe" --single-argument %1`), String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`)
  assert.equal(chromiumDeComando(String.raw`C:\Brave\brave.exe -- "%1"`), String.raw`C:\Brave\brave.exe`)
  assert.equal(chromiumDeComando(String.raw`"C:\Program Files\Mozilla Firefox\firefox.exe" -osint -url "%1"`), null)
  assert.equal(chromiumDeComando(''), null)
})

test('el nombre del navegador sale de su programa', () => {
  assert.equal(nombreDe(String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`), 'Edge')
  assert.equal(nombreDe(String.raw`C:\BraveSoftware\Brave-Browser\Application\brave.exe`), 'Brave')
  assert.equal(nombreDe('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'), 'Edge')
  assert.equal(nombreDe(CHROME), 'Chrome')
})
