# Videos con Google Vids, en la misma fila que Flow

Fecha: 2026-11-23

## Contexto

Google Vids (`docs.google.com/videos`) genera clips con Omni en el panel «Vídeo de IA» de su editor. useapi.net lo vende
como API (`useapi/google-vids-api`), con la sesión de cada cuenta en sus servidores, como hizo con Flow. Ya se había
decidido no usar ese servicio para Flow (ADR 0015).

Se probó el 23 de noviembre de 2026 con una cuenta gratis, de las de Flow:

- Vids abre con la misma sesión que Flow, en el mismo perfil de Edge. Una cuenta gratis genera: un clip vertical de 3 s
  salió en unos 30 s, y uno de 4 s con una referencia, en 66 s. Ambos en 720×1280, con audio y con la marca ✦.
- Su cupo es aparte del de Flow y no gasta créditos. Vids no dice cuánto queda: solo avisa al acabarse («Has alcanzado
  el límite de vídeos que puedes generar en Vids.»), o «límite provisional… Espera un minuto». useapi dice que se renueva
  el día 1 de cada mes (00:00 de California).
- Solo ofrece Omni, en 720p (1080p pide un plan de pago), de 3 a 15 s, horizontal o vertical. Acepta hasta 3 imágenes PNG
  o JPEG como ingredientes, que el prompt nombra «Imagen 1» a «Imagen 3». Al subirlas pide aceptar los derechos de la
  imagen, como Flow.
- Lo generado no se guarda en ningún lado hasta insertarlo en el video. El MP4 se baja directo, con la sesión de Edge.

## Decisión

- **Un modelo más de `generar_video`** («Google Vids · Omni», `MODELO_VIDS`), con las mismas cuentas, la misma fila y el
  mismo ritmo que Flow. `server/flow/vids.ts` maneja la página. Sin servicios de terceros, como en Flow.
- **Su cupo descansa aparte** (`descansosVids`): una cuenta sin cupo de Vids sigue en Flow, y al revés. Sin cupo, descansa
  hasta el día 1; con el límite corto, 2 min. Sin sesión, o frenada en Flow, no hace ninguno de los dos.
- **Se busca por clases, no por textos.** Sus botones no tienen iconos con nombre, y sus clases
  (`collapsiblePromptBox…`, `…GenerationSettingsButton`) no cambian con el idioma.
- Cada cuenta tiene un archivo de Vids para Sloth (`proyectosVids`), creado con `/videos/create`. `?gs_dl=videogen` abre
  el panel sin buscar su botón.
- Las referencias piden la misma confirmación de `derechos` que Flow.

## Consecuencias

- Como Vids no dice lo que queda, un pedido que rechaza sin aviso de cupo falla sin saber si gastó. El agente no lo
  repite sin decírselo al usuario.
- La pestaña «Animar» (partir de una imagen) no se usa: no respondió en la prueba. Un video que debe empezar en una imagen
  la pasa como «Imagen 1».
- Sin comprobar: cuánto cupo tiene una cuenta gratis y el texto exacto de sus avisos en otros idiomas, fuera del español.
- Cada cuenta crea un archivo «Vídeo sin título» en su Drive la primera vez.
