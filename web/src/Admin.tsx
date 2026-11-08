import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { Confirm } from './Confirm'
import { Icono } from './Iconos'
import { RifaAdmin } from './RifaAdmin'
import './Admin.css'

/**
 * Administrador: solo en la computadora del creador (la que tiene su llave de `publicar.txt`; en las demás, la barra no
 * la enseña y el servidor no la sirve). Todo lo de Voices Cloning, el proveedor de voz de Sloth (`licencias/src/voz.ts`):
 * el saldo de cada llave de socio (cada una, su cuenta), cada usuario con su correo, su plan y su llave, sus créditos y lo que gasta, el consumo que da Voices
 * Cloning, el registro de cada llamada que pasó por el cobro (con sus errores) y el resumen de 30 días. Aquí se suman y
 * quitan créditos, se suspende o reactiva a alguien y se da de alta una cuenta de Sloth por su correo. Lo que responde
 * Voices Cloning se puede ver también tal cual, al final. Arriba, la rifa de la comunidad (`RifaAdmin.tsx`).
 */

type Datos = Record<string, unknown>

/** Lo que respondió Voices Cloning a una consulta, tal cual. */
interface Respuesta {
  status: number
  datos: Datos
}

interface Cuenta {
  email: string
  licencias: { plan: string; estado: string; monto?: number; moneda?: string; pagado_hasta?: string | null; creada?: string; fundador?: number }[]
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
  /** Desde cuánto se reciben: «$15 USD (299 MXN en los apoyos en pesos)». */
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
  [k: string]: unknown
}

const CREADOR = 'creador'
const ACCIONES: Record<string, string> = { alta: 'Alta', sesion: 'Abrió la ventana', tts: 'Generó voz', tarea: 'Tarea que tardó', creditos: 'Créditos', estado: 'Estado' }

/** Si esta Sloth es la del creador: la barra enseña Administrador solo entonces. */
export function useEsCreador(): boolean {
  const [si, setSi] = useState(false)
  useEffect(() => void api<{ creador: boolean }>('/api/admin').then((r) => setSi(!!r.creador), () => setSi(false)), [])
  return si
}

