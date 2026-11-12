import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { modelos3d } from './modelos3d.ts'

/** Pide la lista y da los ids que trae. */
async function ids(api: ReturnType<typeof modelos3d>['api']) {
  let cuerpo = ''
  const res = { writeHead: () => res, end: (t: string) => (cuerpo = t) } as unknown as ServerResponse
  await api({} as IncomingMessage, res, new URL('http://x/api/modelos3d'))
  return (JSON.parse(cuerpo) as { modelos: { id: string }[] }).modelos.map((m) => m.id).sort()
}

const ficha = (nombre: string) => JSON.stringify({ nombre, descripcion: '', etiquetas: [], exporta: [], usa: [] })

test('la lista se guarda armada y se vuelve a armar cuando cambia la biblioteca', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'modelos3d-'))
  let cerrar = () => {}
  try {
    mkdirSync(join(raiz, 'modelos', 'caja'), { recursive: true })
    writeFileSync(join(raiz, 'modelos', 'caja', 'modelo.json'), ficha('Caja'))
    const biblioteca = modelos3d(raiz)
    const { api } = biblioteca
    cerrar = biblioteca.cerrar
    assert.deepEqual(await ids(api), ['caja'])
    mkdirSync(join(raiz, 'modelos', 'reloj'))
    writeFileSync(join(raiz, 'modelos', 'reloj', 'modelo.json'), ficha('Reloj'))
    // El aviso de la carpeta llega un momento después.
    let vistos: string[] = []
    for (let i = 0; i < 40 && vistos.length < 2; i++) {
      await new Promise((ok) => setTimeout(ok, 50))
      vistos = await ids(api)
    }
    assert.deepEqual(vistos, ['caja', 'reloj'])
  } finally {
    cerrar()
    rmSync(raiz, { recursive: true, force: true })
  }
})

test('el visor solo da archivos de su carpeta: ni carpetas ni lo de fuera', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'modelos3d-'))
  try {
    mkdirSync(join(raiz, 'visor', 'js'), { recursive: true })
    writeFileSync(join(raiz, 'visor', 'index.html'), '<!doctype html>')
    writeFileSync(join(raiz, 'secreto.txt'), 'no')
    const { api } = modelos3d(raiz)
    const pide = async (ruta: string) => {
      let estado = 0
      const res = { writeHead: (s: number) => ((estado = s), res), end: () => res, setHeader: () => res, on: () => res, once: () => res, emit: () => true, write: () => true } as unknown as ServerResponse
      await api({ headers: {} } as IncomingMessage, res, new URL(`http://x${ruta}`))
      return estado
    }
    assert.equal(await pide('/api/modelos3d/visor/js'), 404)
    assert.equal(await pide('/api/modelos3d/visor/'), 404)
    assert.equal(await pide('/api/modelos3d/visor/..%2Fsecreto.txt'), 404)
    assert.equal(await pide('/api/modelos3d/visor/no-esta.js'), 404)
    assert.equal(await pide('/api/modelos3d/visor/%E0%A4%A'), 404)
    assert.equal(await pide('/api/modelos3d/visor/%00'), 404)
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
})
