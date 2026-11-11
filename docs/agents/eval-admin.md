# Eval del Administrador

El Administrador (`web/src/Admin.tsx`) contra cuatro paneles de administración con demo pública: React-admin
(Posters Galore), Refine (finefoods), Filament y PocketBase. Son los que hacen lo mismo que él (buscar a una persona,
ver lo suyo, cambiarle un valor, ver qué falló) y se pueden medir sin cuenta; Stripe, Clerk o el panel de Voices
Cloning piden entrar, y en esta computadora no hay sesión de ninguno. Cada categoría tiene una medida que se repite, y
se puntúa como el eval de la voz (`eval-voz.md`):

- **10**: Sloth es mejor que los cuatro en esa medida.
- **8, 6, 4 o 2**: es mejor que tres, dos, uno o ninguno.
- **1**: no lo tiene.

## Cómo se mide

- **Los dos scripts** comparten navegador, ventana (1280×800), clic de persona y legibilidad (`eval-voz-comun.mjs`),
  y el modelo de tiempo, el detector de inglés y la medida de pintado (`eval-admin-comun.mjs`):
  - **Sloth**: `node scripts/eval-admin.mjs <puerto>`, sobre la copia del repo que corre. Sin `--real`, con un panel
    inventado (85 personas en dos llaves, 300 llamadas, 14 errores) que tarda 4 s en llegar, como el cobro; con
    `--real`, el de tu cobro. En los dos, lo que cambiaría algo (sumar, quitar, suspender, dar de alta) lo contesta el
    script y no sale: no toca ninguna cuenta. Capturas en `data/navegador-capturas/admin-*.png`.
  - **Los otros**: `node scripts/eval-admin-ajenas.mjs reactadmin|refine|filament|pocketbase`, en sus demos, con su
    login de demo. No guardan nada.
- **Encontrar, cambiar, ver**: se cuenta en tiempo con el modelo KLM (Keystroke-Level Model): una tecla, 0,28 s;
  apuntar y hacer clic, 1,3 s. Se cuentan las entradas que pide cada interfaz, comprobadas en el script.
- **Abrir**: con la app quieta 3 s en otra página suya, un clic de persona (aprieta, 100 ms, suelta) en la entrada del
  menú, hasta que la primera fila con datos está pintada (`abrirConRaton`). Las cuatro abren al soltar y pagan esos
  100 ms; Sloth abre al apretar (con el ratón; con el dedo, al soltar), como los menús del sistema.
- **Historial**: con el teclado (lo que permita cada una) y con un clic de persona en la fila (`clicHasta`): las
  entradas y los ms hasta ver el historial ya con su contenido.
- **Pintado**: de la tecla al cuadro siguiente al cambio (requestAnimationFrame y luego un MessageChannel).
- **Legibilidad**: la razón WCAG del texto visible más bajo y su letra más chica, en el contenido de la página, sin el
  menú lateral, en las cinco.
- **Idioma**: las palabras de interfaz en inglés visibles (`INGLES_UI`), sin contar correos ni nombres.

## Resultados

Medido el 11 de noviembre de 2026. Las otras, 3 corridas cada una más 2 de dos revisiones independientes (y 3 más del
historial); Sloth, 3 con el panel inventado y una con el real tras el último cambio, más 5 de las revisiones. En el
panel inventado, las últimas 300 llamadas son de 40 de las 85 personas, sus errores salen de esas llamadas y la ficha de
cada quien tarda 1 s en llegar del cobro, como en el de verdad.

