import { createPortal } from 'react-dom'
import { memo, useCallback, type KeyboardEvent as TeclaReact, type PointerEvent as PunteroReact, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { rutaEditor3D, tipoMarca3D } from '../../shared/modelos3d'
import { OPERACIONES_3D, type OperacionModelo3D, type PuntoModelo3D } from '../../shared/modelos3d'
import type { AgentEvent, Biblioteca3D, Model, Modelo3D, SessionMeta } from '../../shared/types'
import { proveedorDe } from '../../shared/providers'
import { Timeline, UrlEditor3DActual } from './Timeline'
import { api } from './api'
import { buscar, indexar } from './buscar3d'
import { useDesplazando } from './desplazando'
import { Desplegable } from './Desplegable'
import { Icono, type NombreIcono } from './Iconos'
import { Logo } from './Logos'
import { CampoAscii } from './CampoAscii'
import { Acciones3D } from './Modelos3DAcciones'
import { BorradorModelo3D } from './BorradorModelo3D'
import { Picker } from './Composer'
import { cargarEdiciones, guardarEdicionesYa, type Ediciones, type HerramientaEdicion } from './modelos3d-ediciones'
import { Confirm } from './Confirm'
import { ANGOSTO, useVisor3D, type ListoVisor, type Visor3D, type VistaVisor } from './Visor3D'
import { LIMITE_MARCAS } from '../../shared/estilos-imagen'
import { LienzoZonas, puntosSvg } from './LienzoZonas'
import './Modelos3D.css'
import './EstudioCreacion.css'

/**
 * «Modelos 3D»: la biblioteca que llenan los videos (`skills/modelos-3d`). Cada modelo es un cartel con su foto sobre
 * un foco cálido y, con el ratón (o el foco del teclado) encima, la cámara que se mece a su alrededor (`giro`); abajo,
 * para qué sirve y qué puede hacer. Se filtran por tipo (los de `categorias.json`; también con las teclas 1, 2, 3…), se
 * buscan como se escribe (`buscar3d.ts`: el más parecido primero) y se ordenan por tipo, por fecha o por nombre. Desde el
 * cartel se copia su nombre, que es lo que se le pide al agente. Al abrirlo, su ficha: se gira arrastrando, y dice qué
 * es, qué hace, sus etiquetas (buscan al tocarlas), qué da en el código, qué otros modelos necesita y de qué video salió;
 * con ← y → se pasa al de al lado. Con el teclado: / lleva al buscador, Enter abre el primero, ↓ baja a la rejilla y las
 * flechas se mueven por ella. Arriba, «Importar .glb» y «Nuevo modelo» (`Modelos3DAcciones.tsx`).
 *
 * Para que el scroll vaya fluido: mientras se desplaza, la rejilla no responde al ratón (los carteles que pasan bajo el
 * cursor no se levantan ni cargan su giro, que era casi todo el trabajo de cada cuadro), cada giro existe solo mientras
 * se mira, y lo que redibuja la app (los avisos de los hilos) no redibuja los carteles.
 */

type Orden = 'tipo' | 'recientes' | 'nombre'
const ORDENES: [Orden, string][] = [
  ['tipo', 'Por tipo'],
  ['recientes', 'Recientes'],
  ['nombre', 'A–Z'],
]
/** Lo que no dice su tipo, o dice uno que ya no está en `categorias.json`. */
const SIN_TIPO = 'Otros'
/** Los carteles que se ven al entrar: su foto se pide ya, sin esperar a que el navegador vea que están a la vista. */
const PRIMEROS = 12

const fecha = (iso?: string) => (iso ? new Date(`${iso}T12:00`).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
/** De dónde sale cada modelo, como se lee en la tarjeta y en el editor. */
const PROCEDENCIA = { video: 'De video', creado: 'Creado por ti', importado: 'Importado' } as const
const etiquetaProcedencia = (m: Modelo3D) => `${PROCEDENCIA[m.procedencia ?? 'video']}${m.editado ? ' · editado' : ''}`
const porNombre = (a: Modelo3D, b: Modelo3D) => a.nombre.localeCompare(b.nombre, 'es')
/** ¿Hay una ventana a la vista (la ficha, «Nuevo modelo», «Importar .glb» o un aviso de la app)? Menos `salvo`. */
const hayVentana = (salvo?: Element | null) =>
  [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].some((d) => d !== salvo && !salvo?.contains(d) && d.getClientRects().length > 0)
const escribiendo = (e: Event) => e.target instanceof HTMLElement && !!e.target.closest('input, textarea, select, [contenteditable="true"]')

const ICONOS_3D: Record<(typeof OPERACIONES_3D)[number]['id'], NombreIcono> = {
  texto: 'cubo', imagen: 'imagen', seleccionar: 'seleccionar', marcar: 'lapiz', mejorar: 'crear', remesh: 'geometria', reconstruir: 'reabrir', suavizar: 'ajustar',
  simetria: 'espejo', partes: 'partes', borrar: 'basura', materiales: 'materiales', texturas: 'imagen', rig: 'personas', animar: 'video', optimizar: 'optimizar',
}
const operacionesDe = (ids: (typeof OPERACIONES_3D)[number]['id'][]) => OPERACIONES_3D.filter((operacion) => ids.includes(operacion.id)).map((operacion) => ({
  value: operacion.id,
  label: <EtiquetaHerramienta3D operacion={operacion} />,
}))

function EtiquetaHerramienta3D({ operacion }: { operacion: (typeof OPERACIONES_3D)[number] }) {
  return <span className="m3d-etiqueta-herramienta"><Icono de={ICONOS_3D[operacion.id]} /><span>{operacion.nombre}</span></span>
}

function AyudaOperacion3D({ operacion }: { operacion: (typeof OPERACIONES_3D)[number] }) {
  return <div className="ayuda-video m3d-ayuda-herramienta">
    <div className="m3d-ayuda-cabecera">
      <span className="m3d-ayuda-icono"><Icono de={ICONOS_3D[operacion.id]} /></span>
      <div><strong>{operacion.nombre}</strong><span>{operacion.ayuda}</span></div>
    </div>
    <img className="m3d-ayuda-imagen" src={operacion.preview} alt={`Previsualización de ${operacion.nombre}`} loading="lazy" />
    <p className="m3d-ayuda-detalle">{operacion.detalle}</p>
    <dl className="m3d-ayuda-datos">
      <div><dt>Conserva</dt><dd>{operacion.conserva}</dd></div>
      <div><dt>Entrega</dt><dd>{operacion.resultado}</dd></div>
    </dl>
    <p className="m3d-ayuda-ejemplo"><strong>Ejemplo</strong><br />{operacion.ejemplo}</p>
  </div>
}

const ayudaOperaciones3D = {
  etiqueta: (value: string) => OPERACIONES_3D.find((operacion) => operacion.id === value)?.ayuda,
  vista: (value: string) => {
    const operacion = OPERACIONES_3D.find((item) => item.id === value)
    return operacion ? <AyudaOperacion3D operacion={operacion} /> : null
  },
}

function MarcadorModelo3D({ activo, modo, fijada, zonas, onChange, onFijar }: { activo: boolean; modo?: OperacionModelo3D; fijada: boolean; zonas: PuntoModelo3D[][]; onChange(zonas: PuntoModelo3D[][]): void; onFijar(): void }) {
  const seleccionar = modo === 'seleccionar'
  return <>
    <div className={`m3d-marcador-capa${activo ? ' activo' : ''}${fijada ? ' fijada' : ''}`} hidden={!activo}>
      <LienzoZonas key={`${modo}-${fijada}`} className="m3d-marcador" etiqueta="Dibuja una zona del modelo 3D"
        libre habilitado={activo && fijada && (seleccionar || zonas.length < LIMITE_MARCAS)}
        onPunto={seleccionar ? p => onChange([[p]]) : undefined} onZona={zona => onChange(seleccionar ? [zona] : [...zonas, zona])}>
        {zonas.map((zona, i) => zona.length === 1
          ? <circle key={i} cx={zona[0].x} cy={zona[0].y} r="1.2" />
          : tipoMarca3D(zona) === 'Zona'
            ? <polygon key={i} points={puntosSvg(zona)} vectorEffect="non-scaling-stroke" />
            : <polyline key={i} points={puntosSvg(zona)} vectorEffect="non-scaling-stroke" />)}
      </LienzoZonas>
    </div>
    {activo && <div className="m3d-marcador-ayuda">
      <span>{modo === 'seleccionar'
        ? fijada ? 'Haz clic para señalar o arrastra para dibujar' : 'Gira el modelo y fija la vista para seleccionar'
        : fijada ? 'Vista fijada. Dibuja alrededor de la cara o pieza' : 'Gira el modelo hasta encontrar la zona y fíjalo para dibujar'}</span>
      <button type="button" onClick={onFijar}><Icono de={fijada ? 'cerrar' : 'palomita'} /> {fijada ? 'Desbloquear vista' : 'Fijar vista'}</button>
    </div>}
    {!!zonas.length && <button type="button" className="m3d-marcador-limpiar" onClick={() => onChange(zonas.slice(0, -1))}>
      <Icono de="reabrir" /> {seleccionar ? 'Quitar selección' : `Deshacer marca · ${zonas.length}/${LIMITE_MARCAS}`}
    </button>}
  </>
}

/** La última biblioteca leída: al volver a la sección se ve al instante y se vuelve a leer detrás. */
let guardada: Biblioteca3D | null = null
/** Si Sloth abre en esta sección, la lista se pide al cargar el código, sin esperar a que React arme la app. */
let pedida: Promise<Biblioteca3D> | null = typeof location !== 'undefined' && location.hash.startsWith('#/modelos-3d') ? api<Biblioteca3D>('/api/modelos3d') : null

function ChatModelo3D({ grupo }: { grupo: SessionMeta[] }) {
  const [actual, ...previos] = grupo
  const ids = previos.sort((a, b) => a.createdAt - b.createdAt).map(s => s.id).join(',')
  const [anteriores, setAnteriores] = useState<AgentEvent[]>()
  const [fallo, setFallo] = useState('')
  useEffect(() => {
    let vigente = true
    setAnteriores(undefined)
    setFallo('')
    if (ids) Promise.all(ids.split(',').map(async id => {
      const { events } = await api<{ events: (AgentEvent | null)[] }>(`/api/sessions/${id}/historial`)
      const mensajes: AgentEvent[] = []
      for (const e of events) {
        if (e?.t === 'user') mensajes.push(e)
        if (e?.t === 'text' && !e.parent) mensajes.push({ ...e, id: id + '/' + e.id })
      }
      return mensajes
    })).then(listas => { if (vigente) setAnteriores(listas.flat()) },
      () => { if (vigente) setFallo('No se pudo cargar la conversación de las versiones anteriores.') })
    return () => { vigente = false }
  }, [ids])
  return <>
    {fallo && <p className="bad small" role="alert">{fallo}</p>}
    <Timeline sessionId={actual.id} running={actual.running} background={actual.background ?? []}
      proveedor={proveedorDe(actual.model)} anteriores={anteriores}
      onResponder={(text, images) => api(`/api/sessions/${actual.id}/send`, { text, images })} />
  </>
}

export const Modelos3D = memo(function Modelos3D({ modelosIA, modeloId, chats }: { modelosIA: Model[]; modeloId?: string; chats: Map<string, SessionMeta[]> }) {
  const [biblioteca, setBiblioteca] = useState<Biblioteca3D | null>(guardada)
  const [error, setError] = useState('')
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState<string | null>(null)
  const [orden, setOrden] = useState<Orden>('tipo')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [borrador, nuevoBorrador] = useState(0)
  const [marcando, setMarcando] = useState(false)
  const [operacionActiva, setOperacionActiva] = useState<OperacionModelo3D>()
  const [vistaFijada, setVistaFijada] = useState(false)
  const [zonasMarcadas, setZonasMarcadas] = useState<PuntoModelo3D[][]>([])
  useEffect(() => { setZonasMarcadas([]); setMarcando(false); setVistaFijada(false); setOperacionActiva(undefined) }, [modeloId])
  const campo = useRef<HTMLInputElement>(null)
  const raiz = useRef<HTMLDivElement>(null)
  /** La fila de herramientas: aquí van las barras del visor (vista y edición), en el espacio libre de la derecha. */
  const barraRef = useRef<HTMLDivElement>(null)
  /** La cabecera del editor: aquí va el botón de guardar, a la derecha del título. */
  const cabeceraRef = useRef<HTMLElement>(null)
  /** El modelo de IA que el compositor del editor usa ahora (para el logo de la cabecera del chat). */
  const [modeloChat, setModeloChat] = useState<string>()
  const rejilla = useRef<HTMLDivElement>(null)
  const cargar = useCallback(() =>
    (pedida ?? api<Biblioteca3D>('/api/modelos3d')).finally(() => (pedida = null)).then(
      (b) => { setError(''); setBiblioteca((guardada = b)) },
      (e) => setError(e.message)
    ), [])
  const borrarModelo = useCallback(async (id: string) => {
    await api('/api/modelos3d/borrar', { id })
    setAbierto(null)
    await cargar()
  }, [cargar])
  const grupoChat = modeloId ? chats.get(modeloId) : undefined
  const trabajos = useMemo(() => Array.from(new Set(chats.values()), grupo => grupo[0]).sort((a,b) => b.updatedAt - a.updatedAt), [chats])
  const activos = trabajos.filter((s) => s.running || s.background?.length)
  const idsActivos = activos.map((s) => s.id).sort().join(',')
  const trabajo = grupoChat?.[0]
  const trabajando = !!(trabajo?.running || trabajo?.background?.length)
  useEffect(() => void cargar(), [cargar, modeloId, trabajando, idsActivos])
  // Al entrar se arman primero los carteles que caben en la pantalla y los demás en el cuadro siguiente: los 103 de una
  // vez eran una tarea de 60 ms antes de ver el primero.
  const [todos, setTodos] = useState(false)
  useEffect(() => {
    if (!biblioteca || todos) return
    // Después de pintar (el setTimeout dentro del cuadro corre ya pintado).
    let despues = 0
    const cuadro = requestAnimationFrame(() => (despues = window.setTimeout(() => setTodos(true))))
    return () => (cancelAnimationFrame(cuadro), clearTimeout(despues))
  }, [biblioteca, todos])
  // `desplazando` mientras se mueve y hasta 200 ms después (el CSS quita el ratón a la rejilla).
  useDesplazando(raiz)
  const modelos = useMemo(() => biblioteca?.modelos ?? [], [biblioteca])
  const enEditor = modelos.find((m) => m.id === modeloId)
  const idVisor = enEditor?.visor
  useEffect(() => {
    if (!modeloId || idVisor || (!enEditor && !trabajando)) return
    let intentos = 0
    const reloj = window.setInterval(() => {
      if (document.hidden) return
      if (enEditor && ++intentos > 45) clearInterval(reloj)
      else void cargar()
    }, 4000)
    return () => clearInterval(reloj)
  }, [cargar, modeloId, idVisor, enEditor?.id, trabajando])
  // El visor 3D, uno solo mientras la sección está abierta (`Visor3D.tsx`). Con el ratón 350 ms sobre un cartel, ya
  // prepara su modelo: casi siempre es el que se va a abrir, y su ficha lo tiene al instante.
  const { visor, listo, marco } = useVisor3D(modelos)
  // Y los que se ven en la rejilla, con ella quieta (al entrar y cada vez que se deja de desplazar): el visor los prepara
  // de fondo, y abrir uno ya no tarda. Siempre todos los que se ven: el visor salta los que ya tiene, y vuelve a preparar
  // los que tuvo que quitar.
  useEffect(() => {
    const el = raiz.current
    if (!el || !visor.hay || modeloId) return
    let espera = 0
    let pausado = false
    const mira = () => {
      clearTimeout(espera)
      // Mientras se desplaza, el visor no hace nada de fondo.
      if (!pausado) visor.pausar((pausado = true))
      espera = window.setTimeout(() => {
        visor.pausar((pausado = false))
        const ids = [...el.querySelectorAll<HTMLElement>('.m3d-cartel[data-id]')]
          .filter((c) => {
            const r = c.getBoundingClientRect()
            return r.bottom > 0 && r.top < innerHeight
          })
          .map((c) => c.dataset.id!)
          .filter((id) => guardada?.modelos.find((m) => m.id === id)?.visor)
        visor.precalentar(ids)
      }, 1200)
    }
    mira()
    el.addEventListener('scroll', mira, { passive: true })
    return () => (clearTimeout(espera), el.removeEventListener('scroll', mira))
  }, [visor, biblioteca, modeloId])
  /** El último que preparó el ratón: pasar otra vez sobre él no lo vuelve a pedir. */
  const preparado = useRef('')
  const abiertoYa = useRef(abierto)
  abiertoYa.current = abierto
  const preparar = useCallback(
    (id: string) => {
      if (abiertoYa.current || !guardada?.modelos.find((m) => m.id === id)?.visor || preparado.current === id) return
      preparado.current = id
      visor.mostrar(id)
    },
    [visor]
  )
  const nombres = biblioteca?.categorias.map((c) => c.nombre) ?? []
  const tipoDe = (m: Modelo3D) => (m.categoria && nombres.includes(m.categoria) ? m.categoria : SIN_TIPO)
  const tipos = [...nombres, SIN_TIPO]
    .map((nombre) => ({ nombre, para: biblioteca?.categorias.find((c) => c.nombre === nombre)?.para ?? '', cuantos: modelos.filter((m) => tipoDe(m) === nombre).length }))
    .filter((t) => t.cuantos)
  const indices = useMemo(() => modelos.map(indexar), [modelos])
  const tipoExiste = !tipo || tipos.some((t) => t.nombre === tipo)
  useEffect(() => {
    if (biblioteca && !tipoExiste) setTipo(null)
  }, [biblioteca, tipoExiste])

  const hayBusqueda = busca.trim().length > 0
  const posicion = (m: Modelo3D) => (nombres.includes(tipoDe(m)) ? nombres.indexOf(tipoDe(m)) : nombres.length)
  const comparar = (a: Modelo3D, b: Modelo3D) =>
    orden === 'recientes' ? (b.actualizado ?? '').localeCompare(a.actualizado ?? '') || porNombre(a, b) : orden === 'nombre' ? porNombre(a, b) : posicion(a) - posicion(b) || porNombre(a, b)
  // El orden en que se ven, que es también el que siguen ← y → en la ficha: buscando, el más parecido primero.
  const enOrden = buscar(indices, busca)
    .filter((r) => !tipo || tipoDe(r.modelo) === tipo)
    .sort((a, b) => b.puntos - a.puntos || comparar(a.modelo, b.modelo))
    .map((r) => r.modelo)
  const elegido = tipos.find((t) => t.nombre === tipo)
  const ficha = modelos.find((m) => m.id === abierto)

  // «/» lleva al buscador; 1 son todos y 2, 3… cada tipo, en el orden de la barra. No escribiendo ni con una ventana
  // abierta (la ficha, «Nuevo modelo», «Importar .glb» o un aviso de la app).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (modeloId || abierto || escribiendo(e) || e.ctrlKey || e.metaKey || e.altKey || hayVentana()) return
      if (e.key === '/') {
        e.preventDefault()
        campo.current?.focus()
      } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= tipos.length + 1) {
        setTipo(e.key === '1' ? null : tipos[Number(e.key) - 2].nombre)
        // Si el cartel que tenía el foco ya no está, el foco va al primero de los que quedan.
        requestAnimationFrame(() => document.activeElement === document.body && (rejilla.current?.querySelector<HTMLElement>('.m3d-cartel') ?? campo.current)?.focus())
      }
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }, [abierto, tipos, modeloId])

  /** Las flechas en la rejilla: a los lados, y arriba y abajo una fila; arriba de la primera, al buscador. */
  function moverse(e: TeclaReact) {
    const paso = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 0, ArrowUp: 0 }[e.key]
    if (paso === undefined || abierto || !rejilla.current) return
    const carteles = [...rejilla.current.querySelectorAll<HTMLElement>('.m3d-cartel')]
    const i = carteles.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    e.preventDefault()
    const columnas = carteles.filter((c) => c.offsetTop === carteles[0].offsetTop).length
    const j = i + (paso || (e.key === 'ArrowDown' ? columnas : -columnas))
    if (j < 0) campo.current?.focus()
    else carteles[Math.min(j, carteles.length - 1)].focus()
  }

  /** Al cerrar la ficha, el foco vuelve al cartel del último que se vio (con ← y → pudo ser otro); si no está a la vista, al buscador. */
  function cerrar() {
    const id = abierto
    setAbierto(null)
    requestAnimationFrame(() => (rejilla.current?.querySelector<HTMLElement>(`[data-id="${id}"]`) ?? campo.current)?.focus())
  }

  /** En las pestañas, ← y → pasan a la de al lado y la eligen. */
  function entrePestanas(e: TeclaReact<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const todas = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    const i = todas.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    e.preventDefault()
    const otra = todas[(i + (e.key === 'ArrowRight' ? 1 : -1) + todas.length) % todas.length]
    otra.focus()
    otra.click()
  }

  function abrirResultado(sesion: SessionMeta) {
    nuevoBorrador((n) => n + 1)
    setZonasMarcadas([])
    location.hash = sesion.modelo3d ? rutaEditor3D(modeloId ?? sesion.modelo3d.resultado) : `#/s/${sesion.id}`
  }

  if (modeloId) {
    const origen = trabajo?.modelo3d?.origen
    const anterior = modelos.find((m) => m.id === origen) ?? grupoChat?.map(s => modelos.find(m => m.id === s.modelo3d?.resultado)).find(Boolean)
    const activarOperacion = (id?: OperacionModelo3D) => {
      const marcar = id === 'seleccionar' || id === 'marcar' || id === 'borrar' || id === 'texturas'
      setMarcando(marcar)
      setOperacionActiva(id)
      setVistaFijada(id === 'marcar' || id === 'seleccionar')
      setZonasMarcadas([])
    }
    const elegirOperacion = (id: string) => {
      activarOperacion(id as OperacionModelo3D)
    }
    return <section key={modeloId} className="m3d m3d-editor">
      <header ref={cabeceraRef} className="m3d-editor-cabecera">
        <div className="m3d-editor-titulo">
          <a className="m3d-editor-volver boton" href="#/modelos-3d" aria-label="Volver a Modelos 3D" title="Volver a Modelos 3D"><Icono de="izquierda" /></a>
          <div>
            <h1>{enEditor?.nombre ?? (origen ? 'Variante 3D' : 'Modelo 3D')}</h1>
            <div className="m3d-editor-datos">
              <small>Modelo 3D · Vista previa interactiva</small>
              {enEditor && <small>{etiquetaProcedencia(enEditor)}</small>}
              {trabajo && <small>{trabajando ? 'En proceso' : enEditor ? 'Modelo guardado' : 'Revisar intento'}</small>}
            </div>
          </div>
        </div>
      </header>
      <div className="m3d-editor-cuerpo">
        <section className="m3d-editor-visual" aria-label="Vista previa del modelo 3D">
          <div ref={barraRef} className="m3d-editor-herramientas" role="toolbar" aria-label="Herramientas de modelado 3D">
            <Picker flotante ayuda={ayudaOperaciones3D} etiqueta="Crear modelo" className="m3d-selector-herramientas m3d-selector-crear"
              menuClassName="m3d-menu-herramientas" menuWidth={280} value="" label={<span className="m3d-etiqueta-herramienta"><Icono de="crear" /><span>Crear modelo</span></span>}
              onChange={elegirOperacion} groups={[{ label: 'Crear modelo', options: operacionesDe(['texto', 'imagen']) }]} />
            <Picker flotante ayuda={ayudaOperaciones3D} etiqueta="Selección y marcado" className="m3d-selector-herramientas m3d-selector-seleccion"
              menuClassName="m3d-menu-herramientas" menuWidth={300} value="" label={<span className="m3d-etiqueta-herramienta"><Icono de="seleccionar" /><span>Seleccionar</span></span>}
              onChange={elegirOperacion} groups={[{ label: 'Trabajar sobre una zona', options: operacionesDe(['seleccionar', 'marcar', 'borrar', 'texturas']) }]} />
            <Picker flotante ayuda={ayudaOperaciones3D} etiqueta="Geometría" className="m3d-selector-herramientas m3d-selector-geometria"
              menuClassName="m3d-menu-herramientas" menuWidth={280} value="" label={<span className="m3d-etiqueta-herramienta"><Icono de="geometria" /><span>Geometría</span></span>}
              onChange={elegirOperacion} groups={[{ label: 'Forma y malla', options: operacionesDe(['mejorar', 'remesh', 'reconstruir', 'suavizar', 'simetria', 'partes']) }]} />
            <Picker flotante ayuda={ayudaOperaciones3D} etiqueta="Materiales y movimiento" className="m3d-selector-herramientas m3d-selector-materiales"
              menuClassName="m3d-menu-herramientas" menuWidth={280} value="" label={<span className="m3d-etiqueta-herramienta"><Icono de="materiales" /><span>Materiales</span></span>}
              onChange={elegirOperacion} groups={[{ label: 'Acabado y animación', options: operacionesDe(['materiales', 'rig', 'animar']) }]} />
            <Picker flotante ayuda={ayudaOperaciones3D} etiqueta="Optimizar y exportar" className="m3d-selector-herramientas m3d-selector-optimizar"
              menuClassName="m3d-menu-herramientas" menuWidth={280} value="" label={<span className="m3d-etiqueta-herramienta"><Icono de="optimizar" /><span>Optimizar</span></span>}
              onChange={elegirOperacion} groups={[{ label: 'Preparar salida', options: operacionesDe(['optimizar']) }]} />
          </div>
          <div className={`m3d-editor-visor${vistaFijada ? ' m3d-editor-visor-fijado' : ''}`}>
            {enEditor
              ? <Escena key={enEditor.id + (idVisor ?? '')} visor={visor} listo={listo} modelo={enEditor} herramientas barra={barraRef} cabecera={cabeceraRef} onTecla={(tecla) => {
                  if (tecla === 'Tab') document.querySelector<HTMLElement>('.m3d-editor-panel textarea')?.focus()
                  if (tecla === 'Shift+Tab') document.querySelector<HTMLElement>('.m3d-editor-cabecera a:first-child')?.focus()
                  if (tecla === 'ArrowLeft' || tecla === 'ArrowRight') visor.girar([tecla === 'ArrowLeft' ? -1 : 1, 0])
                }} />
              : trabajando
                ? <div className="m3d-generacion" role="status">
                    {anterior?.vista ? <img src={anterior.vista} alt={`Modelo de partida: ${anterior.nombre}`} /> : <Icono de="cubo" />}
                    <span>{anterior?.vista ? 'Creando variante…' : 'Generando modelo 3D…'}</span>
                  </div>
                : <Vacio titulo={trabajo ? 'El resultado aún no está en la biblioteca' : biblioteca ? 'Modelo no disponible' : 'Cargando modelo…'}
                    texto={trabajo ? 'Puedes consultar lo que ocurrió en el chat de edición.'
                      : error || (biblioteca ? 'Vuelve a la biblioteca para abrir otro modelo.' : '')}>
                    {anterior && <a className="m3d-enlace" href={rutaEditor3D(anterior.id)}>Continuar con {anterior.nombre}</a>}
                  </Vacio>}
            <MarcadorModelo3D activo={marcando} modo={operacionActiva} fijada={vistaFijada} zonas={zonasMarcadas} onChange={setZonasMarcadas} onFijar={() => { setZonasMarcadas([]); setVistaFijada(fijada => !fijada) }} />
          </div>
        </section>
        <section className="m3d-editor-panel" aria-label="Chat de edición 3D">
          <div className="m3d-editor-chat-titulo"><Icono de="hilo" /><strong>Chat de edición 3D</strong><span className="m3d-chat-modelo" title={modeloChat ?? trabajo?.model ?? 'IA'}>{modeloChat ?? trabajo?.model ? <Logo de={proveedorDe(modeloChat ?? trabajo?.model ?? '')} chico /> : 'IA'}</span></div>
          {grupoChat?.length ? <UrlEditor3DActual.Provider value={new URL(rutaEditor3D(modeloId), location.href).href}>
            <ChatModelo3D key={grupoChat[0].id} grupo={grupoChat} />
          </UrlEditor3DActual.Provider>
            : <div className="m3d-editor-chat-historial m3d-editor-vacio">
                <span className="m3d-editor-vacio-icono" aria-hidden="true"><Icono de="hilo" /></span>
                <strong>Edita al grano</strong>
                <p>Escribe abajo el cambio que quieres.</p>
                <p className="m3d-editor-vacio-pista">¿Prefieres a mano? Elige Mover, Girar o Escalar y toca una pieza.</p>
              </div>}
          {error && <p className="bad small" role="alert">{error}</p>}
          {(enEditor || trabajando) && <BorradorModelo3D key={modeloId} modelos={modelosIA} agente={trabajo?.model} onModelo={setModeloChat} origen={enEditor ?? { id: modeloId, nombre: modeloId }} zonas={zonasMarcadas}
            herramienta={operacionActiva} onQuitarHerramienta={() => activarOperacion()} onCreado={abrirResultado} />}
        </section>
      </div>
      {marco}
    </section>
  }

  return (
    <div className="m3d m3d-biblioteca fondo-ramas" ref={raiz}>
      <CampoAscii variante="ramas" />
      <header className="creacion-portada">
        <img className="creacion-portada-fondo" src="/estudio-modelos-3d.webp" alt="" width={1440} height={480} fetchPriority="high" decoding="async" />
        <span className="creacion-portada-icono" aria-hidden="true"><Icono de="cubo" /></span>
        <div>
          <h1>Modelos 3D</h1>
          <p>Crea modelos que puedes reutilizar en tus videos.</p>
        </div>
      </header>
      <div className="creacion-flotante">
        <BorradorModelo3D key={borrador} modelos={modelosIA} onCreado={abrirResultado} />
      </div>
      <section className="m3d-cabeza" aria-labelledby="m3d-biblioteca">
        <div className="m3d-cabeza-titulo">
          <div>
            <h2 id="m3d-biblioteca">Mis modelos 3D</h2>
            <p>Modelos listos para reutilizar en tus videos.</p>
          </div>
          {biblioteca && <span className="m3d-cabeza-conteo">{modelos.length} {modelos.length === 1 ? 'modelo' : 'modelos'}</span>}
        </div>
        <div className="m3d-herramientas">
          <label className="m3d-busca" title="Tecla /">
            <Icono de="buscar" />
            <input
              ref={campo}
              aria-label="Buscar modelos 3D"
              placeholder="Buscar: caja, dinero, se abre…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setBusca('')
                  e.currentTarget.blur()
                } else if (e.key === 'Enter' && enOrden[0]) setAbierto(enOrden[0].id)
                else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  rejilla.current?.querySelector<HTMLElement>('.m3d-cartel')?.focus()
                }
              }}
            />
            {busca && (
              <button title="Borrar la búsqueda" aria-label="Borrar la búsqueda" onClick={() => (setBusca(''), campo.current?.focus())}>
                <Icono de="cerrar" />
              </button>
            )}
          </label>
          <Acciones3D tipos={nombres} onImportado={(id) => void cargar().then(() => setAbierto(id))} />
        </div>
      </section>

      {biblioteca && modelos.length > 0 && (
        <div className="m3d-barra">
          <div className="m3d-tipos" role="tablist" aria-label="Tipos" onKeyDown={entrePestanas}>
            {[{ nombre: null, para: '', cuantos: modelos.length }, ...tipos].map((t, i) => (
              <button
                key={t.nombre ?? ''}
                role="tab"
                aria-selected={tipo === t.nombre}
                tabIndex={tipo === t.nombre || (!tipoExiste && !t.nombre) ? 0 : -1}
                className={tipo === t.nombre ? 'on' : ''}
                title={`${t.para ? `${t.para} ` : ''}(tecla ${i + 1})`}
                onClick={() => setTipo(t.nombre)}
              >
                {t.nombre ?? 'Todos'} <span>{t.cuantos}</span>
              </button>
            ))}
          </div>
          <Desplegable className="m3d-orden" nombre="Ordenar" icono={<Icono de="ordenar" />} valor={orden} opciones={ORDENES.map(([o, texto]) => ({ value: o, label: texto }))} onCambio={(o) => setOrden(o as Orden)} />
        </div>
      )}
      {biblioteca && (hayBusqueda || elegido) && enOrden.length > 0 && (
        <div className="m3d-cuenta">
          <strong>{enOrden.length === 1 ? '1 modelo' : `${enOrden.length} modelos`}</strong>
          {elegido && ` de ${elegido.nombre}`}
          {hayBusqueda && ` con «${busca.trim()}»`}
          {elegido?.para && !hayBusqueda && <span> · {elegido.para}</span>}
          {hayBusqueda && <span className="m3d-pista"> · Enter abre el primero</span>}
        </div>
      )}
      {error && <p className="bad small">{error}</p>}
      {activos.length > 0 && <ul className="m3d-pedidos" aria-label="Modelos en proceso">
        {activos.map((s) => <li key={s.id}>
          <span className="spinner" aria-hidden="true" />
          <div><strong>{s.title}</strong><small>{s.background?.[0] ?? 'Generando modelo 3D…'}</small></div>
          <a className="m3d-enlace" href={rutaEditor3D(s.modelo3d!.editando ?? s.modelo3d!.resultado)}>Ver progreso</a>
        </li>)}
      </ul>}

      {!biblioteca && !error ? (
        <div className="m3d-rejilla">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="m3d-cartel m3d-esqueleto" />
          ))}
        </div>
      ) : biblioteca && !modelos.length ? (
        !activos.length && <Vacio titulo="La biblioteca está vacía" texto="Los modelos que crees o importes aparecerán aquí." />
      ) : biblioteca && !enOrden.length ? (
        <Vacio titulo={`Ningún modelo${tipo ? ` de ${tipo}` : ''}${hayBusqueda ? ` con «${busca.trim()}»` : ''}`} texto="El siguiente video que lo necesite lo hará y lo guardará aquí.">
          <button className="m3d-boton" onClick={() => (setBusca(''), setTipo(null))}>
            Ver todos
          </button>
        </Vacio>
      ) : (
        <div className="m3d-rejilla" ref={rejilla} onKeyDown={moverse}>
          {(todos ? enOrden : enOrden.slice(0, 2 * PRIMEROS)).map((m, i) => (
            <Cartel key={m.id} modelo={m} tipo={tipo ? undefined : tipoDe(m)} pronto={i < PRIMEROS} onAbrir={setAbierto} onPreparar={preparar} />
          ))}
        </div>
      )}

      <Trabajos3D trabajos={trabajos.slice(0, 6)} modelos={modelos} titulo="Actividad reciente" />

      {marco}
      {ficha && (
        <Ficha
          visor={visor}
          listo={listo}
          modelo={ficha}
          tipo={tipoDe(ficha)}
          todos={modelos}
          onCerrar={cerrar}
          onBorrar={() => borrarModelo(ficha.id)}
          onIr={(id) => setAbierto(id)}
          onPaso={(paso) => {
            const lista = enOrden.some((m) => m.id === ficha.id) ? enOrden : modelos
            const i = lista.findIndex((m) => m.id === ficha.id)
            const otro = lista[(i + paso + lista.length) % lista.length]
            if (otro) setAbierto(otro.id)
          }}
          onBuscar={(texto) => {
            setBusca(texto)
            setTipo(null)
            setAbierto(null)
            requestAnimationFrame(() => campo.current?.focus())
          }}
          onTipo={(t) => {
            setTipo(t === SIN_TIPO ? null : t)
            setBusca('')
            setAbierto(null)
            requestAnimationFrame(() => raiz.current?.querySelector<HTMLElement>('.m3d-tipos [aria-selected="true"]')?.focus())
          }}
        />
      )}
    </div>
  )
})

