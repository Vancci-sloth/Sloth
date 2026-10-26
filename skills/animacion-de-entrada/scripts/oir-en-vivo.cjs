// ¿Suena de verdad? Arranca el sonido con un AudioContext real, tarde a propósito (como en la app, donde el código llega
// después de que empiece la animación), y comprueba que no lanza y que Chromium lo da por audible.
//
//   electron oir-en-vivo.cjs <carpeta>/sonido.js [funcion=composeSplash] [retrasoMs=400]
//
// <sonido.js> es el bundle IIFE con `--global-name=Sonido` (ver `grabar-audio.cjs`). Imprime «ok running» y
// «audible true» si todo va bien; si no, el error (así salió en Sloth un RangeError por empezar en tiempo negativo,
// que además impedía cargar la app).
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const [bundle, funcion = 'composeSplash', retraso = '400'] = process.argv.slice(2)
app.whenReady().then(async () => {
  const html = path.join(path.dirname(path.resolve(bundle)), `vivo-${process.pid}.html`)
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><script src="${path.basename(bundle)}"></script>`)
  const win = new BrowserWindow({ show: false })
  await win.loadFile(html)
  const r = await win.webContents.executeJavaScript(`(async () => {
    try {
      const ctx = new AudioContext()
      // El cero de la animación quedó ${+retraso} ms atrás.
      Sonido[${JSON.stringify(funcion)}](ctx, ctx.currentTime - ${+retraso} / 1000)
      await new Promise((r) => setTimeout(r, 400))
      return 'ok ' + ctx.state
    } catch (e) { return 'ERROR ' + e.stack }
  })()`)
  console.log(r)
  await new Promise((r) => setTimeout(r, 500))
  console.log('audible', win.webContents.isCurrentlyAudible())
  fs.rmSync(html)
  app.quit()
})