| Categoría (medida) | React-admin | Refine | Filament | PocketBase | Sloth antes | **Sloth** | |
|---|---|---|---|---|---|---|---|
| **1. Abrir** (ms del clic de persona a la lista pintada) | 186–525; la primera, 602–897 | 204–438; 400–630 | 394–1.399; 496–974 | 308–709; 340–748 | 4.000–6.000 (esperaba al cobro) | **10–64; la primera, 20–84**: armado y oculto con lo último leído, entra al apretar. Sumándole los 100 ms de soltar seguiría ganando (110–184 contra 186) | 10 |
| **2. Encontrar a alguien por su correo** (KLM) | clic en el buscador + 4 letras = 2,42 s | abrir el embudo, su campo, 4 letras y «Filter» = 5,02 s | clic en la columna de correo + 4 = 2,42 s | clic + 5 letras + Enter = 2,98 s | no había buscador | **el buscador ya tiene el cursor: 2 letras con tus datos (0,56 s), 7 con el inventado (1,96 s)**; filtra en 3–28 ms | 10 |
| **3. Darle créditos** (KLM, de su fila a guardado) | 3 clics + 6 teclas = 5,58 s | no se edita | 5,58 s | 5,58 s | 2 clics + 4 teclas = 3,72 s | **Enter, 5000, Enter = 1,68 s** (con el ratón: clic, 5000, Enter = 2,70 s); la ficha cuenta lo sumado al momento | 10 |
| **4. Ver por qué falló la última llamada** (KLM) | no tiene registro | no tiene | no tiene | 1 clic en Logs = 1,3 s | bajar toda la página | **0 s**: la cifra de errores trae la fecha y el mensaje de la llamada fallida más reciente («No hubo conexión con las voces de Sloth.»); el script comprueba que es esa | 10 |
| **5. Todo lo de esa persona** (de su fila a su historial) | 1 clic; 171–291 ms hasta verlo | 1 clic (el ojo); 174–302 ms | 2 clics = 2,6 s | no tiene historial | 1 clic | **con el ratón, 1 clic y 18–62 ms**. Con tus datos, las 33 personas que no salen en las últimas llamadas ya tenían su ficha guardada (33 de 33), y las 5 medidas enseñaron su historial en 27–45 ms; con el teclado, Enter = 0,28 s. Créditos, plan, historial y acciones en la misma ficha. Sumándole los 100 ms de soltar seguiría ganando (119–158 contra 171) | 10 |
| **6. Teclado** (teclas de la lista al campo del valor) | 135 | imposible | 79 | 34 | imposible (sin buscador) | **3 con tus datos, 8 con el inventado** (letras + Enter) | 10 |
| **7. Legibilidad** (contraste mínimo; letra más chica) | 1,83; 12 px | 3,33; 14 px | 4,62 (una corrida, 1,0); 12 px | 2,38; 13 px | letra de 11 px (el contraste no se midió) | **7,89; 14,5 px** | 10 |
| **8. En tu idioma** (palabras de interfaz en inglés a la vista) | 44–46 (sin español) | 21 (sin español) | 51 | 22 | `external_id`, `GET /api/…`, `VOZ_CREDITOS` | **0**, también contando toda la página | 10 |
| **9. Filas a la vista** (1280×800; alto de fila) | 10–12; 52,8 px | 9; 64,8 px | 8; 56,8 px | 3 (solo hay 3); 59 px | ~5; 118 px | **15 (16 con tus datos); 35,3 px**; la página no se desplaza de lado a 1280, 1024 ni 390 | 10 |
| **10. Deshacer** (tiempo para deshacer un cambio) | 4,4–4,7 s (sus ediciones se mandan a los 4,5 s) | 0 | 0 | 0 | 0 (suspender pedía confirmar) | **sin límite**: el aviso trae «Deshacer» y la ficha guarda «Lo que le cambiaste aquí», créditos y suspender, con su «Deshacer» cuando sea | 10 |

Notas:
- **Encontrar**: las demás se midieron con las 4 primeras letras; Sloth escribe letras hasta que la persona sale
  primera, que en el panel inventado (17 nombres repetidos en 85 correos) son 7. Aun así gana.
- **Darle créditos**: ninguna de las cuatro tiene un campo de saldo; se midió el campo más parecido de su ficha. Sin
  contarles Ctrl+A y con Enter en vez del clic en guardar, quedarían en 4,56 s.
- **Historial**: la ficha se abre con lo que ya hay (sus llamadas entre las últimas del panel y su ficha guardada en
  `data/voz/admin-fichas.json`) y luego se pone al día con el cobro (~1 s). Al abrir Sloth y tras cada lectura del
  panel, el servidor lee de fondo las fichas que nunca se han leído (de tres en tres) y luego las de más de 12 h (una
  cada 300 ms). Quien se da de alta después sale en las últimas llamadas con su alta.
- **En frío** (la ficha de alguien sin llamadas recientes que el servidor aún no ha leído nunca), su historial espera al
  cobro: 909–927 ms, y ahí sí pierde contra React-admin y Refine. Solo pasa en una instalación nueva: en la copia de
  prueba, sin ninguna ficha guardada, las 86 estaban listas 26 s después de abrir Sloth. Bajarlo de ese segundo pide
  que el cobro (`licencias/`) dé el registro sin esperar a Voices Cloning, y eso no se ha publicado.
- **Abrir una fila al apretar** (como la entrada de la barra) hace que no se pueda arrastrar para seleccionar un correo
  en la lista; el correo se copia de la cabecera de su ficha.
- **Deshacer «sin límite»** es aplicar el cambio al revés (quitar lo que se sumó, reactivar a quien se suspendió), no
  volver el tiempo atrás: si ya gastó los créditos, quitarlos falla y lo dice.
- **A 390 px** la tabla esconde dentro de su caja el plan y la fecha; la página no se mueve de lado.

## Lo que el eval y su revisión encontraron, y se arregló

- **La página medía 34.000 px** y cada fila 118 px, por los botones de sumar y quitar en cada una. Ahora son pestañas,
  y las acciones viven en la ficha.
