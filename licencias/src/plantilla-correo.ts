/**
 * El HTML de cada correo de Sloth: de fiesta y en el tono de Vancci (`docs/agents/anuncios.md`), con la paleta de
 * `web/src/styles.css`. Los correos se escriben como párrafos de texto (`correo` en `index.ts`) y aquí se visten solos:
 *
 * - arriba, papel picado y el perezoso (`/correo/sloth.png`) con una frase que cambia según el correo;
 * - el «Hola:» del principio se dice «¡Holaaa!», y al final firma Vancci, con un abrazo;
 * - el asunto es el título (sin la clave, si la lleva);
 * - una clave `SLOTH-…` sale en un boleto ámbar, grande y en monoespaciada, para copiarla sin errores;
 * - las fechas y el dinero van resaltados; lo de «comillas» (un botón o un menú de Sloth), en negritas;
 * - los enlaces se pueden pulsar, y si el correo da el de `/descargar` o el de `/renovar`, sale su botón;
 * - a soporte (`interno`) va sin firma, sin «respóndeme» y sin boleto: la clave que lleva es de otra persona.
 *
 * Va con tablas y estilos en línea, lo único que respetan Gmail, Outlook y Apple Mail. Si el cliente bloquea la
 * imagen del perezoso, el resto se ve igual.
 */

const C = {
  fondo: '#0f0e0c',
  panel: '#171512',
  linea: '#2e2a24',
  texto: '#ede6d6',
  suave: '#d0c8b8',
  tenue: '#9a907f',
  ambar: '#e8a33d',
  ambar2: '#f4b04a',
  sobreAmbar: '#1b1408',
  ok: '#8fc177',
  bad: '#e06c55',
  // Ya mezclados, porque hay clientes que no entienden la transparencia: el ámbar al 13 % sobre el panel, y el ámbar
  // al 60 % sobre el fondo (el canto del botón).
  tinte: '#322718',
  canto: '#916729'
}

const LETRA = "ui-rounded,'SF Pro Rounded',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace"

/** La clave de Sloth (`nuevaClave`): SLOTH- y cuatro grupos de cuatro. */
const CLAVE = /SLOTH(?:-[A-Z0-9]{4}){4}/

/** Una clave, un enlace (con o sin https), algo entre «comillas», una fecha («21 de noviembre de 2026») o dinero. */
const MARCAS =
  /(SLOTH(?:-[A-Z0-9]{4}){4})|(https?:\/\/[^\s<>«»]+|\bsloth\.vancci\.org(?:\/[^\s<>«»]*)?)|«([^»]+)»|(\b\d{1,2} de [a-záéíóú]+ de \d{4}\b|\$\s?\d[\d,.]*(?:\s(?:USD|MXN)\b)?|\b\d[\d,.]* (?:USD|MXN)\b)/g

/** Lo que dice el perezoso bajo su nombre; cada correo saca una, siempre la misma para el mismo asunto. */
const FRASES = [
  'despacito, pero sin pausa',
  'el perezoso que sí chambea',
  'hecho con calma y con cariño',
  'tu agente favorito te escribe',
  'sin prisa, pero con estilo'
]

/** Los banderines del papel picado, con los colores de la paleta. */
const PICADO = [C.ambar, C.ok, C.bad, C.texto, C.ambar2, C.ok, C.ambar, C.bad, C.texto, C.ambar2]

export function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** El texto escapado, con sus enlaces, sus claves, sus fechas y su dinero marcados. */
function enriquecer(texto: string): string {
  let html = ''
  let desde = 0
  for (const m of texto.matchAll(MARCAS)) {
    html += escapar(texto.slice(desde, m.index))
    desde = m.index! + m[0].length
    if (m[1]) html += `<span style="font-family:${MONO};font-weight:700;color:${C.ambar};letter-spacing:.03em;white-space:nowrap">${m[1]}</span>`
    else if (m[2]) {
      // El punto o la coma que cierra la frase no es del enlace.
      const [, url, cola] = /^(.*?)([.,;:)]*)$/.exec(m[2])!
      const href = url.startsWith('http') ? url : `https://${url}`
      // Un enlace con un ?s= largo (el de renovar) se enseña sin él: el enlace lo lleva igual.
      const vista = url.replace(/^https?:\/\//, '').replace(/\?.{20,}$/, '')
      html += `<a href="${escapar(href)}" style="color:${C.ambar};font-weight:700;text-decoration:underline">${escapar(vista)}</a>${escapar(cola)}`
    } else if (m[3]) html += `<b style="color:${C.texto}">«${escapar(m[3])}»</b>`
    else html += `<b style="color:${C.ambar2};white-space:nowrap">${escapar(m[4])}</b>`
  }
  return html + escapar(texto.slice(desde))
}

