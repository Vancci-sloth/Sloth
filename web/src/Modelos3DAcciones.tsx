import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Modelo3D } from '../../shared/types'
import { api } from './api'
import './Modelos3DAcciones.css'

/**
 * Lo que se hace desde «Modelos 3D» además de mirar: «Nuevo modelo» (un hilo de la card «Nuevo modelo 3D» con lo que
 * describes y, si quieres, una imagen de referencia), «Ampliar» (una variante, una animación o los colores de un proyecto
 * a partir de un modelo de la biblioteca) e «Importar .glb» (un modelo hecho fuera). Las rutas están en
 * `server/modelos3d-hilos.ts`.
 */

/** Lo último que elegiste a mano (modelo y esfuerzo) para el hilo; sin él, el servidor usa el primero de Claude. */
function eleccion(): { model?: string; effort?: string } {
  try {
    const c = JSON.parse(localStorage.getItem('choice') ?? 'null') as { model?: string; effort?: string } | null
    return c?.model ? { model: c.model.replace('[1m]', ''), effort: c.effort } : {}
  } catch {
    return {}
  }
}

const abrirHilo = (id: string) => void (location.hash = `/s/${id}`)

type Modal = 'nuevo' | 'importar' | null

/** Los botones de la cabecera de la biblioteca y las ventanas que abren. */
export function Acciones3D({ tipos, onImportado }: { tipos: string[]; onImportado(): void }) {
  const [modal, setModal] = useState<Modal>(null)
  return (
    <>
      <div className="m3d-acciones">
        <button className="m3d-accion principal" onClick={() => setModal('nuevo')}>
          Nuevo modelo
        </button>
        <button className="m3d-accion" onClick={() => setModal('importar')}>
          Importar .glb
        </button>
      </div>
      {modal === 'nuevo' && <NuevoModelo onCerrar={() => setModal(null)} />}
      {modal === 'importar' && (
        <Importar
          tipos={tipos}
          onCerrar={() => setModal(null)}
          onHecho={() => {
            setModal(null)
            onImportado()
          }}
        />
      )}
    </>
  )
}

/** El botón «Ampliar» de la ficha de un modelo y su ventana. */
export function BotonAmpliar({ modelo }: { modelo: Modelo3D }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button className="m3d-boton" onClick={() => setAbierto(true)} title="Hacerle una variante, una animación o los colores de un proyecto">
        Ampliar
      </button>
      {abierto && <Ampliar modelo={modelo} onCerrar={() => setAbierto(false)} />}
    </>
  )
}

/** Una ventana sobre la biblioteca: Esc o un clic fuera la cierran. */
function Ventana({ titulo, texto, onCerrar, children }: { titulo: string; texto?: string; onCerrar(): void; children: ReactNode }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCerrar()
      }
    }
    addEventListener('keydown', tecla, true)
    return () => removeEventListener('keydown', tecla, true)
  }, [onCerrar])
  // En el `body`: la ficha de un modelo tiene un velo con desenfoque, que ataría a una ventana puesta dentro de ella.
  return createPortal(
    <div className="m3d-velo" onClick={onCerrar}>
      <div className="m3d-modal" role="dialog" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <h2>{titulo}</h2>
        {texto && <p className="m3d-modal-texto">{texto}</p>}
        {children}
      </div>
    </div>,
    document.body
  )
}

function NuevoModelo({ onCerrar }: { onCerrar(): void }) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [imagen, setImagen] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function crear() {
    setEnviando(true)
    setError('')
    try {
      let referencia: string | undefined
      if (imagen) {
        const subida = await fetch(`/api/upload?name=${encodeURIComponent(imagen.name || 'referencia.png')}`, { method: 'POST', body: imagen })
        if (!subida.ok) throw new Error('No se pudo subir la imagen.')
        referencia = ((await subida.json()) as { path: string }).path
      }
      const meta = await api<{ id: string }>('/api/modelos3d/nuevo', { nombre, descripcion, referencia, ...eleccion() })
      abrirHilo(meta.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setEnviando(false)
    }
  }
  return (
    <Ventana titulo="Nuevo modelo 3D" texto="Cuéntale al agente qué objeto quieres. Lo modela en un proyecto de prueba, le saca su vista y lo guarda aquí." onCerrar={onCerrar}>
      <label className="m3d-campo">
        <span>Nombre</span>
        <input autoFocus value={nombre} maxLength={60} placeholder="Caja fuerte" onChange={(e) => setNombre(e.target.value)} />
      </label>
      <label className="m3d-campo">
        <span>Descripción</span>
        <textarea value={descripcion} rows={4} placeholder="Qué es, cómo se ve y qué debe poder hacer (abrirse, romperse, cambiar de color…)" onChange={(e) => setDescripcion(e.target.value)} />
      </label>
      <label className="m3d-campo">
        <span>Imagen de referencia (opcional)</span>
        <input type="file" accept="image/*" onChange={(e) => setImagen(e.target.files?.[0] ?? null)} />
      </label>
      {error && <p className="bad small">{error}</p>}
      <div className="m3d-modal-pie">
        <button className="m3d-boton" onClick={onCerrar}>
          Cancelar
        </button>
        <button className="m3d-boton principal" disabled={enviando || !nombre.trim() || !descripcion.trim()} onClick={crear}>
          {enviando ? 'Abriendo…' : 'Crear modelo'}
        </button>
      </div>
    </Ventana>
  )
}