/** Copia el nombre (id) de un modelo: es lo que se le pide al agente. Dice «copiado» un momento. */
function useCopiar() {
  const [copiado, setCopiado] = useState<string | null>(null)
  useEffect(() => {
    if (!copiado) return
    const t = setTimeout(() => setCopiado(null), 1600)
    return () => clearTimeout(t)
  }, [copiado])
  return [copiado, (id: string) => navigator.clipboard.writeText(id).then(() => setCopiado(id), () => {})] as const
}

/** Lo que el ratón se queda en un cartel antes de cargar su giro (ms): cruzarlo de camino a otro no lo carga. */
const ESPERA = 100
/** Lo que el ratón se queda en un cartel antes de preparar su visor 3D (ms). */
const PREPARA = 350

/**
 * Un modelo en la rejilla: su foto quieta y, con el ratón quieto encima (o con el foco del teclado), su giro. El
 * `<video>` solo existe desde que se queda hasta que se desvanece al salir: barrer la rejilla con el ratón no baja los
 * giros, y los que ya se vieron no se quedan ocupando memoria ni capas de la tarjeta gráfica. Con el teclado, la tecla C
 * copia su nombre. `tipo`, si no se está filtrando por uno; `pronto`, si se ve al entrar.
 */
const Cartel = memo(function Cartel({ modelo, tipo, pronto, onAbrir, onPreparar }: { modelo: Modelo3D; tipo?: string; pronto: boolean; onAbrir(id: string): void; onPreparar(id: string): void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [fotoFallida, setFotoFallida] = useState(false)
  const [vivo, setVivo] = useState(false)
  const [girando, setGirando] = useState(false)
  const [copiado, copiar] = useCopiar()
  const reloj = useRef(0)
  useEffect(() => () => (clearTimeout(reloj.current), clearTimeout(preparo.current)), [])
  // Si volvió antes de que se fuera, sigue donde iba; `playing` lo vuelve a mostrar.
  const preparo = useRef(0)
  const entra = () => {
    clearTimeout(reloj.current)
    clearTimeout(preparo.current)
    // Si se queda un poco más, prepara su visor 3D (ver `preparar` en Modelos3D).
    preparo.current = window.setTimeout(() => onPreparar(modelo.id), PREPARA)
    if (video.current) video.current.play().catch(() => {})
    else if (modelo.giro) reloj.current = window.setTimeout(() => setVivo(true), ESPERA)
  }
  const sale = () => {
    clearTimeout(reloj.current)
    clearTimeout(preparo.current)
    video.current?.pause()
    setGirando(false)
    reloj.current = window.setTimeout(() => setVivo(false), 250)
  }
  useEffect(() => setFotoFallida(false), [modelo.id, modelo.vista])
  const tieneVideo = !!modelo.giro || !!modelo.vuelta
  const videoPreview = modelo.giro ?? modelo.vuelta
  return (
    <button
      className={`m3d-cartel${girando ? ' girando' : ''}`}
      data-id={modelo.id}
      aria-keyshortcuts="C"
      // Con el ratón abre al apretar, como los menús del sistema (un clic de persona dura unos 100 ms); con el teclado,
      // Enter. Copiar su nombre no la abre.
      onPointerDown={(e) => e.pointerType === 'mouse' && e.button === 0 && !(e.target as HTMLElement).closest('.m3d-copiar') && onAbrir(modelo.id)}
      onClick={(e) => !(e.target as HTMLElement).closest('.m3d-copiar') && onAbrir(modelo.id)}
      onKeyDown={(e) => {
        if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          copiar(modelo.id)
        }
      }}
      onMouseEnter={entra}
      onMouseLeave={sale}
      onFocus={(e) => e.currentTarget.matches(':focus-visible') && entra()}
      onBlur={sale}
    >
      <span className="m3d-foco" />
      {modelo.vista && !fotoFallida ? (
        <img className="m3d-foto" src={modelo.vista} alt="" loading={pronto ? 'eager' : 'lazy'} fetchPriority={pronto ? 'high' : 'auto'} decoding="async" draggable={false}
          onError={() => setFotoFallida(true)} />
      ) : tieneVideo && videoPreview && !fotoFallida ? (
        <video className="m3d-foto m3d-foto-video" src={videoPreview} muted loop autoPlay playsInline disablePictureInPicture disableRemotePlayback onError={() => setFotoFallida(true)} />
      ) : (
        <span className="m3d-sin m3d-sin-preparando">
          <Icono de="cubo" />
          <strong>Vista en preparación</strong>
          <small>El modelo ya está guardado. La miniatura aparecerá al terminar el render.</small>
        </span>
      )}
      {vivo && (
        <video ref={video} className="m3d-giro" src={modelo.giro} muted loop autoPlay playsInline disablePictureInPicture disableRemotePlayback onPlaying={() => setGirando(true)} />
      )}
      {tipo && <span className="m3d-tipo">{tipo}</span>}
      <span className={`m3d-procedencia ${modelo.procedencia ?? 'video'}`}>{PROCEDENCIA[modelo.procedencia ?? 'video']}</span>
      {modelo.editado && <span className="m3d-procedencia editado">Editado</span>}
      {/* Para el ratón; con el teclado es la tecla C, o «Copiar» en la ficha. */}
      <span
        aria-hidden="true"
        className={`m3d-copiar${copiado ? ' hecho' : ''}`}
        title={`Copiar su nombre («${modelo.id}») para pedírselo al agente (tecla C)`}
        onClick={(e) => {
          e.stopPropagation()
          copiar(modelo.id)
        }}
      >
        <Icono de={copiado ? 'palomita' : 'copiar'} />
        <span>{copiado ? 'Copiado' : modelo.id}</span>
      </span>
      <span className="m3d-pie">
        <strong>{modelo.nombre}</strong>
        <span className="m3d-resumen">{modelo.resumen ?? modelo.descripcion}</span>
        {modelo.hace?.length ? (
          <span className="m3d-hace" title={modelo.hace.join(' · ')}>
            <Icono de="palomita" />
            <span>{modelo.hace.join(' · ')}</span>
          </span>
        ) : null}
      </span>
    </button>
  )
})