export function Admin() {
  const [panel, setPanel] = useState<Panel>()
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [consumo, setConsumo] = useState(1)
  const [detalle, setDetalle] = useState<string>()

  const cargar = useCallback(() => {
    setCargando(true)
    api<Panel>(`/api/admin/voz?pagina=${pagina}&consumo=${consumo}`)
      .then((p) => (setPanel(p), setError('')), (e: Error) => setError(e.message))
      .finally(() => setCargando(false))
  }, [pagina, consumo])
  useEffect(cargar, [cargar])

  const llaves = panel?.llaves ?? []
  const varias = llaves.length > 1
  const usuarios = llaves.flatMap((l) => (Array.isArray(l.usuarios.datos.users) ? (l.usuarios.datos.users as Usuario[]) : []).map((u) => ({ ...u, cuenta: varias ? `…${l.fin}` : undefined })))
  // Las listas van por página en cada llave a la vez: manda la que más tiene.
  const mayor = (campo: 'usuarios' | 'uso') => llaves.map((l) => l[campo]).sort((a, b) => Number(b.datos.total ?? 0) - Number(a.datos.total ?? 0))[0]
  const quien = (externo: string) => (externo === CREADOR ? 'Tú (creador)' : (panel?.cuentas[externo]?.email ?? externo))

  return (
    <div className="admin">
      <div className="admin-cabeza">
        <div>
          <span className="admin-antetitulo">Solo en tu computadora</span>
          <h1>Administrador</h1>
          <p>Todo lo de Voices Cloning, el proveedor de voz de Sloth: el saldo de cada llave, quién gasta cuánto, cada llamada que pasa por el cobro y sus errores. Las llaves del socio viven en el cobro; ninguna app las ve.</p>
        </div>
        <button className="ghost admin-recargar" disabled={cargando} onClick={cargar}>
          <Icono de="recargar" /> {cargando ? 'Leyendo…' : 'Volver a leer'}
        </button>
      </div>

      {error && <p className="bad admin-aviso">{error}</p>}
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

      {panel?.reparto && <ParaRepartir r={panel.reparto} desde={panel.mensualesDesde} />}

      <RifaAdmin />

      {panel && (
        <>
          <Seccion
            titulo={varias ? 'Tus llaves de socio' : 'Tu cuenta general'}
            nota={
              varias
                ? 'Cada llave es su propia cuenta, con sus usuarios y sus voces clonadas. Los nuevos entran en la de más saldo; a quien se le acaba el saldo de la suya se muda a la de más saldo con sus créditos.'
                : undefined
            }
          >
            {llaves.map((l) => (
              <div key={l.id} className="admin-llave">
                {varias && (
                  <h3>
                    Llave …{l.fin} <span className="muted small mono">{l.nombre}</span>
                    {panel.nuevos === l.id && <span className="ok small"> · aquí entran los nuevos</span>}
                  </h3>
                )}
                {l.saldo.status >= 400 && <p className="bad small">Voices Cloning respondió {l.saldo.status}: {String(l.saldo.datos.error ?? 'sin mensaje')}</p>}
                <Saldo r={l.saldo} iniciales={panel.creditosIniciales} />
              </div>
            ))}
          </Seccion>

          <Seccion titulo="Usuarios" nota="Los créditos de cada quien. Asignarlos no gasta tu saldo: solo lo gasta generar." fallo={llaves.find((l) => l.usuarios.status >= 400)?.usuarios}>
            <Usuarios usuarios={usuarios} cuentas={panel.cuentas} onCambio={cargar} onVer={setDetalle} />
            <Paginas r={mayor('usuarios')} pagina={panel.pagina} cargando={cargando} onPagina={setPagina} />
          </Seccion>

          {panel.repartos && (
            <Seccion titulo="Créditos mensuales de Sloth" nota={`${num(panel.mensuales)} créditos al mes SOLO para cada correo que paga activamente ${panel.mensualesDesde ?? '$15 USD'} o más (o el anual). Nadie más: ni cuentas gratis, ni apoyos de menos, ni lugares gratis de Fundador. Cada mes se llenan hasta ${num(panel.mensuales)}: no se acumulan. Salen de tus llaves de socio.`}>
              {panel.repartos.length ? <Tabla
                cabeza={['Usuario', 'Mes', 'Créditos', 'Entrega', 'Correo', 'Detalle']}
                filas={panel.repartos.map((r) => [quien(r.externo), r.periodo, num(r.creditos),
                  <span className={r.estado === 'revisar' || r.estado === 'enviando' ? 'bad' : ''}>{r.estado === 'entregado' ? 'Entregados' : r.estado === 'revisar' || r.estado === 'enviando' ? 'Revisar en el proveedor antes de repetir' : 'Pendientes'}</span>,
                  r.correo ? fecha(r.correo) : 'Por enviar', r.error ?? '—'])}
              /> : <p className="muted small admin-vacio">El primer reparto empieza al publicar la actualización.</p>}
            </Seccion>
          )}

          {detalle && <Detalle externo={detalle} quien={quien(detalle)} onCerrar={() => setDetalle(undefined)} onCambio={cargar} />}

          <Seccion titulo="Dar créditos a una cuenta de Sloth" nota="Por el correo de su cuenta o su apoyo. Si aún no usaba las voces, la da de alta con esos créditos; si ya las usaba, se le suman. Con créditos, el menú Voz de su Sloth le enseña Voices Cloning.">
            {panel.soloCreador ? <p className="muted small">Mientras sea solo para ti, no se da de alta a nadie más.</p> : <Alta onHecho={cargar} />}
          </Seccion>

          <Seccion titulo="Últimos 30 días" nota="Lo que pasó por el cobro, por tipo de llamada.">
            <Resumen filas={panel.resumen} />
          </Seccion>

          <Seccion titulo="Errores (30 días)">
            {panel.errores.length ? (
              <Tabla
                cabeza={['Respuesta', 'Código', 'Veces', 'La última', 'Mensaje']}
                filas={panel.errores.map((e) => [<span className="bad">{e.status}</span>, e.codigo ?? '—', num(e.veces), fecha(e.ultima), <span className="admin-error">{e.error ?? '—'}</span>])}
              />
            ) : (
              <p className="muted small admin-vacio">Ningún error.</p>
            )}
          </Seccion>

          <Seccion titulo="Movimientos según Voices Cloning" nota="Las recargas de tu saldo y lo que gasta cada usuario, como lo anota Voices Cloning." fallo={llaves.find((l) => l.uso.status >= 400)?.uso}>
            <Movimientos llaves={llaves} quien={quien} />
            <Paginas r={mayor('uso')} pagina={panel.consumo} cargando={cargando} onPagina={setConsumo} />
          </Seccion>

          <Seccion titulo="Cada llamada" nota="Las últimas 300 que pasaron por el cobro: quién, qué, cuánto y cómo respondió.">
            <Llamadas filas={panel.registro} quien={quien} onVer={setDetalle} />
          </Seccion>

          <Seccion titulo="Las respuestas tal cual">
            {llaves.map((l) => (
              <div key={l.id}>
                <Crudo titulo={`Saldo${varias ? ` de …${l.fin}` : ''} (GET /api/partner/v1/balance)`} r={l.saldo} />
                <Crudo titulo={`Usuarios${varias ? ` de …${l.fin}` : ''} (GET /api/partner/v1/users)`} r={l.usuarios} />
                <Crudo titulo={`Consumo${varias ? ` de …${l.fin}` : ''} (GET /api/partner/v1/usage)`} r={l.uso} />
              </div>
            ))}
          </Seccion>
        </>
      )}
    </div>
  )
}

