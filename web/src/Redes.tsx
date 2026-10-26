import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { type AvisoRedes as Aviso, type Borrador, type CalendarioRed as CalendarioRedTipo, type Card, type MarcasDeRedes, NAVEGADOR_REDES, type Publicacion, type Red, type RedesDelEstilo, type RedesEstilo, type RedId, type Ritmo, type TandaRedes, type VideoHecho } from '../../shared/types'
import { api } from './api'
import { encendido, notificar, sonar } from './avisos'
import { Picker } from './Composer'
import { Logo } from './Logos'
import { abrirNavegador, PanelNavegador, useNavegadorAbierto } from './Navegador'
import './Redes.css'

/**
 * Publicar en redes (`server/redes/`): la cuenta y el ritmo de cada red en Opciones, en los videos de cada estilo una
 * barra con los hashtags fijos y «Programar los que faltan», y el estado de cada video en cada red (también en «Mis
 * videos», con su resumen); en la barra lateral, lo que falló; y una notificación cuando acaba lo que mandaste a programar.
 */

const NOMBRE: Record<RedId, string> = { tiktok: 'TikTok', instagram: 'Instagram' }
const DIA = 86400000
const enFecha = (s: string) => new Date(s.replace(' ', 'T')).getTime()
/** `['tiktok', 'instagram']` → `TikTok e Instagram`. */
const nombres = (redes: RedId[]) => redes.map((r) => NOMBRE[r]).join(', ').replace(/, ([^,]+)$/, (_, u: string) => (/^[iI]/.test(u) ? ` e ${u}` : ` y ${u}`))
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
/** `'2026-10-12 16:00'` → `12 oct, 16:00`. */
const corta = (cuando: string) => `${Number(cuando.slice(8, 10))} ${MESES[Number(cuando.slice(5, 7)) - 1]}, ${cuando.slice(11)}`
const limpiarTag = (t: string) => t.replace(/[^\p{L}\p{N}_]/gu, '')
/** Si ya salió: de Instagram lo dice la nube (`publicado`); TikTok no avisa, y pasada su hora se da por publicado. */
const salio = (red: RedId, p: Pick<Publicacion, 'estado' | 'cuando'>, ahora = Date.now()) =>
  p.estado === 'publicado' || (red === 'tiktok' && p.estado === 'programado' && !!p.cuando && enFecha(p.cuando) < ahora)

/**
 * Una sección con el navegador de las redes a la derecha, como el de los hilos, mientras está abierto y `puede`: en Mis
 * videos, lo que sube Sloth; en Opciones, donde inicias sesión.
 */
export function ConNavegadorRedes({ puede = true, children }: { puede?: boolean; children: ReactNode }) {
  const abierto = useNavegadorAbierto(NAVEGADOR_REDES)
  return (
    <div className="session-cuerpo">
      {children}
      {puede && abierto && <PanelNavegador hilo={NAVEGADOR_REDES} trabajando={false} />}
    </div>
  )
}

/**
 * Opciones → Redes: con qué cuenta publica cada red, a qué ritmo, y lo que tiene programado. `onIniciando`: si inicias
 * sesión en el navegador de la app, que Opciones lo enseña.
 */
export function RedesOpciones({ onIniciando }: { onIniciando?(si: boolean): void }) {
  const [redes, setRedes] = useState<Red[] | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [calendario, setCalendario] = useState<CalendarioRedTipo[]>([])
  const [conectando, setConectando] = useState<RedId | null>(null)
  // Dónde se inicia sesión: en el navegador de la app (se abre a la derecha, y el globo de arriba lo esconde) o en una
  // ventana de Edge.
  const [donde, setDonde] = useState<'app' | 'edge' | null>(null)
  /** La cuenta que tenía al empezar a conectar: al cambiar de cuenta en la app, el panel sigue hasta que sea otra. */
  const antes = useRef<string | null>(null)
  const [error, setError] = useState('')
  const ahora = useAhora()

  // Lo programado va después de las redes, que dicen cuáles están conectadas; luego, cada minuto (con la hora): lo que
  // sale o se programa en otro sitio se ve aquí.
  const leerCalendario = () => api<CalendarioRedTipo[]>('/api/redes/calendario').then(setCalendario, () => {})
  useEffect(() => {
    api<Red[]>('/api/redes').then((r) => (setRedes(r), leerCalendario()), (e) => setError(e.message))
  }, [])
  useEffect(() => {
    if (redes) leerCalendario()
  }, [ahora])
  // Lo que falló y ya no está en el disco llega con el aviso de la barra lateral, también por el WebSocket.
  const leerAviso = () => api<Aviso>('/api/redes/aviso').then(setAviso, () => {})
  useEffect(() => {
    leerAviso()
    const oir = (e: Event) => setAviso((e as CustomEvent<Aviso>).detail)
    addEventListener('sloth-redes', oir)
    return () => removeEventListener('sloth-redes', oir)
  }, [])

  // Mientras inicias sesión (en el navegador de la app, o en la ventana de Edge), se mira cada pocos segundos si ya entraste.
  useEffect(() => {
    if (!conectando) return
    const id = setInterval(
      () =>
        api<Red[]>('/api/redes').then((r) => {
          setRedes(r)
          const red = r.find((x) => x.id === conectando)
          if (red?.cuenta && !red.sinSesion && (donde !== 'app' || red.cuenta !== antes.current)) terminar()
        }, () => {}),
      3000
    )
    return () => clearInterval(id)
  }, [conectando, donde])

  const enLaApp = !!conectando && donde === 'app'
  useEffect(() => onIniciando?.(enLaApp), [enLaApp])

  const cambiar = (id: RedId, c: Partial<Red>) => setRedes((rs) => rs?.map((x) => (x.id === id ? { ...x, ...c } : x)) ?? null)

  function conectar(id: RedId) {
    const red = redes?.find((x) => x.id === id)
    antes.current = (!red?.sinSesion && red?.cuenta) || null
    setError('')
    setConectando(id)
    setDonde(null)
    api<{ enLaApp: boolean }>(`/api/redes/${id}/conectar`, {}).then(
      (r) => (setDonde(r.enLaApp ? 'app' : 'edge'), r.enLaApp && abrirNavegador(NAVEGADOR_REDES, true)),
      (e) => (setError(e.message), setConectando(null))
    )
  }

  /** Ya entraste: el panel se cierra y la página de la red queda en blanco, sin gastar nada mientras no publica. */
  function terminar() {
    if (conectando && donde === 'app') api(`/api/redes/${conectando}/soltar`, {}).catch(() => {})
    setConectando(null)
    abrirNavegador(NAVEGADOR_REDES, false)
  }

  if (!redes) return <div className="item fila muted small">{error || 'Mirando…'}</div>
  return (
    <>
      {redes.map((r) => (
        <RedFila
          key={r.id}
          red={r}
          conectando={conectando === r.id ? (donde ?? 'abriendo') : null}
          onConectar={() => conectar(r.id)}
          onCuenta={(cuenta) => cambiar(r.id, { cuenta })}
          onNube={() => cambiar(r.id, { sinNube: undefined })}
          sinVideo={(aviso?.sinVideo ?? []).filter((p) => p.red === r.id)}
          onCambio={leerAviso}
          calendario={calendario.find((c) => c.red === r.id)}
          ahora={ahora}
        />
      ))}
      {error && <p className="bad small fila-extra">{error}</p>}
    </>
  )
}

