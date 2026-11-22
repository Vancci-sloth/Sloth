import { useEffect, useMemo, useState } from 'react'
import { encode } from 'uqr'
import type { Celular } from '../../shared/types'
import { api } from './api'
import { Confirm } from './Confirm'
import { Icono } from './Iconos'

const TIPO = { casa: 'Tu red de casa', tailscale: 'Tailscale, también fuera de casa', otra: 'Otra red' } as const

/**
 * Opciones → Tu celular (`server/celular.ts`, ADR 0025): deja entrar a la app de Sloth del celular. Encendido, enseña el
 * QR que la conecta (sus direcciones y la llave) y deja cambiar la llave, que desconecta a los que tenían la de antes.
 */
export function TuCelular() {
  const [c, setC] = useState<Celular>()
  const [error, setError] = useState('')
  const [cambiar, setCambiar] = useState(false)
  const [copiado, setCopiado] = useState(false)
  useEffect(() => void api<Celular>('/api/celular').then(setC, (e) => setError(e.message)), [])

  const pedir = (ruta: string, body: unknown) => {
    setError('')
    return api<Celular>(ruta, body).then(setC, (e) => setError(e.message))
  }
  const copiar = () => {
    if (!c) return
    void navigator.clipboard.writeText(c.enlace).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    })
  }

  return (
    <section className="grupo">
      <div className="grupo-titulo">
        <h2>Tu celular</h2>
        {c && (
          <label className="con-interruptor">
            Dejar entrar al celular
            <button role="switch" aria-checked={c.activo} className={`interruptor${c.activo ? ' on' : ''}`} onClick={() => pedir('/api/celular', { activo: !c.activo })}>
              <span />
            </button>
          </label>
        )}
      </div>
      <div className="panel">
        {!c?.activo ? (
          <div className="item">
            <div className="fila">
              <span className="logo" aria-hidden>
                <Icono de="movil" />
              </span>
              <div className="fila-nombre">
                <strong>Sloth en tu celular</strong>
                <span>{c ? 'Pide videos, sigue a los agentes y guarda lo terminado desde el celular, con la app de Sloth para iPhone y Android.' : error || 'Mirando…'}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="item celular">
            <Qr texto={c.enlace} />
            <div className="celular-texto">
              <strong>Escanea el código con la app de Sloth</strong>
              <ol>
                <li>Abre Sloth en tu celular y toca «Escanear el código».</li>
                <li>Apunta la cámara aquí. Si abres la cámara del celular, el enlace también abre la app.</li>
              </ol>
              {c.error && <p className="bad small">{c.error}</p>}
              {!c.direcciones.length && <p className="bad small">Esta computadora no está en ninguna red: conéctala al Wi-Fi.</p>}
              <ul className="celular-direcciones">
                {c.direcciones.map((d) => (
                  <li key={d.ip}>
                    <span className="mono">{d.url.replace('http://', '')}</span>
                    <span className="muted small">
                      {TIPO[d.tipo]} · {d.red}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="celular-botones">
                <button className="ghost small" onClick={copiar}>
                  <Icono de="copiar" /> {copiado ? 'Copiado' : 'Copiar el enlace'}
                </button>
                <button className="ghost small" onClick={() => setCambiar(true)}>
                  <Icono de="recargar" /> Cambiar la llave
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {c?.activo && error && <p className="bad small fila-extra">{error}</p>}
      <p className="grupo-nota">
        El celular le pide el trabajo a esta computadora, que tiene que estar prendida con Sloth abierta, y los dos en la misma red Wi-Fi (o los dos en Tailscale, para usarlo fuera de casa). Si tu sistema
        pregunta si Sloth puede recibir conexiones, di que sí: en Windows, en redes privadas.
      </p>
      {cambiar && (
        <Confirm title="¿Cambiar la llave?" action="Cambiar" onConfirm={() => pedir('/api/celular/llave', {})} onClose={() => setCambiar(false)}>
          Los celulares que ya estaban conectados se desconectan y tienen que volver a escanear el código. Hazlo si perdiste un celular o compartiste el código sin querer.
        </Confirm>
      )}
    </section>
  )
}

/** El QR, dibujado como un solo trazo: oscuro sobre crema, los colores de Sloth que cualquier cámara lee. */
function Qr({ texto }: { texto: string }) {
  const { d, n } = useMemo(() => {
    const qr = encode(texto, { ecc: 'M', border: 2 })
    let d = ''
    qr.data.forEach((fila, y) => fila.forEach((negro, x) => negro && (d += `M${x} ${y}h1v1h-1z`)))
    return { d, n: qr.size }
  }, [texto])
  return (
    <svg className="celular-qr" viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label="Código para conectar el celular">
      <rect width={n} height={n} fill="var(--text)" />
      <path d={d} fill="var(--bg)" />
    </svg>
  )
}
