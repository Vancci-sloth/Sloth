import { useEffect, useRef, useState } from 'react'
import { type EstadoAvatar, type FlujoInfo, MOTORES, type MotorAvatar } from '../../shared/avatar'
import { api } from './api'
import { Picker } from './Composer'
import { Logo } from './Logos'
import './Avatar.css'

/**
 * El motor de avatar en la interfaz (`server/avatar/`): el menú «Avatar» del compositor de un video y, en Opciones, el
 * grupo «Avatar» (ComfyUI y sus flujos de labios, y la llave de HeyGen). Lo elegido en el compositor va en la línea
 * `Avatar:` del primer mensaje (`lineaAvatar`, `shared/avatar.ts`). Nada de aquí instala nada ni gasta créditos.
 */

/** El estado del motor. */
export function useAvatar() {
  const [estado, setEstado] = useState<EstadoAvatar>()
  const [error, setError] = useState('')
  const recibir = (p: Promise<EstadoAvatar>) =>
    p.then(
      (e) => (setEstado(e), setError('')),
      (e: Error) => (setError(e.message), Promise.reject(e))
    )
  useEffect(() => void recibir(api<EstadoAvatar>('/api/avatar')).catch(() => {}), [])
  return { estado, error, leer: () => recibir(api<EstadoAvatar>('/api/avatar')), pedir: (ruta: string, datos: unknown) => recibir(api<EstadoAvatar>(ruta, datos)) }
}

export type UsoAvatar = ReturnType<typeof useAvatar>

const CORTO: Record<MotorAvatar, string> = { sprites: 'sprites', 'comfyui-local': 'LatentSync', heygen: 'HeyGen' }

/** El menú «Avatar» del compositor: el motor con su etiqueta Local o Pago. `valor` vacío es sprites. */
export function SelectorAvatar({ avatar, valor, onCambio }: { avatar: UsoAvatar; valor: string; onCambio(motor: string): void }) {
  const e = avatar.estado
  const actual = (MOTORES.find((m) => m.id === valor) ?? MOTORES[0]).id
  return (
    <Picker
      label={`Avatar: ${CORTO[actual]}`}
      value={actual}
      menuWidth={340}
      groups={[
        {
          label: 'Cómo habla el personaje',
          options: MOTORES.map((m) => {
            const listo = e?.motores.find((x) => x.id === m.id)?.listo
            return { value: m.id, label: `${m.nombre} · ${m.etiqueta}${e && listo === false ? ' (falta prepararlo)' : ''}` }
          })
        }
      ]}
      onChange={onCambio}
    />
  )
}

/** Un campo que se guarda con su botón (vacío vuelve al valor de siempre). */
function Campo({ titulo, ayuda, valor, ejemplo, guardar }: { titulo: string; ayuda: string; valor: string; ejemplo: string; guardar(v: string): Promise<unknown> }) {
  const [texto, setTexto] = useState(valor)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => setTexto(valor), [valor])
  return (
    <form className="fila-extra" onSubmit={(ev) => (ev.preventDefault(), setGuardando(true), void guardar(texto.trim()).catch(() => {}).finally(() => setGuardando(false)))}>
      <div className="opcion-fila">
        <input placeholder={ejemplo} value={texto} onChange={(x) => setTexto(x.target.value)} aria-label={titulo} />
        <button className="ghost" disabled={guardando || texto.trim() === valor}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      <p className="av-nota">{ayuda}</p>
    </form>
  )
}

/** Un flujo de labios: listo o qué le falta, de dónde sale y, el que no viene hecho, cómo importarlo. */
function FilaFlujo({ f, uso }: { f: FlujoInfo; uso: UsoAvatar }) {
  const archivo = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const importar = async (file: File | undefined) => {
    if (!file) return
    setMsg('')
    await uso.pedir('/api/avatar/flujo', { id: f.id, json: await file.text() }).then(
      () => setMsg('Flujo importado.'),
      (e: Error) => setMsg(e.message)
    )
  }
  return (
    <div className="item">
      <div className="fila">
        <div className="fila-nombre">
          <strong>
            {f.nombre}
            <span className={`av-etiqueta${f.listo ? ' ok' : ''}`}>{f.listo ? 'Listo' : 'Apagado'}</span>
          </strong>
          <span>{f.listo ? `Video y audio · unos ${f.vramGB} GB de VRAM` : `Falta ${f.falta.join(', ')}.`}</span>
        </div>
        {f.flujo === 'importar' && (
          <div className="av-acciones">
            <button className="ghost small" onClick={() => archivo.current?.click()} title="El flujo exportado de ComfyUI con «Save (API Format)»">
              {f.sinFlujo ? 'Importar flujo' : 'Cambiar flujo'}
            </button>
            <input ref={archivo} type="file" accept=".json,application/json" hidden onChange={(e) => (void importar(e.target.files?.[0]), (e.target.value = ''))} />
          </div>
        )}
      </div>
      <div className="fila-extra">
        <p className="av-nota">
          {f.nota} {f.licencia}{' '}
          <a href={f.fuente} target="_blank" rel="noreferrer">
            Fuente ↗
          </a>
        </p>
        {msg && <p className="muted small">{msg}</p>}
      </div>
    </div>
  )
}

