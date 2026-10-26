// Arma la ventana de Sloth (electron/): main.cjs y preload.cjs, con esbuild. Lo usan `npm run compilar` (para la app que
// se vende) y `npm start` (para abrir el repo en esa misma ventana, con `abrirVentana`).
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Deja en `salida` main.cjs y preload.cjs. `macFirmada`: la de Mac va firmada por Apple y se actualiza sola. */
export async function armarVentana(salida, { macFirmada = false } = {}) {
  const comun = {
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    external: ['electron', 'koffi', 'bufferutil', 'utf-8-validate'],
    define: { __MAC_FIRMADA__: String(macFirmada) },
    logLevel: 'warning'
  }
  await build({ ...comun, entryPoints: [join(REPO, 'electron', 'main.ts')], outfile: join(salida, 'main.cjs') })
  await build({ ...comun, entryPoints: [join(REPO, 'electron', 'preload.ts')], outfile: join(salida, 'preload.cjs') })
}

/**
 * Abre la interfaz del repo (`url`) en la ventana de Sloth. `false` si Electron no está (falta `npm install`): quien llama
 * abre Edge, como antes.
 */
export async function abrirVentana(url) {
  let electron
  try {
    electron = createRequire(import.meta.url)('electron')
  } catch {
    return false
  }
  const salida = join(REPO, 'node_modules', '.cache', 'sloth-ventana')
  await armarVentana(salida)
  // Si quien lanza Sloth corre dentro de otra app de Electron (un editor), esto haría de electron.exe un Node.
  const { ELECTRON_RUN_AS_NODE, ...env } = process.env
  spawn(electron, [join(salida, 'main.cjs')], { detached: true, stdio: 'ignore', env: { ...env, SLOTH_VENTANA: url, SLOTH_APP: REPO } }).unref()
  return true
}
