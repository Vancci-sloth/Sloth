import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { areaDeContorno, ESTILOS_IMAGEN, HERRAMIENTAS_IMAGEN, LIMITE_MARCAS, LIMITE_PUNTOS_MARCA, MODELO_RECORTE, PASOS_IMAGEN, PEDIDO_RECORTE, type HerramientaImagen, type ImagenEstudio, type MarcaImagen, type PasoImagen, type PuntoImagen } from '../../shared/estilos-imagen'
import { IMAGEN_CHATGPT, MODELOS_IMAGEN } from '../../shared/flow'
import type { Model } from '../../shared/types'
import { gruposModelos, Picker } from './Composer'
import { Dictado, useDictadoEnCampo } from './Dictado'
import { Icono, type NombreIcono } from './Iconos'
import { Logo } from './Logos'

/**
 * El editor de una imagen del estudio (`#/imagenes/editar/<id>`): a la izquierda la imagen, donde se dibuja a mano alzada
 * alrededor de lo que se quiere cambiar, quitar o conservar (hasta `LIMITE_MARCAS` zonas); a la derecha, el chat de sus
 * versiones y el campo para pedir el cambio. «Quitar fondo» lo hace aquí mismo, sin gastar (`server/flow/recorte.ts`).
 * Cada edición es otra imagen de la galería, que guarda de cuál salió (`origen`).
 */

type Version = ImagenEstudio & { estado?: string; error?: string; paso?: PasoImagen }
type TrazoImagen = MarcaImagen & { herramienta: HerramientaImagen; contorno: PuntoImagen[] }
const herramientas = [
  { id: 'editar', icono: 'lapiz', ayuda: 'Dibuja alrededor de la zona que quieres cambiar.' },
  { id: 'quitar', icono: 'basura', ayuda: 'Dibuja alrededor de lo que quieres quitar.' },
  { id: 'conservar', icono: 'escudo', ayuda: 'Dibuja alrededor de lo que no debe cambiar.' }
] as const satisfies readonly { id: HerramientaImagen; icono: NombreIcono; ayuda: string }[]

const puntosSvg = (puntos: PuntoImagen[]) => puntos.map(({ x, y }) => `${x},${y}`).join(' ')

function VerPrompt({ texto }: { texto: string }) {
  return (
    <details className="editor-imagen-prompt-listo">
      <summary>Ver el prompt que escribió el agente</summary>
      <p>{texto}</p>
    </details>
  )
}

/** Un trazo cerrado, con 64 puntos como mucho; uno de área casi nula no cuenta. */
function marcaDeTrazo(puntos: PuntoImagen[], herramienta: HerramientaImagen): TrazoImagen | undefined {
  const contorno = puntos.length <= LIMITE_PUNTOS_MARCA ? puntos : Array.from({ length: LIMITE_PUNTOS_MARCA }, (_, i) => puntos[Math.round((i * (puntos.length - 1)) / (LIMITE_PUNTOS_MARCA - 1))])
  if (contorno.length < 3 || areaDeContorno(contorno) < 0.5) return
  const xs = contorno.map((p) => p.x)
  const ys = contorno.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, ancho: Math.max(...xs) - x, alto: Math.max(...ys) - y, herramienta, contorno }
}

function TurnoEdicion({ version, actual, reciente, url, abrir }: { version: Version; actual: boolean; reciente: boolean; url: string; abrir(): void }) {
  const local = version.modelo === MODELO_RECORTE
  const fallida = version.estado === 'error'
  const estado = fallida ? 'La edición no salió' : version.estado === 'en-fila' ? 'En fila' : version.paso ? PASOS_IMAGEN[version.paso] : 'Preparando la edición…'
  return (
    <article className="editor-imagen-turno" data-reciente={reciente || undefined}>
      <div className="user-msg"><div className="bubble">{version.prompt}</div></div>
      <div className="assistant editor-imagen-respuesta">
        <div className="editor-imagen-respuesta-modelo">
          {local ? <Icono de="imagen" /> : <Logo de={version.modelo === IMAGEN_CHATGPT ? 'codex' : 'gemini'} chico />}
          <span>{local ? 'Sin fondo, en tu computadora' : version.modelo === IMAGEN_CHATGPT ? 'ChatGPT' : version.modelo}</span>
        </div>
        {version.promptPreparado && <VerPrompt texto={version.promptPreparado} />}
        {version.estado ? (
          <div key={estado} className="editor-imagen-paso">
            <div role="status" className={fallida ? 'bad' : undefined}>
              {fallida ? <Icono de="alerta" /> : <span className="spinner" aria-hidden="true" />}
              {estado}
            </div>
            {fallida && version.error && <details className="imagen-error-detalle"><summary>Por qué</summary><p>{version.error}</p></details>}
          </div>
        ) : (
          <button className="editor-imagen-resultado" type="button" onClick={abrir} disabled={actual} aria-current={actual || undefined}>
            <img src={url} alt="" loading={reciente ? 'eager' : 'lazy'} decoding="async" />
            <span>
              {actual ? <Icono de="palomita" /> : <Icono de="imagen" />}
              {actual ? 'Es la que estás viendo' : 'Abrir esta versión'}
              {!actual && <Icono de="flecha" />}
            </span>
          </button>
        )}
      </div>
    </article>
  )
}

