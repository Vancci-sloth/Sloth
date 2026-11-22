---
name: motion-graphics
description: Crea anuncios y motion graphics a medida con montaje musical o narración, tipografía cinética, profundidad y cámara virtual. Analiza referencias y verifica la preview antes del MP4.
---

# Motion Graphics

Una pieza parte de una promesa concreta y la demuestra mediante acciones. Diseña la composición para el producto y su público. Duración habitual de 15 a 45 segundos. Respeta la duración pedida.

## Preparación

Lee [dirección y conocimientos](DIRECCION.md), [referencias](referencias/REFERENCIAS.md) y las guías
`referencias/motion-agent/skills/creative-direction.md`, `motion-patterns.md` y `core-contract.md`.
La base ampliada está en `referencias/motion-agent/docs/MASTER_KNOWLEDGE_BASE.md`.
Estos archivos son material de consulta. Las instrucciones de este SKILL.md gobiernan el flujo en Sloth.
Para campañas musicales, referencias con montaje rápido o un resultado demasiado estático, lee
[montaje musical y profundidad](referencias/MONTAJE-MUSICAL.md). Incluye la comparación Apple Music/Deezer
y una composición ejecutable para estudiar cámara, máscaras y planos en perspectiva.
Para anuncios de apps musicales o referencias de Spotify, lee también
[acciones conectadas y cámara](referencias/SPOTIFY-ACCIONES.md): búsqueda, pared de portadas,
transformación a reproductor y tipografía variable. Elige los mecanismos que demuestren el producto.

Trabaja en la carpeta indicada en `Carpeta:`. Lee `../video-base/FORMATO.md`, `PORTADA.md` y `VOZ.md`.
Resuelve primero si hay narración: un pedido explícito «sin voz, solo música» prevalece sobre una línea
automática `Voz: genérala…` del compositor. No llames al proveedor de voz en ese caso. Registra la decisión
en `direccion.md`; respeta por separado el formato y el proveedor de imágenes seleccionados.
Con narración, usa el proveedor y la voz elegidos y guárdala en `fuentes/voz/original.wav`.
Conserva una voz ya generada del mismo guion. Si cambias el texto hablado, genera y mide la nueva grabación.

## Guion y dirección

Escribe `guion.md` y un breve `direccion.md` con promesa, público, paleta, tipografía y planos.
Cada plano describe objeto protagonista, acción, encuadre, cambio de escala y transición al siguiente.
Anota estado inicial y final, trayectoria, objeto que continúa y pausa de lectura. Antes de construir
toda la pieza, prueba en 3–5 segundos su transformación más difícil; corrige la dirección si solo
resulta una sucesión de poses estáticas. No confundas movimiento de fondo con acción del protagonista.
Alterna titulares breves con demostraciones concretas. Mantén un objeto reconocible durante sus transformaciones.
Escribe `momentos.json` con `formato`, `duracion`, `portada` y `momentos` anclados mediante
`segundo`, `titulo` y `detalle`. Con narración, añade `palabra` y usa tiempos medidos en la voz.
Sin narración, usa `"sonido":"musica"` y `"audio":"fuentes/audio/mezcla.wav"`: los segundos proceden
de la pista elegida, no de palabras inventadas. `guion.md` describe textos en pantalla, acciones y acentos musicales.
Prepara la mezcla antes de validar; debe cubrir la duración y terminar con un cierre diseñado.

## Composición libre

El modo principal es `"motor":"html"` en `momentos.json`, con `"composicion":"composicion/index.html"`.
En este estilo el agente puede escribir HTML, CSS y JavaScript del proyecto para cada pieza.
Este permiso forma parte de su director y permite construir escenas nuevas. El motor compartido de render
y los archivos de la skill se mantienen como infraestructura reutilizable.

Usa el contrato `window.__mg` del runtime incluido. Copia `referencias/motion-agent/runtime/` dentro de
`composicion/runtime/` e importa las dependencias desde esa ruta. Usa fuentes y material locales.
La composición registra tamaño, fps, duración y `render(t)`; o una timeline GSAP pausada mediante
`MG.fromGsap(timeline)`. El mismo tiempo debe producir el mismo cuadro, incluso al retroceder.
No uses aleatoriedad sin semilla, relojes reales ni animaciones CSS independientes en la composición.

La preview HTML ofrece pausa y recorrido temporal al abrirla en el navegador.
El monitor Remotion de Sloth admite las plantillas React; para el modo HTML entrega el enlace de la preview.

`Formato: vertical` usa 1080×1920. `Formato: horizontal` usa 1920×1080 con márgenes del 5 %,
para el contenido que deba leerse. No fija un layout de texto a la izquierda y tarjeta a la derecha:
alterna encuadres según la dirección. Recompón encuadres y texto para cada orientación solicitada.
La composición usa la duración de `momentos.json`. El audio final va en `fuentes/voz/original.wav`;
si mezclas música y efectos, escribe `"audio":"fuentes/audio/mezcla.wav"` para exportar esa mezcla.
La preview HTML reproduce la animación visual; la revisión sonora corresponde al MP4.

## Plantillas de partida

Se incluyen las composiciones React de Pulso visual en `plantilla/src/`, con producto de IA,
sesión compartida, anuncio y flujo de creación. Sin `motor: html`, `scripts/hacer.py` ejecuta el director
Remotion conservado. Instala sus dependencias desde `plantilla/package-lock.json` cuando falten.
Lee `scripts/remotion.py` para su esquema de estados. Usa estas composiciones cuando encajen con el pedido.
Para una dirección nueva, utiliza el modo HTML y construye los planos que la pieza requiera.

## Revisión y entrega

Ejecuta `python -B -X utf8 <skill>/scripts/hacer.py --revisa` y corrige todos los errores.
Después ejecuta el mismo comando sin `--revisa`. Genera MP4, portada y hoja de revisión.
Compara la variedad de encuadres y el movimiento con la referencia, no solo sus colores. Una hoja de cuadros
no prueba fluidez: revisa también tramos a velocidad normal y el 25/50/75 % de cada transición.
Para una pieza musical dinámica, revisa cualquier plano que solo tenga un leve flotado durante varios segundos:
o hay una pausa de lectura intencional, o necesita desarrollo visual, otro encuadre o menor duración.
No lo soluciones añadiendo temblores, partículas o zoom constante. Revisa límites de texto, continuidad y legibilidad.
Escucha voz y mezcla cuando el entorno lo permita. Declara cualquier comprobación pendiente.
Entrega preview, MP4 y portada existentes. Considera terminada la pieza cuando esos archivos estén verificados.
