import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

// Las piezas van a una carpeta de prueba: `agentes.ts` la lee al importarse.
const appdata = mkdtempSync(join(tmpdir(), 'sloth-agentes-'))
process.env.APPDATA = appdata
const { descartarRoto, rutaAgente } = await import('./agentes.ts')
test.after(() => rmSync(appdata, { recursive: true, force: true }))

// Grok no viene en la app: solo se busca en lo bajado.
const plataforma = `${process.platform}-${process.arch}`
const arm = process.platform === 'darwin' && process.arch === 'arm64'
const raiz = join(appdata, 'sloth', 'piezas', arm ? 'agentes-arm64' : 'agentes', 'grok')
const carpeta = join(raiz, '1.0.70')
const exe = join(carpeta, 'node_modules', '@xai-official', `grok-${plataforma}`, 'bin', process.platform === 'win32' ? 'grok.exe' : 'grok')

function bajado() {
  rmSync(raiz, { recursive: true, force: true })
  mkdirSync(join(exe, '..'), { recursive: true })
  writeFileSync(exe, 'a medias')
}

test('lo que se cortó a media descarga no cuenta como bajado', () => {
  bajado()
  assert.equal(rutaAgente('grok'), exe)
  writeFileSync(join(carpeta, '.bajando'), '')
  assert.equal(rutaAgente('grok'), null)
})

test('un programa que no arranca por no ser programa se borra; otro error, no', () => {
  bajado()
  assert.equal(descartarRoto('grok', Object.assign(new Error('spawn EBUSY'), { code: 'EBUSY' })), false)
  assert.equal(rutaAgente('grok'), exe)
  assert.equal(descartarRoto('grok', Object.assign(new Error('spawn EFTYPE'), { code: 'EFTYPE' })), true)
  assert.equal(existsSync(raiz), false)
  assert.equal(rutaAgente('grok'), null)
})
