import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { Card } from '../shared/types.ts'
import { aApagar } from './claude.ts'

test('sinHerramientas: se apagan los servidores quitados enteros, con el nombre que les da el usuario, no los de una herramienta suelta', () => {
  const estado = [
    { name: 'openseo', status: 'connected' },
    { name: 'claude.ai Claude Docs', status: 'connected' },
    { name: 'plugin:mercadopago:mcp', status: 'connected' },
    { name: '21st', status: 'connected' },
    { name: 'pinterest', status: 'disabled' },
    { name: 'navegador', status: 'connected' }
  ] as const
  const quitar = ['mcp__openseo', 'mcp__claude_ai_Claude_Docs', 'mcp__plugin_mercadopago_mcp', 'mcp__pinterest', 'mcp__21st__bookmark', 'NotebookEdit']
  assert.deepEqual(aApagar(quitar, [...estado]), ['openseo', 'claude.ai Claude Docs', 'plugin:mercadopago:mcp'])
  assert.deepEqual(aApagar(undefined, [...estado]), [])
})

test('sinHerramientas de cada card: nombres de herramientas o servidores, sin repetir', () => {
  const cards: Card[] = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'cards.json'), 'utf8'))
  for (const c of cards.filter((c) => c.sinHerramientas)) {
    assert.equal(new Set(c.sinHerramientas).size, c.sinHerramientas!.length, `${c.id}: repite herramientas`)
    for (const h of c.sinHerramientas!) assert.match(h, /^(mcp__[\w-]+(__[\w-]+)?|[A-Z]\w+)$/, `${c.id}: «${h}» no es una herramienta ni un servidor`)
  }
})
