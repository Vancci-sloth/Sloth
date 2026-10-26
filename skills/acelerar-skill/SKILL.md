---
name: acelerar-skill
description: Acelera una skill sin bajar su calidad. Mide en sus sesiones dónde se van el tiempo y el dinero, acelera sus herramientas con autoloop y busca qué modelo (Opus, Sonnet o Haiku 5.5) y qué esfuerzo (low a xhigh) conviene en cada etapa. Con el nombre de una skill (`/acelerar-skill video-el-diff`) acelera esa; sin nombre, todas. El render de video va aparte, con acelerar-render.
---

# Acelerar una skill

`/acelerar-skill <skill>` acelera esa skill. Sin nombre, mide todas las que tienen sesiones (pasada 1) y sigue por la
que más tiempo se lleva. El render no entra aquí: es `acelerar-render`.

Lo de cada skill vive en `bancos/<skill>/` dentro de esta carpeta: `etapas.json` (qué es cada paso), `medicion.md`
(la última medición) y, más adelante, los bancos de las pasadas 2 y 3. Son cuatro pasadas en orden. Al terminar cada
una, para y enséñale al usuario lo que salió y cómo, hasta que te diga que sigas solo.

Al empezar, mira qué hay en `bancos/<skill>/` y sigue por la primera pasada que falte: sin `medicion.md`, la 1; con ella,
la 2. No vuelvas a medir lo que ya está medido, salvo que el usuario lo pida o haya sesiones nuevas.

## 1. Medir (gratis, no toca la skill)

1. `node <esta skill>/scripts/tiempos.mjs --buscar <skill>` lista las sesiones que llamaron a la skill. Las sesiones
   viven en la computadora donde se hicieron (`~/.claude/projects`). Si aquí no hay ninguna, dilo y para. Las que se
   traen de otra computadora van a una carpeta aparte, que se busca con `--en <carpeta>`.
2. Si falta `bancos/<skill>/etapas.json`, escríbelo a partir del `SKILL.md` de la skill: una etapa por cada paso suyo
   que tarde, con una regex sobre las claves del medidor. La primera que encaje gana. Las claves son:
   - el nombre del script (`capturar.py`);
   - `bash: <comando>` y `powershell: <comando>`;
   - `ver imagen`, `leer <archivo>` y `escribir <archivo>`;
   - `agente: <descripción del subagente>`;
   - el nombre de la herramienta (`WebSearch`).
3. Mide cada sesión con `node <esta skill>/scripts/tiempos.mjs <sesión.jsonl> --etapas bancos/<skill>/etapas.json`
   (`--desde "<texto>"` si la sesión tiene más de un trabajo). Si la sección "Sin etapa" se lleva más que unos minutos
   sueltos, afina `etapas.json` y vuelve a medir.
4. Junta las mediciones en `bancos/<skill>/medicion.md`:
   - por etapa: el reloj (lo que el usuario espera) y el trabajo total (con los subagentes en paralelo), cuánto es del
     modelo y cuánto de herramientas, con qué modelo y esfuerzo, y el costo;
   - las 3 a 5 etapas que más pesan, y para cada una qué la acelera: si el tiempo es de herramientas, va a la pasada 2;
     si es del modelo, a la pasada 3.

## 2. Herramientas (corre sola)

Las etapas de herramientas con más peso (capturas, descargas, grabación, render) se aceleran con `autoloop` en modo
métrica, como `acelerar-render`:
- **El banco** es una lista fija de entradas sacadas de las sesiones medidas.
- **Lo que se mide** son los segundos.
- **La guardia** es que el resultado salga igual: mismo tamaño, el mismo texto por OCR y el mismo VMAF en video.

Va en un worktree de este repo que se crea para el bucle:
`git -C C:\dev\vancci-sloth worktree add --detach C:\dev\skills-acelerar\skills`. `autoloop` se corre desde su carpeta
`skills\`, y su `init <skill>-<fecha>` crea la rama `autoloop/<skill>-<fecha>`. `C:\dev\skills-acelerar` es una carpeta
normal, no un worktree: lo pesado de cada banco (entradas, referencias, corridas) va en `C:\dev\skills-acelerar\<skill>\`,
fuera del repo. Enséñale al usuario cada check antes de fijarlo.

Antes de fusionar la rama: `autoloop fin acelerar-skill/bancos/<skill>/<tag>`. Saca `.autoloop/` de la rama (si no,
llega a `main`) y deja sus checks y `config.json` en el banco de la skill, para repetir el bucle.

## 3. Modelos (corre hasta que el usuario pare)

Por cada etapa en la que pesa el modelo, una rejilla de modelo × esfuerzo × intentos:
- **Modelos:** Opus 5.5, Sonnet 5.5 y Haiku 5.5. Ni Fable ni el modo rápido.
- **Esfuerzos:** `low`, `medium`, `high` y `xhigh`. Nada de `max`.
- **Varios intentos se combinan de tres formas:**
  - en paralelo, y un juez elige el mejor;
  - en cascada: el barato primero y el caro solo si el verificador lo rechaza;
  - repartidos: varios trabajadores se dividen la tarea.

Cómo se recorre la rejilla:
- Cada etapa se corre sola, con sus entradas congeladas de sesiones reales.
- Cada celda se repite 2 o 3 veces y pasa solo si pasan todas.
- Se prueba de lo barato a lo caro. Una celda que cuesta más y tarda más que otra que ya pasó no se prueba.
- No hay presupuesto fijo: sigue hasta que el usuario pare.

La calidad se mide en tres capas:
1. **Checks automáticos de la etapa**, por ejemplo cada dato con su fuente o el texto de cada captura.
2. **Un juez.** Antes de fiarte de él, calíbralo: tiene que detectar los fallos que ya se conocen de la skill.
3. **El usuario**, para lo que es de gusto.

El resultado es, por etapa, cada combinación que pasa con su tiempo y su costo. Elige el usuario.

## 4. Aplicar

La combinación elegida entra en la skill en una rama, y el usuario decide qué pasa a `main`. `video-el-diff` lo afina
el usuario a mano: no se escribe nada en su carpeta sin su sí (ver su fase 3).
