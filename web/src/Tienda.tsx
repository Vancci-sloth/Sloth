import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AdjuntoComunidad, EstiloTienda, FondoComunidad, OrdenTienda, PruebasEstilo, TiendaEstilos } from '../../shared/types'
import { api } from './api'
import { hace, ParaInstalar, Texto } from './Comunidad'
import { Desplegable } from './Desplegable'
import { marcarIncompletos } from './Estilos'
import { VerEvidencia } from './Evidencia'
import { GuiaVista } from './Guia'
import { Icono, type NombreIcono } from './Iconos'
import { PRINCIPIO, useMuroVivo } from './muroVivo'
import { anotarVistos, type Ficha, fichasDe, type Filtros, hayFiltros, opcionesDe, ordenar as enOrden, pasa, TEMAS, vistosAntes } from './tiendaFiltros'
import './Tienda.css'

/**
 * La tienda de estilos (`licencias/src/tienda.ts`), en la sección Estilos de la comunidad. Llega entera y se filtra
 * aquí, al instante (`tiendaFiltros.ts`): un buscador, de qué va el video (los temas, que salen de lo que cada estilo
 * dice de sí), su forma, los que son nuevos para ti y el orden: los favoritos de la comunidad (más me gusta), los más
 * usados, descargados, lo que más gana este mes o lo nuevo. Cada opción dice cuántos estilos da. Desde el visor, el
 * nombre de quien lo hizo y sus temas llevan a más como ese. Se recorre viendo: un muro con la portada de cada estilo, en la forma de su video, y a la derecha, donde las
 * otras secciones tienen la tarjeta de la comunidad, un visor que no se va al bajar. Un clic en una portada (o las
 * flechas) pone ahí su video entero, con Instalar, cómo se usa y sus números, que son públicos: me gusta, descargas,
 * videos que otras personas hicieron con él, cuántas personas y variantes, y sus puntos del reparto con lo que se lleva
 * del fondo. Los comentarios, editarlo y aprobarlo siguen en su publicación. La ve cualquiera; instalar es de quien apoya: a los demás, «Instalar» les abre la invitación a apoyar (`ApoyarParaInstalar`). Cómo se cuentan los puntos lo explica el fondo (`Fondo.tsx`). El creador ve además las pruebas de cada estilo (la
 * portada de cada video, agrupadas por persona) y descarta lo que no es de verdad antes de pagar (`Pruebas`).
 */
const ORDENES: { id: OrdenTienda; nombre: string }[] = [
  { id: 'favoritos', nombre: 'Favoritos de la comunidad' },
  { id: 'usados', nombre: 'Más usados' },
  { id: 'descargas', nombre: 'Más descargados' },
  { id: 'ganando', nombre: 'Ganando este mes' },
  { id: 'nuevos', nombre: 'Nuevos' }
]

const ORDEN_GUARDADO = 'sloth-tienda-orden'
const leerOrden = (): OrdenTienda => {
  try {
    const o = localStorage.getItem(ORDEN_GUARDADO)
    return ORDENES.some((x) => x.id === o) ? (o as OrdenTienda) : 'favoritos'
  } catch {
    return 'favoritos'
  }
}

export const dinero = (m: FondoComunidad['montos'][number]) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: m.moneda, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2 }).format(m.monto) + ` ${m.moneda}`
const numero = (n: number) => n.toLocaleString('es-MX')

