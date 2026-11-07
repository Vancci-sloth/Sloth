import { randomBytes } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'
import { revisarEntrada } from '../electron/confirmacion.ts'
import { descargaPeligrosa, urlPermitida } from '../shared/navegador-politica.ts'
import type { MarcaNavegador } from '../shared/types.ts'
import { esperarQueResponda, lanzarNavegador, nuevoNavegador, responde } from './navegador-seguro.ts'

/**
 * El agente en el navegador instalado (Opciones → Navegador: `chrome` o `edge`). Playwright MCP no abre Chrome solo: se
 * conecta por CDP a este relevo (`ws://127.0.0.1:<puerto>/<secreto>/<hilo>/<modo>`), que abre Chrome con el perfil del
 * agente de Sloth (`data/navegador-chrome`, o `data/navegador-edge`; nunca el tuyo) por `navegador-seguro.ts` y le pasa todo
 * tal cual, salvo lo que la política no deja. Es lo de `electron/relevo.ts`, para una ventana que no es de Sloth:
 * - `Page.navigate` y `Target.createTarget` a `file:`, `chrome:`, `javascript:`… no salen (`urlPermitida`);
 * - un clic izquierdo o un Enter del agente sobre «publicar», «pagar», «borrar», «enviar»… (o que envía un formulario
 *   POST) espera a que la persona diga Permitir o Bloquear, en un aviso dentro de la misma página de Chrome
 *   (`scriptDeAviso`), con la lógica de `electron/confirmacion.ts`; sin respuesta en 90 s, se bloquea;
 * - las descargas `.exe`, `.msi`, `.bat`… se cancelan al empezar (`Browser.downloadWillBegin` → `Browser.cancelDownload`).
 * Lo que no cubre está en `docs/agents/navegador-seguridad.md`.
 *
 * Un solo Chrome para todos los hilos. El primero que lo pide se queda el contexto con el perfil (`propio`: sus sesiones
 * siguen ahí la próxima vez); los demás, mientras ese hilo lo usa, van en un contexto limpio (`aislado`, `--isolated` de
 * Playwright), sin pisarse las pestañas. Se cierra tras `OCIOSO` sin ningún hilo conectado.
 */

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OCIOSO = 10 * 60_000
/** Los ids de los comandos del relevo mismo, para no chocar con los de Playwright (que cuenta desde 1). */
const PRIMER_ID_PROPIO = 1_000_000_000
const ESPERA_CONFIRMACION = 90_000

type Mensaje = { id?: number; method?: string; params?: Record<string, unknown>; sessionId?: string; result?: unknown; error?: { message?: string } }

/** Lo que el filtro necesita del mundo: por dónde manda a Playwright (`aCliente`) y a Chrome (`aArriba`). */
export interface Tubos {
  aCliente(texto: string): void
  aArriba(texto: string): void
}

/**
 * El aviso de confirmación, dentro de la página. Va en un mundo aislado y en un shadow root cerrado: los scripts de la
 * página (y los del agente, que corren en el mundo de la página) no lo alcanzan, y solo cuenta un clic de verdad
 * (`isTrusted`). Si la página lo quita o se va, cuenta como «Bloquear».
 */
