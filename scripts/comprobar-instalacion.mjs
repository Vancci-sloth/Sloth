// Solo en el Windows desechable de GitHub: instala el paquete real dos veces, comprueba los datos y lo desinstala.
// No se corre en la computadora del creador: el instalador usa las entradas de Sloth en el registro de Windows.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
  throw new Error('Esta prueba solo se ejecuta en un Windows desechable de GitHub, sin una Sloth del usuario.')
}
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const instalador = fileURLToPath(new URL(`../dist/instalador/Sloth-Setup-${version}.exe`, import.meta.url))
const contenido = fileURLToPath(new URL('../dist/instalador/win-unpacked/', import.meta.url))
const base = mkdtempSync(join(tmpdir(), 'sloth-instalacion-'))
const destino = join(base, 'Sloth')
const personales = ['data', 'trabajo', 'skills', 'ia', 'piezas', 'modulos']
function ejecutar(exe, args) {
  const r = spawnSync(exe, args, { timeout: 180_000, encoding: 'utf8' })
  assert.equal(r.status, 0, r.error?.message ?? `${exe}: ${r.stderr || r.stdout || r.status}`)
}
try {
  for (let intento = 0; intento < 2; intento++) {
    // /D debe ir al final; sin --force-run, la instalación silenciosa no abre la app.
    ejecutar(instalador, ['/S', '--updated', `/D=${destino}`])
    for (const archivo of ['Sloth.exe', 'Uninstall Sloth.exe', 'node/node.exe', 'app/server/index.mjs']) {
      assert.ok(existsSync(join(destino, archivo)), `No se instaló ${archivo}`)
    }
    for (const archivo of readdirSync(contenido, { recursive: true, withFileTypes: true }).filter((f) => f.isFile())) {
      const origen = join(archivo.parentPath, archivo.name)
      const instalado = join(destino, relative(contenido, origen))
      assert.equal(statSync(instalado).size, statSync(origen).size, `Falta contenido de ${instalado}`)
    }
    assert.equal(existsSync(join(destino, 'version-anterior.txt')), false, 'La actualización dejó archivos de la versión anterior')
    for (const carpeta of personales) {
      const dir = join(destino, 'app', carpeta)
      const archivo = join(dir, 'del-cliente.txt')
      if (intento) assert.equal(readFileSync(archivo, 'utf8'), carpeta, `La actualización borró ${carpeta}`)
      else {
        mkdirSync(dir, { recursive: true })
        writeFileSync(archivo, carpeta)
      }
    }
    writeFileSync(join(destino, 'version-anterior.txt'), 'Se debe reemplazar')
  }
  ejecutar(join(destino, 'Uninstall Sloth.exe'), ['/S'])
  console.log('El instalador real instala, actualiza, conserva los datos y se desinstala.')
} finally {
  // El desinstalador suelta la carpeta unos segundos después de salir (EPERM): se reintenta, y si sigue tomada se deja,
  // que el Windows de GitHub se tira al acabar. La prueba ya pasó o falló antes de aquí.
  try {
    rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 1000 })
  } catch (e) {
    console.warn(`No se pudo borrar ${base}: ${e.message}`)
  }
}
