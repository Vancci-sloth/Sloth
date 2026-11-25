// Primero: desde la web, lo que se guarda en el navegador sube a la computadora (web.ts), antes de que nada lo lea.
import { enLaWeb } from './web'
import { createRoot } from 'react-dom/client'
import { VENTA } from '../../shared/venta'
import { App } from './App'
import { AvisoPaypal } from './AvisoPaypal'
import { ConexionWeb } from './ConexionWeb'
import { Recordatorio } from './Licencia'
import { TraerSloth } from './Respaldo'
import { VentanasRemotas } from './VentanasRemotas'
import './styles.css'
// Los temas (`temas.ts`): cada uno cambia la interfaz solo bajo su atributo en la raíz, que se pone antes de dibujar.
import './temas/cristal.css'
import './temas/claro.css'
import { aplicarTema } from './temas'
import { Movimiento } from './Movimiento'

aplicarTema()

// La app que se vende recuerda, cada tantos inicios, que se puede apoyar a Sloth.
createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <Movimiento />
    {VENTA && <Recordatorio />}
    {/* A quien apoyó con PayPal, que Sloth ya no cobra: que cancele su suscripción allá. */}
    {VENTA && <AvisoPaypal />}
    {/* Con la misma clave en otra computadora, ofrece traer lo de allá. */}
    <TraerSloth />
    {/* Desde la web, si se pierde la conexión con la computadora. */}
    {enLaWeb && <ConexionWeb />}
    {/* Desde la web, los inicios de sesión que se abren en la pantalla de la computadora. */}
    {enLaWeb && <VentanasRemotas />}
  </>
)
