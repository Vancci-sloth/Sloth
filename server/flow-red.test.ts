import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { test, type TestContext } from 'node:test'
import { chromium, type Browser, type Locator, type Page } from 'playwright-core'
import type { TrabajoFlow } from '../shared/types.ts'
import { chromiumDelSistema } from './chromium.ts'
import type { CuentaFlow } from './flow/cuentas.ts'
import { type EnFlow, flow } from './flow/index.ts'
import { bajar, esperar, mirarEnvios, ponerAportar, Rechazado, SinConexion } from './flow/pagina.ts'

// La resiliencia de red de Flow (#42) sin Google: la fila con una página de Flow de mentira y el reloj de mentira, la
// descarga con un CDP de mentira, y `mirarEnvios` con un Chromium de verdad y la red frenada por CDP.

/** Deja correr lo que quedó pendiente (promesas y E/S) sin mover el reloj de mentira. */
const vaciar = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r))
}

/** Donde empieza el reloj de mentira; los tiempos de las pruebas van desde aquí. */
const INICIO = Date.UTC(2026, 10, 23, 16)
/** Lo que lleva el reloj de mentira desde `INICIO`, en ms. */
const pasado = () => Date.now() - INICIO

/** Mueve el reloj de mentira de segundo en segundo, dejando correr lo que despierta en cada uno. */
async function avanzar(t: TestContext, ms: number) {
  for (let i = 0; i < ms; i += 1000) {
    t.mock.timers.tick(1000)
    await vaciar()
  }
}

/** Un pedido de lo que haría `generarEnFlow`. */
type Pedido = { prompt: string; cuenta: string; carpeta: string }

/** Flow con la cuenta de la voz y `otras`, y `generar` en lugar de la página de Flow. Empieza el reloj en `INICIO`. */
async function filaDeLaVoz(t: TestContext, generar: (p: Pedido) => Promise<void>, otras: string[] = []) {
  const app = await mkdtemp(join(tmpdir(), 'sloth-flow-red-'))
  t.after(() => rm(app, { recursive: true, force: true }))
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: INICIO })
  t.mock.method(Math, 'random', () => 0)
  const cuenta = (correo: string, deLaVoz: boolean): CuentaFlow => ({
    correo, deLaVoz, abrir: async () => {},
    // Cada cuenta pasa su correo como «navegador», para saber en cuál se generó.
    enEdge: (fn) => fn(correo as unknown as Browser)
  })
  const deFuera: Partial<EnFlow> = {
    paginaFlow: async (b) => ({ correo: b, screenshot: async () => {}, close: async () => {} }) as unknown as Page,
    ponerAportar: async () => {},
    leerSaldo: async () => null,
    cuentasFlow: (() => ({ lista: () => otras.map((c) => cuenta(c, false)), agregando: () => false, error: () => undefined })) as unknown as EnFlow['cuentasFlow'],
    generarEnFlow: async (b, _page, _proyecto, p, carpeta) => {
      await generar({ prompt: p.prompt, cuenta: b as unknown as string, carpeta })
      mkdirSync(carpeta, { recursive: true })
      const archivo = join(carpeta, 'hecha')
      writeFileSync(archivo, Buffer.from([0xff, 0xd8, 0xff, 0xe0]))
      return { creditos: 0, archivo }
    }
  }
  const voz = cuenta('voz@gmail.com', true)
  const servicio = flow(app, { cuenta: () => voz.correo, enEdge: voz.enEdge, abrirEnEdge: voz.abrir }, undefined, deFuera)
  const api = async (ruta: string, cuerpo?: object) => {
    const req = Object.assign(Readable.from(cuerpo ? [Buffer.from(JSON.stringify(cuerpo))] : []), { method: cuerpo ? 'POST' : 'GET', url: ruta })
    const partes: Buffer[] = []
    const res = Object.assign(new Writable({ write(trozo: Buffer, _e, listo) { partes.push(trozo); listo() } }), { writeHead() {} })
    await servicio.api(req as unknown as IncomingMessage, res as unknown as ServerResponse, ruta.split('?')[0])
    return JSON.parse(Buffer.concat(partes).toString())
  }
  const pedir = async (prompt: string): Promise<string> => (await api('/api/flow/generar', { tipo: 'imagen', prompt, salida: join(app, `${prompt}.jpg`) })).id
  const trabajo = (id: string): Promise<TrabajoFlow> => api(`/api/flow/trabajos/${id}`)
  return { app, servicio, api, pedir, trabajo }
}