/** El perfil público de cada red, para «Ver perfil». */
const PERFIL: Record<RedId, (usuario: string) => string> = {
  tiktok: (u) => `https://www.tiktok.com/@${u}`,
  instagram: (u) => `https://www.instagram.com/${u}/`,
}

/**
 * Una red: su logo, el ritmo (fijo) en una línea, la cuenta en un desplegable y, debajo, lo que tiene programado. TikTok
 * se conecta iniciando sesión en el navegador de la app, que se abre a la derecha (fuera de la ventana de Sloth, en Edge); una red con `token` (Instagram), pegando un token de su API, que
 * Sloth prueba antes de guardarlo y renueva solo. Como las llaves, vive en las variables de tu usuario de Windows. Debajo,
 * lo que falló en ella y ya no está en el disco (`sinVideo`): sigue en la nube, y se reintenta o se quita desde aquí.
 */
function RedFila(props: { red: Red; conectando: 'abriendo' | 'app' | 'edge' | null; onConectar(): void; onCuenta(cuenta: string | null): void; onNube(): void; sinVideo: Publicacion[]; onCambio(): void; calendario?: CalendarioRedTipo; ahora: number }) {
  const { red } = props
  const [pegando, setPegando] = useState(false)
  const [token, setToken] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  function guardar(valor: string | null) {
    setOcupado(true)
    setError('')
    api<{ cuenta: string | null }>(`/api/redes/${red.id}/token`, { token: valor })
      .then((r) => (props.onCuenta(r.cuenta), setToken(''), setPegando(false)))
      .catch((e) => setError(e.message))
      .finally(() => setOcupado(false))
  }

  const conectar = () => (red.token ? setPegando(true) : props.onConectar())
  // Un token que caduca: se avisa una semana antes, o si no se sabe cuándo y la renovación está fallando.
  const caduca = red.caduca && new Date(red.caduca).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })
  const vence =
    red.caduca && red.caduca - Date.now() < 7 * DIA
      ? `El token caduca el ${caduca}${red.renovacion ? ` (${red.renovacion})` : ''}. Genera otro y pégalo con «Cambiar de cuenta».`
      : !red.caduca && red.renovacion
        ? `${red.renovacion}. Se vuelve a intentar sola; si sigue fallando, genera otro token y pégalo con «Cambiar de cuenta».`
        : ''
  const opciones = [
    { value: 'perfil', label: 'Ver perfil ↗' },
    { value: 'cambiar', label: 'Cambiar de cuenta' },
    ...(red.token ? [{ value: 'quitar', label: 'Quitar' }] : []),
  ]
  function elegir(que: string) {
    if (que === 'perfil' && red.cuenta) window.open(PERFIL[red.id](red.cuenta.replace(/^@/, '')), '_blank', 'noreferrer')
    if (que === 'cambiar') conectar()
    if (que === 'quitar') guardar(null)
  }

  return (
    <div className="item red">
      <div className="fila">
        <Logo de={red.id} />
        <div className="fila-nombre">
          <strong>{red.nombre}</strong>
          <span title={`Salen a las ${horas(red.ritmo).join(', ')}`}>{resumen(red.ritmo)}</span>
        </div>
        {props.conectando ? (
          <span className="estado moviendo">{red.enEdge ? 'Entra con Google en la ventana de Edge…' : props.conectando === 'app' ? 'Inicia sesión en el navegador…' : props.conectando === 'edge' ? 'Inicia sesión en la ventana de Edge…' : 'Abriendo…'}</span>
        ) : red.cuenta && !red.sinSesion ? (
          <Picker className="acciones" label={<span className="estado">{red.cuenta}</span>} value="" disabled={ocupado} groups={[{ label: 'Cuenta', options: opciones }]} onChange={elegir} />
        ) : (
          !pegando && (
            <button className="primary" onClick={conectar}>
              Conectar
            </button>
          )
        )}
      </div>
      {/* Google no deja entrar dentro de la app: si vas a Google, Sloth abre Edge para ese paso (`server/redes/navegador.ts`). */}
      {props.conectando === 'app' && (
        <p className="muted small fila-extra">
          {red.enEdge
            ? 'Google no deja entrar desde una app. Al terminar en Edge, la ventana se cierra y la sesión pasa sola a Sloth.'
            : `Lo más rápido: «Usar código QR» con la app de ${red.nombre} en tu teléfono. Si entras con Google, se abre Edge para ese paso.`}
        </p>
      )}
      {props.calendario && red.cuenta && !red.sinSesion && (
        <div className="fila-extra">
          <CalendarioRed c={props.calendario} ahora={props.ahora} />
        </div>
      )}
      {red.sinSesion && !props.conectando && (
        <p className="bad small fila-extra">
          Se cerró la sesión{red.cuenta ? ` de ${red.cuenta}` : ''}: conéctala otra vez. Lo que espera en su cola sigue solo.
        </p>
      )}
      {vence && <p className="bad small fila-extra">{vence}</p>}
      {props.sinVideo.length > 0 && (
        <div className="fila-extra">
          <p className="muted small">Su archivo ya no está en el disco, pero el video sigue en la nube: se reintenta o se quita desde aquí.</p>
          {props.sinVideo.map((p) => (
            <div className="sin-video" key={p.ref} title={`${p.ruta}\n${p.texto}`}>
              <span>{p.ruta.split(/[\\/]/).pop()}</span>
              <Insignia p={p} onCambio={props.onCambio} onError={setError} />
            </div>
          ))}
        </div>
      )}
      {pegando && red.sinNube && <MontarNube onLista={props.onNube} onCancelar={() => setPegando(false)} />}
      {pegando && !red.sinNube && (
        <form className="fila-extra" onSubmit={(e) => (e.preventDefault(), token.trim() && guardar(token))}>
          <p className="small">
            <strong>{red.cuenta ? 'Otra cuenta' : 'Paso 2 de 2'} · Tu app de Instagram.</strong> Publicas con tu propia app de Meta: sin revisión de Meta y en
            público, porque es tuya.
          </p>
          <ol className="guia small">
            <li>
              Tu cuenta de Instagram tiene que ser profesional: en Instagram, Configuración → Tipo de cuenta y herramientas → Cambiar a cuenta profesional (de
              creador o de empresa). Es gratis.
            </li>
            <li>
              Entra a{' '}
              <a href="https://developers.facebook.com/apps/creation/" target="_blank" rel="noreferrer">
                developers.facebook.com
              </a>{' '}
              con tu Facebook y crea una app (por ejemplo, «Sloth») con el caso de uso «Administrar mensajes y contenido en Instagram», sin portafolio comercial.
            </li>
            <li>
              En ese caso de uso, abre «Configuración de la API con el inicio de sesión de Instagram» → «Generar tokens de acceso» → «Agregar cuenta», y entra
              con tu Instagram. Si te pide un rol: en Roles de la app, añade tu cuenta como evaluador de Instagram y acepta la invitación en Instagram
              (Configuración → Apps y sitios web).
            </li>
            <li>Pulsa «Generar token», cópialo y pégalo aquí. Sloth lo prueba al momento y lo renueva solo cada día: no caduca.</li>
          </ol>
          <div className="opcion-fila">
            <input type="password" autoFocus placeholder="Pega el token de Instagram" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
            <button className="primary" disabled={ocupado || !token.trim()}>
              {ocupado ? 'Probando…' : 'Guardar'}
            </button>
            <button type="button" className="ghost" onClick={() => (setPegando(false), setToken(''))}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {error && <p className="bad small fila-extra">{error}</p>}
    </div>
  )
}

/**
 * El token de Cloudflare con los dos permisos que pide la nube (Workers y R2) ya marcados: solo queda «Continuar» y
 * «Crear token». Ver https://developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/
 */
const TOKEN_CLOUDFLARE = `https://dash.cloudflare.com/profile/api-tokens?${new URLSearchParams({
  permissionGroupKeys: JSON.stringify([{ key: 'workers_scripts', type: 'edit' }, { key: 'workers_r2', type: 'edit' }]),
  accountId: '*',
  zoneId: 'all',
  name: 'Sloth',
})}`

/**
 * Paso 1 de Instagram: la nube donde esperan los videos hasta su hora, en tu cuenta de Cloudflare. Pegas un token y Sloth
 * la monta (`server/redes/cloudflare.ts`).
 */
function MontarNube(props: { onLista(): void; onCancelar(): void }) {
  const [token, setToken] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  function montar() {
    setOcupado(true)
    setError('')
    api('/api/redes/nube', { token })
      .then(props.onLista)
      .catch((e) => setError(e.message))
      .finally(() => setOcupado(false))
  }
  return (
    <form className="fila-extra" onSubmit={(e) => (e.preventDefault(), token.trim() && montar())}>
      <p className="small">
        <strong>Paso 1 de 2 · Tu nube.</strong> Instagram no programa ni recibe el archivo: baja el video de una dirección pública a su hora. Esa dirección
        es tu nube, en tu cuenta de Cloudflare: publica aunque tu computadora esté apagada, y cada video se borra al salir.
      </p>
      <ol className="guia small">
        <li>
          Crea tu cuenta gratis en{' '}
          <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noreferrer">
            Cloudflare
          </a>{' '}
          y confirma tu correo.
        </li>
        <li>
          Activa{' '}
          <a href="https://dash.cloudflare.com/?to=/:account/r2/overview" target="_blank" rel="noreferrer">
            R2
          </a>
          , donde esperan los videos. Pide una tarjeta, pero no cobra hasta pasar de 10 GB, y Sloth borra cada video al publicarlo.
        </li>
        <li>
          Abre{' '}
          <a href={TOKEN_CLOUDFLARE} target="_blank" rel="noreferrer">
            este enlace
          </a>
          , que ya trae los permisos. Baja hasta «Continuar», pulsa «Crear token» y cópialo.
        </li>
        <li>Pégalo aquí. Sloth monta tu nube en menos de un minuto y la pone al día con cada versión.</li>
      </ol>
      <div className="opcion-fila">
        <input type="password" autoFocus placeholder="Pega el token de Cloudflare" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
        <button className="primary" disabled={ocupado || !token.trim()}>
          {ocupado ? 'Montando…' : 'Montar mi nube'}
        </button>
        <button type="button" className="ghost" onClick={props.onCancelar}>
          Cancelar
        </button>
      </div>
      {error && <p className="bad small">{error}</p>}
    </form>
  )
}

const dos = (n: number) => String(n).padStart(2, '0')

/** A qué hora sale cada video del día. */
function horas(r: Ritmo) {
  const [h, m] = r.desde.split(':').map(Number)
  return Array.from({ length: r.porDia }, (_, i) => {
    const t = h * 60 + m + i * r.cadaMin
    return `${dos(Math.floor(t / 60) % 24)}:${dos(t % 60)}`
  })
}

/** `5 al día, de 12:00 a 16:00`. */
function resumen(r: Ritmo) {
  const hs = horas(r)
  return r.porDia === 1 ? `1 al día, a las ${hs[0]}` : `${r.porDia} al día, de ${hs[0]} a ${hs[hs.length - 1]}`
}

/**
 * Lo de redes en los videos de un estilo: la barra que va encima y el estado de cada video. Con `card` en `null` no hace
 * nada (no se está viendo un estilo).
 */
export function usePublicar(card: Card | null, videos: VideoHecho[] | null): { barra: ReactNode; insignia(ruta: string): ReactNode } {
  const [estado, setEstado] = useState<RedesEstilo | null>(null)
  const [revisar, setRevisar] = useState<VideoHecho[] | null>(null)
  const [error, setError] = useState('')

  const leer = () => card && api<RedesEstilo>(`/api/redes/estilos/${card.id}`).then(setEstado, (e) => setError(e.message))
  useEffect(() => {
    setEstado(null)
    setError('')
    leer()
  }, [card?.id, videos?.length])
  // Cada cambio en lo programado (subir, programar, fallar) llega por el WebSocket: entonces se vuelve a mirar.
  useEffect(() => {
    if (!card) return
    addEventListener('sloth-redes', leer)
    return () => removeEventListener('sloth-redes', leer)
  }, [card?.id])

  if (!card || !videos) return { barra: null, insignia: () => null }
  const verticales = new Set(estado?.verticales)
  const conectadas = estado?.redes ?? []
  // Falta el que no está en alguna de las redes conectadas.
  const faltan = videos.filter((v) => verticales.has(v.ruta) && conectadas.some((r) => !estado?.publicaciones[v.ruta]?.some((p) => p.red === r)))
  const a = estado?.ajustes

  function cambiar(c: Partial<RedesDelEstilo>) {
    api<RedesDelEstilo>(`/api/redes/estilos/${card!.id}`, c).then((ajustes) => setEstado((e) => e && { ...e, ajustes }), (e) => setError(e.message))
  }

  const barra = (
    <div className="publicar">
      {!estado || !a ? (
        <span className="muted small">{error || 'Mirando qué hay en redes…'}</span>
      ) : !conectadas.length ? (
        <span className="muted small">Para programar estos videos en TikTok o Instagram, conecta tu cuenta en ⚙ Opciones → Redes.</span>
      ) : (
        <>
          <div className="publicar-fila">
            <strong>{nombres(conectadas)}</strong>
            <span className="spacer" />
            <button className="primary" disabled={!faltan.length} onClick={() => setRevisar(faltan)}>
              {faltan.length ? `Programar los que faltan (${faltan.length})` : 'No falta ninguno'}
            </button>
          </div>
          <div className="publicar-fila">
            <span className="muted small">Hashtags fijos</span>
            <Tags tags={a.tags} onCambio={(tags) => cambiar({ tags })} placeholder="Añadir…" />
          </div>
          {error && <p className="bad small">{error}</p>}
        </>
      )}
      {revisar && (
        <Programar videos={revisar} redes={conectadas} fijos={a?.tags ?? []} onClose={() => setRevisar(null)} onHecho={() => (setRevisar(null), leer())} />
      )}
    </div>
  )

  const insignia = (ruta: string) => <Marcas marcas={estado} ruta={ruta} onCambio={leer} onError={setError} />
  return { barra, insignia }
}

/**
 * Las marcas de redes de un video vertical, en su tarjeta: una insignia por red con lo que se hizo en ella, y las conectadas
 * donde aún no está. Las usan los videos de cada estilo y «Mis videos».
 */
export function Marcas({ marcas, ruta, onCambio, onError }: { marcas?: MarcasDeRedes | null; ruta: string; onCambio(): void; onError(error: string): void }) {
  if (!marcas?.verticales.includes(ruta)) return null
  const ps = marcas.publicaciones[ruta] ?? []
  if (!ps.length) {
    if (marcas.otraVersion?.includes(ruta))
      return (
        <span className="insignia falta" title="Este archivo cambió después de programarlo, y la versión de antes sigue en la red. Si quieres esta también, va con «Programar los que faltan».">
          Versión nueva, sin programar
        </span>
      )
    return <span className="insignia falta">Sin programar</span>
  }
  return (
    <>
      {estadoEnRedes(marcas, ruta) === 'listos' && (
        <span className="video-listo" title="Listo: no le falta nada en tus redes">
          ✓
        </span>
      )}
      {ps.map((p) => (
        <Insignia key={p.red} p={p} onCambio={onCambio} onError={onError} />
      ))}
      {marcas.redes
        .filter((r) => !ps.some((p) => p.red === r))
        .map((r) => (
          <span className="insignia falta" key={r}>
            Falta en {NOMBRE[r]}
          </span>
        ))}
    </>
  )
}

/**
 * Cómo va un video vertical en las redes conectadas, en una palabra: `listos` (en todas, o descartado donde no), `faltan`
 * (en alguna aún no está), `enCola` (espera o se sube) o `fallaron`. `null` si no es vertical o no hay redes.
 */
export type EstadoRedes = 'listos' | 'faltan' | 'enCola' | 'fallaron'
export function estadoEnRedes(marcas: MarcasDeRedes, ruta: string): EstadoRedes | null {
  if (!marcas.redes.length || !marcas.verticales.includes(ruta)) return null
  const ps = marcas.publicaciones[ruta] ?? []
  if (ps.some((p) => p.estado === 'error')) return 'fallaron'
  if (ps.some((p) => p.estado === 'cola' || p.estado === 'subiendo')) return 'enCola'
  return marcas.redes.every((r) => ps.some((p) => p.red === r)) ? 'listos' : 'faltan'
}

const ESTADOS: { id: EstadoRedes; uno: string; varios: string }[] = [
  { id: 'fallaron', uno: 'falló', varios: 'fallaron' },
  { id: 'faltan', uno: 'falta', varios: 'faltan' },
  { id: 'enCola', uno: 'en cola', varios: 'en cola' },
  { id: 'listos', uno: 'listo', varios: 'listos' },
]

/**
 * En «Mis videos», arriba de la rejilla: cómo van en redes los verticales que se ven. Si no falta nada, lo dice en verde;
 * si no, cuántos hay en cada estado, y cada uno filtra la rejilla (`estado`). Lo que falta se programa desde aquí, de
 * todos los estilos que se ven o de uno (el filtro de arriba), y en la revisión se eligen cuáles van ahora.
 */
export function ResumenRedes(props: { marcas?: MarcasDeRedes; videos: VideoHecho[]; estado: EstadoRedes | null; onEstado(e: EstadoRedes | null): void; onCambio(): void }) {
  const { marcas, videos } = props
  const [revisar, setRevisar] = useState<VideoHecho[] | null>(null)
  if (!marcas) return null
  const de = new Map(videos.map((v) => [v.ruta, estadoEnRedes(marcas, v.ruta)]))
  const cuenta = (e: EstadoRedes) => [...de.values()].filter((x) => x === e).length
  const total = [...de.values()].filter(Boolean).length
  if (!total) return null

  if (cuenta('listos') === total) {
    // La hora del último que aún no sale.
    const cuandos = videos.flatMap((v) => (marcas.publicaciones[v.ruta] ?? []).filter((p) => p.estado === 'programado' && p.cuando).map((p) => p.cuando!))
    const ultimo = cuandos.sort().pop()
    return (
      <div className="resumen-redes todo-bien">
        <span className="resumen-check">✓</span>
        <span>
          <strong>Todo programado.</strong> {total === 1 ? 'El vertical ya está' : `Los ${total} verticales ya están`} en {nombres(marcas.redes)}
          {ultimo ? `; el último sale el ${corta(ultimo)}.` : ', y ya salieron.'}
        </span>
      </div>
    )
  }

  const faltan = videos.filter((v) => de.get(v.ruta) === 'faltan')
  return (
    <section className="resumen-redes lote">
      <strong>{nombres(marcas.redes)}</strong>
      <span className="muted small">Verticales ·</span>
      {ESTADOS.map(({ id, uno, varios }) => {
        const n = cuenta(id)
        if (!n) return null
        const on = props.estado === id
        return (
          <button key={id} className={`resumen-estado ${id}${on ? ' on' : ''}`} title={on ? 'Ver todos' : 'Ver solo estos'} onClick={() => props.onEstado(on ? null : id)}>
            {n} {n === 1 ? uno : varios}
          </button>
        )
      })}
      {cuenta('enCola') > 0 && <span className="muted small">Los de la cola los sube Sloth solo.</span>}
      {faltan.length > 0 && (
        <button className="primary" title="Eliges cuáles van ahora; cada uno, al siguiente hueco libre" onClick={() => setRevisar(faltan)}>
          Revisar y programar ({faltan.length})
        </button>
      )}
      {revisar && <Programar videos={revisar} redes={marcas.redes} onClose={() => setRevisar(null)} onHecho={() => (setRevisar(null), props.onCambio())} />}
    </section>
  )
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
/** `'2026-10-16'` → `16 oct`. */
const diaCorto = (dia: string) => `${Number(dia.slice(8, 10))} ${MESES[Number(dia.slice(5, 7)) - 1]}`

/** La hora, cada minuto: lo que ya salió se mira otra vez. */
function useAhora() {
  const [ahora, setAhora] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])
  return ahora
}

