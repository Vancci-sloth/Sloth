import { Worker } from 'node:worker_threads'

/**
 * A un archivo y no a una tubería: un programa que el servidor lance mientras tanto hereda la tubería y la deja abierta, y
 * la respuesta se quedaba esperando hasta caducar. Sin ella, el id de la computadora salía otro (`server/licencia.ts`).
 */
const CODIGO = `const { parentPort, workerData, threadId } = require('node:worker_threads')
const fs = require('node:fs')
const archivo = require('node:path').join(require('node:os').tmpdir(), 'sloth-reg-' + process.pid + '-' + threadId + '.txt')
const salida = fs.openSync(archivo, 'w')
const { error, status } = require('node:child_process').spawnSync('reg', workerData, { stdio: ['ignore', salida, 'ignore'], windowsHide: true, timeout: 15000 })
fs.closeSync(salida)
const texto = fs.readFileSync(archivo, 'utf8')
try { fs.rmSync(archivo) } catch {}
if (error || status) throw error ?? new Error('reg terminó con ' + status)
parentPort.postMessage(texto)`

/**
 * Pregunta al registro de Windows desde otro hilo: Node no sabe leerlo, y lanzar un programa suele detener de 150 a 300 ms
 * a quien lo lanza, aunque sea asíncrono (docs/agents/rendimiento.md). Aquí esperar no detiene nada, y con la máquina
 * ocupada `reg` tarda segundos: el tope es largo porque caducar sale caro (id de respaldo, variables de una en una).
 */
export const preguntarAlRegistro = (args: string[]) =>
  new Promise<string>((listo, fallo) => {
    new Worker(CODIGO, { eval: true, workerData: args }).once('message', listo).once('error', fallo)
  })
