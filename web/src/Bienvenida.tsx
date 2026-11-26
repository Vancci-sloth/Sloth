import { useEffect, useState, type ReactNode } from 'react'
import { Icono } from './Iconos'
import { Logo } from './Logos'
import { SobreTi } from './SobreTi'
import { AvisoPrimerAgente, Requisitos, useConAgente } from './Opciones'
import type { Model } from '../../shared/types'
import './Bienvenida.css'

const VISTA = 'bienvenida'
const EVENTO = 'sloth-bienvenida'

/** Todos los agentes, según haya que pagar para usarlos. Los del rango gratis no son gratis: su uso gratis tiene límites. */
const OPCIONES = [
  {
    titulo: 'De paga',
    agentes: [
      ['claude', 'Claude'],
      ['codex', 'ChatGPT'],
      ['deepseek', 'DeepSeek'],
      ['gemini', 'Gemini'],
      ['cursor', 'Cursor'],
      ['muse', 'Muse Code'],
      ['pi', 'Pi']
    ]
  },
  {
    titulo: 'Rango gratis',
    nota: 'No son gratis del todo: su uso gratis tiene límites, y esos límites varían.',
    agentes: [
      ['opencode', 'OpenCode'],
      ['antigravity', 'Antigravity'],
      ['grok', 'Grok']
    ]
  }
]

/** Opciones la vuelve a abrir. */
export const abrirBienvenida = () => dispatchEvent(new Event(EVENTO))
/** Si la primera bienvenida aún no se cerró: lo que quiera salir al abrir VyMotion (`EstiloCambio.tsx`) espera a `BIENVENIDA_CERRADA`. */
export const bienvenidaPendiente = () => {
  try {
    return !localStorage.getItem(VISTA)
  } catch {
    return false
  }
}
export const BIENVENIDA_CERRADA = 'sloth-bienvenida-cerrada'

/**
 * La bienvenida: sale la primera vez que se abre VyMotion y luego desde Opciones. Dice qué hace, qué hace falta (con lo
 * que falta a la vista, para hacerlo ahí mismo), deja contar de ti para todos los agentes, cómo va un video, cuánto tarda
 * y qué cuesta.
 */
export function Bienvenida({ models }: { models: Model[] }) {
  const [abierta, setAbierta] = useState(() => !localStorage.getItem(VISTA))
  const conAgente = useConAgente(models, abierta)
  const [listo, setListo] = useState<boolean>()
  // En la app instalada en Windows: si VyMotion está anclada a la barra de tareas. `null`, aquí no se ofrece.
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
    dispatchEvent(new Event(BIENVENIDA_CERRADA))
  }

  if (!abierta) return null
  return (
    <div className="modal-backdrop" onClick={cerrar}>
      <div className="modal bienvenida" role="dialog" aria-modal aria-label="Bienvenida" onClick={(e) => e.stopPropagation()}>
        <header>
          <img src="/icon.svg" alt="" />
          <div>
            <h2>Te damos la bienvenida a VyMotion</h2>
            <p>
              Elige un estilo y dale un tema o un enlace. VyMotion investiga, escribe el guion y arma el video con tu agente.
            </p>
          </div>
        </header>

        <div className="bienvenida-pasos">
          {/* Con uno basta. Sin ninguno, el aviso lleva a Opciones → Agentes, como el del compositor. */}
          <Paso n={1} titulo="Elige con qué trabaja" hecho={conAgente}>
            Con uno basta, y VyMotion no te cobra aparte. Todos se conectan en Opciones → Agentes; Pi usa el plan o la llave que le
            conectes.
            {OPCIONES.map(({ titulo, nota, agentes }) => (
              <div className="opcion" key={titulo}>
                <b>{titulo}</b>
                <div>
                  <ul>
                    {agentes.map(([id, nombre]) => (
                      <li key={id}>
                        <Logo de={id} nombre={nombre} chico />
                        {nombre}
                      </li>
                    ))}
                  </ul>
                  {nota && <p>{nota}</p>}
                </div>
              </div>
            ))}
            {conAgente === false && <AvisoPrimerAgente onIr={cerrar} />}
          </Paso>
          <Paso n={2} titulo="Cuéntale de ti (opcional)">
            Describe tu canal, tu público y cómo prefieres que te hablen. Puedes editarlo en Opciones → Perfil y avisos.
            <SobreTi />
          </Paso>
          <Paso n={3} titulo="Prepara tu computadora" hecho={listo}>
            Descarga las herramientas que falten para crear videos, como FFmpeg y Python.
            <Requisitos onListo={setListo} />
          </Paso>
          {anclada !== null && (
            <Paso n={4} titulo="Ten VyMotion a mano (opcional)" hecho={anclada}>
              {anclada ? 'VyMotion está anclada a la barra de tareas.' : 'Ánclala a la barra de tareas para abrirla con un clic.'}
              {!anclada && (
                <div className="anclar">
                  <button className="boton" disabled={anclando} onClick={() => void anclar()}>
                    {anclando ? 'Windows te pregunta…' : 'Anclar a la barra de tareas'}
                  </button>
                  {sinPermiso && (
                    <p className="small">
                      Windows no dejó anclarla desde aquí. Haz clic derecho en el icono de VyMotion en la barra de tareas y elige
                      «Anclar a la barra de tareas».
                    </p>
                  )}
                </div>
              )}
            </Paso>
          )}
          <Paso n={anclada === null ? 4 : 5} titulo="Haz tu primer video">
            Elige un estilo, escribe el tema o pega un enlace y pulsa <b>↑</b>. Cuando el guion está listo, VyMotion te pide tu voz:
            grábalo con el celular y súbelo en la etapa «Tu voz». Luego arma el video y lo revisa. El Diff tarda de una a dos
            horas; el Video explicativo, unos 40 minutos. Cuando acaba, lo descargas desde el video o en «Mis videos».
          </Paso>
          <Paso n={anclada === null ? 5 : 6} titulo="Lo que gasta">
            Cada video usa una parte de los límites de tu plan, que ves en Opciones. Las cifras en dólares que salen en cada
            video dicen cuánto costaría pagado aparte, no lo que se te cobra. Un video gasta bastante: con el plan Pro el límite
            se acaba pronto, y con Max alcanza para varios. Con una llave de API no hay límites: esas cifras son lo que pagas.
            Con los modelos gratis de OpenCode no pagas nada, pero tu uso gratis tiene un tope, y es de tu computadora: al
            acabarse, vuelve solo en unas horas, y cambiar de cuenta no lo repone. Sus modelos de pago se cobran del saldo de tu
            cuenta de OpenCode.
          </Paso>
        </div>

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
    <details className={`paso${hecho ? ' hecho' : ''}`}>
      <summary>
        <span className="paso-n" aria-label={hecho ? 'Completado' : undefined}>{hecho ? <Icono de="palomita" /> : n}</span>
        <strong>{titulo}</strong>
      </summary>
      <div className="paso-texto">{children}</div>
    </details>
  )
}
