import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { EstadoVoz, FuenteVoz, ProveedorVoz, VozApi } from '../../shared/types'
import { comoSuena, encaja, grupoEnEspanol, MOTORES, motorDe, muestraDeStudio, type Tono, TONOS } from '../../shared/voz'
import { api } from './api'
import { Icono } from './Iconos'
import { Logo } from './Logos'
import type { UsoVoz } from './Voz'
import './ElegirVoz.css'

/**
 * El menú «Voz»: todas las voces de AI Studio, Fish Audio, ElevenLabs y Voices Cloning en una lista que se busca en
 * español («grave narración»), se filtra por motor y por tono y se oye antes de elegir: el botón de oír toca la muestra pública de la
 * voz al instante (se baja al pasar por encima), y con «Tu frase» la oyes diciendo lo tuyo (se genera una vez y se
 * guarda, `POST /api/voz/probar`). Con el teclado: ↑↓ te mueves, → la oyes (y mientras suena, moverte toca la
 * siguiente), Enter la eliges. Arriba, las recientes y las favoritas; abajo, clonar tu voz grabándola ahí mismo.
 * Buscando, también trae las de toda la biblioteca de Fish Audio; en la pestaña de Voices Cloning, su catálogo entero
 * (sus proveedores, de 30 en 30), sin su ventana.
 */

type Motor = 'ai-studio' | FuenteVoz
type Genero = 'mujer' | 'hombre'
const GENEROS: Genero[] = ['mujer', 'hombre']

interface Item {
  valor: string
  nombre: string
  como: string
  tono?: Tono
  genero?: Genero
  motor: Motor
  uso?: string
  muestra?: string
  propia?: boolean
  textos: string[]
  /** Una de la biblioteca de Fish Audio o del catálogo de Voices Cloning que aún no está en el menú: al elegirla, se queda. */
  remota?: VozApi
  /** En Voices Cloning, de cuál de los suyos sale (ElevenLabs, Edge…). */
  de?: string
  /** Por qué no se puede generar con ella con tu plan: se oye su muestra, pero no se elige ni dice tu frase. */
  bloqueo?: string
}

const NOMBRE_MOTOR: Record<Motor, string> = { 'ai-studio': 'AI Studio', ...MOTORES }
/**
 * De dónde sale cada motor, para no confundirlos: Fish Audio y ElevenLabs van con la llave que pusiste; AI Studio, con
 * tu cuenta de Google; Voices Cloning es el de Sloth, con sus créditos.
 */
const ORIGEN: Record<Motor, string> = { 'ai-studio': 'tu cuenta de Google', fish: 'tu llave', elevenlabs: 'tu llave', vc: 'tus créditos' }
const conOrigen = (m: Motor) => `${NOMBRE_MOTOR[m]} · ${ORIGEN[m]}`
/** La sección de las de ElevenLabs que tu plan gratis no deja usar (las de su biblioteca). */
const PIDEN_PAGO = (n: number) => `ElevenLabs · ${n} ${n === 1 ? 'pide' : 'piden'} plan de pago · se oye su muestra`
/** Los proveedores que Voices Cloning tiene dentro, como los nombra. */
const DE_VC: Record<string, string> = { elevenlabs: 'ElevenLabs', edge: 'Edge', minimax: 'Minimax', vbee: 'Vbee', fishaudio: 'Fish', clone: 'Clonada' }
/** De dónde sale una fila: su uso en AI Studio; en Voices Cloning, también de cuál de los suyos. */
const origenDe = (it: { motor: Motor; uso?: string; de?: string }) => it.uso ?? (it.motor === 'vc' && it.de ? `Sloth · ${DE_VC[it.de] ?? it.de}` : conOrigen(it.motor))
const LOGO: Record<Motor, string> = { 'ai-studio': 'gemini', fish: 'fish', elevenlabs: 'elevenlabs', vc: 'sloth' }
/** Las voces tuyas guardadas en esta computadora (`server/voz/apis.ts`, `TUYA`): se pueden quitar desde el menú. */
const TUYA = 'tuya-'
/** Con qué frase se prueba una voz que no trae muestra, si no escribiste la tuya. */
const FRASE_BASE = 'Hola, así sonaría tu video con esta voz.'
const RECIENTES = 'voz-recientes'
const FAVORITAS = 'voz-favoritas'
/** Los proveedores de las voces de Sloth de la última vez, para contarlas al momento. */
const PROVEEDORES_VC = 'voz-proveedores-sloth'
const FRASE = 'voz-frase'
/** Las muestras públicas se oyen a través de Sloth, que las guarda la primera vez (`server/voz/muestras.ts`). */
const local = (url: string) => `/api/voz/muestra?u=${encodeURIComponent(url)}`

/** Un texto guardado en este navegador; sin almacenamiento, vacío. */
const leerTexto = (k: string): string => {
  try {
    return localStorage.getItem(k) ?? ''
  } catch {
    return ''
  }
}
const leerLista = (k: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '[]')
  } catch {
    return []
  }
}
const guardarLista = (k: string, v: string[]) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    // Sin almacenamiento, solo dura esta vez.
  }
}

/** «2.3 M usos», como las cuenta Fish Audio. */
const usos = new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 })

function itemDeApi(motor: FuenteVoz, v: VozApi, remota = false): Item {
  const { texto, tono } = comoSuena(v.descripcion)
  const genero = /\bfemale\b/i.test(v.descripcion) ? 'mujer' : /\bmale\b/i.test(v.descripcion) ? 'hombre' : undefined
  return {
    valor: `${motor}:${v.id}`,
    nombre: v.nombre,
    como: [v.propia ? texto || 'Tu voz' : texto, v.usos ? `${usos.format(v.usos)} usos` : ''].filter(Boolean).join(' · '),
    ...(v.bloqueo ? { bloqueo: v.bloqueo } : {}),
    ...(tono ? { tono } : {}),
    ...(genero ? { genero } : {}),
    motor,
    ...(v.muestra ? { muestra: v.muestra } : {}),
    ...(v.propia ? { propia: true } : {}),
    textos: [v.nombre, v.descripcion, texto, NOMBRE_MOTOR[motor], v.propia ? 'tuya mia clonada' : ''],
    ...(remota ? { remota: v } : {}),
    ...(v.de ? { de: v.de } : {})
  }
}

/** Todas las voces que se pueden usar aquí, como filas del menú. */
export function itemsDeVoz(e: EstadoVoz | undefined): Item[] {
  if (!e) return []
  const items: Item[] = []
  for (const m of ['fish', 'elevenlabs'] as ProveedorVoz[]) if (e.motores?.[m]?.llave) items.push(...e.motores[m].voces.map((v) => itemDeApi(m, v)))
  if (e.vc?.disponible) items.push(...e.vc.voces.map((v) => itemDeApi('vc', v)))
  if (e.cuenta)
    for (const v of e.voces) {
      const { texto, tono } = comoSuena(v.descripcion)
      const uso = grupoEnEspanol(v.grupo)
      const genero = v.genero === 'mujer' ? 'Mujer' : v.genero === 'hombre' ? 'Hombre' : ''
      items.push({
        valor: v.nombre,
        nombre: v.nombre,
        como: [genero, texto].filter(Boolean).join(' · '),
        ...(tono ? { tono } : {}),
        ...(v.genero ? { genero: v.genero } : {}),
        motor: 'ai-studio',
        uso,
        muestra: v.muestra ?? muestraDeStudio(v.nombre),
        textos: [v.nombre, v.descripcion, texto, uso, v.grupo, genero, 'AI Studio Gemini']
      })
    }
  return items
}