/**
 * Cuánto puedes repartir (rifas, regalos) sin quedarte corto con los créditos de cada mes: tu saldo general, menos lo
 * que ya tienen los usuarios sin gastar, menos lo que falta entregar este mes a quien paga $15 o más.
 */
function ParaRepartir({ r, desde }: { r: Reparto | { error: string }; desde?: string }) {
  if ('error' in r)
    return (
      <Seccion titulo="Créditos para repartir">
        <p className="bad small">No se pudo leer Voices Cloning: {r.error}</p>
      </Seccion>
    )
  const corto = r.libres < 0
  return (
    <Seccion
      titulo="Créditos para repartir"
      nota={`Lo libre es tu saldo general menos lo que ya tienen los usuarios sin gastar y lo que falta entregar este mes a quien paga ${desde ?? '$15 USD'} o más. Asignar créditos no gasta el saldo, pero cuando los usen sí: esto es lo que puedes rifar o regalar sin quedarte corto.`}
    >
      <div className="admin-cifras">
        <div className={`admin-cifra admin-libres${corto ? ' corto' : ''}`}>
          <span className="admin-cifra-titulo">{corto ? 'Te faltan' : 'Libres para repartir'}</span>
          <strong>{num(Math.abs(r.libres))}</strong>
          <span className="muted small">{corto ? 'Recarga tu saldo antes de rifar' : 'Para rifas y regalos'}</span>
        </div>
        <div className="admin-cifra">
          <span className="admin-cifra-titulo">Saldo general</span>
          <strong>{num(r.saldo)}</strong>
          <span className="muted small">De todas tus llaves</span>
        </div>
        <div className="admin-cifra">
          <span className="admin-cifra-titulo">Ya tienen los usuarios</span>
          <strong>{num(r.enUsuarios)}</strong>
          <span className="muted small">Asignados y sin gastar</span>
        </div>
        <div className="admin-cifra">
          <span className="admin-cifra-titulo">Falta entregar este mes</span>
          <strong>{num(r.porEntregar)}</strong>
          <span className="muted small">A quien apoya y aún no los recibe</span>
        </div>
        <div className="admin-cifra">
          <span className="admin-cifra-titulo">Cada mes</span>
          <strong>{num(r.cadaMes)}</strong>
          <span className="muted small">
            {num(r.beneficiarios)} {r.beneficiarios === 1 ? 'persona' : 'personas'} × 100,000
          </span>
        </div>
      </div>
    </Seccion>
  )
}

