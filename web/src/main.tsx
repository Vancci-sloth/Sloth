// Primero: desde la web, lo que se guarda en el navegador sube a la computadora (web.ts), antes de que nada lo lea.
import { enLaWeb } from './web'
import { createRoot } from 'react-dom/client'
import { VENTA } from '../../shared/venta'
import { App } from './App'
import { ConexionWeb } from './ConexionWeb'
import { Recordatorio } from './Licencia'
import { TraerSloth } from './Respaldo'
import './styles.css'

// La app que se vende recuerda, cada tantos inicios, que se puede apoyar a Sloth.
createRoot(document.getElementById('root')!).render(
  <>
    <App />
    {VENTA && <Recordatorio />}
    {/* Con la misma clave en otra computadora, ofrece traer lo de allá. */}
    <TraerSloth />
    {/* Desde la web, si se pierde la conexión con la computadora. */}
    {enLaWeb && <ConexionWeb />}
  </>
)
