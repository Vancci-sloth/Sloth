import { markdown } from './markdown'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  alPerfil,
  compartidosPorMil,
  esOutlier,
  esVertical,
  guardadosPorMil,
  IDEAS_CARD,
  idiomaDe,
  medible,
  MIN_MUESTRA,
  MIN_VISTAS,
  MIN_VISTAS_VERTICAL,
  OUTLIER,
  porMil,
  redDeReferencia,
  sinInvestigar,
  sospechoso,
  TU_CANAL,
  TU_INSTAGRAM,
  urlVertical,
  usuarioDe,
  veces,
  viejo
} from '../../shared/ideas'
import type {
  Canal,
  CanalCompleto,
  CanalYT,
  Card,
  CuentaInvestigacion,
  EnVivo,
  Idea,
  IdeaElegida,
  Investigacion,
  Model,
  PasoYT,
  RedVertical,
  ServerPush,
  SessionMeta,
  Temas,
  TerminoYT,
  VideoYT
} from '../../shared/types'
import { api } from './api'
import { Icon, type Choice } from './Composer'
import { Confirm } from './Confirm'
import { Logo } from './Logos'
import { Segmento } from './Segmento'
import './Ideas.css'

/**
 * La sección Ideas (`server/ideas/`): un canal, la investigación de su nicho en vivo y las ideas que propone Claude con su
 * evidencia. Todo lo que pasa se ve aquí: cada paso de la investigación, lo que Claude va escribiendo y en qué hilo.
 */

type Push = Extract<ServerPush, { type: 'ideas' }>

/** `878 mil`, `8.1 mil`, `3.5 M`: como se dice. */
const mil = (n?: number) =>
  n === undefined
    ? '—'
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')} M`
      : n >= 1000
        ? `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')} mil`
        : String(Math.round(n))
const relativo = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
/** `'2026-09-14'` → `sept 2026`. */
const mes = (f?: string) => (f ? `${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}` : 'sin fecha')
/** La fecha de un video, o por qué no la hay: no es lo mismo no haberla leído que un video que ya no está. */
const fechaDe = (v: VideoYT) => (v.fecha ? mes(v.fecha) : v.leido ? 'ya no está' : 'sin leer')
const meses = (f?: string) => (f ? (Date.now() - new Date(f).getTime()) / (30.4 * 864e5) : undefined)
const hace = (t: number) => {
  const min = (Date.now() - t) / 60000
  return min < 60 ? relativo.format(-Math.round(min), 'minute') : min < 1440 ? relativo.format(-Math.round(min / 60), 'hour') : relativo.format(-Math.round(min / 1440), 'day')
}
/** Un video largo dura minutos; uno vertical, segundos. */
const dura = (v: VideoYT) => (!v.segundos ? '' : v.red ? `${Math.round(v.segundos)} s` : `${Math.round(v.segundos / 60)} min`)
const miniatura = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
const enYoutube = (id: string) => `https://www.youtube.com/watch?v=${id}`
/** Dónde se ve un video: en YouTube, o en su página de TikTok o Instagram. */
const enlace = (v: VideoYT) => (v.red ? urlVertical(v) : enYoutube(v.id))
/** Algo por cada mil vistas, con los decimales que hacen falta para leerlo. */
const xMil = (n?: number) => (n === undefined ? '—' : n.toFixed(n < 1 ? 2 : 1))
/** Dónde publicar una idea vertical, dicho. Sin `red`, en las dos. */
const redesDe = (r?: Idea['red']) => (r === 'tiktok' ? 'TikTok' : r === 'instagram' ? 'Instagram' : 'TikTok e Instagram')
/** Un Reel de la búsqueda de Instagram cuya cuenta no se midió: sin vistas, que no es lo mismo que cero. */
const sinVistas = (v: VideoYT) => !!v.red && !v.vistas
/** Un canal o una cuenta del usuario: en YouTube lo marca `propio`; en vertical, también su origen. */
const tuyo = (x: CanalYT) => !!x.propio || (!!x.red && (x.de === TU_CANAL || x.de === TU_INSTAGRAM))
/** En español, o sin saberse (solo hashtags, poco texto): lo que no lleva marca de idioma. */
const enEspanol = (idioma?: string) => !idioma || idioma === 'es'
/** Por qué se marca una búsqueda en inglés. */
const BUSQUEDA_EN = 'Se busca pidiendo inglés. TikTok mezcla los resultados por tu país: de ella se toman solo los videos y las cuentas en inglés'

/**
 * El idioma de un video, una cuenta o una búsqueda vertical que no es en español: «EN». El español es la demanda de quien
 * compra; el inglés, empaque y modas que suelen llegar antes, para traerlas.
 */
function Idioma({ de, title }: { de?: string; title?: string }) {
  if (enEspanol(de)) return null
  return (
    <span className="idea-marca" title={title ?? (de === 'en' ? 'En inglés: empaque y modas que suelen llegar antes al español, para traerlas. La demanda de quien compra es la de español' : undefined)}>
      {de!.toUpperCase()}
    </span>
  )
}

/** La portada 9:16 de un video de TikTok o Instagram, la que guardó la investigación. Si no se bajó, queda el hueco. */
function Portada({ canalId, v, className = '' }: { canalId: string; v: VideoYT; className?: string }) {
  return (
    <span className={`portada ${className}`}>
      <img src={`/api/ideas/${canalId}/portada/${encodeURIComponent(v.id)}`} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      {v.red && <Logo de={v.red} chico />}
    </span>
  )
}

/** El texto de un borrador del compositor: el campo lo lee tal cual, con sus saltos de línea. */
export const textoAHtml = (t: string) => t.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** El modelo para los hilos de la sección: el último que elegiste, o el primero del catálogo. */
function eleccion(models: Model[]): Choice | undefined {
  try {
    const c = JSON.parse(localStorage.getItem('choice') ?? 'null') as Choice | null
    if (c && models.some((m) => m.id === c.model)) return { model: c.model, effort: c.effort }
  } catch {}
  const m = models[0]
  return m && { model: m.id, effort: m.defaultEffort }
}

