import assert from 'node:assert/strict'
import test from 'node:test'
import { publica } from './enlaces.ts'

test('publica rechaza la propia computadora y la red de casa, también escritas como IPv6', async () => {
  for (const u of ['http://127.0.0.1/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://192.168.1.5/', 'http://10.0.0.1/', 'ftp://8.8.8.8/'])
    assert.equal(await publica(new URL(u)), false, u)
})

test('publica admite una IP de internet, también IPv6', async () => {
  for (const u of ['http://8.8.8.8/', 'http://[2001:4860:4860::8888]/']) assert.equal(await publica(new URL(u)), true, u)
})