/** Cuánto se puede acercar el modelo con la rueda en la ficha. */
const MAS_CERCA = 2
/**
 * Cómo viene la vuelta entera (`vitrina.tsx`): 36 cuadros por vuelta, uno cada 10°, a 4 alturas seguidas (de frente,
 * 25°, 50° y casi desde arriba), a 30 cuadros por segundo. Su paso 0 a la segunda altura es casi la foto del modelo.
 */
const PASOS = 36
const ALTURAS = 4
const ALTURA_FOTO = 1
const CPS = 30
const tiempoDe = (p: { altura: number; paso: number }) => (p.altura * PASOS + p.paso + 0.5) / CPS
/** Lo que se arrastra de arriba abajo para pasar a la altura siguiente (px). */
const POR_ALTURA = 80
/** Cuánto se mece a cada lado el giro de la vista (`vitrina.tsx`, VAIVEN), en grados. */
const VAIVEN = 24

/**
 * El modelo en la ficha. Con su visor 3D (`Visor3D.tsx`, el único de la sección), el modelo de verdad, con el código de
 * los videos: se gira en todos los ejes, se acerca a su geometría y se mueve. Al abrir, se le pide este modelo; cuando lo
 * tiene, se le pide desde el ángulo en que va el giro, y entonces se pone encima: no salta. Mientras tanto (unas décimas,
 * nada si ya lo preparó el ratón) y sin visor, lo de abajo. No se pone a media arrastrada: al soltar. Sus avisos: que lo
 * tocaron, las teclas de la ficha (Esc y las flechas, con el foco dentro) y, en angosto, la rueda, que desplaza la ficha.
 *
 * Quieto, se mece suave (su giro, el mismo de la rejilla). Al arrastrar, o con Mayús y las
 * flechas, pasa a su vuelta entera (`vuelta.webm`) y se ve por todos lados: de lado da la vuelta (todo el ancho de la
 * escena es una, y sigue sin tope) y de arriba abajo cambia de altura, hasta verlo casi desde arriba; empieza en el
 * ángulo en que iba el giro. Sin vuelta, recorre el vaivén del giro (la cámara va de un lado a otro con un seno: el punto
 * del arrastre se vuelve un ángulo y el ángulo, el momento del video que lo muestra). Saltar a un cuadro tarda unos ms:
 * va un salto a la vez y, si mientras llegaste a otro lado, el siguiente va directo ahí. Al soltar se queda donde lo
 * dejaste; un clic sin arrastrar no lo para; la rueda lo acerca hacia el ratón y el doble clic lo deja como estaba. Va
 * con la `key` del modelo: al pasar a otro, empieza de cero.
 */
