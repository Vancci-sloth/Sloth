# Diseño de VyMotion

## Programación de YouTube

### Dirección

Una revisión de publicaciones dentro de «Mis videos»: seleccionar los videos largos disponibles, revisar el título
con su miniatura, editar sus datos y asignar fechas antes de programar el lote. Reutilizar el patrón de «Programar los
que faltan», con una lista amplia de publicaciones y una acción final que indique cuántas se confirmaron.

Referencias: `references/pinterest/youtube-programacion/moodboard.html` y `references.json`. Los patrones principales
son la lista editorial (01 y 02), el calendario con previas (03 y 04) y las filas oscuras de contenidos (05). El catálogo
visual (07 y 08) sirve para valorar el título junto a la miniatura, sin copiar otra aplicación.

### Paleta

Usar la paleta de `web/src/styles.css`. El fondo es negro, las superficies son grafito y el texto es blanco o gris.
Los componentes usan `--amber` y `--amber-2` para el acento gris claro, `--ok` para éxito y `--bad` para error.

En Opciones, el título y las acciones quedan fuera de las tarjetas. Las portadas con ASCII se usan en Redes y Nuevo chat,
y en los estados vacíos de Actividad y Notificaciones. Cada campo se dibuja dentro de su tarjeta y respeta el movimiento reducido.

### Tipografía

Inter / Segoe UI / system-ui, la fuente actual. Encabezado 20–24 px y 650–700; título de publicación 15–16 px y 600;
campos 13–14 px; etiquetas y estados 12–13 px. El título completo debe poder leerse y editarse.

### Forma y espacio

Bordes de un píxel y radios actuales de 8–14 px; separaciones de 8, 12, 16 y 24 px. Miniaturas horizontales 16:9,
sin recortarlas. Un cuadro de revisión ancho, con cabecera y confirmación fijas y contenido desplazable. En pantallas
estrechas, las columnas de cada publicación se apilan; controles y estado siguen visibles.

### Patrones

- En Mis videos, barra «YouTube» con pendientes y «Revisar y programar». Respeta el filtro de estilo y admite todos.
- Junto a TikTok e Instagram, calendario de YouTube del canal completo con los días ocupados, títulos y horas al
  pasar el cursor, y el próximo día libre desde mañana. Solo las fechas confirmadas llevan puntos verdes; las subidas
  pendientes se cuentan aparte. Las fechas permanecen al limpiar los archivos locales.
- Cada fila contiene selección, miniatura con vista ampliada, título editable, descripción, fecha local, estado y una
  confirmación «Título y miniatura revisados». Los videos sin miniatura explican lo que falta y permiten importar una.
- Fechas en lote con inicio, hora e intervalo editables; cada publicación permite ajustes. Indicar la zona horaria.
- Guardar borradores para continuar la revisión; no marcar como revisado automáticamente un título o miniatura.
- Un selector en la cabecera permite elegir Claude o Codex, modelo y esfuerzo para los tres botones de IA. Recuerda
  la elección de YouTube; cada petición usa esa elección y explica los límites de uso sin pedir reconectar la cuenta.
- Las recomendaciones de varios videos se aceptan juntas, con dos análisis simultáneos y una cola que sobrevive al
  cierre de VyMotion. Cada video muestra su avance o posición y conserva el modelo y esfuerzo solicitados.
- La barra de YouTube permite «Eliminar subidos del disco» por estilo, y la revisión ofrece limpieza individual.
  La confirmación manda solo los archivos de video a la Papelera; conserva proyectos, registros y publicaciones.
  Las subidas incompletas, versiones cambiadas y archivos en uso se quedan. La galería se actualiza tras limpiar.
- Un video programado muestra la fecha, el avance de subida o su error y un enlace a YouTube Studio. La selección y la
  confirmación no incluyen videos que ya quedaron programados. Los reintentos conservan el video remoto para no repetirlo.

### Evitar

La revisión incorpora «Recomendar título» y «Recomendar miniatura» en cada video. Debajo se muestran la propuesta,
su motivo y referencias con miniaturas reales, título, canal y vistas. Elegir un título vuelve a pedir revisión.
Un concepto o prompt de miniatura se distingue de la imagen importada; las referencias no sustituyen la portada.

Gráficas de analítica, contadores decorativos, nuevas paletas, métricas inventadas y confundir un cuadro del video con
una miniatura elegida. No programar publicaciones cuyos títulos o miniaturas todavía no fueron revisados.

---

## Comunidad

### Dirección

Lo que la gente hace con VyMotion y cómo lo hace, como la comunidad de Skool, pero cálido y oscuro como el resto de VyMotion.
Al centro, el feed: «Escribe algo», las secciones en píldoras (General, Lo que hice, Ayuda, Mejoras, Anuncios),
«Comienza aquí» y una tarjeta por publicación. A la derecha, la tarjeta de la comunidad (portada con el logo, qué es,
miembros, activos hoy, creador, caras y tu perfil), que se queda a la vista al bajar. El gris claro marca la
sección elegida, la acción principal, lo fijado y los comentarios que aún no lees.

### Paleta

La de VyMotion, sin colores nuevos: fondo `--bg`, tarjetas `--panel`, compositor y comentarios `--panel-2`, bordes `--line`
(`--line-hover` al pasar el ratón), texto `--text` y `--muted`. Acento gris claro en `--amber`, `--amber-2` y `--amber-tinte`. Hecha
y pasos cumplidos: `--ok`. Borrar: `--bad`.

### Patrones

- Tarjeta: cara, nombre (con «Creador» en gris claro si es el creador), «hace 2 h · Sección»; título en 18 px 700 y dos líneas
  del texto; a la derecha, la portada (la imagen o el primer cuadro del video, con su botón de play). Abajo, me gusta,
  comentarios, las caras de quienes comentaron y «Nuevo comentario hace 5 h» en gris claro si aún no la abres.
- Lo fijado lleva borde gris claro y «Fijada» arriba a la derecha. En Mejoras, una píldora dice cómo va: Idea, Se está
  haciendo (gris claro) o Hecha (verde).
- Abierta, sobre un velo: entera, con su video (vertical a 9:16), sus imágenes que se amplían, la barra del creador
  (fijar, «Se está haciendo», marcar hecha) y los comentarios en globos, con donde se comenta al final.
- El compositor (`Escribir.tsx`): título, texto que crece, capturas pegadas o soltadas, un video de «Mis videos» y la
  sección en el pie; con un resplandor gris claro detrás. «Ayúdame a decirlo» (el símbolo de Claude, lo único fuera de la
  paleta) en Ayuda y Mejoras, y en «Pedir una mejora» de cada hilo.
- «Comienza aquí»: un anillo verde con lo que llevas y tres pasos (tu nombre y tu foto, presentarte, comentar).
- Comentarios: debajo de cada globo, me gusta y «Responder»; las respuestas van sangradas con una raya que las une.
- La campana, junto al título: un panel con tus avisos (lo nuevo con tinte gris claro y su punto); los que no has leído
  también salen en un contador gris claro junto a «Comunidad», en la barra lateral.
- Reportar: una bandera en lo de los demás y una caja con los motivos. Lo reportado lleva para el creador una píldora
  roja («Reportada · 2») y «Está bien, se queda».
- Sin foto, la cara es la inicial en gris claro sobre `--panel-2`; el creador sin foto, el logo de VyMotion.

### Evitar

Emojis como iconos (los de las secciones son de trazo, `web/src/Iconos.tsx`), contadores inventados, gráficas, y que
una mejora se marque hecha sola: la marca el creador.
