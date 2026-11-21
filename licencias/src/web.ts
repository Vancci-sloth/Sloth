/**
 * Sloth en la web (ADR 0025): la entrada fija a la Sloth de cada computadora desde otro navegador. La Sloth de la
 * computadora abre un túnel rápido de Cloudflare (`server/web.ts`), cuya dirección cambia cada vez, y la deja aquí con
 * la llave que solo ella tiene. Aquí no se entra a ninguna Sloth: solo se dice adónde ir. Quien entra lo decide la
 * computadora: cada dispositivo tiene una llave ECDSA que crea esta página en su navegador y que no se puede sacar de él
 * (WebCrypto, no exportable, en IndexedDB), y firma con ella un reto de un solo uso de la computadora, atado al host de su
 * túnel. La firma no sirve en otro túnel ni dos veces; la llave nunca pasa por aquí.
 *
 * La página vive en su propio dominio, `web.sloth.vancci.org` (`ENTRADA`, el mismo Worker): ninguna otra página del
 * cobro comparte su origen, así que nada de ellas puede usar esas llaves. En `api.sloth.vancci.org/web` redirige allá.
 *
 * - `GET /` (y `/web`) y `GET /<equipo>`: la página de entrada (`pagina`). Con `#c=<código>`, conecta este navegador.
 * - `PUT /web/<equipo>` `{llave, url, nombre}`: la dirección de ahora (o `null`, apagada). La primera vez guarda el
 *   resumen de la llave; después, solo con ella se cambia.
 * - `GET /web/<equipo>/donde`: la dirección de ahora, su nombre y cuándo se dijo.
 * - `POST /web/<equipo>/codigo` `{llave, corto, vence}`: un código corto para conectar un dispositivo escribiéndolo.
 * - `POST /web/codigo` `{corto}`: de qué computadora es ese código (y se borra: es de un solo uso).
 *
 * En D1, `web_equipos` y `web_codigos` (migración 0036). Cuesta poco: una petición al abrir el túnel, otra por hora, y
 * dos cada vez que alguien entra; lo demás va directo del navegador a la computadora, sin pasar por el Worker.
 */
import { CODIGO_CORTO, ENTRADA, ID_EQUIPO, LARGO_CODIGO, limpiarCodigo, SECRETO, TUNEL } from '../../shared/web.ts'
import { conexion, cuerpo, cupo, type Env, json, Rechazo, redDe } from './index.ts'

const DIA = 24 * 3600_000
/** Una computadora que no avisa en esto deja de estar (se vuelve a apuntar sola al encender la web). */
export const CADUCA = 90 * DIA
/** Computadoras nuevas por conexión al día, códigos por computadora al día y códigos escritos por conexión al día. */
const NUEVAS_AL_DIA = 10
const CODIGOS_AL_DIA = 60
const INTENTOS_AL_DIA = 40
/** Y por bloque /48 de IPv6 (65.536 redes /64 de una misma casa o servidor): así no se reparte la adivinanza. */
const INTENTOS_AL_DIA_48 = 200

/** El host de la entrada: ahí las rutas van sin `/web` delante. */
export const HOST_ENTRADA = new URL(ENTRADA).host

/** El bloque /48 de una IPv6 (la IPv4, entera): para contar intentos sin que cada /64 cuente aparte. */
export function red48(ip: string): string {
  if (!ip.includes(':')) return ip
  return `${redDe(ip).split(':').slice(0, 3).join(':')}::/48`
}

const resumen = async (texto: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)))].map((b) => b.toString(16).padStart(2, '0')).join('')

/** Lo que manda la Sloth de una computadora al encender o apagar la web: valida o rechaza. */
export function aviso(c: Record<string, unknown>): { llave: string; url: string | null; nombre: string } {
  const llave = typeof c.llave === 'string' && SECRETO.test(c.llave) ? c.llave : null
  if (!llave) throw new Rechazo(400, 'Falta la llave de esta computadora.')
  const url = c.url === null ? null : typeof c.url === 'string' && TUNEL.test(c.url) ? c.url : undefined
  if (url === undefined) throw new Rechazo(400, 'Esa dirección no es la de un túnel de Sloth.')
  const nombre = typeof c.nombre === 'string' ? c.nombre.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) : ''
  return { llave, url, nombre }
}

