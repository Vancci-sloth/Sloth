# Recomendaciones de títulos y miniaturas de YouTube

## Incidente de los botones de IA, 13 de octubre de 2026

Los videos antiguos conservaban `claude-opus-5-5` y la recomendación heredaba ese modelo. La cuenta seguía conectada,
pero una reproducción de dos segundos devolvió `is_error: true` con límite semanal agotado; se mostraba como fallo
de conexión. La revisión ahora exige una elección explícita de agente, modelo y esfuerzo, validada contra el catálogo.
Se conserva esa elección para la próxima revisión y se distingue cuota agotada, autorización y formato de respuesta.
El rechazo real de Claude quedó reproducido y explicado; una descripción real con Codex y esfuerzo bajo terminó
correctamente. Las pruebas de interfaz verifican los tres botones y la persistencia de la elección.

Investigación de fuentes primarias, 13 de octubre de 2026. No se hicieron llamadas con credenciales ni publicaciones.

## Datos disponibles

- Descubrir referencias con `search.list(part=snippet,type=video,q=...)`; la respuesta admite hasta 50 resultados por página. `relevanceLanguage=es` prioriza español, pero no lo garantiza. `order=viewCount` ordena por vistas; `order=relevance` favorece afinidad. Son muestras seleccionadas, no una población de canales. `videoDuration=long` significa más de 20 minutos: excluiría videos de El Diff de seis minutos. Para este producto conviene filtrar duraciones tras obtener detalles y explicitar el criterio. [Search: list](https://developers.google.com/youtube/v3/docs/search/list).
- Enriquecer los ID con `videos.list(part=snippet,statistics,contentDetails)`: títulos, descripción, fecha, duración, vistas y URLs de miniaturas. No proporciona audio, fotogramas del video completo, transcripción ni CTR. `maxres` no existe en todos los videos: usar la mejor variante disponible, sin construir una URL suponiendo que existe. [Videos](https://developers.google.com/youtube/v3/docs/videos), [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list).
- La colección de subidas sale de `channels.list(part=contentDetails,id=...)` → `contentDetails.relatedPlaylists.uploads` → `playlistItems.list(playlistId=...,part=contentDetails,maxResults=50)` → detalles de videos. No deducir el ID de playlist sustituyendo caracteres del ID de canal. [Channels](https://developers.google.com/youtube/v3/docs/channels), [Channels: list](https://developers.google.com/youtube/v3/docs/channels/list), [PlaylistItems: list](https://developers.google.com/youtube/v3/docs/playlistItems/list).
- El permiso de subida no convierte captions de terceros en descargables: `captions.download` exige permiso para editar el video. Una bandera `caption=true` no entrega la transcripción. Para analizar contenido real, reutilizar transcripciones que Ideas ya tenga o material local del propio video. [Captions: download](https://developers.google.com/youtube/v3/docs/captions/download).

## Qué permite concluir la comparación

Decisión de producto: `vistas / mediana de vistas del mismo canal` sirve como señal descriptiva si se conserva número de videos, fechas, formato y selección de muestra; no es una métrica oficial de YouTube. Excluir el video evaluado cuando haya suficientes otros videos. No mezclar cortos, largos y directos; si la muestra es pequeña o la mediana es cero, declarar el múltiplo no disponible. Edades dispares siguen siendo una limitación. Si solo hay búsqueda, decir «comparación con esta búsqueda»; nunca llamarla «rendimiento frente a su canal».

Las vistas no prueban que una miniatura o un título causaran el resultado. El CTR depende de público y fuente de tráfico; cambiar títulos/miniaturas y comparar resultados sin controlar audiencia puede confundir esas diferencias. Por eso mostrar patrones observados e hipótesis con enlaces, sin predecir CTR ni prometer aumentos. [YouTube: preguntas sobre impresiones y CTR](https://support.google.com/youtube/answer/7628154).

La documentación oficial consultada ya describe buckets separados para búsquedas/subidas y cuota común para otros endpoints; no fijar en la interfaz los antiguos costos de búsquedas como hechos permanentes. Limitar consultas, reutilizar investigación existente y mostrar errores de cuota. [Descripción y cuotas de Data API](https://developers.google.com/youtube/v3/getting-started).

## Visión en los adaptadores de Sloth

Confirmado en código local: `AgentRun.send(text, skill, images)` acepta rutas. `server/claude.ts` las codifica en bloques `image` base64 antes del texto; `server/codex.ts` emite `{type:'localImage',path}`. La declaración instalada `SDKUserMessage` admite `MessageParam` con bloques de imagen. Codex documenta ese mismo input RPC. [AgentRun](../../server/agent.ts), [Claude](../../server/claude.ts), [Codex](../../server/codex.ts), [OpenAI: app-server, Turns](https://learn.chatgpt.com/docs/app-server#turns).

Pasar URLs escritas en el prompt no demuestra que el modelo haya visto la imagen. Descargar referencias validadas y enviarlas como adjuntos, con una relación inequívoca entre orden de imagen e ID de video. Si falla una descarga, marcarla como no analizada visualmente. JPEG/PNG/WebP/GIF son formatos admitidos por Claude; imágenes pequeñas o borrosas pueden producir errores de lectura y visión no genera imágenes raster por sí misma. [Anthropic: visión](https://platform.claude.com/docs/en/build-with-claude/vision).

## Evidencia exigible a cada recomendación

La salida se solicita con un esquema JSON: `outputSchema` en cada `turn/start` de Codex y `outputFormat` en el SDK
instalado de Claude. Así los prompts de miniatura y textos largos no dependen de extraer un JSON escrito libremente.
[Codex: Turns](https://learn.chatgpt.com/docs/app-server#turns); tipos locales `Options.outputFormat` y
`SDKResultSuccess.structured_output` de `@anthropic-ai/claude-agent-sdk`.

1. Guardar ID, URL, canal, fecha de consulta, vistas y muestra de comparación; conservar la URL original de miniatura y estado de descarga/análisis.
2. Distinguir «análisis de título/descripción», «miniatura vista», «transcripción disponible» y «fotogramas locales revisados». No declarar que se vio un video entero a partir de metadatos.
3. Vincular cada propuesta a referencias presentes en la muestra mediante ID; validar esos ID al guardar para impedir referencias inventadas. Una observación visual requiere imagen adjunta; una afirmación del contenido requiere guion, transcripción o fotograma identificado.
4. Reutilizar recomendaciones y miniaturas previas sin modificar selección del usuario; elegir una propuesta sigue siendo una acción explícita. Un concepto o prompt de miniatura debe mostrarse como tal hasta existir un archivo de imagen real.
