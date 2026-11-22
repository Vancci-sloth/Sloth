import { TRAZOS, type NombreIcono } from '../../web/src/trazos'

/** El icono de una card es el nombre de uno de los trazos; uno que no existe se dibuja como video. */
export const esIconoValido = (nombre: string | undefined): nombre is NombreIcono => !!nombre && Object.hasOwn(TRAZOS, nombre)
