import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { cabezaDeFalta } from '../shared/revision.ts'
import type { ComentarioComunidad, EstiloRevisado, PublicacionComunidad } from '../shared/types.ts'
import { calidadEntero, comunidad, type Credencial, paraPreaprobar, revisadoDe } from './comunidad.ts'

/** Lo que pesa, en MB, un video de `segundos` con el tope de `calidadEntero` y su audio de 96 kbps. */
const pesa = (segundos: number) => ((calidadEntero(segundos).kbps + 96) * 1000 * segundos) / 8 / 1024 / 1024

test('el video entero de un estilo sale a 720 px mientras cabe holgado', () => {
  assert.deepEqual(calidadEntero(60), { lado: 720, kbps: 2500 })
  assert.deepEqual(calidadEntero(140), { lado: 720, kbps: 2500 })
  // Sin duración (no se pudo leer su cabecera), la calidad de siempre.
  assert.deepEqual(calidadEntero(undefined), { lado: 720, kbps: 2500 })
  assert.deepEqual(calidadEntero(0), { lado: 720, kbps: 2500 })
})

test('uno largo baja de bits y de tamaño para caber en lo que acepta el Worker', () => {
  assert.equal(calidadEntero(5 * 60).lado, 720)
  assert.equal(calidadEntero(10 * 60).lado, 480)
  assert.equal(calidadEntero(20 * 60).lado, 360)
  // Hasta 20 minutos, ninguno pasa de 45 MB: el Worker acepta videos de hasta 50.
  for (const s of [30, 145, 146, 300, 600, 1200]) assert.ok(pesa(s) <= 45, `${s} s pesa ${pesa(s).toFixed(1)} MB`)
})

test('al pre-aprobar, a su agente se le pide la prueba como la haría quien lo instala, lo que falló y que diga qué cambió', () => {
  const t = paraPreaprobar({ titulo: 'Recetas', autor: 'Ana', skill: 'recetas', ejemplo: 'Hazme un video del ciclo del agua.', falta: ['Un video entero hecho con él'], pide: ['Su paso 3 no dice qué hacer en `Mac`.'] })
  assert.match(t, /^Vamos a pre-aprobar «Recetas», un estilo que compartió Ana/)
  assert.match(t, /con el ejemplo de su guía: «Hazme un video del ciclo del agua\.»/)
  assert.match(t, /3\. Arregla también lo que le pidió la revisión:\n- Su paso 3 no dice qué hacer en Mac\./)
  assert.match(t, /Le falta esto para la comunidad[^\n]*\n- Un video entero hecho con él/)
  assert.match(t, /qué le cambiaste/)
  // Sin nada pedido ni nada que le falte, solo la prueba.
  const solo = paraPreaprobar({ titulo: 'Recetas', autor: '', skill: 'recetas', falta: [], pide: [] })
  assert.doesNotMatch(solo, /3\.|Le falta/)
  assert.match(solo, /que compartió alguien/)
})

const ana = { id: 'ana', nombre: 'Ana' }
const vancci = { id: 'vancci', nombre: 'Vancci', creador: true }
/** Un estilo en la comunidad: sin aprobar, salvo que se diga. */
const estilo = (id: string, nombre: string, mas: Partial<PublicacionComunidad> = {}): PublicacionComunidad => ({
  id,
  autor: ana,
  categoria: 'estilos',
  titulo: nombre,
  texto: 'Lo que hace.',
  adjuntos: [{ tipo: 'estilo', llave: 'a.estilo', url: '', nombre }],
  fijada: false,
  creada: '2026-11-20T10:00:00.000Z',
  actividad: '2026-11-20T10:00:00.000Z',
  likes: 0,
  megusta: false,
  comentarios: 0,
  comentaron: [],
  porAprobar: true,
  ...mas
})
const comentario = (id: string, creada: string, texto: string, autor: ComentarioComunidad['autor'] = vancci): ComentarioComunidad => ({ id, autor, texto, creada, likes: 0, megusta: false })
const leFalta = (titulo: string, ...cosas: string[]) => [cabezaDeFalta(titulo), cosas.map((c) => `- ${c}`).join('\n'), 'Arréglalo y pulsa «Compartir» otra vez en su card.'].join('\n\n')

