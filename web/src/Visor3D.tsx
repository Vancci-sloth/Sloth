import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Modelo3D } from '../../shared/types'

/**
 * El visor 3D de «Modelos 3D» (`skills/modelos-3d/visor.tsx`): uno solo mientras la sección está abierta, en un iframe
 * que no se vuelve a cargar; se le dice qué modelo enseñar. Abrirlo cada vez en la ficha (lanzar su proceso, leer su
 * código, armar su escena) tardaba de 1 a 3 s; así, cambiar de modelo es traer su trozo y compilar sus materiales, y con
 * el modelo sobre el que el ratón se queda, eso ya está hecho al abrir su ficha. Quieto no dibuja nada.
 *
 * Si se vuelve a armar (cambia su dirección), carga otra vez y se le pide de nuevo lo último.
 *
 * Va en la otra dirección de esta computadora (`127.0.0.1` si Sloth es `localhost`, y al revés), como la vista en vivo
 * del estudio (`Monitor.tsx`): para el navegador es otro sitio y lo carga en su propio proceso, sin trabar la página.
 * Vive fijo en la raíz de la sección y se coloca encima del lugar del modelo en la ficha (`colocar`), sin tapar las
 * botones de la ficha que caen encima (las flechas y, en angosto, cerrar), que quedan fuera de su recorte.
 */

/** En angosto la ficha se desplaza: ahí la rueda la desplaza, y acerca solo con Ctrl (o pellizcando el panel táctil). */
export const ANGOSTO = '(max-width: 860px)'
const aparte = (ruta: string) => `${location.protocol}//${location.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1'}:${location.port}${ruta}`

/** Lo que dice el visor. */
export type AvisoVisor = { que: 'hola' | 'listo' | 'falta' | 'toca' | 'tecla' | 'rueda'; id?: string; key?: string; dy?: number }

export interface Visor3D {
  /** Si la biblioteca tiene visor. */
  hay: boolean
  /** Que enseñe un modelo; con `azimut` (grados), desde ese ángulo. */
  mostrar(id: string, azimut?: number): void
  /** Que compile de fondo los materiales de estos modelos (los que se ven en la rejilla): su primera vez ya no tarda. */
  precalentar(ids: string[]): void
  /** Que no haga nada de fondo (mientras se desplaza la rejilla): preparar un modelo ocupa la tarjeta gráfica. */
  pausar(si: boolean): void
  /** Girarlo con el teclado: [de lado, de arriba abajo], en pasos de 10°. */
  girar(paso: [number, number]): void
  /** Dónde va (el lugar del modelo en la ficha) y si se ve; `null`, escondido. */
  colocar(lugar: HTMLElement | null, visible?: boolean): void
  /** Quién oye sus avisos (la ficha abierta). */
  oir(oyente: ((aviso: AvisoVisor) => void) | null): void
}

/** El último `listo` del visor: qué modelo ya se ve en él, y cuántos van (dos seguidos del mismo también cuentan). */
export type ListoVisor = { id: string; n: number } | null

/**
 * El visor (lo que se le pide, que no cambia: así lo que depende de él no se vuelve a hacer), su último `listo` y el
 * iframe que hay que poner en la sección.
 */
