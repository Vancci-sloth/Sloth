// Graba el sonido de la entrada a un WAV sin tiempo real, con el mismo código que suena en la app.
//
//   1) npx esbuild <sonido.ts> --bundle --format=iife --global-name=Sonido --outfile=<carpeta>/sonido.js
//   2) electron grabar-audio.cjs <carpeta>/sonido.js <salida.wav> [segundos=4.4] [salidaEn=2.78] [funcion=composeSplash]
//
// Llama a `Sonido.<funcion>(OfflineAudioContext, 0)` (el cero de la animación en 0 s) y, si `salidaEn` > 0, a
// `.leave(salidaEn)` de lo que devuelva. Escribe un WAV estéreo de 16 bits a 48 kHz e imprime el pico.
// Después: espectrograma y sonoridad con FFmpeg (ver references/verificar.md), y mezclarlo con el vídeo.
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const [bundle, salida, segundos = '4.4', salidaEn = '2.78', funcion = 'composeSplash'] = process.argv.slice(2)
app.whenReady().then(async () => {
  const html = path.join(path.dirname(path.resolve(bundle)), `grabar-${process.pid}.html`)
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><script src="${path.basename(bundle)}"></script>`)
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadFile(html)
  const [b64, pico] = await win.webContents.executeJavaScript(`(async () => {
    const rate = 48000, seconds = ${+segundos}
    const ctx = new OfflineAudioContext(2, rate * seconds, rate)
    const score = Sonido[${JSON.stringify(funcion)}](ctx, 0)
    if (${+salidaEn} > 0 && score?.leave) score.leave(${+salidaEn})
    const buf = await ctx.startRendering()
    const n = buf.length, out = new DataView(new ArrayBuffer(44 + n * 4))
    const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)) }
    w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true)
    out.setUint32(24, rate, true); out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true)
    const L = buf.getChannelData(0), R = buf.getChannelData(1); let peak = 0
    for (let i = 0; i < n; i++) {
      peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
      out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true)
      out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true)
    }
    let s = ''; const bytes = new Uint8Array(out.buffer)
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    return [btoa(s), peak]
  })()`)
  fs.writeFileSync(salida, Buffer.from(b64, 'base64'))
  fs.rmSync(html)
  console.log('pico', pico.toFixed(3), `(${(20 * Math.log10(pico)).toFixed(1)} dBFS)`)
  app.quit()
})
