import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { EstadoProveedorVoz, PlanVoz, ProveedorVoz, VozApi } from '../../shared/types.ts'
import { MOTORES, motorDe, pcmDeWav, trozosParaVoz, wavDePcm } from '../../shared/voz.ts'
import { guardar } from '../disco.ts'
import { escribir, leer } from '../opciones.ts'

/**
 * La voz con Fish Audio y ElevenLabs: dos API con la llave de cada quien, sin navegador. La llave va a las variables del
 * usuario (`server/opciones.ts`), con los nombres de siempre (`FISH_API_KEY`, `ELEVENLABS_API_KEY`), y las voces que
 * ofrecen se guardan en `data/voz/apis.json` para el menú «Voz».
 *
 * Fish Audio: el modelo S2.1 Pro, gratis (`s2.1-pro-free`) hasta el 30 de noviembre de 2026, sin garantía de servicio y
 * con lo que se pide usado para mejorarlo; después, el de pago, a 15 dólares el millón de letras (unas 12 h de voz). Si
 * Fish quita el gratis, la cabecera cae sola en el de pago, que avisa si no hay saldo. ElevenLabs: Eleven v3, con los
 * créditos del plan de cada quien (el gratis da 10.000 letras al mes); clonar una voz pide un plan de pago.
 *
 * Los dos entienden indicaciones entre corchetes (`[laughs]`, `[whispers]`) y clonan una voz de una grabación de unos
 * segundos. El guion se pide por párrafos, en trozos, y se junta en un WAV PCM de 16 bits, con un respiro entre trozos.
 */

const FISH = 'https://api.fish.audio'
/** El gratis. Cuando Fish lo quite, la API usa el de pago (`s2.1-pro`) sin decir nada. */
const MODELO_FISH = 's2.1-pro-free'
const ELEVEN = 'https://api.elevenlabs.io'
const MODELO_ELEVEN = 'eleven_v3'
/** Lo que dura el respiro entre dos trozos de un guion, en segundos. */
const RESPIRO = 0.3

/** Lo de cada motor: dónde va su llave, cuánto cabe en un pedido y cómo se le habla. */
interface Motor {
  variable: string
  /** Lo más que se pide de una vez, en letras (Eleven v3 acepta 5.000). */
  maximo: number
  cabeceras(llave: string): Record<string, string>
  voces(pedir: Pedir, plan?: PlanVoz): Promise<VozApi[]>
  /** El plan de tu cuenta, si el proveedor lo dice y cambia qué voces se pueden usar o si deja clonar. */
  plan?(pedir: Pedir): Promise<PlanVoz>
  /** Las voces de toda su biblioteca que se llaman como `q`, si deja buscarlas y usarlas sin añadirlas antes. */
  buscar?(pedir: Pedir, q: string): Promise<VozApi[]>
  /** El audio de un trozo, PCM de 16 bits. `referencia`: la grabación de una voz tuya guardada aquí (Fish Audio). */
  hablar(pedir: Pedir, id: string, texto: string, referencia?: Uint8Array): Promise<{ pcm: Uint8Array; frecuencia: number; canales: number }>
  clonar(pedir: Pedir, nombre: string, audio: Blob, archivo: string): Promise<string>
}

type Pedir = (ruta: string, datos?: { json?: unknown; form?: FormData; crudo?: { cuerpo: Uint8Array; tipo: string }; cabeceras?: Record<string, string> }) => Promise<Response>

/**
 * Lo justo de msgpack para Fish Audio (mapas, listas, textos, bytes y sí/no): su API solo acepta así la grabación de
 * referencia (en JSON, el audio en base64 da «Reference Audio is not valid», probado el 6-nov-2026).
 */
