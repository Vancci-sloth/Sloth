/// <reference types="vite/client" />

interface Window {
  /** Lo que da la ventana de VyMotion (electron/preload.ts). En un navegador no está. */
  sloth?: import('../../shared/types').PuenteSloth
}
