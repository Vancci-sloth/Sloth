import { useEffect, useRef, useState } from 'react'
import { Icono } from './Iconos'

/** Mantiene un borrador editable y muestra la transcripción parcial sin duplicarla cuando llega el texto final. */
export function useDictadoEnCampo(maximo: number) {
  const [texto, setTexto] = useState('')
  const [parcial, setParcial] = useState('')
  const [activo, setActivo] = useState(false)
  const unir = (base: string, parte: string) => [base.trimEnd(), parte.trim()].filter(Boolean).join(' ').slice(0, maximo)
  return {
    texto, setTexto, activo, visible: parcial ? unir(texto, parcial) : texto,
    eventos: {
      onActivo: setActivo,
      onFin: () => setParcial(''),
      onTexto: (parte: string, final: boolean) => {
        if (final) {
          setTexto((base) => unir(base, parte))
          setParcial('')
        } else setParcial(parte)
      }
    }
  }
}

/** Graba solo por petición del usuario; inserta el texto para revisarlo antes de enviar. */
export function Dictado({ onTexto, onFin, onActivo }: { onTexto(texto: string, final: boolean): void; onFin(): void; onActivo?(activo: boolean): void }) {
  const [estado, setEstado] = useState<'quieto' | 'preparando' | 'grabando' | 'transcribiendo'>('quieto')
  const [error, setError] = useState('')
  useEffect(() => { onActivo?.(estado !== 'quieto') }, [estado, onActivo])
  const textoActual = useRef(onTexto)
  textoActual.current = onTexto
  const finActual = useRef(onFin)
  finActual.current = onFin
  const conexion = useRef<WebSocket | null>(null)
  const recursos = useRef<{ grabador?: MediaRecorder; stream?: MediaStream; timer?: ReturnType<typeof setTimeout>; peticion?: AbortController; vivo: boolean }>({ vivo: true })
  const pendiente = useRef(false)
  const ondas = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (estado !== 'grabando' || !recursos.current.stream) return
    const contexto = new AudioContext()
    const fuente = contexto.createMediaStreamSource(recursos.current.stream)
    const analizador = contexto.createAnalyser()
    analizador.fftSize = 256
    fuente.connect(analizador)
    // No se conecta a destination: medir no reproduce la propia voz ni causa eco.
    void contexto.resume().catch(() => {})
    const muestras = new Float32Array(analizador.fftSize)
    const barras = Array.from(ondas.current?.children ?? []) as HTMLElement[]
    const reducido = matchMedia('(prefers-reduced-motion: reduce)')
    let nivel = 0
    const timer = setInterval(() => {
      if (document.hidden) return
      analizador.getFloatTimeDomainData(muestras)
      const rms = Math.sqrt(muestras.reduce((s, v) => s + v * v, 0) / muestras.length)
      const objetivo = Math.min(1, Math.max(0, (rms - .008) * 12))
      nivel += (objetivo - nivel) * (objetivo > nivel ? .8 : .35)
      barras.forEach((barra, i) => {
        const peso = [0.55, 0.8, 1, 0.8, 0.55][i]
        barra.style.transform = `scaleY(${.14 + (reducido.matches ? (nivel > .1 ? .5 : 0) : nivel * peso) * .86})`
      })
    }, 66)
    return () => {
      clearInterval(timer)
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
      clearTimeout(r.timer)
      r.peticion?.abort()
      conexion.current?.close()
      if (r.grabador?.state === 'recording') r.grabador.stop()
      r.stream?.getTracks().forEach(t => t.stop())
    }
  }, [])
  async function iniciar() {
    if (pendiente.current) return
    pendiente.current = true
    setError('')
    setEstado('preparando')
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Tu navegador no permite grabar audio.')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const r = recursos.current
      if (!r.vivo) { stream.getTracks().forEach(t => t.stop()); return }
      r.stream = stream
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t))
      const grabador = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      r.grabador = grabador
      const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/dictado/vivo`)
      conexion.current = socket
      let cierreEsperado = false
      let envio = Promise.resolve()
      const terminar = () => {
        clearTimeout(r.timer)
        stream.getTracks().forEach(t => t.stop())
        if (grabador.state === 'recording') grabador.stop()
        if (r.vivo) { setEstado('quieto'); finActual.current() }
      }
      socket.onmessage = e => {
        if (!r.vivo) return
        try {
          const dato = JSON.parse(e.data)
          if (dato.error) { setError(dato.error); cierreEsperado = true; terminar(); socket.close(); return }
          if (dato.tipo === 'listo' && grabador.state === 'inactive') {
            grabador.start(250)
            setEstado('grabando')
            clearTimeout(r.timer)
            r.timer = setTimeout(() => { if (grabador.state === 'recording') grabador.stop() }, 60_000)
          }
          if (dato.tipo === 'texto') {
            if (typeof dato.texto === 'string') textoActual.current(dato.texto, !!dato.final)
          }
          if (dato.tipo === 'fin') { cierreEsperado = true; terminar() }
        } catch { setError('No se pudo leer la transcripción.'); terminar(); socket.close() }
      }
      socket.onclose = () => {
        if (r.vivo && !cierreEsperado) setError('Se cerró la conexión de dictado. Reinicia el backend si acabas de actualizarlo.')
        terminar()
      }
      socket.onerror = () => { if (r.vivo) setError('No se pudo conectar el dictado en vivo. Revisa el backend.'); terminar(); socket.close() }
      grabador.ondataavailable = e => {
        if (!e.data.size) return
        envio = envio.then(async () => {
          const audio = await e.data.arrayBuffer()
          if (socket.readyState === WebSocket.OPEN) socket.send(audio)
        }).catch(() => { socket.close() })
      }
      grabador.onstop = () => {
        clearTimeout(r.timer)
        stream.getTracks().forEach(t => t.stop())
        if (!r.vivo) return
        if (socket.readyState !== WebSocket.OPEN) return
        setEstado('transcribiendo')
        void envio.then(() => { if (socket.readyState === WebSocket.OPEN) socket.send('fin') })
        r.timer = setTimeout(() => { cierreEsperado = true; terminar(); socket.close() }, 8000)
      }
      r.timer = setTimeout(() => { if (r.vivo) setError('El dictado tardó demasiado en conectarse.'); terminar(); socket.close() }, 12_000)
    } catch (e) {
      recursos.current.stream?.getTracks().forEach(t => t.stop())
      setEstado('quieto')
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Permite el acceso al micrófono para dictar.' : e instanceof Error ? e.message : 'No se pudo abrir el micrófono.')
    } finally { pendiente.current = false }
  }
  return <div className="dictado">
    <button type="button" className={`dictado-boton ${estado}`} aria-label={estado === 'grabando' ? 'Terminar dictado' : 'Dictar mensaje'} aria-pressed={estado === 'grabando'} disabled={estado === 'transcribiendo' || estado === 'preparando'} title="Dictar mensaje con Deepgram (hasta un minuto)" onClick={() => estado === 'grabando' ? recursos.current.grabador?.stop() : void iniciar()}>
      {estado === 'grabando' ? <span ref={ondas} className="dictado-ondas" aria-hidden="true"><i /><i /><i /><i /><i /></span> : estado === 'transcribiendo' || estado === 'preparando' ? <span className="dictado-giro" aria-hidden="true" /> : <Icono de="microfono" />}
    </button>
    {estado !== 'quieto' && <span role="status">{estado === 'grabando' ? 'Escuchando · pulsa para terminar' : estado === 'preparando' ? 'Abriendo micrófono…' : 'Transcribiendo…'}</span>}
    {error && <span className="bad" role="alert">{error}</span>}
  </div>
}
