import { useState } from 'react'
import { NUEVO_ESTILO } from '../../shared/crear-estilo'
import type { Card } from '../../shared/types'
import { Icon } from './Composer'
import { ImportarEstilo } from './Estilos'
import { Icono } from './Iconos'
import { CampoAscii } from './CampoAscii'
import { filtrarBarra } from './menu-estilos'
import './CatalogoEstilos.css'

/**
 * «Ver todos» los estilos (`#/estilos`, desde el estante del inicio): cada estilo de video con su icono, su versión y qué
 * hace, con un buscador, para elegir uno cuando ya no caben en el estante. «Usar estilo» abre su chat nuevo; «Crear
 * estilo», el de «Nuevo estilo».
 */
export function CatalogoEstilos({ cards, abrir }: { cards: Card[]; abrir(cardId: string): void }) {
  const [consulta, setConsulta] = useState('')
  const puedeCrear = cards.some((c) => c.id === NUEVO_ESTILO)
  const estilos = filtrarBarra(
    cards.filter((c) => c.id !== NUEVO_ESTILO && !!c.etapas?.length).map((card) => ({ id: card.id, titulo: card.title, skill: card.skill, card })),
    consulta.trim()
  )
  return (
    <section className="catalogo-estilos fondo-ramas" aria-labelledby="catalogo-estilos-titulo">
      <CampoAscii variante="ramas" />
      <div className="catalogo-estilos-contenido">
        <header className="catalogo-estilos-cabecera">
          <div>
            <h1 id="catalogo-estilos-titulo">Estilos</h1>
            <p>Elige el estilo de tu próximo video, o haz uno tuyo con tus propias referencias.</p>
          </div>
          <div className="catalogo-estilos-acciones">
            <ImportarEstilo />
            {puedeCrear && (
              <button type="button" className="boton" onClick={() => abrir(NUEVO_ESTILO)}>
                <Icono de="mas" /> Crear estilo
              </button>
            )}
          </div>
        </header>
        <label className="catalogo-estilos-buscar">
          <Icono de="buscar" />
          <input value={consulta} onChange={(e) => setConsulta(e.target.value)} type="search" placeholder="Buscar estilos" aria-label="Buscar estilos" autoFocus />
        </label>
        <ul className="catalogo-estilos-lista">
          {estilos.map(({ card }) => (
            <li key={card.id} className="catalogo-estilos-card">
              <div className="catalogo-estilos-identidad">
                <span className="catalogo-estilos-icono" aria-hidden="true"><Icon icon={card.icon ?? 'claqueta'} /></span>
                {card.version && <span className="estilo-version">v{card.version}</span>}
              </div>
              <h2>{card.title}</h2>
              <p>{card.description}</p>
              <button type="button" className="boton" onClick={() => abrir(card.id)} aria-label={`Usar el estilo ${card.title}`}>
                Usar estilo <Icono de="flecha" />
              </button>
            </li>
          ))}
        </ul>
        {!estilos.length && <p className="muted" role="status">{consulta.trim() ? 'Ningún estilo con eso.' : 'Aún no hay estilos de video.'}</p>}
      </div>
    </section>
  )
}
