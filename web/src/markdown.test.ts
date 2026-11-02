import assert from 'node:assert/strict'
import test from 'node:test'
import { bloquesDeMarkdown, markdown } from './markdown.ts'

const TEXTOS = [
  '',
  'Hola',
  'Un párrafo\ncon dos líneas.\n\nOtro párrafo con **negritas**, `código` y [un enlace](https://ejemplo.com).',
  '# Título\n\n- uno\n- dos\n\n  sigue el dos\n\n- tres\n\n1. a\n2. b\n\n```ts\nconst x = 1\n\nconst y = 2\n```\n\nFin.',
  '| a | b |\n|---|---|\n| 1 | 2 |\n\n> cita\n>\n> larga\n\n---\n\nVer [la nota][1] y [otra][dos].\n\n[1]: https://uno.example\n[dos]: https://dos.example',
  'HTML que no pasa: <img src=x onerror=alert(1)> y <b>sí</b>\n\n<div>bloque</div>\n\n[mal](javascript:alert(1)) ![img](https://x.example/a.png)',
  'Se está escribiendo: ```\ncódigo sin cerrar\n\nmás',
  'Lista suelta:\n\n- a\n\n- b\n\n    código con sangría\n\nY sigue.\n\n\n\nCon líneas de más.'
]

test('Markdown: los bloques juntos son el mismo HTML que el texto entero', () => {
  for (const t of TEXTOS) assert.equal(bloquesDeMarkdown(t).join(''), markdown(t), t)
})

test('Markdown: mientras el texto crece, solo cambia el último bloque', () => {
  const antes = bloquesDeMarkdown('Uno.\n\nDos.\n\nTre')
  const despues = bloquesDeMarkdown('Uno.\n\nDos.\n\nTres y más')
  assert.deepEqual(despues.slice(0, -1), antes.slice(0, -1))
  assert.notEqual(despues.at(-1), antes.at(-1))
})

test('Markdown: una imagen del disco se pide al servidor del hilo; sin hilo, queda su texto', () => {
  const pedir = (ruta: string) => `/api/sessions/s/imagen?ruta=${encodeURIComponent(ruta)}`
  const [windows] = bloquesDeMarkdown('![Perro](C:\\v\\perro.jpg)', pedir)
  assert.match(windows, /<img src="\/api\/sessions\/s\/imagen\?ruta=C%3A%5Cv%5Cperro\.jpg" alt="Perro">/)
  assert.match(bloquesDeMarkdown('![Perro](file:///C:/v/mi%20perro.jpg)', pedir)[0], /ruta=C%3A%2Fv%2Fmi%20perro\.jpg"/)
  assert.match(bloquesDeMarkdown('![Perro](/Users/ana/perro.png)', pedir)[0], /ruta=%2FUsers%2Fana%2Fperro\.png"/)
  assert.equal(markdown('![Perro](C:\\v\\perro.jpg)'), '<p>Perro</p>\n')
  assert.match(bloquesDeMarkdown('![web](https://x.example/a.png)', pedir)[0], /src="https:\/\/x\.example\/a\.png"/)
})
