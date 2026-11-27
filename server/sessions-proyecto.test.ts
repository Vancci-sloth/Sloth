import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { SessionMeta } from '../shared/types.ts'
import { Sessions } from './sessions.ts'

test('un hilo entra y sale de su carpeta de «Proyectos», se avisa a la interfaz y no cambia su fecha', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sloth-proyecto-'))
  const avisados: SessionMeta[] = []
  const sesiones = new Sessions(dir, () => {}, (s) => avisados.push({ ...s }), () => {}, () => {}, () => ({ send() {}, steer() {}, async interrupt() {}, close() {} }))
  try {
    const meta = sesiones.create({ cardId: 'prueba', cwd: dir, title: 'Prueba', model: 'claude-prueba' })
    const antes = meta.updatedAt
    sesiones.aProyecto(meta.id, 'Canal de cocina')
    assert.equal(avisados.at(-1)?.proyecto, 'Canal de cocina')
    assert.equal(sesiones.meta(meta.id)?.updatedAt, antes)
    sesiones.aProyecto(meta.id, '')
    assert.equal(avisados.at(-1)?.proyecto, undefined)
    // Se guarda en disco aparte del resto del hilo (sin esperar): al volver a abrir Sloth sigue en su carpeta.
    sesiones.aProyecto(meta.id, 'Frutinovela')
    await new Promise((listo) => setTimeout(listo, 50))
    assert.equal(JSON.parse(readFileSync(join(dir, `${meta.id}.json`), 'utf8')).proyecto, 'Frutinovela')
  } finally {
    sesiones.closeAll()
    rmSync(dir, { recursive: true, force: true })
  }
})
