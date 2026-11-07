import { type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { COLORES_PROYECTO, cssDeColor, type ColorProyecto, type Proyecto, type SerieProyecto } from '../../shared/proyectos'
import type { SessionMeta } from '../../shared/types'
import { api } from './api'
import { Picker } from './Composer'
import { Icono } from './Iconos'
import './Proyectos.css'

/**
 * Proyectos y series en la interfaz (`server/proyectos.ts`): la sección «Proyectos» de la barra lateral, con
 * cada proyecto y sus series plegables y sus hilos dentro; su menú (renombrar, color, nueva serie, editar memoria,
 * archivar); mover un hilo arrastrándolo o con «Mover a…»; y el editor de la memoria.
 */

/** Lo que se pide al servidor cuando cambia algo de un proyecto: todos escuchan el mismo aviso. */
export const avisarProyectos = () => dispatchEvent(new Event('sloth-proyectos'))

/** Todos los proyectos, también los archivados, y se vuelven a pedir con `avisarProyectos`. */
export function useProyectos() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  useEffect(() => {
    let vivo = true
    const pedir = () => api<Proyecto[]>('/api/proyectos').then((p) => vivo && setProyectos(p), () => {})
    pedir()
    addEventListener('sloth-proyectos', pedir)
    return () => {
      vivo = false
      removeEventListener('sloth-proyectos', pedir)
    }
  }, [])
  return proyectos
}

/** Los vivos, cada uno con sus series vivas. */
export const vivos = (proyectos: Proyecto[]) => proyectos.filter((p) => !p.archivado).map((p) => ({ ...p, series: p.series.filter((s) => !s.archivado) }))

/** Lo plegado de la barra, en localStorage; si no se puede leer o escribir, se pliega igual mientras dure la página. */
function usePlegados() {
  const [plegados, setPlegados] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('proyectosPlegados') ?? '{}') ?? {}
    } catch {
      return {}
    }
  })
  const cambiar = (clave: string, plegado: boolean) => {
    const sig = { ...plegados, [clave]: plegado }
    setPlegados(sig)
    try {
      localStorage.setItem('proyectosPlegados', JSON.stringify(sig))
    } catch {}
  }
  return [plegados, cambiar] as const
}

/** El proyecto que se ve en la barra y el compositor como elegido. */
export function leerProyectoActivo(): { proyecto: string; serie?: string } | null {
  try {
    return JSON.parse(localStorage.getItem('proyectoActivo') ?? 'null')
  } catch {
    return null
  }
}
export function guardarProyectoActivo(v: { proyecto: string; serie?: string } | null) {
  try {
    if (v) localStorage.setItem('proyectoActivo', JSON.stringify(v))
    else localStorage.removeItem('proyectoActivo')
  } catch {}
  dispatchEvent(new Event('sloth-proyecto-activo'))
}
export function useProyectoActivo() {
  const [activo, setActivo] = useState(leerProyectoActivo)
  useEffect(() => {
    const leer = () => setActivo(leerProyectoActivo())
    addEventListener('sloth-proyecto-activo', leer)
    return () => removeEventListener('sloth-proyecto-activo', leer)
  }, [])
  return activo
}

/** Arrastrar un hilo: su id viaja en este tipo. */
const TIPO = 'application/x-sloth-hilo'
export const alArrastrarHilo = (s: SessionMeta, e: React.DragEvent) => {
  e.dataTransfer.setData(TIPO, s.id)
  e.dataTransfer.effectAllowed = 'move'
}

export async function moverHilo(id: string, proyecto?: string, serie?: string) {
  await api(`/api/sessions/${id}/mover`, { proyecto: proyecto ?? null, serie: serie ?? null })
}

/** Lo que acepta soltar un hilo: se resalta mientras pasa por encima. */
function useSoltarHilo(alSoltar: (id: string) => void) {
  const [encima, setEncima] = useState(false)
  return {
    encima,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(TIPO)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setEncima(true)
      },
      onDragLeave: () => setEncima(false),
      onDrop: (e: React.DragEvent) => {
        setEncima(false)
        const id = e.dataTransfer.getData(TIPO)
        if (!id) return
        e.preventDefault()
        alSoltar(id)
      }
    }
  }
}

type Menu = { x: number; y: number; proyecto: Proyecto; serie?: SerieProyecto }

