# La voz sin NVIDIA va con Parakeet, y Sloth dice cuánto tarda cada cosa en tu equipo

Fecha: 2026-10-27

## Contexto

En una computadora sin NVIDIA, un video explicativo con 11 min 18 s de voz estuvo más de media hora transcribiendo y el
turno se acabó sin video. Whisper large-v3-turbo es «turbo» en la GPU, donde se recortó su decodificador; en el
procesador manda su codificador, que es el de large-v3 entero. Medido con la misma voz de 147 s en un Core 5 210H, con 4
hilos: Whisper tardó 106 s, más 28–68 s de arrancar (importa torch, transformers y pyannote). En un i5 viejo, otros
midieron turbo a 4,7 veces lo que dura el audio. Además el agente no veía el avance (`@progreso` no lo leía nadie) y no
sabía cuánto iba a tardar, y la app de Mac, que es de Intel, no podía instalar torch 2.8.

## Decisión

- **Parakeet TDT 0.6B v3** de NVIDIA (CC-BY-4.0), en ONNX y en int8 con onnx-asr, transcribe en toda computadora sin una
  NVIDIA que aguante Whisper (`aguantaCuda`, que ahora pide 4 GB de memoria). La misma voz: 22 s con 4 hilos, 29 s con 2,
  y carga en 4 s. Entiende 25 idiomas de Europa.
- **El alineador de siempre afina sus tiempos**, sin WhisperX (`python/procesos/alineador.py`, con `forced_align` de
  torchaudio): importar `whisperx.alignment` costaba 11 s más que torch solo. Los inicios quedan a 6–9 ms (mediana) de
  los de WhisperX en la GPU; sin alinear, a 65–92 ms, con un 32 % de palabras a más de 100 ms aun corrigiendo el
  adelanto, que no basta para los subtítulos palabra por palabra.
- **Todo pasa por `python/procesos`**: `parakeet.engine()` elige el motor y las skills no cambian. Una voz de 11 min 10 s
  sale en unos 2 min en el mismo equipo, con 1,9 GB de memoria como mucho.
- **Opciones → Tu equipo** (`server/equipo.ts`) dice qué eligió Sloth y cuánto tarda aquí la voz y el render, de lo que
  midió (`equipo.json`). Nadie elige nada: Sloth lo hace solo. `proceso()` de video-base y `render.cjs` del explicativo
  dicen antes y durante cuánto falta.
- **Quien ya tenía Sloth sin NVIDIA** no ve «falta descargar»: su Whisper sigue sirviendo, y Parakeet es una mejora
  (`check()` de `modelos_transcripcion.py`). Arriba del hilo nuevo, junto a «Actualizar Claude Code», le sale «Acelerar
  Sloth en tu equipo», que la baja con un clic. Uno nuevo sin NVIDIA baja Parakeet y no Whisper (1,6 GB menos).
- **El render final del explicativo** codifica con `veryfast` y crf 14 en vez de `slow` y crf 16, en toda computadora.
  Contra una referencia casi sin pérdida se ven igual (SSIM 0,9935 contra 0,9931) y pesa un 33 % más, pero tarda un 30 %
  menos en el equipo del usuario, con 6 Chrome y con 2: el codificador deja de quitarle procesador al dibujo de cada
  cuadro, que en el explicativo depende del procesador más que de los píxeles (a media resolución solo baja un 20 %).
  Antes de dibujar, `render.cjs` mira con qué dibuja Chrome el 3D (`video-base/scripts/equipo.cjs`): por software
  (SwiftShader) fue un cuadro por segundo contra 9 con la tarjeta, y lo avisa al agente y en Tu equipo.
- **El renderizador web** (`@remotion/web-renderer`, el de El Diff: Edge con HTML-in-canvas y H.264 por la tarjeta, 5,6
  veces más rápido allí) no sirve aún para el 3D: el `<ThreeCanvas>` no llega a crearse dentro de su capa oculta. Si
  Remotion lo arregla, es el siguiente paso para el render en un equipo lento.

## Consecuencias

- Con NVIDIA nada cambia: sigue Whisper en la GPU. Parakeet no acepta pistas de nombres (`terminos`): los que escribe
  parecidos («la Sada» por «Lazada») se cambian después por el nombre (`with_terms`). Con eso, de las palabras del guion
  de cuatro videos encuentra del 98,3 al 99,7 %; WhisperX, el 99,5 % en uno de ellos.
- Una computadora sin NVIDIA que ya tenía el Python de Sloth pide bajar Parakeet (unos 670 MB) en Herramientas de
  video; mientras no lo tiene, transcribe con Whisper como antes.
- En un Mac con Intel, sin torch: Parakeet sin alinear y sin vectores (ADR 0006).
- Un idioma fuera de los 25 de Parakeet (japonés, hindi) se transcribe mal sin NVIDIA.
- El render del 3D sigue siendo lo más largo en una computadora vieja: cada cuadro lo dibuja Chrome y le saca una foto.
  Ahora codifica más ligero, avisa si va por software y dice cuánto falta.
- Con NVIDIA, Whisper tarda en arrancar (76 s de 93 con 20 s de voz en el equipo del usuario): Parakeet también sería más
  rápido ahí, sin las pistas de nombres. No se cambió.