/**
 * En «Mis videos»: el calendario de cada red, de hoy al último día con algo. Cada día lleva un punto por hueco del ritmo:
 * relleno si ya salió, con borde verde si espera su hora y ámbar si está libre. Dice cuántos salieron hoy, hasta cuándo
 * hay videos y dónde cae el siguiente que programes (el primer hueco libre). Cada minuto mira otra vez qué salió.
 */
export function CalendarioRedes({ marcas }: { marcas?: MarcasDeRedes }) {
  const ahora = useAhora()
  if (!marcas?.calendario?.length) return null
  return (
    <div className="calendario-redes">
      {marcas.calendario.map((c) => (
        <CalendarioRed key={c.red} c={c} ahora={ahora} logo />
      ))}
    </div>
  )
}

/** El calendario de una red: con `logo`, el de la red delante (en Opciones ya va en su fila). */
function CalendarioRed({ c, ahora, logo }: { c: CalendarioRedTipo; ahora: number; logo?: boolean }) {
  const hoy = new Date(ahora).toLocaleDateString('sv')
  const ultimo = c.dias.at(-1)?.dia
  const sinHuecos = !ultimo || c.siguiente.slice(0, 10) > ultimo
  const deHoy = c.dias.find((d) => d.dia === hoy)?.videos ?? []
  const salieron = deHoy.filter((v) => salio(c.red, v, ahora)).length
  return (
    <div className="calendario-red">
      {logo && <Logo de={c.red} chico />}
      {c.dias.length > 0 && (
        <div className="calendario-dias">
          {c.dias.map(({ dia, videos = [] }) => {
            const ya = videos.map((v) => salio(c.red, v, ahora))
            const horas = videos.map((v, i) => `
${v.cuando.slice(11)} · ${ya[i] ? 'salió' : 'programado'}`).join('')
            return (
              <span key={dia} className={`calendario-dia${videos.length >= c.porDia ? ' lleno' : ''}`} title={`${diaCorto(dia)}: ${videos.length} de ${c.porDia}${horas}`}>
                <span>{dia === hoy ? 'hoy' : `${DIAS[new Date(`${dia}T12:00`).getDay()]} ${Number(dia.slice(8))}`}</span>
                <span className="puntos">
                  {Array.from({ length: Math.max(c.porDia, videos.length) }, (_, i) => (
                    <i key={i} className={ya[i] ? 'salio' : i < videos.length ? 'si' : ''} />
                  ))}
                </span>
              </span>
            )
          })}
        </div>
      )}
      <span className="calendario-texto">
        {logo && (
          <>
            <strong>{NOMBRE[c.red]}</strong>:{' '}
          </>
        )}
        {deHoy.length > 0 && (
          <span className="calendario-hoy">
            hoy {salieron === deHoy.length ? (deHoy.length === 1 ? 'ya salió' : `ya salieron los ${deHoy.length}`) : `salieron ${salieron} de ${deHoy.length}`}.
          </span>
        )}{' '}
        {!ultimo ? (
          <>nada programado. El siguiente sale el {corta(c.siguiente)}.</>
        ) : sinHuecos ? (
          <>
            {c.porDia} al día hasta el <strong>{diaCorto(ultimo)}</strong>. El siguiente sale el {corta(c.siguiente)}.
          </>
        ) : (
          <>
            primer hueco el <strong className="hueco">{corta(c.siguiente)}</strong>, ahí va el siguiente. Hay videos hasta el {diaCorto(ultimo)}.
          </>
        )}
      </span>
    </div>
  )
}