/** La llave de una computadora ya apuntada: si no es la suya, nadie más le cambia la dirección. */
async function suya(env: Env, equipo: string, llave: string): Promise<boolean> {
  const f = await env.DB.prepare('SELECT llave FROM web_equipos WHERE equipo = ?').bind(equipo).first<{ llave: string }>()
  if (!f) return false
  if (f.llave !== (await resumen(llave))) throw new Rechazo(403, 'Esa computadora ya está apuntada con otra llave.')
  return true
}

export async function web(req: Request, env: Env, url: URL): Promise<Response> {
  const partes = url.pathname.split('/').filter(Boolean)
  const equipo = partes[1]
  const ahora = new Date().toISOString()

  if (req.method === 'GET' && (partes.length === 1 || (partes.length === 2 && ID_EQUIPO.test(equipo)))) {
    // La página solo vive en su dominio: en el del cobro, a donde viven también los pagos, se manda allá.
    if (url.hostname === 'api.sloth.vancci.org') return Response.redirect(`${ENTRADA}${partes[1] ? `/${partes[1]}` : ''}`, 302)
    return pagina()
  }

  if (req.method === 'POST' && partes.length === 2 && equipo === 'codigo') {
    const ip = req.headers.get('cf-connecting-ip') ?? ''
    if (!(await cupo(env, await conexion(req), 'web-codigo', INTENTOS_AL_DIA)) || !(await cupo(env, `web48:${red48(ip)}`, 'web-codigo48', INTENTOS_AL_DIA_48)))
      throw new Rechazo(429, 'Ya se probaron muchos códigos desde esta conexión hoy. Usa el enlace que da Sloth.')
    const c = await cuerpo(req)
    const corto = typeof c.corto === 'string' ? limpiarCodigo(c.corto) : ''
    if (!CODIGO_CORTO.test(corto)) throw new Rechazo(400, `El código son ${LARGO_CODIGO} letras y números, como ABCDE-FGHJK.`)
    const hash = await resumen(corto)
    const f = await env.DB.prepare(
      'SELECT c.equipo, e.url, e.nombre FROM web_codigos c JOIN web_equipos e ON e.equipo = c.equipo WHERE c.corto = ? AND c.vence > ?'
    )
      .bind(hash, ahora)
      .first<{ equipo: string; url: string | null; nombre: string }>()
    if (!f) throw new Rechazo(404, 'Ese código no existe o ya venció: dura 10 minutos. Pide otro en Opciones de Sloth, en tu computadora.')
    // Aquí ya no se necesita: la computadora lo comprueba otra vez, y solo vale una vez.
    await env.DB.prepare('DELETE FROM web_codigos WHERE corto = ?').bind(hash).run()
    return json({ equipo: f.equipo, url: f.url, nombre: f.nombre }, 200, { 'cache-control': 'no-store' })
  }

  if (!ID_EQUIPO.test(equipo ?? '')) throw new Rechazo(404, 'No existe')

  if (req.method === 'GET' && partes.length === 3 && partes[2] === 'donde') {
    const f = await env.DB.prepare('SELECT url, nombre, visto FROM web_equipos WHERE equipo = ?').bind(equipo).first<{ url: string | null; nombre: string; visto: string }>()
    if (!f) throw new Rechazo(404, 'Esa computadora no tiene Sloth en la web.')
    return json(f, 200, { 'cache-control': 'no-store' })
  }

  if (req.method === 'PUT' && partes.length === 2) {
    const a = aviso(await cuerpo(req))
    if (await suya(env, equipo, a.llave)) {
      await env.DB.prepare('UPDATE web_equipos SET url = ?, nombre = ?, visto = ? WHERE equipo = ?').bind(a.url, a.nombre, ahora, equipo).run()
    } else {
      if (!(await cupo(env, await conexion(req), 'web-equipo', NUEVAS_AL_DIA))) throw new Rechazo(429, 'Desde esta conexión ya se apuntaron muchas computadoras hoy.')
      await env.DB.prepare('INSERT INTO web_equipos (equipo, llave, url, nombre, visto, creado) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(equipo, await resumen(a.llave), a.url, a.nombre, ahora, ahora)
        .run()
    }
    return json({ ok: true })
  }

  if (req.method === 'POST' && partes.length === 3 && partes[2] === 'codigo') {
    const c = await cuerpo(req)
    const llave = typeof c.llave === 'string' && SECRETO.test(c.llave) ? c.llave : ''
    const corto = typeof c.corto === 'string' ? c.corto : ''
    const vence = typeof c.vence === 'string' && !Number.isNaN(Date.parse(c.vence)) ? new Date(Math.min(Date.parse(c.vence), Date.now() + 15 * 60_000)).toISOString() : ''
    if (!llave || !CODIGO_CORTO.test(corto) || !vence) throw new Rechazo(400, 'El código llegó incompleto.')
    if (!(await suya(env, equipo, llave))) throw new Rechazo(404, 'Esa computadora aún no está apuntada.')
    if (!(await cupo(env, `web:${equipo}`, 'web-codigos', CODIGOS_AL_DIA))) throw new Rechazo(429, 'Ya se pidieron muchos códigos hoy. Usa el enlace.')
    await env.DB.prepare('INSERT OR REPLACE INTO web_codigos (corto, equipo, vence) VALUES (?, ?, ?)').bind(await resumen(corto), equipo, vence).run()
    return json({ ok: true })
  }

  throw new Rechazo(404, 'No existe')
}

/** Cada mañana: los códigos vencidos y las computadoras que hace mucho no avisan. */
export async function olvidarWeb(env: Env, ahora = Date.now()) {
  await env.DB.prepare('DELETE FROM web_codigos WHERE vence < ?').bind(new Date(ahora).toISOString()).run()
  await env.DB.prepare('DELETE FROM web_equipos WHERE visto < ?').bind(new Date(ahora - CADUCA).toISOString()).run()
}

/** La página de entrada. Todo lo de cada dispositivo vive en su navegador (`localStorage`, `sloth-web`). */
function pagina(): Response {
  return new Response(PAGINA, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' https://*.trycloudflare.com; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    }
  })
}

