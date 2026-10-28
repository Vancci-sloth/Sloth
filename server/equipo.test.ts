import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nombreProcesador } from './equipo.ts'

test('Tu equipo: el procesador sin marcas registradas ni frecuencia', () => {
  assert.equal(nombreProcesador('Intel(R) Core(TM) i5-4590 CPU @ 3.30GHz'), 'Intel Core i5-4590')
  assert.equal(nombreProcesador('Intel(R) Core(TM) 5 210H'), 'Intel Core 5 210H')
  assert.equal(nombreProcesador('AMD Ryzen 5 3600 6-Core Processor             '), 'AMD Ryzen 5 3600')
  assert.equal(nombreProcesador('Apple M1'), 'Apple M1')
})
