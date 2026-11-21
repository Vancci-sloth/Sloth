import { type FormEvent, type KeyboardEvent, type MouseEvent, useEffect, useRef, useState, type WheelEvent } from 'react'
import { type EntradaNavegador, type EstadoNavegador, type PuenteNavegador, TECLAS_NAVEGADOR, type TeclaNavegador } from '../../shared/types'

/**
 * El navegador de cada hilo desde la web (ADR 0025): la página vive en la ventana de Sloth de la computadora y aquí se
 * ve en capturas que se piden seguidas mientras el panel está a la vista (`PaginaRemota`), y se usa mandando lo que se
 * hace en ella: clics, la rueda y el teclado. `puenteWeb` cumple lo mismo que el de la ventana (`window.sloth.navegador`)
 * con las rutas de `server/navegador-remoto.ts`, así el panel (`Navegador.tsx`) es el mismo.
 */

/** Cada cuánto se pide otra captura, y cada cuánto se mira cómo van las páginas. */
const CADA_CAPTURA = 450
const CADA_ESTADO = 1500

const ruta = (hilo: string, que: string) => `/api/navegador/${encodeURIComponent(hilo)}/${que}`
const mandar = (hilo: string, que: string, cuerpo: unknown) =>
  fetch(ruta(hilo, que), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }).catch(() => undefined)

/** Para pedir la siguiente captura ya, sin esperar su turno (tras un clic o una tecla). */
const yaMismo = new Set<() => void>()
const otraCaptura = () => yaMismo.forEach((f) => f())

export function puenteWeb(): PuenteNavegador {
  const ultimos = new Map<string, EstadoNavegador>()
  const estados = async (): Promise<EstadoNavegador[]> => {
    try {
      const r = await fetch('/api/navegador/estados')
      return r.ok ? ((await r.json()) as EstadoNavegador[]) : []
    } catch {
      return []
    }
  }
  return {
    ver() {},
    // Sin la ventana de Sloth en la computadora no hay navegador: se dice por qué no abre.
    ir: (hilo, url) =>
      void mandar(hilo, 'ir', { url }).then(async (r) => {
        if (r?.status === 404) alert(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'No se pudo abrir la página.')
        otraCaptura()
      }),
    hacer(hilo, accion) {
      // «Abrir fuera» abre la página en este navegador; el menú es de la ventana.
      if (accion === 'fuera') {
        const url = ultimos.get(hilo)?.url
        if (url) window.open(url, '_blank', 'noopener')
        return
      }
      if (accion !== 'menu') void mandar(hilo, 'hacer', { accion }).then(otraCaptura)
    },
    oir(cb) {
      let vivo = true
      const mirar = async () => {
        while (vivo) {
          if (document.visibilityState === 'visible')
            for (const e of await estados()) {
              const antes = ultimos.get(e.hilo)
              if (antes && JSON.stringify(antes) === JSON.stringify(e)) continue
              ultimos.set(e.hilo, e)
              cb(e)
            }
          await new Promise((r) => setTimeout(r, CADA_ESTADO))
        }
      }
      void mirar()
      return () => void (vivo = false)
    },
    estados
  }
}

/** En un celular no hay teclado físico: una barra para escribir en la página. */
const tactil = () => matchMedia('(pointer: coarse)').matches

/**
 * La página de una pestaña, en vivo: la última captura, y lo que haces en ella va a la de la computadora. `base`: otra
 * página que no es del navegador de un hilo, como una ventana de Edge para entrar con Google (`VentanasRemotas.tsx`).
 */