export function msgpack(v: unknown): Uint8Array {
  /** El prefijo de un texto o de unos bytes: de 8, 16 o 32 bits según su largo. */
  const largo = (n: number, b8: number, b16: number, b32: number) =>
    n < 256 ? [b8, n] : n < 65536 ? [b16, n >> 8, n & 255] : [b32, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
  const juntar = (...partes: (number[] | Uint8Array)[]) => {
    const total = partes.reduce((s, p) => s + p.length, 0)
    const r = new Uint8Array(total)
    let o = 0
    for (const p of partes) r.set(p, o), (o += p.length)
    return r
  }
  if (typeof v === 'boolean') return Uint8Array.of(v ? 0xc3 : 0xc2)
  if (typeof v === 'string') {
    const b = new TextEncoder().encode(v)
    return juntar(b.length < 32 ? [0xa0 | b.length] : largo(b.length, 0xd9, 0xda, 0xdb), b)
  }
  if (v instanceof Uint8Array) return juntar(largo(v.length, 0xc4, 0xc5, 0xc6), v)
  if (Array.isArray(v)) {
    if (v.length > 15) throw new Error('msgpack: lista demasiado larga')
    return juntar([0x90 | v.length], ...v.map(msgpack))
  }
  if (typeof v !== 'object' || v === null) throw new Error(`msgpack: no sé mandar ${v === null ? 'null' : typeof v}`)
  const k = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined)
  if (k.length > 15) throw new Error('msgpack: mapa demasiado grande')
  return juntar([0x80 | k.length], ...k.flatMap(([a, b]) => [msgpack(a), msgpack(b)]))
}

/** Las voces tuyas que Fish Audio no dejó crear (sin saldo de API): se guardan aquí y van de referencia en cada pedido. */
export const TUYA = 'tuya-'

/** Un modelo de voz de Fish Audio, con lo que se usa de él (`GET /model`). */
type ModeloFish = { _id: string; title: string; description?: string; tags?: string[]; samples?: { audio?: string }[]; task_count?: number }
const modelosFish = async (pedir: Pedir, q: string) => (((await (await pedir(`/model?${q}`)).json()) as { items?: ModeloFish[] }).items ?? [])
/** Sus etiquetas dicen cómo suena («male, calm, narration»); sin ellas, su descripción. La muestra es un MP3 público. */
const vozFish = (m: ModeloFish, propia: boolean): VozApi => ({
  id: m._id,
  nombre: m.title.trim(),
  descripcion: (m.tags?.filter((t) => !/^(spanish|español|es)$/i.test(t)).slice(0, 4).join(', ') || m.description || '').slice(0, 80),
  propia,
  ...(m.samples?.[0]?.audio ? { muestra: m.samples[0].audio } : {}),
  ...(m.task_count ? { usos: m.task_count } : {})
})

