import assert from 'node:assert/strict'
import test from 'node:test'
import { ventanasCodex } from './limites-codex.ts'

test('Codex conserva el porcentaje usado y convierte segundos a fecha ISO', () => {
  const r = ventanasCodex({ rateLimits: { primary: { usedPercent: 76, windowDurationMins: 300, resetsAt: 1730947200 }, secondary: { usedPercent: 19, windowDurationMins: 10080 } } })
  assert.deepEqual(r.ventanas, [
    { nombre: 'Sesión de 5 horas', uso: 76, reinicia: '2024-11-07T02:40:00.000Z' },
    { nombre: 'Semana', uso: 19, reinicia: undefined },
  ])
})

test('las duraciones reales prevalecen sobre primary y secondary, incluso en planes mensuales', () => {
  const r = ventanasCodex({ rateLimits: { primary: { usedPercent: 10, windowDurationMins: 43200 }, secondary: { usedPercent: 20, windowDurationMins: 15 } } })
  assert.deepEqual(r.ventanas.map(v => v.nombre), ['Mes', 'Sesión de 15 minutos'])
})

test('las cuotas por modelo se conservan sin duplicar la vista heredada', () => {
  const r = ventanasCodex({
    rateLimits: { primary: { usedPercent: 99 } },
    rateLimitsByLimitId: {
      codex: { primary: { usedPercent: 50 } },
      spark: { limitName: 'Spark', secondary: { usedPercent: 30, windowDurationMins: 10080 } },
    },
  })
  assert.deepEqual(r.ventanas.map(v => [v.nombre, v.uso]), [['Sesión', 50], ['Semana · Spark', 30]])
})

test('no inventa límites ausentes ni fechas inválidas, y acota porcentajes', () => {
  assert.deepEqual(ventanasCodex({}), { ventanas: [] })
  assert.deepEqual(ventanasCodex({ rateLimits: { primary: { usedPercent: NaN } } }), { ventanas: [] })
  const r = ventanasCodex({ rateLimitsByLimitId: {}, rateLimits: { primary: { usedPercent: -3, resetsAt: Infinity }, secondary: { usedPercent: 102, resetsAt: -1 } } })
  assert.deepEqual(r.ventanas.map(v => [v.uso, v.reinicia]), [[0, undefined], [100, undefined]])
})