/** Un dibujo de ondas propio de cada voz (sale de su nombre), para reconocerla de un vistazo. */
function Huella({ de }: { de: string }) {
  let h = 0
  for (const c of de) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const barras = Array.from({ length: 5 }, (_, i) => 5 + (((h >>> (i * 5)) & 31) % 12))
  return (
    <svg className="voz-huella" viewBox="0 0 20 20" aria-hidden="true">
      {barras.map((alto, i) => (
        <path key={i} d={`M${2.5 + i * 3.75} ${10 - alto / 2}v${alto}`} />
      ))}
    </svg>
  )
}

/** Lo que se oye: un solo audio a la vez; las muestras ya bajadas (al pasar por encima) suenan sin esperar. */
/** `generada`: tras generar tu frase con una voz (las de Sloth gastan créditos: se vuelven a leer). */
function useOir(frase: string, generada?: (it: Item) => void) {
  const [sonando, setSonando] = useState<string>()
  const [cargando, setCargando] = useState<string>()
  const [error, setError] = useState('')
  const [duracion, setDuracion] = useState(0)
  const audios = useRef(new Map<string, { a: HTMLAudioElement; listo: Promise<void>; blob?: string }>())
  const actual = useRef<HTMLAudioElement>(undefined)
  const generadas = useRef(new Map<string, string>())
  const pedido = useRef(0)

  /**
   * El audio de una dirección, ya entero en memoria: con `preload` el navegador solo baja un trozo y, al pulsar, aún
   * espera (medido: 33–53 ms con el ratón); bajado a un blob al pasar por la fila, suena al momento. Si no se puede
   * bajar así, va con la dirección tal cual.
   */
  const audio = (url: string) => {
    let e = audios.current.get(url)
    if (!e) {
      const a = new Audio()
      a.preload = 'auto'
      const entrada: { a: HTMLAudioElement; listo: Promise<void>; blob?: string } = { a, listo: Promise.resolve() }
      entrada.listo = fetch(url)
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
        .then((b) => void ((entrada.blob = URL.createObjectURL(b)), (a.src = entrada.blob), a.load()))
        .catch(() => void (a.src = url))
      audios.current.set(url, (e = entrada))
      // Las de hace rato se sueltan.
      for (const [k, v] of [...audios.current].slice(0, -16)) v.blob && URL.revokeObjectURL(v.blob), audios.current.delete(k)
    }
    return e
  }
  useEffect(() => () => audios.current.forEach((v) => v.blob && URL.revokeObjectURL(v.blob)), [])
  const parar = () => {
    pedido.current++
    actual.current?.pause()
    actual.current = undefined
    setSonando(undefined)
    setCargando(undefined)
  }
  useEffect(() => parar, [])

  /** La muestra (o la frase), si hace falta pedirla. */
  async function url(it: Item): Promise<string> {
    const texto = frase.trim() || (it.muestra ? '' : FRASE_BASE)
    if (!texto && it.muestra) return local(it.muestra)
    if (it.bloqueo) throw new Error(`${it.nombre}: ${it.bloqueo}. Su muestra sí se oye (borra tu frase); para tu frase, usa otra voz.`)
    const clave = `${it.valor}\n${texto}`
    const ya = generadas.current.get(clave)
    if (ya) return ya
    const r = await api<{ url: string }>('/api/voz/probar', { voz: it.valor, texto })
    generadas.current.set(clave, r.url)
    generada?.(it)
    return r.url
  }

  return {
    sonando,
    cargando,
    error,
    duracion,
    parar,
    avisar: setError,
    /** Si suena sin generar nada: con su muestra, o con tu frase ya generada antes. */
    gratis: (it: Item) => (frase.trim() ? generadas.current.has(`${it.valor}\n${frase.trim()}`) : !!it.muestra),
    /** Baja de antemano las muestras de estas voces (la activa y sus vecinas), para que al pulsar oír suenen ya. */
    preparar: (its: (Item | undefined)[]) => {
      if (!frase.trim()) for (const it of its) if (it?.muestra) audio(local(it.muestra))
    },
    async oir(it: Item) {
      if (sonando === it.valor || cargando === it.valor) return parar()
      parar()
      const n = pedido.current
      setError('')
      setCargando(it.valor)
      try {
        const u = await url(it)
        const { a, listo } = audio(u)
        await listo
        if (n !== pedido.current) return
        a.currentTime = 0
        a.onended = () => n === pedido.current && setSonando(undefined)
        a.onplaying = () => n === pedido.current && (setCargando(undefined), setSonando(it.valor), setDuracion(a.duration || 0))
        actual.current = a
        await a.play()
      } catch (x) {
        if (n !== pedido.current) return
        setCargando(undefined)
        // Los del navegador (NotSupportedError, «no supported sources»…) vienen en inglés: se dicen en español.
        const navegador = x instanceof DOMException || /supported source|NotAllowed|NotSupported|play\(\)/i.test(String(x))
        setError(navegador ? `No se pudo oír ${it.nombre}: su muestra no está disponible ahora. Prueba con tu frase.` : x instanceof Error && x.message ? x.message : 'No se pudo oír esta voz.')
      }
    }
  }
}

/**
 * El menú «Voz» del compositor y de la etapa de la voz. `propia`: la primera opción, la que no genera nada («La mando
 * yo»); sin ella, solo voces. `onCambio` recibe la voz elegida (vacía: la propia). `musica`: en el compositor de un
 * estilo que la sabe poner (`Card.musica`), el interruptor de la música de fondo, al pie.
 */
