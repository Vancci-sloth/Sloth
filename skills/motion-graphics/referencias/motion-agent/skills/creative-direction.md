# SKILL · Dirección de arte, color/materiales y presets de estilo

> **Cuándo cargar:** Al definir el diseño (design.md), paleta, tipografía, materiales o formato de plataforma.
> **Fuente:** §5, §6, §14 (Master Knowledge Base v2, texto original sin reescribir). Los números § remiten a `skills/router.md` → índice.

---

# 5. Dirección de arte y composición

La dirección de arte define **qué se ve y por qué**; no es una capa final decorativa.

## 5.1 `design.md`: la decisión que evita el estilo genérico

Antes de programar, el agente redacta un `design.md` (estructura inspirada en las skills de dirección creativa de HyperFrames **[A]**):

```markdown
# design.md
## Concepto (1 frase)
## Modo (fiel | inspiración | original)
## Formato (relación, resolución, fps, duración)
## Paleta (rol → HEX): fondo, texto, acento, acento secundario, neutro
## Tipografía: display / apoyo / datos; pesos; tracking; fuentes con licencia y con glifos de ¿ ¡ ñ á é í ó ú ü
## Escala (px en la resolución final): titular, secundario, mínimo legible
## Márgenes y retícula
## Personalidad de movimiento: tabla de easing + duraciones tipo + cuánto rebote
## Materiales y acabado: grano, sombras, glow (sí/no y por qué)
## Reglas de consistencia (3–5 reglas verificables)
## Prohibiciones (qué NO se hace en esta pieza)
```

## 5.2 Jerarquía y escala (números de partida)

Cada beat tiene **un foco primario**, elementos secundarios que lo explican y, como mucho, un nivel terciario. Valores para 1920×1080 **[P/H]** (calibrar con la referencia o el brief):

| Elemento | Punto de partida |
|---|---|
| Titular / palabra héroe | ≥ 8 % de la altura del frame (≈ 86 px) |
| Texto secundario | ≥ 4 % (≈ 43 px) |
| Mínimo legible en móvil | ≥ 3 % (≈ 32 px); por debajo solo metadatos tipo HUD |
| Margen exterior | 5 % por lado (≈ 96 px) |
| Elemento héroe en su beat clave | Debe "pesar": ocupar una parte sustancial del encuadre; si el agente duda, **escala hacia arriba** |

Motivo: los modelos tienden a **encoger todo** ante la incertidumbre y producen piezas legibles pero planas **[B]**.

## 5.3 Composición

- **Un foco por beat.** Si dos cosas compiten, una se atenúa.
- Retícula y alineaciones explícitas; balance óptico; espacio negativo deliberado.
- Profundidad por escala, contraste, desenfoque y oclusión (no solo por sombras).
- Encuadre del medio: respetar zonas seguras de plataforma (§14.3).
- La regla de tercios es una herramienta, no una obligación.

## 5.4 Consistencia

- Paleta y tipografía **cerradas**: pocos colores y pocas fuentes dan aspecto profesional.
- **Un solo fondo base** (claro u oscuro) en toda la pieza salvo razón narrativa. En el estudio de videos de UI, mezclar escenas claras y oscuras cayó de 33 % a 18 %, y los que dejaron de mezclar se pasaron mayoritariamente a claro **[B]**.
- Un HUD, contador o marco persistente puede unificar escenas distintas (técnica del showreel original), si el brief lo admite.

## 5.5 Styleframes y storyboard

- **Styleframe**: imagen fija de un momento clave con composición, tipografía, paleta, materiales, luz y profundidad. Uno por momento visualmente distinto.
- **Storyboard / animatic**: por viñeta, número, tiempos de entrada y salida, estado visual, acción, cámara, transición, texto, sonido y relación con la siguiente.
- Si el agente puede renderizar, el styleframe se produce **renderizando el fotograma `t` del propio HTML**: es la forma más rápida de validar jerarquía antes de animar.

---


# 6. Color, materiales, luz y acabado

## 6.1 Sistema de color

- Dominante, secundario, acento, neutros y, solo si hacen falta, colores semánticos.
- Contraste de texto sobre fondo ≥ 4,5:1 (≥ 3:1 para texto grande) como mínimo de partida **[P]** (criterio WCAG para web; aplicarlo también a video evita ilegibilidad en móvil).
- Revisar matiz, saturación, luminosidad y temperatura entre escenas; evitar degradados, neones y glow "por defecto".
- Variables de color en un solo lugar (`:root` / tokens) para poder cambiar de tema sin tocar la timeline.

## 6.2 Materiales y luz

Metal, vidrio, plástico, papel, tela, líquido, emisión, mate, rugoso, translúcido: elegir uno o dos y mantenerlos. La luz describe volumen, material y jerarquía (key, fill, rim, sombras suaves o duras, especulares); **no** se aplica glow a todo.

## 6.3 Acabado

