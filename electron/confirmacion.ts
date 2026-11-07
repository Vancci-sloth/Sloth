import { accionDeRiesgo } from '../shared/navegador-politica.ts'

/**
 * La confirmación humana del navegador del agente: antes de que un clic o un Enter del agente (llegan por el relevo CDP
 * como `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`) publique, pague, compre, borre o envíe algo, se mira qué
 * hay bajo el cursor (o en el campo con el foco) y, si es de riesgo, se le pregunta a la persona. No cubre lo que el
 * agente haga sin entrada del ratón o del teclado (un `element.click()` o `form.submit()` desde un script suyo): está
 * dicho en `docs/agents/navegador-seguridad.md`.
 */

/** Lo que la página dice del elemento bajo el clic (o del campo con el foco). */
export interface Sondeo {
  /** El texto del botón: lo que se lee, su valor, su `aria-label` o su título. */
  texto: string
  /** Si pulsarlo envía un formulario. */
  envia: boolean
  /** Si ese formulario es POST. */
  post: boolean
  /** El sitio de la página. */
  sitio: string
}

/** El script que corre la página para saber qué hay en (x, y), o en el campo con el foco si `x` es null. */
export function scriptDeSondeo(x: number | null, y: number | null): string {
  return `(() => {
  const BOTON = 'button, a, input[type=submit], input[type=button], input[type=image], [role=button], summary';
  let el = ${x === null ? 'document.activeElement' : `document.elementFromPoint(${Number(x)}, ${Number(y)})`};
  const sitio = location.hostname;
  if (!el) return { texto: '', envia: false, post: false, sitio };
  const form = (e) => (e.form || e.closest('form'));
  if (${x === null ? 'true' : 'false'}) {
    // Enter en un campo envía su formulario con el botón que éste tenga por omisión.
    const f = form(el);
    if (!f || el.tagName === 'TEXTAREA' || el.isContentEditable) return { texto: '', envia: false, post: false, sitio };
    const b = f.querySelector('button:not([type=button]):not([type=reset]), input[type=submit]');
    const t = b ? (b.innerText || b.value || b.getAttribute('aria-label') || b.title || '') : '';
    return { texto: t.trim().slice(0, 80), envia: true, post: (f.method || 'get').toLowerCase() === 'post', sitio };
  }
  const b = el.closest(BOTON);
  if (!b) return { texto: '', envia: false, post: false, sitio };
  const f = form(b);
  const tipo = (b.getAttribute('type') || (b.tagName === 'BUTTON' ? 'submit' : '')).toLowerCase();
  const envia = !!f && b.tagName !== 'A' && (tipo === 'submit' || tipo === 'image');
  const t = b.innerText || b.value || b.getAttribute('aria-label') || b.title || '';
  return { texto: t.trim().slice(0, 80), envia, post: !!f && (f.method || 'get').toLowerCase() === 'post', sitio };
})()`
}

/** ¿Es entrada que podría enviar algo? Un clic izquierdo al pulsar, o Enter al bajar la tecla. */
export function esEntradaDeRiesgo(metodo: string, params: Record<string, unknown>): 'clic' | 'enter' | null {
  if (metodo === 'Input.dispatchMouseEvent') return params.type === 'mousePressed' && (params.button === undefined || params.button === 'left') ? 'clic' : null
  if (metodo === 'Input.dispatchKeyEvent') return (params.type === 'keyDown' || params.type === 'rawKeyDown') && params.key === 'Enter' ? 'enter' : null
  return null
}

/** Qué le dice a la persona: la acción, o `null` si no hace falta preguntar. */
export function queQuiere(s: Sondeo): string | null {
  if (accionDeRiesgo(s.texto)) return s.texto
  if (s.envia && s.post) return 'enviar un formulario'
  return null
}

export interface Dependencias {
  /** Corre un script en la página y da su resultado. */
  evaluar(expresion: string): Promise<unknown>
  /** Le pregunta a la persona. `true`, permitir. */
  preguntar(accion: string, sitio: string): Promise<boolean>
}

/** `null` si la entrada sigue; si no, el mensaje que recibe el agente. Si no se puede mirar la página, sigue. */
export async function revisarEntrada(metodo: string, params: Record<string, unknown>, d: Dependencias): Promise<string | null> {
  const tipo = esEntradaDeRiesgo(metodo, params)
  if (!tipo) return null
  let s: Sondeo
  try {
    const x = tipo === 'clic' ? Number(params.x) : null
    const y = tipo === 'clic' ? Number(params.y) : null
    if (tipo === 'clic' && (!Number.isFinite(x) || !Number.isFinite(y))) return null
    s = (await d.evaluar(scriptDeSondeo(x, y))) as Sondeo
  } catch {
    return null
  }
  if (!s || typeof s.texto !== 'string') return null
  const accion = queQuiere(s)
  if (!accion) return null
  return (await d.preguntar(accion, s.sitio)) ? null : `La persona bloqueó la acción «${accion}» en ${s.sitio}. No la repitas ni busques otro camino para hacerla: pregúntale qué quiere.`
}
