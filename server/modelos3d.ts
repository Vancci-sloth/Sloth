import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { Biblioteca3D, Modelo3D } from '../shared/types.ts'
import { servir } from './etapas.ts'

/**
 * La biblioteca de modelos 3D (`skills/modelos-3d`), para verla en Sloth: cada modelo (`modelos/<id>`) con su foto, su
 * giro, qué es y qué puede hacer, sus etiquetas y de qué video salió, y los tipos en que se agrupan (`categorias.json`). Solo se lee: los videos la llenan con `modelos.py guardar` y el agente busca en
 * ella antes de hacer uno. Quitarlo es borrar este archivo, sus líneas en `server/index.ts` y las marcadas
 * «modelos 3D» en `web/src`.
 */
export function modelos3d(raiz: string) {
  const dir = join(raiz, 'modelos')
  /** La URL de un archivo de la vista, con su fecha: si se vuelve a sacar, cambia y el navegador no usa la vieja. */
  function url(id: string, archivo: string) {
    const ruta = join(dir, id, archivo)
    return existsSync(ruta) ? `/api/modelos3d/${id}/${archivo}?t=${Math.floor(statSync(ruta).mtimeMs)}` : undefined
  }

  function lista(): Modelo3D[] {
    if (!existsSync(dir)) return []
    const todos: Modelo3D[] = []
    for (const id of readdirSync(dir)) {
      try {
        const ficha = JSON.parse(readFileSync(join(dir, id, 'modelo.json'), 'utf8')) as Omit<Modelo3D, 'id' | 'vista' | 'giro'>
        todos.push({ ...ficha, id, vista: url(id, 'vista.webp'), giro: url(id, 'vista.webm') })
      } catch {
        // Una carpeta sin modelo.json (o a medio escribir) no es un modelo todavía.
      }
    }
    // Los más nuevos primero: lo último que se sumó es lo que más se busca.
    return todos.sort((a, b) => (b.actualizado ?? '').localeCompare(a.actualizado ?? '') || a.nombre.localeCompare(b.nombre))
  }

  function categorias(): Biblioteca3D['categorias'] {
    try {
      return JSON.parse(readFileSync(join(raiz, 'categorias.json'), 'utf8'))
    } catch {
      return []
    }
  }

  /** `GET /api/modelos3d`: los tipos y todos los modelos. `GET /api/modelos3d/<id>/vista.webp` (o `.webm`): la foto o el giro de uno. */
  async function api(req: IncomingMessage, res: ServerResponse, pedido: URL): Promise<boolean> {
    const vista = /^\/api\/modelos3d\/([\w-]+)\/(vista\.(?:webp|webm))$/.exec(pedido.pathname)
    if (vista) return servir(req, res, join(dir, vista[1], vista[2]))
    if (pedido.pathname !== '/api/modelos3d') return false
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ categorias: categorias(), modelos: lista() } satisfies Biblioteca3D))
    return true
  }

  return { api }
}
