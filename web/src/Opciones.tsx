import { type ReactNode, useEffect, useState } from 'react'
import { type CuentaClaude as Cuenta, type Opciones as Datos, type LimitesClaude, NAVEGADOR_REDES, type Requisito, type VersionClaude } from '../../shared/types'
import { api } from './api'
import { proveedorDe } from '../../shared/providers'
import { encender, encendido, notificar, sonar, usePermiso } from './avisos'
import { abrirBienvenida } from './Bienvenida'
import { Picker } from './Composer'
import { EspacioDisco } from './Espacio' // espacio en disco
import { TuEquipo } from './Equipo' // tu equipo
import { Icono } from './Iconos'
import { SuscripcionOpciones } from './Licencia' // apoyo
import { Logo } from './Logos'
import { BotonNavegador } from './Navegador'
import { RadarOpciones } from './RadarOpciones' // radar
import { ConNavegadorRedes, RedesOpciones } from './Redes' // redes
import { YoutubeOpciones } from './Youtube'
import { VENTA } from '../../shared/venta'
import './Opciones.css'

/**
 * Opciones: una lista de ajustes por grupos. Cada fila es una cosa: su logo, su nombre y debajo lo que es o cómo está
 * puesta (a veces se abre para cambiarla); a la derecha su estado, verde si está bien, ámbar si te toca hacer algo, y
 * lo que se puede hacer con ella, en un botón o en un desplegable.
 */
export function Opciones({ onDone }: { onDone(): void }) {
  const [iniciando, setIniciando] = useState(false)
  // A la derecha, como en los hilos, el navegador de las redes mientras inicias sesión en él: se abre solo al conectar
  // TikTok, y el globo del título lo enseña o lo esconde.
  return (
    <ConNavegadorRedes puede={iniciando}>
      <Ajustes onDone={onDone} iniciando={iniciando} onIniciando={setIniciando} />
    </ConNavegadorRedes>
  )
}

function Ajustes({ onDone, iniciando, onIniciando }: { onDone(): void; iniciando: boolean; onIniciando(si: boolean): void }) {
  const req = useRequisitos(true)
  return (
    <div className="opciones">
      <button className="ghost" onClick={onDone}>
        ← Volver
      </button>
      <div className="opciones-titulo">
        <h1>Opciones</h1>
        <div className="opciones-titulo-acciones">
          <button className="ghost small" onClick={abrirBienvenida}>
            Ver la bienvenida
          </button>
          {iniciando && <BotonNavegador hilo={NAVEGADOR_REDES} trabajando={false} />}
        </div>
      </div>
      {/* Las redes, lo primero: es por donde salen los videos. Cada quien las conecta con sus propias credenciales. */}
      <section className="grupo redes-grupo">
        <div className="redes-cabeza">
          <div>
            <h2>Redes</h2>
            <p>Por donde salen tus videos. Sloth los programa en cada red y te avisa si algo falla.</p>
          </div>
          <a className="boton" href="#/mis-videos" title="Revisa y programa los que faltan, de todos los estilos">
            Programar videos
          </a>
        </div>
        <div className="panel">
          <RedesOpciones onIniciando={onIniciando} />
          <YoutubeOpciones />
        </div>
        <p className="grupo-nota">Los verticales salen en TikTok e Instagram; los largos, en YouTube. Sloth tiene que estar abierto mientras sube a TikTok y a YouTube; Instagram publica aunque la computadora esté apagada.</p>
      </section>
      {VENTA && (
        <Grupo titulo="Apoyo" nota="Sloth es gratis. El apoyo es opcional y se cobra con Mercado Pago; cancelado, lo ya pagado sigue valiendo hasta su fecha.">
          <SuscripcionOpciones />
        </Grupo>
      )}
      <Grupo titulo="Agentes">
        <Agentes />
        <CuentaCodex />
      </Grupo>
      {/* Solo sirven a Ideas: sin la de YouTube, las recomendaciones van con el canal conectado. */}
      {!VENTA && (
        <Grupo titulo="Llaves de API">
          <Llave id="youtube" />
          <Llave id="meta" />
        </Grupo>
      )}
      <Grupo titulo="Radar" nota="El Diff investiga aquí primero: el radar lee estas fuentes cada 5 minutos y guarda sus noticias, así cada noticiero sale con lo último.">
        <RadarOpciones />
      </Grupo>
      <Grupo titulo="Avisos">
        <Avisos />
      </Grupo>
      <TuEquipo />
      <EspacioDisco />
      <Herramientas req={req} />
    </div>
  )
}