/** La barra de edición: cada herramienta con su icono y su nombre (`ver` no cambia nada). */
const HERRAMIENTAS_EDICION: { id: HerramientaEdicion; nombre: string; titulo: string; icono: NombreIcono }[] = [
  { id: 'ver', nombre: 'Ver', titulo: 'Ver sin editar', icono: 'ver' },
  { id: 'mover', nombre: 'Mover', titulo: 'Mover la pieza elegida (clic sobre ella)', icono: 'mover' },
  { id: 'girar', nombre: 'Girar', titulo: 'Girar la pieza elegida', icono: 'rotar' },
  { id: 'escalar', nombre: 'Escalar', titulo: 'Escalar la pieza elegida', icono: 'escalar' },
]

function Escena({ visor, listo, modelo, herramientas, barra, cabecera, onPaso, onTecla }: { visor: Visor3D; listo: ListoVisor; modelo: Modelo3D; herramientas?: boolean; barra?: { current: HTMLElement | null }; cabecera?: { current: HTMLElement | null }; onPaso?(paso: number): void; onTecla?(tecla: string): void }) {
  const entera = !!modelo.vuelta
  const conVisor = visor.hay && !!modelo.visor
  const [visorListo, setVisorListo] = useState(false)
  /** La barra del visor (editor): malla, cuadrícula y las cifras del modelo que se ve. */
  const [vista, setVista] = useState<VistaVisor>({ malla: false, cuadricula: false })
  const [cifras, setCifras] = useState<{ triangulos: number; piezas: number } | null>(null)
  const vistaPrimera = useRef(true)
  /** La edición a mano: la herramienta de la barra, lo que se puede deshacer y el nombre de la pieza elegida. */
  const [herramienta, setHerramienta] = useState<HerramientaEdicion>('ver')
  const [historial, setHistorial] = useState({ deshacer: false, rehacer: false })
  const [pieza, setPieza] = useState('')
  const herramientaPrimera = useRef(true)
  /** Las piezas movidas de este modelo (se leen al abrirlo y se mandan al visor con cada vez que se enseña). */
  const edicionesRef = useRef<Ediciones>({})
  /** Si hay cambios sin guardar, si se está guardando y si el último guardado falló (para el botón «Guardar cambios»). */
  const [pendientes, setPendientes] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState(false)
  const guardarAhora = async () => {
    if (guardando) return
    setGuardando(true)
    const ok = await guardarEdicionesYa(modelo.id, edicionesRef.current)
    setGuardando(false)
    setFallo(!ok)
    if (ok) setPendientes(false)
  }
  const alSoltar = useRef<(() => void) | null>(null)
  const fase = useRef<'pedido' | 'alineando' | 'puesto'>('pedido')
  /** Los `listo` de antes de abrir (de cuando el ratón lo preparó) no cuentan: cuentan los que contestan a esta ficha. */
  const listosAntes = useRef(listo?.n ?? 0)
  // Al abrir: su lugar (aún sin verse, para que el visor ya tenga su tamaño) y que enseñe este modelo.
  useEffect(() => {
    if (!conVisor) return
    visor.colocar(escena.current, false)
    // Primero sus piezas movidas (si las tiene), para que se enseñe ya con ellas.
    let vigente = true
    void cargarEdiciones(modelo.id).then((e) => {
      if (!vigente) return
      edicionesRef.current = e
      visor.mostrar(modelo.id, undefined, e)
    })
    return () => {
      vigente = false
      visor.colocar(null)
    }
  }, [])
  // Sus avisos, mientras esta ficha está abierta.
  useEffect(() => {
    if (!conVisor) return
    visor.oir((d) => {
      if (d.que === 'toca') setAMano(true)
      else if (d.que === 'tecla' && d.key) onTecla?.(d.key)
      else if (d.que === 'rueda' && d.dy) escena.current?.closest('.m3d-ficha')?.scrollBy({ top: d.dy })
      else if (d.que === 'estadisticas' && d.id === modelo.id) setCifras({ triangulos: d.triangulos ?? 0, piezas: d.piezas ?? 0 })
      else if (d.que === 'ediciones' && d.id === modelo.id && d.ediciones) {
        edicionesRef.current = d.ediciones
        // Guardado a mano: el cambio queda pendiente hasta pulsar «Guardar cambios» (o Ctrl+S).
        setPendientes(true)
        setFallo(false)
      } else if (d.que === 'historial') setHistorial({ deshacer: !!d.deshacer, rehacer: !!d.rehacer })
      else if (d.que === 'herramienta' && d.herramienta) setHerramienta(d.herramienta)
      else if (d.que === 'pieza' && d.id === modelo.id) setPieza(d.nombre ?? '')
    })
    return () => visor.oir(null)
  })
  // Malla y cuadrícula: se mandan al visor al cambiar (la primera vez no, que el visor aún no se ha pedido).
  useEffect(() => {
    if (vistaPrimera.current) return void (vistaPrimera.current = false)
    if (conVisor && herramientas) visor.vista(vista)
  }, [vista])
  // Con cambios sin guardar: Ctrl+S guarda, y al cerrar la página se avisa antes de perderlos.
  useEffect(() => {
    if (!conVisor || !herramientas) return
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (pendientes) void guardarAhora()
      }
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  })
  useEffect(() => {
    if (!pendientes) return
    const avisa = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    addEventListener('beforeunload', avisa)
    return () => removeEventListener('beforeunload', avisa)
  }, [pendientes])
  // La herramienta de edición (la primera vez, «Ver», que es la del visor al abrir).
  useEffect(() => {
    if (herramientaPrimera.current) return void (herramientaPrimera.current = false)
    if (conVisor && herramientas) visor.edicion({ herramienta })
    if (herramienta === 'ver') setPieza('')
  }, [herramienta])
  /** El ángulo en que va lo que se ve: la vuelta si se arrastró, o el giro (su vaivén alrededor de los 28° de la foto). */
  const azimutActual = () => {
    if (aMano && entera) return 28 + donde.current.paso * 10
    const s = solo.current
    return 28 + VAIVEN * (s?.duration ? Math.sin((s.currentTime / s.duration) * 2 * Math.PI) : 0)
  }
  // Ya lo tiene: primero se le pide desde este ángulo y, cuando contesta, se pone encima.
  useEffect(() => {
    if (!conVisor || listo?.id !== modelo.id || listo.n <= listosAntes.current) return
    const sigue = () => {
      if (fase.current === 'pedido') {
        fase.current = 'alineando'
        visor.mostrar(modelo.id, azimutActual())
      } else if (fase.current === 'alineando') {
        fase.current = 'puesto'
        setVisorListo(true)
        visor.colocar(escena.current, true)
      }
    }
    if (arrastre.current) alSoltar.current = sigue
    else sigue()
  }, [listo?.n])
  // Con el visor a la vista, el giro de abajo ya no se ve: deja de decodificarse.
  useEffect(() => {
    if (visorListo) solo.current?.pause()
  }, [visorListo])
  const sola = modelo.giro ?? modelo.vuelta
  const escena = useRef<HTMLDivElement>(null)
  const solo = useRef<HTMLVideoElement>(null)
  const mano = useRef<HTMLVideoElement>(null)
  /** El video que se recorre a mano: la vuelta, o sin ella el mismo giro. */
  const recorrido = () => (entera ? mano.current : solo.current)
  const arrastre = useRef<{ x: number; y: number; ancho: number; seMovio: boolean; desde: { altura: number; paso: number }; fase: number } | null>(null)
  const donde = useRef({ altura: ALTURA_FOTO, paso: 0 })
  const saltando = useRef(false)
  const pendiente = useRef<number | null>(null)
  const [aMano, setAMano] = useState(false)
  const [cerca, setCerca] = useState(1)
  const [fotoFallida, setFotoFallida] = useState(false)
  const [videoFallido, setVideoFallido] = useState(false)
  // Hacia dónde acerca: el punto bajo el ratón.
  const [hacia, setHacia] = useState('50% 50%')
  const cercaYa = useRef(1)
  // La rueda acerca y aleja; va sin `passive` para frenar el desplazamiento de la ficha, pero solo si acerca o aleja: en
  // el tope, la rueda sigue desplazando la ficha, y en angosto acerca solo con Ctrl.
  useEffect(() => {
    const el = escena.current
    if (!el || !sola) return
    const rueda = (e: WheelEvent) => {
      if (matchMedia(ANGOSTO).matches && !e.ctrlKey) return
      const antes = cercaYa.current
      const otra = Math.max(1, Math.min(MAS_CERCA, antes * Math.exp(-e.deltaY * 0.002)))
      if (Math.abs(otra - antes) < 0.001) return
      e.preventDefault()
      const caja = el.getBoundingClientRect()
      if (antes === 1) setHacia(`${(((e.clientX - caja.left) / caja.width) * 100).toFixed(1)}% ${(((e.clientY - caja.top) / caja.height) * 100).toFixed(1)}%`)
      cercaYa.current = otra
      setCerca(otra)
    }
    el.addEventListener('wheel', rueda, { passive: false })
    return () => el.removeEventListener('wheel', rueda)
  }, [sola])
  const ir = (t: number) => {
    const v = recorrido()
    if (!v || Math.abs(v.currentTime - t) < 0.5 / CPS) return
    if (saltando.current) {
      pendiente.current = t
      return
    }
    saltando.current = true
    v.currentTime = t
  }
  /** Deja de mecerse y, con vuelta, pasa a ella en el ángulo en que iba el giro. */
  function tomar() {
    const s = solo.current
    s?.pause()
    if (!entera || aMano) return
    const fase = s?.duration ? Math.sin((s.currentTime / s.duration) * 2 * Math.PI) : 0
    donde.current = { altura: ALTURA_FOTO, paso: (Math.round((VAIVEN * fase) / 10) + PASOS) % PASOS }
    ir(tiempoDe(donde.current))
    setAMano(true)
  }
  /** Mueve la vuelta: `pasos` de 10° de lado y `alturas` de arriba abajo, desde `desde`. */
  function mover(desde: { altura: number; paso: number }, pasos: number, alturas: number) {
    donde.current = { paso: (((desde.paso + pasos) % PASOS) + PASOS) % PASOS, altura: Math.max(0, Math.min(ALTURAS - 1, desde.altura + alturas)) }
    ir(tiempoDe(donde.current))
  }
  // Con Mayús y las flechas, lo mismo que arrastrando: de lado gira 10°, arriba y abajo cambia de altura.
  useEffect(() => {
    if (!entera && !visorListo) return
    const tecla = (e: KeyboardEvent) => {
      const de = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
      if (!e.shiftKey || !de || hayVentana(escena.current?.closest('[role="dialog"]'))) return
      e.preventDefault()
      if (visorListo) {
        visor.girar([-de[0], de[1]])
        setAMano(true)
        return
      }
      tomar()
      mover(donde.current, de[0], de[1])
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  })
  const eventos = {
    onPointerDown(e: PunteroReact<HTMLDivElement>) {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const s = solo.current
      arrastre.current = {
        x: e.clientX,
        y: e.clientY,
        ancho: e.currentTarget.clientWidth,
        seMovio: false,
        desde: donde.current,
        fase: s?.duration ? Math.sin((s.currentTime / s.duration) * 2 * Math.PI) : 0,
      }
    },
    onPointerMove(e: PunteroReact<HTMLDivElement>) {
      const a = arrastre.current
      if (!a || (Math.abs(e.clientX - a.x) < 3 && Math.abs(e.clientY - a.y) < 3)) return
      if (!a.seMovio) {
        a.seMovio = true
        tomar()
        a.desde = donde.current
      }
      // A la derecha, el modelo gira hacia la derecha (la cámara, hacia la izquierda); hacia abajo, la cámara sube.
      const dx = (e.clientX - a.x) / a.ancho
      if (entera) mover(a.desde, Math.round(-dx * PASOS), Math.round((e.clientY - a.y) / POR_ALTURA))
      else {
        const v = solo.current
        if (!v?.duration) return
        const fase = Math.max(-1, Math.min(1, a.fase - dx * 2))
        ir(((Math.asin(fase) / (2 * Math.PI)) * v.duration + v.duration) % v.duration)
        setAMano(true)
      }
    },
    onPointerUp() {
      arrastre.current = null
      alSoltar.current?.()
      alSoltar.current = null
    },
    onPointerCancel() {
      arrastre.current = null
      alSoltar.current?.()
      alSoltar.current = null
    },
    onDoubleClick() {
      cercaYa.current = 1
      setCerca(1)
      setAMano(false)
      solo.current?.play().catch(() => {})
    },
  }
  const acercado = cerca > 1 ? { transform: `scale(${cerca})`, transformOrigin: hacia } : undefined
  const alSaltar = () => {
    saltando.current = false
    const t = pendiente.current
    pendiente.current = null
    if (t !== null) ir(t)
  }
  /** El botón de guardar va en la cabecera del editor (no en la barra): así no deja una fila vacía. Guardar es automático. */
  const botonGuardar = (
          <button type="button" className={`m3d-edicion-guardar${pendientes || fallo ? ' pendiente' : ''}${fallo ? ' fallo' : ''}`} title={fallo ? 'No se pudo guardar: reintenta' : `${pendientes ? 'Guardar ahora los cambios de este modelo' : 'Todos los cambios están guardados'}. Las piezas movidas a mano se ven aquí; los videos aún usan el modelo como lo hizo el agente`} disabled={guardando || (!pendientes && !fallo)} onClick={guardarAhora}>
            <Icono de="guardar" /><span>{guardando ? 'Guardando…' : fallo ? 'Reintentar' : pendientes ? 'Guardar cambios' : 'Guardado'}</span>
          </button>
  
  )
  // La barra va como hermana de la escena, no dentro: su contenedor crea un contexto de apilado y el visor (iframe) la taparía.
  return (
    <>
    <div ref={escena} className={`m3d-ficha-escena${sola && !videoFallido && !visorListo ? ' se-gira' : ''}`} {...(sola && !videoFallido && !visorListo ? eventos : {})}>
      <div className="m3d-foco" />
      {sola && !videoFallido ? (
        <video
          ref={solo}
          className={`m3d-solo${(entera && aMano) || visorListo ? ' oculto' : ''}`}
          src={sola}
          poster={modelo.vista}
          style={acercado}
          muted
          loop
          autoPlay
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
           onError={() => setVideoFallido(true)}
          onSeeked={entera ? undefined : alSaltar}
        />
      ) : modelo.vista && !fotoFallida ? <img src={modelo.vista} alt={`Vista previa de ${modelo.nombre}`} draggable={false} onError={() => setFotoFallida(true)} /> : (
        <div className="m3d-escena-preparando" role="status">
          <Icono de="cubo" />
          <strong>Visor 3D en preparación</strong>
          <p>La ficha está guardada. Generamos la vista interactiva en segundo plano.</p>
        </div>
      )}
      {entera && !videoFallido && (
        <video
          ref={mano}
          className={`m3d-mano${aMano && !visorListo ? '' : ' oculto'}`}
          src={modelo.vuelta}
          style={acercado}
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
           onError={() => setVideoFallido(true)}
          // Lista en el ángulo de la foto, para que al tomarla ya tenga su cuadro.
          onLoadedMetadata={(e) => (e.currentTarget.currentTime = tiempoDe(donde.current))}
          onSeeked={alSaltar}
        />
      )}
      {sola && !videoFallido && !aMano && cerca === 1 && (
        <span className="m3d-arrastra">
          <Icono de="girar" />
          {visorListo || entera ? (matchMedia(ANGOSTO).matches ? 'Arrastra para verlo por todos lados' : 'Arrastra para verlo por todos lados; la rueda lo acerca') : 'Arrastra para girarlo'}
        </span>
      )}
      {onPaso && <>
        <button className="m3d-paso izq" title="El anterior (←)" aria-label="El anterior" onClick={() => onPaso(-1)}><Icono de="anterior" /></button>
        <button className="m3d-paso der" title="El siguiente (→)" aria-label="El siguiente" onClick={() => onPaso(1)}><Icono de="siguiente" /></button>
      </>}
    </div>
    {herramientas && conVisor && visorListo && cabecera?.current && createPortal(botonGuardar, cabecera.current)}
    {herramientas && conVisor && visorListo && barra?.current && createPortal(<>
    <div className="m3d-vista-barra m3d-edicion-barra" role="toolbar" aria-label="Editar piezas del modelo">
        {HERRAMIENTAS_EDICION.map((h) => <button key={h.id} type="button" title={h.titulo} aria-pressed={herramienta === h.id} onClick={() => setHerramienta(h.id)}><Icono de={h.icono} /><span>{h.nombre}</span></button>)}
        <span className="m3d-edicion-separa" aria-hidden="true" />
        <button type="button" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" disabled={!historial.deshacer} onClick={() => visor.edicion({ accion: 'deshacer' })}><Icono de="deshacer" /></button>
        <button type="button" title="Rehacer (Ctrl+Mayús+Z)" aria-label="Rehacer" disabled={!historial.rehacer} onClick={() => visor.edicion({ accion: 'rehacer' })}><Icono de="rehacer" /></button>
        <button type="button" title="Devolver el modelo a su forma original" onClick={() => visor.edicion({ accion: 'restablecer' })}><Icono de="restablecer" /><span>Restablecer</span></button>
        <span className="m3d-edicion-pieza" title={pieza} aria-live="polite">{pieza}</span>
      </div>
      <div className="m3d-vista-barra" role="toolbar" aria-label="Vista del modelo">
      <button type="button" title="Volver a encuadrar el modelo" onClick={() => visor.encuadrar()}><Icono de="encuadrar" /><span>Encuadrar</span></button>
      <button type="button" title="Ver la malla (alambre)" aria-pressed={vista.malla} onClick={() => setVista(v => ({ ...v, malla: !v.malla }))}><Icono de="malla" /><span>Malla</span></button>
      <button type="button" title="Mostrar la cuadrícula del suelo" aria-pressed={vista.cuadricula} onClick={() => setVista(v => ({ ...v, cuadricula: !v.cuadricula }))}><Icono de="cuadricula" /><span>Cuadrícula</span></button>
      {cifras && <span className="m3d-vista-cifras">{cifras.triangulos.toLocaleString('es')} triángulos · {cifras.piezas} {cifras.piezas === 1 ? 'pieza' : 'piezas'}</span>}
      </div>
    </>, barra.current)}
    </>
  )
}