test('a su autor se le dice lo que la revisión pidió de la versión que mandó, hasta que la vuelve a mandar o se aprueba', () => {
  const falta = comentario('c1', '2026-11-20T12:00:00.000Z', leFalta('Recetas', 'Falta el paso del render.', 'Su card no tiene «Revisión».'))
  // Aún nadie le contesta: sigue en revisión, sin nada que decirle.
  assert.equal(revisadoDe(estilo('p1', 'Recetas'), []), undefined)
  assert.deepEqual(revisadoDe(estilo('p1', 'Recetas'), [falta]), { comentario: 'c1', cuando: '2026-11-20T12:00:00.000Z', falta: ['Falta el paso del render.', 'Su card no tiene «Revisión».'], sugerencias: [] })
  // Lo volvió a compartir después: esa respuesta era de la versión de antes.
  assert.equal(revisadoDe(estilo('p1', 'Recetas', { editada: '2026-11-20T13:00:00.000Z' }), [falta]), undefined)
  // Y la revisión de la versión nueva vuelve a contar.
  const otra = comentario('c2', '2026-11-20T15:00:00.000Z', leFalta('Recetas', 'Ya solo falta el render.'))
  assert.deepEqual(revisadoDe(estilo('p1', 'Recetas', { editada: '2026-11-20T13:00:00.000Z' }), [falta, otra])?.falta, ['Ya solo falta el render.'])
  // Aprobado: nada.
  assert.equal(revisadoDe(estilo('p1', 'Recetas', { porAprobar: undefined }), [falta]), undefined)
})

test('cuenta lo último que dijo la revisión, no lo que comente cualquiera', () => {
  const falta = comentario('c1', '2026-11-20T12:00:00.000Z', leFalta('Recetas', 'Falta el paso del render.'))
  // Si después la revisión dice que cumple y lo aprueba el creador a mano, ya no le falta nada.
  const cumple = comentario('c2', '2026-11-20T14:00:00.000Z', 'Revisión automática de Sloth: «Recetas» cumple lo que necesita para estar en la tienda.')
  assert.equal(revisadoDe(estilo('p1', 'Recetas'), [falta, cumple]), undefined)
  // Que el creador o su autor comenten otra cosa no la borra.
  const charla = [comentario('c3', '2026-11-20T14:00:00.000Z', 'Cualquier duda, aquí estoy.'), comentario('c4', '2026-11-20T14:30:00.000Z', 'Gracias, ya lo arreglo.', ana)]
  assert.equal(revisadoDe(estilo('p1', 'Recetas'), [falta, ...charla])?.comentario, 'c1')
  // Y pegar esa frase en un comentario no hace de revisión: solo cuenta la del creador.
  assert.equal(revisadoDe(estilo('p1', 'Recetas'), [comentario('c5', '2026-11-20T12:00:00.000Z', leFalta('Recetas', 'Algo.'), ana)]), undefined)
})

/** La comunidad de esta computadora, con un Worker de mentira que contesta `rutas` (lo demás, 404). */
async function revisados(o: { credencial: Credencial; apuntadas: Record<string, string>; tuyas: { id: string; title: string }[]; rutas: Record<string, unknown> }) {
  const app = mkdtempSync(join(tmpdir(), 'sloth-comunidad-'))
  mkdirSync(join(app, 'data'))
  writeFileSync(join(app, 'data', 'estilos-compartidos.json'), JSON.stringify(o.apuntadas))
  const pedidas: string[] = []
  const fetchDeSiempre = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request) => {
    const ruta = new URL(String(url)).pathname
    pedidas.push(ruta)
    return ruta in o.rutas ? Response.json(o.rutas[ruta]) : Response.json({ error: 'Esa publicación ya no está.' }, { status: 404 })
  }) as typeof fetch
  try {
    const c = comunidad(app, { credencial: () => o.credencial, tuyas: () => o.tuyas } as never)
    let estado = 0
    let cuerpo = ''
    const res = { writeHead: (s: number) => void (estado = s), end: (t: string) => void (cuerpo = t) } as unknown as ServerResponse
    await c.api({ method: 'GET' } as IncomingMessage, res, new URL('http://sloth/api/comunidad/estilo/revisados'))
    return { estado, lista: JSON.parse(cuerpo) as EstiloRevisado[], pedidas, apuntadas: JSON.parse(readFileSync(join(app, 'data', 'estilos-compartidos.json'), 'utf8')) as Record<string, string> }
  } finally {
    globalThis.fetch = fetchDeSiempre
    rmSync(app, { recursive: true, force: true })
  }
}

