import { type CSSProperties, type KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { DIAS_ACTIVIDAD, fechaActividad, totalTokens, type ActividadDiaria } from '../../shared/actividad-agentes'
import { NOMBRE_AGENTE, PROVEEDORES, type Proveedor } from '../../shared/providers'
import { api } from './api'
import { Desplegable } from './Desplegable'
import { TendenciaActividad } from './TendenciaActividad'
import { Icono } from './Iconos'

/**
 * Opciones → Actividad de los agentes (`server/actividad-agentes.ts`): cuánto trabajó cada uno en los últimos 91 días, de
 * los historiales de tus hilos. Turnos (los que fallaron aparte) o tokens, como tendencia o como calendario, y el
 * detalle del día elegido. Se filtra por modelo; los turnos de antes de que Sloth apuntara el modelo van aparte.
 */

const numero = new Intl.NumberFormat('es')
const fechaLarga = new Intl.DateTimeFormat('es', { dateStyle: 'long' })
const mesCorto = new Intl.DateTimeFormat('es', { month: 'short' })
const DESPLAZAR: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }
const SIN_MODELO = 'sin-modelo'

function fechas() {
  const hoy = new Date()
  return Array.from({ length: DIAS_ACTIVIDAD }, (_, i) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - DIAS_ACTIVIDAD + 1 + i))
}

function resumen(filas: ActividadDiaria[]) {
  return filas.reduce(
    (a, f) => ({
      turnos: a.turnos + f.turnos,
      turnosFallidos: a.turnosFallidos + (f.turnosFallidos ?? 0),
      turnosConTokens: a.turnosConTokens + f.turnosConTokens,
      input: a.input + f.input,
      output: a.output + f.output,
      cacheRead: a.cacheRead + f.cacheRead
    }),
    { turnos: 0, turnosFallidos: 0, turnosConTokens: 0, input: 0, output: 0, cacheRead: 0 }
  )
}

export function ActividadAgentes() {
  const [proveedor, setProveedor] = useState<Proveedor>('claude')
  const [modelo, setModelo] = useState('')
  const [lectura, setLectura] = useState<{ proveedor: Proveedor; datos?: ActividadDiaria[]; error?: string }>()
  useEffect(() => {
    let vigente = true
    setModelo('')
    api<ActividadDiaria[]>(`/api/actividad-agentes?agente=${proveedor}`).then(
      (datos) => vigente && setLectura({ proveedor, datos }),
      (e) => vigente && setLectura({ proveedor, error: e.message })
    )
    return () => {
      vigente = false
    }
  }, [proveedor])

  const { datos, error } = lectura?.proveedor === proveedor ? lectura : {}
  const modelos = [...new Set(datos?.flatMap((f) => (f.modelo ? [f.modelo] : [])))].sort()
  const antiguos = datos?.some((f) => !f.modelo)
  const opciones = [{ value: '', label: 'Todos los modelos' }, ...modelos.map((m) => ({ value: m, label: m.replace(/^[^:]+:/, '') })), ...(antiguos ? [{ value: SIN_MODELO, label: 'Sin modelo apuntado' }] : [])]

  return (
    <section className="panel actividad-agente" aria-label="Actividad de los agentes">
      <div className="actividad-titulo">
        <Desplegable nombre="Agente" valor={proveedor} opciones={PROVEEDORES.map((p) => ({ value: p, label: NOMBRE_AGENTE[p] }))} onCambio={(p) => setProveedor(p as Proveedor)} campo />
        {modelos.length + (antiguos ? 1 : 0) > 1 && <Desplegable nombre="Modelo" valor={modelo} opciones={opciones} onCambio={setModelo} campo />}
        <span>Últimos {DIAS_ACTIVIDAD} días</span>
      </div>
      {error ? <p className="bad" role="alert">{error}</p> : datos ? <Calendario key={`${proveedor}/${modelo}`} datos={datos} modelo={modelo} /> : <p className="muted" role="status">Leyendo la actividad…</p>}
    </section>
  )
}

