import { useCallback, useEffect, useState } from 'react'
import type { ParteReparto, RepartoFondo } from '../../shared/types'
import { fecha, num, Tabla } from './Admin'
import { api } from './api'
import { Confirm } from './Confirm'
import { Icono } from './Iconos'
import { dinero } from './Tienda'
import './FondoAdmin.css'

/**
 * El reparto del fondo de la comunidad, en Administrador (`licencias/src/reparto.ts`): de cada periodo, cuánto hay,
 * entre cuántos puntos se reparte y qué le toca a cada quien que participa, con su Binance ID y lo que conviene mirar
 * antes de pagarle (`avisos`). Mientras el periodo corre va en vivo. Cuando termina, «Cerrar el periodo» guarda la foto
 * (antes, revisa las pruebas de cada estilo en la tienda: lo que descartes ya no cuenta); desde ahí cada parte se paga a
 * mano en Binance y se marca aquí con su referencia, que le avisa por correo. Abajo, quienes tienen puntos y no participan.
 */
export function FondoAdmin() {
  const [periodo, setPeriodo] = useState('')
  const [r, setR] = useState<RepartoFondo>()
  const [error, setError] = useState('')
  const [cerrando, setCerrando] = useState(false)

  const cargar = useCallback(
    () =>
      void api<RepartoFondo>(`/api/comunidad/fondo/reparto${periodo ? `?periodo=${periodo}` : ''}`).then(
        (x) => (setR(x), setError('')),
        (e: Error) => setError(e.message)
      ),
    [periodo]
  )
  useEffect(cargar, [cargar])

  const montos = r?.fondo?.montos ?? []
  const porPagar = r?.cerrado ? r.partes.filter((p) => !p.pagado && p.montos.length).length : 0
  return (
    <section className="admin-seccion admin-fondo">
      <p className="muted small">
        La mitad de lo que entra con tarjeta se reparte entre quienes comparten estilos y pusieron su Binance ID, según los puntos de sus estilos. El primer reparto es el 1 de
        enero y junta lo que entra desde el 15 de noviembre (lo cobrado antes no cuenta); después, cada mes. Antes de cerrar un periodo revisa las pruebas de cada estilo en Comunidad → Estilos: al cerrarlo queda fijo.
      </p>
      {error && <p className="bad small">{error}</p>}
      {r && (
        <>
          <div className="admin-fondo-cabeza">
            <label>
              <span className="admin-antetitulo">Periodo</span>
              <select value={r.periodo} onChange={(e) => setPeriodo(e.target.value)}>
                {r.periodos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.mes}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className="admin-antetitulo">{r.cerrado ? `Cerrado el ${fecha(r.cerrado)}` : r.termino ? 'Terminó: ya se puede cerrar' : 'En curso, en vivo'}</span>
              <h3>
                {r.fondo ? (montos.length ? montos.map(dinero).join(' + ') : '$0.00') : 'Stripe no contestó'}
                <span className="muted"> · {num(r.puntos)} {r.puntos === 1 ? 'punto' : 'puntos'} · {num(r.partes.length)} {r.partes.length === 1 ? 'persona' : 'personas'}</span>
              </h3>
              {r.cerrado && <p className="muted small">{porPagar ? `Faltan ${porPagar} por pagar.` : 'Todo pagado.'}</p>}
            </div>
            {!r.cerrado && (
              <button className="primary" disabled={!r.termino || !r.fondo} title={r.termino ? undefined : 'Se cierra cuando el periodo termina, a partir del día 1'} onClick={() => setCerrando(true)}>
                Cerrar el periodo
              </button>
            )}
          </div>

          {r.partes.length ? (
            <Tabla
              clase="admin-fondo-tabla"
              cabeza={['Persona', 'Binance ID', 'Puntos', 'De sus estilos', 'Le toca', r.cerrado ? 'Pago' : 'Antes de pagar']}
              numericas={[2]}
              filas={r.partes.map((p) => [
                <>
                  <strong>{p.miembro.nombre || 'Sin nombre'}</strong>
                  <span className="muted small">{p.correo}</span>
                </>,
                <Copiable texto={p.binance} />,
                num(p.puntos),
                <>
                  {p.estilos.map((e) => (
                    <span key={e.id} className="small">
                      {e.titulo || 'Estilo'}: {num(e.puntos)} · {num(e.personas)} {e.personas === 1 ? 'persona' : 'personas'}
                    </span>
                  ))}
                </>,
                <strong>{p.montos.length ? p.montos.map(dinero).join(' + ') : '$0.00'}</strong>,
                <>
                  {p.avisos.map((a) => (
                    <span key={a} className="bad small">
                      {a}
                    </span>
                  ))}
                  {r.cerrado ? <Pago periodo={r.periodo} parte={p} onCambio={cargar} onError={setError} /> : !p.avisos.length && <span className="muted small">Nada que mirar</span>}
                </>
              ])}
            />
          ) : (
            <p className="muted small">{r.cerrado ? 'Se cerró sin partes: nadie que participe tenía puntos.' : 'Aún nadie que participe tiene puntos en este periodo.'}</p>
          )}

          {r.fuera.length > 0 && (
            <div className="admin-fondo-fuera">
              <span className="admin-antetitulo">Con puntos y sin participar (no pusieron su Binance ID)</span>
              <p className="small">{r.fuera.map((f) => `${f.miembro.nombre || 'Sin nombre'} (${num(f.puntos)})`).join(' · ')}</p>
            </div>
          )}
        </>
      )}
      {cerrando && r && (
        <Confirm
          title={`¿Cerrar ${r.mes}?`}
          action="Cerrar el periodo"
          onClose={() => setCerrando(false)}
          onConfirm={() => api<RepartoFondo>('/api/comunidad/fondo/cerrar', { periodo: r.periodo }).then(setR)}
        >
          Queda fijo lo que le toca a cada quien, con el Binance ID que tiene ahora: lo que descartes o cambie después ya no lo mueve. Luego pagas cada parte en Binance y la
          marcas aquí.
        </Confirm>
      )}
    </section>
  )
}

