import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { guardar } from './disco.ts'

/**
 * Las ediciones a mano de cada modelo 3D (las piezas movidas, giradas o escaladas en el visor de «Modelos 3D»). Se guardan
 * aparte, en `data/modelos3d-ediciones/<id>.json`, y no tocan el código del modelo: la skill sigue igual, y el visor las
 * aplica al abrirlo. Cada pieza va por su ruta en el árbol (`0/2`) con sus cambios respecto a la original: `p` (mover),
 * `r` (girar, en radianes) y `s` (escalar, en factores). Quitar el archivo es devolver el modelo a su forma de origen.
 */

const LIMITE = 64 * 1024
const ID = /^[\w-]+$/
const numeros = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))

/** Solo lo que el visor entiende: rutas de piezas con sus tres cambios bien formados. */
export function limpiarEdiciones(entrada: unknown): Record<string, { p?: number[]; r?: number[]; s?: number[] }> {
  const salida: Record<string, { p?: number[]; r?: number[]; s?: number[] }> = {}
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return salida
  for (const [ruta, pieza] of Object.entries(entrada as Record<string, unknown>)) {
    if (!/^\d+(\/\d+)*$/.test(ruta) || ruta.length > 200 || !pieza || typeof pieza !== 'object') continue
    const p = pieza as Record<string, unknown>
    const limpia: { p?: number[]; r?: number[]; s?: number[] } = {}
    if (numeros(p.p)) limpia.p = p.p as number[]
    if (numeros(p.r)) limpia.r = p.r as number[]
    // La escala se acota como en el visor (del 5 % al 20 veces la original): una edición vieja con un valor negativo
    // vuelve a verse en vez de dejar la pieza invertida o desaparecida.
    if (numeros(p.s)) limpia.s = (p.s as number[]).map((v) => Math.min(20, Math.max(0.05, v)))
    if (Object.keys(limpia).length) salida[ruta] = limpia
  }
  return salida
}

export function edicionesModelos3d(carpeta: string) {
  const ruta = (id: string) => join(carpeta, `${id}.json`)

  function leer(id: string) {
    if (!existsSync(ruta(id))) return {}
    try {
      return limpiarEdiciones(JSON.parse(readFileSync(ruta(id), 'utf8')))
    } catch {
      return {}
    }
  }

  function enviar(res: ServerResponse, codigo: number, cuerpo: unknown) {
    res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(cuerpo))
  }

  async function cuerpo(req: IncomingMessage): Promise<string | null> {
    let texto = ''
    for await (const trozo of req) {
      texto += trozo
      if (texto.length > LIMITE) return null
    }
    return texto
  }

  async function api(req: IncomingMessage, res: ServerResponse, pedido: URL): Promise<boolean> {
    const coincide = /^\/api\/modelos3d\/ediciones\/([\w-]+)$/.exec(pedido.pathname)
    if (!coincide || !ID.test(coincide[1])) return false
    const id = coincide[1]
    if (req.method === 'GET') {
      enviar(res, 200, leer(id))
      return true
    }
    if (req.method !== 'PUT') return false
    const texto = await cuerpo(req)
    if (texto === null) return enviar(res, 413, { error: 'Demasiado grande' }), true
    let datos: unknown
    try {
      datos = JSON.parse(texto)
    } catch {
      return enviar(res, 400, { error: 'JSON no válido' }), true
    }
    const limpias = limpiarEdiciones(datos)
    mkdirSync(carpeta, { recursive: true })
    guardar(ruta(id), JSON.stringify(limpias, null, 2))
    enviar(res, 200, limpias)
    return true
  }

  return { api, tiene: (id: string) => Object.keys(leer(id)).length > 0 }
}