/**
 * La sección de la barra lateral: «Proyectos» con «+», cada proyecto plegable con sus series (plegables) y sus hilos, y
 * debajo «Sin proyecto», con lo que pase `sinProyecto` (la lista por fechas de siempre), que también acepta soltar.
 */
export function SeccionProyectos(props: {
  proyectos: Proyecto[]
  hilos: SessionMeta[]
  openId: string | null
  plegada: boolean
  fila(s: SessionMeta): ReactNode
  sinProyecto: ReactNode
  hayHilosSinProyecto: boolean
}) {
  const [plegados, plegar] = usePlegados()
  const [menu, setMenu] = useState<Menu | null>(null)
  const [dialogo, setDialogo] = useState<ReactNode>(null)
  const [fallo, setFallo] = useState('')
  const activo = useProyectoActivo()
  const lista = vivos(props.proyectos)
  const mover = (id: string, proyecto?: string, serie?: string) => moverHilo(id, proyecto, serie).then(() => setFallo(''), (e) => setFallo(e.message))
  const soltarFuera = useSoltarHilo((id) => void mover(id))
  const cerrar = () => setDialogo(null)
  const nuevo = () => setDialogo(<DialogoProyecto onClose={cerrar} />)
  return (
    <>
      <div className="barra-seccion proyectos-cabeza">
        Proyectos
        <button className="proyecto-mas" title="Nuevo proyecto" onClick={nuevo}>
          <Icono de="mas" /> Proyecto
        </button>
      </div>
      {fallo && <p className="bad small proyectos-fallo">{fallo}</p>}
      {lista.map((p) => {
        const suyos = props.hilos.filter((s) => s.proyecto === p.id)
        const abierto = !(plegados[p.id] ?? false) || suyos.some((s) => s.id === props.openId)
        return (
          <GrupoProyecto
            key={p.id}
            proyecto={p}
            hilos={suyos}
            abierto={abierto}
            activo={activo?.proyecto === p.id && !activo.serie}
            plegados={plegados}
            openId={props.openId}
            fila={props.fila}
            onPlegar={(k, v) => plegar(k, v)}
            onMenu={(m) => setMenu(m)}
            onSoltar={(id, serie) => void mover(id, p.id, serie)}
          />
        )
      })}
      {(props.hayHilosSinProyecto || lista.length > 0) && (
        <div className={`barra-seccion sin-proyecto${soltarFuera.encima ? ' soltando' : ''}`} {...soltarFuera.props} title="Suelta aquí un hilo para sacarlo de su proyecto">
          Sin proyecto
        </div>
      )}
      {props.sinProyecto}
      {menu && <MenuProyecto {...menu} onClose={() => setMenu(null)} onDialogo={setDialogo} />}
      {dialogo}
    </>
  )
}

function GrupoProyecto(props: {
  proyecto: Proyecto
  hilos: SessionMeta[]
  abierto: boolean
  activo: boolean
  plegados: Record<string, boolean>
  openId: string | null
  fila(s: SessionMeta): ReactNode
  onPlegar(clave: string, plegado: boolean): void
  onMenu(m: Menu): void
  onSoltar(id: string, serie?: string): void
}) {
  const { proyecto: p } = props
  const soltar = useSoltarHilo((id) => props.onSoltar(id))
  const sueltos = props.hilos.filter((s) => !s.serie || !p.series.some((x) => x.id === s.serie))
  const menu = (e: React.MouseEvent, serie?: SerieProyecto) => {
    e.preventDefault()
    e.stopPropagation()
    props.onMenu({ x: e.clientX, y: e.clientY, proyecto: p, serie })
  }
  return (
    <div className="proyecto">
      <div
        role="button"
        tabIndex={0}
        className={`session-row proyecto-row${props.abierto ? ' abierto' : ''}${soltar.encima ? ' soltando' : ''}${props.activo ? ' activo' : ''}`}
        title={`${p.nombre}: ${props.hilos.length === 1 ? '1 hilo' : `${props.hilos.length} hilos`}. Clic derecho para su menú; suelta aquí un hilo para moverlo.`}
        onClick={() => {
          props.onPlegar(p.id, props.abierto)
          guardarProyectoActivo({ proyecto: p.id })
        }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), props.onPlegar(p.id, props.abierto))}
        onContextMenu={menu}
        {...soltar.props}
      >
        <span className="session-icon">
          <span className="proyecto-punto" style={{ background: cssDeColor(p.color) }} />
        </span>
        <span className="session-title proyecto-nombre">{p.nombre}</span>
        <span className="lote-cuenta">{props.hilos.length}</span>
        <button className="proyecto-menu" title="Menú del proyecto" onClick={(e) => menu(e)}>
          <Icono de="puntos" />
        </button>
      </div>
      {props.abierto && (
        <div className="proyecto-hilos">
          {p.series.map((s) => (
            <GrupoSerie
              key={s.id}
              proyecto={p}
              serie={s}
              hilos={props.hilos.filter((h) => h.serie === s.id)}
              abierto={!(props.plegados[`${p.id}/${s.id}`] ?? false) || props.hilos.some((h) => h.serie === s.id && h.id === props.openId)}
              fila={props.fila}
              onPlegar={(v) => props.onPlegar(`${p.id}/${s.id}`, v)}
              onMenu={(e) => menu(e, s)}
              onSoltar={(id) => props.onSoltar(id, s.id)}
            />
          ))}
          {sueltos.map(props.fila)}
          {!props.hilos.length && !p.series.length && <p className="proyecto-vacio">Sin hilos. Elige este proyecto al crear uno, o arrastra uno aquí.</p>}
        </div>
      )}
    </div>
  )
}

