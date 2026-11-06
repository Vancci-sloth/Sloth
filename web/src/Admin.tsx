import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { Confirm } from './Confirm'
import { Icono } from './Iconos'
import './Admin.css'

/**
 * Administrador: solo en la computadora del creador (la que tiene su llave de `publicar.txt`; en las demás, la barra no
 * la enseña y el servidor no la sirve). Todo lo de Voices Cloning, el proveedor de voz de Sloth (`licencias/src/voz.ts`):
 * el saldo general de Sloth, cada usuario con su correo y su plan, sus créditos y lo que gasta, el consumo que da Voices
 * Cloning, el registro de cada llamada que pasó por el cobro (con sus errores) y el resumen de 30 días. Aquí se suman y
 * quitan créditos, se suspende o reactiva a alguien y se da de alta una cuenta de Sloth por su correo. Lo que responde
 * Voices Cloning se puede ver también tal cual, al final.
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
  pagina: number
  consumo: number
  saldo?: Respuesta
  usuarios?: Respuesta
  uso?: Respuesta
  cuentas: Record<string, Cuenta>
  registro: Registro[]
  resumen: { accion: string; llamadas: number; fallidas: number; letras: number | null; creditos: number | null; usuarios: number; ms: number | null }[]
  errores: { status: number; codigo: string | null; veces: number; ultima: string; error: string | null }[]
}

interface Usuario {
  external_id: string
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

  const usuarios = (Array.isArray(panel?.usuarios?.datos.users) ? panel.usuarios.datos.users : []) as Usuario[]
  const quien = (externo: string) => (externo === CREADOR ? 'Tú (creador)' : (panel?.cuentas[externo]?.email ?? externo))

  return (
    <div className="admin">
      <div className="admin-cabeza">
        <div>
          <span className="admin-antetitulo">Solo en tu computadora</span>
          <h1>Administrador</h1>
          <p>Todo lo de Voices Cloning, el proveedor de voz de Sloth: tu saldo general, quién gasta cuánto, cada llamada que pasa por el cobro y sus errores. La llave del socio vive en el cobro; ninguna app la ve.</p>
        </div>
        <button className="ghost admin-recargar" disabled={cargando} onClick={cargar}>
          <Icono de="recargar" /> {cargando ? 'Leyendo…' : 'Volver a leer'}
        </button>
      </div>

      {error && <p className="bad admin-aviso">{error}</p>}
      {panel && !panel.configurado && (
        <p className="admin-aviso">
          Falta la llave de socio en el cobro. Ponla con <span className="mono">npm run licencias -- secret put VOICES_PK_LIVE</span> (desde Git Bash) y vuelve a leer.
        </p>
      )}

      {panel?.soloCreador && (
        <p className="admin-aviso">
          Por ahora Voices Cloning es <strong>solo para ti</strong>: nadie más lo ve en su Sloth, aunque tenga créditos. Para abrirlo, quita <span className="mono">VOZ_SOLO_CREADOR</span> de <span className="mono">licencias/wrangler.jsonc</span> y despliega el cobro.
        </p>
      )}

      {panel && (
        <>
          <Seccion titulo="Tu cuenta general" fallo={panel.saldo}>
            <Saldo r={panel.saldo} iniciales={panel.creditosIniciales} />
          </Seccion>

          <Seccion titulo="Usuarios" nota="Los créditos de cada quien. Asignarlos no gasta tu saldo: solo lo gasta generar." fallo={panel.usuarios}>
            <Usuarios usuarios={usuarios} cuentas={panel.cuentas} onCambio={cargar} onVer={setDetalle} />
            <Paginas r={panel.usuarios} pagina={panel.pagina} cargando={cargando} onPagina={setPagina} />
          </Seccion>

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

          <Seccion titulo="Movimientos según Voices Cloning" nota="Las recargas de tu saldo y lo que gasta cada usuario, como lo anota Voices Cloning." fallo={panel.uso}>
            <Movimientos r={panel.uso} quien={quien} />
            <Paginas r={panel.uso} pagina={panel.consumo} cargando={cargando} onPagina={setConsumo} />
          </Seccion>

          <Seccion titulo="Cada llamada" nota="Las últimas 300 que pasaron por el cobro: quién, qué, cuánto y cómo respondió.">
            <Llamadas filas={panel.registro} quien={quien} onVer={setDetalle} />
          </Seccion>

          <Seccion titulo="Las respuestas tal cual">
            <Crudo titulo="Saldo (GET /api/partner/v1/balance)" r={panel.saldo} />
            <Crudo titulo="Usuarios (GET /api/partner/v1/users)" r={panel.usuarios} />
            <Crudo titulo="Consumo (GET /api/partner/v1/usage)" r={panel.uso} />
          </Seccion>
        </>
      )}
    </div>
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
  const [d, setD] = useState<{ usuario: Respuesta; registro: Registro[]; cuenta: Cuenta | null }>()
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

/** Los movimientos de `/usage` (`items`: `date`, `kind`, `external_id`, `function`, `credits`); con otra forma, tal cual. */
function Movimientos({ r, quien }: { r?: Respuesta; quien(externo: string): string }) {
  if (!r || r.status >= 400) return null
  const items = r.datos.items
  if (!Array.isArray(items)) return <Generica r={r} />
  if (!items.length) return <p className="muted small admin-vacio">Ningún movimiento.</p>
  return (
    <Tabla
      cabeza={['Cuándo', 'Tipo', 'Usuario', 'Qué', 'Créditos']}
      filas={(items as Datos[]).map((m) => [
        fecha(m.date),
        String(m.kind ?? '—'),
        m.external_id ? quien(String(m.external_id)) : '—',
        String(m.function ?? '—'),
        <strong className={m.kind === 'recarga' ? 'ok' : ''}>{num(m.credits)}</strong>
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

function Tabla({ cabeza, filas }: { cabeza: string[]; filas: ReactNode[][] }) {
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

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('es-MX', { maximumFractionDigits: 2 }) : '—')
const segundos = (ms: unknown) => (typeof ms === 'number' ? `${(ms / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} s` : '—')
function fecha(v: unknown): string {
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
