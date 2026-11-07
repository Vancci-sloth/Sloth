import { useEffect, useState } from 'react'
import type { OpcionNavegador, PreferenciaNavegador } from '../../shared/types'
import { api } from './api'
import { Icono } from './Iconos'
import { Segmento } from './Segmento'

/**
 * Opciones → Navegador (`server/navegador-sistema.ts`): en qué navegador instalado navega el agente y se abren la voz y
 * las redes. «Automático» deja todo como estaba; Chrome o Edge usan ese, siempre con un perfil de Sloth y nunca el tuyo.
 */
export function NavegadorOpciones() {
  const [e, setE] = useState<OpcionNavegador | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<OpcionNavegador>('/api/navegador?fresco').then(setE, (x) => setError(x.message))
  }, [])

  const cambiar = (preferencia: PreferenciaNavegador) =>
    api<OpcionNavegador>('/api/navegador', { preferencia }).then(
      (n) => (setE(n), setError('')),
      (x) => setError(x.message)
    )

  const nombre = e?.usa === 'chrome' ? 'Google Chrome' : e?.usa === 'edge' ? 'Microsoft Edge' : null
  const instalado = e?.usa === 'chrome' ? e.chrome : e?.usa === 'edge' ? e.edge : (e?.chrome ?? e?.edge)
  return (
    <div className="item">
      <div className="fila">
        <span className="logo" aria-hidden>
          <Icono de="globo" />
        </span>
        <div className="fila-nombre">
          <strong>Navegador</strong>
          <span>{instalado ? <span className="mono">{instalado}</span> : 'No encontré Google Chrome ni Microsoft Edge en esta computadora.'}</span>
        </div>
        {e && e.preferencia !== 'automatico' && (nombre ? <span className="estado">Usa {nombre}</span> : <span className="estado falta">Sin navegador</span>)}
        {e && (
          <Segmento
            label="Navegador"
            valor={e.preferencia}
            onCambio={cambiar}
            opciones={[
              { id: 'automatico', texto: 'Automático', title: 'Como siempre: el agente en la ventana de Sloth; Google, la voz y las redes en Edge (Chrome en Mac)' },
              { id: 'chrome', texto: 'Chrome', title: 'Google Chrome instalado, con un perfil de Sloth', disabled: !e.chrome && e.preferencia !== 'chrome' },
              { id: 'edge', texto: 'Edge', title: 'Microsoft Edge instalado, con un perfil de Sloth', disabled: !e.edge && e.preferencia !== 'edge' }
            ]}
          />
        )}
      </div>
      {e && !e.chrome && (
        <p className="small fila-extra">
          Para usar Chrome, instálalo desde{' '}
          <a href="https://www.google.com/chrome/" target="_blank" rel="noreferrer">
            google.com/chrome
          </a>
          .
        </p>
      )}
      <p className="muted small fila-extra">
        {e?.preferencia === 'automatico'
          ? 'El agente navega en la ventana de Sloth, con su lista de sitios y su confirmación.'
          : 'El agente navega en su propia ventana de ese navegador: Sloth bloquea file:, chrome: y javascript:, cancela las descargas de programas y te pregunta en la página antes de publicar, pagar o borrar; un clic que el agente haga desde un script no lo ve.'}
        {' '}Si cambias de navegador, inicia sesión una vez en él (Voz, Redes).
      </p>
      {error && <p className="small fila-extra">{error}</p>}
    </div>
  )
}
