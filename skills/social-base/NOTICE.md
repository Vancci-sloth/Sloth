# Aviso de terceros: Instagram Skills

Las skills `social-base`, `social-caption-writer`, `social-carousel-planner`, `social-content-planner`,
`social-hashtag-strategist`, `social-hook-extractor`, `social-humanizer`, `social-profile-optimizer` y
`social-repurposer` son una adaptación de **Instagram Skills**, de **Sergey Bulaev**:

- Origen: https://github.com/sergebulaev/instagram-skills (commit `550d3cf6cece08de75dae64235bd32136820920f`)
- Licencia: MIT. El texto completo está en `LICENSE`, en esta carpeta y en la de cada skill, sin cambios.

Copyright (c) 2026 Sergey Bulaev.

## Qué cambió

- Los nombres `ig-*` pasan a `social-*`, y las referencias compartidas (`references/` de la raíz) viven en `social-base`.
- No publican: se quitaron la publicación con Publora, las imágenes de Pixfaro y la lectura con Apify (`lib/`,
  `media-workflow.md`, `mcp-read-layer.md`, `sub-skills/illustration.md` y la skill `ig-audience-insights`). Entregan
  el texto listo para pegar.
- Cada `SKILL.md` lleva al principio una nota de cómo se usa en Sloth (idioma, otras redes, nada de pago), y se agregó
  `references/redes.md`.
