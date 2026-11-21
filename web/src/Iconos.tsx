/**
 * Los iconos de trazo de Sloth (los de Lucide, lucide.dev): un nombre y sus trazos, del color del texto que los rodea y
 * del tamaño que les dé el CSS. Para la barra lateral y las secciones; los logos de otras marcas van en `Logos.tsx`.
 */
import { TRAZOS, type NombreIcono } from './trazos'

export type { NombreIcono }
/** Los trazos de un icono, para quien lo dibuja con otro color (la corona de los Fundadores). */
export const trazosDe = (nombre: NombreIcono): readonly string[] => TRAZOS[nombre]
export const esIcono =(nombre: string): nombre is NombreIcono => Object.hasOwn(TRAZOS, nombre)

export function Icono({ de, className = 'ico' }: { de: NombreIcono; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRAZOS[de].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