export function Tienda(props: {
  version: number
  creador: boolean
  /** Quién eres en la comunidad: lo tuyo no se instala. */
  yo?: string
  /** Dónde va el visor: el sitio que le deja `Comunidad.tsx` a la derecha. */
  visorEn: HTMLElement | null
  /** Con algo abierto encima (una publicación, tu perfil): el visor se calla y las flechas no son suyas. */
  quieta: boolean
  onAbrir(id: string): void
  conNombre(accion: () => void): void
}) {
  const { version, creador, onAbrir, conNombre } = props
  const [orden, setOrden] = useState<OrdenTienda>(leerOrden)
  const [filtros, setFiltros] = useState<Filtros>({ q: '' })
  const [tienda, setTienda] = useState<TiendaEstilos | null>(null)
  const [error, setError] = useState('')
  const [revisando, setRevisando] = useState<EstiloTienda | null>(null)
  const [recargar, setRecargar] = useState(0)
  const pedido = useRef(0)

  // La tienda se pide entera: buscar, filtrar y ordenar es de aquí, sin esperar a nadie.
  useEffect(() => {
    const n = ++pedido.current
    setError('')
    api<TiendaEstilos>('/api/comunidad/estilos').then(
      (t) => n === pedido.current && setTienda(t),
      (e: Error) => n === pedido.current && setError(e.message)
    )
  }, [version, recargar])

  // Cada estilo con sus temas, su forma y si es nuevo para ti; y los que ya viste, anotados para la próxima vez.
  const fichas = useMemo(() => fichasDe(tienda?.estilos ?? [], vistosAntes()), [tienda])
  useEffect(() => {
    if (tienda) anotarVistos(tienda.estilos.map((e) => e.publicacion.id))
  }, [tienda])
  // Los tuyos a los que les falta algo de lo que lleva todo estilo. Lo que falta solo te llega de los tuyos; al creador
  // le llega de todos, y a él no se le pinta. La barra lateral lo recuerda en rojo hasta que no quede ninguno.
  const incompletos = useMemo(() => (creador ? [] : (tienda?.estilos ?? []).filter((e) => e.publicacion.incompleto)), [tienda, creador])
  useEffect(() => {
    if (tienda && !creador) marcarIncompletos(incompletos.length)
  }, [tienda, creador, incompletos])
  const visibles = useMemo(() => enOrden(fichas.filter((x) => pasa(x, filtros)).map((x) => x.e), orden), [fichas, filtros, orden])
  const opciones = useMemo(() => opcionesDe(fichas, filtros), [fichas, filtros])
  const filtrando = hayFiltros(filtros)
  /** Cambia un filtro; el mismo otra vez lo quita. */
  const alternar = <K extends 'tema' | 'forma' | 'nuevos' | 'revision'>(k: K, v: Filtros[K]) => setFiltros((x) => ({ ...x, [k]: x[k] === v ? undefined : v }))

  // Al entrar el pago, lo instalado de antes se abre también: Sloth vuelve a preguntar al cobro y quita el candado de
  // esos estilos (`SinApoyo.tsx`) sin esperar a su vistazo de cada 6 horas.
  const sinApoyo = useRef(false)
  useEffect(() => {
    if (!tienda) return
    if (sinApoyo.current && !tienda.sinApoyo) void api('/api/licencia?fresco').catch(() => {})
    sinApoyo.current = !!tienda.sinApoyo
  }, [tienda])

  function ordenar(o: OrdenTienda) {
    setOrden(o)
    try {
      localStorage.setItem(ORDEN_GUARDADO, o)
    } catch {
      // Sin almacenamiento: el orden dura lo que la vista.
    }
  }

  function megusta(e: EstiloTienda) {
    conNombre(() => {
      const cambiar = (p: Partial<EstiloTienda['publicacion']>) =>
        setTienda((t) => t && { ...t, estilos: t.estilos.map((x) => (x.publicacion.id === e.publicacion.id ? { ...x, publicacion: { ...x.publicacion, ...p } } : x)) })
      const antes = { likes: e.publicacion.likes, megusta: e.publicacion.megusta }
      cambiar({ megusta: !antes.megusta, likes: antes.likes + (antes.megusta ? -1 : 1) })
      api<{ likes: number; megusta: boolean }>(`/api/comunidad/p/${e.publicacion.id}/megusta`, {}).then(cambiar, (err: Error) => (cambiar(antes), setError(err.message)))
    })
  }

  return (
    <section className="tienda" aria-label="Tienda de estilos">
      {/* A los tuyos que no salen en la tienda porque les falta algo de lo que lleva todo estilo: en rojo, con qué. */}
      {incompletos.map(({ publicacion: p }) => (
        <div key={p.id} className="tienda-falta" role="alert">
          <span>
            <strong>A tu estilo «{p.adjuntos.find((a) => a.tipo === 'estilo')?.nombre ?? p.titulo}» le falta:</strong> {p.incompleto!.join('; ')}. Mientras tanto no sale en la tienda ni suma en el fondo.
          </span>
          <button onClick={() => dispatchEvent(new Event('sloth-compartir-tuyo'))}>Completarlo</button>
        </div>
      ))}
      <div className="tienda-barra">
        <label className="tienda-buscar">
          <Icono de="buscar" />
          <input type="search" value={filtros.q} onChange={(e) => setFiltros((x) => ({ ...x, q: e.target.value }))} placeholder="Busca un estilo: animales, terror, 3D, quién lo hizo…" aria-label="Buscar estilos" />
          {tienda && (
            <span className="tienda-cuantos">
              {filtrando ? `${numero(visibles.length)} de ${numero(fichas.length)}` : `${numero(fichas.length)} ${fichas.length === 1 ? 'estilo' : 'estilos'}`}
            </span>
          )}
        </label>
        {/* De qué va el video. */}
        {opciones.temas.length > 0 && (
          <nav className="tienda-filtros temas" aria-label="De qué va el video">
            {opciones.temas.map((t) => (
              <Opcion key={t.id} on={filtros.tema === t.id} n={t.n} onClick={() => alternar('tema', t.id)}>
                {t.nombre}
              </Opcion>
            ))}
          </nav>
        )}
        {/* Su forma, lo nuevo, de quién, y el orden. */}
        <div className="tienda-filtros">
          {filtros.autor && (
            <button className="on" title="Volver a ver los de todos" onClick={() => setFiltros((x) => ({ ...x, autor: undefined }))}>
              De {filtros.autor.nombre} <Icono de="cerrar" />
            </button>
          )}
          {(opciones.nuevos > 0 || filtros.nuevos) && (
            <Opcion on={!!filtros.nuevos} n={opciones.nuevos} titulo="Los que no estaban la última vez que abriste Sloth" onClick={() => alternar('nuevos', true)}>
              Nuevos para ti
            </Opcion>
          )}
          <Opcion on={filtros.forma === 'vertical'} n={opciones.vertical} titulo="Para TikTok, Reels y Shorts" onClick={() => alternar('forma', 'vertical')}>
            Verticales
          </Opcion>
          <Opcion on={filtros.forma === 'horizontal'} n={opciones.horizontal} titulo="Para YouTube" onClick={() => alternar('forma', 'horizontal')}>
            Horizontales
          </Opcion>
          {creador && (opciones.revision > 0 || filtros.revision) && (
            <Opcion on={!!filtros.revision} n={opciones.revision} titulo="Los que faltan por aprobar: solo los ves tú y quien los compartió" onClick={() => alternar('revision', true)}>
              En revisión
            </Opcion>
          )}
          {filtrando && (
            <button className="tienda-quitar" onClick={() => setFiltros({ q: '' })}>
              Quitar filtros
            </button>
          )}
          <Desplegable
            className="tienda-orden"
            nombre="Orden"
            titulo="Cómo se ordenan"
            icono={<Icono de="filtros" />}
            valor={orden}
            opciones={ORDENES.map((o) => ({ value: o.id, label: o.nombre }))}
            onCambio={(o) => ordenar(o as OrdenTienda)}
          />
        </div>
      </div>

      {error && <p className="tienda-error">{error}</p>}
      {!tienda && !error && <div className="com-cargando">Cargando…</div>}
      {tienda && !visibles.length && (
        <div className="com-vacio">
          <strong>{!filtrando ? 'Aún no hay estilos' : filtros.q.trim() ? `Nada con «${filtros.q.trim()}»` : 'Nada con esos filtros'}</strong>
          <p>{filtrando ? 'Prueba con otras palabras, o haz tú el estilo que buscas y compártelo.' : 'Sé el primero: comparte uno tuyo con «Compartir un estilo tuyo», aquí arriba.'}</p>
          {filtrando && (
            <button className="tienda-todos" onClick={() => setFiltros({ q: '' })}>
              Ver los {numero(fichas.length)} estilos
            </button>
          )}
        </div>
      )}
      {!!visibles.length && (
        <Escaparate
          estilos={visibles}
          orden={orden}
          fichas={fichas}
          yo={props.yo}
          visorEn={props.visorEn}
          quieta={props.quieta || !!revisando}
          onAbrir={onAbrir}
          onMegusta={megusta}
          onPruebas={creador ? setRevisando : undefined}
          // Quien no apoya ve todo, pero «Instalar» le abre la invitación; al apoyar, la tienda se vuelve a pedir.
          sinApoyo={tienda?.sinApoyo?.estilos}
          onApoyo={() => setRecargar((n) => n + 1)}
          // Las puertas del visor: lo demás se quita, para ver todo lo de esa persona o de ese tema.
          onAutor={(autor) => setFiltros({ q: '', autor })}
          onTema={(tema) => setFiltros({ q: '', tema })}
        />
      )}
      {/* Al final del muro, lo que quedó fuera. */}
      {filtrando && visibles.length > 0 && visibles.length < fichas.length && (
        <button className="tienda-todos" onClick={() => setFiltros({ q: '' })}>
          Viendo {numero(visibles.length)} de {numero(fichas.length)}. Ver todos
        </button>
      )}
      {revisando && <Pruebas e={revisando} onCerrar={() => (setRevisando(null), setRecargar((n) => n + 1))} />}
    </section>
  )
}

