# Estilos pre-aprobados por Sloth

Fecha: 2026-11-20

## Contexto

Aunque la revisión ya frena solo lo que importa (ADR 0023), el 20 de noviembre había 69 estilos en la tienda y solo 11
a la vista: 58 esperaban en revisión. Muchos eran estilos que funcionaban, pero les faltaba su guía, su video entero o
su prueba (la migración 0033 escondió los que ya estaban sin eso), o algo que pidió la revisión. Todo eso lo tenía que
arreglar su autor, y casi nadie volvía a hacerlo. Ni el creador los podía aprobar: el cobro rechaza el estilo de otro al
que le falta algo.

Además, cuando el autor de un estilo ya aprobado mandaba otro paquete, el estilo se escondía hasta que se aprobara el
nuevo. Quien lo mejoraba lo sacaba de la tienda mientras tanto.

## Decisión

- **Un tercer estado, «Pre-aprobado por Sloth»** (`aprobada = 2`): el creador le hizo el video de prueba, le completó lo
  que faltaba y le arregló sus errores, y ya lo ve toda la comunidad. Se instala, cuenta en el fondo y suma puntos para
  su autor igual que uno aprobado. El estilo sigue siendo de su autor: su nombre, sus comentarios y sus me gusta.
- **Cómo lo hace el creador:** «Pre-aprobar», en la publicación, instala el estilo como una card suya y abre un borrador
  con lo que se le pide a su agente: la prueba como la haría quien lo instala, lo que pidió la revisión y lo que le
  falta (`paraPreaprobar` en `server/comunidad.ts`). Al terminar, «Compartir» en esa card pone al día la publicación
  del autor y la deja pre-aprobada; el creador escribe qué le cambió, y eso le llega a su autor en un comentario.
- **Su autor decide:** «Así está bien» la pasa a aprobada (`/conforme`). Si no le gusta, la cambia y la vuelve a
  compartir: su versión se revisa como cualquier otra.
- **Lo que ya se veía se sigue viendo** (`publica`, migración 0035): si el autor de un estilo a la vista, aprobado o
  pre-aprobado, manda otro paquete, la comunidad sigue viendo el de antes hasta que se apruebe el nuevo. Su autor y el
  creador ven lo nuevo, con «En revisión». Vale para todos los estilos, no solo para los pre-aprobados.
- **Correrlo es otra cosa que leerlo:** la revisión solo lee, a propósito, pero el video de prueba corre el código de
  otra persona en la computadora del creador. Antes de instalarlo, Sloth lo vuelve a comprobar
  (`antesDePreaprobar`); con una señal de riesgo, o si quien lo leyó dijo que no lo aprobaría, «Pre-aprobar» dice lo
  que encontró y espera a que el creador lo revise («Ya lo revisé: pre-aprobar»).

## Consecuencias

- Los estilos salen a la vista sin esperar a su autor. El trabajo lo pone el creador: un video de prueba por estilo.
- Casi todo estilo une sus clips con `ffmpeg`, que es una señal (ADR 0023): casi siempre hay que pasar por «Ya lo
  revisé».
- Al pre-aprobarlo, el paquete, el video y la prueba de su autor se reemplazan por los del creador. Su autor conserva
  el suyo en su card y puede bajar el arreglado aunque no apoye (`enLoSuyo` en `licencias/src/comunidad.ts`).
- Lo que se cuenta de cada estilo (la tienda, el fondo, la página de venta) es lo que está a la vista (`aLaVista`), no
  solo lo aprobado.
- El estado nuevo vale desde que se publica el cobro con la migración 0035; «Pre-aprobar» y su «Compartir», desde la
  versión de Sloth que los trae, en la computadora del creador.
