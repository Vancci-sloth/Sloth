/**
 * El agente del modo «Solo en el celular»: Claude por la API de Anthropic, con la llave de quien usa Sloth, corriendo
 * desde el teléfono. Sigue la skill del estilo en lo que no necesita programas (`instrucciones`, `puro.ts`), busca en la
 * web con las herramientas del servidor de Anthropic y escribe en la carpeta del hilo (`archivos.ts`).
 *
 * Cada turno es un bucle de mensajes con streaming: lo que llega se traduce a los mismos `AgentEvent` que un hilo de la
 * computadora y se guarda en el hilo (`hilos.ts`); la conversación se añade tal cual llegó, sin reescribir nada. «Parar»
 * corta el pedido en curso y cierra con su resultado lo que el agente dejó pidiendo.
 */
import Anthropic from '@anthropic-ai/sdk'
import { File } from 'expo-file-system'
import type { AgentEvent, Tokens } from '../../../shared/types'
import { escribir, leer, listar } from './archivos'
import { agregar, agregarMensajes, cambiarHilo, guardarYa, hiloLocal, mensajesDe } from './hilos'
import { llaveClaude } from './llave'
import { costoDe, instrucciones, modeloDe, resumenWeb, type EstiloLocal } from './puro'
import estilosJson from './estilos.json'
import { recordado } from '../recordar'

export const ESTILOS = estilosJson as EstiloLocal[]
export const estiloLocal = (id: string) => ESTILOS.find((e) => e.id === id)

/** Lo que cuenta el usuario de sí en el celular (Más → Sobre ti), que va en las instrucciones. */
export const sobreTiLocal = () => recordado<string>('local.sobreTi', '')

const IMAGEN: Record<string, 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }

/** Las herramientas que corren en el celular. Las rutas son de la carpeta del hilo. */
const HERRAMIENTAS_CELULAR: Anthropic.Beta.BetaTool[] = [
  {
    name: 'escribir_archivo',
    description: 'Escribe (o reemplaza) un archivo de texto en la carpeta de este hilo: el guion, las fuentes, momentos.json. La ruta es relativa a la carpeta.',
    input_schema: { type: 'object', properties: { ruta: { type: 'string' }, contenido: { type: 'string' } }, required: ['ruta', 'contenido'] },
    eager_input_streaming: true
  },
  {
    name: 'leer_archivo',
    description: 'Lee un archivo de texto de la carpeta de este hilo.',
    input_schema: { type: 'object', properties: { ruta: { type: 'string' } }, required: ['ruta'] },
    eager_input_streaming: true
  },
  {
    name: 'listar_archivos',
    description: 'Lista los archivos de la carpeta de este hilo, con su tamaño.',
    input_schema: { type: 'object', properties: {} },
    eager_input_streaming: true
  }
]

function herramientas(modelo: string): Anthropic.Beta.BetaToolUnion[] {
  // Haiku aún no tiene la búsqueda con filtrado: va con la de siempre.
  const nueva = modeloDe(modelo).busquedaNueva
  const web: Anthropic.Beta.BetaToolUnion[] = nueva
    ? [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 8 },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8 }
      ]
    : [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 8 },
        { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 8 }
      ]
  return [...web, ...HERRAMIENTAS_CELULAR]
}

