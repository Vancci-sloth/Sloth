/**
 * El MCP `meta`: las herramientas con que un agente pide a Sloth una imagen o un video de Meta Muse, que los genera con las
 * cuentas de Meta del usuario (`index.ts`). Solo habla con la API del servidor (`SLOTH_URL`): la sesión de Meta no pasa por
 * aquí. Es JavaScript sin paquetes, como el de Flow, para que el Node de Sloth lo corra igual en el repo y en la app
 * compilada (`scripts/compilar.mjs` lo copia tal cual). Habla MCP por stdio, un JSON por renglón.
 *
 * Cada herramienta espera como mucho 40 s: Codex corta una herramienta a los 60. Si no acabó, dice el id para seguir
 * esperando con `estado_meta`.
 */
import { createInterface } from 'node:readline'

const URL_SLOTH = process.env.SLOTH_URL ?? 'http://127.0.0.1:4848'
const ESPERA = 40
const FORMATO = { type: 'string', enum: ['9:16', '16:9', '1:1', '4:3', '3:4'], description: 'La proporción; sin ella, 9:16' }
const REFERENCIAS = { type: 'array', items: { type: 'string' }, description: 'Las rutas absolutas de imágenes (.png, .jpg o .webp) con los personajes, objetos o lugares que salen; hasta 9 contando el primer cuadro. Solo imágenes del usuario o hechas para él' }
const USO = 'Gasta el uso SEMANAL de Muse del usuario (en el plan gratis, cerca del 1 % una imagen y del 9 % un video); si una cuenta ya gastó su semana, el pedido pasa solo a otra sin gastar.'

const HERRAMIENTAS = [
  {
    name: 'generar_imagen',
    description: `Genera UNA imagen con Meta Muse (muse.ai), con las cuentas de Meta del usuario, y la deja en \`salida\` (1600 px de lado en 1:1; .png, .jpg o .webp, según la extensión). Con \`referencias\`, edita esas fotos o junta varias en una: el mismo personaje, la misma escena. ${USO} Tarda unos 20 s; si no acaba en 40 s, devuelve un id para esperarla con estado_meta. Si nada cambió desde el último archivo de esa ruta, sale al momento.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Lo que se genera, dicho con detalle. Di qué debe quedar igual de las referencias' },
        formato: FORMATO,
        referencias: REFERENCIAS,
        salida: { type: 'string', description: 'La ruta absoluta del .png, .jpg o .webp que deja' }
      },
      required: ['prompt', 'salida']
    }
  },
  {
    name: 'generar_video',
    description: `Genera UN video de 10 s, 720p, con sonido, con Meta Muse (muse.ai) y las cuentas de Meta del usuario, y deja el MP4 en \`salida\`. Lo que se dice va en el prompt entre comillas, con quién lo dice: Muse lo dice con su voz y su boca. Con \`primerCuadro\`, anima esa imagen (así salen iguales los personajes y el lugar); con \`referencias\`, sigue a esos personajes. ${USO} Tarda cerca de un minuto; si no acaba en 40 s, devuelve un id para esperarlo con estado_meta. Si nada cambió desde el último archivo de esa ruta, sale al momento y sin gastar.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Lo que pasa en el video, con lo que se dice entre comillas (unas 25 palabras caben en 10 s)' },
        formato: FORMATO,
        primerCuadro: { type: 'string', description: 'La ruta absoluta de la imagen donde empieza el video; con la misma proporción que `formato`' },
        referencias: REFERENCIAS,
        salida: { type: 'string', description: 'La ruta absoluta del .mp4 que deja' }
      },
      required: ['prompt', 'salida']
    }
  },
  {
    name: 'estado_meta',
    description:
      'Con `id`, espera hasta 40 s a lo que pediste con generar_imagen o generar_video y dice si ya está (y dónde) o por qué falló. Sin `id`, dice cuánto lleva usado esta semana cada cuenta de Meta del usuario: úsalo antes de pedir varios videos, para saber si alcanza.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'El id que dio la herramienta; sin él, el uso de la semana' } } }
  }
]

async function pedir(ruta, datos) {
  const r = await fetch(`${URL_SLOTH}${ruta}`, datos ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datos) } : {})
  const json = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(json.error ?? `Sloth respondió ${r.status}`)
  return json
}

const hora = (ms) => new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
const usado = (u) => `van ${u.porcentaje} % de la semana${u.detalle ? ` (${u.detalle})` : ''}`

function contar(t) {
  if (t.estado === 'lista') {
    // Sin uso leído y sin gasto: ya estaba hecho y salió de la huella.
    const como = !t.uso ? (t.gasto === 0 ? 'ya estaba hecho, no gastó' : 'no se pudo leer el uso') : `${t.gasto === undefined ? '' : `gastó ${t.gasto} % de la semana, `}${usado(t.uso)}`
    return `Lista: ${t.archivo} (Meta Muse${t.cuenta ? `, con ${t.cuenta}` : ''}; ${como}; pedido ${t.id}).${t.texto ? ` Muse dijo: «${t.texto}»` : ''}`
  }
  if (t.estado === 'error') throw new Error(`No salió: ${t.error}`)
  return `Sigue ${t.estado === 'en-fila' ? 'esperando su turno' : 'generándose'} en Meta Muse. Llama a estado_meta con id "${t.id}" para esperarlo; mientras, sigue con lo que no lo necesita.`
}

async function generar(tipo, datos) {
  const t = await pedir('/api/meta/generar', { ...datos, tipo })
  return contar(t.estado === 'lista' || t.estado === 'error' ? t : await pedir(`/api/meta/trabajos/${t.id}?esperar=${ESPERA}`))
}

const LLAMADAS = {
  generar_imagen: (datos) => generar('imagen', datos),
  generar_video: (datos) => generar('video', datos),
  async estado_meta({ id }) {
    if (id) return contar(await pedir(`/api/meta/trabajos/${encodeURIComponent(id)}?esperar=${ESPERA}`))
    const e = await pedir('/api/meta')
    if (!e.cuentas.length) return 'No hay cuenta de Meta conectada: el usuario agrega una en Opciones → Meta Muse.'
    const ahora = Date.now()
    const renglones = e.cuentas.map((c) => {
      const uso = c.uso ? `${usado(c.uso)} (leído el ${new Date(c.uso.leido).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})` : 'aún no se sabe cuánto lleva'
      const descansa = c.descansa && c.descansa.hasta > ahora ? `; no genera hasta las ${hora(c.descansa.hasta)} (${c.descansa.motivo === 'uso' ? 'gastó su semana' : 'sin sesión'})` : ''
      return `- ${c.correo}: ${uso}${descansa}.`
    })
    return `${renglones.join('\n')}\nSloth reparte los pedidos entre ellas, primero a la que lleva menos. En el plan gratis, una imagen gasta cerca del 1 % de la semana de una cuenta y un video, cerca del 9 %.${e.enFila ? ` ${e.enFila === 1 ? 'Hay 1 pedido' : `Hay ${e.enFila} pedidos`} en curso.` : ''}`
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
    return responder(m.id, { result: { protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'meta', version: '1.0.0' } } })
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
