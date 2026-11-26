import { useEffect, useState } from 'react'
import type { ActualizacionSloth, AgentesAlDia } from '../../shared/types'
import { api } from './api'
import { Confirm } from './Confirm'
import { Icono } from './Iconos'

/**
 * Mientras baja, cada cuánto se pregunta cómo va; si no, cada cuánto se mira si la ventana ya sabe de una versión nueva
 * (pregunta solo a electron/main.ts, que la busca en el cobro: una liberada en un live se ve en minutos).
 */
const BAJANDO = 1000
const CADA = 60_000

/**
 * Abajo de la barra lateral de la app que se vende: si hay una versión nueva de VyMotion, el botón que la pone. Lo sabe la
 * ventana de VyMotion (electron/main.ts): al confirmar baja solo lo que cambió, cierra VyMotion y la vuelve a abrir actualizada.
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
        {a.avance === 1 ? 'Poniendo la versión nueva…' : a.sinRed ? `Sin internet: VyMotion ${a.nueva} sigue bajando cuando vuelva` : `Bajando VyMotion ${a.nueva}… ${Math.round(a.avance! * 100)} %`}
      </span>
    )
  return (
    <>
      <button className="aviso-sloth" title={a.novedad ?? `Actualizar a VyMotion ${a.nueva}`} onClick={() => setPreguntar(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
        Actualizar a VyMotion {a.nueva}
      </button>
      {a.error && <span className="bad small">{a.error}</span>}
      {preguntar && (
        <Confirm title={`¿Actualizar a VyMotion ${a.nueva}?`} action={a.aMano ? 'Descargar' : 'Actualizar'} onConfirm={() => sloth.actualizar().then(setA)} onClose={() => setPreguntar(false)}>
          {a.aMano
            ? 'Se baja en tu navegador. Cierra VyMotion y arrastra la nueva a Aplicaciones, encima de esta: tus videos y tus hilos se quedan.'
            : 'Se baja solo lo que cambió desde tu versión. Después VyMotion se cierra y se vuelve a abrir ya actualizada: se detiene lo que esté haciendo, y tus videos y tus hilos se quedan.'}
        </Confirm>
      )}
    </>
  )
}

/** «Claude Code», «Claude Code y Codex», «Claude Code, Codex y OpenCode». */
const juntar = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : xs[0])

/**
 * En Opciones: si Claude Code, Codex u OpenCode tienen una versión compatible más nueva
 * (`server/agentes.ts`), aparece el botón para instalarla. Los hilos abiertos siguen con la de antes; los
 * nuevos van con la nueva. Mientras baja, en cuál va.
 */
export function AvisoAgentes() {
  const [a, setA] = useState<AgentesAlDia>()
  const [preguntar, setPreguntar] = useState(false)
  const [falloConsulta, setFalloConsulta] = useState(false)
  const actualizando = !!a?.actualizando
  useEffect(() => {
    let vigente = true
    let espera: ReturnType<typeof setTimeout>
    async function leer() {
      try {
        const estado = await api<AgentesAlDia>('/api/agentes/al-dia')
        if (vigente) {
          setA(estado)
          setFalloConsulta(false)
        }
      } catch {
        if (vigente) setFalloConsulta(true)
      } finally {
        if (vigente) espera = setTimeout(leer, actualizando ? 2000 : CADA)
      }
    }
    void leer()
    return () => {
      vigente = false
      clearTimeout(espera)
    }
  }, [actualizando])

  const nuevos = a?.nuevos ?? []
  const nombres = nuevos.map((n) => n.nombre)
  const titulo = nombres.length === 1 ? `Actualizar ${nombres[0]}` : 'Actualizar los agentes'
  return (
    <>
      <div className="item">
        <div className="fila">
          <span className="logo" aria-hidden><Icono de="descargar" /></span>
          <div className="fila-nombre">
            <strong>Claude Code, Codex y OpenCode</strong>
            <span role="status">{a?.actualizando ?? (falloConsulta ? 'No se pudo consultar el estado.' : !a ? 'Buscando actualizaciones…' : nuevos.length ? nuevos.map((n) => `${n.nombre} ${n.de} → ${n.a}`).join(' · ') : 'Sin actualizaciones disponibles.')}</span>
          </div>
          {!actualizando && !falloConsulta && nuevos.length > 0 && (
            <button className="boton" onClick={() => setPreguntar(true)}>{titulo}</button>
          )}
        </div>
        {a?.error && <p className="bad small fila-extra">{a.error}</p>}
      </div>
      {preguntar && nuevos.length > 0 && !actualizando && (
        <Confirm title={`¿${titulo}?`} action="Actualizar" onConfirm={() => api<AgentesAlDia>('/api/agentes/actualizar', {}).then(setA)} onClose={() => setPreguntar(false)}>
          Se baja la versión nueva de {juntar(nuevos.map((n) => `${n.nombre} (${n.de} → ${n.a}, unos ${n.pesa})`))}. Puedes seguir
          trabajando: los chats abiertos siguen con la de antes, y los nuevos ya van con la nueva.
        </Confirm>
      )}
    </>
  )
}
