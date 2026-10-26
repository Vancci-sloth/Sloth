/** El error de `api`, con el estado HTTP: 401 en la comunidad es que falta la cuenta gratis (`Licencia.tsx`). */
export class ErrorApi extends Error {
  constructor(mensaje: string, readonly status: number) {
    super(mensaje)
  }
}

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  // Sin JSON es que el servidor no conoce la ruta: casi siempre, un cambio en server/ que aún no se ha reiniciado. Vite
  // contesta esas rutas con la página (200, HTML) o con un 404.
  const data = await res.json().catch(() => {
    const desconocida = res.status === 404 || res.headers.get('content-type')?.includes('text/html')
    throw new Error(desconocida ? 'El servidor aún no conoce esta función: pulsa «Reiniciar backend».' : `El servidor respondió ${res.status}`)
  })
  if (!res.ok) throw new ErrorApi(data.error ?? res.statusText, res.status)
  return data
}
