import { createRoot } from 'react-dom/client'
import { VENTA } from '../../shared/venta'
import { App } from './App'
import { AvisosVentana } from './Confirm'
import { Recordatorio } from './Licencia'
import { Movimiento } from './Movimiento'
import { ScrollInteractivo } from './ScrollInteractivo'
import './styles.css'

// La app que se vende recuerda, cada tantos inicios, que se puede apoyar a VyMotion.
createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <AvisosVentana />
    <Movimiento />
    <ScrollInteractivo />
    {VENTA && <Recordatorio />}
  </>
)