const MOTOR: Record<ProveedorVoz, Motor> = {
  fish: {
    variable: 'FISH_API_KEY',
    maximo: 3000,
    cabeceras: (llave) => ({ authorization: `Bearer ${llave}` }),
    async voces(pedir) {
      const [tuyas, deTodos] = await Promise.all([modelosFish(pedir, 'self=true&page_size=50'), modelosFish(pedir, 'language=es&page_size=40&sort_by=task_count')])
      const vistas = new Set(tuyas.map((m) => m._id))
      return [...tuyas.map((m) => vozFish(m, true)), ...deTodos.filter((m) => !vistas.has(m._id)).map((m) => vozFish(m, false))]
    },
    async buscar(pedir, q) {
      return (await modelosFish(pedir, `title=${encodeURIComponent(q)}&language=es&page_size=20&sort_by=task_count`)).map((m) => vozFish(m, false))
    },
    async hablar(pedir, id, texto, referencia) {
      const pedido = { text: texto, format: 'wav', latency: 'normal', normalize: true }
      const r = referencia
        ? await pedir('/v1/tts', { cabeceras: { model: MODELO_FISH }, crudo: { cuerpo: msgpack({ ...pedido, references: [{ audio: referencia, text: '' }] }), tipo: 'application/msgpack' } })
        : await pedir('/v1/tts', { cabeceras: { model: MODELO_FISH }, json: { ...pedido, reference_id: id } })
      const wav = pcmDeWav(new Uint8Array(await r.arrayBuffer()))
      if (!wav || wav.bits !== 16) throw new Error('Fish Audio no devolvió un WAV de 16 bits.')
      return { pcm: wav.datos, frecuencia: wav.frecuencia, canales: wav.canales }
    },
    async clonar(pedir, nombre, audio, archivo) {
      const f = new FormData()
      for (const [k, v] of Object.entries({ type: 'tts', title: nombre, train_mode: 'fast', visibility: 'private', enhance_audio_quality: 'true' })) f.append(k, v)
      f.append('voices', audio, archivo)
      return ((await (await pedir('/model', { form: f })).json()) as { _id: string })._id
    }
  },
  elevenlabs: {
    variable: 'ELEVENLABS_API_KEY',
    maximo: 3000,
    cabeceras: (llave) => ({ 'xi-api-key': llave }),
    async plan(pedir) {
      const s = (await (await pedir('/v1/user/subscription')).json()) as { tier?: string; can_use_instant_voice_cloning?: boolean; character_count?: number; character_limit?: number }
      return {
        gratis: s.tier === 'free',
        nombre: s.tier ?? '',
        clonar: !!s.can_use_instant_voice_cloning,
        ...(typeof s.character_limit === 'number' ? { letras: { usadas: s.character_count ?? 0, limite: s.character_limit } } : {})
      }
    },
    async voces(pedir, plan) {
      type Voz = { voice_id: string; name: string; category?: string; is_owner?: boolean; description?: string; labels?: Record<string, string>; preview_url?: string }
      const { voices = [] } = (await (await pedir('/v2/voices?page_size=100')).json()) as { voices?: Voz[] }
      const como = (v: Voz) => [v.labels?.gender, v.labels?.age, v.labels?.accent, v.labels?.descriptive ?? v.labels?.description, v.labels?.use_case].filter(Boolean).join(', ') || (v.description ?? '')
      // Las de su biblioteca que añadiste a tu lista (`professional`, de otro) no son tuyas, y el plan gratis no deja
      // usarlas por API (402 `paid_plan_required`, visto el 6 de noviembre de 2026): se ven, con su muestra, y se avisa.
      const deOtro = (v: Voz) => v.category === 'professional' && v.is_owner === false
      return voices
        .map((v) => ({
          id: v.voice_id,
          nombre: v.name.trim(),
          descripcion: como(v).slice(0, 80),
          propia: v.category !== 'premade' && !deOtro(v),
          ...(v.preview_url ? { muestra: v.preview_url } : {}),
          ...(plan?.gratis && deOtro(v) ? { bloqueo: 'Pide un plan de pago de ElevenLabs' } : {})
        }))
        .sort((a, b) => Number(b.propia) - Number(a.propia) || Number(!!a.bloqueo) - Number(!!b.bloqueo))
    },
    async hablar(pedir, id, texto) {
      const r = await pedir(`/v1/text-to-speech/${encodeURIComponent(id)}?output_format=pcm_24000`, { json: { text: texto, model_id: MODELO_ELEVEN } })
      return { pcm: new Uint8Array(await r.arrayBuffer()), frecuencia: 24000, canales: 1 }
    },
    async clonar(pedir, nombre, audio, archivo) {
      const f = new FormData()
      f.append('name', nombre)
      f.append('remove_background_noise', 'true')
      f.append('files', audio, archivo)
      return ((await (await pedir('/v1/voices/add', { form: f })).json()) as { voice_id: string }).voice_id
    }
  }
}