/** Una opción de los filtros: su nombre y cuántos estilos da con lo demás ya elegido. Sin ninguno, no se puede elegir. */
function Opcion({ on, n, titulo, onClick, children }: { on: boolean; n: number; titulo?: string; onClick(): void; children: ReactNode }) {
  return (
    <button className={on ? 'on' : ''} aria-pressed={on} disabled={!n && !on} title={titulo} onClick={onClick}>
      {children} <i>{numero(n)}</i>
    </button>
  )
}

const PAGINA = 'https://sloth.vancci.org'
/** La versión de los términos que acepta quien apoya desde aquí: la de `TERMINOS` en la página (su «Última actualización»). */
const TERMINOS = '2026-11-18'
/** Cada cuánto se mira si el pago ya entró, y durante cuánto, después de abrir el cobro. */
const MIRAR_CADA = 8000
const MIRAR_DURANTE = 10 * 60_000

/** El apoyo de hoy, en dólares: lo que se paga el primer mes, hasta dónde baja y cuánto cada mes (`/api/licencia/precio`). */
interface Precio {
  mensual: number
  base: number
  paso: number
}

/**
 * Lo que se cobra, dicho junto al botón: el apoyo sube con la gente y a cada quien le baja cada mes hasta `base`. Sin
 * respuesta del cobro no se dice un número: se cobra el de hoy, que se ve en la página de pago.
 */
export function cobroDe(p: Precio | undefined): string {
  if (!p) return 'El apoyo de cada mes, al precio de hoy (lo ves antes de pagar)'
  if (p.mensual <= p.base) return `$${p.base} USD al mes`
  if (p.mensual - p.paso <= p.base) return `$${p.mensual} USD el primer mes y $${p.base} USD cada mes desde el segundo`
  return `$${p.mensual} USD el primer mes y $${p.paso} menos cada mes hasta quedar en $${p.base} USD al mes`
}

