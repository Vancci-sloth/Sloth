/**
 * La interfaz abierta desde la web (ADR 0025, `server/web.ts`): la misma de la ventana de Sloth, por el túnel. Se importa
 * antes que todo lo demás (`main.tsx`), porque cambia lo que el navegador guarda antes de que nadie lo lea.
 *
 * - `enLaWeb`: si esta página llegó por la web y no en la ventana de Sloth ni en `localhost`.
 * - Lo que se guarda en `localStorage` sube a la computadora (`/api/web/guardado`): la dirección del túnel cambia cada
 *   vez que se abre, y con ella lo guardado; la página de entrada lo pone de vuelta. La ventana de la computadora sube
 *   lo suyo también, y cada dispositivo empieza con eso: los avisos ya leídos allá no salen otra vez.
 * - `abrirRuta`: un archivo se señala en el Explorador o el Finder de la computadora, como en la ventana; desde la web,
 *   además, se baja al dispositivo.
 * - `entrada()`: adónde volver a entrar si se pierde la conexión (`ConexionWeb.tsx`).
 * - `enLaNube`: Sloth corre en un Codespace de GitHub (ADR 0026), no en una computadora de quien la usa: no hay
 *   Explorador que abrir ni túnel; lo que se abre o se descarga se baja a este dispositivo.
 */
import { enlaceEntrada, esDeLaWeb, TUNEL, type EstadoWeb } from '../../shared/web'
import { api } from './api'

export const enLaWeb = esDeLaWeb(location)
/** En la nube: por la web y no por un túnel a una computadora (`server/nube.ts`). */
export const enLaNube = enLaWeb && !TUNEL.test(location.origin)
/** Dónde corre esta Sloth, para los textos de la web: la computadora de quien la usa o su Sloth en la nube. */
export const ALLA = enLaNube ? 'tu Sloth en la nube' : 'tu computadora'

/** El id de esta computadora ante el cobro, para volver a entrar. Se pregunta al abrir. */
let equipo = ''
export const estadoWeb: Promise<EstadoWeb | null> = enLaWeb && !enLaNube
  ? api<EstadoWeb>('/api/web').then(
      (e) => ((equipo = e.equipo), e),
      () => null
    )
  : Promise.resolve(null)

/** La entrada del cobro, que manda a la dirección de ahora y vuelve a esta misma vista. */
export const entrada = () => `${enlaceEntrada(equipo)}${location.hash.startsWith('#/') ? `#h=${encodeURIComponent(location.hash)}` : ''}`

// En la nube la dirección no cambia: lo guardado se queda en cada navegador, como en cualquier página.
if (!enLaNube) guardarEnLaComputadora()

// En la nube, tocar o teclear aquí le dice a Sloth que la usas, y ella a GitHub, que si no la detiene (server/nube.ts,
// el latido). Uno por minuto basta.
if (enLaNube) {
  let avisado = 0
  const aqui = () => {
    if (Date.now() - avisado < 60_000) return
    avisado = Date.now()
    void fetch('/api/nube/latido', { method: 'POST' }).catch(() => {})
  }
  for (const e of ['pointerdown', 'keydown', 'wheel']) addEventListener(e, aqui, { capture: true, passive: true })
}

function guardarEnLaComputadora() {
  const ls = window.localStorage
  let reloj: ReturnType<typeof setTimeout> | undefined
  let cambiado = false
  const subir = (alSalir = false) => {
    clearTimeout(reloj)
    if (!cambiado) return
    cambiado = false
    let cuerpo: string
    try {
      cuerpo = JSON.stringify(Object.fromEntries(Object.keys(ls).map((k) => [k, ls.getItem(k)])))
    } catch {
      return
    }
    // Al cerrar la página solo llega lo que cabe en un `keepalive` (64 KB); lo demás ya subió con su espera.
    if (alSalir && cuerpo.length > 60_000) return
    void fetch('/api/web/guardado', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: cuerpo, keepalive: alSalir }).catch(() => (cambiado = true))
  }
  const pronto = () => {
    cambiado = true
    clearTimeout(reloj)
    reloj = setTimeout(subir, 2000)
  }
  const proto = Storage.prototype
  for (const m of ['setItem', 'removeItem', 'clear'] as const) {
    const original = proto[m] as (...a: unknown[]) => unknown
    proto[m] = function (this: Storage, ...a: unknown[]) {
      const r = original.apply(this, a)
      if (this === ls) pronto()
      return r
    } as never
  }
  // La ventana de la computadora sube lo suyo al abrir: es con lo que empieza cada dispositivo nuevo.
  if (!enLaWeb) setTimeout(pronto, 5000)
  addEventListener('pagehide', () => subir(true))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && subir(true))
}

/**
 * Abre un archivo de la computadora: señalado en su Explorador o su Finder, igual desde la ventana que desde la web. Desde
 * la web, además, un archivo (no una carpeta) se baja al dispositivo que se está usando; `bajar: false` si ya se bajó
 * (el «Mostrar» de lo recién descargado en Mis videos). En la nube no hay Explorador que ver: solo se baja, y una
 * carpeta dice por qué no.
 */
export async function abrirRuta(ruta: string, sessionId?: string, o: { bajar?: boolean } = {}): Promise<void> {
  if (!enLaNube) await api('/api/open', { path: ruta, sessionId })
  if (!enLaWeb || o.bajar === false) return
  const q = new URLSearchParams({ ruta, ...(sessionId ? { sesion: sessionId } : {}) })
  const r = await fetch(`/api/web/archivo?${q}&mirar=1`)
  if (r.ok) bajar(`/api/web/archivo?${q}`)
  else if (enLaNube) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'No se pudo bajar.')
}

/** Lo que se sube de una vez: Cloudflare no deja pasar una petición de más de 100 MB. */
const DE_UNA_VEZ = 90 * 1024 * 1024
const TROZO = 50 * 1024 * 1024

/**
 * Sube un archivo a `/api/upload?…` (con su `name` y lo demás ya puestos). Desde la web, uno grande va por trozos, que
 * el servidor junta; la respuesta es la del último, la misma que la de una subida entera.
 */
export async function subir(ruta: string, archivo: Blob): Promise<Response> {
  if (!enLaWeb || archivo.size <= DE_UNA_VEZ) return fetch(ruta, { method: 'POST', body: archivo })
  const id = crypto.randomUUID()
  const partes = Math.ceil(archivo.size / TROZO)
  let r: Response | undefined
  for (let i = 0; i < partes; i++) {
    r = await fetch(`${ruta}&subida=${id}&desde=${i * TROZO}${i === partes - 1 ? '&fin' : ''}`, { method: 'POST', body: archivo.slice(i * TROZO, (i + 1) * TROZO) })
    if (!r.ok) return r
  }
  return r!
}

/** Baja un archivo de la computadora a este dispositivo. */
export function bajar(href: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = ''
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
}
