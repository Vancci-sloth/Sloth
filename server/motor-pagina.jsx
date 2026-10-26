// La página del motor en vivo (server/motor.ts): el video del hilo en el Player de Remotion, tal cual saldrá, sin
// renderizarlo. La arma el esbuild del proyecto: `react`, `@remotion/player` y `sloth:raiz` (su `src/index.ts`) salen de
// la carpeta del video, no de Sloth. Es JavaScript a propósito: se arma con los paquetes del proyecto, que Sloth no trae.
//
// El monitor de Sloth (web/src/Monitor.tsx) la mueve con mensajes:
//   { vivo: 'ir', t } · { vivo: 'play' } · { vivo: 'pausa' } · { vivo: 'velocidad', x } · { vivo: 'silencio', si }
//   { vivo: 'bucle', si, desde?, hasta? } · { vivo: 'soltar' } (quita lo elegido)
// y ella le avisa:
//   { vivo: 'listo', duracion, fps, ancho, alto } · { vivo: 'tiempo', t, playing } · { vivo: 'escenas', escenas, audios }
//   { vivo: 'elegido', elemento } · { vivo: 'tecla', code, shift } · { vivo: 'error', mensaje }
//   { vivo: 'piezas', piezas } (lo que se ve y cuándo, en cuanto el sondeo recorre el video)
import { Player, PlayerInternals } from '@remotion/player'
import { lazy, useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import 'sloth:raiz'

const avisar = (m) => parent.postMessage(m, '*')
// Los errores sueltos ya los avisa la página (server/motor.ts), desde antes de que cargue el proyecto; aquí, los de React.
const fallo = (e) => avisar({ vivo: 'error', mensaje: String(e?.message ?? e ?? 'Error').slice(0, 400) })

/**
 * El video que registra el proyecto: `registerRoot` y `<Composition>` solo lo anotan (los cambia server/motor.ts). Es el
 * primero que no es una imagen fija, con lo que diga su `calculateMetadata`.
 */
async function composicion() {
  const Raiz = globalThis.__slothRaiz
  if (!Raiz) throw new Error('El proyecto no llama a registerRoot.')
  globalThis.__slothComposiciones = []
  const r = createRoot(document.createElement('div'))
  flushSync(() => r.render(<Raiz />))
  r.unmount()
  const todas = globalThis.__slothComposiciones
  const c = todas.find((x) => !x.still) ?? todas[0]
  if (!c) throw new Error('El proyecto no registra ningún video (<Composition>).')
  const props = c.defaultProps ?? {}
  const meta = c.calculateMetadata ? ((await c.calculateMetadata({ defaultProps: props, props, abortSignal: new AbortController().signal, compositionId: c.id, isRendering: false })) ?? {}) : {}
  return {
    component: c.component ?? lazy(c.lazyComponent),
    props: meta.props ?? props,
    duracion: meta.durationInFrames ?? c.durationInFrames,
    fps: meta.fps ?? c.fps,
    ancho: meta.width ?? c.width,
    alto: meta.height ?? c.height
  }
}

const nombreDe = (x) => (typeof x === 'string' ? x : (x?.displayName ?? x?.name ?? ''))

/**
 * Las escenas y los audios del video, de las secuencias que registra Remotion (las mismas que enseña su Studio). Las
 * escenas son las secuencias de más arriba que no duran el video entero; las que sí lo duran son capas (un fondo, los
 * subtítulos) y se mira dentro de ellas. En segundos.
 */
function leer(seqs, c) {
  const porId = new Map(seqs.map((s) => [s.id, s]))
  const desde = new Map()
  const abs = (s, n = 0) => {
    if (desde.has(s.id)) return desde.get(s.id)
    const padre = s.parent ? porId.get(s.parent) : undefined
    const v = s.from + (padre && n < 20 ? abs(padre, n + 1) : 0)
    desde.set(s.id, v)
    return v
  }
  const capa = (s) => s.duration >= c.duracion * 0.9
  const visible = (s) => s.type === 'sequence' && s.showInTimeline !== false && s.duration > 0
  let nivel = seqs.filter((s) => !s.parent || !porId.has(s.parent))
  let escenas = []
  for (let i = 0; i < 4 && nivel.length; i++) {
    const v = nivel.filter(visible)
    escenas = v.filter((s) => !capa(s))
    if (escenas.length) break
    const capas = new Set(v.filter(capa).map((s) => s.id))
    nivel = seqs.filter((s) => capas.has(s.parent))
  }
  const seg = (f) => Math.round((f / c.fps) * 1000) / 1000
  return {
    escenas: escenas
      .map((s) => ({ nombre: s.displayName || nombreDe(s.singleChildComponent), desde: seg(abs(s)), hasta: seg(abs(s) + s.duration) }))
      .sort((a, b) => a.desde - b.desde),
    audios: seqs
      .filter((s) => (s.type === 'audio' || s.type === 'video') && typeof s.src === 'string' && !s.muted)
      .map((s) => ({ src: s.src, desde: seg(abs(s)), hasta: seg(abs(s) + s.duration), recorte: seg(s.startMediaFrom ?? 0) }))
  }
}

const tieneFondo = (n) => {
  const cs = getComputedStyle(n)
  return cs.backgroundImage !== 'none' || !/^(transparent|rgba\(.*,\s*0\))$/.test(cs.backgroundColor)
}
const propio = (n) => /^(IMG|VIDEO|CANVAS|svg)$/.test(n.tagName) || [...n.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim())

/** Los componentes de los que sale un nodo, del más cercano al más lejano, hasta el del video: su nombre y su fibra. */
function cadena(n, c) {
  const k = Object.keys(n).find((x) => x.startsWith('__reactFiber$'))
  const todos = []
  for (let f = k && n[k]; f && todos.length < 40; f = f.return) {
    const t = f.type
    if (t === c.component) break
    const nombre = typeof t === 'function' ? t.displayName || t.name : t && typeof t === 'object' ? nombreDe(t.render) || nombreDe(t.type) || t.displayName : ''
    if (nombre && /^[A-Z]/.test(nombre) && !todos.some((x) => x.nombre === nombre)) todos.push({ nombre, f })
  }
  return todos
}

/** Cómo se llama una pieza del video, igual en el reproductor que se ve y en el del sondeo: sus componentes. */
const claveDe = (n, c) =>
  cadena(n, c)
    .map((x) => x.nombre)
    .filter((x) => !INTERNOS.test(x))
    .join(' › ')

/**
 * Elegir con el ratón algo del video en pausa, como en un editor: al pasar se marca lo que hay debajo (un texto, una
 * imagen, una tarjeta, el 3D) y con un clic queda elegido. Al monitor le llega qué es, dónde está y de qué componente sale,
 * para que el agente lo encuentre. Con el video sonando, un clic lo pausa.
 */
function elegirCon(p, c) {
  const raiz = document.getElementById('raiz')
  let actual = null
  const marca = (fija) => {
    const d = document.createElement('div')
    d.style.cssText = `position:fixed;pointer-events:none;z-index:10;display:none;box-sizing:border-box;border-radius:3px;border:1.5px ${fija ? 'solid' : 'dashed'} #e8a33d;${fija ? 'box-shadow:0 0 0 9999px rgba(15,14,12,0.18)' : ''}`
    const l = document.createElement('span')
    l.style.cssText = 'position:absolute;left:-1.5px;padding:1px 6px;border-radius:4px;background:#e8a33d;color:#1b1408;font:600 11px/16px system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
    d.append(l)
    document.body.append(d)
    return d
  }
  const pasa = marca(false)
  const fija = marca(true)

  /** Dónde se ve el video dentro de la página: el Player lo encaja sin deformarlo. */
  const marco = () => {
    const W = raiz.clientWidth
    const H = raiz.clientHeight
    const k = Math.min(W / c.ancho, H / c.alto)
    return { x: (W - c.ancho * k) / 2, y: (H - c.alto * k) / 2, w: c.ancho * k, h: c.alto * k }
  }

  /**
   * Lo que se elige bajo el ratón: lo más pequeño con algo propio que ver. Las palabras sueltas suben a su línea. Se mira
   * todo lo que hay en ese punto, de arriba abajo: una capa transparente que cubre el cuadro (un degradado) no tapa lo de
   * debajo.
   */
  function candidato(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      const n = enPila(el)
      if (n) return n
    }
    return null
  }
  function enPila(el) {
    if (!raiz.contains(el)) return null
    while (el instanceof SVGElement && el.ownerSVGElement) el = el.ownerSVGElement
    const m = marco()
    const area = m.w * m.h
    for (let n = el; n && n !== raiz; n = n.parentElement) {
      const r = n.getBoundingClientRect()
      const a = r.width * r.height
      if (a < 16) continue
      if (propio(n) && (a <= area * 0.7 || /^(IMG|VIDEO|CANVAS)$/.test(n.tagName))) {
        while (n.parentElement && getComputedStyle(n).display.startsWith('inline')) {
          const pr = n.parentElement.getBoundingClientRect()
          if (pr.width * pr.height > area * 0.6) break
          n = n.parentElement
        }
        return n
      }
      if (a <= area * 0.35 && tieneFondo(n)) return n
      if (a > area * 0.7) return null
    }
    return null
  }

  const archivo = (src) => decodeURIComponent(String(src).split(/[?#]/)[0].split('/').pop() ?? '')
  const limpio = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
  /** El trozo de `r` que cae dentro del cuadro del video. */
  const dentro = (r, m) => {
    const x = Math.max(r.left, m.x)
    const y = Math.max(r.top, m.y)
    return { x, y, w: Math.max(0, Math.min(r.right, m.x + m.w) - x), h: Math.max(0, Math.min(r.bottom, m.y + m.h) - y) }
  }
  function describir(n) {
    const m = marco()
    const r = dentro(n.getBoundingClientRect(), m)
    const tag = n.tagName
    const todos = cadena(n, c).map((x) => x.nombre)
    // Un lienzo puede ser el 3D o un video que Remotion dibuja ahí.
    const lienzo = todos.some((x) => /Video/.test(x)) ? 'video' : todos.some((x) => /Three|Canvas|Fiber/.test(x)) ? '3d' : 'imagen'
    const tipo = tag === 'IMG' ? 'imagen' : tag === 'VIDEO' ? 'video' : tag === 'CANVAS' ? lienzo : tag === 'svg' ? 'dibujo' : propio(n) ? 'texto' : 'forma'
    const texto = tag === 'IMG' ? n.alt || archivo(n.currentSrc || n.src) : tag === 'VIDEO' ? archivo(n.currentSrc || n.src) : tag === 'CANVAS' ? '' : limpio(n.innerText || n.textContent)
    const caja = { x: (r.x - m.x) / m.w, y: (r.y - m.y) / m.h, w: r.w / m.w, h: r.h / m.h }
    const componentes = todos.filter((x) => !INTERNOS.test(x)).slice(0, 3)
    return { tipo, texto: texto.slice(0, 90), componentes, caja, t: p.getCurrentFrame() / c.fps, clave: claveDe(n, c) }
  }
  const etiqueta = (d) => [d.componentes[0], d.texto || { imagen: 'Imagen', video: 'Video', '3d': 'El 3D', dibujo: 'Dibujo', forma: 'Forma', texto: 'Texto' }[d.tipo]].filter(Boolean).join(' · ')

  function poner(caja, n) {
    const m = marco()
    const r = dentro(n.getBoundingClientRect(), m)
    Object.assign(caja.style, { display: 'block', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` })
    const l = caja.firstChild
    l.textContent = etiqueta(describir(n))
    l.style.maxWidth = `${Math.max(80, m.x + m.w - r.x - 4)}px`
    // Arriba del contorno si cabe; si no, por dentro.
    Object.assign(l.style, r.y > 22 ? { bottom: '100%', top: 'auto', marginBottom: '3px' } : { top: '2px', bottom: 'auto', marginBottom: '0' })
  }
  const quitar = (caja) => (caja.style.display = 'none')

  const mover = (e) => {
    const n = p.isPlaying() ? null : candidato(e.clientX, e.clientY)
    document.body.style.cursor = n ? 'crosshair' : ''
    n && n !== actual ? poner(pasa, n) : quitar(pasa)
  }
  const clic = (e) => {
    if (p.isPlaying()) return p.pause()
    const n = candidato(e.clientX, e.clientY)
    if (!n) return soltar(true)
    actual = n
    quitar(pasa)
    poner(fija, n)
    avisar({ vivo: 'elegido', elemento: describir(n) })
  }
  function soltar(avisarlo) {
    if (!actual) return
    actual = null
    quitar(fija)
    if (avisarlo) avisar({ vivo: 'elegido', elemento: null })
  }
  /** Al moverse el video, lo elegido sigue marcado mientras esté en el cuadro; sonando, no se marca nada. */
  const seguir = () => {
    if (p.isPlaying()) return (quitar(pasa), quitar(fija))
    if (actual?.isConnected) poner(fija, actual)
    else quitar(fija)
  }
  const salir = () => quitar(pasa)
  document.addEventListener('pointermove', mover)
  document.addEventListener('click', clic)
  document.documentElement.addEventListener('mouseleave', salir)
  addEventListener('resize', seguir)
  return {
    seguir,
    soltar: () => soltar(false),
    cerrar() {
      document.removeEventListener('pointermove', mover)
      document.removeEventListener('click', clic)
      document.documentElement.removeEventListener('mouseleave', salir)
      removeEventListener('resize', seguir)
    }
  }
}

/** Los componentes de Remotion, React y el Player, que no dicen nada de qué es lo elegido. */
const INTERNOS = /RefForwarding|Inner$|^(Inner|Native|Regular|AbsoluteFill|Sequence|Series|Img|Audio|Video|OffthreadVideo|Html5|IFrame|Freeze|Loop|Still|Folder|ThreeCanvas|Canvas|Suspense|Fragment|Player|Remotion|Internal|Shared|Composition|Premount|Postmount|Timeline|Media|Buffer|Error|Lazy|Memo|ForwardRef|Context|Provider|Wrapper|Calculate|Portal|Root$)/

/**
 * Las piezas del video y cuándo se ven, para la línea de tiempo: un segundo reproductor, escondido fuera de la vista,
 * recorre el video a saltos y anota en cada uno lo que se ve (un texto, una imagen, el 3D), juntado por el componente que
 * lo dibuja. Así cualquier video tiene sus piezas en la línea, aunque sea una sola toma sin secuencias. Solo avanza con
 * el video en pausa, para no robarle cuadros al que se ve. Devuelve cómo pararlo.
 */
function sondear(c, principal) {
  const k = Math.min(1, 320 / c.alto)
  const caja = document.createElement('div')
  caja.style.cssText = `position:fixed;left:-99999px;top:0;width:${Math.round(c.ancho * k)}px;height:${Math.round(c.alto * k)}px;overflow:hidden;pointer-events:none`
  document.body.append(caja)
  const raiz = createRoot(caja)
  let vivo = true
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms))
  const listo = new Promise((ok) => raiz.render(<Sonda c={c} listo={ok} />))
  const dura = c.duracion / c.fps
  // Un salto cada medio segundo; en un video largo, como mucho 300.
  const paso = Math.max(0.5, dura / 300)
  const seg = (s) => Math.round(Math.min(dura, s) * 1000) / 1000

  async function recorrer() {
    const p = await listo
    await espera(300)
    const ids = new WeakMap()
    let siguiente = 0
    /** Por pieza: su componente, qué es, su texto y en qué saltos se vio. */
    const piezas = new Map()
    for (let i = 0; i * paso < dura && vivo; i++) {
      while (vivo && principal.isPlaying()) await espera(400)
      p.seekTo(Math.min(c.duracion - 1, Math.round(i * paso * c.fps)))
      // Un par de vueltas para que React pinte el cuadro (y lo que espera a un efecto).
      for (let j = 0; j < 3; j++) await espera(0)
      const M = caja.getBoundingClientRect()
      const area = M.width * M.height
      for (const el of caja.querySelectorAll('*')) {
        if (el instanceof SVGElement && el.tagName !== 'svg') continue
        const r = el.getBoundingClientRect()
        const w = Math.min(r.right, M.right) - Math.max(r.left, M.left)
        const h = Math.min(r.bottom, M.bottom) - Math.max(r.top, M.top)
        if (w < 1 || h < 1) continue
        const suyo = propio(el)
        if (!suyo && (r.width * r.height > area * 0.35 || !tieneFondo(el))) continue
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
        const cad = cadena(el, c)
        const duena = cad.find((x) => !INTERNOS.test(x.nombre))?.f
        if (!duena) continue
        let id = ids.get(duena) ?? (duena.alternate && ids.get(duena.alternate))
        if (id === undefined) id = siguiente++
        ids.set(duena, id)
        if (duena.alternate) ids.set(duena.alternate, id)
        let x = piezas.get(id)
        if (!x) {
          const componentes = cad.map((y) => y.nombre).filter((y) => !INTERNOS.test(y))
          piezas.set(id, (x = { clave: componentes.join(' › '), componentes: componentes.slice(0, 3), tipos: new Set(), texto: '', primera: i, vistas: [] }))
        }
        if (x.vistas.at(-1) !== i) x.vistas.push(i)
        const tag = el.tagName
        x.tipos.add(tag === 'IMG' ? 'imagen' : tag === 'VIDEO' ? 'video' : tag === 'CANVAS' ? '3d' : tag === 'svg' ? 'dibujo' : suyo ? 'texto' : 'forma')
        // Su texto, el del primer salto en que se ve.
        if (x.primera === i && x.texto.length < 80) {
          const t = tag === 'IMG' ? '' : [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ')
          x.texto = `${x.texto} ${t}`.replace(/\s+/g, ' ').trim()
        }
      }
    }
    if (!vivo) return
    // Lo que va dentro de otra pieza (el icono de una tarjeta, una palabra subrayada de un post) es parte de ella: se
    // junta con la de más afuera que se haya visto, por sus componentes.
    const claves = new Set([...piezas.values()].map((x) => x.clave))
    const afuera = (clave) => {
      let k = clave
      for (let i = clave.indexOf(' › '); i >= 0; i = clave.indexOf(' › ', i + 1)) if (claves.has(clave.slice(i + 3))) k = clave.slice(i + 3)
      return k
    }
    const juntas = new Map()
    for (const x of [...piezas.values()].sort((a, b) => a.clave.split(' › ').length - b.clave.split(' › ').length)) {
      const k = afuera(x.clave)
      if (!juntas.has(k)) juntas.set(k, { clave: k, componentes: x.componentes, tipos: x.tipos, vistas: new Set(), partes: [] })
      const j = juntas.get(k)
      x.vistas.forEach((i) => j.vistas.add(i))
      j.partes.push({ ...x, propia: x.clave === k })
    }
    // Saltos seguidos (con uno sin verse como mucho) son un mismo tramo. Su texto, el de lo que se ve en él: el suyo; si
    // no tiene y no es una imagen o el 3D (que se llaman por su componente), el de lo de dentro.
    const lista = []
    for (const x of juntas.values()) {
      const tipo = ['texto', 'imagen', 'video', '3d', 'dibujo', 'forma'].find((t) => x.tipos.has(t))
      const textoEn = (a, b) => {
        const en = x.partes.filter((y) => y.texto && y.vistas.some((i) => i >= a && i <= b))
        const propias = en.filter((y) => y.propia)
        const visual = ['imagen', 'video', '3d'].some((t) => x.tipos.has(t))
        return (propias.length ? propias : visual ? [] : en).map((y) => y.texto).join(' ').slice(0, 80)
      }
      const vistas = [...x.vistas].sort((a, b) => a - b)
      let a = vistas[0]
      let b = a
      for (const i of [...vistas.slice(1), Infinity]) {
        if (i - b <= 2) {
          b = i
          continue
        }
        lista.push({ clave: x.clave, componentes: x.componentes, tipo, texto: textoEn(a, b), desde: seg(a * paso), hasta: seg((b + 1) * paso) })
        a = b = i
      }
    }
    avisar({ vivo: 'piezas', piezas: lista.sort((a, b) => a.desde - b.desde || b.hasta - a.hasta) })
  }
  function parar() {
    if (!vivo) return
    vivo = false
    setTimeout(() => {
      raiz.unmount()
      caja.remove()
    })
  }
  recorrer().catch(() => {}).finally(parar)
  return parar
}

/** El reproductor del sondeo: el mismo video, sin sonido ni errores que avisar. */
function Sonda({ c, listo }) {
  const ref = useRef(null)
  useEffect(() => listo(ref.current), [])
  return (
    <Player
      ref={ref}
      component={c.component}
      inputProps={c.props}
      durationInFrames={c.duracion}
      fps={c.fps}
      compositionWidth={c.ancho}
      compositionHeight={c.alto}
      style={{ width: '100%', height: '100%' }}
      initiallyMuted
      clickToPlay={false}
      spaceKeyToPlayOrPause={false}
      acknowledgeRemotionLicense
      errorFallback={() => null}
    />
  )
}

function Fallo({ error }) {
  useEffect(() => fallo(error), [error])
  return null
}

const TECLAS = ['Space', 'ArrowLeft', 'ArrowRight', 'Escape']

function Motor({ c }) {
  const ref = useRef(null)
  const [velocidad, setVelocidad] = useState(1)
  const [bucle, setBucle] = useState(null)
  const elegir = useRef(null)
  const ultimo = useRef('')

  useEffect(() => {
    const p = ref.current
    const e = elegirCon(p, c)
    elegir.current = e
    const tiempo = () => {
      avisar({ vivo: 'tiempo', t: p.getCurrentFrame() / c.fps, playing: p.isPlaying() })
      e.seguir()
    }
    const eventos = ['frameupdate', 'play', 'pause', 'seeked', 'ended']
    for (const x of eventos) p.addEventListener(x, tiempo)
    const oir = (ev) => {
      if (ev.source !== parent) return
      const m = ev.data ?? {}
      if (m.vivo === 'ir') p.seekTo(Math.max(0, Math.min(c.duracion - 1, Math.round(m.t * c.fps))))
      else if (m.vivo === 'play') p.play()
      else if (m.vivo === 'pausa') p.pause()
      else if (m.vivo === 'velocidad') setVelocidad(m.x)
      else if (m.vivo === 'silencio') m.si ? p.mute() : p.unmute()
      else if (m.vivo === 'bucle') setBucle(m.si ? { desde: m.desde, hasta: m.hasta } : null)
      else if (m.vivo === 'soltar') e.soltar()
    }
    // Con el foco en el video, las teclas del monitor siguen sirviendo: se le pasan.
    const tecla = (ev) => {
      if (!TECLAS.includes(ev.code)) return
      ev.preventDefault()
      if (ev.code === 'Escape') e.soltar()
      avisar({ vivo: 'tecla', code: ev.code, shift: ev.shiftKey })
    }
    addEventListener('message', oir)
    addEventListener('keydown', tecla)
    avisar({ vivo: 'listo', duracion: c.duracion / c.fps, fps: c.fps, ancho: c.ancho, alto: c.alto })
    // Las piezas, un momento después: primero que se vea.
    let parar = () => {}
    const sondeo = setTimeout(() => (parar = sondear(c, p)), 1000)
    return () => {
      clearTimeout(sondeo)
      parar()
      for (const x of eventos) p.removeEventListener(x, tiempo)
      removeEventListener('message', oir)
      removeEventListener('keydown', tecla)
      e.cerrar()
    }
  }, [])

  const secuencias = useCallback((seqs) => {
    const leido = leer(seqs, c)
    const json = JSON.stringify(leido)
    if (json === ultimo.current) return
    ultimo.current = json
    avisar({ vivo: 'escenas', ...leido })
  }, [])

  const rango = bucle?.hasta > bucle?.desde
  const player = (
    <Player
      ref={ref}
      component={c.component}
      inputProps={c.props}
      durationInFrames={c.duracion}
      fps={c.fps}
      compositionWidth={c.ancho}
      compositionHeight={c.alto}
      style={{ width: '100%', height: '100%' }}
      playbackRate={velocidad}
      loop={!!bucle}
      inFrame={rango ? Math.round(bucle.desde * c.fps) : null}
      outFrame={rango ? Math.min(c.duracion - 1, Math.round(bucle.hasta * c.fps)) : null}
      clickToPlay={false}
      spaceKeyToPlayOrPause={false}
      doubleClickToFullscreen={false}
      moveToBeginningWhenEnded={false}
      acknowledgeRemotionLicense
      errorFallback={({ error }) => <Fallo error={error} />}
    />
  )
  // Las secuencias que va montando el video llegan por este contexto, el mismo con que Remotion dibuja la línea de tiempo
  // de su Studio. Un Player viejo no lo tiene: entonces no hay escenas, y el resto va igual.
  const Secuencias = PlayerInternals?.TimelineSequenceObserverContext
  return Secuencias ? <Secuencias.Provider value={secuencias}>{player}</Secuencias.Provider> : player
}

composicion()
  .then((c) => createRoot(document.getElementById('raiz')).render(<Motor c={c} />))
  .catch(fallo)
