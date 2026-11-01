import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'

/** Electron simulado: ninguna página real se abre. */
class Pagina extends EventEmitter {
  url = ''
  destruida = false
  limitada = false
  navigationHistory = { canGoBack: () => false, canGoForward: () => false }
  debugger = Object.assign(new EventEmitter(), { isAttached: () => false, attach() {}, detach() {}, sendCommand: async () => ({}) })
  async loadURL(url: string) { this.url = url; await setImmediate(); this.emit('did-navigate'); this.emit('did-stop-loading') }
  isDestroyed() { return this.destruida }
  isLoading() { return false }
  getURL() { return this.url }
  getTitle() { return 'Prueba' }
  getUserAgent() { return 'Prueba' }
  setWindowOpenHandler() {}
  setAudioMuted() {}
  setZoomFactor() {}
  disableDeviceEmulation() {}
  setBackgroundThrottling(si: boolean) { this.limitada = si }
  close() { this.destruida = true; this.emit('destroyed') }
}
const paginas: Pagina[] = []
class Vista {
  webContents = new Pagina()
  constructor() { paginas.push(this.webContents) }
  setBackgroundColor() {}
  setVisible() {}
  setBounds() {}
}
const ipcMain = Object.assign(new EventEmitter(), { handle() {} })
const perfil = Object.assign(new EventEmitter(), {
  getUserAgent: () => 'Prueba', setUserAgent() {}, setPermissionRequestHandler() {}, setPermissionCheckHandler() {}
})
const servidores: Server[] = []
;(globalThis as any).__slothNavegadorPrueba = {
  app: { getName: () => 'Sloth' }, ipcMain, Menu: {}, shell: {}, session: { fromPartition: () => perfil }, WebContentsView: Vista,
  createServer: (...args: Parameters<typeof createServer>) => { const s = createServer(...args); servidores.push(s); return s }
}
registerHooks({ resolve(specifier, context, next) {
  if (/\/navegador\.ts$/.test(context.parentURL ?? '')) {
    if (specifier === 'electron') return { url: 'data:text/javascript,export const {app,ipcMain,Menu,session,shell,WebContentsView}=globalThis.__slothNavegadorPrueba', shortCircuit: true }
    if (specifier === 'node:http') return { url: 'data:text/javascript,export const createServer=(...args)=>globalThis.__slothNavegadorPrueba.createServer(...args)', shortCircuit: true }
  }
  return next(specifier, context)
} })
const { iniciarNavegador, ventanaDelNavegador } = await import('./navegador.ts')
const avanzar = async () => { for (let i = 0; i < 4; i++) await setImmediate() }

test('la página a la vista descansa con Sloth minimizada o escondida y despierta al volver', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const dir = mkdtempSync(join(tmpdir(), 'sloth-navegador-'))
  const ventana = Object.assign(new EventEmitter(), {
    visible: true, minimizada: false, isDestroyed: () => false,
    isVisible() { return this.visible }, isMinimized() { return this.minimizada },
    contentView: { addChildView() {}, removeChildView() {} },
    webContents: Object.assign(new EventEmitter(), { send() {}, getZoomFactor: () => 1 })
  })
  t.after(async () => {
    paginas.forEach((p) => p.close())
    await Promise.all(servidores.map((s) => new Promise<void>((ok) => s.close(() => ok()))))
    rmSync(dir, { recursive: true, force: true })
  })
  iniciarNavegador(dir)
  ventanaDelNavegador(ventana as any)
  await once(servidores[0], 'listening')
  ipcMain.emit('navegador:ir', {}, 'hilo', 'https://ejemplo.test/formulario')
  await avanzar()
  const pagina = paginas[0]
  const ver = async () => { t.mock.timers.tick(5000); await avanzar(); return pagina.limitada }
  ipcMain.emit('navegador:ver', {}, 'hilo', { x: 0, y: 0, width: 800, height: 600 })
  assert.equal(await ver(), false)

  ventana.minimizada = true
  ventana.emit('minimize')
  assert.equal(await ver(), true)
  ventana.minimizada = false
  ventana.emit('restore')
  assert.equal(await ver(), false)

  ventana.visible = false
  ventana.emit('hide')
  assert.equal(await ver(), true)
  ventana.visible = true
  ventana.emit('show')
  assert.equal(await ver(), false)

  assert.equal(pagina.url, 'https://ejemplo.test/formulario')
  assert.equal(pagina.destruida, false)
  assert.equal(paginas.length, 1)
})