test('sin conexión, el pedido se reintenta solo a los 30, 60, 120 y 240 s, sin gastar, y tras el quinto se rinde', async (t) => {
  const llamadas: number[] = []
  const { pedir, trabajo, api, servicio } = await filaDeLaVoz(t, async () => {
    llamadas.push(pasado())
    throw new SinConexion('Flow no recibió la imagen (la conexión no dio). No se gastó nada.')
  })
  const id = await pedir('perezoso')
  await vaciar()
  let e = await trabajo(id)
  assert.equal(e.estado, 'en-fila')
  assert.match(e.aviso ?? '', /va lenta .*reintenta solo a las .* \(intento 2 de 5\), sin gastar créditos: no lo pidas otra vez\./)
  assert.equal(e.cuenta, undefined)
  // Que la red no diera no es culpa de la cuenta: no descansa.
  assert.equal((await api('/api/flow')).cuentas[0].descansa, undefined)
  await avanzar(t, 29_000)
  assert.deepEqual(llamadas, [0])
  await avanzar(t, 1000)
  assert.deepEqual(llamadas, [0, 30_000])
  assert.match((await trabajo(id)).aviso ?? '', /intento 3 de 5/)
  await avanzar(t, 450_000 - 30_000)
  assert.deepEqual(llamadas, [0, 30_000, 90_000, 210_000, 450_000])
  e = await trabajo(id)
  assert.equal(e.estado, 'error')
  assert.equal(e.aviso, undefined)
  assert.match(e.error ?? '', /No se gastó nada\. Lo intenté 5 veces y la conexión con Flow no dio\. Espera a que mejore y pídelo otra vez\./)
  // Y no queda nada colgado: no se vuelve a pedir y el servidor se puede reiniciar.
  await avanzar(t, 600_000)
  assert.equal(llamadas.length, 5)
  assert.equal(servicio.ocupado(), null)
})

test('el pedido que esperaba la red vuelve al frente de la fila, y al salir bien se le quita el aviso', async (t) => {
  const orden: string[] = []
  let fallos = 0
  const { pedir, trabajo } = await filaDeLaVoz(t, async ({ prompt }) => {
    orden.push(`${prompt}@${pasado() / 1000}`)
    if (prompt !== 'a' || fallos++) return
    // Tarda un segundo en fallar: «b» ya está en la fila, detrás.
    await new Promise((r) => setTimeout(r, 1000))
    throw new SinConexion('La conexión con Flow falló antes de pedirlo. No se gastó nada.')
  })
  const a = await pedir('a')
  const b = await pedir('b')
  await vaciar()
  // A los 35 s pueden los dos (la cuenta acabó su pausa y a «a» le toca reintentar): va primero el que esperaba.
  await avanzar(t, 120_000)
  assert.deepEqual(orden, ['a@0', 'a@35', 'b@65'])
  const hecho = await trabajo(a)
  assert.equal(hecho.estado, 'lista')
  assert.equal(hecho.aviso, undefined)
  assert.ok(hecho.archivo && existsSync(hecho.archivo))
  assert.equal((await trabajo(b)).estado, 'lista')
})

test('con dos fallos de red seguidos la fila va de uno en uno, y cuando uno sale bien vuelven a ir dos', async (t) => {
  const empiezan: string[] = []
  let enVuelo = 0
  let maximoEnCalma = 0
  let maximoDespues = 0
  let salioBien = false
  const { pedir } = await filaDeLaVoz(t, async ({ prompt, cuenta }) => {
    empiezan.push(`${prompt}@${cuenta.split('@')[0]}@${pasado() / 1000}`)
    if (empiezan.length <= 2) throw new SinConexion('La subida no entró. No se gastó nada.')
    enVuelo++
    if (salioBien) maximoDespues = Math.max(maximoDespues, enVuelo)
    else maximoEnCalma = Math.max(maximoEnCalma, enVuelo)
    await new Promise((r) => setTimeout(r, 40_000))
    enVuelo--
    salioBien = true
  }, ['otra@gmail.com'])
  await pedir('a')
  await vaciar()
  await pedir('b')
  await avanzar(t, 15_000)
  assert.deepEqual(empiezan, ['a@voz@0', 'b@otra@15'])
  await pedir('c')
  await pedir('d')
  await avanzar(t, 200_000)
  // «a» reintenta a los 30 s, solo y con el espacio de la calma (60 s); al salir bien (70 s), «b» y «c» van a la vez.
  assert.deepEqual(empiezan.slice(0, 5), ['a@voz@0', 'b@otra@15', 'a@voz@30', 'b@otra@90', 'c@voz@105'])
  assert.equal(maximoEnCalma, 1)
  assert.equal(maximoDespues, 2)
})

