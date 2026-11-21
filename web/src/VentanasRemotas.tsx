import { type FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icono } from './Iconos'
import { PaginaRemota } from './NavegadorWeb'
import './VentanasRemotas.css'
import { ALLA, enLaNube } from './web'

/**
 * Desde la web (ADR 0025): lo que conectar una cuenta abre en la pantalla de la computadora, aquí, en un panel abajo a
 * la derecha (`server/ventanas-remotas.ts`). Una terminal de inicio de sesión (Claude Code, Grok…) enseña lo que dice,
 * su enlace para abrirlo en este dispositivo y dónde escribir lo que pide; una ventana de Edge (entrar con Google para la
 * voz o Flow, las redes) se ve en vivo y se usa con clics y teclado. Sale sola mientras haya alguna y se va al cerrarse.
 */

type Ventana = { tipo: 'terminal'; id: string; titulo: string; salida: string; url?: string } | { tipo: 'edge'; id: string; titulo: string; url: string }

const CADA = 2000

export function VentanasRemotas() {
  const [ventanas, setVentanas] = useState<Ventana[]>([])
  const [escondidas, setEscondidas] = useState<Set<string>>(new Set())
  const [abierta, setAbierta] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    const mirar = async () => {
      while (vivo) {
        if (document.visibilityState === 'visible') {
          try {
            const r = await fetch('/api/web/ventanas')
            if (r.ok) setVentanas((await r.json()) as Ventana[])
          } catch {}
        }
        await new Promise((r) => setTimeout(r, CADA))
      }
    }
    void mirar()
    return () => void (vivo = false)
  }, [])

  const visibles = ventanas.filter((v) => !escondidas.has(v.id))
  if (!visibles.length) return null
  const v = visibles.find((x) => x.id === abierta) ?? visibles[0]
  return createPortal(
    <section className="ventanas-remotas" aria-label={`Inicio de sesión en ${ALLA}`}>
      <header>
        <Icono de="pantalla" className="icon-trazo" />
        <div>
          <strong>{enLaNube ? 'En tu Sloth en la nube' : 'En tu computadora'}</strong>
          <span className="muted small">{v.tipo === 'terminal' ? 'Un inicio de sesión espera' : 'Una ventana de Edge está abierta'}</span>
        </div>
        <button className="ghost small" title="Esconder" onClick={() => setEscondidas((s) => new Set(s).add(v.id))}>
          <Icono de="cerrar" />
        </button>
      </header>
      {visibles.length > 1 && (
        <nav>
          {visibles.map((x) => (
            <button key={x.id} className={`navegador-chip${x.id === v.id ? ' on' : ''}`} onClick={() => setAbierta(x.id)}>
              {x.titulo.slice(0, 28)}
            </button>
          ))}
        </nav>
      )}
      {v.tipo === 'terminal' ? <Terminal key={v.id} v={v} /> : <div className="ventanas-remotas-edge"><PaginaRemota key={v.id} id={v.id} base={`/api/web/ventanas/edge/${v.id}`} /></div>}
    </section>,
    document.body
  )
}

function Terminal({ v }: { v: Ventana & { tipo: 'terminal' } }) {
  const [texto, setTexto] = useState('')
  const [enviado, setEnviado] = useState(false)
  async function mandar(ev: FormEvent) {
    ev.preventDefault()
    if (!texto.trim()) return
    await fetch(`/api/web/ventanas/terminal/${v.id}/escribir`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: texto.trim() }) }).catch(() => {})
    setTexto('')
    setEnviado(true)
  }
  return (
    <div className="ventanas-remotas-terminal">
      <p className="small">
        <strong>{v.titulo}</strong>: {v.url ? 'abre el enlace, entra con tu cuenta y pega aquí el código que te da al final.' : 'lo que dice el inicio de sesión.'}
      </p>
      {v.url && (
        <a className="boton" href={v.url} target="_blank" rel="noreferrer">
          Abrir el enlace <Icono de="fuera" />
        </a>
      )}
      <pre>{v.salida.split('\n').slice(-14).join('\n')}</pre>
      <form onSubmit={(ev) => void mandar(ev)}>
        <input value={texto} placeholder="Pega aquí el código" aria-label="Lo que pide" autoComplete="off" onChange={(ev) => setTexto(ev.target.value)} />
        <button className="primary" type="submit" disabled={!texto.trim()}>
          Mandar
        </button>
      </form>
      {enviado && <p className="muted small">Enviado. En unos segundos Opciones dice si quedó conectada.</p>}
    </div>
  )
}