/** Los videos de un estilo, con su barra de redes. Si ya estaba ahí (y volviste a «Todos los estilos»), el hash no cambia: se avisa igual. */
function irAVideos(cardId: string) {
  const hash = `#/new/${cardId}/videos`
  if (location.hash === hash) dispatchEvent(new HashChangeEvent('hashchange'))
  else location.hash = hash
}

/**
 * Acabó lo que mandaste a programar: una notificación de Windows y el tono, con cómo quedó. Al pulsarla abre «Mis
 * videos», donde se ve cada uno.
 */
export function avisarTanda({ bien, fallaron, esperan, redes }: TandaRedes) {
  const videos = (n: number) => (n === 1 ? '1 video' : `${n} videos`)
  const todoBien = !fallaron && !esperan
  const partes = [
    bien && (todoBien ? `${bien === 1 ? 'El video quedó programado' : `Los ${bien} videos quedaron programados`} en ${nombres(redes)}. Todo bien.` : `${videos(bien)} ya en ${nombres(redes)}.`),
    fallaron && `${fallaron === 1 ? '1 falló' : `${fallaron} fallaron`}: en «Mis videos» está «Reintentar».`,
    esperan &&
      (esperan === 1
        ? '1 sigue en la cola: sale solo cuando entre en el calendario de su red, o al volver a conectarla.'
        : `${esperan} siguen en la cola: salen solos cuando entren en el calendario de su red, o al volver a conectarla.`),
  ].filter(Boolean)
  if (encendido('sonido')) sonar()
  void notificar({ titulo: todoBien ? 'Redes: todo programado ✓' : 'Redes: terminó de programar', cuerpo: partes.join(' '), abre: 'mis-videos', ids: [] }, () => (location.hash = '/mis-videos'))
}

