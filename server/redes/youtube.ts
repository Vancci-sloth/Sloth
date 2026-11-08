import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fechaRitmo } from '../../shared/ritmo.ts'
import { guardar, huella } from '../disco.ts'
import { errorYoutube, subirYoutube, type SubidaYoutube } from '../youtube-subida.ts'
import type { ModuloRed } from './index.ts'
import { SinSesion } from './navegador.ts'

/**
 * YouTube Shorts: los verticales de la cola de redes suben a tu canal, privados y con su hora (`publishAt`), y YouTube
 * los publica solo, aunque Sloth esté cerrado. Va por la API, con el canal que conectas en Opciones → YouTube (el de los
 * videos largos, `server/youtube.ts`); aquí solo se enciende o se apaga (`interruptor`), para que conectar el canal de
 * los largos no mande también los verticales. Un vertical de hasta 3 minutos es Short para YouTube; uno más largo sale
 * como video normal. Lo de cada subida vive en `data/redes/youtube.json`, por `ref`: un reintento sigue donde se quedó y
 * nunca sube el mismo video dos veces.
 */

/** El canal conectado en Opciones → YouTube. */
export interface CanalYoutube {
  cuenta(): { id: string; nombre: string } | null
  token(): Promise<string>
}

type Subida = SubidaYoutube & { canal: string }
interface Datos {
  activo: boolean
  subidas: Record<string, Subida>
}

const API = 'https://www.googleapis.com/youtube/v3/videos'
/** A menos de esto de su hora, una publicación ya no se mueve: podría estar saliendo. */
const CERCA = 5 * 60000
const enFecha = (s: string) => new Date(s.replace(' ', 'T')).getTime()

/** El título: el texto entero si cabe en los 100 caracteres de YouTube; si no, su primera frase, o hasta un espacio. */
export function tituloShort(texto: string) {
  const limpio = texto.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
  const letras = [...limpio]
  if (letras.length <= 100) return limpio || 'Short'
  const corto = letras.slice(0, 100).join('')
  const frase = /^(.{20,}[.!?])\s/.exec(corto)?.[1]
  return frase ?? `${corto.slice(0, corto.lastIndexOf(' ') > 40 ? corto.lastIndexOf(' ') : 99).trim()}…`
}

/** La descripción: el texto y sus hashtags, con #Shorts al final. Sin < ni >, que YouTube rechaza. */
export function descripcionShort(texto: string, tags: string[]) {
  const etiquetas = [...tags.filter((t) => t.toLowerCase() !== 'shorts'), 'Shorts'].map((t) => `#${t}`).join(' ')
  return [texto.replace(/[<>]/g, '').trim(), etiquetas].filter(Boolean).join('\n\n')
}

