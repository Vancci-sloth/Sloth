import { useEffect, useState, type ReactNode } from 'react'
import { Icono } from './Iconos'
import { CuentaChatGPT, CuentaClaude, CuentaOpenCode, Requisitos } from './Opciones'
import './Bienvenida.css'

const VISTA = 'bienvenida'
const EVENTO = 'sloth-bienvenida'

/** Opciones la vuelve a abrir. */
export const abrirBienvenida = () => dispatchEvent(new Event(EVENTO))

/**
 * La bienvenida: sale la primera vez que se abre Sloth y luego desde Opciones. Dice qué hace, qué hace falta (con lo
 * que falta a la vista, para hacerlo ahí mismo), cómo va un video, cuánto tarda y qué cuesta.
 */
export function Bienvenida() {
  const [abierta, setAbierta] = useState(() => !localStorage.getItem(VISTA))
  const [claude, setClaude] = useState<boolean>()
  const [chatgpt, setChatgpt] = useState<boolean>()
  const [opencode, setOpencode] = useState<boolean>()
  const [listo, setListo] = useState<boolean>()
  // En la app instalada en Windows: si Sloth está anclada a la barra de tareas. `null`, aquí no se ofrece.
  const [anclada, setAnclada] = useState<boolean | null>(null)
  const [anclando, setAnclando] = useState(false)
  const [sinPermiso, setSinPermiso] = useState(false)

  useEffect(() => {
    const abrir = () => setAbierta(true)
    addEventListener(EVENTO, abrir)
    return () => removeEventListener(EVENTO, abrir)
  }, [])
  useEffect(() => {
    if (abierta) void window.sloth?.anclada().then(setAnclada, () => {})
  }, [abierta])
  useEffect(() => {
    if (!abierta) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cerrar()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [abierta])

  /** Windows pregunta en su ventana; si no deja pedirlo, se dice cómo hacerlo a mano. */
  async function anclar() {
    setAnclando(true)
    const r = await window.sloth!.anclar().catch(() => 'windows' as const)
    setAnclando(false)
    if (r === 'anclada') setAnclada(true)
    setSinPermiso(r === 'windows')
  }

  function cerrar() {
    localStorage.setItem(VISTA, '1')
    setAbierta(false)
  }

  if (!abierta) return null
  return (
    <div className="modal-backdrop" onClick={cerrar}>
      <div className="modal bienvenida" role="dialog" aria-modal aria-label="Bienvenida" onClick={(e) => e.stopPropagation()}>
        <header>
          <img src="/icon.svg" alt="" />
          <div>
            <h2>Te damos la bienvenida a Sloth</h2>
            <p>
              Sloth hace videos con Claude, con ChatGPT o, gratis, con OpenCode. Eliges un estilo, le das un tema o un enlace, y lo
              ves trabajar paso a paso: investiga, escribe el guion, te pide tu voz y arma el video.
            </p>
          </div>
        </header>

        {/* Con uno basta. Con ChatGPT, además, hace las imágenes de los videos. */}
        <Paso n={1} titulo="Elige con qué trabaja: Claude, ChatGPT u OpenCode" hecho={claude || chatgpt || opencode}>
          <b>Claude y ChatGPT necesitan un plan de pago</b>: Claude Pro o Max, o ChatGPT Plus o Pro (o una llave de API, que
          se paga por uso). Sloth no te cobra aparte, y con ellos salen los mejores videos; con ChatGPT, además, hace las
          imágenes: portadas y personajes. <b>OpenCode es gratis</b> y no pide cuenta: usa solo sus modelos gratis, que pueden
          equivocarse más y a veces se saturan. Cada uno se descarga al elegirlo.
          <CuentaClaude onFalta={(falta) => setClaude(falta === undefined ? undefined : !falta)} />
          <CuentaChatGPT onFalta={(falta) => setChatgpt(falta === undefined ? undefined : !falta)} />
          <CuentaOpenCode aviso onFalta={(falta) => setOpencode(falta === undefined ? undefined : !falta)} />
        </Paso>
        <Paso n={2} titulo="Prepara tu computadora" hecho={listo}>
          Los estilos usan unas herramientas (FFmpeg, Python…). Si falta alguna, aquí sale el botón para descargarla; tarda unos
          minutos y solo se hace una vez.
          <Requisitos onListo={setListo} />
        </Paso>
        {anclada !== null && (
          <Paso n={3} titulo="Ten Sloth a mano (opcional)" hecho={anclada}>
            {anclada ? 'Sloth está anclada a la barra de tareas.' : 'Ánclala a la barra de tareas para abrirla con un clic.'}
            {!anclada && (
              <div className="anclar">
                <button className="boton" disabled={anclando} onClick={() => void anclar()}>
                  {anclando ? 'Windows te pregunta…' : 'Anclar a la barra de tareas'}
                </button>
                {sinPermiso && (
                  <p className="small">
                    Windows no dejó anclarla desde aquí. Haz clic derecho en el icono de Sloth en la barra de tareas y elige
                    «Anclar a la barra de tareas».
                  </p>
                )}
              </div>
            )}
          </Paso>
        )}
        <Paso n={anclada === null ? 3 : 4} titulo="Haz tu primer video">
          Elige un estilo, escribe el tema o pega un enlace y pulsa <b>↑</b>. Cuando el guion está listo, Sloth te pide tu voz:
          grábalo con el celular y súbelo en la etapa «Tu voz». Luego arma el video y lo revisa. El Diff tarda de una a dos
          horas; el Video explicativo, unos 40 minutos. Cuando acaba, lo descargas desde el video o en «Mis videos».
        </Paso>
        <Paso n={anclada === null ? 4 : 5} titulo="Lo que gasta">
          Cada video usa una parte de los límites de tu plan, que ves en Opciones. Las cifras en dólares que salen en cada
          video dicen cuánto costaría pagado aparte, no lo que se te cobra. Un video gasta bastante: con el plan Pro el límite
          se acaba pronto, y con Max alcanza para varios. Con una llave de API no hay límites: esas cifras son lo que pagas.
          Con OpenCode no pagas nada, pero sus modelos gratis a veces se saturan: entonces toca esperar unos minutos.
        </Paso>

        <div className="modal-actions">
          <span className="muted small">La vuelves a ver en Opciones.</span>
          <button className="primary" autoFocus onClick={cerrar}>
            Empezar
          </button>
        </div>
      </div>
    </div>
  )
}

/** Un paso, con su número o, si ya está hecho, una palomita. */
function Paso({ n, titulo, hecho, children }: { n: number; titulo: string; hecho?: boolean; children: ReactNode }) {
  return (
    <section className={`paso${hecho ? ' hecho' : ''}`}>
      <span className="paso-n">{hecho ? <Icono de="palomita" /> : n}</span>
      <div className="paso-cuerpo">
        <strong>{titulo}</strong>
        <div className="paso-texto">{children}</div>
      </div>
    </section>
  )
}