/** Cómo se ve cada herramienta en el hilo: con el nombre y la entrada que entiende `toolSummary` de la computadora. */
function comoSeVe(nombre: string, input: any): { name: string; input: unknown } {
  switch (nombre) {
    case 'escribir_archivo':
      return { name: 'Write', input: { file_path: input?.ruta ?? '' } }
    case 'leer_archivo':
      return { name: 'Read', input: { file_path: input?.ruta ?? '' } }
    case 'listar_archivos':
      return { name: 'Glob', input: { pattern: 'la carpeta del hilo' } }
    case 'web_search':
      return { name: 'WebSearch', input: { query: input?.query ?? '' } }
    case 'web_fetch':
      return { name: 'WebFetch', input: { url: input?.url ?? '' } }
    // Las búsquedas nuevas filtran lo que traen con un poco de código del lado de Anthropic: se ve qué busca o lee, no el código.
    case 'code_execution':
    case 'bash_code_execution':
    case 'text_editor_code_execution': {
      const codigo = String(input?.code ?? input?.command ?? '')
      const query = /"query"s*:s*"([^"]+)"/.exec(codigo)?.[1]
      const url = /"url"s*:s*"([^"]+)"/.exec(codigo)?.[1]
      return { name: 'Revisa lo que encontró', input: { detalle: query ? `la búsqueda «${query}»` : url ?? '' } }
    }
    default:
      return { name: nombre, input }
  }
}

/** Corre una herramienta del celular; un error vuelve al agente como resultado con error, no tumba el turno. */
async function correr(id: string, nombre: string, input: any): Promise<{ texto: string; error: boolean }> {
  try {
    if (nombre === 'escribir_archivo') {
      if (typeof input?.ruta !== 'string' || typeof input?.contenido !== 'string') throw new Error('Faltan «ruta» y «contenido» como texto.')
      await escribir(id, input.ruta, input.contenido)
      return { texto: `Escrito: ${input.ruta} (${input.contenido.length} caracteres)`, error: false }
    }
    if (nombre === 'leer_archivo') {
      if (typeof input?.ruta !== 'string') throw new Error('Falta «ruta» como texto.')
      return { texto: await leer(id, input.ruta), error: false }
    }
    if (nombre === 'listar_archivos') {
      const l = listar(id)
      return { texto: l.length ? l.map((a) => `${a.ruta} (${a.tamano} bytes)`).join('\n') : 'La carpeta está vacía.', error: false }
    }
    return { texto: `No hay una herramienta «${nombre}» en el celular.`, error: true }
  } catch (e) {
    return { texto: e instanceof Error ? e.message : String(e), error: true }
  }
}

/** Lo que adjuntas a un mensaje, ya copiado en la carpeta del hilo. */
export interface AdjuntoLocal {
  ruta: string
  uri: string
  tipo: 'imagen' | 'video' | 'audio' | 'archivo'
}

const corriendo = new Map<string, AbortController>()
export const parar = (id: string) => corriendo.get(id)?.abort()

/**
 * Los eventos que llegan juntos (cada trozo de texto es uno) se mandan al hilo cada 80 ms: con cada token se volvería
 * a dibujar todo el chat.
 */
function tanda(id: string) {
  let cola: AgentEvent[] = []
  let t: ReturnType<typeof setTimeout> | undefined
  const soltar = () => {
    t = undefined
    if (cola.length) void agregar(id, ...cola)
    cola = []
  }
  return {
    poner(e: AgentEvent) {
      cola.push(e)
      t ??= setTimeout(soltar, 80)
    },
    soltar() {
      clearTimeout(t)
      soltar()
    }
  }
}

