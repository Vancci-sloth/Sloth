# Lo que necesita todo estilo

La vara de un estilo de vídeo, sea de Sloth o de cada quien. Con ella se hace (`crear-estilo`), se le avisa a su autor
al compartirlo y se revisa antes de que salga en la comunidad. Uno bien hecho cumple los 30; para salir en la comunidad
no puede fallar en los que frenan (abajo, «Cómo se aprueba en la comunidad»).

Los marcados **(Sloth)** los comprueba Sloth sin leer lo que el estilo hace, y los dice todos de una vez al pulsar
«Compartir». Los demás los juzga quien lo lee. Lo que Sloth comprueba manda: un estilo con uno de esos sin cumplir no
se aprueba, diga lo que diga quien lo leyó.

## Su carpeta

1. **(Sloth)** Su `SKILL.md` empieza con `name: <id>`, el nombre de su carpeta, y una `description` en español que dice
   qué vídeo hace y cuándo usarla.
2. Sus pasos van numerados y cada uno dice cuándo está listo. Lo que un script puede comprobar lo comprueba un script,
   no una regla escrita.
3. **(Sloth)** Todo lo suyo está en su carpeta o en `video-base`: no usa archivos de otra skill ni de fuera de Sloth.
4. **(Sloth)** Usa de `video-base` lo que ya existe (bajar, transcribir, masterizar, comprobar, el render, la portada):
   no copia sus scripts, y lo que nombra de ahí existe.
5. **(Sloth)** Lleva solo texto, imágenes, fuentes y audio, hasta 15 MB: ningún programa, ni vídeos de ejemplo, ni lo
   que junta quien lo usa (`huellas/`, `series/banco/`, sus poses).

## Su card

6. **(Sloth)** Título, una `description` que dice en una oración qué vídeo sale, `version` como `1.0` e `icon` de trazo,
   nunca un emoji.
7. **(Sloth)** Sus `etapas`, cada una con su `fase` (`idea`, `guion`, `sonido`, `video` o `entrega`); su `listo` busca
   dentro de la carpeta del vídeo.
8. **(Sloth)** Una etapa «Video», de la fase `video`, cuyo `listo` es el MP4 terminado y no cuenta borradores ni partes:
   `out/!(render*|borrador*|_*).mp4`, o su nombre exacto. De ella salen los vídeos de «Mis vídeos».
9. **(Sloth)** Una etapa de la fase `entrega` con su portada.
10. **(Sloth)** Su guía de uso completa (`guia`), la misma plantilla para todos: qué le das, qué te entrega, un ejemplo
    listo para mandar, `necesita` si pide algo aparte de Sloth, con qué hace el vídeo (`herramientas`: solo código,
    imágenes o clips de Google Flow, voz generada, tu voz grabada, material de internet, modelos 3D) y con qué agentes
    se probó y funciona bien (`agentes`).
11. **(Sloth)** `basadoEn`: el estilo de Sloth del que partió. De él salen sus paquetes de Python.

## El vídeo que hace

12. **(Sloth)** El proyecto de cada vídeo va en la carpeta de la línea `Carpeta:` del mensaje, con ese nombre exacto: el
    estudio lo busca ahí.
13. **(Sloth)** Hace los dos formatos ([FORMATO.md](FORMATO.md)): su `SKILL.md` dice qué hace con `Formato: vertical` y
    con `Formato: horizontal`, y su plantilla compone cada uno desde el principio. Ninguno es el otro recortado.
14. **(Sloth)** Lleva su portada ([PORTADA.md](PORTADA.md)), y su `SKILL.md` dice cómo es la suya: el vertical, de
    primer fotograma; el horizontal, su miniatura.
15. Si lleva voz narrada, sigue la línea `Voz:` ([VOZ.md](VOZ.md)); si hace imágenes o clips, la línea `Imágenes:` y
    dice lo que gastan ([FLOW.md](FLOW.md)).
16. Comprueba lo que entrega antes de cerrar (`comprobar.mjs`, `masterizar.mjs`, o el `hacer.py` que los corre) y no
    cierra el turno con el vídeo a medias.
