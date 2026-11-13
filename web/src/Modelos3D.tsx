import { memo, useCallback, type KeyboardEvent as TeclaReact, type PointerEvent as PunteroReact, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { Biblioteca3D, Modelo3D } from '../../shared/types'
import { api } from './api'
import { buscar, indexar } from './buscar3d'
import { useDesplazando } from './desplazando'
import { Icono } from './Iconos'
import { Acciones3D } from './Modelos3DAcciones'
import { ANGOSTO, useVisor3D, type ListoVisor, type Visor3D } from './Visor3D'
import './Modelos3D.css'

/**
 * «Modelos 3D»: la biblioteca que llenan los videos (`skills/modelos-3d`). Cada modelo es un cartel con su foto sobre
 * un foco cálido y, con el ratón (o el foco del teclado) encima, la cámara que se mece a su alrededor (`giro`); abajo,
 * para qué sirve y qué puede hacer. Se filtran por tipo (los de `categorias.json`; también con las teclas 1, 2, 3…), se
 * buscan como se escribe (`buscar3d.ts`: el más parecido primero) y se ordenan por tipo, por fecha o por nombre. Desde el
 * cartel se copia su nombre, que es lo que se le pide al agente. Al abrirlo, su ficha: se gira arrastrando, y dice qué
 * es, qué hace, sus etiquetas (buscan al tocarlas), qué da en el código, qué otros modelos necesita y de qué video salió;
 * con ← y → se pasa al de al lado. Con el teclado: / lleva al buscador, Enter abre el primero, ↓ baja a la rejilla y las
 * flechas se mueven por ella. Arriba, «Importar .glb» y «Nuevo modelo» (`Modelos3DAcciones.tsx`).
 *
 * Para que el scroll vaya fluido: mientras se desplaza, la rejilla no responde al ratón (los carteles que pasan bajo el
 * cursor no se levantan ni cargan su giro, que era casi todo el trabajo de cada cuadro), cada giro existe solo mientras
 * se mira, y lo que redibuja la app (los avisos de los hilos) no redibuja los carteles.
 */

type Orden = 'tipo' | 'recientes' | 'nombre'
const ORDENES: [Orden, string][] = [
  ['tipo', 'Por tipo'],
  ['recientes', 'Recientes'],
  ['nombre', 'A–Z'],
]
/** Lo que no dice su tipo, o dice uno que ya no está en `categorias.json`. */
const SIN_TIPO = 'Otros'
/** Los carteles que se ven al entrar: su foto se pide ya, sin esperar a que el navegador vea que están a la vista. */
const PRIMEROS = 12

const fecha = (iso?: string) => (iso ? new Date(`${iso}T12:00`).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const porNombre = (a: Modelo3D, b: Modelo3D) => a.nombre.localeCompare(b.nombre, 'es')
/** ¿Hay una ventana a la vista (la ficha, «Nuevo modelo», «Importar .glb» o un aviso de la app)? Menos `salvo`. */
const hayVentana = (salvo?: Element | null) =>
  [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].some((d) => d !== salvo && !salvo?.contains(d) && d.getClientRects().length > 0)
const escribiendo = (e: Event) => e.target instanceof HTMLElement && !!e.target.closest('input, textarea, select, [contenteditable="true"]')

/** La última biblioteca leída: al volver a la sección se ve al instante y se vuelve a leer detrás. */
let guardada: Biblioteca3D | null = null
/** Si Sloth abre en esta sección, la lista se pide al cargar el código, sin esperar a que React arme la app. */
let pedida: Promise<Biblioteca3D> | null = typeof location !== 'undefined' && location.hash.startsWith('#/modelos-3d') ? api<Biblioteca3D>('/api/modelos3d') : null

export const Modelos3D = memo(function Modelos3D() {
  const [biblioteca, setBiblioteca] = useState<Biblioteca3D | null>(guardada)
  const [error, setError] = useState('')
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState<string | null>(null)
  const [orden, setOrden] = useState<Orden>('tipo')
  const [abierto, setAbierto] = useState<string | null>(null)
  const campo = useRef<HTMLInputElement>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const rejilla = useRef<HTMLDivElement>(null)
  const cargar = () =>
    (pedida ?? api<Biblioteca3D>('/api/modelos3d')).finally(() => (pedida = null)).then(
      (b) => setBiblioteca((guardada = b)),
      (e) => setError(e.message)
    )
  useEffect(() => void cargar(), [])
  // Al entrar se arman primero los carteles que caben en la pantalla y los demás en el cuadro siguiente: los 103 de una
  // vez eran una tarea de 60 ms antes de ver el primero.
  const [todos, setTodos] = useState(false)
  useEffect(() => {
    if (!biblioteca || todos) return
    // Después de pintar (el setTimeout dentro del cuadro corre ya pintado).
    let despues = 0
    const cuadro = requestAnimationFrame(() => (despues = window.setTimeout(() => setTodos(true))))
    return () => (cancelAnimationFrame(cuadro), clearTimeout(despues))
  }, [biblioteca, todos])
  // `desplazando` mientras se mueve y hasta 200 ms después (el CSS quita el ratón a la rejilla).
  useDesplazando(raiz)
  const modelos = useMemo(() => biblioteca?.modelos ?? [], [biblioteca])
  // El visor 3D, uno solo mientras la sección está abierta (`Visor3D.tsx`). Con el ratón 350 ms sobre un cartel, ya
  // prepara su modelo: casi siempre es el que se va a abrir, y su ficha lo tiene al instante.
  const { visor, listo, marco } = useVisor3D(modelos)
  // Y los que se ven en la rejilla, con ella quieta (al entrar y cada vez que se deja de desplazar): el visor los prepara
  // de fondo, y abrir uno ya no tarda. Siempre todos los que se ven: el visor salta los que ya tiene, y vuelve a preparar
  // los que tuvo que quitar.
  useEffect(() => {
    const el = raiz.current
    if (!el || !visor.hay) return
    let espera = 0
    let pausado = false
    const mira = () => {
      clearTimeout(espera)
      // Mientras se desplaza, el visor no hace nada de fondo.
      if (!pausado) visor.pausar((pausado = true))
      espera = window.setTimeout(() => {
        visor.pausar((pausado = false))
        const ids = [...el.querySelectorAll<HTMLElement>('.m3d-cartel[data-id]')]
          .filter((c) => {
            const r = c.getBoundingClientRect()
            return r.bottom > 0 && r.top < innerHeight
          })
          .map((c) => c.dataset.id!)
          .filter((id) => guardada?.modelos.find((m) => m.id === id)?.visor)
        visor.precalentar(ids)
      }, 1200)
    }
    mira()
    el.addEventListener('scroll', mira, { passive: true })
    return () => (clearTimeout(espera), el.removeEventListener('scroll', mira))
  }, [visor, biblioteca])
  /** El último que preparó el ratón: pasar otra vez sobre él no lo vuelve a pedir. */
  const preparado = useRef('')
  const abiertoYa = useRef(abierto)
  abiertoYa.current = abierto
  const preparar = useCallback(
    (id: string) => {
      if (abiertoYa.current || !guardada?.modelos.find((m) => m.id === id)?.visor || preparado.current === id) return
      preparado.current = id
      visor.mostrar(id)
    },
    [visor]
  )
  const nombres = biblioteca?.categorias.map((c) => c.nombre) ?? []
  const tipoDe = (m: Modelo3D) => (m.categoria && nombres.includes(m.categoria) ? m.categoria : SIN_TIPO)
  const tipos = [...nombres, SIN_TIPO]
    .map((nombre) => ({ nombre, para: biblioteca?.categorias.find((c) => c.nombre === nombre)?.para ?? '', cuantos: modelos.filter((m) => tipoDe(m) === nombre).length }))
    .filter((t) => t.cuantos)
  const indices = useMemo(() => modelos.map(indexar), [modelos])
  const tipoExiste = !tipo || tipos.some((t) => t.nombre === tipo)
  useEffect(() => {
    if (biblioteca && !tipoExiste) setTipo(null)
  }, [biblioteca, tipoExiste])

  const hayBusqueda = busca.trim().length > 0
  const posicion = (m: Modelo3D) => (nombres.includes(tipoDe(m)) ? nombres.indexOf(tipoDe(m)) : nombres.length)
  const comparar = (a: Modelo3D, b: Modelo3D) =>
    orden === 'recientes' ? (b.actualizado ?? '').localeCompare(a.actualizado ?? '') || porNombre(a, b) : orden === 'nombre' ? porNombre(a, b) : posicion(a) - posicion(b) || porNombre(a, b)
  // El orden en que se ven, que es también el que siguen ← y → en la ficha: buscando, el más parecido primero.
  const enOrden = buscar(indices, busca)
    .filter((r) => !tipo || tipoDe(r.modelo) === tipo)
    .sort((a, b) => b.puntos - a.puntos || comparar(a.modelo, b.modelo))
    .map((r) => r.modelo)
  const elegido = tipos.find((t) => t.nombre === tipo)
  const ficha = modelos.find((m) => m.id === abierto)

  // «/» lleva al buscador; 1 son todos y 2, 3… cada tipo, en el orden de la barra. No escribiendo ni con una ventana
  // abierta (la ficha, «Nuevo modelo», «Importar .glb» o un aviso de la app).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (abierto || escribiendo(e) || e.ctrlKey || e.metaKey || e.altKey || hayVentana()) return
      if (e.key === '/') {
        e.preventDefault()
        campo.current?.focus()
      } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= tipos.length + 1) {
        setTipo(e.key === '1' ? null : tipos[Number(e.key) - 2].nombre)
        // Si el cartel que tenía el foco ya no está, el foco va al primero de los que quedan.
        requestAnimationFrame(() => document.activeElement === document.body && (rejilla.current?.querySelector<HTMLElement>('.m3d-cartel') ?? campo.current)?.focus())
      }
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }, [abierto, tipos])

  /** Las flechas en la rejilla: a los lados, y arriba y abajo una fila; arriba de la primera, al buscador. */
  function moverse(e: TeclaReact) {
    const paso = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 0, ArrowUp: 0 }[e.key]
    if (paso === undefined || abierto || !rejilla.current) return
    const carteles = [...rejilla.current.querySelectorAll<HTMLElement>('.m3d-cartel')]
    const i = carteles.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    e.preventDefault()
    const columnas = carteles.filter((c) => c.offsetTop === carteles[0].offsetTop).length
    const j = i + (paso || (e.key === 'ArrowDown' ? columnas : -columnas))
    if (j < 0) campo.current?.focus()
    else carteles[Math.min(j, carteles.length - 1)].focus()
  }

  /** Al cerrar la ficha, el foco vuelve al cartel del último que se vio (con ← y → pudo ser otro); si no está a la vista, al buscador. */
  function cerrar() {
    const id = abierto
    setAbierto(null)
    requestAnimationFrame(() => (rejilla.current?.querySelector<HTMLElement>(`[data-id="${id}"]`) ?? campo.current)?.focus())
  }

  /** En las pestañas, ← y → pasan a la de al lado y la eligen. */
  function entrePestanas(e: TeclaReact<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const todas = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    const i = todas.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    e.preventDefault()
    const otra = todas[(i + (e.key === 'ArrowRight' ? 1 : -1) + todas.length) % todas.length]
    otra.focus()
    otra.click()
  }

  return (
    <div className="m3d" ref={raiz}>
      <header className="m3d-cabeza">
        <div>
          <h1>Modelos 3D</h1>
          <p>
            Lo que ya está hecho para tus videos. Antes de modelar algo, el agente busca aquí; lo nuevo que hace, lo guarda aquí.
            {modelos.length > 0 && <span className="m3d-teclas"> Con el teclado, / busca y del 1 al {tipos.length + 1} se elige el tipo.</span>}
          </p>
        </div>
        <label className="m3d-busca" title="Tecla /">
          <Icono de="buscar" />
          <input
            ref={campo}
            placeholder="Buscar: caja, dinero, se abre…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setBusca('')
                e.currentTarget.blur()
              } else if (e.key === 'Enter' && enOrden[0]) setAbierto(enOrden[0].id)
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                rejilla.current?.querySelector<HTMLElement>('.m3d-cartel')?.focus()
              }
            }}
          />
          {busca && (
            <button title="Borrar la búsqueda" aria-label="Borrar la búsqueda" onClick={() => (setBusca(''), campo.current?.focus())}>
              <Icono de="cerrar" />
            </button>
          )}
        </label>
        <Acciones3D tipos={nombres} onImportado={(id) => void cargar().then(() => setAbierto(id))} />
      </header>

      {biblioteca && modelos.length > 0 && (
        <div className="m3d-barra">
          <div className="m3d-tipos" role="tablist" aria-label="Tipos" onKeyDown={entrePestanas}>
            {[{ nombre: null, para: '', cuantos: modelos.length }, ...tipos].map((t, i) => (
              <button
                key={t.nombre ?? ''}
                role="tab"
                aria-selected={tipo === t.nombre}
                tabIndex={tipo === t.nombre || (!tipoExiste && !t.nombre) ? 0 : -1}
                className={tipo === t.nombre ? 'on' : ''}
                title={`${t.para ? `${t.para} ` : ''}(tecla ${i + 1})`}
                onClick={() => setTipo(t.nombre)}
              >
                {t.nombre ?? 'Todos'} <span>{t.cuantos}</span>
              </button>
            ))}
          </div>
          <label className="m3d-orden" title="Ordenar">
            <Icono de="ordenar" />
            <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} aria-label="Ordenar">
              {ORDENES.map(([o, texto]) => (
                <option key={o} value={o}>
                  {texto}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {biblioteca && (hayBusqueda || elegido) && enOrden.length > 0 && (
        <div className="m3d-cuenta">
          <strong>{enOrden.length === 1 ? '1 modelo' : `${enOrden.length} modelos`}</strong>
          {elegido && ` de ${elegido.nombre}`}
          {hayBusqueda && ` con «${busca.trim()}»`}
          {elegido?.para && !hayBusqueda && <span> · {elegido.para}</span>}
          {hayBusqueda && <span className="m3d-pista"> · Enter abre el primero</span>}
        </div>
      )}
      {error && <p className="bad small">{error}</p>}

      {!biblioteca && !error ? (
        <div className="m3d-rejilla">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="m3d-cartel m3d-esqueleto" />
          ))}
        </div>
      ) : biblioteca && !modelos.length ? (
        <Vacio titulo="La biblioteca está vacía" texto="Cada video que haga un modelo 3D lo deja aquí, con su foto y para qué sirve." />
      ) : biblioteca && !enOrden.length ? (
        <Vacio titulo={`Ningún modelo${tipo ? ` de ${tipo}` : ''}${hayBusqueda ? ` con «${busca.trim()}»` : ''}`} texto="El siguiente video que lo necesite lo hará y lo guardará aquí.">
          <button className="m3d-boton" onClick={() => (setBusca(''), setTipo(null))}>
            Ver todos
          </button>
        </Vacio>
      ) : (
        <div className="m3d-rejilla" ref={rejilla} onKeyDown={moverse}>
          {(todos ? enOrden : enOrden.slice(0, 2 * PRIMEROS)).map((m, i) => (
            <Cartel key={m.id} modelo={m} tipo={tipo ? undefined : tipoDe(m)} pronto={i < PRIMEROS} onAbrir={setAbierto} onPreparar={preparar} />
          ))}
        </div>
      )}

      {marco}
      {ficha && (
        <Ficha
          visor={visor}
          listo={listo}
          modelo={ficha}
          tipo={tipoDe(ficha)}
          todos={modelos}
          onCerrar={cerrar}
          onIr={(id) => setAbierto(id)}
          onPaso={(paso) => {
            const lista = enOrden.some((m) => m.id === ficha.id) ? enOrden : modelos
            const i = lista.findIndex((m) => m.id === ficha.id)
            const otro = lista[(i + paso + lista.length) % lista.length]
            if (otro) setAbierto(otro.id)
          }}
          onBuscar={(texto) => {
            setBusca(texto)
            setTipo(null)
            setAbierto(null)
            requestAnimationFrame(() => campo.current?.focus())
          }}
          onTipo={(t) => {
            setTipo(t === SIN_TIPO ? null : t)
            setBusca('')
            setAbierto(null)
            requestAnimationFrame(() => raiz.current?.querySelector<HTMLElement>('.m3d-tipos [aria-selected="true"]')?.focus())
          }}
        />
      )}
    </div>
  )
})