/** Un turno del hilo: tu mensaje y todo lo que el agente hace hasta contestarte. */
export async function turno(id: string, texto: string, adjuntos: AdjuntoLocal[]) {
  const hilo = hiloLocal(id)
  const llave = llaveClaude()
  if (!hilo) throw new Error('Ese hilo ya no está.')
  if (!llave) throw new Error('Falta tu llave de la API de Claude: ponla en Más → Claude.')
  if (corriendo.has(id)) throw new Error('El agente sigue trabajando: espera o páralo.')

  // Lo que va al agente: las fotos como imágenes, y lo demás por su ruta en la carpeta.
  const contenido: Anthropic.Beta.BetaContentBlockParam[] = []
  for (const a of adjuntos) {
    const media = IMAGEN[a.ruta.split('.').pop()?.toLowerCase() ?? '']
    if (a.tipo === 'imagen' && media) contenido.push({ type: 'image', source: { type: 'base64', media_type: media, data: await new File(a.uri).base64() } })
  }
  const notas = adjuntos.map((a) => `${a.tipo === 'audio' ? 'Mi voz grabada' : a.tipo === 'imagen' ? 'Foto adjunta' : a.tipo === 'video' ? 'Video adjunto' : 'Archivo adjunto'}: ${a.ruta}`)
  contenido.push({ type: 'text', text: [texto.trim(), notas.join('\n')].filter(Boolean).join('\n\n') || 'Sigue.' })

  const ahora = Date.now()
  await agregarMensajes(id, { role: 'user', content: contenido })
  await agregar(id, { t: 'user', text: texto.trim(), at: ahora, images: adjuntos.filter((a) => a.tipo === 'imagen').map((a) => a.uri) }, { t: 'turn_start', at: ahora })
  cambiarHilo(id, { running: true })

  const ctrl = new AbortController()
  corriendo.set(id, ctrl)
  const eventos = tanda(id)
  const cliente = new Anthropic({
    apiKey: llave,
    // La llave es de quien usa el celular y solo viaja de su teléfono a la API: no hay un servidor de por medio que la guarde.
    dangerouslyAllowBrowser: true,
    // Solo para probar la app contra un servidor de mentira (`EXPO_PUBLIC_ANTHROPIC_BASE_URL`); sin ella, la API real.
    baseURL: process.env.EXPO_PUBLIC_ANTHROPIC_BASE_URL || undefined
  })
  const modelo = hilo.model
  const fallback = modelo !== 'claude-haiku-5-5'
  const sistema = instrucciones(estiloLocal(hilo.cardId), sobreTiLocal())
  let costo = 0
  const tokens: Tokens = { input: 0, output: 0, cacheRead: 0 }
  /** Lo que el agente pidió y aún no tiene resultado: si lo paras, se cierra igual, o la conversación quedaría rota. */
  let sinResultado: Anthropic.Beta.BetaToolUseBlock[] = []

  try {
    for (let vuelta = 0; vuelta < 40; vuelta++) {
      const stream = cliente.beta.messages.stream(
        {
          model: modelo,
          max_tokens: 64000,
          system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
          tools: herramientas(modelo),
          messages: await mensajesDe(id),
          thinking: { type: 'adaptive', display: 'summarized' },
          output_config: { effort: modelo === 'claude-opus-5-5' ? 'high' : 'medium' },
          // Si el modelo declina algo por seguridad, la API lo vuelve a intentar con otro sin que se note aquí.
          ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {})
        },
        { signal: ctrl.signal }
      )

      // Lo que va llegando, bloque por bloque: el texto y el razonamiento en trozos; las herramientas, al cerrarse.
      let msgId = ''
      const bloques = new Map<number, { tipo: string; id: string; nombre: string; json: string }>()
      for await (const ev of stream) {
        if (ev.type === 'message_start') msgId = ev.message.id
        else if (ev.type === 'content_block_start') {
          const b = ev.content_block as any
          bloques.set(ev.index, { tipo: b.type, id: b.id ?? `${msgId}:${ev.index}`, nombre: b.name ?? '', json: '' })
          if (b.type === 'web_search_tool_result' || b.type === 'web_fetch_tool_result') {
            const r = resumenWeb(b.content)
            eventos.poner({ t: 'tool_update', id: b.tool_use_id, output: r.texto, done: true, error: r.error })
          } else if (typeof b.type === 'string' && b.type.endsWith('_tool_result') && b.tool_use_id) {
            eventos.poner({ t: 'tool_update', id: b.tool_use_id, output: '', done: true, error: String(b.content?.type ?? '').endsWith('_error') })
          }
        } else if (ev.type === 'content_block_delta') {
          const b = bloques.get(ev.index)
          if (!b) continue
          const d = ev.delta as any
          if (d.type === 'text_delta') eventos.poner({ t: 'text', id: b.id, delta: d.text })
          else if (d.type === 'thinking_delta' && d.thinking) eventos.poner({ t: 'thinking', id: b.id, delta: d.thinking, at: Date.now() })
          else if (d.type === 'input_json_delta') b.json += d.partial_json
        } else if (ev.type === 'content_block_stop') {
          const b = bloques.get(ev.index)
          if (!b || (b.tipo !== 'tool_use' && b.tipo !== 'server_tool_use')) continue
          let input: unknown = {}
          try {
            input = b.json ? JSON.parse(b.json) : {}
          } catch { /* Lo arregla el mensaje entero, abajo. */ }
          eventos.poner({ t: 'tool', id: b.id, ...comoSeVe(b.nombre, input) })
        }
      }
      const msg = await stream.finalMessage()
      eventos.soltar()
      await agregarMensajes(id, { role: 'assistant', content: msg.content as Anthropic.Beta.BetaContentBlockParam[] })

      const u = msg.usage
      costo += costoDe(modelo, u)
      tokens.input += u.input_tokens + (u.cache_creation_input_tokens ?? 0)
      tokens.output += u.output_tokens
      tokens.cacheRead += u.cache_read_input_tokens ?? 0
      await agregar(id, { t: 'context', used: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), max: 1_000_000 })

      if (msg.stop_reason === 'pause_turn') continue
      if (msg.stop_reason === 'refusal') throw new Error('Claude no quiso seguir con este pedido. Cámbialo un poco y vuelve a intentarlo.')
      const usos = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
      if (!usos.length) break
      if (msg.stop_reason === 'max_tokens') throw new Error('La respuesta se cortó por larga. Pídele que siga.')

      sinResultado = usos
      const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = []
      for (const uso of usos) {
        const r = await correr(id, uso.name, uso.input)
        resultados.push({ type: 'tool_result', tool_use_id: uso.id, content: r.texto, is_error: r.error || undefined })
        await agregar(id, { t: 'tool_update', id: uso.id, output: r.texto.slice(0, 4000), done: true, error: r.error })
      }
      await agregarMensajes(id, { role: 'user', content: resultados })
      sinResultado = []
    }
    await agregar(id, { t: 'turn_end', at: Date.now(), ok: true, costUsd: costo, tokens })
    cambiarHilo(id, { running: false, acaboBien: true })
  } catch (e) {
    eventos.soltar()
    const lo_paraste = ctrl.signal.aborted
    if (sinResultado.length)
      await agregarMensajes(id, { role: 'user', content: sinResultado.map((u) => ({ type: 'tool_result' as const, tool_use_id: u.id, content: 'El usuario lo paró antes de que acabara.', is_error: true })) })
    const error = lo_paraste ? 'Lo paraste.' : errorLlano(e)
    await agregar(id, { t: 'turn_end', at: Date.now(), ok: lo_paraste, error: lo_paraste ? undefined : error, costUsd: costo, tokens })
    cambiarHilo(id, { running: false, acaboBien: lo_paraste })
  } finally {
    corriendo.delete(id)
    await guardarYa(id)
  }
}

/** Los errores de la API, dichos para quien usa Sloth. */
function errorLlano(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Tu llave de Claude no funciona: revísala en Más → Claude.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'Tu llave de Claude no tiene permiso para este modelo.'
  if (e instanceof Anthropic.RateLimitError) return 'Llegaste al límite de tu cuenta de Claude por ahora. Espera un poco o sube tu límite en console.anthropic.com.'
  if (e instanceof Anthropic.BadRequestError && /credit|balance/i.test(e.message)) return 'Tu cuenta de Claude se quedó sin saldo: recárgala en console.anthropic.com.'
  if (e instanceof Anthropic.APIConnectionError) return 'Sin internet: revisa tu conexión y reintenta.'
  if (e instanceof Anthropic.APIError) return `Claude respondió ${e.status ?? ''}: ${e.message}`
  return e instanceof Error ? e.message : String(e)
}
