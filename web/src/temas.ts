import { useSyncExternalStore } from 'react'

/**
 * Los temas de la interfaz (Opciones → Apariencia). Cada uno es un atributo en la raíz (`<html data-tema="…">`) y su
 * archivo de CSS en `web/src/temas/<id>.css`, que solo cambia variables y estilos bajo `:root[data-tema="<id>"]`: ningún
 * componente pregunta en qué tema está. Lo único que un tema puede encender aparte son los fondos de signos
 * (`CampoAscii.tsx`) y el movimiento de los controles (`Movimiento.tsx`), que lo leen de aquí. «Sloth» es el de siempre:
 * sin atributo, sin fondos y sin movimiento. Se guarda en el navegador, como las demás opciones de la interfaz (desde la
 * web, sube a la computadora con lo demás, `web.ts`).
 *
 * Un tema nuevo: su entrada en `TEMAS` y su archivo en `temas/`, importado en `main.tsx`.
 */
export const TEMAS = {
  sloth: { nombre: 'Sloth', descripcion: 'Oscuro cálido con acento ámbar, el de siempre.', fondos: false, movimiento: false },
  claro: { nombre: 'Claro', descripcion: 'Fondo claro y cálido con acento ámbar, para trabajar de día.', fondos: false, movimiento: false },
  cristal: { nombre: 'Cristal', descripcion: 'Grises neutros, controles de cristal con el color de cada agente, fondos de signos que siguen al puntero y transiciones suaves.', fondos: true, movimiento: true }
} as const

export type Tema = keyof typeof TEMAS
const CLAVE = 'tema'
const esTema = (t: unknown): t is Tema => typeof t === 'string' && Object.hasOwn(TEMAS, t)

function leido(): Tema {
  try {
    const t = localStorage.getItem(CLAVE)
    return esTema(t) ? t : 'sloth'
  } catch {
    return 'sloth'
  }
}

let actual: Tema = leido()
const quienes = new Set<() => void>()

/** Pone el tema en la raíz. Al arrancar (`main.tsx`), antes de dibujar nada, para que no se vea el otro un instante. */
export function aplicarTema(tema: Tema = actual) {
  if (tema === 'sloth') delete document.documentElement.dataset.tema
  else document.documentElement.dataset.tema = tema
  // La barra de título y el fondo de la ventana (electron/main.ts), del color del tema.
  window.sloth?.pintar?.(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), tema === 'claro')
}

/** Cambia de tema al instante y lo recuerda. */
export function ponerTema(tema: Tema) {
  actual = tema
  try {
    localStorage.setItem(CLAVE, tema)
  } catch {}
  aplicarTema(tema)
  for (const f of quienes) f()
}

export function useTema(): Tema {
  return useSyncExternalStore(
    (f) => (quienes.add(f), () => void quienes.delete(f)),
    () => actual
  )
}

/** Lo que el tema enciende aparte de sus colores. */
export const useDelTema = () => TEMAS[useTema()]
