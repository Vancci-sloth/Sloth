// ¿Qué elemento pinta esa mancha? Oculta los sospechosos uno a uno y mide el brillo máximo de una zona en un instante.
// El que, al ocultarse, hace bajar el brillo es el culpable.
//
//   electron depurar.cjs <pagina.html> <ms> <x,y,ancho,alto> <selector> [<selector> ...] [--ancho 1100 --alto 760]
//
// Así se encontró en Sloth una media luna gris en los primeros fotogramas: era el brillo que cruza el logo, cuya
// posición de partida asomaba por el borde (se movió más lejos).
const { app, BrowserWindow } = require('electron')
const path = require('path')

const args = process.argv.slice(2)
let ancho = 1100, alto = 760
const resto = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ancho') ancho = +args[++i]
  else if (args[i] === '--alto') alto = +args[++i]
  else resto.push(args[i])
}
const [html, ms, zona, ...selectores] = resto
const [x, y, w, h] = zona.split(',').map(Number)

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: ancho, height: alto, show: false, useContentSize: true, webPreferences: { offscreen: true } })
  await win.loadFile(path.resolve(html))
  await new Promise((r) => setTimeout(r, 300))
  for (const sel of ['(ninguno)', ...selectores]) {
    await win.webContents.executeJavaScript(`(() => {
      for (const e of document.querySelectorAll('[data-oculto]')) { e.style.visibility = ''; e.removeAttribute('data-oculto') }
      if (${JSON.stringify(sel)} !== '(ninguno)') for (const e of document.querySelectorAll(${JSON.stringify(sel)})) { e.style.visibility = 'hidden'; e.setAttribute('data-oculto', '') }
      for (const a of document.getAnimations()) { a.pause(); a.currentTime = ${+ms} }
    })()`)
    win.webContents.invalidate()
    await new Promise((r) => setTimeout(r, 150))
    const bmp = (await win.webContents.capturePage({ x, y, width: w, height: h })).toBitmap()
    let max = 0
    for (let i = 0; i < bmp.length; i += 4) max = Math.max(max, bmp[i] + bmp[i + 1] + bmp[i + 2])
    console.log(`oculto ${sel.padEnd(30)} brillo máximo ${max}`)
  }
  app.quit()
})
