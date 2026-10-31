/**
 * El MCP `voz`: las herramientas con que un agente (Claude, Codex u OpenCode) pide la voz de un video a Sloth, que la
 * genera en Google AI Studio con la cuenta del usuario (`index.ts`). Solo habla con la API del servidor (`SLOTH_URL`):
 * la sesión de Google no pasa por aquí. Es JavaScript sin paquetes, para que el Node de Sloth lo corra igual en el repo
 * y en la app compilada (`scripts/compilar.mjs` lo copia tal cual). Habla MCP por stdio, un JSON por renglón.
 *
 * Cada herramienta espera como mucho 40 s a que acabe la voz: Codex corta una herramienta a los 60. Si no acabó, dice
 * el id para seguir esperando con `estado_voz`.
 */
import { createInterface } from 'node:readline'

const URL_SLOTH = process.env.SLOTH_URL ?? 'http://127.0.0.1:4848'
const ESPERA = 40

const HERRAMIENTAS = [
  {
    name: 'voces',
    description:
      'Las voces de Google AI Studio (Gemini 3.8 Flash TTS) con que Sloth puede generar la narración, cada una con cómo suena y su grupo (Podcast, Storyteller…). Son las que enseña la página; AI Studio tiene más de 2.000 y cualquier nombre de su buscador sirve. Dice también si hay una cuenta de Google conectada.',
    inputSchema: {
      type: 'object',
      properties: { buscar: { type: 'string', description: 'Solo las que tengan esto en su nombre, cómo suenan o su grupo («deep», «Podcast»)' } }
    }
  },
  {
    name: 'generar_voz',
    description:
      'Genera la narración en Google AI Studio con la voz pedida, en la cuenta de Google del usuario, y deja el WAV (24 kHz, mono) en `salida`. Pasa el texto tal como se narra, o `archivo`: un guion en Markdown se narra sin títulos ni encabezados. Las etiquetas de AI Studio, como <laugh> o <short pause>, van dentro del texto. Una frase tarda unos 5 s y 6 minutos de guion unos 100 s; si no acaba en 40 s, devuelve un id para esperarla con estado_voz. Si el texto y la voz no cambiaron desde el último WAV de esa ruta, sale al momento.',
    inputSchema: {
      type: 'object',
      properties: {
        voz: { type: 'string', description: 'El nombre de la voz en AI Studio, como Fola o Kore' },
        texto: { type: 'string', description: 'Lo que se narra' },
        archivo: { type: 'string', description: 'O la ruta absoluta de un .md o .txt con lo que se narra' },
        salida: { type: 'string', description: 'La ruta absoluta del .wav que deja, como <carpeta del video>/fuentes/voz/ai-studio.wav' }
      },
      required: ['voz', 'salida']
    }
  },
  {
    name: 'estado_voz',
    description: 'Espera hasta 40 s a una voz que pediste con generar_voz y dice si ya está (y dónde) o por qué falló.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'El id que dio generar_voz' } }, required: ['id'] }
  }
]

async function pedir(ruta, datos) {
  const r = await fetch(`${URL_SLOTH}${ruta}`, datos ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datos) } : {})
  const json = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(json.error ?? `Sloth respondió ${r.status}`)
  return json
}

function contar(t) {
  if (t.estado === 'lista') return `Lista: ${t.archivo} (${t.segundos} s de voz, ${t.voz}, ${t.palabras} palabras).`
  if (t.estado === 'error') throw new Error(`La voz no salió: ${t.error}`)
  return `Sigue ${t.estado === 'en-fila' ? 'esperando su turno' : 'generándose'} (${t.palabras} palabras, voz ${t.voz}). Llama a estado_voz con id "${t.id}" para esperarla; mientras, sigue con lo que no necesita la voz.`
}

const LLAMADAS = {
  async voces({ buscar } = {}) {
    const e = await pedir('/api/voz')
    if (!e.cuenta) return 'No hay cuenta de Google conectada para AI Studio: que el usuario la conecte en Opciones → Voz. Mientras, pídele la voz.'
    const b = buscar?.toLowerCase()
    const voces = e.voces.filter((v) => !b || `${v.nombre} ${v.descripcion} ${v.grupo}`.toLowerCase().includes(b))
    const grupos = Map.groupBy(voces, (v) => v.grupo)
    return [`Cuenta: ${e.cuenta}. ${voces.length} voces${b ? ` con «${buscar}»` : ''}:`, ...[...grupos].map(([g, vs]) => `${g}: ${vs.map((v) => `${v.nombre} (${v.descripcion})`).join('; ')}`)].join('\n')
  },
  async generar_voz({ voz, texto, archivo, salida }) {
    const t = await pedir('/api/voz/generar', { voz, texto, archivo, salida })
    return contar(t.estado === 'lista' || t.estado === 'error' ? t : await pedir(`/api/voz/trabajos/${t.id}?esperar=${ESPERA}`))
  },
  async estado_voz({ id }) {
    return contar(await pedir(`/api/voz/trabajos/${encodeURIComponent(id)}?esperar=${ESPERA}`))
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
    return responder(m.id, { result: { protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'voz', version: '1.0.0' } } })
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
