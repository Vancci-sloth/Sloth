import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GanadorRifa, RifaAdmin as Panel, SorteoRifa } from '../../shared/types'
import { fecha, num, Tabla } from './Admin'
import { api } from './api'
import { Confirm } from './Confirm'
import { avisarGanasteRifa } from './GanasteRifa'
import { Icono } from './Iconos'
import { RIFA_CAMBIO } from './Rifa'
import './Rifa.css'

/**
 * La rifa, en Administrador (`licencias/src/rifa.ts`): qué se rifa (cuántos ganan y los créditos de cada uno, o un
 * premio que das a mano), quién participa, «Rifar» y lo que pasó con cada premio. «Rifar» abre la ruleta a toda la
 * pantalla; «Girar» sortea en el cobro y la ruleta cae en quien ganó, uno por uno. El aviso y el correo salen al sortear.
 */
const ESTADOS: Record<GanadorRifa['estado'], string> = {
  pendiente: 'Por sumar',
  preparando: 'Sumando…',
  enviando: 'Revisar en el proveedor',
  entregado: 'Créditos entregados',
  revisar: 'Revisar en el proveedor',
  'a-mano': 'Lo das tú'
}

/** Lo mismo que dice el cobro (`premioDe`). */
const premioDe = (ganadores: number, creditos: number) => `${ganadores === 1 ? '1 llave' : `${ganadores} llaves`} de ${creditos.toLocaleString('en-US')} créditos de Sloth`
/** Como `nombreDe` del cobro: el nombre o el correo tapado, que la ruleta puede salir en un live. */
const tapado = (p: { nombre: string; email: string }) => p.nombre || `${p.email.split('@')[0].slice(0, 2)}•••@${p.email.split('@')[1] ?? ''}`

export function RifaAdmin() {
  const [panel, setPanel] = useState<Panel>()
  const [error, setError] = useState('')
  const [ruleta, setRuleta] = useState(false)
  const [cancelar, setCancelar] = useState(false)

  const cargar = useCallback(
    () =>
      void api<Panel>('/api/comunidad/rifa/admin').then(
        (p) => (setPanel(p), setError('')),
        (e: Error) => setError(e.message)
      ),
    []
  )
  useEffect(cargar, [cargar])
  const cambio = (p: Panel) => (setPanel(p), dispatchEvent(new Event(RIFA_CAMBIO)))

  const a = panel?.abierta
  const entran = a?.lista.filter((p) => !p.fuera) ?? []
  return (
    <section className="admin-seccion admin-rifa">
      <h2>Rifa</h2>
      <p className="muted small">
        Entre quienes usan Sloth gratis: quien apoya o es Fundador no participa. Mientras está abierta sale hasta arriba de la comunidad con su botón para participar. Al rifar, cada ganador recibe sus créditos en su cuenta de voz, el aviso en su Sloth y un correo.
      </p>
      {error && <p className="bad small">{error}</p>}
      {panel && !a && <Nueva vozAbierta={panel.vozAbierta} onHecho={cambio} />}
      {a && (
        <div className="admin-rifa-abierta">
          <div className="admin-rifa-cabeza">
            <div>
              <span className="admin-antetitulo">Abierta desde {fecha(a.creada)}</span>
              <h3>{a.premio}</h3>
              <p className="muted small">
                {num(entran.length)} {entran.length === 1 ? 'participa' : 'participan'} · {a.ganadores === 1 ? 'gana 1' : `ganan ${a.ganadores}`}
                {a.creditos > 0 ? ` · ${num(a.creditos)} créditos para cada uno` : ' · el premio lo das tú'}
              </p>
            </div>
            <div className="admin-rifa-botones">
              <button className="ruleta-girar" disabled={!entran.length} onClick={() => setRuleta(true)} title={entran.length ? undefined : 'Aún no participa nadie'}>
                Rifar
              </button>
              <button className="admin-boton peligro" onClick={() => setCancelar(true)}>
                Cancelar la rifa
              </button>
            </div>
          </div>
          {a.lista.length ? (
            <Tabla
              cabeza={['Participa', 'Correo', 'Desde', '']}
              filas={a.lista.map((p) => [p.nombre || '—', p.email, fecha(p.desde), p.fuera ? <span className="bad small">Fuera: {p.fuera}</span> : ''])}
            />
          ) : (
            <p className="muted small admin-vacio">Aún no participa nadie. Ya se ve en la comunidad.</p>
          )}
        </div>
      )}
      <button className="admin-boton admin-rifa-probar" onClick={() => avisarGanasteRifa({ rifa: 'prueba', premio: a?.premio ?? premioDe(1, 10_000), creditos: a ? a.creditos : 10_000, entregados: true }, true)}>
        Ver el aviso del ganador
      </button>
      {panel && panel.rifas.length > 0 && <Historial rifas={panel.rifas} onCambio={cambio} />}
      {ruleta && a && (
        <Ruleta
          premio={a.premio}
          rifa={a.id}
          nombres={entran.map((p) => ({ externo: p.externo, nombre: tapado(p) }))}
          onCerrar={() => (setRuleta(false), cargar(), dispatchEvent(new Event(RIFA_CAMBIO)))}
        />
      )}
      {cancelar && a && (
        <Confirm title="¿Cancelar la rifa?" action="Cancelar la rifa" danger onConfirm={() => api<Panel>('/api/comunidad/rifa/cancelar', { rifa: a.id }).then(cambio)} onClose={() => setCancelar(false)}>
          Deja de salir en la comunidad y nadie gana. Quienes participaban no reciben aviso.
        </Confirm>
      )}
    </section>
  )
}

