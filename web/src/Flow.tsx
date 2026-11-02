import { useEffect, useState } from 'react'
import { IMAGEN_CHATGPT, MODELOS_IMAGEN } from '../../shared/flow'
import type { CuentaClaude, EstadoFlow } from '../../shared/types'
import { api } from './api'
import { Picker } from './Composer'
import { Confirm } from './Confirm'
import { Logo } from './Logos'
import type { UsoVoz } from './Voz'

/**
 * Google Flow en la interfaz (`server/flow/`). En Opciones: usa la cuenta de la voz, y la primera vez hay que abrir Flow y
 * aceptar su aviso, que es de cada quien. «Ayudar a mejorar Flow» sale apagado: cada quien decide si Google usa lo que
 * genera. Quien manda referencias confirma que tiene sus derechos (`AvisoDerechos`). En el compositor de un video, el menú
 * «Imágenes»: con ChatGPT o con un modelo de Flow (`lineaImagenes`, `shared/flow.ts`).
 */

const POLITICA = 'https://policies.google.com/terms/generative-ai/use-policy'

/** Lo que el usuario confirma, en sus palabras: es lo mismo que Flow pide aceptar al subir una imagen. */
function AvisoDerechos({ onHecho, onCerrar }: { onHecho(e: EstadoFlow): void; onCerrar(): void }) {
  return (
    <Confirm title="Derechos de tus imágenes" action="Confirmo" onConfirm={() => api<EstadoFlow>('/api/flow/ajustes', { derechos: true }).then(onHecho)} onClose={onCerrar}>
      Para que el personaje y el estilo salgan iguales, Sloth sube a Google Flow tus imágenes de referencia, y al subirlas acepta en tu nombre lo que Flow pide. Confirma que:
      <ul>
        <li>Tienes los derechos necesarios de las imágenes que mandas, incluido el contenido de menores.</li>
        <li>No generas contenido que infrinja los derechos de otras personas, ni que engañe, hostigue o dañe.</li>
        <li>
          Cumples la{' '}
          <a href={POLITICA} target="_blank" rel="noreferrer">
            Política de Uso Prohibido de Google
          </a>
          .
        </li>
      </ul>
    </Confirm>
  )
}

/** El estado de Flow que comparten el menú y Opciones. */
function useFlow() {
  const [estado, setEstado] = useState<EstadoFlow>()
  const [error, setError] = useState<string>()
  const recibir = (p: Promise<EstadoFlow>) => p.then((n) => (setEstado(n), setError(undefined)), (x: Error) => setError(x.message))
  useEffect(() => void recibir(api('/api/flow')), [])
  return { estado, error, recibir, poner: setEstado }
}

/** La cuenta de ChatGPT de hace poco: mirarla lanza Codex, y el compositor se abre a cada rato. */
let chatgpt: { cuando: number; lectura: Promise<boolean> } | undefined

/** Si hay una cuenta de ChatGPT conectada, de donde sale `codex exec`. */
export function useChatGPT(): boolean {
  const [hay, setHay] = useState(false)
  useEffect(() => {
    if (!chatgpt || Date.now() - chatgpt.cuando > 60_000) chatgpt = { cuando: Date.now(), lectura: api<CuentaClaude>('/api/codex/cuenta').then((c) => c.conectada, () => false) }
    let vivo = true
    void chatgpt.lectura.then((si) => vivo && setHay(si))
    return () => void (vivo = false)
  }, [])
  return hay
}

/** La opción del menú que conecta la cuenta de Google, que no es ningún modelo. */
const CONECTAR = ' conectar'