/** La ficha de un modelo, en grande. Esc la cierra; ← y → pasan al de al lado. */
function Ficha({
  visor,
  listo,
  modelo,
  tipo,
  todos,
  onCerrar,
  onBorrar,
  onIr,
  onPaso,
  onBuscar,
  onTipo,
}: {
  visor: Visor3D
  listo: ListoVisor
  modelo: Modelo3D
  tipo: string
  todos: Modelo3D[]
  onCerrar(): void
  onBorrar(): Promise<void>
  onIr(id: string): void
  onPaso(paso: number): void
  onBuscar(texto: string): void
  onTipo(tipo: string): void
}) {
  const [copiado, copiar] = useCopiar()
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const dialogo = useRef<HTMLDivElement>(null)
  // Al abrir, el foco entra a la ficha: lo que se teclea ya no va al buscador ni a la rejilla de atrás.
  useEffect(() => {
    const cuadro = requestAnimationFrame(() => dialogo.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(cuadro)
  }, [])
  /** Pasa al de al lado sin que el foco se salga: el botón que lo tenía se va con el modelo de antes. */
  const pasar = (paso: number) => {
    onPaso(paso)
    requestAnimationFrame(() => dialogo.current?.contains(document.activeElement) || dialogo.current?.focus({ preventScroll: true }))
  }
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      // Con otra ventana encima (un aviso de la app), las teclas son de ella.
      if (hayVentana(dialogo.current)) return
      if (e.key === 'Escape') onCerrar()
      else if (escribiendo(e) || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
      else if (e.key === 'ArrowRight') pasar(1)
      else if (e.key === 'ArrowLeft') pasar(-1)
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  })
  /** Lo que toma el foco en la ficha, en orden. */
  const enfocables = () => [...(dialogo.current?.querySelectorAll<HTMLElement>('button, [href], select, input, [tabindex="0"]') ?? [])].filter((x) => x.offsetParent)
  /** Tab da la vuelta dentro de la ficha, sin salir a la rejilla de atrás. */
  function sinSalir(e: TeclaReact<HTMLDivElement>) {
    if (e.key !== 'Tab' || !dialogo.current) return
    const hay = enfocables()
    if (!hay.length) return
    const i = hay.indexOf(document.activeElement as HTMLElement)
    const j = e.shiftKey ? (i <= 0 ? hay.length - 1 : i - 1) : i < 0 || i === hay.length - 1 ? 0 : i + 1
    e.preventDefault()
    hay[j].focus()
  }
  // Solo cierra un clic que empezó y acabó en el velo: soltar fuera una selección de texto no la cierra.
  const desdeElVelo = useRef(false)
  const necesita = modelo.usa.map((id) => todos.find((m) => m.id === id) ?? { id, nombre: id, fuera: true })

  return (
    <div className="m3d-velo" onPointerDown={(e) => (desdeElVelo.current = e.target === e.currentTarget)} onClick={(e) => desdeElVelo.current && e.target === e.currentTarget && onCerrar()}>
      <div ref={dialogo} className="m3d-ficha" role="dialog" aria-modal="true" aria-label={modelo.nombre} tabIndex={-1} onKeyDown={sinSalir}>
        <Escena
          key={modelo.id}
          visor={visor}
          listo={listo}
          modelo={modelo}
          onPaso={pasar}
          onTecla={(t) => {
            if (hayVentana(dialogo.current)) return
            if (t === 'Escape') onCerrar()
            // Tab con el foco en el visor: al primero (o, con Mayús, al último) de la ficha.
            else if (t === 'Tab' || t === 'Shift+Tab') (t === 'Tab' ? enfocables()[0] : enfocables().at(-1))?.focus()
            else pasar(t === 'ArrowRight' ? 1 : -1)
          }}
        />
        <div className="m3d-ficha-texto">
          <button className="m3d-cerrar" title="Cerrar (Esc)" aria-label="Cerrar" onClick={onCerrar}>
            <Icono de="cerrar" />
          </button>
          <button className="m3d-ficha-tipo" title={`Ver los de ${tipo}`} onClick={() => onTipo(tipo)}>
            {tipo}
          </button>
          <div>
            <h2>{modelo.nombre}</h2>
            {modelo.resumen && <p className="m3d-ficha-resumen">{modelo.resumen}</p>}
          </div>
          <p className="m3d-descripcion">{modelo.descripcion}</p>

          {modelo.hace?.length ? (
            <div className="m3d-bloque">
              <h3>Qué puede hacer</h3>
              <ul className="m3d-puede">
                {modelo.hace.map((h) => (
                  <li key={h}>
                    <Icono de="palomita" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="m3d-bloque">
            <h3>Se encuentra por</h3>
            <p className="m3d-etiquetas">
              {modelo.etiquetas.map((e) => (
                <button key={e} title={`Buscar «${e}»`} onClick={() => onBuscar(e)}>
                  {e}
                </button>
              ))}
            </p>
          </div>

          <dl className="m3d-datos">
            <dt>En el código</dt>
            <dd>
              {modelo.exporta.map((n) => (
                <code key={n}>{n}</code>
              ))}
            </dd>
            {necesita.length > 0 && (
              <>
                <dt>Necesita</dt>
                <dd>
                  {/* Los de la plantilla (como icono-3d) no se enseñan aquí: van de nombre, sin enlace. */}
                  {necesita.map((m) =>
                    'fuera' in m ? (
                      <code key={m.id} title="Viene con la plantilla de los videos">
                        {m.nombre}
                      </code>
                    ) : (
                      <button key={m.id} className="m3d-enlace" onClick={() => onIr(m.id)}>
                        {m.nombre}
                      </button>
                    )
                  )}
                </dd>
              </>
            )}
            <dt>Salió de</dt>
            <dd>
              {modelo.origen ?? '—'}
              {modelo.creado && <span className="m3d-suave"> · {fecha(modelo.creado)}</span>}
            </dd>
            {modelo.actualizado && modelo.actualizado !== modelo.creado && (
              <>
                <dt>Mejorado</dt>
                <dd>{fecha(modelo.actualizado)}</dd>
              </>
            )}
          </dl>

          <div className="m3d-usar">
            <a className="boton" href={rutaEditor3D(modelo.id)} onClick={onCerrar}><Icono de="lapiz" /> Abrir editor 3D</a>
            <span>
              Para usarlo, pídeselo al agente por su nombre: <code>{modelo.id}</code>
            </span>
            <button className="m3d-boton" onClick={() => copiar(modelo.id)}>
              <Icono de={copiado ? 'palomita' : 'copiar'} />
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
            <button className="m3d-boton m3d-boton-peligro" title="Borrar este modelo de la biblioteca" onClick={() => setConfirmarBorrado(true)}>
              <Icono de="basura" />
              Borrar
            </button>
          </div>
        </div>
      </div>
      {confirmarBorrado && <Confirm
        title={`¿Borrar «${modelo.nombre}»?`}
        action="Borrar modelo"
        danger
        enfocarCancelar
        onClose={() => setConfirmarBorrado(false)}
        onConfirm={onBorrar}
      >
        <p>Se quitarán de la biblioteca su ficha, sus archivos y sus previews regenerables. Los videos que ya lo copiaron a un proyecto no cambian.</p>
      </Confirm>}
    </div>
  )
}

function Vacio({ titulo, texto, children }: { titulo: string; texto: string; children?: ReactNode }) {
  return (
    <div className="m3d-vacio">
      <Icono de="cubo" />
      <strong>{titulo}</strong>
      <p>{texto}</p>
      {children}
    </div>
  )
}

function Trabajos3D({ trabajos, modelos, titulo }: { trabajos: SessionMeta[]; modelos: Modelo3D[]; titulo: string }) {
  const disponibles = trabajos.filter((trabajo) => {
    const id = trabajo.modelo3d?.editando ?? trabajo.modelo3d?.resultado
    return !!id && modelos.some((modelo) => modelo.id === id)
  })
  if (!disponibles.length) return null
  return <section className="m3d-proyectos" aria-label={titulo}>
    <h2>{titulo}</h2>
    <ul>{disponibles.map((s) => {
      const id = s.modelo3d?.editando ?? s.modelo3d?.resultado
      if (!id) return null
      const modelo = modelos.find((m) => m.id === id)
      const estado = s.running || s.background?.length ? 'En proceso' : 'Listo'
      return <li key={s.id}>
        <a href={rutaEditor3D(id)}><Icono de="cubo" /><span>{modelo?.nombre ?? s.title}</span><small>{estado}</small></a>
      </li>
    })}</ul>
  </section>
}
