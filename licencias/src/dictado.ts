/**
 * El dictado del compositor con las cuentas de Deepgram de Sloth, solo para quien apoya hoy (`apoya`) o el creador; una
 * cuenta gratis no dicta. La app (`server/dictado-vivo.ts`) manda aquí el audio y este Worker lo pasa a Deepgram y le
 * devuelve lo que contesta, sin guardar nada de eso. Lo único que anota es cuánto dictó cada quien en el día
 * (`dictado_uso`, migración 0038), para su tope, y qué llave se acabó (`dictado_llaves`).
 *
 * Las llaves son secretos: `DEEPGRAM_API_KEY` y, si hay más, `DEEPGRAM_API_KEY_2`, `_3`… (con rol Admin u Owner, que
 * dejan leer el saldo). Se usan en orden. Antes de cada dictado se mira el saldo de la llave (`saldoDe`): si tiene menos
 * de `DICTADO_SALDO_MINIMO` dólares (0.05 si no se pone), se anota agotada y se pasa a la siguiente, para que ningún
 * dictado se corte a medias. Si Deepgram la rechaza al abrir (sin saldo, 402; revocada o sin permiso, 401 o 403), igual.
 * Las agotadas solo se vuelven a probar cuando ya no queda otra, y si una vuelve a servir (la recargaron), se le quita
 * la marca. Una nueva va en el siguiente número libre.
 *
 * - `GET /dictado`: `{disponible, minutos}`, si puedes dictar y cuántos minutos te quedan hoy (`null`: sin tope). Al
 *   creador también le dice cada llave (`llaves`: su secreto, sus últimas cuatro letras, su saldo en dólares si se
 *   pudo leer y desde cuándo está agotada).
 * - `GET /dictado/vivo` (WebSocket): el puente. Llegan los trozos de audio y «fin»; salen los mensajes de Deepgram tal
 *   cual, o `{error}` antes de cerrar. Uno a la vez por persona, 80 s y 12 MB como mucho.
 *
 * `DICTADO_MINUTOS` (30 si no se pone) es el tope de cada quien al día (UTC); el creador no tiene. Sin llaves, nadie dicta.
 */
import { type Env, Rechazo, apoya, json } from './index.ts'
import { idDe, quien } from './voz.ts'

const PROYECTOS = 'https://api.deepgram.com/v1/projects'
const VIVO = 'https://api.deepgram.com/v1/listen?model=nova-3&language=multi&language_hint=es&smart_format=true&interim_results=true&endpointing=300'
export const MAX_SEGUNDOS = 80
export const MAX_BYTES = 12 * 1024 * 1024
/** Un dictado marcado abierto hace más que esto se da por perdido (se cayó el Worker que lo llevaba). */
const ABIERTO_MS = (MAX_SEGUNDOS + 10) * 1000
const GUARDAR_DIAS = 35
/** El nombre del secreto de una llave: `DEEPGRAM_API_KEY`, `DEEPGRAM_API_KEY_2`… */
export const NOMBRE_LLAVE = /^DEEPGRAM_API_KEY(?:_(\d+))?$/
/** Lo que contesta Deepgram cuando la llave ya no sirve: sin saldo, o revocada o sin permiso. */
const AGOTADA = new Set([401, 402, 403])
export const SOLO_APOYO = 'El dictado es para quien apoya a Sloth. Apóyalo en Opciones → Apoyo.'

export const dia = (ahora: number) => new Date(ahora).toISOString().slice(0, 10)
/** El tope de cada quien al día, en segundos. */
export const topeDe = (env: Pick<Env, 'DICTADO_MINUTOS'>) => (Number(env.DICTADO_MINUTOS) || 30) * 60

export interface Llave {
  nombre: string
  valor: string
  fin: string
  id: string
}

