import { useState } from 'react'
import { NUEVO_ESTILO } from '../../shared/crear-estilo'
import type { Card } from '../../shared/types'
import { CampoAscii } from './CampoAscii'
import { Icon } from './Composer'
import { ImportarEstilo } from './Estilos'
import { Icono } from './Iconos'
import { filtrarBarra } from './menu-estilos'
import './CatalogoEstilos.css'

export function CatalogoEstilos({ cards, puedeCrear, abrir }: {
  cards: Card[]
  puedeCrear: boolean
  abrir(cardId: string): void
}) {
  const [consulta, setConsulta] = useState('')
  const estilos = filtrarBarra(
    cards.filter((card) => card.id !== NUEVO_ESTILO && !!card.etapas?.length)
      .map((card) => ({ id: card.id, titulo: card.title, skill: card.skill, card })),
    consulta.trim()
  )

  return <section className="catalogo-estilos fondo-ramas" aria-labelledby="catalogo-estilos-titulo">
    <CampoAscii variante="ramas" />
    <div className="catalogo-estilos-contenido">
      <header className="catalogo-estilos-cabecera superficie-ascii">
        <CampoAscii variante="orbita" />
        <div>
          <h1 id="catalogo-estilos-titulo">Estilos</h1>
          <p>Elige un estilo para tu próximo video o crea uno con tus propias referencias.</p>
        </div>
        <div className="catalogo-estilos-acciones">
          <ImportarEstilo />
          <button type="button" className="boton catalogo-estilos-crear" disabled={!puedeCrear} onClick={() => abrir(NUEVO_ESTILO)}>
            <Icono de="mas" /> Crear estilo
          </button>
        </div>
      </header>
      <label className="catalogo-estilos-buscar">
        <Icono de="buscar" />
        <input value={consulta} onChange={(e) => setConsulta(e.target.value)}
          type="search" placeholder="Buscar estilos" aria-label="Buscar estilos" />
      </label>
      <ul className="catalogo-estilos-lista">
        {estilos.map(({ card }) => <li key={card.id} className="catalogo-estilos-card">
          <div className="catalogo-estilos-identidad">
            <span className="catalogo-estilos-icono" aria-hidden="true"><Icon icon={card.icon ?? 'claqueta'} /></span>
            {card.version && <span className="estilo-version">v{card.version}</span>}
          </div>
          <h2>{card.title}</h2>
          <p>{card.description}</p>
          <button type="button" className="boton" onClick={() => abrir(card.id)} aria-label={`Usar estilo ${card.title}`}>
            Usar estilo <Icono de="flecha" />
          </button>
        </li>)}
      </ul>
      {!estilos.length && <p className="muted" role="status">
        {consulta.trim() ? 'No hay estilos que coincidan con la búsqueda.' : 'No hay estilos de video en el catálogo.'}
      </p>}
    </div>
  </section>
}
