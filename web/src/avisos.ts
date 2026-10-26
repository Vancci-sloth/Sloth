import { useEffect, useRef, useState } from 'react'
import type { Card, SessionMeta } from '../../shared/types'

/**
 * Los avisos: cuando un hilo termina, te espera o se detiene con un error mientras miras otra cosa, una notificación de
 * Windows y un tono corto; y en el título de la ventana, cuántos terminaron sin que los abrieras: «(2) Sloth». Un video
 * tarda minutos y nadie se queda mirando.
 *
 * No avisa del hilo que tienes abierto con la ventana al frente, ni dos veces por lo mismo (solo cuando un hilo pasa de
 * trabajar a quieto). Un lote avisa una vez, cuando ya no trabaja ninguno de sus videos; antes, solo si uno se detiene con
 * un error, que lo pone en pausa. Lo que acaba casi a la vez va en una sola notificación.
 */

type Aviso = 'notificaciones' | 'sonido'
/**
 * Los interruptores de Opciones, encendidos de entrada. Las notificaciones, además, necesitan el permiso del navegador;
 * en la ventana de Sloth (electron/main.ts) se da solo, y salen como avisos de Windows a nombre de Sloth.
 */
export const encendido = (a: Aviso) => localStorage.getItem(`avisos:${a}`) !== '0'
export const encender = (a: Aviso, si: boolean) => localStorage.setItem(`avisos:${a}`, si ? '1' : '0')

/** Si un hilo trabaja o está por trabajar: un turno, algo en segundo plano, o su turno en la cola (también tras una caída). */
const trabaja = (s: SessionMeta) => s.running || !!s.background?.length || !!s.pendiente
/** Un video cuenta para su lote si trabaja o espera sitio. Los que esperan a «Seguir» no: el lote ya no avanza solo. */
const trabajaEnLote = (s: SessionMeta) => s.running || !!s.background?.length || (!!s.pendiente && !s.lote?.pausa)

/**
 * Cuánto se espera antes de avisar. Junta lo que acaba casi a la vez y deja pasar el instante entre una caída y su
 * retomar, que no es terminar.
 */
