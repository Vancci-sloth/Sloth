# Sloth 2.0

Una app local donde cada skill es una card: describes el trabajo y el agente lo hace a la vista.
La card **Sloth** mejora este mismo repo.

## Dónde buscar

Antes de explorar un área, lee su entrada en `docs/agents/mapa.md`: servidor y proveedores, sesiones, estudio de video,
galerías, redes, navegador, Ideas, radar, comunidad, requisitos y React. Cada módulo amplía lo suyo en su cabecera.
Los campos de una card están en `Card` (`shared/types.ts`).

Para mirar o mover la cola de TikTok e Instagram, o decidir qué se publica, lee `docs/agents/redes.md`. Para ver cómo va
o fue un hilo (turnos, costo, errores, lo que sigue de fondo, disco libre): `npm run hilo -- <id>`.

Al comprobar una compilación o publicar la app, el cobro, la nube o la página de venta, lee `docs/agents/publicacion.md`.
Ahí están los repos, los comandos y cómo verificar cada despliegue.

## Al editar la app desde la card Sloth

- Lo de `web/` se ve al instante (recarga de Vite).
- Lo de `server/` o `shared/` se aplica solo (`server/reinicio.ts`): unos 20 s después del último cambio, cuando no trabaja
  nada (agentes, redes, Ideas), y si pasa el typecheck. **Tú mismo corres dentro de ese servidor**: no lo mates ni lo
  reinicies desde un comando, o se corta tu turno. Mientras trabajas no se reinicia.
- El servidor escucha en `$PORT`: la app instalada usa 4848, y la copia donde trabajas puede usar otro.
- Comprueba con `npm run typecheck` y `npm test` antes de dar algo por hecho, y con `npm run comprobar-skills` si tocaste
  `skills/`. Un solo test: `node --import tsx --test <archivo>`.
- La app que se vende es de Electron (`electron/main.ts`, ADR 0004) y sale de `npm run compilar`, para Windows, Mac y
  Linux (ADR 0006: lo de un sistema lleva su par en los otros); lo que solo sirve aquí
  se esconde con `VENTA` (`shared/venta.ts`). Es gratis; el apoyo mensual es opcional (`server/licencia.ts`) y lo cobra
  `licencias/`, un Worker con Mercado Pago. Las instrucciones de publicación están en
  `docs/agents/publicacion.md`.
- Escribe los JSON con `guardar()` de `server/disco.ts` (temporal y reemplazo), no con `writeFileSync`.
- El Markdown se dibuja con `web/src/markdown.ts`, que no deja pasar HTML: no uses `marked` directo.

## Herramientas en esta máquina (Windows)

- Edita los archivos con Edit. Para un script de un solo uso, escríbelo con Write como `.mjs` o `.py` en `$TEMP` y
  córrelo. Los parches con heredoc o `node -e` rompen las comillas, los `\n` y las rutas `C:\`, y `/tmp` de Git Bash no
  es la misma carpeta para Node ni para Python. Los finales de línea los fija `.gitattributes` (LF).
- Lo que lances de fondo (subagentes, Monitor, servidores de prueba): termina el turno y deja que te avisen. Al acabar,
  ciérralo con TaskStop.
- Las capturas del navegador van a `data/navegador-capturas/`, la única carpeta donde su MCP puede escribir.
- Con `grep -r` en Bash, excluye `trabajo/`, `data/`, `dist/` y `node_modules/`. La herramienta Grep ya los salta.
- Lo que aprendas del proyecto va al repo (`docs/` o la skill), donde lo leen los demás hilos, no a tu memoria.

## Reglas

- Rápida y sencilla antes que completa. Antes de añadir algo, pregunta si se puede quitar otra cosa. Lo que se anima sin
  fin va con `steps()`: suave, gasta CPU siempre.
- La paleta es la de Sloth (variables en `web/src/styles.css`); no inventes colores. La excepción son los logos de otras
  marcas (`web/src/Logos.tsx`). El logo es `web/public/icon.svg`. Los iconos son de trazo (`web/src/Iconos.tsx`), nunca emojis.
- La interfaz y los comentarios van en español.
- Las skills viven en `skills/`. `~/.claude/skills` es un enlace (junction) a `C:\dev\vancci-sloth\skills`: de ahí las
  cargan Claude y la app. Mejorar una skill es editar su carpeta y hacer commit en este repo.
- Todo estilo de video que crees nace con su card: al terminarlo, añádelo a `cards.json` en el mismo turno, sin
  preguntar, con título, icono y descripción en español, y sus `etapas` con su `fase`. Si ya tenía card, actualízala.
  Las herramientas que no son un estilo (`autoloop`, `acelerar-skill`, `animacion-de-entrada`) no llevan card.
- Los estilos de video comparten `skills/video-base`: el lote, los errores ya vistos, la portada que todo vertical lleva
  de primer cuadro (`PORTADA.md`) y los scripts (ver su `LEEME.md`). Lo que
  se repetiría en dos estilos va a la base. `video-el-diff` es la excepción: lo afina el usuario a mano y no se toca
  desde la base.
- Este archivo entra en cada hilo de la card Sloth, y un test lo para en 1.000 palabras. Lo que entra, saca otra cosa.

## Agent skills

### Issue tracker

GitHub (`Vancci-sloth/sloth`): usar siempre la cuenta **Vancci-sloth** para `gh`, commits y push; comprobar la cuenta antes de operar.
Para el autor de los commits, usar el correo `noreply` de esa cuenta.
Issues, sub-issues y bloqueos nativos: `docs/agents/issue-tracker.md`.

### Triage labels

Las cinco etiquetas por defecto (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), más `especificacion` y `bloqueado`. Ver `docs/agents/triage-labels.md`.

### Domain docs

Un solo contexto: `CONTEXT.md` y `docs/adr/` en la raíz. Ver `docs/agents/domain.md`.
