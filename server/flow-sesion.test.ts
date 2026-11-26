import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Page } from 'playwright-core'
import { ir, SinEmpezar, URL_FLOW } from './flow/pagina.ts'

test('Flow permite la renovación automática sin declarar sesión perdida', async () => {
  let url = 'https://accounts.google.com/ServiceLogin'
  let esperas = 0
  const page = {
    goto: async () => {}, waitForLoadState: async () => {}, url: () => url,
    waitForURL: async () => { esperas++; url = URL_FLOW }
  } as unknown as Page
  await ir(page, URL_FLOW)
  assert.equal(esperas, 1)
})

test('Flow pide revisar el perfil existente si Google mantiene el inicio de sesión', async () => {
  const page = {
    goto: async () => {}, waitForLoadState: async () => {},
    url: () => 'https://accounts.google.com/ServiceLogin',
    waitForURL: async () => { throw new Error('timeout') }
  } as unknown as Page
  await assert.rejects(ir(page, URL_FLOW), (e: unknown) => e instanceof SinEmpezar && e.sesion && e.message.includes('Revisar sesión'))
})
