import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

// Las piezas van a una carpeta de prueba: `agentes.ts` la lee al importarse.
const appdata = mkdtempSync(join(tmpdir(), 'sloth-agentes-'))
process.env.APPDATA = appdata
const { cabe, descartarRoto, masNueva, rutaAgente, versionVisible } = await import('./agentes.ts')
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

test('«Actualizar los agentes» solo sube dentro de las cifras que fija Sloth', () => {
  assert.equal(cabe('0.3.317', '0.3.311', 2), true)
  assert.equal(cabe('0.4.0', '0.3.311', 2), false)
  assert.equal(cabe('0.166.0', '0.164.0', 1), true)
  assert.equal(cabe('0.3.311', '0.3.311', 2), false)
  assert.equal(masNueva('0.3.10', '0.3.9'), true)
  assert.equal(masNueva('', '0.3.9'), false)
  assert.equal(masNueva('0.3.9', ''), true)
})

test('de Claude Code va el más nuevo: el de la app o el que se actualizó', () => {
  const versiones = join(appdata, 'sloth', 'piezas', arm ? 'agentes-arm64' : 'agentes', 'claude', 'versiones')
  const bajar = (v: string) => {
    const dir = join(versiones, v)
    const paquete = join(dir, 'node_modules', '@anthropic-ai', `claude-agent-sdk-${plataforma}`)
    mkdirSync(paquete, { recursive: true })
    writeFileSync(join(paquete, 'package.json'), JSON.stringify({ version: v }))
    writeFileSync(join(paquete, process.platform === 'win32' ? 'claude.exe' : 'claude'), '')
    writeFileSync(join(dir, 'version.txt'), `2.${v}`)
    return join(paquete, process.platform === 'win32' ? 'claude.exe' : 'claude')
  }
  const app = rutaAgente('claude')
  // Una más vieja que la de la app no la tapa.
  bajar('0.0.1')
  assert.equal(rutaAgente('claude'), app)
  const nueva = bajar('99.0.0')
  assert.equal(rutaAgente('claude'), nueva)
  assert.equal(versionVisible('claude'), '2.99.0.0')
  rmSync(versiones, { recursive: true, force: true })
})
