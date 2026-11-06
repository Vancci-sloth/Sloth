# Voz con Voices Cloning: la llave del socio en el cobro, los créditos los da el creador

Fecha: 2026-11-06

## Contexto

Voices Cloning (www.voicescloning.art) es el proveedor de voz oficial de Sloth. No es una llave por persona, como Fish
Audio o ElevenLabs: Sloth es su socio, con una llave `pk_live_…` y un saldo general que el creador recarga pagándoles.
Cada quien es un usuario suyo (`external_id`) con sus créditos, y gasta los suyos y el saldo general a la vez. Su guía
pide que la llave viva en «tu servidor», pero el servidor de Sloth corre en la computadora de cada quien: ahí cualquiera
la sacaría del instalador, y con ella el encabezado `X-Partner-User` dejaría gastar los créditos de otro.

## Decisión

- **La llave vive en el cobro** (`licencias/`, secreto `VOICES_PK_LIVE`), y el cobro es el único que habla con Voices
  Cloning (`licencias/src/voz.ts`). Sabe quién pide como en la comunidad (la clave y la computadora de una cuenta o un
  apoyo activos, o el creador con `PUBLICAR`) y pone él el `X-Partner-User`.
- **El usuario es el `id` de la primera licencia de su correo** (su cuenta gratis y su apoyo son el mismo), y el del
  creador, `creador`. Ni el correo ni la clave salen hacia Voices Cloning.
- **Los créditos los da el creador.** `VOZ_CREDITOS` (0 de entrada) son los de cada alta; con 0, la app solo ofrece
  Voices Cloning a quien tiene o tuvo créditos, que el creador da por correo desde Administrador. Así el saldo general
  no se gasta antes de decidir cuánto da cada plan. Mientras se prueba, `VOZ_SOLO_CREADOR` («1» desde el 6 de noviembre de
  2026) la deja solo para el creador, aunque alguien más tenga créditos: el cobro se lo niega a los demás.
- **Las voces se eligen en su ventana** (`embed.js`, un iframe suyo con `frame-ancestors *`), con un pase de una hora
  que pide el servidor de Sloth al cobro. La elegida o clonada queda en el menú «Voz» como `vc:<voice_id>`
  (`data/voz/voices-cloning.json`). Generar es el mismo `generar_voz` de siempre: el guion va por trozos, cada MP3 pasa a
  PCM con ffmpeg y queda el mismo WAV, así que ninguna skill cambia.
- **Todo queda anotado en el cobro** (`voz_registro`, 180 días): cada alta, pase, voz, tarea y cambio de créditos, con lo
  que gastó y si falló, por qué. Administrador, en la Sloth del creador (la que tiene su `publicar.txt`), lo junta con
  lo que dice Voices Cloning (saldo, usuarios, consumo) y deja sumar, quitar, suspender y dar de alta.

## Consecuencias

- Si el saldo general se acaba (`partner_balance_empty`), falla para todos a la vez: el creador lo ve en
  Administrador, y AI Studio, Fish Audio y ElevenLabs siguen como respaldo.
- Clonar con el micrófono no funciona dentro de su ventana (su `Permissions-Policy` lo bloquea, y Sloth no da permisos a
  páginas de fuera): se clona subiendo una grabación.
- La forma de su consumo (`/usage`) no está documentada: Administrador la enseña tal cual, como tabla.
- Los guiones y las grabaciones de quien usa estas voces van a un tercero: los términos y la privacidad de
  sloth.vancci.org deben decirlo.
