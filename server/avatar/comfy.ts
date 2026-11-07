import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { guardar } from '../disco.ts'

/**
 * El cliente de ComfyUI por su API HTTP (https://docs.comfy.org/development/comfyui-server/comms_routes): `/system_stats`
 * para saber si responde, `/object_info` para saber qué nodos tiene, `/upload/image` para subirle la imagen, el video y
 * el audio (acepta cualquier archivo en su carpeta `input`), `POST /prompt` para encolar el flujo en formato API,
 * `/history/<id>` para esperar y `/view` para bajar el resultado. Se espera preguntando a `/history` cada par de
 * segundos en vez de abrir el WebSocket: llega a lo mismo y funciona igual detrás de un servidor de pruebas.
 *
 * Sloth no instala ni arranca ComfyUI: le habla al que tengas abierto (`BASE_COMFY`, o la dirección de Opciones → Avatar).
 */
export const BASE_COMFY = 'http://127.0.0.1:8188'

type F = typeof fetch

/** Un flujo en formato API: `{ "<id del nodo>": { class_type, inputs } }`. */
export type FlujoApi = Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: unknown }>

export interface SalidaComfy {
  filename: string
  subfolder: string
  type: string
}

export interface StatsComfy {
  version: string
  gpu?: string
  vramLibreGB?: number
  vramTotalGB?: number
}

const GB = 1024 ** 3

/** Si ComfyUI responde en `base`, con su versión y su GPU; si no, `null`. */
export async function detectar(base = BASE_COMFY, f: F = fetch): Promise<StatsComfy | null> {
  try {
    const r = await f(`${base}/system_stats`, { signal: AbortSignal.timeout(2500) })
    if (!r.ok) return null
    const s = (await r.json()) as { system?: { comfyui_version?: string }; devices?: { name?: string; vram_total?: number; vram_free?: number }[] }
    const gpu = s.devices?.[0]
    return {
      version: s.system?.comfyui_version ?? 'desconocida',
      gpu: gpu?.name,
      vramTotalGB: gpu?.vram_total ? Math.round((gpu.vram_total / GB) * 10) / 10 : undefined,
      vramLibreGB: gpu?.vram_free ? Math.round((gpu.vram_free / GB) * 10) / 10 : undefined
    }
  } catch {
    return null
  }
}

/** Los nodos que ComfyUI tiene cargados (sus `class_type`). */
export async function nodosDisponibles(base = BASE_COMFY, f: F = fetch): Promise<Set<string>> {
  const r = await f(`${base}/object_info`)
  if (!r.ok) throw new Error(`ComfyUI respondió ${r.status} a /object_info.`)
  return new Set(Object.keys((await r.json()) as object))
}

/** Los `class_type` que un flujo usa y ComfyUI no tiene (un nodo personalizado sin instalar). */
export const nodosQueFaltan = (flujo: FlujoApi, tiene: Set<string>) => [...new Set(Object.values(flujo).map((n) => n.class_type))].filter((c) => !tiene.has(c))

/** Sube un archivo a la carpeta `input` de ComfyUI. Devuelve el nombre con que lo ve un nodo (`LoadImage`, `LoadAudio`…). */
export async function subirArchivo(ruta: string, base = BASE_COMFY, f: F = fetch): Promise<string> {
  const forma = new FormData()
  // Un prefijo evita pisar el archivo de otro video con el mismo nombre.
  const nombre = `sloth-${randomUUID().slice(0, 8)}-${basename(ruta)}`
  forma.append('image', new Blob([readFileSync(ruta)]), nombre)
  forma.append('overwrite', 'true')
  const r = await f(`${base}/upload/image`, { method: 'POST', body: forma })
  if (!r.ok) throw new Error(`ComfyUI no recibió ${basename(ruta)} (${r.status}).`)
  const d = (await r.json()) as { name?: string; subfolder?: string }
  return d.subfolder ? `${d.subfolder}/${d.name}` : (d.name ?? nombre)
}

