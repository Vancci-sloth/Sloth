import assert from 'node:assert/strict'
import test from 'node:test'
import { crearRelevo, type PaginaDelRelevo } from './relevo.ts'

/** Una página de mentira que apunta lo que le llega a su depurador. */
function probar() {
  const enviados: { metodo: string; sesion?: string }[] = []
  const salida: Record<string, unknown>[] = []
  const pagina: PaginaDelRelevo = {
    enviar: async (metodo, _params, sesion) => (enviados.push({ metodo, sesion }), { ok: metodo }),
    id: async () => 'PAGINA',
    url: () => 'https://example.com/',
    titulo: () => 'Ejemplo',
    agente: () => 'Mozilla/5.0',
    descargas: () => {}
  }
  const relevo = crearRelevo(pagina, (t) => salida.push(JSON.parse(t)))
  const mandar = async (c: Record<string, unknown>) => {
    relevo.recibir(JSON.stringify(c))
    await new Promise((r) => setTimeout(r, 0))
  }
  return { relevo, enviados, salida, mandar }
}

test('Playwright ve un navegador con una sola página: la anuncia después de contestar a setAutoAttach', async () => {
  const { salida, mandar } = probar()
  await mandar({ id: 1, method: 'Target.setAutoAttach', params: { autoAttach: true } })
  assert.deepEqual(salida[0], { id: 1, result: {} })
  assert.equal(salida[1].method, 'Target.attachedToTarget')
  const params = salida[1].params as { sessionId: string; targetInfo: { targetId: string; type: string; url: string } }
  assert.equal(params.targetInfo.targetId, 'PAGINA')
  assert.equal(params.targetInfo.type, 'page')
  // Una segunda vez no anuncia otra.
  await mandar({ id: 2, method: 'Target.setAutoAttach', params: { autoAttach: true } })
  assert.equal(salida.length, 3)
})

test('lo de la página va a su depurador; lo de sus marcos, con su sesión; lo del navegador no llega a la página', async () => {
  const { enviados, salida, mandar } = probar()
  await mandar({ id: 1, method: 'Target.setAutoAttach' })
  const pagina = (salida[1].params as { sessionId: string }).sessionId
  await mandar({ id: 2, method: 'Page.enable', sessionId: pagina })
  await mandar({ id: 3, method: 'Runtime.runIfWaitingForDebugger', sessionId: pagina })
  await mandar({ id: 4, method: 'Runtime.runIfWaitingForDebugger', sessionId: 'MARCO-1' })
  await mandar({ id: 5, method: 'Browser.getVersion' })
  // La página ya corre: su runIfWaitingForDebugger no se manda; el del marco sí, o se quedaría congelado.
  assert.deepEqual(enviados, [{ metodo: 'Page.enable', sesion: undefined }, { metodo: 'Runtime.runIfWaitingForDebugger', sesion: 'MARCO-1' }])
  assert.deepEqual(salida.find((m) => m.id === 2), { id: 2, result: { ok: 'Page.enable' }, sessionId: pagina })
  assert.equal((salida.find((m) => m.id === 5)!.result as { product: string }).product, 'Electron')
})

test('no se une a otra página ni abre pestañas: lo dice como error de CDP', async () => {
  const { salida, mandar } = probar()
  await mandar({ id: 1, method: 'Target.attachToTarget', params: { targetId: 'OTRA' } })
  await mandar({ id: 2, method: 'Target.createTarget', params: { url: 'about:blank' } })
  assert.match((salida[0].error as { message: string }).message, /solo tiene la página del hilo/)
  assert.match((salida[1].error as { message: string }).message, /Target.createTarget/)
})

test('los eventos de la página llegan a cada sesión de página, y no antes de que Playwright se una', async () => {
  const { relevo, salida, mandar } = probar()
  relevo.evento('Page.loadEventFired', {})
  assert.equal(salida.length, 0)
  await mandar({ id: 1, method: 'Target.setAutoAttach' })
  await mandar({ id: 2, method: 'Target.attachToTarget', params: { targetId: 'PAGINA' } })
  const otra = (salida.find((m) => m.id === 2)!.result as { sessionId: string }).sessionId
  salida.length = 0
  relevo.evento('Page.loadEventFired', {})
  relevo.evento('Runtime.consoleAPICalled', {}, 'MARCO-1')
  relevo.evento('Browser.downloadWillBegin', { guid: 'x' })
  assert.deepEqual(
    salida.map((m) => [m.method, m.sessionId]),
    [
      ['Page.loadEventFired', 'sloth-pagina'],
      ['Page.loadEventFired', otra],
      ['Runtime.consoleAPICalled', 'MARCO-1'],
      ['Browser.downloadWillBegin', undefined]
    ]
  )
})

test('las cookies del navegador van a las del perfil de la página: así funciona context.request de Playwright', async () => {
  const { enviados, salida, mandar } = probar()
  await mandar({ id: 1, method: 'Storage.getCookies', params: { browserContextId: undefined } })
  await mandar({ id: 2, method: 'Storage.setCookies', params: { cookies: [] } })
  await mandar({ id: 3, method: 'Storage.clearCookies' })
  assert.deepEqual(enviados, [{ metodo: 'Network.getAllCookies', sesion: undefined }, { metodo: 'Network.setCookies', sesion: undefined }, { metodo: 'Network.clearBrowserCookies', sesion: undefined }])
  assert.deepEqual(salida[0], { id: 1, result: { ok: 'Network.getAllCookies' } })
})
