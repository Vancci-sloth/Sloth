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
  apoyo activos, o el creador con su llave) y pone él el `X-Partner-User`.
- **Puede haber varias llaves, cada una con su saldo** (7 de noviembre de 2026): `VOICES_PK_LIVE`, `VOICES_PK_LIVE_2`,
  `_3`…, un secreto cada una. Cada llave es una cuenta de socio aparte: sus usuarios, créditos y voces clonadas no
  pasan a otra. Por eso cada quien vive en una sola (`voz_cuentas`, por el id de la llave, no por el nombre del secreto).
  Los nuevos entran en la de más saldo, y a quien se le acaba el saldo de la suya se muda a la de más saldo con sus
  créditos (se le quitan de la vieja) y se repite el pedido. Lo que clonó se queda en la vieja. Una llave nueva va en
  el siguiente número libre, nunca encima de otra: reemplazarla deja a sus usuarios sin su cuenta.
- **El usuario es el `id` de la primera licencia de su correo** (su cuenta gratis y su apoyo son el mismo), y el del
  creador, `creador`. Ni el correo ni la clave salen hacia Voices Cloning.
- **Los créditos los da el creador.** `VOZ_CREDITOS` (0 de entrada) son los de cada alta; con 0, la app solo ofrece
  Voices Cloning a quien tiene o tuvo créditos, que el creador da por correo desde Administrador. Así el saldo general
  no se gasta antes de decidir cuánto da cada plan. Mientras se prueba, `VOZ_SOLO_CREADOR` («1» desde el 6 de noviembre de
  2026) la deja solo para el creador, aunque alguien más tenga créditos: el cobro se lo niega a los demás.
- **Las voces se eligen en el menú «Voz» de Sloth**, como las de Fish Audio y ElevenLabs (cambió el 6 de noviembre de
  2026; antes, en su ventana `embed.js`, que se veía ajena y no dejaba grabar). El cobro sigue dando solo el pase de una
  hora (`/voz/sesion`); con él, el servidor de Sloth pide a su API, la misma que usa su ventana, los proveedores
  (`/api/v1/providers`), el catálogo con su búsqueda y sus filtros (`/api/v1/voices`) y clonar (`/api/v1/voices/clone`).
  El pase es de ese usuario, así que no deja gastar los créditos de otro, y la llave del socio no sale del cobro. Sus
  muestras son públicas y pasan por el mismo proxy que las demás. La elegida o clonada queda como `vc:<voice_id>`
  (`data/voz/voices-cloning.json`). Generar es el mismo `generar_voz` de siempre: el guion va por trozos, cada MP3 pasa a
  PCM con ffmpeg y queda el mismo WAV, así que ninguna skill cambia. Su ventana queda en Opciones → Voz para lo demás que
  ofrecen (diálogo, texto largo, transcribir).
- **Todo queda anotado en el cobro** (`voz_registro`, 180 días): cada alta, pase, voz, tarea y cambio de créditos, con lo
  que gastó y si falló, por qué. Administrador, en la Sloth del creador (la que tiene su `admin.txt`), lo junta con
  lo que dice Voices Cloning (saldo, usuarios, consumo) y deja sumar, quitar, suspender y dar de alta.

## Consecuencias

- Si el saldo de una llave se acaba (`partner_balance_empty`), sus usuarios se mudan a otra con saldo; si se acaba el
  de todas, falla para todos a la vez: el creador lo ve en Administrador, y AI Studio, Fish Audio y ElevenLabs siguen
  como respaldo. Quien se muda pierde sus voces clonadas (la app se lo dice al pedir una).
- Clonar con el micrófono no funcionaba dentro de su ventana (su `Permissions-Policy` lo bloquea): desde que se clona
  con su API, se graba en el menú de Sloth como con los demás.
- Su API para el pase de sesión no está documentada: es la que usa su ventana (vista el 6-nov-2026). Si la cambian, el
  menú lo dice y la voz sigue generándose por el cobro.
- La forma de su consumo (`/usage`) no está documentada: Administrador la enseña tal cual, como tabla.
- Los guiones y las grabaciones de quien usa estas voces van a un tercero: los términos y la privacidad de
  sloth.vancci.org deben decirlo.
