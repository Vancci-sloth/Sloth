/** El error de `api`, con el estado HTTP: 401 en la comunidad es que falta la cuenta gratis (`Licencia.tsx`). */
export class ErrorApi extends Error {
  constructor(mensaje: string, readonly status: number) {
    super(mensaje)
  }
}

/** Quien le pregunta al usuario si sigue, cuando el servidor pide confirmar (`AvisoVideos.tsx`). */
let preguntar: ((aviso: string) => Promise<boolean>) | undefined
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
    const desconocida = res.status === 404 || res.headers.get('content-type')?.includes('text/html')
    throw new Error(desconocida ? 'El servidor aún no conoce esta función: pulsa «Reiniciar backend».' : `El servidor respondió ${res.status}`)
  })
  // Con un error vacío, quien llamó no enseña nada y el texto sigue en el campo: decir que no, no es un fallo.
  if (data.confirmar && preguntar) {
    if (await preguntar(data.error)) return api<T>(path, { ...(body as object), masDeDos: true })
    throw new ErrorApi('', res.status)
  }
  if (!res.ok) throw new ErrorApi(data.error ?? res.statusText, res.status)
  return data
}
