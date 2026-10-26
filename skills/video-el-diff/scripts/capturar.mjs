// Saca una lista entera de capturas a la vez, en varios Edge sin ventana, sin un agente de por medio. Cada una es lo
// mismo que `pagina.mjs` (el texto dentro del PNG, la copia .mhtml, el recorte por frase), y la que sale mal para el
// celular se vuelve a sacar sola desde su copia: la frase en tira, con lo de alrededor (`--contexto`; más angosta
// seguía en tira); la de letra chica, más angosta, salvo un post de X, que por debajo de 380 px encima los números de
// la barra de likes.
//
//   node <skill>/scripts/capturar.mjs <lista.json> [--edges 6] [--hoja revision/capturas.png]
//
// lista.json, en la raíz del episodio: [{ "url": "...", "png": "fuentes/material/web/<nombre>.png", "frase": "texto
// exacto" (o una lista), "elemento", "ancho", "alto", "escala", "tema" }]. Sin `ancho`: 380 un post de X y 400 lo demás,
// con `escala` 3 (Capturas para el celular, en MATERIAL.md).
//
// Al terminar imprime una línea por PNG (bien, con aviso o con error), deja `<lista>.resultado.json` y, con `--hoja`,
// una hoja de contacto a 360 px de ancho por captura, el tamaño de un celular. El 19 de octubre, tres agentes de
// captura tardaron 12 minutos en 54 capturas; 12 páginas a la vez tardan unos 40 s.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { abrir, capturarEn } from './pagina.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opcion = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const archivo = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))
if (!archivo) {
  console.error('Uso: node capturar.mjs <lista.json> [--edges 6] [--hoja revision/capturas.png]')
  process.exit(1)
}
const lista = JSON.parse(readFileSync(archivo, 'utf8'))
const EDGES = Math.max(1, Math.min(Number(opcion('--edges', 6)), lista.length))
// Una página que no termina en 2 minutos no va a terminar: se da por fallida y ese Edge se cambia por otro.
const TOPE = 120000
// Más angosta, la letra sale más grande y el texto baja en más renglones (Capturas para el celular).
const ANGOSTA = { ancho: 300, escala: 3.6 }

const conAviso = (r) => (typeof r === 'string' ? /: (chica|en tira)/.test(r) : !!r.aviso)
const pngDe = (r) => (typeof r === 'string' ? r.split(' · ')[0] : r.png)
// Sin una palabra: la página no cargó (un post borrado, un muro de login) o es solo una imagen. Más angosta no se arregla.
const vacia = (r) => typeof r === 'string' && / · 0 palabras /.test(r)
const esX = (url) => /(?:x|twitter)\.com\/[^/]+\/status\//.test(url)

function opcionesDe(p) {
  const { url, png, ...o } = p
  return { ancho: esX(url) ? 380 : 400, escala: 3, ...o }
}

/** Cómo se rehace una captura con aviso, o null si no tiene arreglo (lo dice el aviso de pagina.mjs). */
function arreglo(r, url) {
  const aviso = typeof r === 'string' ? r : r.aviso ?? ''
  if (/en tira.*--contexto/.test(aviso)) return { contexto: true, como: 'con lo de alrededor' }
  if (/chica/.test(aviso) && !esX(url)) return { ...ANGOSTA, como: 'más angosta' }
  return null
}

const conTope = (promesa, que) =>
  Promise.race([promesa, new Promise((_, mal) => setTimeout(() => mal(new Error(`${que}: más de ${TOPE / 1000} s`)), TOPE).unref())])

const resultados = []
let sinEdge = null
async function trabajador(cola) {
  // Si Edge no arranca, lo de la cola queda para los otros o, al final, como error de cada página.
  const nuevo = () => abrir().catch((e) => ((sinEdge = e.message.split('\n')[0]), null))
  let c = await nuevo()
  try {
    for (let p; c && (p = cola.shift()); ) {
      const t0 = Date.now()
      try {
        const o = opcionesDe(p)
        let { salidas, avisos, copia } = await conTope(capturarEn(c, p.url, p.png, o), p.url)
        // Las que no se leen en un celular, otra vez desde la copia: sin red, unos 2 s cada una. Si falla, queda la de antes.
        const rehechas = []
        for (const [i, r] of salidas.entries()) {
          const a = !r.error && !vacia(r) && conAviso(r) && arreglo(r, p.url)
          if (!a) continue
          const { como, ...cambio } = a
          try {
            const otra = await conTope(capturarEn(c, copia, pngDe(r), { ...o, ...cambio, frase: r.frase === undefined ? undefined : [r.frase] }), copia)
            if (otra.salidas[0]?.error) throw new Error(otra.salidas[0].error)
            salidas[i] = otra.salidas[0]
            rehechas.push({ png: pngDe(r), como })
          } catch (e) {
            avisos.push(`no se pudo rehacer ${relative(process.cwd(), pngDe(r))} ${como}: ${e.message.split('\n')[0]}`)
          }
        }
        resultados.push({ url: p.url, salidas, avisos, rehechas, segundos: Math.round((Date.now() - t0) / 100) / 10 })
      } catch (e) {
        resultados.push({ url: p.url, error: e.message.split('\n')[0], segundos: Math.round((Date.now() - t0) / 100) / 10 })
        // Un Edge que se colgó o se cerró no sirve para la siguiente.
        await c.cerrar().catch(() => {})
        c = await nuevo()
      }
    }
  } finally {
    await c?.cerrar().catch(() => {})
  }
}

const t0 = Date.now()
const cola = [...lista]
await Promise.all(Array.from({ length: EDGES }, () => trabajador(cola)))
for (const p of cola) resultados.push({ url: p.url, error: `Edge no arrancó: ${sinEdge}`, segundos: 0 })

const lineas = []
const pngs = []
for (const r of resultados) {
  if (r.error) {
    lineas.push(`ERROR  ${r.url}: ${r.error}`)
    continue
  }
  for (const s of r.salidas) {
    const png = relative(process.cwd(), pngDe(s))
    const como = r.rehechas.find((h) => h.png === pngDe(s))?.como
    const rehecha = como ? ` (rehecha ${como})` : ''
    if (s.error) lineas.push(`FALTA  ${png}: «${s.frase}» no está en la página (${r.url})`)
    else if (vacia(s)) lineas.push(`VACÍA  ${png}: no trae texto; la página no cargó o es solo una imagen (${r.url})`)
    else {
      pngs.push(pngDe(s))
      const que = typeof s === 'string' ? s.split(' · ').slice(1).join(' · ') : `${s.px.join('x')} · letra ${s.letra_1080} px a 1080 · ${s.veces} vez/veces${s.aviso ? ' · ' + s.aviso : ''}`
      lineas.push(`${conAviso(s) ? 'AVISO ' : 'bien  '} ${png}${rehecha} · ${que}`)
    }
  }
  for (const a of r.avisos) lineas.push(`AVISO  ${r.url}: ${a}`)
}
writeFileSync(archivo.replace(/\.json$/i, '') + '.resultado.json', JSON.stringify(resultados, null, 1))
console.log(lineas.join('\n'))
console.log(`\n${pngs.length} capturas de ${lista.length} páginas en ${Math.round((Date.now() - t0) / 1000)} s, con ${EDGES} Edge a la vez.`)

const hoja = opcion('--hoja')
if (hoja && pngs.length) {
  execFileSync('python', ['-X', 'utf8', join(AQUI, 'hoja_capturas.py'), resolve(hoja), ...pngs], { stdio: 'inherit' })
}