function Seccion({ titulo, nota, fallo, children }: { titulo: string; nota?: string; fallo?: Respuesta; children: ReactNode }) {
  return (
    <section className="admin-seccion">
      <h2>{titulo}</h2>
      {nota && <p className="muted small">{nota}</p>}
      {fallo && fallo.status >= 400 && <p className="bad small">Voices Cloning respondió {fallo.status}: {String(fallo.datos.error ?? 'sin mensaje')}</p>}
      {children}
    </section>
  )
}

function Saldo({ r, iniciales }: { r?: Respuesta; iniciales: number }) {
  const d = r && r.status < 400 ? r.datos : {}
  const tope = d.daily_limit
  const cifras: [string, ReactNode, string?][] = [
    ['Saldo general', num(d.balance), 'Lo que te queda para todos'],
    ['Consumido', num(d.used_total), 'Por todos tus usuarios'],
    ['Hoy', num(d.used_today), 'Hora de Lima'],
    ['Audios generados', num(d.generations)],
    ['Usuarios', num(d.users)],
    ['Tope diario', tope === null || tope === undefined ? 'Sin tope' : num(tope), d.resets_at ? `Se reinicia ${fecha(d.resets_at)}` : undefined],
    ['Créditos al darse de alta', num(iniciales), 'VOZ_CREDITOS, en el cobro']
  ]
  return (
    <div className="admin-cifras">
      {cifras.map(([t, v, n]) => (
        <div key={t} className="admin-cifra">
          <span className="admin-cifra-titulo">{t}</span>
          <strong>{v}</strong>
          {n && <span className="muted small">{n}</span>}
        </div>
      ))}
    </div>
  )
}

/** Los planes de Sloth de un correo, los que siguen en pie primero. */
function planes(c?: Cuenta): string {
  if (!c) return '—'
  return c.licencias.map((l) => `${l.plan}${l.monto ? ` ${l.monto} ${l.moneda ?? ''}`.trimEnd() : ''} · ${l.estado}${l.fundador ? ' · fundador' : ''}`).join('\n')
}

function Usuarios({ usuarios, cuentas, onCambio, onVer }: { usuarios: Usuario[]; cuentas: Record<string, Cuenta>; onCambio(): void; onVer(externo: string): void }) {
  if (!usuarios.length) return <p className="muted small admin-vacio">Nadie ha usado las voces todavía.</p>
  return (
    <Tabla
      cabeza={['Usuario', 'Plan en Sloth', 'Créditos', 'Usados', 'Hoy', 'Audios', 'Estado', 'Desde', '']}
      filas={usuarios.map((u) => [
        <button className="admin-quien" onClick={() => onVer(u.external_id)} title={`external_id: ${u.external_id}`}>
          {u.external_id === CREADOR ? 'Tú (creador)' : (cuentas[u.external_id]?.email ?? u.name ?? u.external_id)}
          {u.cuenta && <span className="muted small mono"> {u.cuenta}</span>}
        </button>,
        <span className="admin-planes">{u.external_id === CREADOR ? '—' : planes(cuentas[u.external_id])}</span>,
        <strong>{num(u.credits)}</strong>,
        num(u.used_total),
        num(u.used_today),
        num(u.generations),
        <span className={u.status === 'suspended' ? 'bad' : ''}>{u.status === 'suspended' ? 'Suspendido' : u.status === 'active' ? 'Activo' : (u.status ?? '—')}</span>,
        fecha(u.created_at),
        <Acciones externo={u.external_id} suspendido={u.status === 'suspended'} onCambio={onCambio} />
      ])}
    />
  )
}