/**
 * El estado de un video vertical en una red. Va dentro del botón del video: sus acciones no lo abren. Si una falla (quitar
 * de la nube, por ejemplo), el error sale en la barra de arriba (en Opciones, bajo su red).
 */
function Insignia({ p, onCambio, onError }: { p: Publicacion; onCambio(): void; onError(error: string): void }) {
  const accion = (que: 'reintentar' | 'quitar' | 'deshacer') => (e: MouseEvent) => {
    e.stopPropagation()
    onError('')
    api(`/api/redes/${que}`, { ruta: p.ruta, red: p.red, ref: p.ref }).then(onCambio, (err) => onError(err.message))
  }
  // Lo que se veía en la página de la red cuando falló.
  const captura = (e: MouseEvent) => (e.stopPropagation(), window.open(`/api/redes/fallos/${p.captura}`, '_blank'))
  const red = NOMBRE[p.red]
  // Lo que espera o falló se puede descartar: queda «Descartado», y «Programar los que faltan» no lo vuelve a proponer.
  const descartar = (
    <span role="button" title={`Descartar: no se sube a ${red}, y «Programar los que faltan» no lo vuelve a proponer`} onClick={accion('quitar')}>
      ✕
    </span>
  )
  if (p.estado === 'subiendo') return <span className="insignia moviendo">Subiendo a {red}…</span>
  if (p.estado === 'cola')
    return (
      <span className="insignia moviendo" title={p.texto}>
        {red}, en cola{p.cuando && ` · ${corta(p.cuando)}`}
        {descartar}
      </span>
    )
  if (p.estado === 'error')
    return (
      <span className="insignia mal" title={p.error}>
        Falló en {red}
        {p.captura && (
          <span role="button" title="Lo que se veía en la página al fallar" onClick={captura}>
            Ver
          </span>
        )}
        <span role="button" title={`${p.error}\nVolver a intentarlo`} onClick={accion('reintentar')}>
          Reintentar
        </span>
        {descartar}
      </span>
    )
  if (p.estado === 'descartado')
    return (
      <span className="insignia" title={`Lo descartaste: no se sube a ${red}.`}>
        Descartado en {red}
        <span role="button" title={`Vuelve a faltar en ${red}: va con «Programar los que faltan»`} onClick={accion('deshacer')}>
          Deshacer
        </span>
      </span>
    )
  const ya = salio(p.red, p)
  return (
    <span className="insignia hecho" title={`${p.cuando ? `${ya ? 'Salió' : 'Sale'} el ${corta(p.cuando)}\n` : ''}${p.texto} ${p.tags.map((t) => '#' + t).join(' ')}`}>
      {red} · {ya || !p.cuando ? 'publicado' : corta(p.cuando)}
    </span>
  )
}