function Calendario({ datos, modelo }: { datos: ActividadDiaria[]; modelo: string }) {
  const [dia, setDia] = useState<number>()
  const [vista, setVista] = useState<'turnos' | 'tokens' | 'calendario'>('turnos')
  const dias = useMemo(fechas, [])
  const visibles = modelo ? datos.filter((f) => (f.modelo ?? SIN_MODELO) === modelo) : datos
  const porDia = new Map<string, ActividadDiaria[]>()
  for (const fila of visibles) {
    const delDia = porDia.get(fila.fecha)
    if (delDia) delDia.push(fila)
    else porDia.set(fila.fecha, [fila])
  }
  const uso = dias.map((fecha) => resumen(porDia.get(fechaActividad(fecha)) ?? []))
  const ultimo = uso.findLastIndex((u) => u.turnos > 0)
  const elegido = dia ?? (ultimo < 0 ? DIAS_ACTIVIDAD - 1 : ultimo)
  const maximo = Math.max(1, ...uso.map(totalTokens))
  const total = resumen(visibles)
  const detalle = uso[elegido]
  const tokensDe = (campo: 'input' | 'output' | 'cacheRead') => uso.map((u) => (u.turnos && !u.turnosConTokens ? NaN : u[campo]))
  const series =
    vista === 'turnos'
      ? [
          { nombre: 'Bien', color: '--text', valores: uso.map((u) => u.turnos - u.turnosFallidos) },
          { nombre: 'Fallaron', color: '--bad', valores: uso.map((u) => u.turnosFallidos) }
        ]
      : [
          { nombre: 'Entrada', color: '--amber', valores: tokensDe('input') },
          { nombre: 'Salida', color: '--text', valores: tokensDe('output') },
          { nombre: 'Caché', color: '--muted', valores: tokensDe('cacheRead') }
        ]
  const huecos = (dias[0].getDay() + 6) % 7
  const semanas = Math.ceil((huecos + DIAS_ACTIVIDAD) / 7)
  const meses = new Map<number, string>()
  dias.forEach((d, i) => {
    if (i === 0 || d.getDate() === 1) meses.set(Math.floor((huecos + i) / 7), mesCorto.format(d))
  })

  function mover(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const paso = DESPLAZAR[e.key]
    if (paso === undefined) return
    e.preventDefault()
    const siguiente = Math.min(DIAS_ACTIVIDAD - 1, Math.max(0, i + paso))
    setDia(siguiente)
    e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-dia="${siguiente}"]`)?.focus()
  }

  return (
    <>
      <div className="actividad-encabezado">
        <div><span>Tokens apuntados</span><strong>{total.turnosConTokens ? numero.format(totalTokens(total)) : '—'}</strong></div>
        <div><span>Turnos</span><strong>{numero.format(total.turnos)}</strong></div>
        <div><span>Días con trabajo</span><strong>{numero.format(porDia.size)}</strong></div>
      </div>
      {!total.turnos ? (
        <div className="actividad-vacia">
          <Icono de="pulso" />
          <div><strong>Sin actividad</strong><p>Cuando este agente acabe turnos en tus hilos, aquí verás cuánto trabajó y los tokens que dijo.</p></div>
        </div>
      ) : (
        <>
          <div className="actividad-vistas" aria-label="Qué se ve" role="group">
            {([['turnos', 'Turnos'], ['tokens', 'Tokens'], ['calendario', 'Calendario']] as const).map(([id, nombre]) => (
              <button key={id} type="button" aria-pressed={vista === id} onClick={() => setVista(id)}>{nombre}</button>
            ))}
          </div>
          <div className={`actividad-contenido${vista === 'calendario' ? '' : ' actividad-contenido-tendencia'}`}>
            {vista !== 'calendario' ? (
              vista === 'tokens' && !total.turnosConTokens ? (
                <p className="actividad-vacia muted">Este agente acabó turnos, pero en estos días no dijo cuántos tokens gastó.</p>
              ) : (
                <TendenciaActividad key={vista} series={series} dias={dias} elegido={elegido} onElegir={setDia} />
              )
            ) : (
              <div className="actividad-scroll" style={{ '--semanas': semanas } as CSSProperties}>
                <div className="actividad-meses" aria-hidden="true">
                  {Array.from({ length: semanas }, (_, i) => <span key={i}>{meses.get(i)}</span>)}
                </div>
                <div className="actividad-calendario" role="group" aria-label="Actividad de cada día. Las flechas cambian de día.">
                  {Array.from({ length: huecos }, (_, i) => <span key={i} />)}
                  {uso.map((u, i) => {
                    const tokens = totalTokens(u)
                    const intensidad = tokens ? 20 + Math.round(Math.sqrt(tokens / maximo) * 75) : 0
                    const cantidad = u.turnosConTokens ? `${numero.format(tokens)} tokens` : u.turnos ? 'sin datos de tokens' : 'sin turnos'
                    const etiqueta = `${fechaLarga.format(dias[i])}: ${cantidad}`
                    return (
                      <button key={fechaActividad(dias[i])} data-dia={i} type="button" title={etiqueta} aria-label={etiqueta} className={u.turnos ? 'con-turnos' : undefined} aria-pressed={elegido === i} tabIndex={elegido === i ? 0 : -1} style={{ '--intensidad': `${intensidad}%` } as CSSProperties} onClick={() => setDia(i)} onKeyDown={(e) => mover(e, i)} />
                    )
                  })}
                </div>
                {total.turnosConTokens > 0 && (
                  <div className="actividad-leyenda" aria-hidden="true">
                    Menos
                    {[0, 25, 50, 75, 95].map((n) => <span key={n} style={{ '--intensidad': `${n}%` } as CSSProperties} />)} Más
                  </div>
                )}
              </div>
            )}
            <div className="actividad-detalle" aria-live="polite">
              <span>El día</span>
              <strong>{fechaLarga.format(dias[elegido])}</strong>
              {detalle.turnos > 0 && <span>{numero.format(detalle.turnos - detalle.turnosFallidos)} bien · {numero.format(detalle.turnosFallidos)} fallaron</span>}
              {detalle.turnosConTokens ? (
                <>
                  <div className="actividad-barras" key={`${modelo}/${elegido}`} aria-label="Tokens del día">
                    {(['input', 'cacheRead', 'output'] as const).map((campo) => <span key={campo} className={campo} style={{ flexGrow: detalle[campo] }} />)}
                  </div>
                  <dl>
                    <div><dt>Entrada</dt><dd>{numero.format(detalle.input)}</dd></div>
                    <div><dt>Caché</dt><dd>{numero.format(detalle.cacheRead)}</dd></div>
                    <div><dt>Salida</dt><dd>{numero.format(detalle.output)}</dd></div>
                  </dl>
                  {detalle.turnosConTokens < detalle.turnos && <span>Algunos turnos no dijeron sus tokens.</span>}
                </>
              ) : (
                <span>{detalle.turnos ? 'Ese día el agente no dijo sus tokens.' : 'Sin turnos ese día.'}</span>
              )}
            </div>
          </div>
          {total.turnosConTokens < total.turnos && <p className="muted small">{numero.format(total.turnosConTokens)} de {numero.format(total.turnos)} turnos dijeron sus tokens.</p>}
        </>
      )}
    </>
  )
}
