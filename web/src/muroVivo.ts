import { type RefObject, useEffect, useRef } from 'react'

/**
 * El muro de la tienda que se mueve (`Tienda.tsx`): las portadas que están a la vista reproducen solas su adelanto,
 * mudo, para ver cómo es cada estilo sin entrar a ninguno. Las que salen de la pantalla se paran y sueltan su video; con
 * la ventana escondida o algo abierto encima (`parado`), todas; y la elegida no, que ya se ve en el visor.
 *
 * Va por fuera de React: cada portada trae ya su `<video class="muro-vivo">` vacío, con lo que tiene que cargar en
 * `data-src`, y aquí se le pone y se le quita. Antes cada portada que entraba o salía volvía a dibujar el muro entero y
 * montaba o desmontaba un video: al bajar daba tirones (medido con la GPU real, `docs/agents/rendimiento.md`). Por lo
 * mismo, una portada arranca solo si lleva un momento a la vista (`QUIETA`: las que pasan de largo al deslizar no
 * cargan nada) y de una en una (`CADA`: diez que aparecen juntas no abren diez videos en el mismo cuadro).
 */
const QUIETA = 160
const CADA = 60
/** De un video sin adelanto se repite su principio: estos segundos (`data-tope`). */
export const PRINCIPIO = 8

/** `cuales`: los estilos del muro, en su orden; al cambiar, se vuelve a mirar cuáles están a la vista. */
export function useMuroVivo(muro: RefObject<HTMLElement | null>, cuales: string, parado: boolean, elegido: string | undefined) {
  const ahora = useRef({ parado, elegido })
  ahora.current = { parado, elegido }
  const repasar = useRef(() => {})

  useEffect(() => {
    const el = muro.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const aLaVista = new Set<Element>()
    const esperas = new Map<HTMLVideoElement, number>()
    const cola: HTMLVideoElement[] = []
    let turno = 0

    const debe = (v: HTMLVideoElement) => {
      const celda = v.closest<HTMLElement>('.muro-estilo')
      return !!celda && aLaVista.has(celda) && !ahora.current.parado && !document.hidden && celda.dataset.id !== ahora.current.elegido
    }
    /** `data-vivo`: en la cola para arrancar, o ya con su video puesto. */
    function parar(v: HTMLVideoElement) {
      clearTimeout(esperas.get(v))
      esperas.delete(v)
      const estaba = v.dataset.vivo
      delete v.dataset.vivo
      if (estaba !== 'anda') return
      v.classList.remove('anda')
      v.pause()
      // Sin fuente suelta lo que bajaba y su decodificador: la GPU tiene pocos, y son para lo que se ve.
      v.removeAttribute('src')
      v.load()
    }
    function siguiente() {
      turno = 0
      let v = cola.shift()
      while (v && !(v.dataset.vivo === 'cola' && debe(v))) {
        if (v.dataset.vivo === 'cola') delete v.dataset.vivo
        v = cola.shift()
      }
      if (!v) return
      v.dataset.vivo = 'anda'
      v.src = v.dataset.src ?? ''
      void v.play().catch(() => {})
      turno = window.setTimeout(siguiente, CADA)
    }
    function repaso() {
      for (const v of el!.querySelectorAll<HTMLVideoElement>('.muro-vivo')) {
        if (!debe(v)) parar(v)
        else if (!v.dataset.vivo && !esperas.has(v))
          esperas.set(
            v,
            window.setTimeout(() => {
              esperas.delete(v)
              if (!debe(v)) return
              v.dataset.vivo = 'cola'
              cola.push(v)
              if (!turno) siguiente()
            }, QUIETA)
          )
      }
    }
    // Aparece sobre su portada cuando ya tiene qué enseñar; y el que no trae adelanto repite su principio.
    const alAndar = (ev: Event) => ev.target instanceof HTMLVideoElement && ev.target.dataset.vivo === 'anda' && ev.target.classList.add('anda')
    const alAvanzar = (ev: Event) => {
      const v = ev.target
      if (v instanceof HTMLVideoElement && v.dataset.tope && v.currentTime > Number(v.dataset.tope)) v.currentTime = 0
    }
    // Estos eventos no suben por el árbol: se oyen al bajar.
    el.addEventListener('playing', alAndar, true)
    el.addEventListener('timeupdate', alAvanzar, true)
    const mira = new IntersectionObserver(
      (cambios) => {
        for (const c of cambios) {
          if (c.isIntersecting) aLaVista.add(c.target)
          else aLaVista.delete(c.target)
        }
        repaso()
      },
      { threshold: 0.2 }
    )
    for (const portada of el.querySelectorAll('.muro-estilo')) mira.observe(portada)
    document.addEventListener('visibilitychange', repaso)
    repasar.current = repaso
    return () => {
      repasar.current = () => {}
      mira.disconnect()
      document.removeEventListener('visibilitychange', repaso)
      el.removeEventListener('playing', alAndar, true)
      el.removeEventListener('timeupdate', alAvanzar, true)
      clearTimeout(turno)
      aLaVista.clear()
      for (const v of el.querySelectorAll<HTMLVideoElement>('.muro-vivo')) parar(v)
    }
  }, [cuales])

  useEffect(() => repasar.current(), [parado, elegido])
}
