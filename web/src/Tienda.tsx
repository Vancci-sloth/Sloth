import { useEffect, useRef, useState } from 'react'
import type { EstiloTienda, FondoComunidad, OrdenTienda, PruebasEstilo, TiendaEstilos } from '../../shared/types'
import { api } from './api'
import { Icono, type NombreIcono } from './Iconos'
import './Tienda.css'

/**
 * La tienda de estilos (`licencias/src/tienda.ts`), en la sección Estilos de la comunidad: buscar lo que necesitas,
 * ordenar por los favoritos de la comunidad (más me gusta), los más usados, descargados, lo que más gana este mes o lo
 * nuevo, y ver de cada estilo sus números, que son públicos: me gusta, descargas, videos que otras personas hicieron con
 * él, cuántas personas y variantes, y sus puntos del reparto con lo que se lleva del fondo. Al abrir uno sale su publicación,
 * donde se instala. Es de quien apoya: a los demás les sale la invitación a apoyar (`Cerrada`) y, debajo, solo sus estilos. «Cómo se cuentan los puntos» enseña las reglas. El creador ve además las pruebas de cada estilo (la
 * portada de cada video, agrupadas por persona) y descarta lo que no es de verdad antes de pagar (`Pruebas`).
 */
const ORDENES: { id: OrdenTienda; nombre: string; icono: NombreIcono }[] = [
  { id: 'favoritos', nombre: 'Favoritos de la comunidad', icono: 'estrella' },
  { id: 'usados', nombre: 'Más usados', icono: 'video' },
  { id: 'descargas', nombre: 'Más descargados', icono: 'descargar' },
  { id: 'ganando', nombre: 'Ganando este mes', icono: 'corona' },
  { id: 'nuevos', nombre: 'Nuevos', icono: 'mas' }
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

export function Tienda({ version, creador, onAbrir, conNombre }: { version: number; creador: boolean; onAbrir(id: string): void; conNombre(accion: () => void): void }) {
  const [orden, setOrden] = useState<OrdenTienda>(leerOrden)
  const [q, setQ] = useState('')
  const [buscado, setBuscado] = useState('')
  const [tienda, setTienda] = useState<TiendaEstilos | null>(null)
  const [error, setError] = useState('')
  const [reglas, setReglas] = useState(false)
  const [revisando, setRevisando] = useState<EstiloTienda | null>(null)
  const [recargar, setRecargar] = useState(0)
  const pedido = useRef(0)

  // Lo que se escribe se busca al dejar de escribir.
  useEffect(() => {
    const t = setTimeout(() => setBuscado(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const n = ++pedido.current
    setError('')
    api<TiendaEstilos>(`/api/comunidad/estilos?orden=${orden}${buscado ? `&q=${encodeURIComponent(buscado)}` : ''}`).then(
      (t) => n === pedido.current && setTienda(t),
      (e: Error) => n === pedido.current && setError(e.message)
    )
  }, [orden, buscado, version, recargar])

  // Al abrirse la tienda con el pago, lo instalado de antes también: Sloth vuelve a preguntar al cobro y quita el candado
  // de esos estilos (`SinApoyo.tsx`) sin esperar a su vistazo de cada 6 horas.
  const cerrada = useRef(false)
  useEffect(() => {
    if (!tienda) return
    if (cerrada.current && !tienda.cerrada) void api('/api/licencia?fresco').catch(() => {})
    cerrada.current = !!tienda.cerrada
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

  const r = tienda?.reglas
  // Quien no apoya: la invitación a apoyar y, debajo, solo sus estilos (compartir es de cualquiera).
  if (tienda?.cerrada)
    return (
      <section className="tienda" aria-label="Tienda de estilos">
        <Cerrada estilos={tienda.cerrada.estilos} onRevisar={() => setRecargar((n) => n + 1)} />
        {!!tienda.estilos.length && (
          <>
            <h3 className="tienda-tuyos">Tus estilos en la comunidad</h3>
            <div className="tienda-rejilla">
              {tienda.estilos.map((e) => (
                <Estilo key={e.publicacion.id} e={e} onAbrir={() => onAbrir(e.publicacion.id)} onMegusta={() => megusta(e)} />
              ))}
            </div>
          </>
        )}
      </section>
    )
  return (
    <section className="tienda" aria-label="Tienda de estilos">
      <div className="tienda-barra">
        <label className="tienda-buscar">
          <Icono de="buscar" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca lo que necesitas: noticias, recetas, 3D, comedia…" aria-label="Buscar estilos" />
        </label>
        <nav className="tienda-ordenes" aria-label="Orden">
          {ORDENES.map((o) => (
            <button key={o.id} className={orden === o.id ? 'on' : ''} aria-pressed={orden === o.id} onClick={() => ordenar(o.id)}>
              <Icono de={o.icono} /> {o.nombre}
            </button>
          ))}
        </nav>
      </div>

      <div className="tienda-reglas">
        <button className="tienda-reglas-boton" aria-expanded={reglas} onClick={() => setReglas(!reglas)}>
          <Icono de="pregunta" /> Cómo se cuentan los puntos
        </button>
        {reglas && r && (
          <div className="tienda-reglas-texto">
            <p>
              En cada reparto, cada estilo suma <b>{r.persona} puntos</b> por cada persona distinta que termina un video con él, <b>{r.video} punto</b> por cada video (hasta{' '}
              {r.tope} por persona) y <b>{r.variante} puntos</b> por cada variante que otra persona comparte en la comunidad a partir de él. El fondo se reparte según los
              puntos entre quienes pusieron su Binance ID: un estilo con la mitad de los puntos se lleva la mitad del fondo. Participar es opcional.
            </p>
            <p>
              Para que sea justo con todos: lo que haces con tu propio estilo no cuenta, ni desde tus otras cuentas; varias computadoras en la misma conexión son una persona;
              una cuenta suma videos si apoya a Sloth y después de sus primeros {r.dias} días, y cada video manda su portada como prueba, que solo ve el creador de Sloth y revisa antes de
              pagar. Del video no sale nada más. Las descargas y los me gusta se ven, pero no dan puntos.
            </p>
          </div>
        )}
      </div>

      {error && <p className="tienda-error">{error}</p>}
      {!tienda && !error && <div className="com-cargando">Cargando…</div>}
      {tienda && !tienda.estilos.length && (
        <div className="com-vacio">
          <strong>{buscado ? `Nada con «${buscado}»` : 'Aún no hay estilos'}</strong>
          <p>{buscado ? 'Prueba con otras palabras, o haz tú el estilo que buscas y compártelo.' : 'Sé el primero: comparte uno tuyo con «Compartir un estilo tuyo», aquí arriba.'}</p>
        </div>
      )}
      {!!tienda?.estilos.length && (
        <div className="tienda-rejilla">
          {tienda.estilos.map((e) => (
            <Estilo key={e.publicacion.id} e={e} onAbrir={() => onAbrir(e.publicacion.id)} onMegusta={() => megusta(e)} onPruebas={creador ? () => setRevisando(e) : undefined} />
          ))}
        </div>
      )}
      {revisando && <Pruebas e={revisando} onCerrar={() => (setRevisando(null), setRecargar((n) => n + 1))} />}
    </section>
  )
}

const PAGINA = 'https://sloth.vancci.org'
/** La versión de los términos que acepta quien apoya desde aquí: la de `TERMINOS` en la página (su «Última actualización»). */
const TERMINOS = '2026-11-13'
/** Cada cuánto se mira si el pago ya entró, y durante cuánto, después de abrir el cobro. */
const MIRAR_CADA = 8000
const MIRAR_DURANTE = 10 * 60_000

/**
 * La tienda, para quien no apoya: cuántos estilos hay dentro, lo que recibe quien apoya y el botón que los desbloquea.
 * «Desbloquea N estilos» abre de una vez el pago con tarjeta en Stripe, con el correo de su cuenta
 * (`/api/licencia/apoyar`): al pagarse, la comunidad lo reconoce por ese correo y la tienda se abre sola (`onRevisar`
 * vuelve a pedirla al regresar a Sloth y cada pocos segundos). Las otras formas de pago siguen en la página; quien
 * apoyó con otro correo pega su clave en Opciones.
 */
export function Cerrada({ estilos, onRevisar }: { estilos: number; onRevisar(): void }) {
  const [ocupado, setOcupado] = useState(false)
  const [esperando, setEsperando] = useState(false)
  const [error, setError] = useState('')
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
      const { enlace } = await api<{ enlace: string }>('/api/licencia/apoyar', { terminos: TERMINOS })
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
      <h2>{mas >= 1 ? `Más de ${numero(mas)} estilos disponibles` : 'Los estilos de la comunidad'}</h2>
      <p>Videos distintos a los que trae Sloth, hechos por la comunidad y listos para instalar con un clic. Son para quienes apoyan a Sloth.</p>
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
        <p className="tienda-cerrada-nota">Se abrió el pago en tu navegador. En cuanto pagues, los estilos se abren aquí solos.</p>
      ) : (
        <p className="tienda-cerrada-nota">
          $10 USD al mes, con tarjeta. Al desbloquear aceptas ese cobro automático de cada mes, que cancelas cuando quieras, y los{' '}
          <a href={`${PAGINA}/terminos`} target="_blank" rel="noreferrer">
            términos
          </a>
          .
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

function Estilo({ e, onAbrir, onMegusta, onPruebas }: { e: EstiloTienda; onAbrir(): void; onMegusta(): void; onPruebas?(): void }) {
  const p = e.publicacion
  const portada = p.adjuntos.find((a) => a.tipo === 'video') ?? p.adjuntos.find((a) => a.tipo === 'imagen')
  const imagen = portada && (portada.tipo === 'imagen' ? portada.url : portada.posterUrl)
  const nombre = p.titulo || p.adjuntos.find((a) => a.tipo === 'estilo')?.nombre || 'Estilo'
  return (
    <article className="tienda-estilo">
      <button className="tienda-portada" onClick={onAbrir} aria-label={`Abrir ${nombre}`}>
        {imagen ? <img src={imagen} alt="" loading="lazy" /> : <Icono de="claqueta" />}
        {p.porAprobar && <span className="tienda-revision">En revisión</span>}
      </button>
      <div className="tienda-cuerpo">
        <button className="tienda-nombre" onClick={onAbrir}>
          {nombre}
        </button>
        <span className="tienda-autor">
          de {p.autor.nombre || 'alguien'}
          {e.basadoEn && <> · basado en «{e.basadoEn.titulo}»</>}
        </span>
        {p.texto && <p className="tienda-texto">{p.texto}</p>}
        <div className="tienda-numeros">
          <button className={`tienda-gusta${p.megusta ? ' on' : ''}`} aria-pressed={p.megusta} title={p.megusta ? 'Ya no me gusta' : 'Me gusta'} onClick={onMegusta}>
            <Icono de="pulgar" /> {numero(p.likes)}
          </button>
          <span title="Computadoras que lo instalaron">
            <Icono de="descargar" /> {numero(e.descargas)}
          </span>
          <span title="Videos que otras personas terminaron con él">
            <Icono de="video" /> {numero(e.videos)}
          </span>
          <span title="Personas que hicieron videos con él">
            <Icono de="personas" /> {numero(e.personas)}
          </span>
          {e.variantes > 0 && (
            <span title="Estilos de otras personas que salieron de este">
              <Icono de="girar" /> {numero(e.variantes)}
            </span>
          )}
        </div>
        <div className="tienda-mes">
          <span>
            Este reparto: <b>{numero(e.mes.puntos)}</b> {e.mes.puntos === 1 ? 'punto' : 'puntos'}
          </span>
          {e.estimado.length > 0 ? (
            <span className="tienda-gana">≈ {e.estimado.map(dinero).join(' + ')}</span>
          ) : (
            !e.participa && e.mes.puntos > 0 && <span title="Su autor no ha puesto su Binance ID: sus puntos no se llevan del fondo">No participa en el fondo</span>
          )}
        </div>
        {onPruebas && (
          <button className="small tienda-pruebas-boton" onClick={onPruebas}>
            <Icono de="escudo" /> Revisar pruebas
          </button>
        )}
      </div>
    </article>
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
