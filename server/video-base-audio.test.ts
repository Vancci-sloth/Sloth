import assert from 'node:assert/strict'
import procesos from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import { join } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import test, { type TestContext } from 'node:test'

function temporal(t: TestContext) {
  const carpeta = mkdtempSync(join(os.tmpdir(), 'sloth-audio-test-'))
  t.after(() => {
    t.mock.restoreAll()
    syncBuiltinESMExports()
    rmSync(carpeta, { recursive: true, force: true })
  })
  return carpeta
}

// Se prueba abrirChrome y su captura; solo se simula el proceso externo y su protocolo CDP.
for (const sistema of ['darwin', 'win32', 'linux']) {
  for (const shell of [true, false]) {
    test(`Chrome captura con ${shell ? 'headless shell' : 'Chrome normal'} en ${sistema}`, async (t) => {
      const carpeta = temporal(t)
      const exe = join(carpeta, shell ? 'chrome-headless-shell' : 'chrome')
      writeFileSync(exe, '')
      const plataforma = Object.getOwnPropertyDescriptor(process, 'platform')!
      const chromeAnterior = process.env.CHROME
      t.after(() => {
        Object.defineProperty(process, 'platform', plataforma)
        if (chromeAnterior === undefined) delete process.env.CHROME
        else process.env.CHROME = chromeAnterior
      })
      Object.defineProperty(process, 'platform', { value: sistema })
      process.env.CHROME = exe
      t.mock.method(os, 'tmpdir', () => carpeta)
      t.mock.method(os, 'homedir', () => carpeta)
      const mensajes: { method: string; params: Record<string, unknown> }[] = []
      const imagen = Buffer.from('captura de prueba')
      const salida = new PassThrough()
      const proc = Object.assign(new EventEmitter(), { exitCode: null as number | null, signalCode: null, kill() {} })
      const entrada = new Writable({
        write(chunk, _encoding, callback) {
          const mensaje = JSON.parse(chunk.toString().replace(/\0$/, ''))
          mensajes.push(mensaje)
          const result = mensaje.method === 'Target.createTarget' ? { targetId: 'pagina' }
            : mensaje.method === 'Target.attachToTarget' ? { sessionId: 'sesion' }
              : mensaje.method === 'Page.captureScreenshot' ? { data: imagen.toString('base64') }
                : mensaje.method === 'HeadlessExperimental.beginFrame' ? { hasDamage: true, screenshotData: imagen.toString('base64') }
                  : {}
          if (mensaje.method === 'Browser.close') proc.exitCode = 0
          queueMicrotask(() => salida.write(JSON.stringify({ id: mensaje.id, result }) + '\0'))
          callback()
        }
      })
      const lanzar = t.mock.method(procesos, 'spawn', () => Object.assign(proc, { stdio: [null, null, new PassThrough(), entrada, salida] }))
      syncBuiltinESMExports()
      // @ts-expect-error: un script de la skill, sin tipos
      const { abrirChrome } = await import('../skills/video-base/scripts/chrome.mjs')
      const chrome = await abrirChrome({ ancho: 640, alto: 360 })
      try {
        const captura = await chrome.capturar('jpeg', 85)
        assert.deepEqual(await captura.imagen, imagen)
        const marcos = shell && sistema !== 'darwin'
        assert.equal(lanzar.mock.callCount(), 1)
        assert.equal(lanzar.mock.calls[0].arguments[0], exe)
        const args = lanzar.mock.calls[0].arguments[1] as string[]
        assert.equal(args.includes('--deterministic-mode'), marcos)
        assert.deepEqual(mensajes.find((m) => m.method === 'Target.createTarget')?.params,
          { url: 'about:blank', enableBeginFrameControl: marcos })
        assert.deepEqual(mensajes.find((m) => m.method === 'Emulation.setDeviceMetricsOverride')?.params,
          { width: 640, height: 360, deviceScaleFactor: 1, mobile: false })
        if (marcos) {
          assert.equal(mensajes.some((m) => m.method === 'Page.captureScreenshot'), false)
          assert.deepEqual(mensajes.find((m) => m.params.screenshot)?.params,
            { screenshot: { format: 'jpeg', quality: 85, optimizeForSpeed: true }, noDisplayUpdates: true })
        } else {
          assert.equal(mensajes.some((m) => m.method === 'HeadlessExperimental.beginFrame'), false)
          assert.deepEqual(mensajes.find((m) => m.method === 'Page.captureScreenshot')?.params,
            { format: 'jpeg', quality: 85, optimizeForSpeed: true, fromSurface: true })
        }
      } finally {
        await chrome.cerrar()
      }
      assert.equal(mensajes.at(-1)?.method, 'Browser.close')
      assert.deepEqual(readdirSync(carpeta), [shell ? 'chrome-headless-shell' : 'chrome'], 'devuelve el turno y borra el perfil')
    })
  }
}

