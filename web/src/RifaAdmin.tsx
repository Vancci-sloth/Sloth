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
 * La rifa, en Administrador (`licencias/src/rifa.ts`): «Abrir la rifa» (la comunidad solo ve «llévate créditos de
 * Sloth»), quién participa y la ruleta, cuando quieras y cuantas veces quieras mientras esté abierta: cada «Rifar» lleva
 * una lista de premios, del mayor al menor (cuántos ganan cada uno y sus créditos, o uno que das a mano), que la ruleta
 * reparte en orden entre quienes aún no ganan.
 * «Rifar» abre la ruleta a toda la pantalla; «Girar» sortea en el cobro y la ruleta cae en quien ganó, uno por uno. El
 * aviso y el correo salen al sortear. «Cerrar la rifa» la termina: la comunidad ve quién ganó qué. Abajo, cada ganador y
 * cómo va su premio.
 */
const ESTADOS: Record<GanadorRifa['estado'], string> = {
  pendiente: 'Por sumar',
  preparando: 'Sumando…',
  enviando: 'Revisar en el proveedor',
  entregado: 'Créditos entregados',
  revisar: 'Revisar en el proveedor',
  'a-mano': 'Lo das tú'
}

/** Una fila de la lista de premios, como se escribe. */
type Fila = { ganan: string; creditos: string; premio: string }
/** La fila como la manda el sorteo: sin nombre, el de siempre si lleva créditos. */
const leerFila = (f: Fila) => {
  const ganadores = Math.floor(Number(f.ganan))
  const creditos = Math.max(0, Math.floor(Number(f.creditos) || 0))
  return { ganadores, creditos, premio: f.premio.trim() || (creditos > 0 ? premioDe(creditos) : '') }
}

/** Lo mismo que dice el cobro (`premioDe`): lo que se lleva cada ganador. */
const premioDe = (creditos: number) => `1 llave de ${creditos.toLocaleString('en-US')} créditos de Sloth`
/** Como `nombreDe` del cobro: el nombre o el correo tapado, que la ruleta puede salir en un live. */
const tapado = (p: { nombre: string; email: string }) => p.nombre || `${p.email.split('@')[0].slice(0, 2)}•••@${p.email.split('@')[1] ?? ''}`