/** Sumar o quitar créditos, y suspender o reactivar. */
function Acciones({ externo, suspendido, onCambio }: { externo: string; suspendido: boolean; onCambio(): void }) {
  const [cuanto, setCuanto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [suspender, setSuspender] = useState(false)
  const hacer = (ruta: string, cuerpo: object) => {
    setOcupado(true)
    setError('')
    return api(ruta, cuerpo)
      .then(() => (setCuanto(''), onCambio()), (e: Error) => setError(e.message))
      .finally(() => setOcupado(false))
  }
  const n = Math.floor(Number(cuanto))
  return (
    <div className="admin-acciones">
      <input type="number" min={1} step={1} placeholder="Créditos" value={cuanto} onChange={(e) => setCuanto(e.target.value)} disabled={ocupado} />
      <button className="admin-boton" disabled={ocupado || !(n > 0)} onClick={() => void hacer('/api/admin/voz/creditos', { externo, amount: n })}>
        Sumar
      </button>
      <button className="admin-boton" disabled={ocupado || !(n > 0)} onClick={() => void hacer('/api/admin/voz/creditos', { externo, amount: -n })}>
        Quitar
      </button>
      {externo !== CREADOR && (
        <button className={`admin-boton${suspendido ? '' : ' peligro'}`} disabled={ocupado} onClick={() => (suspendido ? void hacer('/api/admin/voz/estado', { externo, status: 'active' }) : setSuspender(true))}>
          {suspendido ? 'Reactivar' : 'Suspender'}
        </button>
      )}
      {error && <span className="bad small">{error}</span>}
      {suspender && (
        <Confirm title="¿Suspender a este usuario?" action="Suspender" danger onConfirm={() => hacer('/api/admin/voz/estado', { externo, status: 'suspended' })} onClose={() => setSuspender(false)}>
          No podrá generar voces de Voices Cloning hasta que lo reactives. Sus créditos no cambian.
        </Confirm>
      )}
    </div>
  )
}

function Alta({ onHecho }: { onHecho(): void }) {
  const [email, setEmail] = useState('')
  const [creditos, setCreditos] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ bien: boolean; texto: string }>()
  const n = Math.max(0, Math.floor(Number(creditos) || 0))
  return (
    <form
      className="admin-alta"
      onSubmit={(e) => {
        e.preventDefault()
        setOcupado(true)
        setAviso(undefined)
        api<{ creado: boolean }>('/api/admin/voz/alta', { email: email.trim(), creditos: n })
          .then(
            (r) => (setAviso({ bien: true, texto: r.creado ? `Dada de alta con ${num(n)} créditos.` : n ? `Ya estaba: se le sumaron ${num(n)} créditos.` : 'Ya estaba dada de alta.' }), setEmail(''), setCreditos(''), onHecho()),
            (x: Error) => setAviso({ bien: false, texto: x.message })
          )
          .finally(() => setOcupado(false))
      }}
    >
      <input type="email" placeholder="correo@de.su.cuenta" value={email} onChange={(e) => setEmail(e.target.value)} disabled={ocupado} />
      <input type="number" min={0} step={1} placeholder="Créditos" value={creditos} onChange={(e) => setCreditos(e.target.value)} disabled={ocupado} />
      <button className="primary" disabled={ocupado || !email.includes('@')}>
        {ocupado ? 'Dando…' : 'Dar créditos'}
      </button>
      {aviso && <span className={`small ${aviso.bien ? 'ok' : 'bad'}`}>{aviso.texto}</span>}
    </form>
  )
}

