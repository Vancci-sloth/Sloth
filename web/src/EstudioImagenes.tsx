import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ESTILOS_IMAGEN, MODELO_RECORTE, PASOS_IMAGEN, type EstiloImagen, type ImagenEstudio, type MarcaImagen, type PasoImagen } from '../../shared/estilos-imagen'
import { FORMATOS_IMAGEN, IMAGEN_CHATGPT, MODELOS_IMAGEN } from '../../shared/flow'
import type { Model } from '../../shared/types'
import { api } from './api'
import { gruposModelos, Picker } from './Composer'
import { Dictado } from './Dictado'
import { EditorImagen } from './EditorImagen'
import { Icono } from './Iconos'
import { CampoAscii } from './CampoAscii'
import './EstudioImagenes.css'

/**
 * «Imágenes» (`#/imagenes`, `server/flow/index.ts` → `/api/flow/estudio`): pides una imagen sin abrir un chat, con un
 * estilo, un modelo (los de Google Flow, con tus cuentas de Opciones, o ChatGPT) y un formato. Con «Prompt» y un modelo,
 * un agente escribe antes el pedido. Las hechas quedan en la galería; «Editar» abre el editor (`EditorImagen.tsx`,
 * `#/imagenes/editar/<id>`).
 */

const RUTA = '/api/flow/estudio'
type Pedido = ImagenEstudio & { estado: string; error?: string; paso?: PasoImagen }
type Estado = { imagenes: ImagenEstudio[]; pedidos: Pedido[]; imagen?: ImagenEstudio | null; conectado: boolean; chatgpt?: boolean; recorte?: boolean; derechos?: boolean }
const activo = (p: Pedido) => p.estado === 'en-fila' || p.estado === 'generando' || p.estado === 'preparando'
function avisoDeImagen(error: string) {
  if (!/actividad inusual|unusual activity|limitó temporalmente/i.test(error)) return null
  const hora = /(?:después de las|desde las)\s+(\d{1,2}:\d{2}(?:\s*[ap]\.\s*m\.)?)/i.exec(error)?.[1]
  return hora ? `Flow pausó la generación. Puedes volver a probar después de las ${hora}.` : 'Flow pausó la generación un rato.'
}
export const nombreModeloImagen = (id: string) => (id === IMAGEN_CHATGPT ? 'ChatGPT' : id === MODELO_RECORTE ? 'Sin fondo' : id)
const unirDictado = (base: string, texto: string) => (base.trimEnd() + (base.trim() ? ' ' : '') + texto.trim()).slice(0, 4000)
const FORMATOS: Record<string, string> = { '1:1': 'Cuadrado', '9:16': 'Vertical', '16:9': 'Horizontal', '4:3': 'Apaisado', '3:4': 'Retrato' }
const estilos = Object.entries(ESTILOS_IMAGEN).map(([value, estilo]) => ({ value, label: estilo.nombre, detalle: estilo.guia || 'Solo tu descripción' }))

/** La imagen de partida de una y sus versiones (las ediciones de ediciones), en orden. */
function hiloDeImagen(imagen: ImagenEstudio, estado: Estado | undefined) {
  const originales = new Map(estado?.imagenes.map((i) => [i.id, i]))
  originales.set(imagen.id, imagen)
  let inicial = imagen
  const visitadas = new Set([imagen.id])
  while (inicial.origen && !visitadas.has(inicial.origen)) {
    const anterior = originales.get(inicial.origen)
    if (!anterior) break
    inicial = anterior
    visitadas.add(inicial.id)
  }
  const hijas = new Map<string, ImagenEstudio[]>()
  for (const i of [...originales.values(), ...(estado?.pedidos.filter((p) => !originales.has(p.id)) ?? [])]) {
    if (!i.origen) continue
    const grupo = hijas.get(i.origen)
    if (grupo) grupo.push(i)
    else hijas.set(i.origen, [i])
  }
  const versiones = new Map([[inicial.id, inicial]])
  for (const i of versiones.values()) for (const hija of hijas.get(i.id) ?? []) if (!versiones.has(hija.id)) versiones.set(hija.id, hija)
  versiones.delete(inicial.id)
  return { inicial, versiones: [...versiones.values()].sort((a, b) => a.creada - b.creada) }
}