function Grupo({ titulo, extra, nota, children }: { titulo: string; extra?: ReactNode; nota?: string; children: ReactNode }) {
  return (
    <section className="grupo">
      <div className="grupo-titulo">
        <h2>{titulo}</h2>
        {extra}
      </div>
      <div className="panel">{children}</div>
      {nota && <p className="grupo-nota">{nota}</p>}
    </section>
  )
}

/** Las llaves de API que usa Sloth: para qué es cada una y dónde se saca. `logo`, si no es el de su id. */
const LLAVES: Record<'youtube' | 'meta', { nombre: string; para: string; url: string; logo?: string; ayuda: ReactNode }> = {
  youtube: {
    nombre: 'YouTube',
    para: 'Opcional. En Ideas, la fecha y los comentarios de todos los outliers, en segundos',
    url: 'https://console.cloud.google.com/apis/credentials',
    ayuda: (
      <>
        Es gratis: en{' '}
        <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">
          Google Cloud
        </a>{' '}
        activa «YouTube Data API v3» y crea una llave en Credenciales. Sin ella, Ideas saca las fechas solo de los 30 mejores outliers, uno por uno.
        Para subir videos, conecta tu canal en Redes → YouTube; esta llave solo consulta.
      </>
    )
  },
  // No es el token de la nube, que publica: este lee, con inicio de sesión con Facebook.
  meta: {
    nombre: 'Instagram (Meta)',
    para: 'Opcional. En Ideas, los Reels de otras cuentas y los tuyos, con sus vistas',
    url: 'https://developers.facebook.com/tools/debug/accesstoken/',
    logo: 'instagram',
    ayuda: (
      <>
        Es un token de la API de Meta, distinto del que publica:
        <br />
        1. Vincula una Página de Facebook a tu cuenta de Instagram, que tiene que ser profesional (en Instagram: Editar perfil → Página).
        <br />
        2. En{' '}
        <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">
          developers.facebook.com
        </a>
        , en tu app de Meta, añade «Inicio de sesión con Facebook».
        <br />
        3. En el{' '}
        <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">
          Graph API Explorer
        </a>
        , elige tu app, marca instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement y business_management, y pulsa «Generate Access Token».
        <br />
        4. Alárgalo a 60 días en el{' '}
        <a href="https://developers.facebook.com/tools/debug/accesstoken/" target="_blank" rel="noreferrer">
          depurador de tokens
        </a>{' '}
        («Extend Access Token») y pégalo aquí.
        <br />
      </>
    )
  }
}

