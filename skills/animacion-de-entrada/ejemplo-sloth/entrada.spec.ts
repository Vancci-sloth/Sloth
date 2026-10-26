import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type ElectronApplication } from '@playwright/test'
import { launchApp } from './launch'

let root: string
const running: ElectronApplication[] = []

test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'youtube-e2e-entrada-'))
})

test.afterEach(async () => {
  for (const app of running.splice(0)) await app.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
})

test('la app entra con el perezoso, que se convierte en el logo y se va solo', async () => {
  const { app, window } = await launchApp({ userData: join(root, 'ajustes'), suggested: join(root, 'datos') })
  running.push(app)

  const splash = window.locator('#splash')
  await expect(splash).toBeAttached()
  await window.screenshot({ path: test.info().outputPath('dibujandose.png') })
  // Suena mientras se dibuja (la ventana de los tests está silenciada, pero Chromium sabe que suena).
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.isCurrentlyAudible())).toBe(true)
  await expect(splash).not.toBeAttached({ timeout: 6_000 })
  await expect(window.getByRole('button', { name: 'Usar esta carpeta' })).toBeVisible()
})

test('un clic durante la entrada llega a la app, que está debajo, y se salta la entrada', async () => {
  const { app, window } = await launchApp({ userData: join(root, 'ajustes'), suggested: join(root, 'datos') })
  running.push(app)

  const splash = window.locator('#splash')
  await expect(splash).toBeAttached()
  await window.getByRole('button', { name: 'Usar esta carpeta' }).click()
  await expect(window.getByRole('heading', { name: 'Empieza con tu Canal' })).toBeVisible()
  await expect(splash).not.toBeAttached({ timeout: 1_500 })
})

test('una tecla se salta la entrada', async () => {
  const { app, window } = await launchApp({ userData: join(root, 'ajustes'), suggested: join(root, 'datos') })
  running.push(app)

  const splash = window.locator('#splash')
  await expect(splash).toBeAttached()
  await window.keyboard.press('Escape')
  await expect(splash).not.toBeAttached({ timeout: 1_500 })
})
