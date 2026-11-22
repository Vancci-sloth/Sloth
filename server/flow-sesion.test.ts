import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Page } from 'playwright-core'
import { ir, SinEmpezar, URL_FLOW } from './flow/pagina.ts'

/** Sin el aviso de novedades de Flow encima. */
const sinNovedades = { locator: () => ({ first: () => ({ waitFor: async () => { throw new Error('no está') } }) }) }

test('si Google solo renueva la sesión, Flow espera a que vuelva y no la da por perdida', async () => {
  let url = 'https://accounts.google.com/ServiceLogin'
  let esperas = 0
  const page = {
    ...sinNovedades, goto: async () => {}, waitForLoadState: async () => {}, url: () => url,
    waitForURL: async () => { esperas++; url = URL_FLOW }
  } as unknown as Page
  await ir(page, URL_FLOW)
  assert.equal(esperas, 1)
})

test('si Google se queda en su página de cuentas, Flow dice que la sesión se perdió', async () => {
  const page = {
    ...sinNovedades, goto: async () => {}, waitForLoadState: async () => {},
    url: () => 'https://accounts.google.com/ServiceLogin',
    waitForURL: async () => { throw new Error('timeout') }
  } as unknown as Page
  await assert.rejects(ir(page, URL_FLOW), (e: unknown) => e instanceof SinEmpezar && e.sesion && e.message.includes('vuelve a conectarla'))
})