/** Una llave de API. La app no trae ninguna: cada computadora pone la suya, y se prueba antes de guardarla. */
function Llave({ id }: { id: keyof typeof LLAVES }) {
  const l = LLAVES[id]
  const [datos, setDatos] = useState<Datos | null>(null)
  const [llave, setLlave] = useState('')
  const [pegando, setPegando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api<Datos>('/api/opciones').then(setDatos, (e) => setError(e.message))
  }, [])

  function guardar(valor: string | null) {
    setOcupado(true)
    setError('')
    api<Datos>(`/api/opciones/${id}`, { llave: valor })
      .then((d) => (setDatos(d), setLlave(''), setPegando(false)))
      .catch((e) => setError(e.message))
      .finally(() => setOcupado(false))
  }

  function elegir(que: string) {
    if (que === 'cambiar') setPegando(true)
    if (que === 'ver') window.open(l.url, '_blank', 'noreferrer')
    if (que === 'quitar') guardar(null)
  }

  // Con el servidor sin reiniciar, aún no sabe de la llave de YouTube: se ve como sin poner.
  const g = datos?.[id]
  // El token de Meta caduca: se avisa una semana antes, como el de la nube en las Redes.
  const caduca = id === 'meta' ? datos?.meta?.caduca : undefined
  const vence =
    caduca && caduca - Date.now() < 7 * 864e5
      ? `El token ${caduca < Date.now() ? 'caducó' : 'caduca'} el ${new Date(caduca).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}. Genera otro y pégalo con «Cambiar de llave».`
      : ''
  return (
    <div className="item">
      <div className="fila">
        <Logo de={l.logo ?? id} nombre={l.nombre} />
        <div className="fila-nombre">
          <strong>{l.nombre}</strong>
          <span>{l.para}</span>
        </div>
        {!datos ? (
          <span className="muted small">{error ? '' : 'Mirando…'}</span>
        ) : g ? (
          <Picker
            className="acciones"
            label={<span className="estado mono">…{g.final}</span>}
            value=""
            disabled={ocupado}
            groups={[
              {
                label: 'Llave',
                options: [
                  { value: 'cambiar', label: 'Cambiar de llave' },
                  { value: 'ver', label: 'Ver tus llaves ↗' },
                  { value: 'quitar', label: 'Quitar' },
                ],
              },
            ]}
            onChange={elegir}
          />
        ) : (
          !pegando && (
            <button className="primary" onClick={() => setPegando(true)}>
              Añadir llave
            </button>
          )
        )}
      </div>
      {pegando && (
        <form className="fila-extra" onSubmit={(e) => (e.preventDefault(), llave.trim() && guardar(llave))}>
          <div className="opcion-fila">
            <input type="password" autoFocus placeholder="Pega tu llave" value={llave} onChange={(e) => setLlave(e.target.value)} autoComplete="off" />
            <button className="primary" disabled={ocupado || !llave.trim()}>
              {ocupado ? 'Probando…' : 'Guardar'}
            </button>
            <button type="button" className="ghost" onClick={() => (setPegando(false), setLlave(''))}>
              Cancelar
            </button>
          </div>
          <p className="muted small">{l.ayuda} Se guarda en tu usuario de esta computadora, no en la app.</p>
        </form>
      )}
      {vence && !pegando && <p className="bad small fila-extra">{vence}</p>}
      {error && <p className="bad small fila-extra">{error}</p>}
    </div>
  )
}

/**
 * La cuenta de Claude con la que trabaja Sloth (la de Claude Code en esta computadora). «Conectar con Claude» abre el
 * navegador para autorizarla; si no se abrió, el enlace de respaldo da un código que se pega aquí. Sirve también para
 * cambiar de cuenta: vuelve a autorizar.
 */
function useCuenta(fresco = false, proveedor = 'claude') {
  const [cuenta, setCuenta] = useState<Cuenta | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  // El servidor recuerda la cuenta conectada; `fresco` (Opciones) le pide mirarla otra vez.
  const leer = (de = '') => api<Cuenta>(`/api/${proveedor}/cuenta${de}`).then(setCuenta, (e) => setError(e.message))
  useEffect(() => void leer(fresco ? '?fresco' : ''), [])

  // Mientras autorizas en el navegador, se mira cada dos segundos si ya entraste.
  const conectando = !!cuenta?.conectando
  useEffect(() => {
    if (!conectando) return
    const id = setInterval(() => leer(), 2000)
    return () => clearInterval(id)
  }, [conectando])

  function pedir(ruta: string, datos: unknown) {
    setOcupado(true)
    setError('')
    return api<Cuenta>(ruta, datos)
      .then((cuenta) => { setCuenta(cuenta); return cuenta })
      .catch((e) => setError(e.message))
      .finally(() => setOcupado(false))
  }

  return { cuenta, ocupado, error: error || cuenta?.error, conectar: () => pedir(`/api/${proveedor}/conectar`, {}), pedir }
}

type UsoCuenta = ReturnType<typeof useCuenta>

/**
 * Mientras autorizas: qué hacer. El código de respaldo se pega en la ventana de Claude Code, no aquí: el inicio de sesión
 * es todo de Anthropic (ver `server/cuenta.ts`).
 */
