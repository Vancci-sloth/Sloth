/**
 * El MCP `avatar`: las herramientas con que un agente (Claude, Codex u OpenCode) le pide a Sloth el video de un personaje
 * hablando (`index.ts`). Solo habla con la API del servidor (`SLOTH_URL`): ni la llave de HeyGen ni ComfyUI pasan por
 * aquí. Es JavaScript sin paquetes, para que el Node de Sloth lo corra igual en el repo y en la app compilada
 * (`scripts/compilar.mjs` lo copia tal cual). Habla MCP por stdio, un JSON por renglón.
 *
 * Cada herramienta espera como mucho 40 s: Codex corta una herramienta a los 60. Si no acabó, dice el id para seguir
 * esperando con `estado_avatar`. Un video de ComfyUI o de HeyGen tarda minutos: sigue con lo que no lo necesita.
 */
import { createInterface } from 'node:readline'

const URL_SLOTH = process.env.SLOTH_URL ?? 'http://127.0.0.1:4848'
const ESPERA = 40

const HERRAMIENTAS = [
  {
    name: 'motores',
    description:
      'Los motores de avatar de Sloth y cuáles están listos ahora: sprites (el de siempre, boca abierta y cerrada), comfyui-local (los labios con LatentSync 1.5 o MuseTalk en el ComfyUI y la GPU del usuario) y heygen (API de pago). Dice también qué le falta a cada flujo de ComfyUI. Úsala antes de generar_avatar.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'generar_avatar',
    description:
      'Genera el video del personaje diciendo la voz con el motor pedido (el de la línea `Avatar: <motor>` del mensaje) y deja un .mp4 en `salida`. comfyui-local: pasa `audio` y `video` del personaje (o `imagen`, que se hace video quieto); tarda varios minutos por minuto de video. heygen: pasa `avatar_heygen` y `audio` (o `guion` y `voz_heygen`); GASTA CRÉDITOS del usuario: pídelo una sola vez y solo si el usuario eligió heygen. sprites: no genera nada aquí, sigue con tu skill. Si no acabó en 40 s devuelve un id para esperarlo con estado_avatar.',
    inputSchema: {
      type: 'object',
      properties: {
        motor: { type: 'string', enum: ['sprites', 'comfyui-local', 'heygen'], description: 'El motor de la línea Avatar:' },
        audio: { type: 'string', description: 'Ruta absoluta del audio (.wav o .mp3) que dice el personaje' },
        video: { type: 'string', description: 'Ruta absoluta de un video del personaje, al que se le cambian los labios' },
        imagen: { type: 'string', description: 'O la ruta absoluta de una imagen del personaje (.png o .jpg)' },
        salida: { type: 'string', description: 'Ruta absoluta del .mp4 que deja, como <carpeta del video>/fuentes/avatar/avatar.mp4' },
        flujo: { type: 'string', enum: ['latentsync', 'musetalk'], description: 'Solo comfyui-local: el flujo. Sin él, el primero listo (LatentSync antes que MuseTalk).' },
        avatar_heygen: { type: 'string', description: 'Solo heygen: el id del avatar, de avatares_heygen' },
        guion: { type: 'string', description: 'Solo heygen sin audio propio: lo que dice, con la voz voz_heygen' },
        voz_heygen: { type: 'string', description: 'Solo heygen con guion: el id de la voz de HeyGen' },
        formato: { type: 'string', enum: ['vertical', 'horizontal'], description: 'Solo heygen: 9:16 o 16:9' }
      },
      required: ['motor', 'salida']
    }
  },
  {
    name: 'estado_avatar',
    description: 'Espera hasta 40 s a un video que pediste con generar_avatar y dice si ya está (y dónde) o por qué falló.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'El id que dio generar_avatar' } }, required: ['id'] }
  },
  {
    name: 'avatares_heygen',
    description: 'Los avatares de la cuenta de HeyGen del usuario, con su id, para generar_avatar con motor heygen. Primero los suyos. No gasta créditos.',
    inputSchema: { type: 'object', properties: { buscar: { type: 'string', description: 'Solo los que tengan esto en su nombre' } } }
  }
]

async function pedir(ruta, datos) {
  const r = await fetch(`${URL_SLOTH}${ruta}`, datos ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datos) } : {})
  const json = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(json.error ?? `Sloth respondió ${r.status}`)
  return json
}

function contar(t) {
  if (t.estado === 'lista') return t.archivo ? `Listo: ${t.archivo} (motor ${t.motor}).` : (t.paso ?? 'Listo.')
  if (t.estado === 'error') throw new Error(`El avatar no salió (${t.motor}): ${t.error} Sigue con sprites.`)
  return `Sigue ${t.estado === 'en-fila' ? 'esperando su turno' : 'generándose'} (${t.motor}${t.paso ? `: ${t.paso}` : ''}). Llama a estado_avatar con id "${t.id}" para esperarlo; mientras, sigue con lo que no lo necesita.`
}

const LLAMADAS = {
  async motores() {
    const e = await pedir('/api/avatar')
    return [
      ...e.motores.map((m) => `${m.id} [${m.etiqueta}] ${m.listo ? 'LISTO' : 'no listo'}: ${m.detalle}`),
      `ComfyUI: ${e.comfy.corriendo ? `responde en ${e.comfy.url}${e.comfy.gpu ? ` (${e.comfy.gpu})` : ''}` : `no responde en ${e.comfy.url}`}.`,
      ...e.flujos.map((x) => `flujo ${x.id} (${x.nombre}, ~${x.vramGB} GB de VRAM): ${x.listo ? 'listo' : `falta ${x.falta.join(', ')}`}`)
    ].join('\n')
  },
  async generar_avatar(a) {
    const t = await pedir('/api/avatar/generar', { motor: a.motor, audio: a.audio, imagen: a.imagen, video: a.video, salida: a.salida, flujo: a.flujo, avatarHeygen: a.avatar_heygen, guion: a.guion, vozHeygen: a.voz_heygen, formato: a.formato })
    return contar(t.estado === 'generando' || t.estado === 'en-fila' ? await pedir(`/api/avatar/trabajos/${t.id}?esperar=${ESPERA}`) : t)
  },
  async estado_avatar({ id }) {
    return contar(await pedir(`/api/avatar/trabajos/${encodeURIComponent(id)}?esperar=${ESPERA}`))
  },
  async avatares_heygen({ buscar } = {}) {
    const { avatares } = await pedir('/api/avatar/heygen/avatares')
    const b = buscar?.toLowerCase()
    const lista = avatares.filter((a) => !b || `${a.nombre} ${a.grupo ?? ''}`.toLowerCase().includes(b)).slice(0, 80)
    return [`${lista.length} avatares${b ? ` con «${buscar}»` : ''}:`, ...lista.map((a) => `${a.id} · ${a.nombre}${a.grupo ? ` (${a.grupo})` : ''}${a.propio ? ' · suyo' : ''}`)].join('\n')
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
    return responder(m.id, { result: { protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'avatar', version: '1.0.0' } } })
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
