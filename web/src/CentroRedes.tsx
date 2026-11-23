import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTransicionApartado } from './Movimiento'
import type { Card, SessionMeta } from '../../shared/types'
import { VENTA } from '../../shared/venta'
import { CampoAscii } from './CampoAscii'
import { ConNavegadorRedes, RedesOpciones } from './Redes'
import { YoutubeOpciones } from './Youtube'
import { Ritmos } from './Ritmos'
import { MisVideos } from './MisVideos'
import { Piloto } from './Piloto' // piloto
import { Icono, type NombreIcono } from './Iconos'
import { APARTADOS_REDES, rutaRedes, type ApartadoRedes } from './redes-ruta'
import './CentroRedes.css'

const apartados = (Object.keys(APARTADOS_REDES) as ApartadoRedes[]).filter((id) => !VENTA || id !== 'ideas')
const iconos: Record<ApartadoRedes, NombreIcono> = {
  produccion: 'claqueta', piloto: 'bucle', ideas: 'foco', publicaciones: 'compartir', calendario: 'calendario', cuentas: 'personas'
}

/** Un centro para las funciones de creación y publicación existentes, con sus mismas cuentas y colas. */
export function CentroRedes({ cards, sessions, apartado = 'produccion', onCrear, children }: {
  cards: Card[]
  sessions: SessionMeta[]
  apartado?: ApartadoRedes
  onCrear(id: string): void
  children?: ReactNode
}) {
  const contenidoRef = useRef<HTMLDivElement>(null)
  useTransicionApartado(contenidoRef, apartado)
  useLayoutEffect(() => { contenidoRef.current?.scrollTo(0, 0) }, [apartado])
  const [estilo, setEstilo] = useState<string>()
  const [conectando, setConectando] = useState(false)
  const estilos = cards.filter(c => c.etapas?.length)
  return <ConNavegadorRedes puede={apartado === 'cuentas' && conectando || apartado === 'publicaciones'}>
    <div className="centro-redes fondo-ramas">
      <CampoAscii variante="ramas" />
      <header className="centro-redes-cabecera">
        <div><h1>Redes</h1><p>Crea con tus agentes, revisa tus videos y programa su publicación.</p></div>
        <a className="boton" href="#/opciones/agentes"><Icono de="cubo" /> Configurar agentes</a>
      </header>
      <nav className="centro-redes-nav" aria-label="Apartados de Redes">
        {apartados.map((id) => <a key={id} data-apartado={id} href={rutaRedes(id)} aria-current={apartado === id ? 'page' : undefined}>
          <Icono de={iconos[id]} />{APARTADOS_REDES[id]}
        </a>)}
      </nav>
      <div className="centro-redes-contenido" ref={contenidoRef}>
        {apartado === 'produccion' && <>
          <section className="redes-flujo">
            <div><Icono de="foco" /><h2>De la idea a la publicación</h2><p>Elige un estilo para abrir un chat con tu agente. Cuando termine el video, revísalo en Publicaciones y elige las redes donde saldrá.</p></div>
            <a className="boton" href={rutaRedes('publicaciones')}>Revisar videos</a>
          </section>
          <div className="redes-estilos">
            {estilos.map(c => {
              const trabajando = sessions.filter(s => s.cardId === c.id && s.running).length
              return <article key={c.id}><h2>{c.title}</h2><p>{c.description}</p>
                {trabajando > 0 && <span className="estado moviendo">{trabajando} en producción</span>}
                <button className="boton" onClick={() => onCrear(c.id)}>Crear video <Icono de="mas" /></button>
              </article>
            })}
          </div>
          {!estilos.length && <p className="muted">Los estilos de video aparecerán aquí cuando estén disponibles.</p>}
        </>}
        {apartado === 'piloto' && <Piloto />}
        {apartado === 'ideas' && children}
        {apartado === 'publicaciones' && <MisVideos cards={cards} sessions={sessions} estilo={estilo} onEstilo={setEstilo} refDesplazamiento={contenidoRef} />}
        {apartado === 'calendario' && <section className="redes-calendario"><h2>Ritmo de publicación</h2><p className="muted">Configura cuántos videos publicar y en qué horarios. Las publicaciones se revisan y programan desde Publicaciones.</p><Ritmos /><div className="redes-calendario-acciones"><a className="boton" href={rutaRedes('publicaciones')}>Ver publicaciones y su calendario</a></div></section>}
        {apartado === 'cuentas' && <section><h2>Cuentas conectadas</h2><p className="muted">Estas conexiones también se usan en Opciones y Mis videos.</p><div className="panel"><RedesOpciones onIniciando={setConectando} /><YoutubeOpciones /></div></section>}
      </div>
    </div>
  </ConNavegadorRedes>
}