/** Copia el nombre (id) de un modelo: es lo que se le pide al agente. Dice «copiado» un momento. */
function useCopiar() {
  const [copiado, setCopiado] = useState<string | null>(null)
  useEffect(() => {
    if (!copiado) return
    const t = setTimeout(() => setCopiado(null), 1600)
    return () => clearTimeout(t)
  }, [copiado])
  return [copiado, (id: string) => navigator.clipboard.writeText(id).then(() => setCopiado(id), () => {})] as const
}

/** Lo que el ratón se queda en un cartel antes de cargar su giro (ms): cruzarlo de camino a otro no lo carga. */
const ESPERA = 100
/** Lo que el ratón se queda en un cartel antes de preparar su visor 3D (ms). */
const PREPARA = 350

/**
 * Un modelo en la rejilla: su foto quieta y, con el ratón quieto encima (o con el foco del teclado), su giro. El
 * `<video>` solo existe desde que se queda hasta que se desvanece al salir: barrer la rejilla con el ratón no baja los
 * giros, y los que ya se vieron no se quedan ocupando memoria ni capas de la tarjeta gráfica. Con el teclado, la tecla C
 * copia su nombre. `tipo`, si no se está filtrando por uno; `pronto`, si se ve al entrar.
 */
const Cartel = memo(function Cartel({ modelo, tipo, pronto, onAbrir, onPreparar }: { modelo: Modelo3D; tipo?: string; pronto: boolean; onAbrir(id: string): void; onPreparar(id: string): void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [vivo, setVivo] = useState(false)
  const [girando, setGirando] = useState(false)
  const [copiado, copiar] = useCopiar()
  const reloj = useRef(0)
  useEffect(() => () => (clearTimeout(reloj.current), clearTimeout(preparo.current)), [])
  // Si volvió antes de que se fuera, sigue donde iba; `playing` lo vuelve a mostrar.
  const preparo = useRef(0)
  const entra = () => {
    clearTimeout(reloj.current)
    clearTimeout(preparo.current)
    // Si se queda un poco más, prepara su visor 3D (ver `preparar` en Modelos3D).
    preparo.current = window.setTimeout(() => onPreparar(modelo.id), PREPARA)
    if (video.current) video.current.play().catch(() => {})
    else if (modelo.giro) reloj.current = window.setTimeout(() => setVivo(true), ESPERA)
  }
  const sale = () => {
    clearTimeout(reloj.current)
    clearTimeout(preparo.current)
    video.current?.pause()
    setGirando(false)
    reloj.current = window.setTimeout(() => setVivo(false), 250)
  }
  return (
    <button
      className={`m3d-cartel${girando ? ' girando' : ''}`}
      data-id={modelo.id}
      aria-keyshortcuts="C"
      // Con el ratón abre al apretar, como los menús del sistema (un clic de persona dura unos 100 ms); con el teclado,
      // Enter. Copiar su nombre no la abre.
      onPointerDown={(e) => e.pointerType === 'mouse' && e.button === 0 && !(e.target as HTMLElement).closest('.m3d-copiar') && onAbrir(modelo.id)}
      onClick={(e) => !(e.target as HTMLElement).closest('.m3d-copiar') && onAbrir(modelo.id)}
      onKeyDown={(e) => {
        if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          copiar(modelo.id)
        }
      }}
      onMouseEnter={entra}
      onMouseLeave={sale}
      onFocus={(e) => e.currentTarget.matches(':focus-visible') && entra()}
      onBlur={sale}
    >
      <span className="m3d-foco" />
      {modelo.vista ? (
        <img className="m3d-foto" src={modelo.vista} alt="" loading={pronto ? 'eager' : 'lazy'} fetchPriority={pronto ? 'high' : 'auto'} decoding="async" draggable={false} />
      ) : (
        <span className="m3d-sin">Sin foto</span>
      )}
      {vivo && (
        <video ref={video} className="m3d-giro" src={modelo.giro} muted loop autoPlay playsInline disablePictureInPicture disableRemotePlayback onPlaying={() => setGirando(true)} />
      )}
      {tipo && <span className="m3d-tipo">{tipo}</span>}
      {/* Para el ratón; con el teclado es la tecla C, o «Copiar» en la ficha. */}
      <span
        aria-hidden="true"
        className={`m3d-copiar${copiado ? ' hecho' : ''}`}
        title={`Copiar su nombre («${modelo.id}») para pedírselo al agente (tecla C)`}
        onClick={(e) => {
          e.stopPropagation()
          copiar(modelo.id)
        }}
      >
        <Icono de={copiado ? 'palomita' : 'copiar'} />
        <span>{copiado ? 'Copiado' : modelo.id}</span>
      </span>
      <span className="m3d-pie">
        <strong>{modelo.nombre}</strong>
        <span className="m3d-resumen">{modelo.resumen ?? modelo.descripcion}</span>
        {modelo.hace?.length ? (
          <span className="m3d-hace" title={modelo.hace.join(' · ')}>
            <Icono de="palomita" />
            <span>{modelo.hace.join(' · ')}</span>
          </span>
        ) : null}
      </span>
    </button>
  )
})

