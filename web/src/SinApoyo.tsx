import { useEffect } from 'react'
import { api } from './api'
import { abrirTienda } from './Comunidad'
import { Icono } from './Iconos'

/**
 * En el sitio del compositor de un estilo instalado de la comunidad cuando esta computadora ya no apoya a Sloth
 * (`Card.bloqueada`): dice por qué no hace videos y lleva a la tienda de la comunidad, donde se apoya otra vez. Al salir
 * y cada vez que se vuelve a la ventana le pregunta al cobro (`/api/licencia?fresco`): en cuanto el apoyo está, el
 * servidor manda las cards ya abiertas y esto se quita solo.
 */
export function SinApoyo({ titulo }: { titulo: string }) {
  useEffect(() => {
    const revisar = () => void api('/api/licencia?fresco').catch(() => {})
    revisar()
    addEventListener('focus', revisar)
    return () => removeEventListener('focus', revisar)
  }, [])
  return (
    <div className="sin-apoyo">
      <Icono de="candadoCerrado" className="icon-trazo" />
      <div>
        <strong>«{titulo}» es un estilo de la comunidad</strong>
        <p>Los estilos de la comunidad son para quienes apoyan a Sloth, y ahora no tienes un apoyo vigente. Los videos que hiciste con él siguen aquí; para hacer más, vuelve a apoyar.</p>
      </div>
      <button className="primary" onClick={abrirTienda}>
        Volver a apoyar
      </button>
    </div>
  )
}
