import type { CuentaClaude, Model } from '../shared/types.ts'
import { direccionGuardada, entornoClaudeCon, llaveGuardada } from './acceso.ts'

/**
 * Ollama (ollama.com) con el mismo Claude Code de Sloth, como FreeLLMAPI (`server/freellmapi.ts`). Ollama es el programa
 * con que cada quien corre modelos en su computadora y, con su cuenta de Ollama, los de su nube (`…:cloud`). Habla la API
 * de Anthropic en su misma dirección y documenta cómo usar Claude Code con ella. Sloth no lo instala ni baja modelos:
 * guarda la dirección donde escucha (`server/acceso.ts` lo busca en esta computadora). No tiene llave (se guarda
 * `LLAVE_OLLAMA`, que no mira) y aquí no cuesta. Los ids llevan prefijo (`ollama:qwen3.5:latest`).
 *
 * Lo que Sloth no puede hacer por él es darle a un modelo de esta computadora la ventana que pide un hilo: la pone quien
 * lo usa, en Ollama, y `antesDeOllama` lo comprueba antes de cada mensaje (ADR 0029).
 */

export const SIN_OLLAMA = 'Conecta Ollama en Opciones.'

/** `ollama:qwen3.5:latest` → `qwen3.5:latest`. */
export const modeloOllama = (model: string) => model.replace(/^ollama:/, '')

/** Lo que se usa de cada modelo de `GET /api/tags`. Con `remote_host` es de la nube de Ollama: no corre en esta computadora. */
export interface ModeloOllama {
  name: string
  remote_host?: string
  details?: { context_length?: number }
  capabilities?: string[]
}

/**
 * La ventana que pide la guía de Ollama para Claude Code: con menos no cabe ni lo que Claude Code manda antes del primer
 * mensaje (unos 20 000 tokens) más el trabajo.
 */
export const VENTANA_MINIMA = 64_000
const cifra = (n: number) => n.toLocaleString('es-MX')

/** Los que pueden llevar un hilo: conversan, usan herramientas y su ventana llega a la mínima. Fuera los de embeddings. */
const sirve = (m: ModeloOllama) => !!m.capabilities?.includes('completion') && m.capabilities.includes('tools') && (m.details?.context_length ?? 0) >= VENTANA_MINIMA

/** El catálogo como modelos de Sloth, en el orden de Ollama (lo último que bajaste, primero). Sin esfuerzos: cada modelo piensa a su manera. */
export function modelosDe(catalogo: ModeloOllama[]): Model[] {
  return catalogo.filter(sirve).map((m) => ({ id: `ollama:${m.name}`, label: `Ollama · ${m.name}`, efforts: [] }))
}

/** Lo último leído del catálogo, por nombre: la ventana de cada modelo y si es de la nube. */
let leido = new Map<string, ModeloOllama>()
/** Para las pruebas. */
export const recordar = (catalogo: ModeloOllama[]) => void (leido = new Map(catalogo.map((m) => [m.name, m])))