export function PaginaRemota({ id, base }: { id: string; base?: string }) {
  const en = (que: string) => (base ? `${base}/${que}` : ruta(id, que))
  const caja = useRef<HTMLDivElement>(null)
  const [src, setSrc] = useState<string>()
  /** La medida de la página en píxeles CSS, para pasar el clic de la captura a la página. */
  const medida = useRef({ ancho: 0, alto: 0 })
  const anterior = useRef<string | undefined>(undefined)
  const [texto, setTexto] = useState('')

  useEffect(() => {
    let vivo = true
    let despertar: (() => void) | undefined
    const ya = () => despertar?.()
    yaMismo.add(ya)
    let actual: string | undefined
    void (async () => {
      while (vivo) {
        const el = caja.current
        if (el && document.visibilityState === 'visible') {
          const r = el.getBoundingClientRect()
          try {
            const res = await fetch(en('captura'))
            if (res.status === 200) {
              medida.current = { ancho: Number(res.headers.get('x-ancho')) || r.width, alto: Number(res.headers.get('x-alto')) || r.height }
              const nueva = URL.createObjectURL(await res.blob())
              if (!vivo) URL.revokeObjectURL(nueva)
              else {
                if (anterior.current) URL.revokeObjectURL(anterior.current)
                anterior.current = actual
                actual = nueva
                setSrc(nueva)
              }
            }
          } catch {}
        }
        await new Promise<void>((r) => {
          const t = setTimeout(r, CADA_CAPTURA)
          despertar = () => (clearTimeout(t), r())
        })
      }
    })()
    return () => {
      vivo = false
      yaMismo.delete(ya)
      despertar?.()
      if (actual) URL.revokeObjectURL(actual)
    }
  }, [id, base])

  /** Dónde cae un punto de la caja en la página: la captura va encogida, centrada a lo ancho y arriba (`object-fit: contain`). */
  function enLaPagina(ev: { clientX: number; clientY: number }) {
    const r = caja.current!.getBoundingClientRect()
    const { ancho, alto } = medida.current
    if (!ancho || !alto) return null
    const escala = Math.min(r.width / ancho, r.height / alto)
    const x = (ev.clientX - r.left - (r.width - ancho * escala) / 2) / escala
    const y = (ev.clientY - r.top) / escala
    return x >= 0 && y >= 0 && x <= ancho && y <= alto ? { x: Math.round(x), y: Math.round(y) } : null
  }
  const entrada = (e: EntradaNavegador) =>
    void fetch(en('entrada'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(e) })
      .catch(() => undefined)
      .then(otraCaptura)

  function clic(ev: MouseEvent) {
    caja.current?.focus()
    const p = enLaPagina(ev)
    if (p) entrada({ tipo: 'clic', ...p })
  }
  // La rueda llega en muchos pedazos: se juntan y van de a uno cada poco.
  const rueda = useRef({ dx: 0, dy: 0, x: 0, y: 0, t: 0 as ReturnType<typeof setTimeout> | 0 })
  function girar(ev: WheelEvent) {
    const p = enLaPagina(ev)
    if (!p) return
    const r = rueda.current
    r.dx += ev.deltaX
    r.dy += ev.deltaY
    Object.assign(r, p)
    if (r.t) return
    r.t = setTimeout(() => {
      entrada({ tipo: 'rueda', x: r.x, y: r.y, dx: r.dx, dy: r.dy })
      Object.assign(r, { dx: 0, dy: 0, t: 0 })
    }, 80)
  }
  // Lo que escribes va junto: una letra por petición sería lento por el túnel.
  const escrito = useRef({ texto: '', t: 0 as ReturnType<typeof setTimeout> | 0 })
  function soltarTexto() {
    const e = escrito.current
    if (e.t) clearTimeout(e.t)
    e.t = 0
    if (e.texto) entrada({ tipo: 'texto', texto: e.texto })
    e.texto = ''
  }
  function tecla(ev: KeyboardEvent) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return
    if ((TECLAS_NAVEGADOR as readonly string[]).includes(ev.key)) {
      ev.preventDefault()
      soltarTexto()
      entrada({ tipo: 'tecla', tecla: ev.key as TeclaNavegador })
    } else if (ev.key.length === 1) {
      ev.preventDefault()
      const e = escrito.current
      e.texto += ev.key
      if (e.t) clearTimeout(e.t)
      e.t = setTimeout(soltarTexto, 120)
    }
  }
  function escribir(ev: FormEvent) {
    ev.preventDefault()
    if (texto) entrada({ tipo: 'texto', texto })
    setTexto('')
  }

  return (
    <div className="navegador-remota">
      <div
        ref={caja}
        className="navegador-remota-pagina"
        tabIndex={0}
        aria-label="La página, en tu computadora"
        onClick={clic}
        onWheel={girar}
        onKeyDown={tecla}
        onPaste={(ev) => {
          const t = ev.clipboardData.getData('text')
          if (t) (ev.preventDefault(), soltarTexto(), entrada({ tipo: 'texto', texto: t }))
        }}
      >
        {src && <img src={src} alt="" draggable={false} onLoad={() => anterior.current && (URL.revokeObjectURL(anterior.current), (anterior.current = undefined))} />}
      </div>
      {tactil() && (
        <form className="navegador-escribir" onSubmit={escribir}>
          <input value={texto} placeholder="Escribe en la página" aria-label="Escribir en la página" onChange={(ev) => setTexto(ev.target.value)} />
          <button type="submit" className="navegador-chip" disabled={!texto}>
            Mandar
          </button>
          <button type="button" className="navegador-chip" onClick={() => entrada({ tipo: 'tecla', tecla: 'Enter' })}>
            Enter
          </button>
        </form>
      )}
    </div>
  )
}
