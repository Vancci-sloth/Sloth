import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ESTILOS_IMAGEN, MODELO_RECORTE, MODELO_SUBIDA, PASOS_IMAGEN, type AjusteEdicionImagen, type EstiloImagen, type ImagenEstudio, type MarcaImagen, type PasoImagen } from '../../shared/estilos-imagen'
import { FORMATOS_IMAGEN, IMAGEN_CHATGPT, MODELOS_IMAGEN } from '../../shared/flow'
import { proveedorDe } from '../../shared/providers'
import type { Model } from '../../shared/types'
import { api } from './api'
import { CampoAscii } from './CampoAscii'
import { gruposModelos, Picker } from './Composer'
import { Confirm } from './Confirm'
import { Dictado } from './Dictado'
import { EditorImagen } from './EditorImagen'
import { Icono } from './Iconos'
import { MetadatosImagen } from './MetadatosImagen'
import './EstudioImagenes.css'
import './EstudioCreacion.css'

const RUTA = '/api/flow/estudio'
type Pedido = ImagenEstudio & { estado: string; error?: string; paso?: PasoImagen }
type Estado = { imagenes: ImagenEstudio[]; pedidos: Pedido[]; imagen?: ImagenEstudio | null; conectado: boolean; chatgpt?: boolean; recorte?: boolean; derechos?: boolean }
const activo = (p: Pedido) => p.estado === 'en-fila' || p.estado === 'generando' || p.estado === 'preparando'
function avisoDeImagen(error: string) {
  if (!/actividad inusual|unusual activity|limitó temporalmente/i.test(error)) return null
  const hora = /(?:después de las|desde las)\s+(\d{1,2}:\d{2}(?:\s*[ap]\.\s*m\.)?)/i.exec(error)?.[1]
  return hora ? `Flow pausó la generación. Puedes volver a probar después de las ${hora}.` : 'Flow pausó la generación temporalmente.'
}
const nombreModelo = (id: string) => id === IMAGEN_CHATGPT ? 'ChatGPT' : id === MODELO_RECORTE ? 'Recorte local' : id === MODELO_SUBIDA ? 'Subida' : id
const unirDictado = (base: string, texto: string) => (base.trimEnd() + (base.trim() ? ' ' : '') + texto.trim()).slice(0, 4000)
const formatos = {
  '1:1': 'Cuadrado',
  '9:16': 'Vertical',
  '16:9': 'Horizontal',
  '4:3': 'Apaisado',
  '3:4': 'Retrato'
}

function VistaFormato({ formato }: { formato: string }) {
  return <span className="imagen-formato-vista" data-formato={formato} aria-hidden="true"><span /></span>
}
const estilos = Object.entries(ESTILOS_IMAGEN).map(([value, estilo]) => ({
  value, label: estilo.nombre, detalle: estilo.guia || 'Solo tu descripción'
}))

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
  for (const i of versiones.values()) {
    for (const hija of hijas.get(i.id) ?? []) {
      if (!versiones.has(hija.id)) versiones.set(hija.id, hija)
    }
  }
  versiones.delete(inicial.id)
  return { inicial, versiones: [...versiones.values()].sort((a, b) => a.creada - b.creada) }
}

