import { memo, type ReactNode, useEffect, useRef, useState } from 'react'
import type { Biblioteca3D, Modelo3D } from '../../shared/types'
import { api } from './api'
import { useDesplazando } from './desplazando'
import './Modelos3D.css'

/**
 * «Modelos 3D»: la biblioteca que llenan los videos (`skills/modelos-3d`). Cada modelo es un cartel como los de las
 * skills: su foto sobre un foco cálido y, con el ratón quieto encima, la cámara que se mece a su alrededor (`giro`);
 * abajo, para qué sirve, qué puede hacer y su tipo (los de `categorias.json`). Se filtran por tipo, se buscan por cualquier palabra
 * y se ordenan por tipo, por fecha o por nombre. Desde el cartel se copia su nombre, que es lo que se le pide al agente. Al
 * abrirlo, su ficha: qué es, qué hace, sus etiquetas (buscan al tocarlas), qué da en el código, qué otros modelos
 * necesita y de qué video salió; con ← y → se pasa al de al lado. La tecla / lleva al buscador.
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

const plano = (s: string) => s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase()
const fecha = (iso?: string) => (iso ? new Date(`${iso}T12:00`).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const porNombre = (a: Modelo3D, b: Modelo3D) => a.nombre.localeCompare(b.nombre, 'es')

export const Modelos3D = memo(function Modelos3D() {
  const [biblioteca, setBiblioteca] = useState<Biblioteca3D | null>(null)
  const [error, setError] = useState('')
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState<string | null>(null)
  const [orden, setOrden] = useState<Orden>('tipo')
  const [abierto, setAbierto] = useState<string | null>(null)
  const campo = useRef<HTMLInputElement>(null)
  const raiz = useRef<HTMLDivElement>(null)
  useEffect(() => {
    api<Biblioteca3D>('/api/modelos3d').then(setBiblioteca, (e) => setError(e.message))
  }, [])
  // `desplazando` mientras se mueve y hasta 200 ms después (el CSS quita el ratón a la rejilla).
  useDesplazando(raiz)
  // «/» lleva al buscador, salvo escribiendo en otro campo o con una ficha abierta.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const escribiendo = e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable="true"]')
      if (e.key === '/' && !escribiendo && !abierto) {
        e.preventDefault()
        campo.current?.focus()
      }
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }, [abierto])

  const modelos = biblioteca?.modelos ?? []
  const nombres = biblioteca?.categorias.map((c) => c.nombre) ?? []
  const tipoDe = (m: Modelo3D) => (m.categoria && nombres.includes(m.categoria) ? m.categoria : SIN_TIPO)
  const tipos = [...nombres, SIN_TIPO]
    .map((nombre) => ({ nombre, para: biblioteca?.categorias.find((c) => c.nombre === nombre)?.para ?? '', cuantos: modelos.filter((m) => tipoDe(m) === nombre).length }))
    .filter((t) => t.cuantos)

  const palabras = plano(busca).split(/\s+/).filter(Boolean)
  const encontrados = modelos.filter((m) => {
    if (tipo && tipoDe(m) !== tipo) return false
    const texto = plano([m.id, m.nombre, m.resumen, m.categoria, m.descripcion, ...(m.hace ?? []), ...m.etiquetas, ...m.exporta].join(' '))
    return palabras.every((p) => texto.includes(p))
  })
  const posicion = (m: Modelo3D) => (nombres.includes(tipoDe(m)) ? nombres.indexOf(tipoDe(m)) : nombres.length)
  // El orden en que se ven, que es también el que siguen ← y → en la ficha.
  const enOrden = [...encontrados].sort((a, b) =>
    orden === 'recientes' ? (b.actualizado ?? '').localeCompare(a.actualizado ?? '') || porNombre(a, b) : orden === 'nombre' ? porNombre(a, b) : posicion(a) - posicion(b) || porNombre(a, b)
  )
  const elegido = tipos.find((t) => t.nombre === tipo)
  const ficha = modelos.find((m) => m.id === abierto)

  return (
    <div className="m3d" ref={raiz}>
      <header className="m3d-cabeza">
        <div>
          <div className="m3d-antetitulo">Biblioteca</div>
          <h1>Modelos 3D</h1>
          <p>Lo que ya está hecho para tus videos. Antes de modelar algo, el agente busca aquí; lo nuevo que hace, lo guarda aquí.</p>
        </div>
        <label className="m3d-busca">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input ref={campo} placeholder="Buscar: caja, dinero, se abre…" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && (setBusca(''), e.currentTarget.blur())} />
          {busca ? (
            <button title="Borrar la búsqueda" onClick={() => (setBusca(''), campo.current?.focus())}>
              ✕
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </label>
      </header>

      {biblioteca && modelos.length > 0 && (
        <div className="m3d-barra">
          <div className="m3d-tipos">
            <button className={tipo ? '' : 'on'} onClick={() => setTipo(null)}>
              Todos <span>{modelos.length}</span>
            </button>
            {tipos.map((t) => (
              <button key={t.nombre} className={tipo === t.nombre ? 'on' : ''} title={t.para} onClick={() => setTipo(tipo === t.nombre ? null : t.nombre)}>
                {t.nombre} <span>{t.cuantos}</span>
              </button>
            ))}
          </div>
          <div className="m3d-orden" role="group" aria-label="Ordenar">
            {ORDENES.map(([o, texto]) => (
              <button key={o} className={orden === o ? 'on' : ''} onClick={() => setOrden(o)}>
                {texto}
              </button>
            ))}
          </div>
        </div>
      )}
      {biblioteca && (palabras.length > 0 || elegido) && encontrados.length > 0 && (
        <div className="m3d-cuenta">
          <strong>{encontrados.length === 1 ? '1 modelo' : `${encontrados.length} modelos`}</strong>
          {elegido && ` de ${elegido.nombre}`}
          {palabras.length > 0 && ` con «${busca.trim()}»`}
          {elegido?.para && !palabras.length && <span> · {elegido.para}</span>}
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
      ) : biblioteca && !encontrados.length ? (
        <Vacio titulo={`Ningún modelo${tipo ? ` de ${tipo}` : ''}${busca.trim() ? ` con «${busca.trim()}»` : ''}`} texto="El siguiente video que lo necesite lo hará y lo guardará aquí.">
          <button className="m3d-boton" onClick={() => (setBusca(''), setTipo(null))}>
            Ver todos
          </button>
        </Vacio>
      ) : (
        <div className="m3d-rejilla">
          {enOrden.map((m) => (
            <Cartel key={m.id} modelo={m} tipo={tipo ? undefined : tipoDe(m)} onAbrir={setAbierto} />
          ))}
        </div>
      )}

      {ficha && (
        <Ficha
          modelo={ficha}
          tipo={tipoDe(ficha)}
          todos={modelos}
          onCerrar={() => setAbierto(null)}
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
          }}
          onTipo={(t) => {
            setTipo(t === SIN_TIPO ? null : t)
            setBusca('')
            setAbierto(null)
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

/** Lo que el ratón se queda en un cartel antes de cargar su giro (ms): cruzarlo de camino a otro no lo arranca. */
const ESPERA = 150