export function Ideas(props: {
  canalId?: string
  cards: Card[]
  models: Model[]
  sessions: SessionMeta[]
  onCanal(id: string | undefined): void
  onHilo(id: string): void
  onBorrador(cardId: string, texto: string): void
}) {
  const [canales, setCanales] = useState<Canal[] | null>(null)
  const [trabajando, setTrabajando] = useState<string[]>([])
  const [nuevo, setNuevo] = useState(false)
  const [error, setError] = useState('')

  const leerLista = () =>
    api<{ canales: Canal[]; trabajando: string[] }>('/api/ideas').then(
      (r) => (setCanales(r.canales), setTrabajando(r.trabajando)),
      (e) => setError(e.message)
    )
  useEffect(() => void leerLista(), [])

  // Qué canal está investigando, para el punto de la pestaña aunque estés en otro. Un archivo que cambia (la entrevista
  // le pone nombre al canal) vuelve a leer la lista.
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<Push>).detail.trabajo
      if (t) setTrabajando((ids) => (t.estado === 'trabajando' ? [...new Set([...ids, t.canalId])] : ids.filter((i) => i !== t.canalId)))
      else leerLista()
    }
    addEventListener('sloth-ideas', on)
    return () => removeEventListener('sloth-ideas', on)
  }, [])

  /** La entrevista: Claude pregunta en un hilo lo que no sabes poner, y lo va guardando en el canal. */
  async function entrevistar(canalId: string, campo?: string) {
    const elegido = eleccion(props.models)
    if (!elegido) return setError('No hay ningún modelo de Claude disponible.')
    setError('')
    try {
      const r = await api<{ canalId: string; sesion: SessionMeta }>('/api/ideas/entrevista', { canalId, campo, ...elegido })
      setNuevo(false)
      leerLista()
      props.onCanal(r.canalId)
      props.onHilo(r.sesion.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const actual = canales?.find((c) => c.id === props.canalId) ?? (props.canalId ? undefined : canales?.[0])

  return (
    <div className="ideas">
      <header className="ideas-head">
        <div>
          <h1>💡 Ideas</h1>
          {!nuevo && esVertical(actual) ? (
            <p className="muted">
              Qué video vertical hacer, con evidencia. Sloth busca tu nicho en TikTok y en Instagram, mide cada video contra su cuenta y lee qué piden sus comentarios, y Claude
              propone ideas con señales de demanda, empaque de nichos vecinos, gancho de 4 P en 3 segundos y el riesgo dicho claro.
            </p>
          ) : (
            <p className="muted">
              Qué video largo hacer, con evidencia. Sloth lee tu nicho en YouTube, mide cada video contra su canal y Claude propone ideas con
              señales de demanda, empaque de nichos vecinos, gancho de 4 P y el riesgo dicho claro.
            </p>
          )}
        </div>
      </header>
      {canales && (
        <nav className="ideas-canales">
          {canales.map((c) => (
            <button key={c.id} className={`ideas-canal ${!nuevo && actual?.id === c.id ? 'on' : ''}`} onClick={() => (setNuevo(false), props.onCanal(c.id))}>
              {c.nombre}
              {esVertical(c) && (
                <span className="logos" title="TikTok e Instagram">
                  <Logo de="tiktok" chico />
                  <Logo de="instagram" chico />
                </span>
              )}
              {trabajando.includes(c.id) && <span className="dot running" title="Investigando" />}
            </button>
          ))}
          <button className={`ideas-canal mas ${nuevo || !canales.length ? 'on' : ''}`} onClick={() => setNuevo(true)}>
            + Canal
          </button>
        </nav>
      )}
      {error && <p className="bad small">{error}</p>}
      {canales && (nuevo || !canales.length) ? (
        <CanalForm
          primero={!canales.length}
          canales={canales}
          onCancel={canales.length ? () => setNuevo(false) : undefined}
          onGuardado={(c) => {
            setNuevo(false)
            leerLista()
            props.onCanal(c.id)
          }}
          onEntrevista={entrevistar}
        />
      ) : actual ? (
        <CanalVista key={actual.id} id={actual.id} {...props} onCambio={leerLista} onBorrado={() => (leerLista(), props.onCanal(undefined))} onEntrevista={entrevistar} />
      ) : (
        canales && <p className="muted">No existe ese canal.</p>
      )}
    </div>
  )
}

/**
 * El perfil del canal. Cada campo dice por qué importa: es la decisión que manda sobre las demás. Si no sabes qué poner,
 * «Armar el canal con preguntas» (o «No sé, pregúntame» en un campo) guarda lo que lleves y abre la entrevista. El
 * formato (YouTube, o TikTok e Instagram) se elige al crearlo y no cambia; uno vertical puede copiar el perfil de otro.
 */
function CanalForm({
  canal,
  canales = [],
  primero,
  onCancel,
  onGuardado,
  onEntrevista
}: {
  canal?: Canal
  canales?: Canal[]
  primero?: boolean
  onCancel?(): void
  onGuardado(c: Canal): void
  onEntrevista(canalId: string, campo?: string): Promise<void>
}) {
  const [c, setC] = useState<Partial<Canal>>(canal ?? { semillas: [], vecinos: [], referencias: [] })
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const campo = (k: keyof Canal) => (e: { target: { value: string } }) => setC({ ...c, [k]: e.target.value })
  const vertical = esVertical(c)
  // Lo que se busca no se copia: en TikTok se escribe distinto que en YouTube.
  const copiables = canales.filter((x) => x.publico || x.meta || x.vecinos.length)

  function guardar() {
    setOcupado(true)
    setError('')
    api<Canal>('/api/ideas/canales', c)
      .then(onGuardado)
      .catch((e) => setError(e.message))
      .finally(() => setOcupado(false))
  }

  /** Guarda lo que lleves (sin nombre, «Canal nuevo», que la entrevista cambia) y abre la entrevista. */
  async function preguntar(k?: string) {
    setOcupado(true)
    setError('')
    try {
      const guardado = await api<Canal>('/api/ideas/canales', { ...c, nombre: c.nombre?.trim() || 'Canal nuevo' })
      await onEntrevista(guardado.id, k)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }
  const noSe = (k: string) => (
    <button type="button" className="no-se" disabled={ocupado} onClick={(e) => (e.preventDefault(), preguntar(k))} title="Claude te hace preguntas para llenar este campo contigo">
      No sé, pregúntame
    </button>
  )

  return (
    <section className="opcion canal-form">
      <div className="skill-name">
        <strong>{canal ? 'Editar el canal' : primero ? 'Empieza por tu canal' : 'Canal nuevo'}</strong>
      </div>
      {primero && (
        <p className="muted small">
          Un canal es a quién le hablas. Es lo primero porque decide todo lo demás: qué se busca, qué evidencia cuenta y qué idea sirve. Si aún no tienes el
          canal, no importa: la investigación funciona igual.
        </p>
      )}
      {!canal && (
        <div className="segmento formato" role="tablist">
          <button role="tab" aria-selected={!vertical} className={vertical ? '' : 'on'} onClick={() => setC({ ...c, formato: undefined, instagram: undefined })}>
            YouTube · videos largos
          </button>
          <button role="tab" aria-selected={vertical} className={vertical ? 'on' : ''} onClick={() => setC({ ...c, formato: 'vertical' })}>
            TikTok e Instagram · verticales
          </button>
        </div>
      )}
      {!canal && vertical && copiables.length > 0 && (
        <div className="campo">
          <span>Copiar el perfil de otro canal</span>
          <div className="copiar">
            {copiables.map((x) => (
              <button key={x.id} type="button" className="ficha boton" onClick={() => setC({ ...c, publico: x.publico, meta: x.meta, vecinos: x.vecinos })}>
                {x.nombre}
              </button>
            ))}
          </div>
          <small className="muted">Trae a quién le hablas, para qué y los nichos vecinos, y los ajustas aquí. Lo que se busca no: en TikTok se escribe distinto.</small>
        </div>
      )}
      <div className="entrevista-invita">
        <div>
          <strong>¿No sabes qué poner?</strong>
          <span className="muted small">
            Sloth te hace preguntas, una a la vez y con ejemplos para elegir, y va llenando el canal contigo. Antes de poner cada frase de búsqueda, mira en
            {vertical ? ' TikTok' : ' YouTube'} cuánta gente la busca.
          </span>
        </div>
        <button className="primary" disabled={ocupado} onClick={() => preguntar()}>
          Armar el canal con preguntas
        </button>
      </div>
      <label className="campo">
        <span>Nombre</span>
        <input value={c.nombre ?? ''} onChange={campo('nombre')} placeholder="vancci · IA" autoFocus />
      </label>
      <label className="campo">
        <span>{vertical ? 'Tu TikTok' : 'Tu canal en YouTube'}</span>
        <input value={c.handle ?? ''} onChange={campo('handle')} placeholder={vertical ? '@tu.cuenta (opcional)' : '@tu_canal (opcional)'} />
        {!vertical && <small className="muted">Para medir tu propio piso: cuánto saca hoy un video tuyo. Vacío si el canal aún no existe.</small>}
      </label>
      {vertical && (
        <label className="campo">
          <span>Tu Instagram</span>
          <input value={c.instagram ?? ''} onChange={campo('instagram')} placeholder="@tu.instagram (opcional)" />
          <small className="muted">Con tu TikTok, para medir tu propio piso en cada red: cuánto saca hoy un video tuyo. Vacíos si aún no tienes las cuentas.</small>
        </label>
      )}
      <label className="campo">
        <span className="campo-titulo">
          ¿A quién le hablas? {noSe('publico')}
        </span>
        <textarea rows={2} value={c.publico ?? ''} onChange={campo('publico')} placeholder="Gente que quiere hacer videos con IA para su canal, aunque no sepa editar" />
        <small className="muted">Quien quieres que vea y, si vendes algo, que compre. Un millón de vistas del público equivocado vale menos que diez mil del correcto.</small>
      </label>
      <label className="campo">
        <span className="campo-titulo">
          ¿Para qué es el canal? {noSe('meta')}
        </span>
        <input value={c.meta ?? ''} onChange={campo('meta')} placeholder="Vender Sloth, mi app para hacer videos con IA" />
        <small className="muted">Si vendes algo, cada idea trae la llamada a la acción que regala en vez de pedir.</small>
      </label>
      <div className="campo">
        <span className="campo-titulo">
          Lo que tu público busca{vertical && ' en TikTok'} {noSe('semillas')}
        </span>
        <Fichas lista={c.semillas ?? []} onCambio={(semillas) => setC({ ...c, semillas })} placeholder="crear videos con ia ↵" />
        {vertical ? (
          <small className="muted">
            Frases como las escribiría tu público en el buscador de TikTok («crear videos con ia», «editar con capcut»), no palabras sueltas: Sloth busca cada
            una y abre las cuentas que salen. Pon de 5 a 12, en español y en inglés («faceless youtube channel»): lo que funciona en inglés suele llegar después
            al español. TikTok mezcla los resultados por tu país; de una búsqueda en inglés se toman los videos y las cuentas en inglés.
          </small>
        ) : (
          <small className="muted">
            Frases como las escribiría tu público en YouTube («crear videos con ia», «crecer en tiktok»), no palabras sueltas: «Tiktok» solo trae también mashups
            de música. Sloth busca cada una y abre los canales que salen. Pon de 5 a 12.
          </small>
        )}
      </div>
      <div className="campo">
        <span className="campo-titulo">
          {vertical ? 'Cuentas' : 'Canales'} que ya conoces {noSe('referencias')}
        </span>
        <Fichas
          lista={c.referencias ?? []}
          onCambio={(referencias) => setC({ ...c, referencias })}
          placeholder={vertical ? '@cuenta o instagram.com/cuenta ↵' : '@canal o enlace ↵'}
          red={vertical}
        />
        <small className="muted">
          {vertical ? '@cuenta es de TikTok; instagram.com/cuenta, de Instagram. Pueden ser en inglés, y se leen enteras' : 'Se leen enteros'}. Que te gusten no
          prueba que haya demanda; sus outliers sí.
        </small>
      </div>
      <div className="campo">
        <span className="campo-titulo">
          Nichos vecinos {noSe('vecinos')}
        </span>
        <Fichas lista={c.vecinos ?? []} onCambio={(vecinos) => setC({ ...c, vecinos })} placeholder={vertical ? 'crecer en tiktok ↵' : 'crecer en youtube ↵'} />
        <small className="muted">Públicos con la misma intención. De ahí salen las fórmulas de {vertical ? 'gancho' : 'título'} que tu nicho aún no usa.</small>
      </div>
      {error && <p className="bad small">{error}</p>}
      <div className="opcion-fila">
        {onCancel && (
          <button className="ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <span className="spacer" />
        <button className="primary" disabled={ocupado || !c.nombre?.trim()} onClick={guardar}>
          {ocupado ? 'Guardando…' : canal ? 'Guardar' : 'Crear el canal'}
        </button>
      </div>
    </section>
  )
}

/** Fichas que se añaden con Enter o coma. A diferencia de los hashtags, llevan espacios. Con `red`, el logo de la suya. */
function Fichas({ lista, onCambio, placeholder, red }: { lista: string[]; onCambio(l: string[]): void; placeholder: string; red?: boolean }) {
  const [nueva, setNueva] = useState('')
  const agregar = () => {
    const t = nueva.trim()
    if (t && !lista.some((x) => x.toLowerCase() === t.toLowerCase())) onCambio([...lista, t])
    setNueva('')
  }
  return (
    <span className="tags fichas">
      {lista.map((t) => (
        <span className="tag" key={t}>
          {red && <Logo de={redDeReferencia(t)} chico />}
          {t}
          <button type="button" title="Quitar" onClick={() => onCambio(lista.filter((x) => x !== t))}>
            ✕
          </button>
        </span>
      ))}
      <input
        value={nueva}
        placeholder={placeholder}
        onChange={(e) => setNueva(e.target.value)}
        onBlur={agregar}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') (e.preventDefault(), agregar())
          else if (e.key === 'Backspace' && !nueva && lista.length) onCambio(lista.slice(0, -1))
        }}
      />
    </span>
  )
}

function CanalVista(props: {
  id: string
  cards: Card[]
  models: Model[]
  sessions: SessionMeta[]
  onHilo(id: string): void
  onBorrador(cardId: string, texto: string): void
  onCambio(): void
  onBorrado(): void
  onEntrevista(canalId: string, campo?: string): Promise<void>
}) {
  const { id } = props
  const [d, setD] = useState<CanalCompleto | null>(null)
  const [editando, setEditando] = useState(false)
  const [borrar, setBorrar] = useState(false)
  const [error, setError] = useState('')
  // La búsqueda que se está mirando: una ficha del perfil o una fila de Búsquedas filtra los outliers a lo que trajo.
  const [filtro, setFiltro] = useState<string | null>(null)

  const leer = () => api<CanalCompleto>(`/api/ideas/${id}`).then(setD, (e) => setError(e.message))
  useEffect(() => void leer(), [id])

  // En vivo: cada paso de la investigación llega por el WebSocket; las tablas se vuelven a leer cada pocos segundos
  // mientras crecen. Lo que escribe Claude avisa al cambiar un archivo.
  const ultima = useRef(0)
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    const on = (e: Event) => {
      const p = (e as CustomEvent<Push>).detail
      if (p.canalId !== id) return
      if (!p.trabajo) return void leer()
      setD((x) => x && { ...x, trabajo: p.trabajo! })
      const falta = 3000 - (Date.now() - ultima.current)
      clearTimeout(espera.current)
      espera.current = setTimeout(() => ((ultima.current = Date.now()), leer()), p.trabajo.estado === 'trabajando' ? Math.max(0, falta) : 0)
    }
    addEventListener('sloth-ideas', on)
    return () => (removeEventListener('sloth-ideas', on), clearTimeout(espera.current))
  }, [id])

  // El hilo que propone: al terminar su turno se vuelve a leer todo.
  const hiloVivo = props.sessions.find((s) => s.id === d?.hilo?.id)
  const corriendo = !!hiloVivo && (hiloVivo.running || !!hiloVivo.background?.length)
  useEffect(() => {
    if (d?.hilo) leer()
  }, [corriendo])

  // La entrevista: Claude pregunta y espera tu respuesta en su hilo; lo que contestas aparece en el perfil.
  const entrevistaViva = props.sessions.find((s) => s.id === d?.entrevista?.id)
  const preguntando = !!entrevistaViva && (entrevistaViva.running || !!entrevistaViva.background?.length)

  // Lo que se cuenta y se enseña es lo que trajo el perfil de hoy. La evidencia de una idea se busca en toda la
  // investigación: Claude pudo citar algo de antes.
  const vista = useMemo(() => (d?.investigacion ? alPerfil(d.investigacion, d.canal) : null), [d])

  if (!d) return error ? <p className="bad small">{error}</p> : <p className="muted">Cargando…</p>
  const t = d.trabajo
  const investigando = t?.estado === 'trabajando'
  const elegir = eleccion(props.models)
  const c = d.canal
  const completo = !!c.publico && !!c.meta && c.semillas.length >= 5 && c.vecinos.length > 0

  return (
    <>
      {d.entrevista && (
        <div className={`entrevista-barra ${preguntando ? 'trabajando' : completo ? 'lista' : 'espera'}`}>
          {preguntando ? <span className="spinner" /> : <span>💬</span>}
          <span>
            <strong>Entrevista del canal</strong> ·{' '}
            {preguntando
              ? `Claude está pensando la siguiente pregunta o probando frases en ${esVertical(c) ? 'TikTok' : 'YouTube'}…`
              : completo
                ? 'El perfil ya está completo: puedes investigar.'
                : 'Claude espera tu respuesta en su hilo.'}
          </span>
          <span className="spacer" />
          <button className="ghost small" onClick={() => props.onHilo(d.entrevista!.id)}>
            {completo && !preguntando ? 'Ver la entrevista →' : 'Contestar →'}
          </button>
        </div>
      )}
      {editando ? (
        <CanalForm
          canal={d.canal}
          onCancel={() => setEditando(false)}
          onGuardado={() => (setEditando(false), leer(), props.onCambio())}
          onEntrevista={(canalId, campo) => (setEditando(false), props.onEntrevista(canalId, campo))}
        />
      ) : (
        <Perfil d={d} vista={vista} filtro={filtro} onFiltro={setFiltro} onEditar={() => setEditando(true)} onBorrar={() => setBorrar(true)} onPreguntar={(campo) => props.onEntrevista(id, campo)} />
      )}
      {d.rendimiento !== undefined && <TusVideos d={d} elegir={elegir} sessions={props.sessions} onHilo={props.onHilo} onCambio={leer} />}
      <Pasos d={d} corriendo={corriendo} />
      <Investigacion d={d} vista={vista} onCambio={leer} filtro={filtro} onFiltro={setFiltro} />
      {d.investigacion?.videos.length ? (
        <Propuestas
          d={d}
          corriendo={corriendo}
          investigando={investigando}
          elegir={elegir}
          cards={props.cards}
          onHilo={props.onHilo}
          onBorrador={props.onBorrador}
          onCambio={leer}
        />
      ) : null}
      {borrar && (
        <Confirm
          title={`¿Borrar «${d.canal.nombre}»?`}
          action="Borrar"
          danger
          onClose={() => setBorrar(false)}
          onConfirm={() => api(`/api/ideas/${id}/borrar`, {}).then(props.onBorrado)}
        >
          Se borra su carpeta, con la investigación y las ideas. Los hilos de Claude se quedan en la barra lateral.
        </Confirm>
      )}
    </>
  )
}

function Perfil({
  d,
  vista,
  filtro,
  onFiltro,
  onEditar,
  onBorrar,
  onPreguntar
}: {
  d: CanalCompleto
  vista: Investigacion | null
  filtro: string | null
  onFiltro(t: string | null): void
  onEditar(): void
  onBorrar(): void
  onPreguntar(campo?: string): void
}) {
  // Un campo vacío ofrece la entrevista en vez de un hueco.
  const pregunta = (campo: string) => (
    <button className="no-se" onClick={() => onPreguntar(campo)}>
      No sé, pregúntame
    </button>
  )
  const c = d.canal
  const vertical = esVertical(c)
  // Tu piso: lo que saca hoy un video tuyo. En vertical, uno por red.
  const pisos = vertical
    ? ([
        ['Tu piso en TikTok', vista?.canales.find((x) => x.de === TU_CANAL)],
        ['Tu piso en Instagram', vista?.canales.find((x) => x.de === TU_INSTAGRAM)]
      ] as const)
    : ([['Tu piso', vista?.canales.find((x) => x.propio)]] as const)
  const buscada = new Set(vista?.terminos.map((t) => t.termino))
  const sinLeer = new Set(sinInvestigar(d.investigacion, c))
  // Una ficha que ya se investigó lleva a lo que trajo; una nueva aún no tiene nada que enseñar. En vertical, una frase en
  // inglés lo dice.
  const ficha = (s: string) =>
    buscada.has(s) ? (
      <button key={s} className={`ficha boton ${filtro === s ? 'on' : ''}`} title="Ver los outliers que trajo esta búsqueda" onClick={() => onFiltro(filtro === s ? null : s)}>
        {s}
        {vertical && <Idioma de={idiomaDe(s)} title={BUSQUEDA_EN} />}
      </button>
    ) : (
      <span key={s} className="ficha" title="Aún sin investigar">
        {s}
        {vertical && <Idioma de={idiomaDe(s)} title={BUSQUEDA_EN} />}
      </span>
    )
  return (
    <section className="opcion perfil">
      <div className="skill-name">
        <strong>
          {c.nombre}
          {c.handle && (
            <span className="muted small">
              {' '}
              · {vertical && <Logo de="tiktok" chico />}
              {c.handle}
            </span>
          )}
          {vertical && c.instagram && (
            <span className="muted small">
              {' '}
              · <Logo de="instagram" chico />
              {c.instagram}
            </span>
          )}
        </strong>
        <span className="perfil-acciones">
          <button className="ghost small" onClick={() => onPreguntar()} title="Claude te hace preguntas para afinar el canal">
            Preguntarme
          </button>
          <button className="ghost small" onClick={onEditar}>
            Editar
          </button>
          <button className="ghost small peligro" onClick={onBorrar}>
            Borrar
          </button>
        </span>
      </div>
      <dl>
        <dt>Le habla a</dt>
        <dd>
          {c.publico || (
            <>
              <span className="muted">Sin decir, y es lo que más pesa.</span> {pregunta('publico')}
            </>
          )}
        </dd>
        <dt>Para</dt>
        <dd>{c.meta || pregunta('meta')}</dd>
        <dt>Busca</dt>
        <dd>
          {c.semillas.length ? (
            c.semillas.map(ficha)
          ) : (
            <>
              <span className="muted">Sin términos todavía.</span> {pregunta('semillas')}
            </>
          )}
        </dd>
        {c.referencias.length > 0 && (
          <>
            <dt>Conoce</dt>
            <dd>
              {c.referencias.map((s) => (
                <span key={s} className="ficha" title={sinLeer.has(s) ? 'Aún sin leer' : undefined}>
                  {vertical && <Logo de={redDeReferencia(s)} chico />}
                  {s}
                </span>
              ))}
            </dd>
          </>
        )}
        <dt>Vecinos</dt>
        <dd>{c.vecinos.length ? c.vecinos.map(ficha) : pregunta('vecinos')}</dd>
        {pisos.map(
          ([nombre, x]) =>
            x && (
              <Fragment key={nombre}>
                <dt>{nombre}</dt>
                <dd>
                  Un video{vertical ? '' : ' largo'} tuyo saca hoy <strong>{mil(x.mediana)}</strong> {x.mediana === 1 ? 'vista' : 'vistas'} (mediana de tus
                  últimos {x.videos} videos{vertical ? '' : ' largos'}
                  {x.videos < MIN_MUESTRA ? ': aún son pocos para fiarse' : ''}).
                </dd>
              </Fragment>
            )
        )}
      </dl>
      <p className="muted small mono carpeta">{d.carpeta}</p>
    </section>
  )
}

/** De dónde llegó la gente, como lo dice Studio. `SUBSCRIBER` es «Funciones de exploración»: el inicio y las suscripciones. */
const FUENTE: Record<string, string> = {
  YT_SEARCH: 'Búsqueda',
  SUBSCRIBER: 'Inicio',
  RELATED_VIDEO: 'Sugeridos',
  YT_CHANNEL: 'Tu canal',
  EXT_URL: 'Fuera de YouTube',
  NO_LINK_OTHER: 'Directo',
  YT_OTHER_PAGE: 'Otras páginas',
  PLAYLIST: 'Listas',
  SHORTS: 'Shorts',
  NOTIFICATION: 'Notificaciones',
  END_SCREEN: 'Pantalla final',
  HASHTAGS: 'Hashtags',
  ADVERTISING: 'Anuncios'
}
const APARATO: Record<string, string> = { MOBILE: 'teléfono', DESKTOP: 'computadora', TV: 'tele', TABLET: 'tableta', GAME_CONSOLE: 'consola' }
const pais = new Intl.DisplayNames('es', { type: 'region' })
const fechaCorta = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`
/**
 * Qué tan bien va un número contra lo que se sabe de videos largos: el % de clics de la miniatura (2–10 % es lo normal),
 * qué parte del video ven y cuántos siguen a los 30 s.
 */
const nivel = (n: number | undefined, bien: number, mal: number) => (n === undefined ? '' : n >= bien ? 'bien' : n < mal ? 'mal' : '')
/** Con menos impresiones que esto, el % de clics es azar: 9 clics en 74 dan 12 %. */
const POCAS = 300
const pct = (n?: number) => (n === undefined ? '—' : `${n.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`)

/**
 * Tus videos: cómo le fue a cada video largo del canal que conectaste en YouTube, y lo que Claude concluyó de eso
 * (`diagnostico.md`). Claude lo lee antes de proponer ideas, para que la siguiente tanda corrija lo que no funcionó.
 */
function TusVideos({ d, elegir, sessions, onHilo, onCambio }: { d: CanalCompleto; elegir?: Choice; sessions: SessionMeta[]; onHilo(id: string): void; onCambio(): void }) {
  const r = d.rendimiento
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState('')
  const vivo = sessions.find((s) => s.id === d.diagnosticoHilo?.id)
  const diagnosticando = !!vivo && (vivo.running || !!vivo.background?.length)

  const actualizar = () => (setError(''), setLeyendo(true), api(`/api/ideas/${d.canal.id}/rendimiento`, {}).then(onCambio, (e) => setError(e.message)).finally(() => setLeyendo(false)))
  function diagnosticar() {
    if (!elegir) return setError('No hay ningún modelo de Claude disponible.')
    setError('')
    setLeyendo(true)
    api<SessionMeta>(`/api/ideas/${d.canal.id}/diagnosticar`, elegir)
      .then(onCambio, (e) => setError(e.message))
      .finally(() => setLeyendo(false))
  }
  const a = r?.audiencia
  const edades = a?.edades.filter(([, n]) => n >= 5) ?? []

  return (
    <section className="ideas-bloque tus-videos">
      <div className="ideas-bloque-head">
        <h2>Tus videos</h2>
        <span className="muted small">
          {r ? `${r.videos.length} videos largos de los últimos 90 días · leídos ${hace(r.medido)}` : 'Cómo le fue a cada video largo de tu canal'}
        </span>
        <span className="spacer" />
        {r && (
          <button className="ghost small" disabled={leyendo || diagnosticando} onClick={actualizar} title="Lee otra vez tus números de YouTube. Tarda unos segundos">
            {leyendo && !diagnosticando ? 'Leyendo…' : 'Actualizar'}
          </button>
        )}
        {diagnosticando ? (
          <button className="ghost small" onClick={() => onHilo(vivo!.id)}>
            Abrir el hilo →
          </button>
        ) : (
          <button
            className="primary"
            disabled={leyendo || !elegir}
            onClick={r ? diagnosticar : actualizar}
            title={r ? `Claude suma lo que dice Studio y te dice qué cambiar en la siguiente tanda${elegir ? `, con ${elegir.model}` : ''}` : undefined}
          >
            {r ? 'Diagnosticar' : leyendo ? 'Leyendo…' : 'Leer mis números'}
          </button>
        )}
      </div>
      {error && <p className="bad small">{error}</p>}
      {!r && (
        <p className="muted small">
          Sloth lee de YouTube, con el canal que conectaste para subir, cómo le fue a cada video largo: cuántos lo vieron, qué parte vieron, cuántos seguían a los 30
          segundos y de dónde llegaron. Luego Claude suma lo que solo dice Studio (cuántos vieron la miniatura y cuántos hicieron clic) y te dice qué cambiar.
        </p>
      )}
      {diagnosticando && (
        <div className="trabajo trabajando">
          <div className="trabajo-estado">
            <span className="spinner" />
            <strong>Claude está revisando tus videos</strong>
            <span className="muted small">Lee Studio en su navegador y escribe el diagnóstico aquí abajo.</span>
          </div>
        </div>
      )}
      {r && r.videos.length > 0 && (
        <>
          <table className="tabla tus-videos-tabla">
            <thead>
              <tr>
                <th />
                <th>Video</th>
                <th className="num" title="Las veces que YouTube enseñó la miniatura. De Studio">
                  Mostrado
                </th>
                <th className="num" title="De cada 100 que vieron la miniatura, cuántos entraron. De Studio; lo normal es de 2 a 10 %">
                  Clics
                </th>
                <th className="num">Vistas</th>
                <th className="num" title="Qué parte del video ve cada quien, en promedio">
                  Visto
                </th>
                <th className="num" title="Cuántos de cada 100 siguen viendo a los 30 segundos">
                  A los 30 s
                </th>
                <th>Llegaron por</th>
              </tr>
            </thead>
            <tbody>
              {r.videos.map((v) => {
                const fuentes = v.fuentes ?? []
                const total = fuentes.reduce((s, [, n]) => s + n, 0)
                const [fuente, vistas] = fuentes[0] ?? []
                return (
                  <tr key={v.id} className={v.privado ? 'privado' : ''}>
                    <td className="celda-mini">
                      <a href={enYoutube(v.id)} target="_blank" rel="noreferrer">
                        <img src={miniatura(v.id)} alt="" loading="lazy" />
                      </a>
                    </td>
                    <td>
                      <a className="titulo-video" href={enYoutube(v.id)} target="_blank" rel="noreferrer">
                        {v.titulo}
                      </a>
                      <div className="muted small">
                        {fechaCorta(v.fecha)} · {Math.round(v.segundos / 60)} min
                        {v.privado && <span className="idea-marca">privado</span>}
                      </div>
                    </td>
                    <td className="num">{mil(v.impresiones)}</td>
                    <td
                      className={`num ${(v.impresiones ?? 0) >= POCAS ? nivel(v.ctr, 3, 2) : ''}`}
                      title={v.impresiones !== undefined && v.impresiones < POCAS ? `Con ${v.impresiones} impresiones, el % todavía no dice mucho` : undefined}
                    >
                      {pct(v.ctr)}
                    </td>
                    <td className="num">{v.vistas.toLocaleString('es-MX')}</td>
                    <td className={`num ${nivel(v.visto, 40, 25)}`} title={v.duracionMedia ? `${Math.floor(v.duracionMedia / 60)}:${String(v.duracionMedia % 60).padStart(2, '0')} en promedio` : undefined}>
                      {pct(v.visto)}
                    </td>
                    <td className={`num ${nivel(v.a30, 65, 50)}`} title={v.a60 !== undefined ? `Al minuto: ${v.a60} %` : undefined}>
                      {pct(v.a30)}
                    </td>
                    <td className="llegaron" title={fuentes.map(([f, n]) => `${FUENTE[f] ?? f}: ${n}`).join('\n')}>
                      {fuente ? (
                        <>
                          {FUENTE[fuente] ?? fuente} <span className="muted">{Math.round((vistas! / Math.max(1, total)) * 100)} %</span>
                          {v.busquedas?.[0] && <div className="muted small">«{v.busquedas[0][0]}»</div>}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="muted small">
            {r.studio ? `Mostrado y clics: de Studio, leídos el ${fechaCorta(r.studio)} al diagnosticar.` : 'Mostrado y clics salen de Studio: los lee Claude al diagnosticar.'} Lo demás
            es de YouTube Analytics, que tarda 2 o 3 días en dar un video nuevo.
          </p>
        </>
      )}
      {a && (
        <dl className="audiencia">
          <dt>Quién te ve</dt>
          <dd>
            {edades.map(([e, n]) => `${e} (${Math.round(n)} %)`).join(', ') || 'Sin datos de edad'}
            {a.paises.length > 0 && ` · ${a.paises.map(([p, n]) => `${pais.of(p) ?? p} ${Math.round(n)} %`).join(', ')}`}
          </dd>
          <dt>En qué</dt>
          <dd>{a.dispositivos.map(([x, n]) => `${APARATO[x] ?? x.toLowerCase()} ${Math.round(n)} %`).join(', ')}</dd>
          {a.deSuscriptores !== undefined && (
            <>
              <dt>Suscriptores</dt>
              <dd>
                {r!.canal.suscriptores} · de ellos sale el {pct(a.deSuscriptores)} de tus vistas
              </dd>
            </>
          )}
        </dl>
      )}
      {d.diagnostico ? (
        <div className="diagnostico">
          <div className="caja-l">Diagnóstico</div>
          <Md texto={d.diagnostico} />
        </div>
      ) : (
        r &&
        !diagnosticando && <p className="muted small">Pulsa «Diagnosticar»: Claude suma lo que dice Studio y te dice qué cambiar en la siguiente tanda.</p>
      )}
    </section>
  )
}

/** Los pasos del canal, de un vistazo: qué está hecho, qué está en marcha y qué sigue. */
function Pasos({ d, corriendo }: { d: CanalCompleto; corriendo: boolean }) {
  const t = d.trabajo
  const n = d.ideas?.ideas.length ?? 0
  const grabar = Object.keys(d.esquemas).length
  const pasos: { nombre: string; estado: 'ok' | 'on' | 'no'; texto: string }[] = [
    { nombre: 'Canal', estado: d.canal.publico ? 'ok' : 'on', texto: d.canal.publico ? 'Público definido' : 'Falta decir a quién le hablas' },
    {
      nombre: 'Investigación',
      estado: t?.estado === 'trabajando' ? 'on' : d.investigacion?.videos.length ? 'ok' : 'no',
      texto: t?.estado === 'trabajando' ? t.fase : d.investigacion?.hecha ? `Hecha ${hace(d.investigacion.hecha)}` : 'Sin hacer'
    },
    {
      nombre: 'Ideas',
      estado: corriendo ? 'on' : n ? 'ok' : 'no',
      texto: corriendo ? (d.formatos ? 'Escribiendo las ideas' : d.demanda ? 'Buscando fórmulas' : 'Leyendo la demanda') : n ? `${n} ideas` : 'Sin proponer'
    },
    { nombre: 'Para grabar', estado: grabar ? 'ok' : 'no', texto: grabar ? `${grabar} con esquema` : 'Elige una idea' }
  ]
  return (
    <ol className="ideas-pasos">
      {pasos.map((p, i) => (
        <li key={p.nombre} className={p.estado}>
          <span className="ideas-paso-n">{p.estado === 'ok' ? '✓' : i + 1}</span>
          <span>
            <strong>{p.nombre}</strong>
            <small>{p.texto}</small>
          </span>
        </li>
      ))}
    </ol>
  )
}

const ICONO: Record<PasoYT['tipo'], string> = { buscar: '🔎', canal: '📺', fecha: '📅', comentarios: '💬', transcribir: '🎙', temas: '🧭', pausa: '⏸', error: '⚠', info: '·' }

/**
 * Las cuentas con que se investiga (buscan y leen comentarios), nunca las que publican: una de TikTok y una de Instagram,
 * en el mismo Edge. Sin sesión, «Iniciar sesión» abre ese Edge en el login de su red; mientras está abierto y falta
 * alguna, se vuelve a mirar cada pocos segundos.
 */
function CuentasInvestigacion({ canal, trabajando }: { canal: Canal; trabajando: boolean }) {
  const [c, setC] = useState<CuentaInvestigacion | null>(null)
  // La red cuyo login se abrió desde aquí: a esa le toca la indicación de la ventana de Edge.
  const [abierta, setAbierta] = useState<RedVertical | null>(null)
  const [error, setError] = useState('')
  const leer = () => api<CuentaInvestigacion>(`/api/ideas/${canal.id}/tiktok`).then((r) => (setC(r), setError('')), (e) => setError(e.message))
  // Al investigar también se abre: al acabar, la sesión pudo cambiar.
  useEffect(() => void leer(), [canal.id, trabajando])
  const falta = !!c && (!c.cuenta || !c.instagram)
  useEffect(() => {
    if (!c?.abierto || !falta) return
    const i = setInterval(leer, 4000)
    return () => clearInterval(i)
  }, [c?.abierto, falta])
  const abrir = (red: RedVertical) => (setError(''), setAbierta(red), api(`/api/ideas/${canal.id}/navegador`, { red }).then(leer, (e) => setError(e.message)))
  if (!c) return error ? <p className="bad small">{error}</p> : null
  // Con su Edge cerrado no se puede preguntar por la sesión: se abre solo al investigar, con las sesiones de su perfil.
  if (!c.abierto)
    return (
      <div className="cuentas-investigacion small">
        <div className="cuenta-red">
          <Logo de="tiktok" chico />
          <Logo de="instagram" chico />
          <span className="muted">Cuentas de investigación: su navegador está cerrado. Se abre solo al investigar, con las sesiones guardadas.</span>
          <button className="ghost small" onClick={() => abrir('tiktok')} title="Abrirlo ahora para ver con quién tiene sesión cada red">
            Abrirlo
          </button>
        </div>
        {error && <span className="bad">{error}</span>}
      </div>
    )
  const tuya = canal.instagram ? `@${usuarioDe(canal.instagram)}` : 'la tuya'
  const redes = [
    {
      red: 'tiktok' as const,
      usuario: c.cuenta,
      pista: c.abierto && abierta !== 'instagram' ? 'Inicia sesión con el QR en la ventana de Edge.' : 'Con ella busca Sloth y lee los comentarios.'
    },
    {
      red: 'instagram' as const,
      usuario: c.instagram ?? null,
      pista: `${c.abierto && abierta === 'instagram' ? 'Inicia sesión en la ventana de Edge. ' : ''}Que sea una cuenta desechable, nunca ${tuya}.`
    }
  ]
  return (
    <div className="cuentas-investigacion small">
      {redes.map(({ red, usuario, pista }) => (
        <div key={red} className="cuenta-red">
          <Logo de={red} chico />
          {usuario ? (
            <span>
              Cuenta de investigación: <strong>@{usuarioDe(usuario)}</strong>
            </span>
          ) : (
            <>
              <span className="muted">Cuenta de investigación: sin sesión. {pista}</span>
              <button className="ghost small" onClick={() => abrir(red)}>
                Iniciar sesión
              </button>
            </>
          )}
        </div>
      ))}
      {error && <span className="bad">{error}</span>}
    </div>
  )
}

/**
 * Lo que lleva la investigación en curso, contando solo: la sección, con sus tablas, no se vuelve a dibujar cada segundo
 * para moverlo.
 */
function Cronometro({ desde }: { desde: number }) {
  const [ahora, setAhora] = useState(Date.now)
  useEffect(() => {
    const i = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])
  const s = Math.max(0, Math.round((ahora - desde) / 1000))
  return <>{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</>
}

function Investigacion({
  d,
  vista,
  onCambio,
  filtro,
  onFiltro
}: {
  d: CanalCompleto
  vista: Investigacion | null
  onCambio(): void
  filtro: string | null
  onFiltro(t: string | null): void
}) {
  const t = d.trabajo
  const trabajando = t?.estado === 'trabajando'
  const [error, setError] = useState('')
  const [pestana, setPestana] = useState<'outliers' | 'temas' | 'busquedas' | 'canales'>('outliers')
  const [todo, setTodo] = useState(false)
  const lista = useRef<HTMLOListElement>(null)
  const tablas = useRef<HTMLDivElement>(null)

  // Al elegir una búsqueda, se ven sus outliers.
  useEffect(() => {
    if (!filtro) return
    setPestana('outliers')
    requestAnimationFrame(() => tablas.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [filtro])

  // El registro baja solo mientras se escribe.
  useEffect(() => {
    if (trabajando) lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: 'smooth' })
  }, [t?.pasos.length, trabajando])

  const empezar = () => (setError(''), api(`/api/ideas/${d.canal.id}/investigar`, {}).then(onCambio, (e) => setError(e.message)))
  const pasos = t ? (trabajando || todo ? t.pasos : t.pasos.slice(-6)) : []
  const segundos = t ? Math.round(((t.termino ?? Date.now()) - t.empezo) / 1000) : 0
  const toda = d.investigacion
  const inv = vista
  // Lo que se buscó con términos que ya no están en el perfil: se guarda, pero no cuenta. Una frase vertical son dos
  // búsquedas (TikTok e Instagram): se cuentan las frases.
  const frases = (x: Investigacion) => new Set(x.terminos.map((t) => t.termino)).size
  const fuera = toda && inv ? frases(toda) - frases(inv) : 0
  const vertical = esVertical(d.canal)
  // La pestaña Temas, solo si la investigación ya los agrupó.
  const temas = d.temas?.temas.length ? d.temas : null
  const ver = pestana === 'temas' && !temas ? 'outliers' : pestana

  return (
    <section className="ideas-bloque">
      <div className="ideas-bloque-head">
        <h2>Investigación</h2>
        <span className="muted small">
          {inv?.hecha
            ? `${inv.terminos.length} búsquedas · ${inv.canales.length} ${vertical ? 'cuentas' : 'canales'} · ${inv.videos.filter(esOutlier).length} outliers`
            : vertical
              ? 'Lo que TikTok e Instagram dicen de tu nicho'
              : 'Lo que YouTube dice de tu nicho'}
        </span>
        <span className="spacer" />
        {trabajando ? (
          <button className="ghost" onClick={() => api(`/api/ideas/${d.canal.id}/detener`, {})}>
            Detener
          </button>
        ) : (
          <button
            className="primary"
            disabled={!d.ytdlp}
            onClick={empezar}
            title={
              vertical
                ? 'Busca cada término en TikTok y en Instagram, abre las cuentas que salen y mide cada video contra su cuenta. Lo hecho en los últimos 3 días no se repite'
                : 'Busca cada término, abre los canales que salen y mide cada video contra su canal. Lo hecho en los últimos 3 días no se repite'
            }
          >
            {toda?.videos.length ? 'Investigar otra vez' : 'Investigar'}
          </button>
        )}
      </div>
      {!d.ytdlp && (
        <p className="bad small">
          Falta yt-dlp para leer {vertical ? 'TikTok e Instagram' : 'YouTube'}: instala el Python de Sloth, o corre «python -m pip install yt-dlp».
        </p>
      )}
      {vertical && <CuentasInvestigacion canal={d.canal} trabajando={trabajando} />}
      {vertical && !d.meta && (
        <p className="muted small">
          Sin el token de Meta, las cuentas de Instagram no se miden: sus Reels no tienen vistas ni salen como outliers. Ponlo en ⚙ Opciones → Llaves de API →
          «Instagram (Meta)».
        </p>
      )}
      {fuera > 0 && (
        <p className="muted small">
          {fuera === 1 ? 'Una búsqueda de antes ya no está' : `${fuera} búsquedas de antes ya no están`} en tu perfil: lo que trajeron no cuenta aquí ni en las ideas. Sigue
          guardado, por si las vuelves a poner.
        </p>
      )}
      {!toda && !t && vertical && (
        <p className="muted small">
          Sloth busca cada término en TikTok y en Instagram, cada red con su cuenta de investigación; la de Instagram es una cuenta desechable aparte, nunca{' '}
          {d.canal.instagram ? `@${usuarioDe(d.canal.instagram)}` : 'la tuya'}. Abre las cuentas de los videos más vistos y mide cada video contra la mediana de su
          cuenta: los que sacan {OUTLIER} veces o más, con al menos {mil(MIN_VISTAS_VERTICAL)} vistas, son outliers. De los mejores lee los comentarios con más
          likes, para saber qué pide la gente. También transcribe lo que se dice en cada video y lo agrupa en temas por lo que dicen, aunque estén en otro
          idioma.
        </p>
      )}
      {!toda && !t && !vertical && (
        <p className="muted small">
          Sloth busca cada término en YouTube y se queda con los videos de 4 minutos o más. Abre los canales de los más vistos y mide cada video contra la mediana
          de sus videos largos: los que sacan {OUTLIER} veces o más, con al menos {mil(MIN_VISTAS)} vistas, son outliers, una señal de que ese tema tiene demanda. También transcribe lo que se dice en cada video y lo agrupa en temas por lo que dicen. Tarda unos minutos y no gasta nada.
        </p>
      )}
      {!vertical && !d.api && (toda || t) && (
        <p className="muted small">
          Sin la llave de la API de YouTube, la fecha y los comentarios salen solo de los 30 mejores outliers, uno por uno. Con ella, de todos y en segundos: ⚙
          Opciones → API de YouTube.
        </p>
      )}
      {error && <p className="bad small">{error}</p>}
      {t && (
        <div className={`trabajo ${t.estado}`}>
          <div className="trabajo-estado">
            {trabajando && <span className="spinner" />}
            <strong>{trabajando ? t.fase : t.estado === 'listo' ? 'Última investigación' : t.estado === 'detenido' ? 'Detenida' : 'Falló'}</strong>
            <span className="muted small">
              {trabajando ? <Cronometro desde={t.empezo} /> : `${hace(t.termino ?? t.empezo)} · duró ${Math.max(1, Math.round(segundos / 60))} min`}
            </span>
            <span className="spacer" />
            {!trabajando && t.pasos.length > 6 && (
              <button className="ghost small" onClick={() => setTodo(!todo)}>
                {todo ? 'Ver menos' : `Ver los ${t.pasos.length} pasos`}
              </button>
            )}
          </div>
          {trabajando && (
            <div className="barra" title={`${t.hecho} de unos ${t.total} pasos`}>
              <span style={{ width: `${Math.min(100, (t.hecho / Math.max(1, t.total)) * 100)}%` }} />
            </div>
          )}
          <ol className="registro" ref={lista}>
            {pasos.map((p, i) => (
              <li key={`${p.at}-${i}`} className={p.tipo}>
                <span className="registro-icono">{ICONO[p.tipo]}</span>
                <span className="registro-texto">
                  {p.texto}
                  {p.detalle && <small>{p.detalle}</small>}
                </span>
                <time className="muted small">{new Date(p.at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</time>
              </li>
            ))}
          </ol>
          {t.error && <p className="bad small">{t.error}</p>}
        </div>
      )}
      {inv && inv.videos.length > 0 && (
        <>
          <div className="segmento pestanas" role="tablist" ref={tablas}>
            {(
              [
                ['outliers', 'Outliers'],
                ['temas', 'Temas'],
                ['busquedas', 'Búsquedas'],
                ['canales', vertical ? 'Cuentas' : 'Canales']
              ] as const
            )
              .filter(([k]) => k !== 'temas' || temas)
              .map(([k, nombre]) => (
                <button key={k} role="tab" aria-selected={ver === k} className={ver === k ? 'on' : ''} onClick={() => setPestana(k)}>
                  {nombre}
                </button>
              ))}
          </div>
          {ver === 'outliers' && <Outliers inv={inv} canal={d.canal} temas={d.temas} filtro={filtro} onFiltro={onFiltro} />}
          {ver === 'temas' && temas && <TablaTemas temas={temas} inv={inv} canal={d.canal} />}
          {ver === 'busquedas' && <Busquedas inv={inv} vertical={vertical} onFiltro={onFiltro} />}
          {ver === 'canales' && <Canales inv={inv} vertical={vertical} />}
        </>
      )}
    </section>
  )
}

/** Las señales de un video que cambian lo que vale como evidencia. Dicen lo que se ve en los datos, no lo que se supone. */
function Marcas({ v, propio }: { v: VideoYT; propio?: boolean }) {
  return (
    <>
      {propio && <span className="idea-marca">{v.red ? 'tu cuenta' : 'tu canal'}</span>}
      <Idioma de={v.idioma} />
      {v.sinVoz && (
        <span className="idea-marca" title="El gancho está en la imagen, no en lo dicho">
          sin voz
        </span>
      )}
      {v.fijado && (
        <span className="idea-marca" title="Fijado arriba de su perfil: suele ser viejo y no entra en la mediana de su cuenta">
          fijado
        </span>
      )}
      {sospechoso(v) && (
        <span
          className="idea-marca mal"
          title={`${v.comentarios} comentarios en ${mil(v.vistas)} vistas (${porMil(v)!.toFixed(3)} por mil): inusualmente pocos; uno orgánico anda entre 0,4 y 30. Puede ser publicidad pagada o tener los comentarios cerrados. Míralo antes de contarlo como demanda.`}
        >
          pocos comentarios
        </span>
      )}
      {v.pagado && (
        <span className="idea-marca mal" title="Colaboración pagada: sus vistas no son demanda orgánica. Sirve por su empaque, no como prueba de que el tema se pide">
          pagado
        </span>
      )}
      {viejo(v.fecha) && (
        <span className="idea-marca" title="De hace más de un año: en temas que caducan (IA, tecnología) vale poco">
          viejo
        </span>
      )}
    </>
  )
}

/**
 * En vertical, si lo que funciona en otro idioma ya existe en español (`temas.json`): cuántos parecidos tiene, o el hueco,
 * que es lo que está por traerse.
 */
function Parecidos({ de, videos }: { de: [string, number][]; videos: Map<string, VideoYT> }) {
  if (!de.length)
    return (
      <span className="idea-marca hueco" title="Funciona en otro idioma y en español no hay nada que hable de lo mismo: está por traerse">
        nada parecido en español
      </span>
    )
  const lista = de.map(([id, s]) => `${Math.round(s * 100)} % · ${videos.get(id)?.titulo.replace(/\s+/g, ' ').slice(0, 90) ?? id}`)
  return (
    <span className="idea-marca" title={`Lo más parecido en español:\n${lista.join('\n')}`}>
      en español: {de.length} {de.length === 1 ? 'parecido' : 'parecidos'}
    </span>
  )
}

/** Un video en una línea, con su portada o miniatura y su enlace: la evidencia de una idea, o lo mejor de un tema. */
function VideoFila({ v, canalId, propio }: { v: VideoYT; canalId: string; propio?: boolean }) {
  return (
    <a className="evidencia" href={enlace(v)} target="_blank" rel="noreferrer">
      {v.red ? <Portada canalId={canalId} v={v} /> : <img src={miniatura(v.id)} alt="" loading="lazy" />}
      <span>
        <span className="evidencia-t">{v.titulo}</span>
        <span className="muted small">
          {sinVistas(v) ? (
            <span title="Un Reel de la búsqueda de Instagram: sus vistas llegan al medir la cuenta de su autor, y esta no se pudo medir">
              sin vistas: cuenta no medible
            </span>
          ) : (
            <>
              {v.x !== undefined ? (
                <span className="x">{veces(v.x)}</span>
              ) : (
                <span title="Su canal no se abrió o no se pudo medir: dice que el tema se busca, no que superó a su canal">sin medir</span>
              )}{' '}
              · {mil(v.vistas)} {v.red && guardadosPorMil(v) !== undefined && `· ${xMil(guardadosPorMil(v))} guard./mil `}
            </>
          )}
          · {fechaDe(v)} · {v.canal} <Marcas v={v} propio={propio} />
        </span>
        {v.gancho && (
          <span className="evidencia-dice small" title={v.gancho}>
            <span className="muted">Dice:</span> «{v.gancho}»
          </span>
        )}
      </span>
    </a>
  )
}

function Outliers({
  inv,
  canal,
  temas,
  filtro,
  onFiltro
}: {
  inv: Investigacion
  canal: Canal
  temas?: Temas | null
  filtro: string | null
  onFiltro(t: string | null): void
}) {
  const [orden, setOrden] = useState<'x' | 'vistas' | 'fecha'>('x')
  // Pocos comentarios es una señal para mirar, no una prueba: se ven por defecto, con su dato.
  const [ocultarRaros, setOcultarRaros] = useState(false)
  const [recientes, setRecientes] = useState(false)
  const [idioma, setIdioma] = useState<'todos' | 'es' | 'en'>('todos')
  const [cuantos, setCuantos] = useState(40)
  const vertical = esVertical(canal)
  const propios = new Set(inv.canales.filter(tuyo).map((c) => c.id))
  const todos = inv.videos.filter((v) => esOutlier(v) && !propios.has(v.canalId))
  const conFecha = todos.filter((v) => v.fecha).length
  // El español es la demanda de quien compra; el inglés, empaque y modas para traer. Se separan solo si hay de los dos.
  const dosIdiomas = vertical && todos.some((v) => enEspanol(v.idioma)) && todos.some((v) => v.idioma === 'en')
  const enIdioma = dosIdiomas ? idioma : 'todos'
  const filas = useMemo(
    () =>
      todos
        .filter((v) => !filtro || v.de.includes(filtro))
        .filter((v) => enIdioma === 'todos' || (enIdioma === 'en' ? v.idioma === 'en' : enEspanol(v.idioma)))
        .filter((v) => !ocultarRaros || !sospechoso(v))
        .filter((v) => !recientes || (meses(v.fecha) ?? Infinity) <= 12)
        .sort((a, b) => (orden === 'x' ? (b.x ?? 0) - (a.x ?? 0) : orden === 'vistas' ? b.vistas - a.vistas : (b.fecha ?? '').localeCompare(a.fecha ?? ''))),
    [inv, orden, ocultarRaros, recientes, filtro, enIdioma]
  )
  const vecino = inv.terminos.find((t) => t.termino === filtro)?.vecino
  const porId = useMemo(() => new Map(inv.videos.map((v) => [v.id, v])), [inv])
  // En vertical, lo que no es en español dice si ya existe en español: así se ve lo que falta traer. Solo si ya se comparó:
  // un outlier que aún no está en temas.json no es «nada parecido», es que no se sabe.
  const parecidos = (v: VideoYT) => (vertical && temas && !enEspanol(v.idioma) ? (temas.enEspanol[v.id] ?? null) : null)
  return (
    <div className="tabla-wrap">
      {filtro && (
        <div className="filtro-activo small">
          <span>
            Solo {vertical ? 'las cuentas' : 'los canales'} que trajo «{filtro}»{vertical ? ', en TikTok y en Instagram' : ''}
            {vecino ? `, un nicho vecino: mira sus fórmulas de ${vertical ? 'gancho' : 'título'}, no su tema` : ''}
          </span>
          <button className="ficha boton on" onClick={() => onFiltro(null)}>
            Ver todos ✕
          </button>
        </div>
      )}
      <div className="filtros small">
        {dosIdiomas && (
          <Segmento<typeof idioma>
            label="Idioma"
            valor={enIdioma}
            onCambio={setIdioma}
            opciones={[
              { id: 'todos', texto: 'Todos' },
              { id: 'es', texto: 'Español', title: 'La demanda de quien compra. También los que no dicen su idioma (solo hashtags)' },
              { id: 'en', texto: 'Inglés', title: 'Empaque y modas que suelen llegar antes al español, para traerlas' }
            ]}
          />
        )}
        <span className="muted">Ordenar por</span>
        <select value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)}>
          <option value="x">{vertical ? '× su cuenta' : '× su canal'}</option>
          <option value="vistas">vistas</option>
          <option value="fecha">más recientes</option>
        </select>
        <label title="Muchas vistas y casi ningún comentario (menos de 0,15 por mil). Puede ser publicidad pagada, o no">
          <input type="checkbox" checked={ocultarRaros} onChange={(e) => setOcultarRaros(e.target.checked)} /> Ocultar los de comentarios inusualmente bajos
        </label>
        <label title="Solo los que tienen fecha y son del último año">
          <input type="checkbox" checked={recientes} onChange={(e) => setRecientes(e.target.checked)} /> Solo del último año
        </label>
        <span className="spacer" />
        {vertical ? (
          <span className="muted">{filas.length} outliers</span>
        ) : (
          <span className="muted" title="Sin la llave de la API de YouTube, la fecha y los comentarios se leen solo de los mejores">
            {filas.length} outliers · {conFecha} de {todos.length} con fecha y comentarios
          </span>
        )}
      </div>
      <table className="tabla">
        <thead>
          <tr>
            <th />
            <th>Video</th>
            <th title={`Sus vistas entre la mediana de ${vertical ? 'los videos de su cuenta' : 'los videos largos de su canal'}`}>×</th>
            <th>Vistas</th>
            {vertical && <th title="Guardados por cada mil vistas: «esto lo voy a usar», lo más cercano a querer comprar">Guard./mil</th>}
            {vertical && <th title="Compartidos por cada mil vistas: «esto es para alguien»">Comp./mil</th>}
            {!vertical && <th>Fecha</th>}
            <th title="Comentarios por cada mil vistas. Uno orgánico anda entre 0,4 y 30; con muchas vistas y casi ninguno, míralo antes de contarlo">Com./mil</th>
            {vertical && <th>Fecha</th>}
          </tr>
        </thead>
        <tbody>
          {filas.slice(0, cuantos).map((v) => (
            <tr key={v.id}>
              <td className={v.red ? 'celda-portada' : 'celda-mini'}>
                <a href={enlace(v)} target="_blank" rel="noreferrer">
                  {v.red ? <Portada canalId={canal.id} v={v} /> : <img src={miniatura(v.id)} alt="" loading="lazy" />}
                </a>
              </td>
              <td>
                <a className={v.red ? 'titulo-video texto-vertical' : 'titulo-video'} href={enlace(v)} target="_blank" rel="noreferrer" title={v.red ? v.titulo : undefined}>
                  {v.titulo}
                </a>
                <div className="muted small">
                  {v.canal} · {dura(v)} · de {v.de.map((d) => `«${d}»`).join(', ')} <Marcas v={v} />
                  {parecidos(v) && <Parecidos de={parecidos(v)!} videos={porId} />}
                </div>
                {v.gancho && (
                  <div className="dice small" title={v.gancho}>
                    <span className="muted">Dice:</span> «{v.gancho}»
                  </div>
                )}
                {!!v.destacados?.length && (
                  <details className="destacados small">
                    <summary className="muted">💬 Lo que más se comenta</summary>
                    <ul>
                      {v.destacados.map((c, i) => (
                        <li key={i}>
                          {c.texto} <span className="muted">· {mil(c.likes)} likes</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </td>
              <td className="num x">{veces(v.x!)}</td>
              <td className="num">{mil(v.vistas)}</td>
              {vertical && <td className="num">{xMil(guardadosPorMil(v))}</td>}
              {vertical && <td className="num">{xMil(compartidosPorMil(v))}</td>}
              {!vertical && <td className="num muted">{fechaDe(v)}</td>}
              <td className={`num ${sospechoso(v) ? 'bad' : 'muted'}`}>{xMil(porMil(v))}</td>
              {vertical && <td className="num muted">{fechaDe(v)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length > cuantos && (
        <button className="ghost small" onClick={() => setCuantos(cuantos + 40)}>
          Ver {Math.min(40, filas.length - cuantos)} más
        </button>
      )}
    </div>
  )
}

/** Dónde se ve una búsqueda vertical por dentro de su red. */
const buscarEn = (t: TerminoYT) =>
  t.red === 'instagram'
    ? `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(t.termino)}`
    : `https://www.tiktok.com/search?q=${encodeURIComponent(t.termino)}`

/**
 * Las búsquedas, por frase. En vertical cada frase se busca en TikTok y en Instagram: la frase va una vez, con una fila por
 * red debajo. La búsqueda de Instagram no da vistas; su mediana es la de los Reels cuya cuenta se pudo medir.
 */
function Busquedas({ inv, vertical, onFiltro }: { inv: Investigacion; vertical: boolean; onFiltro(t: string): void }) {
  const max = Math.max(1, ...inv.terminos.map((t) => t.mediana))
  // Los outliers de una búsqueda son los de su red: los de la otra los cuenta su propia fila.
  const outliersDe = (t: TerminoYT) => inv.videos.filter((v) => v.de.includes(t.termino) && v.red === t.red && esOutlier(v)).length
  const videos = vertical ? 'videos' : 'videos largos'
  const porFrase = new Map<string, TerminoYT[]>()
  for (const t of inv.terminos) porFrase.set(t.termino, [...(porFrase.get(t.termino) ?? []), t])
  const grupos = [...porFrase.values()]
    .map((g) => g.sort((a, b) => Number(a.red === 'instagram') - Number(b.red === 'instagram')))
    .sort((a, b) => Math.max(...b.map((t) => t.mediana)) - Math.max(...a.map((t) => t.mediana)))
  return (
    <div className="tabla-wrap">
      <p className="muted small">
        La mediana de vistas de los {videos} que da cada búsqueda: la medida más tosca de la demanda, y la palabra con que el público lo pide. Mira las parecidas:
        «crear» contra «automatizar» puede cambiar todo.
        {vertical && ' En Instagram la búsqueda no da vistas: su mediana es la de los Reels cuya cuenta se pudo medir.'}
      </p>
      <table className="tabla busquedas">
        <thead>
          <tr>
            <th>Búsqueda</th>
            {vertical && <th>Red</th>}
            <th>Mediana</th>
            <th />
            <th title={`Outliers en ${vertical ? 'las cuentas' : 'los canales'} que trajo esta búsqueda`}>Outliers</th>
          </tr>
        </thead>
        {grupos.map((g) => {
          const { termino, vecino } = g[0]
          return (
            <tbody key={termino} className="frase">
              {g.map((t, i) => {
                const ig = t.red === 'instagram'
                return (
                  <tr key={t.red ?? 'youtube'}>
                    {i === 0 && (
                      <td rowSpan={g.length}>
                        <button className="titulo-video enlace" title="Ver los outliers que trajo, de las dos redes" onClick={() => onFiltro(termino)}>
                          {termino}
                        </button>{' '}
                        {vecino && <span className="idea-marca">nicho vecino</span>}
                        <Idioma de={g.find((x) => x.idioma)?.idioma} title={BUSQUEDA_EN} />
                        {!vertical && (
                          <div className="muted small">
                            {t.largos} {videos} ·{' '}
                            <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(termino)}`} target="_blank" rel="noreferrer">
                              buscar en YouTube ↗
                            </a>
                          </div>
                        )}
                      </td>
                    )}
                    {vertical && (
                      <td className="busqueda-red muted small">
                        <Logo de={t.red ?? 'tiktok'} chico />
                        {t.largos} {ig ? 'Reels' : 'videos'} ·{' '}
                        <a href={buscarEn(t)} target="_blank" rel="noreferrer">
                          buscar en {ig ? 'Instagram' : 'TikTok'} ↗
                        </a>
                      </td>
                    )}
                    <td className="num" title={ig ? (t.mediana ? 'De los Reels cuya cuenta se pudo medir' : 'Ningún Reel de esta búsqueda se pudo medir') : undefined}>
                      {ig && !t.mediana ? '—' : mil(t.mediana)}
                    </td>
                    <td className="celda-barra">
                      <span className="barra-h" style={{ width: `${(t.mediana / max) * 100}%` }} />
                    </td>
                    <td className="num">{outliersDe(t) || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}

function Canales({ inv, vertical }: { inv: Investigacion; vertical: boolean }) {
  // Contados en una pasada: el orden los pedía por cada par de canales, y recorrer los videos cada vez tardaba 80 ms.
  const cuenta = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const v of inv.videos) if (esOutlier(v)) cuenta.set(v.canalId, (cuenta.get(v.canalId) ?? 0) + 1)
    return cuenta
  }, [inv])
  const outliers = (id: string) => cuenta.get(id) ?? 0
  // Los suscriptores no miden nada aquí: solo dan contexto, y solo los da la API de YouTube.
  const conSubs = inv.canales.some((c) => c.subs !== undefined)
  const videos = vertical ? 'videos' : 'videos largos'
  return (
    <div className="tabla-wrap">
      {vertical ? (
        <p className="muted small">
          Cada video se compara con la <strong>mediana</strong> de los últimos videos de su cuenta, sin los fijados: lo que esa cuenta saca normalmente. Es outlier si
          saca {OUTLIER} veces eso y al menos {mil(MIN_VISTAS_VERTICAL)} vistas. Con menos de {MIN_MUESTRA} videos, la cuenta no se mide. Los seguidores no entran en el
          cálculo: solo dan contexto.
        </p>
      ) : (
        <p className="muted small">
          Cada video largo se compara con la <strong>mediana</strong> de los últimos videos largos de su canal: lo que ese canal saca normalmente. Es outlier si
          saca {OUTLIER} veces eso y al menos {mil(MIN_VISTAS)} vistas. Con menos de {MIN_MUESTRA} videos largos, el canal no se mide. Los suscriptores no entran en la cuenta
          {conSubs ? '.' : ': solo dan contexto, y salen con la llave de la API de YouTube (⚙ Opciones).'}
        </p>
      )}
      <table className="tabla">
        <thead>
          <tr>
            <th>{vertical ? 'Cuenta' : 'Canal'}</th>
            <th title={`Mediana de vistas de sus últimos ${videos}: su normal`}>Mediana</th>
            <th>Outliers</th>
            {conSubs && <th>{vertical ? 'Seguidores' : 'Suscriptores'}</th>}
          </tr>
        </thead>
        <tbody>
          {[...inv.canales]
            .sort((a, b) => Number(tuyo(b)) - Number(tuyo(a)) || outliers(b.id) - outliers(a.id))
            .map((c) => (
              <tr key={c.id}>
                <td>
                  {c.red ? (
                    <>
                      <Logo de={c.red} chico />
                      <a href={c.url} target="_blank" rel="noreferrer" title={c.nombre}>
                        @{usuarioDe(c.usuario ?? c.url)}
                      </a>
                    </>
                  ) : (
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.nombre}
                    </a>
                  )}{' '}
                  {tuyo(c) && <span className="idea-marca">{c.red ? 'tu cuenta' : 'tu canal'}</span>}
                  <Idioma de={c.idioma} />
                  {!medible(c) ? (
                    <span className="idea-marca" title={`Su mediana sale de solo ${c.videos} ${videos}: es un azar, y sus videos no se miden`}>
                      muestra chica
                    </span>
                  ) : (
                    c.mediana < 100 && (
                      <span className="idea-marca" title="Con tan pocas vistas de normal, cualquier video parece outlier: no cuenta como demanda">
                        muy pocas vistas para medir
                      </span>
                    )
                  )}
                  <div className="muted small">
                    de «{c.de}» · mediana de {c.videos} {videos}
                  </div>
                </td>
                <td className="num">{mil(c.mediana)}</td>
                <td className="num">{outliers(c.id) || '—'}</td>
                {conSubs && <td className="num muted">{mil(c.subs)}</td>}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Los temas (`temas.json`): los videos agrupados por lo que dicen, aunque usen otras palabras u otro idioma. Se cuenta lo
 * de la investigación de hoy y van primero los de más outliers. Al abrir uno, sus mejores outliers y los videos que mejor
 * lo representan.
 */
function TablaTemas({ temas, inv, canal }: { temas: Temas; inv: Investigacion; canal: Canal }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const vertical = esVertical(canal)
  const propios = new Set(inv.canales.filter(tuyo).map((c) => c.id))
  const videos = new Map(inv.videos.map((v) => [v.id, v]))
  // Cuántos de sus videos medidos sacan más que lo normal de su cuenta. Se lee contra la de toda la investigación.
  const pasan = (vs: VideoYT[]) => {
    const medidos = vs.filter((v) => v.x !== undefined && v.vistas > 0)
    return medidos.length ? medidos.filter((v) => v.x! > 1).length / medidos.length : undefined
  }
  const pct = (p?: number) => (p === undefined ? '—' : `${Math.round(p * 100)} %`)
  const base = pasan(inv.videos)
  const filas = temas.temas
    .map((t) => {
      const vs = t.ids.map((id) => videos.get(id)).filter((v): v is VideoYT => !!v)
      const outliers = vs.filter((v) => esOutlier(v) && !propios.has(v.canalId)).sort((a, b) => (b.x ?? 0) - (a.x ?? 0))
      return { t, vs, outliers, pasa: pasan(vs) }
    })
    .filter((f) => f.vs.length)
    .sort((a, b) => b.outliers.length - a.outliers.length || b.vs.length - a.vs.length)
  // Cuántos hay de cada red o idioma, de más a menos.
  const cuantos = (vs: VideoYT[], de: (v: VideoYT) => string) => {
    const n = new Map<string, number>()
    for (const v of vs) n.set(de(v), (n.get(de(v)) ?? 0) + 1)
    return [...n].sort((a, b) => b[1] - a[1])
  }
  const suya = vertical ? 'su cuenta' : 'su canal'
  return (
    <div className="tabla-wrap">
      <p className="muted small">
        Los videos agrupados por lo que dicen, {vertical ? 'su descripción' : 'su título'} y lo que se dice en ellos, aunque usen otras palabras u otro idioma.
        «Pasan su mediana» es cuántos de sus videos medidos sacan más que lo normal de {suya}: en toda la investigación, el {pct(base)}. Un tema destaca si pasa
        claro de esa base.
      </p>
      <table className="tabla temas">
        <thead>
          <tr>
            <th>Tema</th>
            <th>Videos</th>
            <th title="Outliers entre sus videos, sin los tuyos">Outliers</th>
            <th title={`De sus videos medidos, cuántos sacan más que la mediana de ${suya}. En toda la investigación, el ${pct(base)}`}>Pasan su mediana</th>
            {vertical && <th>Dónde</th>}
          </tr>
        </thead>
        {filas.map(({ t, vs, outliers, pasa }) => {
          const abre = abierto === t.id
          const mejores = outliers.slice(0, 4)
          const ejemplos = t.ejemplos
            .map((id) => videos.get(id))
            .filter((v): v is VideoYT => !!v && !mejores.includes(v))
            .slice(0, 4)
          return (
            <tbody key={t.id} className={abre ? 'tema abierto' : 'tema'}>
              <tr>
                <td>
                  <button className="titulo-video enlace" aria-expanded={abre} onClick={() => setAbierto(abre ? null : t.id)}>
                    <span className="muted">{abre ? '▾' : '▸'}</span> {t.nombre}
                  </button>
                </td>
                <td className="num">{vs.length}</td>
                <td className="num">{outliers.length || '—'}</td>
                <td className="num">{pct(pasa)}</td>
                {vertical && (
                  <td className="tema-donde">
                    {cuantos(vs, (v) => v.red ?? 'tiktok').map(([red, n]) => (
                      <span key={red} title={`${n} en ${red === 'instagram' ? 'Instagram' : 'TikTok'}`}>
                        <Logo de={red} chico />
                      </span>
                    ))}
                    {cuantos(vs, (v) => (enEspanol(v.idioma) ? 'es' : v.idioma!)).map(([idioma, n]) => (
                      <span key={idioma} className="idea-marca" title={idioma === 'es' ? `${n} en español, o sin saberse` : `${n} en ${idioma === 'en' ? 'inglés' : idioma}`}>
                        {idioma.toUpperCase()}
                      </span>
                    ))}
                  </td>
                )}
              </tr>
              {abre && (
                <tr className="tema-videos">
                  <td colSpan={vertical ? 5 : 4}>
                    <div className="tema-cols">
                      <div>
                        <div className="caja-l">Sus mejores outliers</div>
                        {mejores.length ? (
                          mejores.map((v) => <VideoFila key={v.id} v={v} canalId={canal.id} />)
                        ) : (
                          <span className="muted small">Ninguno de sus videos es outlier.</span>
                        )}
                      </div>
                      {ejemplos.length > 0 && (
                        <div>
                          <div className="caja-l">Los que mejor lo representan</div>
                          {ejemplos.map((v) => (
                            <VideoFila key={v.id} v={v} canalId={canal.id} propio={propios.has(v.canalId)} />
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}

function Md({ texto }: { texto: string }) {
  const html = useMemo(() => markdown(texto), [texto])
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
}

/** Lo que Claude propone: el estado de su hilo, su razonamiento y cada idea con lo que se puede hacer con ella. */
function Propuestas(props: {
  d: CanalCompleto
  corriendo: boolean
  investigando: boolean
  elegir?: Choice
  cards: Card[]
  onHilo(id: string): void
  onBorrador(cardId: string, texto: string): void
  onCambio(): void
}) {
  const { d, corriendo } = props
  const [vivo, setVivo] = useState<EnVivo | null>(null)
  const [, tic] = useState(0)
  // Mientras Claude trabaja, qué hace ahora y cuánto lleva: sin abrir el hilo.
  useEffect(() => {
    if (!corriendo) return setVivo(null)
    const leer = () => api<EnVivo | null>(`/api/ideas/${d.canal.id}/hilo`).then(setVivo, () => {})
    leer()
    const i = setInterval(() => (leer(), tic((n) => n + 1)), 3000)
    return () => clearInterval(i)
  }, [corriendo, d.canal.id])
  const [nota, setNota] = useState('')
  const [razon, setRazon] = useState<'demanda' | 'formatos' | null>(null)
  const [error, setError] = useState('')
  const [verDescartadas, setVerDescartadas] = useState(false)
  const [verAnteriores, setVerAnteriores] = useState(false)
  const ideas = d.ideas?.ideas ?? []
  const descartadas = ideas.filter((i) => d.elegidas[i.id]?.estado === 'descartada')
  const vivas = ideas.filter((i) => d.elegidas[i.id]?.estado !== 'descartada')
  const modelo = props.elegir?.model
  // Lo del perfil que la investigación no cubre: «Proponer» lo investiga primero, solo eso.
  const faltan = sinInvestigar(d.investigacion, d.canal)
  const faltanCanales = faltan.filter((f) => f === TU_CANAL || f === TU_INSTAGRAM || d.canal.referencias.includes(f)).length
  const faltanTerminos = faltan.length - faltanCanales

  function proponer() {
    if (!props.elegir) return setError('No hay ningún modelo de Claude disponible.')
    setError('')
    api(`/api/ideas/${d.canal.id}/proponer`, { ...props.elegir, nota }).then(() => (setNota(''), props.onCambio()), (e) => setError(e.message))
  }

  function sumarTermino(t: string) {
    api('/api/ideas/canales', { ...d.canal, semillas: [...d.canal.semillas, t] }).then(props.onCambio, (e) => setError(e.message))
  }

  return (
    <section className="ideas-bloque">
      <div className="ideas-bloque-head">
        <h2>Ideas</h2>
        <span className="muted small">{ideas.length ? `${vivas.length} ideas${d.ideas?.generadas ? ` · ${hace(d.ideas.generadas)}` : ''}` : 'Claude las saca de la investigación'}</span>
        <span className="spacer" />
        {d.hilo && (
          <button className="ghost small" onClick={() => props.onHilo(d.hilo!.id)}>
            Ver cómo lo pensó →
          </button>
        )}
      </div>
      {corriendo ? (
        <div className="trabajo trabajando">
          <div className="trabajo-estado">
            <span className="spinner" />
            <strong>Claude está proponiendo ideas</strong>
            <span className="spacer" />
            <button className="ghost small" onClick={() => props.onHilo(d.hilo!.id)}>
              Abrir el hilo →
            </button>
          </div>
          <ol className="mini-etapas">
            {IDEAS_CARD.etapas!.slice(0, 3).map((e, i) => {
              const hecha = [d.demanda, d.formatos, d.ideas][i]
              const actual = !hecha && (i === 0 || [d.demanda, d.formatos, d.ideas][i - 1])
              return (
                <li key={e.nombre} className={hecha ? 'ok' : actual ? 'on' : ''}>
                  {hecha ? '✓' : actual ? '…' : '·'} {e.nombre}
                </li>
              )
            })}
          </ol>
          {vivo && (
            <div className="idea-vivo small">
              <span className="vivo-ahora">Ahora: {vivo.ahora}</span>
              {vivo.desde && <span className="muted">{Math.max(1, Math.round((Date.now() - vivo.desde) / 60000))} min</span>}
            </div>
          )}
          <p className="muted small">
            Primero el mapa de demanda, luego las fórmulas con su tasa de éxito y al final las ideas. Cada archivo aparece aquí en cuanto lo escribe. Parte del
            resumen de la investigación que Sloth ya contó; con Opus, una vuelta tarda varios minutos.
          </p>
        </div>
      ) : (
        <div className="proponer">
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Algo que Claude deba tener en cuenta (opcional)" />
          <button className="primary" disabled={props.investigando || !props.elegir} onClick={proponer} title={modelo ? `Con ${modelo}, en un hilo que puedes abrir` : undefined}>
            {faltan.length ? 'Investigar lo que falta y proponer' : ideas.length ? 'Proponer otra vez' : 'Proponer ideas'}
          </button>
        </div>
      )}
      {faltan.length > 0 && !props.investigando && !corriendo && (
        <p className="muted small" title={faltan.map((f) => `«${f}»`).join(', ')}>
          La investigación aún no cubre todo tu perfil:{' '}
          {[
            faltanTerminos && `${faltanTerminos} ${faltanTerminos === 1 ? 'búsqueda' : 'búsquedas'}`,
            faltanCanales && `${faltanCanales} ${esVertical(d.canal) ? (faltanCanales === 1 ? 'cuenta' : 'cuentas') : faltanCanales === 1 ? 'canal' : 'canales'} sin leer`
          ]
            .filter(Boolean)
            .join(' y ')}
          . Antes de proponer, Sloth investiga solo eso (unos minutos, sin gastar) y luego Claude propone con todo.
        </p>
      )}
      {props.investigando && !corriendo && (
        <p className="muted small">
          {d.trabajo?.proponer
            ? 'Sloth investiga lo que faltaba de tu perfil; al terminar, Claude propone las ideas.'
            : 'Espera a que termine la investigación: las ideas salen de ella.'}
        </p>
      )}
      {!corriendo && ideas.length > 0 && (
        <p className="muted small">
          Otra vuelta no borra nada: las ideas de ahora se guardan en «Vueltas anteriores», de donde puedes recuperar cualquiera, y las que elegiste se quedan.
        </p>
      )}
      {error && <p className="bad small">{error}</p>}

      {(d.demanda || d.formatos) && (
        <div className="razon">
          <span className="muted small">El razonamiento:</span>
          {d.demanda && (
            <button className={`ficha boton ${razon === 'demanda' ? 'on' : ''}`} onClick={() => setRazon(razon === 'demanda' ? null : 'demanda')}>
              Mapa de demanda
            </button>
          )}
          {d.formatos && (
            <button className={`ficha boton ${razon === 'formatos' ? 'on' : ''}`} onClick={() => setRazon(razon === 'formatos' ? null : 'formatos')}>
              Fórmulas y su tasa de éxito
            </button>
          )}
        </div>
      )}
      {razon && <div className="razon-texto">{<Md texto={(razon === 'demanda' ? d.demanda : d.formatos) ?? ''} />}</div>}

      {vivas.map((idea, i) => (
        <IdeaVista key={idea.id} n={i + 1} idea={idea} {...props} />
      ))}
      {!!d.ideas?.terminosNuevos?.length && (
        <div className="razon">
          <span className="muted small">Claude sugiere investigar también:</span>
          {d.ideas.terminosNuevos
            .filter((t) => !d.canal.semillas.some((s) => s.toLowerCase() === t.toLowerCase()))
            .map((t) => (
              <button key={t} className="ficha boton" title="Añadirlo a lo que se busca, para la próxima investigación" onClick={() => sumarTermino(t)}>
                + {t}
              </button>
            ))}
        </div>
      )}
      {descartadas.length > 0 && (
        <>
          <button className="ghost small" onClick={() => setVerDescartadas(!verDescartadas)}>
            {verDescartadas ? '▾' : '▸'} Descartadas ({descartadas.length})
          </button>
          {verDescartadas && descartadas.map((idea) => <IdeaVista key={idea.id} idea={idea} {...props} />)}
        </>
      )}
      {d.anteriores.length > 0 && (
        <>
          <button className="ghost small" onClick={() => setVerAnteriores(!verAnteriores)}>
            {verAnteriores ? '▾' : '▸'} Vueltas anteriores ({d.anteriores.length})
          </button>
          {verAnteriores && <Anteriores d={d} corriendo={corriendo} onCambio={props.onCambio} />}
        </>
      )}
    </section>
  )
}

/**
 * Las vueltas anteriores de «Proponer ideas», que Sloth guarda antes de cada vuelta nueva. Una idea que ya no está entre
 * las de ahora se puede recuperar: vuelve a la lista con todo lo suyo.
 */
function Anteriores({ d, corriendo, onCambio }: { d: CanalCompleto; corriendo: boolean; onCambio(): void }) {
  const [error, setError] = useState('')
  const ahora = new Set(d.ideas?.ideas.map((i) => i.titulo))
  const fecha = (t: number) => new Date(t).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const recuperar = (vuelta: string, ideaId: string) => (setError(''), api(`/api/ideas/${d.canal.id}/recuperar`, { vuelta, ideaId }).then(onCambio, (e) => setError(e.message)))
  return (
    <div className="anteriores">
      {error && <p className="bad small">{error}</p>}
      {d.anteriores.map((v) => (
        <div key={v.vuelta} className="vuelta">
          <div className="muted small">
            Vuelta del {fecha(v.en)} · {v.ideas.length} ideas
          </div>
          {v.ideas.map((i) => {
            const esta = ahora.has(i.titulo)
            return (
              <div key={i.id} className="vuelta-idea">
                <span>
                  <strong>{i.titulo}</strong>
                  <small className="muted">
                    {i.tema} · piso {mil(i.piso)} · techo {mil(i.techo)}
                  </small>
                </span>
                {esta ? (
                  <span className="muted small">Sigue entre las de ahora</span>
                ) : (
                  <button className="ghost small" disabled={corriendo} onClick={() => recuperar(v.vuelta, i.id)} title="Vuelve a ponerla entre las ideas de ahora">
                    Recuperar
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Las cards con que se puede hacer una idea: todas las de video, que hacen los dos formatos (`Formato:` del brief). */
const estilos = (cards: Card[]) => cards.filter((c) => c.etapas)

/**
 * Lo que recibe la card al hacer una idea. Sin enlaces: con dos o más, El Diff ofrecería un video por enlace. Por eso la
 * evidencia vertical lleva su dirección sin `https://`. Un video en inglés lo dice: es empaque para traer, no la demanda
 * de tu público.
 */
function brief(d: CanalCompleto, idea: Idea): string {
  const videos = new Map(d.investigacion?.videos.map((v) => [v.id, v]))
  const evidencia = idea.evidencia.map((id) => videos.get(id)).filter((v): v is VideoYT => !!v)
  const vertical = esVertical(d.canal)
  const x = (v: VideoYT) => (v.x !== undefined ? veces(v.x) : sinVistas(v) ? 'sin vistas (cuenta no medible)' : 'sin medir')
  return [
    vertical
      ? `Un video vertical (9:16) para ${redesDe(idea.red)}, del canal «${d.canal.nombre}». Sale de la sección Ideas de Sloth.`
      : `Un video largo para YouTube (horizontal), del canal «${d.canal.nombre}». Sale de la sección Ideas de Sloth.`,
    `${vertical ? 'Texto del primer cuadro' : 'Título'}: ${idea.titulo}`,
    `Tema: ${idea.tema}`,
    `Por qué: ${idea.porque}`,
    `Gancho (las 4 P${vertical ? ', en los primeros 3 segundos' : ''}):\n- Promesa: ${idea.gancho.promesa}\n- Prueba: ${idea.gancho.prueba}\n- Plan: ${idea.gancho.plan}\n- Persona: ${idea.gancho.persona}`,
    `${vertical ? 'Primer cuadro' : 'Miniatura'}: ${idea.miniatura}`,
    `Cómo se hace: ${idea.ejecucion}`,
    idea.cta && `Llamada a la acción: ${idea.cta}`,
    evidencia.length &&
      (vertical
        ? `Evidencia:\n${evidencia.map((v) => `- «${v.titulo.replace(/\s+/g, ' ').slice(0, 120)}»${v.idioma === 'en' ? ' (en inglés)' : ''}${v.pagado ? ' (colaboración pagada)' : ''}, ${x(v)} en ${v.canal} (${urlVertical(v).replace(/^https?:\/\//, '')})`).join('\n')}`
        : `Evidencia (ids de YouTube):\n${evidencia.map((v) => `- «${v.titulo}», ${x(v)} en ${v.canal} (${v.id})`).join('\n')}`),
    `Riesgo: ${idea.riesgo}`,
    // El estilo que hace los dos formatos (El Diff) hace solo el que dice esta línea.
    `Formato: ${vertical ? 'vertical' : 'horizontal'}`,
    `Idea: ${d.canal.id}/${idea.id}`
  ]
    .filter(Boolean)
    .join('\n\n')
}

function IdeaVista(props: {
  n?: number
  idea: Idea
  d: CanalCompleto
  elegir?: Choice
  cards: Card[]
  onHilo(id: string): void
  onBorrador(cardId: string, texto: string): void
  onCambio(): void
}) {
  const { idea, d } = props
  const el: IdeaElegida | undefined = d.elegidas[idea.id]
  const [feed, setFeed] = useState(false)
  const [esquema, setEsquema] = useState(false)
  const [preparando, setPreparando] = useState(false)
  const [error, setError] = useState('')
  const videos = useMemo(() => new Map(d.investigacion?.videos.map((v) => [v.id, v])), [d.investigacion])
  const propios = new Set(d.investigacion?.canales.filter(tuyo).map((c) => c.id))
  const cardDe = (id?: string) => props.cards.find((c) => c.id === id)
  const vertical = esVertical(d.canal)
  // El estilo que Claude sugiere va primero.
  const conQue = estilos(props.cards).sort((a, b) => Number(b.id === idea.estilo) - Number(a.id === idea.estilo))

  const elegir = (estado: IdeaElegida['estado'] | null, cardId?: string) => api(`/api/ideas/${d.canal.id}/elegir`, { ideaId: idea.id, estado, cardId })
  async function hacerCon(card: Card) {
    try {
      await elegir('elegida', card.id)
      props.onBorrador(card.id, brief(d, idea))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  /** Bloqueado mientras responde: un doble clic no abre dos hilos (y el servidor devuelve el que ya prepara). */
  function grabar() {
    if (!props.elegir) return setError('No hay ningún modelo de Claude disponible.')
    if (preparando) return
    setPreparando(true)
    setError('')
    api<SessionMeta>(`/api/ideas/${d.canal.id}/preparar`, { ideaId: idea.id, ...props.elegir })
      .then((m) => props.onHilo(m.id), (e) => setError(e.message))
      .finally(() => setPreparando(false))
  }

  const descartada = el?.estado === 'descartada'
  const texto = d.esquemas[idea.id]
  return (
    <article className={`idea ${el?.estado ?? ''}`}>
      <div className="idea-top">
        <div>
          <div className="muted small">
            {props.n && <span className="idea-n">{props.n}</span>}
            {idea.tema}
            {vertical && ` · para ${redesDe(idea.red)}`}
          </div>
          <h3>{idea.titulo}</h3>
        </div>
        <div
          className="idea-rango"
          title="Una estimación de Claude, no un pronóstico: nadie la ha calibrado todavía contra tus resultados. Piso: lo realista para tu canal si sale bien. Techo: lo que sacaron los comparables."
        >
          estimado: piso <strong>{mil(idea.piso)}</strong> · techo <strong>{mil(idea.techo)}</strong>
        </div>
      </div>
      {/* Todos los hilos que salieron de la idea, del primero al último: grabarla y hacerla con un estilo no se pisan. */}
      {!!el?.hilos.length && (
        <div className="idea-hilos">
          {[...el.hilos]
            .sort((a, b) => a.en - b.en)
            .map((h) => (
              <div key={h.id ?? `${h.cardId}-${h.en}`} className="idea-estado">
                {h.cardId === 'grabar' ? (
                  '🎙 Para grabar tú'
                ) : (
                  <span>
                    <Icon icon={cardDe(h.cardId)?.icon ?? '🎬'} /> Con {cardDe(h.cardId)?.title ?? h.cardId}
                  </span>
                )}
                {h.id ? (
                  <button className="ghost small" onClick={() => props.onHilo(h.id!)}>
                    Abrir el hilo →
                  </button>
                ) : (
                  <span className="muted small">· el hilo aparece aquí cuando lo mandes</span>
                )}
              </div>
            ))}
        </div>
      )}
      <div className="idea-cols">
        <div className="idea-caja">
          <div className="caja-l">Evidencia</div>
          {idea.evidencia.map((id) => {
            const v = videos.get(id)
            if (!v)
              return (
                <div key={id} className="evidencia falta" title="Claude citó un video que no está en la investigación">
                  ⚠ {id}: no está en la investigación
                </div>
              )
            return <VideoFila key={id} v={v} canalId={d.canal.id} propio={propios.has(v.canalId)} />
          })}
        </div>
        <div className="idea-caja">
          <div className="caja-l">{vertical ? 'Gancho en pantalla' : 'Títulos para el A/B'}</div>
          <ol className="titulos">
            {idea.titulos.map((t) => (
              <li key={t.texto}>
                {t.texto}
                <small>
                  <em>{t.formato}</em> · {t.porque}
                </small>
              </li>
            ))}
          </ol>
        </div>
        <div className="idea-caja">
          <div className="caja-l">{vertical ? 'Gancho (3 s) · las 4 P' : 'Gancho · las 4 P'}</div>
          <dl className="cuatro-p">
            <dt>Promesa</dt>
            <dd>{idea.gancho.promesa}</dd>
            <dt>Prueba</dt>
            <dd>{idea.gancho.prueba}</dd>
            <dt>Plan</dt>
            <dd>{idea.gancho.plan}</dd>
            <dt>Persona</dt>
            <dd>{idea.gancho.persona}</dd>
          </dl>
        </div>
        <div className="idea-caja">
          <div className="caja-l">{vertical ? 'Primer cuadro' : 'Miniatura'}</div>
          <p>{idea.miniatura}</p>
          <div className="caja-l">Cómo se hace</div>
          <p>{idea.ejecucion}</p>
        </div>
      </div>
      <div className="idea-porque">
        <p>
          <strong>Por qué:</strong> {idea.porque}
        </p>
        <p>
          <strong className="riesgo">Riesgo:</strong> {idea.riesgo}
        </p>
        {idea.cta && (
          <p>
            <strong>Lo que regala:</strong> {idea.cta}
          </p>
        )}
      </div>
      {texto && (
        <div className="idea-esquema">
          <button className="ghost small" onClick={() => setEsquema(!esquema)}>
            {esquema ? '▾' : '▸'} Esquema para grabar
          </button>
          {esquema && <Md texto={texto} />}
        </div>
      )}
      {error && <p className="bad small">{error}</p>}
      <div className="idea-acciones">
        {descartada ? (
          <button className="ghost small" onClick={() => elegir(null).then(props.onCambio)}>
            Recuperarla
          </button>
        ) : (
          <>
            <span className="muted small">Hacer con:</span>
            <button
              className="primary chico"
              disabled={preparando}
              onClick={grabar}
              title="Claude prepara el esquema, el gancho escrito, los títulos y la miniatura para que lo grabes tú"
            >
              {preparando ? 'Abriendo…' : '🎙 Lo grabo yo'}
            </button>
            {conQue.map((c) => (
              <button
                key={c.id}
                className={c.id === idea.estilo ? 'btn-card sugerido' : 'btn-card'}
                onClick={() => hacerCon(c)}
                title={`${c.id === idea.estilo ? 'El estilo que sugiere Claude para esta idea. ' : ''}Abre un hilo nuevo de ${c.title} con la idea ya escrita, para revisarla antes de mandarla`}
              >
                <Icon icon={c.icon ?? '✦'} /> {c.title}
              </button>
            ))}
            <span className="idea-acciones-fin">
              {idea.termino && (
                <button className="ghost small" onClick={() => setFeed(true)}>
                  Ver en el feed
                </button>
              )}
              <button className="ghost small" onClick={() => elegir('descartada').then(props.onCambio)} title="No la vuelve a proponer">
                Descartar
              </button>
            </span>
          </>
        )}
      </div>
      {feed && <Feed idea={idea} d={d} onClose={() => setFeed(false)} />}
    </article>
  )
}

/**
 * Tu idea entre lo que YouTube ya enseña en esa búsqueda. La miniatura se juega en un instante y solo se pulsa
 * una de veinte. Si tú no la elegirías, cámbiala antes de grabar. En vertical, tu primer cuadro entre las portadas que
 * da esa búsqueda en TikTok, o en Instagram si la idea es para Instagram.
 */
function Feed({ idea, d, onClose }: { idea: Idea; d: CanalCompleto; onClose(): void }) {
  const vertical = esVertical(d.canal)
  // En vertical, la frase se buscó en las dos redes: el feed de Instagram si la idea es para Instagram; si no, el de TikTok.
  const deLaFrase = d.investigacion?.terminos.filter((x) => x.termino === idea.termino) ?? []
  const t = deLaFrase.find((x) => x.red === (idea.red === 'instagram' ? 'instagram' : 'tiktok')) ?? deLaFrase[0]
  const red = t?.red === 'instagram' ? 'Instagram' : 'TikTok'
  const videos = new Map(d.investigacion?.videos.map((v) => [v.id, v]))
  // En vertical van cinco por fila: con nueve y el tuyo, dos filas llenas.
  const otros = (t?.ids ?? []).map((id) => videos.get(id)).filter((v): v is VideoYT => !!v).slice(0, vertical ? 9 : 8)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal feed" onClick={(e) => e.stopPropagation()}>
        <h2>En el feed de «{idea.termino}»</h2>
        <p className="modal-body">
          {vertical
            ? `Así se ve tu primer cuadro entre lo que ${red} enseña hoy en esa búsqueda. ¿Te pararías en el tuyo? Pregúntale también a alguien de tu público.`
            : 'Así compite tu idea con lo que YouTube enseña hoy en esa búsqueda. ¿La elegirías tú? Pregúntale también a alguien de tu público.'}
        </p>
        <div className={vertical ? 'feed-grid vertical' : 'feed-grid'}>
          <div className="feed-tile tuyo">
            <div className="feed-thumb concepto">{idea.miniatura}</div>
            <strong>{idea.titulo}</strong>
            <span className="muted small">{d.canal.handle ?? d.canal.nombre}</span>
          </div>
          {otros.map((v) => (
            <a className="feed-tile" key={v.id} href={enlace(v)} target="_blank" rel="noreferrer">
              {v.red ? <Portada canalId={d.canal.id} v={v} className="feed-thumb" /> : <img className="feed-thumb" src={miniatura(v.id)} alt="" />}
              <strong>{v.titulo}</strong>
              <span className="muted small">
                {v.canal} · {sinVistas(v) ? 'sin vistas' : `${mil(v.vistas)} vistas`} <Idioma de={v.idioma} />
              </span>
            </a>
          ))}
        </div>
        {!otros.length && <p className="muted small">No hay videos guardados de esa búsqueda: investiga otra vez.</p>}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