function Ampliar({ modelo, onCerrar }: { modelo: Modelo3D; onCerrar(): void }) {
  const [que, setQue] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function crear() {
    setEnviando(true)
    setError('')
    try {
      const meta = await api<{ id: string }>(`/api/modelos3d/${modelo.id}/ampliar`, { que, ...eleccion() })
      abrirHilo(meta.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setEnviando(false)
    }
  }
  return (
    <Ventana titulo={`Ampliar ${modelo.nombre}`} texto="Se copia a una versión nueva (el original no cambia) y el agente la modifica." onCerrar={onCerrar}>
      <label className="m3d-campo">
        <span>Qué quieres</span>
        <textarea
          autoFocus
          value={que}
          rows={4}
          placeholder="Una variante (otra forma de abrirse), una animación nueva o los colores de un proyecto"
          onChange={(e) => setQue(e.target.value)}
        />
      </label>
      {error && <p className="bad small">{error}</p>}
      <div className="m3d-modal-pie">
        <button className="m3d-boton" onClick={onCerrar}>
          Cancelar
        </button>
        <button className="m3d-boton principal" disabled={enviando || !que.trim()} onClick={crear}>
          {enviando ? 'Abriendo…' : 'Ampliar'}
        </button>
      </div>
    </Ventana>
  )
}

function Importar({ tipos, onCerrar, onHecho }: { tipos: string[]; onCerrar(): void; onHecho(): void }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState(tipos.includes('Objetos') ? 'Objetos' : (tipos[0] ?? 'Objetos'))
  const [licencia, setLicencia] = useState('')
  const [error, setError] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const lleno = useRef(false)
  async function importar() {
    if (!archivo) return
    setTrabajando(true)
    setError('')
    try {
      const q = new URLSearchParams({ nombre, categoria: tipo, archivo: archivo.name })
      if (licencia.trim()) q.set('licencia', licencia.trim())
      const res = await fetch(`/api/modelos3d/importar?${q}`, { method: 'POST', body: archivo })
      const datos = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(datos.error ?? `El servidor respondió ${res.status}`)
      onHecho()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setTrabajando(false)
    }
  }
  return (
    <Ventana titulo="Importar un modelo .glb" texto="Para un modelo hecho fuera de Sloth. Se mete en la biblioteca y se le saca su vista; tarda un minuto." onCerrar={trabajando ? () => {} : onCerrar}>
      <label className="m3d-campo">
        <span>Archivo .glb</span>
        <input
          type="file"
          accept=".glb,model/gltf-binary"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            setArchivo(f)
            if (f && !lleno.current && !nombre) setNombre(f.name.replace(/\.glb$/i, '').replace(/[-_]+/g, ' '))
          }}
        />
      </label>
      <label className="m3d-campo">
        <span>Nombre</span>
        <input
          value={nombre}
          maxLength={60}
          onChange={(e) => {
            lleno.current = true
            setNombre(e.target.value)
          }}
        />
      </label>
      <label className="m3d-campo">
        <span>Tipo</span>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {(tipos.length ? tipos : ['Objetos']).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="m3d-campo">
        <span>Licencia (opcional)</span>
        <input value={licencia} placeholder="CC0, CC-BY 4.0, propio…" onChange={(e) => setLicencia(e.target.value)} />
      </label>
      {error && <p className="bad small">{error}</p>}
      <div className="m3d-modal-pie">
        <button className="m3d-boton" disabled={trabajando} onClick={onCerrar}>
          Cancelar
        </button>
        <button className="m3d-boton principal" disabled={trabajando || !archivo || !nombre.trim()} onClick={importar}>
          {trabajando ? 'Importando…' : 'Importar'}
        </button>
      </div>
    </Ventana>
  )
}