const parrafo = (html: string, estilo = '') =>
  `<p style="margin:0 0 18px;font-family:${LETRA};font-size:16px;line-height:1.65;color:${C.suave};${estilo}">${html}</p>`

/** La clave como boleto de feria: borde punteado, «TU CLAVE» y que la guarde. */
function boleto(clave: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 24px"><tr>
<td bgcolor="${C.tinte}" style="background:${C.tinte};border:2px dashed ${C.ambar};border-radius:16px;padding:20px 18px;text-align:center">
<div style="font-family:${LETRA};font-size:13px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:${C.ambar};margin:0 0 10px">Tu clave</div>
<div style="font-family:${MONO};font-size:22px;font-weight:700;letter-spacing:.06em;color:${C.texto};word-break:break-all">${clave}</div>
<div style="font-family:${LETRA};font-size:13px;color:${C.tenue};margin:10px 0 0">Guárdala como oro, eh. Con ella entras desde cualquier compu.</div>
</td></tr></table>`
}

/** Un botón gordito, con su canto abajo para que se vea que se puede apachurrar. */
function boton(href: string, texto: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 26px"><tr>
<td bgcolor="${C.ambar}" style="background:${C.ambar};border-radius:14px;border-bottom:5px solid ${C.canto}">
<a href="${escapar(href)}" style="display:inline-block;padding:15px 30px;font-family:${LETRA};font-size:17px;font-weight:800;color:${C.sobreAmbar};text-decoration:none;border-radius:14px">${escapar(texto)}</a>
</td></tr></table>`
}

