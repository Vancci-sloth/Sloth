import { useState, type ReactNode } from 'react'
import type { SessionMeta } from '../../shared/types'
import { api } from './api'
import { Icono } from './Iconos'

/**
 * Las carpetas de «Proyectos» de la barra lateral: los hilos que juntas a mano, para seguir un proyecto sin buscarlo
 * entre las fechas. Un proyecto es solo el nombre en `proyecto` de sus hilos: nace al meter el primero y se va al sacar
 * el último. Se mete un hilo con su clic derecho («Mover a un proyecto»), varios con la selección, y el + de la carpeta
 * abre un chat que nace dentro. Los archivados salen de la carpeta mientras lo están, como de las fechas.
 */

/** Mete esos hilos en el proyecto; con `''`, los saca. */
export const aProyecto = (ids: string[], proyecto: string) => Promise.all(ids.map((id) => api(`/api/sessions/${id}/proyecto`, { proyecto })))

/** Los proyectos con sus hilos, del que se movió hace menos al que lleva más quieto. */
export function proyectosDe(sessions: SessionMeta[]): { nombre: string; hilos: SessionMeta[] }[] {
  const por = new Map<string, SessionMeta[]>()
  for (const s of sessions) if (s.proyecto && !s.archived) por.set(s.proyecto, [...(por.get(s.proyecto) ?? []), s])
  const ultimo = (hilos: SessionMeta[]) => Math.max(...hilos.map((s) => s.updatedAt))
  return [...por].map(([nombre, hilos]) => ({ nombre, hilos })).sort((a, b) => ultimo(b.hilos) - ultimo(a.hilos))
}

/** Todos los nombres, también los de los archivados: mover uno a un proyecto que solo tiene archivados lo junta con ellos. */
export const nombresDeProyectos = (sessions: SessionMeta[]) => [...new Set(sessions.flatMap((s) => (s.proyecto ? [s.proyecto] : [])))].sort((a, b) => a.localeCompare(b, 'es'))

/**
 * Dentro de un menú: a qué proyecto va, uno nuevo con su nombre, o sacarlo del que tiene. `actual`, el proyecto que
 * comparten todos los hilos (si es uno solo).
 */
export function ElegirProyecto({ proyectos, actual, onElegir }: { proyectos: string[]; actual?: string; onElegir(proyecto: string): void }) {
  const [nuevo, setNuevo] = useState('')
  const crear = () => nuevo.trim() && onElegir(nuevo.trim())
  return (
    <div className="elegir-proyecto">
      {proyectos
        .filter((p) => p !== actual)
        .map((p) => (
          <button key={p} onClick={() => onElegir(p)}>
            <Icono de="carpeta" />
            <span>{p}</span>
          </button>
        ))}
      <div className="proyecto-campo">
        <Icono de="mas" />
        <input
          autoFocus
          placeholder="Nuevo proyecto"
          aria-label="Nombre del proyecto nuevo"
          maxLength={40}
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && crear()}
        />
        {nuevo.trim() && <button className="proyecto-crear" onClick={crear}>Crear</button>}
      </div>
      {actual && (
        <button className="proyecto-sacar" onClick={() => onElegir('')}>
          Sacar de «{actual}»
        </button>
      )}
    </div>
  )
}

/**
 * Una carpeta en la barra lateral: se abre en sus hilos (y lotes) como un lote. Su + abre un chat que nace en ella; con
 * el clic derecho se renombra o se deshace (sus hilos vuelven a sus fechas, sin borrarse).
 */
export function ProyectoFila({ nombre, hilos, abierto, plegada, onToggle, onNuevo, children }: { nombre: string; hilos: SessionMeta[]; abierto: boolean; plegada: boolean; onToggle(): void; onNuevo(): void; children: ReactNode }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [renombrando, setRenombrando] = useState(false)
  const [error, setError] = useState('')
  const trabajan = hilos.some((s) => s.running || !!s.background?.length)
  const ids = hilos.map((s) => s.id)
  async function hacer(accion: () => Promise<unknown>) {
    try {
      await accion()
      setMenu(null)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <div className="proyecto">
      {renombrando ? (
        <div className="session-row renombrando">
          <span className="session-icon"><Icono de="carpeta" /></span>
          <input
            className="renombrar"
            aria-label="Nombre del proyecto"
            title="Enter lo guarda · Esc lo deja como estaba"
            autoFocus
            maxLength={40}
            defaultValue={nombre}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              const limpio = e.currentTarget.value.trim()
              if (e.key === 'Enter') void (limpio && limpio !== nombre ? hacer(() => aProyecto(ids, limpio)) : Promise.resolve()).then(() => setRenombrando(false))
              if (e.key === 'Escape') e.stopPropagation(), setRenombrando(false)
            }}
            onBlur={() => setRenombrando(false)}
          />
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          className={`session-row proyecto-row ${abierto ? 'abierto' : ''}`}
          title={plegada ? `${nombre} · ${hilos.length} ${hilos.length === 1 ? 'hilo' : 'hilos'}` : `${hilos.length} ${hilos.length === 1 ? 'hilo' : 'hilos'} · clic derecho para renombrarlo`}
          // Un doble clic lo abre o lo cierra una vez, no dos.
          onClick={(e) => e.detail < 2 && onToggle()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToggle())}
          onDoubleClick={() => !plegada && setRenombrando(true)}
          onContextMenu={(e) => (e.preventDefault(), setMenu({ x: e.clientX, y: e.clientY }))}
        >
          <span className="session-icon"><Icono de="carpeta" /></span>
          <span className="session-title">{nombre}</span>
          {trabajan && <span className="dot running" />}
          <button className="proyecto-nuevo" title="Nuevo chat en este proyecto" aria-label={`Nuevo chat en ${nombre}`} onClick={(e) => (e.stopPropagation(), onNuevo())}>
            <Icono de="mas" />
          </button>
          <span className="lote-cuenta">{hilos.length}</span>
        </div>
      )}
      {error && <div className="bad small proyecto-error">{error}</div>}
      {abierto && <div className="lote-videos">{children}</div>}
      {menu && (
        <div className="menu-backdrop" onClick={() => setMenu(null)} onContextMenu={(e) => (e.preventDefault(), setMenu(null))}>
          <div className="menu" style={{ left: Math.min(menu.x, innerWidth - 230), top: Math.min(menu.y, innerHeight - 140) }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => (setMenu(null), onNuevo())}>Nuevo chat aquí</button>
            <button title="También con doble clic" onClick={() => (setMenu(null), setRenombrando(true))}>Renombrar</button>
            <button title="Sus hilos vuelven a la lista por fechas; no se borra ninguno" onClick={() => hacer(() => aProyecto(ids, ''))}>
              Deshacer la carpeta
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
