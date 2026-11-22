# SKILL · Flujo de trabajo, principios y reglas permanentes

> **Cuándo cargar:** SIEMPRE, en toda tarea.
> **Fuente:** §1, §3, §19 (Master Knowledge Base v2, texto original sin reescribir). Los números § remiten a `skills/router.md` → índice.

---

# 1. Propósito, alcance y principios

## 1.1 Objetivo

Que un agente de IA pueda recibir una idea, un brief o una referencia, y entregar una pieza de motion graphics **verificablemente profesional**: con intención visual, ritmo, composición, tipografía, sonido y render correcto.

El agente debe ser capaz de:

1. Comprender objetivo, audiencia, plataforma y restricciones.
2. Analizar referencias sin inventar detalles.
3. Definir una dirección de arte coherente antes de programar.
4. Traducir el diseño a una especificación estructurada y a una timeline seekable.
5. Implementar con la tecnología adecuada.
6. Renderizar de forma determinista y **mirar el resultado real**.
7. Corregir con iteraciones localizadas.
8. Entregar archivos reproducibles, con licencias y procedencia claras.

## 1.2 Principio rector

> **Escribir código que corre no es lo mismo que diseñar movimiento que funciona.**
> Los modelos actuales cumplen el brief y fallan en timing, composición y acabado (§2.2). El sistema existe para cerrar esa brecha con método, no con más efectos.

## 1.3 Tres modos de encargo (no mezclar)

| Modo | Qué se preserva | Qué se prohíbe |
|---|---|---|
| **Recreación fiel** | Composición, elementos, timing, color, cámara y transiciones de la referencia | Añadir partículas, glow, textos o movimientos que no estén en la referencia |
| **Inspiración** | Lenguaje visual y gramática de movimiento | Copiar marca, logotipo, texto o composición literal |
| **Dirección original** | El brief | Ignorar restricciones de marca o plataforma |

Si el modo no está claro, **preguntar**. Si falta un dato crítico (texto, logo, cifras, paleta, duración), preguntar; no inventar.

---


# 3. Pipeline profesional v2

```text
BRIEF ─► MODO (fiel / inspiración / original) ─► INVESTIGACIÓN Y REFERENCIAS
   ─► DIRECCIÓN DE ARTE (design.md) ─► STYLEFRAMES ─► STORYBOARD / BEAT PLAN
   ─► PLAN DE MOVIMIENTO + SONIDO ─► ESPECIFICACIÓN JSON ─► IMPLEMENTACIÓN
   ─► LINT ─► PREVIEW (muestras) ─► RENDER ─► QA (automático + visual + pares)
   ─► CORRECCIÓN LOCALIZADA ─► (bucle) ─► ENTREGA + DOCUMENTACIÓN
```

## 3.1 Brief mínimo (extraer o preguntar)

| Campo | Pregunta |
|---|---|
| Objetivo | ¿Vender, explicar, presentar, anunciar, emocionar? |
| Mensaje y CTA | ¿Qué debe recordar y hacer el espectador? |
| Audiencia y contexto | ¿Dónde se ve, con o sin sonido? |
| Plataforma y formato | 16:9, 9:16, 1:1, 4:5; duración; resolución; fps |
| Marca | Logo, paleta, tipografías, tono, textos exactos |
| Recursos | Imágenes, capturas, video, audio, datos; licencias |
| Referencias | Enlaces/archivos; qué se quiere de ellas |
| Entregables | MP4, WebM, GIF, secuencia PNG, HTML interactivo, Lottie |
| Restricciones | Accesibilidad, legal, técnicas |

## 3.2 Entregables intermedios (el agente no salta pasos)

1. `design.md`: sistema visual (paleta, tipografía, escala, márgenes, personalidad de movimiento, reglas de consistencia).
2. **Styleframes**: una imagen fija por momento visualmente distinto.
3. **Beat plan**: lista de beats con tiempo, propósito, foco único y transición.
4. **Especificación JSON** (§12).
5. **Composición** (HTML/CSS/JS) + `README` de decisiones e incertidumbres.
6. **Informe de QA** con defectos por timecode.

## 3.3 Mapa de beats para piezas promocionales

Útil como plantilla de ritmo; los tiempos son los de las piezas cortas del benchmark (4–7 s por beat) **[B/P]**:

| Beat | Función | Duración orientativa |
|---|---|---|
| Hook | Detener el scroll | 2–4 s |
| Problema | Crear tensión | 3–5 s |
| Presentación | Nombrar el producto | 4–5 s |
| Función clave | Mostrar una sola cosa | 4–8 s |
| Beneficios | Resultado para el usuario | 3–5 s |
| Prueba social | Credibilidad | 3–4 s |
| CTA | Una acción | 2–4 s |
| Cierre de marca | Recuerdo | 2–3 s |

Una pieza de 15 s no usa todos; elige los que sirven al objetivo.

---


# 19. Reglas permanentes

1. **Diseñar antes de programar** (`design.md`, styleframes, beat plan).
2. Entender el brief y el **modo** (fiel / inspiración / original) antes de elegir herramientas.
3. En recreación fiel, **la referencia manda**; no añadir ni inventar elementos, textos, cifras ni tiempos.
4. **Toda animación es función del tiempo** y se controla con `seek` (§4).
5. Nada de `Math.random` sin semilla, `Date.now`, `repeat:-1`, `transition` CSS ni fuentes remotas en render.
6. **Un foco por beat**; jerarquía agresiva; escala suficiente.
7. **Maquetar para la trayectoria**, no solo para el estado final.
8. Easing por intención; **sin movimiento lineal** salvo justificación; rebote solo con carácter.
9. Nada arranca todo a la vez; **asentar** y **sostener** antes del siguiente beat.
10. Un solo acento por instante.
11. Diseñar sonido y silencio junto al movimiento; el mensaje debe sobrevivir **sin sonido**.
12. No sacrificar legibilidad por movimiento; respetar zonas seguras.
13. Una paleta y una tipografía **cerradas**; un solo fondo base salvo razón narrativa.
14. No usar partículas, glow ni sombras por defecto.
15. Elegir tecnología por entregable y control del tiempo, no por moda.
16. **Verificar el render**, no el código: L0–L5 (§13).
17. Revisiones por pares con **orden invertido** y evidencia por fotograma.
18. Corregir con **iteraciones localizadas** y comprobar que el resto no cambió.
19. Respetar accesibilidad (destellos, subtítulos, reducción de movimiento).
20. Respetar licencias y procedencia; no copiar marcas ni activos de terceros.
21. Distinguir **observado / medido / inferido / desconocido** y etiquetar la evidencia **[A][B][C][P][H]**.
22. Documentar decisiones e incertidumbres en el `README`.
23. Diseñar el arnés **más pequeño que funcione** y medir cada regla.
24. Priorizar claridad, intención, ritmo y consistencia sobre acumulación de efectos.

---
