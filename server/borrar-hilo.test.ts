import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { SessionMeta } from '../shared/types.ts'
import { carpetasDelHilo, moverProyectos, rutaReal } from './borrar-hilo.ts'

test('un chat borra sus versiones y conserva carpetas compartidas, elegidas y enlaces', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'sloth-borrado-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const hilo: SessionMeta = {
    id: 'original', cwd, cardId: 'video', model: 'codex:prueba', title: 'Video',
    createdAt: 1, updatedAt: 1, running: false, carpeta: 'elegida',
    carpetasGeneradas: ['proyecto', 'proyecto-v2', 'enlace', '../ajena']
  }
  for (const nombre of ['proyecto', 'proyecto-v2', 'elegida', 'ajena']) mkdirSync(join(cwd, nombre))
  symlinkSync(join(cwd, 'ajena'), join(cwd, 'enlace'), 'junction')
  const otro = { ...hilo, id: 'otro', carpeta: 'proyecto-v2', carpetasGeneradas: undefined }
  const rutas = carpetasDelHilo(hilo, [hilo, otro])
  const proyecto = join(rutaReal(cwd)!, 'proyecto')
  assert.deepEqual(rutas, [proyecto])
  const pruebaFallida = moverProyectos(rutas)
  assert.equal(existsSync(proyecto), false)
  pruebaFallida.restaurar()
  assert.equal(existsSync(proyecto), true)
  await moverProyectos(rutas).limpiar()
  assert.deepEqual(readdirSync(cwd).sort(), ['ajena', 'elegida', 'enlace', 'proyecto-v2'])
})
