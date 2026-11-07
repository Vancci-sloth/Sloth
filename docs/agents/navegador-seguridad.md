# Seguridad del navegador integrado

Qué protege cada capa y qué queda fuera. Código: `shared/navegador-politica.ts` (la política, para cambiarla sin tocar el
navegador), `electron/navegador.ts` (la aplica), `electron/confirmacion.ts` (la confirmación humana) y `electron/relevo.ts`
(el relevo CDP por donde pasa el agente).

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