/** Lo que el servidor de la voz (`index.ts`) usa de aquí. `carpeta`: `data/voz`. */
export function vozPorApi(carpeta: string) {
  const archivo = join(carpeta, 'apis.json')
  // Las que da cada motor, las que se eligieron buscando en su biblioteca (`elegidas`), que no vienen en su lista, y
  // las tuyas que solo viven aquí (`locales`, su grabación en `data/voz/tuyas`).
  let guardadas: Partial<Record<ProveedorVoz, VozApi[]>> & { elegidas?: Partial<Record<ProveedorVoz, VozApi[]>>; locales?: Partial<Record<ProveedorVoz, VozApi[]>>; planes?: Partial<Record<ProveedorVoz, PlanVoz>> } = {}
  const tuyas = join(carpeta, 'tuyas')
  try {
    guardadas = JSON.parse(readFileSync(archivo, 'utf8'))
  } catch {
    // Aún no hay ninguna.
  }
  const errores: Partial<Record<ProveedorVoz, string>> = {}
  const guardarVoces = () => (mkdirSync(carpeta, { recursive: true }), guardar(archivo, JSON.stringify(guardadas, null, 1)))
  /** Las voces de un motor para el menú: las tuyas, las que elegiste buscando y las de su lista. */
  const todas = (m: ProveedorVoz): VozApi[] => {
    const lista = guardadas[m] ?? []
    const ya = new Set(lista.map((v) => v.id))
    return [...(guardadas.locales?.[m] ?? []), ...lista.filter((v) => v.propia), ...(guardadas.elegidas?.[m] ?? []).filter((v) => !ya.has(v.id)), ...lista.filter((v) => !v.propia)]
  }

  const llave = (m: ProveedorVoz) => process.env[MOTOR[m].variable] || leer(MOTOR[m].variable)
  /** La grabación de una voz tuya guardada aquí. */
  const leerTuya = (m: ProveedorVoz, id: string) => {
    const ruta = join(tuyas, `${m}-${id.replace(/[^\w-]/g, '')}`)
    if (!existsSync(ruta)) throw new Error('Ya no está la grabación de esa voz tuya en esta computadora: vuelve a clonarla en el menú Voz.')
    return new Uint8Array(readFileSync(ruta))
  }

  /** Un pedido a la API del motor con su llave. Repite si está saturada; si falla, lo dice para el usuario o el agente. */
  const pedidor =
    (m: ProveedorVoz, con = llave(m)): Pedir =>
    async (ruta, datos = {}) => {
      const base = m === 'fish' ? FISH : ELEVEN
      for (let intento = 0; ; intento++) {
        const r = await fetch(`${base}${ruta}`, {
          method: datos.json || datos.form || datos.crudo ? 'POST' : 'GET',
          headers: { ...MOTOR[m].cabeceras(con), ...datos.cabeceras, ...(datos.json ? { 'content-type': 'application/json' } : datos.crudo ? { 'content-type': datos.crudo.tipo } : {}) },
          body: datos.form ?? (datos.json ? JSON.stringify(datos.json) : datos.crudo ? (datos.crudo.cuerpo as Uint8Array<ArrayBuffer>) : undefined),
          signal: AbortSignal.timeout(5 * 60_000)
        })
        if (r.ok) return r
        if ((r.status === 429 || r.status >= 500) && intento < 3) {
          await new Promise((ok) => setTimeout(ok, [2000, 5000, 12_000][intento]))
          continue
        }
        throw new Error(await motivo(m, r))
      }
    }

  /** El plan y luego las voces (cuáles deja usar depende del plan). Si el plan no se pudo leer, las voces igual. */
  async function leerMotor(m: ProveedorVoz, pedir: Pedir) {
    const plan = await MOTOR[m].plan?.(pedir).catch(() => undefined)
    const voces = await MOTOR[m].voces(pedir, plan)
    return { plan, voces }
  }
  const ponerPlan = (m: ProveedorVoz, plan?: PlanVoz) => {
    guardadas.planes = { ...guardadas.planes }
    if (plan) guardadas.planes[m] = plan
    else delete guardadas.planes[m]
  }

  async function actualizar(m: ProveedorVoz) {
    try {
      const { plan, voces } = await leerMotor(m, pedidor(m))
      guardadas[m] = voces
      ponerPlan(m, plan)
      delete errores[m]
      guardarVoces()
    } catch (e) {
      errores[m] = mensaje(e)
      throw e
    }
  }

  // Las voces se vuelven a pedir al arrancar, por si cambiaron fuera de Sloth.
  for (const m of Object.keys(MOTOR) as ProveedorVoz[]) if (llave(m)) void actualizar(m).catch(() => {})

  return {
    estado: (): Record<ProveedorVoz, EstadoProveedorVoz> =>
      Object.fromEntries(
        (Object.keys(MOTOR) as ProveedorVoz[]).map((m) => {
          const l = llave(m)
          return [m, { llave: l ? l.slice(-4) : null, voces: l ? todas(m) : [], ...(l && guardadas.planes?.[m] ? { plan: guardadas.planes[m] } : {}), ...(errores[m] ? { error: errores[m] } : {}) }]
        })
      ) as Record<ProveedorVoz, EstadoProveedorVoz>,
    tieneLlave: (m: ProveedorVoz) => !!llave(m),

    /** Prueba la llave pidiendo sus voces y la guarda; `null` la quita. */
    async guardarLlave(m: ProveedorVoz, nueva: string | null) {
      delete errores[m]
      if (nueva) {
        const { plan, voces } = await leerMotor(m, pedidor(m, nueva.trim()))
        escribir(MOTOR[m].variable, nueva.trim())
        guardadas[m] = voces
        ponerPlan(m, plan)
      } else {
        escribir(MOTOR[m].variable, null)
        delete guardadas[m]
        delete guardadas.elegidas?.[m]
        ponerPlan(m)
      }
      guardarVoces()
    },

    actualizar,

    /** Busca en toda la biblioteca de los motores que lo dejan (Fish Audio): lo que no está ya en el menú. */
    async buscar(q: string): Promise<{ motor: ProveedorVoz; voces: VozApi[] }[]> {
      const motores = (Object.keys(MOTOR) as ProveedorVoz[]).filter((m) => llave(m) && MOTOR[m].buscar)
      return Promise.all(
        motores.map(async (m) => {
          const ya = new Set(todas(m).map((v) => v.id))
          const voces = await MOTOR[m].buscar!(pedidor(m), q).catch(() => [])
          return { motor: m, voces: voces.filter((v) => !ya.has(v.id)) }
        })
      )
    },

    /** Una voz que se encontró buscando y se eligió: queda en el menú, con su nombre. */
    elegir(m: ProveedorVoz, voz: VozApi) {
      if (!voz.id || todas(m).some((v) => v.id === voz.id)) return
      guardadas.elegidas = { ...guardadas.elegidas, [m]: [{ ...voz, propia: false }, ...(guardadas.elegidas?.[m] ?? [])].slice(0, 30) }
      guardarVoces()
    },

    /**
     * Clona una voz de una grabación tuya. Queda entre las tuyas y devuelve su id. Si Fish Audio no deja crear voces
     * con esa llave (sin saldo de API: «model creation limit reached (0/0)»), la grabación se queda aquí y va de
     * referencia en cada pedido, que eso sí lo hace gratis: la voz sale igual, sin crear nada en tu cuenta.
     */
    async clonar(m: ProveedorVoz, nombre: string, audio: Uint8Array, tipo: string, archivoAudio: string): Promise<string> {
      // El plan gratis de ElevenLabs no deja clonar: se dice antes de mandar la grabación.
      if (m === 'elevenlabs' && guardadas.planes?.[m] && !guardadas.planes[m].clonar)
        throw new Error('Tu plan gratis de ElevenLabs no deja clonar voces. Clónala en Fish Audio o en Sloth, o sube de plan en ElevenLabs.')
      let id: string
      try {
        id = await MOTOR[m].clonar(pedidor(m), nombre, new Blob([audio as Uint8Array<ArrayBuffer>], { type: tipo || 'audio/wav' }), archivoAudio)
      } catch (e) {
        if (m !== 'fish' || !/model creation limit|top up/i.test(mensaje(e))) throw e
        id = `${TUYA}${Date.now().toString(36)}`
        mkdirSync(tuyas, { recursive: true })
        guardar(join(tuyas, `${m}-${id}`), audio)
        guardadas.locales = { ...guardadas.locales, [m]: [{ id, nombre, descripcion: 'Tu voz, guardada en esta computadora', propia: true }, ...(guardadas.locales?.[m] ?? [])] }
        guardarVoces()
        return id
      }
      await actualizar(m).catch(() => {})
      if (!guardadas[m]?.some((v) => v.id === id)) {
        guardadas[m] = [{ id, nombre, descripcion: 'Tu voz', propia: true }, ...(guardadas[m] ?? [])]
        guardarVoces()
      }
      return id
    },

    /** Quita una voz tuya guardada aquí (`tuya-…`): su grabación y su sitio en el menú. Las de tu cuenta no se tocan. */
    quitarTuya(m: ProveedorVoz, id: string) {
      if (!id.startsWith(TUYA)) throw new Error('Solo se quitan desde aquí las voces tuyas guardadas en esta computadora.')
      rmSync(join(tuyas, `${m}-${id.replace(/[^\w-]/g, '')}`), { force: true })
      guardadas.locales = { ...guardadas.locales, [m]: (guardadas.locales?.[m] ?? []).filter((v) => v.id !== id) }
      guardarVoces()
    },

    /** El nombre de una voz (`fish:<id>`) como se ve en el menú, si la conoce. */
    nombre(voz: string): string | undefined {
      const { motor, id } = motorDe(voz)
      return motor === 'ai-studio' || motor === 'vc' ? undefined : todas(motor).find((v) => v.id === id)?.nombre
    },

    /** La voz de un guion entero (`voz` con su prefijo), como WAV, y cuánto dura. */
    async generar(voz: string, texto: string): Promise<{ wav: Uint8Array; segundos: number }> {
      const { motor, id } = motorDe(voz)
      if (motor === 'ai-studio' || motor === 'vc') throw new Error(`${voz} no es una voz de Fish Audio ni de ElevenLabs.`)
      if (!llave(motor)) throw new Error(`No hay llave de ${MOTORES[motor]}: que el usuario la ponga en Opciones → Voz. Mientras, pídele la voz.`)
      const pedir = pedidor(motor)
      const partes: Awaited<ReturnType<Motor['hablar']>>[] = []
      const referencia = id.startsWith(TUYA) ? leerTuya(motor, id) : undefined
      for (const trozo of trozosParaVoz(texto, MOTOR[motor].maximo)) partes.push(await MOTOR[motor].hablar(pedir, id, trozo, referencia))
      const { frecuencia, canales } = partes[0]
      if (partes.some((p) => p.frecuencia !== frecuencia || p.canales !== canales)) throw new Error(`${MOTORES[motor]} devolvió trozos con formatos distintos.`)
      const wav = wavDePcm(partes.map((p) => p.pcm), frecuencia, canales, 16, RESPIRO)
      // Lo que queda de letras del mes cambió: se vuelve a leer, de fondo.
      if (MOTOR[motor].plan) void MOTOR[motor].plan(pedir).then((p) => (ponerPlan(motor, p), guardarVoces()), () => {})
      return { wav, segundos: (wav.length - 44) / (frecuencia * canales * 2) }
    }
  }
}

