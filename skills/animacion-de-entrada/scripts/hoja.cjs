// Una hoja de contactos: varios fotogramas en una sola imagen, cada uno con su instante, para revisar de un vistazo.
//
//   electron hoja.cjs <salida.png> <prefijo> <tiempos> [columnas=4] [ancho-celda=400] [recorte]
//
// Lee <prefijo>-<ms>.png (lo que escribe `fotogramas.cjs`). [recorte] = «x,y,ancho,alto» de cada fotograma para ampliar
// un detalle (un ojo, el arranque de un trazo); sin él, el fotograma entero.
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const [salida, prefijo, tiemposTexto, columnas = '4', celda = '400', recorte] = process.argv.slice(2)
const tiempos = tiemposTexto.split(',')
const ancho = +celda
const [rx, ry, rw, rh] = recorte ? recorte.split(',').map(Number) : []

app.whenReady().then(async () => {
  // El tamaño de los fotogramas, de la cabecera del PNG (IHDR).
  const cabecera = fs.readFileSync(path.resolve(`${prefijo}-${tiempos[0]}.png`))
  const [iw, ih] = [cabecera.readUInt32BE(16), cabecera.readUInt32BE(20)]
  const escala = recorte ? ancho / rw : ancho / iw
  const alto = Math.round((recorte ? rh : ih) * escala)
  const celdas = tiempos.map((t) => {
    const src = 'file:///' + path.resolve(`${prefijo}-${t}.png`).replace(/\\/g, '/')
    const img = recorte
      ? `<img src="${src}" style="position:absolute;width:${iw * escala}px;left:${-rx * escala}px;top:${-ry * escala}px">`
      : `<img src="${src}" style="width:${ancho}px;display:block">`
    return `<div style="position:relative;width:${ancho}px;height:${alto}px;overflow:hidden">${img}<span style="position:absolute;top:4px;left:6px;color:#0f0;font:12px monospace;text-shadow:0 0 3px #000">${t} ms</span></div>`
  })
  const html = path.join(os.tmpdir(), `hoja-${process.pid}.html`)
  fs.writeFileSync(html, `<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${columnas},${ancho}px);gap:3px">${celdas.join('')}</body>`)
  const filas = Math.ceil(tiempos.length / +columnas)
  const win = new BrowserWindow({ width: +columnas * (ancho + 3), height: filas * (alto + 3), show: false, useContentSize: true, webPreferences: { offscreen: true } })
  await win.loadFile(html)
  await new Promise((r) => setTimeout(r, 500))
  win.webContents.invalidate()
  await new Promise((r) => setTimeout(r, 150))
  fs.writeFileSync(salida, (await win.webContents.capturePage()).toPNG())
  fs.rmSync(html)
  app.quit()
})
