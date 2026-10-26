/**
 * Un grupo de botones donde solo uno está elegido: el formato y el lote del hilo nuevo, «Optimizado» o «Avanzado», lo que
 * enseña el monitor del estudio. Su estilo, `.segmento`, está en styles.css.
 */
export function Segmento<T extends string | number>({ label, valor, opciones, onCambio }: { label: string; valor: T; opciones: { id: T; texto: string; title?: string; disabled?: boolean }[]; onCambio(id: T): void }) {
  return (
    <div className="segmento" role="radiogroup" aria-label={label}>
      {opciones.map((o) => (
        <button key={o.id} role="radio" aria-checked={valor === o.id} className={valor === o.id ? 'on' : ''} title={o.title} disabled={o.disabled} onClick={() => onCambio(o.id)}>
          {o.texto}
        </button>
      ))}
    </div>
  )
}