export function scriptDeAviso(accion: string, sitio: string, espera = ESPERA_CONFIRMACION): string {
  return `new Promise((listo) => {
  const anfitrion = document.createElement('div');
  anfitrion.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;display:flex;align-items:flex-start;justify-content:center;padding-top:48px;background:rgba(15,14,12,.6)';
  const sombra = anfitrion.attachShadow({ mode: 'closed' });
  sombra.innerHTML = '<div style="font:14px system-ui,sans-serif;background:#171512;color:#ede6d6;border:1px solid #2e2a24;border-radius:10px;padding:18px 20px;max-width:420px;box-shadow:0 12px 40px rgba(0,0,0,.5)">'
    + '<div style="color:#9a907f;font-size:12px;margin-bottom:6px">Sloth · el agente pide permiso</div><div id="t" style="margin-bottom:14px;line-height:1.4"></div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end"><button id="no" style="font:inherit;padding:6px 14px;border-radius:8px;border:1px solid #2e2a24;background:#221f1b;color:#ede6d6;cursor:pointer">Bloquear</button>'
    + '<button id="si" style="font:inherit;padding:6px 14px;border-radius:8px;border:0;background:#e8a33d;color:#1b1408;cursor:pointer">Permitir</button></div></div>';
  sombra.getElementById('t').textContent = 'El agente quiere: ' + ${JSON.stringify(accion)} + ' en ' + ${JSON.stringify(sitio)} + '.';
  let hecho = false;
  const fin = (si) => { if (hecho) return; hecho = true; clearTimeout(reloj); vigia.disconnect(); anfitrion.remove(); listo(si); };
  const reloj = setTimeout(() => fin(false), ${Number(espera)});
  sombra.getElementById('si').addEventListener('click', (e) => e.isTrusted && fin(true));
  sombra.getElementById('no').addEventListener('click', (e) => e.isTrusted && fin(false));
  const vigia = new MutationObserver(() => { if (!anfitrion.isConnected) fin(false); });
  (document.body || document.documentElement).appendChild(anfitrion);
  vigia.observe(document.documentElement, { childList: true, subtree: true });
})`
}

/**
 * El filtro de una conexión de Playwright: lo que llega de él (`deCliente`) y de Chrome (`deArriba`). Puro salvo los
 * tubos: lo prueba `chrome-agente.test.ts` con un Chrome de mentira.
 */
