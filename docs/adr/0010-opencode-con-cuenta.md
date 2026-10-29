# OpenCode con la cuenta de cada quien

Fecha: 2026-10-29

## Contexto

El ADR 0009 usaba OpenCode sin cuenta: sus modelos gratis se listan y responden sin credenciales. Al probarlo como un
usuario nuevo, el segundo paso del primer hilo ya falló con «Free usage limit reached. Free models work in OpenCode;
subscribe to OpenCode Go to keep going». Sin cuenta, el uso gratis lo cuenta OpenCode por computadora o red, no publica
de cuánto es ni cuándo vuelve, y hay reportes de que a veces no se repone en días (issues #58814, #58205 y #58284 de
`anomalyco/opencode`). No sirve como la puerta gratis de Sloth.

OpenCode 2 (2.2.1) trae lo necesario para conectar la cuenta de opencode.ai, verificado en vivo: la integración
`opencode` («OpenCode Console») con el método `device` (`integration.oauth.connect` da una URL y un código; la persona lo
confirma en el navegador y OpenCode completa solo), las cuentas guardadas con una activa (`credential.list`,
`credential.activate`, `credential.remove`) y los límites de OpenCode Go (`experimental.usage.limits`). Sin cuenta, el
catálogo solo trae los modelos gratis; con ella, también los de pago de Zen, que se cobran del saldo de la cuenta.

## Decisión

- **Sin cuenta no hay OpenCode.** La cuenta se crea gratis en opencode.ai y se conecta desde la bienvenida u Opciones,
  como las de Claude y ChatGPT (`server/cuenta-opencode.ts`). Sin ella, el catálogo de OpenCode llega vacío y un turno
  acaba pidiendo conectarla, sin mandar nada.
- **Primero los modelos gratis y luego todos los de pago**, con su precio por millón de tokens (`Model.precio`). Los de
  pago los decide la persona: si le pone saldo a su cuenta, los usa; Sloth no cobra nada. Los de otros proveedores
  (Google, si el entorno trae su llave) siguen fuera: no se cobrarían en la cuenta de OpenCode.
- **Varias cuentas, una activa, como OpenCode.** Conectar otra la agrega y la deja activa; el menú de la cuenta cambia a
  otra, la quita o lleva al saldo en opencode.ai. Cada cambio vuelve a pedir el catálogo.
- **Los límites de Go van con los demás** (Opciones y el contexto del hilo). Sin Go no hay plan: se dice que el uso
  gratis tiene un tope que OpenCode no enseña.
- Todo sigue en el `opencode serve` de Sloth, con sus datos en `data/opencode`: no toca la cuenta del OpenCode que tenga
  el usuario.

## Consecuencias

- Empezar con OpenCode lleva un paso más: crear la cuenta en su página. A cambio, el uso gratis es de cada quien, no de
  toda la red.
- Cuando se acaba el uso gratis, el hilo lo dice así y ofrece los modelos de pago, Claude o ChatGPT; no lo confunde con
  un modelo saturado.
- Los datos de la cuenta (el token que renueva OpenCode) viven en la base de `data/opencode`, en esta computadora.