/** La llave de HeyGen: pegarla (se prueba antes, sin gastar) o quitarla. */
function LlaveHeygen({ uso }: { uso: UsoAvatar }) {
  const final = uso.estado?.heygen.llave
  const [pegando, setPegando] = useState(false)
  const [llave, setLlave] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')
  const guardar = (valor: string | null, que: string) => {
    setOcupado(que)
    setError('')
    return uso.pedir('/api/avatar/heygen/llave', { llave: valor }).then(
      () => (setPegando(false), setLlave('')),
      (x: Error) => setError(x.message)
    ).finally(() => setOcupado(''))
  }
  return (
    <div className="item">
      <div className="fila">
        <Logo de="heygen" nombre="HeyGen" />
        <div className="fila-nombre">
          <strong>HeyGen</strong>
          <span>Un avatar de HeyGen dice la voz de tu video, con su API. Cada video gasta créditos de tu plan de API.</span>
        </div>
        {final ? (
          <Picker
            className="acciones"
            label={<span className="estado mono">{ocupado || `…${final}`}</span>}
            value=""
            disabled={!!ocupado}
            groups={[{ label: 'HeyGen', options: [{ value: 'cambiar', label: 'Cambiar de llave' }, { value: 'quitar', label: 'Quitar' }] }]}
            onChange={(q) => (q === 'cambiar' ? setPegando(true) : void guardar(null, 'Quitando…'))}
          />
        ) : (
          !pegando && (
            <button className="primary" onClick={() => setPegando(true)}>
              Añadir llave
            </button>
          )
        )}
      </div>
      {pegando && (
        <form className="fila-extra" onSubmit={(ev) => (ev.preventDefault(), llave.trim() && void guardar(llave.trim(), 'Probando…'))}>
          <div className="opcion-fila">
            <input type="password" autoFocus placeholder="Pega tu llave" value={llave} onChange={(ev) => setLlave(ev.target.value)} autoComplete="off" />
            <button className="primary" disabled={!!ocupado || !llave.trim()}>
              {ocupado || 'Guardar'}
            </button>
            <button type="button" className="ghost" onClick={() => (setPegando(false), setLlave(''))}>
              Cancelar
            </button>
          </div>
          <p className="muted small">
            Se prueba antes de guardarse, sin gastar créditos, y va a tu usuario de esta computadora (`HEYGEN_API_KEY`, la que leen también las skills de HeyGen).{' '}
            <a href="https://app.heygen.com/settings/api" target="_blank" rel="noreferrer">
              Sacar la llave ↗
            </a>
          </p>
        </form>
      )}
      {error && <p className="bad small fila-extra">{error}</p>}
    </div>
  )
}

/** Opciones → Avatar. */
export function AvatarOpciones() {
  const uso = useAvatar()
  const e = uso.estado
  if (!e)
    return (
      <div className="item">
        <div className="fila">
          <span className="muted small">{uso.error || 'Mirando…'}</span>
        </div>
      </div>
    )
  const c = e.comfy
  return (
    <>
      <div className="item">
        <div className="fila">
          <div className="fila-nombre">
            <strong>ComfyUI</strong>
            <span>{c.corriendo ? `Responde en ${c.url}${c.gpu ? ` · ${c.gpu}` : ''}${c.vramLibreGB ? ` · ${c.vramLibreGB} GB libres` : ''}` : `No responde en ${c.url}. Sloth no lo instala ni lo arranca: ábrelo tú y aquí se ve.`}</span>
          </div>
          <div className="av-acciones">
            <button className="ghost small" onClick={() => void uso.leer().catch(() => {})}>
              Volver a mirar
            </button>
          </div>
        </div>
        <Campo titulo="Dirección de ComfyUI" ayuda="Donde escucha tu ComfyUI, en esta computadora. Vacío: http://127.0.0.1:8188." valor={c.url === 'http://127.0.0.1:8188' ? '' : c.url} ejemplo="http://127.0.0.1:8188" guardar={(url) => uso.pedir('/api/avatar/comfy', { url })} />
        <Campo titulo="Carpeta de ComfyUI" ayuda="Opcional: la que tiene main.py. Con ella Sloth comprueba que los pesos de LatentSync 1.5 estén enteros (si no, ComfyUI usaría los de la 1.6, que piden 18 GB)." valor={c.carpeta ?? ''} ejemplo="La carpeta con main.py" guardar={(carpeta) => uso.pedir('/api/avatar/comfy', { carpeta })} />
        <div className="fila-extra">
          <p className="av-nota">Cómo instalar ComfyUI, sus nodos y los pesos, en la guía del avatar (skills/video-base/AVATAR.md). En el compositor, «Avatar» elige el motor de cada video.</p>
        </div>
      </div>
      {e.flujos.map((f) => (
        <FilaFlujo key={f.id} f={f} uso={uso} />
      ))}
      <LlaveHeygen uso={uso} />
    </>
  )
}
