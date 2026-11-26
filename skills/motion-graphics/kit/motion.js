/**
 * El director de Motion Graphics: de `revision/plan.json` (lo que escribió hacer.py desde momentos.json) a un cuadro
 * por cada `t`. Todo lo que define el estilo —la rejilla de compases, las curvas, los tamaños, los márgenes y el HUD—
 * está aquí con su número; los de la referencia están medidos en ESTILO.md. El agente no abre este archivo: escribe
 * momentos.json y ya.
 *
 * El mismo `t` da siempre el mismo cuadro: nada de Math.random (va `rng(semilla)`), relojes ni animaciones de CSS.
 */

// ── Las constantes del estilo (ESTILO.md) ────────────────────────────────────────────────────────────────────────
const ENTRADA = 0.30 // s que tarda un elemento en entrar y asentarse
const DESFASE = 0.03 // s de retraso entre una letra y la siguiente
const IRIS = 0.07 // s del corte: el círculo del plano nuevo tapa el anterior
const ESTELA = 6 // copias del desenfoque de movimiento mientras algo entra
const MARGEN = 64 // px del borde al contenido (el HUD va en 48)
const HUD = 48 // px del borde al HUD
const MONO = 15 // px de la letra del HUD
const ROCE = 0.012 // deriva lenta del contenido ya asentado, en partes del ancho por segundo

// ── Curvas ───────────────────────────────────────────────────────────────────────────────────────────────────────
const t01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const salida = (x) => 1 - (1 - t01(x)) ** 4 // lo normal: entra rápido y frena
const expo = (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * t01(x))) // el iris del corte
const atras = (x) => (x >= 1 ? 1 : 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2) // el rebote de una figura
const suave = (x) => t01(x) * t01(x) * (3 - 2 * t01(x))
const mezclar = (a, b, x) => a + (b - a) * x

/** Números iguales en cada corrida: el estilo no usa Math.random. */
function rng(semilla) {
  let s = (semilla >>> 0) || 1
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let x = Math.imul(s ^ (s >>> 15), 1 | s)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const SEMILLA = (texto) => {
  let h = 2166136261
  for (const c of String(texto)) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

// ── Letra ────────────────────────────────────────────────────────────────────────────────────────────────────────
const CONDENSA = 0.94 // el titular va algo condensado, como la referencia

function anchoDe(ctx, texto, esp) {
  let a = 0
  for (const c of texto) a += ctx.measureText(c).width + esp
  return Math.max(0, a - esp)
}

/** Dibuja letra a letra para poder desfasarlas; devuelve el ancho total. */
function letras(ctx, texto, x, y, esp, porLetra) {
  let cx = x
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    const ancho = ctx.measureText(c).width
    if (c !== ' ') porLetra(c, cx, y, i, ancho)
    cx += ancho + esp
  }
  return cx - x - esp
}

/** Reparte las palabras en `n` renglones lo más parejos posible. */
function repartir(palabras, n) {
  if (n <= 1) return [palabras.join(' ')]
  const total = palabras.join(' ').length
  const lineas = []
  let actual = []
  for (const p of palabras) {
    actual.push(p)
    const faltan = n - lineas.length - 1
    if (faltan > 0 && actual.join(' ').length >= total / n && palabras.length - (lineas.flat().length + actual.length) >= faltan) {
      lineas.push(actual)
      actual = []
    }
  }
  lineas.push(actual)
  return lineas.map((l) => l.join(' ')).filter(Boolean)
}

/** El tamaño más grande con el que `texto` cabe en la caja, y en cuántos renglones. */
function encajar(ctx, texto, caja, { familia = 'Titular', maxLineas = 3, esp = 0, tope = 400 } = {}) {
  const palabras = String(texto).split(/\s+/).filter(Boolean)
  let mejor = { tam: 0, lineas: [texto] }
  for (let n = 1; n <= Math.min(maxLineas, palabras.length); n++) {
    const lineas = repartir(palabras, n)
    ctx.font = `100px ${familia}`
    const anchos = lineas.map((l) => anchoDe(ctx, l, esp * 100))
    const porAncho = (caja.ancho / Math.max(...anchos)) * 100 * (familia === 'Titular' ? 1 / CONDENSA : 1)
    const porAlto = caja.alto / (n * 1.06)
    const tam = Math.min(porAncho, porAlto, tope)
    if (tam > mejor.tam) mejor = { tam, lineas }
  }
  return mejor
}

// ── Figuras ──────────────────────────────────────────────────────────────────────────────────────────────────────
function figura(ctx, nombre, r) {
  ctx.beginPath()
  const p = (n, giro = -Math.PI / 2) => {
    for (let i = 0; i < n; i++) {
      const a = giro + (i * 2 * Math.PI) / n
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r)
    }
    ctx.closePath()
  }
  switch (nombre) {
    case 'cuadrado': ctx.rect(-r * 0.86, -r * 0.86, r * 1.72, r * 1.72); break
    case 'triangulo': p(3); break
    case 'rombo': p(4, 0); break
    case 'pentagono': p(5); break
    case 'play': p(3, 0); break
    case 'cruz': {
      const g = r * 0.34
      ctx.rect(-g, -r, g * 2, r * 2)
      ctx.rect(-r, -g, r * 2, g * 2)
      break
    }
    case 'estrella': {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const rr = i % 2 ? r * 0.42 : r
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr)
      }
      ctx.closePath()
      break
    }
    case 'anillo':
      ctx.arc(0, 0, r, 0, 7)
      ctx.arc(0, 0, r * 0.55, 0, 7, true)
      break
    default: ctx.arc(0, 0, r, 0, 7)
  }
}

