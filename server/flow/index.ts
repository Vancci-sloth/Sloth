import { createHash, randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { McpStdioServerConfig } from '@anthropic-ai/claude-agent-sdk'
import type { Browser } from 'playwright-core'
import { FORMATOS_IMAGEN, FORMATOS_VIDEO, MODELOS_IMAGEN, MODELOS_VIDEO, tipoDeArchivo, TOPE_CREDITOS } from '../../shared/flow.ts'
import type { EstadoFlow, TrabajoFlow } from '../../shared/types.ts'
import { VENTA } from '../../shared/venta.ts'
import { guardar } from '../disco.ts'
import { cuerpo, json } from '../http.ts'
import { generarEnFlow, paginaFlow, ponerAportar, URL_FLOW } from './pagina.ts'

/**
 * Las imágenes (Nano Banana) y los videos (Veo) de Google Flow, en la cuenta de Google del usuario, como los generaría él
 * a mano: Flow no tiene API. Los agentes los piden con el MCP `flow` (`mcp.mjs`), que habla con la API de aquí.
 *
 * Usa el mismo Edge sin ventana y la misma sesión que la voz (`server/voz/`), y en su mismo turno: los dos abren y cierran
 * ese Edge, así que van de uno en uno. La sesión de Google no la tiene ningún agente. Lo generado queda en un proyecto de
 * Flow para Sloth (`proyectos`, uno por cuenta), y lo que dura cada pedido está en `pagina.ts`.
 *
 * Gasta los créditos del usuario, y por eso: cada pedido lee el costo antes de generar y no pasa de `tope`; si no cambió
 * nada desde el último archivo de esa ruta (`.huella`), no pide nada, y uno igual que ya está en fila no se repite.
 *
 * `aportar` es «Ayudar a mejorar Flow»: que Google use lo generado para sus productos. Sale apagado aunque en Flow venga
 * encendido, y cada quien lo cambia en Opciones. Se pone antes del primer pedido; si no se puede, no se genera.
 *
 * `derechos` es la fecha en que el usuario confirmó que tiene los derechos de las imágenes que manda de referencia y que
 * cumple la política de Google. Al subir una imagen, Flow pide aceptar eso mismo, y solo con esta confirmación Sloth
 * acepta por él (`adjuntar` en `pagina.ts`): sin ella, un pedido con referencias no se hace.
 */

type Trabajo = TrabajoFlow & { prompt: string; salida: string; huella: string; tope: number; formato: string; referencias: string[] }
interface Ajustes {
  aportar?: boolean
  derechos?: string
  proyectos?: Record<string, string>
}
/** Lo que Flow toma de la voz (`voz()`): su cuenta de Google y su Edge. */
export interface Google {
  cuenta(): string | null
  enEdge<T>(fn: (b: Browser) => Promise<T>): Promise<T>
  abrirEnEdge(url: string): Promise<void>
}

const ESPERA_MAXIMA = 50_000
const SIN_CUENTA = 'No hay cuenta de Google conectada: que el usuario la conecte en Opciones → Voz. Flow usa la misma.'
const SIN_DERECHOS = 'Para mandar referencias a Flow, el usuario debe confirmar que tiene sus derechos, en Opciones → Google Flow. No se generó nada.'
const IMAGEN = /\.(png|jpe?g|webp)$/i

export function flow(app: string, google: Google) {
  const carpeta = join(app, 'data', 'flow')
  const descargas = join(carpeta, 'descargas')
  const archivoAjustes = join(carpeta, 'ajustes.json')
  let ajustes: Ajustes = {}
  try {
    ajustes = JSON.parse(readFileSync(archivoAjustes, 'utf8'))
  } catch {
    // Aún no se usó.
  }
  const guardarAjustes = () => (mkdirSync(carpeta, { recursive: true }), guardar(archivoAjustes, JSON.stringify(ajustes, null, 1)))

  const trabajos = new Map<string, Trabajo>()
  const fila: Trabajo[] = []
  let trabajando = false
  /** La cuenta y el valor de `aportar` que ya se pusieron en Flow desde que arrancó el servidor. */
  let aplicado = ''

  async function generar(t: Trabajo) {
    t.estado = 'generando'
    const bajada = join(descargas, t.id)
    try {
      await google.enEdge(async (b) => {
        const page = await paginaFlow(b)
        try {
          if (t.referencias.length && !ajustes.derechos) throw new Error(SIN_DERECHOS)
          const cuenta = google.cuenta() ?? ''
          const aportar = ajustes.aportar === true
          if (aplicado !== `${cuenta} ${aportar}`) {
            await ponerAportar(page, aportar)
            aplicado = `${cuenta} ${aportar}`
          }
          const hecho = await generarEnFlow(b, page, ajustes.proyectos?.[cuenta], { tipo: t.tipo, prompt: t.prompt, formato: t.formato, modelo: t.modelo, tope: t.tope, referencias: t.referencias }, bajada, (proyecto) => {
            if (ajustes.proyectos?.[cuenta] === proyecto) return
            ajustes.proyectos = { ...ajustes.proyectos, [cuenta]: proyecto }
            guardarAjustes()
          })
          if (tipoDeArchivo(readFileSync(hecho.archivo)) !== t.tipo) throw new Error('Lo que bajó de Flow no es lo pedido (¿se fue la sesión?).')
          mkdirSync(dirname(t.salida), { recursive: true })
          copyFileSync(hecho.archivo, t.salida)
          guardar(`${t.salida}.huella`, t.huella)
          t.creditos = hecho.creditos
          t.archivo = t.salida
          t.estado = 'lista'
        } catch (e) {
          await page.screenshot({ path: join(carpeta, 'error.png') }).catch(() => {})
          throw e
        } finally {
          await page.close().catch(() => {})
        }
      })
    } catch (e) {
      t.estado = 'error'
      t.error = mensaje(e)
    } finally {
      rmSync(bajada, { recursive: true, force: true })
    }
  }

  async function seguir() {
    if (trabajando) return
    trabajando = true
    try {
      for (let t = fila.shift(); t; t = fila.shift()) await generar(t)
    } finally {
      trabajando = false
    }
  }

  function pedir(d: Pick<Trabajo, 'tipo' | 'prompt' | 'formato' | 'modelo' | 'salida' | 'tope' | 'referencias'>): Trabajo {
    const suma = createHash('sha1').update(`${d.tipo}\n${d.modelo}\n${d.formato}\n${d.prompt}`)
    // Lo que importa de una referencia es lo que tiene, no dónde está.
    for (const r of d.referencias) suma.update(readFileSync(r))
    const huella = suma.digest('hex')
    const igual = [...trabajos.values()].find((o) => o.salida === d.salida && o.huella === huella && (o.estado === 'en-fila' || o.estado === 'generando'))
    if (igual) return igual
    const t: Trabajo = { ...d, id: randomBytes(6).toString('hex'), estado: 'en-fila', huella }
    trabajos.set(t.id, t)
    // Los de hace rato ya los recogió su agente.
    for (const id of [...trabajos.keys()].slice(0, -100)) trabajos.delete(id)
    if (existsSync(d.salida) && existsSync(`${d.salida}.huella`) && readFileSync(`${d.salida}.huella`, 'utf8') === huella) return Object.assign(t, { estado: 'lista', archivo: d.salida, creditos: 0 })
    fila.push(t)
    void seguir()
    return t
  }

  const publico = ({ prompt: _p, salida: _s, huella: _h, tope: _t, formato: _f, referencias: _r, ...t }: Trabajo): TrabajoFlow => t
  const estado = (): EstadoFlow => ({ cuenta: google.cuenta(), enFila: fila.length + (trabajando ? 1 : 0), aportar: ajustes.aportar === true, derechos: !!ajustes.derechos })

  async function api(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    if (!path.startsWith('/api/flow')) return false
    const metodo = req.method ?? 'GET'
    if (path === '/api/flow' && metodo === 'GET') return json(res, 200, estado())
    if (path === '/api/flow/ajustes' && metodo === 'POST') {
      const d = await cuerpo<{ aportar?: boolean; derechos?: boolean }>(req)
      if (d.aportar !== undefined) ajustes.aportar = d.aportar
      if (d.derechos !== undefined) ajustes.derechos = d.derechos ? new Date().toISOString() : undefined
      guardarAjustes()
      return json(res, 200, estado())
    }
    if (path === '/api/flow/abrir' && metodo === 'POST') {
      await google.abrirEnEdge(URL_FLOW)
      return json(res, 200, estado())
    }
    if (path === '/api/flow/generar' && metodo === 'POST') {
      const d = await cuerpo<{ tipo?: string; prompt?: string; formato?: string; modelo?: string; salida?: string; tope?: number; referencias?: string[] }>(req)
      if (d.tipo !== 'imagen' && d.tipo !== 'video') return json(res, 400, { error: 'El tipo es imagen o video.' })
      const video = d.tipo === 'video'
      const modelos = video ? MODELOS_VIDEO : MODELOS_IMAGEN
      const formatos = video ? FORMATOS_VIDEO : FORMATOS_IMAGEN
      const modelo = d.modelo?.trim() || modelos[0]
      const formato = d.formato?.trim() || '9:16'
      if (!modelos.includes(modelo)) return json(res, 400, { error: `Flow no tiene ese modelo. Hay: ${modelos.join(', ')}.` })
      if (!formatos[formato]) return json(res, 400, { error: `Esa proporción no está. Hay: ${Object.keys(formatos).join(', ')}.` })
      if (!d.prompt?.trim() || !d.salida || !isAbsolute(d.salida) || !(video ? /\.mp4$/i : /\.jpe?g$/i).test(d.salida))
        return json(res, 400, { error: `Pide el prompt y la ruta absoluta del ${video ? '.mp4' : '.jpg'} donde va.` })
      if (!google.cuenta()) return json(res, 409, { error: SIN_CUENTA })
      const referencias = d.referencias ?? []
      if (video && referencias.length) return json(res, 400, { error: 'Las referencias son para generar_imagen: generar_video solo recibe texto.' })
      const mala = referencias.find((r) => !isAbsolute(r) || !IMAGEN.test(r) || !existsSync(r))
      if (mala) return json(res, 400, { error: `No encuentro la referencia ${mala}: pasa la ruta absoluta de un .png, .jpg o .webp.` })
      if (referencias.length && !ajustes.derechos) return json(res, 409, { error: SIN_DERECHOS })
      return json(res, 200, publico(pedir({ tipo: d.tipo, prompt: d.prompt.trim(), formato, modelo, salida: resolve(d.salida), tope: d.tope ?? TOPE_CREDITOS, referencias })))
    }
    const t = /^\/api\/flow\/trabajos\/(\w+)$/.exec(path)
    if (t && metodo === 'GET') {
      const trabajo = trabajos.get(t[1])
      if (!trabajo) return json(res, 404, { error: 'No conozco ese pedido: Sloth se reinició. Vuelve a pedirlo (si ya estaba hecho, sale al momento y sin gastar).' })
      const hasta = Date.now() + Math.min(ESPERA_MAXIMA, Number(new URL(req.url ?? '', 'http://x').searchParams.get('esperar') ?? 0) * 1000)
      while ((trabajo.estado === 'en-fila' || trabajo.estado === 'generando') && Date.now() < hasta) await new Promise((r) => setTimeout(r, 500))
      return json(res, 200, publico(trabajo))
    }
    return false
  }

  return {
    api,
    /** Por qué no se puede reiniciar el servidor: cortaría un pedido ya pagado. */
    ocupado: () => (trabajando ? 'Sloth está generando en Google Flow. Espera a que termine.' : null)
  }
}

/** El MCP `flow` para los agentes (`mcp.mjs`): lo corre el Node de Sloth y habla con la API de este servidor. */
export function mcpFlow(): Record<string, McpStdioServerConfig> {
  const aqui = dirname(fileURLToPath(import.meta.url))
  // Compilada (`scripts/compilar.mjs`), el servidor va en un solo archivo, server/index.mjs, y el MCP a su lado.
  const script = VENTA ? join(aqui, 'flow', 'mcp.mjs') : join(aqui, 'mcp.mjs')
  if (!existsSync(script) || !process.env.SLOTH_URL) return {}
  return { flow: { type: 'stdio', command: process.execPath, args: [script], env: { SLOTH_URL: process.env.SLOTH_URL } } }
}

const mensaje = (e: unknown) => String(e instanceof Error ? e.message : e).split('\n')[0]