test('sin red en el primer pedido de una cuenta, «Ayudar a mejorar Flow» falla con SinConexion, y lo demás no', async () => {
  const conError = (mensaje: string) => ({ goto: async () => { throw new Error(mensaje) } }) as unknown as Page
  await assert.rejects(ponerAportar(conError('page.goto: net::ERR_INTERNET_DISCONNECTED at https://flow.google.com/'), false), (e: Error) => e instanceof SinConexion && /No se gastó nada/.test(e.message))
  await assert.rejects(ponerAportar(conError('Flow cambió su menú'), false), (e: Error) => !(e instanceof SinConexion))
})

/**
 * Un proyecto de Flow de mentira para `esperar`: la primera tarjeta enseña `antes` (sin % ni imagen, como una que falló)
 * y, al recargar, `despues` (`lista`: con su imagen).
 */
function proyecto(t: TestContext, antes: string, despues: { texto: string; lista: boolean }) {
  t.mock.timers.enable({ apis: ['Date'], now: INICIO })
  let recargas = 0
  const page = {
    url: () => 'https://flow.google.com/project/p1',
    goto: async () => void recargas++,
    waitForLoadState: async () => {},
    waitForTimeout: async (ms: number) => void t.mock.timers.tick(ms),
    locator: () => ({ first: () => ({ waitFor: async () => { throw new Error('sin novedades') } }) })
  } as unknown as Page
  const ahora = () => (recargas ? despues : { texto: antes, lista: false })
  const tarjeta = {
    waitFor: async () => {},
    // Con argumento, lo que mira `esperar`; sin él, el texto (`textoDe`).
    evaluate: async (_fn: unknown, video?: boolean) => (video === undefined ? ahora().texto : { avanza: false, ...ahora() })
  } as unknown as Locator
  return { page, tarjeta, recargas: () => recargas }
}

test('una tarjeta fallida que al recargar ya no está no baja la del pedido anterior: se rechaza con lo que decía', async (t) => {
  const p = proyecto(t, 'Error No se ha podido generar esta imagen. No se te ha cobrado por esta generación.', { texto: 'Perezoso en taza', lista: true })
  await assert.rejects(esperar(p.page, p.tarjeta, 'imagen', 'Perezoso en taza'), (e: Error) => e instanceof Rechazado && /No se ha podido generar esta imagen/.test(e.message))
  assert.equal(p.recargas(), 1)
})

test('una tarjeta quieta que al recargar está hecha se da por lista', async (t) => {
  const p = proyecto(t, 'Perezoso nuevo', { texto: 'Perezoso nuevo', lista: true })
  await esperar(p.page, p.tarjeta, 'imagen', 'Perezoso en taza')
  assert.equal(p.recargas(), 1)
})

/** Una descarga de mentira: el CDP del navegador avisa cuando empieza y cuánto lleva. */
function descarga(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: INICIO })
  let soltado = false
  const cdp = Object.assign(new EventEmitter(), { send: async () => {}, detach: async () => { soltado = true } })
  const navegador = { newBrowserCDPSession: async () => cdp } as unknown as Browser
  const menu = { filter: () => ({ first: () => ({ click: async () => void cdp.emit('Browser.downloadWillBegin', { guid: 'g1' }) }) }) }
  const page = { getByRole: () => menu, locator: () => ({}) } as unknown as Page
  const tarjeta = { click: async () => {} } as unknown as Locator
  const carpeta = join(tmpdir(), `sloth-flow-bajada-${process.pid}`)
  t.after(() => rm(carpeta, { recursive: true, force: true }))
  let fin: { ok?: string; mal?: string } | undefined
  const empezar = async () => {
    void bajar(page, navegador, tarjeta, carpeta).then((ok) => void (fin = { ok }), (e: Error) => void (fin = { mal: e.message }))
    await vaciar()
  }
  const llega = (receivedBytes: number, guid = 'g1', state = 'inProgress') => cdp.emit('Browser.downloadProgress', { guid, state, receivedBytes })
  return { empezar, llega, carpeta, fin: () => fin, soltado: () => soltado }
}

test('una descarga lenta pero que avanza se espera aunque pase de 90 s, y suelta su CDP al acabar', async (t) => {
  const d = descarga(t)
  await d.empezar()
  for (let s = 1; s <= 10; s++) {
    await avanzar(t, 60_000)
    d.llega(s * 100_000)
  }
  assert.equal(d.fin(), undefined)
  d.llega(1_000_000, 'g1', 'completed')
  await vaciar()
  assert.deepEqual(d.fin(), { ok: join(d.carpeta, 'g1') })
  assert.equal(d.soltado(), true)
})

