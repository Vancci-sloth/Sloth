import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { test } from 'node:test'
import { setTimeout as esperar } from 'node:timers/promises'
import { MODELO_RECORTE } from '../shared/estilos-imagen.ts'
import { flow } from './flow/index.ts'
import { registroDeImagen } from './flow/hilo-imagen.ts'
import { Sessions } from './sessions.ts'

test('el estudio lista solo imágenes terminadas y conserva su tipo al descargarlas', async () => {
  const app = await mkdtemp(join(tmpdir(), 'sloth-imagenes-'))
  const sesiones = new Sessions(join(app, 'hilos'), () => {}, () => {}, () => {}, () => {})
  try {
    const servicio = flow(app, {
      cuenta: () => null,
      enEdge: async () => { throw new Error('No debe abrir Google Flow') },
      abrirEnEdge: async () => {}
    })
    const base = '/api/flow/estudio'
    const pedir = async (ruta: string, cuerpo?: object, destino = servicio) => {
      const req = Object.assign(Readable.from(cuerpo ? [Buffer.from(JSON.stringify(cuerpo))] : []), { method: cuerpo ? 'POST' : 'GET', url: ruta })
      const partes: Buffer[] = []
      let status = 0
      let headers: Record<string, string> = {}
      const res = Object.assign(new Writable({
        write(trozo: Buffer, _encoding, done) { partes.push(trozo); done() }
      }), { writeHead(codigo: number, cabeceras: Record<string, string>) { status = codigo; headers = cabeceras } })
      assert.equal(await destino.api(req as unknown as IncomingMessage, res as unknown as ServerResponse, ruta.split('?')[0]), true)
      return { status, headers, cuerpo: Buffer.concat(partes) }
    }
    const ruta = join(app, 'data', 'imagenes')
    await mkdir(ruta, { recursive: true })
    const id = '1795276800000-abc123abc123'
    const imagen = { id, prompt: 'Un árbol', estilo: 'anime', modelo: 'Nano Banana 2.1', formato: '1:1', creada: 1795276800000 }
    await writeFile(join(ruta, `${id}.json`), JSON.stringify(imagen))
    assert.deepEqual(JSON.parse((await pedir(base)).cuerpo.toString()).imagenes, [])
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2WQAAAAASUVORK5CYII=', 'base64')
    await writeFile(join(ruta, `${id}.jpg`), png)
    await writeFile(join(ruta, `${id}.jpg.huella`), 'terminada')
    assert.deepEqual(JSON.parse((await pedir(base)).cuerpo.toString()).imagenes, [imagen])
    assert.deepEqual(JSON.parse((await pedir(`${base}?imagen=${id}`)).cuerpo.toString()).imagen, imagen)
    const salida = await pedir(`${base}/${id}`)
    assert.equal(salida.status, 200)
    assert.equal(salida.headers['Content-Type'], 'image/png')
    assert.deepEqual(salida.cuerpo, png)
    assert.equal((await pedir(`${base}/${id}/borrar`, {})).status, 200)
    assert.equal((await pedir(`${base}/${id}`)).status, 404)
    assert.equal(JSON.parse((await pedir(`${base}?imagen=${id}`)).cuerpo.toString()).imagen, null)
    assert.equal((await pedir(base, { ...imagen, estilo: '__proto__' })).status, 400)
    assert.equal((await pedir(base, imagen)).status, 409)

    let terminar!: () => void
    const fin = new Promise<void>((ok) => { terminar = ok })
    const prompts: string[] = []
    let referenciaRecibida: Buffer | undefined
    const preparado = 'Un árbol en una colina, ilustración anime al atardecer.'
    const zona = { x: 10, y: 10, ancho: 20, alto: 15 }
    const contorno = [{ x: 10, y: 10 }, { x: 30, y: 13 }, { x: 16, y: 25 }]
    const protegida = { ...zona, herramienta: 'conservar', contorno }
    const motor = flow(app, {
      cuenta: () => null,
      enEdge: async () => { throw new Error('ChatGPT no debe abrir Google Flow') },
      abrirEnEdge: async () => {}
    }, {
      registrar: registroDeImagen(sesiones, ruta),
      async preparar(modelo, prompt) {
        assert.equal(modelo, 'claude-sonnet')
        assert.match(prompt, /Dirección visual: Ilustración anime/)
        await fin
        return { texto: preparado }
      },
      async chatgpt(prompt, _formato, _carpeta, referencia) {
        prompts.push(prompt)
        if (referencia) referenciaRecibida = await readFile(referencia)
        return png
      },
      async quitarFondo(referencia, marcas) {
        assert.deepEqual(await readFile(referencia), png)
        assert.deepEqual(marcas, [protegida])
        return png
      }
    })
    // La misma API y galería, con los motores sustituidos para no gastar cuota.
    const crear = await pedir(base, { ...imagen, modelo: 'chatgpt', orquestador: 'claude-sonnet' }, motor)
    assert.equal(crear.status, 200)
    const pedido = JSON.parse(crear.cuerpo.toString())
    assert.equal(pedido.estado, 'preparando')
    assert.equal((await pedir(`${base}/${pedido.id}/borrar`, {}, motor)).status, 409)
    const siguiente = await pedir(base, { ...imagen, prompt: 'Una montaña', formato: '9:16', modelo: 'chatgpt' }, motor)
    assert.equal(siguiente.status, 200)
    const enCola = JSON.parse(siguiente.cuerpo.toString())
    assert.equal(enCola.estado, 'en-fila')
    assert.equal(enCola.formato, '9:16')
    const cancelable = JSON.parse((await pedir(base, { ...imagen, prompt: 'Cancelar esta imagen', modelo: 'chatgpt' }, motor)).cuerpo.toString())
    assert.equal((await pedir(`${base}/${cancelable.id}/borrar`, {}, motor)).status, 200)
    assert.deepEqual(prompts, [])
    terminar()
    let guardada: { id: string; modelo: string; promptPreparado?: string } | undefined
    for (let i = 0; i < 20 && !guardada; i++) {
      const estado = JSON.parse((await pedir(base, undefined, motor)).cuerpo.toString())
      assert.equal(estado.pedidos.find((p: { error?: string }) => p.error)?.error, undefined)
      if (estado.imagenes.some((imagen: { id: string }) => imagen.id === enCola.id))
        guardada = estado.imagenes.find((imagen: { id: string }) => imagen.id === pedido.id)
      if (!guardada) await esperar(20)
    }
    assert.equal(guardada?.modelo, 'chatgpt')
    assert.equal(guardada?.promptPreparado, preparado)
    assert.match(prompts[0], /ilustración anime al atardecer/)
    assert.match(prompts[1], /Una montaña/)
    assert.equal(prompts.length, 2)
    assert.match(prompts[0], /Instrucción original del usuario: Un árbol/)

    const cambio = { ...imagen, modelo: 'chatgpt', origen: pedido.id, prompt: 'Cambia la zona 1 a naranja.' }
    assert.equal((await pedir(base, { ...cambio, marcas: [{ x: 99, y: 10, ancho: 20, alto: 10 }] }, motor)).status, 400)
    assert.equal((await pedir(base, { ...cambio, marcas: [{ ...zona, herramienta: '__proto__' }] }, motor)).status, 400)
    assert.equal((await pedir(base, { ...cambio, marcas: [{ ...protegida, contorno: [{ x: 0, y: 0 }, ...contorno] }] }, motor)).status, 400)
    const respuestaEdicion = await pedir(base, { ...cambio, marcas: [zona, protegida, { ...zona, herramienta: 'quitar' }] }, motor)
    assert.equal(respuestaEdicion.status, 200)
    const idEdicion = JSON.parse(respuestaEdicion.cuerpo.toString()).id
    let version: { origen?: string } | undefined
    for (let i = 0; i < 20 && !version; i++) {
      const estado = JSON.parse((await pedir(base, undefined, motor)).cuerpo.toString())
      version = estado.imagenes.find((imagen: { id: string }) => imagen.id === idEdicion)
      if (!version) await esperar(20)
    }
    assert.equal(version?.origen, pedido.id)
    assert.match(prompts[2], /Zona 1:.*x=10%/)
    assert.match(prompts[2], /Zona 2: Contorno cerrado.*\(10,10\) \(30,13\) \(16,25\).*Mantén intacta/)
    assert.match(prompts[2], /Zona 3:.*Borra el objeto/)
    assert.deepEqual(referenciaRecibida, png)

    const recorte = { ...cambio, origen: idEdicion, modelo: MODELO_RECORTE }
    assert.equal((await pedir(base, { ...recorte, origen: undefined }, motor)).status, 400)
    assert.equal((await pedir(base, { ...recorte, marcas: [zona] }, motor)).status, 400)
    const respuestaRecorte = await pedir(base, { ...recorte, marcas: [protegida] }, motor)
    assert.equal(respuestaRecorte.status, 200)
    const recortada = JSON.parse(respuestaRecorte.cuerpo.toString())
    assert.equal(recortada.modelo, MODELO_RECORTE)
    let recortePng
    for (let i = 0; i < 20; i++) {
      recortePng = await pedir(`${base}/${recortada.id}`, undefined, motor)
      if (recortePng.status === 200) break
      await esperar(20)
    }
    assert.equal(recortePng?.headers['Content-Type'], 'image/png')
    assert.deepEqual(recortePng?.cuerpo, png)
    assert.equal(prompts.length, 3)
    const [hilo] = sesiones.list()
    assert.equal(sesiones.list().length, 1)
    assert.equal(hilo.imagenEstudio, pedido.id)
    assert.equal(hilo.title, 'Un árbol')
    const eventos = sesiones.get(hilo.id)?.events ?? []
    assert.deepEqual(eventos.filter((e) => e.t === 'user').map((e) => e.text), ['Un árbol', cambio.prompt, 'Quitar el fondo'])
    const respuestas = eventos.filter((e) => e.t === 'text').map((e) => e.delta)
    assert.match(respuestas[0], /El prompt/)
    assert.ok(respuestas[0].includes(preparado))
    assert.match(respuestas[1], /Imagen lista.*#\/imagenes\/editar\//)
    assert.ok(respuestas[2].includes(`#/imagenes/editar/${idEdicion}`))
    assert.ok(respuestas[3].includes(`#/imagenes/editar/${recortada.id}`))

    await mkdir(join(app, 'data', 'flow'), { recursive: true })
    await writeFile(join(app, 'data', 'flow', 'ajustes.json'), JSON.stringify({ calmaHasta: Date.now() + 60_000 }))
    const enPausa = flow(app, {
      cuenta: () => 'prueba@example.test',
      enEdge: async () => { throw new Error('No debe abrir Flow durante la pausa') },
      abrirEnEdge: async () => {}
    })
    assert.equal((await pedir(base, imagen, enPausa)).status, 429)
  } finally {
    sesiones.closeAll()
    await rm(app, { recursive: true, force: true })
  }
})

test('una imagen subida entra a la galería lista para editarla, con su formato y sin salir de data/attachments', async () => {
  const app = await mkdtemp(join(tmpdir(), 'sloth-subida-'))
  try {
    const servicio = flow(app, { cuenta: () => null, enEdge: async () => { throw new Error('No debe abrir Google Flow') }, abrirEnEdge: async () => {} })
    const pedir = async (ruta: string, cuerpo?: object) => {
      const req = Object.assign(Readable.from(cuerpo ? [Buffer.from(JSON.stringify(cuerpo))] : []), { method: cuerpo ? 'POST' : 'GET', url: ruta })
      const partes: Buffer[] = []
      let status = 0
      const res = Object.assign(new Writable({ write(trozo: Buffer, _encoding, done) { partes.push(trozo); done() } }), {
        writeHead(codigo: number) { status = codigo }
      })
      assert.equal(await servicio.api(req as unknown as IncomingMessage, res as unknown as ServerResponse, ruta.split('?')[0]), true)
      return { status, cuerpo: JSON.parse(Buffer.concat(partes).toString() || 'null') }
    }
    // Un PNG de 2×1: formato apaisado 2:1 no existe, así que se queda el más cercano (16:9).
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+7AAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64')
    const carpeta = join(app, 'data', 'attachments')
    await mkdir(carpeta, { recursive: true })
    await writeFile(join(carpeta, '1795276800000-foto.png'), png)
    const subida = await pedir('/api/flow/estudio/subir', { ruta: join(carpeta, '1795276800000-foto.png') })
    assert.equal(subida.status, 200)
    assert.equal(subida.cuerpo.modelo, 'subida')
    assert.equal(subida.cuerpo.formato, '16:9')
    const galeria = await pedir('/api/flow/estudio')
    assert.deepEqual(galeria.cuerpo.imagenes.map((i: { id: string }) => i.id), [subida.cuerpo.id])
    assert.deepEqual(await readFile(join(app, 'data', 'imagenes', `${subida.cuerpo.id}.jpg`)), png)
    // Fuera de la carpeta de adjuntos no se sube nada.
    await writeFile(join(app, 'secreto.png'), png)
    assert.equal((await pedir('/api/flow/estudio/subir', { ruta: join(app, 'secreto.png') })).status, 400)
    assert.equal((await pedir('/api/flow/estudio/subir', { ruta: join(carpeta, '..', '..', '..', 'secreto.png') })).status, 400)
  } finally {
    await rm(app, { recursive: true, force: true })
  }
})