function Autorizando({ c }: { c: UsoCuenta }) {
  if (!c.cuenta?.conectando) return null
  return (
    <div className="fila-extra">
      <p className="small">Autoriza a Claude Code en la pestaña que se abrió. Al terminar, esto se actualiza solo.</p>
      <p className="muted small">¿No se abrió el navegador? Sigue lo que dice la ventana de Claude Code: ahí mismo te da el enlace y te pide el código.</p>
    </div>
  )
}

/**
 * Lo que ve quien abre la app sin cuenta de Claude: encima del compositor, y solo entonces. `onFalta` dice si falta
 * (`undefined` mientras no se sabe), para no dejar mandar un video que no va a poder empezar.
 */
export function CuentaClaude({ model, onFalta }: { model?: string; onFalta?(falta?: boolean): void }) {
  return proveedorDe(model ?? '') === 'codex' ? <CuentaCodex aviso onFalta={onFalta} /> : <AvisoClaude onFalta={onFalta} />
}

/** La cuenta de ChatGPT, solo si falta, como la de Claude: en la bienvenida. */
export const CuentaChatGPT = ({ onFalta }: { onFalta?(falta?: boolean): void }) => <CuentaCodex aviso onFalta={onFalta} />

function AvisoClaude({ onFalta }: { onFalta?(falta?: boolean): void }) {
  const c = useCuenta()
  const falta = c.cuenta ? !c.cuenta.conectada : undefined
  useEffect(() => onFalta?.(falta), [falta])
  if (!c.cuenta || !falta) return null
  return (
    <section className="panel cuenta-aviso">
      <div className="item">
        <div className="fila">
          <Logo de="claude" />
          <div className="fila-nombre">
            <strong>Conecta tu cuenta de Claude</strong>
            {!c.cuenta.conectando && <span>Sloth trabaja con tu cuenta de Claude (Pro o Max). Se autoriza una sola vez en el navegador.</span>}
          </div>
          {c.cuenta.conectando ? (
            <span className="estado moviendo">Esperando al navegador…</span>
          ) : (
            <button className="primary" disabled={c.ocupado} onClick={c.conectar}>
              {c.ocupado ? 'Abriendo el navegador…' : 'Conectar con Claude'}
            </button>
          )}
        </div>
        <Autorizando c={c} />
        {c.error && <p className="bad small fila-extra">{c.error}</p>}
      </div>
    </section>
  )
}

/**
 * La misma cuenta de ChatGPT que usa Codex en esta computadora. El navegador termina la autorización. En Opciones se ve
 * como Claude Code: la cuenta con su menú, la versión y los límites del plan.
 */
function CuentaCodex({ aviso = false, onFalta }: { aviso?: boolean; onFalta?(falta?: boolean): void }) {
  const c = useCuenta(true, 'codex')
  const version = useVersion('codex', !aviso)
  const falta = c.cuenta ? !c.cuenta.conectada : undefined
  useEffect(() => onFalta?.(falta), [falta])
  if (aviso && !falta) return null
  const cuenta = c.cuenta
  const url = cuenta?.conectando?.url
  const conectar = () => {
    // Se abre en el clic para que el navegador no bloquee la pestaña mientras llega la URL.
    const ventana = window.open('about:blank', '_blank')
    if (ventana) ventana.opener = null
    void c.conectar().then((cuenta) => {
      if (ventana && cuenta?.conectando?.url) ventana.location.href = cuenta.conectando.url
      else ventana?.close()
    })
  }
  const contenido = (
    <div className="item">
      <div className="fila">
        <Logo de="codex" />
        <div className="fila-nombre">
          <strong>Codex · ChatGPT</strong>
          {cuenta?.conectada ? (
            <Picker
              className="sub"
              label={[cuenta.quien, conMayuscula(cuenta.plan)].filter(Boolean).join(' · ') || 'Cuenta conectada'}
              value=""
              disabled={c.ocupado}
              groups={[
                {
                  label: 'Cuenta',
                  options: [
                    { value: 'uso', label: 'Ver tu uso ↗' },
                    { value: 'cambiar', label: 'Cambiar de cuenta' },
                  ],
                },
              ]}
              onChange={(que) => (que === 'uso' ? window.open('https://chatgpt.com/codex/settings/usage', '_blank', 'noreferrer') : conectar())}
            />
          ) : (
            <span>Opcional. Con tu cuenta de ChatGPT, Sloth hace las imágenes de los videos: portadas y personajes. Sin ella, los videos salen sin imágenes generadas. Se autoriza en el navegador.</span>
          )}
        </div>
        {version.estado}
        {cuenta?.conectando ? (
          <span className="estado moviendo">Esperando al navegador…</span>
        ) : (
          !cuenta?.conectada && (
            <button className="primary" disabled={c.ocupado || !cuenta} onClick={conectar}>
              {c.ocupado ? 'Conectando…' : 'Conectar con ChatGPT'}
            </button>
          )
        )}
      </div>
      {url && <p className="fila-extra small"><a href={url} target="_blank" rel="noreferrer">Abrir inicio de sesión de ChatGPT ↗</a>. Vuelve aquí después de autorizar.</p>}
      {!aviso && cuenta?.conectada && <Limites proveedor="codex" />}
      {c.error && <p className="bad small fila-extra">{c.error}</p>}
      {version.aviso}
    </div>
  )
  return aviso ? <section className="panel cuenta-aviso">{contenido}</section> : contenido
}

