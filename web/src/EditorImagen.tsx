import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { ESTILOS_IMAGEN, HERRAMIENTAS_IMAGEN, LIMITE_MARCAS, MODELO_RECORTE, PASOS_IMAGEN, PEDIDO_RECORTE, type AjusteEdicionImagen, type HerramientaImagen, type ImagenEstudio, type MarcaImagen, type PasoImagen, type PuntoImagen } from '../../shared/estilos-imagen'
import { IMAGEN_CHATGPT, MODELOS_IMAGEN } from '../../shared/flow'
import { proveedorDe } from '../../shared/providers'
import type { Model } from '../../shared/types'
import { gruposModelos, Picker } from './Composer'
import { Dictado, useDictadoEnCampo } from './Dictado'
import { Icono, type NombreIcono } from './Iconos'
import { Logo } from './Logos'
import { MetadatosImagen } from './MetadatosImagen'
import { EjemploEdicionImagen, nombreDeEjemplo } from './EjemploEdicionImagen'
import { LienzoZonas, puntosSvg } from './LienzoZonas'

/**
 * El editor de una imagen del estudio (`#/imagenes/editar/<id>`): a la izquierda la imagen, donde se dibuja a mano alzada
 * alrededor de lo que se quiere cambiar, quitar o conservar (hasta `LIMITE_MARCAS` zonas, `LienzoZonas.tsx`); a la
 * derecha, el chat de sus versiones, los ajustes de un clic (`AJUSTES_EDICION_IMAGEN`, cada uno con su ejemplo) y el
 * campo para pedir el cambio. «Quitar fondo» lo hace aquí mismo, sin gastar (`server/flow/recorte.ts`). Cada edición es
 * otra imagen de la galería, que guarda de cuál salió (`origen`).
 */

type Version = ImagenEstudio & { estado?: string; error?: string; paso?: PasoImagen }
type TrazoImagen = MarcaImagen & { herramienta: HerramientaImagen; contorno: PuntoImagen[] }
const herramientas = [
  { id: 'editar', icono: 'lapiz', ayuda: 'Dibuja alrededor de la zona que quieres cambiar.' },
  { id: 'quitar', icono: 'basura', ayuda: 'Dibuja alrededor del objeto que quieres quitar.' },
  { id: 'conservar', icono: 'escudo', ayuda: 'Dibuja alrededor de lo que quieres conservar.' }
] as const satisfies { id: HerramientaImagen; icono: NombreIcono; ayuda: string }[]
type AjusteImagen = { id: AjusteEdicionImagen; icono: NombreIcono; nombre: string }
const ajustesRetoque = [
  { id: 'luz', icono: 'foco', nombre: 'Mejorar iluminación' },
  { id: 'color', icono: 'ajustar', nombre: 'Corregir color' },
  { id: 'detalle', icono: 'mira', nombre: 'Recuperar detalle' },
  { id: 'restaurar', icono: 'reabrir', nombre: 'Restaurar fotografía' },
  { id: 'colorizar', icono: 'ajustar', nombre: 'Colorizar foto antigua' },
  { id: 'retrato', icono: 'personas', nombre: 'Retocar retrato' },
  { id: 'reflejos', icono: 'foco', nombre: 'Reducir reflejos' },
  { id: 'perspectiva', icono: 'ajustar', nombre: 'Corregir perspectiva' },
] as const satisfies readonly AjusteImagen[]

const ajustesComposicion = [
  { id: 'fondo', icono: 'imagen', nombre: 'Reemplazar fondo' },
  { id: 'estilo', icono: 'estrella', nombre: 'Cambiar estilo visual' },
  { id: 'objeto', icono: 'mas', nombre: 'Añadir un elemento' },
  { id: 'reemplazar', icono: 'girar', nombre: 'Reemplazar un elemento' },
  { id: 'profundidad', icono: 'mira', nombre: 'Desenfocar fondo' },
  { id: 'reencuadre', icono: 'ajustar', nombre: 'Reencuadrar imagen' },
  { id: 'producto', icono: 'cubo', nombre: 'Foto de producto' },
] as const satisfies readonly AjusteImagen[]

