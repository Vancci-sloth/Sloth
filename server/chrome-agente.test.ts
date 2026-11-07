import assert from 'node:assert/strict'
import test from 'node:test'
import { crearFiltro, scriptDeAviso } from './chrome-agente.ts'

/** Un Chrome de mentira: contesta los comandos del relevo según `respuestas` y anota lo que le llega. */
function montar(respuestas: Record<string, (p: any) => unknown> = {}) {
  const aCliente: any[] = []
  const aArriba: any[] = []
  const filtro = crearFiltro({
    aCliente: (t) => aCliente.push(JSON.parse(t)),
    aArriba: (t) => {
      const m = JSON.parse(t)
      aArriba.push(m)
      const r = respuestas[m.method]
      if (m.id > 1_000_000_000) void Promise.resolve(r ? r(m.params) : {}).then((result) => filtro.deArriba(JSON.stringify({ id: m.id, result })))
    }
  })
  return { filtro, aCliente, aArriba }
}
const espera = () => new Promise((r) => setTimeout(r, 20))

test('navegar a file:, chrome: o javascript: no llega a Chrome', async () => {
  const { filtro, aCliente, aArriba } = montar()
  for (const url of ['file:///C:/Windows/win.ini', 'chrome://settings', 'javascript:alert(1)']) filtro.deCliente(JSON.stringify({ id: 1, method: 'Page.navigate', params: { url }, sessionId: 's' }))
  filtro.deCliente(JSON.stringify({ id: 2, method: 'Target.createTarget', params: { url: 'chrome://downloads' } }))
  await espera()
  assert.equal(aArriba.length, 0)
  assert.equal(aCliente.filter((m) => m.error).length, 4)
  filtro.deCliente(JSON.stringify({ id: 3, method: 'Page.navigate', params: { url: 'https://ejemplo.com' }, sessionId: 's' }))
  await espera()
  assert.equal(aArriba.at(-1).id, 3)
})

test('lo demás pasa tal cual, en los dos sentidos', async () => {
  const { filtro, aCliente, aArriba } = montar()
  filtro.deCliente(JSON.stringify({ id: 7, method: 'Runtime.evaluate', params: { expression: '1' }, sessionId: 's' }))
  filtro.deArriba(JSON.stringify({ id: 7, result: { result: { value: 1 } }, sessionId: 's' }))
  filtro.deArriba(JSON.stringify({ method: 'Page.loadEventFired', params: {}, sessionId: 's' }))
  assert.equal(aArriba[0].id, 7)
  assert.deepEqual(aCliente.map((m) => m.id ?? m.method), [7, 'Page.loadEventFired'])
})

test('un clic en «Publicar» pregunta en la página; Bloquear devuelve un error al agente', async () => {
  for (const permitir of [false, true]) {
    const { filtro, aCliente, aArriba } = montar({
      'Runtime.evaluate': (p) => (p.contextId ? { result: { value: permitir } } : { result: { value: { texto: 'Publicar', envia: false, post: false, sitio: 'tiktok.com' } } }),
      'Page.getFrameTree': () => ({ frameTree: { frame: { id: 'F' } } }),
      'Page.createIsolatedWorld': () => ({ executionContextId: 9 })
    })
    filtro.deCliente(JSON.stringify({ id: 5, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', button: 'left', x: 10, y: 10 }, sessionId: 's' }))
    await espera()
    const aviso = aArriba.find((m) => m.method === 'Runtime.evaluate' && m.params.contextId === 9)
    assert.ok(aviso, 'el aviso va en el mundo aislado')
    assert.match(aviso.params.expression, /closed/)
    assert.equal(aArriba.some((m) => m.id === 5), permitir)
    assert.equal(aCliente.some((m) => m.id === 5 && /bloqueó/.test(m.error?.message ?? '')), !permitir)
  }
})

test('mientras pregunta, el agente no puede mandar clics (no se contesta solo el aviso)', async () => {
  let soltar!: (v: unknown) => void
  const { filtro, aCliente } = montar({
    'Runtime.evaluate': (p) => (p.contextId ? new Promise((r) => (soltar = r)) : { result: { value: { texto: 'Borrar', envia: false, post: false, sitio: 'x.com' } } }),
    'Page.getFrameTree': () => ({ frameTree: { frame: { id: 'F' } } }),
    'Page.createIsolatedWorld': () => ({ executionContextId: 9 })
  })
  filtro.deCliente(JSON.stringify({ id: 1, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 1, y: 1 }, sessionId: 's' }))
  await espera()
  filtro.deCliente(JSON.stringify({ id: 2, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 2, y: 2 }, sessionId: 's' }))
  await espera()
  assert.match(aCliente.find((m) => m.id === 2)?.error?.message ?? '', /preguntando/)
  soltar({ result: { value: false } })
})

test('una descarga de un .exe se cancela al empezar', () => {
  const { filtro, aArriba, aCliente } = montar()
  filtro.deArriba(JSON.stringify({ method: 'Browser.downloadWillBegin', params: { guid: 'g1', suggestedFilename: 'setup.EXE', url: 'https://x/y' } }))
  filtro.deArriba(JSON.stringify({ method: 'Browser.downloadWillBegin', params: { guid: 'g2', suggestedFilename: 'informe.pdf', url: 'https://x/z' } }))
  assert.deepEqual(aArriba.filter((m) => m.method === 'Browser.cancelDownload').map((m) => m.params.guid), ['g1'])
  assert.equal(aCliente.length, 2)
})

test('el aviso escapa el texto de la página', () => {
  const s = scriptDeAviso('"); alert(1); ("', 'malo.com')
  assert.ok(s.includes(JSON.stringify('"); alert(1); ("')))
  assert.match(s, /isTrusted/)
})