/** El menú «Imágenes» del compositor de un video. `valor`: lo que se usará (`imagenPosible`); vacío, no hay con qué. */
export function SelectorImagenes({ valor, hayChatGPT, voz, onCambio }: { valor: string; hayChatGPT: boolean; voz: UsoVoz; onCambio(imagen: string): void }) {
  const flow = useFlow()
  // Con un modelo de Flow elegido o puesto solo, sin confirmar los derechos, las referencias no se pueden mandar.
  const [pidiendo, setPidiendo] = useState<string | null>(null)
  const cuenta = voz.estado?.cuenta
  const falta = !!valor && valor !== IMAGEN_CHATGPT && flow.estado?.derechos === false
  const label = voz.estado?.conectando ? `Imágenes: entra con Google en ${voz.estado.navegador}…` : valor === IMAGEN_CHATGPT ? 'Imágenes: ChatGPT' : valor ? `Imágenes: ${valor}` : 'Imágenes: sin generar'
  return (
    <>
      <Picker
        label={label}
        value={valor}
        menuWidth={300}
        disabled={!voz.estado || voz.estado.conectando}
        groups={[
          ...(hayChatGPT ? [{ label: 'ChatGPT', options: [{ value: IMAGEN_CHATGPT, label: 'ChatGPT' }] }] : []),
          { label: 'Google Flow · gratis', options: cuenta ? MODELOS_IMAGEN.map((m) => ({ value: m, label: m })) : [{ value: CONECTAR, label: 'Conectar tu cuenta de Google…' }] }
        ]}
        onChange={(v) => {
          if (v === CONECTAR) voz.conectar()
          else if (v !== IMAGEN_CHATGPT && flow.estado?.derechos === false) setPidiendo(v)
          else onCambio(v)
        }}
      />
      {falta && (
        <button className="picker-trigger" title="Para mandar referencias a Google Flow" onClick={() => setPidiendo(valor)}>
          Confirmar derechos
        </button>
      )}
      {pidiendo !== null && (
        <AvisoDerechos
          onHecho={(e) => {
            flow.poner(e)
            onCambio(pidiendo)
          }}
          onCerrar={() => setPidiendo(null)}
        />
      )}
    </>
  )
}

export function FlowOpciones() {
  const { estado: e, error, recibir, poner } = useFlow()
  const [pidiendo, setPidiendo] = useState(false)
  return (
    <div className="item">
      <div className="fila">
        <Logo de="gemini" />
        <div className="fila-nombre">
          <strong>Google Flow</strong>
          <span>{e?.cuenta ? `Veo y Nano Banana con ${e.cuenta}${e.enFila ? ` · generando ${e.enFila}` : ''}` : 'Conecta arriba tu cuenta de Google: Flow usa la misma.'}</span>
        </div>
        {e?.cuenta && (
          <button onClick={() => void recibir(api('/api/flow/abrir', {}))}>
            Abrir Flow
          </button>
        )}
      </div>
      {e && (
        <div className="fila-extra">
          <label className="con-interruptor">
            Ayudar a mejorar Flow
            <button role="switch" aria-checked={e.aportar} className={`interruptor${e.aportar ? ' on' : ''}`} onClick={() => void recibir(api('/api/flow/ajustes', { aportar: !e.aportar }))}>
              <span />
            </button>
          </label>
          <p className="muted small">
            Encendido, Google usa lo que generes para mejorar sus productos y su IA, y sus revisores pueden verlo. Se aplica en tu siguiente pedido. La primera vez, abre Flow y acepta su aviso.
          </p>
          <label className="con-interruptor">
            Tengo los derechos de las imágenes que mando
            <button
              role="switch"
              aria-checked={e.derechos}
              className={`interruptor${e.derechos ? ' on' : ''}`}
              onClick={() => (e.derechos ? void recibir(api('/api/flow/ajustes', { derechos: false })) : setPidiendo(true))}
            >
              <span />
            </button>
          </label>
          <p className="muted small">Sin esto, Flow solo recibe texto: no puede repetir tu personaje ni seguir el estilo de tu video.</p>
        </div>
      )}
      {pidiendo && <AvisoDerechos onHecho={poner} onCerrar={() => setPidiendo(false)} />}
      {error && <p className="bad small fila-extra">{error}</p>}
    </div>
  )
}
