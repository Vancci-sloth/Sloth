import { playSplashSound, type SplashSound } from './splash-sound'

/** Cuánto dura la entrada antes de poder irse: el perezoso ya es el logo y acaba de guiñar (ver `splash.css`). */
const ENTRANCE_MS = 2780
/** Por si la animación de salida no avisa al acabar (la ventana oculta frena sus fotogramas). */
const EXIT_MS = 900

let ready = false
let skipped = false
let leaving = false
let sound: SplashSound | null = null

/**
 * Empieza a sonar la entrada y deja saltársela con una tecla o un clic: se va en cuanto la app esté lista, sin
 * esperar a que acabe. El clic sigue llegando a la app, que está debajo.
 */
export function startSplash(): void {
  sound = playSplashSound()
  const skip = () => {
    skipped = true
    removeEventListener('keydown', skip, true)
    removeEventListener('pointerdown', skip, true)
    if (ready) leave()
  }
  addEventListener('keydown', skip, true)
  addEventListener('pointerdown', skip, true)
}

/** Quita la entrada de la app: al momento con `now`; si no, cuando acaba (o ya, si se la saltaron), con su salida. */
export function dismissSplash({ now = false } = {}): void {
  const splash = document.getElementById('splash')
  if (!splash || ready) return
  ready = true
  if (now) return splash.remove()
  if (skipped) return leave()
  setTimeout(leave, Math.max(0, ENTRANCE_MS - performance.now()))
}

function leave(): void {
  const splash = document.getElementById('splash')
  if (!splash || leaving) return
  leaving = true
  splash.classList.add('saliendo')
  sound?.leave()
  const remove = () => splash.remove()
  splash.addEventListener('animationend', (event) => {
    if (event.target === splash && event.animationName === 'splash-iris') remove()
  })
  setTimeout(remove, EXIT_MS)
}
