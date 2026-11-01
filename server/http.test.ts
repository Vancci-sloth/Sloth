import assert from 'node:assert/strict'
import type { IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { cuerpo } from './http.ts'

const peticion = (...trozos: Buffer[]) => Readable.from(trozos) as unknown as IncomingMessage

test('una letra con acento partida entre dos trozos se lee entera', async () => {
  const datos = Buffer.from('{"texto":"ñ"}')
  const corte = datos.indexOf(0xc3) + 1
  assert.deepEqual(await cuerpo(peticion(datos.subarray(0, corte), datos.subarray(corte))), { texto: 'ñ' })
})

test('sin cuerpo es un objeto vacío', async () => {
  assert.deepEqual(await cuerpo(peticion()), {})
})