/** Las llaves puestas en el cobro, en orden (`DEEPGRAM_API_KEY` es la 1), sin las vacías ni las repetidas. */
export async function llavesDe(env: Env): Promise<Llave[]> {
  const secretos = env as unknown as Record<string, unknown>
  const orden = (nombre: string) => Number(NOMBRE_LLAVE.exec(nombre)?.[1] ?? 1)
  const nombres = Object.keys(secretos)
    .filter((k) => NOMBRE_LLAVE.test(k) && typeof secretos[k] === 'string' && (secretos[k] as string).trim())
    .sort((a, b) => orden(a) - orden(b))
  const llaves = await Promise.all(
    nombres.map(async (nombre) => {
      const valor = (secretos[nombre] as string).trim()
      return { nombre, valor, fin: valor.slice(-4), id: await idDe(valor) }
    })
  )
  return llaves.filter((l, i) => llaves.findIndex((o) => o.id === l.id) === i)
}

/** En qué orden se prueban: las buenas en su orden y, al final, las agotadas, de la que se agotó hace más a la más reciente. */
export function enOrden(llaves: Llave[], agotadas: Map<string, number>): Llave[] {
  const buenas = llaves.filter((l) => !agotadas.has(l.id))
  const malas = llaves.filter((l) => agotadas.has(l.id)).sort((a, b) => agotadas.get(a.id)! - agotadas.get(b.id)!)
  return [...buenas, ...malas]
}

async function agotadasDe(env: Env): Promise<Map<string, number>> {
  const { results } = await env.DB.prepare('SELECT id, agotada FROM dictado_llaves').all<{ id: string; agotada: number }>()
  return new Map(results.map((r) => [r.id, r.agotada]))
}

export interface Uso {
  segundos: number
  /** Cuándo empezó el dictado que sigue abierto; 0 si no hay. */
  abierto: number
}

/** Por qué no puede dictar ahora, o nada si puede. */
export function impedimento(uso: Uso, tope: number, creador: boolean, ahora: number): string | undefined {
  if (uso.abierto && ahora - uso.abierto < ABIERTO_MS) return 'Ya tienes un dictado en curso.'
  if (!creador && uso.segundos >= tope) return `Ya dictaste los ${Math.round(tope / 60)} minutos de hoy. Mañana tienes otros ${Math.round(tope / 60)}.`
}

/** El proyecto de Deepgram de cada llave (por su id): no cambia, así que se pregunta una vez por Worker. */
const proyectos = new Map<string, string>()

/**
 * El saldo de la llave en dólares (`/v1/projects/{id}/balances`, la suma de sus `amount`), o nada si no se pudo saber:
 * una llave «Member» no tiene permiso de facturación (hacen falta Admin u Owner), o Deepgram no contestó a tiempo. Lo
 * que contesta no se reenvía.
 */
export async function saldoDe(l: Llave, pedir: typeof fetch = fetch): Promise<number | undefined> {
  const init = { headers: { Authorization: `Token ${l.valor}` }, signal: AbortSignal.timeout(5000) }
  try {
    let proyecto = proyectos.get(l.id)
    if (!proyecto) {
      const r = await pedir(PROYECTOS, init)
      if (!r.ok) return console.error(`Dictado: no se leyó el proyecto de ${l.nombre} (${r.status})`), undefined
      proyecto = ((await r.json()) as { projects?: { project_id?: string }[] }).projects?.[0]?.project_id
      if (!proyecto) return undefined
      proyectos.set(l.id, proyecto)
    }
    const r = await pedir(`${PROYECTOS}/${encodeURIComponent(proyecto)}/balances`, init)
    if (!r.ok) {
      if (r.status === 404) proyectos.delete(l.id)
      return console.error(`Dictado: no se leyó el saldo de ${l.nombre} (${r.status})`), undefined
    }
    const balances = ((await r.json()) as { balances?: { amount?: unknown }[] }).balances
    return Array.isArray(balances) ? balances.reduce((n, b) => n + (Number(b.amount) || 0), 0) : undefined
  } catch {
    return undefined
  }
}

/** Lo menos que debe tener una llave para darle un dictado: lo que cuesta uno de 80 s, con mucho de sobra. */
export const saldoMinimoDe = (env: Pick<Env, 'DICTADO_SALDO_MINIMO'>) => Number(env.DICTADO_SALDO_MINIMO) || 0.05

/**
 * Abre el WebSocket con Deepgram con la primera llave que sirva. Antes de usar una, mira su saldo: si no alcanza para un
 * dictado, la anota agotada y pasa a la siguiente sin que la persona note nada. Si Deepgram la rechaza al abrir (402 sin
 * saldo, 401 o 403), igual. A la que vuelve a servir (la recargaron) se le quita la marca. Si ninguna tuvo saldo, se
 * prueban de todos modos: una cuenta con pago por uso puede marcar 0 y dictar. Lo que contesta Deepgram no se reenvía.
 */
