# El avatar: la línea `Avatar:`

El usuario elige en el compositor de Sloth cómo habla el personaje (o un presentador) del video. Lo elegido llega en el
primer mensaje:

- `Avatar: comfyui-local …` o `Avatar: heygen …`: usa ese motor, como se dice abajo, **en lugar de** las bocas abierta
  y cerrada.
- Sin la línea: lo de siempre, las bocas de tu skill. Este archivo no cambia nada de eso.

El motor se pide con el MCP `avatar` (en Claude, `mcp__avatar__*`): `motores` dice cuáles están listos ahora,
`generar_avatar` pide el video y `estado_avatar` espera a uno que tarda. **Siempre necesitas primero la voz**: el avatar
se anima con el audio ya hecho (el del usuario o el que dejó `generar_voz`, ver [VOZ.md](VOZ.md)).

## Cómo pedirlo

1. `motores`: confirma que el motor de la línea está LISTO. Si no, díselo al usuario en una frase y sigue con las bocas
   de siempre; no insistas ni instales nada tú.
2. `generar_avatar` con `motor`, `audio` (ruta absoluta del `.wav` de la voz), el video o la imagen del personaje y
   `salida`: `<carpeta del video>/fuentes/avatar/avatar.mp4`, en ruta absoluta.
3. Si no acabó en 40 s te da un id: sigue con lo que no lo necesita (la música, los gráficos, las demás escenas) y
   espéralo con `estado_avatar`. Cuando llega, el MP4 es la **capa del personaje**: úsalo en el lugar de la pose
   animada, sobre el fondo de tu estilo, y toma el audio de la voz original, no el del MP4.

## Cada motor

| Motor | Etiqueta | Qué pasarle | Tarda | Cuesta |
|---|---|---|---|---|
| `comfyui-local` | Local | `audio` + `video` del personaje (o `imagen`, que se hace video quieto con FFmpeg); `flujo` si quieres uno | Varios minutos por minuto de video | Nada, solo luz |
| `heygen` | Pago | `avatar_heygen` (de `avatares_heygen`) y `audio`, o `guion` y `voz_heygen`; `formato` | Minutos | **Créditos del usuario** |

- **`comfyui-local`**: LatentSync 1.5 le cambia los labios a un video del personaje para que digan el audio (8 GB de
  VRAM). MuseTalk es el de respaldo, si el usuario importó su flujo. Un video del personaje que se mueve un poco sale
  mejor que una foto quieta. Si `generar_avatar` dice que falta algo, sigue con las bocas.
- **`heygen`**: gasta créditos. Pídelo **una sola vez** por video, nunca para probar, y solo si la línea lo dice. Las
  skills `heygen-avatar`, `heygen-video` y `heygen-translate` (carpetas hermanas de esta) sirven para crear un avatar
  nuevo o un video con el Video Agent de HeyGen; úsalas solo si el usuario lo pide.

## Si falla

Dile al usuario el error tal cual y sigue con las bocas de siempre: el video no se queda sin personaje. Un
`comfyui-local` que se cuelga no se reintenta más de una vez (la GPU es una sola y la comparte el resto del video).

## Para el usuario: preparar `comfyui-local`

Sloth no instala ni arranca nada de esto; solo lo encuentra. Con NVIDIA y 8 GB de VRAM o más:

1. ComfyUI (https://github.com/comfyanonymous/ComfyUI; en Windows, su versión portable), abierto en
   `http://127.0.0.1:8188`.
2. Los nodos `ComfyUI-LatentSyncWrapper` (ShmuelRonen) y `ComfyUI-VideoHelperSuite` (Kosinkadink), desde
   ComfyUI-Manager o con `git clone` en `custom_nodes/` y su `pip install -r requirements.txt`.
3. Los pesos de LatentSync 1.5 en `custom_nodes/ComfyUI-LatentSyncWrapper/checkpoints/`:
   `latentsync_unet.pt` y `whisper/tiny.pt`, de https://huggingface.co/ByteDance/LatentSync-1.5. Sin ellos el nodo
   baja la 1.6, que pide 18 GB de VRAM.
4. En Opciones → Avatar se ve si está listo. MuseTalk (`ComfyUI-MuseTalk-KJ`, de kijai) se prepara igual y su flujo se
   importa ahí, exportado de ComfyUI con «Save (API Format)».

Licencias: LatentSync, Apache-2.0; MuseTalk, MIT; VideoHelperSuite, GPL-3.0. Sloth no los redistribuye.
