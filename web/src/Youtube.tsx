import { useEffect, useRef, useState } from 'react'
import type { ConexionYoutube } from '../../shared/youtube'
import { api } from './api'
import { Logo } from './Logos'
import { abrirRevisionYoutube } from './youtube-ruta'
import './Youtube.css'

/** YouTube: la conexión OAuth en Opciones y el acceso a la revisión desde Entrega y las galerías. */
export function YoutubeOpciones() {
  const [conexion, setConexion] = useState<ConexionYoutube | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [enlace, setEnlace] = useState('')
  const fichero = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let vivo = true
    const mirar = () => api<ConexionYoutube>('/api/youtube').then((c) => { if (vivo) setConexion(c) }, (e) => { if (vivo) setError(e.message) })
    mirar()
    return () => { vivo = false }
  }, [])
  useEffect(() => {
    if (!conexion?.conectando) return
    let vivo = true
    const t = setInterval(() => api<ConexionYoutube>('/api/youtube').then((c) => { if (vivo) setConexion(c) }, (e) => { if (vivo) setError(e.message) }), 3000)
    return () => { vivo = false; clearInterval(t) }
  }, [conexion?.conectando])
  async function importar(file?: File) {
    if (!file) return
    setError('')
    setOcupado(true)
    try {
      if (file.size > 64_000) throw new Error('El JSON de credenciales es demasiado grande.')
      const cliente = JSON.parse(await file.text())
      setConexion(await api<ConexionYoutube>('/api/youtube/cliente', { cliente }))
      setEnlace('')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setOcupado(false); if (fichero.current) fichero.current.value = '' }
  }
  /** `conSloth`: con la app de Google de Sloth (si apoyas); si no, con la tuya. */
  async function conectar(conSloth: boolean) {
    // Abre la pestaña en el clic para que el navegador no bloquee la autorización como ventana emergente.
    const ventana = window.open('about:blank', '_blank')
    if (ventana) ventana.opener = null
    setOcupado(true)
    setError('')
    try {
      const r = await api<{ url: string }>('/api/youtube/conectar', { sloth: conSloth })
      setEnlace(r.url)
      if (ventana) ventana.location.href = r.url
      setConexion(await api<ConexionYoutube>('/api/youtube'))
    } catch (e) { ventana?.close(); setError(e instanceof Error ? e.message : String(e)) }
    finally { setOcupado(false) }
  }
  async function desconectar() {
    setOcupado(true)
    setError('')
    try { setConexion(await api<ConexionYoutube>('/api/youtube/desconectar', {})); setEnlace('') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setOcupado(false) }
  }
  const conSloth = !!conexion?.sloth?.apoya
  return (
    <div className="item">
      <div className="fila">
        <Logo de="youtube" nombre="YouTube" />
        <div className="fila-nombre">
          <strong>YouTube</strong>
          <span>Revisar y programar videos largos en tu canal</span>
          <button className={`resumen ${abierto ? 'on' : ''}`} onClick={() => setAbierto(!abierto)}>Conexión y ayuda</button>
        </div>
        <span className={`estado ${conexion?.conectando ? 'moviendo' : conexion?.cuenta ? '' : 'apagado'}`}>
          {conexion?.conectando ? 'Esperando a Google…' : conexion?.cuenta?.nombre ?? 'Sin conectar'}
        </span>
        {conexion?.cuenta && (conexion.conSloth || conexion.cliente) ? (
          <button className="boton" disabled={ocupado} onClick={() => conectar(!!conexion.conSloth && (conSloth || !conexion.cliente))}>{conexion.programar ? 'Cambiar canal' : 'Autorizar programación'}</button>
        ) : conSloth ? (
          <button className="primary" disabled={ocupado} onClick={() => conectar(true)}>Conectar canal</button>
        ) : conexion?.cliente ? (
          <button className="boton" disabled={ocupado} onClick={() => conectar(false)}>Conectar canal</button>
        ) : <button className="primary" disabled={ocupado || !conexion} onClick={() => setAbierto(true)}>Configurar</button>}
      </div>
      {conSloth && !conexion?.conSloth && <div className="fila-extra small"><p><Legal /></p></div>}
      {conexion?.conSloth && conexion.sloth && !conexion.sloth.apoya && (
        <p className="fila-extra small">Tu canal está conectado con la app de Sloth, que es para quienes apoyan. Vuelve a apoyar para seguir subiendo, o conéctalo con tu propia app de Google en «Conexión y ayuda».</p>
      )}
      {abierto && (
        <div className="fila-extra">
          {conexion?.sloth && <p>{conexion.sloth.apoya ? 'Con tu apoyo, tu canal se conecta con la app de Sloth, sin estos pasos.' : 'Quienes apoyan a Sloth conectan su canal con la app de Sloth, sin estos pasos.'}</p>}
          {conSloth && conexion?.cuenta && !conexion.conSloth && <div className="opcion-fila"><button className="boton" disabled={ocupado} onClick={() => conectar(true)}>Pasar a la app de Sloth</button></div>}
          <p>{conexion?.sloth ? 'O con tu propia app de Google: es gratis y se hace una sola vez.' : 'Subes con tu propia app de Google: es gratis y se hace una sola vez.'}</p>
          <ol className="youtube-pasos">
            <li>
              En Google Cloud, <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">crea un proyecto</a> (por ejemplo,
              «Sloth») y <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">activa YouTube Data API v3</a>.
            </li>
            <li>
              En <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer">Google Auth Platform</a>, pulsa «Comenzar»: un nombre
              para la app, tu correo y el público «Externo».
            </li>
            <li>
              En <a href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noreferrer">Público</a>, pulsa «Publicar app». Si se queda en
              «Prueba», Google te pide conectar el canal otra vez cada 7 días.
            </li>
            <li>
              En <a href="https://console.cloud.google.com/auth/clients/create" target="_blank" rel="noreferrer">Clientes</a>, crea uno de tipo «App de
              escritorio», descarga su JSON e impórtalo aquí.
            </li>
            <li>
              Pulsa «Conectar canal» y elige tu canal. Google avisa «no ha verificado esta app»: es la tuya, así que entra con «Configuración avanzada» → «Ir a…».
            </li>
          </ol>
          {conexion?.cliente && conexion.conSloth && <div className="opcion-fila"><button className="boton" disabled={ocupado} onClick={() => conectar(false)}>Pasar a mi app</button></div>}
          <div className="opcion-fila">
            <input ref={fichero} type="file" accept=".json,application/json" hidden aria-label="Credenciales OAuth de YouTube" onChange={(e) => importar(e.target.files?.[0])} />
            <button className="boton" disabled={ocupado || conexion?.conectando} onClick={() => fichero.current?.click()}>{conexion?.cliente ? 'Cambiar JSON OAuth' : 'Importar JSON OAuth'}</button>
            {conexion?.cuenta && <button className="ghost" disabled={ocupado} onClick={desconectar}>Desconectar canal</button>}
          </div>
          {conexion?.conectando && enlace && <a href={enlace} target="_blank" rel="noreferrer">Continuar autorización en Google</a>}
        </div>
      )}
      {(error || conexion?.error) && <p className="fila-extra bad small">{error || conexion?.error}</p>}
      {conexion?.cuenta && !conexion.programar && <p className="fila-extra small">Conectaste el canal para subir. Pulsa «Autorizar programación» para poder aplicar miniaturas y fechas a tus publicaciones.</p>}
    </div>
  )
}

/** Lo que las políticas de la API de YouTube piden enseñar antes de conectar el canal con la app de Sloth. */
function Legal() {
  return <>
    Al conectar tu canal con la app de Sloth aceptas los <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">Términos de servicio de YouTube</a>.
    Google trata tus datos según su <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Política de privacidad</a>; lo que hace Sloth con ellos está
    en su <a href="https://sloth.vancci.org/privacidad#youtube" target="_blank" rel="noreferrer">aviso de privacidad</a>.
  </>
}

type VideoYoutube = { cardId: string; ruta: string; titulo: string }

/** Abre la revisión de YouTube (`#/youtube`) solo con este video. */
export function YoutubeBoton({ video, disabled, chico, nombre }: { video: VideoYoutube; disabled?: boolean; chico?: boolean; nombre?: string }) {
  return <button type="button" className={chico ? 'youtube-boton' : 'final-boton'} title={video.ruta} disabled={disabled} onClick={(e) => { e.stopPropagation(); abrirRevisionYoutube(video.cardId, video.ruta) }}>{nombre ? `Revisar ${nombre} para YouTube` : 'Revisar YouTube'}</button>
}
