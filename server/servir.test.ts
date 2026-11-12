import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, get } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { servir } from './etapas.ts'

// En Windows, una carpeta con un archivo abierto no se deja renombrar: así se ve si `servir` lo dejó abierto.
test('servir cierra el archivo si el navegador corta a medias', { skip: process.platform !== 'win32' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'servir-'))
  const carpeta = join(dir, 'visor')
  mkdirSync(carpeta)
  const archivo = join(carpeta, 'grande.bin')
  writeFileSync(archivo, Buffer.alloc(32 * 1024 * 1024))
  const servidor = createServer((req, res) => servir(req, res, archivo))
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
  try {
    const { port } = servidor.address() as AddressInfo
    // Se pide entero y se corta con el primer trozo (como al saltar en un video).
    await new Promise<void>((ok, mal) => {
      const pedido = get({ host: '127.0.0.1', port, path: '/' }, (r) => r.once('data', () => (pedido.destroy(), ok())))
      pedido.on('error', mal)
    })
    let movido = false
    for (let i = 0; i < 40 && !movido; i++) {
      await new Promise((ok) => setTimeout(ok, 50))
      try {
        renameSync(carpeta, `${carpeta}.movida`)
        movido = true
      } catch {
        // Aún abierto.
      }
    }
    assert.ok(movido, 'el archivo se quedó abierto')
  } finally {
    servidor.closeAllConnections()
    servidor.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
