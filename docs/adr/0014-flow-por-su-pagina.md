# Imágenes y videos con Google Flow, por su página y con la cuenta de cada quien

Fecha: 2026-11-01

Lo amplía el [ADR 0015](0015-flow-con-varias-cuentas.md): varias cuentas, cada una en su Edge, y videos desde un
fotograma o con referencias.

## Contexto

Flow genera imágenes (Nano Banana) y videos (Veo) con la cuenta de Google del usuario, y no tiene API: Veo oficial se
paga por segundo con llave. Se probó el 1 de noviembre de 2026, con una cuenta gratis (50 créditos al día):

- Flow abre y genera en el Edge sin ventana de la voz, con la misma sesión. Una imagen salió en menos de un minuto, sin
  gastar; un video Veo 3.1 Lite de 8 s (720p, con audio), en unos 50 s, por 10 créditos. Quality cuesta 100.
- `labs.google` ya redirige a `flow.google.com`.
- Con la ventana ancha, Flow enseña un chat con su agente, que decide por su cuenta y no da el costo. Con la angosta
  enseña un compositor directo que sí lo dice («La generación usará 10 créditos») antes de generar.
- «Ayudar a mejorar Flow» viene encendido, y al abrir el menú se dibuja apagado hasta cargar lo guardado. Apagarlo pide
  confirmar en un diálogo; sin eso no se guarda.

## Decisión

- **Como la voz (ADR 0011):** lo genera el servidor (`server/flow/`) y los agentes lo piden con un MCP propio
  (`server/flow/mcp.mjs`), igual para todos. Ningún agente tiene la sesión de Google.
- **El Edge de la voz, en el turno de la voz.** Dos procesos no pueden abrir un perfil, y los dos abren y cierran ese
  Edge: `voz().google` les da un solo turno, y Flow no pide entrar otra vez. No se usa la página del navegador integrado:
  lo comprobado es Edge.
- **Nada de gastar a ciegas.** Se lee el costo antes de generar y, si no se puede leer o pasa de `tope` (20 créditos, lo
  de Fast), no se genera. Un pedido igual al último de esa ruta no se repite (`.huella`).
- **«Ayudar a mejorar Flow» se apaga para todos, y cada quien puede encenderlo** en Opciones → Google Flow. Se pone antes
  del primer pedido y se comprueba recargando; si no se puede, no se genera.
- **El aviso de privacidad de Flow lo acepta cada quien**, en la ventana de «Abrir Flow». Sloth no le da clic por nadie.
- **Cada quien elige con qué se hacen sus imágenes**: en el compositor, «Imágenes» manda la línea `Imágenes:`
  (`shared/flow.ts`) con ChatGPT o con un modelo de Flow, y gana sobre lo que diga la skill. Sin elección, lo que esté
  conectado, primero ChatGPT.
- Un solo resultado por pedido, solo desde texto. Animar y extender quedan para el issue #6.
- **Las referencias, con la confirmación de cada quien.** Subir una imagen pide aceptar en Flow «Derechos para usar esta
  imagen». Sloth lo acepta solo si el usuario confirmó lo mismo en Sloth (`derechos`, con su fecha): al elegir Flow, o en
  Opciones. Sin eso, un pedido con referencias no se hace. Probado con la pose, la boca (`bocas.py` no movió nada) y una
  portada con tres cuadros y título con acentos: el mismo perro, 0 créditos, de 30 a 90 s.

## Consecuencias

- Si Flow cambia su página, el pedido falla con una captura en `data/flow/error.png` y el agente lo dice. Los botones se
  buscan por su icono, que no cambia con el idioma de la cuenta.
- Mientras Flow genera, la voz espera, y al revés: un lote con muchos clips va en fila.
- Usar la página de forma automática no está dicho en los términos de Google: es una zona gris, con la cuenta de cada
  quien y a su ritmo (un pedido a la vez).
- Sin comprobar: qué enseña Flow al rechazar un prompt o al quedarse sin créditos. Se trata como tarjeta que no avanza o
  que no sale, y el mensaje lleva lo que diga la página.