/**
 * Lo que sale cuando quien no apoya quiere instalar un estilo (`ParaInstalar`, en el visor o en su publicación): la
 * invitación a apoyar, encima de todo. Mientras está abierta mira si el pago ya entró (cuando la tienda deja de decir
 * `sinApoyo`): entonces se cierra sola (`onListo`), con el estilo ya listo para instalar.
 */
export function ApoyarParaInstalar({ nombre, estilos, onListo, onCerrar }: { nombre: string; estilos?: number; onListo(): void; onCerrar(): void }) {
  // Cuántos estilos hay: lo trae la tienda; desde una publicación, se pregunta.
  const [cuantos, setCuantos] = useState(estilos)
  const mirar = (alApoyar?: () => void) =>
    api<TiendaEstilos>('/api/comunidad/estilos').then(
      (t) => (t.sinApoyo ? setCuantos(t.sinApoyo.estilos) : alApoyar?.()),
      () => {}
    )
  useEffect(() => {
    if (cuantos === undefined) void mirar()
    const tecla = (ev: KeyboardEvent) => ev.key === 'Escape' && onCerrar()
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }, [])
  return createPortal(
    <div className="tienda-pruebas" role="dialog" aria-modal="true" aria-label={`Apoya para instalar ${nombre}`} onClick={(ev) => ev.target === ev.currentTarget && onCerrar()}>
      <div className="tienda-invita">
        <button className="tienda-pruebas-cerrar" onClick={onCerrar} aria-label="Cerrar">
          <Icono de="cerrar" />
        </button>
        <Cerrada para={nombre} estilos={cuantos ?? 0} onRevisar={() => void mirar(() => (void api('/api/licencia?fresco').catch(() => {}), onListo()))} />
      </div>
    </div>,
    document.body
  )
}

/**
 * La invitación a apoyar, para quien quiere instalar un estilo (`para`) y no apoya: cuántos estilos hay, lo que recibe quien apoya y el botón que los desbloquea.
 * «Desbloquea N estilos» abre de una vez el pago con tarjeta en Stripe, con el correo de su cuenta
 * (`/api/licencia/apoyar`): al pagarse, la comunidad lo reconoce por ese correo y la tienda se abre sola (`onRevisar`
 * vuelve a pedirla al regresar a Sloth y cada pocos segundos). Las otras formas de pago siguen en la página; quien
 * apoyó con otro correo pega su clave en Opciones. Lo que se cobra lo dice el cobro (`precio`), y con la escalera va
 * también lo que más pesa: su precio se queda con él mientras siga, y si cancela y vuelve entra con el del día.
 */
