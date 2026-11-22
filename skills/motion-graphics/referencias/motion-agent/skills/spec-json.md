# SKILL · Especificación intermedia (JSON v3)

> **Cuándo cargar:** Antes de programar: para escribir o validar spec.json.
> **Fuente:** §12 (Master Knowledge Base v2, texto original sin reescribir). Los números § remiten a `skills/router.md` → índice.

---

# 12. Especificación intermedia (JSON v3)

Antes de programar se produce una especificación que reduce ambigüedad. Cada dato lleva su **procedencia** (`observed | measured | inferred | unknown`) cuando se deriva de una referencia.

## 12.1 Ejemplo mínimo (JSON válido, sin comentarios)

```json
{
  "meta": {
    "title": "Lanzamiento Calma",
    "mode": "original",
    "duration": 15,
    "fps": 60,
    "resolution": [1920, 1080],
    "aspect": "16:9",
    "lang": "es",
    "platforms": ["web", "youtube"],
    "soundOn": true
  },
  "brief": {
    "objective": "Presentar la app y llevar a la prueba gratuita",
    "cta": "Prueba Calma 14 días",
    "audience": "Profesionales con estrés laboral"
  },
  "designSystem": {
    "file": "design.md",
    "palette": { "bg": "#f6f3ec", "text": "#111111", "accent": "#e8472e", "muted": "#8a8a85" },
    "typography": { "display": "Archivo Black", "support": "Instrument Serif" },
    "scale": { "title": 160, "secondary": 64, "min": 36 },
    "margin": 96,
    "motion": { "enter": "expo.out", "exit": "power2.in", "move": "expo.inOut", "bounce": "none" }
  },
  "tech": {
    "renderer": "dom+gsap",
    "libs": [{ "name": "gsap", "version": "pin-exact" }],
    "deterministic": true,
    "output": ["mp4"],
    "contract": "window.__mg"
  },
  "assets": [
    { "id": "logo", "type": "svg", "src": "assets/img/logo.svg", "source": "supplied", "license": "owned" },
    { "id": "voz", "type": "audio", "src": "assets/voz.wav", "words": "assets/voz.words.json" }
  ],
  "audio": {
    "bpm": 120,
    "beats": [0, 0.5, 1, 1.5, 2],
    "mix": { "loudness": -14, "truePeak": -1.5 }
  },
  "camera": {
    "mode": "none",
    "keys": []
  },
  "scenes": [
    {
      "id": "s01-hook",
      "time": [0, 3],
      "purpose": "Detener el scroll",
      "focus": "#headline",
      "elements": [
        { "id": "headline", "type": "text", "text": "Respira.", "pos": [960, 540], "slot": [1500, 300], "qa": "text" }
      ],
      "timeline": [
        { "at": 0.2, "do": "maskReveal", "target": "#headline", "dur": 0.7, "ease": "expo.out" }
      ],
      "hold": [1.2, 2.6],
      "exit": { "at": 2.7, "do": "blurOut", "dur": 0.25 },
      "provenance": "original"
    }
  ],
  "qa": {
    "lint": true,
    "sampleEvery": 0.1,
    "checks": ["bounds", "overlap", "contrast", "freeze", "black", "firstLastFrame", "loudness"],
    "pairwise": { "axes": ["engagement", "intent", "composition", "temporal", "craft"], "swapOrder": true }
  }
}
```

## 12.2 Reglas de redacción

| Campo | Mal | Bien |
|---|---|---|
| `at` | "al inicio" | `0.85` (segundos absolutos) |
| `dur` | "rápido" | `0.15` a `0.9` según §7.2 |
| `ease` | "suave" | `"expo.out"` (por intención) |
| `pos` / `slot` | "arriba a la izquierda" | `[298, 175]` y `[1500, 300]` (px del lienzo) |
| `target` | "el texto" | `"#headline"` o `"links[0]"` |
| Texto | "un título" | El texto **exacto** y en el idioma final |
| Color | "verde" | `"#5df2a6"` |
| Cámara | "zoom" | `target [x,y]`, `scale`, `ease`, `motionBlur` |
| Duración total | "unos 15 s" | `15`, y suma de escenas coherente |

Reglas adicionales: identificadores únicos; estados inicial y final declarados; dependencias y formatos de salida explícitos; datos medidos distinguidos de hipótesis; **no** generar propiedades vacías ni inventar valores.

## 12.3 Catálogo de verbos (`do`)

Cada verbo tiene una implementación determinista en el Anexo A.

| Verbo | Qué hace |
|---|---|
| `blurIn` / `blurOut` | Entra/sale con desenfoque |
| `maskReveal` | Revelado por máscara (línea, palabra, bloque) |
| `popIn` | Entrada con escala/rotación y rebote controlado |
| `dropIn3D` | Cae con perspectiva |
| `morph` | Cambia forma, color o tamaño del mismo elemento |
| `cursorClick` | Cursor con trayectoria curva y clic |
| `nestedRects` | Rectángulos concéntricos que se expanden |
| `orbitArc` | Elementos en arco polar con capas y parallax |
| `scrollList` | Lista con máscara y fila destacada |
| `equalizer` | Barras de audio con semilla |
| `countUp` | Contador numérico |
| `drawStroke` | Trazo SVG |
| `typewriter` | Escritura con cursor, con garantía del último carácter |
| `glitchPixels` | Píxeles/ruido con semilla |
| `chromatic` | Aberración cromática barata |
| `lockClose` | Rotación con pivote SVG |
| `glowTween` | Brillo animado (misma estructura de sombras) |
| `cam` / `cut` | Cámara virtual / corte |
| `tilt3d` | Cámara inclinada que se endereza |
| `shapeMorph` | Botón → logo por sustitución |
| `maxWidthReveal` | La marca aparece al abrirse un contenedor |
| `captions` | Subtítulos por palabra con resaltado |
| `videoFrames` | Video como secuencia de fotogramas pre-extraída |

---
