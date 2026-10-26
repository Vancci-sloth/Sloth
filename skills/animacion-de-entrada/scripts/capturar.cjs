// Una captura de una página HTML local, con su tamaño exacto.
//
//   electron capturar.cjs <pagina.html> <salida.png> [esperaMs=300] [ancho=600] [alto=600]
//
// Para ver un trazo vectorizado encima del dibujo original, una hoja de contactos (`hoja.cjs`) o cualquier prueba suelta.
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const [html, png, espera = '300', ancho = '600', alto = '600'] = process.argv.slice(2)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: +ancho, height: +alto, show: false, useContentSize: true, webPreferences: { offscreen: true } })
  await win.loadFile(path.resolve(html))
  await new Promise((r) => setTimeout(r, +espera))
  win.webContents.invalidate()
  await new Promise((r) => setTimeout(r, 100))
  fs.writeFileSync(png, (await win.webContents.capturePage()).toPNG())
  app.quit()
})