export function RifaAdmin() {
  const [panel, setPanel] = useState<Panel>()
  const [error, setError] = useState('')
  const [ruleta, setRuleta] = useState(false)
  const [cerrar, setCerrar] = useState(false)
  const [abriendo, setAbriendo] = useState(false)
  // Lo que se rifa: una lista de premios, del mayor al menor, que se elige al rifar, no al abrir (la comunidad solo ve
  // «llévate créditos de Sloth»).
  const [premios, setPremios] = useState<Fila[]>([{ ganan: '1', creditos: '10000', premio: '' }])

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

  function abrir() {
    setAbriendo(true)
    setError('')
    api<Panel>('/api/comunidad/rifa/crear', {})
      .then(cambio, (e: Error) => setError(e.message))
      .finally(() => setAbriendo(false))
  }

  const a = panel?.abierta
  // En la ruleta, quienes aún pueden ganar: ni fuera ni con premio ya en esta rifa.
  const entran = a?.lista.filter((p) => !p.fuera && !p.gano) ?? []
  const lista = premios.map(leerFila)
  const total = lista.reduce((t, x) => t + (x.ganadores > 0 ? x.ganadores : 0), 0)
  const valido = lista.every((x) => x.ganadores >= 1 && x.ganadores <= 100 && !!x.premio) && total <= 100
  const cerrada = lista.some((x) => x.creditos > 0) && !panel?.vozAbierta
  const cambiarFila = (i: number, cambio: Partial<Fila>) => setPremios((ps) => ps.map((x, j) => (j === i ? { ...x, ...cambio } : x)))
  return (
    <section className="admin-seccion admin-rifa">
      <h2>Rifa</h2>
      <p className="muted small">
        Entre quienes no tienen los créditos de cada mes: cuentas gratis y apoyos de menos de $15 USD. Quien paga $15 o más y los Fundadores no participan. Mientras está abierta sale hasta arriba de la comunidad como «Participa en la rifa · Llévate créditos de Sloth», sin decir cuántos. Rifa cuando quieras y cuantas veces quieras, cada vez con su premio: nadie gana dos veces en la misma rifa. Cada ganador recibe sus créditos en su cuenta de voz, el aviso en su Sloth y un correo.
      </p>
      {error && <p className="bad small">{error}</p>}
      {panel && !a && (
        <div className="admin-rifa-nueva">
          <p className="muted small ancho">No hay ninguna rifa abierta. Al abrirla sale en la comunidad y la gente empieza a participar.</p>
          <button className="primary" disabled={abriendo} onClick={abrir}>
            {abriendo ? 'Abriendo…' : 'Abrir la rifa'}
          </button>
        </div>
      )}
      {a && (
        <div className="admin-rifa-abierta">
          <div className="admin-rifa-cabeza">
            <div>
              <span className="admin-antetitulo">Abierta desde {fecha(a.creada)}</span>
              <h3>
                {num(a.lista.length)} {a.lista.length === 1 ? 'persona participa' : 'personas participan'}
                {a.ganadores.length > 0 && <span className="muted"> · ya {a.ganadores.length === 1 ? 'ganó 1' : `ganaron ${a.ganadores.length}`}</span>}
              </h3>
              <p className="muted small">{num(entran.length)} pueden ganar en el siguiente sorteo.</p>
            </div>
            <button className="admin-boton peligro" onClick={() => setCerrar(true)}>
              Cerrar la rifa
            </button>
          </div>
          <form
            className="admin-rifa-nueva"
            onSubmit={(e) => {
              e.preventDefault()
              setRuleta(true)
            }}
          >
            <div className="ancho admin-rifa-premios">
              <div className="admin-rifa-fila cabeza">
                <span>Premio</span>
                <span>Ganan</span>
                <span>Créditos c/u</span>
                <span>Qué se lleva cada ganador (lo ve quien gana y, al cerrar, la comunidad)</span>
                <span />
              </div>
              {premios.map((f, i) => {
                const x = lista[i]
                return (
                  <div key={i} className="admin-rifa-fila">
                    <span className="admin-rifa-numero">{i + 1}</span>
                    <input aria-label={`Cuántos ganan el premio ${i + 1}`} type="number" min={1} max={100} step={1} value={f.ganan} onChange={(e) => cambiarFila(i, { ganan: e.target.value })} />
                    <input aria-label={`Créditos de cada ganador del premio ${i + 1}`} type="number" min={0} step={1} value={f.creditos} onChange={(e) => cambiarFila(i, { creditos: e.target.value })} />
                    <input
                      aria-label={`Nombre del premio ${i + 1}`}
                      type="text"
                      maxLength={140}
                      placeholder={x.creditos > 0 ? premioDe(x.creditos) : 'Escribe qué es: una clave de Sloth PRO, una playera…'}
                      value={f.premio}
                      onChange={(e) => cambiarFila(i, { premio: e.target.value })}
                    />
                    {premios.length > 1 ? (
                      <button type="button" className="admin-boton" aria-label={`Quitar el premio ${i + 1}`} title="Quitar este premio" onClick={() => setPremios((ps) => ps.filter((_, j) => j !== i))}>
                        <Icono de="cerrar" />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                )
              })}
              {premios.length < 20 && (
                <button type="button" className="admin-boton admin-rifa-agregar" onClick={() => setPremios((ps) => [...ps, { ganan: '1', creditos: '0', premio: '' }])}>
                  <Icono de="mas" /> Agregar premio
                </button>
              )}
            </div>
            <p className="muted small ancho">
              La ruleta gira primero por el premio 1 y luego por los demás, en orden: {num(total)} {total === 1 ? 'ganador' : 'ganadores'}
              {total > entran.length ? `, pero solo ${num(entran.length)} pueden ganar: los últimos premios se quedan sin rifar` : ''}. Nadie gana dos veces. Con
              créditos, se le suman a su cuenta de voz en cuanto la ruleta lo elige; sin créditos, el premio lo das tú y su aviso y su correo dicen que le
              escribes.
            </p>
            {cerrada && <p className="bad small ancho">Las voces de Sloth aún son solo para ti: los créditos se rifan cuando se publique la actualización que las abre. Puedes rifar algo sin créditos (0).</p>}
            <div className="admin-rifa-botones ancho">
              <button className="ruleta-girar" disabled={!entran.length || !valido || cerrada} title={entran.length ? undefined : 'Nadie más puede ganar todavía'}>
                Rifar
              </button>
              <button type="button" className="admin-boton" onClick={() => avisarGanasteRifa({ rifa: 'prueba', premio: lista[0].premio || premioDe(10_000), creditos: lista[0].creditos, entregados: true }, true)}>
                Ver el aviso del ganador
              </button>
            </div>
          </form>
          {a.lista.length ? (
            <Tabla
              cabeza={['Participa', 'Correo', 'Desde', '']}
              filas={a.lista.map((p) => [
                p.nombre || '—',
                p.email,
                fecha(p.desde),
                p.gano ? <span className="ok small">Ganó: {p.gano}</span> : p.fuera ? <span className="bad small">Fuera: {p.fuera}</span> : ''
              ])}
            />
          ) : (
            <p className="muted small admin-vacio">Aún no participa nadie. Ya se ve en la comunidad.</p>
          )}
        </div>
      )}
      {panel && panel.ganadores.length > 0 && <Ganadores ganadores={panel.ganadores} onCambio={cambio} />}
      {ruleta && a && (
        <Ruleta
          sorteo={{ rifa: a.id, premios: lista }}
          nombres={entran.map((p) => ({ externo: p.externo, nombre: tapado(p) }))}
          onCerrar={() => (setRuleta(false), cargar(), dispatchEvent(new Event(RIFA_CAMBIO)))}
        />
      )}
      {cerrar && a && (
        <Confirm title="¿Cerrar la rifa?" action="Cerrar la rifa" danger onConfirm={() => api<Panel>('/api/comunidad/rifa/cerrar', { rifa: a.id }).then(cambio)} onClose={() => setCerrar(false)}>
          {a.ganadores.length
            ? 'Ya no se puede sortear en ella. En la comunidad sale unos días quién ganó qué. Quienes ganaron conservan su premio.'
            : 'Nadie ha ganado: deja de salir en la comunidad y se cancela. Quienes participaban no reciben aviso.'}
        </Confirm>
      )}
    </section>
  )
}

/** Cada ganador, del más nuevo al más viejo, con cómo va su premio. */
function Ganadores({ ganadores, onCambio }: { ganadores: GanadorRifa[]; onCambio(p: Panel): void }) {
  const [error, setError] = useState('')
  const hacer = (rifa: string, externo: string, accion: 'reintentar' | 'entregado') =>
    api<Panel>('/api/comunidad/rifa/ganador', { rifa, externo, accion }).then(onCambio, (e: Error) => setError(e.message))
  return (
    <>
      <h2 className="admin-rifa-subtitulo">Ganadores</h2>
      {error && <p className="bad small">{error}</p>}
      <Tabla
        cabeza={['Cuándo', 'Premio', 'Ganó', 'Entrega', 'Correo', 'Lo vio en Sloth', '']}
        filas={ganadores.map((g) => [
          fecha(g.cuando),
          g.premio,
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
              <button className="admin-boton" title="Míralo antes en Usuarios: si no le llegaron, vuelve a sumarlos" onClick={() => void hacer(g.rifa, g.externo, 'reintentar')}>
                Volver a sumar
              </button>
              <button className="admin-boton" title="Ya le llegaron: se le manda el correo" onClick={() => void hacer(g.rifa, g.externo, 'entregado')}>
                Ya le llegaron
              </button>
            </div>
          ) : (
            ''
          )
        ])}
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
type Ganador = SorteoRifa['ganadores'][number]

const punto = (grados: number, r = R) => {
  const a = (grados * Math.PI) / 180
  return `${C + r * Math.sin(a)} ${C - r * Math.cos(a)}`
}
const corto = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function Ruleta({ sorteo: pedido, nombres, onCerrar }: { sorteo: { rifa: string; premios: ReturnType<typeof leerFila>[] }; nombres: Persona[]; onCerrar(): void }) {
  // Antes de sortear, el premio de cada giro sale de la lista; después, de lo que dio el cobro.
  const porGiro = pedido.premios.flatMap((x) => Array<string>(x.ganadores).fill(x.premio)).slice(0, nombres.length)
  const [sorteo, setSorteo] = useState<SorteoRifa>()
  const [turno, setTurno] = useState(0)
  const [gajos, setGajos] = useState(() => gajosDe(nombres))
  const [giro, setGiro] = useState(0)
  const [girando, setGirando] = useState(false)
  const [cayo, setCayo] = useState<Ganador>()
  const [revelados, setRevelados] = useState<Ganador[]>([])
  const [error, setError] = useState('')
  const [pidiendo, setPidiendo] = useState(false)

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && !girando && onCerrar()
    addEventListener('keydown', alPulsar)
    return () => removeEventListener('keydown', alPulsar)
  }, [girando, onCerrar])

  const total = sorteo?.ganadores.length ?? porGiro.length
  const acabo = !!sorteo && revelados.length >= total && !girando
  const premioDelGiro = sorteo?.ganadores[turno]?.premio ?? porGiro[turno]

  async function girar() {
    setError('')
    let s = sorteo
    if (!s) {
      setPidiendo(true)
      try {
        s = await api<SorteoRifa>('/api/comunidad/rifa/sortear', pedido)
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
          {!acabo && premioDelGiro && (
            <p className="ruleta-premio">
              {total > 1 ? `Giro ${turno + 1} de ${total}: ` : ''}
              {premioDelGiro}
            </p>
          )}
          {cayo && (
            <div className="ruleta-gano" key={cayo.externo}>
              <span>{cayo.premio}</span>
              <strong>{cayo.nombre}</strong>
            </div>
          )}
          {revelados.length > 1 && (
            <ul className="ruleta-lista">
              {revelados.map((p) => (
                <li key={p.externo}>
                  <Icono de="palomita" /> {p.nombre} <span className="muted small">· {p.premio}</span>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="bad small">{error}</p>}
          {acabo ? (
            <>
              <p className="muted small">Su aviso en Sloth y su correo ya van en camino. La rifa sigue abierta: puedes volver a rifar cuando quieras.</p>
              <button className="ruleta-girar" onClick={onCerrar}>
                Listo
              </button>
            </>
          ) : (
            <button className="ruleta-girar" disabled={girando || pidiendo} onClick={() => void girar()}>
              {pidiendo ? 'Sorteando…' : girando ? 'Girando…' : sorteo ? 'Siguiente giro' : 'Girar'}
            </button>
          )}
          {!sorteo && <p className="muted small">Al girar se sortea de verdad: ya no se puede deshacer.</p>}
        </div>
      </div>
    </div>,
    document.body
  )
}