export function useVisor3D(modelos: Modelo3D[]): { visor: Visor3D; listo: ListoVisor; marco: React.ReactNode } {
  const base = useMemo(() => {
    const v = modelos.find((m) => m.visor)?.visor
    if (!v) return null
    const u = new URL(v, location.origin)
    u.searchParams.delete('id')
    return aparte(`${u.pathname}${u.search}`)
  }, [modelos])
  const marco = useRef<HTMLIFrameElement>(null)
  const bordes = useRef<(HTMLSpanElement | null)[]>([])
  const [montado, setMontado] = useState(false)
  const cargado = useRef(false)
  const cola = useRef<unknown[]>([])
  const [listo, setListo] = useState<ListoVisor>(null)
  /** Lo último que se le pidió enseñar: si el visor se vuelve a cargar (se armó otra vez), se le pide de nuevo. */
  const ultimo = useRef<unknown>(null)
  const oyente = useRef<((aviso: AvisoVisor) => void) | null>(null)
  const lugar = useRef<{ el: HTMLElement; visible: boolean } | null>(null)
  const primero = useRef<string | undefined>(undefined)
  primero.current = modelos.find((m) => m.visor)?.id

  const enviar = useCallback((m: unknown) => {
    if ((m as { mostrar?: string }).mostrar) ultimo.current = m
    if (cargado.current) marco.current?.contentWindow?.postMessage(m, '*')
    else {
      cola.current.push(m)
      setMontado(true)
    }
  }, [])
  // Se monta con la página quieta (y antes, si se pide un modelo): calienta su código y su escena.
  useEffect(() => {
    if (!base) return
    const t = window.setTimeout(() => setMontado(true), 1500)
    return () => clearTimeout(t)
  }, [base])
  // Lo que dice el visor: solo el nuestro.
  useEffect(() => {
    const oir = (e: MessageEvent) => {
      const d = e.data as AvisoVisor & { visor3d?: boolean }
      if (!d?.visor3d || e.source !== marco.current?.contentWindow) return
      // Ya oye: lo guardado; y si no se le pidió nada, un modelo, para que arme su escena y compile lo común.
      if (d.que === 'hola') {
        cargado.current = true
        const guardado = cola.current.splice(0)
        if (!guardado.some((m) => (m as { mostrar?: string }).mostrar)) guardado.push(ultimo.current ?? (primero.current && { mostrar: primero.current }))
        guardado.unshift({ angosto: matchMedia(ANGOSTO).matches })
        for (const m of guardado) if (m) marco.current?.contentWindow?.postMessage(m, '*')
        ajustar()
      }
      if (d.que === 'listo' && d.id) setListo((antes) => ({ id: d.id!, n: (antes?.n ?? 0) + 1 }))
      oyente.current?.(d)
    }
    addEventListener('message', oir)
    return () => removeEventListener('message', oir)
  }, [])
  // Angosto o no, también si cambia el ancho con la ficha abierta.
  useEffect(() => {
    const mq = matchMedia(ANGOSTO)
    const avisa = () => enviar({ angosto: mq.matches })
    mq.addEventListener('change', avisa)
    return () => mq.removeEventListener('change', avisa)
  }, [enviar])

  /** Pone el iframe encima de su lugar, con un recorte que deja fuera las flechas de la ficha. */
  const ajustar = useCallback(() => {
    const m = marco.current
    if (!m) return
    const l = lugar.current
    if (!l) {
      m.classList.add('oculto')
      m.style.clipPath = ''
      for (const b of bordes.current) if (b) b.tabIndex = -1
      return
    }
    const r = l.el.getBoundingClientRect()
    Object.assign(m.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` })
    // Los botones de la ficha que caen encima (las flechas; en angosto, también cerrar) quedan fuera del recorte.
    const ficha = l.el.closest('.m3d-ficha') ?? l.el
    const huecos = [...ficha.querySelectorAll<HTMLElement>('.m3d-paso, .m3d-cerrar')].flatMap((b) => {
      const c = b.getBoundingClientRect()
      if (c.right < r.left || c.left > r.right || c.bottom < r.top || c.top > r.bottom) return []
      const [x0, y0, x1, y1] = [c.left - r.left - 4, c.top - r.top - 4, c.right - r.left + 4, c.bottom - r.top + 4]
      return [`${x0}px ${y0}px, ${x1}px ${y0}px, ${x1}px ${y1}px, ${x0}px ${y1}px, ${x0}px ${y0}px`]
    })
    m.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0${huecos.map((h) => `, ${h}, 0 0`).join('')})`
    m.classList.toggle('oculto', !l.visible)
    for (const b of bordes.current) if (b) b.tabIndex = l.visible ? 0 : -1
  }, [])
  // Sigue a su lugar: al cambiar el tamaño, al desplazar la ficha y mientras la ficha entra (su animación).
  useEffect(() => {
    const cada = () => lugar.current && ajustar()
    addEventListener('resize', cada)
    addEventListener('scroll', cada, true)
    return () => (removeEventListener('resize', cada), removeEventListener('scroll', cada, true))
  }, [ajustar])
  const colocar = useCallback(
    (el: HTMLElement | null, visible = false) => {
      lugar.current = el ? { el, visible } : null
      ajustar()
      if (!el) return
      if (!visible) setMontado(true)
      // La ficha entra con una animación de 0,22 s: se sigue su lugar mientras tanto.
      const hasta = performance.now() + 400
      const sigue = () => {
        ajustar()
        if (performance.now() < hasta && lugar.current?.el === el) requestAnimationFrame(sigue)
      }
      requestAnimationFrame(sigue)
    },
    [ajustar]
  )

  const visor = useMemo<Visor3D>(
    () => ({
      hay: !!base,
      mostrar: (id, azimut) => enviar({ mostrar: id, ...(azimut === undefined ? {} : { azimut }) }),
      girar: (paso) => enviar({ girar: paso }),
      precalentar: (ids) => ids.length && enviar({ precalentar: ids }),
      pausar: (si) => cargado.current && marco.current?.contentWindow?.postMessage({ pausa: si }, '*'),
      colocar,
      oir: (o) => (oyente.current = o),
    }),
    [base, enviar, colocar]
  )

  // Su dirección no cambia con el ancho (angosto se le dice aparte): cambiarla lo volvía a cargar y se perdía lo
  // preparado. Solo cambia si se vuelve a armar (otra fecha); entonces carga de nuevo y, al decir `hola`, se le pide
  // otra vez lo último.
  const src = useMemo(() => base && `${base}${base.includes('?') ? '&' : '?'}angosto=${matchMedia(ANGOSTO).matches ? 1 : 0}`, [base])
  useLayoutEffect(() => {
    cargado.current = false
  }, [src])
  // Tab no entra al visor (no tiene nada que enfocar), y al salir de él con Tab o Mayús+Tab el navegador iría a lo que
  // le sigue o le precede en la página, la rejilla de atrás: lo atajan dos bordes, que con el visor a la vista devuelven
  // el foco a la ficha (al primero o al último de ella). Dentro del visor, la tecla no llega a su página.
  const borde = (i: number, tecla: string) => (
    <span ref={(b) => void (bordes.current[i] = b)} className="m3d-visor-borde" tabIndex={-1} onFocus={() => oyente.current?.({ que: 'tecla', key: tecla })} />
  )
  const iframe =
    src && montado ? (
      <>
        {borde(0, 'Shift+Tab')}
        <iframe ref={marco} className="m3d-visor oculto" src={src} title="Modelo en 3D" tabIndex={-1} />
        {borde(1, 'Tab')}
      </>
    ) : null
  return { visor, listo, marco: iframe }
}