function Nueva({ vozAbierta, onHecho }: { vozAbierta: boolean; onHecho(p: Panel): void }) {
  const [ganadores, setGanadores] = useState('1')
  const [creditos, setCreditos] = useState('10000')
  const [premio, setPremio] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const n = Math.floor(Number(ganadores))
  const c = Math.max(0, Math.floor(Number(creditos) || 0))
  const valido = n >= 1 && n <= 100 && (c > 0 || premio.trim())
  const cerrada = c > 0 && !vozAbierta
  return (
    <form
      className="admin-rifa-nueva"
      onSubmit={(e) => {
        e.preventDefault()
        setOcupado(true)
        setError('')
        api<Panel>('/api/comunidad/rifa/crear', { ganadores: n, creditos: c, premio: premio.trim() })
          .then(onHecho, (e: Error) => setError(e.message))
          .finally(() => setOcupado(false))
      }}
    >
      <label>
        <span>Cuántos ganan</span>
        <input type="number" min={1} max={100} step={1} value={ganadores} onChange={(e) => setGanadores(e.target.value)} disabled={ocupado} />
      </label>
      <label>
        <span>Créditos para cada uno</span>
        <input type="number" min={0} step={1} value={creditos} onChange={(e) => setCreditos(e.target.value)} disabled={ocupado} />
      </label>
      <label className="ancho">
        <span>Qué se rifa (lo ve la comunidad)</span>
        <input type="text" maxLength={140} placeholder={c > 0 && n >= 1 ? premioDe(n, c) : 'Por ejemplo: una clave de Sloth PRO por un año'} value={premio} onChange={(e) => setPremio(e.target.value)} disabled={ocupado} />
      </label>
      <p className="muted small ancho">
        {c > 0
          ? `Cada ganador recibe ${c.toLocaleString('en-US')} créditos de voz en su cuenta de Sloth al momento del sorteo.`
          : 'Sin créditos: el premio lo das tú a mano; al ganador le llega el aviso y el correo diciendo que le escribes.'}
        {premio.trim() && c > 0 ? ' En la comunidad sale lo que escribiste.' : ''}
      </p>
      {cerrada && <p className="bad small ancho">Las voces de Sloth aún son solo para ti: los créditos se rifan cuando se publique la actualización que las abre. Puedes rifar algo sin créditos (0).</p>}
      {error && <p className="bad small ancho">{error}</p>}
      <button className="primary" disabled={ocupado || !valido || cerrada}>
        {ocupado ? 'Abriendo…' : 'Abrir la rifa'}
      </button>
    </form>
  )
}

