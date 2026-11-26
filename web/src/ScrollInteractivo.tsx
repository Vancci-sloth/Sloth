import { useEffect } from 'react'

const compatible = '(forced-colors: none) and (hover: hover) and (pointer: fine)'
const paso = 10
// Coincide con el 76% de altura del carril en styles.css.
const margenCarril = .12
const limitar = (n: number) => Math.min(1, Math.max(0, n))

function avanceDe(elemento: HTMLElement) {
  const rango = elemento.scrollHeight - elemento.clientHeight
  return rango > 0 ? limitar(elemento.scrollTop / rango) : 0
}

type Respuesta = { elemento: HTMLElement; pedido?: HTMLElement }

function respuestasDelChat(chat: HTMLElement) {
  const respuestas: Respuesta[] = []
  let pedido: HTMLElement | undefined
  for (const elemento of chat.querySelectorAll<HTMLElement>('.user-msg .bubble, [data-scroll-respuesta]')) {
    if (elemento.hasAttribute('data-scroll-respuesta')) {
      if (elemento.getClientRects().length) respuestas.push({ elemento, pedido })
    } else pedido = elemento
  }
  return respuestas
}

function respuestaEn(respuestas: Respuesta[], y: number) {
  let izquierda = 0
  let derecha = respuestas.length
  while (izquierda < derecha) {
    const centro = Math.floor((izquierda + derecha) / 2)
    if (respuestas[centro].elemento.getBoundingClientRect().bottom < y) izquierda = centro + 1
    else derecha = centro
  }
  const siguiente = respuestas[izquierda]
  const anterior = respuestas[izquierda - 1]
  if (!siguiente || !anterior) return siguiente ?? anterior
  return siguiente.elemento.getBoundingClientRect().top - y < y - anterior.elemento.getBoundingClientRect().bottom
    ? siguiente : anterior
}

function extracto(texto: string, maximo: number) {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  return limpio.length > maximo ? limpio.slice(0, maximo - 1).trimEnd() + '…' : limpio
}