/** `plus` → `Plus`: el plan como lo escribe su marca. */
const conMayuscula = (s?: string) => s && s[0].toUpperCase() + s.slice(1)

/**
 * Lo que las skills necesitan fuera de Sloth (FFmpeg, Python…), y el botón que baja lo que falta. Con `skill`, solo lo
 * que pide esa skill; sin ella (Opciones), todo.
 */
function useRequisitos(fresco = false, skill?: string) {
  const [lista, setLista] = useState<Requisito[] | null>(null)
  const [error, setError] = useState('')

  // Con todo listo, el servidor no vuelve a mirar; `fresco` (Opciones) se lo pide.
  function leer(fresco = false) {
    const q = new URLSearchParams()
    if (skill) q.set('skill', skill)
    if (fresco) q.set('fresco', '')
    return api<Requisito[]>(`/api/requisitos?${q}`).then(setLista, (e) => setError(e.message))
  }
  useEffect(() => void leer(fresco), [skill])

  // Mientras se instala, se mira cada tres segundos cómo va.
  const trabajando = !!lista?.some((r) => r.estado)
  useEffect(() => {
    if (!trabajando) return
    const id = setInterval(() => leer(), 3000)
    return () => clearInterval(id)
  }, [trabajando])

  function bajar(ids?: string[]) {
    setError('')
    api<Requisito[]>('/api/requisitos/instalar', { ids, skill }).then(setLista, (e) => setError(e.message))
  }

  return { lista, error, trabajando, bajar }
}

type UsoRequisitos = ReturnType<typeof useRequisitos>

/**
 * Lo que ve quien abre la app si falta algo que Sloth puede bajar: encima del compositor, solo lo que falta para la skill
 * de la card, con un botón que lo baja todo. En Opciones está la lista entera, cada uno con su botón.
 */
export function Requisitos({ skill, onListo }: { skill?: string; onListo?(listo?: boolean): void }) {
  const { lista, error, trabajando, bajar } = useRequisitos(false, skill)
  const bajables = lista?.filter((r) => !r.listo && r.instalable && !r.estado) ?? []
  // Si ya está todo (la bienvenida lo marca); `undefined` mientras no se sabe. Lo opcional (ChatGPT) no cuenta.
  const listo = lista ? !lista.some((r) => !r.listo && !r.opcional) : undefined
  useEffect(() => onListo?.(listo), [listo])
  if (!trabajando && !bajables.length && !lista?.some((r) => r.error)) return null
  return (
    <section className="panel requisitos-aviso">
      <div className="item">
        <div className="fila">
          <div className="fila-nombre">
            <strong>Falta descargar algunas cosas</strong>
            <span>Los estilos de video las usan para armar, transcribir y revisar. Puede tardar unos minutos.</span>
          </div>
          {bajables.length > 0 && (
            <button className="primary" onClick={() => bajar()}>
              Descargar todo lo que falta
            </button>
          )}
        </div>
        {error && <p className="bad small fila-extra">{error}</p>}
      </div>
      {lista
        ?.filter((r) => (!r.listo && !r.opcional) || r.estado || r.error)
        .map((r) => (
          <RequisitoFila key={r.id} r={r} />
        ))}
    </section>
  )
}

