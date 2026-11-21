import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { COOKIE, cookies, slothWeb, type SlothWeb } from './web.ts'
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { aFirmar, CODIGO_CORTO, ID_EQUIPO } from '../shared/web.ts'

/**
 * Sloth en la web con un túnel de prueba: el «túnel» es este mismo servidor, y su host es el que traería Cloudflare.
 * El cobro es otro servidor de prueba que anota lo que le llega.
 */
const HOST = 'prueba-de-sloth.trycloudflare.com'
let app: string
let servidor: Server
let cobro: Server
let puerto = 0
let web: SlothWeb
const alCobro: { metodo: string; ruta: string; cuerpo: Record<string, unknown> }[] = []
const quitados: string[] = []

/** Una petición «por el túnel»: al servidor local, con el host del túnel. */
async function porElTunel(ruta: string, o: { metodo?: string; cuerpo?: unknown; cookie?: string; origen?: string | null; sitio?: string; html?: boolean; ip?: string } = {}) {
  const headers: Record<string, string> = { host: HOST }
  if (o.origen !== null) headers.origin = o.origen ?? `https://${HOST}`
  if (o.sitio) headers['sec-fetch-site'] = o.sitio
  if (o.cookie) headers.cookie = o.cookie
  if (o.cuerpo) headers['content-type'] = 'application/json'
  if (o.html) headers.accept = 'text/html'
  if (o.ip) headers['cf-connecting-ip'] = o.ip
  // `fetch` no deja cambiar el Host: va con http.request.
  const { request } = await import('node:http')
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; json: any; texto: string }>((ok, falla) => {
    const r = request({ host: '127.0.0.1', port: puerto, path: ruta, method: o.metodo ?? (o.cuerpo ? 'POST' : 'GET'), headers }, (res) => {
      let t = ''
      res.on('data', (d) => (t += d))
      res.on('end', () => {
        let j: unknown
        try {
          j = JSON.parse(t)
        } catch {}
        ok({ status: res.statusCode!, headers: res.headers, json: j, texto: t })
      })
    })
    r.on('error', falla)
    if (o.cuerpo) r.write(JSON.stringify(o.cuerpo))
    r.end()
  })
}

const sesion = (r: { headers: Record<string, string | string[] | undefined> }) => {
  const c = ([] as string[]).concat(r.headers['set-cookie'] ?? [])[0] ?? ''
  return c.split(';')[0]
}
const DISPOSITIVO = 'AbCdEfGhIjKlMnOpQrStUv'
/** La llave de un dispositivo, como la crea la entrada con WebCrypto (ECDSA P-256), y otra que no es la suya. */
const nuevaLlave = () => generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const LLAVE = nuevaLlave()
const OTRA = nuevaLlave()
const publica = (k: { publicKey: KeyObject }) => k.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url')
const firmar = (k: { privateKey: KeyObject }, texto: string) => sign('sha256', Buffer.from(texto), { key: k.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')

/** Entra como lo hace la página de entrada: pide un reto por el túnel, lo firma con el host y lo manda. */
async function entrarCon(o: { codigo?: string; dispositivo: string; llave: { publicKey: KeyObject; privateKey: KeyObject }; nombre?: string; host?: string; reto?: string; publicaDe?: { publicKey: KeyObject }; ip?: string }) {
  const reto = o.reto ?? (await porElTunel('/api/web/reto', { origen: 'https://web.sloth.vancci.org', sitio: 'cross-site' })).json.reto
  return porElTunel('/api/web/entrar', {
    cuerpo: {
      codigo: o.codigo,
      dispositivo: o.dispositivo,
      reto,
      firma: firmar(o.llave, aFirmar(o.host ?? HOST, reto)),
      publica: o.codigo ? publica(o.publicaDe ?? o.llave) : undefined,
      nombre: o.nombre
    },
    ip: o.ip
  })
}

before(async () => {
  app = mkdtempSync(join(tmpdir(), 'sloth-web-'))
  cobro = createServer((req, res) => {
    let t = ''
    req.on('data', (d) => (t += d))
    req.on('end', () => {
      alCobro.push({ metodo: req.method!, ruta: req.url!, cuerpo: t ? JSON.parse(t) : {} })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
    })
  })
  await new Promise<void>((ok) => cobro.listen(0, '127.0.0.1', ok))
  servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    // Lo de esta computadora pasa (en el servidor de verdad lo decide `peticionDeConfianza`).
    const local = req.headers.host === `localhost:${puerto}`
    const c = local ? 'sesion' : web.confianza(req)
    if (c === null) return void (res.writeHead(403), res.end())
    if (c === 'fuera') return web.aEntrar(req, res)
    if (c === 'publica') return void web.publica(req, res, url)
    if (await web.api(req, res, url)) return
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('la interfaz')
  })
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
  puerto = (servidor.address() as AddressInfo).port
  web = slothWeb({
    app,
    puerto,
    cobro: `http://127.0.0.1:${(cobro.address() as AddressInfo).port}`,
    abrirTunel: async () => ({ url: `https://${HOST}`, cerrado: new Promise(() => {}), cerrar() {} }),
    llega: async () => true,
    alQuitar: (id) => void quitados.push(id)
  })
})