/** Mantiene el scroll nativo y agrega una vista previa al acercar el puntero a su carril vertical. */
export function ScrollInteractivo() {
  useEffect(() => {
    const consulta = matchMedia(compatible)
    const carril = document.createElement('div')
    carril.className = 'scroll-interactivo'
    carril.hidden = true
    carril.setAttribute('aria-hidden', 'true')
    const vista = document.createElement('div')
    vista.className = 'scroll-vista-chat'
    vista.hidden = true
    vista.setAttribute('aria-hidden', 'true')
    const titulo = document.createElement('strong')
    const detalle = document.createElement('p')
    vista.append(titulo, detalle)
    document.body.append(carril, vista)

    let scroller: HTMLElement | undefined
    let puntero: PointerEvent | undefined
    let frame = 0
    let arrastre: number | undefined
    let inicio = 0
    let alto = 0
    let marca: number | undefined
    let mensajes: Respuesta[] = []
    let alturaMensajes = 0
    const marcas = new WeakMap<HTMLElement, number>()
    const posiciones = new WeakMap<HTMLElement, number>()

    function guardarMarca(elemento: HTMLElement, avance: number) {
      const porcentaje = avance * 100
      if (marcas.get(elemento) === avance) return
      marcas.set(elemento, avance)
      elemento.style.setProperty('--avance-scroll', porcentaje.toFixed(2) + '%')
    }

    function ocultar() {
      if (arrastre !== undefined && carril.hasPointerCapture(arrastre)) carril.releasePointerCapture(arrastre)
      arrastre = undefined
      if (scroller) {
        if (marca !== undefined) guardarMarca(scroller, marca)
        scroller.removeAttribute('data-scroll-previsualizado')
      }
      scroller = undefined
      marca = undefined
      mensajes = []
      alturaMensajes = 0
      carril.hidden = true
      vista.hidden = true
    }

    function areaVisible(elemento: HTMLElement, arriba: number, abajo: number) {
      let techo = Math.max(0, arriba)
      let piso = Math.min(innerHeight, abajo)
      for (let padre = elemento.parentElement; padre && padre !== document.body; padre = padre.parentElement) {
        if (getComputedStyle(padre).overflowY !== 'visible') {
          const caja = padre.getBoundingClientRect()
          techo = Math.max(techo, caja.top)
          piso = Math.min(piso, caja.bottom)
        }
      }
      return [techo, piso]
    }

    function actualizar() {
      frame = 0
      const e = puntero
      if (!e || !consulta.matches || e.pointerType !== 'mouse') { ocultar(); return }
      if (arrastre !== undefined) return
      if (e.buttons) { ocultar(); return }
      if (e.target === carril && scroller?.isConnected) {
        dibujar(e.clientY)
        return
      }
      const objetivo = document.elementFromPoint(e.clientX, e.clientY)
      // Los controles nativos siguen disponibles en diálogos y menús emergentes de la capa superior.
      if (!(objetivo instanceof Element) || objetivo.closest('dialog[open], :popover-open')) {
        ocultar()
        return
      }
      const elemento = objetivo.closest<HTMLElement>('[data-scroll-chat]')
      if (!elemento || elemento.scrollHeight <= elemento.clientHeight + 1) { ocultar(); return }
      const rect = elemento.getBoundingClientRect()
      const estilo = getComputedStyle(elemento)
      const escala = rect.width / elemento.offsetWidth
      const bordeIzquierdo = parseFloat(estilo.borderLeftWidth) || 0
      const bordeDerecho = parseFloat(estilo.borderRightWidth) || 0
      const ancho = (elemento.offsetWidth - elemento.clientWidth - bordeIzquierdo - bordeDerecho) * escala
      const izquierda = elemento.clientLeft > bordeIzquierdo + 1
        ? rect.left + bordeIzquierdo * escala : rect.left + (elemento.clientLeft + elemento.clientWidth) * escala
      const escalaY = rect.height / elemento.offsetHeight
      const altoDisponible = elemento.clientHeight * escalaY
      const recorte = Math.max(0, (altoDisponible - 2) * margenCarril)
      const arriba = rect.top + elemento.clientTop * escalaY + recorte
      const largo = altoDisponible - 2 * recorte
      const [visibleArriba, visibleAbajo] = areaVisible(elemento, arriba, arriba + largo)
      if (ancho <= 2 || e.clientX < izquierda - 10 || e.clientX >= izquierda + ancho
        || e.clientY < visibleArriba || e.clientY >= visibleAbajo) {
        ocultar()
        return
      }
      if (scroller !== elemento) {
        ocultar()
        scroller = elemento
        marca = marcas.get(scroller)
        posiciones.set(scroller, scroller.scrollTop)
        scroller.setAttribute('data-scroll-previsualizado', '')
      }
      inicio = arriba
      alto = largo
      Object.assign(carril.style, {
        left: izquierda + 'px', top: inicio + 'px', width: ancho + 'px', height: alto + 'px',
        clipPath: 'inset(' + (visibleArriba - arriba) + 'px 0 ' + (arriba + largo - visibleAbajo) + 'px 0)'
      })
      carril.hidden = false
      dibujar(e.clientX >= izquierda ? e.clientY : undefined)
    }

    function mostrarVista(avance: number, y: number) {
      if (!scroller) return
      if (alturaMensajes !== scroller.scrollHeight) {
        mensajes = respuestasDelChat(scroller)
        alturaMensajes = scroller.scrollHeight
      }
      const vistaChat = scroller.getBoundingClientRect()
      const escala = vistaChat.height / scroller.offsetHeight
      const destino = avance * (scroller.scrollHeight - scroller.clientHeight)
      const centro = vistaChat.top + (scroller.clientTop + destino - scroller.scrollTop + scroller.clientHeight / 2) * escala
      const respuesta = respuestaEn(mensajes, centro)
      if (!respuesta) { vista.hidden = true; return }
      const texto = respuesta.elemento.getAttribute('data-scroll-respuesta')
        || respuesta.elemento.querySelector('.md')?.textContent || ''
      const resumen = extracto(texto, 240)
      if (!resumen) { vista.hidden = true; return }
      const encabezado = extracto(respuesta.pedido?.textContent ?? '', 80) || 'Respuesta de IA'
      if (titulo.textContent !== encabezado) titulo.textContent = encabezado
      if (detalle.textContent !== resumen) detalle.textContent = resumen
      vista.hidden = false
      const ancho = vista.offsetWidth
      const izquierda = carril.getBoundingClientRect().left
      vista.style.left = Math.max(8, Math.min(innerWidth - ancho - 8, izquierda - ancho - 8)) + 'px'
      vista.style.top = Math.max(8, Math.min(innerHeight - vista.offsetHeight - 8, y - vista.offsetHeight / 2)) + 'px'
    }

    function dibujar(y?: number, vecinas = y !== undefined) {
      if (!scroller || alto <= 2) return
      if (y !== undefined) marca = limitar((y - inicio - 1) / (alto - 2))
      const local = 1 + (marca ?? avanceDe(scroller)) * (alto - 2)
      carril.style.setProperty('--marca-y', local + 'px')
      carril.style.setProperty('--vecinas-y', Math.round(local / paso) * paso + 'px')
      carril.toggleAttribute('data-vecinas', vecinas)
      if (y !== undefined && arrastre === undefined) mostrarVista(marca ?? 0, y)
      else if (!vecinas || arrastre !== undefined) vista.hidden = true
    }

    function irA(y: number) {
      if (!scroller || alto <= 2) return
      const avance = limitar((y - inicio - 1) / (alto - 2))
      scroller.scrollTo({ top: avance * (scroller.scrollHeight - scroller.clientHeight), behavior: 'instant' })
      dibujar(y)
    }

    function mover(e: PointerEvent) {
      puntero = e
      if (e.pointerId === arrastre) { irA(e.clientY); return }
      if (!frame) frame = requestAnimationFrame(actualizar)
    }

    function iniciar(e: PointerEvent) {
      if (e.button !== 0 || !scroller) return
      e.preventDefault()
      arrastre = e.pointerId
      carril.setPointerCapture(e.pointerId)
      irA(e.clientY)
    }

    function soltar(e: PointerEvent) {
      arrastre = undefined
      puntero = e
      if (!frame) frame = requestAnimationFrame(actualizar)
    }

    function moverRueda(e: WheelEvent) {
      if (!scroller || e.ctrlKey) return
      const unidad = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientHeight : 1
      e.preventDefault()
      scroller.scrollBy({ top: e.deltaY * unidad, left: e.deltaX * unidad, behavior: 'instant' })
    }

    function revisarLimites(e: Event) {
      const elemento = e.target === document ? document.scrollingElement : e.target
      if (!(elemento instanceof HTMLElement) || !consulta.matches) return
      if (!elemento.hasAttribute('data-scroll-chat')) {
        if (scroller && elemento.contains(scroller)) ocultar()
        return
      }
      if (elemento.scrollHeight <= elemento.clientHeight || posiciones.get(elemento) === elemento.scrollTop) return
      posiciones.set(elemento, elemento.scrollTop)
      if (elemento === scroller && arrastre !== undefined) return
      const avance = avanceDe(elemento)
      guardarMarca(elemento, avance)
      if (elemento === scroller) {
        marca = avance
        dibujar(undefined, carril.matches(':hover'))
      } else if (scroller && elemento.contains(scroller)) ocultar()
    }

    function salir() {
      puntero = undefined
      ocultar()
    }

    const abort = new AbortController()
    const { signal } = abort
    addEventListener('pointermove', mover, { signal, passive: true })
    document.documentElement.addEventListener('pointerleave', salir, { signal })
    addEventListener('scroll', revisarLimites, { signal, capture: true, passive: true })
    addEventListener('resize', salir, { signal })
    addEventListener('hashchange', salir, { signal })
    addEventListener('blur', salir, { signal })
    consulta.addEventListener('change', salir, { signal })
    carril.addEventListener('pointerdown', iniciar, { signal })
    carril.addEventListener('lostpointercapture', soltar, { signal })
    carril.addEventListener('wheel', moverRueda, { signal, passive: false })

    return () => {
      abort.abort()
      cancelAnimationFrame(frame)
      ocultar()
      carril.remove()
      vista.remove()
    }
  }, [])
  return null
}