/**
 * Las herramientas de los estilos de video. Con todo listo se pliegan en una fila con sus logos y sus versiones; se abren
 * con un clic, y solas en cuanto falta algo.
 */
function Herramientas({ req }: { req: UsoRequisitos }) {
  const [abierta, setAbierta] = useState(false)
  const lista = req.lista ?? []
  const bajables = lista.filter((r) => !r.listo && r.instalable && !r.estado)
  const todoListo = !!req.lista && lista.every((r) => (r.listo || r.opcional) && !r.error)
  const plegada = todoListo && !abierta
  return (
    <Grupo
      titulo="Herramientas de video"
      extra={
        bajables.length > 1 ? (
          <button className="boton" onClick={() => req.bajar()}>
            Descargar todo lo que falta
          </button>
        ) : (
          todoListo &&
          abierta && (
            <button className="resumen on" onClick={() => setAbierta(false)}>
              Plegar
            </button>
          )
        )
      }
    >
      {!req.lista ? (
        <div className="item fila muted small">{req.error || 'Mirando…'}</div>
      ) : plegada ? (
        <div className="item">
          <button className="fila fila-boton" onClick={() => setAbierta(true)}>
            <span className="logos">
              {lista.map((r) => (
                <Logo key={r.id} de={r.id} nombre={r.nombre} chico />
              ))}
            </span>
            <span className="fila-nombre">
              <strong>Todo listo</strong>
              <span className="una-linea">{lista.map((r) => (r.detalle ? `${r.nombre} ${r.detalle}` : r.nombre)).join(' · ')}</span>
            </span>
            <span className="resumen">Ver</span>
          </button>
        </div>
      ) : (
        lista.map((r) => <RequisitoFila key={r.id} r={r} onBajar={() => req.bajar([r.id])} />)
      )}
      {req.lista && req.error && <p className="bad small fila-extra">{req.error}</p>}
    </Grupo>
  )
}

/** Una herramienta: para qué sirve, su versión si está, y si no, cómo conseguirla. Sin `onBajar` no lleva botón. */
function RequisitoFila({ r, onBajar }: { r: Requisito; onBajar?(): void }) {
  return (
    <div className="item">
      <div className="fila">
        <Logo de={r.id} nombre={r.nombre} />
        <div className="fila-nombre" title={r.para}>
          <strong>{r.nombre}</strong>
          <span className={r.listo ? 'una-linea' : undefined}>{r.para}</span>
          {!r.listo && r.aMano && <span>{r.aMano}</span>}
        </div>
        <EstadoRequisito r={r} />
        {onBajar && r.instalable && !r.listo && !r.estado && (
          <button className="primary" onClick={onBajar}>
            Descargar
          </button>
        )}
      </div>
      {r.error && <p className="bad small fila-extra requisito-error">{r.error}</p>}
    </div>
  )
}

function EstadoRequisito({ r }: { r: Requisito }) {
  if (r.listo) return <span className="estado">{r.detalle ?? 'Listo'}</span>
  if (r.opcional) return <span className="estado apagado">Opcional</span>
  if (r.estado) return <span className="estado moviendo" title={r.detalle}>{r.estado === 'instalando' ? (r.detalle ? `${r.detalle}…` : 'Descargando…') : 'En espera'}</span>
  return <span className="estado falta">{r.detalle ?? 'Falta'}</span>
}

/**
 * La versión de un agente (`estado`, a la derecha de su fila), la que trae Sloth: llega al día con cada versión de Sloth.
 * `aviso`, debajo, si no se pudo leer.
 */
