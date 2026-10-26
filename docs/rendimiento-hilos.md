# Navegar entre hilos

El 12 de octubre de 2026 se reprodujo una apertura de 5,5 s y otra de 11,7 s. Un JSONL de 285 MB contenía 283 MB de actualizaciones de herramientas: Codex repetía la salida acumulada en cada fragmento. El panel de cambios también ejecutaba Git síncrono desde el servidor principal.

Codex guarda fragmentos; la pantalla lee una vista compacta en `data/sessions/vistas`, validada contra tamaño y fecha del JSONL. El original sigue intacto y los índices del WebSocket se conservan. Git se lee en un worker. El navegador se suscribe al hilo abierto y el servidor agrupa su streaming cada 50 ms. Se conservan cuatro hilos quietos recientes y se dibujan 60 bloques al abrir; los anteriores se cargan con el botón.

Con los mismos archivos, las rutas nuevas en un servidor de medición aislado y la interfaz real dieron 87 ms y 387 ms; volver, 52 ms; nuevo chat, 18–33 ms. El hilo trabajando abrió en 138 ms. La vista del historial grande pesa 4,6 MB. Reconstruirla sin caché tarda unos 1,3 s; leerla después de un reinicio, 19 ms. El backend principal espera el reinicio automático para aplicar los cambios.

Pruebas: `node --import tsx --test server/historial.test.ts server/sessions-historial.test.ts shared/historial.test.ts server/eventos-en-vivo.test.ts server/codex.test.ts server/cambios-sloth.test.ts`. Verificar también `npm run typecheck`.

La suscripción por hilo sigue el criterio descrito en la [arquitectura de T3 Code](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md): cada cliente recibe el estado que necesita para su vista.
