import { Worker } from 'node:worker_threads'
import type { VistaCambiosSloth } from '../shared/types.ts'

/** Git puede tardar segundos en Windows: las lecturas del panel no ocupan el servidor de los hilos. */
export function lectorCambios(app: string, dir: string) {
  const worker = new Worker(new URL('./cambios-sloth-worker.mjs', import.meta.url), { workerData: { app, dir } })
  let siguiente = 0
  const pendientes = new Map<number, { ok(value: VistaCambiosSloth): void; fail(error: Error): void }>()
  const enCurso = new Map<string, Promise<VistaCambiosSloth>>()
  let fallo: Error | undefined
  const fallar = (error: Error) => {
    fallo = error
    for (const p of pendientes.values()) p.fail(error)
    pendientes.clear()
  }
  worker.on('error', fallar)
  worker.on('exit', () => fallar(new Error('Se cerró la lectura de cambios.')))
  worker.on('message', ({ id, value, error }: { id: number; value: VistaCambiosSloth; error?: string }) => {
    const p = pendientes.get(id)
    pendientes.delete(id)
    if (error) p?.fail(new Error(error))
    else p?.ok(value)
    if (!pendientes.size) worker.unref()
  })
  worker.unref()
  const leer = (sessionId: string) => {
    if (fallo) return Promise.reject(fallo)
    const anterior = enCurso.get(sessionId)
    if (anterior) return anterior
    const id = ++siguiente
    const pedido = new Promise<VistaCambiosSloth>((ok, fail) => {
      pendientes.set(id, { ok, fail })
      worker.ref()
      worker.postMessage({ id, sessionId })
    }).finally(() => enCurso.delete(sessionId))
    enCurso.set(sessionId, pedido)
    return pedido
  }
  return Object.assign(leer, { cerrar: () => worker.terminate() })
}