export function youtubeShorts(app: string, canal: CanalYoutube): ModuloRed {
  const archivo = join(app, 'data', 'redes', 'youtube.json')
  let datos: Datos = { activo: false, subidas: {} }
  try {
    if (existsSync(archivo)) datos = { activo: false, subidas: {}, ...JSON.parse(readFileSync(archivo, 'utf8')) }
  } catch (e) {
    console.error('redes: no pude leer data/redes/youtube.json:', e instanceof Error ? e.message : e)
  }
  function guardarDatos() {
    mkdirSync(dirname(archivo), { recursive: true })
    guardar(archivo, JSON.stringify(datos, null, 1))
  }

  async function pedir(url: string, init: RequestInit = {}) {
    let token: string
    try {
      token = await canal.token()
    } catch (e) {
      throw new SinSesion(e instanceof Error ? e.message : String(e))
    }
    const res = await fetch(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) })
    if (res.status === 401) throw new SinSesion('La autorización de YouTube caducó. Vuelve a conectar el canal en Opciones.')
    return res
  }
  /** Cómo está cada video en YouTube, por id (los que no salen ya no existen o no son de este canal). */
  async function leer(ids: string[]) {
    type Video = { id: string; status: { privacyStatus: string; publishAt?: string; uploadStatus?: string; rejectionReason?: string; failureReason?: string } }
    const vistos = new Map<string, Video['status']>()
    for (let i = 0; i < ids.length; i += 50) {
      const res = await pedir(`${API}?part=status&id=${ids.slice(i, i + 50).map(encodeURIComponent).join(',')}`)
      if (!res.ok) throw await errorYoutube(res)
      for (const v of ((await res.json()) as { items?: Video[] }).items ?? []) vistos.set(v.id, v.status)
    }
    return vistos
  }
  /**
   * Le pone otra hora a un video ya subido, sin subirlo de nuevo. Al cambiar `status` se manda entero (lo que falta se
   * borra): van también lo de niños y lo sintético que se marcó al programarlo.
   */
  async function nuevaHora(s: Subida, publishAt: string) {
    const res = await pedir(`${API}?part=status`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: s.id, status: { privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: s.datos.infantil, containsSyntheticMedia: s.datos.sintetico } }),
    })
    if (!res.ok) throw await errorYoutube(res)
  }

  return {
    id: 'youtube',
    nombre: 'YouTube Shorts',
    interruptor: true,
    mueve: true,

    async cuenta() {
      return { cuenta: datos.activo ? (canal.cuenta()?.nombre ?? null) : null }
    },

    async token(valor) {
      const c = canal.cuenta()
      if (valor && !c) throw new Error('Primero conecta tu canal en la fila de YouTube, aquí abajo.')
      datos.activo = !!valor
      guardarDatos()
      return valor ? c!.nombre : null
    },

    async programar(_nav, p) {
      const c = canal.cuenta()
      if (!datos.activo || !c) throw new SinSesion('Conecta tu canal en Opciones → YouTube.')
      const publishAt = new Date(enFecha(p.cuando)).toISOString()
      let s: Subida | undefined = datos.subidas[p.ref]
      // Ya está en YouTube (un reintento, o «Pasar al ritmo nuevo»): solo se cambia su hora, si hace falta.
      if (s?.id && s.canal === c.id) {
        const actual = (await leer([s.id])).get(s.id)
        if (actual) {
          if (actual.privacyStatus === 'public') return
          const antes = actual.publishAt ? Date.parse(actual.publishAt) : NaN
          if (antes === Date.parse(publishAt)) return
          if (antes - Date.now() < CERCA) return { cuando: fechaRitmo(new Date(antes)) }
          await nuevaHora(s, publishAt)
          return
        }
        // Lo borraron en YouTube Studio: se sube otra vez.
        delete datos.subidas[p.ref]
        s = undefined
      }
      if (huella(p.ruta) !== p.huella) throw new Error('El video cambió (o ya no está) desde que se puso en la cola.')
      if (!s || s.canal !== c.id) {
        s = {
          canal: c.id,
          estado: 'subiendo',
          enviados: 0,
          total: statSync(p.ruta).size,
          publicarAl: publishAt,
          datos: { titulo: tituloShort(p.texto), descripcion: descripcionShort(p.texto, p.tags), privacidad: 'private', infantil: p.infantil === true, sintetico: p.sintetico === true },
        }
        datos.subidas[p.ref] = s
        guardarDatos()
      }
      await subirYoutube(p.ruta, s, () => canal.token(), guardarDatos)
      // Una subida retomada lleva la hora con que empezó: si cambió, se pone la de ahora.
      if (s.publicarAl !== publishAt) {
        await nuevaHora(s, publishAt)
        s.publicarAl = publishAt
        guardarDatos()
      }
    },

    // Si ya está en YouTube, se borra de ahí: aún no salía (solo se quita lo que espera o falló).
    async quitar(ref) {
      const s = datos.subidas[ref]
      if (s?.id && s.canal === canal.cuenta()?.id) {
        const res = await pedir(`${API}?id=${encodeURIComponent(s.id)}`, { method: 'DELETE' })
        if (!res.ok && res.status !== 404) throw await errorYoutube(res)
      }
      delete datos.subidas[ref]
      guardarDatos()
    },

    async estados() {
      const c = canal.cuenta()
      const suyas = Object.entries(datos.subidas).filter(([, s]) => s.id && s.canal === c?.id)
      if (!suyas.length) return {}
      const vistos = await leer(suyas.map(([, s]) => s.id!))
      const salida: Awaited<ReturnType<NonNullable<ModuloRed['estados']>>> = {}
      for (const [ref, s] of suyas) {
        const v = vistos.get(s.id!)
        if (!v) salida[ref] = { estado: 'error', error: 'Ya no está en YouTube: lo borraron en YouTube Studio.' }
        else if (v.uploadStatus === 'rejected') salida[ref] = { estado: 'error', error: `YouTube lo rechazó (${v.rejectionReason ?? 'sin motivo'}).` }
        else if (v.uploadStatus === 'failed') salida[ref] = { estado: 'error', error: `YouTube no lo pudo procesar (${v.failureReason ?? 'sin motivo'}).` }
        else if (v.privacyStatus === 'public') {
          salida[ref] = { estado: 'publicado' }
          // Ya salió: no se vuelve a mirar ni a mover.
          delete datos.subidas[ref]
        }
      }
      guardarDatos()
      return salida
    },
  }
}