function Historial({ rifas, onCambio }: { rifas: Panel['rifas']; onCambio(p: Panel): void }) {
  const [error, setError] = useState('')
  const hacer = (rifa: string, externo: string, accion: 'reintentar' | 'entregado') =>
    api<Panel>('/api/comunidad/rifa/ganador', { rifa, externo, accion }).then(onCambio, (e: Error) => setError(e.message))
  return (
    <>
      {error && <p className="bad small">{error}</p>}
      <Tabla
        cabeza={['Rifa', 'Sorteada', 'Participaron', 'Ganó', 'Premio', 'Correo', 'Lo vio en Sloth', '']}
        filas={rifas.flatMap((r) =>
          r.estado === 'cancelada'
            ? [[r.premio, <span className="muted">Cancelada</span>, num(r.participantes), '—', '—', '—', '—', '']]
            : r.lista.map((g, i) => [
                i ? '' : r.premio,
                i ? '' : fecha(r.sorteada),
                i ? '' : num(r.participantes),
                <span title={g.externo}>
                  {g.nombre || '—'} <span className="muted small">{g.email}</span>
                </span>,
                <span className={g.estado === 'revisar' || g.estado === 'enviando' ? 'bad' : g.estado === 'entregado' ? 'ok' : ''} title={g.error ?? undefined}>
                  {ESTADOS[g.estado]}
                  {g.creditos ? ` · ${num(g.creditos)}` : ''}
                  {g.error ? ` · ${g.error}` : ''}
                </span>,
                g.correo ? fecha(g.correo) : 'Por enviar',
                g.visto ? fecha(g.visto) : 'Aún no',
                g.estado === 'revisar' || g.estado === 'enviando' || g.estado === 'pendiente' ? (
                  <div className="admin-acciones">
                    <button className="admin-boton" title="Míralo antes en Usuarios: si no le llegaron, vuelve a sumarlos" onClick={() => void hacer(r.id, g.externo, 'reintentar')}>
                      Volver a sumar
                    </button>
                    <button className="admin-boton" title="Ya le llegaron: se le manda el correo" onClick={() => void hacer(r.id, g.externo, 'entregado')}>
                      Ya le llegaron
                    </button>
                  </div>
                ) : (
                  ''
                )
              ])
        )}
      />
    </>
  )
}

// ── La ruleta ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Lo más que cabe en la rueda: con más gente, se ven estos (siempre con quien gana entre ellos). */
const GAJOS = 24
const C = 300
const R = 268
const VUELTAS = 7

/** Los nombres de la rueda: hasta `GAJOS`, y si quien gana no está entre ellos, ocupa uno al azar. */
function gajosDe(lista: Persona[], ganador?: Persona): Persona[] {
  const vistos = lista.slice(0, GAJOS)
  if (!ganador || vistos.some((p) => p.externo === ganador.externo)) return vistos
  const copia = [...vistos]
  copia[Math.floor(Math.random() * copia.length)] = ganador
  return copia
}
type Persona = { externo: string; nombre: string }

