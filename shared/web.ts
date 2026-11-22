/**
 * Sloth en la web (ADR 0025): lo que comparten la app (`server/web.ts`), el cobro (`licencias/src/web.ts`) y la
 * pantalla (`web/src/web.ts`, `web/src/SlothWeb.tsx`).
 *
 * Tu Sloth sigue trabajando en tu computadora; la web es su misma interfaz, abierta desde otro navegador por un túnel de
 * Cloudflare. La entrada fija es `ENTRADA`, en el Worker del cobro, que sabe la dirección del túnel de cada computadora
 * (cambia cada vez que se abre) y guarda en ese navegador la llave de su dispositivo, que no se puede sacar de él.
 */

/** El cobro de Sloth: la computadora le dice ahí dónde está su túnel. */
export const COBRO_WEB = 'https://api.sloth.vancci.org'
/**
 * La entrada, en su propio dominio (el mismo Worker): ninguna otra página vive ahí, así que nada de otra página puede
 * usar la llave de un dispositivo. Es también lo que se escribe a mano para usar el código corto.
 */
export const ENTRADA = 'https://web.sloth.vancci.org'

/** El id de una computadora ante el cobro: 22 letras de base64url (128 bits). */
export const ID_EQUIPO = /^[A-Za-z0-9_-]{22}$/
/** Su llave ante el cobro: 43 letras de base64url (256 bits). */
export const SECRETO = /^[A-Za-z0-9_-]{43}$/
/** Lo que firma un dispositivo para entrar: el host del túnel y un reto de un solo uso que dio la computadora. */
export const aFirmar = (host: string, reto: string) => `sloth-web:${host}:${reto}`
/** La dirección de un túnel rápido de Cloudflare: la única que el cobro guarda. */
export const TUNEL = /^https:\/\/[a-z0-9-]{1,63}\.trycloudflare\.com$/
/** Las letras del código corto: sin las que se confunden (0/O, 1/I/L). */
export const LETRAS_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
/** El código corto, ya limpio: diez de `LETRAS_CODIGO` (31^10, unos 8·10^14). Se escribe como `ABCDE-FGHJK`. */
export const LARGO_CODIGO = 10
export const CODIGO_CORTO = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/
/** Lo que dura un código para conectar un dispositivo. */
export const VIDA_CODIGO = 10 * 60_000

/** El código corto como lo escribió alguien: sin guiones ni espacios, en mayúsculas. */
export const limpiarCodigo = (s: string) => s.toUpperCase().replace(/[\s-]+/g, '')
/** El código corto como se enseña: `ABCDE-FGHJK`. */
export const verCodigo = (c: string) => `${c.slice(0, 5)}-${c.slice(5)}`

/** El enlace de entrada de una computadora; con `codigo`, el que conecta un dispositivo nuevo. */
export const enlaceEntrada = (equipo: string, codigo?: string) => `${ENTRADA}/${equipo}${codigo ? `#c=${codigo}` : ''}`

/** Si la página se abrió desde la web (por el túnel) y no en la ventana de Sloth ni en `localhost`. */
export const esDeLaWeb = (l: { protocol: string; hostname: string }) => l.protocol === 'https:' && l.hostname !== 'localhost' && l.hostname !== '127.0.0.1'

/** Un dispositivo que entra a esta computadora desde la web. */
export interface DispositivoWeb {
  id: string
  /** Lo que dice su navegador: «iPhone · Safari», «Windows · Chrome». */
  nombre: string
  /** Cuándo se conectó y la última vez que entró (ISO). */
  creado: string
  visto: string
  /** Si es el que pregunta. */
  este?: boolean
}

/** Lo que enseña Opciones (`GET /api/web`). */
export interface EstadoWeb {
  encendida: boolean
  /**
   * `bajando`: se baja el programa del túnel (cloudflared) la primera vez. `abriendo`: el túnel arranca. `lista`: se
   * puede entrar. `error`: no se pudo (`error` dice por qué) y se vuelve a intentar solo.
   */
  estado: 'apagada' | 'bajando' | 'abriendo' | 'lista' | 'error'
  error?: string
  /** El id de esta computadora ante el cobro y su enlace de entrada, que no cambia. */
  equipo: string
  enlace: string
  dispositivos: DispositivoWeb[]
  /** Si quien pregunta entró desde la web. */
  desdeLaWeb: boolean
}

/** Un código para conectar un dispositivo (`POST /api/web/codigo`). */
export interface CodigoWeb {
  /** El enlace que conecta solo, y el código corto para escribir en `ENTRADA`. */
  enlace: string
  corto: string
  vence: string
  /** Si el cobro ya sabe del código corto: sin él, solo vale el enlace. */
  cortoListo: boolean
}

/** El nombre de un dispositivo, de lo que dice su navegador. */
export function nombreDispositivo(ua: string): string {
  const sistema = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Macintosh|Mac OS/.test(ua)
            ? 'Mac'
            : /CrOS/.test(ua)
              ? 'Chromebook'
              : /Linux/.test(ua)
                ? 'Linux'
                : 'Otro'
  const navegador = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS/.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS/.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : ''
  return navegador ? `${sistema} · ${navegador}` : sistema
}