const ajustesDisponibles = [...ajustesRetoque, ...ajustesComposicion]

const nivelesVista = [1, 1.25, 1.5, 2, 3] as const

function menuAjustes(ajustes: readonly AjusteImagen[]) {
  return [{
    label: 'Aplicar ajuste a la edición',
    options: ajustes.map(({ id, icono, nombre }) => ({ value: id, label: <OpcionEdicion icono={icono} nombre={nombre} /> }))
  }]
}

function OpcionEdicion({ icono, nombre, zona }: { icono: NombreIcono; nombre: string; zona?: HerramientaImagen }) {
  return <span className="editor-imagen-etiqueta-herramienta" data-herramienta={zona}><Icono de={icono} /><span>{nombre}</span></span>
}

const gruposImagen = [
  { label: 'ChatGPT', proveedor: 'codex', options: [{ value: IMAGEN_CHATGPT, label: 'ChatGPT', logo: 'codex' }] },
  { label: 'Google Flow', proveedor: 'gemini', options: MODELOS_IMAGEN.map((m) => ({ value: m, label: m, logo: 'flow' })) }
] satisfies Parameters<typeof Picker>[0]['groups']


function VerPrompt({ texto }: { texto: string }) {
  return <details className="editor-imagen-prompt-listo">
    <summary>Ver prompt mejorado</summary>
    <p>{texto}</p>
  </details>
}

function marcaDeTrazo(contorno: PuntoImagen[], herramienta: HerramientaImagen): TrazoImagen {
  const xs = contorno.map((p) => p.x)
  const ys = contorno.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, ancho: Math.max(...xs) - x, alto: Math.max(...ys) - y, herramienta, contorno }
}

