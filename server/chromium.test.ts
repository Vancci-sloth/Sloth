import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { chromiumDeComando, chromiumDelSistema, comoLanzar, elegirNavegador, navegadorDeFuera, navegadorEn, nombreDe } from './chromium.ts'

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
  assert.equal(nombreDe('/usr/bin/chromium-browser'), 'Chromium')
  // Los dos Opera se llaman igual: los distingue su carpeta.
  assert.equal(nombreDe(String.raw`C:\Users\x\AppData\Local\Programs\Opera\opera.exe`), 'Opera')
  assert.equal(nombreDe(String.raw`C:\Users\x\AppData\Local\Programs\Opera GX\opera.exe`), 'Opera GX')
  assert.equal(nombreDe('/Applications/Opera GX.app/Contents/MacOS/Opera'), 'Opera GX')
})

test('el navegador elegido en Opciones manda sobre el de siempre, mientras siga instalado', () => {
  const app = mkdtempSync(join(tmpdir(), 'sloth-navegador-'))
  try {
    const deSiempre = chromiumDelSistema(false)
    navegadorEn(app)
    assert.equal(chromiumDelSistema(false), deSiempre)
    assert.equal(navegadorDeFuera().elegido, null)
    // Solo se deja elegir uno de los instalados.
    assert.throws(() => elegirNavegador(join(app, 'no-esta.exe')), /ya no está instalado/)
    assert.equal(existsSync(join(app, 'data', 'navegador-elegido.json')), false)

    // Lo que lee quien lo abre: el servidor y la ventana, del mismo archivo.
    mkdirSync(join(app, 'data'))
    const elegir = (exe: string) => writeFileSync(join(app, 'data', 'navegador-elegido.json'), JSON.stringify({ exe }))
    elegir(process.execPath)
    assert.equal(chromiumDelSistema(false), process.execPath)
    assert.equal(chromiumDelSistema(true), process.execPath)
    assert.equal(navegadorDeFuera().elegido, process.execPath)
    // Desinstalado, o con el archivo roto, vuelve al de siempre.
    elegir(join(app, 'no-esta.exe'))
    assert.equal(chromiumDelSistema(false), deSiempre)
    writeFileSync(join(app, 'data', 'navegador-elegido.json'), '{')
    assert.equal(chromiumDelSistema(false), deSiempre)

    elegir(process.execPath)
    elegirNavegador(null)
    assert.equal(chromiumDelSistema(false), deSiempre)
    const { lista } = navegadorDeFuera()
    assert.equal(new Set(lista.map((n) => n.nombre)).size, lista.length)
    if (lista[0]) {
      elegirNavegador(lista[0].exe)
      assert.equal(chromiumDelSistema(true), lista[0].exe)
    }
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})
