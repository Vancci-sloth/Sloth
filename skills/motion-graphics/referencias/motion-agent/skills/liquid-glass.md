# SKILL · Liquid glass / refracción

> **Cuándo cargar:** efectos de vidrio líquido, refracción SVG (feTurbulence/feDisplacementMap).
> **Fuente:** módulo 07 original, con el contrato migrado de `__SEEK` a `MG.register`.
> **Ojo:** `backdrop-filter` puede verse plano si un ancestro tiene `filter` (anti-patrón #7). Comprueba el resultado con `tools/sheet.mjs`.

---

# MÓDULO 7: Efecto "Liquid Glass" (Vidrio Líquido con Refracción Física SVG)

Este módulo documenta la técnica avanzada de **Liquid Glass (estilo macOS Sequoia / VisionOS / iOS)** para Motion Graphics. Supera el clásico `backdrop-filter: blur()` genérico agregando **refracción óptica y distorsión física real** mediante filtros SVG (`feDisplacementMap` + `feTurbulence` / mapas de normales en `feImage`).

---

## 1. Anatomía y Principio Óptico del Liquid Glass

El vidrio plano común solo desenfoca (`blur`). El **vidrio líquido real** refracta la luz: los bordes curvos desvían la imagen del fondo (como una gota de agua o lente de aumento) y la superficie tiene micro-variaciones orgánicas.

### Los 3 Componentes Clave:
1. **Mapa de Desplazamiento (`feDisplacementMap`)**:
   - Desvía los píxeles del fondo basándose en los canales de color (Rojo para eje X, Verde para eje Y).
   - Simula la curvatura del cristal (espesor y ángulo de incidencia).
2. **Turbulencia Fractal Procedural (`feTurbulence`)**:
   - Genera ondulaciones o ruido de fluido dinámico (`baseFrequency="0.008 0.008"`).
3. **Bisel Especular con Sombra Interior (`box-shadow: inset ...`)**:
   - Da el reflejo de borde blanco nítido (`rgba(255, 255, 255, 0.7)`), creando la ilusión de un grosor tridimensional de vidrio pulido.

---

## 2. Los Dos Patrones de Implementación

### Patrón A: Liquid Glass Procedural Dinámico (Contenedores, Cards y Modales)
Ideal para tarjetas grandes, paneles de UI o banners que ondean sutilmente como fluido.

```html
<svg style="display: none">
  <filter id="liquid-glass-container" x="0%" y="0%" width="100%" height="100%">
    <!-- Generador de ruido/fluido -->
    <feTurbulence id="liquid-noise" type="fractalNoise" baseFrequency="0.008 0.008" numOctaves="2" seed="92" result="noise" />
    <feGaussianBlur in="noise" stdDeviation="0.02" result="blur" />
    <!-- Refracción física sobre el fondo -->
    <feDisplacementMap id="liquid-disp" in="SourceGraphic" in2="blur" scale="75" xChannelSelector="R" yChannelSelector="G" />
  </filter>
</svg>
```

```css
.liquid-card {
  position: relative;
  width: 500px;
  height: 320px;
  border-radius: 32px;
}

/* Bisel de luz y reflejo perimetral */
.liquid-card::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
  box-shadow: 
    inset 2px 2px 0px -2px rgba(255, 255, 255, 0.8),
    inset 0 0 4px 1px rgba(255, 255, 255, 0.5);
  background-color: rgba(255, 255, 255, 0.04);
  pointer-events: none;
}

/* Capa de refracción óptica */
.liquid-card::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  backdrop-filter: blur(8px);
  filter: url(#liquid-glass-container);
  isolation: isolate;
}
```

---

### Patrón B: Lente / Botón de Vidrio con Mapa de Normales (`feImage` Base64)
Ideal para botones circulares (Pills, FABs), cursores magnéticos o lentes de aumento. Utiliza un mapa esférico pre-renderizado para crear una aberración óptica esférica perfecta (tipo botón de Apple TV / macOS dock).

```html
<svg style="display: none">
  <filter id="lens-glass-button" primitiveUnits="objectBoundingBox">
    <!-- Mapa de normales esférico codificado -->
    <feImage href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6e..." x="0" y="0" width="1" height="1" result="normalMap" />
    <feGaussianBlur in="SourceGraphic" stdDeviation="0.02" result="blur" />
    <feDisplacementMap in="blur" in2="normalMap" scale="0.18" xChannelSelector="R" yChannelSelector="G" />
  </filter>
</svg>
```

---

## 3. Adaptación Determinista para Motion Graphics con IA ("Seek, No Play")

En video determinista, **el vidrio líquido no debe usar `@keyframes` de CSS infinitos ni relojes desfasados**. Debe animarse puramente en función de `t` dentro de GSAP:

```javascript
// Animación de turbulencia líquida en GSAP vinculada a 't'
function updateLiquidGlass(t) {
  const noiseElem = document.getElementById('liquid-noise');
  const dispElem = document.getElementById('liquid-disp');
  
  if (noiseElem) {
    // Variar la frecuencia o semilla como función matemática de t
    const freqX = 0.008 + Math.sin(t * 1.5) * 0.002;
    const freqY = 0.008 + Math.cos(t * 1.2) * 0.002;
    noiseElem.setAttribute('baseFrequency', `${freqX} ${freqY}`);
  }
  
  if (dispElem) {
    // Aumentar o disminuir la refracción en momentos de impacto visual
    // Ejemplo: en t=2.0s el vidrio se vuelve más gelatinoso (scale: 90), luego se estabiliza (scale: 50)
  }
}

// Se integra en render(t) del contrato v2 (no existe __SEEK):
function render(t) {
  tl.totalTime(t, false);
  updateLiquidGlass(t); // refracción determinista cuadro a cuadro
}
MG.register({ duration: D, width: 1920, height: 1080, render });
```

---

## 4. Casos de Uso Recomendados en Videos de Motion Graphics

1. **Reveal de Producto / Interfaz SaaS**:
   - Tarjetas flotantes sobre fondos de gradiente animado, video o tipografía grande que pasa por detrás, permitiendo ver la tipografía distorsionarse a través del vidrio.
2. **Botón CTA de Alto Impacto**:
   - Botón esférico con refracción interna y pulso de luz reflectante al final del video.
3. **Lentes de Enfoque / Scanner**:
   - Una ventana de inspección que se desplaza sobre métricas o código, deformando los números con efecto de aumento líquido.