const punto = (grados: number, r = R) => {
  const a = (grados * Math.PI) / 180
  return `${C + r * Math.sin(a)} ${C - r * Math.cos(a)}`
}
const corto = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function Ruleta({ rifa, premio, nombres, onCerrar }: { rifa: string; premio: string; nombres: Persona[]; onCerrar(): void }) {
  const [sorteo, setSorteo] = useState<SorteoRifa>()
  const [turno, setTurno] = useState(0)
  const [gajos, setGajos] = useState(() => gajosDe(nombres))
  const [giro, setGiro] = useState(0)
  const [girando, setGirando] = useState(false)
  const [cayo, setCayo] = useState<Persona>()
  const [revelados, setRevelados] = useState<Persona[]>([])
  const [error, setError] = useState('')
  const [pidiendo, setPidiendo] = useState(false)

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && !girando && onCerrar()
    addEventListener('keydown', alPulsar)
    return () => removeEventListener('keydown', alPulsar)
  }, [girando, onCerrar])

  const total = sorteo?.ganadores.length ?? 0
  const acabo = !!sorteo && revelados.length >= total && !girando

  async function girar() {
    setError('')
    let s = sorteo
    if (!s) {
      setPidiendo(true)
      try {
        s = await api<SorteoRifa>('/api/comunidad/rifa/sortear', { rifa })
        setSorteo(s)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return
      } finally {
        setPidiendo(false)
      }
    }
    const ganador = s.ganadores[turno]
    if (!ganador) return
    // Quienes ya ganaron salen de la rueda: el siguiente giro es entre los demás.
    const quedan = s.participantes.filter((p) => !revelados.some((r) => r.externo === p.externo))
    const rueda = gajosDe(quedan, ganador)
    const k = rueda.findIndex((p) => p.externo === ganador.externo)
    const paso = 360 / rueda.length
    const destino = (360 - k * paso + (Math.random() - 0.5) * paso * 0.6 + 360) % 360
    setGajos(rueda)
    setCayo(undefined)
    setGirando(true)
    setGiro((g) => g + VUELTAS * 360 + ((((destino - g) % 360) + 360) % 360))
  }

  function paro() {
    if (!girando || !sorteo) return
    const ganador = sorteo.ganadores[turno]
    setGirando(false)
    setCayo(ganador)
    setRevelados((r) => [...r, ganador])
    setTurno((t) => t + 1)
  }

  const n = gajos.length
  const paso = 360 / n
  const letra = n <= 6 ? 22 : n <= 12 ? 17 : 13
  return createPortal(
    <div className="ruleta" role="dialog" aria-modal="true" aria-label="Ruleta de la rifa">
      <div className="ruleta-caja">
        {!girando && (
          <button className="ruleta-cerrar" onClick={onCerrar} aria-label="Cerrar" title="Cerrar">
            <Icono de="cerrar" />
          </button>
        )}
        <svg className="ruleta-svg" viewBox="0 0 600 600" aria-hidden="true">
          <g className={`ruleta-rueda${girando ? '' : ' quieta'}`} style={{ transform: `rotate(${giro}deg)` }} onTransitionEnd={paro}>
            {n === 1 ? (
              <circle cx={C} cy={C} r={R} className={`ruleta-gajo g0${cayo ? ' gana' : ''}`} />
            ) : (
              gajos.map((p, i) => {
                const a0 = i * paso - paso / 2
                return <path key={p.externo} className={`ruleta-gajo g${i % 4}${cayo?.externo === p.externo ? ' gana' : ''}`} d={`M${C} ${C}L${punto(a0)}A${R} ${R} 0 ${paso > 180 ? 1 : 0} 1 ${punto(a0 + paso)}Z`} />
              })
            )}
            {gajos.map((p, i) => (
              <text
                key={p.externo}
                className={`ruleta-nombre ${cayo?.externo === p.externo || i % 4 === 0 || i % 4 === 2 ? 'oscuro' : 'claro'}`}
                style={{ fontSize: letra }}
                transform={`rotate(${i * paso - 90} ${C} ${C})`}
                x={C + R - 22}
                y={C}
                textAnchor="end"
              >
                {corto(p.nombre, n <= 6 ? 16 : 20)}
              </text>
            ))}
          </g>
          <circle className="ruleta-aro" cx={C} cy={C} r={R + 8} />
          <g className={`ruleta-focos${girando ? ' girando' : ''}`}>
            {Array.from({ length: 24 }, (_, i) => {
              const [x, y] = punto(i * 15, R + 8).split(' ').map(Number)
              return <circle key={i} cx={x} cy={y} r={5} className={i % 2 ? 'on' : ''} />
            })}
          </g>
          <circle className="ruleta-centro" cx={C} cy={C} r={44} />
          <path className="ruleta-flecha" d={`M${C - 22} 0L${C + 22} 0L${C} 48Z`} />
        </svg>
        <div className="ruleta-lado">
          <span className="admin-antetitulo">Rifa de Sloth</span>
          <h2>{acabo ? (total > 1 ? '¡Ya hay ganadores!' : '¡Ya hay ganador!') : girando ? 'Girando…' : sorteo ? 'Siguiente ganador' : `Entre ${num(nombres.length)} ${nombres.length === 1 ? 'persona' : 'personas'}`}</h2>
          <p className="ruleta-premio">{premio}</p>
          {cayo && (
            <div className="ruleta-gano" key={cayo.externo}>
              <span>{total > 1 ? `Ganador ${revelados.length} de ${total}` : 'Ganó'}</span>
              <strong>{cayo.nombre}</strong>
            </div>
          )}
          {revelados.length > 1 && (
            <ul className="ruleta-lista">
              {revelados.map((p) => (
                <li key={p.externo}>
                  <Icono de="palomita" /> {p.nombre}
                </li>
              ))}
            </ul>
          )}
          {error && <p className="bad small">{error}</p>}
          {acabo ? (
            <>
              <p className="muted small">Su aviso en Sloth y su correo ya van en camino.</p>
              <button className="ruleta-girar" onClick={onCerrar}>
                Listo
              </button>
            </>
          ) : (
            <button className="ruleta-girar" disabled={girando || pidiendo} onClick={() => void girar()}>
              {pidiendo ? 'Sorteando…' : girando ? 'Girando…' : sorteo ? `Girar por el ganador ${turno + 1}` : 'Girar'}
            </button>
          )}
          {!sorteo && <p className="muted small">Al girar se sortea de verdad: ya no se puede deshacer.</p>}
        </div>
      </div>
    </div>,
    document.body
  )
}