/** Cuánto se puede acercar el modelo con la rueda en la ficha. */
const MAS_CERCA = 2
/**
 * Cómo viene la vuelta entera (`vitrina.tsx`): 36 cuadros por vuelta, uno cada 10°, a 4 alturas seguidas (de frente,
 * 25°, 50° y casi desde arriba), a 30 cuadros por segundo. Su paso 0 a la segunda altura es casi la foto del modelo.
 */
const PASOS = 36
const ALTURAS = 4
const ALTURA_FOTO = 1
const CPS = 30
const tiempoDe = (p: { altura: number; paso: number }) => (p.altura * PASOS + p.paso + 0.5) / CPS
/** Lo que se arrastra de arriba abajo para pasar a la altura siguiente (px). */
const POR_ALTURA = 80
/** Cuánto se mece a cada lado el giro de la vista (`vitrina.tsx`, VAIVEN), en grados. */
const VAIVEN = 24

/**
 * El modelo en la ficha. Con su visor 3D (`Visor3D.tsx`, el único de la sección), el modelo de verdad, con el código de
 * los videos: se gira en todos los ejes, se acerca a su geometría y se mueve. Al abrir, se le pide este modelo; cuando lo
 * tiene, se le pide desde el ángulo en que va el giro, y entonces se pone encima: no salta. Mientras tanto (unas décimas,
 * nada si ya lo preparó el ratón) y sin visor, lo de abajo. No se pone a media arrastrada: al soltar. Sus avisos: que lo
 * tocaron, las teclas de la ficha (Esc y las flechas, con el foco dentro) y, en angosto, la rueda, que desplaza la ficha.
 *
 * Quieto, se mece suave (su giro, el mismo de la rejilla). Al arrastrar, o con Mayús y las
 * flechas, pasa a su vuelta entera (`vuelta.webm`) y se ve por todos lados: de lado da la vuelta (todo el ancho de la
 * escena es una, y sigue sin tope) y de arriba abajo cambia de altura, hasta verlo casi desde arriba; empieza en el
 * ángulo en que iba el giro. Sin vuelta, recorre el vaivén del giro (la cámara va de un lado a otro con un seno: el punto
 * del arrastre se vuelve un ángulo y el ángulo, el momento del video que lo muestra). Saltar a un cuadro tarda unos ms:
 * va un salto a la vez y, si mientras llegaste a otro lado, el siguiente va directo ahí. Al soltar se queda donde lo
 * dejaste; un clic sin arrastrar no lo para; la rueda lo acerca hacia el ratón y el doble clic lo deja como estaba. Va
 * con la `key` del modelo: al pasar a otro, empieza de cero.
 */