function GrupoSerie(props: {
  proyecto: Proyecto
  serie: SerieProyecto
  hilos: SessionMeta[]
  abierto: boolean
  fila(s: SessionMeta): ReactNode
  onPlegar(plegado: boolean): void
  onMenu(e: React.MouseEvent): void
  onSoltar(id: string): void
}) {
  const soltar = useSoltarHilo(props.onSoltar)
  return (
    <div className="serie">
      <div
        role="button"
        tabIndex={0}
        className={`session-row serie-row${props.abierto ? ' abierto' : ''}${soltar.encima ? ' soltando' : ''}`}
        title={`Serie ${props.serie.nombre}: ${props.hilos.length === 1 ? '1 hilo' : `${props.hilos.length} hilos`}`}
        onClick={() => {
          props.onPlegar(props.abierto)
          guardarProyectoActivo({ proyecto: props.proyecto.id, serie: props.serie.id })
        }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), props.onPlegar(props.abierto))}
        onContextMenu={props.onMenu}
        {...soltar.props}
      >
        <span className="session-icon">
          <span className="serie-marca" style={{ borderColor: cssDeColor(props.proyecto.color) }} />
        </span>
        <span className="session-title">{props.serie.nombre}</span>
        <span className="lote-cuenta">{props.hilos.length}</span>
        <button className="proyecto-menu" title="Menú de la serie" onClick={props.onMenu}>
          <Icono de="puntos" />
        </button>
      </div>
      {props.abierto && props.hilos.length > 0 && <div className="serie-hilos">{props.hilos.map(props.fila)}</div>}
    </div>
  )
}

/** El menú de un proyecto (o de una serie): renombrar, color, nueva serie, editar memoria, archivar. */
function MenuProyecto({ x, y, proyecto, serie, onClose, onDialogo }: Menu & { onClose(): void; onDialogo(d: ReactNode): void }) {
  const [error, setError] = useState('')
  const [colores, setColores] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])
  const cerrarDialogo = () => onDialogo(null)
  const abrir = (d: ReactNode) => (onDialogo(d), onClose())
  async function run(f: () => Promise<unknown>) {
    try {
      await f()
      avisarProyectos()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const ruta = serie ? `/api/proyectos/${proyecto.id}/series/${serie.id}` : `/api/proyectos/${proyecto.id}`
  return createPortal(
    <div className="menu-backdrop" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())}>
      <div className="menu" style={{ left: Math.min(x, innerWidth - 230), top: Math.min(y, innerHeight - 260) }} onClick={(e) => e.stopPropagation()}>
        <div className="menu-titulo">{serie ? `Serie ${serie.nombre}` : proyecto.nombre}</div>
        <button onClick={() => abrir(<DialogoNombre titulo={serie ? 'Renombrar la serie' : 'Renombrar el proyecto'} inicial={serie?.nombre ?? proyecto.nombre} accion="Guardar" onClose={cerrarDialogo} onListo={(nombre) => api(ruta, { nombre })} />)}>
          Renombrar
        </button>
        {!serie && (
          <button aria-expanded={colores} onClick={() => setColores(!colores)}>
            Color
          </button>
        )}
        {!serie && colores && (
          <div className="proyecto-colores">
            {(Object.keys(COLORES_PROYECTO) as ColorProyecto[]).map((c) => (
              <button key={c} className={`proyecto-color${proyecto.color === c ? ' on' : ''}`} title={COLORES_PROYECTO[c].nombre} style={{ background: COLORES_PROYECTO[c].css }} onClick={() => run(() => api(ruta, { color: c }))} />
            ))}
          </div>
        )}
        {!serie && (
          <button onClick={() => abrir(<DialogoNombre titulo={`Nueva serie de ${proyecto.nombre}`} inicial="" accion="Crear serie" onClose={cerrarDialogo} onListo={(nombre) => api(`/api/proyectos/${proyecto.id}/series`, { nombre })} />)}>
            Nueva serie
          </button>
        )}
        <button onClick={() => abrir(<EditorMemoria proyecto={proyecto} serie={serie} onClose={cerrarDialogo} />)}>Editar memoria</button>
        <button title="Sale de la barra y de los selectores; no se borra nada" onClick={() => run(() => api(ruta, { archivado: true }))}>
          Archivar
        </button>
        {error && <div className="bad small menu-error">{error}</div>}
      </div>
    </div>,
    document.body
  )
}

