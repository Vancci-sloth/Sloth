import type { ReactNode } from 'react'
import { Picker } from './Composer'

/**
 * El desplegable de la app: va donde iría un `<select>`. El del sistema no se deja pintar (su lista sale blanca, con
 * otra letra y otros colores) y cada pantalla lo disfrazaba a su manera; este es el mismo menú en todas, el de `Picker`
 * (`Composer.tsx`): la lista de Sloth, con la opción elegida marcada, teclado y Escape. `server/reglas-repo.test.ts`
 * no deja entrar un `<select>` nuevo.
 *
 * El botón dice la opción elegida, con la letra y el color de donde está. Con `campo`, tiene la cara de un campo de
 * formulario (borde y fondo); el ancho y lo demás lo pone cada pantalla con su `className`. La lista sale por encima de
 * todo (`flotante`), así ningún contenedor con scroll la recorta.
 */
export interface OpcionDesplegable {
  value: string
  label: string
  /** A la derecha de la opción, apagado. */
  detalle?: string
}

export function Desplegable(props: {
  /** Qué se elige («Orden», «Periodo»): encabeza la lista y nombra el botón para quien no ve. */
  nombre: string
  valor: string
  /** Las opciones, o varios grupos de ellas, cada uno con su título. */
  opciones: OpcionDesplegable[] | { label: string; options: OpcionDesplegable[] }[]
  onCambio(valor: string): void
  /** Lo que dice el botón cuando el valor no es ninguna opción (aún no se elige). */
  vacio?: string
  /** Delante del valor. */
  icono?: ReactNode
  /** La ayuda al pasar el ratón. */
  titulo?: string
  campo?: boolean
  disabled?: boolean
  className?: string
}) {
  const grupos = props.opciones.length && 'options' in props.opciones[0] ? (props.opciones as { label: string; options: OpcionDesplegable[] }[]) : [{ label: props.nombre, options: props.opciones as OpcionDesplegable[] }]
  const elegida = grupos.flatMap((g) => g.options).find((o) => o.value === props.valor)
  const dice = elegida?.label ?? props.vacio ?? ''
  return (
    <Picker
      className={`desplegable${props.campo ? ' campo' : ''}${props.className ? ` ${props.className}` : ''}`}
      label={
        <>
          {props.icono}
          <span className="desplegable-valor">{dice}</span>
        </>
      }
      nombre={`${props.nombre}: ${dice}`}
      titulo={props.titulo}
      value={props.valor}
      disabled={props.disabled}
      groups={grupos}
      abajo
      flotante
      onChange={props.onCambio}
    />
  )
}