/** Los modelos que tiene ese Ollama. `null` si no responde: está cerrado. */
async function catalogo(): Promise<ModeloOllama[] | null> {
  const direccion = direccionGuardada('ollama')
  if (!direccion) return null
  try {
    const res = await fetch(`${direccion}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const { models } = (await res.json()) as { models: ModeloOllama[] }
    recordar(models)
    return models
  } catch {
    return null
  }
}

/** Vacío sin conectar o con Ollama cerrado: tras abrirlo, sus modelos vuelven al entrar a Opciones o al abrir Sloth. */
export async function modelosOllama(): Promise<Model[]> {
  const data = await catalogo()
  return data ? modelosDe(data) : []
}

/**
 * Hasta dónde se llena el contexto antes de compactar. Uno de la nube va con toda su ventana; uno de esta computadora,
 * con la que su dueño le puso en Ollama, que no se sabe hasta que se carga: se compacta a la mínima, la que
 * `antesDeOllama` exige. Igual si el catálogo aún no se leyó.
 */
export function ventanaOllama(model: string) {
  const m = leido.get(modeloOllama(model))
  return (m?.remote_host && m.details?.context_length) || VENTANA_MINIMA
}

/**
 * Lo que necesita Claude Code para hablar con Ollama: su dirección y la llave que su guía manda poner. Todos los alias
 * van al modelo del hilo.
 */
export function entornoOllama(model: string, effort?: string): Record<string, string> {
  const llave = llaveGuardada('ollama')
  const direccion = direccionGuardada('ollama')
  if (!llave || !direccion) throw new Error(SIN_OLLAMA)
  return entornoClaudeCon({ direccion, llave, modelo: modeloOllama(model), ventana: ventanaOllama(model), effort })
}

/**
 * Antes de cada mensaje. Ollama abre cada modelo con el contexto que tenga puesto (4 096 con menos de 24 GB de VRAM) y
 * recorta sin avisar lo que no le cabe: el hilo contestaría sin haber leído sus instrucciones ni sus herramientas, y sin
 * error. Sloth no puede pedir otro contexto por la API de Anthropic, así que le pide que lo cargue (lo que haría igual
 * con el mensaje) y mira con cuánto quedó. De paso dice en claro lo que Claude Code diría tras minutos de reintentos:
 * que Ollama está cerrado, que el modelo no cabe en la memoria o que falta la cuenta para uno de su nube.
 */
export async function antesDeOllama(model: string, direccion = direccionGuardada('ollama')): Promise<void> {
  if (!direccion) throw new Error(SIN_OLLAMA)
  const nombre = modeloOllama(model)
  let res: Response
  try {
    // Sin `prompt` solo lo carga. Uno grande tarda minutos en subir del disco.
    res = await fetch(`${direccion}/api/generate`, { method: 'POST', body: JSON.stringify({ model: nombre }), signal: AbortSignal.timeout(10 * 60_000) })
  } catch {
    throw new Error('Ollama está cerrado: ábrelo y manda el mensaje otra vez.')
  }
  if (res.status === 401) throw new Error(`«${nombre}» es de la nube de Ollama y pide tu cuenta: inicia sesión en la app de Ollama (o con «ollama signin») y manda el mensaje otra vez.`)
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(`Ollama no pudo cargar «${nombre}»${error ? `: ${error}` : ` (respondió ${res.status})`}.`)
  }
  const cargados = await fetch(`${direccion}/api/ps`, { signal: AbortSignal.timeout(5000) })
    .then((r) => r.json() as Promise<{ models?: { name: string; context_length?: number }[] }>)
    .catch(() => ({ models: [] }))
  // Los de la nube no salen aquí: no se cargan en esta computadora.
  const contexto = cargados.models?.find((m) => m.name === nombre)?.context_length
  if (contexto && contexto < VENTANA_MINIMA)
    throw new Error(
      `Ollama abrió «${nombre}» con ${cifra(contexto)} tokens de contexto y un hilo de Sloth necesita ${cifra(VENTANA_MINIMA)} o más: con menos, Ollama recorta el mensaje sin avisar. Súbelo en los ajustes de la app de Ollama (Settings → Context length) o, si lo arrancas tú, con OLLAMA_CONTEXT_LENGTH=${VENTANA_MINIMA}, y manda el mensaje otra vez.`
    )
}

/** La cuenta es la dirección. Si ahí no contesta nadie, o ninguno de sus modelos sirve, se dice: los hilos no podrían empezar. */
export async function cuentaOllama(): Promise<CuentaClaude> {
  const direccion = direccionGuardada('ollama')
  if (!llaveGuardada('ollama') || !direccion) return { conectada: false }
  const { hostname, host } = new URL(direccion)
  const donde = hostname === '127.0.0.1' || hostname === 'localhost' ? 'En esta computadora' : `En ${host}`
  const data = await catalogo()
  if (!data) return { conectada: true, quien: donde, error: `Ollama no responde en ${host}. Ábrelo y vuelve a entrar aquí: sin él, sus modelos no salen y sus chats no avanzan.` }
  const n = modelosDe(data).length
  if (n) return { conectada: true, quien: `${donde} · ${n} ${n === 1 ? 'modelo' : 'modelos'}` }
  return {
    conectada: true,
    quien: donde,
    error: `Ninguno de tus modelos de Ollama puede llevar un hilo: hace falta uno que use herramientas y tenga una ventana de ${cifra(VENTANA_MINIMA)} tokens o más. Baja uno de ollama.com/search?c=tools y vuelve a entrar aquí.`
  }
}