function useVersion(de: 'claude' | 'codex', mirar = true) {
  const [p, setVersion] = useState<VersionClaude | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (mirar) void api<VersionClaude>(`/api/${de}/version`).then(setVersion, (e) => setError(e.message))
  }, [])

  let estado: ReactNode
  if (!mirar) estado = null
  else if (!p) estado = <span className="muted small">{error ? '' : 'Buscando versión…'}</span>
  else if (!p.instalada) estado = <span className="estado apagado">No está instalado</span>
  else estado = <span className="estado">{p.instalada}</span>
  const aviso = error && <p className="bad small fila-extra">{error}</p>
  return { estado, aviso }
}

/** Claude Code: con qué cuenta trabaja y qué versión tiene. */
function Agentes() {
  const c = useCuenta(true)
  const version = useVersion('claude')
  const cuenta = c.cuenta
  return (
    <>
      <div className="item">
        <div className="fila">
          <Logo de="claude" />
          <div className="fila-nombre">
            <strong>Claude Code</strong>
            {!cuenta ? (
              <span>{c.error ? 'No se pudo ver la cuenta' : 'Mirando la cuenta…'}</span>
            ) : cuenta.conectada ? (
              <Picker
                className="sub"
                label={[cuenta.quien, conMayuscula(cuenta.plan)].filter(Boolean).join(' · ')}
                value=""
                disabled={c.ocupado}
                groups={[
                  {
                    label: 'Cuenta',
                    options: [
                      { value: 'uso', label: 'Ver tu uso ↗' },
                      { value: 'cambiar', label: 'Cambiar de cuenta' },
                    ],
                  },
                ]}
                onChange={(que) => (que === 'uso' ? window.open('https://claude.ai/settings/usage', '_blank', 'noreferrer') : c.conectar())}
              />
            ) : cuenta.conectando ? (
              <span className="falta">Esperando al navegador…</span>
            ) : (
              <span className="falta">Sin cuenta: Sloth trabaja con tu cuenta de Claude (Pro o Max)</span>
            )}
          </div>
          {version.estado}
          {cuenta && !cuenta.conectada && !cuenta.conectando && (
            <button className="primary" disabled={c.ocupado} onClick={c.conectar}>
              {c.ocupado ? 'Abriendo el navegador…' : 'Conectar con Claude'}
            </button>
          )}
        </div>
        <Autorizando c={c} />
        {/* Con una llave de API no hay plan ni límites: se paga por uso. */}
        {cuenta?.conectada && cuenta.plan && <Limites proveedor="claude" />}
        {c.error && <p className="bad small fila-extra">{c.error}</p>}
        {version.aviso}
      </div>
    </>
  )
}

/**
 * Cuánto va de los límites del plan de Claude o de ChatGPT, debajo de la cuenta: una barra por ventana, verde con holgura,
 * ámbar si se acerca y roja casi al tope, con cuándo vuelve a cero. Preguntarlo abre Claude Code (o Codex): solo aquí, y
 * el servidor lo guarda un minuto.
 */
