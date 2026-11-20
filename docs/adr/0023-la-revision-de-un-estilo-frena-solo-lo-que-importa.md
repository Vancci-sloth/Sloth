# La revisión de un estilo frena solo lo que importa

Fecha: 2026-11-19

## Contexto

El mismo día en que la revisión empezó a cerrarse sola (ADR 0022) leyó once paquetes de ocho estilos y no aprobó
ninguno. Corrió bien: solo leyendo, sin errores, unos dos minutos cada una. Lo que falló fue la regla, «se aprueba
cuando cumple los 30»:

- Casi todo lo que pidió eran detalles: un paso sin su «listo», no nombrar la línea `Imágenes:`, no mandar comprobar el
  video, y en cinco de los ocho los acentos rotos de su card («CinematogrÃ¡ficos»), que deja un agente al reescribir un
  archivo en Windows. De esos ocho, cinco no tenían nada peligroso ni nada que impidiera hacer el video.
- A dos autores que arreglaron lo pedido y lo volvieron a mandar se les contestó con otra lista, de cosas que ya estaban
  la primera vez y no se les habían dicho.
- Dos fallas eran de lo que Sloth ya sabía: que la prueba se hizo con un agente, o usó una herramienta, que la guía no
  marcaba. La prueba no la escribe nadie, sale del hilo.

La tienda se quedó en cero estilos y sus autores, con una lista tras otra.

## Decisión

- **Frena lo que le importa a quien lo instala**: lo que comprueba Sloth; que le salga el video sin programar nada, en
  Windows, Mac o Linux (17); «Lo que no hace» (22 a 26); y que no prometa lo que no hace ni gaste lo que no dice (28).
  Lo demás de la vara sigue siendo la vara, pero no frena: quien lo lee lo da como `sugerencias`, que le llegan a su
  autor con su aprobación (`respuestaAlAutor`). Lo dice `skills/video-base/ESTILO.md`, «Cómo se aprueba en la comunidad».
- **Lo que Sloth sabe arreglar, lo arregla** en vez de devolverlo:
  - los acentos rotos (`shared/acentos.ts`), al empaquetar y al abrir un paquete (`cardLimpia`), en su guía (`guiaDe`) y
    en lo que la comunidad guarda y enseña (`texto` y `armar` en `licencias/src/comunidad.ts`). Lo que ya estaba
    guardado mal sale bien sin que nadie lo vuelva a mandar;
  - a su guía se le pone el agente de su prueba y lo que ese hilo usó (`guiaConSuPrueba`).
- **Al que vuelve se le mira lo que se le pidió**: la lista queda apuntada (`pedido`) y quien lee el paquete nuevo la
  recibe; lo que ya estaba entonces y no se le dijo no se le pide ahora, salvo que frene.
- **Los que se quedaron en «Le falta» con la regla de antes se leen otra vez con esta** (`REGLA`), una vez y sin que su
  autor los vuelva a mandar.
- Las señales no cambian: con una línea que lanza otro programa, se conecta o borra, lo aprueba el creador a mano.

## Consecuencias

- Salen en la tienda estilos con detalles por pulir. Lo que se ve de ellos (su card y su guía) va bien escrito; dentro,
  un `SKILL.md` puede tener un paso sin su «listo».
- Casi todo estilo une sus clips con `ffmpeg`, que es una señal: la mayoría acaba en «Decide tú» y espera al creador.
  Lo que se repita va a `video-base`, de donde ya no es una señal.
- Qué frena y qué no lo juzga quien lo lee: un mismo estilo puede caer de un lado u otro. Lo que se le pidió queda
  apuntado, así que al menos no cambia entre una vuelta y la siguiente.
- La revisión corre en la Sloth del creador: vale desde que tenga la versión que lo trae. Lo de los acentos y la guía
  en la comunidad vale desde que se publica el cobro.
