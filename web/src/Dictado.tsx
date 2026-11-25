import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { Icono } from './Iconos'

/**
 * El micrófono del compositor (`server/dictado.ts`): graba solo al pulsarlo, hasta un minuto, y lo que dices entra al
 * campo para revisarlo antes de mandarlo; nunca lo manda solo. El audio va a Deepgram, y el botón lo dice. Es para quien
 * apoya a Sloth (va por el cobro, con las llaves de Sloth); a los demás el botón no les sale.
 */

/** Si se puede dictar (si apoyas y hay llaves en el cobro). Se pregunta una vez por ventana. */
let disponible: Promise<boolean> | undefined
function useDisponible() {
  const [si, setSi] = useState(false)
  useEffect(() => {
    let vivo = true
    disponible ??= api<{ disponible: boolean }>('/api/dictado').then((r) => r.disponible, () => false)
    void disponible.then((d) => vivo && setSi(d))
    return () => { vivo = false }
  }, [])
  return si
}

/**
 * Para un campo de texto simple (el editor de imágenes): el borrador, lo dicho que aún se corrige (`visible` lo junta) y
 * los eventos para `Dictado`. Lo confirmado entra al borrador sin repetirse.
 */
export function useDictadoEnCampo(maximo: number) {
  const [texto, setTexto] = useState('')
  const [parcial, setParcial] = useState('')
  const [activo, setActivo] = useState(false)
  const unir = (base: string, parte: string) => [base.trimEnd(), parte.trim()].filter(Boolean).join(' ').slice(0, maximo)
  return {
    texto,
    setTexto,
    activo,
    visible: parcial ? unir(texto, parcial) : texto,
    eventos: {
      onActivo: setActivo,
      onFin: () => setParcial(''),
      onTexto: (parte: string, final: boolean) => {
        if (!final) return setParcial(parte)
        setTexto((base) => unir(base, parte))
        setParcial('')
      }
    }
  }
}

type Estado = 'quieto' | 'preparando' | 'grabando' | 'transcribiendo'