function Resumen({ filas }: { filas: Panel['resumen'] }) {
  if (!filas.length) return <p className="muted small admin-vacio">Nada en estos 30 días.</p>
  return (
    <Tabla
      cabeza={['Llamada', 'Veces', 'Fallidas', 'Letras', 'Créditos', 'Usuarios', 'Tarda']}
      filas={filas.map((f) => [ACCIONES[f.accion] ?? f.accion, num(f.llamadas), f.fallidas ? <span className="bad">{num(f.fallidas)}</span> : '0', num(f.letras), f.accion === 'creditos' ? '—' : num(f.creditos), num(f.usuarios), segundos(f.ms)])}
    />
  )
}

function Llamadas({ filas, quien, onVer }: { filas: Registro[]; quien(externo: string): string; onVer?(externo: string): void }) {
  const [soloFallas, setSoloFallas] = useState(false)
  const vistas = soloFallas ? filas.filter((f) => f.status >= 400) : filas
  return (
    <>
      <label className="admin-filtro small">
        <input type="checkbox" checked={soloFallas} onChange={(e) => setSoloFallas(e.target.checked)} /> Solo las que fallaron
      </label>
      {vistas.length ? (
        <Tabla
          cabeza={['Cuándo', 'Usuario', 'Llamada', 'Voz', 'Letras', 'Créditos', 'Le quedan', 'Respuesta', 'Tarda']}
          filas={vistas.map((f) => [
            fecha(f.cuando),
            onVer ? (
              <button className="admin-quien" onClick={() => onVer(f.externo)}>
                {quien(f.externo)}
              </button>
            ) : (
              quien(f.externo)
            ),
            ACCIONES[f.accion] ?? f.accion,
            <span className="mono admin-id">{f.voz ?? (f.tarea ? `tarea ${f.tarea}` : '—')}</span>,
            num(f.letras),
            f.creditos === null ? '—' : f.accion === 'creditos' ? (f.creditos > 0 ? `+${num(f.creditos)}` : num(f.creditos)) : num(f.creditos),
            num(f.restantes),
            f.status >= 400 ? (
              <span className="bad admin-error" title={f.error ?? ''}>
                {f.status}
                {f.codigo ? ` ${f.codigo}` : ''}
                {f.error ? ` · ${f.error}` : ''}
              </span>
            ) : (
              <span className="ok">{f.status}</span>
            ),
            segundos(f.ms)
          ])}
        />
      ) : (
        <p className="muted small admin-vacio">Ninguna.</p>
      )}
    </>
  )
}

/** Un usuario: lo que dice Voices Cloning, su cuenta de Sloth y todas sus llamadas. */
function Detalle({ externo, quien, onCerrar, onCambio }: { externo: string; quien: string; onCerrar(): void; onCambio(): void }) {
  const [d, setD] = useState<{ usuario: Respuesta; llave: { nombre: string; fin: string } | null; registro: Registro[]; cuenta: Cuenta | null }>()
  const [error, setError] = useState('')
  const leer = useCallback(() => void api<NonNullable<typeof d>>(`/api/admin/voz/usuario?externo=${encodeURIComponent(externo)}`).then(setD, (e: Error) => setError(e.message)), [externo])
  useEffect(leer, [leer])
  const u = d?.usuario.status === 200 ? (d.usuario.datos as Usuario) : undefined
  return (
    <section className="admin-seccion admin-detalle">
      <div className="admin-detalle-cabeza">
        <h2>{quien}</h2>
        <button className="ghost" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
      {error && <p className="bad small">{error}</p>}
      {d && d.usuario.status >= 400 && <p className="muted small">Voices Cloning: {d.usuario.status === 404 ? 'aún no está dado de alta.' : `respondió ${d.usuario.status}: ${String(d.usuario.datos.error ?? '')}`}</p>}
      {u && (
        <div className="admin-cifras">
          {(
            [
              ['Créditos', u.credits],
              ['Usados', u.used_total],
              ['Hoy', u.used_today],
              ['Audios', u.generations]
            ] as const
          ).map(([t, v]) => (
            <div key={t} className="admin-cifra">
              <span className="admin-cifra-titulo">{t}</span>
              <strong>{num(v)}</strong>
            </div>
          ))}
          <div className="admin-cifra">
            <span className="admin-cifra-titulo">Estado</span>
            <strong className={u.status === 'suspended' ? 'bad' : ''}>{u.status === 'suspended' ? 'Suspendido' : 'Activo'}</strong>
          </div>
        </div>
      )}
      <p className="muted small">
        external_id <span className="mono">{externo}</span>
        {d?.llave && (
          <>
            {' · llave '}
            <span className="mono">
              …{d.llave.fin} ({d.llave.nombre})
            </span>
          </>
        )}
        {d?.cuenta && (
          <>
            {' · '}
            {d.cuenta.email}
          </>
        )}
      </p>
      {d?.cuenta && <pre className="admin-planes-detalle">{planes(d.cuenta)}</pre>}
      {u && <Acciones externo={externo} suspendido={u.status === 'suspended'} onCambio={() => (leer(), onCambio())} />}
      {d && <Llamadas filas={d.registro} quien={() => quien} />}
      {d && <Crudo titulo="Lo que dice Voices Cloning, tal cual" r={d.usuario} />}
    </section>
  )
}