export function EstudioImagenes({ models, imagenId, abrir }: { models: Model[]; imagenId?: string; abrir(id: string): void }) {
  const [estado, setEstado] = useState<Estado>()
  const [actualizar, setActualizar] = useState(0)
  const [estilo, setEstilo] = useState<EstiloImagen>('realista')
  const [modelo, setModelo] = useState(MODELOS_IMAGEN[0])
  const [formato, setFormato] = useState('1:1')
  const [orquestador, setOrquestador] = useState('')
  const [prompt, setPrompt] = useState('')
  const [dictando, setDictando] = useState(false)
  const [parcial, setParcial] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [consulta, setConsulta] = useState<{ imagenId?: string; error?: string }>()
  const [limiteGaleria, setLimiteGaleria] = useState(12)
  const [borrando, setBorrando] = useState<string>()
  const campo = useRef<HTMLTextAreaElement>(null)
  const galeria = useRef<HTMLElement>(null)
  const desplazamiento = useRef(0)
  const esChatGPT = modelo === IMAGEN_CHATGPT
  const faltaFlow = !!estado && !esChatGPT && !estado.conectado
  const disponible = esChatGPT ? estado?.chatgpt : estado?.conectado
  const modeloPrompt = models.find((m) => m.id === orquestador)
  const puedeGenerar = !dictando && !enviando && !!prompt.trim() && !!disponible

  // Mientras algo se genera, se mira cada 2,5 s; con la ventana escondida, no.
  useEffect(() => {
    let vigente = true
    let leyendo = false
    let reloj: ReturnType<typeof setTimeout>
    async function leer() {
      if (leyendo || document.hidden) return
      leyendo = true
      try {
        const nuevo = await api<Estado>(imagenId ? `${RUTA}?imagen=${encodeURIComponent(imagenId)}` : RUTA)
        if (!vigente) return
        setEstado(nuevo)
        setConsulta({ imagenId })
        if (nuevo.pedidos.some(activo) && !document.hidden) reloj = setTimeout(leer, 2500)
      } catch (e) {
        if (!vigente) return
        const mensaje = (e as Error).message
        if (!imagenId) setError(mensaje)
        setConsulta({ imagenId, error: mensaje })
        if (!document.hidden) reloj = setTimeout(leer, 5000)
      } finally {
        leyendo = false
      }
    }
    void leer()
    const alVolver = () => {
      clearTimeout(reloj)
      if (!document.hidden) void leer()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vigente = false
      clearTimeout(reloj)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [actualizar, imagenId])

  // Al volver del editor, la galería sigue donde estaba.
  useLayoutEffect(() => {
    if (!imagenId) galeria.current?.scrollTo({ top: desplazamiento.current })
  }, [imagenId])

  const agregar = (nuevo: Pedido) => {
    setEstado((anterior) => anterior && { ...anterior, pedidos: [...anterior.pedidos.filter((p) => p.id !== nuevo.id), nuevo] })
    setActualizar((n) => n + 1)
  }
  const crear = async () => {
    if (!puedeGenerar) return
    setError('')
    setEnviando(true)
    try {
      agregar(await api<Pedido>(RUTA, { prompt, estilo, modelo, formato, orquestador: modeloPrompt?.id }))
      setPrompt((actual) => (actual === prompt ? '' : actual))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }
  const url = (imagen: ImagenEstudio) => `${RUTA}/${imagen.id}`
  const editar = async (origen: ImagenEstudio, prompt: string, modelo: string, marcas: MarcaImagen[], orquestador?: string) =>
    agregar(await api<Pedido>(RUTA, { prompt, modelo, marcas, orquestador, origen: origen.id, formato: origen.formato, estilo: origen.estilo }))
  const borrar = async (imagen: ImagenEstudio, terminada = false) => {
    if (borrando || (terminada && !window.confirm('¿Borrar esta imagen de la galería?'))) return
    setBorrando(imagen.id)
    setError('')
    try {
      await api(`${url(imagen)}/borrar`, {})
      setEstado((anterior) => anterior && { ...anterior, imagenes: anterior.imagenes.filter((i) => i.id !== imagen.id), pedidos: anterior.pedidos.filter((i) => i.id !== imagen.id) })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBorrando(undefined)
      setActualizar((n) => n + 1)
    }
  }
  const reutilizar = (imagen: ImagenEstudio) => {
    if (dictando) return
    setPrompt(imagen.prompt)
    setEstilo(imagen.estilo)
    if (imagen.modelo !== MODELO_RECORTE) setModelo(imagen.modelo)
    setFormato(imagen.formato)
    setOrquestador(imagen.orquestador ?? '')
    setError('')
    campo.current?.focus()
  }

  if (imagenId) {
    const imagen = estado?.imagen?.id === imagenId ? estado.imagen : estado?.imagenes.find((i) => i.id === imagenId)
    if (!imagen)
      return (
        <section className="estudio-imagenes">
          <a className="editor-imagen-volver" href="#/imagenes"><Icono de="izquierda" />Volver a Imágenes</a>
          <p role="status">{consulta?.imagenId === imagenId ? consulta.error || 'Esta imagen ya no está.' : 'Abriendo la imagen…'}</p>
        </section>
      )
    return (
      <EditorImagen
        key={imagen.id}
        imagen={imagen}
        url={url}
        models={models}
        {...hiloDeImagen(imagen, estado)}
        hayFlow={!!estado?.conectado}
        derechos={!!estado?.derechos}
        hayChatGPT={!!estado?.chatgpt}
        hayRecorte={!!estado?.recorte}
        abrir={(version) => abrir(version.id)}
        editar={(prompt, modelo, marcas, orquestador) => editar(imagen, prompt, modelo, marcas, orquestador)}
      />
    )
  }

  const abrirEditor = (id: string) => {
    desplazamiento.current = galeria.current?.scrollTop ?? 0
    setDictando(false)
    setParcial('')
    abrir(id)
  }
  return (
    <section ref={galeria} className="estudio-imagenes">
      <header className="imagen-cabecera">
        <CampoAscii variante="orbita" />
        <span className="imagen-simbolo" aria-hidden="true"><Icono de="imagen" /></span>
        <div>
          <h1>Imágenes</h1>
          <p>Una imagen a partir de lo que describes, sin abrir un chat. Luego la editas marcando sus zonas.</p>
        </div>
      </header>
      <div className="imagen-editor">
        <form className="composer imagen-formulario" onSubmit={(e) => (e.preventDefault(), void crear())}>
          <textarea
            ref={campo}
            aria-label="Describe la imagen"
            required
            maxLength={4000}
            rows={1}
            readOnly={dictando}
            value={parcial ? unirDictado(prompt, parcial) : prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="¿Qué imagen quieres?"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
          />
          <div className="composer-bar imagen-controles">
            <Picker flotante className="imagen-selector" menuClassName="imagen-menu-estilos" menuWidth={340} value={estilo} onChange={(id) => setEstilo(id as EstiloImagen)} label={`Estilo: ${ESTILOS_IMAGEN[estilo].nombre}`} groups={[{ label: 'Estilo', options: estilos }]} />
            <Picker
              flotante
              buscar
              className="imagen-selector"
              titulo="Con un modelo, un agente escribe el pedido antes de generar; «Tal cual» manda lo que escribiste"
              value={modeloPrompt?.id ?? ''}
              onChange={setOrquestador}
              label={`Prompt: ${modeloPrompt?.label ?? 'Tal cual'}`}
              groups={[{ label: 'Sin agente', options: [{ value: '', label: 'Tal cual lo escribo' }] }, ...gruposModelos(models)]}
            />
            <Picker
              flotante
              className="imagen-selector"
              value={modelo}
              onChange={setModelo}
              label={`Imágenes: ${nombreModeloImagen(modelo)}`}
              groups={[
                { label: 'ChatGPT', proveedor: 'codex', options: [{ value: IMAGEN_CHATGPT, label: 'ChatGPT' }] },
                { label: 'Google Flow · sin créditos', proveedor: 'gemini', options: MODELOS_IMAGEN.map((m) => ({ value: m, label: m })) }
              ]}
            />
            <Picker
              flotante
              className="imagen-selector"
              value={formato}
              label={`${FORMATOS[formato] ?? formato} · ${formato}`}
              onChange={setFormato}
              groups={[{ label: 'Formato', options: Object.keys(FORMATOS).filter((f) => Object.hasOwn(FORMATOS_IMAGEN, f)).map((f) => ({ value: f, label: FORMATOS[f], detalle: f })) }]}
            />
            <div className="imagen-enviar">
              <Dictado
                onActivo={setDictando}
                onFin={() => setParcial('')}
                onTexto={(texto, final) => {
                  if (!final) return setParcial(texto)
                  setPrompt((actual) => unirDictado(actual, texto))
                  setParcial('')
                }}
              />
              <button className="send" type="submit" disabled={!puedeGenerar} title="Generar (Ctrl + Enter)" aria-label="Generar la imagen">↑</button>
            </div>
          </div>
        </form>
        {(faltaFlow || esChatGPT || error) && (
          <div className="imagen-estado">
            {faltaFlow && <p>Para generar con Flow, conecta una cuenta de Google en <a href="#/opciones">Opciones → Voz o Google Flow</a>.</p>}
            {esChatGPT && <p>Con tu cuenta de ChatGPT (<a href="#/opciones/agentes">Opciones → Agentes</a>). La proporción se le pide al modelo y puede variar.</p>}
            {error && <p className="bad" role="alert">{error}</p>}
          </div>
        )}
      </div>
      <section aria-label="Galería de imágenes">
        <h2>Tus imágenes</h2>
        {estado && !estado.imagenes.length && !estado.pedidos.length && (
          <div className="imagen-galeria-vacia"><Icono de="imagen" /><p>Las que generes salen aquí.</p></div>
        )}
        <div className="imagen-galeria">
          {[...(estado?.pedidos ?? [])].reverse().map((imagen) => (
            <article key={imagen.id}>
              <div className="imagen-cargando" data-estado={imagen.estado} style={{ aspectRatio: imagen.formato.replace(':', ' / ') }} role={activo(imagen) ? 'status' : undefined}>
                {activo(imagen) ? <span className="imagen-matriz" aria-hidden="true" /> : <Icono de="imagen" />}
                <span className="imagen-cargando-etapa">{imagen.estado === 'error' ? 'No se pudo generar' : imagen.estado === 'en-fila' ? 'En fila' : imagen.paso ? PASOS_IMAGEN[imagen.paso] : 'Generando la imagen…'}</span>
              </div>
              <div>
                <p title={imagen.prompt}>{imagen.prompt}</p>
                <small>{ESTILOS_IMAGEN[imagen.estilo].nombre} · {nombreModeloImagen(imagen.modelo)} · {imagen.formato}</small>
                {imagen.error &&
                  (avisoDeImagen(imagen.error) ? (
                    <p className="imagen-error">{avisoDeImagen(imagen.error)}</p>
                  ) : (
                    <details className="imagen-error-detalle"><summary>Por qué</summary><p className="imagen-error">{imagen.error}</p></details>
                  ))}
                {(imagen.estado === 'error' || imagen.estado === 'en-fila') && (
                  <div className="imagen-acciones">
                    {imagen.estado === 'error' && <button type="button" className="ghost" disabled={dictando} onClick={() => reutilizar(imagen)}>Usar este pedido</button>}
                    <button type="button" className="ghost" disabled={!!borrando} onClick={() => void borrar(imagen)}>{imagen.estado === 'en-fila' ? 'Cancelar' : 'Quitar'}</button>
                  </div>
                )}
              </div>
            </article>
          ))}
          {estado?.imagenes.slice(0, limiteGaleria).map((imagen) => (
            <article key={imagen.id}>
              <button className="imagen-preview" style={{ aspectRatio: imagen.formato.replace(':', ' / ') }} aria-label={`Abrir: ${imagen.prompt}`} onClick={() => abrirEditor(imagen.id)}>
                <img src={url(imagen)} alt={imagen.prompt} loading="lazy" decoding="async" />
              </button>
              <div>
                <p title={imagen.prompt}>{imagen.prompt}</p>
                <small>{ESTILOS_IMAGEN[imagen.estilo].nombre} · {nombreModeloImagen(imagen.modelo)} · {imagen.formato}</small>
                <div className="imagen-acciones">
                  <button type="button" className="boton" onClick={() => abrirEditor(imagen.id)}>Editar</button>
                  <a className="boton" href={url(imagen)} download>Descargar</a>
                  <Picker
                    flotante
                    label="Más"
                    value=""
                    disabled={!!borrando}
                    groups={[{ label: 'Imagen', options: [...(!dictando ? [{ value: 'reutilizar', label: 'Usar este pedido' }] : []), { value: 'borrar', label: 'Borrar la imagen…' }] }]}
                    onChange={(accion) => (accion === 'reutilizar' ? reutilizar(imagen) : accion === 'borrar' && void borrar(imagen, true))}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
        {!!estado && estado.imagenes.length > limiteGaleria && <button className="boton imagen-mostrar-mas" type="button" onClick={() => setLimiteGaleria((n) => n + 12)}>Ver más</button>}
      </section>
    </section>
  )
}