after(() => {
  web.cerrar()
  servidor.close()
  cobro.close()
  rmSync(app, { recursive: true, force: true })
})

test('apagada, el túnel no existe: nada que llegue con otro host se atiende por la web', async () => {
  assert.equal(web.host(), null)
  assert.equal(web.confianza({ headers: { host: HOST }, method: 'GET', url: '/' }), null)
  assert.match(web.equipo, ID_EQUIPO)
})

test('al encenderla abre el túnel y le dice al cobro su dirección, con la llave de esta computadora', async () => {
  const r = await porElTunel('/api/web/encender', { cuerpo: { encendida: true } })
  // Aún sin túnel, esto llega como de otro host: se prueba por la API local más abajo.
  assert.equal(r.status, 403)
  const { request } = await import('node:http')
  await new Promise<void>((ok) => {
    const q = request({ host: '127.0.0.1', port: puerto, path: '/api/web/encender', method: 'POST', headers: { host: `localhost:${puerto}`, 'content-type': 'application/json' } }, (res) => (res.resume(), res.on('end', ok)))
    q.end('{"encendida":true}')
  })
  for (let i = 0; i < 50 && !alCobro.length; i++) await new Promise((r) => setTimeout(r, 20))
  assert.equal(web.host(), HOST)
  const aviso = alCobro.find((a) => a.metodo === 'PUT')!
  assert.equal(aviso.ruta, `/web/${web.equipo}`)
  assert.equal(aviso.cuerpo.url, `https://${HOST}`)
  assert.match(String(aviso.cuerpo.llave), /^[A-Za-z0-9_-]{43}$/)
})

test('sin sesión, por el túnel solo se ve la entrada: lo demás manda a entrar por el cobro', async () => {
  const pagina = await porElTunel('/', { html: true, origen: null })
  assert.equal(pagina.status, 302)
  assert.equal(pagina.headers.location, `https://web.sloth.vancci.org/${web.equipo}`)
  const api = await porElTunel('/api/state')
  assert.equal(api.status, 401)
  assert.equal(api.json.entrar, `https://web.sloth.vancci.org/${web.equipo}`)
  const entrar = await porElTunel('/web/entrar', { origen: null, sitio: 'cross-site' })
  assert.equal(entrar.status, 200)
  assert.match(entrar.texto, /Entrando a tu Sloth/)
  const hola = await porElTunel('/api/web/hola', { origen: 'https://web.sloth.vancci.org', sitio: 'cross-site' })
  assert.deepEqual(hola.json, { equipo: web.equipo })
})

test('otra página no puede usar el túnel: un Origin o un Sec-Fetch-Site ajenos se cortan', () => {
  assert.equal(web.confianza({ headers: { host: HOST, origin: 'https://malo.example' }, method: 'POST', url: '/api/web/entrar' }), null)
  assert.equal(web.confianza({ headers: { host: HOST, 'sec-fetch-site': 'cross-site' }, method: 'POST', url: '/api/sessions' }), null)
})