export function Dictado({ onTexto, onFin, onActivo }: { onTexto(texto: string, final: boolean): void; onFin(): void; onActivo?(activo: boolean): void }) {
  const puede = useDisponible()
  const [estado, setEstado] = useState<Estado>('quieto')
  const [error, setError] = useState('')
  useEffect(() => { onActivo?.(estado !== 'quieto') }, [estado, onActivo])
  const textoActual = useRef(onTexto)
  textoActual.current = onTexto
  const finActual = useRef(onFin)
  finActual.current = onFin
  const conexion = useRef<WebSocket | null>(null)
  const recursos = useRef<{ grabador?: MediaRecorder; stream?: MediaStream; reloj?: ReturnType<typeof setTimeout>; vivo: boolean }>({ vivo: true })
  const pendiente = useRef(false)
  const ondas = useRef<HTMLSpanElement>(null)

  // Las barritas siguen el volumen de tu voz: se mide sin reproducirla (no va a los altavoces) y 15 veces por segundo.
  useEffect(() => {
    if (estado !== 'grabando' || !recursos.current.stream) return
    const contexto = new AudioContext()
    const fuente = contexto.createMediaStreamSource(recursos.current.stream)
    const analizador = contexto.createAnalyser()
    analizador.fftSize = 256
    fuente.connect(analizador)
    void contexto.resume().catch(() => {})
    const muestras = new Float32Array(analizador.fftSize)
    const barras = Array.from(ondas.current?.children ?? []) as HTMLElement[]
    const reducido = matchMedia('(prefers-reduced-motion: reduce)')
    let nivel = 0
    const reloj = setInterval(() => {
      if (document.hidden) return
      analizador.getFloatTimeDomainData(muestras)
      const rms = Math.sqrt(muestras.reduce((s, v) => s + v * v, 0) / muestras.length)
      const objetivo = Math.min(1, Math.max(0, (rms - 0.008) * 12))
      nivel += (objetivo - nivel) * (objetivo > nivel ? 0.8 : 0.35)
      barras.forEach((barra, i) => {
        const peso = [0.55, 0.8, 1, 0.8, 0.55][i]
        barra.style.transform = `scaleY(${0.14 + (reducido.matches ? (nivel > 0.1 ? 0.5 : 0) : nivel * peso) * 0.86})`
      })
    }, 66)
    return () => {
      clearInterval(reloj)
      fuente.disconnect()
      analizador.disconnect()
      void contexto.close().catch(() => {})
    }
  }, [estado])

  useEffect(() => {
    recursos.current.vivo = true
    return () => {
      const r = recursos.current
      r.vivo = false
      clearTimeout(r.reloj)
      conexion.current?.close()
      if (r.grabador?.state === 'recording') r.grabador.stop()
      r.stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function iniciar() {
    if (pendiente.current) return
    pendiente.current = true
    setError('')
    setEstado('preparando')
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Este navegador no deja grabar audio.')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const r = recursos.current
      if (!r.vivo) return void stream.getTracks().forEach((t) => t.stop())
      r.stream = stream
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t))
      const grabador = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      r.grabador = grabador
      const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/dictado/vivo`)
      conexion.current = socket
      let cierreEsperado = false
      // Los trozos van en orden: cada uno espera al anterior.
      let envio = Promise.resolve()
      const terminar = () => {
        clearTimeout(r.reloj)
        stream.getTracks().forEach((t) => t.stop())
        if (grabador.state === 'recording') grabador.stop()
        if (r.vivo) {
          setEstado('quieto')
          finActual.current()
        }
      }
      socket.onmessage = (e) => {
        if (!r.vivo) return
        try {
          const dato = JSON.parse(e.data)
          if (dato.error) {
            setError(dato.error)
            cierreEsperado = true
            terminar()
            return socket.close()
          }
          if (dato.tipo === 'listo' && grabador.state === 'inactive') {
            grabador.start(250)
            setEstado('grabando')
            clearTimeout(r.reloj)
            r.reloj = setTimeout(() => grabador.state === 'recording' && grabador.stop(), 60_000)
          }
          if (dato.tipo === 'texto' && typeof dato.texto === 'string') textoActual.current(dato.texto, !!dato.final)
          if (dato.tipo === 'fin') {
            cierreEsperado = true
            terminar()
          }
        } catch {
          setError('No se pudo leer lo que contestó el dictado.')
          terminar()
          socket.close()
        }
      }
      socket.onclose = () => {
        if (r.vivo && !cierreEsperado) setError('Se cortó el dictado. Si acabas de actualizar Sloth, reinicia el backend.')
        terminar()
      }
      socket.onerror = () => {
        if (r.vivo) setError('No se pudo conectar el dictado.')
        terminar()
        socket.close()
      }
      grabador.ondataavailable = (e) => {
        if (!e.data.size) return
        envio = envio
          .then(async () => {
            const audio = await e.data.arrayBuffer()
            if (socket.readyState === WebSocket.OPEN) socket.send(audio)
          })
          .catch(() => socket.close())
      }
      grabador.onstop = () => {
        clearTimeout(r.reloj)
        stream.getTracks().forEach((t) => t.stop())
        if (!r.vivo || socket.readyState !== WebSocket.OPEN) return
        setEstado('transcribiendo')
        // El último trozo, y luego «fin»: así llegan las últimas palabras.
        void envio.then(() => socket.readyState === WebSocket.OPEN && socket.send('fin'))
        r.reloj = setTimeout(() => {
          cierreEsperado = true
          terminar()
          socket.close()
        }, 8000)
      }
      r.reloj = setTimeout(() => {
        if (r.vivo) setError('El dictado tardó demasiado en conectarse.')
        terminar()
        socket.close()
      }, 12_000)
    } catch (e) {
      recursos.current.stream?.getTracks().forEach((t) => t.stop())
      setEstado('quieto')
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Deja que Sloth use el micrófono para dictar.' : e instanceof Error ? e.message : 'No se pudo abrir el micrófono.')
    } finally {
      pendiente.current = false
    }
  }

  if (!puede) return null
  const grabando = estado === 'grabando'
  return (
    <div className="dictado">
      {estado !== 'quieto' && <span className="muted small" role="status">{grabando ? 'Escuchando · tu voz va a Deepgram' : estado === 'preparando' ? 'Abriendo el micrófono…' : 'Pasando a texto…'}</span>}
      {error && <span className="bad small" role="alert">{error}</span>}
      <button
        type="button"
        className={`dictado-boton ${estado}`}
        aria-label={grabando ? 'Terminar el dictado' : 'Dictar el mensaje'}
        aria-pressed={grabando}
        disabled={estado === 'transcribiendo' || estado === 'preparando'}
        title={grabando ? 'Terminar el dictado' : 'Dictar (hasta un minuto). Tu voz se manda a Deepgram para pasarla a texto; no se guarda.'}
        onClick={() => (grabando ? recursos.current.grabador?.stop() : void iniciar())}
      >
        {grabando ? (
          <span ref={ondas} className="dictado-ondas" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        ) : estado === 'quieto' ? (
          <Icono de="microfono" />
        ) : (
          <span className="dictado-giro" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}