export function ElegirVoz(props: { voz: UsoVoz; valor: string; etiqueta: string; propia?: string; deshabilitado?: boolean; ancho?: number; musica?: Musica; onCambio(v: string): void }) {
  const [abierto, setAbierto] = useState(false)
  const [lugar, setLugar] = useState({ abajo: false, alto: 520, izquierda: 0 })
  const raiz = useRef<HTMLDivElement>(null)
  const disparador = useRef<HTMLButtonElement>(null)
  const porPuntero = useRef(false)
  /** Hacia dónde se abre, cuánto alto le cabe y cuánto se corre a la izquierda para no salirse de la ventana. */
  const medir = () => {
    if (!raiz.current) return
    const r = raiz.current.getBoundingClientRect()
    const arriba = r.top - 16
    const debajo = innerHeight - r.bottom - 16
    const abajo = arriba < 420 && debajo > arriba
    const ancho = Math.min(props.ancho ?? 520, innerWidth - 24)
    const caja = raiz.current.closest('.composer, .generar-voz')?.getBoundingClientRect() ?? r
    const centrado = caja.left + (caja.width - ancho) / 2 - r.left
    setLugar({ abajo, alto: Math.max(260, Math.min(560, abajo ? debajo : arriba)), izquierda: Math.max(12 - r.left, Math.min(centrado, innerWidth - 12 - ancho - r.left)) })
  }
  // El menú se arma oculto antes de abrirlo (1,5 s después de salir el compositor, o antes si pasas el puntero o el
  // foco por «Voz»), y abrir es solo enseñarlo: sin eso, la primera vez se armaban sus cien filas en el clic y pintaba a
  // la par de AI Studio (26 ms contra 25, medido hasta el cuadro pintado). Oculto también va en su sitio, dentro de la
  // ventana: si no, la página se podía mover de lado.
  const [preparado, setPreparado] = useState(false)
  const preparar = () => {
    if (preparado) return
    medir()
    setPreparado(true)
  }
  useEffect(() => {
    const id = setTimeout(preparar, 1500)
    return () => clearTimeout(id)
    // Solo al salir el compositor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!preparado) return
    // En el cuadro siguiente: durante el `resize` el ancho y el sitio de «Voz» aún no van a la par (medido: salía 0).
    let cuadro = 0
    const alCambiar = () => (cancelAnimationFrame(cuadro), (cuadro = requestAnimationFrame(medir)))
    addEventListener('resize', alCambiar)
    return () => (removeEventListener('resize', alCambiar), cancelAnimationFrame(cuadro))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparado])

  const abrir = () => {
    if (!abierto) medir()
    setAbierto(!abierto)
  }
  const cerrar = () => {
    setAbierto(false)
    disparador.current?.focus()
  }

  useEffect(() => {
    if (!abierto) return
    const fuera = (ev: PointerEvent) => !raiz.current?.contains(ev.target as Node) && setAbierto(false)
    addEventListener('pointerdown', fuera)
    return () => removeEventListener('pointerdown', fuera)
  }, [abierto])

  return (
    <div ref={raiz} className={`picker elegir-voz ${abierto ? 'open' : ''}`}>
      <button
        ref={disparador}
        className="picker-trigger"
        disabled={props.deshabilitado}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        // Con el ratón se abre al apretar, no al soltar (como los menús del sistema): unos 100 ms antes. El clic que
        // sigue ya no hace nada; con el teclado (Enter, espacio) se abre con el clic, como siempre.
        onPointerDown={(ev) => {
          if (ev.pointerType !== 'mouse' || ev.button !== 0) return
          porPuntero.current = true
          preparar()
          abrir()
        }}
        // Que el botón no se quede el foco al apretar: va al buscador.
        onMouseDown={(ev) => porPuntero.current && ev.preventDefault()}
        onClick={() => (porPuntero.current ? (porPuntero.current = false) : abrir())}
        onPointerEnter={preparar}
        onFocus={preparar}
        onKeyDown={(ev) => {
          if (!abierto && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) (ev.preventDefault(), abrir())
        }}
      >
        {props.etiqueta}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {(preparado || abierto) && (
        <Panel
          {...props}
          abierto={abierto}
          alto={lugar.alto}
          abajo={lugar.abajo}
          izquierda={lugar.izquierda}
          onCerrar={cerrar}
          onQuitada={(v) => v === props.valor && props.onCambio('')}
          onElegir={(v) => {
            cerrar()
            if (v !== props.valor) props.onCambio(v)
          }}
        />
      )}
    </div>
  )
}

type Filtro = 'todas' | 'favoritas' | Motor

/** La música de fondo del video: encendida o no (`lineaMusica`). */
export interface Musica {
  encendida: boolean
  onCambio(encendida: boolean): void
}