export async function abrirDeepgram(
  env: Env,
  llaves: Llave[],
  agotadas: Map<string, number>,
  o: { abrir?: (valor: string) => Promise<Response>; saldo?: (l: Llave) => Promise<number | undefined> } = {}
) {
  const abrir = o.abrir ?? ((valor: string) => fetch(VIVO, { headers: { Upgrade: 'websocket', Authorization: `Token ${valor}` } }))
  const saldo = o.saldo ?? ((l: Llave) => saldoDe(l))
  const minimo = saldoMinimoDe(env)
  const marcar = async (l: Llave) => {
    if (agotadas.has(l.id)) return
    await env.DB.prepare('INSERT INTO dictado_llaves (id, agotada) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET agotada = excluded.agotada').bind(l.id, Date.now()).run()
    agotadas.set(l.id, Date.now())
  }
  let lleno = false
  const intentar = async (l: Llave) => {
    const r = await abrir(l.valor)
    if (r.webSocket) {
      if (agotadas.has(l.id)) await env.DB.prepare('DELETE FROM dictado_llaves WHERE id = ?').bind(l.id).run()
      return r.webSocket
    }
    console.error(`Dictado: Deepgram respondió ${r.status} con ${l.nombre}`)
    if (AGOTADA.has(r.status)) await marcar(l)
    if (r.status === 429) lleno = true
  }
  const sinSaldo: Llave[] = []
  for (const l of enOrden(llaves, agotadas)) {
    const s = await saldo(l)
    if (s !== undefined && s < minimo) {
      console.error(`Dictado: ${l.nombre} se quedó sin saldo (${s.toFixed(2)} USD); se usa la siguiente`)
      await marcar(l)
      sinSaldo.push(l)
      continue
    }
    const ws = await intentar(l)
    if (ws) return ws
  }
  for (const l of sinSaldo) {
    const ws = await intentar(l)
    if (ws) return ws
  }
  throw new Rechazo(503, lleno ? 'El dictado está lleno ahora mismo. Intenta en un momento.' : 'El dictado no está disponible ahora. Intenta más tarde.')
}

export async function dictado(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  if (url.pathname !== '/dictado' && url.pathname !== '/dictado/vivo') return json({ error: 'No existe' }, 404)
  // Sin cuenta es lo mismo que sin apoyo: no dicta.
  const q = await quien(req, env, 'pidió el dictado de Sloth').catch((e) => {
    if (e instanceof Rechazo && e.status === 401) return undefined
    throw e
  })
  const llaves = await llavesDe(env)
  const deQuienApoya = !!q && (q.creador || (await apoya(req, env)))
  if (url.pathname === '/dictado') {
    if (req.method !== 'GET') return json({ error: 'No existe' }, 404)
    if (!q || !llaves.length || !deQuienApoya) return json({ disponible: false, ...(q?.creador ? { llaves: [] } : {}) })
  } else {
    if (!q || !deQuienApoya) throw new Rechazo(403, SOLO_APOYO)
    if (!llaves.length) throw new Rechazo(503, 'El dictado aún no está listo.')
  }
  const ahora = Date.now()
  const hoy = dia(ahora)
  const uso = (await env.DB.prepare('SELECT segundos, abierto FROM dictado_uso WHERE externo = ? AND dia = ?').bind(q.externo, hoy).first<Uso>()) ?? { segundos: 0, abierto: 0 }
  const tope = topeDe(env)
  const agotadas = await agotadasDe(env)
  if (url.pathname === '/dictado')
    return json({
      disponible: true,
      minutos: q.creador ? null : Math.max(0, Math.floor((tope - uso.segundos) / 60)),
      ...(q.creador
        ? {
            llaves: await Promise.all(
              llaves.map(async (l) => ({ nombre: l.nombre, fin: l.fin, saldo: (await saldoDe(l)) ?? null, agotada: agotadas.has(l.id) ? new Date(agotadas.get(l.id)!).toISOString() : null }))
            )
          }
        : {})
    })
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') throw new Rechazo(426, 'El dictado va por WebSocket.')
  const no = impedimento(uso, tope, q.creador, ahora)
  if (no) throw new Rechazo(429, no)
  const remoto = await abrirDeepgram(env, llaves, agotadas)
  await env.DB.prepare('INSERT INTO dictado_uso (externo, dia, segundos, abierto) VALUES (?, ?, 0, ?) ON CONFLICT (externo, dia) DO UPDATE SET abierto = excluded.abierto')
    .bind(q.externo, hoy, ahora)
    .run()
  const [cliente, servidor] = Object.values(new WebSocketPair())
  remoto.accept()
  servidor.accept()
  puente(servidor, remoto, (segundos) =>
    ctx.waitUntil(
      env.DB.prepare('UPDATE dictado_uso SET segundos = segundos + ?, abierto = 0 WHERE externo = ? AND dia = ?')
        .bind(segundos, q.externo, hoy)
        .run()
        .catch((e) => console.error('Dictado: no se anotó el uso', e instanceof Error ? e.message : e))
    )
  )
  return new Response(null, { status: 101, webSocket: cliente })
}

