# Skills de HeyGen

Las carpetas hermanas `heygen-avatar`, `heygen-video` y `heygen-translate` son las skills oficiales de HeyGen, copiadas tal
cual (sin cambios) de https://github.com/heygen-com/skills, versión 3.2.0, commit
1bd5e4d33a028dfed3abf504c5e3dd644fb9ea8a. Licencia: MIT, © 2026 HeyGen (el texto, en el `LICENSE` de cada carpeta). Para
actualizarlas, vuelve a copiar esas tres carpetas.

Cómo las usa Sloth:

- Con la llave de HeyGen puesta en Opciones → Avatar, va en la variable `HEYGEN_API_KEY` del usuario, que heredan los
  agentes (el modo «API con llave» de las skills). Sin llave, las skills piden conectar el MCP de HeyGen o la CLI
  `heygen`; Sloth no instala ninguno.
- **Cuestan créditos.** Un agente solo las usa si el usuario lo pide o eligió el motor `heygen` en el compositor
  (`video-base/AVATAR.md`). El motor `heygen` del MCP `avatar` hace un video con un avatar sin pasar por ellas.
- Sloth pone `HEYGEN_NO_ANALYTICS=1` (si no lo pusiste tú): la CLI de HeyGen no le cuenta a HeyGen cómo fue cada tarea.
- Su script `heygen-video/scripts/update-check.sh` es opcional y Sloth no lo corre.