export function EditorImagen({ imagen, inicial, url, versiones, models, hayFlow, derechos, hayChatGPT, hayRecorte, abrir, editar }: {
  imagen: ImagenEstudio
  inicial: ImagenEstudio
  url(imagen: ImagenEstudio): string
  versiones: Version[]
  models: Model[]
  hayFlow: boolean
  derechos: boolean
  hayChatGPT: boolean
  hayRecorte: boolean
  abrir(imagen: ImagenEstudio): void
  editar(prompt: string, modelo: string, marcas: MarcaImagen[], orquestador?: string): Promise<void>
}) {
  const [marcas, setMarcas] = useState<TrazoImagen[]>([])
  const [herramienta, setHerramienta] = useState<HerramientaImagen>('editar')
  const dictado = useDictadoEnCampo(4000)
  const [orquestador, setOrquestador] = useState(imagen.orquestador ?? '')
  const [modelo, setModelo] = useState(() =>
    imagen.modelo === MODELO_RECORTE || (imagen.modelo === IMAGEN_CHATGPT ? !hayChatGPT : !hayFlow) ? (hayChatGPT ? IMAGEN_CHATGPT : MODELOS_IMAGEN[0]) : imagen.modelo
  )
  const [enviando, setEnviando] = useState('')
  const [error, setError] = useState('')
  const dibujo = useRef<{ puntos: PuntoImagen[]; marco: DOMRect; herramienta: HerramientaImagen } | undefined>(undefined)
  const trazo = useRef<SVGPolylineElement>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const historial = useRef<HTMLDivElement>(null)
  const seguirChat = useRef(true)
  const modeloPrompt = models.find((m) => m.id === orquestador)
  const gruposPrompt = useMemo(() => [{ label: 'Sin agente', options: [{ value: '', label: 'Tal cual lo escribo' }] }, ...gruposModelos(models)], [models])
  const gruposImagen = [
    ...(hayChatGPT ? [{ label: 'ChatGPT', proveedor: 'codex', options: [{ value: IMAGEN_CHATGPT, label: 'ChatGPT' }] }] : []),
    ...(hayFlow ? [{ label: 'Google Flow', proveedor: 'gemini', options: MODELOS_IMAGEN.map((m) => ({ value: m, label: m })) }] : [])
  ]
  // Flow edita mandando la imagen como referencia: pide la confirmación de sus derechos (Opciones → Google Flow).
  const permitido = modelo === IMAGEN_CHATGPT ? hayChatGPT : hayFlow && derechos
  const ocupado = !!enviando
  const prompt = dictado.texto.trim() || (marcas.some((m) => m.herramienta === 'quitar') ? 'Quita lo marcado.' : '')
  const puedeEnviar = !!prompt && !ocupado && !dictado.activo && permitido

  useEffect(() => titulo.current?.focus({ preventScroll: true }), [])
  useLayoutEffect(() => {
    const panel = historial.current
    if (panel && seguirChat.current) panel.scrollTop = panel.scrollHeight
  }, [versiones, enviando])

  function punto(e: PointerEvent<SVGSVGElement>, { left, top, width, height }: DOMRect): PuntoImagen {
    const limitar = (n: number) => Math.round(Math.max(0, Math.min(100, n)) * 10) / 10
    return { x: limitar(((e.clientX - left) * 100) / width), y: limitar(((e.clientY - top) * 100) / height) }
  }
  function avanzarTrazo(e: PointerEvent<SVGSVGElement>) {
    const actual = dibujo.current
    if (!actual || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    const nuevo = punto(e, actual.marco)
    const anterior = actual.puntos.at(-1)!
    if (Math.hypot(nuevo.x - anterior.x, nuevo.y - anterior.y) >= 0.35) {
      // Un trazo muy largo se aligera sin volver a pintar el editor a cada movimiento.
      if (actual.puntos.length >= 1024) actual.puntos = actual.puntos.filter((_, i) => i % 2 === 0)
      actual.puntos.push(nuevo)
      trazo.current?.setAttribute('points', puntosSvg(actual.puntos))
    }
    return actual
  }
  const terminarTrazo = () => {
    dibujo.current = undefined
    trazo.current?.setAttribute('visibility', 'hidden')
  }
  const enviar = async (recorte = false) => {
    if (recorte ? !hayRecorte || ocupado || dictado.activo : !puedeEnviar) return
    seguirChat.current = true
    setEnviando(recorte ? PEDIDO_RECORTE : prompt)
    setError('')
    try {
      if (recorte) await editar(PEDIDO_RECORTE, MODELO_RECORTE, marcas.filter((m) => m.herramienta === 'conservar'))
      else {
        await editar(prompt, modelo, marcas, modeloPrompt?.id)
        dictado.setTexto('')
        setMarcas([])
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setEnviando('')
    }
  }

  return (
    <section className="editor-imagen" aria-labelledby="editor-imagen-titulo">
      <header>
        <div className="editor-imagen-titulo">
          <a className="editor-imagen-volver" href="#/imagenes"><Icono de="izquierda" />Volver a Imágenes</a>
          <div>
            <h1 ref={titulo} tabIndex={-1} id="editor-imagen-titulo">Editar la imagen</h1>
            <small>{ESTILOS_IMAGEN[imagen.estilo].nombre} · {imagen.formato}</small>
          </div>
        </div>
        <div className="editor-imagen-cabecera-acciones">
          <a className="boton editor-imagen-boton" href={url(imagen)} download><Icono de="descargar" />Descargar</a>
        </div>
      </header>
      <div className="editor-imagen-paneles">
        <section className="editor-imagen-visual" aria-label="La imagen">
          <div className="editor-imagen-herramientas" aria-label="Qué marcas" role="group">
            {herramientas.map(({ id, icono, ayuda }) => (
              <button key={id} type="button" className="boton editor-imagen-boton" data-herramienta={id} aria-pressed={herramienta === id} title={ayuda} onClick={() => setHerramienta(id)}>
                <Icono de={icono} />
                {HERRAMIENTAS_IMAGEN[id].nombre}
              </button>
            ))}
            {hayRecorte && (
              <button type="button" className="boton editor-imagen-boton editor-imagen-recorte" title="Un PNG con el fondo transparente, hecho en tu computadora; lo marcado con «Conservar zona» se queda" disabled={ocupado || dictado.activo} onClick={() => void enviar(true)}>
                <Icono de="imagen" />
                Quitar fondo
              </button>
            )}
          </div>
          <div className="editor-imagen-lienzo">
            <div className="editor-imagen-marco" data-recorte={imagen.modelo === MODELO_RECORTE || undefined}>
              <img src={url(imagen)} alt={imagen.prompt} draggable={false} decoding="async" />
              <svg
                className="editor-imagen-capa"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-label="Dibuja a mano alzada para rodear una zona"
                onPointerDown={(e) => {
                  if (!e.isPrimary || e.button !== 0 || marcas.length >= LIMITE_MARCAS || ocupado || dibujo.current) return
                  const marco = e.currentTarget.getBoundingClientRect()
                  if (!marco.width || !marco.height) return
                  e.currentTarget.setPointerCapture(e.pointerId)
                  const puntos = [punto(e, marco)]
                  dibujo.current = { puntos, marco, herramienta }
                  trazo.current?.setAttribute('data-herramienta', herramienta)
                  trazo.current?.setAttribute('points', puntosSvg(puntos))
                  trazo.current?.setAttribute('visibility', 'visible')
                }}
                onPointerMove={avanzarTrazo}
                onPointerUp={(e) => {
                  const actual = avanzarTrazo(e)
                  if (!actual) return
                  const m = marcaDeTrazo(actual.puntos, actual.herramienta)
                  if (m) setMarcas((previas) => [...previas, m].slice(0, LIMITE_MARCAS))
                  terminarTrazo()
                }}
                onLostPointerCapture={terminarTrazo}
              >
                {marcas.map((m, i) => <polygon key={i} data-herramienta={m.herramienta} points={puntosSvg(m.contorno)} vectorEffect="non-scaling-stroke" />)}
                <polyline ref={trazo} visibility="hidden" vectorEffect="non-scaling-stroke" />
              </svg>
              {marcas.map((m, i) => <span key={i} aria-hidden="true" className="editor-imagen-marca" data-herramienta={m.herramienta} style={{ left: `${m.x}%`, top: `${m.y}%` }}>{i + 1}</span>)}
            </div>
          </div>
          <div className="editor-imagen-zonas">
            <div className="editor-imagen-estado-zonas">
              <span>{herramientas.find((h) => h.id === herramienta)?.ayuda}</span>
              <span aria-live="polite">{marcas.length ? `${marcas.length} de ${LIMITE_MARCAS} zonas marcadas` : ''}</span>
            </div>
            {marcas.length > 0 && (
              <>
                <div className="editor-imagen-acciones-zonas">
                  <button type="button" className="boton editor-imagen-boton" disabled={ocupado} onClick={() => setMarcas((m) => m.slice(0, -1))}><Icono de="reabrir" />Deshacer</button>
                  <button type="button" className="boton editor-imagen-boton" disabled={ocupado} onClick={() => setMarcas([])}>Borrar las marcas</button>
                </div>
                <div className="editor-imagen-lista-marcas">
                  {marcas.map((m, i) => (
                    <button key={i} type="button" className="boton editor-imagen-boton" data-herramienta={m.herramienta} disabled={ocupado} onClick={() => setMarcas((previas) => previas.filter((_, j) => i !== j))} aria-label={`Quitar la marca ${i + 1} · ${HERRAMIENTAS_IMAGEN[m.herramienta].nombre}`}>
                      {i + 1} · {HERRAMIENTAS_IMAGEN[m.herramienta].nombre}
                      <Icono de="cerrar" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
        <section className="editor-imagen-chat estudio-chat" aria-label="Las versiones">
          <header className="editor-imagen-chat-cabecera"><Icono de="hilo" /><h2>Versiones</h2></header>
          <div className="timeline editor-imagen-historial" ref={historial} onScroll={({ currentTarget: panel }) => (seguirChat.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 56)}>
            <div className="timeline-inner">
              <div className="editor-imagen-origen assistant">
                <div>
                  <Icono de="imagen" />
                  <strong>La imagen de partida</strong>
                  {inicial.id !== imagen.id && <button className="ghost" type="button" onClick={() => abrir(inicial)}>Abrir la original</button>}
                </div>
                <p>{inicial.prompt}</p>
                {inicial.promptPreparado && <VerPrompt texto={inicial.promptPreparado} />}
              </div>
              {versiones.map((v, i) => <TurnoEdicion key={v.id} version={v} url={url(v)} actual={imagen.id === v.id} reciente={i === versiones.length - 1} abrir={() => abrir(v)} />)}
              {enviando && (
                <article className="editor-imagen-turno" data-reciente>
                  <div className="user-msg"><div className="bubble">{enviando}</div></div>
                  <div className="editor-imagen-paso"><div role="status"><span className="spinner" aria-hidden="true" />Mandando la edición…</div></div>
                </article>
              )}
              {!versiones.length && !enviando && <p className="assistant editor-imagen-ayuda">Describe un cambio o dibuja alrededor de lo que quieres editar.</p>}
            </div>
          </div>
          <div className="session-composer editor-imagen-compositor">
            {marcas.length > 0 && <div className="editor-imagen-referencia"><Icono de="mira" />{marcas.length === 1 ? '1 zona marcada' : `${marcas.length} zonas marcadas`}</div>}
            <form className="composer editor-imagen-prompt" onSubmit={(e) => (e.preventDefault(), void enviar())}>
              <textarea
                aria-label="Describe el cambio"
                rows={1}
                value={dictado.visible}
                readOnly={dictado.activo || ocupado}
                maxLength={4000}
                onChange={(e) => dictado.setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    if (puedeEnviar) e.currentTarget.form?.requestSubmit()
                  }
                }}
                placeholder="Pide un cambio en la imagen…"
              />
              <div className="composer-bar">
                <div className="editor-imagen-selectores">
                  <Picker flotante buscar className="imagen-selector" value={modeloPrompt?.id ?? ''} onChange={setOrquestador} label={`Prompt: ${modeloPrompt?.label ?? 'Tal cual'}`} groups={gruposPrompt} />
                  <Picker flotante className="imagen-selector" value={modelo} label={modelo === IMAGEN_CHATGPT ? 'ChatGPT' : modelo} onChange={setModelo} disabled={!gruposImagen.length} groups={gruposImagen} />
                </div>
                <div className="imagen-enviar">
                  <Dictado {...dictado.eventos} />
                  <button className="send" type="submit" aria-label="Mandar la edición" disabled={!puedeEnviar}><Icono de="flechaArriba" /></button>
                </div>
              </div>
            </form>
            {modelo !== IMAGEN_CHATGPT && hayFlow && !derechos && <p className="muted small">Para editar con Flow, confirma en <a href="#/opciones">Opciones → Google Flow</a> que tienes los derechos de las imágenes que mandas.</p>}
            {error && <p className="bad" role="alert">{error}</p>}
          </div>
        </section>
      </div>
    </section>
  )
}
