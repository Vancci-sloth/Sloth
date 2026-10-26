---
name: acelerar-render
description: Arranca o retoma el bucle que acelera el render de los estilos de video (autoloop sobre C:\dev\skills-render), de todos a la vez o de uno solo (`acelerar-render video-el-diff`), medido y adaptado al equipo donde corre, sin bajar la calidad. Llamarla es la orden de arrancar; corre hasta que el usuario diga que pare. Úsala cuando pidan arrancar, retomar o seguir el loop o el bucle del render, o acelerar el render de un estilo.
---

# Acelerar el render

Llamar a esta skill **es** la orden de arrancar: no vuelvas a preguntar. Es un bucle de `autoloop` ya preparado; lee
`~/.claude/skills/autoloop/SKILL.md` (pasos 3 y 4) para la mecánica de cada ronda y el bucle de fuera. Aquí está solo
lo propio de este bucle.

- **Dónde:** `C:\dev\skills-render\skills`, las skills de un worktree de este repo (`C:\dev\skills-render`) en la
  rama `autoloop/render2-oct8`. Todo se corre desde esa carpeta `skills`. Los videos del usuario siguen usando
  `~/.claude/skills`, que no se toca.
- **El programa:** `.autoloop/program.md` (objetivo, modos, reglas). **El banco:** `.autoloop/checks/banco.mjs`, un
  caso por estilo en `.autoloop/checks/casos/<skill>/` con su referencia (mismo formato, VMAF ≥ 93 y el mismo audio;
  score = segundos, menos es mejor, margen 4 %). **El árbitro:** `node ~/.claude/skills/autoloop/autoloop.mjs round "<qué probé>"`.
- **El modo:** `todos` si el usuario no nombra un estilo. Si lo nombra («acelera El Diff», `acelerar-render video-el-diff`),
  el de esa skill: `video-el-diff` o `reel-collage`. Lo que puede tocar cada modo está en `program.md`. Un caso con `pendiente` en su `caso.json` no se
  mide (hoy, `reel-collage`): si piden ese estilo, dile el motivo que está ahí y no arranques.
- **El equipo:** `node .autoloop/checks/banco.mjs --equipo` (el nombre del equipo donde corre). Los
  tiempos de un equipo nunca se comparan con los de otro.

## En otro equipo

Si `C:\dev\skills-render` no existe, prepáralo:

1. `git -C C:\dev\vancci-sloth fetch origin autoloop/render2-oct8:autoloop/render2-oct8` y
   `git -C C:\dev\vancci-sloth worktree add C:\dev\skills-render autoloop/render2-oct8`.
2. Dentro de `C:\dev\skills-render\skills`: `.autoloop/program.md` es una copia de
   `~/.claude/skills/acelerar-render/program.md`; `.autoloop/results.tsv` nace solo con la cabecera
   (`ronda fase commit score estado descripción log`, separadas por tabuladores) y `.autoloop/runs/` vacía. Las tres
   van fuera de git, como las deja `autoloop init`: añádelas, con `skills/` delante, al archivo que da
   `git rev-parse --git-path info/exclude`.

Si existe pero no está en esa rama, para y díselo al usuario.

## Arrancar o retomar

1. Que no quede un render del banco de una ronda cortada: cierra, por su PID, los `chrome-headless-shell`, `ffmpeg`,
   `node` y `python` cuya línea de comandos nombre `skills-render` o `banco-render` (`Get-CimInstance Win32_Process`
   la da). Los demás pueden ser del usuario: no los toques.
