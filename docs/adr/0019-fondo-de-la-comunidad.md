# El fondo de la comunidad: la mitad de la tarjeta, por puntos públicos

Fecha: 2026-11-13 (el reparto, quién entra a Estilos y el primer cierre: 2026-11-15)

## Contexto

El creador quiere que quienes suben estilos a la comunidad, y que la gente usa, se lleven parte de lo que entra, para
que se compartan más estilos y para que más gente apoye. Sloth cobra con PayPal, Mercado Pago, Stripe (tarjeta) y cripto,
y no medía nada de lo que se hace con un estilo compartido (ADR 0017).

## Decisión

- **La bolsa es la mitad de los apoyos de Sloth que cobra Stripe en el mes de Ciudad de México** (desde el 20-nov-2026, no
  otros cobros de la cuenta, como un link de pago), ya sin la comisión de Stripe, sin lo
  devuelto y sin el IVA (`licencias/src/fondo.ts`). El IVA se saca de las sesiones y las facturas del mes, porque los
  precios lo llevan dentro. Arriba de la comunidad se ve en vivo (`web/src/Fondo.tsx`), con las cuentas ya hechas:
  entró, comisión, devuelto, IVA, queda y la mitad.
- **Se paga por Binance, con el Binance ID de cada quien.** Stripe Connect no sirve: una cuenta de México solo le paga
  a cuentas de México. Mientras Binance Pay no abra la cuenta de comerciante, el creador lo manda a mano desde Binance.
- **Participar es de quien quiera** (`licencias/src/reparto.ts`): quien pone su Binance ID se lleva del fondo la parte
  de los puntos de sus estilos; sin él, sus puntos se ven pero el fondo se reparte entre los demás. Lo que gana cada
  quien depende de cuánta gente usa su estilo. Como casi nadie lo ponía (el 19 de noviembre de 2026, 8 de 29 autores,
  y 1 de los 4 con un estilo en la tienda), **a quien le aprueban un estilo sin haberlo puesto se le dice cómo**, una
  vez, con un comentario del creador en su publicación (`shared/fondo.ts`, `cambiar` en `licencias/src/comunidad.ts`),
  y «Compartir» lo dice entre lo que sigue (`web/src/Estilos.tsx`). Sigue sin ser obligatorio.
- **El primer reparto es el 1 de enero de 2027** y junta lo que entra desde el 15 de noviembre de 2026 a las 14:45 de
  Ciudad de México (`DESDE` en `fondo.ts`): hay tiempo para hacer un estilo y compartirlo. Lo que Stripe había cobrado
  antes, también lo de noviembre, es del creador y no entra. Después, cada mes.
- **El creador cierra cada periodo en Administrador → Fondo** (`web/src/FondoAdmin.tsx`), cuando ya terminó y después
  de revisar las pruebas. Al cerrar queda una foto: el fondo, los puntos y el Binance ID de ese momento. Paga cada parte
  y la marca con su referencia, que le avisa por correo a quien cobró.
- **Los estilos de la comunidad los ve cualquiera; instalarlos es de quien apoya** (desde el 19 de noviembre de 2026).
  Quien no apoya recorre la tienda entera, con el video y los números de cada estilo, y los ve en el feed y en el
  buscador; al pulsar «Instalar» le sale la invitación a apoyar, y el cobro no le entrega el paquete. Antes no veía
  nada: la sección solo le decía cuántos había, y no sabía qué se perdía. Compartir un estilo sigue siendo de cualquiera.
- **Los puntos de cada estilo son públicos** y se reparten por partes (`licencias/src/tienda.ts`, `PUNTOS`): 3 por
  persona distinta que termina un video con él, 1 por video (hasta 10 por persona al mes) y 10 por variante aprobada de
  otra persona. Las descargas y los me gusta se ven, pero no dan puntos: se inflan fácil.
- **La app mide** (`server/estilos-usos.ts`): al arrancar y al acabar cada turno, avisa los videos terminados de los
  estilos que vinieron de la comunidad, con cuál estilo, la huella del archivo y su portada. La descarga la avisa la
  instalación. Una variante es un estilo compartido que dice de cuál salió (`de` en su adjunto, del `origen` o el
  `deComunidad` de su card), y el creador lo ve al aprobarlo.
- **Como la app de cada quien podría mentir, el Worker no le cree sin más:**
  - Cada video lleva su portada de prueba, subida a R2 por la misma cuenta; sin ella no cuenta. Solo la ve el creador.
  - Una persona son las computadoras y las conexiones que se tocan (la IP se guarda cifrada con `FIRMA`, solo su
    prefijo): una granja de computadoras en una conexión vale una persona con su tope.
  - Una cuenta de menos de 7 días no suma videos.
  - No cuenta lo del autor, ni desde las computadoras de las cuentas de su correo; un video cuenta una vez por su
    huella; solo cuentan los estilos aprobados, y los del creador de Sloth no se llevan del fondo.
  - El creador revisa las pruebas de cada estilo, agrupadas por persona, en la tienda («Revisar pruebas») y descarta
    lo falso antes de pagar: un video, o todo lo de una cuenta en el mes.
  - Solo suman los videos de cuentas que apoyan: cada persona falsa cuesta un apoyo de verdad.
- **Y con el dinero:** un Binance ID va en una sola cuenta de Sloth (Binance pide identificación: una persona, un ID);
  solo lo ven su dueño, tapado, y el creador al pagar. Cada cambio queda anotado con su conexión cifrada, avisa por
  correo al dueño de la cuenta y tiene su tope al día. Al pagar, cada parte trae sus avisos: el ID cambiado en la
  última semana, la cuenta vigilada, o que la mayoría de las cuentas que usaron sus estilos se abrieron en el periodo.

## Consecuencias

- Solo se mide desde la versión de la app que trae esto. Lo de antes no se recupera, salvo las variantes publicadas.
- Dos personas de verdad en la misma casa cuentan como una: se acepta, es lo que cierra la puerta a las granjas.
- Inventar videos ya no basta: hace falta una portada que parezca del estilo, una cuenta con días, otra conexión, y
  pasar la revisión del creador.
- El envío del dinero es a mano hasta que Binance Pay abra la cuenta de comerciante: entonces el pago puede salir
  desde Administrador con la misma foto del reparto.
- Una Sloth de antes de esta versión ya no instala estilos de la comunidad: el paquete se pide con la cuenta.
- Solo cuenta lo que entra con tarjeta (Stripe): los apoyos por Mercado Pago y cripto dan entrada a los estilos,
  pero no suman al fondo.
