# Referencias visuales de Pulso visual

La comparación actual entre los MP4 locales de Apple Music y el resultado Deezer está en
[MONTAJE-MUSICAL.md](MONTAJE-MUSICAL.md), con diferencias de encuadre y pautas de implementación.

Análisis de cuadros cada 0,5 s. No se copiaron sus imágenes, marcas ni textos.

- **Spotify Jam** (`TAyBFZhT590`): una lista se desplaza entre 0 y 3,5 s; de 4 a 7 s un botón se reescribe y se expande en anillos; a los 10–13,5 s la búsqueda y el símbolo de añadir son el plano principal. Recurso: llevar una acción de interfaz de detalle a plano general y usar el mismo objeto como puente.
- **Liquid Glass** (`liK0LtsjkGM`): de 2,5 a 3,5 s una notificación se expande hasta ser un reproductor; entre 7 y 10,5 s una cápsula se contrae y una galería se despliega. Recurso: profundidad contenida, superficies translúcidas y cambios de escala motivados por una acción.
- **Apple Music** (`9eCbazSUZYA`): alterna titulares grandes, montaje de tarjetas, color y pausas de marca; en 4,5–6,5 s el texto ocupa todo el encuadre. Recurso: contraste entre palabras breves de gran tamaño y composiciones con varios elementos; dejar reposar el mensaje antes de cambiar.
- **Framer** (`d2YXQIq38eg`): alterna un plano de contexto con primeros planos del cursor y de la interfaz, y al final aísla el mensaje. Recurso: la cámara cambia de distancia para mostrar qué se hizo y el resultado de esa acción.
- **Ask Search Anything** (`sxUBThVQLjU`, Google): la apertura (0–13 s) intercala frases breves, mucho espacio blanco y un acercamiento a la búsqueda; de 13–22 s una consulta se despliega en una respuesta extensa; de 23–55 s alterna demostraciones de voz, investigación y compras con primeros planos de interfaz; entre 55–74 s muestra respuestas concretas y contenido real; cierra con acciones breves y marca (75–87 s). Recurso: dividir la promesa en ejemplos, mostrar la entrada y su resultado con texto legible, contrastar planos limpios con demostraciones, y usar acentos cromáticos discretos. No inferir funciones de otra app a partir de este anuncio.

No se pudo escuchar las referencias en este entorno: las observaciones sobre ritmo proceden de los cuadros y no describen sus sonidos. Para el render, seguir un guion de planos con duración, anclas musicales o de voz según el pedido y transiciones. Nunca prometer sincronización auditiva sin escuchar el archivo.

La guía [Remotion Video Compositions de SkillDB](https://skilldb.dev/skills/motion-graphics-skills/remotion-video-compositions) recomienda animación determinista por cuadro, validación de datos, revisar límites de escena y escuchar el render final. El flujo de After Effects del usuario sirve para automatizar un proyecto existente; no sustituye una dirección de arte y una animación originales.
