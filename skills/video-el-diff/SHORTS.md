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
2. **Fuentes, sin el agente de pantalla.** Del paso 2 de la fase 1 de [`SKILL.md`](SKILL.md), `fuente.py` y la
   transcripción completa. El agente de pantalla todavía no: aún no sabes qué minutos vas a contar. Listo cuando tienes
   la transcripción.
3. **El SMP.** Con la transcripción, elige el SMP que más engancha y mejor se entiende solo, y que cabe en la
   `Duración:` (180 palabras por minuto). Escríbelo en `short.json`, con la forma de una entrada de `shorts.json` (ver
   [El plan](#el-plan)), y di en una línea por qué ese y qué otros SMP saldrían, por si quiere más. Listo cuando
   `short.json` existe.
4. **Material, solo el de tu SMP.** El agente de pantalla solo sobre los minutos que vas a citar, y las capturas de
   [`MATERIAL.md`](MATERIAL.md#capturas-para-el-celular) solo de lo que piden tus cinco puntos. Recodifica el video del tema como en
   el paso 3 del plan. Listo cuando cada dato de tus cinco puntos tiene su fuente primaria y su archivo en `material.md`.
5. **Guion, voz y video.** Los pasos 2 a 5 de [Un short](#un-short), con tu `short.json` y tu `material.md` en vez de
   los del plan.

## El plan

1. **Proyecto.** Con la línea `Carpeta:` (la pone Sloth, también en un lote), `python <skill>/scripts/nuevo.py
   <Carpeta>`. Si no, `python <skill>/scripts/nuevo.py <tema-corto>` (por ejemplo `mistral-large-4`). Esa carpeta es el
   plan: la de cada short será `<plan>-s1`, `<plan>-s2`... Escribe ya `shorts.md` con el tema en un renglón: así el
   panel de Sloth sabe que este hilo es un plan y enseña sus etapas. Listo cuando la carpeta y `shorts.md` existen.
2. **Fuentes.** El paso 2 de la fase 1 de [`SKILL.md`](SKILL.md): `fuente.py`, la transcripción completa y el agente de
   pantalla. Listo cuando sabes en qué segundo pasa cada cosa que vale la pena contar.
3. **Investigación y material.** El paso 3 de la fase 1, con las capturas para el celular de
   [`MATERIAL.md`](MATERIAL.md#capturas-para-el-celular). El material sirve a todos los shorts del plan: captura una vez lo que
   cualquiera de ellos pueda citar. Recodifica aquí el video del tema (`public/clips/tema.mp4`, la receta del paso 2 de
   la fase 2): los shorts lo enlazan en vez de recodificarlo cada uno. Listo cuando cada dato tiene su fuente primaria y
   su archivo en `material.md`.
4. **Los SMP.** Lista todo lo relevante del tema (los datos, los giros, los chistes que salen solos) y agrúpalo en el
   mínimo de SMP que lo cuenta todo. Dos ideas que se dicen en una frase son un SMP; una idea que pide dos frases son
   dos. El número no lo fija lo que pidió el usuario, sino el material. Cada SMP cabe en la `Duración:` (180 palabras
   por minuto): si no cabe, pártelo o quítale puntos. Cada short se entiende solo, sin haber visto los otros. Escribe:
   - `shorts.md`, para el usuario. Por cada short: su SMP, sus cinco puntos con su fuente, el gancho del primer segundo
     y por qué es un short aparte. Al final, lo que dejaste fuera y por qué.
   - `shorts.json`, para Sloth: `{"shorts": [{"id": "s1", "titulo": "...", "smp": "...", "puntos": ["...", "..."],
     "gancho": "..."}]}`. El `titulo` es como se ve en la lista del panel: seis palabras como mucho.

   Listo cuando cada dato de `material.md` está en un punto de algún SMP o en lo que dejaste fuera.
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
   puntos y el gancho del plan, que puedes afinar, sin nada que no lo alimente. En `material.md` van las filas del plan
   que usas, copiadas de `fuentes/plan-material.md` (ya con sus rutas a `fuentes/plan/`). Si un punto pide algo que el
   plan no capturó, captúralo en tu `fuentes/material`: lo del plan es de todos los shorts. Listo cuando cada afirmación tiene
   su fila y `python <skill>/scripts/largo.py <minutos>` (los de `Duración:`) no se queja.
3. **Voz.** Pide el audio y termina: el usuario lo graba leyendo la etapa «Guion» y lo sube en «Tu voz», en
   cualquier formato de audio.
4. **Video.** Los pasos 1 a 6 de la fase 2 de [`SKILL.md`](SKILL.md), en esta misma sesión (el contexto de un short es
   chico y no pide subagente), con su `GANCHO` (el rótulo fijo de arriba) en `guion.py` y lo de [El lienzo
   vertical](ESCENAS.md#el-lienzo-vertical), y con dos cosas propias: el primer beat es el gancho y se ve desde el primer
   cuadro (una captura o un titular con lo que dice la voz), y el último es la invitación de la marca, `{"tipo":
   "logo", "invitacion": True}`, con la frase que invita (sin `invitacion` en la marca, el último es el remate). El paso 6 es `final.py`, que deja `out/el-diff-final.mp4`.
   Listo cuando revisaste las hojas a tamaño de celular y la lista de problemas quedó vacía.
5. **Entrega.** La ruta del video, su SMP en una línea y un texto para TikTok con 3 a 5 hashtags.