- **Abrir esperaba 4–6 s al cobro.** Ahora el servidor guarda el panel (`data/voz/admin.json`) y el Administrador se
  arma oculto con él; lo nuevo llega de fondo y dice «Leído hace… · leyendo lo nuevo…».
- **Aún armado, abrir tardaba ~190 ms**: al enseñarse se volvían a pintar las 85 filas. Ahora la lista y el
  Administrador están memorizados (la app no los repinta), y la entrada de la barra abre al apretar.
- **La primera vez a veces no estaba armado** (465 ms en una corrida, con la máquina ocupada): se arma antes.
- **«Deshacer» del historial quitaba créditos que no diste tú**: el cobro anota igual tus sumas, el reparto mensual,
  la rifa y los regalos, y salía en todas (también en las ya deshechas). Ahora Sloth anota lo que cambias desde aquí
  (`data/voz/admin-cambios.json`) y solo eso se deshace; lo deshecho ya no lo ofrece. El historial del cobro dice
  «Recibió», no «Le sumaste».
- **«/» con la ruleta abierta la cerraba** a medio sorteo: el atajo no mira si hay un diálogo encima.
- **El último error enseñaba una etiqueta, y no el más reciente**: ahora es la llamada fallida más nueva, con su
  mensaje; y «Errores en 30 días» va del más nuevo al más viejo.
- **La ficha no enseñaba los créditos nuevos** hasta volver a leer (4–6 s): cuenta lo sumado al momento, también lo
  deshecho desde el aviso.
- **Con tus datos, el historial tardaba ~1 s** (lo que tarda el cobro): ahora se ven al momento sus llamadas entre las
  últimas del panel, y la ficha se pide al pasar el ratón.
- **Con tus datos, Enter no sumaba** si escribías antes de que la ficha leyera lo suyo (1–2 s).
- **Dos lecturas a la vez se podían pisar**: solo cuenta la última pedida.
- **«Usuarios» contaba solo la llave con más gente**: ahora suma todas.
- **Apretar en «Administrador» con el dedo y desplazar entraba igual**: al apretar solo entra con el ratón.
- **«2.5» se truncaba a 2 sin avisar**: solo acepta enteros, y lo dice. Esc en el campo borra lo escrito antes de
  cerrar (también un «-» solo: el campo ya no es `type=number`).
- **Un cambio se podía deshacer dos veces** (desde el aviso y desde la ficha): el servidor responde 409 a deshacer lo ya
  deshecho, y 404 si el cambio no está anotado.
- **Tras sumar, el cursor caía en la página**: el campo se bloqueaba con `disabled` y no volvía a tomar el foco. Ahora
  solo se bloquea, y el cursor sigue en él para el siguiente.
- **La ficha volvía a los créditos de antes** cuando llegaba tarde la lectura pedida antes de sumar: lo sumado cuenta
  hasta que llega una lectura pedida después.
- **Con la ficha abierta, a 1024 px tapaba Créditos y Usados, el buscador se aplastaba a su icono y Llamadas se
  desplazaba de lado**: la lista se corre a cualquier ancho desde 900 px, «Leído hace…» se queda en su botón y Llamadas
  esconde las columnas menos útiles.
- **La ficha tapaba Créditos y Usados**: con ella abierta, la lista se corre y deja el plan y la fecha.
- **La Rifa perdió estilos** al rehacer el CSS (sus secciones sin separación, «Abierta desde…» como texto normal), la
  tabla de ganadores escondía «Volver a sumar» y «Ya le llegaron» fuera de la pantalla, y «Premio» y «Ganan» se
  encimaban. Se devolvieron sus clases y su tabla parte líneas.
- **Esc no cerraba la ficha** (el campo estaba deshabilitado y no tomaba el foco), **las tablas se aplastaban** dentro
  de la columna, **el rojo tenía contraste 5,6** y **el último error no cabía** en su cifra.
- **En los scripts**: `pintado` no veía la «o» (está en todos los correos y no cambia la lista); el panel inventado no
  devolvía el id del cambio; el historial de las otras se medía solo en clics, sin cuánto tardan en enseñarlo; y el
  panel inventado favorecía a Sloth: todos salían en las últimas llamadas, sus errores no cuadraban con ellas y la
  ficha llegaba al instante.

## Lo que no se pudo medir

- **Stripe, Clerk y el panel de Voices Cloning** piden entrar, y en esta computadora no hay sesión de ninguno.
- **Deshacer en Filament y PocketBase**: comprobarlo pedía guardar en una demo pública compartida. El 0 sale de que no
  hay botón de deshacer en la ficha ni en la lista.
- **Refine** no deja editar a sus clientes ni tiene su correo: se buscó por nombre.
- **En tu disco**, fuera de git como el resto de `data/`: `data/voz/admin.json` (lo último leído: correos, planes y las
  últimas 300 llamadas), `admin-fichas.json` (la ficha de cada quien) y `admin-cambios.json` (lo que cambiaste aquí).
