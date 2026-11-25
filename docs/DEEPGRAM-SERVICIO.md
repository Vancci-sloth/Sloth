# Dictado con Deepgram

## Cómo va

El micrófono del compositor (`web/src/Dictado.tsx`) graba hasta 60 segundos con MediaRecorder y manda trozos de
250 ms por WebSocket a `/api/dictado/vivo` (`server/dictado-vivo.ts`). El servidor los pasa al cobro
(`licencias/src/dictado.ts`, `/dictado/vivo`), que los pasa a Deepgram `/v1/listen` con Nova-3 multilingüe,
preferencia por español, resultados provisionales y formato inteligente, y devuelve sus mensajes tal cual. Los parciales
entran al campo en un solo trozo provisional que se reemplaza hasta confirmarse, sin duplicar frases ni tocar el resto
del borrador. Al terminar se manda el último trozo y «fin» (el cobro lo vuelve `CloseStream`), para que lleguen las
últimas palabras. No manda el mensaje solo. El audio pasa por memoria y no se guarda ni en disco ni en el cobro.

## Quién dicta

Solo quien apoya a Sloth hoy (`apoya`; también los lugares gratis de por vida de cuando se vendía) y el creador. Una
cuenta gratis no: `GET /api/dictado` le pregunta al cobro y, si dice que no, el botón no sale. El cobro reconoce a quien
pide como las voces de Sloth (`quien` de `voz.ts`: la clave y el equipo de la app, o la llave del creador).

Cada quien: un dictado a la vez, 80 s, 12 MB y `DICTADO_MINUTOS` al día (30 si no se pone; el creador no tiene tope).
Lo único que se anota es cuánto dictó cada quien por día (`dictado_uso`, migración 0038); el cron borra lo de más de 35
días.

## Las llaves y su rotación

Son de Sloth y viven solo en los secretos del cobro: `DEEPGRAM_API_KEY` y, si hay más, `DEEPGRAM_API_KEY_2`, `_3`…
Una nueva va en el siguiente número libre. Se crean en la consola de Deepgram con rol **Admin** u **Owner**: la de
rol Member (la de siempre) dicta, pero no deja leer el saldo.

Se usan en orden. Antes de cada dictado, el cobro mira el saldo de la llave (`saldoDe`: `GET /v1/projects` una vez
por Worker para su proyecto, y `GET /v1/projects/{id}/balances`, la suma de sus `amount` en USD). Si tiene menos de
`DICTADO_SALDO_MINIMO` (0.05 dólares si no se pone, mucho más de lo que cuesta un dictado de 80 s), se anota agotada
(`dictado_llaves`, por su id, no la llave) y se pasa a la siguiente antes de abrir, para que ningún dictado se corte a
medias. Si el saldo no se pudo leer (llave Member, Deepgram lento), se intenta igual, y si Deepgram la rechaza al
abrir (402 sin saldo, 401 o 403 revocada), también se anota y se prueba la siguiente en el mismo dictado. Si ninguna
tenía saldo, se prueban todas de todos modos (una cuenta con pago por uso puede marcar 0 y dictar). Las agotadas van al
final; si una vuelve a servir (la recargaron), se le quita la marca. Si Deepgram está lleno (429), se prueba la
siguiente sin marcar nada. Un dictado ya abierto no cambia de llave: el mínimo cuida que alcance.

Para ver cómo van: `GET /dictado` con la llave del creador dice cada llave (`llaves`: su secreto, sus últimas cuatro
letras, su saldo en dólares si se pudo leer y desde cuándo está agotada).

Nunca van en la app, en el navegador, en los errores, en los registros ni en este documento.

## Encenderlo o poner otra llave

```
npm run licencias -- d1 migrations apply sloth-licencias --remote   # una vez
npm run licencias -- secret put DEEPGRAM_API_KEY                    # la siguiente: DEEPGRAM_API_KEY_2, _3…
npm run licencias -- deploy                                         # solo la primera vez: un secreto nuevo no lo pide
```

La app tiene que ser de una versión con este dictado: las de antes no saben ir al cobro. Para probar contra otro cobro:
`SLOTH_COBRO`.

Pendiente: apagar en cada proyecto de Deepgram el Model Improvement Program, para que no guarde el audio; medir latencia
y costo sin guardar contenido; probar sin red, con el micrófono negado, en silencio, al cerrar la vista y al volver tras
un fallo.

Documentación: https://developers.deepgram.com/docs/live-streaming-audio
