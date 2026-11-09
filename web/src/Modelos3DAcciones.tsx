import { type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from './api'
import { Icono } from './Iconos'
import './Modelos3DAcciones.css'

/**
 * Los botones de «Modelos 3D» además de mirar: «Importar .glb» (un modelo hecho fuera, sin agente) y «Nuevo modelo» (un
 * hilo que lo modela a partir de lo que describes y, si quieres, una imagen). Las rutas están en
 * `server/modelos3d-acciones.ts`.
 */

const TOPE_MB = 300

/** Lo último que elegiste a mano (modelo y esfuerzo); si ya no está, el servidor usa el primero de Claude. */
function eleccion(): { model?: string; effort?: string } {
  try {
    const c = JSON.parse(localStorage.getItem('choice') ?? 'null') as { model?: string; effort?: string } | null
    return c?.model ? { model: c.model.replace('[1m]', ''), effort: c.effort } : {}
  } catch {
    return {}
  }
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function Acciones3D({ tipos, onImportado }: { tipos: string[]; onImportado(id: string): void }) {
  const [abierta, setAbierta] = useState<'importar' | 'nuevo' | null>(null)
  const cerrar = () => setAbierta(null)
  return (
    <div className="m3d-acciones">
      <button className="m3d-accion" onClick={() => setAbierta('nuevo')}>
        <Icono de="mas" />
        Nuevo modelo
      </button>
      <button className="m3d-accion principal" onClick={() => setAbierta('importar')}>
        <Icono de="importar" />
        Importar .glb
      </button>
      {abierta === 'nuevo' && <Nuevo onCerrar={cerrar} />}
      {abierta === 'importar' && <Importar tipos={tipos} onCerrar={cerrar} onHecho={(id) => (cerrar(), onImportado(id))} />}
    </div>
  )
}

/** Una ventana sobre la biblioteca: Esc o un clic fuera la cierran, salvo mientras trabaja. */
function Ventana({ titulo, texto, onCerrar, children }: { titulo: string; texto: string; onCerrar?: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!onCerrar) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }, [onCerrar])
  return createPortal(
    <div className="m3d-velo" onClick={onCerrar}>
      <div className="m3d-modal" role="dialog" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <h2>{titulo}</h2>
        <p className="m3d-modal-texto">{texto}</p>
        {children}
      </div>
    </div>,
    document.body
  )
}

function Importar({ tipos, onCerrar, onHecho }: { tipos: string[]; onCerrar(): void; onHecho(id: string): void }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState(tipos.includes('Objetos') ? 'Objetos' : (tipos[0] ?? 'Objetos'))
  const [licencia, setLicencia] = useState('')
  const [error, setError] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  async function importar() {
    if (!archivo) return
    setTrabajando(true)
    setError('')
    try {
      const q = new URLSearchParams({ nombre: nombre.trim(), categoria: tipo })
      if (licencia.trim()) q.set('licencia', licencia.trim())
      const res = await fetch(`/api/modelos3d/importar?${q}`, { method: 'POST', body: archivo })
      const datos = (await res.json().catch(() => ({}))) as { id?: string; error?: string }
      if (!res.ok || !datos.id) throw new Error(datos.error ?? `Sloth respondió ${res.status}.`)
      onHecho(datos.id)
    } catch (e) {
      setError(mensaje(e))
      setTrabajando(false)
    }
  }
  return (
    <Ventana titulo="Importar un modelo .glb" texto="Un modelo hecho fuera de Sloth (Sketchfab, Blender…). Se guarda en la biblioteca con su vista; tarda un minuto." onCerrar={trabajando ? undefined : onCerrar}>
      <label className="m3d-campo">
        <span>Archivo .glb</span>
        <input
          type="file"
          accept=".glb,model/gltf-binary"
          disabled={trabajando}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            setArchivo(f)
            setError(f && f.size > TOPE_MB * 1024 * 1024 ? `Pasa de ${TOPE_MB} MB.` : '')
            if (f && !nombre.trim()) setNombre(f.name.replace(/\.glb$/i, '').replace(/[-_]+/g, ' '))
          }}
        />
      </label>
      <label className="m3d-campo">
        <span>Nombre</span>
        <input value={nombre} maxLength={60} disabled={trabajando} placeholder="Caja fuerte" onChange={(e) => setNombre(e.target.value)} />
      </label>
      <label className="m3d-campo">
        <span>Tipo</span>
        <select value={tipo} disabled={trabajando} onChange={(e) => setTipo(e.target.value)}>
          {(tipos.length ? tipos : ['Objetos']).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="m3d-campo">
        <span>Licencia (opcional)</span>
        <input value={licencia} disabled={trabajando} placeholder="CC0, CC BY 4.0, propio…" onChange={(e) => setLicencia(e.target.value)} />
      </label>
      {error && <p className="bad small">{error}</p>}
      <div className="m3d-modal-pie">
        <button className="m3d-accion" disabled={trabajando} onClick={onCerrar}>
          Cancelar
        </button>
        <button className="m3d-accion principal" disabled={trabajando || !archivo || !nombre.trim() || archivo.size > TOPE_MB * 1024 * 1024} onClick={importar}>
          <Icono de="importar" />
          {trabajando ? 'Importando…' : 'Importar'}
        </button>
      </div>
    </Ventana>
  )
}

function Nuevo({ onCerrar }: { onCerrar(): void }) {
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
      const meta = await api<{ id: string }>('/api/modelos3d/nuevo', { descripcion, referencia, ...eleccion() })
      location.hash = `/s/${meta.id}`
    } catch (e) {
      setError(mensaje(e))
      setEnviando(false)
    }
  }
  return (
    <Ventana titulo="Nuevo modelo 3D" texto="Describe el objeto. Se abre un hilo donde el agente lo modela, le saca su vista y lo guarda aquí." onCerrar={enviando ? undefined : onCerrar}>
      <label className="m3d-campo">
        <span>Qué objeto</span>
        <textarea
          autoFocus
          value={descripcion}
          rows={5}
          placeholder="Una caja fuerte de acero con rueda de combinación, que se pueda abrir"
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </label>
      <label className="m3d-campo">
        <span>Imagen de referencia (opcional)</span>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setImagen(e.target.files?.[0] ?? null)} />
      </label>
      {error && <p className="bad small">{error}</p>}
      <div className="m3d-modal-pie">
        <button className="m3d-accion" disabled={enviando} onClick={onCerrar}>
          Cancelar
        </button>
        <button className="m3d-accion principal" disabled={enviando || !descripcion.trim()} onClick={crear}>
          <Icono de="hilo" />
          {enviando ? 'Abriendo…' : 'Abrir hilo'}
        </button>
      </div>
    </Ventana>
  )
}
