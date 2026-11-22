import Svg, { Path } from 'react-native-svg'
import { TRAZOS, type NombreIcono } from '../../web/src/trazos'
import { c } from './tema'

export type { NombreIcono }

/** Los mismos iconos de trazo que en la computadora (`web/src/trazos.ts`), nunca emojis. */
export function Icono({ de, color = c.text, tam = 20, grosor = 2 }: { de: NombreIcono; color?: string; tam?: number; grosor?: number }) {
  return (
    <Svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round" strokeLinejoin="round">
      {TRAZOS[de].map((d) => (
        <Path key={d} d={d} />
      ))}
    </Svg>
  )
}
