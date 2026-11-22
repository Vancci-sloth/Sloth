/**
 * Cómo se le dice a quien comparte estilos que ponga su Binance ID, que es adonde se le paga su parte del fondo de la
 * comunidad (ADR 0019). Participar sigue siendo de quien quiera, pero casi nadie lo ponía: el 19 de noviembre de 2026,
 * de 29 autores lo tenían 8, y de los 4 con un estilo ya en la tienda, 1. El creador pidió que lo tengan y que se les
 * diga cómo.
 *
 * Se lo dice el cobro, una vez por autor, con un comentario del creador en su publicación (le llega a la campana, en
 * cualquier versión de la app) en cuanto se aprueba un estilo suyo y no lo ha puesto (`cambiar` en
 * `licencias/src/comunidad.ts`). Los pasos son los de `web/src/Fondo.tsx`: si cambian allá, cambian aquí.
 */

/** Como empieza: con esto se sabe si a ese autor ya se le dijo. */
export const AVISO_BINANCE = 'Aviso automático de Sloth: tu estilo ya está en la tienda'

export const COMO_PONER_BINANCE = [
  `${AVISO_BINANCE}. Para que te toque tu parte del fondo de la comunidad solo falta que pongas tu Binance ID, que es adonde se te paga:`,
  ['1. En Sloth, abre Comunidad y dale clic al renglón «Fondo», arriba.', '2. Pulsa «¿Quieres participar?» y baja a «Pon tu Binance ID y cobra».', '3. Escribe tu Binance ID y pulsa «Participar».'].join('\n'),
  'Tu Binance ID es el número de tu cuenta de Binance: sale en tu perfil, en la app de Binance, y son solo números. Si no tienes cuenta, abrirla es gratis. Solo lo ven tú y el creador de Sloth.',
  'Sin él tu estilo sigue en la tienda, pero sus puntos no se llevan nada del fondo. Si te atoras, contesta aquí.'
].join('\n\n')
