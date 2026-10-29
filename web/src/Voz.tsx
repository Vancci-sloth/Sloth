import { useEffect, useState } from 'react'
import type { Card, EstadoVoz } from '../../shared/types'
import { api } from './api'
import { Picker } from './Composer'
import { Logo } from './Logos'

/**
 * La voz de AI Studio en la interfaz (`server/voz/`): conectar la cuenta de Google (Opciones → Voz) y, en el compositor
 * de un video, elegir entre mandar tu voz o que el agente la genere con una voz de AI Studio. Lo elegido va en la línea
 * `Voz:` del primer mensaje (`lineaVoz`, `shared/voz.ts`).
 */

/** El estado de la voz. Mientras esperas en Edge, se vuelve a preguntar cada 2 s. */
export function useVoz() {
  const [estado, setEstado] = useState<EstadoVoz>()
  const [error, setError] = useState<string>()
  const recibir = (p: Promise<EstadoVoz>) => p.then((e) => (setEstado(e), setError(undefined)), (e: Error) => setError(e.message))
  useEffect(() => void recibir(api('/api/voz')), [])
  useEffect(() => {
    if (!estado?.conectando) return
    const t = setInterval(() => void recibir(api('/api/voz')), 2000)
    return () => clearInterval(t)
  }, [estado?.conectando])
  return {
    estado,
    error: error ?? estado?.error,
    conectar: () => void recibir(api('/api/voz/conectar', {})),
    desconectar: () => void recibir(api('/api/voz/desconectar', {}))
  }
}

export type UsoVoz = ReturnType<typeof useVoz>

/** La opción del menú que conecta la cuenta, que no es ninguna voz. */
const CONECTAR = ' conectar'

/**
 * El menú «Voz» del compositor de un video: mandarla tú (o la que hace el estilo, `propia`) o una voz de AI Studio, por
 * grupos como los pone la página. Sin cuenta, ofrece conectarla. `valor`: la voz elegida, vacía si la mandas tú.
 */
export function SelectorVoz({ card, voz, valor, onCambio }: { card: Card; voz: UsoVoz; valor: string; onCambio(voz: string): void }) {
  if (card.voz === false) return null
  const e = voz.estado
  const propia = card.voz?.propia ?? 'La mando yo'
  const grupos = new Map<string, { value: string; label: string }[]>()
  for (const v of e?.voces ?? []) grupos.set(`AI Studio · ${v.grupo}`, [...(grupos.get(`AI Studio · ${v.grupo}`) ?? []), { value: v.nombre, label: `${v.nombre} · ${v.descripcion}` }])
  // Una que ya no sale entre las de la página (se eligió antes) sigue a la vista.
  if (valor && e?.cuenta && !e.voces.some((v) => v.nombre === valor)) grupos.set('AI Studio', [{ value: valor, label: valor }])
  const label = e?.conectando ? 'Voz: entra con Google en Edge…' : valor && e?.cuenta ? `Voz: ${valor} · AI Studio` : `Voz: ${propia.toLowerCase()}`
  return (
    <Picker
      label={label}
      value={e?.cuenta ? valor : ''}
      menuWidth={340}
      disabled={!e || e.conectando}
      groups={[
        { label: 'Voz', options: [{ value: '', label: propia }] },
        ...(e?.cuenta
          ? [...grupos].map(([label, options]) => ({ label, options }))
          : [{ label: 'AI Studio · Gemini 3.8 Flash TTS, gratis', options: [{ value: CONECTAR, label: 'Conectar tu cuenta de Google…' }] }])
      ]}
      onChange={(v) => (v === CONECTAR ? voz.conectar() : onCambio(v))}
    />
  )
}

/** Opciones → Voz: la cuenta de Google con que Sloth genera las voces en AI Studio. */
export function VozOpciones() {
  const voz = useVoz()
  const e = voz.estado
  return (
    <div className="item">
      <div className="fila">
        <Logo de="gemini" />
        <div className="fila-nombre">
          <strong>Google AI Studio</strong>
          <span>
            {e?.cuenta
              ? `Gemini 3.8 Flash TTS · ${e.voces.length} voces en el menú Voz${e.enFila ? ` · generando ${e.enFila}` : ''}`
              : 'Genera la voz de tus videos con Gemini 3.8 Flash TTS, gratis, con tu cuenta de Google. Entras una vez, en Edge.'}
          </span>
        </div>
        {e?.conectando ? (
          <span className="estado moviendo">Entra con Google en la ventana de Edge…</span>
        ) : e?.cuenta ? (
          <Picker
            className="acciones"
            label={<span className="estado">{e.cuenta}</span>}
            value=""
            groups={[{ label: 'Cuenta', options: [{ value: 'conectar', label: 'Volver a conectar' }, { value: 'desconectar', label: 'Desconectar' }] }]}
            onChange={(q) => (q === 'desconectar' ? voz.desconectar() : voz.conectar())}
          />
        ) : (
          e && (
            <button className="primary" onClick={voz.conectar}>
              Conectar con Google
            </button>
          )
        )}
      </div>
      {e?.conectando && <p className="muted small fila-extra">Google no deja entrar desde una app. Al entrar en Edge, la ventana se cierra y la sesión pasa sola a Sloth.</p>}
      {voz.error && !e?.conectando && <p className="bad small fila-extra">{voz.error}</p>}
    </div>
  )
}
