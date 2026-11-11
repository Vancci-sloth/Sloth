// La regresión de la CLI de modelos corre también en npm test y en CI, sin instalar paquetes de Python.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

test('modelos.py trae modelos sin Phosphor y conserva los iconos cuando se piden', () => {
  const python = ['python', 'python3'].find((p) => spawnSync(p, ['--version']).status === 0)
  assert.ok(python, 'Hace falta Python para probar la CLI de modelos 3D')
  const archivo = fileURLToPath(new URL('../skills/modelos-3d/scripts/modelos.test.py', import.meta.url))
  const r = spawnSync(python, ['-B', '-X', 'utf8', archivo], { encoding: 'utf8' })
  assert.equal(r.status, 0, `${r.error ?? ''}\n${r.stdout}\n${r.stderr}`)
})