function Limites({ proveedor }: { proveedor: 'claude' | 'codex' }) {
  const [limites, setLimites] = useState<LimitesClaude | null>(null)
  const [fallo, setFallo] = useState(false)
  useEffect(() => void api<LimitesClaude>(`/api/${proveedor}/limites`).then(setLimites, () => setFallo(true)), [])
  if (fallo) return <p className="muted small fila-extra">No se pudo ver cuánto llevas de los límites del plan.</p>
  if (!limites) return <p className="muted small fila-extra">Mirando los límites del plan…</p>
  if (!limites.ventanas.length) return null
  return (
    <div className="fila-extra limites">
      {limites.ventanas.map((v) => (
        <div key={v.nombre} className="limite">
          <div className="limite-nombre">
            <span>{v.nombre}</span>
            <span>{Math.round(v.uso)} %</span>
          </div>
          <div className={`limite-barra${v.uso >= 90 ? ' lleno' : v.uso >= 70 ? ' alto' : ''}`} role="meter" aria-label={v.nombre} aria-valuenow={Math.round(v.uso)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${Math.min(v.uso, 100)}%` }} />
          </div>
          {v.reinicia && (
            <span className="muted" title={new Date(v.reinicia).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })}>
              Se reinicia {cuandoReinicia(new Date(v.reinicia))}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** Cuándo vuelve a cero un límite, dicho en llano: «hoy a las 21:09», «mañana a la 1:30», «el miércoles 14». */
function cuandoReinicia(d: Date) {
  const hora = `${d.getHours() === 1 ? 'la' : 'las'} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  const manana = new Date()
  manana.setDate(manana.getDate() + 1)
  if (d.toDateString() === new Date().toDateString()) return `hoy a ${hora}`
  if (d.toDateString() === manana.toDateString()) return `mañana a ${hora}`
  return `el ${DIAS[d.getDay()]} ${d.getDate()}`
}

/**
 * Los avisos de cuando un hilo termina o te necesita mientras miras otra cosa (`avisos.ts`). En la ventana de Sloth ya
 * tienen permiso; en Edge, encenderlas se lo pide, y si lo niega se dice dónde dárselo.
 */
function Avisos() {
  const [permiso, setPermiso] = usePermiso()
  const [quiere, setQuiere] = useState(() => encendido('notificaciones'))
  const [sonido, setSonido] = useState(() => encendido('sonido'))
  // Lo que se enseña debajo: cómo darle el permiso, tras intentarlo sin él; qué mirar en Windows, tras la de prueba.
  const [ayuda, setAyuda] = useState<'permiso' | 'windows' | null>(null)
  const activas = quiere && permiso === 'granted'

  // Encenderlas manda una de prueba, como encender el sonido lo hace sonar: así no hacen falta botones para probar.
  async function cambiar(si: boolean) {
    encender('notificaciones', si)
    setQuiere(si)
    setAyuda(null)
    if (!si || permiso === 'sin-api') return
    const p = permiso === 'default' ? await Notification.requestPermission() : permiso
    setPermiso(p)
    if (p !== 'granted') return setAyuda('permiso')
    void notificar({ titulo: 'Así avisa Sloth', cuerpo: 'Cuando un hilo termine mientras miras otra cosa.', ids: [] })
    setAyuda('windows')
  }

  return (
    <div className="item">
      <div className="fila">
        <span className="logo" aria-hidden>
          <Icono de="campana" />
        </span>
        <div className="fila-nombre">
          <strong>Cuando un hilo termina</strong>
          <span>Te avisa si estás en otra cosa; la notificación abre el hilo.</span>
        </div>
        {permiso === 'denied' && <span className="estado falta">Bloqueadas en Edge</span>}
        <Interruptor on={activas} disabled={permiso === 'sin-api'} onCambiar={cambiar} etiqueta="Notificación" />
        <Interruptor on={sonido} onCambiar={(si) => (encender('sonido', si), setSonido(si), si && sonar())} etiqueta="Sonido" />
      </div>
      {ayuda === 'permiso' && (
        <p className="small fila-extra">
          Edge no deja avisar a Sloth. Para permitirlo, escribe <span className="mono">edge://settings/content/notifications</span> en una ventana de Edge,
          añade <span className="mono">{location.origin}</span> en «Permitir» (o quítalo de «No permitir») y vuelve aquí.
        </p>
      )}
      {ayuda === 'windows' && (
        <p className="muted small fila-extra">
          ¿No salió? Mira que Windows deje avisar a {window.sloth ? 'Sloth' : 'Microsoft Edge'} (Configuración → Sistema → Notificaciones) y que «No molestar» esté apagado.
        </p>
      )}
    </div>
  )
}

/** Un interruptor de encendido y apagado, con la bolita que se desliza y su nombre a la izquierda, que también lo cambia. */
function Interruptor({ on, onCambiar, etiqueta, disabled }: { on: boolean; onCambiar(si: boolean): void; etiqueta: string; disabled?: boolean }) {
  return (
    <label className="con-interruptor">
      {etiqueta}
      <button role="switch" aria-checked={on} className={`interruptor${on ? ' on' : ''}`} disabled={disabled} onClick={() => onCambiar(!on)}>
        <span />
      </button>
    </label>
  )
}
