/**
 * Los inicios de sesión de la computadora, desde la web (ADR 0025). Conectar una cuenta abre algo en la pantalla de la
 * computadora; desde el celular no se ve. Aquí se juntan para enseñarlos en la web (`web/src/VentanasRemotas.tsx`):
 *
 * - Terminales (`enTubo`): el inicio de sesión que en la computadora va en su propia ventana (`claude auth login`,
 *   `grok login`…) corre sin ventana; la web ve lo que dice, abre su enlace y le manda lo que pide (el código).
 * - Ventanas de Edge: las que Sloth abre para entrar con Google o en las redes (la voz, Flow, el navegador integrado),
 *   con su CDP en un puerto conocido. Se ven en capturas y se usan con clics y teclado, como el navegador de cada hilo.
 * - La vuelta (`vuelta`): un inicio de sesión que termina en `localhost` (YouTube, Antigravity) no carga en el celular;
 *   pegando esa dirección, Sloth la abre aquí y termina.
 *
 * `GET /api/web/ventanas` las lista; `/api/web/ventanas/edge/<puerto>/<página>/{captura,entrada}`,
 * `POST /api/web/ventanas/terminal/<id>/escribir {texto}` y `POST /api/web/vuelta {url}`.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { WebSocket } from 'ws'
import { entradaCdp } from '../shared/entrada-cdp.ts'
import type { EntradaNavegador } from '../shared/types.ts'
import { cuerpo, json } from './http.ts'

/** Una ventana de la computadora, como la ve la web. */
export type VentanaRemota =
  | { tipo: 'terminal'; id: string; titulo: string; salida: string; url?: string }
  | { tipo: 'edge'; id: string; titulo: string; url: string }

/** Lo que se guarda de lo que escribe una terminal: lo último. */
const SALIDA = 6000
/** Lo más que se espera a que una terminal acabe. */
const ESPERA = 15 * 60_000
/** Los puertos fijos del Edge de las redes, la voz y «Entrar con Google» (`server/redes`, `server/voz`, `electron/google.ts`). */
const PUERTOS = [9334, 9336, 9337]

const terminales = new Map<string, { titulo: string; salida: string; hijo: ChildProcess }>()

/** Quita los colores y los movimientos de cursor de una terminal. */
export const sinEscapes = (s: string) => s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*\x07/g, '').replace(/\r(?!\n)/g, '\n')

/**
 * Un comando que en la computadora iría en su propia ventana, sin ella: lo que escribe se ve en la web y lo que se manda
 * desde ahí le llega como si se escribiera. Se resuelve al acabar.
 */
