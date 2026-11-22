/**
 * Un grupo de botones donde solo uno está elegido: el formato y el lote del hilo nuevo, «Optimizado» o «Avanzado», lo que
 * enseña el monitor del estudio. Su estilo, `.segmento`, está en styles.css.
 */
export function Segmento<T extends string | number>({ label, valor, opciones, onCambio, dispositivo = false }: { label: string; valor: T; opciones: { id: T; texto: string; title?: string; disabled?: boolean }[]; onCambio(id: T): void; dispositivo?: boolean }) {
  return (
    <div className={`segmento${dispositivo ? ' segmento-dispositivo' : ''}`} role="radiogroup" aria-label={label} data-orientacion={dispositivo ? valor : undefined}>
      {dispositivo && <span className="formato-dispositivo" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <rect x="6.5" y="2.5" width="11" height="19" rx="3" />
          <path d="M10 5h4M11 18.5h2" />
        </svg>
      </span>}
      {opciones.map((o) => (
        <button key={o.id} role="radio" aria-checked={valor === o.id} className={valor === o.id ? 'on' : ''} title={o.title} disabled={o.disabled} onClick={() => onCambio(o.id)}>
          {o.texto}
        </button>
      ))}
    </div>
  )
}