/** El logo de Sloth, el de web/public/icon.svg. */
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" aria-hidden="true" viewBox="0 9 512 512"> <g fill="#f2e7cf" fill-rule="evenodd" stroke="#171719" stroke-width="10" stroke-linejoin="round" paint-order="stroke"> <path d="M 229 35.0 C 203.1 37.0, 175.6 43.3, 151.5 52.7 C 75.1 82.6, 25.4 152.6, 26.4 228.7 C 26.8 253.4, 29.9 267.6, 39.0 286.9 C 53.2 316.5, 75.6 338.7, 107.5 354.7 C 125.7 363.8, 157.2 372.5, 179.5 374.4 C 183.3 374.8, 189.6 375.5, 193.5 376.0 C 197.3 376.5, 224.8 377.4, 254.5 378.0 C 312.2 379.0, 316.5 379.4, 324.9 383.7 C 332.5 387.6, 335.9 392.6, 335.9 400.3 C 336.1 424.8, 300.0 439.2, 238.5 439.2 C 188.7 439.2, 153.8 432.4, 108.5 413.8 C 93.9 407.8, 92.1 408.1, 98.4 415.2 C 125.0 445.1, 164.7 465.4, 215 474.6 C 230.1 477.4, 282.4 477.2, 297.5 474.2 C 340.8 465.7, 366.8 448.3, 377.0 421 C 379.2 415.2, 379.5 412.8, 379.5 400.5 C 379.5 392.8, 379.2 385.0, 378.8 383.2 C 377.4 376.6, 372.0 366.8, 366.3 360.9 C 348.4 342.1, 324.6 337.0, 255 337 C 228.5 336.9, 195.5 335.4, 186.5 333.9 C 167.6 330.6, 162.5 329.5, 153.0 326.8 C 109.6 314.5, 80.0 285.3, 70.3 245.1 C 68.7 238.5, 68.8 212.8, 70.4 204.1 C 80.4 152.0, 118.7 110.7, 176 90.4 C 189.5 85.5, 208.4 81.1, 222.5 79.4 C 225.8 79.0, 229.6 78.5, 231 78.3 C 232.3 78.2, 242.7 77.7, 254 77.4 C 300.0 75.9, 339.1 84.6, 371.5 103.7 C 405.4 123.7, 433.0 160.6, 440.6 196 C 441.0 197.9, 441.5 200.1, 441.7 201 C 444.3 212.9, 444.1 234.1, 441.2 245.8 C 439.7 251.8, 439.8 254.2, 441.9 281.8 C 443.1 298.1, 444.9 315.7, 446.0 321 C 447.1 326.2, 448.0 333.5, 448.0 337.2 C 448.0 342.3, 448.3 344, 449.4 344 C 451.0 344, 460.7 328.1, 465.0 318.3 C 466.7 314.5, 468.7 310.1, 469.4 308.5 C 471.1 304.7, 477.3 286.3, 479.3 279 C 480.8 273.5, 483.0 261.8, 484.8 250.5 C 486.0 243.0, 485.5 204.4, 484.1 196.5 C 477.8 159.6, 462.9 127.6, 440.7 103.5 C 438.7 101.3, 437.0 99.2, 437.0 98.8 C 436.9 97.3, 412.3 76.7, 403.7 70.9 C 379.9 55.0, 347.3 42.7, 315 37.5 C 294.7 34.2, 255.0 33.1, 229 35.0" /> <path d="M 158 164.5 C 119.4 170.6, 91 201.5, 91 237.3 C 91 252.8, 95.3 263.3, 106.3 274.8 C 116.5 285.3, 116.3 285.3, 120.3 277.2 C 129.6 258.9, 144.3 247.6, 174.5 235.5 C 198.3 225.9, 207.0 219.5, 212.4 208 C 217.4 197.1, 215.1 182.0, 207.3 174.8 C 202.6 170.5, 193.0 166.2, 184.1 164.5 C 174.3 162.7, 169.5 162.7, 158 164.5 M 151.5 189.6 C 136.4 197.5, 138.1 214.8, 154.3 219.1 C 165.4 222.1, 177.2 212.4, 175.4 201.7 C 173.7 191.6, 160.4 184.9, 151.5 189.6" /> <path d="M 329.1 164.5 C 307.8 168.2, 297 178.7, 297 195.5 C 297 202.2, 297.4 203.9, 300.2 209.2 C 305.9 220.0, 314.5 225.3, 341 234.4 C 362.1 241.7, 372.0 245.8, 384.7 252.6 C 413.8 267.9, 433.5 286.9, 441.4 306.9 C 442.3 309.4, 443.4 311.7, 443.8 311.9 C 445.0 312.8, 447.2 325.9, 447.7 335.2 C 448.0 341.7, 448.5 344, 449.5 344 C 452.8 344, 452.8 340.4, 449.4 298.9 C 447.5 276.1, 446.0 256.7, 446.0 255.7 C 446.0 254.4, 445.1 254, 443 254 C 441.3 254, 439.9 253.4, 439.9 252.7 C 439.8 252.0, 439.3 252.7, 438.8 254.2 C 437.8 257.0, 435.6 257.8, 434.4 255.8 C 434.0 255.2, 432.6 249.7, 431.3 243.6 C 425.2 215.2, 418.3 201.0, 403.5 186.5 C 385.2 168.3, 356.1 159.7, 329.1 164.5 M 346 189.9 C 338.2 194.0, 335.0 201.0, 337.5 208.2 C 339.5 213.9, 342.3 216.6, 348.1 218.5 C 356.7 221.4, 365.4 217.9, 369.5 209.9 C 376.0 197.3, 359.1 182.9, 346 189.9" /> <path d="M 236 230.1 C 222.8 231.7, 216.2 236.5, 215.2 245.2 C 214.5 251.3, 217.2 256.0, 225.8 264.1 C 240.3 277.9, 255.6 281.5, 271.3 274.9 C 280.1 271.3, 291.1 261.6, 294.8 254.2 C 299.0 246.1, 296.8 237.0, 289.8 233.5 C 282.1 229.7, 254.1 227.9, 236 230.1" /> </g> </svg>`

