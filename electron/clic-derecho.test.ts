import assert from 'node:assert/strict'
import test from 'node:test'
import type { ContextMenuParams } from 'electron'
import { opcionesClicDerecho } from './clic-derecho.ts'

const puede = { canUndo: false, canRedo: false, canCut: false, canCopy: false, canPaste: false, canDelete: false, canSelectAll: false, canEditRichly: false }

function menu(p: Partial<Pick<ContextMenuParams, 'isEditable' | 'selectionText'>> & { editFlags?: Partial<typeof puede> }) {
  const hecho: string[] = []
  const wc = { cut: () => hecho.push('cut'), copy: () => hecho.push('copy'), paste: () => hecho.push('paste'), selectAll: () => hecho.push('selectAll') }
  const opciones = opcionesClicDerecho(wc, { isEditable: false, selectionText: '', ...p, editFlags: { ...puede, ...p.editFlags } })
  return { opciones, hecho }
}

test('un campo vacío deja pegar lo copiado con el ratón', () => {
  const { opciones, hecho } = menu({ isEditable: true, editFlags: { canPaste: true, canSelectAll: true } })
  assert.deepEqual(opciones.map((o) => o.label ?? '—'), ['Cortar', 'Copiar', 'Pegar', '—', 'Seleccionar todo'])
  assert.deepEqual(opciones.filter((o) => o.enabled).map((o) => o.label), ['Pegar', 'Seleccionar todo'])
  const pegar = opciones.find((o) => o.label === 'Pegar')!
  ;(pegar.click as () => void)()
  assert.deepEqual(hecho, ['paste'])
})

test('un texto seleccionado fuera de un campo solo se copia', () => {
  const { opciones, hecho } = menu({ selectionText: 'lo que dijo el agente', editFlags: { canCopy: true } })
  assert.deepEqual(opciones.map((o) => o.label), ['Copiar'])
  ;(opciones[0].click as () => void)()
  assert.deepEqual(hecho, ['copy'])
})

test('donde no hay nada que hacer no sale menú', () => {
  assert.deepEqual(menu({}).opciones, [])
  assert.deepEqual(menu({ selectionText: '  \n' }).opciones, [])
})
