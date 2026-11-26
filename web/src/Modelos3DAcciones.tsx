import { type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icono } from './Iconos'
import './Modelos3DAcciones.css'

/**
 * Los botones de «Modelos 3D» además de mirar: «Importar .glb» (un modelo hecho fuera, sin agente) y «Nuevo modelo» (un
 * hilo que lo modela a partir de lo que describes y, si quieres, una imagen). Las rutas están en
 * `server/modelos3d-acciones.ts`.
 */

const TOPE_MB = 300

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function Acciones3D({ tipos, onImportado }: { tipos: string[]; onImportado(id: string): void }) {
  const [abierta, setAbierta] = useState(false)
  const cerrar = () => setAbierta(false)
  return (
    <div className="m3d-acciones">
      <button className="m3d-accion" onClick={() => setAbierta(true)}>
        <Icono de="importar" />
        Importar .glb
      </button>
      {abierta && <Importar tipos={tipos} onCerrar={cerrar} onHecho={(id) => (cerrar(), onImportado(id))} />}
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
      if (!res.ok || !datos.id) throw new Error(datos.error ?? `VyMotion respondió ${res.status}.`)
      onHecho(datos.id)
    } catch (e) {
      setError(mensaje(e))
      setTrabajando(false)
    }
  }
  return (
    <Ventana titulo="Importar un modelo .glb" texto="Un modelo hecho fuera de VyMotion (Sketchfab, Blender…). Se guarda en la biblioteca con su vista; tarda un minuto." onCerrar={trabajando ? undefined : onCerrar}>
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

