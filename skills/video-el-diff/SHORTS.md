# Shorts

Cuando el usuario pide shorts (ver "Formato" en el SKILL), no se hace un episodio: hace shorts para TikTok, YouTube Shorts y Reels. Duran lo que
diga la línea `Duración:`, y nunca más de 3 minutos. Se componen en 1080x1920 desde el principio y tienen que ser
fáciles de consumir y divertidos. Cuántos, lo pide el usuario: **uno, salvo que pida varios** («shorts de esto», «todos
los que salgan», un número) o que sea un lote.

Hay tres clases de hilo, y tu mensaje dice cuál eres:

- **Un short suelto** (lo normal): el mensaje trae el tema (`Enlace:` o un tema escrito), no pide varios y no trae
  `Lote:` ni `Short:`. Eliges el mejor SMP y haces ese short entero en este hilo. Ve a
  [Un short suelto](#un-short-suelto).
- **El plan**: el mensaje pide varios shorts, o trae `Lote:`, y no trae `Short:`. Investigas el tema y propones los
  shorts. Un enlace puede dar un short o veinte: lo decide el SMP. Ve a [El plan](#el-plan).
- **Un short del plan**: el mensaje trae `Short: s2 de 5. Plan: <ruta del plan>.` Haces ese short con el material del
  plan. Ve a [Un short](#un-short).

## El SMP

Un short, un mensaje. El SMP (*single-minded proposition*) es ese mensaje: **una frase corta** que dice de qué va el
short y **cinco puntos** que la sostienen. Si lo que quieres contar no cabe en una frase, son dos o tres shorts. Al
escribir, cada frase pasa una prueba: ¿alimenta el SMP? Si no, sale del guion, aunque sea buena: va a otro short o se
queda fuera.

## Un short suelto

Primero el SMP y luego el material: investigar y capturar todo el video antes de elegir era lo que más tardaba, y casi
todo se quedaba fuera del short.

1. **Proyecto.** `python <skill>/scripts/nuevo.py <Carpeta>` si el mensaje trae la línea `Carpeta:` (la pone Sloth);
   si no, `python <skill>/scripts/nuevo.py <tema-corto>`. No escribas `shorts.md`: este hilo es el short, y así
   el panel de Sloth enseña sus etapas (Guion, Tu voz, Escenas…). Listo cuando la carpeta existe.
2. **Fuentes.** Del paso 1 de [`SKILL.md`](SKILL.md), `fuente.py` y la transcripción completa
   (`fuentes/tema/transcripcion.txt`). Listo cuando la tienes.
3. **El SMP.** Con la transcripción, elige el SMP que más engancha y mejor se entiende solo, y que cabe en la
   `Duración:` (180 palabras por minuto). Escríbelo en `short.json`, con la forma de una entrada de `shorts.json` (ver
   [El plan](#el-plan)), y di en una línea por qué ese y qué otros SMP saldrían, por si quiere más. Listo cuando
   `short.json` existe.
4. **Los datos, solo los de tu SMP.** El paso 2 de [`SKILL.md`](SKILL.md) (`fuentes/datos.json` y `citas.py`) solo con
   lo que piden tus cinco puntos. Para ver qué hay en pantalla en un minuto del video del tema:
   `python <skill>/scripts/cuadros.py hoja fuentes/tema/video.mp4 <desde> <hasta> <paso> <png>`. Listo cuando cada dato de
   tus cinco puntos tiene su cita.
5. **Guion, voz y video.** Los pasos 2 a 5 de [Un short](#un-short), con tu `short.json` y tu `material.md` en vez de
   los del plan.

## El plan

1. **Proyecto.** Con la línea `Carpeta:` (la pone Sloth, también en un lote), `python <skill>/scripts/nuevo.py
   <Carpeta>`. Si no, `python <skill>/scripts/nuevo.py <tema-corto>` (por ejemplo `mistral-large-4`). Esa carpeta es el
   plan: la de cada short será `<plan>-s1`, `<plan>-s2`... Escribe ya `shorts.md` con el tema en un renglón: así el
   panel de Sloth sabe que este hilo es un plan y enseña sus etapas. Listo cuando la carpeta y `shorts.md` existen.
2. **Fuentes.** El paso 1 de [`SKILL.md`](SKILL.md): `fuente.py`, la transcripción completa y lo que enlaza el tema.
   Listo cuando sabes en qué segundo pasa cada cosa que vale la pena contar.
3. **Los datos.** El paso 2 de [`SKILL.md`](SKILL.md): `fuentes/datos.json` y `citas.py`, con todo lo que cualquiera de
   los shorts pueda citar. Recodifica aquí el video del tema (`python <skill>/scripts/material.py`, que deja
   `public/clips/tema.mp4`): los shorts lo enlazan en vez de recodificarlo cada uno. Listo cuando cada dato tiene su cita
   en `fuentes/fichas/citas.json`.
4. **Los SMP.** Lista todo lo relevante del tema (los datos, los giros, los chistes que salen solos) y agrúpalo en el
   mínimo de SMP que lo cuenta todo. Dos ideas que se dicen en una frase son un SMP; una idea que pide dos frases son
   dos. El número no lo fija lo que pidió el usuario, sino el material. Cada SMP cabe en la `Duración:` (180 palabras
   por minuto): si no cabe, pártelo o quítale puntos. Cada short se entiende solo, sin haber visto los otros. Escribe:
   - `shorts.md`, para el usuario. Por cada short: su SMP, sus cinco puntos con su fuente, el gancho del primer segundo
     y por qué es un short aparte. Al final, lo que dejaste fuera y por qué.
   - `shorts.json`, para Sloth: `{"shorts": [{"id": "s1", "titulo": "...", "smp": "...", "puntos": ["...", "..."],
     "gancho": "..."}]}`. El `titulo` es como se ve en la lista del panel: seis palabras como mucho.

   Listo cuando cada dato de `citas.json` está en un punto de algún SMP o en lo que dejaste fuera.
5. **Entrega.** Di cuántos shorts propones y por qué ese número, y termina. El usuario los aprueba en la etapa «Shorts»
   del panel, todos o los que elija, y Sloth abre un hilo por cada uno. En un lote también terminas aquí: es la única
   vez que el lote espera al usuario.

## Un short

Tu mensaje trae `Short: <id> de <n>. Plan: <ruta del plan>.` y, como en un lote, `Carpeta: <nombre>`. Valen las reglas
de [«En un lote»](SKILL.md#en-un-lote).

1. **Proyecto.** `python <skill>/scripts/nuevo.py <Carpeta>`, y dentro de ella `python <skill>/scripts/short.py <ruta
   del plan> <id>`. Enlaza el video del tema y deja todo el `fuentes` del plan en `fuentes/plan` (capturas en
   `fuentes/plan/material`, sus copias en `fuentes/plan/paginas`), sin bajar ni capturar nada de nuevo, y deja tu SMP en
   `short.json`. Listo cuando `short.json` existe.
2. **Guion.** Escribe `guion.md` según «Shorts» en [`ESTILO.md`](ESTILO.md#shorts), a partir de tu SMP: sus cinco
   puntos y el gancho del plan, que puedes afinar, sin nada que no lo alimente. Las citas son las del plan
   (`fuentes/plan/fichas/citas.json`) y lo ya leído está en `fuentes/plan/textos`; si un punto pide un dato que el plan
   no tiene, búscalo tú (paso 2 de [`SKILL.md`](SKILL.md)).
3. **`momentos.json` y el video.** Los pasos 4 a 6 de [`SKILL.md`](SKILL.md), con su `gancho`, y dos cosas propias: el
   primer momento es el gancho y se ve desde el primer cuadro (la prueba o el clip de lo que dice la voz), y el short
   acaba en la invitación de la marca, dicha tal cual (sin `invitacion`, en su remate). Sin `Voz:`, `hacer.py --sin-voz`,
   pide el audio y termina: el usuario lo graba leyendo la etapa «Guion» y lo sube en «Tu voz».
4. **Listo** cuando `hacer.py` dijo ✓ y miraste `revision/hoja.png`.
5. **Entrega.** La ruta del video, su SMP en una línea y un texto para TikTok con 3 a 5 hashtags.