17. Quien lo usa no programa nada: de lo que pide en su guía sale el vídeo terminado. Si se hace con el motor
    ([MOTOR.md](MOTOR.md)), cumple su contrato.

## En la computadora de cualquiera

18. **(Sloth)** Sin rutas de la computadora de su autor (`C:\Users\…`, `/Users/…`, `/home/…`).
19. **(Sloth)** Sin llaves, tokens ni contraseñas en sus archivos.
20. **(Sloth)** Lo que corre va en Python o Node: sin `.ps1` ni `.sh`, que solo sirven en un sistema.
21. **(Sloth)** Solo los paquetes de npm que ya usan los estilos de Sloth y los de Python del estilo del que partió. No
    instala nada por su cuenta (`pip install`, `npm install <otro>`).

## Lo que no hace

22. No lee, escribe ni borra fuera de la carpeta del vídeo, de la suya y de lo que `video-base` ya maneja.
23. Solo se conecta a los sitios de su trabajo (de dónde baja su material), y los dice.
24. No pide, guarda ni manda llaves, contraseñas, cuentas ni archivos del usuario.
25. Sin instrucciones escondidas para el agente (que ignore reglas, que haga algo sin decirlo) ni código que se arma al
    vuelo o va disfrazado.
26. El material de otros se mide y se describe; no viaja en el estilo (ni sus vídeos, ni sus cuadros, ni sus textos, ni
    su música).

De estos, Sloth no juzga: señala. En lo que su autor añadió al estilo del que partió, marca cada línea que se conecta a
internet, lanza otro programa, arma código al vuelo, lee lo del usuario o borra archivos. Lo que venía igual en el
estilo de Sloth no cuenta.

## Para quien lo usa

27. Todo lo que ve el usuario, en español.
28. Hace lo que dicen su card y su guía, ni más ni menos.

## Para estar en la comunidad

29. **(Sloth)** Un vídeo entero hecho con él: es lo que se ve en la tienda. Se hizo en Sloth y su hilo sigue ahí.
30. **(Sloth)** Su prueba: con qué agente y qué modelo se hizo ese vídeo, cuánto costó y cuánto tardó el agente en
    dejarlo terminado. No se escribe: sale del hilo donde se hizo. Su evidencia es ese hilo completo (lo que se le
    escribió al agente, lo que contestó y lo que hizo en cada turno), que su autor acepta compartir al mandarlo y que
    solo ven él y el creador, con «Ver la evidencia» en su publicación. Lo que ese hilo usó de Sloth está en su guía.

Sin el 10, el 29 o el 30 no se publica, y el que ya estaba deja de verse en la tienda hasta que su autor lo complete:
él lo ve en rojo, con lo que le falta.

## Cómo se aprueba en la comunidad

Frena lo que le importa a quien lo instala: los marcados (Sloth); el 17, que le salga el vídeo sin programar nada, en
Windows, Mac o Linux; «Lo que no hace», del 22 al 26; y el 28 cuando promete lo que no hace o gasta lo que no dice. Lo
demás (el 2, el 15, el 16, el 27, un detalle del 28) no frena: se le dice a su autor como sugerencia, y sale igual.

Lo que Sloth sabe arreglar no se le devuelve a su autor: los acentos rotos de su card y de su guía («CinematogrÃ¡ficos»)
se arreglan solos, y a su guía se le pone el agente con que hizo el vídeo de su prueba y lo que ese hilo usó.

- **Se aprueba solo** si cumple todo lo de (Sloth), quien lo lee dice que nada lo frena y no hay ninguna señal.
- **Le falta algo** de lo que frena: se le dice a su autor, en su publicación, qué cambiar. Lo arregla y pulsa
  «Compartir» otra vez: se revisa de nuevo, mirando primero lo que se le pidió, sin una lista nueva de detalles.
- **Trae una señal:** aunque cumpla todo, lo aprueba el creador de Sloth a mano.
- **No se aprobaría** (hace algo de «Lo que no hace»): lo decide el creador.

Cambiar esta vara cambia qué se aprueba: lo que se añada a (Sloth) va también en `server/estilos-requisitos.ts`, y un
test de Sloth los empareja y pasa por ella los estilos de Sloth.
