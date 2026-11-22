# SKILL · Sonido y sincronización

> **Cuándo cargar:** Cuando la pieza lleve música, voz, SFX o subtítulos sincronizados.
> **Fuente:** §10 + extras del módulo 04 (Master Knowledge Base v2, texto original sin reescribir). Los números § remiten a `skills/router.md` → índice.

---

# 10. Sonido y sincronización

El sonido define ritmo, peso y percepción del movimiento. Se diseña **junto** al movimiento, no después.

## 10.1 Capas

Música, voz, ambientes, whooshes, impactos, risers, downlifters, clics, texturas y **silencios intencionales**.

| Sonido | Función | Se sincroniza con |
|---|---|---|
| Impacto / bass hit | Acento, cambio de escala o escena | Llegada y asentamiento del elemento |
| Whoosh | Desplazamiento, transición | Centro del movimiento, no el final |
| Riser | Anticipación | Tensión previa al beat |
| Click | Interacción puntual | Fotograma del clic |
| Silencio | Pausa o énfasis | Holds |

## 10.2 Beat plan

1. Obtener BPM y rejilla de pulsos (detección de onsets por flujo espectral o con una librería de análisis; verificar a mano).
2. Marcar transitorios, cambios de frase y secciones.
3. Alinear **acentos importantes** a la rejilla; no forzar cada acción a un pulso.
4. Mantener en la especificación una lista `beats` en segundos y referenciarla desde las escenas.

## 10.3 Voz y subtítulos

Orden recomendado: guion → locución/TTS → transcripción con **tiempo por palabra** → plan de beats → animación → mezcla. Si el proveedor de TTS no devuelve marcas por palabra, transcribir el audio resultante; no asumir que existen **[A]**.

## 10.4 Mezcla y control técnico

```bash
# Medir sonoridad
ffmpeg -i mezcla.wav -af ebur128=peak=true -f null - 2>&1 | tail -n 15

# Reducir la música cuando habla la voz (ducking) y normalizar. Objetivos de partida **[P/C]**:
# -14 LUFS para plataformas de streaming/social, -23 LUFS para broadcast (EBU R128); verificar con la plataforma.
ffmpeg -i voz.wav -i musica.wav -filter_complex \
"[1:a][0:a]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300[duck];\
[0:a][duck]amix=inputs=2:duration=longest[mix];\
[mix]loudnorm=I=-14:TP=-1.5:LRA=11[out]" \
-map "[out]" mezcla_normalizada.wav
```

Revisar: sincronía audio/video, picos y *clipping*, niveles relativos, fundidos de entrada y salida, duración exacta (que coincida con el video), frecuencia de muestreo y canales, y **licencias**.

En HyperFrames el audio se declara con `data-volume`, `data-fade-in`, `data-fade-out` y `data-has-audio` en los elementos `<audio>`/`<video>` **[A]**.

## 10.5 Diseñar para "sin sonido"

Mucho contenido corto se ve en silencio. Si la plataforma lo exige: el mensaje debe entenderse **solo con imagen y texto**, con subtítulos incrustados y sin depender del audio **[C]**.

---


---

# Extras del módulo 04 original (sin el script de ducking)

> **Nota:** el script de ducking del módulo 04 original tenía los roles invertidos (comprimía la voz usando la música como sidechain). Se retiró; usa el de §10.4, donde `sidechaincompress` recibe **primero la música** y **después la voz**.

## 1. Las Tres Capas de Audio en Motion Graphics

1. **Voz en Off (Voiceover / VO)**:
   - Debe ser la señal dominante, inteligible y centrada.
   - Pasa por un filtro pasa-altos (80Hz) y compresor.
2. **Música de Fondo (Score / BGM)**:
   - Debe marcar el ritmo o tempo (BPM).
   - Requiere **sidechain / auto-ducking**: se atenúa automáticamente entre -3dB y -6dB cuando la voz entra.
3. **SFX y Foley Cinético**:
   - Resaltan cambios de estado visual:
     - `Whoosh`: Entradas y salidas rápidas de pantalla o movimientos de cámara.
     - `Pop / Click`: Aparición de badges, pills o botones.
     - `Data / Glitch / Digital`: Actualización rápida de números, tipeo o barras de carga.
     - `Boom / Impact`: Golpes climáticos al revelar la marca o el CTA final.

---

## 2. Mapa de Tiempos y SFX (Cue Sheet a FFmpeg)

Si se conocen los tiempos exactos de los impactos desde el JSON de animación, FFmpeg puede ensamblar los efectos sonoros en sus marcas precisas de tiempo usando `adelay`.

### Ejemplo de Ensamble con Filtros de FFmpeg:

```bash
# Mezcla de 3 SFX colocados exactamente en 0.2s, 3.5s y 7.0s sobre una música de fondo con ducking
ffmpeg -y \
  -i fondo_musical.wav \
  -i sfx_pop.wav \
  -i sfx_count.wav \
  -i sfx_impact.wav \
  -filter_complex "\
    [1:a]adelay=200|200[a1]; \
    [2:a]adelay=3500|3500[a2]; \
    [3:a]adelay=7000|7000[a3]; \
    [0:a][a1][a2][a3]amix=inputs=4:duration=first:dropout_transition=2[aout]" \
  -map "[aout]" \
  audio_mix_final.wav
```

---

## 4. Biblioteca Recomendada de SFX Esenciales (Curaduría)

Para que cualquier agente arme sonido sin buscar archivos extraños:
- `whoosh_fast.wav`: Para salidas en `< 0.3s`.
- `whoosh_cinematic.wav`: Para transiciones de cámara de `> 0.6s`.
- `click_mechanical.wav`: Para switches de toggle y botones.
- `pop_bubble.wav`: Para badges, avatares y elementos flotantes.
- `sub_boom.wav`: Frecuencias entre 40Hz y 90Hz para impactos finales.