test('un dispositivo entra con un código de un solo uso; después, con su llave', async () => {
  const sinCodigo = await entrarCon({ dispositivo: DISPOSITIVO, llave: LLAVE })
  assert.equal(sinCodigo.status, 403)

  const { request } = await import('node:http')
  const codigo = await new Promise<any>((ok) => {
    const q = request({ host: '127.0.0.1', port: puerto, path: '/api/web/codigo', method: 'POST', headers: { host: `localhost:${puerto}` } }, (res) => {
      let t = ''
      res.on('data', (d) => (t += d))
      res.on('end', () => ok(JSON.parse(t)))
    })
    q.end()
  })
  assert.match(codigo.corto, CODIGO_CORTO)
  // El corto va al cobro, para escribirlo en su entrada.
  assert.ok(alCobro.some((a) => a.ruta === `/web/${web.equipo}/codigo` && a.cuerpo.corto === codigo.corto))
  const largo = new URL(codigo.enlace).hash.slice(3)

  const r = await entrarCon({ codigo: largo, dispositivo: DISPOSITIVO, llave: LLAVE, nombre: 'Mi celular' })
  assert.equal(r.status, 200)
  const cookie = sesion(r)
  assert.ok(cookie.startsWith(`${COOKIE}=`))
  assert.match(String(r.headers['set-cookie']), /HttpOnly; Secure; SameSite=Strict/)
  assert.equal((await porElTunel('/api/state', { cookie })).texto, 'la interfaz')

  // El mismo código no vale dos veces, ni para otro dispositivo.
  const otraVez = await entrarCon({ codigo: largo, dispositivo: 'ZZZZZZZZZZZZZZZZZZZZZZ', llave: LLAVE })
  assert.equal(otraVez.status, 403)

  // Con su llave vuelve a entrar sin código (el túnel cambió y la sesión se perdió); con otro, no.
  assert.equal((await entrarCon({ dispositivo: DISPOSITIVO, llave: OTRA })).status, 403)
  const vuelve = await entrarCon({ dispositivo: DISPOSITIVO, llave: LLAVE })
  assert.equal(vuelve.status, 200)

  const estado = await porElTunel('/api/web', { cookie: sesion(vuelve) })
  assert.equal(estado.json.desdeLaWeb, true)
  assert.deepEqual(
    estado.json.dispositivos.map((d: any) => [d.nombre, d.este]),
    [['Mi celular', true]]
  )
})

test('lo que guarda el navegador del dispositivo sube a la computadora y vuelve al entrar', async () => {
  const r = await entrarCon({ dispositivo: DISPOSITIVO, llave: LLAVE })
  const cookie = sesion(r)
  assert.equal((await porElTunel('/api/web/guardado', { metodo: 'PUT', cuerpo: { 'sloth-bienvenida-vista': '1', raro: 3 }, cookie })).status, 200)
  const otra = await entrarCon({ dispositivo: DISPOSITIVO, llave: LLAVE })
  assert.deepEqual(otra.json.guardado, { 'sloth-bienvenida-vista': '1' })
})

test('quitar un dispositivo lo saca al momento: su sesión ya no vale y se cierran sus WebSockets', async () => {
  const r = await entrarCon({ dispositivo: DISPOSITIVO, llave: LLAVE })
  const cookie = sesion(r)
  assert.equal(web.confianza({ headers: { host: HOST, cookie }, method: 'GET', url: '/' }), 'sesion')
  await porElTunel('/api/web/quitar', { cuerpo: { id: DISPOSITIVO }, cookie })
  assert.deepEqual(quitados, [DISPOSITIVO])
  assert.equal(web.confianza({ headers: { host: HOST, cookie }, method: 'GET', url: '/' }), 'fuera')
  assert.equal((await entrarCon({ dispositivo: DISPOSITIVO, llave: LLAVE })).status, 403)
})

