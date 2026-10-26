import assert from 'node:assert/strict'
import test from 'node:test'
import { leerEntrega, textosDeEntrega } from './youtube-entrega.ts'

test('no confunde ajustes de rótulos ni listas de revisión con la entrega editorial posterior', () => {
  const r = leerEntrega('- **Título:** ' + 'El montaje y sus letras '.repeat(8) + '\n- **Miniatura:** sale de la misma página con otra cámara.\n\n## Revisión\n1. **Contraste de valor:** detalles.\n\n## Entrega\n- **Título de YouTube (el del encargo):** «Dame 30 minutos y convierto a Claude Code en tu editor de video».\n- **Primera línea de la descripción:** «Los primeros segundos los hizo una skill,\n  sin editor».\n- **Miniatura:** `portadas/youtube.png`. A la izquierda la línea de tiempo,\n  a la derecha la fábrica.')
  assert.equal(r.titulo, 'Dame 30 minutos y convierto a Claude Code en tu editor de video')
  assert.ok(r.miniatura.includes('A la izquierda'))
  assert.ok(r.descripcion.includes('sin editor'))
  assert.deepEqual(r.alternativas, [])
})

test('lee secciones Markdown completas y sus alternativas editoriales', () => {
  const r = leerEntrega('## Título\n**Una app hecha con Claude**\n\n## Alternativas\n1. **Claude hizo mi editor**\n2. **Probé automatizar mis videos**\n\n## Miniatura\nUna línea de tiempo tachada.\nTexto: 30 MIN\n\n## Descripción\nUna prueba real.')
  assert.equal(r.titulo, 'Una app hecha con Claude')
  assert.equal(r.alternativas.length, 2)
  assert.ok(r.miniatura.includes('Texto: 30 MIN'))
})

test('recupera el título de YouTube y el concepto en viñetas de un informe', () => {
  const r = leerEntrega('- **Título de YouTube (el del encargo):** «Dame 30 minutos y convierto a Claude Code en tu editor de video».\n- **Miniatura:** `portadas/youtube.png`. Una fábrica junto a una línea de tiempo tachada.\n- **TikTok y Shorts:** no aplica.')
  assert.equal(r.titulo, 'Dame 30 minutos y convierto a Claude Code en tu editor de video')
  assert.ok(r.miniatura.includes('Una fábrica'))
  assert.ok(!r.miniatura.includes('TikTok y Shorts'))
})

test('recupera la recomendación explícita del chat sin leer usuarios ni subagentes', () => {
  const textos = textosDeEntrega([{ t: 'user', text: 'Título: Mi instrucción', at: 0 }, { t: 'text', id: 'a', delta: 'Título recomendado: ' }, { t: 'text', id: 'a', delta: '**Probé el Photoshop hecho con IA**\n\nMiniatura: PSD roto y la copia al lado.' }, { t: 'text', id: 'b', delta: 'Título: Revisión interna', parent: 'subagente' }])
  assert.equal(textos.length, 1)
  const r = leerEntrega(textos[0])
  assert.equal(r.titulo, 'Probé el Photoshop hecho con IA')
  assert.ok(r.miniatura.includes('PSD roto'))
  assert.equal(leerEntrega('**Título recomendado**: «Una prueba real»\n\n**Miniatura**: PSD roto.').titulo, 'Una prueba real')
})