function TurnoEdicion({ version, actual, reciente, url, abrir }: {
  version: Version
  actual: boolean
  reciente: boolean
  url: string
  abrir(): void
}) {
  const local = version.modelo === MODELO_RECORTE
  const proveedor = local ? undefined : version.modelo === IMAGEN_CHATGPT ? 'codex' : 'gemini'
  const fallida = version.estado === 'error'
  const estado = fallida ? 'La edición se interrumpió' : version.estado === 'en-fila' ? 'En cola'
    : version.paso ? PASOS_IMAGEN[version.paso] : 'Preparando la edición…'
  return <article className="editor-imagen-turno" data-reciente={reciente || undefined}>
    <div className="user-msg"><div className="bubble">{version.prompt}</div></div>
    <div className="assistant editor-imagen-respuesta" data-scroll-respuesta={version.estado ? estado : local ? 'Fondo eliminado' : 'Imagen editada con ' + (proveedor === 'codex' ? 'ChatGPT' : version.modelo)}>
      <div className="editor-imagen-respuesta-modelo">
        {local ? <Icono de="imagen" /> : <Logo de={proveedor === 'codex' ? 'codex' : 'flow'} chico />}
        <span>{local ? 'Recorte local' : version.modelo === IMAGEN_CHATGPT ? 'ChatGPT' : version.modelo}</span>
      </div>
      {version.promptPreparado && <VerPrompt texto={version.promptPreparado} />}
      {version.estado ? <div key={estado} className="editor-imagen-paso">
        <div role="status" className={fallida ? 'bad' : undefined}>
          {fallida ? <Icono de="alerta" /> : <span className="spinner" aria-hidden="true" />}
          {estado}
        </div>
        {fallida && version.error && <details className="imagen-error-detalle">
          <summary>Ver detalles</summary><p>{version.error}</p>
        </details>}
      </div> : <button className="editor-imagen-resultado" type="button" onClick={abrir} disabled={actual} aria-current={actual || undefined}>
        <img src={url} alt="" loading={reciente ? 'eager' : 'lazy'} decoding="async" />
        <span>{actual ? <Icono de="palomita" /> : <Icono de="imagen" />}
          {actual ? 'En el lienzo' : 'Abrir versión'}{!actual && <Icono de="flecha" />}
        </span>
      </button>}
    </div>
    {!version.estado && <div className="turn-end">Edición terminada</div>}
  </article>
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
  editar(prompt: string, modelo: string, marcas: MarcaImagen[], orquestador?: string, ajustesEdicion?: AjusteEdicionImagen[]): Promise<void>
}) {
  const [marcas, setMarcas] = useState<TrazoImagen[]>([])
  const [ajustes, setAjustes] = useState<AjusteEdicionImagen[]>([])
  const ayudaHerramienta = { etiqueta: nombreDeEjemplo, vista: (id: string) => <EjemploEdicionImagen id={id} /> }
  const [herramienta, setHerramienta] = useState<HerramientaImagen>('editar')
  const [zoom, setZoom] = useState<(typeof nivelesVista)[number]>(1)
  const [medidas, setMedidas] = useState<{ ancho: number; alto: number }>()
  const [moverLienzo, setMoverLienzo] = useState(false)
  const [comparar, setComparar] = useState(false)
  const [division, setDivision] = useState(50)
  const dictado = useDictadoEnCampo(4000)
  const [orquestador, setOrquestador] = useState(imagen.orquestador ?? '')
  const [modelo, setModelo] = useState(() => imagen.modelo === MODELO_RECORTE || (imagen.modelo === IMAGEN_CHATGPT ? !hayChatGPT : !hayFlow)
    ? hayChatGPT ? IMAGEN_CHATGPT : MODELOS_IMAGEN[0] : imagen.modelo)
  const [enviando, setEnviando] = useState('')
  const [error, setError] = useState('')
  const arrastre = useRef<{ x: number; y: number; izquierda: number; arriba: number }>(undefined)
  const titulo = useRef<HTMLHeadingElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const historial = useRef<HTMLDivElement>(null)
  const seguirChat = useRef(true)
  const modeloPrompt = models.find((m) => m.id === orquestador)
  const gruposPrompt = useMemo(() => [{ label: 'Directo', options: [{ value: '', label: 'Mi descripción' }] }, ...gruposModelos(models)], [models])
  const proveedorImagen = modelo === IMAGEN_CHATGPT ? 'codex' : 'gemini'
  const nombreModeloEdicion = modelo === IMAGEN_CHATGPT ? 'ChatGPT' : modelo
  const permitido = modelo === IMAGEN_CHATGPT ? hayChatGPT : hayFlow && derechos
  const ocupado = !!enviando
  const bloqueado = ocupado || dictado.activo
  const ajustesElegidos = ajustesDisponibles.filter((ajuste) => ajustes.includes(ajuste.id))
  const automatico = [marcas.some((m) => m.herramienta === 'quitar') ? 'Quitar los objetos marcados' : '',
    ...ajustesElegidos.map((ajuste) => ajuste.nombre)].filter(Boolean).join(' · ')
  const prompt = dictado.texto.trim() || automatico
  const herramientaActiva = herramientas.find((opcion) => opcion.id === herramienta) ?? herramientas[0]
  const puedeEnviar = !!prompt && !ocupado && !dictado.activo && permitido

  useEffect(() => { titulo.current?.focus({ preventScroll: true }) }, [])
  useLayoutEffect(() => {
    const panel = historial.current
    if (panel && seguirChat.current) panel.scrollTop = panel.scrollHeight
  }, [versiones, enviando])

  const enviar = async (recorte = false) => {
    if (recorte ? !hayRecorte || ocupado || dictado.activo : !puedeEnviar) return
    seguirChat.current = true
    setEnviando(recorte ? PEDIDO_RECORTE : prompt)
    setError('')
    try {
      if (recorte) await editar(PEDIDO_RECORTE, MODELO_RECORTE, marcas.filter((m) => m.herramienta === 'conservar'))
      else {
        await editar(prompt, modelo, marcas, modeloPrompt?.id, ajustes.length ? ajustes : undefined)
        dictado.setTexto('')
        setMarcas([])
        setAjustes([])
      }
    }
    catch (e) { setError((e as Error).message) }
    finally { setEnviando('') }
  }

  function elegirZona(id: string) {
    if (id === 'limpiar') { setMarcas([]); return }
    const zona = herramientas.find((opcion) => opcion.id === id)
    if (zona) {
      setHerramienta(zona.id)
      setMoverLienzo(false)
    }
  }

  function elegirVista(id: string) {
    if (id === 'mover') { setMoverLienzo((activo) => !activo); return }
    const nivel = nivelesVista.find((opcion) => String(opcion) === id)
    if (!nivel) return
    setZoom(nivel)
    if (nivel === 1) setMoverLienzo(false)
  }

  function iniciarArrastre(e: PointerEvent<HTMLDivElement>) {
    if (!moverLienzo || !e.isPrimary || e.button !== 0 || e.pointerType === 'touch') return
    const lienzo = e.currentTarget
    arrastre.current = { x: e.clientX, y: e.clientY, izquierda: lienzo.scrollLeft, arriba: lienzo.scrollTop }
    lienzo.setPointerCapture(e.pointerId)
  }

  function desplazarLienzo(e: PointerEvent<HTMLDivElement>) {
    const inicio = arrastre.current
    if (!inicio || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.scrollLeft = inicio.izquierda + inicio.x - e.clientX
    e.currentTarget.scrollTop = inicio.arriba + inicio.y - e.clientY
  }

  function elegirComposicion(id: string) {
    if (id === 'recorte') { void enviar(true); return }
    agregarAjuste(id)
  }

  function agregarAjuste(id: string) {
    const ajuste = ajustesDisponibles.find((opcion) => opcion.id === id)
    if (!ajuste) return
    const elegido = ajuste.id
    setAjustes((actuales) => actuales.includes(elegido) ? actuales : [...actuales, elegido])
    campo.current?.focus()
  }

  return <section className="editor-imagen" data-proveedor={proveedorImagen} aria-labelledby="editor-imagen-titulo">
    <header className="editor-imagen-cabecera">
      <div className="editor-imagen-titulo">
        <a className="editor-imagen-volver" href="#/imagenes" aria-label="Volver a Imágenes" title="Volver a Imágenes"><Icono de="izquierda" /></a>
        <div>
          <h1 ref={titulo} tabIndex={-1} id="editor-imagen-titulo">Editar imagen</h1>
          <div className="editor-imagen-datos">
            <small>{ESTILOS_IMAGEN[imagen.estilo].nombre} · {imagen.formato}</small>
            <MetadatosImagen imagen={imagen} />
          </div>
        </div>
      </div>
      <div className="editor-imagen-cabecera-acciones">
        <a className="boton editor-imagen-boton" href={url(imagen)} download aria-label="Descargar imagen" title="Descargar imagen"><Icono de="descargar" /><span>Descargar</span></a>
      </div>
    </header>
    <div className="editor-imagen-paneles">
      <section className="editor-imagen-visual" aria-label="Vista previa">
        <div className="editor-imagen-herramientas" aria-label="Herramientas de edición" role="group">
          <div className="editor-imagen-grupo">
            <Picker flotante ayuda={ayudaHerramienta} etiqueta={'Herramienta activa: ' + HERRAMIENTAS_IMAGEN[herramienta].nombre}
              className="editor-imagen-selector-herramientas" menuClassName="editor-imagen-menu-herramientas" menuWidth={248}
              value={herramienta} label={<OpcionEdicion icono={herramientaActiva.icono} nombre={HERRAMIENTAS_IMAGEN[herramienta].nombre} zona={herramienta} />}
              disabled={bloqueado || comparar} onChange={elegirZona} groups={[
                { label: 'Selección de zonas', options: herramientas.map(({ id, icono }) => ({
                  value: id, label: <OpcionEdicion icono={icono} nombre={HERRAMIENTAS_IMAGEN[id].nombre} zona={id} />
                })) },
                ...(marcas.length ? [{ label: 'Marcas', options: [{ value: 'limpiar', label: <OpcionEdicion icono="basura" nombre="Limpiar todas las marcas" /> }] }] : [])
              ]} />
            <button type="button" className="editor-imagen-control" aria-label="Deshacer última marca" title="Deshacer última marca"
              disabled={!marcas.length || bloqueado || comparar} onClick={() => setMarcas((m) => m.slice(0, -1))}><Icono de="reabrir" /></button>
          </div>
          <div className="editor-imagen-grupo editor-imagen-grupo-ajustes">
            <Picker flotante ayuda={ayudaHerramienta} etiqueta="Retocar con IA" className="editor-imagen-selector-herramientas editor-imagen-menu-retoque"
              menuClassName="editor-imagen-menu-herramientas" menuWidth={248} label={<OpcionEdicion icono="ajustar" nombre="Retocar" />}
              value="" disabled={bloqueado} onChange={agregarAjuste} groups={menuAjustes(ajustesRetoque)} />
            <Picker flotante ayuda={ayudaHerramienta} etiqueta="Composición con IA" className="editor-imagen-selector-herramientas editor-imagen-menu-composicion"
              menuClassName="editor-imagen-menu-herramientas" menuWidth={248} label={<OpcionEdicion icono="imagen" nombre="Composición" />}
              value="" disabled={bloqueado} onChange={elegirComposicion} groups={[
                ...menuAjustes(ajustesComposicion),
                ...(hayRecorte ? [{ label: 'Exportar con transparencia', options: [{ value: 'recorte', label: <OpcionEdicion icono="descargar" nombre="Quitar fondo · PNG" /> }] }] : [])
              ]} />
          </div>
          <div className="editor-imagen-grupo editor-imagen-grupo-vista">
            <Picker flotante ayuda={ayudaHerramienta} etiqueta={zoom === 1 ? 'Vista: ajustar al lienzo' : 'Vista: ' + zoom * 100 + '% del ajuste'}
              className="editor-imagen-selector-herramientas editor-imagen-selector-vista" menuClassName="editor-imagen-menu-herramientas" menuWidth={200}
              value={String(zoom)} label={<OpcionEdicion icono="acercar" nombre={zoom === 1 ? 'Vista' : zoom * 100 + '%'} />}
              onChange={elegirVista} groups={[
                { label: 'Zoom respecto al ajuste', options: nivelesVista.map((nivel) => ({
                  value: String(nivel), label: nivel === 1 ? 'Ajustar al lienzo' : nivel * 100 + '%'
                })) },
                ...(zoom > 1 ? [{ label: 'Navegación', options: [{ value: 'mover', label: moverLienzo ? 'Salir del modo desplazar' : 'Desplazar con arrastre' }] }] : [])
              ]} />
            {imagen.id !== inicial.id && <button type="button" className="editor-imagen-control" aria-pressed={comparar}
              aria-label="Comparar con el original" title="Comparar con el original" onClick={() => setComparar(!comparar)}>
              <Icono de="pizarra" />
            </button>}
          </div>
        </div>
        <div className="editor-imagen-lienzo" data-zoom={zoom > 1 || undefined} data-mover={moverLienzo || undefined}
          onPointerDown={iniciarArrastre} onPointerMove={desplazarLienzo} onLostPointerCapture={(e) => {
            if (e.target === e.currentTarget) arrastre.current = undefined
          }}>
          <div className="editor-imagen-marco" data-recorte={imagen.modelo === MODELO_RECORTE || undefined}
            style={medidas ? {
              width: 'calc(min(' + medidas.ancho + 'px, 100cqw, var(--editor-alto) * ' + medidas.ancho / medidas.alto + ') * ' + zoom + ')'
            } : undefined}>
            <img src={url(imagen)} alt={imagen.prompt} draggable={false} decoding="async"
              onLoad={({ currentTarget: img }) => {
                if (img.naturalWidth && img.naturalHeight) setMedidas({ ancho: img.naturalWidth, alto: img.naturalHeight })
              }} />
            {comparar && <div className="editor-imagen-comparacion" style={{ '--division': division + '%' } as CSSProperties}>
              <div className="editor-imagen-antes"><img src={url(inicial)} alt="Imagen original" draggable={false} decoding="async" /></div>
              <span className="editor-imagen-guia-comparacion" aria-hidden="true" />
            </div>}
            <div hidden={comparar}>
              <LienzoZonas key={herramienta + imagen.id} className="editor-imagen-capa" herramienta={herramienta}
                etiqueta="Dibuja a mano alzada para rodear una zona" habilitado={marcas.length < LIMITE_MARCAS && !bloqueado && !comparar}
                onZona={puntos => setMarcas(previas => [...previas, marcaDeTrazo(puntos, herramienta)].slice(0, LIMITE_MARCAS))}>
                {marcas.map((m, i) => <polygon key={i} data-herramienta={m.herramienta} points={puntosSvg(m.contorno)} vectorEffect="non-scaling-stroke" />)}
              </LienzoZonas>
              {marcas.map((m, i) => <span key={i} aria-hidden="true" className="editor-imagen-marca" data-herramienta={m.herramienta} style={{ left: `${m.x}%`, top: `${m.y}%` }}>{i + 1}</span>)}
            </div>
          </div>
        </div>
        <div className="editor-imagen-zonas">
          {comparar ? <div className="editor-imagen-control-comparacion">
            <span>Original</span>
            <input type="range" min={0} max={100} value={division} aria-label="División entre original y edición"
              aria-valuetext={division + '% de imagen original'} onChange={(e) => setDivision(e.currentTarget.valueAsNumber)} />
            <span>Edición</span>
          </div> : <>
            <div className="editor-imagen-estado-zonas">
              <span>{moverLienzo ? 'Arrastra la imagen para moverte por el lienzo.' : herramientaActiva.ayuda}</span>
              <span aria-live="polite">{marcas.length ? `${marcas.length} de ${LIMITE_MARCAS} zonas marcadas` : ''}</span>
            </div>
            {marcas.length > 0 && <>
              <div className="editor-imagen-lista-marcas">{marcas.map((m, i) => <button key={i} type="button" className="boton editor-imagen-boton"
                data-herramienta={m.herramienta} disabled={bloqueado} onClick={() => setMarcas((previas) => previas.filter((_, j) => i !== j))}
                aria-label={`Eliminar marca ${i + 1} · ${HERRAMIENTAS_IMAGEN[m.herramienta].nombre}`}>
                {i + 1} · {HERRAMIENTAS_IMAGEN[m.herramienta].nombre}<Icono de="cerrar" />
              </button>)}</div>
            </>}
          </>}
        </div>
      </section>
      <section className="editor-imagen-chat estudio-chat" aria-label="Chat de edición">
        <header className="editor-imagen-chat-cabecera">
          <span className="editor-imagen-chat-icono"><Icono de="hilo" /></span>
          <h2>Chat de edición</h2>
          <span className="editor-imagen-chat-modelo" title={nombreModeloEdicion}>
            <Logo de={proveedorImagen === 'codex' ? 'codex' : 'flow'} chico />
            <span>{nombreModeloEdicion}</span>
          </span>
        </header>
        <div className="timeline editor-imagen-historial" data-scroll-chat ref={historial} onScroll={({ currentTarget: panel }) => {
          seguirChat.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 56
        }}>
          <div className="timeline-inner">
            <div className="editor-imagen-origen assistant">
              <div>
                <Icono de="imagen" /><strong>Imagen de partida</strong>
                {inicial.id !== imagen.id && <button className="ghost" type="button" onClick={() => abrir(inicial)}>Abrir original</button>}
              </div>
              <p>{inicial.prompt}</p>
              {inicial.promptPreparado && <VerPrompt texto={inicial.promptPreparado} />}
            </div>
            {versiones.map((v, i) => <TurnoEdicion key={v.id} version={v} url={url(v)} actual={imagen.id === v.id}
              reciente={i === versiones.length - 1} abrir={() => abrir(v)} />)}
            {enviando && <article className="editor-imagen-turno" data-reciente>
              <div className="user-msg"><div className="bubble">{enviando}</div></div>
              <div className="editor-imagen-paso"><div role="status"><span className="spinner" aria-hidden="true" />Enviando edición…</div></div>
            </article>}
            {!versiones.length && !enviando && <p className="assistant editor-imagen-ayuda">Describe un cambio o dibuja alrededor de lo que quieres editar.</p>}
          </div>
        </div>
        <div className="session-composer editor-imagen-compositor">
          {marcas.length > 0 && <div className="editor-imagen-referencia">
            <Icono de="mira" />{marcas.length === 1 ? '1 zona marcada' : `${marcas.length} zonas marcadas`}
          </div>}
          {ajustesElegidos.length > 0 && <div className="editor-imagen-ajustes" aria-label="Ajustes de edición" role="group">
            {ajustesElegidos.map(({ id, icono, nombre }) => <button key={id} type="button" className="editor-imagen-referencia"
              disabled={bloqueado} aria-label={'Quitar ajuste: ' + nombre} onClick={() => setAjustes((actuales) => actuales.filter((ajuste) => ajuste !== id))}>
              <Icono de={icono} />{nombre}<Icono de="cerrar" />
            </button>)}
          </div>}
          <form className="composer editor-imagen-prompt" data-proveedor={proveedorImagen} onSubmit={(e) => { e.preventDefault(); void enviar() }}>
            <textarea ref={campo} aria-label="Describe el cambio" rows={2} value={dictado.visible} readOnly={dictado.activo || ocupado}
              maxLength={4000} onChange={(e) => dictado.setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  if (puedeEnviar) e.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder="Pide un cambio en la imagen…" />
            <div className="composer-bar">
              <div className="editor-imagen-selectores">
                <div className="imagen-selector editor-imagen-orquestador" data-proveedor={modeloPrompt ? proveedorDe(modeloPrompt.id) : undefined}>
                  <Picker flotante buscar value={modeloPrompt?.id ?? ''} onChange={setOrquestador}
                    label={`Prompt: ${modeloPrompt?.label ?? 'Directo'}`} groups={gruposPrompt} />
                </div>
                <Picker flotante className="imagen-selector editor-imagen-modelo" value={modelo} label={nombreModeloEdicion}
                  onChange={setModelo} disabled={!hayChatGPT && !hayFlow} groups={gruposImagen.filter((g) => g.proveedor === 'codex' ? hayChatGPT : hayFlow)} />
              </div>
              <div className="imagen-enviar">
                <Dictado {...dictado.eventos} />
                <button className="send" type="submit" aria-label="Enviar edición" disabled={!puedeEnviar}><Icono de="flechaArriba" /></button>
              </div>
            </div>
          </form>
          {modelo !== IMAGEN_CHATGPT && hayFlow && !derechos && <a href="#/opciones/creacion/privacidad">Activa las imágenes de referencia en Opciones</a>}
          {error && <p className="bad" role="alert">{error}</p>}
        </div>
      </section>
    </div>
  </section>
}
