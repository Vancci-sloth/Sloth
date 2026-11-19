# Un estilo se aprueba solo cuando cumple la vara

Fecha: 2026-11-19

## Contexto

Un estilo compartido no salía en la comunidad hasta que el creador lo aprobaba (ADR 0017). Para decidir pulsaba
«Revisar», que abría el paquete en una carpeta y dejaba un borrador de «Nuevo estilo» pidiéndole que lo leyera: tres
pasos a mano por cada estilo y por cada versión nueva, y mientras tanto la publicación no se ve. El creador pidió que la
IA lo revise, le conteste a su autor lo que le falta y, cuando lo tenga todo, lo apruebe ella.

Se pensó en recibirlos como PR con una etiqueta. No sirve: el repo es público y los estilos de la tienda son de quien
apoya, quien usa Sloth no tiene git, y lo que entra al repo hay que mantenerlo en cada versión.

Dos cosas lo impedían. No había una lista de qué necesita un estilo: estaba repartida entre `crear-estilo`, `video-base`
y lo que cada revisión recordara. Y un paquete es de un desconocido: su texto puede intentar mandar a quien lo lee, que
hasta ahora era un agente con todos sus permisos en la carpeta de las skills.

## Decisión

- **Todo estilo de la comunidad lleva lo mismo** (`shared/guia.ts`), y sin eso no se publica ni se aprueba:
  - su guía de uso, la misma plantilla para todos, que ahora dice también con qué de Sloth hace el video (solo código,
    Google Flow, voz generada…) y con qué agentes se probó, de listas fijas;
  - un video entero hecho con él;
  - su prueba: con qué agente y modelo se hizo ese video, cuánto costó y cuánto tardó. No se escribe: sale del hilo
    donde se hizo (`server/prueba-estilo.ts`). Su evidencia es ese hilo completo (lo que se le escribió al agente, lo
    que contestó y lo que hizo en cada turno), que sube aparte al publicar, cuando su autor marca que lo comparte, y
    que el cobro solo les da a él y al creador: «Ver la evidencia», en la publicación (`web/src/Evidencia.tsx`). Quien
    revisa el estilo también lo lee. Si ese hilo usó algo que la guía no dice, es una falla.

  Los que ya estaban sin eso dejan de verse en la tienda (migración 0033, que los deja como por aprobar y le avisa a
  cada autor): él los ve en rojo, con lo que les falta, en la barra, la tienda y su publicación, y al completarlos con
  «Compartir» se revisan y vuelven. Mientras tanto no suman en el fondo.
- **Una sola vara: `skills/video-base/ESTILO.md`**, «Lo que necesita todo estilo», 30 requisitos numerados. Con ella se
  hace un estilo (`crear-estilo`), se le avisa a su autor al compartirlo y se revisa. Los marcados (Sloth) los comprueba
  el código (`server/estilos-requisitos.ts`) sin leer lo que el estilo hace; un test los empareja con la vara y pasa
  por ella los seis estilos de Sloth, que son la referencia.
- **Llega por donde ya llegaba** («Compartir», al Worker) y **la revisión empieza sola**, en la computadora del creador
  (`server/estilos-revision.ts`): cada 15 minutos, y al acabar una, se pregunta qué estilos esperan; el que no se ha
  leído, o al que le cambiaron el paquete, se abre sin instalarlo y lo lee su Claude contra la vara. De uno en uno.
- **Quien lo lee solo puede leer** (`soloLeer`): Read, Grep y Glob, sin ningún MCP, sin subagentes y sin la
  configuración de ninguna carpeta, y trabaja en la carpeta de arriba, no en la del paquete. Comprobado con Claude Code:
  le llegan esas tres herramientas y ningún servidor. Solo Claude Code lo cumple: con otro agente el hilo no arranca.
- **Se aprueba solo si coinciden tres cosas** (`desenlaceDe`): Sloth no encontró ninguna falla, quien lo leyó dice que
  cumple lo demás, y no hay señales de riesgo. Cambia la última decisión del ADR 0017, «nada sale sin el creador».
  - Lo que el paquete puede torcer es lo que el agente dice de él. Por eso su «aprobar» no basta: lo que Sloth
    comprueba no lee texto, y manda.
  - **Las señales** son las líneas que se conectan a internet, lanzan otros programas, arman código al vuelo, leen lo
    del usuario o borran archivos. Casi todo estilo las tiene, heredadas del de Sloth del que partió: solo cuentan las
    que **añadió su autor** (las que no están en el original, tampoco con el nombre cambiado). Con una, aunque cumpla
    todo, decide el creador.
  - Se aprueba **el paquete que se leyó**: la aprobación lleva su llave y el cobro la vuelve a mirar. Si su autor mandó
    otro mientras tanto, no se aprueba y se lee el nuevo.
- **A su autor se le contesta solo**, con un comentario del creador en su publicación, que le llega a la campana y donde
  puede contestar: lo que le falta, o que lo aprueba el creador a mano. Es un comentario porque el cobro ya lo tiene.
  Del que no se aprobaría no se le dice nada: eso lo habla el creador.
- **Lo que Sloth comprueba se le dice antes de mandarlo**, en «Compartir», y **volver a compartirlo pone al día la misma
  publicación** (`data/estilos-compartidos.json`), no hace otra: el arreglo se revisa solo.
- **El hilo dice cómo acabó** en su nombre: «Aprobado», «Le falta», «Decide tú» o «No lo aprobaría». El creador solo
  abre los dos últimos. «Revisar», en la publicación, abre ese hilo.
- **Lo ya leído se apunta junto a la llave del creador**, que comparten su Sloth instalada y la del repo: con las dos
  abiertas, lo lee una.

## Consecuencias

- Un estilo puede llegar a la tienda sin que una persona lo haya visto. Lo que lo impide para lo peligroso son las
  señales, que son expresiones sobre el código: un autor que las esquive a propósito y además convenza al agente pasa.
  Quedan «Quitar aprobación», los reportes (con tres deja de verse) y el hilo «Aprobado» de cada uno, para mirarlo después.
- Solo se revisa con la Sloth del creador abierta; lo que llegó mientras tanto se lee al abrirla.
- Cada estilo gasta uso de su Claude, también cada versión nueva.
- La revisión es una lectura: nadie corre el estilo. Que el video salga lo enseña el que su autor sube con él.
- Un estilo que añade algo propio para bajar material o lanzar un programa espera siempre al creador. Si pasa mucho, lo
  que se repita va a `video-base`, de donde ya no es una señal.
- Mientras el cobro no se publique con la comprobación de la llave, entre leer la publicación y aprobarla queda un
  instante en que su autor podría cambiar el paquete.
- La skill `crear-estilo` ya no lleva «Revisar un estilo de la comunidad» ni su lista de qué se puede compartir: remite a la vara.
