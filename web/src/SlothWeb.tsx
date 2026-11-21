import { useEffect, useState } from 'react'
import { type CodigoWeb, ENTRADA, type EstadoWeb, verCodigo } from '../../shared/web'
import { api } from './api'
import { Icono } from './Iconos'
import './SlothWeb.css'

/**
 * Opciones → Sloth en la web (ADR 0025, `server/web.ts`): encenderla, conectar un dispositivo (un enlace o un código corto
 * para la entrada) y ver o quitar los que ya entran.
 */

const ENTRADA_CORTA = ENTRADA.replace(/^https:\/\//, '')

function hace(iso: string) {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 2) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  if (min < 48 * 60) return `hace ${Math.floor(min / 60)} h`
  return `hace ${Math.floor(min / 60 / 24)} días`
}

export function SlothWebOpciones() {
  const [e, setE] = useState<EstadoWeb>()
  const [error, setError] = useState('')
  const [codigo, setCodigo] = useState<CodigoWeb | null>(null)
  const [pidiendo, setPidiendo] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const leer = () => api<EstadoWeb>('/api/web').then(setE, (x: Error) => setError(x.message))

  useEffect(() => void leer(), [])
  // Mientras se baja o se abre el túnel, se mira cómo va.
  useEffect(() => {
    if (!e?.encendida || e.estado === 'lista') return
    const t = setInterval(() => void leer(), 1500)
    return () => clearInterval(t)
  }, [e?.encendida, e?.estado])
  // El código vence: se quita al vencer.
  useEffect(() => {
    if (!codigo) return
    const t = setTimeout(() => setCodigo(null), Math.max(0, Date.parse(codigo.vence) - Date.now()))
    return () => clearTimeout(t)
  }, [codigo])

  if (!e)
    return (
      <div className="fila">
        <span className="muted small">{error || 'Mirando…'}</span>
      </div>
    )

  const encender = (encendida: boolean) => {
    if (!encendida && e.desdeLaWeb && !confirm('Estás usando Sloth desde la web: al apagarla, este dispositivo se desconecta. ¿Apagarla?')) return
    setError('')
    setCodigo(null)
    setE({ ...e, encendida, estado: encendida ? 'abriendo' : 'apagada' })
    api<EstadoWeb>('/api/web/encender', { encendida }).then(setE, (x: Error) => (setError(x.message), void leer()))
  }
  const pedirCodigo = async () => {
    setPidiendo(true)
    setError('')
    setCopiado(false)
    try {
      setCodigo(await api<CodigoWeb>('/api/web/codigo', {}))
    } catch (x) {
      setError(x instanceof Error ? x.message : String(x))
    } finally {
      setPidiendo(false)
    }
  }
  const quitar = (id: string, este?: boolean) => {
    if (este && !confirm('Es el dispositivo que estás usando: se desconecta ahora. ¿Quitarlo?')) return
    api<EstadoWeb>('/api/web/quitar', { id }).then(setE, (x: Error) => setError(x.message))
  }
  const copiar = (texto: string) =>
    void navigator.clipboard?.writeText(texto).then(
      () => setCopiado(true),
      () => {}
    )

  const como =
    !e.encendida
      ? 'Apagada: nadie entra desde la web'
      : e.estado === 'bajando'
        ? 'Bajando el programa del túnel de Cloudflare (una sola vez)…'
        : e.estado === 'abriendo'
          ? 'Abriendo el túnel…'
          : e.estado === 'error'
            ? e.error || 'No se pudo abrir el túnel. Se vuelve a intentar solo.'
            : `Lista: entra desde ${ENTRADA_CORTA}`
  return (
    <>
      <div className="item">
        <div className="fila">
          <div className="fila-nombre">
            <strong>{e.desdeLaWeb ? 'Estás usando Sloth desde la web' : 'Usar Sloth desde otro dispositivo'}</strong>
            <span className={e.encendida && e.estado === 'error' ? 'falta' : undefined}>{como}</span>
          </div>
          <label className="con-interruptor">
            Encendida
            <button role="switch" aria-checked={e.encendida} className={`interruptor${e.encendida ? ' on' : ''}`} onClick={() => encender(!e.encendida)}>
              <span />
            </button>
          </label>
        </div>
        {error && (
          <div className="fila-extra">
            <p className="bad small">{error}</p>
          </div>
        )}
      </div>
      {e.encendida && e.estado === 'lista' && (
        <div className="item">
          <div className="fila">
            <div className="fila-nombre">
              <strong>Conectar un dispositivo</strong>
              <span>Tu celular, una tablet u otra computadora. Cada uno se conecta una vez desde aquí; después entra solo.</span>
            </div>
            <button className="ghost small" disabled={pidiendo} onClick={() => void pedirCodigo()}>
              {pidiendo ? 'Un momento…' : codigo ? 'Otro código' : 'Conectar'}
            </button>
          </div>
          {codigo && (
            <div className="fila-extra web-codigo">
              {codigo.cortoListo && (
                <>
                  <p className="small">
                    En el otro dispositivo, abre <strong>{ENTRADA_CORTA}</strong> y escribe:
                  </p>
                  <p className="web-codigo-corto mono">{verCodigo(codigo.corto)}</p>
                </>
              )}
              <p className="small">{codigo.cortoListo ? 'O manda este enlace al otro dispositivo y ábrelo ahí:' : 'Manda este enlace al otro dispositivo y ábrelo ahí:'}</p>
              <div className="web-enlace">
                <input className="mono" readOnly value={codigo.enlace} onFocus={(x) => x.currentTarget.select()} aria-label="Enlace para conectar" />
                <button className="ghost small" onClick={() => copiar(codigo.enlace)}>
                  <Icono de={copiado ? 'palomita' : 'copiar'} /> {copiado ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <p className="small muted">Vale una sola vez y por 10 minutos. Quien lo abra entra a tu Sloth con todos sus permisos: dáselo solo a tus dispositivos.</p>
            </div>
          )}
        </div>
      )}
      {e.dispositivos.map((d) => (
        <div className="item" key={d.id}>
          <div className="fila">
            <div className="fila-nombre">
              <strong>
                {d.nombre}
                {d.este && <span className="muted"> · este</span>}
              </strong>
              <span>
                Entró {hace(d.visto)} · conectado {hace(d.creado)}
              </span>
            </div>
            <button className="ghost small" onClick={() => quitar(d.id, d.este)}>
              Quitar
            </button>
          </div>
        </div>
      ))}
    </>
  )
}