/** El Binance ID entero, que se copia con un clic para pegarlo en Binance. */
function Copiable({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <button
      className="admin-fondo-copiar"
      title="Copiar"
      onClick={() => void navigator.clipboard.writeText(texto).then(() => (setCopiado(true), setTimeout(() => setCopiado(false), 1500)))}
    >
      {texto} <Icono de={copiado ? 'palomita' : 'copiar'} />
    </button>
  )
}

/** Una parte ya cerrada: marcarla como pagada con su referencia de Binance, o deshacerlo. */
function Pago({ periodo, parte, onCambio, onError }: { periodo: string; parte: ParteReparto; onCambio(): void; onError(e: string): void }) {
  const [referencia, setReferencia] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const marcar = (pagado: boolean) => {
    setOcupado(true)
    api('/api/comunidad/fondo/pagado', { periodo, miembro: parte.miembro.id, pagado, referencia })
      .then(onCambio, (e: Error) => onError(e.message))
      .finally(() => setOcupado(false))
  }
  if (parte.pagado)
    return (
      <span className="small admin-fondo-pagado">
        <Icono de="palomita" /> Pagado el {fecha(parte.pagado)}
        {parte.referencia && ` · ${parte.referencia}`}
        <button className="admin-fondo-deshacer" disabled={ocupado} onClick={() => marcar(false)}>
          Deshacer
        </button>
      </span>
    )
  if (!parte.montos.length) return <span className="muted small">No le toca nada</span>
  return (
    <span className="admin-fondo-pagar">
      <input value={referencia} maxLength={120} placeholder="Referencia de Binance" onChange={(e) => setReferencia(e.target.value)} />
      <button className="admin-boton" disabled={ocupado} title="Le avisa por correo que ya se le mandó" onClick={() => marcar(true)}>
        Marcar pagado
      </button>
    </span>
  )
}
