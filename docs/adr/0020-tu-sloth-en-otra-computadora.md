# Tu Sloth en otra computadora: una copia en la nube del cobro, con la clave

Fecha: 2026-11-15

## Contexto

En la comunidad preguntaron cómo pasar a su computadora de escritorio los estilos que hicieron en su portátil. Ya se
podía, uno por uno, con «Compartir» → archivo `.sloth-estilo` e «Importar» (ADR 0017), pero no se encontraba y deja fuera
lo personal y los chats. El creador pidió otra cosa: que al poner la misma clave en la otra computadora, Sloth pregunte
si se trae todo (estilos, chats, su información), que a él no le cueste nada y que para ellos sea lo más sencillo
posible, para todos los que tienen cuenta.

Para que funcione con la otra computadora apagada (o perdida), lo suyo tiene que estar guardado en algún lado antes de
que lo pidan. La clave ya identifica a cada quien en el cobro, que ya tiene R2 y D1.

## Decisión

- **Cada Sloth con clave guarda sola una copia de lo suyo en el cobro** (`server/respaldo.ts`,
  `licencias/src/respaldo.ts`): a los dos minutos de abrir y cada tres horas, solo si algo cambió y pasó una hora desde
  la última. Una copia por clave y computadora, encima de la anterior: el paquete en R2 (`respaldos/`) y su ficha en D1
  (migración 0031). Se puede apagar en Opciones, y apagada se borra de la nube.
- **Entra lo que es suyo y pesa poco:** sus estilos enteros (con huellas, banco y poses, que al compartir no viajan),
  sus chats del más nuevo al más viejo, «Sobre ti» y las marcas de sus canales. **No entran** los videos ni sus carpetas
  (pesan GB), los modelos 3D, ni nada con lo que se entra a algo: las cuentas de los agentes, de Google y de las redes y
  las llaves de API se conectan otra vez en cada computadora.
- **La otra computadora la ofrece traer** (`web/src/Respaldo.tsx`): al escribir la clave, o al abrir una que ya la
  tenía y a la que le faltan estilos de la otra. «Ahora no» no vuelve a preguntar sola; en Opciones se puede traer
  cuando sea. Las claves de un mismo correo (la cuenta gratis y la del apoyo) ven las mismas copias.
- **Traer no pisa nada.** Un estilo o un chat que ya está aquí se queda como está; «Sobre ti» solo entra si aquí está
  vacío y una marca, si no hay una con ese nombre. Un chat que llega no tiene la sesión del agente de allá: su siguiente
  mensaje abre una con el resumen de lo hablado, como un relevo, en la carpeta de su estilo de aquí.
- **No tiene que costar.** R2 da gratis 10 GB y un millón de escrituras al mes, y ahí están también los instaladores y
  lo de la comunidad. Cada copia pesa hasta 25 MB (si no cabe, van menos chats y luego los estilos sin lo personal),
  todas juntas hasta 5 GB (lleno, las nuevas esperan), cada computadora sube una cada media hora como mucho y la que
  nadie renueva en 90 días se borra (la app la renueva al mes aunque nada cambie).

## Consecuencias

- Los chats y los estilos de quien tiene clave quedan guardados en la nube de Sloth, con el nombre de su computadora.
  Solo los baja una clave del mismo correo, activa, desde una computadora que la usa (dos a la vez). El aviso de
  privacidad de la página tiene que decirlo.
- La copia tiene hasta tres horas de atraso: lo hecho justo antes de cerrar Sloth viaja la siguiente vez que se abra.
- No es sincronizar: cada computadora sigue con lo suyo y trae lo de la otra cuando se le pide. Borrar algo en una no
  lo borra en la otra.
- Los videos no viajan. Un chat traído enseña lo hablado, pero su carpeta de video se quedó en la otra computadora.
- Si se llena el tope de 5 GB, las copias nuevas no suben hasta que caduquen otras: se sube `TOTAL` solo si R2 pasa a
  ser de pago.
- Quien usa una Sloth anterior no tiene copia: la portátil tiene que actualizarse y abrirse una vez.
