# SKILL · Prompts para agentes (v2)

> **Cuándo cargar:** Al configurar un subagente o un flujo de varias fases.
> **Fuente:** Anexo B (Master Knowledge Base v2, texto original sin reescribir). Los números § remiten a `skills/router.md` → índice.

---

# Anexo B. Prompts para agentes (v2)

> Principio: los prompts piden **evidencia y entregables**, no "hazlo bonito".

## B.1 Análisis de referencia

```text
Actúa como director de arte y motion designer sénior. No programes todavía.
Analiza la referencia (video/imágenes) y entrega:
1) Objetivo, estilo y lenguaje visual.
2) Escenas con tiempos (usa ffprobe/ffmpeg y hojas de contacto a 3 fps; 6+ fps en transiciones).
3) Por escena: elementos (texto EXACTO), composición en px del lienzo, color HEX, acción, timing, easing, cámara, profundidad, sonido.
4) Etiqueta cada dato como observado / medido / inferido / desconocido.
5) Qué elementos NO se pueden determinar.
6) Storyboard textual y spec.json (§12).
No inventes elementos. No añadas nada que no esté en la referencia.
```

## B.2 Dirección de arte (`design.md`)

```text
Actúa como director de arte de motion design.
A partir del brief, modo y referencias, redacta design.md (§5.1): concepto, paleta con roles,
tipografía (con glifos ¿¡ñáéíóúü), escala en px, márgenes, personalidad de movimiento
(tabla de easing y duraciones), materiales/acabado, 3–5 reglas de consistencia verificables y prohibiciones.
Propón styleframes (renderizables como fotograma t del HTML). No generes código de animación.
```

## B.3 Plan de beats y movimiento

```text
Actúa como supervisor de animación.
Convierte el storyboard en un beat plan con tiempos absolutos, un foco por beat, estados inicial y final,
timing/spacing, easing, anticipación, acción principal, asentamiento, hold, solape y transición.
Marca los instantes de 'hold' (para QA). Comprueba que no haya dos acentos simultáneos ni dos tweens
sobre la misma propiedad. Sincroniza con la rejilla de beats si hay música.
```

## B.4 Implementación

```text
Actúa como ingeniero sénior de motion graphics.
Implementa spec.json con el contrato window.__mg (§4): seek(t) puro, tiempo cuantizado, PRNG con semilla,
sin Date.now/Math.random/transition/repeat:-1/fuentes remotas. Construye por escenas.
Cada texto lleva data-qa="text" y un slot reservado. Ejecuta lint y el sondeo de geometría.
Entrega también README con decisiones, incertidumbres y licencias.
No declares terminado hasta renderizar y revisar el resultado real.
```

## B.5 QA y revisión

```text
Actúa como supervisor de postproducción. Evalúa el RENDER, no el código.
Ejecuta L0–L3 y entrega un informe con defectos por timecode:
severidad, escena, elemento, eje (engagement/intent/composition/temporal/craft), observado,
causa probable, corrección y criterio de aceptación.
Para comparar versiones, haz la comparación dos veces con el orden intercambiado y cita fotograma y elemento.
No cambies lo que ya cumple.
```

## B.6 Corrección quirúrgica

```text
Cambia SOLO: [escena X, intervalo t0–t1, elemento, propiedad] → [qué].
No toques el resto ni los tiempos. Si hay conflicto de propiedades, encadena en lugar de solapar.
Re-renderiza solo [t0−0.5, t1+0.5] y demuestra con hashes que los demás fotogramas no cambiaron.
```


---
