---
name: recetas-cocina
description: Crea Shorts de recetas al estilo de Sazón en Equilibrio (gancho fijo arriba, planos cenitales de cocina, subtítulos palabra a palabra y cierre «sígueme»), con los colores y el logo de la marca. Narración con ElevenLabs Isabella. Úsala cuando pidan una receta con el estilo Recetas de cocina.
---

# Recetas de cocina (Sazón en Equilibrio)

Videos cortos (~20–45 s, o hasta ~1 min si la receta lo pide) como el Short de referencia
[qk5HoPis1kQ](https://www.youtube.com/shorts/qk5HoPis1kQ): plato terminado → pasos en planos cenitales → plato otra vez → «sígueme».
Marca: [Sazón en Equilibrio](https://www.youtube.com/@sazonenequilibriope). Logo y colores en `marca/` y `marca.json`
(verde `#173E32`, crema `#F0F0E0`). **No cambies el logo ni la paleta.**

Lee [LEEME](../video-base/LEEME.md), [FLOW](../video-base/FLOW.md), [VOZ](../video-base/VOZ.md),
[FORMATO](../video-base/FORMATO.md) y [PORTADA](../video-base/PORTADA.md).

## La esencia (copiar del Short, teñir de la marca)

- **Gancho fijo:** la primera frase del guion (beneficio + plato + «esta misma noche» / pocos ingredientes) queda
  todo el video en una caja arriba: fondo crema `#F0F0E0`, texto verde `#173E32`, tipografía sans, centrada.
- **Planos:** cenital / 3-4, mesa clara, tabla de madera, mise en place, manos cocinando; abre y cierra con el plato
  servido. Imágenes fijas con zoom suave (no fingir video de acción).
- **Subtítulos:** palabra a palabra abajo, MAYÚSCULAS, relleno crema y contorno verde oscuro (legibles sobre comida).
- **Logo:** `marca/logo.png` arriba a la izquierda, ~12 % del ancho, con margen; no lo redibujes.
- **Cierre:** última línea = `cierre` de `marca.json` («Sígueme para más recetas.»).
- **Voz:** ElevenLabs Isabella (`elevenlabs:p18tR9wFA5Ng9WhfWI0o`), salvo que la línea diga que la manda el usuario.

## Formato

`Formato: vertical` o sin línea: 1080×1920, imágenes 9:16. `Formato: horizontal`: 1920×1080, 16:9. Portada vertical =
primer fotograma; horizontal = miniatura aparte.

El proyecto va en `Carpeta:`; sin ella, `receta-<plato>`.

## Pasos

1. **Receta y guion.** `guion.md`: 1ª línea = gancho (también en `gancho.txt`, una sola frase). Luego pasos claros;
   cierra con la frase de `marca.json`. `escenas.json`: arreglo `{ "imagen", "desde", "hasta" }` en segundos,
   contiguos desde 0, cubriendo toda la voz. Listo cuando el gancho está fijado y cada escena encaja con su frase.
2. **Voz.** ElevenLabs Isabella (`elevenlabs:p18tR9wFA5Ng9WhfWI0o`) vía [VOZ.md](../video-base/VOZ.md) →
   `fuentes/voz/ai-studio.wav`. Si la línea trae otra IA, usa Isabella igual; si manda el usuario, su WAV. Alinea
   (`alinear` / script de la skill) y deja tiempos de palabra en `fuentes/voz/voz.json` (o el que produzca el alineador)
   para los subtítulos. Ajusta `desde`/`hasta` de las escenas a la narración.
3. **Imágenes.** Según `Imágenes:` / [FLOW.md](../video-base/FLOW.md). Una imagen original por escena en `cuadros/`,
   fotorrealismo cenital, cocina coherente, **sin texto en la imagen** (el texto lo pone el montaje). Revisa
   ingredientes y manos.
4. **Montaje.** Masteriza la voz. Copia el logo al proyecto si falta:
   `cp <skill>/marca/logo.png marca/logo.png`. Luego, desde el proyecto:
   `python <skill>/scripts/montar.py --voz fuentes/voz/master.wav --escenas escenas.json --gancho gancho.txt --logo marca/logo.png --subtitulos fuentes/voz/voz.json --formato <vertical|horizontal>`.
   Comprueba con `comprobar.mjs` y hoja en `revision/`.
5. **Portada.** Plato + título breve con colores de marca ([PORTADA.md](../video-base/PORTADA.md)); en vertical, primer fotograma.

## Reglas

- No copies cuadros ni textos de otros canales; solo el *formato* del Short de referencia.
- Español de Perú / cercano al canal; sin consejo médico fuerte («glucosa» solo si el usuario lo pide en el tema).
- Sin moneda 3D ni personaje sticker.