/**
 * En la barra lateral, junto a Opciones: lo que falló en redes y las redes que cerraron la sesión, cada cosa con un enlace
 * a donde se arregla. Se entera por el WebSocket (`sloth-redes`), y lo vuelve a pedir al reconectar.
 */
export function AvisoRedes({ connected }: { connected: boolean }) {
  const [aviso, setAviso] = useState<Aviso | null>(null)
  useEffect(() => {
    if (connected) api<Aviso>('/api/redes/aviso').then(setAviso, () => {})
  }, [connected])
  useEffect(() => {
    const oir = (e: Event) => setAviso((e as CustomEvent<Aviso>).detail)
    addEventListener('sloth-redes', oir)
    return () => removeEventListener('sloth-redes', oir)
  }, [])
  if (!aviso) return null
  const opciones = () => (location.hash = '/opciones')
  // Lo que falló y ya no está en el disco no sale en la galería: se arregla en Opciones → Redes.
  const sinVideo = (aviso.sinVideo ?? []).filter((p) => p.estado === 'error').length
  return (
    <>
      {aviso.roto && (
        <div className="aviso-redes" title={aviso.roto}>
          <span>Redes en pausa: redes.json dañado</span>
        </div>
      )}
      {aviso.sinSesion.map((r) => (
        <button key={r} className="aviso-redes" title="Conéctala otra vez en Opciones → Redes. Lo que espera en su cola sigue solo." onClick={opciones}>
          <span>{NOMBRE[r]}: se cerró la sesión</span>
        </button>
      ))}
      {aviso.fallos.map((f) => (
        <button key={f.cardId} className="aviso-redes" title={`En los videos de ${f.titulo} está qué falló y «Reintentar»`} onClick={() => irAVideos(f.cardId)}>
          <span>
            {f.n} {f.n === 1 ? 'falló' : 'fallaron'} en redes · {f.titulo}
          </span>
        </button>
      ))}
      {sinVideo > 0 && (
        <button className="aviso-redes" title="Su archivo ya no está en el disco, pero el video sigue en la nube: en Opciones → Redes está qué falló, «Reintentar» y la ✕" onClick={opciones}>
          <span>
            {sinVideo} {sinVideo === 1 ? 'falló' : 'fallaron'} en redes · sin archivo
          </span>
        </button>
      )}
    </>
  )
}