/** Papel picado colgando de su hilo, de orilla a orilla de la tarjeta: cada banderín con su recorte. */
function papelPicado(): string {
  const hueco = (forma: string) =>
    `<div style="width:8px;height:8px;margin:0 auto 4px;background:${C.panel};border-radius:${forma};font-size:0;line-height:0">&nbsp;</div>`
  const banderas = PICADO.map((color, i) => {
    const alto = i % 2 ? 26 : 36
    return `<td width="10%" valign="top" style="padding:0 ${i === PICADO.length - 1 ? 0 : 6}px 0 0"><div style="height:${alto}px;background:${color};border-radius:0 0 9px 9px;padding-top:7px;box-sizing:border-box;font-size:0;line-height:0">${hueco('50%')}${i % 2 ? '' : hueco('2px')}</div></td>`
  }).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td colspan="${PICADO.length}" style="height:2px;background:${C.tenue};font-size:0;line-height:0">&nbsp;</td></tr>
<tr>${banderas}</tr></table>`
}

/** Lo que el buzón enseña junto al asunto, antes de abrirlo: la primera frase que dice algo (no el «Hola:»). */
function resumen(parrafos: string[]): string {
  const primero = parrafos.find((p) => !/^hola\b/i.test(p.trim()) && p.length > 20) ?? parrafos[0] ?? ''
  const corto = primero.replace(CLAVE, 'tu clave').slice(0, 140)
  return corto.length < primero.length ? `${corto.replace(/\s+\S*$/, '')}…` : corto
}

function frase(asunto: string): string {
  let suma = 0
  for (const letra of asunto) suma = (suma * 31 + letra.charCodeAt(0)) >>> 0
  return FRASES[suma % FRASES.length]
}

export interface DatosCorreo {
  /** El Worker (`env.ORIGEN`): de ahí sale el perezoso, y con `${origen}/descargar` en el correo, el botón. */
  origen?: string
  /** Quién vende y su contacto (lo pide Profeco). */
  pie: string
  /** El correo de soporte, al que llega la respuesta. */
  respuesta: string
  /** Un aviso para soporte (para Vancci mismo): sin firma ni «respóndeme». */
  interno?: boolean
}

export function htmlDeCorreo(asunto: string, parrafos: string[], datos: DatosCorreo): string {
  const titulo = asunto.replace(/:?\s*SLOTH(?:-[A-Z0-9]{4}){4}/, '').trim()
  // Lo que se hace con un enlace del Worker, con su botón: bajar Sloth o pagar el año siguiente.
  const acciones: [string, string][] = datos.origen
    ? [[`${datos.origen}/descargar`, '¡Descargar Sloth!'], [`${datos.origen}/renovar`, '¡Quiero seguir apoyando!']]
    : []
  // Un correo que ya firma Vancci (el de la rifa) no lleva otra firma.
  const firmado = datos.interno || parrafos.some((p) => /^vancci\b/i.test(p.trim()))
  // En un aviso a soporte, la clave es de otra persona: va en el texto, sin boleto.
  let claveVista = !!datos.interno
  let botonVisto = false
  const cuerpo = parrafos
    .map((p, i) => {
      if (i === 0 && /^hola\s*:?$/i.test(p.trim()))
        return parrafo('¡Holaaa!', `font-size:22px;font-weight:800;color:${C.ambar};margin-bottom:12px`)
      if (i === 0 && /^hola/i.test(p.trim()) && p.length < 60) return parrafo(escapar(p), `font-size:19px;font-weight:800;color:${C.ambar}`)
      let html = ''
      const clave = !claveVista && CLAVE.exec(p)?.[0]
      if (clave) {
        claveVista = true
        html += boleto(clave)
        // «Tu clave: SLOTH-…» ya lo dice el boleto; si el párrafo dice más, se queda.
        const resto = p.replace(clave, '').replace(/^\s*tu clave( es)?:?\s*\.?\s*$/i, '').trim()
        if (resto) html += parrafo(enriquecer(p))
      } else html += parrafo(enriquecer(p))
      for (const [inicio, texto] of acciones) {
        const href = botonVisto ? undefined : p.match(/https?:\/\/[^\s<>«»]+/g)?.find((u) => u.startsWith(inicio))
        if (!href) continue
        botonVisto = true
        // Con el enlace de descarga, el botón da la de Windows; el de Mac y Linux se quedan en el texto.
        html += boton(inicio.endsWith('/descargar') ? inicio : href.replace(/[.,;:)]+$/, ''), texto)
      }
      return html
    })
    .join('')
  const firma = firmado
    ? ''
    : `<p style="margin:8px 0 6px;font-family:${LETRA};font-size:16px;line-height:1.5;color:${C.suave}">Un abrazooo,<br><b style="font-size:19px;color:${C.texto}">Vancci</b> <span style="color:${C.tenue}">· el de Sloth</span></p>`
  const logo = datos.origen
    ? `<td valign="middle" width="56" style="padding-right:12px"><img src="${escapar(datos.origen)}/correo/sloth.png" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border:0"></td>`
    : ''

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${escapar(titulo)}</title></head>
<body style="margin:0;padding:0;background:${C.fondo}" bgcolor="${C.fondo}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.fondo}">${escapar(resumen(parrafos))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.fondo}" style="background:${C.fondo}"><tr><td align="center" style="padding:28px 14px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td style="padding:0 6px 20px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${logo}
<td valign="middle" style="font-family:${LETRA}"><div style="font-size:26px;line-height:1.1;font-weight:900;letter-spacing:-.02em;color:${C.texto}">Sloth</div>
<div style="font-size:14px;line-height:1.4;color:${C.ambar};padding-top:3px">${escapar(frase(asunto))}</div></td>
</tr></table>
</td></tr>
<tr><td bgcolor="${C.panel}" style="background:${C.panel};border:1px solid ${C.linea};border-radius:20px;padding:0 0 18px">
<div style="padding:0 18px">${papelPicado()}</div>
<div style="padding:26px 30px 0">
<h1 style="margin:0 0 22px;font-family:${LETRA};font-size:28px;line-height:1.2;font-weight:900;letter-spacing:-.015em;color:${C.texto}">${escapar(titulo)}</h1>
${cuerpo}${firma}
</div>
</td></tr>
${datos.interno ? '' : `<tr><td style="padding:22px 8px 0;font-family:${LETRA};font-size:14px;line-height:1.6;color:${C.suave}">
¿Dudas o algo no jala? Respóndeme este correo o escríbeme a <a href="mailto:${escapar(datos.respuesta)}" style="color:${C.ambar};font-weight:700;text-decoration:none">${escapar(datos.respuesta)}</a>, contesto absolutamente todo.
</td></tr>`}
<tr><td style="padding:${datos.interno ? 22 : 10}px 8px 0;font-family:${LETRA};font-size:12px;line-height:1.6;color:${C.tenue}">${enriquecer(datos.pie)}</td></tr>
</table>
</td></tr></table>
</body></html>`
}
