# Con NVIDIA, Whisper se queda cargado (la voz viva)

Fecha: 2026-10-28

## Contexto

Con cinco episodios de El Diff a la vez, la voz de 6:18 de un episodio tardó entre 5 y 6 minutos en transcribirse, y otra
de 6:21, más de 11. Casi todo era la carga: en el registro de los hilos, el primer 10 % llegó a los 3 y a los 10 minutos.
Cada transcripción lanzaba un Python nuevo que importaba torch y WhisperX y cargaba el modelo. Medido en el equipo del
usuario (RTX 3050 de 6 GB, 16 GB de memoria) con la misma voz de 6:18:

- Con la máquina tranquila: 36 s de importar y cargar, 18 s de transcribir y 23 s de alinear.
- Con los otros hilos trabajando, solo importar torch tardó de 2 a 24 s, y `load_whisper` de 5 a 108 s. Subir el modelo
  a la tarjeta, 3 s. torch/lib son 4,2 GB de DLL (torch_cuda 1 GB, cuBLAS, cuDNN) que, con 2 o 3 GB de memoria libre,
  Windows no guarda: cada transcripción las vuelve a leer. Con 12 o 24 procesos ocupando el procesador, la carga subió
  otro 60 %. Los navegadores de las capturas de material (seis a la vez, dibujando por software) hacen eso mismo.
- En el código no había nada más lento que antes: el camino de Whisper era el de antes de Parakeet.

Parakeet también se probó con NVIDIA: tardó la mitad (3:06 contra 5:57, con la máquina ocupada), pero en un episodio
sobre Genie escribió «Gemini» o «Ginny» en 11 de sus menciones, porque no acepta las pistas de nombres y el arreglo de
después confunde nombres parecidos.

## Decisión

- **`video-base/scripts/voz_viva.py`** importa todo y carga Whisper, su detector de voz y el alineador una sola vez, y
  atiende `transcribir.py` y `transcribir-ajeno.py` por un puerto local, como `vectores_vivo.py` los vectores. Se cierra
  tras 10 min sin pedidos; ocupa unos 2,6 GB de la tarjeta.
- **`proceso()` de sloth.py** lo usa solo donde transcribe Whisper en una NVIDIA (el Python de Sloth es el de CUDA). Lo
  arranca con el turno de la GPU ya tomado, lo espera y le pasa el avance al agente igual que antes. Si no arranca o un
  pedido falla, lo cierra y corre el proceso de siempre, que dice el error.
- **Los procesos no cambian para quien los lanza**: `transcribir.kept` guarda lo cargado solo dentro de la voz viva, e
  `interfaz.sink` manda allí el avance por la conexión. La carga que se apunta en `equipo.json` sigue siendo la de un
  proceso suelto.
- **`transcribir-lote.py`** (Ideas) cierra la voz viva antes de cargar su Whisper: con los dos no caben en 6 GB.

La misma voz de 6:18: 113 s con el proceso de siempre; 60 s la primera vez con la voz viva (con la carga) y **20 s** las
siguientes; un video ajeno de esa duración, 15 s. Las palabras y sus tiempos salen idénticos.

## Consecuencias

- La primera transcripción tras 10 min sin usarla paga la carga entera. Con varios hilos seguidos, solo la primera.
- Mientras está viva ocupa la tarjeta aunque no transcriba. Un render no la necesita entera, pero otro Whisper sí: por
  eso Ideas la cierra.
- Sin NVIDIA nada cambia: Parakeet carga en 4 s.
- Los hilos todavía esperan en la fila uno detrás de otro, pero cada turno dura segundos y no minutos.

El ADR 0011 lo amplía: con la memoria llena, la primera carga llegó a pasar de 15 min, y ahora se hace antes de que los
agentes la llenen.
