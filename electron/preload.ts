/**
 * Lo que la ventana de Sloth (main.ts) le da a la interfaz: `window.sloth` (`PuenteSloth`). Corre antes que la página,
 * aislado de ella.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { EstadoNavegador, PuenteSloth } from '../shared/types.ts'

const puente: PuenteSloth = {
  actualizacion: () => ipcRenderer.invoke('actualizacion'),
  actualizar: () => ipcRenderer.invoke('actualizar'),
  traer: () => ipcRenderer.send('traer'),
  anclada: () => ipcRenderer.invoke('anclada'),
  anclar: () => ipcRenderer.invoke('anclar'),
  // El navegador integrado (navegador.ts).
  navegador: {
    ver: (hilo, caja) => ipcRenderer.send('navegador:ver', hilo, caja),
    ir: (hilo, url) => ipcRenderer.send('navegador:ir', hilo, url),
    hacer: (hilo, accion) => ipcRenderer.send('navegador:hacer', hilo, accion),
    oir: (cb) => {
      const oir = (_e: IpcRendererEvent, estado: EstadoNavegador) => cb(estado)
      ipcRenderer.on('navegador:estado', oir)
      return () => void ipcRenderer.off('navegador:estado', oir)
    },
    estados: () => ipcRenderer.invoke('navegador:estados')
  }
}

contextBridge.exposeInMainWorld('sloth', puente)