/** Hashtags como fichas: se quitan con ✕ y se añaden escribiendo (Enter, coma o espacio). */
function Tags({ tags, onCambio, placeholder }: { tags: string[]; onCambio(t: string[]): void; placeholder: string }) {
  const [nuevo, setNuevo] = useState('')
  function agregar() {
    const t = limpiarTag(nuevo)
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) onCambio([...tags, t])
    setNuevo('')
  }
  return (
    <span className="tags">
      {tags.map((t) => (
        <span className="tag" key={t}>
          #{t}
          <button title="Quitar" onClick={() => onCambio(tags.filter((x) => x !== t))}>
            ✕
          </button>
        </span>
      ))}
      <input
        value={nuevo}
        placeholder={placeholder}
        onChange={(e) => setNuevo(e.target.value)}
        onBlur={agregar}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === ' ') (e.preventDefault(), agregar())
          else if (e.key === 'Backspace' && !nuevo && tags.length) onCambio(tags.slice(0, -1))
        }}
      />
    </span>
  )
}

type Fila = { video: VideoHecho; incluir: boolean; borrador?: Borrador; error?: string }

/**
 * Los que faltan, con el texto que propone Claude para cada uno (o el que ya lleva en otra red): se eligen los que van
 * ahora (los demás siguen faltando, para otra vez), se cambia el texto, se quitan o añaden hashtags, y se programa en
 * cada red conectada donde aún no está. Pueden ser de varios estilos («Mis videos»). Claude solo escribe los marcados.
 */