function Panel(props: { voz: UsoVoz; valor: string; propia?: string; ancho?: number; musica?: Musica; abierto: boolean; alto: number; abajo: boolean; izquierda: number; onCerrar(): void; onElegir(v: string): void; onQuitada(v: string): void }) {
  const { voz } = props
  const e = voz.estado
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [tono, setTono] = useState<Tono | ''>('')
  const [genero, setGenero] = useState<Genero | ''>('')
  const [frase, setFrase] = useState(() => leerTexto(FRASE))
  const [favoritas, setFavoritas] = useState(() => leerLista(FAVORITAS))
  const [recientesGuardadas, setRecientes] = useState(() => leerLista(RECIENTES))
  const [remotas, setRemotas] = useState<Item[]>([])
  const [buscandoFuera, setBuscandoFuera] = useState(false)
  const [activoMovido, setActivo] = useState<number>()
  const [clonando, setClonando] = useState(false)
  const [eligiendo, setEligiendo] = useState('')
  const [aQuitar, setAQuitar] = useState('')
  const campo = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  const oir = useOir(frase, (it) => it.motor === 'vc' && void voz.releerVc().catch(() => {}))

  const todas = useMemo(() => itemsDeVoz(e), [e])
  // Voices Cloning sale aunque aún no hayas elegido ninguna: su pestaña trae su catálogo.
  const conVc = !!e?.vc?.disponible
  const motores = useMemo(() => [...new Set([...todas.map((i) => i.motor), ...(conVc ? (['vc'] as const) : [])])], [todas, conVc])
  const hayTonos = todas.some((i) => i.tono)
  const hayGeneros = todas.some((i) => i.genero)
  const deRasgo = (i: Item) => (!tono || i.tono === tono) && (!genero || i.genero === genero)
  const pasa = (i: Item) => (filtro === 'todas' || (filtro === 'favoritas' ? favoritas.includes(i.valor) : i.motor === filtro)) && deRasgo(i) && encaja(busqueda, i.textos)
  const buscando = !!busqueda.trim() || !!tono || !!genero || filtro !== 'todas'

  // El catálogo de Voices Cloning, en su pestaña: sus proveedores (ElevenLabs, Edge…) y las voces del elegido, con tu
  // búsqueda y el género, de 30 en 30. Lo pide el servidor a su API (`/api/voz/vc/catalogo`).
  const [vcProveedores, setVcProveedores] = useState<{ id: string; nombre: string; voces: number; aviso?: string }[]>([])
  const [vcProveedor, setVcProveedor] = useState('elevenlabs')
  const [vcCatalogo, setVcCatalogo] = useState<{ items: Item[]; mas: boolean; total: number; pagina: number; clave: string }>({ items: [], mas: false, total: 0, pagina: 0, clave: '' })
  const [vcCargando, setVcCargando] = useState(false)
  const [vcError, setVcError] = useState('')
  const vcPedido = useRef(0)
  // Al entrar en su pestaña, los créditos de ahora (un video pudo gastarlos desde que se leyeron).
  useEffect(() => {
    if (filtro === 'vc') void voz.releerVc().catch(() => {})
  }, [filtro]) // eslint-disable-line react-hooks/exhaustive-deps
  // Se piden en cuanto Sloth ofrece sus voces, no al entrar en su pestaña: así cuenta las 900 y pico desde el principio.
  // Mientras llegan, las de la última vez (de este navegador).
  useEffect(() => {
    if (!conVc) return
    if (!vcProveedores.length) {
      try {
        const antes = JSON.parse(localStorage.getItem(PROVEEDORES_VC) ?? '[]') as typeof vcProveedores
        if (Array.isArray(antes) && antes.length) setVcProveedores(antes)
      } catch {
        // Sin almacenamiento: llegan en un momento.
      }
    }
    api<{ proveedores: typeof vcProveedores }>('/api/voz/vc/proveedores').then(
      (r) => {
        setVcProveedores(r.proveedores)
        try {
          localStorage.setItem(PROVEEDORES_VC, JSON.stringify(r.proveedores))
        } catch {
          // Sin almacenamiento, solo dura esta vez.
        }
      },
      (x: Error) => setVcError(x.message)
    )
  }, [conVc]) // eslint-disable-line react-hooks/exhaustive-deps
  /** Para qué proveedor, búsqueda y género es lo que hay en el catálogo. */
  const claveVc = `${vcProveedor}|${busqueda.trim()}|${genero ?? ''}`
  const pedirCatalogo = (pagina: number) => {
    const n = ++vcPedido.current
    const clave = claveVc
    const q = new URLSearchParams({ proveedor: vcProveedor, pagina: String(pagina) })
    if (busqueda.trim()) q.set('q', busqueda.trim())
    if (genero) q.set('gender', genero === 'mujer' ? 'female' : 'male')
    setVcCargando(true)
    setVcError('')
    api<{ voces: VozApi[]; mas: boolean; total: number }>(`/api/voz/vc/catalogo?${q}`)
      .then((r) => n === vcPedido.current && setVcCatalogo((antes) => ({ items: [...(pagina > 1 ? antes.items : []), ...r.voces.map((v) => itemDeApi('vc', v, true))], mas: r.mas, total: r.total, pagina, clave })))
      .catch((x: Error) => n === vcPedido.current && setVcError(x.message))
      .finally(() => n === vcPedido.current && setVcCargando(false))
  }
  useEffect(() => {
    if (filtro !== 'vc') {
      // De antemano, su primera página sin buscar: al entrar en la pestaña, las voces ya están.
      if (conVc && !busqueda.trim() && !genero && vcCatalogo.clave !== claveVc) pedirCatalogo(1)
      return
    }
    if (vcCatalogo.clave === claveVc && vcCatalogo.pagina) return
    setVcCatalogo({ items: [], mas: false, total: 0, pagina: 0, clave: '' })
    const t = setTimeout(() => pedirCatalogo(1), busqueda.trim() ? 350 : 0)
    return () => clearTimeout(t)
  }, [filtro, vcProveedor, busqueda, genero, conVc]) // eslint-disable-line react-hooks/exhaustive-deps

  // Buscando, también en toda la biblioteca de Fish Audio (lo que no está ya en el menú).
  const conFish = !!e?.motores?.fish?.llave
  useEffect(() => {
    const q = busqueda.trim()
    setRemotas([])
    if (!conFish || q.length < 3 || (filtro !== 'todas' && filtro !== 'fish')) return
    setBuscandoFuera(true)
    const t = setTimeout(() => {
      api<{ motor: ProveedorVoz; voces: VozApi[] }[]>(`/api/voz/buscar?q=${encodeURIComponent(q)}`)
        .then((r) => setRemotas(r.flatMap((g) => g.voces.slice(0, 8).map((v) => itemDeApi(g.motor, v, true)))))
        .catch(() => {})
        .finally(() => setBuscandoFuera(false))
    }, 350)
    return () => (clearTimeout(t), setBuscandoFuera(false))
  }, [busqueda, filtro, conFish])

  /** «23 voces funcionan con tu plan gratis · te quedan 9.800 letras este mes», sobre las de ElevenLabs que sí sirven. */
  const letras = e?.motores?.elevenlabs?.plan?.letras
  const quedan = letras ? ` · quedan ${Math.max(0, letras.limite - letras.usadas).toLocaleString('es-MX')} letras` : ''
  const conPlan = (n: number) => `ElevenLabs · ${n} con tu plan gratis${quedan}`

  /** Las secciones de la lista, ya filtradas. Sin buscar: recientes, favoritas, tuyas y cada motor por su uso. */
  const secciones = useMemo(() => {
    const porValor = new Map(todas.map((i) => [i.valor, i]))
    const s: { titulo: string; items: Item[] }[] = []
    if (filtro === 'vc') {
      // Las que ya elegiste, y el catálogo del proveedor elegido (sin repetirlas).
      const elegidas = todas.filter(pasa)
      if (elegidas.length) s.push({ titulo: 'Ya en tu menú', items: elegidas })
      const ya = new Set(elegidas.map((i) => i.valor))
      const p = vcProveedores.find((x) => x.id === vcProveedor)
      s.push({ titulo: `${p?.nombre ?? 'Sloth'}${vcCatalogo.total ? ` · ${vcCatalogo.total.toLocaleString('es-MX')} voces` : ''}`, items: vcCatalogo.items.filter((i) => !ya.has(i.valor)) })
      return s
    }
    if (buscando) {
      const q = busqueda.trim().toLowerCase()
      const halladas = todas.filter(pasa).sort((a, b) => Number(b.nombre.toLowerCase().startsWith(q)) - Number(a.nombre.toLowerCase().startsWith(q)))
      const usables = halladas.filter((i) => !i.bloqueo)
      const dePago = halladas.filter((i) => i.bloqueo)
      s.push({ titulo: dePago.length && filtro === 'elevenlabs' ? conPlan(usables.length) : usables.length ?`${usables.length} ${usables.length === 1 ? 'voz' : 'voces'}` : '', items: usables })
      if (dePago.length) s.push({ titulo: PIDEN_PAGO(dePago.length), items: dePago })
      const fuera = remotas.filter(deRasgo)
      if (fuera.length) s.push({ titulo: 'En toda la biblioteca de Fish Audio', items: fuera })
      return s
    }
    const recientes = recientesGuardadas.map((v) => porValor.get(v)).filter((i): i is Item => !!i).slice(0, 3)
    if (recientes.length) s.push({ titulo: 'Recientes', items: recientes })
    const favs = favoritas.map((v) => porValor.get(v)).filter((i): i is Item => !!i)
    if (favs.length) s.push({ titulo: 'Favoritas', items: favs })
    for (const m of ['fish', 'elevenlabs', 'vc'] as const) {
      const tuyas = todas.filter((i) => i.propia && i.motor === m)
      if (tuyas.length) s.push({ titulo: `Tus voces · ${conOrigen(m)}`, items: tuyas })
    }
    const vc = todas.filter((i) => i.motor === 'vc' && !i.propia)
    if (vc.length) s.push({ titulo: typeof e?.vc?.creditos === 'number' ? `Sloth · te quedan ${e.vc.creditos.toLocaleString('es-MX')} créditos` : conOrigen('vc'), items: vc })
    const usos = new Map<string, Item[]>()
    for (const i of todas.filter((x) => x.motor === 'ai-studio')) usos.set(i.uso ?? '', [...(usos.get(i.uso ?? '') ?? []), i])
    for (const [uso, items] of usos) s.push({ titulo: `AI Studio · ${uso}`, items })
    for (const m of ['fish', 'elevenlabs'] as const) {
      const items = todas.filter((i) => i.motor === m && !i.propia)
      const usables = items.filter((i) => !i.bloqueo)
      const dePago = items.filter((i) => i.bloqueo)
      if (usables.length) s.push({ titulo: dePago.length ? `${conOrigen(m)} · con tu plan gratis${quedan}` : conOrigen(m), items: usables })
      if (dePago.length) s.push({ titulo: PIDEN_PAGO(dePago.length), items: dePago })
    }
    return s
    // `pasa` sale de busqueda, filtro y tono, que ya están aquí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todas, busqueda, filtro, tono, genero, remotas, favoritas, recientesGuardadas, buscando, e?.vc?.creditos, vcCatalogo, vcProveedores, vcProveedor, quedan])

  // Lo que se recorre con las flechas: la propia y luego cada fila, en orden (una repetida cuenta una vez por sitio).
  const filas = useMemo(() => {
    const f: { clave: string; item?: Item }[] = []
    if (props.propia !== undefined && !buscando) f.push({ clave: 'propia' })
    for (const s of secciones) for (const i of s.items) f.push({ clave: `${s.titulo}\n${i.valor}`, item: i })
    return f
  }, [secciones, props.propia, buscando])

  // La primera vez que se abre, Sloth baja de fondo las muestras de las primeras voces, para que suenen al instante.
  const calentado = useRef(false)
  useEffect(() => {
    if (!props.abierto || calentado.current) return
    calentado.current = true
    void api('/api/voz/muestras', { urls: filas.flatMap((f) => (f.item?.muestra ? [f.item.muestra] : [])).slice(0, 40) }).catch(() => {})
  }, [props.abierto]) // eslint-disable-line react-hooks/exhaustive-deps
  // Al abrir, el foco en el buscador y la elegida a la vista; al cerrar, se calla y vuelve a empezar (sin buscar, sin
  // filtros), lo que se hace ya cerrado para que abrir no espere a nada.
  useLayoutEffect(() => {
    if (!props.abierto) return
    campo.current?.focus()
    lista.current?.querySelector(`[data-fila="${activo}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [props.abierto]) // eslint-disable-line react-hooks/exhaustive-deps
  const yaAbierto = useRef(false)
  useEffect(() => {
    if (props.abierto) return void (yaAbierto.current = true)
    if (!yaAbierto.current) return
    oir.parar()
    setBusqueda('')
    setFiltro('todas')
    setTono('')
    setGenero('')
    setActivo(undefined)
    setClonando(false)
    setRecientes(leerLista(RECIENTES)) // la que acabas de elegir sale arriba la próxima vez
    setAQuitar('') // el primer clic de «quitar» no sigue armado la próxima vez
  }, [props.abierto]) // eslint-disable-line react-hooks/exhaustive-deps
  const activo = activoMovido ?? Math.max(0, filas.findIndex((f) => (f.item ? f.item.valor === props.valor : !props.valor)))
  useEffect(() => setActivo((a) => (buscando ? 0 : a === undefined ? a : Math.min(a, Math.max(0, filas.length - 1)))), [busqueda, filtro, tono, genero]) // eslint-disable-line react-hooks/exhaustive-deps
  const actual = filas[activo]
  // Al abrir se pintan las primeras filas, las que caben, y el resto en el cuadro siguiente: así abre sin esperar a
  // las cien.
  const [completa, setCompleta] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setCompleta(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const PRIMERAS = 10
  useEffect(() => {
    if (!props.abierto) return
    lista.current?.querySelector(`[data-fila="${activo}"]`)?.scrollIntoView({ block: 'nearest' })
    oir.preparar([0, 1, 2, 3, -1].map((d) => filas[activo + d]?.item))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, actual?.item?.valor, completa, props.abierto])

  const elegir = async (it?: Item) => {
    oir.parar()
    if (!it) return props.onElegir('')
    // Con ella no saldría la voz del video: se dice aquí, no a medio video.
    if (it.bloqueo) return oir.avisar(`${it.nombre}: ${it.bloqueo} para generar con ella. Su muestra sí se oye; para el video, usa otra voz.`)
    guardarLista(RECIENTES, [it.valor, ...leerLista(RECIENTES).filter((v) => v !== it.valor)].slice(0, 6))
    if (it.remota) {
      setEligiendo(it.valor)
      const m = motorDe(it.valor).motor
      await (m === 'vc' ? voz.elegirVc(it.remota) : voz.elegirDeBiblioteca(m as ProveedorVoz, it.remota)).catch(() => {})
      setEligiendo('')
    }
    props.onElegir(it.valor)
  }
  const favorita = (v: string) => {
    const nuevas = favoritas.includes(v) ? favoritas.filter((x) => x !== v) : [v, ...favoritas]
    setFavoritas(nuevas)
    guardarLista(FAVORITAS, nuevas)
  }
  const mover = (d: number) => {
    if (!filas.length) return
    const n = (activo + d + filas.length) % filas.length
    setActivo(n)
    // Mientras suena una, moverte toca la siguiente: así se comparan con una tecla.
    const it = filas[n]?.item
    // Solo las que no gastan: con tu frase, generar cada una al pasar gastaría pedidos sin querer.
    if ((oir.sonando || oir.cargando) && it && oir.gratis(it)) void oir.oir(it)
    else if (oir.sonando || oir.cargando) oir.parar()
  }

  const teclas = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') return ev.preventDefault(), mover(ev.key === 'ArrowDown' ? 1 : -1)
    if (ev.key === 'Enter') return ev.preventDefault(), void elegir(actual?.item)
    if (ev.key === 'Escape') return ev.preventDefault(), ev.stopPropagation(), oir.sonando || oir.cargando ? oir.parar() : props.onCerrar()
    const alFinal = ev.currentTarget.selectionStart === ev.currentTarget.value.length
    if (ev.key === 'ArrowRight' && alFinal && actual?.item) return ev.preventDefault(), void oir.oir(actual.item)
  }

  const conGoogle = !!e?.cuenta
  const puedeClonar = !!(e?.motores?.fish?.llave || e?.motores?.elevenlabs?.llave || e?.vc?.disponible)
  const idDe = (n: number) => `voz-fila-${n}`
  let n = props.propia !== undefined && !buscando ? 1 : 0

  if (clonando)
    return (
      <div className={`picker-menu voz-panel ${props.abajo ? 'down' : ''} ${props.abierto ? '' : 'voz-oculto'}`} inert={!props.abierto} aria-hidden={!props.abierto} style={{ maxHeight: props.alto, width: props.ancho ?? 520, left: props.izquierda }} role="dialog" aria-label="Clonar tu voz">
        <Clonar
          voz={voz}
          onListo={(v) => {
            setClonando(false)
            if (!v) return
            guardarLista(RECIENTES, [v, ...leerLista(RECIENTES).filter((x) => x !== v)].slice(0, 6))
            props.onElegir(v)
          }}
          onVolver={() => (setClonando(false), setTimeout(() => campo.current?.focus()))}
        />
      </div>
    )

  return (
    <div className={`picker-menu voz-panel ${props.abajo ? 'down' : ''} ${props.abierto ? '' : 'voz-oculto'}`} inert={!props.abierto} aria-hidden={!props.abierto} style={{ maxHeight: props.alto, width: props.ancho ?? 520, left: props.izquierda }} role="dialog" aria-label="Elegir la voz">
      <div className="voz-cabeza">
        <label className="voz-buscar">
          <Icono de="buscar" />
          <input
            ref={campo}
            role="combobox"
            aria-expanded="true"
            aria-controls="voz-lista"
            aria-activedescendant={filas.length ? idDe(activo) : undefined}
            aria-label="Buscar una voz"
            placeholder="Busca: grave, cálida, narración, Fola…"
            value={busqueda}
            onChange={(ev) => setBusqueda(ev.target.value)}
            onKeyDown={teclas}
            spellCheck={false}
          />
          {busqueda && (
            <button className="voz-limpiar" aria-label="Borrar la búsqueda" onClick={() => (setBusqueda(''), campo.current?.focus())}>
              <Icono de="cerrar" />
            </button>
          )}
        </label>
        <div className="voz-filtros">
          <div className="voz-pestanas" role="group" aria-label="Motor">
            {(['todas', 'favoritas', ...motores] as Filtro[]).map((m) => (
              <button key={m} className={filtro === m ? 'on' : ''} aria-pressed={filtro === m} onClick={() => (setFiltro(m), campo.current?.focus())} title={m === 'todas' ? 'Todas las voces' : m === 'favoritas' ? 'Las que marcaste con la estrella' : conOrigen(m)}>
                {m === 'todas' ? 'Todas' : m === 'favoritas' ? <><Icono de="estrella" />Favoritas</> : <><Logo de={LOGO[m]} nombre={NOMBRE_MOTOR[m]} chico />{NOMBRE_MOTOR[m]}</>}
                <span className="voz-cuenta">{m === 'todas' ? todas.length : m === 'favoritas' ? favoritas.filter((v) => todas.some((i) => i.valor === v)).length : m === 'vc' && vcProveedores.length ? vcProveedores.reduce((n, p) => n + p.voces, 0) : todas.filter((i) => i.motor === m).length}</span>
              </button>
            ))}
          </div>
        </div>
        {(hayTonos || hayGeneros) && (
          <div className="voz-filtros voz-rasgos">
            {hayGeneros && (
              <div className="voz-pestanas" role="group" aria-label="Género">
                {GENEROS.map((g) => (
                  <button key={g} className={genero === g ? 'on' : ''} aria-pressed={genero === g} onClick={() => (setGenero(genero === g ? '' : g), campo.current?.focus())}>
                    {g === 'mujer' ? 'Mujer' : 'Hombre'}
                  </button>
                ))}
              </div>
            )}
            {hayTonos && (
              <div className="voz-pestanas voz-tonos" role="group" aria-label="Tono">
                {TONOS.map((t) => (
                  <button key={t} className={tono === t ? 'on' : ''} aria-pressed={tono === t} onClick={() => (setTono(tono === t ? '' : t), campo.current?.focus())}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {filtro === 'vc' && typeof e?.vc?.creditos === 'number' && (
        // Lo que te queda: oír sus muestras no gasta; tu frase y la voz de los videos, sí.
        <p className={`voz-creditos ${e.vc.creditos > 0 ? '' : 'bad'}`}>
          {e.vc.creditos > 0 ? (
            <>
              Te quedan <strong>{e.vc.creditos.toLocaleString('es-MX')} {e.vc.creditos === 1 ? 'crédito' : 'créditos'}</strong> de voz
              {e.vc.hoy ? ` · hoy usaste ${e.vc.hoy.toLocaleString('es-MX')}` : ''} · oír las muestras no gasta
            </>
          ) : (
            'Te quedan 0 créditos de voz: las muestras se oyen gratis, pero tu frase y la voz del video no. Pídele más al creador de Sloth.'
          )}
        </p>
      )}
      {filtro === 'vc' && vcProveedores.length > 0 && (
        <div className="voz-filtros voz-rasgos voz-de-vc">
          <div className="voz-pestanas" role="group" aria-label="De dónde salen las voces de Sloth">
            {vcProveedores.map((p) => (
              <button key={p.id} className={vcProveedor === p.id ? 'on' : ''} aria-pressed={vcProveedor === p.id} title={p.aviso ? `${p.nombre}: ${p.aviso}` : p.nombre} onClick={() => (setVcProveedor(p.id), campo.current?.focus())}>
                {p.nombre}
                <span className="voz-cuenta">{p.voces}</span>
                {p.aviso && <span className="voz-aviso-de">{p.aviso}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Pulsar en la lista (oír, guardar, elegir) no le quita el foco al buscador: se sigue escribiendo y con las flechas. */}
      <div className="voz-lista" id="voz-lista" role="listbox" aria-label="Voces" ref={lista} onMouseDown={(ev) => ev.preventDefault()}>
        {props.propia !== undefined && !buscando && (
          <div id={idDe(0)} data-fila={0} role="option" aria-selected={!props.valor} className={`voz-fila voz-propia ${activo === 0 ? 'activa' : ''} ${!props.valor ? 'on' : ''}`} onPointerEnter={() => setActivo(0)} onClick={() => void elegir()}>
            <span className="voz-oir quieto" aria-hidden="true">
              <Icono de="microfono" />
            </span>
            <span className="voz-texto">
              <strong>{props.propia}</strong>
              <small>Grabas tú la voz y la subes en su etapa</small>
            </span>
            {!props.valor && <Icono de="palomita" className="ico voz-hecha" />}
          </div>
        )}
        {secciones.map((s) => (
          <div key={s.titulo || 'halladas'} role="group" aria-label={s.titulo || 'Voces'}>
            {s.titulo && <div className="voz-seccion">{s.titulo}</div>}
            {s.items.map((it) => {
              const k = n++
              if (!completa && k > PRIMERAS) return null
              const suena = oir.sonando === it.valor
              const carga = oir.cargando === it.valor || eligiendo === it.valor
              const fav = favoritas.includes(it.valor)
              return (
                <div
                  key={`${s.titulo}${it.valor}`}
                  id={idDe(k)}
                  data-fila={k}
                  role="option"
                  aria-selected={props.valor === it.valor}
                  className={`voz-fila ${activo === k ? 'activa' : ''} ${props.valor === it.valor ? 'on' : ''} ${suena ? 'sonando' : ''}`}
                  onPointerEnter={() => setActivo(k)}
                  onClick={() => void elegir(it)}
                >
                  <button
                    className={`voz-oir ${carga ? 'cargando' : ''}`}
                    tabIndex={-1}
                    aria-label={`${suena ? 'Parar' : 'Escuchar'} ${it.nombre}`}
                    title={frase.trim() ? `Oír «${frase.trim().slice(0, 40)}» con ${it.nombre}${it.motor === 'ai-studio' ? ' (gasta un pedido de AI Studio)' : ''}` : it.muestra ? `Oír su muestra${it.motor === 'ai-studio' ? ' (en inglés)' : ''}` : `Esta voz no trae muestra: oírla genera una frase de prueba con ${NOMBRE_MOTOR[it.motor]}, que gasta de tu cuenta`}
                    // Suena al apretar, no al soltar: unos 100 ms antes con el ratón. El clic ya no hace nada (ni elige la fila).
                    onPointerDown={(ev) => ev.button === 0 && (ev.stopPropagation(), setActivo(k), void oir.oir(it))}
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    {suena ? <span className="voz-ecualizador" aria-hidden="true"><i /><i /><i /></span> : carga ? <span className="voz-girando" aria-hidden="true" /> : <Icono de="video" />}
                  </button>
                  <Huella de={it.valor} />
                  <span className="voz-texto">
                    <strong>
                      {it.nombre}
                      <em>{origenDe(it)}</em>
                    </strong>
                    <small>
                      {it.bloqueo && <b className="voz-pago">Plan de pago</b>}
                      {it.como || NOMBRE_MOTOR[it.motor]}
                    </small>
                  </span>
                  <span className="voz-motor" title={conOrigen(it.motor)}>
                    <Logo de={LOGO[it.motor]} nombre={NOMBRE_MOTOR[it.motor]} chico />
                  </span>
                  {it.valor.includes(`:${TUYA}`) && (
                    // Tu voz guardada aquí: el primer clic pregunta, el segundo la quita (con su grabación).
                    <button
                      className={`voz-fav voz-quitar ${aQuitar === it.valor ? 'on' : ''}`}
                      tabIndex={-1}
                      aria-label={aQuitar === it.valor ? `Pulsa otra vez para quitar ${it.nombre}` : `Quitar ${it.nombre} de esta computadora`}
                      title={aQuitar === it.valor ? 'Pulsa otra vez para quitarla, con su grabación' : 'Quitar tu voz de esta computadora'}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        if (aQuitar !== it.valor) return setAQuitar(it.valor)
                        setAQuitar('')
                        // Si era la elegida, el video vuelve a «la mando yo»: esa voz ya no se puede generar.
                        void voz.quitarTuya(motorDe(it.valor).motor as ProveedorVoz, motorDe(it.valor).id).then(() => props.onQuitada(it.valor), () => {})
                      }}
                    >
                      <Icono de="basura" />
                    </button>
                  )}
                  <button className={`voz-fav ${fav ? 'on' : ''}`} tabIndex={-1} aria-label={fav ? `Quitar ${it.nombre} de favoritas` : `Guardar ${it.nombre} en favoritas`} aria-pressed={fav} onClick={(ev) => (ev.stopPropagation(), favorita(it.valor))}>
                    <Icono de="estrella" />
                  </button>
                  {props.valor === it.valor && <Icono de="palomita" className="ico voz-hecha" />}
                  {suena && oir.duracion > 0 && <span className="voz-avance" style={{ animationDuration: `${oir.duracion}s` }} />}
                </div>
              )
            })}
          </div>
        ))}
        {filtro === 'vc' && vcError && <p className="voz-vacio bad">{vcError}</p>}
        {filtro === 'vc' && vcCargando && <p className="voz-vacio">Trayendo las voces de Sloth…</p>}
        {filtro === 'vc' && !vcCargando && vcCatalogo.mas && (
          <button className="voz-mas" onClick={() => pedirCatalogo(vcCatalogo.pagina + 1)}>
            Ver más voces ({(vcCatalogo.total - vcCatalogo.items.length).toLocaleString('es-MX')} más)
          </button>
        )}
        {filtro === 'favoritas' && !filas.length && <p className="voz-vacio">Aún no tienes favoritas: pulsa la estrella de una voz y quedará aquí, y arriba de la lista.</p>}
        {buscando && filtro !== 'favoritas' && filtro !== 'vc' && !filas.length && !buscandoFuera && <p className="voz-vacio">Nada con «{busqueda.trim() || 'ese filtro'}». Prueba con grave, cálida, hombre, mujer o narración.</p>}
        {buscandoFuera && <p className="voz-vacio">Buscando en la biblioteca de Fish Audio…</p>}
        {!buscando && (
          <div className="voz-acciones">
            {!conGoogle && (
              <button onClick={() => (voz.conectar(), props.onCerrar())}>
                <Logo de="gemini" nombre="AI Studio" chico />
                <span className="voz-texto">
                  <strong>Conectar tu cuenta de Google</strong>
                  <small>Las voces de AI Studio, gratis</small>
                </span>
              </button>
            )}
            {e?.vc?.disponible && (
              <button onClick={() => (setFiltro('vc'), campo.current?.focus())}>
                <Logo de="sloth" nombre="Sloth" chico />
                <span className="voz-texto">
                  <strong>Voces de Sloth</strong>
                  <small>Cientos de voces con tus créditos: buscas, oyes y eliges</small>
                </span>
              </button>
            )}
            {(!e?.motores?.fish?.llave || !e?.motores?.elevenlabs?.llave) && (
              <a href="#/opciones">
                <Icono de="mas" />
                <span className="voz-texto">
                  <strong>Añadir {!e?.motores?.fish?.llave && !e?.motores?.elevenlabs?.llave ? 'Fish Audio o ElevenLabs' : !e?.motores?.fish?.llave ? 'Fish Audio' : 'ElevenLabs'}</strong>
                  <small>Con tu llave, en Opciones → Voz</small>
                </span>
              </a>
            )}
          </div>
        )}
      </div>

      <div className="voz-pie">
        {props.musica && (
          <button className={`voz-musica ${props.musica.encendida ? 'on' : ''}`} role="switch" aria-checked={props.musica.encendida} onClick={() => props.musica!.onCambio(!props.musica!.encendida)}>
            <Icono de="musica" />
            <span className="voz-texto">
              <strong>Música de fondo</strong>
              <small>Sintetizada y libre de derechos; baja sola cuando hablan</small>
            </span>
            <span className="voz-casilla" aria-hidden="true">
              {props.musica.encendida && <Icono de="palomita" />}
            </span>
          </button>
        )}
        <label className="voz-frase">
          <span>Tu frase</span>
          <input
            value={frase}
            maxLength={240}
            placeholder="Escribe algo y oye cualquier voz diciéndolo"
            onChange={(ev) => {
              setFrase(ev.target.value)
              try {
                localStorage.setItem(FRASE, ev.target.value)
              } catch {
                // Solo dura esta vez.
              }
            }}
            onKeyDown={(ev) => {
              // Como en el buscador: Esc primero para lo que suena, y luego cierra.
              if (ev.key === 'Escape') ev.preventDefault(), ev.stopPropagation(), oir.sonando || oir.cargando ? oir.parar() : props.onCerrar()
              if (ev.key === 'Enter' && actual?.item) ev.preventDefault(), void oir.oir(actual.item)
              // Con tu frase escrita también te mueves entre voces, para oírlas diciéndola una tras otra.
              if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') ev.preventDefault(), mover(ev.key === 'ArrowDown' ? 1 : -1)
            }}
          />
        </label>
        {oir.error ? (
          <p className="voz-aviso bad">{oir.error}</p>
        ) : (
          <p className="voz-aviso">
            {actual?.item && !actual.item.muestra && !frase.trim()
              ? `Sin muestra: oírla genera una frase con ${NOMBRE_MOTOR[actual.item.motor]} y gasta de tu cuenta.`
              : actual?.item?.motor === 'ai-studio' && !frase.trim()
              ? 'Su muestra es en inglés: escribe tu frase para oírla en español.'
              : frase.trim()
                ? '↑↓ otra voz · Enter la oye: se genera una vez y luego suena al instante.'
                : '↑↓ moverte · → escuchar · Enter elegir · Esc cerrar'}
          </p>
        )}
        {puedeClonar && (
          <button className="voz-clonar" onClick={() => (oir.parar(), setClonando(true))}>
            <Icono de="microfono" />
            Clonar tu voz
          </button>
        )}
      </div>
    </div>
  )
}

/** Textos para leer al grabar tu voz: unos 30 s cada uno, en español de todos los días. */
const PARA_LEER = [
  'El sábado fui al mercado temprano. Compré mangos, un poco de queso y pan recién hecho. De regreso me encontré a una vecina y nos quedamos platicando media hora sobre el clima, los precios y lo rápido que se va el año.',
  'Hoy les quiero contar algo que me pasó en el trabajo. Llegué tarde por el tráfico, pero nadie se dio cuenta porque la reunión también empezó tarde. Al final salió todo bien, y hasta nos invitaron un café.',
  'Si tuviera una tarde libre, me iría al parque con un libro y unos audífonos. Me sentaría bajo un árbol, vería pasar a la gente y dejaría el celular en la mochila por lo menos una hora.',
  'Para preparar un buen café de olla necesitas agua, canela, piloncillo y café molido. Hierve todo junto unos minutos, apaga el fuego, deja que repose y cuélalo antes de servirlo bien caliente.'
]

/**
 * Clonar tu voz sin salir del menú: la grabas ahí mismo (o subes una grabación) y queda en Fish Audio o ElevenLabs,
 * en tu cuenta (o en Voices Cloning, con los créditos de Sloth). `onListo` recibe la voz nueva.
 */
function Clonar({ voz, onListo, onVolver }: { voz: UsoVoz; onListo(v?: string): void; onVolver(): void }) {
  const e = voz.estado
  const destinos = (['fish', 'elevenlabs'] as ProveedorVoz[]).filter((p) => e?.motores?.[p]?.llave)
  /** El plan gratis de ElevenLabs no deja clonar (`can_use_instant_voice_cloning`). */
  const sinClonar = (p: ProveedorVoz | 'vc') => p === 'elevenlabs' && e?.motores?.elevenlabs?.plan?.clonar === false
  const [destino, setDestino] = useState<ProveedorVoz | 'vc'>(destinos[0] ?? 'vc')
  const [nombre, setNombre] = useState('Mi voz')
  const [archivo, setArchivo] = useState<File>()
  const [grabando, setGrabando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [nivel, setNivel] = useState(0)
  const [texto, setTexto] = useState(() => Math.floor(Math.random() * PARA_LEER.length))
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const grabadora = useRef<{ parar(): void }>(undefined)
  useEffect(() => () => grabadora.current?.parar(), [])
  // El foco entra aquí: así Esc vuelve a las voces y el teclado sigue en el menú.
  const volver = useRef<HTMLButtonElement>(null)
  useEffect(() => volver.current?.focus(), [])

  async function grabar() {
    setError('')
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } })
      const rec = new MediaRecorder(flujo)
      const trozos: Blob[] = []
      const ctx = new AudioContext()
      const analizador = ctx.createAnalyser()
      ctx.createMediaStreamSource(flujo).connect(analizador)
      const datos = new Uint8Array(analizador.fftSize)
      const inicio = Date.now()
      // El nivel y el tiempo, cuatro veces por segundo: lo justo para ver que te oye.
      const reloj = setInterval(() => {
        analizador.getByteTimeDomainData(datos)
        let pico = 0
        for (const d of datos) pico = Math.max(pico, Math.abs(d - 128))
        setNivel(Math.min(1, pico / 90))
        setSegundos(Math.floor((Date.now() - inicio) / 1000))
      }, 250)
      rec.ondataavailable = (ev) => trozos.push(ev.data)
      rec.onstop = () => {
        clearInterval(reloj)
        flujo.getTracks().forEach((t) => t.stop())
        void ctx.close()
        setGrabando(false)
        setNivel(0)
        const tipo = rec.mimeType || 'audio/webm'
        setArchivo(new File(trozos, `mi-voz.${tipo.includes('ogg') ? 'ogg' : 'webm'}`, { type: tipo }))
      }
      grabadora.current = { parar: () => rec.state !== 'inactive' && rec.stop() }
      rec.start()
      setArchivo(undefined)
      setSegundos(0)
      setGrabando(true)
    } catch {
      setError('No pude usar tu micrófono. Dale permiso o sube una grabación.')
    }
  }

  async function clonar() {
    if (!archivo || !nombre.trim()) return
    setOcupado(true)
    setError('')
    try {
      const nuevo = destino === 'vc' ? await voz.clonarVc(nombre.trim(), archivo) : await voz.clonar(destino, nombre.trim(), archivo)
      const nueva = (destino === 'vc' ? nuevo.vc?.voces : nuevo.motores?.[destino]?.voces)?.find((v) => v.propia && v.nombre === nombre.trim())
      onListo(nueva ? `${destino}:${nueva.id}` : undefined)
    } catch (x) {
      setError(x instanceof Error ? x.message : String(x))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="voz-clonar-panel" onKeyDown={(ev) => ev.key === 'Escape' && !grabando && (ev.preventDefault(), ev.stopPropagation(), onVolver())}>
      <div className="voz-clonar-cabeza">
        <button ref={volver} className="voz-volver" onClick={onVolver} aria-label="Volver a las voces">
          <Icono de="izquierda" />
        </button>
        <strong>Clonar tu voz</strong>
      </div>
      <div className="voz-pestanas" role="group" aria-label="Dónde se clona">
        {[...destinos, ...(e?.vc?.disponible ? (['vc'] as const) : [])].map((p) => (
          <button key={p} className={destino === p ? 'on' : ''} aria-pressed={destino === p} onClick={() => setDestino(p)}>
            <Logo de={LOGO[p]} nombre={MOTORES[p]} chico />
            {MOTORES[p]}
            {sinClonar(p) && <b className="voz-pago">Plan de pago</b>}
          </button>
        ))}
      </div>
      {/* Qué decir mientras grabas: así no te quedas en blanco y la voz sale con ritmo natural. */}
      <figure className="voz-leer">
        <blockquote>{PARA_LEER[texto]}</blockquote>
        <figcaption>
          No hace falta leerlo igual: dilo a tu modo.
          <button type="button" className="voz-otro" onClick={() => setTexto((t) => (t + 1) % PARA_LEER.length)}>
            <Icono de="recargar" />
            Otro texto
          </button>
        </figcaption>
      </figure>
      <div className={`voz-grabar ${grabando ? 'grabando' : ''}`}>
        <button className={`voz-boton ${grabando ? 'grabando' : ''}`} onClick={() => (grabando ? grabadora.current?.parar() : void grabar())}>
          <Icono de={grabando ? 'pausa' : 'microfono'} />
          {grabando ? `Parar · ${segundos} s` : archivo ? 'Grabar otra vez' : 'Grabar ahora'}
        </button>
        <span className="voz-nivel" aria-hidden="true">
          <i style={{ transform: `scaleX(${nivel})` }} />
        </span>
        <label className="voz-boton voz-subir">
          Subir grabación
          <input type="file" accept="audio/*,.m4a,.opus" onChange={(ev) => ev.target.files?.[0] && setArchivo(ev.target.files[0])} />
        </label>
      </div>
      <p className="small muted">
        {grabando
          ? segundos < 30
            ? `Lee en voz alta, natural, sin ruido de fondo. Unos ${30 - segundos} s más.`
            : 'Listo cuando quieras: con 30 s a un minuto sale mejor.'
          : archivo
            ? `${archivo.name}, ${(archivo.size / 1e6).toFixed(1)} MB. Queda privada: en tu cuenta de ${MOTORES[destino]}${destino === 'fish' ? ' o, si no deja crearla sin saldo, en esta computadora' : ''}.`
            : 'De 30 s a un minuto hablando tú, sin música. Queda privada, en tu cuenta.'}
        {sinClonar(destino) && ' Tu plan gratis de ElevenLabs no deja clonar: elige Fish Audio o Sloth, o sube de plan en ElevenLabs.'}
      </p>
      <input className="voz-nombre" value={nombre} onChange={(ev) => setNombre(ev.target.value)} placeholder="Cómo se llama" aria-label="Cómo se llama tu voz" />
      {destino === 'vc' && <p className="small muted">En Sloth, con tus créditos.</p>}
      {error && <p className="bad small">{error}</p>}
      <div className="voz-clonar-pie">
        <button className="primary" disabled={ocupado || grabando || !archivo || !nombre.trim() || sinClonar(destino)} onClick={() => void clonar()}>
          {ocupado ? 'Clonando…' : 'Clonar y usarla'}
        </button>
      </div>
    </div>
  )
}