function usarCargaGaleria(clave: string, editorAbierto: boolean) {
  const estadoCarga = useRef<{ id?: string; enVista: Set<string> }>({ enVista: new Set() })
  const contenedor = useRef<HTMLDivElement>(null)
  const [enVista, setEnVista] = useState<Set<string>>(new Set())
  const [listas, setListas] = useState<Map<string, boolean>>(new Map())
  const [cargando, setCargando] = useState<string>()

  useEffect(() => {
    const botones = Array.from(contenedor.current?.querySelectorAll<HTMLElement>('[data-imagen-id]') ?? [])
    const ids = new Set(botones.map((boton) => boton.dataset.imagenId!))
    setEnVista((actual) => new Set([...actual].filter((id) => ids.has(id))))
    setListas((actual) => new Map([...actual].filter(([id]) => ids.has(id))))
    setCargando((id) => id && ids.has(id) ? id : undefined)
    if (editorAbierto) return

    const observer = new IntersectionObserver((entries) => {
      setEnVista((actual) => {
        const siguiente = new Set(actual)
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.imagenId!
          if (entry.isIntersecting) siguiente.add(id)
          else siguiente.delete(id)
        }
        return siguiente
      })
      const fuera = new Set(entries.filter((entry) => !entry.isIntersecting).map((entry) => (entry.target as HTMLElement).dataset.imagenId))
      if (fuera.size) setListas((actual) => new Map([...actual].filter(([id]) => !fuera.has(id))))
    }, { rootMargin: '180px 0px' })
    botones.forEach((boton) => observer.observe(boton))
    return () => observer.disconnect()
  }, [clave, editorAbierto])

  useEffect(() => {
    if (!editorAbierto && !cargando) {
      const siguiente = clave.split(',').find((id) => enVista.has(id) && !listas.has(id))
      if (siguiente) setCargando(siguiente)
    }
  }, [clave, editorAbierto, cargando, enVista, listas])

  useLayoutEffect(() => { estadoCarga.current = { id: cargando, enVista } }, [cargando, enVista])

  return {
    contenedor,
    lista: (id: string) => listas.get(id) === true,
    mostrar: (id: string) => id === cargando || (enVista.has(id) && listas.get(id) === true),
    terminar(id: string, lista: boolean) {
      if (id !== estadoCarga.current.id) return
      if (estadoCarga.current.enVista.has(id)) setListas((actual) => new Map(actual).set(id, lista))
      setCargando(undefined)
    }
  }
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
  const [subiendo, setSubiendo] = useState(false)
  const entradaSubida = useRef<HTMLInputElement>(null)
  const imagenesGaleria = estado?.imagenes.slice(0, limiteGaleria) ?? []
  const carga = usarCargaGaleria(imagenesGaleria.map((imagen) => imagen.id).join(','), !!imagenId)
  const [borrando, setBorrando] = useState<string>()
  const [porBorrar, setPorBorrar] = useState<ImagenEstudio>()
  const campo = useRef<HTMLTextAreaElement>(null)
  const galeria = useRef<HTMLElement>(null)
  const desplazamiento = useRef(0)
  const esChatGPT = modelo === IMAGEN_CHATGPT
  const faltaFlow = !!estado && !esChatGPT && !estado.conectado
  const disponible = esChatGPT ? estado?.chatgpt : estado?.conectado
  const modeloPrompt = models.find((m) => m.id === orquestador)
  const puedeGenerar = !dictando && !enviando && !!prompt.trim() && !!disponible

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
      } finally { leyendo = false }
    }
    void leer()
    const alVolver = () => { clearTimeout(reloj); if (!document.hidden) void leer() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { vigente = false; clearTimeout(reloj); document.removeEventListener('visibilitychange', alVolver) }
  }, [actualizar, imagenId])

  useLayoutEffect(() => {
    if (!imagenId) galeria.current?.scrollTo({ top: desplazamiento.current })
  }, [imagenId])

  const crear = async () => {
    if (!puedeGenerar) return
    setError('')
    setEnviando(true)
    try {
      const nuevo = await api<Pedido>(RUTA, { prompt, estilo, modelo, formato, orquestador: modeloPrompt?.id })
      setEstado((anterior) => anterior && { ...anterior, pedidos: [...anterior.pedidos.filter((p) => p.id !== nuevo.id), nuevo] })
      setPrompt((actual) => actual === prompt ? '' : actual)
      setActualizar((n) => n + 1)
    } catch (e) { setError((e as Error).message) }
    finally { setEnviando(false) }
  }
  const url = (imagen: ImagenEstudio) => `${RUTA}/${imagen.id}`
  const editar = async (origen: ImagenEstudio, prompt: string, modelo: string, marcas: MarcaImagen[], orquestador?: string, ajustesEdicion?: AjusteEdicionImagen[]) => {
    const nuevo = await api<Pedido>(RUTA, { prompt, modelo, marcas, orquestador, ajustesEdicion, origen: origen.id, formato: origen.formato, estilo: origen.estilo })
    setEstado((anterior) => anterior && { ...anterior, pedidos: [...anterior.pedidos.filter((p) => p.id !== nuevo.id), nuevo] })
    setActualizar((n) => n + 1)
  }
  // Sube una imagen propia y la abre en el editor, donde se edita con IA como cualquier otra de la galería.
  const subirImagen = async (archivo: File) => {
    setError('')
    setSubiendo(true)
    try {
      const nombre = archivo.name || 'imagen.png'
      const res = await fetch(`/api/upload?name=${encodeURIComponent(nombre)}`, { method: 'POST', body: archivo })
      const { path, error: fallo } = await res.json().catch(() => ({}))
      if (!res.ok || typeof path !== 'string') throw new Error(`No se pudo subir «${nombre}»: ${fallo ?? `el servidor respondió ${res.status}`}`)
      const subida = await api<ImagenEstudio>(`${RUTA}/subir`, { ruta: path })
      setActualizar((n) => n + 1)
      abrir(subida.id)
    } catch (e) { setError((e as Error).message) }
    finally { setSubiendo(false) }
  }
  const borrar = async (imagen: ImagenEstudio, terminada = false) => {
    if (borrando) return
    setBorrando(imagen.id)
    setError('')
    try {
      await api(`${url(imagen)}/borrar`, {})
      setEstado((anterior) => anterior && {
        ...anterior, imagenes: anterior.imagenes.filter((i) => i.id !== imagen.id),
        pedidos: anterior.pedidos.filter((i) => i.id !== imagen.id)
      })
    } catch (e) {
      if (terminada) throw e
      setError((e as Error).message)
    }
    finally { setBorrando(undefined); setActualizar((n) => n + 1) }
  }
  const reutilizar = (imagen: ImagenEstudio) => {
    if (dictando) return
    setPrompt(imagen.prompt)
    setEstilo(imagen.estilo)
    if (imagen.modelo !== MODELO_RECORTE && imagen.modelo !== MODELO_SUBIDA) setModelo(imagen.modelo)
    setFormato(imagen.formato)
    setOrquestador(imagen.orquestador ?? '')
    setError('')
    campo.current?.focus()
  }

  if (imagenId) {
    const imagen = estado?.imagen?.id === imagenId ? estado.imagen : estado?.imagenes.find((i) => i.id === imagenId)
    if (!imagen) return <section className="estudio-imagenes">
      <a className="editor-imagen-volver" href="#/imagenes"><Icono de="izquierda" />Volver a Imágenes</a>
      <p role="status">{consulta?.imagenId === imagenId ? consulta.error || 'Esta imagen ya no está disponible.' : 'Abriendo imagen…'}</p>
    </section>
    return <EditorImagen key={imagen.id} imagen={imagen} url={url} models={models} {...hiloDeImagen(imagen, estado)}
      hayFlow={!!estado?.conectado} derechos={!!estado?.derechos} hayChatGPT={!!estado?.chatgpt} hayRecorte={!!estado?.recorte}
      abrir={(version) => abrir(version.id)} editar={(prompt, modelo, marcas, orquestador, ajustesEdicion) => editar(imagen, prompt, modelo, marcas, orquestador, ajustesEdicion)} />
  }

  const abrirEditor = (id: string) => {
    desplazamiento.current = galeria.current?.scrollTop ?? 0
    setDictando(false)
    setParcial('')
    abrir(id)
  }
  return <section ref={galeria} className="estudio-imagenes fondo-ramas">
    <CampoAscii variante="ramas" />
    <header className="creacion-portada">
      <img className="creacion-portada-fondo" src="/estudio-castillo.webp" alt="" width={1440} height={480} fetchPriority="high" decoding="async" />
      <span className="creacion-portada-icono" aria-hidden="true"><Icono de="imagen" /></span>
      <div>
        <h1>Imágenes</h1>
        <p>Crea una imagen a partir de tu descripción.</p>
      </div>
    </header>
    <div className="creacion-flotante">
      <input ref={entradaSubida} type="file" accept="image/png,image/jpeg" hidden aria-label="Imagen para editar"
        onChange={(e) => { const archivo = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (archivo) void subirImagen(archivo) }} />
      <form className="composer imagen-formulario" onSubmit={(e) => { e.preventDefault(); void crear() }}>
        <textarea ref={campo} aria-label="Describe la imagen" required maxLength={4000} rows={1}
          readOnly={dictando} value={parcial ? unirDictado(prompt, parcial) : prompt}
          onChange={(e) => setPrompt(e.target.value)} placeholder="¿Qué imagen quieres crear?"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }} />
        <div className="composer-bar imagen-controles">
          <div className="imagen-selector imagen-selector-estilo">
            <Picker flotante menuClassName="imagen-menu-estilos" menuWidth={340} value={estilo} onChange={(id) => setEstilo(id as EstiloImagen)}
              label={<>Estilo: {ESTILOS_IMAGEN[estilo].nombre}</>}
              groups={[{ label: 'Estilo visual', options: estilos }]} />
          </div>
          <div className="imagen-selector" data-proveedor={modeloPrompt ? proveedorDe(modeloPrompt.id) : undefined}>
            <Picker flotante value={modeloPrompt?.id ?? ''} onChange={setOrquestador}
              label={`Prompt: ${modeloPrompt?.label ?? 'Directo'}`}
              groups={[{ label: 'Directo', options: [{ value: '', label: 'Mi descripción' }] }, ...gruposModelos(models)]} />
          </div>
          <div className="imagen-selector" data-proveedor={esChatGPT ? 'codex' : 'gemini'}>
            <Picker flotante value={modelo} onChange={setModelo}
              label={`Imágenes: ${nombreModelo(modelo)}`}
              groups={[
                { label: 'ChatGPT', options: [{ value: IMAGEN_CHATGPT, label: 'ChatGPT', logo: 'codex' }] },
                { label: 'Google Flow · 0 créditos', options: MODELOS_IMAGEN.map((m) => ({ value: m, label: m, logo: 'flow' })) }
              ]} />
          </div>
          <div className="imagen-selector">
            <Picker flotante value={formato} label={<><VistaFormato formato={formato} />{formato}</>} onChange={setFormato}
              groups={[{ label: 'Formato de imagen', options: Object.entries(formatos).filter(([f]) => Object.hasOwn(FORMATOS_IMAGEN, f)).map(([f, nombre]) => ({
                value: f, label: <span className="imagen-formato-opcion"><VistaFormato formato={f} />{nombre}</span>, detalle: f
              })) }]} />
          </div>
          <button type="button" className="ghost small imagen-subir" disabled={subiendo || dictando} title="Sube una imagen para editarla con IA"
            onClick={() => entradaSubida.current?.click()}>
            <Icono de="imagen" />{subiendo ? 'Subiendo…' : 'Subir imagen'}
          </button>
          <div className="imagen-enviar">
            <Dictado onActivo={setDictando} onFin={() => setParcial('')} onTexto={(texto, final) => {
              if (final) {
                setPrompt((actual) => unirDictado(actual, texto))
                setParcial('')
              } else setParcial(texto)
            }} />
            <button className="send" type="submit" disabled={!puedeGenerar} title="Generar imagen (Ctrl + Enter)" aria-label="Generar imagen">↑</button>
          </div>
        </div>
        {(faltaFlow || esChatGPT || error) && <div className="imagen-estado">
          {faltaFlow && <a href="#/opciones/creacion/flow">Conectar Google Flow en Opciones</a>}
          {esChatGPT && <p>Usa tu cuenta de <a href="#/opciones/agentes">ChatGPT en VyMotion</a>. La proporción se pide al modelo y puede variar.</p>}
          {error && <p className="bad" role="alert">{error}</p>}
        </div>}
      </form>
    </div>
    <section aria-label="Galería de imágenes">
      <h2>Mis imágenes recientes</h2>
      {estado && !estado.imagenes.length && !estado.pedidos.length && <div className="imagen-galeria-vacia"><Icono de="imagen" /><p>Tus imágenes generadas aparecerán aquí.</p></div>}
      <div className="imagen-galeria" ref={carga.contenedor}>
        {[...(estado?.pedidos ?? [])].reverse().map((imagen) => <article key={imagen.id}>
          <div className="imagen-cargando" data-estado={imagen.estado} style={{ aspectRatio: imagen.formato.replace(':', ' / ') }} role={activo(imagen) ? 'status' : undefined}>
            {activo(imagen) ? <span className="imagen-matriz" aria-hidden="true" /> : <Icono de="imagen" />}
            <span className="imagen-cargando-etapa">{imagen.estado === 'error' ? 'No se pudo generar' : imagen.estado === 'en-fila' ? 'En cola' : imagen.paso ? PASOS_IMAGEN[imagen.paso] : 'Generando la imagen…'}</span>
          </div>
          <div>
            <p title={imagen.prompt}>{imagen.prompt}</p>
            <small>{ESTILOS_IMAGEN[imagen.estilo].nombre} · {nombreModelo(imagen.modelo)} · {imagen.formato}</small>
            {imagen.error && (avisoDeImagen(imagen.error)
              ? <p className="imagen-error">{avisoDeImagen(imagen.error)}</p>
              : <details className="imagen-error-detalle"><summary>Ver motivo</summary><p className="imagen-error">{imagen.error}</p></details>)}
            {(imagen.estado === 'error' || imagen.estado === 'en-fila') && <div className="imagen-acciones">
              {imagen.estado === 'error' && <button type="button" className="ghost" disabled={dictando} onClick={() => reutilizar(imagen)}>Reutilizar prompt</button>}
              <button type="button" className="ghost" disabled={!!borrando} onClick={() => void borrar(imagen)}>{imagen.estado === 'en-fila' ? 'Cancelar pedido' : 'Quitar aviso'}</button>
            </div>}
          </div>
        </article>)}
        {imagenesGaleria.map((imagen) => <article key={imagen.id}>
          <button className="imagen-preview" data-imagen-id={imagen.id} style={{ aspectRatio: imagen.formato.replace(':', ' / ') }} aria-label={`Ver imagen: ${imagen.prompt}`} onClick={() => abrirEditor(imagen.id)}>{carga.mostrar(imagen.id) && <img src={url(imagen)} alt="" data-lista={carga.lista(imagen.id) || undefined} decoding="async" onLoad={(evento) => { const vista = evento.currentTarget; void vista.decode().then(() => { if (vista.isConnected) carga.terminar(imagen.id, true) }, () => { if (vista.isConnected) carga.terminar(imagen.id, false) }) }} onError={() => carga.terminar(imagen.id, false)} />}
            {!carga.lista(imagen.id) && <Icono de="imagen" />}
          </button>
          <div>
            <p title={imagen.prompt}>{imagen.prompt}</p>
            <small>{ESTILOS_IMAGEN[imagen.estilo].nombre} · {nombreModelo(imagen.modelo)} · {imagen.formato}</small>
            <MetadatosImagen imagen={imagen} />
            <div className="imagen-acciones">
              <button type="button" className="boton" onClick={() => abrirEditor(imagen.id)}>Editar</button>
              <a className="boton" href={url(imagen)} download>Descargar</a>
              <Picker flotante label="Más" value="" disabled={!!borrando} groups={[{ label: 'Imagen', options: [
                ...(!dictando ? [{ value: 'reutilizar', label: 'Reutilizar prompt' }] : []),
                { value: 'borrar', label: 'Borrar imagen…' }
              ] }]} onChange={(accion) => {
                if (accion === 'reutilizar') reutilizar(imagen)
                if (accion === 'borrar') setPorBorrar(imagen)
              }} />
            </div>
          </div>
        </article>)}
      </div>
      {!!estado && estado.imagenes.length > limiteGaleria && <button className="boton imagen-mostrar-mas" type="button" onClick={() => setLimiteGaleria((n) => n + 12)}>Mostrar más imágenes</button>}
    </section>
    {porBorrar && <Confirm title="¿Borrar esta imagen?" action="Borrar imagen" danger enfocarCancelar
      onConfirm={() => borrar(porBorrar, true)} onClose={() => setPorBorrar(undefined)}>
      Se eliminará de tu galería.
    </Confirm>}
  </section>
}