export function enTubo(titulo: string, comando: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const id = randomUUID()
  const [programa, ...args] = comando
  const hijo = spawn(programa, args, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  const t = { titulo, salida: '', hijo }
  terminales.set(id, t)
  const leer = (d: Buffer) => void (t.salida = (t.salida + sinEscapes(d.toString())).slice(-SALIDA))
  hijo.stdout?.on('data', leer)
  hijo.stderr?.on('data', leer)
  return new Promise<void>((ok, falla) => {
    const reloj = setTimeout(() => hijo.kill(), ESPERA)
    hijo.once('error', (e) => (clearTimeout(reloj), terminales.delete(id), falla(e)))
    hijo.once('exit', () => (clearTimeout(reloj), terminales.delete(id), ok()))
  })
}

/** Los Edge de las cuentas de Flow: cada uno deja su puerto en su perfil (`server/flow/cuentas.ts`). */
function puertosDeFlow(app: string): number[] {
  const dir = join(app, 'data', 'flow', 'cuentas')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map((id) => {
      try {
        return Number(readFileSync(join(dir, id, 'puerto-sloth'), 'utf8').split('\n')[0]) || 0
      } catch {
        return 0
      }
    })
    .filter((p) => p > 0)
}

type Pagina = { id: string; type: string; url: string; title: string; webSocketDebuggerUrl?: string }

const conTope = (url: string) => fetch(url, { signal: AbortSignal.timeout(1500) })

/** Las ventanas de Edge con pantalla que Sloth tiene abiertas ahora (las que trabajan sin ventana no se enseñan). */
async function edges(app: string): Promise<(VentanaRemota & { tipo: 'edge' })[]> {
  const fuera: (VentanaRemota & { tipo: 'edge' })[] = []
  await Promise.all(
    [...new Set([...PUERTOS, ...puertosDeFlow(app)])].map(async (puerto) => {
      try {
        const v = (await (await conTope(`http://127.0.0.1:${puerto}/json/version`)).json()) as { 'User-Agent'?: string }
        if (/Headless/i.test(v['User-Agent'] ?? '')) return
        // Solo páginas web: Edge abre también las suyas (su aviso de sincronizar, la pestaña nueva). La de Google, primero.
        const paginas = ((await (await conTope(`http://127.0.0.1:${puerto}/json/list`)).json()) as Pagina[])
          .filter((p) => p.type === 'page' && /^https?:\/\//.test(p.url))
          .sort((x, y) => Number(y.url.includes('accounts.google.com')) - Number(x.url.includes('accounts.google.com')))
        for (const p of paginas) fuera.push({ tipo: 'edge', id: `${puerto}/${p.id}`, titulo: p.title || p.url, url: p.url })
      } catch {}
    })
  )
  return fuera
}

/** Una conexión CDP a una página de Edge, que se cierra sola tras un rato sin usarse. */
const sesiones = new Map<string, { ws: WebSocket; listo: Promise<void>; n: number; esperan: Map<number, (r: { result?: unknown; error?: { message: string } }) => void>; reloj?: ReturnType<typeof setTimeout> }>()

async function enviarA(puerto: number, pagina: string, metodo: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const clave = `${puerto}/${pagina}`
  let s = sesiones.get(clave)
  if (!s || s.ws.readyState > WebSocket.OPEN) {
    const lista = (await (await conTope(`http://127.0.0.1:${puerto}/json/list`)).json()) as Pagina[]
    const p = lista.find((x) => x.id === pagina)
    if (!p?.webSocketDebuggerUrl) throw new Error('Esa ventana ya se cerró.')
    const ws = new WebSocket(p.webSocketDebuggerUrl)
    const esperan = new Map<number, (r: { result?: unknown; error?: { message: string } }) => void>()
    const listo = new Promise<void>((ok, falla) => (ws.once('open', () => ok()), ws.once('error', falla)))
    ws.on('message', (d) => {
      try {
        const m = JSON.parse(String(d)) as { id?: number; result?: unknown; error?: { message: string } }
        if (m.id !== undefined) esperan.get(m.id)?.(m), esperan.delete(m.id!)
      } catch {}
    })
    ws.on('close', () => sesiones.delete(clave))
    ws.on('error', () => {})
    s = { ws, listo, n: 0, esperan }
    sesiones.set(clave, s)
  }
  await s.listo
  clearTimeout(s.reloj)
  const ses = s
  s.reloj = setTimeout(() => ses.ws.close(), 60_000)
  const id = ++s.n
  return new Promise((ok, falla) => {
    const t = setTimeout(() => (ses.esperan.delete(id), falla(new Error('La ventana no contesta.'))), 10_000)
    ses.esperan.set(id, (r) => (clearTimeout(t), r.error ? falla(new Error(r.error.message)) : ok(r.result)))
    ses.ws.send(JSON.stringify({ id, method: metodo, params }))
  })
}

/** Si `url` es la vuelta de un inicio de sesión a esta computadora (`localhost` o `127.0.0.1`, http). */
export function esVuelta(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 8000) return false
  try {
    const u = new URL(url)
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')
  } catch {
    return false
  }
}

export function ventanasRemotas(app: string) {
  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (url.pathname === '/api/web/ventanas' && req.method === 'GET') {
      const t: VentanaRemota[] = [...terminales].map(([id, x]) => ({ tipo: 'terminal', id, titulo: x.titulo, salida: x.salida, url: /https:\/\/\S+/.exec(x.salida)?.[0] }))
      return json(res, 200, [...t, ...(await edges(app))])
    }
    const term = /^\/api\/web\/ventanas\/terminal\/([\w-]+)\/escribir$/.exec(url.pathname)
    if (term && req.method === 'POST') {
      const t = terminales.get(term[1])
      if (!t) return json(res, 404, { error: 'Esa ventana ya se cerró.' })
      const { texto } = await cuerpo<{ texto?: string }>(req)
      if (typeof texto === 'string') t.hijo.stdin?.write(`${texto.replace(/[\r\n]+/g, ' ').slice(0, 4000)}\n`)
      return json(res, 200, { ok: true })
    }
    const edge = /^\/api\/web\/ventanas\/edge\/(\d{2,5})\/([\w-]+)\/(captura|entrada)$/.exec(url.pathname)
    if (edge) {
      const puerto = Number(edge[1])
      // Solo los Edge de Sloth: los de puertos fijos y los de Flow.
      if (![...PUERTOS, ...puertosDeFlow(app)].includes(puerto)) return json(res, 404, { error: 'No existe' })
      try {
        if (edge[3] === 'captura' && req.method === 'GET') {
          const m = (await enviarA(puerto, edge[2], 'Page.getLayoutMetrics')) as { cssVisualViewport: { clientWidth: number; clientHeight: number } }
          const r = (await enviarA(puerto, edge[2], 'Page.captureScreenshot', { format: 'jpeg', quality: 60 })) as { data: string }
          res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store', 'x-ancho': String(Math.round(m.cssVisualViewport.clientWidth)), 'x-alto': String(Math.round(m.cssVisualViewport.clientHeight)) })
          res.end(Buffer.from(r.data, 'base64'))
          return true
        }
        if (edge[3] === 'entrada' && req.method === 'POST') {
          await entradaCdp((metodo, params) => enviarA(puerto, edge[2], metodo, params), await cuerpo<EntradaNavegador>(req))
          return json(res, 200, { ok: true })
        }
      } catch (e) {
        return json(res, 410, { error: e instanceof Error ? e.message : String(e) })
      }
    }
    if (url.pathname === '/api/web/vuelta' && req.method === 'POST') {
      const { url: vuelta } = await cuerpo<{ url?: string }>(req)
      if (!esVuelta(vuelta)) return json(res, 400, { error: 'Esa no es una dirección de vuelta a tu computadora (empieza con http://localhost o http://127.0.0.1).' })
      try {
        const r = await fetch(vuelta, { redirect: 'manual', signal: AbortSignal.timeout(20_000) })
        return json(res, 200, { ok: r.status < 400, status: r.status })
      } catch (e) {
        return json(res, 502, { error: `No se pudo abrir en tu computadora: ${e instanceof Error ? e.message : e}. Puede que esa vuelta ya haya vencido: vuelve a conectar.` })
      }
    }
    return false
  }
  return { api }
}