/** Lo que hace falta de un WebSocket del Worker (así se prueba sin uno). */
export interface Tubo {
  /** Con la fecha de compatibilidad del cobro, lo binario llega como Blob si no se pide `arraybuffer`. */
  binaryType?: 'blob' | 'arraybuffer'
  send(dato: string | ArrayBuffer): void
  close(codigo?: number): void
  addEventListener(tipo: 'message', f: (e: { data: string | ArrayBuffer }) => void): void
  addEventListener(tipo: 'close' | 'error', f: () => void): void
}

/**
 * Pasa el audio de la app a Deepgram y lo que contesta Deepgram a la app. Al cerrarse cualquiera de los dos, cierra el
 * otro y dice cuántos segundos duró (`alTerminar`, una vez).
 */
export function puente(app: Tubo, deepgram: Tubo, alTerminar: (segundos: number) => void, ahora = Date.now) {
  // Sin esto, el audio llega como Blob: no se puede contar ni reenviar (Deepgram recibía «[object Blob]»).
  app.binaryType = 'arraybuffer'
  deepgram.binaryType = 'arraybuffer'
  const inicio = ahora()
  let bytes = 0
  let terminado = false
  const reloj = setTimeout(() => fallar('Se agotó el tiempo del dictado.'), MAX_SEGUNDOS * 1000)
  function terminar() {
    if (terminado) return
    terminado = true
    clearTimeout(reloj)
    for (const t of [app, deepgram])
      try {
        t.close(1000)
      } catch {
        // Ya estaba cerrado.
      }
    alTerminar(Math.max(1, Math.ceil((ahora() - inicio) / 1000)))
  }
  function fallar(error: string) {
    try {
      app.send(JSON.stringify({ error }))
    } catch {
      // La app ya se fue.
    }
    terminar()
  }
  app.addEventListener('message', (e) => {
    if (terminado) return
    if (typeof e.data === 'string') {
      if (e.data === 'fin') deepgram.send(JSON.stringify({ type: 'CloseStream' }))
      return
    }
    if (!(e.data instanceof ArrayBuffer)) return fallar('No se pudo dictar. Intenta de nuevo.')
    bytes += e.data.byteLength
    if (bytes > MAX_BYTES) return fallar('El dictado es demasiado largo. Intenta uno más corto.')
    deepgram.send(e.data)
  })
  deepgram.addEventListener('message', (e) => {
    if (!terminado && typeof e.data === 'string') app.send(e.data)
  })
  app.addEventListener('close', terminar)
  app.addEventListener('error', terminar)
  deepgram.addEventListener('close', terminar)
  deepgram.addEventListener('error', () => fallar('Se cortó la conexión con Deepgram.'))
}

/** Lo del cron: el uso de más de `GUARDAR_DIAS` días ya no sirve para nada. */
export async function olvidarDictado(env: Env, ahora = Date.now()): Promise<void> {
  await env.DB.prepare('DELETE FROM dictado_uso WHERE dia < ?').bind(dia(ahora - GUARDAR_DIAS * 24 * 3600_000)).run()
}