2. La fase es `<modo>@<equipo>`. Mira la última fila `lock` de `.autoloop/results.tsv`:
   - **Es esta fase** (o esta con `#n`): retoma. Si `HEAD` no es el commit de su mejor ronda `keep` (o el del `lock`,
     si no hay ninguna), es una ronda que se cortó a medias: `git reset --hard` a ese commit.
   - **Es otra** (otro modo, otro equipo, o cambió el banco): fase nueva.
     1. En `.autoloop/config.json`, el `command`: `node .autoloop/checks/banco.mjs` para `todos`, o
        `node .autoloop/checks/banco.mjs --estilo <skill>`.
     2. El nombre: `<modo>@<equipo>`, y si ya sale en `results.tsv`, con `#2`, `#3`… El árbitro compara con la mejor
        ronda de la fase del mismo nombre, y el código cambió desde entonces: aquel score ya no vale.
     3. `lock <fase>` y `round "base"`. La base se mide con la máquina en reposo.
3. En `todos`, mira si hay un estilo de video sin caso (abajo, «Estilo nuevo»). Si lo hay, díselo en una línea y sigue
   con los demás.
4. Dile al usuario en una línea: modo, equipo, mejor puntuación y cuántas rondas lleva la fase.

## Cada ronda

- Un subagente nuevo hace el cambio, con el encargo del paso 3 de `autoloop`. Dale además la ruta del repo y el modo,
  y recuérdale que no corra el banco entero: que pruebe con un tramo corto o con un solo caso (`--estilo <skill>`).
- El banco tarda más que el límite de un comando normal (varios minutos en `todos`): corre `round` en segundo plano y
  espera su aviso. Nunca toques el código mientras mide.
- Al acabar, una línea al usuario: ronda, qué se probó, `keep`/`discard`/`crash`/`trampa`, score y mejor score.
- Después de cada `keep` y de cada `lock`, sube la rama como respaldo (solo esa rama, nunca `main`). La cuenta activa
  de `gh` puede no ser la del repo, así que va con la de Vancci-sloth:
  `GH_TOKEN=$(gh auth token -u Vancci-sloth) git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin autoloop/render2-oct8`.
  Si falla, avísale y sigue: el respaldo no para el bucle.
- No pares nunca por tu cuenta ni preguntes si seguir. Cada 10 rondas, el bucle de fuera (paso 4 de `autoloop`), y
  después copia `.autoloop/program.md` a `~/.claude/skills/acelerar-render/program.md`: así otro equipo arranca con
  lo aprendido.
- El modo no cambia solo: sigue en el que pidió el usuario hasta que pare o pida otro.

## Estilo nuevo

Los estilos de video son los dos de arriba y cualquier otro que se cree con su card en Sloth. Si uno no tiene carpeta
en `.autoloop/checks/casos/`, su caso se prepara así, solo cuando el usuario lo pida:

1. Un video real del estilo, de su último video (en `C:\dev\vancci-sloth\trabajo\<skill>\` o en `C:\dev`), con todo lo
   que carga, en `.autoloop/checks/casos/<skill>/`, y su `caso.json` como el de `video-el-diff` o `reel-collage`:
   lo que pasa en un video típico del estilo. Si la skill no está en la rama (por ejemplo, sin commit en `main`),
   cópiala a `skills\` del worktree.
2. Su referencia, con el código de ahora: `node .autoloop/checks/banco.mjs --ref --estilo <skill>`. Copia lo que se
   edita en el modo de ese estilo a `.autoloop/paginas/<skill>/` (como el `src/` del reel).
3. Enséñale al usuario en dos o tres frases qué tramo mide y **para** hasta que diga que sí.
4. Fase nueva, porque cambió el banco: paso 2 de «Arrancar o retomar».

## Pausar

El usuario avisa cuando va a usar la PC (jugar, renderizar sus videos): el tiempo medido con la máquina ocupada no
vale. Corta la ronda en curso (cierra los procesos del paso 1), vuelve al mejor commit (paso 2) y espera a que diga
que sigas.

## Parar

Cuando el usuario diga que pare: corta la ronda en curso (cierra los procesos del paso 1 de arriba) y dale el informe
del paso 5 de `autoloop`. No fusiones nada en `main` de las skills: eso lo decide el usuario. Lo que más tiene que
revisar al fusionar son las reglas nuevas en el `SKILL.md` de cada estilo, que salen de los modos de un estilo.
