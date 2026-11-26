# Dictado y futura migración a un servicio central

## Implementación local

El micrófono del compositor graba hasta 60 segundos con MediaRecorder. Envía fragmentos de 250 ms
por WebSocket a `/api/dictado/vivo`. El backend conecta con Deepgram `/v1/listen` con Nova-3
multilingüe, preferencia por español, resultados provisionales y formato inteligente. Los parciales
aparecen directamente en el campo del mensaje; se reemplaza el fragmento provisional hasta
confirmarlo, sin duplicar frases ni reemplazar todo el borrador.
Al terminar se envía el último fragmento antes de CloseStream para recibir las últimas palabras.
La ruta anterior `POST /api/dictado` sigue disponible para audio completo.
No envía el mensaje automáticamente. El audio se procesa en memoria y no se guarda en disco.

La clave se obtiene de `DEEPGRAM_API_KEY` o de `data/deepgram.key`, ignorado por Git. No incluir
claves en este documento, el frontend, mensajes de error, instaladores ni registros. La ruta usa
la protección de origen del servidor local, limita el cuerpo a 12 MB, una transcripción concurrente
y 60 segundos de espera al proveedor. Requiere reiniciar el backend tras instalar esta versión.

## Próxima actualización: servicio de VyMotion

Sustituir la llamada local a Deepgram por un servicio HTTPS autenticado de VyMotion. La clave
del proveedor debe vivir exclusivamente en los secretos de ese servicio. El cliente local enviará
el audio y recibirá `{texto}` con el mismo contrato que usa hoy el compositor.

Antes de publicarlo: autenticación por usuario, límites de duración y tamaño, cuota y concurrencia
por cuenta, protección contra abuso, cancelación, timeout y errores claros de saldo o disponibilidad.
El servicio debe aceptar WebSocket y conservar el orden de fragmentos y confirmaciones. Mantener
resultados provisionales separados de los finales para no duplicar frases ni sobrescribir ediciones.
No desplegar un proxy público sin autenticación ni distribuir una clave compartida en la app.
Definir retención y tratamiento del audio con el proveedor; evitar registrar audio, transcripciones
y credenciales. Medir latencia y coste sin conservar contenido. Probar pérdida de red, micrófono
denegado, silencio, cierre de vista, audios largos y recuperación tras un fallo.

Documentación: https://developers.deepgram.com/docs/pre-recorded-audio