/** Un modal con un campo de texto: nombre de un proyecto o una serie. */
function DialogoNombre(props: { titulo: string; inicial: string; accion: string; onClose(): void; onListo(nombre: string): Promise<unknown>; children?: ReactNode }) {
  const [nombre, setNombre] = useState(props.inicial)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  async function listo() {
    if (!nombre.trim() || ocupado) return
    setOcupado(true)
    try {
      await props.onListo(nombre.trim())
      avisarProyectos()
      props.onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setOcupado(false)
    }
  }
  return (
    <Modal titulo={props.titulo} onClose={props.onClose}>
      <input className="proyecto-campo" autoFocus value={nombre} maxLength={60} placeholder="Nombre" onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && listo()} />
      {props.children}
      {error && <p className="bad small">{error}</p>}
      <div className="modal-actions">
        <button className="ghost" onClick={props.onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={!nombre.trim() || ocupado} onClick={listo}>
          {props.accion}
        </button>
      </div>
    </Modal>
  )
}

/** «+ Proyecto»: nombre y color. */
function DialogoProyecto({ onClose }: { onClose(): void }) {
  const [color, setColor] = useState<ColorProyecto>('ambar')
  return (
    <DialogoNombre titulo="Nuevo proyecto" inicial="" accion="Crear proyecto" onClose={onClose} onListo={(nombre) => api('/api/proyectos', { nombre, color })}>
      <div className="proyecto-colores grande">
        {(Object.keys(COLORES_PROYECTO) as ColorProyecto[]).map((c) => (
          <button key={c} className={`proyecto-color${color === c ? ' on' : ''}`} title={COLORES_PROYECTO[c].nombre} style={{ background: COLORES_PROYECTO[c].css }} onClick={() => setColor(c)} />
        ))}
      </div>
      <p className="muted small">Su memoria empieza con las secciones Marca, Tono, Público, Reglas y Cierre; llénala desde su menú.</p>
    </DialogoNombre>
  )
}