const ESPERA = 3000

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`)

export function useAvisos(p: { sessions: SessionMeta[]; cards: Card[]; openId: string | null; sinVer: number; abrir(id: string): void }) {
  const ultimo = useRef(p)
  ultimo.current = p
  // Si trabajaba cada hilo (por su id) y cada lote (`lote:<id>`) la última vez que se miró.
  const antes = useRef(new Map<string, boolean>())
  const porAvisar = useRef(new Set<string>())
  const reloj = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const ahora = new Map<string, boolean>()
    for (const s of p.sessions) {
      ahora.set(s.id, trabaja(s))
      if (s.lote) ahora.set(`lote:${s.lote.id}`, !!ahora.get(`lote:${s.lote.id}`) || trabajaEnLote(s))
    }
    // Lo que no estaba antes (la primera lista, un hilo nuevo) no ha terminado nada.
    for (const [clave, si] of ahora) if (antes.current.get(clave) && !si) porAvisar.current.add(clave)
    antes.current = ahora
    if (!porAvisar.current.size || reloj.current) return
    reloj.current = setTimeout(() => {
      reloj.current = undefined
      const claves = [...porAvisar.current]
      porAvisar.current.clear()
      repasar(claves, ultimo.current)
    }, ESPERA)
  }, [p.sessions])

  useEffect(() => () => clearTimeout(reloj.current), [])

  // Abrir un hilo quita su notificación de la esquina de Windows: ya la viste.
  useEffect(() => {
    if (!p.openId) return
    abiertas.get(p.openId)?.close()
    abiertas.delete(p.openId)
  }, [p.openId])

  useEffect(() => {
    document.title = p.sinVer ? `(${p.sinVer}) Sloth` : 'Sloth'
  }, [p.sinVer])
}

/** Una notificación: `abre` es el hilo que abre al pulsarla; `ids`, los que nombra. */
type Nota = { titulo: string; cuerpo: string; abre?: string; ids: string[] }

/** Lo que dejó de trabajar hace un momento: si sigue quieto y no lo estás mirando, se avisa. */
function repasar(claves: string[], { sessions, cards, openId, abrir }: { sessions: SessionMeta[]; cards: Card[]; openId: string | null; abrir(id: string): void }) {
  const mirando = (ids: string[]) => document.hasFocus() && !!openId && ids.includes(openId)
  const notas: Nota[] = []
  // Primero los lotes: el aviso de uno que acaba ya cuenta los errores de sus videos.
  const lotes = new Set<string>()
  for (const clave of claves) {
    if (!clave.startsWith('lote:')) continue
    const lote = clave.slice(5)
    const videos = sessions.filter((s) => s.lote?.id === lote).sort((a, b) => a.lote!.n - b.lote!.n)
    if (!videos.length || videos.some(trabajaEnLote)) continue
    lotes.add(lote)
    const ids = videos.map((s) => s.id)
    if (mirando(ids)) continue
    const fallaron = videos.filter((s) => !s.pendiente && s.acaboBien === false)
    const esperan = videos.filter((s) => s.pendiente).length
    const listos = videos.length - fallaron.length - esperan
    const partes = [
      listos === videos.length ? `los ${listos} terminaron o te esperan` : listos && `${plural(listos, 'terminó o te espera', 'terminaron o te esperan')}`,
      fallaron.length && plural(fallaron.length, 'se detuvo con un error', 'se detuvieron con un error'),
      esperan && `${plural(esperan, 'espera', 'esperan')} a que sigas el lote`
    ].filter(Boolean)
    const card = cards.find((c) => c.id === videos[0].cardId)?.title
    notas.push({
      titulo: `Lote de ${videos.length}${card ? ` · ${card}` : ''}`,
      cuerpo: `Ya no trabaja ninguno: ${partes.join(', ').replace(/, ([^,]*)$/, ' y $1')}.`,
      abre: (fallaron[0] ?? videos[0]).id,
      ids
    })
  }
  for (const clave of claves) {
    const s = sessions.find((x) => x.id === clave)
    if (!s || trabaja(s) || mirando([s.id])) continue
    // De un video del lote solo se avisa si se detuvo: lo demás va en el aviso del lote.
    if (s.lote && (lotes.has(s.lote.id) || s.acaboBien !== false)) continue
    notas.push({
      titulo: s.title,
      cuerpo: s.acaboBien === false ? `Se detuvo con un error.${s.lote ? ' El lote quedó en pausa.' : ''}` : 'Terminó y te espera.',
      abre: s.id,
      ids: [s.id]
    })
  }
  if (!notas.length) return
  if (encendido('sonido')) sonar()
  // Varios a la vez, en una sola notificación con uno por línea: un lote grande no llena la pantalla.
  const nota =
    notas.length === 1
      ? notas[0]
      : { titulo: `${notas.length} hilos te esperan`, cuerpo: notas.map((n) => n.titulo).join('\n'), abre: notas[0].abre, ids: notas.flatMap((n) => n.ids) }
  void notificar(nota, abrir)
}

/** Las notificaciones que siguen en la esquina de Windows, por cada hilo que nombran. */
const abiertas = new Map<string, Notification>()

/** Al pulsarla, Sloth pasa al frente y abre el hilo. Sin sonido de Windows: el de Sloth tiene su interruptor. */
export async function notificar({ titulo, cuerpo, abre, ids }: Nota, abrir?: (id: string) => void) {
  if (!encendido('notificaciones') || !('Notification' in window) || Notification.permission !== 'granted') return
  const n = new Notification(titulo, { body: cuerpo, icon: await icono(), silent: true })
  n.onclick = () => {
    // Una ventana que no está al frente no puede traerse sola: se lo pide a la ventana de Sloth.
    if (window.sloth) window.sloth.traer()
    else window.focus()
    if (abre) abrir?.(abre)
    n.close()
  }
  for (const id of ids) {
    abiertas.get(id)?.close()
    abiertas.set(id, n)
  }
}

/** El logo en PNG: las notificaciones de Windows no dibujan SVG. Se hace una vez, del de la app. */
let png: Promise<string> | null = null
function icono() {
  png ??= new Promise((ok) => {
    const img = new Image()
    img.onload = () => {
      const lienzo = document.createElement('canvas')
      lienzo.width = lienzo.height = 128
      lienzo.getContext('2d')?.drawImage(img, 0, 0, 128, 128)
      ok(lienzo.toDataURL('image/png'))
    }
    img.onerror = () => ok('')
    img.src = '/icon.svg'
  })
  return png
}

/**
 * Dos notas suaves que suben, hechas con Web Audio: sin archivos de sonido. La ventana de Sloth deja sonar siempre; un
 * navegador, solo a una página que ya pulsaste desde que cargó: tras una recarga, el primero puede no oírse.
 */
export function sonar() {
  try {
    const ctx = new AudioContext()
    ;[659.25, 987.77].forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      const t = ctx.currentTime + i * 0.14
      o.frequency.value = f
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.12, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.55)
    })
    setTimeout(() => ctx.close(), 1200)
  } catch {
    // Sin audio no pasa nada.
  }
}

/**
 * El permiso de notificaciones que el navegador le da a Sloth, al día: se vuelve a leer al volver a la ventana, que es
 * cuando lo pudiste cambiar en sus ajustes. En la ventana de Sloth siempre está dado.
 */
export function usePermiso() {
  const leer = () => ('Notification' in window ? Notification.permission : 'sin-api')
  const [permiso, setPermiso] = useState(leer)
  useEffect(() => {
    const al = () => setPermiso(leer())
    addEventListener('focus', al)
    return () => removeEventListener('focus', al)
  }, [])
  return [permiso, setPermiso] as const
}