function Cerrada({ para, estilos, onRevisar }: { para: string; estilos: number; onRevisar(): void }) {
  const [ocupado, setOcupado] = useState(false)
  const [esperando, setEsperando] = useState(false)
  const [error, setError] = useState('')
  const [precio, setPrecio] = useState<Precio>()
  useEffect(() => {
    api<Precio>('/api/licencia/precio').then(setPrecio, () => {})
  }, [])
  // «Más de 10», «más de 20»…; con pocos, uno menos de los que hay.
  const mas = estilos > 10 ? Math.floor((estilos - 1) / 10) * 10 : estilos - 1

  useEffect(() => {
    if (!esperando) return
    const reloj = setInterval(onRevisar, MIRAR_CADA)
    const fin = setTimeout(() => setEsperando(false), MIRAR_DURANTE)
    addEventListener('focus', onRevisar)
    return () => {
      clearInterval(reloj)
      clearTimeout(fin)
      removeEventListener('focus', onRevisar)
    }
  }, [esperando])

  async function desbloquear() {
    setOcupado(true)
    setError('')
    try {
      const { enlace } = await api<{ enlace: string }>('/api/licencia/apoyar', { terminos: TERMINOS, ...(precio ? { monto: precio.mensual } : {}) })
      window.open(enlace, '_blank')
      setEsperando(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="tienda-cerrada">
      <span className="tienda-cerrada-icono">
        <Icono de="claqueta" />
      </span>
      <h2>Para instalar «{para}», apoya a Sloth</h2>
      <p>
        Instalar los estilos de la comunidad es para quienes apoyan a Sloth. Con tu apoyo instalas este{mas >= 1 ? ` y los más de ${numero(mas)} que hay` : ''}, con un clic cada uno.
      </p>
      <ul>
        <li>
          <Icono de="claqueta" /> Todos los estilos de la comunidad, y los que vayan llegando.
        </li>
        <li>
          <Icono de="estrella" /> Lo nuevo de Sloth antes que nadie, y tu voto en lo que sale primero.
        </li>
        <li>
          <Icono de="personas" /> La mitad de tu apoyo con tarjeta va al fondo de quienes hacen los estilos.
        </li>
      </ul>
      <button className="tienda-cerrada-boton" disabled={ocupado} onClick={() => void desbloquear()}>
        <Icono de="candado" /> {ocupado ? 'Abriendo el pago…' : estilos > 1 ? `Desbloquea ${numero(estilos)} estilos` : 'Desbloquea los estilos'}
      </button>
      {error && <p className="tienda-cerrada-nota tienda-cerrada-error">{error}</p>}
      {esperando ? (
        <p className="tienda-cerrada-nota">Se abrió el pago en tu navegador. En cuanto pagues, esto se cierra solo y ya puedes instalarlo.</p>
      ) : (
        <p className="tienda-cerrada-nota">
          {cobroDe(precio)}, con tarjeta. Al desbloquear aceptas ese cobro automático de cada mes, que cancelas cuando quieras, y los{' '}
          <a href={`${PAGINA}/terminos`} target="_blank" rel="noreferrer">
            términos
          </a>
          .{!!precio?.paso && ' Tu precio se queda contigo: mientras sigas no te sube, aunque suba para quien llegue después. Si cancelas y vuelves, entras con el precio de ese día.'}
        </p>
      )}
      <div className="tienda-cerrada-acciones">
        <button className="tienda-cerrada-ya" onClick={() => window.open(`${PAGINA}/#pago`, '_blank')}>
          Otras formas de pago
        </button>
        <button className="tienda-cerrada-ya" title="Pega la clave que te llegó al correo al apoyar" onClick={() => (location.hash = '/opciones')}>
          Ya apoyo
        </button>
      </div>
    </div>
  )
}

const videoDe = (e: EstiloTienda) => e.publicacion.adjuntos.find((a) => a.tipo === 'video')
const nombreDe = (e: EstiloTienda) => e.publicacion.titulo || e.publicacion.adjuntos.find((a) => a.tipo === 'estilo')?.nombre || 'Estilo'

/** Lo que dice cada portada bajo su nombre: el número del orden que elegiste. Sin nada que contar, nada. */
function datoDe(e: EstiloTienda, orden: OrdenTienda): { icono?: NombreIcono; texto: string; titulo: string } | null {
  const p = e.publicacion
  if (orden === 'nuevos') return { texto: hace(p.creada), titulo: 'Cuándo se compartió' }
  if (orden === 'usados') return e.videos ? { icono: 'video', texto: numero(e.videos), titulo: 'Videos que otras personas terminaron con él' } : null
  if (orden === 'descargas') return e.descargas ? { icono: 'descargar', texto: numero(e.descargas), titulo: 'Computadoras que lo instalaron' } : null
  if (orden === 'ganando') return e.mes.puntos ? { icono: 'corona', texto: `${numero(e.mes.puntos)} ${e.mes.puntos === 1 ? 'punto' : 'puntos'}`, titulo: 'Sus puntos en este reparto' } : null
  return p.likes ? { icono: 'pulgar', texto: numero(p.likes), titulo: 'Me gusta' } : null
}

/**
 * El muro y su visor. El muro va en la columna del centro; el visor, en el sitio que deja `Comunidad.tsx` a la derecha
 * (`visorEn`), y enseña el estilo elegido: al entrar, el primero, quieto; desde tu primer clic, cada estilo que eliges
 * se reproduce con sonido. Las flechas ← y → pasan al de al lado, salvo que escribas o estés sobre el video, donde
 * adelantan y atrasan.
 */
function Escaparate(props: {
  estilos: EstiloTienda[]
  orden: OrdenTienda
  /** Todos los de la tienda, con sus temas y si son nuevos: de ahí salen las puertas del visor. Sin ellas, no hay puertas. */
  fichas?: Ficha[]
  onAutor?(autor: { id: string; nombre: string }): void
  onTema?(tema: string): void
  /** No apoyas: cuántos estilos hay, para la invitación que sale al querer instalar uno. */
  sinApoyo?: number
  onApoyo?(): void
  yo?: string
  visorEn: HTMLElement | null
  quieta: boolean
  onAbrir(id: string): void
  onMegusta(e: EstiloTienda): void
  onPruebas?(e: EstiloTienda): void
}) {
  const { estilos, quieta } = props
  const [elegido, setElegido] = useState<string | null>(null)
  const [suena, setSuena] = useState(false)
  const muro = useRef<HTMLDivElement>(null)
  // Si el elegido ya no está (otra búsqueda), el primero.
  const i = Math.max(0, estilos.findIndex((e) => e.publicacion.id === elegido))
  const e = estilos[i]
  const ficha = (x: EstiloTienda) => props.fichas?.find((f) => f.e.publicacion.id === x.publicacion.id)

  // Las portadas a la vista se mueven solas, mudas; la elegida no, que ya se ve en el visor (`muroVivo.ts`).
  useMuroVivo(muro, estilos.map((x) => x.publicacion.id).join(), quieta, e?.publicacion.id)

  function ver(otro: EstiloTienda | undefined) {
    if (!otro) return
    setElegido(otro.publicacion.id)
    setSuena(true)
    muro.current?.querySelector(`[data-id="${otro.publicacion.id}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if (quieta || ev.ctrlKey || ev.metaKey || ev.altKey || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return
      const t = ev.target
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|VIDEO)$/.test(t.tagName))) return
      if (document.querySelector('[aria-modal="true"], .modal')) return
      const otro = estilos[i + (ev.key === 'ArrowRight' ? 1 : -1)]
      if (otro) (ev.preventDefault(), ver(otro))
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  })

  return (
    <>
      <div className="muro" ref={muro}>
        {estilos.map((x) => (
          <Portada
            key={x.publicacion.id}
            e={x}
            orden={props.orden}
            elegida={x === e}
            nuevo={!!ficha(x)?.nuevo}
            onVer={() => ver(x)}
          />
        ))}
      </div>
      {e &&
        props.visorEn &&
        createPortal(
          <Visor
            e={e}
            lugar={i + 1}
            de={estilos.length}
            suena={suena}
            quieta={quieta}
            suya={e.publicacion.autor.id === props.yo}
            temas={TEMAS.filter((t) => ficha(e)?.temas.includes(t.id))}
            deSuAutor={props.fichas?.filter((f) => f.e.publicacion.autor.id === e.publicacion.autor.id).length ?? 0}
            onAutor={props.onAutor}
            onTema={props.onTema}
            sinApoyo={props.sinApoyo}
            onApoyo={props.onApoyo}
            onIr={(paso) => ver(estilos[i + paso])}
            onAbrir={() => props.onAbrir(e.publicacion.id)}
            onMegusta={() => props.onMegusta(e)}
            onPruebas={props.onPruebas && (() => props.onPruebas?.(e))}
          />,
          props.visorEn
        )}
    </>
  )
}

/**
 * Un estilo en el muro: su portada con la forma de su video (vertical u horizontal), su nombre y de quién es. Encima de
 * la portada va, vacío, el video que se mueve cuando está a la vista: `muroVivo.ts` le pone su adelanto (el de un estilo
 * que subió su video entero) o, si no lo trae, su video, del que repite el principio.
 */
function Portada({ e, orden, elegida, nuevo, onVer }: { e: EstiloTienda; orden: OrdenTienda; elegida: boolean; nuevo: boolean; onVer(): void }) {
  const p = e.publicacion
  const video = videoDe(e)
  const imagen = video?.posterUrl ?? p.adjuntos.find((a) => a.tipo === 'imagen')?.url
  const dato = datoDe(e, orden)
  return (
    <button className={`muro-estilo${video?.vertical === false ? ' h' : ''}${elegida ? ' on' : ''}`} data-id={p.id} aria-pressed={elegida} onClick={onVer}>
      <span className="muro-portada">
        {imagen ? <img src={imagen} alt="" loading="lazy" decoding="async" /> : video ? <video src={video.url} muted preload="metadata" /> : <Icono de="claqueta" />}
        {video && <video className="muro-vivo" data-src={video.previaUrl ?? video.url} data-tope={video.previaUrl ? undefined : PRINCIPIO} muted loop playsInline preload="none" />}
        {p.incompleto ? <span className="tienda-revision falta">Le falta completar</span> : p.porAprobar ? <span className="tienda-revision">En revisión</span> : nuevo && <span className="tienda-revision nuevo">Nuevo</span>}
      </span>
      <span className="muro-nombre">{nombreDe(e)}</span>
      <span className="muro-autor">{p.autor.nombre || 'alguien'}</span>
      {dato && (
        <span className="muro-dato" title={dato.titulo}>
          {dato.icono && <Icono de={dato.icono} />} {dato.texto}
        </span>
      )}
    </button>
  )
}

/**
 * El estilo elegido, a la derecha: su video entero, Instalar, sus números, lo que hace y cómo se usa. «Comentarios» abre
 * su publicación, donde además se edita y el creador lo aprueba.
 */
function Visor(props: {
  e: EstiloTienda
  lugar: number
  de: number
  suena: boolean
  quieta: boolean
  suya: boolean
  /** De qué va, y cuántos estilos tiene quien lo hizo: las puertas a más como este. */
  temas: { id: string; nombre: string }[]
  deSuAutor: number
  onAutor?(autor: { id: string; nombre: string }): void
  onTema?(tema: string): void
  sinApoyo?: number
  onApoyo?(): void
  onIr(paso: 1 | -1): void
  onAbrir(): void
  onMegusta(): void
  onPruebas?(): void
}) {
  const { e } = props
  const p = e.publicacion
  const estilo = p.adjuntos.find((a) => a.tipo === 'estilo')
  const nombre = nombreDe(e)
  return (
    <section className="visor" aria-label={`Estilo ${nombre}`}>
      {/* Con otra llave, otro video: el del estilo nuevo, o el primero cuando por fin lo tocas. */}
      <Pantalla key={`${p.id}:${props.suena}`} video={videoDe(e)} imagen={p.adjuntos.find((a) => a.tipo === 'imagen')?.url} suena={props.suena} quieta={props.quieta} />
      <div className="visor-paso">
        <button disabled={props.lugar <= 1} title="Anterior (←)" aria-label="Estilo anterior" onClick={() => props.onIr(-1)}>
          <Icono de="anterior" />
        </button>
        <span>
          {numero(props.lugar)} de {numero(props.de)}
        </span>
        <button disabled={props.lugar >= props.de} title="Siguiente (→)" aria-label="Estilo siguiente" onClick={() => props.onIr(1)}>
          <Icono de="siguiente" />
        </button>
      </div>
      <h2>{nombre}</h2>
      <span className="visor-autor">
        de{' '}
        {props.onAutor && p.autor.nombre && props.deSuAutor > 1 ? (
          <button className="visor-puerta" title={`Ver sus ${numero(props.deSuAutor)} estilos`} onClick={() => props.onAutor?.({ id: p.autor.id, nombre: p.autor.nombre })}>
            {p.autor.nombre} · {numero(props.deSuAutor)} estilos
          </button>
        ) : (
          p.autor.nombre || 'alguien'
        )}
        {e.basadoEn && <> · basado en «{e.basadoEn.titulo}»</>}
      </span>
      {props.onTema && props.temas.length > 0 && (
        <span className="visor-autor">
          Más de{' '}
          {props.temas.map((t, k) => (
            <span key={t.id}>
              {k > 0 && ' · '}
              <button className="visor-puerta" title={`Ver los estilos de ${t.nombre}`} onClick={() => props.onTema?.(t.id)}>
                {t.nombre}
              </button>
            </span>
          ))}
        </span>
      )}
      {estilo && <ParaInstalar key={`instalar:${p.id}`} p={p} nombre={nombre} suya={props.suya} enVisor sinApoyo={props.sinApoyo} onApoyo={props.onApoyo} />}
      <div className="tienda-numeros">
        <button className={`tienda-gusta${p.megusta ? ' on' : ''}`} aria-pressed={p.megusta} title={p.megusta ? 'Ya no me gusta' : 'Me gusta'} onClick={props.onMegusta}>
          <Icono de="pulgar" /> {numero(p.likes)}
        </button>
        <button className="tienda-gusta" title="Abre su publicación: comentarios y, si es tuya, editarla" onClick={props.onAbrir}>
          <Icono de="hilo" /> {p.porAprobar && props.onPruebas ? 'Abrir para aprobar' : p.comentarios ? numero(p.comentarios) : 'Comentar'}
        </button>
        {e.descargas > 0 && (
          <span title="Computadoras que lo instalaron">
            <Icono de="descargar" /> {numero(e.descargas)}
          </span>
        )}
        {e.videos > 0 && (
          <span title={`Videos que otras personas terminaron con él (${numero(e.personas)} ${e.personas === 1 ? 'persona' : 'personas'})`}>
            <Icono de="video" /> {numero(e.videos)}
          </span>
        )}
        {e.variantes > 0 && (
          <span title="Estilos de otras personas que salieron de este">
            <Icono de="girar" /> {numero(e.variantes)}
          </span>
        )}
      </div>
      {e.mes.puntos > 0 && (
        <div className="tienda-mes">
          <span>
            Este reparto: <b>{numero(e.mes.puntos)}</b> {e.mes.puntos === 1 ? 'punto' : 'puntos'}
          </span>
          {e.estimado.length > 0 ? (
            <span className="tienda-gana">≈ {e.estimado.map(dinero).join(' + ')}</span>
          ) : (
            !e.participa && <span title="Su autor no ha puesto su Binance ID: sus puntos no se llevan del fondo">No participa en el fondo</span>
          )}
        </div>
      )}
      {p.texto && <LoQueHace key={`hace:${p.id}`} texto={p.texto} />}
      {estilo?.guia && <GuiaVista guia={estilo.guia} prueba={estilo.prueba} />}
                {estilo?.prueba && <VerEvidencia prueba={estilo.prueba} />}
      {props.onPruebas && (
        <button className="small tienda-pruebas-boton" onClick={props.onPruebas}>
          <Icono de="escudo" /> Revisar pruebas
        </button>
      )}
    </section>
  )
}

/** El volumen que dejaste en un video, para el siguiente. */
let sonido = { volumen: 1, mudo: false }
/** Un video de menos de estos segundos (los adelantos de antes de que subieran enteros) se repite solo. */
const CORTO = 15

/** La pantalla del visor: el video entero del estilo, con sus controles. Con algo abierto encima (`quieta`), se para. */
function Pantalla({ video, imagen, suena, quieta }: { video?: AdjuntoComunidad; imagen?: string; suena: boolean; quieta: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [corto, setCorto] = useState(false)
  useEffect(() => {
    if (quieta) ref.current?.pause()
  }, [quieta])
  if (!video)
    return (
      <div className="visor-pantalla sin">
        {imagen ? (
          <img src={imagen} alt="" />
        ) : (
          <>
            <Icono de="claqueta" />
            <span>Este estilo no trae video</span>
          </>
        )}
      </div>
    )
  return (
    <div className={`visor-pantalla${video.vertical === false ? ' h' : ''}`}>
      <video
        ref={ref}
        src={video.url}
        poster={video.posterUrl}
        controls
        playsInline
        autoPlay={suena && !quieta}
        loop={corto}
        preload={suena ? 'auto' : 'metadata'}
        onLoadedMetadata={(ev) => {
          const v = ev.currentTarget
          v.volume = sonido.volumen
          v.muted = sonido.mudo
          setCorto(v.duration < CORTO)
        }}
        onVolumeChange={(ev) => (sonido = { volumen: ev.currentTarget.volume, mudo: ev.currentTarget.muted })}
      />
    </div>
  )
}

/** Lo que hace el estilo, como lo escribió quien lo compartió: lo largo sale recortado, con «Ver todo». */
function LoQueHace({ texto }: { texto: string }) {
  const [entero, setEntero] = useState(false)
  const largo = texto.length > 200 || texto.split('\n').length > 4
  return (
    <div className="visor-hace">
      <Texto texto={texto} className={`visor-texto${largo && !entero ? ' corto' : ''}`} />
      {largo && (
        <button className="visor-mas" onClick={() => setEntero(!entero)}>
          {entero ? 'Ver menos' : 'Ver todo'}
        </button>
      )}
    </div>
  )
}

/**
 * Solo el creador: las portadas de los videos de este mes de un estilo, agrupadas por persona, para ver que son de verdad
 * antes de pagar. Un clic en una la descarta (o la vuelve a contar); «Descartar todo» quita lo de esa cuenta en el mes.
 */
function Pruebas({ e, onCerrar }: { e: EstiloTienda; onCerrar(): void }) {
  const id = e.publicacion.id
  const [datos, setDatos] = useState<PruebasEstilo | null>(null)
  const [error, setError] = useState('')
  const cargar = () => api<PruebasEstilo>(`/api/comunidad/estilos/pruebas?publicacion=${id}`).then(setDatos, (err: Error) => setError(err.message))
  useEffect(() => {
    void cargar()
    const tecla = (ev: KeyboardEvent) => ev.key === 'Escape' && onCerrar()
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }, [id])

  function cambiar(cuerpo: { videos?: { equipo: string; huella: string }[]; miembro?: string; descartado: boolean }) {
    setError('')
    api('/api/comunidad/estilos/descartar', { publicacion: id, periodo: datos?.periodo, ...cuerpo }).then(cargar, (err: Error) => setError(err.message))
  }

  const personas = [...new Set(datos?.videos.map((v) => v.persona))]
  return (
    <div className="tienda-pruebas" role="dialog" aria-modal="true" aria-label={`Pruebas de ${e.publicacion.titulo}`} onClick={(ev) => ev.target === ev.currentTarget && onCerrar()}>
      <div className="tienda-pruebas-caja">
        <header>
          <div>
            <strong>Pruebas de «{e.publicacion.titulo || 'este estilo'}»</strong>
            <span>
              {datos ? `${datos.videos.length} ${datos.videos.length === 1 ? 'video' : 'videos'} de ${personas.length} ${personas.length === 1 ? 'persona' : 'personas'} este mes. ` : 'Cargando… '}
              Un clic en una portada la descarta o la vuelve a contar.
            </span>
          </div>
          <button className="tienda-pruebas-cerrar" onClick={onCerrar} aria-label="Cerrar">
            <Icono de="cerrar" />
          </button>
        </header>
        {error && <p className="tienda-error">{error}</p>}
        {datos && !datos.videos.length && <p className="tienda-pruebas-vacio">Aún nadie termina un video con este estilo este mes.</p>}
        {personas.map((n) => {
          const suyos = datos!.videos.filter((v) => v.persona === n)
          const cuentas = [...new Map(suyos.map((v) => [v.autor.id, v.autor])).values()]
          return (
            <section key={n} className="tienda-persona">
              <h3>
                Persona {n} · {cuentas.map((a) => a.nombre || 'sin nombre').join(', ')}
                {cuentas.length > 1 && <span className="tienda-aviso"> · {cuentas.length} cuentas en la misma red o computadora</span>}
              </h3>
              <div className="tienda-portadas">
                {suyos.map((v) => (
                  <button
                    key={v.equipo + v.huella}
                    className={v.descartado ? 'descartada' : ''}
                    title={`${new Date(v.creado).toLocaleString('es-MX')}${v.descartado ? ' · no cuenta' : ''}`}
                    onClick={() => cambiar({ videos: [{ equipo: v.equipo, huella: v.huella }], descartado: !v.descartado })}
                  >
                    {v.prueba ? <img src={v.prueba} alt="" loading="lazy" /> : <Icono de="video" />}
                    {v.descartado && <span>No cuenta</span>}
                  </button>
                ))}
              </div>
              {cuentas.map((a) => {
                const todos = suyos.filter((v) => v.autor.id === a.id).every((v) => v.descartado)
                return (
                  <button key={a.id} className="small" onClick={() => cambiar({ miembro: a.id, descartado: !todos })}>
                    {todos ? 'Volver a contar' : 'Descartar todo'} lo de {a.nombre || 'esta cuenta'}
                  </button>
                )
              })}
            </section>
          )
        })}
      </div>
    </div>
  )
}
