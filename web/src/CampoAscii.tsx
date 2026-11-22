import { useEffect, useRef } from 'react'
import { useDelTema } from './temas'

/**
 * El fondo de signos de los temas que lo piden (`temas.ts`, Cristal): una trama de caracteres en un lienzo que llena a su
 * padre, que se aparta del puntero al pasar. No es una animación sin fin: se pinta al cambiar de tamaño y al mover el
 * puntero dentro de su tarjeta, a 30 cuadros por segundo como mucho, y se detiene escondido o fuera de la vista. Con
 * movimiento reducido, queda quieto. En el tema Sloth no se dibuja nada. El color es el `color` de su CSS.
 */

const SIGNOS = '.:~-+=>*$%#'
const PASO_X = 8
const PASO_Y = 12
const RADIO = 110

// Cada curva tiene sus propios extremos. Algunas se cruzan y otras salen de una curva vecina.
const RAMAS_OPCIONES = [
  [.05, .91, .32, -.17, .10],
  [.31, .67, .30, -.14, .05],
  [.60, .97, .22, .14, -.06],
  [.09, .71, .64, -.23, -.06],
  [.29, .64, .50, -.17, .04],
  [.45, .86, .46, .09, .07],
  [.67, .98, .51, -.15, .06],
  [.04, .49, .85, -.20, -.06],
  [.14, .38, .76, .07, .035],
  [.27, .55, .70, -.12, -.04],
  [.31, .96, .88, -.22, .08],
  [.46, .69, .87, .07, -.04],
  [.57, .92, .84, .09, -.045],
  [.51, .94, .67, -.015, -.08],
  [.68, .96, .61, -.18, -.035],
  [.77, .98, .61, .15, .025],
  [.03, .39, .45, .10, -.035],
  [.20, .51, .49, .11, .045],
  [.10, .27, .68, .12, .045],
  [.39, .58, .60, .12, -.05],
  [.06, .26, .31, .14, -.04],
  [.79, .98, .78, -.08, .045],
] as const

/** Intensidad de las curvas, con extremos que se afinan y se desvanecen. */
function ramas(x: number, y: number, ancho: number, alto: number) {
  const u = x / ancho
  const v = y / alto
  let fuerza = 0
  for (const [inicio, fin, altura, caida, curva] of RAMAS_OPCIONES) {
    const avance = (u - inicio) / (fin - inicio)
    if (avance < 0 || avance > 1) continue
    const punta = Math.min(1, avance * 6, (1 - avance) * 6)
    const eje = altura + caida * avance + curva * Math.sin(avance * Math.PI)
    const anchoRama = 9 + 17 * punta
    fuerza = Math.max(fuerza, (1 - Math.abs(v - eje) * alto / anchoRama) * punta)
  }
  return fuerza
}

export type VarianteAscii = 'onda' | 'orbita' | 'malla' | 'onda-lateral' | 'ramas'

export function CampoAscii({ variante = 'onda' }: { variante?: VarianteAscii }) {
  return useDelTema().fondos ? <Lienzo variante={variante} /> : null
}

