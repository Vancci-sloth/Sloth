---
name: autoloop
description: Bucle de Karpathy (autoresearch) para cualquier repo con una puntuación medible. Checks aprobados y bloqueados, un constructor nuevo por ronda, keep o revert automático, y un segundo bucle que reescribe program.md con los hábitos que va aprendiendo. Úsala para construir funcionalidades o mejorar una métrica sin supervisión.
---

# Autoloop

Es autoresearch de Karpathy con dos mejoras: el árbitro es un script (no el agente) y hay un bucle por fuera que
aprende. Tres piezas viven en el repo de destino, en `.autoloop/`:

- `program.md`: objetivo, reglas fijas, cómo trabajar y hábitos aprendidos. Fuera de git.
- `checks/` + `config.json`: lo que puntúa. Se bloquean con `lock`; si una ronda los toca, se marca `trampa` y se
  deshace.
- `results.tsv` y `runs/<n>.log`: cada ronda, con su puntuación y su log. Fuera de git, sobreviven a los reset.

El árbitro es `autoloop.mjs`, en la carpeta de esta skill. Llámalo siempre desde la raíz del repo de destino, o
desde su carpeta si el proyecto vive dentro de otro repo (las skills viven en `skills/` de sloth):
`node "<carpeta de esta skill>/autoloop.mjs" <init|lock|round|fin> ...`.

## 1. Preparar (con el usuario)

1. Pide el repo (ruta absoluta) y el objetivo si no los dio. Entra en él (`cd`) y lee su CLAUDE.md/AGENTS.md y su
   README para entender el proyecto.
2. Elige el modo:
   - **Funcionalidades**: cada fase es una funcionalidad con sus checks. Termina cuando todos pasan.
   - **Métrica**: como autoresearch: una sola fase, un comando que imprime un número (por ejemplo `val_bpb`). No
     termina: sigue hasta que el usuario lo pare.
3. `init <tag>` (tag corto con la fecha, como `oct8`). Crea la rama `autoloop/<tag>` y `.autoloop/`.
4. Rellena "Objetivo" en `.autoloop/program.md` con el usuario. Las fases van en orden, de la base hacia fuera.
5. Ajusta `.autoloop/config.json` al proyecto:
   - `command`: corre todos los checks (de todas las fases, para que una fase nueva no rompa una vieja).
   - `score`: regex con un grupo que captura el número. Se usa el último que aparezca.
   - `better`: `higher` o `lower`. `done` (opcional): regex que, si aparece, da la fase por terminada.
   - `margen` (opcional): cuánto tiene que mejorar para contar (`0.05` = 5 %). Ponlo si la métrica es ruidosa, como
     un tiempo: mide la base dos veces y usa algo más que la diferencia entre las dos.
   - Ejemplos: Node → el que viene. Pytest → `"command": "pytest .autoloop/checks -q"`,
     `"score": "(\\d+) passed"`, `"done": "^\\d+ passed in"`. autoresearch → `"command": "uv run train.py"`,
     `"score": "^val_bpb:\\s*([\\d.]+)"`, `"better": "lower"`, sin `done`, `"timeoutMin": 10`.

## 2. Escribir los checks de una fase

- Van en `.autoloop/checks/<fase>/`. Prueban comportamiento desde fuera, como lo usaría alguien: la API, la CLI, la
  página. No prueban detalles internos que el constructor podría cambiar.
- Incluye siempre un check de que la funcionalidad está conectada a la app (la ruta existe, el botón llama a la API,
  el dato se guarda), no solo de que la lógica funciona.
- Córrelos: deben fallar ahora. Un check que ya pasa no mide nada.
- Enséñale al usuario cada check en una frase sencilla y **para**. Ajusta hasta que diga que sí. No bloquees sin su
  aprobación.
- Con el sí: `lock <fase>` y después `round "base"` para tener la puntuación de partida.

En modo métrica no hay checks que escribir: el comando ya es el juez. Enséñale el `config.json`, pide el sí,
`lock base` y `round "base"`.

## 3. El bucle de dentro (una ronda)

Cada ronda la hace un subagente nuevo, para que no arrastre el contexto de las anteriores y tu ventana no se llene.
Lánzalo con la herramienta de subagentes (general-purpose) y este encargo, con los huecos rellenos:

> Trabajas en `<repo>`, rama `autoloop/<tag>`. Lee `.autoloop/program.md` entero y síguelo. Fase: `<fase>`.
> Mejor puntuación hasta ahora: `<score>`. Últimas rondas: `<últimas 5 filas de results.tsv>`. Fallo de la última
> ronda: `<tail de su log, si falló>`. Haz **un** cambio que suba la puntuación. No toques nada en `.autoloop/`.
> No hagas commit. Responde solo con una línea: qué probaste y por qué.

Luego tú: `round "<su línea>"`. El script hace commit, mide y, si no mejora, hace `git reset --hard` a la mejor
ronda. Lee solo lo que imprime; abre el log solo si es `crash` o `trampa`.

- `hecho: sí` → la fase está terminada. Pasa al paso 4.
- Si la misma fase lleva 8 rondas seguidas sin `keep`, para y cuéntaselo al usuario: el check o el plan están mal.
- En modo métrica no pares nunca por tu cuenta, ni preguntes si seguir. Sin ideas: relee el código, combina dos casi
  aciertos, prueba algo más radical.
- Si no tienes herramienta de subagentes (Codex), haz la ronda tú, pero relee `program.md` al empezar cada una.

## 4. El bucle de fuera (aprender)

Después de cada fase (en modo métrica, cada 10 rondas):

1. Lee `results.tsv` y los logs de las rondas `discard`, `crash` y `trampa`.
2. Busca lo que se repite: el mismo error en dos rondas, el mismo hueco en dos fases, una idea que siempre falla.
   Mira también si los checks pasaron pero la app no usa lo construido.
3. Reescribe "Cómo trabajar" en `.autoloop/program.md` para que la siguiente fase no lo repita. Apunta cada hábito en
   "Hábitos aprendidos" con las rondas que lo prueban. Quita los hábitos que no ayudaron.
4. Nunca toques los checks, `config.json`, "Objetivo" ni "Reglas fijas". Si un check parece mal, díselo al usuario.

Después, la siguiente fase: vuelve al paso 2.

## 5. Informe final

Cuando todas las fases estén hechas (o el usuario pare), dale: una tabla con fase, rondas, keep/discard/crash/trampa
y puntuación final; dónde se equivocó el constructor y cómo se corrigió; los hábitos que se añadieron a
`program.md`. La rama `autoloop/<tag>` queda para que la revise y la fusione él.

Antes de fusionarla, `fin [carpeta]`. `lock` hizo commit de `.autoloop/checks` y `config.json`, y sin esto llegan a
`main`; `fin` los saca de la rama (en el disco se quedan). Con una carpeta del repo, los deja ahí versionados, para
repetir el bucle copiándolos de vuelta a `.autoloop/`. Lo pesado (videos de referencia) no va en los checks, sino
fuera del repo.
