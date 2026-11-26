import { useEffect, useRef, useState } from 'react'
import { MAX_PROMPT_3D, MAX_REFERENCIAS_3D, OPERACIONES_3D, TIPOS_REFERENCIA_3D, type OperacionModelo3D, type PuntoModelo3D, type TipoReferencia3D } from '../../shared/modelos3d'
import type { Model, Modelo3D, SessionMeta } from '../../shared/types'
import { proveedorDe } from '../../shared/providers'
import { api } from './api'
import { Dictado, useDictadoEnCampo } from './Dictado'
import { Icono } from './Iconos'
import { gruposModelos, Picker } from './Composer'

const TIPOS = 'image/png,image/jpeg,image/webp,image/gif'
const MAX_MB = 10

type Referencia = { archivo: File; vista: string; ruta?: string }
function preferido() {
  try { return JSON.parse(localStorage.getItem('choice') ?? 'null')?.model?.replace('[1m]', '') as string | undefined }
  catch { return undefined }
}

export function BorradorModelo3D({ modelos, origen, agente, zonas, herramienta, onQuitarHerramienta, onCreado, onModelo }: {
  modelos: Model[]; origen?: Pick<Modelo3D, 'id' | 'nombre'>; agente?: string; zonas?: PuntoModelo3D[][]
  herramienta?: OperacionModelo3D; onQuitarHerramienta?(): void; onCreado(sesion: SessionMeta): void; onModelo?(id?: string): void
}) {
  const campo = useRef<HTMLTextAreaElement>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const refs = useRef<Referencia[]>([])
  const dictado = useDictadoEnCampo(MAX_PROMPT_3D)
  const [referencias, setReferencias] = useState<Referencia[]>([])
  const [seleccion, setSeleccion] = useState<string>()
  const operacion = origen ? herramienta ?? null : referencias.length ? 'imagen' : 'texto'
  const [tipoReferencia, setTipoReferencia] = useState<TipoReferencia3D | undefined>()
  const [ocupado, setOcupado] = useState(false)
  const enviando = useRef(false)
  const vigente = useRef(true)
  const [error, setError] = useState('')
  const elegido = seleccion ?? agente ?? preferido()
  const modelo = elegido ? modelos.find((m) => m.id === elegido) : modelos[0]
  // Avisa a la cabecera del chat qué modelo de IA va a escribir (su logo).
  useEffect(() => onModelo?.(modelo?.id), [modelo?.id])
  const operacionActual = OPERACIONES_3D.find((herramienta) => herramienta.id === operacion)
  const faltaImagen = operacion === 'imagen' && !referencias.length
  const bloqueado = ocupado || dictado.activo
  const enfocar = () => campo.current?.focus()
  const elegirModelo = (id: string) => {
    setSeleccion(id)
    const elegido = modelos.find((m) => m.id === id)
    if (elegido) localStorage.setItem('choice', JSON.stringify({ model: elegido.id, effort: elegido.defaultEffort }))
  }
  useEffect(() => {
    vigente.current = true
    return () => {
      vigente.current = false
      refs.current.forEach((r) => URL.revokeObjectURL(r.vista))
    }
  }, [])

  function agregar(archivos: File[]) {
    if (enviando.current || !archivos.length) return
    if (archivos.some((archivo) => !TIPOS.split(',').includes(archivo.type) || archivo.size > MAX_MB * 1024 * 1024))
      return setError(`Usa imágenes PNG, JPG, WebP o GIF de hasta ${MAX_MB} MB cada una.`)
    if (refs.current.length + archivos.length > MAX_REFERENCIAS_3D)
      return setError(`Puedes adjuntar hasta ${MAX_REFERENCIAS_3D} imágenes.`)
    setError('')
    refs.current = [...refs.current, ...archivos.map((archivo) => ({ archivo, vista: URL.createObjectURL(archivo) }))]
    setReferencias(refs.current)
  }

  function quitar(referencia: Referencia) {
    URL.revokeObjectURL(referencia.vista)
    refs.current = refs.current.filter((r) => r !== referencia)
    setReferencias(refs.current)
  }

  async function enviar() {
    if (enviando.current || !modelo || !dictado.texto.trim() || dictado.activo || faltaImagen) return
    enviando.current = true
    setOcupado(true)
    setError('')
    try {
      const rutas: string[] = []
      for (const r of refs.current) {
        if (!vigente.current) return
        if (!r.ruta) {
          const nombre = r.archivo.name || 'referencia.png'
          const res = await fetch('/api/upload?name=' + encodeURIComponent(nombre), { method: 'POST', body: r.archivo })
          const subida = await res.json().catch(() => ({}))
          if (!res.ok || typeof subida.path !== 'string') throw new Error(`No se pudo adjuntar «${nombre}».`)
          r.ruta = subida.path
        }
        if (r.ruta) rutas.push(r.ruta)
      }
      if (!vigente.current) return
      const sesion = await api<SessionMeta>('/api/modelos3d/nuevo', {
        descripcion: dictado.texto.trim(), zonas, referencias: rutas, origen: origen?.id, operacion, tipoReferencia, model: modelo.id,
      })
      if (vigente.current) {
        dictado.setTexto('')
        refs.current.forEach(r => URL.revokeObjectURL(r.vista))
        refs.current = []
        setReferencias([])
        onCreado(sesion)
      }
    } catch (e) {
      if (vigente.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      enviando.current = false
      if (vigente.current) setOcupado(false)
    }
  }

  return <form className={`composer m3d-borrador${origen ? '' : ' m3d-compositor'}`} data-proveedor={modelo ? proveedorDe(modelo.id) : undefined} aria-label={origen ? 'Editar el modelo 3D' : 'Crear un modelo 3D'} onSubmit={(e) => { e.preventDefault(); void enviar() }}
    onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}
    onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); agregar(Array.from(e.dataTransfer.files)) } }}>
    {origen && <div className="m3d-borrador-titulo">
      <Icono de="lapiz" />
      <h2>Editar con un pedido</h2>
    </div>}
    <textarea ref={campo} rows={1} maxLength={MAX_PROMPT_3D} required value={dictado.visible} readOnly={bloqueado}
      aria-label={origen ? 'Describe qué quieres cambiar' : 'Describe el modelo 3D'}
      placeholder={origen ? 'Pide un cambio en el modelo 3D…' : '¿Qué modelo 3D quieres crear?'}
      onChange={(e) => dictado.setTexto(e.target.value)}
      onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); agregar(Array.from(e.clipboardData.files)) } }}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void enviar() } }} />
    {origen && operacionActual && <div className="m3d-operacion-resumen">
      <span title={operacionActual.detalle}>{operacionActual.nombre}</span>
      <button type="button" aria-label={`Quitar ${operacionActual.nombre}`} title="Quitar tipo de edición" disabled={bloqueado}
        onClick={() => { onQuitarHerramienta?.(); enfocar() }}><Icono de="cerrar" /></button>
    </div>}
    {!!referencias.length && <ul className="m3d-referencias" aria-label="Imágenes de referencia">
      {referencias.map((r) => <li key={r.vista}>
        <img src={r.vista} alt={r.archivo.name} />
        <button type="button" aria-label={`Quitar referencia ${r.archivo.name}`} disabled={bloqueado} onClick={() => quitar(r)}><Icono de="cerrar" /></button>
      </li>)}
    </ul>}
    {error && <p className="bad small" role="alert">{error}</p>}
    {elegido && modelos.length > 0 && !modelo && <p className="bad small" role="alert">El agente elegido ya no está disponible. Elige otro para continuar.</p>}
    {faltaImagen && <p className="m3d-ayuda-operacion">Adjunta al menos una imagen para convertirla en 3D.</p>}
    <div className="composer-bar m3d-borrador-controles">
      <input ref={entrada} type="file" multiple accept={TIPOS} hidden
        onChange={(e) => { agregar(Array.from(e.currentTarget.files ?? [])); e.currentTarget.value = '' }} />
      <div className="m3d-borrador-selectores">
        <button type="button" className="ghost small m3d-adjuntar" disabled={bloqueado || referencias.length >= MAX_REFERENCIAS_3D}
          onClick={() => entrada.current?.click()} aria-label={`Referencias ${referencias.length} de ${MAX_REFERENCIAS_3D}`} title={`Referencias ${referencias.length} de ${MAX_REFERENCIAS_3D}`}>
          <Icono de="imagen" />{!origen && <> Referencias {referencias.length}/{MAX_REFERENCIAS_3D}</>}
        </button>
        <Picker flotante etiqueta="Agente para modelar" label={modelo?.label ?? 'Agente'} value={modelo?.id ?? ''}
          groups={gruposModelos(modelos)} disabled={bloqueado || !modelos.length} onChange={elegirModelo} />
        {!origen && <div className="m3d-ejemplos" role="group" aria-label="Tipo de referencia">
          {TIPOS_REFERENCIA_3D.map((tipo) => <button key={tipo.id} type="button" className={`ghost small${tipoReferencia === tipo.id ? ' activa' : ''}`}
            disabled={bloqueado} aria-pressed={tipoReferencia === tipo.id} onClick={() => { setTipoReferencia(tipo.id); enfocar() }}>{tipo.nombre}</button>)}
        </div>}
      </div>
      <div className="m3d-borrador-enviar">
        {!ocupado && <Dictado {...dictado.eventos} />}
        <button className="send m3d-generar" type="submit" disabled={bloqueado || !modelo || !dictado.texto.trim()}
          aria-label={origen ? 'Enviar cambio' : 'Generar modelo'} title={origen ? 'Enviar cambio (Ctrl + Enter)' : 'Generar modelo (Ctrl + Enter)'}>
          {ocupado ? <span className="spinner" /> : <Icono de="flechaArriba" />}
        </button>
      </div>
    </div>
  </form>
}
