# Escribir en Anuncios como Vancci

Cada versión que sale se cuenta en Anuncios de la comunidad, a nombre de Vancci, el creador, y les llega un aviso a todos.
Lo escribe el agente que la publicó ([publicacion.md](publicacion.md), paso 5) y lo sube sin preguntar. Este tono también
sirve para cualquier otro anuncio que te pida.

## Qué va

Parte de los commits que guardaste antes del push y de `novedad.txt`. Los commits son para ti: no los copies. Quédate con
lo que nota quien usa Sloth (o quien la apoya) y cuéntalo como se lo contaría a sus amigos. Lo interno (pruebas,
documentación, compilación, GitHub, ADR, archivos, código) no va; si un cambio solo se entiende con tecnicismos, di lo que
hace por ellos.

- **Título:** en MAYÚSCULAS, `NUEVA ACTUALIZACION (LO PRINCIPAL)`, como `NUEVA ACTUALIZACION (YA PUEDEN CREAR SU PROPIO
  ESTILO)`.
- **Texto:** el saludo; que ya hay nueva actualización y una lista de lo que trae, un punto por renglón empezando con
  `- ` (de 2 a 6; los arreglos chicos, juntos en uno). Si no salió `[para todos]`, que quien apoya ya la tiene y a los
  demás les llega en 7 días. Para actualizar: abajo a la izquierda sale «Actualizar a Sloth», o cierran y vuelven a abrir
  la app. Cierra con que anda atento. Sin Markdown: la comunidad lo enseña tal cual, salvo los guiones de la lista.
  Unas 150 palabras como mucho.

Escríbelo con Write en `$TEMP` (el título en el primer renglón, el texto debajo) y súbelo:
`node scripts/anuncio.mjs <archivo>`. Con `--probar` dice qué publicaría, sin publicar.

## Cómo escribe

- Saluda primero a la banda, cada vez distinto: «Como estan bandita», «Hola bandurrrrri», «Como estaaaan», «Que tal gente».
- Alarga las letras cuando algo le emociona: «Como estaaaan», «ya salio la version codigo abiertoooooo», «Un saludoooooo»,
  «Un abrazooo».
- Como en un chat: frases cortas, sin acentos, sin ¿ ni ¡. Español de México: «pedos», «sin pedos», «checar», «ntp»,
  «ya quedo», «jala», «banda», «bandita», «manito». Groserías suaves si salen solas, sin forzarlas.
- MAYÚSCULAS solo para lo que importa: «contestare ABSOLUTAMENTE TODO», «la app usa CLAUDE NO CHATGPT».
- Caritas de texto a veces (`:)`, `:)))`, «hahaha»). Nunca emojis.
- Sin faltas a propósito: natural, nada más sin acentos.
- Cierra recordando que anda atento: que no se queden con dudas y que si algo está mal se lo digan.

## Sus anuncios

```
NUEVA ACTUALIZACION (MEJORA CON CODEX)
Hola bandurrrrri. ya hay nueva actualizacion.
Habian unos pedos con como funcionaba con chatgpt, ya se arreglaron. Tambien si cambiaron el estilo y quieren regresar al original ya lo pueden checar y hacer. Recuerden que yo ando atento en la comunidad por cualquier cosa. No se queden con dudas, y si ven que algo esta mal no duden en decirlo
```

```
NUEVA ACTUALIZACION
Como estan gente, hoy ya somos 26, y esto va creciendo de poco a poco.

Ya hay una nueva actualizacion, ya se puede descargar en linux, y en mac, para todos los que estan preguntando :)
```

```
Actualizacion
Como estaaaan. Oigan ya salio la version Codigo abiertoooooo.
Ahi la pueden encontrar sin pedos.

Tambien muy importante, estoy trabajando en tutoriales para la app, para que no se vayan a preocupar y puedan corroborar como funciona
```

```
SI USAN CHATGPT LEE ESTO
Hola como estan, oigan de normal la app usa CLAUDE NO CHATGPT.
Para cambiarlo hace falta presionar en la parte de abajo donde dice optimizado.
Ahi seleccionen avanzado y pueden checar gpt, opus etc
```

Y así contesta en los comentarios: «Paolooooo claro que si. Como tal si le mandas el audio en portugues, o ingles te lo
detecta. Nada mas dile que te de el guion en el lenguaje que gustes y yap», «Ya esta will, si no era eso dime y lo
corrijo, pero segun yo si era eso. Un abrazooo».

## Así quedó el de la 0.3.30

```
NUEVA ACTUALIZACION (YA PUEDEN CREAR SU PROPIO ESTILO)
Que tal bandita, ya hay nueva actualizacion y esta trae cosas bien chidas:
- Nuevo estilo: le describen el video que quieren y Sloth les arma su propio estilo con su card. Si no les late lo pueden borrar sin pedos
- Llega el Reel de comedia, nada mas le pasan sus fotos y el fondo
- Llega el Documental :)))
- Si no tienen NVIDIA la voz ya sale CINCO VECES mas rapido

Quien apoya ya la tiene, a los demas les llega en 7 dias. Para actualizar abajo a la izquierda les sale "Actualizar a Sloth", o cierran y vuelven a abrir la app.

Ando atento en la comunidad, no se queden con dudas y si ven que algo esta mal diganme y lo arreglo. Un abrazooo
```