const PAGINA = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sloth en la web</title>
<style>
:root{color-scheme:dark;--bg:#0f0e0c;--panel:#171512;--panel-2:#221f1b;--line:#2e2a24;--text:#ede6d6;--muted:#9a907f;--amber:#e8a33d;--amber-2:#f4b04a;--sobre-ambar:#1b1408;--bad:#e06c55}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
main{width:100%;max-width:440px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:28px 24px}
header{display:flex;align-items:center;gap:12px;margin-bottom:18px}
h1{font-size:20px;margin:0}
p{margin:0 0 14px;color:var(--muted)}
p.fuerte{color:var(--text)}
.bad{color:var(--bad)}
form{display:flex;gap:8px;margin:6px 0 14px}
input{flex:1;min-width:0;background:var(--panel-2);border:1px solid var(--line);border-radius:10px;color:var(--text);font:600 18px/1 ui-monospace,Consolas,monospace;letter-spacing:2px;padding:12px;text-transform:uppercase}
input:focus{outline:2px solid var(--amber);outline-offset:1px}
button{background:var(--amber);color:var(--sobre-ambar);border:0;border-radius:10px;font:600 15px system-ui,sans-serif;padding:12px 16px;cursor:pointer}
button:hover{background:var(--amber-2)}
button.otro{background:transparent;color:var(--muted);border:1px solid var(--line)}
button.otro:hover{color:var(--text)}
button:disabled{opacity:.6;cursor:default}
ul{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:8px}
li{display:flex;align-items:center;gap:10px;background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acciones{display:flex;gap:8px;flex-wrap:wrap}
small{color:var(--muted);font-size:13px}
.nube{margin-top:22px;padding-top:18px;border-top:1px solid var(--line)}
.nube small{display:block}
a.boton{display:inline-block;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:10px;font:600 15px system-ui,sans-serif;padding:12px 16px;text-decoration:none;margin-bottom:10px}
a.boton:hover{border-color:var(--amber);color:var(--amber-2)}
</style></head>
<body><main>
<header>${LOGO}<h1>Sloth en la web</h1></header>
<div id="v"><p>Un momento…</p></div>
</main>
<script>
(() => {
  const v = document.getElementById('v')
  const ID = /^[A-Za-z0-9_-]{22}$/
  // En su dominio, las rutas van sin /web; en el del cobro (o al probar aquí), con él.
  const BASE = location.pathname === '/web' || location.pathname.startsWith('/web/') ? '/web' : ''
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')
  const azar = (n) => b64(crypto.getRandomValues(new Uint8Array(n)))
  const el = (tag, props = {}, ...hijos) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...hijos); return e }
  const ver = (...nodos) => { v.replaceChildren(...nodos) }
  const parte = location.pathname.slice(BASE.length).split('/').filter(Boolean)[0]
  const hash = new URLSearchParams(location.hash.slice(1))
  const codigo = hash.get('c')
  const destino = hash.get('h') || ''
  if (location.hash) history.replaceState(null, '', location.pathname)

  // Cada computadora de este navegador: su id, su nombre y la llave de este dispositivo, que no se puede sacar de aquí.
  const base = () => new Promise((ok, falla) => {
    const r = indexedDB.open('sloth-web', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('equipos', { keyPath: 'equipo' })
    r.onsuccess = () => ok(r.result)
    r.onerror = () => falla(r.error)
  })
  const almacen = async (modo, hacer) => {
    const db = await base()
    return new Promise((ok, falla) => {
      const t = db.transaction('equipos', modo)
      const r = hacer(t.objectStore('equipos'))
      t.oncomplete = () => ok(r && r.result)
      t.onerror = () => falla(t.error)
    })
  }
  const todos = async () => ((await almacen('readonly', (a) => a.getAll())) || []).filter((e) => e && ID.test(e.equipo))
  const uno = (equipo) => almacen('readonly', (a) => a.get(equipo))
  const poner = (e) => almacen('readwrite', (a) => a.put(e))
  const quitar = (equipo) => almacen('readwrite', (a) => a.delete(equipo))

  /** El dispositivo de este navegador para esa computadora: el que ya tenía o uno nuevo, con su llave. */
  async function dispositivo(equipo, nombre) {
    let e = await uno(equipo)
    if (!e) {
      const claves = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
      e = { equipo, nombre: nombre || '', dispositivo: azar(16), claves }
    }
    if (nombre) e.nombre = nombre
    e.ultimo = Date.now()
    await poner(e)
    return e
  }
  async function olvidar(equipo) { await quitar(equipo); inicio() }

  let reloj
  async function entrar(equipo, conCodigo) {
    clearTimeout(reloj)
    ver(el('p', { textContent: 'Buscando tu Sloth…' }))
    let d
    try {
      const r = await fetch(BASE + '/' + equipo + '/donde', { cache: 'no-store' })
      d = await r.json()
      if (!r.ok) throw new Error(d.error || 'No se encontró.')
    } catch (e) {
      return ver(el('p', { className: 'bad', textContent: e.message || 'No se pudo preguntar dónde está tu Sloth.' }), botones(equipo))
    }
    const e = await dispositivo(equipo, d.nombre)
    const nombre = d.nombre ? '«' + d.nombre + '»' : 'tu computadora'
    if (!d.url) return ver(el('p', { className: 'fuerte', textContent: 'Sloth en la web está apagada en ' + nombre + '.' }), el('p', { textContent: 'Enciéndela en esa computadora: Sloth → Opciones → Sloth en la web.' }), botones(equipo, true))
    let reto = ''
    try {
      const h = await fetch(d.url + '/api/web/hola', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
      if (h.ok && (await h.json()).equipo === equipo) reto = (await (await fetch(d.url + '/api/web/reto', { cache: 'no-store', signal: AbortSignal.timeout(10000) })).json()).reto || ''
    } catch {}
    if (!reto) {
      ver(el('p', { className: 'fuerte', textContent: 'Tu Sloth en ' + nombre + ' no contesta.' }), el('p', { textContent: 'Abre Sloth en esa computadora y revisa que tenga internet. Lo vuelvo a intentar solo.' }), botones(equipo, true))
      reloj = setTimeout(() => entrar(equipo, conCodigo), 6000)
      return
    }
    // Firma el reto con el host de ese túnel: la firma no sirve en otro ni dos veces.
    const host = new URL(d.url).host
    const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, e.claves.privateKey, new TextEncoder().encode('sloth-web:' + host + ':' + reto))
    const p = new URLSearchParams({ d: e.dispositivo, r: reto, f: b64(firma) })
    if (conCodigo) {
      p.set('c', conCodigo)
      p.set('p', b64(await crypto.subtle.exportKey('spki', e.claves.publicKey)))
    }
    if (destino) p.set('h', destino)
    location.href = d.url + '/web/entrar#' + p
  }

  function botones(equipo, reintentar) {
    const b = el('div', { className: 'acciones' })
    if (reintentar) b.append(el('button', { textContent: 'Intentar ya', onclick: () => entrar(equipo) }))
    b.append(el('button', { className: 'otro', textContent: 'Volver', onclick: () => (clearTimeout(reloj), inicio(true)) }))
    return b
  }

  function formulario(error) {
    const input = el('input', { placeholder: 'ABCDE-FGHJK', maxLength: 14, autocomplete: 'one-time-code', autocapitalize: 'characters', spellcheck: false, ariaLabel: 'Código' })
    const boton = el('button', { textContent: 'Entrar', type: 'submit' })
    const msg = el('p', { className: 'bad', textContent: error || '' })
    const f = el('form', { onsubmit: async (ev) => {
      ev.preventDefault()
      boton.disabled = true
      msg.textContent = ''
      try {
        const r = await fetch(BASE + '/codigo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ corto: input.value }) })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || 'No se pudo.')
        await dispositivo(j.equipo, j.nombre)
        entrar(j.equipo, input.value.toUpperCase().replace(/[\\s-]+/g, ''))
      } catch (e) { msg.textContent = e.message; boton.disabled = false }
    } }, input, boton)
    setTimeout(() => input.focus(), 0)
    return [el('p', { className: 'fuerte', textContent: 'Usa tu Sloth desde este navegador.' }), el('p', { textContent: 'En tu computadora, abre Sloth → Opciones → Sloth en la web → «Conectar», y escribe aquí el código que te da.' }), f, msg]
  }

  // Sin computadora (docs/adr/0026): Sloth corre en un Codespace de GitHub de cada quien. «quickstart» abre el que ya
  // tenga, o crea uno.
  const NUBE = 'https://codespaces.new/Vancci-sloth/sloth?quickstart=1'
  const nube = () => el('section', { className: 'nube' },
    el('p', { className: 'fuerte', textContent: '¿Sin computadora? Usa Sloth en la nube.' }),
    el('p', { textContent: 'Corre en un Codespace de GitHub con tu cuenta: la misma Sloth, con sus agentes y sus videos, aunque no tengas computadora. GitHub regala unas 30 horas al mes; la primera vez tarda unos minutos en prepararse.' }),
    el('a', { className: 'boton', href: NUBE, target: '_blank', rel: 'noopener', textContent: 'Abrir Sloth en la nube' }),
    el('small', { textContent: 'Al abrir, guarda la dirección que termina en -4848.app.github.dev: es tu Sloth.' }))

  async function inicio(lista) {
    let l = []
    try { l = (await todos()).sort((a, b) => (b.ultimo || 0) - (a.ultimo || 0)) } catch {
      return ver(el('p', { className: 'bad', textContent: 'Este navegador no deja guardar la llave de tu dispositivo (¿una ventana privada?). Ábrelo en una normal.' }))
    }
    if (!lista && parte && ID.test(parte) && (codigo || l.some((x) => x.equipo === parte))) return entrar(parte, codigo)
    if (!lista && l.length === 1) return entrar(l[0].equipo)
    if (!l.length) return ver(...formulario(parte && ID.test(parte) ? 'Este navegador aún no está conectado a esa computadora.' : ''), nube())
    const ul = el('ul')
    for (const e of l) ul.append(el('li', {}, el('span', { textContent: e.nombre || 'Tu computadora' }), el('button', { textContent: 'Entrar', onclick: () => entrar(e.equipo) }), el('button', { className: 'otro', textContent: 'Olvidar', title: 'Este navegador deja de entrar a esa computadora', onclick: () => olvidar(e.equipo) })))
    ver(el('p', { className: 'fuerte', textContent: 'Tus computadoras con Sloth' }), ul, el('small', { textContent: '¿Otra computadora? Escribe su código:' }), ...formulario().slice(2), nube())
  }
  inicio()
})()
</script></body></html>`
