// Fotogramas exactos de una animación CSS en el instante que se pida, sin depender del reloj: pausa todas las
// animaciones de la página y las pone en ese `currentTime`. Así se revisa fotograma a fotograma y se graba a 60 fps.
//
//   electron fotogramas.cjs <pagina.html> <prefijo> <tiempos> [opciones]
//
//   <tiempos>     Lista en ms («200,450,900») o un rango «desde:hasta:paso» («0:3700:16.667» para 60 fps).
//   --ancho 1100  --alto 760   Tamaño de la ventana (múltiplos de 2 si va a ir a vídeo).
//   --salida 2780              Ms en que empieza la salida: desde ahí se pone la clase de salida y las animaciones de
//                              salida avanzan desde 0; las demás se quedan en su último fotograma.
//   --clase saliendo           La clase que activa la salida.
//   --selector .splash         El elemento que la recibe.
//   --anim-salida a,b          Nombres de las animaciones de salida (las demás son de la entrada).
//
// Escribe <prefijo>-<ms>.png. Ventana offscreen: una oculta normal se queda colgada al capturar.
// Lánzalo con el Electron del proyecto y sin ELECTRON_RUN_AS_NODE:
//   unset ELECTRON_RUN_AS_NODE; node_modules/electron/dist/electron.exe fotogramas.cjs …
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const [html, prefijo, tiemposTexto, ...rest] = process.argv.slice(2)
const opts = { ancho: 1100, alto: 760, salida: Infinity, clase: 'saliendo', selector: '.splash', animSalida: [] }
for (let i = 0; i < rest.length; i++) {
  const v = rest[++i]
  if (rest[i - 1] === '--ancho') opts.ancho = +v
  else if (rest[i - 1] === '--alto') opts.alto = +v
  else if (rest[i - 1] === '--salida') opts.salida = +v
  else if (rest[i - 1] === '--clase') opts.clase = v
  else if (rest[i - 1] === '--selector') opts.selector = v
  else if (rest[i - 1] === '--anim-salida') opts.animSalida = v.split(',')
}
const tiempos = tiemposTexto.includes(':')
  ? (() => { const [a, b, p] = tiemposTexto.split(':').map(Number); const t = []; for (let x = a; x <= b + 1e-6; x += p) t.push(Math.round(x)); return t })()
  : tiemposTexto.split(',').map(Number)

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: opts.ancho, height: opts.alto, show: false, useContentSize: true, webPreferences: { offscreen: true } })
  await win.loadFile(path.resolve(html))
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
  await new Promise((r) => setTimeout(r, 300))
  // La primera captura puede salir sin pintar: se hace una de calentamiento y se tira.
  win.webContents.invalidate()
  await win.webContents.capturePage()
  for (const t of tiempos) {
    await win.webContents.executeJavaScript(`(() => {
      const fuera = ${t} >= ${opts.salida}
      document.querySelector(${JSON.stringify(opts.selector)})?.classList.toggle(${JSON.stringify(opts.clase)}, fuera)
      const salida = ${JSON.stringify(opts.animSalida)}
      for (const a of document.getAnimations()) {
        a.pause()
        a.currentTime = salida.includes(a.animationName) ? ${t} - ${opts.salida} : Math.min(${t}, ${opts.salida} - 1)
      }
    })()`)
    win.webContents.invalidate()
    await new Promise((r) => setTimeout(r, 120))
    fs.writeFileSync(`${prefijo}-${t}.png`, (await win.webContents.capturePage()).toPNG())
  }
  console.log(`${tiempos.length} fotogramas`)
  app.quit()
})
