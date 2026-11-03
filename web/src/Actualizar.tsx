import { useEffect, useState } from 'react'
import type { ActualizacionSloth, AgentesAlDia } from '../../shared/types'
import { api } from './api'
import { Confirm } from './Confirm'

/**
 * Mientras baja, cada cuánto se pregunta cómo va; si no, cada cuánto se mira si la ventana ya sabe de una versión nueva
 * (pregunta solo a electron/main.ts, que la busca en el cobro: una liberada en un live se ve en minutos).
 */
const BAJANDO = 1000
const CADA = 60_000

/**
 * Abajo de la barra lateral de la app que se vende: si hay una versión nueva de Sloth, el botón que la pone. Lo sabe la
 * ventana de Sloth (electron/main.ts): al confirmar baja solo lo que cambió, cierra Sloth y la vuelve a abrir actualizada.
 */
export function ActualizarSloth() {
  const sloth = window.sloth
  const [a, setA] = useState<ActualizacionSloth>()
  const [preguntar, setPreguntar] = useState(false)
  const bajando = a?.avance !== undefined

  useEffect(() => {
    if (!sloth) return
    const mirar = () => void sloth.actualizacion().then(setA, () => {})
    mirar()
    const t = setInterval(mirar, bajando ? BAJANDO : CADA)
    return () => clearInterval(t)
  }, [sloth, bajando])

  if (!sloth || !a?.nueva) return null
  if (bajando)
    return (
      <span className="muted small pie-nota">
        {a.avance === 1 ? 'Poniendo la versión nueva…' : a.sinRed ? `Sin internet: Sloth ${a.nueva} sigue bajando cuando vuelva` : `Bajando Sloth ${a.nueva}… ${Math.round(a.avance! * 100)} %`}
      </span>
    )
  return (
    <>
      <button className="aviso-sloth" title={a.novedad ?? `Actualizar a Sloth ${a.nueva}`} onClick={() => setPreguntar(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
        Actualizar a Sloth {a.nueva}
      </button>
      {a.error && <span className="bad small">{a.error}</span>}
      {preguntar && (
        <Confirm title={`¿Actualizar a Sloth ${a.nueva}?`} action={a.aMano ? 'Descargar' : 'Actualizar'} onConfirm={() => sloth.actualizar().then(setA)} onClose={() => setPreguntar(false)}>
          {a.aMano
            ? 'Se baja en tu navegador. Cierra Sloth y arrastra la nueva a Aplicaciones, encima de esta: tus videos y tus hilos se quedan.'
            : 'Se baja solo lo que cambió desde tu versión. Después Sloth se cierra y se vuelve a abrir ya actualizada: se detiene lo que esté haciendo, y tus videos y tus hilos se quedan.'}
        </Confirm>
      )}
    </>
  )
}

/** «Claude Code», «Claude Code y Codex», «Claude Code, Codex y OpenCode». */
const juntar = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : xs[0])

/**
 * Arriba a la derecha del hilo nuevo: si Claude Code, Codex u OpenCode sacaron una versión más nueva que la que tienes
 * (`server/agentes.ts`), el botón que la baja, con sus modelos nuevos. Los hilos abiertos siguen con la de antes; los
 * nuevos van con la nueva. Mientras baja, en cuál va.
 */
export function AvisoAgentes() {
  const [a, setA] = useState<AgentesAlDia>()
  const [preguntar, setPreguntar] = useState(false)
  const leer = () => api<AgentesAlDia>('/api/agentes/al-dia').then(setA, () => {})
  useEffect(() => void leer(), [])
  const actualizando = !!a?.actualizando
  useEffect(() => {
    if (!actualizando) return
    const id = setInterval(leer, 2000)
    return () => clearInterval(id)
  }, [actualizando])

  if (a?.actualizando) return <span className="aviso-version quieto">{a.actualizando}</span>
  if (!a?.nuevos.length) return a?.error ? <span className="bad small">{a.error}</span> : null
  const nombres = a.nuevos.map((n) => n.nombre)
  const titulo = nombres.length === 1 ? `Actualizar ${nombres[0]}` : 'Actualizar los agentes'
  return (
    <>
      <button className="aviso-version" title={a.nuevos.map((n) => `${n.nombre}: ${n.de} → ${n.a}`).join('\n')} onClick={() => setPreguntar(true)}>
        ↑ {titulo}
      </button>
      {preguntar && (
        <Confirm title={`¿${titulo}?`} action="Actualizar" onConfirm={() => api<AgentesAlDia>('/api/agentes/actualizar', {}).then(setA)} onClose={() => setPreguntar(false)}>
          Se baja la versión nueva de {juntar(a.nuevos.map((n) => `${n.nombre} (${n.de} → ${n.a}, unos ${n.pesa})`))}, con sus modelos nuevos. Puedes seguir
          trabajando: los chats abiertos siguen con la de antes, y los nuevos ya van con la nueva.
          {a.error && <span className="bad small fila-extra">La última vez falló: {a.error}</span>}
        </Confirm>
      )}
    </>
  )
}
