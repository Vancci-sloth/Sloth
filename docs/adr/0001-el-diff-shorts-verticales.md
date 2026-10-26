# El vertical de El Diff son shorts, compuestos en 9:16 y pensados por su SMP

Fecha: 2026-10-08

Reemplazada en parte el 2026-10-16: Sloth ya no tiene el plan de shorts (3), el selector de duración (5), la voz del
lote (6) ni «Ambos» en El Diff.

## Contexto

El lote del 7 de octubre (20 enlaces, «Formato: solo vertical», «Voz: Gemini») se revisó hilo por hilo (los 9 que
llegaron a la fase 2). Lo que salió:

- **El vertical no se componía en vertical.** `guion.py` se escribía en coordenadas de capturas anchas, el paso 5 se
  revisaba en 16:9 (un video que no se publica) y `redes.py` metía cada escena en la franja de 1080×1156 de un corte de
  Shorts: el gancho fijo los 7 minutos, el episodio horizontal desenfocado detrás (que se vuelve a montar en cada
  cuadro) y un cierre de «VIDEO COMPLETO EN EL CANAL» en un video que ya era el completo. En la primera revisión a 360
  px, de 20 a 45 escenas por episodio tenían lo citado a 5–8 px.
- **Duraban 6 a 7 minutos.** No cuentan como Short (YouTube: 3 minutos como mucho). Los guiones salieron de 1,225 a
  1,379 palabras, por encima de las 1,100 de la skill, y nada avisó.
- **El lote se cayó por la máquina.** Remotion deja en `%TEMP%` una copia de `public/` en cada render y nunca la borra:
  el disco C: se llenó y tumbó los hilos 4, 5, 6 y 9. Un servidor caído perdió el WAV del hilo 7 sin avisar, y un hilo
  caído pausó el lote (el video 20 nunca arrancó). `redes.py` renderiza de una vez y no se retoma: falló con «No frame
  found» en 5 hilos, con renders de 20 a 54 minutos.
- **La voz de Gemini no podía funcionar.** El plan gratis da 10 peticiones al día por modelo y `voz_gemini.py` pide
  una por párrafo (11 a 14). El hilo 2 recibió el WAV de otro episodio y nadie lo comprobó.
- **Costo.** De $25 a $58 por video; lo que más pesó fue que los subagentes esperan renders de 10 minutos con una caché
  que dura 5, y reescriben 250–440 mil tokens de contexto en cada espera.

## Decisión

1. **El vertical de El Diff son shorts de 3 minutos como mucho**, fáciles de consumir y divertidos, compuestos en
   1080×1920 desde `guion.py`: la composición principal del episodio es vertical, a pantalla completa, con los
   subtítulos sobre la escena dentro de la zona segura. `Vertical.tsx` (el corte de un episodio 16:9) queda solo para
   los cortes de «Ambos».
2. **Un short, un mensaje: el SMP** (*single-minded proposition*): una frase corta que
   dice de qué va el video y cinco puntos que la sostienen; cada frase del guion se queda solo si alimenta el SMP. De un
   enlace salen **los SMP mínimos que cuentan todo lo relevante**: pueden ser uno o veinte. El número no lo fija lo que
   pida el usuario, sino el material.
3. **El plan de shorts lo aprueba el usuario** antes de hacerlos: todos de un clic, o eligiendo cuáles sí. Cada short
   aprobado es su propio hilo en Sloth (como un video de un lote) y todos comparten la investigación y el material del
   enlace: nada se baja ni se captura dos veces.
4. **Sin logo hablado ni despedida** en los shorts: el sello EL DIFF va pequeño en pantalla, y el short termina
   invitando a ver más en el canal de YouTube.
5. **La duración se elige al crear el chat**, junto al formato: 1, 2 o 3 minutos en vertical; 10, 15 o 30 en
   horizontal. Lo elegido queda como default de la card. La skill la convierte en palabras (unas 180 por minuto) y
   avisa si el guion se pasa.
6. **Voz.** Con «Mi voz», cada video espera el audio del usuario. Con Gemini, una o dos peticiones por video, y al
   primer «límite diario» se para y se pide el audio. Cada WAV se compara con su guion antes de usarlo.
7. **Primero, lo que tumba el lote**: limpiar los temporales de Remotion y comprobar el disco, no perder el mensaje de
   un turno que muere, que un hilo caído no pause el lote, y esperas de los subagentes por debajo de los 5 minutos de
   su caché.

Orden de trabajo: arreglos del lote → selector de duración → vertical nativo con guion de short → varios shorts por
enlace.

## Consecuencias

- En vertical sirven tal cual `final.py` (por tramos, se retoma, reutiliza lo que no cambió) y la revisión normal
  (`revisar.mjs`, `hojas.py`), porque el episodio ya es vertical. Se acaban el fondo que vuelve a montar el 16:9, la
  revisión 16:9 sobrante y los cierres de Shorts parcheados a mano.
- Las capturas de la fase 1 se toman para el celular (unos 400 px CSS de ancho), todas y no solo los tuits.
- Un enlace puede costar varios shorts: cada uno pide su voz. El plan aprobado es donde el usuario decide cuántos.
