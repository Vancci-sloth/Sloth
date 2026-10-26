import { parentPort, workerData } from 'node:worker_threads'
import { tsImport } from 'tsx/esm/api'

// Este hilo solo lee Git y conserva objetos por su huella; commits y reversiones siguen en el servidor.
const { CambiosSloth } = await tsImport('./cambios-sloth.ts', import.meta.url)
const cambios = new CambiosSloth(workerData.app, workerData.dir)
parentPort.on('message', ({ id, sessionId }) => {
  try {
    cambios.recargar()
    parentPort.postMessage({ id, value: cambios.ver(sessionId) })
  } catch (error) {
    parentPort.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
})