| Efecto | Uso | Cautela |
|---|---|---|
| Grano | Calidez analógica, unifica capas | Con semilla por fotograma (§4.3) |
| Viñeta | Dirige la mirada | Suave |
| Motion blur | Velocidad percibida | En Canvas se simula con "fantasmas" y estiramiento (Anexo A.12); en DOM, `filter:blur` breve |
| Aberración cromática, glitch | Impacto puntual | Revisar flashes (§15) |
| Bloom / glow | Emisión real | Solo si el material lo justifica |
| Color grading | Cohesión | Mismo tratamiento en todas las escenas |
| "Liquid glass" y superficies glossy | Tendencia visible en 2026 **[C]** | Costoso; `backdrop-filter` falla bajo un padre con `filter` |

---


# 14. Presets de estilo 2026 y formatos de plataforma

## 14.1 Presets de estilo (puntos de partida, no plantillas para copiar)

| Preset | Ingredientes | Cómo se implementa | Riesgo / prueba |
|---|---|---|---|
| **A. Editorial tipográfico** | Fondo plano, display grotesca/black + serif itálica de apoyo, 2–3 colores, una línea sólida como foco entre líneas contorneadas | Revelado por máscara, stagger, scroll de filas con módulo seguro | Colisiones de texto en trayectoria (§8, §13.3) |
| **B. Producto en pantalla real (UI-first)** | Pantallas reales o recreadas en HTML/CSS, 2D plano, fondo claro, cámara que se acerca a la función, **una línea de texto por pantalla** | `#world` + cámara virtual (§7.5), UI como DOM | Que el comprador pueda abrir esa pantalla; dibujar solo lo que no existe **[B]** |
| **C. Analógico / película** | Grano, viñeta suave, paleta cálida, ritmo algo más lento | Grano con semilla por fotograma (§4.2); curvas suaves | No saturar de ruido; mantener legibilidad **[C]** |
| **D. Minimalismo audaz** | Tipografía gigante, bloques planos, 2–3 colores, holds largos | Geometría simple, `expo.out`, mucho espacio negativo | Que "audaz" no sea "plano": verificar presencia (§5.2) **[C]** |
| **E. Collage / recorte artesanal** | Papel, texturas, formas recortadas, movimiento "a pasos" | Tiempo escalonado a 12 fps en capas concretas (Anexo A.13) | Coherencia de textura; no mezclar con UI nítida sin motivo **[H]** |
| **F. Liquid glass / glossy** | Superficies translúcidas, brillo especular, degradados | Gradientes, filtros SVG, WebGL | Costoso; `backdrop-filter` falla bajo un padre con `filter` **[C]** |
| **G. Sting de marca** | Logotipo animado sincronizado con sonido, versión final nítida | `shapeMorph`, `maxWidthReveal`, impacto de audio | El *lockup* final debe leerse al instante **[C]** |

Observaciones de contexto: en 2026 los feeds saturados de contenido generado por IA hacen que lo **humano, con textura y con oficio** destaque más que lo genérico y pulido **[C]**; en video de producto de software, **mostrar el producto real y mantener una sola base clara** domina **[B]**.

## 14.2 Duración y ritmo

- Elegir **dónde se reproduce primero** y cortar para eso: feed ≤ 0:45 y páginas de producto con recorridos más largos; la pieza "de un minuto para todo" perdió terreno **[B]**.
- Los videos cortos de redes (15–30 s) concentran el interés, aunque los límites de subida sean mucho mayores **[C]**.
- Cadencia: en videos de producto de software, ~8–9 cambios de escena por minuto **[B]**; en tipografía cinética para redes, más rápido. Calibrar con la referencia.

## 14.3 Formatos y zonas seguras

| Formato | Resolución | Uso |
|---|---|---|
| 16:9 | 1920×1080 | YouTube, web, presentaciones |
| 9:16 | 1080×1920 | TikTok, Reels, Shorts, Stories |
| 4:5 | 1080×1350 | Feed de Instagram |
| 1:1 | 1080×1080 | Feed cuadrado |

Zonas seguras 9:16 (las apps cambian su interfaz varias veces al año **[C]**; validar con una plantilla de superposición actual):

- **Zona universal de partida:** ≈ **900×1400 centrada** → `x 90–990`, `y 260–1660` **[C]**.
- Para CTA y subtítulos, **subir el borde inferior**: dejar ≥ ~370 px libres abajo (la descripción ampliada de TikTok sube) → `y ≤ 1550` **[C]**.
- Reels recorta el 9:16 a **4:5 central** en el feed principal; los *thumbnails* de la cuadrícula son 4:5 **[C]**.
- Los subtítulos automáticos de las plataformas están activados por defecto en 2026 y ocupan la parte inferior **[C]**: no colocar nada crítico allí.

## 14.4 Multi-formato

No recortar un 16:9 a 9:16. Declarar en `spec.json` un `layout` por formato (posiciones, escalas, saltos de línea) y reutilizar timeline y textos. Probar cada formato con su plantilla de zona segura.

---
