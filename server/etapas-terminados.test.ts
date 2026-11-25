import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Card } from '../shared/types.ts'
import { terminados } from './etapas.ts'

const carpeta = () => {
  const d = mkdtempSync(join(tmpdir(), 'terminados-'))
  mkdirSync(join(d, 'out'))
  writeFileSync(join(d, 'out', 'final.mp4'), 'x')
  // Un MP4 de hace segundos aún se está escribiendo: este ya acabó.
  const antes = new Date(Date.now() - 60_000)
  utimesSync(join(d, 'out', 'final.mp4'), antes, antes)
  writeFileSync(join(d, 'guion.md'), 'x')
  return d
}
const card = (etapas: Card['etapas']) => ({ id: 'c', title: 'C', etapas }) as Card

test('los videos de la etapa «Video», como siempre', () => {
  const d = carpeta()
  try {
    const c = card([
      { nombre: 'Guion', listo: 'guion.md' },
      { nombre: 'Video', listo: 'out/*.mp4', muestra: 'out/*.mp4' }
    ])
    assert.deepEqual(terminados(c, d).map((a) => a.ruta), ['out/final.mp4'])
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test('un estilo propio sin etapa «Video» usa la última que muestra un MP4', () => {
  const d = carpeta()
  try {
    const c = card([
      { nombre: 'Guion', listo: 'guion.md' },
      { nombre: 'Render final', listo: 'out/*.mp4' }
    ])
    assert.deepEqual(terminados(c, d).map((a) => a.ruta), ['out/final.mp4'])
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test('sin MP4 hecho no hay video', () => {
  const d = mkdtempSync(join(tmpdir(), 'terminados-'))
  try {
    assert.deepEqual(terminados(card([{ nombre: 'Render', listo: 'out/*.mp4' }]), d), [])
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})
