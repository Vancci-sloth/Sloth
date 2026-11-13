import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import './SobreTi.css'

/** Como `TOPE_SOBRE_TI` de `server/sobre-ti.ts`. */
const TOPE = 3000

/**
 * «Sobre ti»: lo que cuentas de ti una vez y reciben todos los agentes en cada hilo nuevo (`server/sobre-ti.ts`). Sale en
 * la bienvenida y en Opciones. Se guarda solo, un momento después de dejar de escribir y al salir del campo.
 */
export function SobreTi({ filas = 4 }: { filas?: number }) {
  const [texto, setTexto] = useState<string>()
  const [estado, setEstado] = useState<'' | 'guardando' | 'guardado' | 'error'>('')
  const guardado = useRef('')
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Lo escrito que aún no se manda: si la ventana se cierra antes (Esc, «Empezar»), se manda al cerrarse.
  const pendiente = useRef<string>(undefined)

  useEffect(() => {
    api<{ texto: string }>('/api/sobre-ti').then(
      (r) => {
        guardado.current = r.texto
        setTexto((t) => t ?? r.texto)
      },
      () => setTexto((t) => t ?? '')
    )
    return () => {
      clearTimeout(espera.current)
      if (pendiente.current !== undefined && pendiente.current.trim() !== guardado.current) void api('/api/sobre-ti', { texto: pendiente.current }).catch(() => {})
    }
  }, [])

  async function guardar(valor: string) {
    clearTimeout(espera.current)
    pendiente.current = undefined
    if (valor.trim() === guardado.current) return
    setEstado('guardando')
    try {
      const r = await api<{ texto: string }>('/api/sobre-ti', { texto: valor })
      guardado.current = r.texto
      setEstado('guardado')
    } catch {
      setEstado('error')
    }
  }

  function cambiar(valor: string) {
    setTexto(valor)
    setEstado('')
    pendiente.current = valor
    clearTimeout(espera.current)
    espera.current = setTimeout(() => void guardar(valor), 800)
  }

  return (
    <div className="sobre-ti">
      <textarea
        aria-label="Sobre ti"
        rows={filas}
        maxLength={TOPE}
        value={texto ?? ''}
        disabled={texto === undefined}
        placeholder="Por ejemplo: tengo un canal de finanzas personales para jóvenes de México. Hablo informal y con humor, sin tecnicismos. Mis videos cierran invitando a mi Telegram."
        onChange={(e) => cambiar(e.target.value)}
        onBlur={(e) => void guardar(e.target.value)}
      />
      <span className="sobre-ti-estado small muted" aria-live="polite">
        {estado === 'guardando' ? 'Guardando…' : estado === 'guardado' ? 'Guardado: vale desde el próximo chat.' : estado === 'error' ? 'No se pudo guardar. Intenta otra vez.' : ''}
        {(texto?.length ?? 0) > TOPE - 300 && ` ${texto!.length}/${TOPE}`}
      </span>
    </div>
  )
}