/** Por qué no aceptó un pedido, dicho para quien lo lea. */
async function motivo(m: ProveedorVoz, r: Response): Promise<string> {
  const cuerpo = (await r.json().catch(() => null)) as { message?: string; detail?: string | { message?: string; status?: string } | { msg?: string }[] } | null
  const d = cuerpo?.detail
  const dicho = (typeof d === 'string' ? d : Array.isArray(d) ? d[0]?.msg : d?.message) ?? cuerpo?.message ?? ''
  // ElevenLabs dice qué fue en `detail.status` (`quota_exceeded`, `missing_permissions`…), y lo de los créditos llega
  // también con 401: se mira antes que la llave.
  const clave = d && typeof d === 'object' && !Array.isArray(d) ? (d.status ?? '') : ''
  const nombre = MOTORES[m]
  const extra = dicho ? `: ${dicho}` : '.'
  if (/paid_plan_required/.test(JSON.stringify(cuerpo ?? '')))
    return 'Tu plan gratis de ElevenLabs no deja usar por API las voces de su biblioteca: usa una de las de ElevenLabs, una tuya, o sube de plan. Mientras, pide la voz al usuario.'
  const sinSaldo = r.status === 402 ||/quota|credit|balance|payment/i.test(`${clave} ${dicho}`)
  if (!sinSaldo && (r.status === 401 || r.status === 403))
    return /permission/i.test(clave) ? `A la llave de ${nombre} le falta permiso${extra} Dale los de Text to Speech y Voices, o crea otra.` : `${nombre} no aceptó la llave${extra} Revísala en Opciones → Voz.`
  if (sinSaldo)
    return m === 'fish'
      ? `Fish Audio no tiene saldo para esta llave${extra} Lo gratis de S2.1 Pro era hasta el 30 de noviembre de 2026; después se paga en fish.audio. Mientras, pide la voz al usuario.`
      : `ElevenLabs se quedó sin créditos este mes, o tu plan no deja hacer esto${extra} Mientras, pide la voz al usuario.`
  if (r.status === 404) return `${nombre} no tiene esa voz${extra} Mira las que hay con la herramienta voces.`
  if (r.status === 429) return `${nombre} está saturado o llegaste a su límite${extra} Prueba en un rato.`
  return `${nombre} respondió ${r.status}${extra}`
}

const mensaje = (e: unknown) => String(e instanceof Error ? e.message : e).split('\n')[0]
