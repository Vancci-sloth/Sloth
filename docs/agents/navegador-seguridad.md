# Seguridad del navegador integrado

Qué protege cada capa y qué queda fuera. Código: `shared/navegador-politica.ts` (la política, para cambiarla sin tocar el
navegador), `electron/navegador.ts` (la aplica), `electron/confirmacion.ts` (la confirmación humana) y `electron/relevo.ts`
(el relevo CDP por donde pasa el agente) y, si en Opciones → Navegador se eligió Chrome o Edge, `server/chrome-agente.ts`
(el mismo relevo para una ventana del navegador instalado) y `server/navegador-seguro.ts` (cómo se lanza).

## Lista blanca por perfil

| Perfil | Páginas que abre |
| --- | --- |
| `persist:redes` | tiktok.com, instagram.com, youtube.com, google.com, facebook.com, meta.com (y subdominios) |
| `persist:voz` | aistudio.google.com y accounts.google.com |
| `persist:navegador` (el del agente) | cualquiera, salvo lo de abajo |

Se cumple en `webRequest.onBeforeRequest` (cada navegación de la página, redirecciones incluidas) y en `will-navigate` /
`will-redirect`. Solo cuenta la página; las imágenes, scripts y marcos de otros sitios cargan, o los inicios de sesión y los
captchas se romperían. Para sumar un sitio, editar `POLITICA`. Si el inicio de sesión de Google de la voz o de las redes
pasa por otro dominio y se bloquea, súmalo ahí. Para no limitar un perfil, ponle `sitios: null`.

En todos los perfiles: nunca `file:`, `chrome:`, `chrome-extension:`, `view-source:` ni `javascript:`, y se cancelan las
descargas `.exe`, `.msi`, `.bat`, `.ps1`, `.cmd` y `.scr`. El relevo revisa además `Page.navigate` del agente.

## Confirmación humana

Cuando el agente (por el relevo CDP) hace un clic izquierdo (`Input.dispatchMouseEvent`, `mousePressed`) o pulsa Enter
(`Input.dispatchKeyEvent`), `confirmacion.ts` pregunta a la página qué hay bajo el cursor o en el campo con el foco. Si el
botón dice `publicar|pagar|comprar|borrar|eliminar|enviar|post|pay|buy|delete|submit`, o envía un formulario POST, la
ventana muestra «El agente quiere: <acción> en <sitio>» con Permitir / Bloquear. Sin respuesta en 90 segundos se bloquea.
Si se bloquea, el comando falla con un mensaje para el agente (que no lo repita ni busque otro camino).

Solo el perfil del agente: las páginas de las redes y la voz las maneja Sloth mismo, no un agente.

Lo que NO cubre:
- Un clic o envío que el agente haga desde un script suyo (`element.click()`, `form.requestSubmit()`, `fetch` con
  `Runtime.evaluate`): no pasa por el ratón ni el teclado. Cubrirlo exigiría un preload aislado que intercepte `submit` y
  `click` en la página, y eso rompe a Playwright (que usa esos eventos). Queda pendiente.
- Un botón dentro de un `iframe` de otro origen: `elementFromPoint` del documento principal devuelve el marco, no el botón.
- Un botón cuyo texto no diga nada (un ícono sin `aria-label` ni `title`).
- Las pestañas que abre la persona: son suyas.

## El agente en Chrome o Edge (Opciones → Navegador)

Con `chrome` o `edge`, Playwright MCP entra por CDP a `server/chrome-agente.ts` (`ws://127.0.0.1:<puerto>/<secreto>/<hilo>/<modo>`),
que abre el navegador con el perfil del agente (`data/navegador-chrome` o `data/navegador-edge`, nunca el tuyo) y le pasa todo
salvo lo que la política no deja:

- `Page.navigate` y `Target.createTarget` a `file:`, `chrome:`, `javascript:`… no salen (`urlPermitida`, sin lista de sitios).
- Un clic o un Enter sobre «publicar», «pagar», «borrar»… espera tu Permitir o Bloquear en un aviso dentro de la misma página
  (`scriptDeAviso`: mundo aislado y shadow root cerrado, solo cuenta un clic de verdad). Mientras preguntas, el agente no
  puede mandar clics ni teclas. Sin respuesta en 90 s, se bloquea.
- Las descargas `.exe`, `.msi`, `.bat`… se cancelan al empezar (`Browser.downloadWillBegin`).

Lo que no cubre es lo de arriba (clics desde un script del agente, `iframe` de otro origen, botones sin texto), y aquí
tampoco hay lista blanca de sitios. Un solo navegador sirve a todos los hilos: el primero se queda el perfil y los demás van
en un contexto limpio (`--isolated`) mientras ese lo usa.

## Cómo se lanzan (`server/navegador-seguro.ts`)

El depurador solo escucha en `127.0.0.1`, en un puerto libre al azar (nunca el `0` de Chrome, que lo delata como
automatizado) y siempre con un perfil de Sloth. Se cierran con el servidor. Si Sloth se cerró de golpe, su Chrome sin
ventana puede seguir vivo con el perfil; al lanzar otro, `liberarPerfil` lo cierra primero (por CDP con el puerto anotado en
el perfil, `sloth-depurador`, o buscando el proceso por su `--user-data-dir`). Sin eso, Chrome le pasa la orden al viejo y
sale al instante: el puerto queda en 0 y Playwright acababa en `connect ECONNREFUSED 127.0.0.1:80`.