/** Encola el flujo. Devuelve el id del pedido. Un nodo mal puesto da un error que dice cuál. */
export async function encolar(flujo: FlujoApi, base = BASE_COMFY, f: F = fetch): Promise<string> {
  const r = await f(`${base}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: flujo, client_id: randomUUID() }) })
  const d = (await r.json().catch(() => null)) as { prompt_id?: string; error?: { message?: string }; node_errors?: Record<string, { errors?: { message?: string; details?: string }[]; class_type?: string }> } | null
  if (!r.ok || !d?.prompt_id) {
    const nodos = Object.entries(d?.node_errors ?? {}).map(([id, e]) => `nodo ${id} (${e.class_type}): ${e.errors?.map((x) => x.details || x.message).join('; ')}`)
    throw new Error(`ComfyUI no aceptó el flujo${d?.error?.message ? `: ${d.error.message}` : ''}${nodos.length ? `. ${nodos.join(' · ')}` : ''}`)
  }
  return d.prompt_id
}

export interface Historia {
  listo: boolean
  error?: string
  salidas: SalidaComfy[]
}

/** Lo que dice `/history/<id>`: si acabó, si falló y los archivos que dejó cada nodo de salida. */
export async function historia(id: string, base = BASE_COMFY, f: F = fetch): Promise<Historia> {
  const r = await f(`${base}/history/${encodeURIComponent(id)}`)
  if (!r.ok) throw new Error(`ComfyUI respondió ${r.status} a /history.`)
  const h = ((await r.json()) as Record<string, { status?: { status_str?: string; completed?: boolean; messages?: [string, { exception_message?: string; node_type?: string }][] }; outputs?: Record<string, Record<string, unknown>> }>)[id]
  if (!h) return { listo: false, salidas: [] }
  const fallo = h.status?.messages?.find((m) => m[0] === 'execution_error')?.[1]
  if (h.status?.status_str === 'error' || fallo) return { listo: true, error: fallo ? `${fallo.node_type ?? 'un nodo'}: ${fallo.exception_message ?? 'falló'}`.split('\n')[0] : 'ComfyUI no pudo con el flujo.', salidas: [] }
  const salidas: SalidaComfy[] = []
  for (const out of Object.values(h.outputs ?? {}))
    for (const lista of Object.values(out))
      if (Array.isArray(lista)) for (const a of lista) if (a && typeof a === 'object' && 'filename' in a) salidas.push({ filename: String((a as SalidaComfy).filename), subfolder: String((a as SalidaComfy).subfolder ?? ''), type: String((a as SalidaComfy).type ?? 'output') })
  return { listo: !!h.status?.completed || salidas.length > 0, salidas }
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Espera a que acabe el pedido (hasta `limiteMs`, 40 minutos por omisión). `alAvanzar` se llama en cada vuelta. */
export async function esperar(id: string, opts: { base?: string; f?: F; limiteMs?: number; cada?: number; alAvanzar?: () => void } = {}): Promise<SalidaComfy[]> {
  const fin = Date.now() + (opts.limiteMs ?? 40 * 60_000)
  while (Date.now() < fin) {
    const h = await historia(id, opts.base, opts.f)
    if (h.error) throw new Error(h.error)
    if (h.listo) return h.salidas
    opts.alAvanzar?.()
    await espera(opts.cada ?? 2000)
  }
  throw new Error('ComfyUI tardó más de 40 minutos; se dejó de esperar. El pedido sigue en su cola.')
}

/** Baja un archivo de salida a `destino`. */
export async function bajar(s: SalidaComfy, destino: string, base = BASE_COMFY, f: F = fetch): Promise<string> {
  const q = new URLSearchParams({ filename: s.filename, subfolder: s.subfolder, type: s.type })
  const r = await f(`${base}/view?${q}`)
  if (!r.ok) throw new Error(`ComfyUI no dio ${s.filename} (${r.status}).`)
  mkdirSync(dirname(destino), { recursive: true })
  guardar(destino, Buffer.from(await r.arrayBuffer()))
  return destino
}

/** Cuál de las salidas es el video: el primer mp4/webm/mov (o gif). */
export const elVideo = (salidas: SalidaComfy[]) => salidas.find((s) => /\.(mp4|webm|mov|mkv)$/i.test(s.filename)) ?? salidas.find((s) => /\.gif$/i.test(s.filename))