test('muchos códigos equivocados cierran los códigos un rato, pero un dispositivo ya conectado entra igual', async () => {
  const { request } = await import('node:http')
  const pedirCodigo = () =>
    new Promise<any>((ok) => {
      const q = request({ host: '127.0.0.1', port: puerto, path: '/api/web/codigo', method: 'POST', headers: { host: `localhost:${puerto}` } }, (res) => {
        let t = ''
        res.on('data', (d) => (t += d))
        res.on('end', () => ok(JSON.parse(t)))
      })
      q.end()
    })
  const OTRO = 'OtroOtroOtroOtroOtro22'
  const bueno = new URL((await pedirCodigo()).enlace).hash.slice(3)
  assert.equal((await entrarCon({ codigo: bueno, dispositivo: OTRO, llave: LLAVE })).status, 200)
  for (let i = 0; i < 20; i++) await entrarCon({ codigo: `MALO${i}`, dispositivo: DISPOSITIVO, llave: LLAVE, ip: '203.0.113.9' })
  const otroCodigo = new URL((await pedirCodigo()).enlace).hash.slice(3)
  assert.equal((await entrarCon({ codigo: otroCodigo, dispositivo: DISPOSITIVO, llave: LLAVE, ip: '203.0.113.9' })).status, 429)
  // Desde otra conexión, los códigos siguen valiendo: nadie deja sin conectar a los demás.
  assert.equal((await entrarCon({ codigo: otroCodigo, dispositivo: DISPOSITIVO, llave: LLAVE, ip: '198.51.100.7' })).status, 200)
  assert.equal((await entrarCon({ dispositivo: OTRO, llave: LLAVE })).status, 200)
})

test('una firma no sirve en otro túnel, ni dos veces, ni con una llave que no es la del dispositivo', async () => {
  const OTRO = 'FirmaFirmaFirmaFirma22'
  const { request } = await import('node:http')
  const codigo = await new Promise<any>((ok) => {
    const q = request({ host: '127.0.0.1', port: puerto, path: '/api/web/codigo', method: 'POST', headers: { host: `localhost:${puerto}` } }, (res) => {
      let t = ''
      res.on('data', (d) => (t += d))
      res.on('end', () => ok(JSON.parse(t)))
    })
    q.end()
  })
  const largo = new URL(codigo.enlace).hash.slice(3)
  // Firmado para otro túnel (el de alguien que se hizo pasar por esta computadora): no vale, y el código no se gasta.
  assert.equal((await entrarCon({ codigo: largo, dispositivo: OTRO, llave: LLAVE, host: 'otro.trycloudflare.com' })).status, 403)
  // Con una llave pública que no es la que firmó, tampoco.
  assert.equal((await entrarCon({ codigo: largo, dispositivo: OTRO, llave: LLAVE, publicaDe: OTRA })).status, 403)
  assert.equal((await entrarCon({ codigo: largo, dispositivo: OTRO, llave: LLAVE })).status, 200)
  // El mismo reto otra vez: no.
  const reto = (await porElTunel('/api/web/reto', { origen: null })).json.reto
  assert.equal((await entrarCon({ dispositivo: OTRO, llave: LLAVE, reto })).status, 200)
  assert.equal((await entrarCon({ dispositivo: OTRO, llave: LLAVE, reto })).status, 400)
  // El reto se pide desde la entrada: solo ella lo puede leer.
  const r = await porElTunel('/api/web/reto', { origen: 'https://web.sloth.vancci.org', sitio: 'cross-site' })
  assert.equal(r.headers['access-control-allow-origin'], 'https://web.sloth.vancci.org')
})

test('quitar con un id que no es de un dispositivo no toca nada', async () => {
  const { request } = await import('node:http')
  const estado = await new Promise<number>((ok) => {
    const q = request({ host: '127.0.0.1', port: puerto, path: '/api/web/quitar', method: 'POST', headers: { host: `localhost:${puerto}`, 'content-type': 'application/json' } }, (res) => (res.resume(), res.on('end', () => ok(res.statusCode!))))
    q.end(JSON.stringify({ id: '../web' }))
  })
  assert.equal(estado, 200)
  const { existsSync } = await import('node:fs')
  assert.ok(existsSync(join(app, 'data', 'web.json')))
})

test('las cookies se leen aunque vengan varias', () => {
  assert.deepEqual(cookies({ headers: { cookie: 'a=1; sloth_web=xyz ;b=2' } }), { a: '1', sloth_web: 'xyz', b: '2' })
})