/**
 * Un modelo en la rejilla: su foto quieta y, con el ratón quieto encima, su giro. El `<video>` solo existe desde que el
 * ratón se queda hasta que se desvanece al salir: los giros que ya se vieron no se quedan ocupando memoria ni capas de
 * la tarjeta gráfica. `tipo`, si no se está filtrando por uno.
 */
const Cartel = memo(function Cartel({ modelo, tipo, onAbrir }: { modelo: Modelo3D; tipo?: string; onAbrir(id: string): void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [vivo, setVivo] = useState(false)
  const [girando, setGirando] = useState(false)
  const [copiado, copiar] = useCopiar()
  const reloj = useRef(0)
  useEffect(() => () => clearTimeout(reloj.current), [])
  return (
    <button
      className={`m3d-cartel${girando ? ' girando' : ''}`}
      onClick={() => onAbrir(modelo.id)}
      onMouseEnter={() => {
        clearTimeout(reloj.current)
        // Si volvió antes de que se fuera, sigue donde iba; `playing` lo vuelve a mostrar.
        if (video.current) video.current.play().catch(() => {})
        else if (modelo.giro) reloj.current = window.setTimeout(() => setVivo(true), ESPERA)
      }}
      onMouseLeave={() => {
        clearTimeout(reloj.current)
        video.current?.pause()
        setGirando(false)
        reloj.current = window.setTimeout(() => setVivo(false), 250)
      }}
    >
      <div className="m3d-foco" />
      {modelo.vista ? <img className="m3d-foto" src={modelo.vista} alt="" loading="lazy" decoding="async" draggable={false} /> : <div className="m3d-sin">Sin foto</div>}
      {vivo && (
        <video ref={video} className="m3d-giro" src={modelo.giro} muted loop autoPlay playsInline disablePictureInPicture disableRemotePlayback onPlaying={() => setGirando(true)} />
      )}
      {tipo && <span className="m3d-tipo">{tipo}</span>}
      <span
        role="button"
        tabIndex={-1}
        className={`m3d-copiar${copiado ? ' hecho' : ''}`}
        title={`Copiar su nombre («${modelo.id}») para pedírselo al agente`}
        onClick={(e) => {
          e.stopPropagation()
          copiar(modelo.id)
        }}
      >
        {copiado ? <Icono d="M5 12.5 10 17.5 19 7" /> : <Icono d="M9 9h10v11H9zM5 15V4h10" />}
        <span>{copiado ? 'Copiado' : modelo.id}</span>
      </span>
      <div className="m3d-pie">
        <strong>{modelo.nombre}</strong>
        <span className="m3d-resumen">{modelo.resumen ?? modelo.descripcion}</span>
        {modelo.hace?.length ? (
          <span className="m3d-hace" title={modelo.hace.join(' · ')}>
            <Icono d="M5 12.5 10 17.5 19 7" />
            <span>{modelo.hace.join(' · ')}</span>
          </span>
        ) : null}
      </div>
    </button>
  )
})

/** La ficha de un modelo, en grande. Esc la cierra; ← y → pasan al de al lado. */
function Ficha({
  modelo,
  tipo,
  todos,
  onCerrar,
  onIr,
  onPaso,
  onBuscar,
  onTipo,
}: {
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
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
      else if (e.key === 'ArrowRight') onPaso(1)
      else if (e.key === 'ArrowLeft') onPaso(-1)
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }, [onCerrar, onPaso])
  const necesita = modelo.usa.map((id) => todos.find((m) => m.id === id) ?? { id, nombre: id })

  return (
    <div className="m3d-velo" onClick={onCerrar}>
      <div className="m3d-ficha" role="dialog" aria-label={modelo.nombre} onClick={(e) => e.stopPropagation()}>
        <div className="m3d-ficha-escena">
          <div className="m3d-foco" />
          {modelo.giro ? (
            <video key={modelo.id} src={modelo.giro} poster={modelo.vista} muted loop autoPlay playsInline disablePictureInPicture disableRemotePlayback />
          ) : (
            modelo.vista && <img src={modelo.vista} alt="" draggable={false} />
          )}
          <button className="m3d-paso izq" title="El anterior (←)" onClick={() => onPaso(-1)}>
            ‹
          </button>
          <button className="m3d-paso der" title="El siguiente (→)" onClick={() => onPaso(1)}>
            ›
          </button>
        </div>
        <div className="m3d-ficha-texto">
          <button className="m3d-cerrar" title="Cerrar (Esc)" onClick={onCerrar}>
            ✕
          </button>
          <button className="m3d-antetitulo m3d-ficha-tipo" title={`Ver los de ${tipo}`} onClick={() => onTipo(tipo)}>
            Modelo 3D · {tipo}
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
                    <Icono d="M5 12.5 10 17.5 19 7" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="m3d-bloque">
            <h3>Se encuentra por</h3>
            <div className="m3d-etiquetas">
              {modelo.etiquetas.map((e) => (
                <button key={e} title={`Buscar «${e}»`} onClick={() => onBuscar(e)}>
                  {e}
                </button>
              ))}
            </div>
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
                  {necesita.map((m) => (
                    <button key={m.id} className="m3d-enlace" onClick={() => onIr(m.id)}>
                      {m.nombre}
                    </button>
                  ))}
                </dd>
              </>
            )}
            <dt>Salió de</dt>
            <dd>
              {modelo.origen ?? '—'}
              {modelo.creado && <span className="muted"> · {fecha(modelo.creado)}</span>}
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
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Un trazo de 24 × 24, como los íconos de la barra. */
function Icono({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

function Vacio({ titulo, texto, children }: { titulo: string; texto: string; children?: ReactNode }) {
  return (
    <div className="m3d-vacio">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M12 2.5 21 7.5v9L12 21.5 3 16.5v-9z" />
        <path d="M3 7.5 12 12.5l9-5M12 12.5v9" />
      </svg>
      <strong>{titulo}</strong>
      <p>{texto}</p>
      {children}
    </div>
  )
}