/** «Página 2 de 5 · 412», con las flechas, de una lista de Voices Cloning (`page`, `per_page`, `total`). */
function Paginas({ r, pagina, cargando, onPagina }: { r?: Respuesta; pagina: number; cargando: boolean; onPagina(p: number): void }) {
  const total = typeof r?.datos.total === 'number' ? r.datos.total : undefined
  const por = typeof r?.datos.per_page === 'number' && r.datos.per_page > 0 ? r.datos.per_page : 100
  const paginas = total === undefined ? undefined : Math.max(1, Math.ceil(total / por))
  if (paginas === 1 && pagina === 1) return total ? <p className="muted small">{num(total)} en total</p> : null
  return (
    <div className="admin-paginas">
      <button className="ghost" disabled={pagina <= 1 || cargando} onClick={() => onPagina(pagina - 1)}>
        ← Anteriores
      </button>
      <span className="muted small">
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
  if (!items.length) return leidas.length ? <p className="muted small admin-vacio">Ningún movimiento.</p> : null
  return (
    <Tabla
      cabeza={['Cuándo', 'Tipo', 'Usuario', 'Qué', 'Créditos', ...(varias ? ['Llave'] : [])]}
      filas={items.map((m) => [
        fecha(m.date),
        String(m.kind ?? '—'),
        m.external_id ? quien(String(m.external_id)) : '—',
        String(m.function ?? '—'),
        <strong className={m.kind === 'recarga' ? 'ok' : ''}>{num(m.credits)}</strong>,
        ...(varias ? [<span className="mono">…{String(m.cuenta)}</span>] : [])
      ])}
    />
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
    return campos.length ? <Tabla cabeza={['Campo', 'Valor']} filas={campos.map(([k, v]) => [k, valor(v)])} /> : <p className="muted small admin-vacio">Sin datos.</p>
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

export function Tabla({ cabeza, filas }: { cabeza: string[]; filas: ReactNode[][] }) {
  return (
    <div className="admin-tabla-caja">
      <table className="admin-tabla">
        <thead>
          <tr>
            {cabeza.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              {f.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('es-MX', { maximumFractionDigits: 2 }) : '—')
const segundos = (ms: unknown) => (typeof ms === 'number' ? `${(ms / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} s` : '—')
export function fecha(v: unknown): string {
  const t = typeof v === 'string' || typeof v === 'number' ? new Date(v) : undefined
  return t && !Number.isNaN(t.getTime()) ? t.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
}
/** Un valor cualquiera de una respuesta: las fechas como fecha, los números con sus comas, lo demás en texto. */
function valor(v: unknown): ReactNode {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return num(v)
  if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v)) return fecha(v)
  if (typeof v === 'object') return <span className="mono admin-id">{JSON.stringify(v)}</span>
  return String(v)
}
