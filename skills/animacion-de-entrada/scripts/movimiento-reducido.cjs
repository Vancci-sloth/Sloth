// Cómo se ve la entrada con «reducir el movimiento» del sistema: emula `prefers-reduced-motion: reduce` y captura.
//
//   electron movimiento-reducido.cjs <pagina.html> <salida.png> [esperaMs=600] [ancho=1100] [alto=760]
//
// La emulación se activa después de cargar y luego se recarga: activada antes de `loadFile`, Electron no la aplica.
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const [html, png, espera = '600', ancho = '1100', alto = '760'] = process.argv.slice(2)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: +ancho, height: +alto, show: false, useContentSize: true, webPreferences: { offscreen: true } })
  await win.loadFile(path.resolve(html))
  win.webContents.debugger.attach()
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await win.webContents.executeJavaScript('location.reload()')
  await new Promise((r) => win.webContents.once('did-finish-load', r))
  await new Promise((r) => setTimeout(r, +espera))
  win.webContents.invalidate()
  await new Promise((r) => setTimeout(r, 150))
  fs.writeFileSync(png, (await win.webContents.capturePage()).toPNG())
  app.quit()
})