test('tus estilos revisados y sin aprobar: los que compartiste desde aquí y los que el creador te comentó, cada uno con su card', async () => {
  const falta = (titulo: string, cuando: string) => comentario(`c-${titulo}`, cuando, leFalta(titulo, `A ${titulo} le falta el render.`))
  const r = await revisados({
    credencial: { clave: 'CLAVE', equipo: 'pc' },
    // «Recetas» se compartió desde aquí; «Datos» antes de que se apuntara dónde; «Viejo» ya no está en la comunidad.
    apuntadas: { recetas: 'p1', aprobado: 'p3', viejo: 'p9' },
    tuyas: [
      { id: 'recetas', title: 'Recetas' },
      { id: 'datos', title: 'Datos' },
      { id: 'aprobado', title: 'Aprobado' }
    ],
    rutas: {
      '/comunidad/avisos': {
        avisos: [
          { id: 'a1', tipo: 'comento', de: vancci, publicacion: 'p2', sobre: 'Datos', creado: '', leido: true },
          // Lo que comenta otro, o un me gusta, no trae una revisión.
          { id: 'a2', tipo: 'comento', de: ana, publicacion: 'p5', sobre: 'Otra', creado: '', leido: true },
          { id: 'a3', tipo: 'gusta', de: vancci, publicacion: 'p6', sobre: 'Otra', creado: '', leido: true }
        ]
      },
      '/comunidad/p/p1': { publicacion: estilo('p1', 'Recetas'), comentarios: [falta('Recetas', '2026-11-20T12:00:00.000Z')] },
      '/comunidad/p/p2': { publicacion: estilo('p2', 'Datos'), comentarios: [falta('Datos', '2026-11-21T12:00:00.000Z')] },
      '/comunidad/p/p3': { publicacion: estilo('p3', 'Aprobado', { porAprobar: undefined }), comentarios: [falta('Aprobado', '2026-11-20T12:00:00.000Z')] }
    }
  })
  assert.equal(r.estado, 200)
  // El más reciente primero, y cada uno con la card de esta computadora.
  assert.deepEqual(
    r.lista.map((e) => [e.cardId, e.titulo, e.publicacion, e.falta]),
    [
      ['datos', 'Datos', 'p2', ['A Datos le falta el render.']],
      ['recetas', 'Recetas', 'p1', ['A Recetas le falta el render.']]
    ]
  )
  assert.deepEqual(r.pedidas.filter((p) => p.startsWith('/comunidad/p/')).sort(), ['/comunidad/p/p1', '/comunidad/p/p2', '/comunidad/p/p3', '/comunidad/p/p9'])
  // El que se encontró por su nombre queda apuntado: su «Compartir» pone al día esa publicación.
  assert.equal(r.apuntadas.datos, 'p2')
})

test('sin su card en esta computadora se dice igual, y al creador no se le dice nada', async () => {
  const rutas = {
    '/comunidad/avisos': { avisos: [{ id: 'a1', tipo: 'comento', de: vancci, publicacion: 'p2', sobre: 'Datos', creado: '', leido: false }] },
    '/comunidad/p/p2': { publicacion: estilo('p2', 'Datos'), comentarios: [comentario('c1', '2026-11-21T12:00:00.000Z', leFalta('Datos', 'Falta el render.'))] }
  }
  const sinCard = await revisados({ credencial: { clave: 'CLAVE', equipo: 'pc' }, apuntadas: {}, tuyas: [], rutas })
  assert.deepEqual(sinCard.lista, [{ titulo: 'Datos', publicacion: 'p2', comentario: 'c1', cuando: '2026-11-21T12:00:00.000Z', falta: ['Falta el render.'], sugerencias: [] }])
  const creador = await revisados({ credencial: { llave: 'ADMIN' }, apuntadas: { datos: 'p2' }, tuyas: [{ id: 'datos', title: 'Datos' }], rutas })
  assert.deepEqual(creador.lista, [])
  assert.deepEqual(creador.pedidas, [])
})
