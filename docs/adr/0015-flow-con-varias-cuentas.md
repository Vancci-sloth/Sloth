# Flow con varias cuentas de Google, y videos desde un fotograma

Fecha: 2026-11-03

## Contexto

Una frutinovela (personajes de fruta en una telenovela, con sus voces) son de 8 a 15 clips de Veo con los mismos
personajes. Con Lite (10 créditos) son unos 130 créditos por episodio, y una cuenta gratis da 50 al día. useapi.net
vende lo mismo como servicio: hasta 50 cuentas por persona, con las cookies de cada una en sus servidores, captchas
pagados aparte y su MCP solo para el chat del agente de Flow. Se miró el 3 de noviembre de 2026 y se decidió hacerlo en
Sloth, en la compu de cada quien.

Ese mismo día, en la página de Flow:

- El panel de video tiene dos modos: «Fotogramas» (un primer cuadro y, si se quiere, uno último) e «Ingredientes»
  (referencias). Los dos aceptan los cuatro modelos y cuestan igual: Omni Flash 6 (360p), Lite 10, Fast 20, Quality 100.
- Los huecos de los fotogramas abren el mismo panel para subir que las referencias. Al recargar el proyecto se vacían.
- El correo de la cuenta está en el botón de cuenta de Google, como en AI Studio.

## Decisión

- **Las cuentas se agregan en Opciones → Google Flow**, hasta 50 contando la de la voz. Cada una tiene su perfil de
  Edge (`data/flow/cuentas/<id>/`) y se entra con Google en una ventana normal, como en la voz: Sloth solo mira por CDP si
  ya hay sesión. La cuenta queda al cerrar esa ventana, y antes cada quien acepta el aviso de Flow, que Sloth no acepta
  por nadie. La sesión no sale de la compu.
- **Cada cuenta abre su propio Edge**, con un puerto libre elegido antes, nunca `--remote-debugging-port=0`. Con `0`,
  Edge marca la página como automatizada (`navigator.webdriver`) y Google no deja entrar: «Es posible que el navegador no
  sea seguro». Se comprobó el 3 de noviembre de 2026. Se generan hasta
  tres pedidos a la vez (`A_LA_VEZ`), y Flow ya no espera el turno de la voz, salvo con la cuenta de la voz.
- **El reparto (`elegirCuenta`):** el pedido va a la cuenta libre que lleva más tiempo sin generar, así los créditos
  se gastan parejo. Si Flow no lo empieza, no se gastó nada. Entonces la cuenta descansa según el motivo: sin créditos
  3 h (y mientras tanto sigue haciendo imágenes), frenada 30 min, sin sesión 10 min. El pedido pasa a otra cuenta que no lo
  haya probado. Si ninguna puede, falla diciendo cuándo vuelven. Volver a probar cuesta solo unos 45 s, por eso los
  descansos son cortos.
- **Lo que le queda a cada cuenta** se lee del menú de su cuenta en Flow («20 créditos de Google Flow · se actualizan
  todos los días a las 12:02 p.m.»): tras cada video, en la misma página, y de todas con «Actualizar créditos» en
  Opciones, que abre su Edge sin ventana y no gasta. Si se sabe la hora de renovación, una cuenta sin créditos descansa
  hasta esa hora; con menos de 6 (el video más barato), descansa sin probar. Una cuenta que aún no gastó dice la hora de
  ahora, y esa no cuenta. Los videos hechos y sus créditos se apuntan por día y por cuenta (62 días), para ver en
  Opciones lo de hoy y lo del mes. Los agentes lo ven con `estado_flow` sin `id`.
- **En el chat**, «Uso» tiene su sección de Google Flow (lo que queda entre todas y a las cinco cuentas con más), y cada
  clip dice en su fila lo que costó y con qué cuenta. La barra de arriba suma lo que gastó ese chat. Eso se lee de lo que
  respondió el MCP en el hilo (`hechoDeFlow`), sin que el servidor apunte de qué chat es cada pedido. La respuesta lleva
  el id del pedido para no contar dos veces el mismo.
- **`generar_video` acepta `primerCuadro` (y `ultimoCuadro`) o `referencias`**, nunca las dos. La regla es la misma que
  en Flow, y para que un personaje salga igual, lo fiable es armar el cuadro con Nano Banana (gratis, con las referencias)
  y animarlo. Los fotogramas también piden la confirmación de `derechos`.
- **Sin servicios de captcha ni cookies copiadas a mano**: se usa la página real, como hasta ahora.

## Consecuencias

- Usar varias cuentas para tener más cupo puede hacer que Google limite o bloquee alguna. Opciones lo dice, y pide
  agregar solo cuentas propias.
- Cada Edge abierto pesa. Por eso son tres a la vez, aunque haya 50 cuentas.
- Todavía no se ha visto qué dice Flow al quedarse sin créditos. El motivo se lee de su aviso (`motivoDeAviso`). Si no dice
  nada, en un video se toma como falta de créditos y en una imagen como frenada.
- Este ADR cierra lo de animar una imagen del issue #6. Extender un clip sigue pendiente.
