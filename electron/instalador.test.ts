import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { Arch } from 'app-builder-lib'
import { getMakeNsisPath, getNsisPluginsPath } from 'app-builder-lib/out/toolsets/windows.js'
import { NsisTarget } from 'app-builder-lib/out/targets/nsis/NsisTarget.js'
import { compresionInstalador } from '../scripts/instalador-config.ts'

const require = createRequire(import.meta.url)

test('el instalador escribe en Sloth aunque Nsis7z no se pueda cargar, y actualizar conserva los datos', { skip: process.platform !== 'win32' }, async (t) => {
  const base = mkdtempSync(join(tmpdir(), 'sloth-instalador-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const payload = join(base, 'contenido')
  mkdirSync(payload)
  writeFileSync(join(payload, 'prueba.txt'), 'Sloth')
  // En electron-builder 26.15 useZip solo cambia el archivo si differentialPackage es false (NsisTarget).
  assert.equal(compresionInstalador.differentialPackage, false)
  const formato = compresionInstalador.useZip ? 'zip' : '7z'
  const [nsis, plugins] = await Promise.all([getMakeNsisPath(undefined), getNsisPluginsPath(undefined)])
  copyFileSync(nsis.path, join(payload, 'Sloth.exe'))
  const videos = ['app/web/novedades/baile.webm', 'app/web/cambios/antes.mp4']
  for (const video of videos) {
    mkdirSync(dirname(join(payload, video)), { recursive: true })
    writeFileSync(join(payload, video), `Contenido de ${video}`)
  }
  // Usa el empaquetado real de NSIS: sus exclusiones no se aplicaban al ZIP armado a mano de esta prueba.
  const target = Reflect.construct(NsisTarget, [{
    config: { nsis: compresionInstalador }, info: { metadata: {} },
    appInfo: { sanitizedName: 'sloth', version: '1.0.0' }, compression: 'normal'
  }, base, 'nsis', { refCount: 0 }])
  const { path: archivo } = await target.buildAppPackage(payload, Arch.x64)
  const plantillas = join(dirname(require.resolve('app-builder-lib/package.json')), 'templates', 'nsis', 'include')
  const salida = join(base, 'Sloth')
  const registro = join(base, 'destino.txt')
  const instalador = join(base, 'prueba.exe')
  const guion = join(base, 'prueba.nsi')
  writeFileSync(guion, `
Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "${instalador}"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"
!addincludedir "${plantillas}"
!addplugindir /x86-unicode "${join(plugins, 'x86-unicode')}"
!define PRODUCT_NAME "Sloth"
!define APP_64 "${archivo}"
!define COMPRESSION_METHOD "${formato}"
${compresionInstalador.useZip ? '!define ZIP_COMPRESSION' : ''}
!define isUpdated '"1" == "1"'
LangString appCannotBeClosed 1033 "No se pudo copiar Sloth"
LangString decompressionFailed 1033 "No se pudo extraer Sloth"
!include "${join(import.meta.dirname, '..', 'scripts', 'instalador.nsh')}"
!include "extractAppPackage.nsh"
Section
  InitPluginsDir
  StrCpy $INSTDIR "${salida}"
  !insertmacro customRemoveFiles
  SetOutPath $INSTDIR
  ; Simula que el DLL no carga: el instalador es de 32 bits y se encuentra uno de 64 bits.
  File /oname=$PLUGINSDIR\\nsis7z.dll "${join(plugins, 'x64-unicode', 'nsis7z.dll')}"
  !insertmacro extractEmbeddedAppPackage
  FileOpen $0 "${registro}" w
  FileWrite $0 "$OUTDIR"
  FileClose $0
  File "/oname=Uninstall Sloth.exe" "${join(payload, 'prueba.txt')}"
SectionEnd
`)
  execFileSync(nsis.path, ['-V2', guion], { env: { ...process.env, ...nsis.env }, stdio: 'pipe' })
  const personales = ['data', 'trabajo', 'skills', 'ia', 'piezas', 'modulos']
  for (const carpeta of personales) {
    mkdirSync(join(salida, 'app', carpeta), { recursive: true })
    writeFileSync(join(salida, 'app', carpeta, 'del-cliente.txt'), carpeta)
  }
  for (let intento = 0; intento < 2; intento++) {
    const resultado = spawnSync(instalador, ['/S'], { timeout: 15_000 })
    assert.equal(readFileSync(registro, 'utf8'), salida, 'El descompresor dejó $OUTDIR apuntando a app-64.7z: Windows no puede escribir app-64.7z\\Uninstall Sloth.exe')
    assert.equal(resultado.status, 0, resultado.error?.message ?? 'El instalador debe terminar correctamente')
    assert.equal(readFileSync(join(salida, 'prueba.txt'), 'utf8'), 'Sloth')
    assert.deepEqual(readFileSync(join(salida, 'Sloth.exe')), readFileSync(join(payload, 'Sloth.exe')))
    assert.equal(readFileSync(join(salida, 'Uninstall Sloth.exe'), 'utf8'), 'Sloth')
    for (const video of videos) assert.equal(readFileSync(join(salida, video), 'utf8'), `Contenido de ${video}`)
    for (const carpeta of personales) assert.equal(readFileSync(join(salida, 'app', carpeta, 'del-cliente.txt'), 'utf8'), carpeta)
  }
})