function Lienzo({ variante }: { variante: VarianteAscii }) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = lienzo.current
    const zona = canvas?.parentElement
    const ctx = canvas?.getContext('2d')
    if (!canvas || !zona || !ctx) return
    const reducir = matchMedia('(prefers-reduced-motion: reduce)')
    let cuadro = 0
    let puntero: { x: number; y: number } | undefined
    let salida = 0
    let mapaRamas: Float32Array | undefined
    let visible = true
    let ultimo = 0
    let tramas: Float32Array | undefined

    function pintar(tiempo: number) {
      cuadro = 0
      if (!visible || document.hidden) return
      // El fondo decorativo no necesita competir con la interfaz a 60/144 Hz.
      if (tiempo - ultimo < 33) { pedir(); return }
      ultimo = tiempo
      if (!canvas || !ctx) return
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return
      const escala = Math.min(devicePixelRatio || 1, 2)
      const ancho = Math.round(width * escala)
      const alto = Math.round(height * escala)
      if (canvas.width !== ancho || canvas.height !== alto) {
        canvas.width = ancho
        canvas.height = alto
        mapaRamas = undefined
        tramas = undefined
      }
      const columnas = Math.ceil(width / PASO_X)
      tramas ??= Float32Array.from({ length: columnas * Math.ceil(height / PASO_Y) }, (_, i) => {
        const x = i % columnas * PASO_X, y = Math.floor(i / columnas) * PASO_Y
        const fase = variante === 'orbita' ? Math.hypot(x - width * .78, (y - height * .5) * 1.5) * .075
          : variante === 'malla' ? x * .05 + y * .12 : x * .034 + Math.cos(y * .11) * 1.4
        return Math.sin(fase) * .28 + Math.sin((x + y) * .083) * .16
      })
      if (variante === 'ramas' && !mapaRamas) {
        const celdas = columnas * Math.ceil(height / PASO_Y)
        mapaRamas = Float32Array.from({ length: celdas }, (_, i) =>
          ramas(i % columnas * PASO_X, Math.floor(i / columnas) * PASO_Y, width, height))
      }
      ctx.setTransform(escala, 0, 0, escala, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.font = '10px monospace'
      ctx.textBaseline = 'top'
      ctx.fillStyle = getComputedStyle(canvas).color
      const actual = reducir.matches ? undefined : puntero
      const retorno = salida ? Math.max(0, 1 - (tiempo - salida) / 240) : 1
      let celda = 0
      for (let y = 0; y < height; y += PASO_Y) {
        for (let x = 0; x < width; x += PASO_X, celda++) {
          if (mapaRamas && mapaRamas[celda] <= 0) continue
          const trama = tramas[celda]
          const dx = actual ? x - actual.x : 0
          const dy = actual ? y - actual.y : 0
          const distancia = actual ? Math.hypot(dx, dy) : RADIO
          const huella = Math.max(0, 1 - distancia / RADIO) ** 1.4 * retorno
          const empuje = 30 * huella / Math.max(distancia, 14)
          const brillo = huella * .45
          const avance = x / width
          const eje = height * (.18 + avance * .14 + avance ** 4 * .57)
          const banda = Math.max(0, 1 - Math.abs(y - eje) / 38)
          const intensidad = variante === 'onda-lateral'
            ? banda * (.52 + trama + brillo)
            : mapaRamas ? mapaRamas[celda] * (.68 + trama * .45 + brillo)
              : .43 + trama + brillo
          if (intensidad < (mapaRamas ? .07 : .21)) continue
          ctx.globalAlpha = Math.min(.78, intensidad * .75)
          const signo = mapaRamas && intensidad < .18
            ? '.'
            : SIGNOS[Math.min(SIGNOS.length - 1, Math.floor(intensidad * SIGNOS.length))]
          ctx.fillText(signo, x + dx * empuje, y + dy * empuje)
        }
      }
      if (salida && retorno > 0 && actual) pedir()
      else if (salida) {
        salida = 0
        puntero = undefined
      }
    }

    const pedir = () => { if (!cuadro && visible && !document.hidden) cuadro = requestAnimationFrame(pintar) }
    const mover = (e: PointerEvent) => {
      if (!visible || document.hidden || reducir.matches || e.pointerType === 'touch') return
      const rect = canvas.getBoundingClientRect()
      if (e.clientX < rect.left - RADIO || e.clientX > rect.right + RADIO || e.clientY < rect.top - RADIO || e.clientY > rect.bottom + RADIO) {
        if (puntero) salir()
        return
      }
      salida = 0
      puntero = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      pedir()
    }
    const salir = () => {
      if (puntero && !salida) salida = performance.now()
      pedir()
    }
    const observar = new ResizeObserver(() => {
      mapaRamas = undefined
      tramas = undefined
      pedir()
    })
    observar.observe(canvas)
    const visibilidad = new IntersectionObserver(([entrada]) => {
      visible = entrada.isIntersecting
      if (visible) pedir()
      else { cancelAnimationFrame(cuadro); cuadro = 0; puntero = undefined; salida = 0 }
    })
    visibilidad.observe(canvas)
    const cambiarVisibilidad = () => {
      if (document.hidden) { cancelAnimationFrame(cuadro); cuadro = 0; puntero = undefined; salida = 0 }
      else pedir()
    }
    document.addEventListener('visibilitychange', cambiarVisibilidad)
    zona.addEventListener('pointermove', mover)
    zona.addEventListener('pointerleave', salir)
    reducir.addEventListener('change', salir)
    pedir()
    return () => {
      cancelAnimationFrame(cuadro)
      observar.disconnect()
      visibilidad.disconnect()
      document.removeEventListener('visibilitychange', cambiarVisibilidad)
      zona.removeEventListener('pointermove', mover)
      zona.removeEventListener('pointerleave', salir)
      reducir.removeEventListener('change', salir)
    }
  }, [variante])

  return <canvas ref={lienzo} className="campo-ascii" aria-hidden="true" />
}
