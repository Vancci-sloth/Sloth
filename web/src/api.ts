/** El error de `api`, con el estado HTTP: 401 en la comunidad es que falta la cuenta gratis (`Licencia.tsx`). */
export class ErrorApi extends Error {
  constructor(mensaje: string, readonly status: number) {
    super(mensaje)
  }
}

const cuentasEnCurso = new Map<string, Promise<unknown>>()

/** Una sola lectura de cada cuenta a la vez: al abrir, el inicio, la bienvenida y Opciones la piden juntos. */
export function leerCuenta<T>(ruta: string): Promise<T> {
  const antes = cuentasEnCurso.get(ruta)
  if (antes) return antes as Promise<T>
  const lectura = api<T>(ruta).finally(() => cuentasEnCurso.delete(ruta))
  cuentasEnCurso.set(ruta, lectura)
  return lectura
}

/**
 * Quien le pregunta al usuario si sigue, cuando el servidor pide confirmar (`AvisoVideos.tsx`). Con `cola`, también puede
 * ponerlo en la cola: contesta «cola».
 */
let preguntar: ((aviso: string, cola: boolean) => Promise<boolean | 'cola'>) | undefined
export const alPreguntar = (f: typeof preguntar) => void (preguntar = f)

/**
 * Si el servidor se está levantando otra vez (tras «Reiniciar backend» o una caída, scripts/start.mjs), `fetch` falla
 * sin respuesta, «Failed to fetch». Lo que solo lee se vuelve a pedir durante unos 15 s; lo que cambia algo no, porque
 * pudo haber llegado.
 */
async function pedir(path: string, body?: unknown): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      return await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    } catch {
      if (body !== undefined || i >= 10) throw new Error('No se pudo hablar con Sloth: puede que se esté reiniciando. Intenta otra vez en unos segundos.')
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await pedir(path, body)
  // Sin JSON es que el servidor no conoce la ruta: casi siempre, un cambio en server/ que aún no se ha reiniciado. Vite
  // contesta esas rutas con la página (200, HTML) o con un 404.
  const data = await res.json().catch(() => {
    // Desde la web, un error de Cloudflare (502, 530…) en HTML es que el túnel no llega: Sloth se reinicia o se cerró.
    if (res.status >= 500 && location.protocol === 'https:' && location.hostname !== 'localhost') throw new Error(location.hostname.endsWith('.trycloudflare.com') ? 'No hay conexión con tu Sloth: puede que se esté reiniciando o que tu computadora se haya apagado.' : 'No hay conexión con tu Sloth: puede que se esté reiniciando o que tu Codespace se haya detenido.')
    const desconocida = res.status === 404 || res.headers.get('content-type')?.includes('text/html')
    throw new Error(desconocida ? 'El servidor aún no conoce esta función: pulsa «Reiniciar backend».' : `El servidor respondió ${res.status}`)
  })
  // Con un error vacío, quien llamó no enseña nada y el texto sigue en el campo: decir que no, no es un fallo.
  if (data.confirmar && preguntar) {
    const sigue = await preguntar(data.error, !!data.cola)
    if (sigue) return api<T>(path, { ...(body as object), masDeDos: true, ...(sigue === 'cola' ? { enCola: true } : {}) })
    throw new ErrorApi('', res.status)
  }
  if (!res.ok) throw new ErrorApi(data.error ?? res.statusText, res.status)
  return data
}
