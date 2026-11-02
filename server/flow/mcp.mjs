/**
 * El MCP `flow`: las herramientas con que un agente pide a Sloth una imagen o un video de Google Flow, que los genera con
 * la cuenta del usuario (`index.ts`). Solo habla con la API del servidor (`SLOTH_URL`): la sesión de Google no pasa por
 * aquí. Es JavaScript sin paquetes, como el de la voz, para que el Node de Sloth lo corra igual en el repo y en la app
 * compilada (`scripts/compilar.mjs` lo copia tal cual). Habla MCP por stdio, un JSON por renglón.
 *
 * Cada herramienta espera como mucho 40 s: Codex corta una herramienta a los 60. Si no acabó, dice el id para seguir
 * esperando con `estado_flow`.
 */
import { createInterface } from 'node:readline'

const URL_SLOTH = process.env.SLOTH_URL ?? 'http://127.0.0.1:4848'
const ESPERA = 40
const PROMPT = { type: 'string', description: 'Lo que se genera, dicho con detalle' }

const HERRAMIENTAS = [
  {
    name: 'generar_imagen',
    description:
      'Genera UNA imagen en Google Flow, en la cuenta de Google del usuario, y deja el JPEG en `salida` (1024×1024 en 1:1, 768×1376 en 9:16). Con `referencias`, edita esas fotos o sigue su estilo: el mismo personaje, la misma escena. Las imágenes no gastan créditos. Tarda de 20 a 90 s, más con referencias; si no acaba en 40 s, devuelve un id para esperarla con estado_flow. Si nada cambió desde el último archivo de esa ruta, sale al momento.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: PROMPT,
        formato: { type: 'string', enum: ['9:16', '16:9', '1:1', '4:3', '3:4'], description: 'La proporción; sin ella, 9:16' },
        modelo: { type: 'string', enum: ['Nano Banana 2.1', 'Nano Banana Pro', 'Nano Banana 2 Lite'], description: 'Sin él, Nano Banana 2.1' },
        referencias: { type: 'array', items: { type: 'string' }, description: 'Las rutas absolutas de las imágenes de referencia (.png, .jpg o .webp). El usuario confirma en Opciones que tiene sus derechos' },
        salida: { type: 'string', description: 'La ruta absoluta del .jpg que deja' }
      },
      required: ['prompt', 'salida']
    }
  },
  {
    name: 'generar_video',
    description:
      'Genera UN video de 8 s con audio en Google Flow, en la cuenta de Google del usuario, y deja el MP4 (720p) en `salida`. GASTA los créditos del usuario: Lite 10, Fast 20, Quality 100. Lee el costo antes de generar y, si pasa de `tope`, no genera. Tarda cerca de un minuto; si no acaba en 40 s, devuelve un id para esperarlo con estado_flow. Si nada cambió desde el último archivo de esa ruta, sale al momento y sin gastar.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: PROMPT,
        formato: { type: 'string', enum: ['9:16', '16:9'], description: 'La proporción; sin ella, 9:16' },
        modelo: { type: 'string', enum: ['Veo 3.1 - Lite', 'Veo 3.1 - Fast', 'Veo 3.1 - Quality', 'Omni 1.1 Flash'], description: 'Sin él, Veo 3.1 - Lite' },
        salida: { type: 'string', description: 'La ruta absoluta del .mp4 que deja' },
        tope: { type: 'number', description: 'Lo más que puede costar, en créditos; sin él, 20. Súbelo solo si el usuario lo pidió.' }
      },
      required: ['prompt', 'salida']
    }
  },
  {
    name: 'estado_flow',
    description: 'Espera hasta 40 s a lo que pediste con generar_imagen o generar_video y dice si ya está (y dónde) o por qué falló.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'El id que dio la herramienta' } }, required: ['id'] }
  }
]

async function pedir(ruta, datos) {
  const r = await fetch(`${URL_SLOTH}${ruta}`, datos ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datos) } : {})
  const json = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(json.error ?? `Sloth respondió ${r.status}`)
  return json
}

function contar(t) {
  if (t.estado === 'lista') return `Lista: ${t.archivo} (${t.modelo}, ${t.creditos} créditos gastados).`
  if (t.estado === 'error') throw new Error(`No salió: ${t.error}`)
  return `Sigue ${t.estado === 'en-fila' ? 'esperando su turno' : 'generándose'} (${t.modelo}). Llama a estado_flow con id "${t.id}" para esperarlo; mientras, sigue con lo que no lo necesita.`
}

async function generar(tipo, datos) {
  const t = await pedir('/api/flow/generar', { ...datos, tipo })
  return contar(t.estado === 'lista' || t.estado === 'error' ? t : await pedir(`/api/flow/trabajos/${t.id}?esperar=${ESPERA}`))
}

const LLAMADAS = {
  generar_imagen: (datos) => generar('imagen', datos),
  generar_video: (datos) => generar('video', datos),
  async estado_flow({ id }) {
    return contar(await pedir(`/api/flow/trabajos/${encodeURIComponent(id)}?esperar=${ESPERA}`))
  }
}

const responder = (id, cosa) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...cosa })}\n`)

createInterface({ input: process.stdin }).on('line', async (renglon) => {
  let m
  try {
    m = JSON.parse(renglon)
  } catch {
    return
  }
  if (m.id === undefined) return // las notificaciones no se contestan
  if (m.method === 'initialize')
    return responder(m.id, { result: { protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'flow', version: '1.0.0' } } })
  if (m.method === 'ping') return responder(m.id, { result: {} })
  if (m.method === 'tools/list') return responder(m.id, { result: { tools: HERRAMIENTAS } })
  if (m.method === 'tools/call') {
    const llamada = LLAMADAS[m.params?.name]
    if (!llamada) return responder(m.id, { error: { code: -32602, message: `No hay herramienta ${m.params?.name}` } })
    try {
      responder(m.id, { result: { content: [{ type: 'text', text: await llamada(m.params.arguments ?? {}) }] } })
    } catch (e) {
      responder(m.id, { result: { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true } })
    }
    return
  }
  responder(m.id, { error: { code: -32601, message: `No sé hacer ${m.method}` } })
})