function Modal({ titulo, onClose, children, className = '' }: { titulo: string; onClose(): void; children: ReactNode; className?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${className}`} role="dialog" aria-modal aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>,
    document.body
  )
}

/** Ver y editar la `MEMORIA.md` del proyecto o de su serie. */
export function EditorMemoria({ proyecto, serie, onClose }: { proyecto: Proyecto; serie?: SerieProyecto; onClose(): void }) {
  const ruta = `/api/proyectos/${proyecto.id}${serie ? `/series/${serie.id}` : ''}/memoria`
  const [texto, setTexto] = useState<string | null>(null)
  const [original, setOriginal] = useState('')
  const [archivo, setArchivo] = useState('')
  const [estado, setEstado] = useState('')
  useEffect(() => {
    api<{ texto: string; ruta: string }>(ruta).then(
      (r) => (setTexto(r.texto), setOriginal(r.texto), setArchivo(r.ruta)),
      (e) => (setTexto(''), setEstado(e.message))
    )
  }, [ruta])
  async function guardar() {
    if (texto === null) return
    setEstado('Guardando…')
    try {
      await api(ruta, { texto })
      setOriginal(texto)
      setEstado('Guardada')
    } catch (e) {
      setEstado(e instanceof Error ? e.message : String(e))
    }
  }
  const cambiada = texto !== null && texto !== original
  return (
    <Modal titulo={serie ? `Memoria de la serie ${serie.nombre}` : `Memoria de ${proyecto.nombre}`} onClose={onClose} className="memoria">
      <p className="muted small">
        El agente la lee al empezar cada hilo {serie ? 'de esta serie' : 'de este proyecto'} y la respeta. Al terminar un video propone qué agregarle. <code>{archivo}</code>
      </p>
      <textarea
        className="memoria-texto"
        spellCheck={false}
        value={texto ?? 'Leyendo…'}
        disabled={texto === null}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && (e.preventDefault(), void guardar())}
      />
      <div className="modal-actions">
        <span className="muted small memoria-estado">{cambiada ? 'Sin guardar (Ctrl+S)' : estado}</span>
        <button className="ghost" onClick={onClose}>
          Cerrar
        </button>
        <button className="primary" disabled={!cambiada} onClick={guardar}>
          Guardar
        </button>
      </div>
    </Modal>
  )
}

/** «Mover a…» del menú de un hilo: cada proyecto y sus series, y «Sin proyecto». */
export function MoverA({ session, proyectos, onListo }: { session: SessionMeta; proyectos: Proyecto[]; onListo(): void }) {
  const [error, setError] = useState('')
  const ir = (proyecto?: string, serie?: string) =>
    moverHilo(session.id, proyecto, serie).then(onListo, (e) => setError(e instanceof Error ? e.message : String(e)))
  const aqui = (p?: string, s?: string) => (session.proyecto ?? '') === (p ?? '') && (session.serie ?? '') === (s ?? '')
  return (
    <div className="mover-a">
      {vivos(proyectos).map((p) => (
        <div key={p.id}>
          <button disabled={aqui(p.id)} onClick={() => ir(p.id)}>
            <span className="proyecto-punto" style={{ background: cssDeColor(p.color) }} /> {p.nombre}
          </button>
          {p.series.map((s) => (
            <button key={s.id} className="mover-serie" disabled={aqui(p.id, s.id)} onClick={() => ir(p.id, s.id)}>
              {s.nombre}
            </button>
          ))}
        </div>
      ))}
      <button disabled={aqui()} onClick={() => ir()}>
        Sin proyecto
      </button>
      {error && <div className="bad small menu-error">{error}</div>}
    </div>
  )
}

/**
 * El selector de proyecto (y serie) del compositor, junto al de estilo. Lo elegido es el proyecto activo: el del último
 * hilo que abriste o el que tocaste en la barra.
 */
export function SelectorProyecto({ proyectos }: { proyectos: Proyecto[] }) {
  const elegido = useElegido(proyectos)
  const lista = vivos(proyectos)
  if (!lista.length) return null
  const valor = elegido ? (elegido.serie ? `${elegido.proyecto.id}/${elegido.serie.id}` : elegido.proyecto.id) : ''
  return (
    <Picker
      className="picker-proyecto"
      menuWidth={300}
      label={
        elegido ? (
          <>
            <span className="proyecto-punto" style={{ background: cssDeColor(elegido.proyecto.color) }} />
            {elegido.proyecto.nombre}
            {elegido.serie ? ` · ${elegido.serie.nombre}` : ''}
          </>
        ) : (
          'Sin proyecto'
        )
      }
      value={valor}
      groups={[
        { label: 'Proyecto: su memoria va al agente', options: [{ value: '', label: 'Sin proyecto' }] },
        ...lista.map((p) => ({ label: p.nombre, options: [{ value: p.id, label: `${p.nombre}, sin serie` }, ...p.series.map((x) => ({ value: `${p.id}/${x.id}`, label: `Serie ${x.nombre}` }))] }))
      ]}
      onChange={(v) => {
        const [proyecto, serie] = v.split('/')
        guardarProyectoActivo(proyecto ? { proyecto, ...(serie ? { serie } : {}) } : null)
      }}
    />
  )
}

/** El proyecto y la serie activos, si siguen vivos. */
export function useElegido(proyectos: Proyecto[]): { proyecto: Proyecto; serie?: SerieProyecto } | null {
  const activo = useProyectoActivo()
  const proyecto = vivos(proyectos).find((p) => p.id === activo?.proyecto)
  if (!proyecto) return null
  return { proyecto, serie: proyecto.series.find((s) => s.id === activo?.serie) }
}
