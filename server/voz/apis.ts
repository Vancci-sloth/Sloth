import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EstadoProveedorVoz, ProveedorVoz, VozApi } from '../../shared/types.ts'
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
  voces(pedir: Pedir): Promise<VozApi[]>
  /** El audio de un trozo, PCM de 16 bits. */
  hablar(pedir: Pedir, id: string, texto: string): Promise<{ pcm: Uint8Array; frecuencia: number; canales: number }>
  clonar(pedir: Pedir, nombre: string, audio: Blob, archivo: string): Promise<string>
}

type Pedir = (ruta: string, datos?: { json?: unknown; form?: FormData; cabeceras?: Record<string, string> }) => Promise<Response>

const MOTOR: Record<ProveedorVoz, Motor> = {
  fish: {
    variable: 'FISH_API_KEY',
    maximo: 3000,
    cabeceras: (llave) => ({ authorization: `Bearer ${llave}` }),
    async voces(pedir) {
      type Modelo = { _id: string; title: string; description?: string; tags?: string[] }
      const lista = async (q: string) => (((await (await pedir(`/model?${q}`)).json()) as { items?: Modelo[] }).items ?? [])
      const [tuyas, deTodos] = await Promise.all([lista('self=true&page_size=50'), lista('language=es&page_size=40&sort_by=task_count')])
      const voz = (m: Modelo, propia: boolean): VozApi => ({ id: m._id, nombre: m.title.trim(), descripcion: (m.tags?.slice(0, 3).join(', ') || m.description || '').slice(0, 80), propia })
      const vistas = new Set(tuyas.map((m) => m._id))
      return [...tuyas.map((m) => voz(m, true)), ...deTodos.filter((m) => !vistas.has(m._id)).map((m) => voz(m, false))]
    },
    async hablar(pedir, id, texto) {
      const r = await pedir('/v1/tts', { cabeceras: { model: MODELO_FISH }, json: { text: texto, reference_id: id, format: 'wav', latency: 'normal', normalize: true } })
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
    async voces(pedir) {
      type Voz = { voice_id: string; name: string; category?: string; description?: string; labels?: Record<string, string> }
      const { voices = [] } = (await (await pedir('/v2/voices?page_size=100')).json()) as { voices?: Voz[] }
      const como = (v: Voz) => [v.labels?.accent, v.labels?.gender, v.labels?.age, v.labels?.descriptive ?? v.labels?.description, v.labels?.use_case].filter(Boolean).join(' · ') || (v.description ?? '')
      return voices
        .map((v) => ({ id: v.voice_id, nombre: v.name.trim(), descripcion: como(v).slice(0, 80), propia: v.category !== 'premade' }))
        .sort((a, b) => Number(b.propia) - Number(a.propia))
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
  let guardadas: Partial<Record<ProveedorVoz, VozApi[]>> = {}
  try {
    guardadas = JSON.parse(readFileSync(archivo, 'utf8'))
  } catch {
    // Aún no hay ninguna.
  }
  const errores: Partial<Record<ProveedorVoz, string>> = {}
  const guardarVoces = () => (mkdirSync(carpeta, { recursive: true }), guardar(archivo, JSON.stringify(guardadas, null, 1)))

  const llave = (m: ProveedorVoz) => process.env[MOTOR[m].variable] || leer(MOTOR[m].variable)

  /** Un pedido a la API del motor con su llave. Repite si está saturada; si falla, lo dice para el usuario o el agente. */
  const pedidor =
    (m: ProveedorVoz, con = llave(m)): Pedir =>
    async (ruta, datos = {}) => {
      const base = m === 'fish' ? FISH : ELEVEN
      for (let intento = 0; ; intento++) {
        const r = await fetch(`${base}${ruta}`, {
          method: datos.json || datos.form ? 'POST' : 'GET',
          headers: { ...MOTOR[m].cabeceras(con), ...datos.cabeceras, ...(datos.json ? { 'content-type': 'application/json' } : {}) },
          body: datos.form ?? (datos.json ? JSON.stringify(datos.json) : undefined),
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

  async function actualizar(m: ProveedorVoz) {
    try {
      guardadas[m] = await MOTOR[m].voces(pedidor(m))
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
          return [m, { llave: l ? l.slice(-4) : null, voces: l ? (guardadas[m] ?? []) : [], ...(errores[m] ? { error: errores[m] } : {}) }]
        })
      ) as Record<ProveedorVoz, EstadoProveedorVoz>,
    tieneLlave: (m: ProveedorVoz) => !!llave(m),

    /** Prueba la llave pidiendo sus voces y la guarda; `null` la quita. */
    async guardarLlave(m: ProveedorVoz, nueva: string | null) {
      delete errores[m]
      if (nueva) {
        const voces = await MOTOR[m].voces(pedidor(m, nueva.trim()))
        escribir(MOTOR[m].variable, nueva.trim())
        guardadas[m] = voces
      } else {
        escribir(MOTOR[m].variable, null)
        delete guardadas[m]
      }
      guardarVoces()
    },

    actualizar,

    /** Clona una voz de una grabación tuya. Queda entre las tuyas y devuelve su id. */
    async clonar(m: ProveedorVoz, nombre: string, audio: Uint8Array, tipo: string, archivoAudio: string): Promise<string> {
      const id = await MOTOR[m].clonar(pedidor(m), nombre, new Blob([audio as Uint8Array<ArrayBuffer>], { type: tipo || 'audio/wav' }), archivoAudio)
      await actualizar(m).catch(() => {})
      if (!guardadas[m]?.some((v) => v.id === id)) {
        guardadas[m] = [{ id, nombre, descripcion: 'Tu voz', propia: true }, ...(guardadas[m] ?? [])]
        guardarVoces()
      }
      return id
    },

    /** El nombre de una voz (`fish:<id>`) como se ve en el menú, si la conoce. */
    nombre(voz: string): string | undefined {
      const { motor, id } = motorDe(voz)
      return motor === 'ai-studio' || motor === 'vc' ? undefined : guardadas[motor]?.find((v) => v.id === id)?.nombre
    },

    /** La voz de un guion entero (`voz` con su prefijo), como WAV, y cuánto dura. */
    async generar(voz: string, texto: string): Promise<{ wav: Uint8Array; segundos: number }> {
      const { motor, id } = motorDe(voz)
      if (motor === 'ai-studio' || motor === 'vc') throw new Error(`${voz} no es una voz de Fish Audio ni de ElevenLabs.`)
      if (!llave(motor)) throw new Error(`No hay llave de ${MOTORES[motor]}: que el usuario la ponga en Opciones → Voz. Mientras, pídele la voz.`)
      const pedir = pedidor(motor)
      const partes: Awaited<ReturnType<Motor['hablar']>>[] = []
      for (const trozo of trozosParaVoz(texto, MOTOR[motor].maximo)) partes.push(await MOTOR[motor].hablar(pedir, id, trozo))
      const { frecuencia, canales } = partes[0]
      if (partes.some((p) => p.frecuencia !== frecuencia || p.canales !== canales)) throw new Error(`${MOTORES[motor]} devolvió trozos con formatos distintos.`)
      const wav = wavDePcm(partes.map((p) => p.pcm), frecuencia, canales, 16, RESPIRO)
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
  const sinSaldo = r.status === 402 || /quota|credit|balance|payment/i.test(`${clave} ${dicho}`)
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