export function crearFiltro(t: Tubos) {
  let n = PRIMER_ID_PROPIO
  const propios = new Map<number, { ok(v: unknown): void; mal(e: Error): void }>()
  /** Mientras la persona decide, el agente no manda clics ni teclas: no puede contestarse solo el aviso. */
  let preguntando = false

  function propio(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
    const id = ++n
    return new Promise((ok, mal) => {
      propios.set(id, { ok, mal })
      t.aArriba(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  }

  const rechazar = (m: Mensaje, motivo: string) => t.aCliente(JSON.stringify({ id: m.id, error: { code: -32000, message: motivo }, ...(m.sessionId ? { sessionId: m.sessionId } : {}) }))

  async function preguntar(sessionId: string, accion: string, sitio: string): Promise<boolean> {
    preguntando = true
    try {
      await propio('Page.bringToFront', {}, sessionId).catch(() => {})
      const { frameTree } = await propio('Page.getFrameTree', {}, sessionId)
      const { executionContextId } = await propio('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'sloth-confirmacion' }, sessionId)
      const r = await propio('Runtime.evaluate', { expression: scriptDeAviso(accion, sitio), contextId: executionContextId, awaitPromise: true, returnByValue: true }, sessionId)
      return r?.result?.value === true
    } catch {
      return false
    } finally {
      preguntando = false
    }
  }

  /** `null` si sigue; si no, por qué no. */
  async function revisar(m: Mensaje): Promise<string | null> {
    const p = m.params ?? {}
    if ((m.method === 'Page.navigate' || m.method === 'Target.createTarget') && typeof p.url === 'string' && p.url) {
      const v = urlPermitida('persist:navegador', p.url)
      if (!v.ok) return v.motivo ?? 'Esa dirección no se abre en el navegador de Sloth.'
    }
    if (m.method === 'Input.dispatchMouseEvent' || m.method === 'Input.dispatchKeyEvent') {
      if (preguntando) return 'Sloth le está preguntando a la persona si deja hacer la acción anterior. Espera su respuesta.'
      if (!m.sessionId) return null
      const sesion = m.sessionId
      return revisarEntrada(m.method, p, {
        evaluar: (expression) => propio('Runtime.evaluate', { expression, returnByValue: true }, sesion).then((r) => r?.result?.value),
        preguntar: (accion, sitio) => preguntar(sesion, accion, sitio)
      })
    }
    return null
  }

  return {
    /** Abre el filtro: que Chrome avise de las descargas, para poder cancelar las peligrosas. */
    iniciar() {
      propio('Browser.setDownloadBehavior', { behavior: 'default', eventsEnabled: true }).catch(() => {})
    },
    deCliente(texto: string) {
      let m: Mensaje
      try {
        m = JSON.parse(texto)
      } catch {
        return
      }
      if (typeof m.id !== 'number' || typeof m.method !== 'string') return t.aArriba(texto)
      const vigilado = m.method === 'Page.navigate' || m.method === 'Target.createTarget' || m.method.startsWith('Input.dispatch')
      if (!vigilado) return t.aArriba(texto)
      revisar(m).then(
        (motivo) => (motivo ? rechazar(m, motivo) : t.aArriba(texto)),
        () => t.aArriba(texto)
      )
    },
    deArriba(texto: string) {
      let m: Mensaje
      try {
        m = JSON.parse(texto)
      } catch {
        return t.aCliente(texto)
      }
      if (typeof m.id === 'number' && m.id > PRIMER_ID_PROPIO) {
        const p = propios.get(m.id)
        propios.delete(m.id)
        if (m.error) p?.mal(new Error(m.error.message ?? 'CDP'))
        else p?.ok(m.result)
        return
      }
      if (m.method === 'Browser.downloadWillBegin') {
        const { guid, suggestedFilename, url } = (m.params ?? {}) as { guid?: string; suggestedFilename?: string; url?: string }
        if (guid && (descargaPeligrosa(suggestedFilename ?? '') || descargaPeligrosa(url ?? ''))) {
          propio('Browser.cancelDownload', { guid }).catch(() => {})
          console.error(`navegador: se canceló la descarga de ${suggestedFilename ?? url} (un programa o script).`)
        }
      }
      t.aCliente(texto)
    },
    /** Cierra lo pendiente: Chrome se fue. */
    cerrar() {
      for (const p of propios.values()) p.mal(new Error('Chrome se cerró'))
      propios.clear()
    }
  }
}

// ── El relevo ─────────────────────────────────────────────────────────────────────────────────────────────────────

const chrome = nuevoNavegador()
let relevo: { puerto: number; secreto: string } | null = null
/** El hilo que tiene el contexto con el perfil, y cuántas conexiones tiene abiertas cada hilo. */
let dueno: string | null = null
const abiertas = new Map<string, number>()
let reloj: ReturnType<typeof setTimeout> | undefined
/** Con qué navegador se abre: lo dice `navegadorAgente` según Opciones. */
let elegido: { marca: MarcaNavegador; exe: string } | null = null

const activas = (hilo: string) => abiertas.get(hilo) ?? 0
const total = () => [...abiertas.values()].reduce((a, b) => a + b, 0)

/** El perfil del agente para cada navegador: nunca el tuyo, ni el de la voz o las redes. */
export const perfilAgente = (marca: MarcaNavegador) => join(APP, 'data', marca === 'chrome' ? 'navegador-chrome' : 'navegador-edge')

/** Levanta el relevo (solo escucha en 127.0.0.1, con un secreto en la ruta). Lo llama el servidor al arrancar. */
export function iniciarChromeAgente(): Promise<void> {
  if (relevo) return Promise.resolve()
  const secreto = randomBytes(18).toString('hex')
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0, maxPayload: 256 * 1024 * 1024 })
  wss.on('connection', (ws, req) => void conectar(ws, req, secreto))
  return new Promise((ok, mal) => {
    wss.once('error', mal)
    wss.once('listening', () => {
      wss.on('error', (e) => console.error('navegador: el relevo de Chrome falló:', e.message))
      relevo = { puerto: (wss.address() as { port: number }).port, secreto }
      ok()
    })
  })
}

/**
 * La dirección para Playwright de un hilo, y si va con el perfil (`propio`) o en un contexto limpio. `null` si el relevo
 * no está levantado.
 */
export function direccionChromeAgente(hilo: string, navegador: { marca: MarcaNavegador; exe: string }): { cdp: string; aislado: boolean } | null {
  if (!relevo) return null
  // Cambiaste de navegador en Opciones: el de antes sigue hasta cerrarse por ocioso; el nuevo se abre al siguiente arranque.
  if (!chrome.proceso) elegido = navegador
  else elegido ??= navegador
  const aislado = !!dueno && dueno !== hilo && activas(dueno) > 0
  if (!aislado) dueno = hilo
  return { cdp: `ws://127.0.0.1:${relevo.puerto}/${relevo.secreto}/${encodeURIComponent(hilo)}/${aislado ? 'aislado' : 'propio'}`, aislado }
}

async function abrirChrome(): Promise<string> {
  if (!(await responde(chrome))) {
    if (!elegido) throw new Error('No hay navegador elegido para el agente.')
    const perfil = perfilAgente(elegido.marca)
    mkdirSync(perfil, { recursive: true })
    await lanzarNavegador(chrome, elegido.exe, [`--user-data-dir=${perfil}`, '--disable-sync', 'about:blank'])
    if (!(await esperarQueResponda(chrome))) throw new Error('El navegador del agente no respondió.')
  }
  const version = (await fetch(`http://127.0.0.1:${chrome.valor}/json/version`).then((r) => r.json())) as { webSocketDebuggerUrl: string }
  return version.webSocketDebuggerUrl
}

async function conectar(cliente: WebSocket, req: IncomingMessage, secreto: string) {
  const [, s, hiloCodificado, modo] = (req.url ?? '').split('/')
  if (s !== secreto || !hiloCodificado) return cliente.close(1008, 'No')
  const hilo = decodeURIComponent(hiloCodificado)
  // Otro hilo usa ahora el perfil: este (que se armó con él cuando estaba libre) no entra, como «Browser is already in use».
  if (modo === 'propio' && dueno && dueno !== hilo && activas(dueno) > 0) return cliente.close(1013, 'Otro hilo usa ahora el navegador del agente con su perfil. Vuelve a intentarlo en un rato.')
  if (modo === 'propio') dueno = hilo
  abiertas.set(hilo, activas(hilo) + 1)
  clearTimeout(reloj)
  const cola: string[] = []
  let arriba: WebSocket | null = null
  const filtro = crearFiltro({
    aCliente: (texto) => cliente.readyState === WebSocket.OPEN && cliente.send(texto),
    aArriba: (texto) => (arriba?.readyState === WebSocket.OPEN ? arriba.send(texto) : cola.push(texto))
  })
  cliente.on('message', (d) => filtro.deCliente(d.toString()))
  const fin = () => {
    filtro.cerrar()
    abiertas.set(hilo, Math.max(0, activas(hilo) - 1))
    if (cliente.readyState === WebSocket.OPEN) cliente.close()
    if (arriba && arriba.readyState === WebSocket.OPEN) arriba.close()
    if (!total()) reloj = setTimeout(cerrarChrome, OCIOSO)
  }
  cliente.once('close', fin)
  try {
    arriba = new WebSocket(await abrirChrome(), { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 })
    arriba.on('message', (d) => filtro.deArriba(d.toString()))
    arriba.once('close', () => cliente.readyState === WebSocket.OPEN && cliente.close())
    arriba.on('error', () => {})
    arriba.once('open', () => {
      filtro.iniciar()
      for (const t of cola.splice(0)) arriba!.send(t)
    })
  } catch (e) {
    console.error('navegador:', e instanceof Error ? e.message : e)
    cliente.close(1011, 'No se pudo abrir el navegador del agente.')
  }
}

/** Cierra el navegador del agente con `Browser.close` (sin el «¿Restaurar páginas?» de un cierre a la fuerza). */
async function cerrarChrome() {
  if (total() || !(await responde(chrome))) return
  try {
    const url = await abrirChrome()
    const ws = new WebSocket(url, { perMessageDeflate: false })
    ws.on('error', () => {})
    ws.once('open', () => ws.send(JSON.stringify({ id: 1, method: 'Browser.close' })))
  } catch {
    chrome.proceso?.kill()
  }
}
