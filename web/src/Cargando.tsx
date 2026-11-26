import './Cargando.css'

/**
 * Lo que se ve mientras algo llega: unos puntos en la tipografía de monoespacio que van y vienen, en vez de la palabra
 * «Cargando…». Se anima con `steps()`, como todo lo que se mueve sin parar aquí, y a quien pide menos movimiento le
 * sale quieto. Quien usa lector de pantalla sí oye que está cargando (`aria-label`).
 *
 * `chico`: en medio de algo que ya está a la vista (los comentarios, la página siguiente del feed).
 */
const PUNTOS = [0, 1, 2, 3, 4]

export function Cargando({ chico, que = 'Cargando' }: { chico?: boolean; que?: string }) {
  return (
    <div className={`cargando${chico ? ' chico' : ''}`} role="status" aria-label={`${que}…`}>
      <span className="cargando-puntos" aria-hidden>
        {PUNTOS.map((i) => (
          <i key={i} style={{ animationDelay: `${i * 110}ms` }}>
            ·
          </i>
        ))}
      </span>
    </div>
  )
}
