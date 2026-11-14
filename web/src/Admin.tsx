import { type KeyboardEvent as TeclaReact, memo, type ReactNode, type Ref, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { Icono, type NombreIcono } from './Iconos'
import { coincide, type Cuenta, explicar, fechaCorta, hace, num, planCorto, planLargo, segundos, sinAcentos, STATUS } from './admin-formato'
import { RifaAdmin } from './RifaAdmin'

export { fecha, num } from './admin-formato'
import './Admin.css'

/**
 * Administrador: solo en la computadora del creador (la que tiene su llave de `publicar.txt`; en las demás, la barra no
 * la enseña y el servidor no la sirve). Todo lo de Voices Cloning, el proveedor de voz de Sloth (`licencias/src/voz.ts`).
 *
 * Se abre al instante con lo último que se leyó (lo guarda el servidor en `data/voz/admin.json`, y aquí en memoria) y se
 * vuelve a leer de fondo: el cobro tarda unos segundos en preguntar a cada llave. Arriba, el buscador (ya enfocado; «/»
 * vuelve a él) y las cifras que importan en una fila; debajo, pestañas en vez de una página larga: Usuarios, Llamadas,
 * Rifa (`RifaAdmin.tsx`), Créditos mensuales, Llaves y lo que responde Voices Cloning tal cual (`#/admin/<pestaña>`).
 *
 * Con el teclado: escribir filtra, ↑↓ eligen la fila, Enter abre su ficha con el cursor en «créditos»; ahí Enter suma
 * (un número negativo quita) y Esc vuelve al buscador. Cada cambio de créditos o de estado se deshace: en el aviso que
 * sale al hacerlo y, cuando sea, desde el historial de la ficha (suma o quita lo mismo al revés). Un correo que no está
 * en la lista se da de alta desde el mismo buscador.
 */

type Datos = Record<string, unknown>

/** Lo que respondió Voices Cloning a una consulta, tal cual. */
interface Respuesta {
  status: number
  datos: Datos
}

interface Registro {
  id: number
  cuando: string
  externo: string
  accion: string
  voz: string | null
  letras: number | null
  creditos: number | null
  restantes: number | null
  tarea: string | null
  status: number
  codigo: string | null
  error: string | null
  ms: number | null
}

interface Panel {
  configurado: boolean
  /** `VOZ_SOLO_CREADOR` en el cobro: nadie más la usa. */
  soloCreador: boolean
  creditosIniciales: number
  mensuales?: number
  /** Cuánto saldo queda libre para repartir (`cuentaDeReparto` del cobro); `error` si una llave no respondió. */
  reparto?: Reparto | { error: string } | null
  /** Desde cuánto se reciben: «$10 USD (199 MXN en los apoyos en pesos)». */
  mensualesDesde?: string
  repartos?: { externo: string; periodo: string; creditos: number; estado: string; entregado: string | null; correo: string | null; error: string | null }[]
  pagina: number
  consumo: number
  /** Cada llave de socio, con lo que respondió su cuenta. */
  llaves: Llave[]
  /** La llave donde entran los nuevos ahora: la de más saldo. */
  nuevos: string | null
  cuentas: Record<string, Cuenta>
  registro: Registro[]
  resumen: { accion: string; llamadas: number; fallidas: number; letras: number | null; creditos: number | null; usuarios: number; ms: number | null }[]
  errores: { status: number; codigo: string | null; veces: number; ultima: string; error: string | null }[]
  /** Cuándo lo leyó el servidor (ms), en lo guardado. */
  leido?: number
  /** El servidor de Sloth ya juntó los usuarios de todas las páginas de cada llave. */
  todasLasPaginas?: boolean
}

interface Reparto {
  saldo: number
  enUsuarios: number
  beneficiarios: number
  porEntregar: number
  cadaMes: number
  libres: number
}

/** Una llave de socio: el secreto donde está en el cobro, su id y sus últimas cuatro letras. */
interface Llave {
  id: string
  nombre: string
  fin: string
  saldo: Respuesta
  usuarios: Respuesta
  uso: Respuesta
}

/** Un cambio hecho desde aquí (`server/voz/voices-cloning.ts`, `CambioAdmin`). */
interface CambioAdmin {
  id: string
  externo: string
  tipo: 'creditos' | 'estado'
  valor: number | string
  cuando: string
  deshace?: string
  deshecho?: string
  /** Los créditos que le quedaron, según Voices Cloning al hacerlo. */
  saldo?: number
}

interface Usuario {
  external_id: string
  /** Las últimas letras de la llave donde vive, si hay más de una. */
  cuenta?: string
  name?: string
  credits?: number
  used_total?: number
  used_today?: number
  generations?: number
  status?: string
  created_at?: string
  [k: string]: unknown
}

/** Una fila de «Usuarios», ya con lo que se busca y se enseña. */
interface Fila {
  u: Usuario
  nombre: string
  plan: string
  buscable: string
}

const CREADOR = 'creador'
const ACCIONES: Record<string, string> = { alta: 'Alta', sesion: 'Abrió la ventana', tts: 'Generó voz', tarea: 'Tarea que tardó', creditos: 'Créditos', estado: 'Estado', mudanza: 'Cambió de llave' }

const PESTANAS = [
  { id: 'usuarios', nombre: 'Usuarios', icono: 'personas' },
  { id: 'llamadas', nombre: 'Llamadas', icono: 'sonido' },
  { id: 'rifa', nombre: 'Rifa', icono: 'boleto' },
  { id: 'mensuales', nombre: 'Créditos mensuales', icono: 'calendario' },
  { id: 'llaves', nombre: 'Llaves', icono: 'escudo' },
  { id: 'tal-cual', nombre: 'Tal cual', icono: 'hilo' }
] as const satisfies readonly { id: string; nombre: string; icono: NombreIcono }[]
export type PestanaAdmin = (typeof PESTANAS)[number]['id']
export const esPestanaAdmin = (x: string | undefined): x is PestanaAdmin => PESTANAS.some((p) => p.id === x)

// ── Lo leído, en memoria: volver a la sección la pinta en el primer cuadro ─────────────────────────────────────────

let enMemoria: Panel | undefined
let pidiendoGuardado: Promise<Panel | undefined> | undefined
/** Lo que guardó el servidor la última vez (`/api/admin/voz/guardado`), una sola vez por sesión. */
function guardado(): Promise<Panel | undefined> {
  pidiendoGuardado ??= api<Panel>('/api/admin/voz/guardado').then(
    (p) => (enMemoria ??= p),
    () => undefined
  )
  return pidiendoGuardado
}

/**
 * Si esta Sloth es la del creador: la barra enseña Administrador solo entonces, y ya trae lo último leído. Arranca con
 * lo último que se supo en esta computadora (si no, «Administrador» salía un momento después y empujaba la lista de
 * hilos) y el servidor lo confirma.
 */
export function useEsCreador(): boolean {
  const [si, setSi] = useState(() => {
    try {
      return localStorage.getItem('sloth-creador') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    const saber = (s: boolean) => {
      setSi(s)
      try {
        localStorage.setItem('sloth-creador', s ? '1' : '0')
      } catch {}
    }
    void api<{ creador: boolean }>('/api/admin').then(
      (r) => (saber(!!r.creador), r.creador && void guardado()),
      () => setSi(false)
    )
  }, [])
  return si
}

/**
 * Si ya toca armar el Administrador oculto: en la del creador, cuando Sloth lleva un rato quieto tras abrir (con lo
 * último leído, sin preguntar al cobro). Así la primera vez que se abre ya está pintado.
 */
export function useArmarAdmin(esCreador: boolean): boolean {
  const [si, setSi] = useState(false)
  useEffect(() => {
    if (!esCreador || si) return
    const ya = () => void guardado().then(() => setSi(true))
    // Sloth corre en Chromium (Electron o el navegador de la copia del repo): siempre lo tiene.
    const id = requestIdleCallback(ya, { timeout: 1500 })
    return () => cancelIdleCallback(id)
  }, [esCreador, si])
  return si
}

// ── La sección ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Un cambio hecho, con cómo deshacerlo, en el aviso de abajo. */
interface Hecho {
  /** Para que cada aviso nuevo empiece de cero. */
  vez?: number
  texto: string
  deshacer?: () => Promise<unknown>
  error?: boolean
}

/** Memorizado: armado y oculto, no se vuelve a pintar con cada cambio de la app. */
export const Admin = memo(function Admin({ activa, pestana = 'usuarios', onPestana }: { activa: boolean; pestana?: PestanaAdmin; onPestana(p: PestanaAdmin): void }) {
  const [panel, setPanel] = useState<Panel | undefined>(enMemoria)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [consumo, setConsumo] = useState(1)
  const [buscar, setBuscar] = useState('')
  const [abierto, setAbierto] = useState<string>()
  const [soloFallas, setSoloFallas] = useState(false)
  const [hecho, setHecho] = useState<Hecho>()
  /** El último cambio hecho aquí (desde la ficha o desde el aviso): la ficha lo apunta y sus créditos lo cuentan. */
  const [ultimoCambio, setUltimoCambio] = useState<CambioAdmin>()
  const buscador = useRef<HTMLInputElement>(null)
  /** La lectura más nueva: una más vieja que llegue después no pisa lo que ya se ve. */
  const lectura = useRef(0)

  const cargar = useCallback(() => {
    const esta = ++lectura.current
    setCargando(true)
    api<Panel>(`/api/admin/voz?pagina=${pagina}&consumo=${consumo}`)
      .then(
        (p) => {
          if (esta !== lectura.current) return
          const leido = { ...p, leido: Date.now() }
          if (pagina === 1 && consumo === 1) enMemoria = leido
          setPanel(leido)
          setError('')
        },
        (e: Error) => esta === lectura.current && setError(e.message)
      )
      .finally(() => esta === lectura.current && setCargando(false))
  }, [pagina, consumo])
  // Lo nuevo se pide al entrar (no mientras está armado y oculto) y al cambiar de página.
  useEffect(() => void (activa && cargar()), [activa, cargar])
  useEffect(() => void (activa && buscador.current?.focus({ preventScroll: true })), [activa])
  // Sin nada en memoria (la primera vez en esta sesión), lo guardado mientras llega lo nuevo.
  useEffect(() => void (!enMemoria && guardado().then((p) => p && setPanel((ya) => ya ?? p))), [])

  // Esc cierra la ficha abierta, desde donde sea de la sección (no si hay un diálogo encima).
  useEffect(() => {
    if (!abierto || !activa) return
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[role="dialog"], .modal')) return
      setAbierto(undefined)
      buscador.current?.focus({ preventScroll: true })
    }
    addEventListener('keydown', alPulsar)
    return () => removeEventListener('keydown', alPulsar)
  }, [abierto, activa])

  // «/» vuelve al buscador desde donde sea de la sección (no desde un campo).
  useEffect(() => {
    if (!activa) return
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('[role="dialog"], .modal')) return
      e.preventDefault()
      buscador.current?.focus()
      buscador.current?.select()
    }
    addEventListener('keydown', alPulsar)
    return () => removeEventListener('keydown', alPulsar)
  }, [activa])

  const llaves = panel?.llaves ?? []
  const varias = llaves.length > 1
  const cuentas = panel?.cuentas ?? {}
  const quien = useCallback((externo: string) => (externo === CREADOR ? 'Tú (creador)' : (cuentas[externo]?.email ?? externo)), [cuentas])
  const filas = useMemo<Fila[]>(
    () =>
      llaves.flatMap((l) =>
        (Array.isArray(l.usuarios.datos.users) ? (l.usuarios.datos.users as Usuario[]) : []).map((u) => {
          const c = cuentas[u.external_id]
          const nombre = u.external_id === CREADOR ? 'Tú (creador)' : (c?.email ?? u.name ?? u.external_id)
          const plan = u.external_id === CREADOR ? 'Creador' : planCorto(c)
          return { u: { ...u, cuenta: varias ? `…${l.fin}` : undefined }, nombre, plan, buscable: sinAcentos(`${nombre} ${u.name ?? ''} ${u.external_id} ${plan}`) }
        })
      ),
    [llaves, cuentas, varias]
  )
  // Las listas van por página en cada llave a la vez: manda la que más tiene.
  const mayor = (campo: 'usuarios' | 'uso') => llaves.map((l) => l[campo]).sort((a, b) => Number(b.datos.total ?? 0) - Number(a.datos.total ?? 0))[0]
  const errores30 = panel?.errores.reduce((t, e) => t + e.veces, 0) ?? 0

  /**
   * Suma (o, negativo, quita) créditos; `deshace`: el id del cambio que esto deshace. El aviso trae cómo deshacerlo, y
   * la ficha lo apunta en «Lo que le cambiaste aquí» (el servidor lo anota en `data/voz/admin-cambios.json`).
   */
  const ajustar = useCallback(
    async (externo: string, amount: number, deshace?: string): Promise<CambioAdmin | undefined> => {
      const r = await api<{ cambio?: CambioAdmin }>('/api/admin/voz/creditos', { externo, amount, ...(deshace ? { deshace } : {}) })
      fichas.delete(externo)
      const texto = `${deshace ? 'Deshecho: ' : ''}${amount > 0 ? 'sumaste' : 'quitaste'} ${num(Math.abs(amount))} ${Math.abs(amount) === 1 ? 'crédito' : 'créditos'} a ${quien(externo)}.`
      const id = r.cambio?.id
      if (r.cambio) setUltimoCambio(r.cambio)
      setHecho({ vez: Date.now(), texto: texto[0].toUpperCase() + texto.slice(1), deshacer: deshace || !id ? undefined : () => ajustar(externo, -amount, id) })
      cargar()
      return r.cambio
    },
    [cargar, quien]
  )
  const cambiarEstado = useCallback(
    async (externo: string, status: 'active' | 'suspended', deshace?: string): Promise<CambioAdmin | undefined> => {
      const r = await api<{ cambio?: CambioAdmin }>('/api/admin/voz/estado', { externo, status, ...(deshace ? { deshace } : {}) })
      fichas.delete(externo)
      const id = r.cambio?.id
      if (r.cambio) setUltimoCambio(r.cambio)
      setHecho({
        vez: Date.now(),
        texto: `${deshace ? 'Deshecho: ' : ''}${quien(externo)} ${status === 'suspended' ? 'quedó suspendido' : 'puede volver a usar las voces'}.`,
        deshacer: deshace || !id ? undefined : () => cambiarEstado(externo, status === 'suspended' ? 'active' : 'suspended', id)
      })
      cargar()
      return r.cambio
    },
    [cargar, quien]
  )

  const cerrarAviso = useCallback(() => setHecho(undefined), [])
  // «Leído hace…» se pone al día cada 30 s mientras se ve (las filas no se vuelven a pintar).
  const [, setReloj] = useState(0)
  useEffect(() => {
    if (!activa) return
    const id = setInterval(() => setReloj((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [activa])
  const alDarDeAlta = useCallback((texto: string) => (setHecho({ texto, vez: Date.now() }), cargar()), [cargar])

  const pestanaActual = PESTANAS.find((p) => p.id === pestana) ?? PESTANAS[0]
  const cuantos: Partial<Record<PestanaAdmin, number>> = panel
    ? { usuarios: Math.max(filas.length, llaves.reduce((t, l) => t + (Number(l.usuarios.datos.total) || 0), 0)), llamadas: panel.registro.length, mensuales: panel.repartos?.length, llaves: llaves.length }
    : {}

  return (
    <div className={`admin${abierto ? ' con-ficha' : ''}`} hidden={!activa}>
      <div className="admin-principal">
        <header className="admin-cabeza">
          <h1>Administrador</h1>
          <Buscador
            ref={buscador}
            activa={activa}
            valor={buscar}
            onCambio={(v) => {
              setBuscar(v)
              if (pestana !== 'usuarios' && pestana !== 'llamadas') onPestana('usuarios')
            }}
            onTecla={(e) => tablaActiva.current?.(e)}
            lista={pestana === 'usuarios'}
          />
          <div className="admin-leido">
            <span className="admin-leido-texto" title={panel?.leido ? new Date(panel.leido).toLocaleString('es-MX') : undefined}>
              {panel?.leido ? `Leído ${hace(panel.leido)}` : ''}
              {cargando && (panel?.leido ? ' · leyendo lo nuevo…' : 'Leyendo de Voices Cloning…')}
            </span>
            <button className="admin-icono-boton" disabled={cargando} onClick={cargar} title="Volver a leer" aria-label="Volver a leer">
              <Icono de="recargar" className={`ico${cargando ? ' girando' : ''}`} />
            </button>
          </div>
        </header>

        {error && <p className="bad admin-aviso">{error}{panel ? ' Lo de abajo es de la última vez que se leyó.' : ''}</p>}
        {panel && !panel.configurado && (
          <p className="admin-aviso">
            Falta la llave de socio en el cobro. Ponla con <span className="mono">npm run licencias -- secret put VOICES_PK_LIVE</span> (desde Git Bash; las siguientes, en <span className="mono">VOICES_PK_LIVE_2</span>, <span className="mono">_3</span>…) y vuelve a leer.
          </p>
        )}
        {panel?.soloCreador && (
          <p className="admin-aviso">
            Por ahora las voces de Sloth son <strong>solo para ti</strong>. Los créditos mensuales se abren automáticamente cuando se termine de publicar la actualización que los incluye.
          </p>
        )}

        {panel ? (
          <Cifras panel={panel} errores={errores30} onErrores={() => (setSoloFallas(true), onPestana('llamadas'))} />
        ) : (
          !error && <p className="admin-cargando">Leyendo de Voices Cloning por primera vez…</p>
        )}

        <nav className="admin-pestanas" role="tablist" aria-label="Secciones del administrador">
          {PESTANAS.map((p) => (
            <button key={p.id} role="tab" aria-selected={p.id === pestanaActual.id} className={p.id === pestanaActual.id ? 'activa' : ''} onClick={() => onPestana(p.id)}>
              <Icono de={p.icono} />
              {p.nombre}
              {cuantos[p.id] !== undefined && <span className="admin-cuenta">{num(cuantos[p.id])}</span>}
            </button>
          ))}
        </nav>

        {panel && (
          <div className="admin-cuerpo" role="tabpanel" aria-label={pestanaActual.nombre}>
            {pestanaActual.id === 'usuarios' && (
              <>
                {llaves.find((l) => l.usuarios.status >= 400) && <Fallo r={llaves.find((l) => l.usuarios.status >= 400)!.usuarios} />}
                <Usuarios filas={filas} buscar={buscar} abierto={abierto} onAbrir={setAbierto} soloCreador={panel.soloCreador} onAlta={alDarDeAlta} />
                {!panel.todasLasPaginas && <Paginas r={mayor('usuarios')} pagina={panel.pagina} cargando={cargando} onPagina={setPagina} />}
              </>
            )}
            {pestanaActual.id === 'llamadas' && (
              <Llamadas panel={panel} buscar={buscar} quien={quien} soloFallas={soloFallas} onSoloFallas={setSoloFallas} onAbrir={setAbierto} />
            )}
            {pestanaActual.id === 'rifa' && <RifaAdmin />}
            {pestanaActual.id === 'mensuales' && <Mensuales panel={panel} quien={quien} onAbrir={setAbierto} />}
            {pestanaActual.id === 'llaves' && <Llaves panel={panel} quien={quien} cargando={cargando} onConsumo={setConsumo} />}
            {pestanaActual.id === 'tal-cual' && <TalCual panel={panel} />}
          </div>
        )}
      </div>

      {abierto && (
        <Ficha
          key={abierto}
          externo={abierto}
          quien={quien(abierto)}
          plan={abierto === CREADOR ? undefined : cuentas[abierto]}
          inicial={filas.find((f) => f.u.external_id === abierto)?.u}
          onCerrar={() => (setAbierto(undefined), buscador.current?.focus({ preventScroll: true }))}
          onAjustar={ajustar}
          onEstado={cambiarEstado}
          version={panel?.leido}
          ultimoCambio={ultimoCambio}
          registroInicial={panel?.registro.filter((r) => r.externo === abierto)}
        />
      )}

      {hecho && <Aviso key={hecho.vez} hecho={hecho} onCerrar={cerrarAviso} onError={(texto) => setHecho({ texto, error: true, vez: Date.now() })} />}
    </div>
  )
})

/**
 * La tabla que el buscador maneja con el teclado (↑↓ Enter): la de Usuarios se registra aquí al montarse. Así el
 * buscador no necesita saber qué lista hay debajo.
 */
const tablaActiva: { current?: (e: TeclaReact<HTMLInputElement>) => void } = {}

function Buscador({ ref, activa, valor, onCambio, onTecla, lista }: { ref: Ref<HTMLInputElement>; activa: boolean; valor: string; onCambio(v: string): void; onTecla(e: TeclaReact<HTMLInputElement>): void; lista: boolean }) {
  return (
    <label className="admin-buscar">
      <Icono de="buscar" />
      <input
        ref={ref}
        autoFocus={activa}
        type="search"
        role="combobox"
        aria-expanded={lista}
        aria-controls={lista ? 'admin-usuarios' : undefined}
        aria-activedescendant={lista ? 'admin-fila-activa' : undefined}
        aria-label="Buscar a alguien"
        placeholder="Busca por correo, nombre o plan"
        value={valor}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onCambio(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && valor) return e.preventDefault(), onCambio('')
          onTecla(e)
        }}
      />
      <kbd className="admin-tecla" aria-hidden="true">
        /
      </kbd>
    </label>
  )
}

/** Las cifras que importan, en una fila: lo libre para repartir manda; los errores llevan a verlos. */
function Cifras({ panel, errores, onErrores }: { panel: Panel; errores: number; onErrores(): void }) {
  const r = panel.reparto
  const saldo = panel.llaves.reduce((t, l) => t + (typeof l.saldo.datos.balance === 'number' ? l.saldo.datos.balance : 0), 0)
  const usados = panel.llaves.reduce((t, l) => t + (typeof l.saldo.datos.used_today === 'number' ? l.saldo.datos.used_today : 0), 0)
  const ultimo = ultimoError(panel)
  if (r && 'error' in r) return <p className="bad admin-aviso">No se pudo leer Voices Cloning: {r.error}</p>
  const corto = !!r && r.libres < 0
  return (
    <div className="admin-cifras">
      {r && (
        <div className={`admin-cifra admin-libres${corto ? ' corto' : ''}`} title="Tu saldo general menos lo que ya tienen los usuarios sin gastar y lo que falta entregar este mes. Es lo que puedes rifar o regalar sin quedarte corto.">
          <span className="admin-cifra-titulo">{corto ? 'Te faltan' : 'Para repartir'}</span>
          <strong>{num(Math.abs(r.libres))}</strong>
        </div>
      )}
      <div className="admin-cifra" title="De todas tus llaves">
        <span className="admin-cifra-titulo">Saldo general</span>
        <strong>{num(r ? r.saldo : saldo)}</strong>
      </div>
      {r && (
        <div className="admin-cifra" title="Lo que ya tienen los usuarios y no han gastado">
          <span className="admin-cifra-titulo">Asignados</span>
          <strong>{num(r.enUsuarios)}</strong>
        </div>
      )}
      {r && (
        <div className="admin-cifra" title={`Lo que falta entregar este mes. ${num(r.beneficiarios)} ${r.beneficiarios === 1 ? 'persona recibe' : 'personas reciben'} ${num(panel.mensuales)} al mes: ${num(r.cadaMes)}`}>
          <span className="admin-cifra-titulo">Por entregar</span>
          <strong>{num(r.porEntregar)}</strong>
        </div>
      )}
      <div className="admin-cifra" title="Gastado hoy por todos, hora de Lima">
        <span className="admin-cifra-titulo">Gastado hoy</span>
        <strong>{num(usados)}</strong>
      </div>
      <button className={`admin-cifra admin-cifra-boton${errores ? ' con-errores' : ''}`} onClick={onErrores} title="Ver las llamadas que fallaron">
        <span className="admin-cifra-titulo">Errores (30 días){ultimo && ` · último: ${fechaCorta(ultimo.cuando)}`}</span>
        <span className="admin-cifra-linea">
          <strong>{num(errores)}</strong>
          {/* El último, con su mensaje: se lee sin abrir nada. */}
          {ultimo && (
            <span className="admin-ultimo" title={explicar(ultimo)}>
              {ultimo.error ?? explicar(ultimo)}
            </span>
          )}
        </span>
      </button>
    </div>
  )
}

/**
 * La llamada que falló más reciente: la de las últimas 300 del registro, que trae su propio mensaje; si ninguna de
 * esas falló, la última de los errores de 30 días (su mensaje es uno de los de ese código).
 */
export function ultimoError(panel: Pick<Panel, 'registro' | 'errores'>): { cuando: string; status: number; codigo: string | null; error: string | null } | undefined {
  const delRegistro = panel.registro.filter((f) => f.status >= 400).sort((a, b) => String(b.cuando).localeCompare(String(a.cuando)))[0]
  if (delRegistro) return delRegistro
  const e = [...panel.errores].sort((a, b) => String(b.ultima).localeCompare(String(a.ultima)))[0]
  return e && { cuando: e.ultima, status: e.status, codigo: e.codigo, error: e.error }
}

function Fallo({ r }: { r: Respuesta }) {
  return (
    <p className="bad admin-aviso">
      Voices Cloning respondió {r.status} ({STATUS[r.status] ?? 'error'}): {String(r.datos.error ?? 'sin mensaje')}
    </p>
  )
}

// ── Usuarios ───────────────────────────────────────────────────────────────────────────────────────────────────────

type Orden = 'creditos' | 'usados' | 'desde' | 'nombre'

/** Memorizada: enseñar u ocultar la sección, o leer de nuevo el panel sin cambios, no vuelve a pintar las filas. */
const Usuarios = memo(function Usuarios({ filas, buscar, abierto, onAbrir, soloCreador, onAlta }: { filas: Fila[]; buscar: string; abierto?: string; onAbrir(externo: string): void; soloCreador: boolean; onAlta(texto: string): void }) {
  const [orden, setOrden] = useState<{ por: Orden; baja: boolean }>({ por: 'desde', baja: true })
  const [activa, setActiva] = useState(0)
  const caja = useRef<HTMLDivElement>(null)
  const vistas = useMemo(() => {
    const valor = (f: Fila) => (orden.por === 'creditos' ? (f.u.credits ?? 0) : orden.por === 'usados' ? (f.u.used_total ?? 0) : orden.por === 'desde' ? Date.parse(String(f.u.created_at ?? '')) || 0 : f.nombre)
    return filas
      .filter((f) => coincide(f.buscable, buscar))
      .sort((a, b) => {
        const x = valor(a), y = valor(b)
        const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - Number(y)
        return orden.baja ? -c : c
      })
  }, [filas, buscar, orden])
  useEffect(() => setActiva(0), [buscar])
  const i = Math.min(activa, Math.max(0, vistas.length - 1))

  // El buscador mueve la fila activa y la abre.
  useEffect(() => {
    tablaActiva.current = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const j = Math.max(0, Math.min(vistas.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))
        setActiva(j)
        caja.current?.querySelector(`[data-fila="${j}"]`)?.scrollIntoView({ block: 'nearest' })
      } else if (e.key === 'Enter' && vistas[i]) {
        e.preventDefault()
        onAbrir(vistas[i].u.external_id)
      }
    }
    return () => void (tablaActiva.current = undefined)
  }, [vistas, i, onAbrir])

  const correo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buscar.trim()) ? buscar.trim().toLowerCase() : ''
  if (!filas.length && !correo) return <p className="admin-vacio">Nadie ha usado las voces todavía.</p>
  const cabeza = (por: Orden, texto: string, numero = false) => (
    <th aria-sort={orden.por === por ? (orden.baja ? 'descending' : 'ascending') : undefined} className={numero ? 'num' : undefined}>
      <button onClick={() => setOrden((o) => ({ por, baja: o.por === por ? !o.baja : por !== 'nombre' }))}>
        {texto}
        {orden.por === por && <Icono de={orden.baja ? 'flecha' : 'flechaArriba'} />}
      </button>
    </th>
  )
  return (
    <>
      {vistas.length > 0 && (
        <div className="admin-tabla-caja" ref={caja}>
          <table className="admin-tabla admin-usuarios" id="admin-usuarios" role="grid" aria-label="Usuarios">
            <thead>
              <tr>
                {cabeza('nombre', 'Usuario')}
                <th>Plan en Sloth</th>
                {cabeza('creditos', 'Créditos', true)}
                {cabeza('usados', 'Usados', true)}
                {cabeza('desde', 'Desde')}
              </tr>
            </thead>
            <tbody>
              {vistas.map((f, j) => (
                <tr
                  key={f.u.external_id}
                  id={j === i ? 'admin-fila-activa' : undefined}
                  data-fila={j}
                  aria-selected={j === i}
                  className={`${j === i ? 'activa' : ''}${abierto === f.u.external_id ? ' abierta' : ''}`}
                  // Con el ratón, su ficha se lee al pasar por la fila y se abre al apretar; con el dedo, al soltar.
                  onPointerEnter={() => preleer(f.u.external_id)}
                  onPointerLeave={dejarDePreleer}
                  onPointerDown={(e) => {
                    if (e.pointerType !== 'mouse' || e.button !== 0) return
                    e.preventDefault()
                    setActiva(j)
                    onAbrir(f.u.external_id)
                  }}
                  onClick={() => (setActiva(j), onAbrir(f.u.external_id))}
                >
                  <td className="admin-quien" title={f.u.external_id}>
                    {f.nombre}
                    {f.u.status === 'suspended' && <span className="bad"> · suspendido</span>}
                  </td>
                  <td className="admin-suave admin-plan">{f.plan}</td>
                  <td className="num">
                    <strong>{num(f.u.credits)}</strong>
                  </td>
                  <td className="num">{num(f.u.used_total)}</td>
                  <td className="admin-suave">{fechaCorta(f.u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!vistas.length && !correo && <p className="admin-vacio">Nadie coincide con «{buscar}». Si es un correo completo, aquí mismo lo das de alta.</p>}
      {correo && !vistas.some((f) => f.nombre.toLowerCase() === correo) && (soloCreador ? <p className="admin-vacio">Mientras las voces sean solo para ti, no se da de alta a nadie más.</p> : <Alta email={correo} onHecho={onAlta} />)}
    </>
  )
})

/** Dar créditos a un correo de Sloth que aún no está en la lista (o sumarle, si ya usaba las voces). */
function Alta({ email, onHecho }: { email: string; onHecho(texto: string): void }) {
  const [creditos, setCreditos] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const n = /^\d+$/.test(creditos.trim()) ? Number(creditos.trim()) : 0
  const malo = creditos.trim() !== '' && !/^\d+$/.test(creditos.trim())
  return (
    <form
      className="admin-alta"
      onSubmit={(e) => {
        e.preventDefault()
        setOcupado(true)
        setError('')
        api<{ creado: boolean }>('/api/admin/voz/alta', { email, creditos: n })
          .then(
            (r) => onHecho(r.creado ? `${email}: dada de alta con ${num(n)} créditos.` : n ? `${email} ya estaba: se le sumaron ${num(n)} créditos.` : `${email} ya estaba dada de alta.`),
            (x: Error) => setError(x.message)
          )
          .finally(() => setOcupado(false))
      }}
    >
      <span>
        Darle créditos a <strong>{email}</strong> (su cuenta de Sloth)
      </span>
      <input type="text" inputMode="numeric" placeholder="Créditos" aria-label="Créditos para la alta" aria-invalid={malo} value={creditos} onChange={(e) => setCreditos(e.target.value)} disabled={ocupado} />
      <button className="primary" disabled={ocupado || malo}>
        {ocupado ? 'Dando…' : 'Dar de alta'}
      </button>
      {malo && <span className="bad">Solo números enteros.</span>}
      {error && <span className="bad">{error}</span>}
    </form>
  )
}

// ── Lo que se lee de una persona, también de antemano ──────────────────────────────────────────────────────────────

type DatosFicha = { usuario: Respuesta; llave: { nombre: string; fin: string } | null; registro: Registro[]; cuenta: Cuenta | null }
/** Lo leído de cada persona, 30 s, con cuándo se pidió (`preleer` lo pide al pasar el ratón por su fila). */
const fichas = new Map<string, { hasta: number; desde: number; datos: Promise<DatosFicha> }>()
function leerFicha(externo: string, fresca = false): { desde: number; datos: Promise<DatosFicha> } {
  const ya = fichas.get(externo)
  if (!fresca && ya && ya.hasta > Date.now()) return ya
  const nueva = { hasta: Date.now() + 30_000, desde: Date.now(), datos: api<DatosFicha>(`/api/admin/voz/usuario?externo=${encodeURIComponent(externo)}`) }
  fichas.set(externo, nueva)
  nueva.datos.catch(() => fichas.delete(externo))
  return nueva
}
let preleyendo: ReturnType<typeof setTimeout> | undefined
/** Con el ratón quieto 200 ms sobre una fila, su ficha se pide: pasar por la lista no pide una por fila. */
function preleer(externo: string) {
  clearTimeout(preleyendo)
  preleyendo = setTimeout(() => void leerFicha(externo).datos.catch(() => {}), 200)
}
const dejarDePreleer = () => clearTimeout(preleyendo)

// ── La ficha de una persona ────────────────────────────────────────────────────────────────────────────────────────

function Ficha({
  externo,
  quien,
  plan,
  inicial,
  onCerrar,
  onAjustar,
  onEstado,
  version,
  ultimoCambio,
  registroInicial
}: {
  externo: string
  quien: string
  plan?: Cuenta
  /** Lo que ya trae la lista: la ficha se pinta con esto mientras lee lo suyo. */
  inicial?: Usuario
  onCerrar(): void
  onAjustar(externo: string, amount: number, deshace?: string): Promise<CambioAdmin | undefined>
  onEstado(externo: string, status: 'active' | 'suspended', deshace?: string): Promise<CambioAdmin | undefined>
  version?: number
  ultimoCambio?: CambioAdmin
  /** Sus llamadas entre las últimas del panel: se ven al abrir, antes de que conteste el cobro. */
  registroInicial?: Registro[]
}) {
  const [d, setD] = useState<DatosFicha>()
  const [cambios, setCambios] = useState<CambioAdmin[]>([])
  const [error, setError] = useState('')
  const [cuanto, setCuanto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  /**
   * Lo sumado o quitado aquí, con cuándo: cuenta en los créditos hasta que llega una lectura pedida después (una pedida
   * antes, aunque llegue tarde, no lo trae).
   */
  const [pendientes, setPendientes] = useState<{ cuando: number; delta: number; saldo?: number }[]>([])
  /** Cuándo se pidió lo que se ve en `d`. */
  const [dDesde, setDDesde] = useState(0)
  const dDesdeVisto = useRef(0)
  /** Su ficha guardada en el servidor: al momento, aunque no haya salido en las últimas llamadas. */
  const [guardada, setGuardada] = useState<DatosFicha>()
  const campo = useRef<HTMLInputElement>(null)
  /** La primera vez, lo que se leyó al pasar el ratón por su fila (si es reciente); después, siempre de nuevo. */
  const yaLeida = useRef(false)
  const leer = useCallback(() => {
    const fresca = yaLeida.current
    yaLeida.current = true
    if (!fresca) void api<{ datos: DatosFicha } | null>(`/api/admin/voz/ficha?externo=${encodeURIComponent(externo)}`).then((g) => g && setGuardada(g.datos), () => {})
    const l = leerFicha(externo, fresca)
    l.datos.then(
      // Una lectura pedida antes que la que ya se ve no la pisa.
      (x) => {
        if (l.desde < dDesdeVisto.current) return
        dDesdeVisto.current = l.desde
        setD(x)
        setDDesde(l.desde)
      },
      (e: Error) => setError(e.message)
    )
    void api<{ cambios: CambioAdmin[] }>(`/api/admin/voz/cambios?externo=${encodeURIComponent(externo)}`).then((x) => setCambios(x.cambios), () => {})
  }, [externo])
  // Se vuelve a leer al abrirla y cada vez que el panel se lee otra vez (tras un cambio).
  useEffect(leer, [leer, version])
  useEffect(() => campo.current?.focus({ preventScroll: true }), [])
  // Los créditos salen de lo más nuevo que haya: lo leído de ella, si no lo de la lista (del panel, de `version`).
  const base = d ? (d.usuario.status === 200 ? (d.usuario.datos as Usuario) : undefined) : inicial
  const baseDesde = d ? dDesde : (version ?? 0)
  // Lo cambiado después de lo leído: si Voices Cloning dijo con cuánto quedó, eso (más lo cambiado luego sin saberlo);
  // si no, lo leído más lo sumado. Así una lectura pedida antes que conteste ya con el cambio no lo cuenta dos veces.
  const despues = pendientes.filter((x) => x.cuando > baseDesde)
  const conSaldo = despues.findLastIndex((x) => typeof x.saldo === 'number')
  const creditos =
    conSaldo >= 0 ? despues[conSaldo].saldo! + despues.slice(conSaldo + 1).reduce((t, x) => t + x.delta, 0) : despues.length ? (base?.credits ?? 0) + despues.reduce((t, x) => t + x.delta, 0) : undefined
  const u = base && creditos !== undefined ? { ...base, credits: creditos } : base
  // Solo enteros: «2.5» no se trunca a 2 sin decirlo.
  const n = /^-?\d+$/.test(cuanto.trim()) ? Number(cuanto.trim()) : 0
  const malo = cuanto.trim() !== '' && !n
  const hacer = (f: () => Promise<unknown>) => {
    setOcupado(true)
    setError('')
    f()
      .then(() => setCuanto(''), (e: Error) => setError(e.message))
      // El campo no se deshabilita (solo se bloquea), así que el cursor sigue en él para el siguiente.
      .finally(() => (setOcupado(false), campo.current?.focus({ preventScroll: true })))
  }
  // Cada cambio hecho a esta persona (aquí o desde el aviso) se apunta al momento, sin esperar a leer otra vez.
  useEffect(() => {
    const c = ultimoCambio
    if (!c || c.externo !== externo) return
    setCambios((xs) => (xs.some((x) => x.id === c.id) ? xs : [...xs.map((x) => (x.id === c.deshace ? { ...x, deshecho: c.cuando } : x)), c]))
    if (c.tipo === 'creditos') setPendientes((xs) => [...xs, { cuando: Date.parse(c.cuando), delta: Number(c.valor), saldo: c.saldo }])
  }, [ultimoCambio, externo])
  const suspendido = u?.status === 'suspended'
  const hechos = [...cambios].reverse()
  // Mientras el cobro contesta (~1 s): lo suyo de las últimas llamadas del panel y de su ficha guardada, juntos.
  const registro = d?.registro ?? juntarRegistro(registroInicial ?? [], guardada?.registro ?? [])
  const licencias = (d?.cuenta ?? plan)?.licencias ?? []

  return (
    <aside className="admin-ficha" aria-label={`Ficha de ${quien}`}>
      <div className="admin-ficha-cabeza">
        <h2 title={externo}>{quien}</h2>
        <button className="admin-icono-boton" onClick={onCerrar} aria-label="Cerrar la ficha" title="Cerrar (Esc)">
          <Icono de="cerrar" />
        </button>
      </div>
      {licencias.length > 0 && (
        <ul className="admin-ficha-planes">
          {licencias.map((l, i) => (
            <li key={i}>{planLargo(l)}</li>
          ))}
        </ul>
      )}
      {error && <p className="bad">{error}</p>}
      {d && d.usuario.status >= 400 && <p className="admin-suave">{d.usuario.status === 404 ? 'Aún no está dado de alta en las voces.' : `Voices Cloning respondió ${d.usuario.status}: ${String(d.usuario.datos.error ?? '')}`}</p>}

      <div className="admin-ficha-cifras">
        <div>
          <span>Créditos</span>
          <strong className="grande">{u || d ? num(u?.credits) : '…'}</strong>
        </div>
        <div>
          <span>Usados</span>
          <strong>{num(u?.used_total)}</strong>
        </div>
        <div>
          <span>Hoy</span>
          <strong>{num(u?.used_today)}</strong>
        </div>
        <div>
          <span>Audios</span>
          <strong>{num(u?.generations)}</strong>
        </div>
      </div>

      <form
        className="admin-ajustar"
        onSubmit={(e) => {
          e.preventDefault()
          if (n) hacer(() => onAjustar(externo, n))
        }}
      >
        <label htmlFor="admin-cuanto">Dar o quitar créditos</label>
        <div>
          <input
            id="admin-cuanto"
            ref={campo}
            type="text"
            inputMode="numeric"
            placeholder="5000 o -5000"
            value={cuanto}
            onChange={(e) => setCuanto(e.target.value)}
            // Esc borra lo escrito; con el campo vacío, cierra la ficha.
            onKeyDown={(e) => e.key === 'Escape' && cuanto && (e.preventDefault(), setCuanto(''))}
            aria-invalid={malo}
            readOnly={ocupado}
          />
          <button type="submit" className="primary" disabled={ocupado || !n}>
            {n < 0 ? 'Quitar' : 'Sumar'}
          </button>
          <button type="button" className="admin-boton" disabled={ocupado || !n} onClick={() => hacer(() => onAjustar(externo, -Math.abs(n)))}>
            Quitar
          </button>
        </div>
        <small className={malo ? 'bad' : undefined}>{malo ? 'Solo números enteros: 5000 o -5000.' : 'Enter suma; con «-» delante, quita. Se puede deshacer.'}</small>
      </form>

      {u && externo !== CREADOR && (
        <button className={`admin-boton${suspendido ? '' : ' peligro'} admin-suspender`} disabled={ocupado} onClick={() => hacer(() => onEstado(externo, suspendido ? 'active' : 'suspended'))}>
          {suspendido ? 'Reactivar: que vuelva a usar las voces' : 'Suspender: que no genere voces'}
        </button>
      )}

      {hechos.length > 0 && (
        <>
          <h3>Lo que le cambiaste aquí</h3>
          <ol className="admin-historial">
            {hechos.map((c) => (
              <li key={c.id} className={c.deshecho ? 'deshecho' : undefined}>
                <span className="admin-suave">{fechaCorta(c.cuando)}</span>
                <span>
                  {lineaDeCambio(c)}
                  {c.deshecho && <span className="admin-suave"> · deshecho</span>}
                </span>
                {!c.deshace && !c.deshecho ? (
                  <button
                    className="admin-deshacer"
                    disabled={ocupado}
                    onClick={() =>
                      c.tipo === 'creditos'
                        ? hacer(() => onAjustar(externo, -Number(c.valor), c.id))
                        : hacer(() => onEstado(externo, c.valor === 'suspended' ? 'active' : 'suspended', c.id))
                    }
                  >
                    Deshacer
                  </button>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      <h3>
        Su historial{!d && registro.length > 0 && <span className="admin-suave"> · lo ya leído; leyendo lo nuevo…</span>}
      </h3>
      {registro.length ? (
          <ol className="admin-historial admin-historial-cobro">
            {registro.map((r) => (
              <li key={r.id} className={r.status >= 400 ? 'fallo' : undefined}>
                <span className="admin-suave">{fechaCorta(r.cuando)}</span>
                <span>
                  {lineaDeRegistro(r)}
                  {r.status >= 400 && <span className="bad"> · {explicar(r)}</span>}
                </span>
                <span />
              </li>
            ))}
          </ol>
        ) : (
          // Su ficha guardada ya sabe si no hay nada: no hace falta esperar al cobro para decirlo.
          <p className={d || guardada ? 'admin-suave admin-historial-vacio' : 'admin-suave'}>{d || guardada ? 'Nada todavía.' : 'Leyendo…'}</p>
        )}

      <p className="admin-suave admin-ficha-id">
        Id <span className="mono">{externo}</span>
        {d?.llave && (
          <>
            {' · llave '}
            <span className="mono">…{d.llave.fin}</span>
          </>
        )}
      </p>
      {d && <Crudo titulo="Lo que dice Voices Cloning, tal cual" r={d.usuario} />}
    </aside>
  )
}

/** Dos listas del registro en una, sin repetir, de la más nueva a la más vieja. */
function juntarRegistro(a: Registro[], b: Registro[]): Registro[] {
  const vistos = new Set<number>()
  return [...a, ...b].filter((r) => !vistos.has(r.id) && vistos.add(r.id)).sort((x, y) => y.id - x.id)
}

/** Un cambio hecho desde aquí, en palabras. */
function lineaDeCambio(c: CambioAdmin): string {
  if (c.tipo === 'estado') return c.valor === 'suspended' ? `${c.deshace ? 'Deshiciste: lo suspendiste' : 'Lo suspendiste'}` : `${c.deshace ? 'Deshiciste: lo reactivaste' : 'Lo reactivaste'}`
  const v = Number(c.valor)
  return `${c.deshace ? 'Deshiciste: ' : ''}${v > 0 ? 'le sumaste' : 'le quitaste'} ${num(Math.abs(v))} créditos`.replace(/^./, (x) => x.toUpperCase())
}

/**
 * Una línea del historial del cobro: qué pasó y cuánto. Las sumas no dicen quién: el cobro anota igual las tuyas, el
 * reparto mensual, la rifa o un regalo.
 */
function lineaDeRegistro(r: Registro): string {
  if (r.accion === 'creditos') return r.creditos ? `${r.creditos > 0 ? 'Recibió' : 'Se le quitaron'} ${num(Math.abs(r.creditos))} créditos` : 'Créditos'
  if (r.accion === 'tts') return `Generó voz: ${num(r.letras)} letras, ${num(r.creditos)} créditos${typeof r.restantes === 'number' ? ` (le quedan ${num(r.restantes)})` : ''}`
  if (r.accion === 'estado') return r.status < 400 && r.error === 'suspended' ? 'Lo suspendiste' : r.status < 400 && r.error === 'active' ? 'Lo reactivaste' : 'Cambio de estado'
  return ACCIONES[r.accion] ?? r.accion
}

// ── Llamadas ───────────────────────────────────────────────────────────────────────────────────────────────────────

function Llamadas({ panel, buscar, quien, soloFallas, onSoloFallas, onAbrir }: { panel: Panel; buscar: string; quien(externo: string): string; soloFallas: boolean; onSoloFallas(v: boolean): void; onAbrir(externo: string): void }) {
  const vistas = panel.registro.filter((f) => (!soloFallas || f.status >= 400) && coincide(sinAcentos(`${quien(f.externo)} ${ACCIONES[f.accion] ?? f.accion} ${f.voz ?? ''} ${f.codigo ?? ''} ${f.status >= 400 ? explicar(f) : ''}`), buscar))
  return (
    <>
      {panel.errores.length > 0 && (
        <div className="admin-errores">
          <h3>Errores en 30 días</h3>
          <ul>
            {[...panel.errores]
              .sort((a, b) => String(b.ultima).localeCompare(String(a.ultima)))
              .map((e) => (
              <li key={`${e.status}${e.codigo}`}>
                <strong className="bad">{num(e.veces)}×</strong> {explicar(e)}
                <span className="admin-suave"> · la última {fechaCorta(e.ultima)}</span>
                {e.error && <span className="admin-suave admin-error"> · «{e.error}»</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="admin-filtros">
        <label className="admin-filtro">
          <input type="checkbox" checked={soloFallas} onChange={(e) => onSoloFallas(e.target.checked)} /> Solo las que fallaron
        </label>
        <span className="admin-suave">Las últimas {num(panel.registro.length)} que pasaron por el cobro</span>
      </div>
      {vistas.length ? (
        <Tabla
          clase="admin-llamadas"
          cabeza={['Cuándo', 'Usuario', 'Llamada', 'Letras', 'Créditos', 'Le quedan', 'Respuesta', 'Tarda']}
          numericas={[3, 4, 5, 7]}
          filas={vistas.map((f) => [
            fechaCorta(f.cuando),
            <button className="admin-enlace admin-corta" onClick={() => onAbrir(f.externo)}>
              {quien(f.externo)}
            </button>,
            ACCIONES[f.accion] ?? f.accion,
            num(f.letras),
            f.creditos === null ? '—' : f.accion === 'creditos' ? (f.creditos > 0 ? `+${num(f.creditos)}` : num(f.creditos)) : num(f.creditos),
            num(f.restantes),
            f.status >= 400 ? (
              <span className="bad" title={[f.status, f.codigo, f.error].filter(Boolean).join(' · ')}>
                {explicar(f)}
              </span>
            ) : (
              <span className="ok">Bien</span>
            ),
            segundos(f.ms)
          ])}
        />
      ) : (
        <p className="admin-vacio">Ninguna{soloFallas ? ' falló' : ''}{buscar ? ` con «${buscar}»` : ''}.</p>
      )}
      {panel.resumen.length > 0 && (
        <>
          <h3 className="admin-subtitulo">Últimos 30 días, por tipo</h3>
          <Tabla
            cabeza={['Llamada', 'Veces', 'Fallidas', 'Letras', 'Créditos', 'Usuarios', 'Tarda']}
            numericas={[1, 2, 3, 4, 5, 6]}
            filas={panel.resumen.map((f) => [ACCIONES[f.accion] ?? f.accion, num(f.llamadas), f.fallidas ? <span className="bad">{num(f.fallidas)}</span> : '0', num(f.letras), f.accion === 'creditos' ? '—' : num(f.creditos), num(f.usuarios), segundos(f.ms)])}
          />
        </>
      )}
    </>
  )
}

// ── Créditos mensuales, llaves y lo de tal cual ────────────────────────────────────────────────────────────────────

function Mensuales({ panel, quien, onAbrir }: { panel: Panel; quien(externo: string): string; onAbrir(externo: string): void }) {
  return (
    <>
      <p className="admin-nota">
        {num(panel.mensuales)} créditos al mes solo para cada correo que paga activamente {panel.mensualesDesde ?? '$10 USD'} o más (o el anual). Nadie más: ni cuentas gratis, ni apoyos de menos, ni lugares gratis de Fundador. Cada mes se llenan hasta {num(panel.mensuales)}: no se acumulan. Salen de tus llaves de socio.
      </p>
      {panel.repartos?.length ? (
        <Tabla
          cabeza={['Usuario', 'Mes', 'Créditos', 'Entrega', 'Correo', 'Detalle']}
          numericas={[2]}
          filas={panel.repartos.map((r) => [
            <button className="admin-enlace admin-corta" onClick={() => onAbrir(r.externo)}>
              {quien(r.externo)}
            </button>,
            r.periodo,
            num(r.creditos),
            <span className={r.estado === 'revisar' || r.estado === 'enviando' ? 'bad' : r.estado === 'entregado' ? 'ok' : ''}>{r.estado === 'entregado' ? 'Entregados' : r.estado === 'revisar' || r.estado === 'enviando' ? 'Revisar en el proveedor antes de repetir' : 'Pendientes'}</span>,
            r.correo ? fechaCorta(r.correo) : 'Por enviar',
            r.error ?? '—'
          ])}
        />
      ) : (
        <p className="admin-vacio">El primer reparto empieza al publicar la actualización.</p>
      )}
    </>
  )
}

function Llaves({ panel, quien, cargando, onConsumo }: { panel: Panel; quien(externo: string): string; cargando: boolean; onConsumo(p: number): void }) {
  const llaves = panel.llaves
  const varias = llaves.length > 1
  const mayor = llaves.map((l) => l.uso).sort((a, b) => Number(b.datos.total ?? 0) - Number(a.datos.total ?? 0))[0]
  return (
    <>
      {varias && <p className="admin-nota">Cada llave es su propia cuenta, con sus usuarios y sus voces clonadas. Los nuevos entran en la de más saldo; a quien se le acaba el saldo de la suya se muda a la de más saldo con sus créditos.</p>}
      {llaves.map((l) => (
        <div key={l.id} className="admin-llave">
          <h3>
            Llave …{l.fin} <span className="admin-suave mono">{l.nombre}</span>
            {panel.nuevos === l.id && varias && <span className="ok"> · aquí entran los nuevos</span>}
          </h3>
          {l.saldo.status >= 400 && <Fallo r={l.saldo} />}
          <Saldo r={l.saldo} iniciales={panel.creditosIniciales} />
        </div>
      ))}
      <h3 className="admin-subtitulo">Movimientos según Voices Cloning</h3>
      <p className="admin-nota">Las recargas de tu saldo y lo que gasta cada usuario, como lo anota Voices Cloning.</p>
      {llaves.find((l) => l.uso.status >= 400) && <Fallo r={llaves.find((l) => l.uso.status >= 400)!.uso} />}
      <Movimientos llaves={llaves} quien={quien} />
      <Paginas r={mayor} pagina={panel.consumo} cargando={cargando} onPagina={onConsumo} />
    </>
  )
}

function Saldo({ r, iniciales }: { r?: Respuesta; iniciales: number }) {
  const d = r && r.status < 400 ? r.datos : {}
  const tope = d.daily_limit
  const cifras: [string, ReactNode, string?][] = [
    ['Saldo', num(d.balance)],
    ['Consumido', num(d.used_total)],
    ['Hoy', num(d.used_today), 'Hora de Lima'],
    ['Audios', num(d.generations)],
    ['Usuarios', num(d.users)],
    ['Tope diario', tope === null || tope === undefined ? 'Sin tope' : num(tope), d.resets_at ? `Se reinicia ${fechaCorta(d.resets_at)}` : undefined],
    ['Al darse de alta', num(iniciales), 'Créditos de cada nuevo']
  ]
  return (
    <div className="admin-cifras chicas">
      {cifras.map(([t, v, n]) => (
        <div key={t} className="admin-cifra" title={n}>
          <span className="admin-cifra-titulo">{t}</span>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  )
}

/**
 * Los movimientos de `/usage` de todas las llaves, los más nuevos primero (`items`: `date`, `kind`, `external_id`,
 * `function`, `credits`); con otra forma, tal cual.
 */
function Movimientos({ llaves, quien }: { llaves: Llave[]; quien(externo: string): string }) {
  const leidas = llaves.filter((l) => l.uso.status < 400)
  const rara = leidas.find((l) => !Array.isArray(l.uso.datos.items))
  if (rara) return <Generica r={rara.uso} />
  const varias = llaves.length > 1
  const items = leidas
    .flatMap((l) => (l.uso.datos.items as Datos[]).map((m): Datos => ({ ...m, cuenta: l.fin })))
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
  if (!items.length) return leidas.length ? <p className="admin-vacio">Ningún movimiento.</p> : null
  const tipo = (k: unknown) => (k === 'consumo' ? 'Consumo' : k === 'recarga' ? 'Recarga' : String(k ?? '—'))
  return (
    <Tabla
      cabeza={['Cuándo', 'Tipo', 'Usuario', 'Qué', 'Créditos', ...(varias ? ['Llave'] : [])]}
      numericas={[4]}
      filas={items.map((m) => [
        fechaCorta(m.date),
        tipo(m.kind),
        m.external_id ? quien(String(m.external_id)) : '—',
        m.function === 'tts' ? 'Generó voz' : String(m.function ?? '—'),
        <strong className={m.kind === 'recarga' ? 'ok' : ''}>{num(m.credits)}</strong>,
        ...(varias ? [<span className="mono">…{String(m.cuenta)}</span>] : [])
      ])}
    />
  )
}

function TalCual({ panel }: { panel: Panel }) {
  const varias = panel.llaves.length > 1
  return (
    <>
      <p className="admin-nota">Lo que responde Voices Cloning, sin arreglar: para comprobar algo que no cuadra.</p>
      {panel.llaves.map((l) => (
        <div key={l.id}>
          <Crudo titulo={`Saldo${varias ? ` de …${l.fin}` : ''} (GET /api/partner/v1/balance)`} r={l.saldo} />
          <Crudo titulo={`Usuarios${varias ? ` de …${l.fin}` : ''} (GET /api/partner/v1/users)`} r={l.usuarios} />
          <Crudo titulo={`Consumo${varias ? ` de …${l.fin}` : ''} (GET /api/partner/v1/usage)`} r={l.uso} />
        </div>
      ))}
    </>
  )
}

/** «Página 2 de 5 · 412», con las flechas, de una lista de Voices Cloning (`page`, `per_page`, `total`). */
function Paginas({ r, pagina, cargando, onPagina }: { r?: Respuesta; pagina: number; cargando: boolean; onPagina(p: number): void }) {
  const total = typeof r?.datos.total === 'number' ? r.datos.total : undefined
  const por = typeof r?.datos.per_page === 'number' && r.datos.per_page > 0 ? r.datos.per_page : 100
  const paginas = total === undefined ? undefined : Math.max(1, Math.ceil(total / por))
  if (paginas === 1 && pagina === 1) return null
  return (
    <div className="admin-paginas">
      <button className="ghost" disabled={pagina <= 1 || cargando} onClick={() => onPagina(pagina - 1)}>
        ← Anteriores
      </button>
      <span className="admin-suave">
        Página {pagina}
        {paginas ? ` de ${paginas}` : ''}
        {total !== undefined ? ` · ${num(total)} en total` : ''}
      </span>
      <button className="ghost" disabled={cargando || (paginas !== undefined && pagina >= paginas)} onClick={() => onPagina(pagina + 1)}>
        Siguientes →
      </button>
    </div>
  )
}

/**
 * Una respuesta cuya forma no se conoce: la primera lista que traiga, como tabla con sus campos; si no trae ninguna, sus
 * campos sueltos.
 */
function Generica({ r }: { r?: Respuesta }) {
  if (!r || r.status >= 400) return null
  const lista = Object.values(r.datos).find((v) => Array.isArray(v) && v.length && typeof v[0] === 'object') as Datos[] | undefined
  if (!lista) {
    const campos = Object.entries(r.datos).filter(([, v]) => v === null || typeof v !== 'object')
    return campos.length ? <Tabla cabeza={['Campo', 'Valor']} filas={campos.map(([k, v]) => [k, valor(v)])} /> : <p className="admin-vacio">Sin datos.</p>
  }
  const columnas = [...new Set(lista.slice(0, 50).flatMap((f) => Object.keys(f)))].slice(0, 12)
  return <Tabla cabeza={columnas} filas={lista.map((f) => columnas.map((c) => valor(f[c])))} />
}

function Crudo({ titulo, r }: { titulo: string; r?: Respuesta }) {
  if (!r) return null
  return (
    <details className="admin-crudo">
      <summary>
        {titulo} · {r.status}
      </summary>
      <pre>{JSON.stringify(r.datos, null, 2)}</pre>
    </details>
  )
}

/** El aviso de abajo tras un cambio: dura 10 s (o hasta otro), con «Deshacer». */
function Aviso({ hecho, onCerrar, onError }: { hecho: Hecho; onCerrar(): void; onError(texto: string): void }) {
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    const t = setTimeout(onCerrar, hecho.error ? 15_000 : 10_000)
    return () => clearTimeout(t)
  }, [hecho, onCerrar])
  return (
    <div className={`admin-hecho${hecho.error ? ' error' : ''}`} role="status">
      <span>{hecho.texto}</span>
      {hecho.deshacer && (
        <button
          className="admin-deshacer"
          disabled={ocupado}
          onClick={() => {
            setOcupado(true)
            hecho.deshacer!().catch((e: Error) => onError(`No se pudo deshacer: ${e.message}`))
          }}
        >
          Deshacer
        </button>
      )}
      <button className="admin-icono-boton" onClick={onCerrar} aria-label="Cerrar el aviso">
        <Icono de="cerrar" />
      </button>
    </div>
  )
}

export function Tabla({ cabeza, filas, numericas = [], clase }: { cabeza: string[]; filas: ReactNode[][]; numericas?: number[]; clase?: string }) {
  return (
    <div className="admin-tabla-caja">
      <table className={`admin-tabla${clase ? ` ${clase}` : ''}`}>
        <thead>
          <tr>
            {cabeza.map((c, i) => (
              <th key={i} className={numericas.includes(i) ? 'num' : undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              {f.map((c, j) => (
                <td key={j} className={numericas.includes(j) ? 'num' : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Un valor cualquiera de una respuesta: las fechas como fecha, los números con sus comas, lo demás en texto. */
function valor(v: unknown): ReactNode {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return num(v)
  if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v)) return fechaCorta(v)
  if (typeof v === 'object') return <span className="mono admin-id">{JSON.stringify(v)}</span>
  return String(v)
}