function Escena({ visor, listo, modelo, onPaso, onTecla }: { visor: Visor3D; listo: ListoVisor; modelo: Modelo3D; onPaso(paso: number): void; onTecla(tecla: string): void }) {
  const entera = !!modelo.vuelta
  const conVisor = visor.hay && !!modelo.visor
  const [visorListo, setVisorListo] = useState(false)
  const alSoltar = useRef<(() => void) | null>(null)
  const fase = useRef<'pedido' | 'alineando' | 'puesto'>('pedido')
  /** Los `listo` de antes de abrir (de cuando el ratón lo preparó) no cuentan: cuentan los que contestan a esta ficha. */
  const listosAntes = useRef(listo?.n ?? 0)
  // Al abrir: su lugar (aún sin verse, para que el visor ya tenga su tamaño) y que enseñe este modelo.
  useEffect(() => {
    if (!conVisor) return
    visor.colocar(escena.current, false)
    visor.mostrar(modelo.id)
    return () => visor.colocar(null)
  }, [])
  // Sus avisos, mientras esta ficha está abierta.
  useEffect(() => {
    if (!conVisor) return
    visor.oir((d) => {
      if (d.que === 'toca') setAMano(true)
      else if (d.que === 'tecla' && d.key) onTecla(d.key)
      else if (d.que === 'rueda' && d.dy) escena.current?.closest('.m3d-ficha')?.scrollBy({ top: d.dy })
    })
    return () => visor.oir(null)
  })
  /** El ángulo en que va lo que se ve: la vuelta si se arrastró, o el giro (su vaivén alrededor de los 28° de la foto). */
  const azimutActual = () => {
    if (aMano && entera) return 28 + donde.current.paso * 10
    const s = solo.current
    return 28 + VAIVEN * (s?.duration ? Math.sin((s.currentTime / s.duration) * 2 * Math.PI) : 0)
  }
  // Ya lo tiene: primero se le pide desde este ángulo y, cuando contesta, se pone encima.
  useEffect(() => {
    if (!conVisor || listo?.id !== modelo.id || listo.n <= listosAntes.current) return
    const sigue = () => {
      if (fase.current === 'pedido') {
        fase.current = 'alineando'
        visor.mostrar(modelo.id, azimutActual())
      } else if (fase.current === 'alineando') {
        fase.current = 'puesto'
        setVisorListo(true)
        visor.colocar(escena.current, true)
      }
    }
    if (arrastre.current) alSoltar.current = sigue
    else sigue()
  }, [listo?.n])
  // Con el visor a la vista, el giro de abajo ya no se ve: deja de decodificarse.
  useEffect(() => {
    if (visorListo) solo.current?.pause()
  }, [visorListo])
  const sola = modelo.giro ?? modelo.vuelta
  const escena = useRef<HTMLDivElement>(null)
  const solo = useRef<HTMLVideoElement>(null)
  const mano = useRef<HTMLVideoElement>(null)
  /** El video que se recorre a mano: la vuelta, o sin ella el mismo giro. */
  const recorrido = () => (entera ? mano.current : solo.current)
  const arrastre = useRef<{ x: number; y: number; ancho: number; seMovio: boolean; desde: { altura: number; paso: number }; fase: number } | null>(null)
  const donde = useRef({ altura: ALTURA_FOTO, paso: 0 })
  const saltando = useRef(false)
  const pendiente = useRef<number | null>(null)
  const [aMano, setAMano] = useState(false)
  const [cerca, setCerca] = useState(1)
  // Hacia dónde acerca: el punto bajo el ratón.
  const [hacia, setHacia] = useState('50% 50%')
  const cercaYa = useRef(1)
  // La rueda acerca y aleja; va sin `passive` para frenar el desplazamiento de la ficha, pero solo si acerca o aleja: en
  // el tope, la rueda sigue desplazando la ficha, y en angosto acerca solo con Ctrl.
  useEffect(() => {
    const el = escena.current
    if (!el || !sola) return
    const rueda = (e: WheelEvent) => {
      if (matchMedia(ANGOSTO).matches && !e.ctrlKey) return
      const antes = cercaYa.current
      const otra = Math.max(1, Math.min(MAS_CERCA, antes * Math.exp(-e.deltaY * 0.002)))
      if (Math.abs(otra - antes) < 0.001) return
      e.preventDefault()
      const caja = el.getBoundingClientRect()
      if (antes === 1) setHacia(`${(((e.clientX - caja.left) / caja.width) * 100).toFixed(1)}% ${(((e.clientY - caja.top) / caja.height) * 100).toFixed(1)}%`)
      cercaYa.current = otra
      setCerca(otra)
    }
    el.addEventListener('wheel', rueda, { passive: false })
    return () => el.removeEventListener('wheel', rueda)
  }, [sola])
  const ir = (t: number) => {
    const v = recorrido()
    if (!v || Math.abs(v.currentTime - t) < 0.5 / CPS) return
    if (saltando.current) {
      pendiente.current = t
      return
    }
    saltando.current = true
    v.currentTime = t
  }
  /** Deja de mecerse y, con vuelta, pasa a ella en el ángulo en que iba el giro. */
  function tomar() {
    const s = solo.current
    s?.pause()
    if (!entera || aMano) return
    const fase = s?.duration ? Math.sin((s.currentTime / s.duration) * 2 * Math.PI) : 0
    donde.current = { altura: ALTURA_FOTO, paso: (Math.round((VAIVEN * fase) / 10) + PASOS) % PASOS }
    ir(tiempoDe(donde.current))
    setAMano(true)
  }
  /** Mueve la vuelta: `pasos` de 10° de lado y `alturas` de arriba abajo, desde `desde`. */
  function mover(desde: { altura: number; paso: number }, pasos: number, alturas: number) {
    donde.current = { paso: (((desde.paso + pasos) % PASOS) + PASOS) % PASOS, altura: Math.max(0, Math.min(ALTURAS - 1, desde.altura + alturas)) }
    ir(tiempoDe(donde.current))
  }
  // Con Mayús y las flechas, lo mismo que arrastrando: de lado gira 10°, arriba y abajo cambia de altura.
  useEffect(() => {
    if (!entera && !visorListo) return
    const tecla = (e: KeyboardEvent) => {
      const de = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
      if (!e.shiftKey || !de || hayVentana(escena.current?.closest('[role="dialog"]'))) return
      e.preventDefault()
      if (visorListo) {
        visor.girar([-de[0], de[1]])
        setAMano(true)
        return
      }
      tomar()
      mover(donde.current, de[0], de[1])
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  })
  const eventos = {
    onPointerDown(e: PunteroReact<HTMLDivElement>) {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const s = solo.current
      arrastre.current = {
        x: e.clientX,
        y: e.clientY,
        ancho: e.currentTarget.clientWidth,
        seMovio: false,
        desde: donde.current,
        fase: s?.duration ? Math.sin((s.currentTime / s.duration) * 2 * Math.PI) : 0,
      }
    },
    onPointerMove(e: PunteroReact<HTMLDivElement>) {
      const a = arrastre.current
      if (!a || (Math.abs(e.clientX - a.x) < 3 && Math.abs(e.clientY - a.y) < 3)) return
      if (!a.seMovio) {
        a.seMovio = true
        tomar()
        a.desde = donde.current
      }
      // A la derecha, el modelo gira hacia la derecha (la cámara, hacia la izquierda); hacia abajo, la cámara sube.
      const dx = (e.clientX - a.x) / a.ancho
      if (entera) mover(a.desde, Math.round(-dx * PASOS), Math.round((e.clientY - a.y) / POR_ALTURA))
      else {
        const v = solo.current
        if (!v?.duration) return
        const fase = Math.max(-1, Math.min(1, a.fase - dx * 2))
        ir(((Math.asin(fase) / (2 * Math.PI)) * v.duration + v.duration) % v.duration)
        setAMano(true)
      }
    },
    onPointerUp() {
      arrastre.current = null
      alSoltar.current?.()
      alSoltar.current = null
    },
    onPointerCancel() {
      arrastre.current = null
      alSoltar.current?.()
      alSoltar.current = null
    },
    onDoubleClick() {
      cercaYa.current = 1
      setCerca(1)
      setAMano(false)
      solo.current?.play().catch(() => {})
    },
  }
  const acercado = cerca > 1 ? { transform: `scale(${cerca})`, transformOrigin: hacia } : undefined
  const alSaltar = () => {
    saltando.current = false
    const t = pendiente.current
    pendiente.current = null
    if (t !== null) ir(t)
  }
  return (
    <div ref={escena} className={`m3d-ficha-escena${sola && !visorListo ? ' se-gira' : ''}`} {...(sola && !visorListo ? eventos : {})}>
      <div className="m3d-foco" />
      {sola ? (
        <video
          ref={solo}
          className={`m3d-solo${(entera && aMano) || visorListo ? ' oculto' : ''}`}
          src={sola}
          poster={modelo.vista}
          style={acercado}
          muted
          loop
          autoPlay
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          onSeeked={entera ? undefined : alSaltar}
        />
      ) : (
        modelo.vista && <img src={modelo.vista} alt="" draggable={false} />
      )}
      {entera && (
        <video
          ref={mano}
          className={`m3d-mano${aMano && !visorListo ? '' : ' oculto'}`}
          src={modelo.vuelta}
          style={acercado}
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          // Lista en el ángulo de la foto, para que al tomarla ya tenga su cuadro.
          onLoadedMetadata={(e) => (e.currentTarget.currentTime = tiempoDe(donde.current))}
          onSeeked={alSaltar}
        />
      )}
      {sola && !aMano && cerca === 1 && (
        <span className="m3d-arrastra">
          <Icono de="girar" />
          {visorListo || entera ? (matchMedia(ANGOSTO).matches ? 'Arrastra para verlo por todos lados' : 'Arrastra para verlo por todos lados; la rueda lo acerca') : 'Arrastra para girarlo'}
        </span>
      )}
      <button className="m3d-paso izq" title="El anterior (←)" aria-label="El anterior" onClick={() => onPaso(-1)}>
        <Icono de="anterior" />
      </button>
      <button className="m3d-paso der" title="El siguiente (→)" aria-label="El siguiente" onClick={() => onPaso(1)}>
        <Icono de="siguiente" />
      </button>
    </div>
  )
}

/** La ficha de un modelo, en grande. Esc la cierra; ← y → pasan al de al lado. */
function Ficha({
  visor,
  listo,
  modelo,
  tipo,
  todos,
  onCerrar,
  onIr,
  onPaso,
  onBuscar,
  onTipo,
}: {
  visor: Visor3D
  listo: ListoVisor
  modelo: Modelo3D
  tipo: string
  todos: Modelo3D[]
  onCerrar(): void
  onIr(id: string): void
  onPaso(paso: number): void
  onBuscar(texto: string): void
  onTipo(tipo: string): void
}) {
  const [copiado, copiar] = useCopiar()
  const dialogo = useRef<HTMLDivElement>(null)
  // Al abrir, el foco entra a la ficha: lo que se teclea ya no va al buscador ni a la rejilla de atrás.
  useEffect(() => {
    const cuadro = requestAnimationFrame(() => dialogo.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(cuadro)
  }, [])
  /** Pasa al de al lado sin que el foco se salga: el botón que lo tenía se va con el modelo de antes. */
  const pasar = (paso: number) => {
    onPaso(paso)
    requestAnimationFrame(() => dialogo.current?.contains(document.activeElement) || dialogo.current?.focus({ preventScroll: true }))
  }
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      // Con otra ventana encima (un aviso de la app), las teclas son de ella.
      if (hayVentana(dialogo.current)) return
      if (e.key === 'Escape') onCerrar()
      else if (escribiendo(e) || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
      else if (e.key === 'ArrowRight') pasar(1)
      else if (e.key === 'ArrowLeft') pasar(-1)
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  })
  /** Lo que toma el foco en la ficha, en orden. */
  const enfocables = () => [...(dialogo.current?.querySelectorAll<HTMLElement>('button, [href], select, input, [tabindex="0"]') ?? [])].filter((x) => x.offsetParent)
  /** Tab da la vuelta dentro de la ficha, sin salir a la rejilla de atrás. */
  function sinSalir(e: TeclaReact<HTMLDivElement>) {
    if (e.key !== 'Tab' || !dialogo.current) return
    const hay = enfocables()
    if (!hay.length) return
    const i = hay.indexOf(document.activeElement as HTMLElement)
    const j = e.shiftKey ? (i <= 0 ? hay.length - 1 : i - 1) : i < 0 || i === hay.length - 1 ? 0 : i + 1
    e.preventDefault()
    hay[j].focus()
  }
  // Solo cierra un clic que empezó y acabó en el velo: soltar fuera una selección de texto no la cierra.
  const desdeElVelo = useRef(false)
  const necesita = modelo.usa.map((id) => todos.find((m) => m.id === id) ?? { id, nombre: id, fuera: true })

  return (
    <div className="m3d-velo" onPointerDown={(e) => (desdeElVelo.current = e.target === e.currentTarget)} onClick={(e) => desdeElVelo.current && e.target === e.currentTarget && onCerrar()}>
      <div ref={dialogo} className="m3d-ficha" role="dialog" aria-modal="true" aria-label={modelo.nombre} tabIndex={-1} onKeyDown={sinSalir}>
        <Escena
          key={modelo.id}
          visor={visor}
          listo={listo}
          modelo={modelo}
          onPaso={pasar}
          onTecla={(t) => {
            if (hayVentana(dialogo.current)) return
            if (t === 'Escape') onCerrar()
            // Tab con el foco en el visor: al primero (o, con Mayús, al último) de la ficha.
            else if (t === 'Tab' || t === 'Shift+Tab') (t === 'Tab' ? enfocables()[0] : enfocables().at(-1))?.focus()
            else pasar(t === 'ArrowRight' ? 1 : -1)
          }}
        />
        <div className="m3d-ficha-texto">
          <button className="m3d-cerrar" title="Cerrar (Esc)" aria-label="Cerrar" onClick={onCerrar}>
            <Icono de="cerrar" />
          </button>
          <button className="m3d-ficha-tipo" title={`Ver los de ${tipo}`} onClick={() => onTipo(tipo)}>
            {tipo}
          </button>
          <div>
            <h2>{modelo.nombre}</h2>
            {modelo.resumen && <p className="m3d-ficha-resumen">{modelo.resumen}</p>}
          </div>
          <p className="m3d-descripcion">{modelo.descripcion}</p>

          {modelo.hace?.length ? (
            <div className="m3d-bloque">
              <h3>Qué puede hacer</h3>
              <ul className="m3d-puede">
                {modelo.hace.map((h) => (
                  <li key={h}>
                    <Icono de="palomita" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="m3d-bloque">
            <h3>Se encuentra por</h3>
            <p className="m3d-etiquetas">
              {modelo.etiquetas.map((e) => (
                <button key={e} title={`Buscar «${e}»`} onClick={() => onBuscar(e)}>
                  {e}
                </button>
              ))}
            </p>
          </div>

          <dl className="m3d-datos">
            <dt>En el código</dt>
            <dd>
              {modelo.exporta.map((n) => (
                <code key={n}>{n}</code>
              ))}
            </dd>
            {necesita.length > 0 && (
              <>
                <dt>Necesita</dt>
                <dd>
                  {/* Los de la plantilla (como icono-3d) no se enseñan aquí: van de nombre, sin enlace. */}
                  {necesita.map((m) =>
                    'fuera' in m ? (
                      <code key={m.id} title="Viene con la plantilla de los videos">
                        {m.nombre}
                      </code>
                    ) : (
                      <button key={m.id} className="m3d-enlace" onClick={() => onIr(m.id)}>
                        {m.nombre}
                      </button>
                    )
                  )}
                </dd>
              </>
            )}
            <dt>Salió de</dt>
            <dd>
              {modelo.origen ?? '—'}
              {modelo.creado && <span className="m3d-suave"> · {fecha(modelo.creado)}</span>}
            </dd>
            {modelo.actualizado && modelo.actualizado !== modelo.creado && (
              <>
                <dt>Mejorado</dt>
                <dd>{fecha(modelo.actualizado)}</dd>
              </>
            )}
          </dl>

          <div className="m3d-usar">
            <span>
              Para usarlo, pídeselo al agente por su nombre: <code>{modelo.id}</code>
            </span>
            <button className="m3d-boton" onClick={() => copiar(modelo.id)}>
              <Icono de={copiado ? 'palomita' : 'copiar'} />
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Vacio({ titulo, texto, children }: { titulo: string; texto: string; children?: ReactNode }) {
  return (
    <div className="m3d-vacio">
      <Icono de="cubo" />
      <strong>{titulo}</strong>
      <p>{texto}</p>
      {children}
    </div>
  )
}
