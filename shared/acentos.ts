/**
 * Los acentos rotos de un texto, arreglados: «CinematogrÃ¡ficos» vuelve a ser «Cinematográficos».
 *
 * Pasa cuando un agente reescribe un archivo en Windows leyéndolo como si no fuera UTF-8 (PowerShell, sobre todo): cada
 * letra con acento queda en dos o tres signos. Llegaba así a la card de un estilo, a su guía y a la tienda, y a su
 * autor se le devolvía para que lo arreglara. Como se sabe deshacer, lo deshace Sloth: al empaquetar y al instalar un
 * estilo (`cardLimpia` en `server/estilos.ts`), en su guía (`guiaDe`) y en lo que se escribe y se lee de la comunidad
 * (`licencias/src/comunidad.ts`).
 *
 * Solo toca lo que no puede ser otra cosa: «Ã» o «Â» seguidas de un signo que no es letra, y «â» seguida de dos, cuando
 * juntos dan una letra con acento, un signo de apertura, unas comillas, una raya o los puntos suspensivos. Lo que se
 * perdió del todo («subt?tulos») no se adivina.
 */

/** Los bytes 0x80 a 0x9F como los enseña Windows (cp1252); los que no tienen signo quedan como su código. */
const DE_WINDOWS = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ'
/** Lo que sigue a la primera letra de un acento roto: un byte de 0x80 a 0xBF, visto como signo. */
const SIGUE = `[\\u0080-\\u00bf${DE_WINDOWS.replace(/[\u0080-\u009f]/g, '')}]`
const ROTO = new RegExp(`[\\u00c2\\u00c3]${SIGUE}|\\u00e2${SIGUE}{2}`, 'g')

const byte = (signo: string) => {
  const codigo = signo.charCodeAt(0)
  return codigo <= 0xff ? codigo : 0x80 + DE_WINDOWS.indexOf(signo)
}

export function acentosBien(texto: string): string {
  return texto.replace(ROTO, (roto) => {
    const b = [...roto].map(byte)
    const codigo = b.length === 2 ? ((b[0] & 0x1f) << 6) | (b[1] & 0x3f) : ((b[0] & 0x0f) << 12) | ((b[1] & 0x3f) << 6) | (b[2] & 0x3f)
    // De dos: del espacio duro a la ÿ. De tres: rayas, comillas, viñetas y puntos suspensivos, el euro y ™.
    const sirve = b.length === 2 ? codigo >= 0xa0 : (codigo >= 0x2010 && codigo <= 0x203a) || codigo === 0x20ac || codigo === 0x2122
    return sirve ? String.fromCharCode(codigo) : roto
  })
}
