# Dictado con Deepgram

## Cómo va hoy

El micrófono del compositor (`web/src/Dictado.tsx`) graba hasta 60 segundos con MediaRecorder y manda trozos de
250 ms por WebSocket a `/api/dictado/vivo` (`server/dictado-vivo.ts`). El servidor los pasa a Deepgram `/v1/listen`
con Nova-3 multilingüe, preferencia por español, resultados provisionales y formato inteligente. Los parciales entran
al campo del mensaje en un solo trozo provisional que se reemplaza hasta confirmarse, sin duplicar frases ni tocar el
resto del borrador. Al terminar se manda el último trozo antes de `CloseStream`, para que lleguen las últimas palabras.
`POST /api/dictado` (`server/dictado.ts`) transcribe un audio entero; `GET /api/dictado` dice si hay llave.
No manda el mensaje solo. El audio pasa por memoria y no se guarda en disco. El botón dice que la voz va a Deepgram.

La llave es de quien usa Sloth: `DEEPGRAM_API_KEY` o el archivo `data/deepgram.key` (fuera del repo, en `.gitignore`).
Sin ella, el botón no sale. Nunca va en el navegador, en los errores, en los registros, en el instalador ni en este
documento. Las rutas solo atienden a la ventana de Sloth o a un dispositivo con sesión de la web; limitan el audio a
12 MB, un dictado a la vez y 60 segundos de espera a Deepgram.

## Si algún día lo da Sloth: un servicio en el cobro

Cambiar la llamada local a Deepgram por un servicio HTTPS de Sloth con su cuenta. La llave de Deepgram viviría solo en
los secretos de ese servicio, y el cliente mandaría el audio y recibiría `{texto}` con el mismo contrato de hoy.

Antes de publicarlo: cuenta por usuario, límites de duración y tamaño, cuota y concurrencia por cuenta, protección
contra abuso, cancelación, tiempo de espera y errores claros de saldo o disponibilidad. El servicio debe aceptar
WebSocket y conservar el orden de los trozos y las confirmaciones, con los provisionales aparte de los finales para no
duplicar frases ni pisar lo que se editó. Nunca un proxy público sin cuenta ni una llave compartida dentro de la app.
Definir con Deepgram qué conserva del audio; no registrar audio, transcripciones ni llaves. Medir latencia y costo sin
guardar contenido. Probar sin red, con el micrófono negado, en silencio, al cerrar la vista, con audios largos y al
volver tras un fallo.

Documentación: https://developers.deepgram.com/docs/live-streaming-audio