function Programar({ videos, redes, fijos = [], onClose, onHecho }: { videos: VideoHecho[]; redes: RedId[]; fijos?: string[]; onClose(): void; onHecho(): void }) {
  const [filas, setFilas] = useState<Fila[]>(videos.map((video) => ({ video, incluir: true })))
  const [escribiendo, setEscribiendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const marcados = filas.filter((f) => f.incluir)
  const listos = marcados.filter((f) => f.borrador).length
  const elegidos = marcados.filter((f) => f.borrador?.texto.trim())
  const todos = marcados.length === filas.filter((f) => !f.error).length

  // Claude escribe de tres en tres, del mismo estilo, solo los marcados; cada texto aparece en cuanto llega.
  const vivo = useRef(true)
  useEffect(() => () => void (vivo.current = false), [])
  useEffect(() => {
    const pendientes = filas.filter((f) => f.incluir && !f.borrador && !f.error)
    if (escribiendo || !pendientes.length) return
    const cardId = pendientes[0].video.cardId
    const rutas = pendientes.filter((f) => f.video.cardId === cardId).slice(0, 3).map((f) => f.video.ruta)
    setEscribiendo(true)
    api<(Borrador | { ruta: string; error: string })[]>('/api/redes/borradores', { cardId, rutas })
      .catch((e) => rutas.map((ruta) => ({ ruta, error: e.message as string })))
      .then((salida) => {
        if (!vivo.current) return
        setFilas((fs) => fs.map((f) => {
          const b = salida.find((x) => x.ruta === f.video.ruta)
          return !b ? f : 'error' in b ? { ...f, error: b.error, incluir: false } : { ...f, borrador: b }
        }))
        setEscribiendo(false)
      })
  }, [filas, escribiendo])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const cambiar = (ruta: string, c: Partial<Fila> | Partial<Borrador>) =>
    setFilas((fs) => fs.map((f) => (f.video.ruta !== ruta ? f : 'incluir' in c ? { ...f, ...c } : { ...f, borrador: { ...f.borrador!, ...(c as Partial<Borrador>) } })))

  // Uno por estilo: el servidor comprueba que cada video sea del suyo.
  function programar() {
    setEnviando(true)
    setError('')
    const porEstilo = new Map<string, Borrador[]>()
    for (const f of elegidos) porEstilo.set(f.video.cardId, [...(porEstilo.get(f.video.cardId) ?? []), f.borrador!])
    Promise.all([...porEstilo].map(([cardId, borradores]) => api('/api/redes/programar', { cardId, borradores }))).then(onHecho, (e) => (setError(e.message), setEnviando(false)))
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal programar" onClick={(e) => e.stopPropagation()}>
        <h2>Programar en {nombres(redes)}</h2>
        <p className="modal-body">
          {listos < marcados.length ? `Claude está escribiendo los textos… ${listos} de ${marcados.length}. ` : 'Cambia lo que quieras. '}
          Marca solo los que quieras subir ahora: los demás siguen esperando. Cada uno va en el siguiente hueco libre del calendario de cada red (el ritmo está en ⚙
          Opciones → Redes). Si un video ya va a otra red, lleva su mismo texto.
          {fijos.length > 0 && ` Los hashtags fijos del estilo ya van puestos.`}
        </p>
        <label className="programar-todos">
          <input type="checkbox" checked={todos} onChange={(e) => setFilas((fs) => fs.map((f) => (f.error ? f : { ...f, incluir: e.target.checked })))} />
          <span>
            {marcados.length} de {filas.length} marcados
          </span>
        </label>
        <div className="programar-lista">
          {filas.map((f) => (
            <div className={`programar-fila ${f.incluir ? '' : 'fuera'}`} key={f.video.ruta}>
              <video src={f.video.src} poster={`${f.video.src}&cuadro`} muted preload="none" onMouseEnter={(e) => e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => e.currentTarget.pause()} />
              <div className="programar-texto">
                <label className="programar-nombre">
                  <input type="checkbox" checked={f.incluir} disabled={!!f.error} onChange={(e) => cambiar(f.video.ruta, { incluir: e.target.checked })} />
                  <span>{f.video.titulo}</span>
                  <span className="muted">{f.video.archivo.split('/').pop()}</span>
                </label>
                {f.error ? (
                  <p className="bad small">{f.error}</p>
                ) : !f.borrador ? (
                  <p className="muted small">{f.incluir ? 'Escribiendo…' : 'Márcalo y Claude escribe su texto.'}</p>
                ) : (
                  <>
                    <textarea rows={3} value={f.borrador.texto} onChange={(e) => cambiar(f.video.ruta, { texto: e.target.value })} />
                    <Tags tags={f.borrador.tags} onCambio={(tags) => cambiar(f.video.ruta, { tags })} placeholder="Añadir hashtag…" />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        {error && <p className="bad small">{error}</p>}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={enviando || !elegidos.length} onClick={programar}>
            {enviando ? 'Programando…' : `Programar ${elegidos.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}
