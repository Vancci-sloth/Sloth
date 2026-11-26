# Conexiones de VyMotion con Sloth

Inventario revisado en el código el 17 de noviembre de 2026. Sirve como referencia para independizar VyMotion.
Describe las conexiones implementadas. La actividad real depende de las funciones usadas y de la configuración.

## Dirección del servicio

El servicio principal es `https://api.sloth.vancci.org`.

- `server/licencia.ts` exporta la constante `COBRO`.
- `electron/main.ts` define su propia constante `COBRO` para las actualizaciones.
- `server/comunidad.ts` y `server/voz/voices-cloning.ts` aceptan `SLOTH_COBRO` como dirección alternativa.
  Cambiar esa variable solo redirige esos módulos. Cuenta y actualizaciones requieren revisar sus constantes.

Los endpoints `/api/...` del servidor local de VyMotion actúan como intermediarios en varias de estas funciones.
La dirección local por defecto es `http://localhost:4848`.

## Cuenta, clave y apoyo

Implementación local en `server/licencia.ts`. Servicio remoto en `licencias/src/index.ts`.

- `POST /licencia` valida la clave y el identificador de equipo. Devuelve datos firmados sobre la cuenta y su vigencia.
- `POST /suscribir` crea una cuenta gratis o inicia el apoyo. Puede recibir correo, plan, equipo y aceptación de términos.
- `POST /cancelar` solicita cancelar la suscripción asociada a la clave.
- `POST /pago` obtiene un enlace de pago para la cuenta.

La interfaz accede a estas operaciones mediante `/api/licencia`, `/api/licencia/clave`,
`/api/licencia/unirse`, `/api/licencia/apoyar`, `/api/licencia/cancelar` y `/api/licencia/pago`.
`/api/licencia/credencial` entrega al cliente autorizado los datos que utiliza al consultar actualizaciones.

El estado firmado se guarda en `data/licencia.json`. La credencial se comparte con Comunidad y voces.
Al retirar esta conexión, hay que decidir cómo manejar la cuenta local, los estados de apoyo y los componentes
que consumen esa credencial. Revisa también `web/src/Licencia.tsx` y `web/src/Tienda.tsx`.

## Voces y créditos de Sloth

Implementación local en `server/voz/voices-cloning.ts`. Backend en `licencias/src/voz.ts`.
En la interfaz aparece como «Voces de VyMotion».

- `/voz` consulta disponibilidad, créditos y consumo.
- `/voz/sesion` obtiene un pase temporal para acceder al proveedor Voices Cloning.
- `/voz/tts` recibe el texto y el identificador de voz para generar narración y contabilizar créditos.
- `/voz/admin...` gestiona el panel administrativo de usuarios, créditos y estados.

Algunas operaciones de catálogo y clonación se hacen directamente contra Voices Cloning usando el pase que
proporciona Sloth. Sustituir únicamente la URL de generación dejaría esa dependencia.

Se guardan preferencias en `data/voz/voices-cloning.json` y datos del panel en otros archivos de `data/voz/`.
Para retirarlo, revisa la generación, las muestras, el catálogo, la clonación, los créditos y las pantallas de
`web/src/Voz.tsx`, `web/src/ElegirVoz.tsx` y Administrador.

Google AI Studio, Fish Audio y ElevenLabs tienen conexiones propias en `server/voz/`.
Su configuración puede servir como alternativa al servicio de créditos de Sloth.

## Comunidad y estilos compartidos

Implementación local en `server/comunidad.ts`. Backend en `licencias/src/comunidad.ts` y módulos relacionados.

El servidor local retransmite operaciones de Comunidad al Worker remoto con la credencial de cuenta o de creador.
Entre las rutas utilizadas están las siguientes.

- `/comunidad/archivo` sube archivos y `/comunidad/archivo/<llave>` los descarga.
- `/comunidad/publicar` crea publicaciones.
- `/comunidad/p/<id>` consulta publicaciones.
- `/comunidad/buscar` busca contenido.
- `/comunidad/estilos/uso` registra el uso de estilos compartidos.

El conjunto `/comunidad/*` incluye más operaciones de feed, comentarios, perfiles, moderación y estilos.
La rifa, el fondo, la tienda y el reparto también viven en módulos de `licencias/src/`.
Antes de quitar el proxy, revisa sus consumidores en `web/src/Comunidad.tsx`, `web/src/Estilos.tsx`,
`web/src/Tienda.tsx`, `web/src/Rifa.tsx` y `web/src/Fondo.tsx`.

La creación y el uso de estilos locales tienen su propio almacenamiento. La distribución mediante Comunidad
necesita un servicio sustituto si se desea conservar esa función.

## Actualizaciones y descargas de la aplicación

Implementación en `electron/main.ts`, configuración en `scripts/compilar.mjs` y publicación en `scripts/publicar.mjs`.

- `/ultima?so=<sistema>` consulta la versión publicada.
- `/actualizaciones...` suministra el canal de actualización que consume electron-updater.
- `/descargar?so=<sistema>&visto` abre la descarga manual en las plataformas que la requieren.

La credencial de apoyo puede intervenir al seleccionar la versión disponible.
Para independizar las actualizaciones, hay que configurar un canal propio, publicar sus metadatos y binarios,
y comprobar el proceso en Windows, macOS y Linux.

Las actualizaciones de Claude Code, Codex y OpenCode consultan npm desde `server/agentes.ts`.
Son un mecanismo distinto del actualizador de la aplicación.

## Pagos, correo y enlaces asociados

El backend incluido en `licencias/` contiene integraciones con PayPal, Stripe, Mercado Pago, NOWPayments y Resend.
Esas llamadas se ejecutan en el backend cuando corresponde. Requieren sus propias cuentas y secretos al desplegar
un servicio de VyMotion.

También quedan enlaces a `https://sloth.vancci.org` para descargas, términos, apoyo y páginas de cuenta.
Hay que revisarlos junto a la API para que las pantallas conduzcan al servicio elegido.

## Orden sugerido para la retirada

1. Elegir el destino de cuentas, Comunidad, voces con créditos y actualizaciones.
2. Desacoplar las credenciales compartidas entre esos módulos y sus componentes de interfaz.
3. Sustituir los endpoints y los enlaces web que se conserven.
4. Revisar la lectura de datos existentes y los mensajes de error al estar sin conexión.
5. Probar creación de videos con proveedores propios y generación local, además de cada función remota conservada.
6. Verificar las actualizaciones de la app en los tres sistemas antes de publicar un instalador independiente.

Este documento es un inventario y una guía de revisión. La retirada de las conexiones queda pendiente.