test('una descarga que deja de recibir bytes falla a los 90 s sin nada nuevo, y lo de otra descarga no cuenta', async (t) => {
  const d = descarga(t)
  await d.empezar()
  await avanzar(t, 10_000)
  d.llega(5000)
  await avanzar(t, 30_000)
  // Lo mismo otra vez, u otra descarga: no es avance.
  d.llega(5000)
  d.llega(9000, 'otra')
  await avanzar(t, 59_000)
  assert.equal(d.fin(), undefined)
  await avanzar(t, 1000)
  assert.match(d.fin()?.mal ?? '', /dejó de bajar \(90 s sin llegar nada\)/)
  assert.equal(d.soltado(), true)
})

test('una descarga sin ningún byte falla a los 90 s', async (t) => {
  const d = descarga(t)
  await d.empezar()
  await avanzar(t, 89_000)
  assert.equal(d.fin(), undefined)
  await avanzar(t, 1000)
  assert.match(d.fin()?.mal ?? '', /dejó de bajar/)
})

test('una descarga que no acaba falla a los 15 minutos aunque sigan llegando bytes', async (t) => {
  const larga = descarga(t)
  await larga.empezar()
  for (let s = 1; !larga.fin() && s < 100; s++) {
    await avanzar(t, 30_000)
    larga.llega(s * 1000)
  }
  assert.match(larga.fin()?.mal ?? '', /no bajó en 15 minutos/)
})

test('una descarga que Edge cancela falla en el momento', async (t) => {
  const d = descarga(t)
  await d.empezar()
  d.llega(100, 'g1', 'canceled')
  await vaciar()
  assert.match(d.fin()?.mal ?? '', /Edge canceló la descarga/)
})

const exe = chromiumDelSistema(false)
test('mirarEnvios: con la red frenada, un envío en vuelo no es quietud; sin red, sí; y lo que salió antes no lo ve', { skip: exe ? false : 'no hay Chromium en esta máquina', timeout: 60_000 }, async (t) => {
  // Google, de mentira: cada POST tarda en responder, y la red, además, va frenada por CDP.
  const servidor = createServer((req, res) => {
    if (req.method === 'GET') return res.end('<!doctype html><title>Flow</title>')
    req.resume()
    req.on('end', () => setTimeout(() => res.end('ok'), 1500))
  })
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
  t.after(() => servidor.close())
  const url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/`
  const b = await chromium.launch({ executablePath: exe, headless: true })
  t.after(() => b.close())
  const page = await b.newPage()
  await page.goto(url)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  // Unos 25 kB/s de subida y medio segundo de latencia: 60 kB tardan unos segundos en salir.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 500, downloadThroughput: 25_000, uploadThroughput: 25_000 })
  const mandar = (kb: number) => page.evaluate((n) => void fetch('/subir', { method: 'POST', body: 'x'.repeat(n * 1000) }).catch(() => {}), kb)
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

  const envios = mirarEnvios(page)
  t.after(() => envios.soltar())
  await espera(800)
  assert.ok(envios.quieta() >= 500, 'sin mandar nada, la página está quieta')
  await mandar(60)
  for (let i = 0; i < 4; i++) {
    await espera(500)
    assert.equal(envios.quieta(), 0, 'mientras la subida va, no está quieta')
  }
  // Un GET no es un envío.
  await page.evaluate(() => void fetch('/otra'))
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((r) => r.name.endsWith('/subir')), null, { timeout: 30_000 })
  await espera(300)
  const tras = envios.quieta()
  await espera(1000)
  assert.ok(envios.quieta() >= tras + 800, 'al acabar la subida, la quietud crece')

  // Sin red, el envío falla en el momento: eso es una caída, y la quietud empieza a contar.
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await mandar(10)
  await espera(1200)
  assert.ok(envios.quieta() >= 800, 'sin red, nada queda en vuelo')

  // Un envío que salió antes de empezar a mirar no cuenta: por eso `subir` y `aparece` miran desde antes de mandar.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 500, downloadThroughput: 25_000, uploadThroughput: 25_000 })
  await mandar(60)
  await espera(300)
  const tarde = mirarEnvios(page)
  t.after(() => tarde.soltar())
  await espera(1000)
  assert.equal(envios.quieta(), 0)
  assert.ok(tarde.quieta() >= 800, 'el que empezó a mirar tarde no lo ve en vuelo')
})