// La entrada pública del script sigue siendo argv. FFmpeg simulado permite probar ambas compilaciones en cualquier SO.
for (const conSoxr of [false, true]) {
  test(`Masteriza a 48 kHz ${conSoxr ? 'con soxr si está disponible' : 'sin soxr si FFmpeg no lo trae'}`, async (t) => {
    const carpeta = temporal(t)
    const entrada = join(carpeta, 'crudo.wav')
    const salida = join(carpeta, 'audio.wav')
    const audio = Buffer.from('audio procesado por FFmpeg')
    writeFileSync(entrada, 'audio original')
    writeFileSync(salida, 'salida anterior')
    const argv = process.argv
    t.after(() => { process.argv = argv })
    process.argv = [process.execPath, 'masterizar.mjs', entrada, salida]
    const stdout: string[] = []
    const stderr: string[] = []
    t.mock.method(console, 'log', (linea: string) => { stdout.push(linea) })
    t.mock.method(console, 'error', (linea: string) => { stderr.push(linea) })
    const salir = t.mock.method(process, 'exit', (codigo?: number) => { throw new Error(`Salida inesperada: ${codigo}`) })
    let procesados = 0
    t.mock.method(procesos, 'spawnSync', (comando: string, args: string[]) => {
      assert.equal(comando, 'ffmpeg')
      const filtro = args[args.indexOf('-af') + 1]
      if (filtro === 'ebur128=peak=true') {
        const original = args[args.indexOf('-i') + 1] === entrada
        return { status: 0, stderr: `Summary:\nI: ${original ? -20 : -14} LUFS\nPeak: ${original ? -7 : -1.3} dBFS` }
      }
      if (args.includes('lavfi')) {
        assert.equal(filtro, 'aresample=48000:resampler=soxr')
        assert.equal(args.at(-1), '-')
        return { status: conSoxr ? 0 : 1, stderr: conSoxr ? '' : 'Requested resampling engine is unavailable' }
      }
      if (!conSoxr && filtro.includes('resampler=soxr')) {
        return { status: 1, stderr: 'Requested resampling engine is unavailable' }
      }
      assert.equal(filtro, 'highpass=f=30,volume=6.00dB,aresample=192000,alimiter=limit=0.8610:attack=1:release=60:level=false,aresample=48000' + (conSoxr ? ':resampler=soxr' : ''))
      assert.deepEqual(args.slice(-7), ['-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', salida + '.tmp.wav'])
      writeFileSync(args.at(-1)!, audio)
      procesados++
      return { status: 0, stderr: '' }
    })
    syncBuiltinESMExports()
    await import(`../skills/video-base/scripts/masterizar.mjs?soxr=${conSoxr}`)
    assert.equal(salir.mock.callCount(), 0)
    assert.equal(procesados, 1)
    assert.deepEqual(stdout, [salida, 'antes -20.0 LUFS, pico -7.0 dBTP → ahora -14.0 LUFS, pico -1.3 dBTP'])
    assert.deepEqual(stderr, [])
    assert.deepEqual(readFileSync(salida), audio)
    assert.equal(readFileSync(entrada, 'utf8'), 'audio original')
    assert.equal(existsSync(salida + '.tmp.wav'), false)
  })
}