/** El asterisco de la marca: `n` rayos redondeados desde el centro. */
function asterisco(ctx, r, giro, n = 10, grosor = 0.19) {
  ctx.save()
  ctx.rotate(giro)
  ctx.lineCap = 'round'
  ctx.lineWidth = r * grosor * 2
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n
    ctx.moveTo(Math.cos(a) * r * 0.1, Math.sin(a) * r * 0.1)
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  ctx.stroke()
  ctx.restore()
}

function tarjeta(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

// ── El director ──────────────────────────────────────────────────────────────────────────────────────────────────
export function montar(plan, ctx, material) {
  const { ancho: W, alto: H, escenas, paleta, compas, pulso } = plan
  const corchea = pulso / 2
  const vertical = H > W
  const duracion = plan.duracion

  // La caja donde va el contenido. En vertical respeta lo que la red tapa (PORTADA.md: 300..1350 de 1920).
  const caja = vertical
    ? { x: MARGEN, y: H * 0.17, ancho: W - MARGEN * 2, alto: H * 0.53 }
    : { x: W * 0.05, y: H * 0.14, ancho: W * 0.9, alto: H * 0.66 }
  const centro = { x: W / 2, y: caja.y + caja.alto / 2 }

  const color = (rol) => paleta[rol] || rol
  /** El color que se lee encima de `fondo`. */
  const encima = (fondo) => (fondo === paleta.claro || fondo === paleta.papel ? paleta.tinta : paleta.claro)

  function fondoDe(e) {
    return color(e.base)
  }

  // ── Fondos y adornos comunes ───────────────────────────────────────────────────────────────────────────────────
  function reglas(e, t, tinta) {
    // Dos reglas finísimas que cruzan el cuadro: el papel técnico de la referencia.
    ctx.save()
    ctx.globalAlpha = 0.14
    ctx.strokeStyle = tinta
    ctx.lineWidth = 1
    const d = suave(t01(t / compas)) * 40
    ctx.beginPath()
    ctx.moveTo(0, caja.y - 36 + d)
    ctx.lineTo(W, caja.y - 36 + d)
    ctx.moveTo(0, caja.y + caja.alto + 36 - d)
    ctx.lineTo(W, caja.y + caja.alto + 36 - d)
    ctx.stroke()
    ctx.restore()
  }

  // ── Planos ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const planos = {
    /** El estallido de marca: rayos que crecen, un anillo que se abre y, al segundo pulso, una línea de texto. */
    destello(e, t) {
      const tinta = encima(fondoDe(e))
      const r = Math.min(caja.ancho, caja.alto) * 0.3
      const crece = atras(t01(t / (pulso * 0.8)))
      ctx.save()
      ctx.translate(centro.x, centro.y)
      ctx.globalAlpha = 0.5
      ctx.strokeStyle = tinta
      ctx.lineWidth = 2
      const anillo = salida(t01((t - pulso * 0.5) / (compas * 0.7)))
      if (anillo > 0) {
        ctx.beginPath()
        ctx.arc(0, 0, r * (0.4 + anillo * 1.5), 0, 7)
        ctx.globalAlpha = 0.45 * (1 - anillo)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      ctx.strokeStyle = color(e.tono || 'acento') === fondoDe(e) ? tinta : color(e.tono || 'acento')
      asterisco(ctx, r * crece, t * 0.35 - 0.5)
      ctx.restore()
      if (e.texto) {
        const v = salida(t01((t - pulso) / ENTRADA))
        ctx.save()
        ctx.globalAlpha = v
        ctx.fillStyle = tinta
        ctx.font = `${MONO * 1.9}px Mono`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const esp = MONO * 0.95
        const txt = String(e.texto).toUpperCase()
        const y = centro.y + r * 1.9 + (1 - v) * 24
        letras(ctx, txt, centro.x - anchoDe(ctx, txt, esp) / 2, y, esp, (c, x, yy) => ctx.fillText(c, x + ctx.measureText(c).width / 2, yy))
        ctx.restore()
      }
    },

    /** El titular: letras enormes que entran por la izquierda, desfasadas, con su estela. */
    titular(e, t) {
      const tinta = color(e.tono) || encima(fondoDe(e))
      const desvio = e.desvio || 0
      reglas(e, t, tinta)
      const { tam, lineas } = encajar(ctx, e.texto, caja, { maxLineas: vertical ? 3 : 2 })
      const esp = tam * 0.005
      ctx.save()
      ctx.fillStyle = tinta
      ctx.textBaseline = 'middle'
      const alto = lineas.length * tam * 1.06
      let n = 0
      lineas.forEach((linea, fila) => {
        ctx.font = `${tam}px Titular`
        const anchoLinea = anchoDe(ctx, linea, esp) * CONDENSA
        const y = centro.y + desvio - alto / 2 + tam * 0.53 + fila * tam * 1.06
        const x0 = centro.x - anchoLinea / 2
        ctx.save()
        ctx.translate(x0, 0)
        ctx.scale(CONDENSA, 1)
        letras(ctx, linea, 0, y, esp, (c, x, yy, i, w) => {
          const v = salida(t01((t - n * DESFASE) / ENTRADA))
          n++
          const dx = (1 - v) * -W * 0.14 + (v === 1 ? t * ROCE * W * 0.12 : 0)
          for (let k = ESTELA - 1; k >= 0; k--) {
            ctx.globalAlpha = k === 0 ? 1 : (0.22 * (1 - k / ESTELA)) * (1 - v)
            ctx.fillText(c, x + dx * (1 + (k / ESTELA) * 0.55), yy)
          }
          ctx.globalAlpha = 1
        })
        ctx.restore()
      })
      ctx.restore()
      if (e.pie) {
        const v = salida(t01((t - pulso * 0.6) / ENTRADA))
        ctx.save()
        ctx.globalAlpha = v
        ctx.fillStyle = tinta
        ctx.font = `italic ${tam * 0.26}px Serif`
        ctx.textAlign = 'center'
        ctx.fillText(e.pie, centro.x, centro.y + desvio + alto / 2 + tam * 0.36 + (1 - v) * 20)
        ctx.restore()
      }
    },

    /** La frase que se arma palabra por palabra, cada una en su corchea, y al final cae en su bloque. */
    frase(e, t) {
      const tinta = color(e.tono) || encima(fondoDe(e))
      const { tam, lineas } = encajar(ctx, e.texto, caja, { maxLineas: vertical ? 3 : 2 })
      ctx.font = `${tam}px Titular`
      const esp = tam * 0.005
      const espacio = tam * 0.3
      const alto = lineas.length * tam * 1.12
      const destinos = []
      lineas.forEach((linea, fila) => {
        const palabras = linea.split(' ')
        const anchos = palabras.map((w) => anchoDe(ctx, w, esp) * CONDENSA)
        const total = anchos.reduce((a, b) => a + b, 0) + espacio * (palabras.length - 1)
        let cx = centro.x - total / 2
        const y = centro.y - alto / 2 + tam * 0.56 + fila * tam * 1.12
        palabras.forEach((w, i) => {
          destinos.push({ texto: w, x: cx, y, ancho: anchos[i] })
          cx += anchos[i] + espacio
        })
      })
      const az = rng(SEMILLA(e.texto))
      const junta = suave(t01((t - (e.dura - pulso * 1.6)) / ENTRADA))
      ctx.save()
      ctx.fillStyle = tinta
      ctx.textBaseline = 'middle'
      destinos.forEach((d, i) => {
        const v = salida(t01((t - i * corchea) / ENTRADA))
        const sx = caja.x + az() * Math.max(0, caja.ancho - d.ancho)
        const sy = caja.y + tam * 0.6 + az() * Math.max(0, caja.alto - tam * 1.2)
        if (v <= 0) return
        ctx.save()
        ctx.globalAlpha = v
        ctx.translate(mezclar(sx, d.x, junta), mezclar(sy, d.y, junta) + (1 - v) * tam * 0.22)
        ctx.scale(CONDENSA, 1)
        letras(ctx, d.texto, 0, 0, esp, (c, lx, ly) => ctx.fillText(c, lx, ly))
        ctx.restore()
      })
      ctx.restore()
    },

    /** El panel: una tarjeta clara con su título y sus filas, cada una con su punto corriendo con otra curva. */
    panel(e, t) {
      const curvas = [salida, suave, expo, atras, (x) => x, (x) => 1 - Math.cos((t01(x) * Math.PI) / 2)]
      const filas = (e.filas || []).slice(0, 6)
      const pad = MARGEN
      const x = caja.x
      const paso = Math.max(78, Math.min(132, (caja.alto - 210) / Math.max(1, filas.length)))
      const alto = Math.min(caja.alto, filas.length * paso + 190)
      const y = centro.y - alto / 2
      const w = caja.ancho
      ctx.save()
      ctx.fillStyle = paleta.claro
      tarjeta(ctx, x, y, w, alto, 10)
      ctx.fill()
      ctx.fillStyle = paleta.tinta
      ctx.font = `italic ${42}px Serif`
      ctx.globalAlpha = salida(t01(t / ENTRADA))
      ctx.fillText(e.titulo || '', x + pad, y + 76)
      const anchoPista = w - pad * 2 - 300
      filas.forEach((fila, i) => {
        const v = salida(t01((t - 0.06 * i - 0.08) / ENTRADA))
        if (v <= 0) return
        ctx.globalAlpha = v
        const fy = y + 150 + i * paso
        ctx.fillStyle = paleta.tinta
        ctx.font = `${MONO * 1.5}px Mono`
        ctx.fillText(String(fila).slice(0, 18), x + pad + 34, fy + 8)
        ctx.strokeStyle = paleta.tinta
        ctx.globalAlpha = v * 0.25
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x + pad + 300, fy)
        ctx.lineTo(x + pad + 300 + anchoPista * v, fy)
        ctx.stroke()
        // El punto recorre la pista con su curva, una vuelta por compás.
        ctx.globalAlpha = v
        const vuelta = t01(((t % compas) - 0.12) / (compas * 0.72))
        const p = curvas[i % curvas.length](vuelta)
        ctx.fillStyle = i % 3 === 1 ? color(e.tono || 'acento') : i % 3 === 2 ? paleta.apoyo : paleta.tinta
        ctx.beginPath()
        ctx.arc(x + pad + 300 + anchoPista * p, fy, 15, 0, 7)
        ctx.fill()
      })
      ctx.restore()
    },

    /** Las figuras: una por corchea sobre un color plano, con sus satélites girando. */
    formas(e, t) {
      const tinta = color(e.tono) || encima(fondoDe(e))
      const lista = (e.figuras && e.figuras.length ? e.figuras : ['circulo', 'play', 'estrella', 'cuadrado'])
      const paso = Math.floor(t / corchea)
      const nombre = lista[paso % lista.length]
      const r = Math.min(caja.ancho, caja.alto) * 0.24
      const local = (t % corchea) / corchea
      ctx.save()
      ctx.translate(centro.x, centro.y)
      // Satélites: ocho marcas que giran y laten con el pulso.
      ctx.fillStyle = tinta
      ctx.globalAlpha = 0.9
      const az = rng(SEMILLA(nombre))
      for (let i = 0; i < 8; i++) {
        const a = (i * 2 * Math.PI) / 8 + t * 0.5
        const rr = r * (1.55 + 0.1 * Math.sin(t * 3 + i))
        ctx.save()
        ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr)
        ctx.rotate(a)
        figura(ctx, az() > 0.5 ? 'triangulo' : 'circulo', r * 0.105)
        ctx.fill()
        ctx.restore()
      }
      ctx.globalAlpha = 1
      ctx.rotate(mezclar(-0.12, 0, salida(local * 2)))
      figura(ctx, nombre, r * atras(t01(local * 3.2)))
      ctx.fill()
      ctx.restore()
    },

    /** La trama: un campo entero de arcos que se vuelve a tirar en cada corchea. */
    trama(e, t) {
      const tinta = encima(fondoDe(e))
      const lado = 92
      const cols = Math.ceil(W / lado) + 1
      const filas = Math.ceil(H / lado) + 1
      const az = rng(SEMILLA((e.texto || 'trama') + Math.floor(t / corchea)))
      const abre = salida(t01(t / (ENTRADA * 1.6)))
      ctx.save()
      ctx.lineWidth = lado * 0.17
      ctx.lineCap = 'butt'
      for (let j = 0; j < filas; j++) {
        for (let i = 0; i < cols; i++) {
          const v = az()
          ctx.strokeStyle = v > 0.78 ? color(e.tono || 'acento') : tinta
          const x = i * lado
          const y = j * lado
          const rr = (lado / 2) * abre
          ctx.beginPath()
          if (v > 0.45) {
            ctx.arc(x, y, rr, 0, Math.PI / 2)
            ctx.arc(x + lado, y + lado, rr, Math.PI, Math.PI * 1.5)
          } else {
            ctx.arc(x + lado, y, rr, Math.PI / 2, Math.PI)
            ctx.arc(x, y + lado, rr, Math.PI * 1.5, Math.PI * 2)
          }
          ctx.stroke()
        }
      }
      for (const arriba of [true, false]) {
        const g = ctx.createLinearGradient(0, arriba ? 0 : H, 0, arriba ? 200 : H - 200)
        g.addColorStop(0, fondoDe(e))
        g.addColorStop(1, 'transparent')
        ctx.fillStyle = g
        ctx.fillRect(0, arriba ? 0 : H - 200, W, 200)
      }
      ctx.restore()
      if (e.texto) planos.titular({ ...e, texto: e.texto, tono: e.tono2 || 'claro' }, t)
    },

    /** Las tarjetas: un racimo de paneles oscuros que entran en perspectiva y derivan. */
    tarjetas(e, t) {
      const lista = (e.tarjetas || []).slice(0, 6)
      const az = rng(SEMILLA(lista.join('|') || 'tarjetas'))
      const w = caja.ancho * (vertical ? (e.texto ? 0.56 : 0.66) : 0.3)
      const h = w * 0.62
      ctx.save()
      ctx.translate(centro.x, centro.y)
      lista.forEach((titulo, i) => {
        const v = salida(t01((t - i * 0.09) / ENTRADA))
        if (v <= 0) return
        const a = (az() - 0.5) * 0.34
        const x = Math.max(-1, Math.min(1, (az() - 0.5) * 1.6)) * Math.max(0, W / 2 - w * 0.42)
        const libre = az() - 0.5
        const y = e.texto ? Math.sign(libre || 1) * (caja.alto * 0.3 + Math.abs(libre) * caja.alto * 0.4) : libre * caja.alto * 0.7
        ctx.save()
        ctx.globalAlpha = v
        ctx.translate(x + Math.sin(t * 0.6 + i) * 14, y + (1 - v) * 90 + Math.cos(t * 0.5 + i) * 10)
        ctx.rotate(a)
        ctx.scale(mezclar(0.86, 1, v), mezclar(0.86, 1, v))
        ctx.fillStyle = paleta.tinta
        tarjeta(ctx, -w / 2, -h / 2, w, h, 18)
        ctx.fill()
        ctx.fillStyle = paleta.claro
        ctx.font = `${w * 0.082}px Titular`
        ctx.textBaseline = 'top'
        const palabras = repartir(String(titulo).split(/\s+/), 2)
        palabras.forEach((l, k) => ctx.fillText(l, -w / 2 + 26, -h / 2 + 26 + k * w * 0.095))
        ctx.globalAlpha = v * 0.4
        ctx.fillStyle = paleta.claro
        for (let k = 0; k < 3; k++) ctx.fillRect(-w / 2 + 26, h / 2 - 90 + k * 18, w * (0.62 - k * 0.14), 5)
        ctx.globalAlpha = v
        ctx.fillStyle = color(e.tono || 'acento')
        ctx.beginPath()
        ctx.arc(w / 2 - 34, -h / 2 + 34, 9, 0, 7)
        ctx.fill()
        ctx.restore()
      })
      ctx.restore()
      if (e.texto) {
        const v = salida(t01((t - pulso) / ENTRADA))
        const { tam, lineas } = encajar(ctx, e.texto, { ...caja, alto: caja.alto * 0.25 }, { maxLineas: 2 })
        ctx.save()
        ctx.globalAlpha = v
        ctx.fillStyle = encima(fondoDe(e))
        ctx.font = `${tam}px Titular`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.translate(centro.x, centro.y + (1 - v) * 24)
        ctx.scale(CONDENSA, 1)
        lineas.forEach((l, k) => ctx.fillText(l, 0, (k - (lineas.length - 1) / 2) * tam * 1.06))
        ctx.restore()
      }
    },

    /** La cifra: un número que sube en un pulso y su pie. */
    cifra(e, t) {
      const tinta = color(e.tono) || encima(fondoDe(e))
      const texto = String(e.texto)
      const num = Number(texto.replace(/[^\d.,-]/g, '').replace(',', '.'))
      const v = salida(t01(t / (pulso * 1.6)))
      const vista = Number.isFinite(num) && num !== 0
        ? texto.replace(/[\d.,]+/, (m) => {
          const dec = m.includes(',') || m.includes('.')
          const n = (num * v).toFixed(dec ? 1 : 0)
          return dec && m.includes(',') ? n.replace('.', ',') : n
        })
        : texto
      const { tam } = encajar(ctx, vista, caja, { maxLineas: 1 })
      ctx.save()
      ctx.fillStyle = tinta
      ctx.font = `${tam}px Titular`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.save()
      ctx.translate(centro.x, centro.y)
      ctx.scale(CONDENSA, 1)
      ctx.fillText(vista, 0, 0)
      ctx.restore()
      if (e.pie) {
        const p = salida(t01((t - pulso) / ENTRADA))
        ctx.globalAlpha = p
        ctx.font = `${MONO * 2.1}px Mono`
        ctx.fillText(String(e.pie).toUpperCase(), centro.x, centro.y + tam * 0.72 + (1 - p) * 18)
      }
      ctx.restore()
    },

    /** El cierre: anillo que se abre, asterisco, marca y su pie en serif. */
    cierre(e, t) {
      const tinta = color(e.tono) || encima(fondoDe(e))
      const r = Math.min(caja.ancho, caja.alto) * 0.5
      ctx.save()
      ctx.translate(centro.x, centro.y)
      const anillo = salida(t01(t / (compas * 0.8)))
      ctx.strokeStyle = tinta
      ctx.globalAlpha = 0.35 * (1 - anillo * 0.7)
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(0, 0, r * (0.2 + anillo * 1.15), 0, 7)
      ctx.stroke()
      ctx.restore()
      const marca = String(e.texto || plan.marca || '').toUpperCase()
      const { tam } = encajar(ctx, marca, { ...caja, ancho: caja.ancho * 0.74, alto: caja.alto * 0.3 }, { maxLineas: 1 })
      const vA = atras(t01((t - 0.1) / ENTRADA))
      const vM = salida(t01((t - 0.25) / ENTRADA))
      ctx.save()
      ctx.fillStyle = tinta
      ctx.strokeStyle = tinta
      ctx.font = `${tam}px Titular`
      ctx.textBaseline = 'middle'
      const anchoMarca = anchoDe(ctx, marca, 0) * CONDENSA
      const rA = tam * 0.62
      const total = rA * 2 + tam * 0.3 + anchoMarca
      const x0 = centro.x - total / 2
      ctx.save()
      ctx.translate(x0 + rA, centro.y)
      asterisco(ctx, rA * vA, t * 0.5, 10)
      ctx.restore()
      ctx.save()
      ctx.globalAlpha = vM
      ctx.translate(x0 + rA * 2 + tam * 0.3, centro.y)
      ctx.scale(CONDENSA, 1)
      ctx.fillText(marca, (1 - vM) * -40, 0)
      ctx.restore()
      if (e.pie) {
        const vP = salida(t01((t - 0.5) / ENTRADA))
        ctx.globalAlpha = vP
        ctx.textAlign = 'center'
        ctx.font = `italic ${tam * 0.4}px Serif`
        ctx.fillText(e.pie, centro.x, centro.y + tam * 0.85 + (1 - vP) * 16)
        ctx.globalAlpha = vP * 0.35
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(centro.x - total / 2, centro.y + tam * 1.2)
        ctx.lineTo(centro.x - total / 2 + total * vP, centro.y + tam * 1.2)
        ctx.stroke()
      }
      ctx.restore()
    },
  }

  // ── El material generado (planos `imagen`, `clip` y `modelo`) ────────────────────────────────────────────────────
  /** El archivo que le toca a una escena en su segundo: una imagen suelta, o el cuadro del clip. */
  function rutaDe(e, t) {
    if (e.archivo) return e.archivo
    if (e.cuadros && e.n) {
      const i = Math.min(e.n, Math.max(1, Math.floor(t * plan.fps) + 1))
      return `${e.cuadros}/f${String(i).padStart(4, '0')}.jpg`
    }
    return null
  }

  /** Dibuja la imagen tapando la caja que se le dé, recortada al centro (como `object-fit: cover`). */
  function cubrir(img, x, y, w, h, escala = 1) {
    const r = Math.max(w / img.width, h / img.height) * escala
    const iw = img.width * r
    const ih = img.height * r
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
  }

  /** El material entra con el mismo tiempo que todo lo demás y se acerca despacio mientras dura su plano. */
  function pintarMaterial(e, t, img) {
    const v = salida(t01(t / ENTRADA))
    const empuje = 1 + 0.05 * suave(t01(t / Math.max(0.3, e.dura)))
    const trato = e.trato || 'duotono'
    const tinta = encima(fondoDe(e))
    ctx.save()
    if (trato === 'tarjeta') {
      const m = MARGEN * 1.4
      const w = W - m * 2
      const h = vertical ? Math.min(caja.alto, w * 1.2) : H - m * 2
      const y = vertical ? centro.y - h / 2 : m
      ctx.beginPath()
      ctx.roundRect(x0Tarjeta(w), y, w, h * v, 14)
      ctx.clip()
      if (trato === 'duotono') ctx.filter = 'grayscale(1) contrast(1.06)'
      cubrir(img, x0Tarjeta(w), y, w, h, empuje)
    } else {
      // La entrada es una persiana: el cuadro se descubre de un lado, no se funde.
      ctx.beginPath()
      ctx.rect(0, 0, W, H * v)
      ctx.clip()
      if (trato === 'duotono') ctx.filter = 'grayscale(1) contrast(1.06)'
      cubrir(img, 0, 0, W, H, empuje)
    }
    ctx.filter = 'none'
    if (trato === 'duotono') {
      // Duotono de libro: las luces se van al acento (multiply) y las sombras al fondo del plano (screen). Así el
      // material generado queda dentro de la paleta en vez de verse pegado encima.
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = color(e.tono || 'acento')
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'screen'
      ctx.fillStyle = fondoDe(e)
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.restore()
    if (e.texto) {
      // Un velo bajo el texto, que encima de una foto si no no se lee.
      ctx.save()
      ctx.globalAlpha = 0.45 * v
      ctx.fillStyle = fondoDe(e)
      ctx.fillRect(0, caja.y - 40, W, caja.alto + 80)
      ctx.restore()
      planos.titular({ ...e, tono: e.tono2 || (tinta === paleta.tinta ? 'tinta' : 'claro') }, t)
    }
  }

  const x0Tarjeta = (w) => (W - w) / 2

  /**
   * Cuando el material no llegó (sin cuenta, sin créditos, el proveedor falló), el plano se queda con su texto o,
   * si no lo tiene, con la trama: un relleno del estilo que se lee como un plano a propósito y no como un hueco.
   */
  function sinMaterial(e, t) {
    if (e.texto) planos.titular(e, t)
    else planos.trama({ ...e, texto: '' }, t)
  }

  planos.imagen = (e, t) => {
    const img = material.listo(rutaDe(e, t))
    img ? pintarMaterial(e, t, img) : sinMaterial(e, t)
  }
  planos.clip = planos.imagen
  planos.modelo = (e, t) => {
    const img = material.listo(rutaDe(e, t))
    if (!img) return sinMaterial(e, t)
    // La vuelta de la biblioteca 3D viene sobre negro y sin alfa: en vez de recortarla, va dentro de un panel oscuro
    // sobre el campo de color, como las maquetas de interfaz del estilo.
    const v = atras(t01(t / ENTRADA))
    const lado = Math.min(caja.ancho, e.texto ? caja.alto * 0.56 : caja.alto * 0.92)
    const x = centro.x - lado / 2
    const y = (e.texto ? caja.y + caja.alto * 0.06 : centro.y - lado / 2)
    ctx.save()
    ctx.translate(centro.x, y + lado / 2)
    ctx.scale(Math.max(0.01, v), Math.max(0.01, v))
    ctx.translate(-centro.x, -(y + lado / 2))
    ctx.fillStyle = paleta.oscuro
    tarjeta(ctx, x, y, lado, lado, 20)
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.drawImage(img, x, y, lado, lado)
    ctx.restore()
    ctx.fillStyle = color(e.tono || 'acento')
    ctx.beginPath()
    ctx.arc(x + lado - 30, y + 30, 9, 0, 7)
    ctx.fill()
    ctx.restore()
    if (e.texto) planos.titular({ ...e, tono: e.tono2, desvio: caja.alto * 0.33 }, t)
  }

  // ── El HUD: el marco técnico que lleva todo el video ───────────────────────────────────────────────────────────
  function hud(e, t, global) {
    const tinta = encima(fondoDe(e))
    ctx.save()
    ctx.fillStyle = tinta
    ctx.strokeStyle = tinta
    ctx.textBaseline = 'middle'
    // Esquinas.
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 2
    const b = 22
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = sx > 0 ? HUD : W - HUD
      const y = sy > 0 ? HUD : H - HUD
      ctx.beginPath()
      ctx.moveTo(x, y + sy * b)
      ctx.lineTo(x, y)
      ctx.lineTo(x + sx * b, y)
      ctx.stroke()
    }
    // Cada etiqueta devuelve lo que ocupa: las de la izquierda se encadenan y las de la derecha se van restando.
    const linea = (texto, x, y, { alpha = 1, align = 'left', esp = MONO * 0.5 } = {}) => {
      ctx.globalAlpha = alpha
      ctx.font = `${MONO}px Mono`
      const a = anchoDe(ctx, texto, esp)
      let cx = align === 'right' ? x - a : x
      for (const c of texto) {
        ctx.fillText(c, cx, y)
        cx += ctx.measureText(c).width + esp
      }
      return a
    }
    const SEPARA = MONO * 2.4
    const yTop = HUD + 30
    const yBot = H - HUD - 30
    let x = HUD + 38
    x += linea(String(plan.marca || '').toUpperCase(), x, yTop, { esp: MONO * 0.62 }) + SEPARA
    if (plan.sello) linea(String(plan.sello).toUpperCase(), x, yTop, { alpha: 0.5 })
    if (e.capitulo) linea(String(e.capitulo).toUpperCase(), W - HUD - 38, yTop, { align: 'right' })
    const cuadro = Math.floor((global % 1) * plan.fps)
    const tc = `00:00:${String(Math.floor(global % 60)).padStart(2, '0')}:${String(cuadro).padStart(2, '0')}`
    x = HUD + 38
    x += linea(tc, x, yBot - 26) + SEPARA
    linea(`${plan.fps} FPS`, x, yBot - 26, { alpha: 0.45 })
    ctx.globalAlpha = 0.75
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(HUD, yBot + 8)
    ctx.lineTo(HUD + (W * 0.3) * (global / duracion), yBot + 8)
    ctx.stroke()
    const compasN = Math.floor(global / compas) + 1
    const total = Math.round(duracion / compas)
    let xd = W - HUD - 38
    xd -= linea(`COMPÁS ${compasN}/${total}`, xd, yBot - 26, { align: 'right' }) + SEPARA
    const pulsoN = Math.floor((global % compas) / pulso)
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = 0.8
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.rect(xd - 13 - i * 22, yBot - 33, 13, 13)
      if (3 - i === pulsoN) ctx.fill()
      else ctx.stroke()
    }
    xd -= 4 * 22 + SEPARA
    linea(`${plan.bpm} BPM`, xd, yBot - 26, { align: 'right', alpha: 0.5 })
    ctx.restore()
  }

  // ── Un cuadro ──────────────────────────────────────────────────────────────────────────────────────────────────
  function cuadroDe(e, t, global) {
    ctx.fillStyle = fondoDe(e)
    ctx.fillRect(0, 0, W, H)
    ;(planos[e.plano] || planos.titular)(e, t)
    hud(e, t, global)
  }

  function cual(t) {
    let i = 0
    while (i + 1 < escenas.length && t >= escenas[i + 1].desde) i++
    return i
  }

  /** Los archivos que hacen falta para este cuadro: el del plano y, si estamos en un corte, el del anterior. */
  function rutasEn(t, i) {
    const e = escenas[i]
    const rutas = [rutaDe(e, t - e.desde)]
    const antes = escenas[i - 1]
    if (antes && t - e.desde < IRIS) rutas.push(rutaDe(antes, e.desde - antes.desde))
    return rutas.filter(Boolean)
  }

  async function dibujar(t) {
    t = Math.max(0, Math.min(t, duracion - 1e-4))
    await material.pedir(rutasEn(t, cual(t)))
    const i = cual(t)
    const e = escenas[i]
    const local = t - e.desde
    // El video no abre en negro (comprobar.mjs lo marca, y la referencia tampoco): el primer plano se abre con el
    // mismo círculo del corte, desde un campo de color lleno.
    if (i === 0 && local < IRIS) {
      ctx.fillStyle = fondoDe(e) === paleta.acento ? paleta.claro : paleta.acento
      ctx.fillRect(0, 0, W, H)
      ctx.save()
      ctx.beginPath()
      ctx.arc(e.foco[0] * W, e.foco[1] * H, Math.hypot(W, H) * 0.62 * expo(local / IRIS), 0, 7)
      ctx.clip()
      cuadroDe(e, local, t)
      ctx.restore()
      return
    }
    // El corte: el plano nuevo tapa al anterior en IRIS segundos. Cada tercer corte va en barrido; el resto, seco.
    if (i > 0 && local < IRIS) {
      const modo = i % 3
      const antes = escenas[i - 1]
      cuadroDe(antes, e.desde - antes.desde, t)
      if (modo === 0) { cuadroDe(e, local, t); return }
      const u = expo(local / IRIS)
      ctx.save()
      ctx.beginPath()
      if (modo === 1) {
        const r = Math.hypot(W, H) * 0.62 * u
        ctx.arc(e.foco[0] * W, e.foco[1] * H, r, 0, 7)
      } else {
        const d = (W + H) * u
        ctx.moveTo(-H, 0)
        ctx.lineTo(-H + d, 0)
        ctx.lineTo(d, H)
        ctx.lineTo(0, H)
      }
      ctx.clip()
      cuadroDe(e, local, t)
      ctx.restore()
      return
    }
    cuadroDe(e, local, t)
  }

  /**
   * El cuadro que se le da a Flow como primer cuadro de un clip (`sigue`): el mismo plano, pero **sin HUD y sin
   * texto**. Si se le manda la letra, el modelo intenta animarla y la deshace; el HUD lo vuelve a poner el director
   * encima de los cuadros del clip.
   */
  async function semilla(t) {
    t = Math.max(0, Math.min(t, duracion - 1e-4))
    const i = cual(t)
    const e = { ...escenas[i], texto: '', pie: '' }
    await material.pedir([rutaDe(e, t - e.desde)].filter(Boolean))
    ctx.fillStyle = fondoDe(e)
    ctx.fillRect(0, 0, W, H)
    ;(planos[e.plano] || planos.titular)(e, t - e.desde)
  }

  /** La portada vertical: el titular del video en su caja, sin HUD de tiempo. */
  function portada() {
    const e = { plano: 'titular', base: plan.portada.base, texto: plan.portada.texto, pie: plan.portada.pie, dura: compas, capitulo: '' }
    ctx.fillStyle = fondoDe(e)
    ctx.fillRect(0, 0, W, H)
    planos.titular(e, 1.2)
    hud(e, 1.2, 0)
  }

  return { duracion, dibujar, portada, semilla }
}
