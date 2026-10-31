import assert from 'node:assert/strict'
import test from 'node:test'
import type { AvisoComunidad } from '../../shared/types.ts'
import { anuncioPorAvisar } from './avisos.ts'

const aviso = (id: string, creado: string, extra: Partial<AvisoComunidad> = {}): AvisoComunidad => ({
  id,
  tipo: 'anuncio',
  de: { id: 'creador', nombre: 'Vancci' },
  publicacion: `p-${id}`,
  sobre: 'NUEVA ACTUALIZACION',
  creado,
  leido: false,
  ...extra
})

test('de varios anuncios sin leer se avisa solo del más nuevo', () => {
  const lista = [aviso('b', '2026-10-30T10:00:00.000Z'), aviso('a', '2026-10-29T10:00:00.000Z')]
  assert.equal(anuncioPorAvisar(lista, '')?.id, 'b')
})

test('lo que no es anuncio no avisa, aunque sea lo más nuevo', () => {
  const lista = [aviso('c', '2026-10-30T10:00:00.000Z', { tipo: 'comento' }), aviso('a', '2026-10-29T10:00:00.000Z')]
  assert.equal(anuncioPorAvisar(lista, '')?.id, 'a')
})

test('un anuncio ya avisado o ya leído no vuelve a avisar', () => {
  const lista = [aviso('b', '2026-10-30T10:00:00.000Z', { leido: true }), aviso('a', '2026-10-29T10:00:00.000Z')]
  assert.equal(anuncioPorAvisar(lista, '2026-10-29T10:00:00.000Z'), undefined)
})
