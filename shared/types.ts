/** Lo que comparten el servidor y la interfaz. */

/** Una card de la pantalla de inicio. Si trae `skill`, el primer mensaje de cada sesión la invoca. */
export interface Card {
  id: string
  title: string
  description: string
  /** Nombre de la carpeta de la skill en `SKILLS` (`server/skills.ts`). */
  skill?: string
  /** Carpeta donde trabaja el agente. `{app}` es la carpeta de Sloth. Si falta, es `<trabajo>/<id>` (`carpetaTrabajo`). */
  cwd: string
  icon?: string
  /** Con varios enlaces, un video por enlace, cada uno en su hilo. */
  lote?: LoteConf
  /** Los pasos de su trabajo. Si dicen su `fase`, el hilo se ve en el estudio de video (`Estudio.tsx`). */
  etapas?: Etapa[]
  /** Si arma el video por escenas: la fase Video del estudio es entonces un editor de escenas, y estos son sus archivos. */
  editor?: EditorConf
  /** Los modelos del modo «Optimizado»: lo que medimos como mejor en cada tarea. */
  modelos?: ModelosConf
  /** Un estilo que hiciste con «Nuevo estilo» (`data/tus-cards.json`): lo pone el servidor. Se borra también en la venta. */
  tuya?: boolean
}

/** Un modelo con su esfuerzo. `medido` dice dónde se midió; sin él, es el de por defecto. */
export interface ModeloTarea {
  model: string
  effort: string
  medido?: string
}

/**
 * `principal` es el del hilo (un id del catálogo, como `claude-opus-5-5`). `tareas` son sus subagentes, con el nombre
 * con que la skill los conoce y el modelo como lo pide la herramienta Agent (`opus`, `sonnet`, `haiku`): Sloth se los
 * pasa en la línea `Subagentes:` del primer mensaje.
 */
export interface ModelosConf {
  principal?: ModeloTarea
  tareas?: (ModeloTarea & { nombre: string; para: string })[]
}

/** Un video terminado de un estilo. Con `sessionId`, el hilo que lo hizo; sin él, es de una carpeta de fuera. */
export interface VideoHecho {
  src: string
  titulo: string
  archivo: string
  /** La ruta completa del archivo, que es como lo conocen las redes. */
  ruta: string
  t: number
  sessionId?: string
  /** El estilo (la card) del que es. */
  cardId: string
  /** Si es vertical (TikTok, Instagram) u horizontal (YouTube); sin él, no se pudo leer. */
  vertical?: boolean
}

/**
 * `GET /api/videos`, para «Mis videos»: los videos terminados de todos los estilos, del más nuevo al más viejo, con sus
 * marcas de redes. Sin `redes` si no hay redes, o si su archivo está dañado.
 */
export interface VideosDeTodos {
  videos: VideoHecho[]
  redes?: MarcasDeRedes
}

/** La previa de la card de un estilo: un clip mudo de pocos segundos de su último video y su primer cuadro. */
export interface Previa {
  video: string
  cuadro: string
}

/**
 * Un lote: el compositor manda cada enlace a su propio hilo, con su carpeta ya nombrada. `prefijo` va delante del nombre
 * de la carpeta de cada video, de un lote o suelto (el reel la quiere `reel-…`).
 */
export interface LoteConf {
  prefijo?: string
}

/**
 * El editor de escenas: en la fase Video del estudio, el monitor y, en todas las fases, una línea de tiempo con los
 * párrafos, las escenas y la voz. Las rutas son relativas a la carpeta de la sesión; `cuadros` lleva `{id}` donde va el
 * id de cada escena.
 */
export interface EditorConf {
  /** Las escenas: `{ parrafos: [{ id, beats: [{ id, say, v }] }] }`. */
  guion: string
  /** Los tiempos: `{ duracion, parrafos: [{ inicio }], beats: [{ id, inicio, fin, palabras: [{ t, s, e }] }] }`. */
  linea?: string
  /** El video final, el render que se ve en el monitor. */
  video?: string
  /** El cuadro renderizado de cada escena: su miniatura en la línea de tiempo. */
  cuadros?: string
  /**
   * La vista en vivo: una página que reproduce el video sin renderizarlo, en el monitor. Habla con el estudio por
   * `postMessage`: recibe `{ vivo: 'ir', t }`, `{ vivo: 'play' }` y `{ vivo: 'pausa' }`; manda `{ vivo: 'listo',
   * duracion? }` al cargar y `{ vivo: 'tiempo', t, playing }` cuando cambia. Sin ella, el monitor enseña el render o nada.
   */
  vivo?: string
  /**
   * Lo que entra en el video final (`["guion.json", "src/**", "public/**"]`): si algo de aquí cambió después del render,
   * el final quedó viejo. Los que empiezan por `!` se quitan (lo que el propio final deja dentro de una entrada). Sin
   * `entradas`, solo cuenta el guion.
   */
  entradas?: string[]
}

/**
 * Una serie de video (`skills/video-base/series/<id>.md`, o de la skill): un formato fijo del canal, que elige solo su
 * tema. `GET /api/cards/<id>/series`; el nombre es el título del archivo.
 */
export interface Serie {
  id: string
  nombre: string
  /** Su archivo, desde la carpeta de las skills (`video-base/series/mitos.md`). */
  archivo: string
}

/** Un archivo de una skill que ya no es como lo trae Sloth (`server/originales.ts`): cambiado o, con `borrado`, quitado. */
export interface CambioSkill {
  skill: string
  archivo: string
  borrado?: boolean
}

/**
 * `GET /api/cards/<id>/cambios`: lo que cambiaste en la skill de la card y en las bases que lee (video-base), y la copia
 * más nueva de lo que tenías antes de volver a la original o de actualizar, si hay. Sin la original a mano (en el repo),
 * `null`.
 */
export interface CambiosCard {
  cambios: CambioSkill[]
  copia?: string
}

/**
 * Una carpeta de video dentro del `cwd` de una card, para elegir a mano dónde trabaja un hilo. `hilo`: el título del que
 * la tiene, si se sabe.
 */
export interface CarpetaDeVideo {
  nombre: string
  hilo?: string
}

/** Panel de etapas: un paso del trabajo de una card. Las rutas son globs relativos a la carpeta de la sesión. */
export interface Etapa {
  nombre: string
  /** La etapa está hecha cuando algo coincide con este glob. */
  listo: string
  /** Lo que el estudio enseña de ella: texto, imágenes, video o audio. Si cards.json no lo dice, lo de `listo`. */
  muestra?: string
  /** Si la etapa espera al usuario, lo que tiene que hacer. */
  espera?: string
  /** Su texto se lee en voz alta: el estudio le pone «Copiar», que lo copia sin el título ni los encabezados. */
  copiar?: boolean
  /**
   * En qué fase del estudio va: todos los estilos de video comparten las mismas cinco, en este orden, y cada uno reparte
   * en ellas sus etapas. Así cualquier video, de cualquier estilo (también los que vengan), se ve igual.
   */
  fase?: Fase
}

/** Las fases del estudio de video, en su orden. */
export const FASES = [
  { id: 'idea', nombre: 'Idea' },
  { id: 'guion', nombre: 'Guion' },
  { id: 'sonido', nombre: 'Sonido y voz' },
  { id: 'video', nombre: 'Video' },
  { id: 'entrega', nombre: 'Entrega' }
] as const
export type Fase = (typeof FASES)[number]['id']

export type Archivo = { ruta: string; t: number }

/** Lo que devuelve `/api/sessions/<id>/etapas`: el avance del hilo para el estudio. Los archivos van del más viejo al más nuevo. */
export interface Avance {
  carpeta: string
  /** `hechaEn`: cuándo nació lo primero que la dio por hecha. */
  etapas: (Etapa & { hecha: boolean; hechaEn?: number; archivos: Archivo[] })[]
  /** Los archivos de la línea de tiempo del editor de escenas que ya existen; `cuadros` va por id de escena. */
  editor?: { guion?: Archivo; linea?: Archivo; cuadros: Record<string, Archivo> }
  /**
   * El monitor de la fase Video, el mismo para todos los estilos. `motor`: el motor en vivo de Sloth (`server/motor.ts`),
   * el video sin renderizar de cualquier proyecto de Remotion; `v` sube con cada versión y `armando` dice que viene otra.
   * `vivo`: la página en vivo que arma la propia skill (la de El Diff), para cuando el motor no puede (sin `node_modules`);
   * `t` es el de su entrada más nueva. Las dos hablan con el monitor por `postMessage` (`listo`, `tiempo`, `ir`, `play`,
   * `pausa`). `renders`: los videos renderizados de la fase Video, del más avanzado al primero.
   */
  monitor?: { motor?: { url: string; v: number; armando: boolean; error?: string }; vivo?: { url: string; t: number }; renders: Render[] }
  /** Los videos terminados del hilo, los que se descargan. */
  finales?: VideoFinal[]
}

/**
 * Cómo va el video de un hilo, para la barra lateral (`server/avances.ts`): la fase y la etapa en las que va (sin ellas,
 * terminó), cuántas etapas lleva (las saltadas cuentan) de cuántas, y si la que toca espera algo del usuario.
 */
export interface AvanceCorto {
  fase?: Fase
  etapa?: string
  hechas: number
  total: number
  espera?: boolean
}

/**
 * Un video terminado de un hilo. `nombre`: con el que se descarga y se copia, su carpeta de video y su archivo
 * (`t-rex-naciendo - video-vertical.mp4`). No depende del título del hilo: renombrarlo no duplica las copias.
 */
export type VideoFinal = Archivo & { nombre: string }

/** Un video renderizado. `viejo`: la entrada del video que cambió después de él, la más nueva; sin ella, está al día. `vertical`, su forma. */
export type Render = Archivo & { viejo?: Archivo; vertical?: boolean }

/** Un modelo del catálogo de Claude Code o Codex. Los ids de Codex llevan `codex:`. */
export interface Model {
  id: string
  label: string
  efforts: string[]
  defaultEffort?: string
}

/** Lo que pasa en una sesión, venga del proveedor que venga. La interfaz dibuja esta lista. */
export type AgentEvent =
  /** `images` son las rutas de las imágenes adjuntas, en `data/attachments`. */
  | { t: 'user'; text: string; at: number; images?: string[] }
  | { t: 'turn_start'; at: number }
  | { t: 'text'; id: string; delta: string; parent?: string }
  /** `at`: cuándo lo guardó el servidor. */
  | { t: 'thinking'; id: string; delta: string; parent?: string; at?: number }
  | { t: 'tool'; id: string; name: string; input: unknown; parent?: string }
  | { t: 'tool_update'; id: string; output?: string; delta?: string; done?: boolean; error?: boolean }
  /**
   * `caida`: no lo cerró el modelo, se cayó el proceso del agente o el servidor. `costUsd` y `tokens` son lo que gastó el
   * turno según el SDK, con los subagentes (con Codex, a precio de la API: server/precios.ts); faltan si no se
   * sabe (se cortó antes de que el SDK lo diera, es el primer turno tras retomar la sesión o el modelo no tiene precio).
   */
  | { t: 'turn_end'; at: number; ok: boolean; error?: string; costUsd?: number; tokens?: Tokens; caida?: boolean }
  | { t: 'info'; text: string }
  /** Cuánto ocupa la conversación en la ventana del modelo, en tokens. Reemplaza al anterior. */
  | { t: 'context'; used: number; max: number }
  /** Lo que sigue corriendo en segundo plano (subagentes, comandos), aunque el turno ya haya terminado. Reemplaza al anterior. */
  | { t: 'background'; tasks: string[] }
  /**
   * Un subagente empieza o termina. `id` es el de la herramienta `Agent` que lo lanzó, el `parent` de sus eventos. Si se
   * cae el proceso no llega el fin: el subagente se cortó con él.
   */
  | { t: 'subagent'; id: string; status: 'running' | 'completed' | 'failed' | 'stopped'; at: number }

export interface Tokens {
  input: number
  output: number
  cacheRead: number
}

export interface SessionMeta {
  id: string
  cardId: string
  title: string
  model: string
  effort?: string
  cwd: string
  createdAt: number
  updatedAt: number
  /** El id del hilo en su proveedor, para retomarlo tras reiniciar. */
  providerSessionId?: string
  running: boolean
  /** Fuera de la lista de la barra lateral, sin borrarse. */
  archived?: boolean
  /** Las tareas en segundo plano que siguen vivas, por su descripción. */
  background?: string[]
  /** Si es un video de un lote: cuál es, de cuántos, y la carpeta que le tocó dentro de `cwd`. */
  lote?: Lote
  /**
   * Panel de etapas: la carpeta de un hilo suelto dentro de `cwd`. La de un video nuevo la nombra Sloth al crearlo, y la
   * skill la lee en la línea `Carpeta:` del primer mensaje; la de un video que sigue, la elige el usuario. La de un video
   * de un lote va en `lote`. Si el usuario la cambia desde el panel, manda sobre las dos. Los hilos de antes de que Sloth
   * la nombrara no tienen.
   */
  carpeta?: string
  /** Cuántas caídas seguidas se retomaron solas (ver `retomar` en sessions.ts). Vuelve a cero cuando un turno acaba bien. */
  retomas?: number
  /** Si su último turno acabó bien: `false` si falló o se cortó. Falta si aún no acabó ninguno. Lo mira el archivado automático. */
  acaboBien?: boolean
  /**
   * La skill que invoca el primer mensaje. Mientras el agente no haya respondido (sin `providerSessionId`), cada turno la
   * vuelve a pedir: un hilo que se cayó antes de la primera respuesta no la olvida al retomarse.
   */
  skill?: string
  /** El primer mensaje de un video del lote que aún no empieza: espera a que haya sitio en la máquina. */
  pendiente?: { text: string; images?: string[] }
}

export interface Lote {
  id: string
  n: number
  de: number
  carpeta: string
  /** Por qué el lote dejó de lanzar videos (uno acabó con error). Solo lo llevan los que esperan. */
  pausa?: string
}


/** Lo que enseña la pantalla de Opciones. De una llave solo viaja el final, para reconocerla. */
export interface Opciones {
  /** La de la API de YouTube (Data API v3), opcional: la sección Ideas saca con ella fechas y comentarios. */
  youtube: { final: string } | null
  /**
   * Un token de Meta (inicio de sesión con Facebook), opcional: Ideas lee con él los Reels de otras cuentas y los tuyos
   * (`server/ideas/instagram.ts`). `caduca`, si Meta lo dice. No es el token de la nube, que publica.
   */
  meta: { final: string; caduca?: number } | null
}

/** La tarjeta de un enlace pegado en el inicio (`server/enlaces.ts`). Sin título, se enseña solo el sitio, o nada. */
export interface Enlace {
  url: string
  sitio: string
  titulo?: string
  imagen?: string
  autor?: string
}

/** Las redes donde Sloth programa los videos verticales terminados (`server/redes/`). Cada una es un módulo. */
export type RedId = 'tiktok' | 'instagram'

/**
 * El ritmo de publicación: `porDia` videos cada `cadaDias` días (contados desde `inicio`, `'2026-10-27'`), el primero a
 * las `desde` (`'12:00'`) y cada uno `cadaMin` minutos después. Lo eliges en «Mis videos»; las cuentas, en `shared/ritmo.ts`.
 */
export interface Ritmo {
  porDia: number
  cadaDias: number
  inicio: string
  desde: string
  cadaMin: number
}

/** `GET /api/redes/ritmo` y `GET /api/youtube/ritmo`: el ritmo, y qué cambiaría «Pasar al ritmo nuevo». */
export interface EstadoRitmo {
  ritmo: Ritmo
  /** Hay una cuenta conectada: sin ella no hay nada que programar, y no se enseña. */
  conectada: boolean
  /** Las publicaciones que aún no salen y cambiarían de hora. */
  cambian: number
  /** Las que ya están en una red que no deja cambiar su hora (TikTok): se quedan como están. */
  fijas: number
}

/**
 * Una red en Opciones. `cuenta` es con quién está la sesión abierta, o `null` si falta conectarla. Con `token` se conecta
 * pegando un token de su API (Instagram); si no, iniciando sesión en la ventana de Edge.
 */
export interface Red {
  id: RedId
  nombre: string
  cuenta: string | null
  ritmo: Ritmo
  token: boolean
  /** Estaba conectada y la red cerró la sesión: lo de su cola espera a que se vuelva a conectar. */
  sinSesion?: boolean
  /** Conectándola en la app, fuiste a entrar con Google: eso va en una ventana de Edge, y la sesión pasa sola a la app. */
  enEdge?: boolean
  /** Va por la nube (Instagram) y aún no hay una: primero se monta en tu cuenta de Cloudflare. */
  sinNube?: boolean
  /** Cuándo caduca su token (`Date.now()`), si la red lo dijo; y por qué falló la última renovación, si falló. */
  caduca?: number
  renovacion?: string
}

/** Lo que cada estilo pide al publicar: los hashtags que van siempre (sin `#`). */
export interface RedesDelEstilo {
  tags: string[]
}

/** El texto de un video antes de programarlo: lo escribe Claude y se puede cambiar. */
export interface Borrador {
  ruta: string
  texto: string
  tags: string[]
}

/**
 * Un video en una red: en `cola` espera su turno; `programado` sale solo a la hora `cuando` (`'2026-10-12 16:00'`), y
 * `publicado` es que la red dijo que ya salió. `descartado` es que lo quitaste (de la cola, o tras fallar): «Programar los
 * que faltan» no lo vuelve a poner hasta que lo deshagas. `ref` es el nombre que le da Sloth antes del primer intento (en
 * Instagram, el del video en la nube de Sloth), para reintentarlo sin subirlo otra vez. `huella` identifica el contenido
 * del video (ver `huella()` en `server/disco.ts`). `captura` es lo que se veía en la página de la red cuando falló
 * (`data/redes/fallos/<captura>`).
 */
export interface Publicacion extends Borrador {
  red: RedId
  cardId?: string
  huella: string
  cuando?: string
  ref?: string
  estado: 'cola' | 'subiendo' | 'programado' | 'publicado' | 'error' | 'descartado'
  error?: string
  captura?: string
  t: number
}

/**
 * Las marcas de redes de unos videos: las rutas de los verticales y, por ruta, lo que ya se hizo con cada uno en cada red
 * (un video copiado en otra carpeta cuenta como el mismo). `redes` son las que tienen la sesión abierta. `otraVersion`:
 * los que se volvieron a exportar después de programar la versión de antes, que sigue en la red. `programados`: los que ya
 * están en todas las redes conectadas, cuyo archivo ya no hace falta. `calendario`: cómo va cada red conectada, día a día.
 */
export interface MarcasDeRedes {
  verticales: string[]
  publicaciones: Record<string, Publicacion[]>
  redes: RedId[]
  otraVersion: string[]
  programados: string[]
  calendario: CalendarioRed[]
  /** Sloth sube algo ahora por el navegador de las redes (TikTok): Mis videos lo enseña mientras tanto. */
  enNavegador?: boolean
}

/**
 * El calendario de una red, de hoy al último día con algo: los videos de cada día (`dia`, `'2026-10-12'`), cada uno con
 * su hora y cómo va, de los `porDia` del ritmo, y el primer hueco libre (`siguiente`, `'2026-10-16 16:00'`), donde va el
 * siguiente que programes.
 */
export interface CalendarioRed {
  red: RedId
  porDia: number
  dias: { dia: string; videos: { cuando: string; estado: Publicacion['estado'] }[] }[]
  siguiente: string
}

/** `GET /api/redes/estilos/<id>`: sus ajustes y las marcas de redes de sus videos. */
export interface RedesEstilo extends MarcasDeRedes {
  ajustes: RedesDelEstilo
}

/**
 * Lo que pide atención en redes, para el aviso de la barra lateral: lo que falló, por estilo, las redes que perdieron la
 * sesión, y si `redes.json` está dañado. `sinVideo`: lo que falló o se reintenta en una red que guarda el video
 * (Instagram) y ya no está en el disco; no sale en la galería, así que se ve en Opciones → Redes.
 */
export interface AvisoRedes {
  fallos: { cardId: string; titulo: string; n: number }[]
  sinVideo: Publicacion[]
  sinSesion: RedId[]
  roto?: string
}

/**
 * Cómo quedó lo que mandaste a programar, cuando ya no trabaja ninguna cola, por video: `bien`, ya en todas sus redes;
 * `fallaron`, en alguna; `esperan`, siguen en la cola (fuera del calendario de su red, o con su sesión cerrada).
 */
export interface TandaRedes {
  bien: number
  fallaron: number
  esperan: number
  redes: RedId[]
}

/** `GET /api/claude/version` (y `/api/codex/version`): la versión que trae Sloth. `null` si no está instalado. */
export interface VersionClaude {
  instalada: string | null
}

/**
 * `GET /api/requisitos`: algo que las skills necesitan fuera de Sloth (FFmpeg, Python…). `detalle` es la versión que se
 * encontró o lo que falta; `aMano`, cómo conseguirlo cuando Sloth no lo puede instalar.
 */
export interface Requisito {
  id: string
  nombre: string
  para: string
  listo: boolean
  /** Lo que se encontró (la versión) o lo que falta; mientras se instala, en qué va («Bajando torch (3,4 GB)»). */
  detalle?: string
  instalable: boolean
  aMano?: string
  /** Sin ella todo funciona, peor (la cuenta de ChatGPT): no cuenta como algo que falta. */
  opcional?: boolean
  estado?: 'esperando' | 'instalando'
  error?: string
}

/** `GET /api/modelos3d`: la biblioteca 3D, con sus tipos en el orden en que se enseñan (`para`: qué agrupa). */
export interface Biblioteca3D {
  categorias: { nombre: string; para: string }[]
  modelos: Modelo3D[]
}

/**
 * Un modelo de la biblioteca 3D (`skills/modelos-3d/modelos/<id>/modelo.json`). `resumen`, para qué sirve en pocas
 * palabras; `hace`, lo que puede hacer en un video; `exporta`, los componentes que da; `usa`, otros modelos que necesita;
 * `origen`, el video del que salió; `vista`, la URL de su foto (fondo transparente) y `giro`, la de su video con la
 * cámara que se mece.
 */
export interface Modelo3D {
  id: string
  nombre: string
  resumen?: string
  categoria?: string
  descripcion: string
  hace?: string[]
  etiquetas: string[]
  exporta: string[]
  usa: string[]
  origen?: string
  creado?: string
  actualizado?: string
  vista?: string
  giro?: string
}

/**
 * `GET /api/claude/cuenta`: con qué cuenta trabaja Claude Code en esta computadora. `conectando` es el inicio de sesión en
 * curso, con el enlace de respaldo por si el navegador no se abrió; `error`, por qué falló el último.
 */
export interface CuentaClaude {
  conectada: boolean
  /** El correo de la cuenta, o de dónde sale la llave de API. */
  quien?: string
  /** `pro`, `max`… */
  plan?: string
  conectando?: { url?: string }
  error?: string
}

/**
 * `GET /api/claude/limites` y `/api/codex/limites`: cuánto va de cada límite del plan (sesión, semana, por modelo).
 * Sin ventanas si el proveedor no informa límites de plan (por ejemplo, con una llave de API).
 */
export interface LimitesClaude {
  /** `uso`, de 0 a 100; `reinicia`, la fecha ISO en que vuelve a cero. */
  ventanas: { nombre: string; uso: number; reinicia?: string }[]
}

/**
 * Un archivo que el agente está escribiendo (`Write`, o un heredoc en `Bash`), tal como va saliendo del modelo. No se guarda: solo viaja por el
 * WebSocket para que el estudio lo enseñe mientras se escribe. `id` es el de la herramienta; `at`, el último trozo.
 */
export interface FileDraft {
  id: string
  path: string
  text: string
  at: number
}

/**
 * Ideas (`server/ideas/`): un canal es a quién le habla y desde dónde se investiga su nicho. Vive en
 * `trabajo/ideas/<id>/canal.json`, junto a todo lo que se investiga y se propone para él. Es de YouTube y videos largos,
 * o, con `formato: 'vertical'`, de TikTok e Instagram.
 */
export interface Canal {
  id: string
  nombre: string
  /** `'vertical'`: TikTok e Instagram, videos cortos, con la skill `ideas-vertical`. Sin él, YouTube y videos largos. */
  formato?: 'vertical'
  /**
   * `@tu_canal`: su canal en YouTube, para medir su propio piso; en un canal vertical, su cuenta de TikTok.
   * Opcional: un canal puede no existir aún.
   */
  handle?: string
  /** Solo en un canal vertical: su cuenta de Instagram, para medir su piso ahí. */
  instagram?: string
  /** Quién quieres que vea, y compre: la decisión que manda sobre todas las demás. */
  publico: string
  /** Para qué es el canal: vender un producto, la publicidad de YouTube, patrocinios… */
  meta: string
  /** Lo que se busca en YouTube: las palabras con que el público pide el tema. */
  semillas: string[]
  /** Nichos con la misma intención, de donde se toman las fórmulas de empaque. */
  vecinos: string[]
  /**
   * Canales que ya conoces (`@handle` o enlace): se leen enteros, como si los hubiera traído una búsqueda. En un canal
   * vertical, cuentas de TikTok (`@cuenta`) o de Instagram (`instagram.com/cuenta`): ver `redDeReferencia`.
   */
  referencias: string[]
  creado: number
}

/** De qué red es un video o una cuenta de un canal vertical. */
export type RedVertical = 'tiktok' | 'instagram'

/** Un video leído en la investigación. De YouTube, o de TikTok e Instagram si lleva `red`. */
export interface VideoYT {
  id: string
  /** El título; en TikTok e Instagram, la descripción, que no es el texto que se ve en el video. */
  titulo: string
  /** El nombre del canal; en TikTok e Instagram, `@usuario`. */
  canal: string
  canalId: string
  vistas: number
  segundos?: number
  /** Solo en un canal vertical: de qué red es. Sin él, es de YouTube. */
  red?: RedVertical
  /** La página del video, si no es de YouTube. */
  url?: string
  guardados?: number
  compartidos?: number
  /** Fijado arriba de su perfil: suele ser viejo y con muchas vistas, y no entra en la mediana de su cuenta. */
  fijado?: boolean
  /** En TikTok e Instagram: los comentarios con más likes de un outlier, para leer qué pide la gente. */
  destacados?: { texto: string; likes: number }[]
  /** En Instagram: es una colaboración pagada. Sus vistas no son demanda orgánica. */
  pagado?: boolean
  /**
   * Lo que se dice al principio, de su transcripción (`transcripciones/<id>.json`): los primeros 3 s en TikTok e
   * Instagram (hasta acabar la frase), los primeros 30 s en YouTube. Es el gancho dicho; el que se ve en pantalla no está.
   */
  gancho?: string
  /** Se transcribió y no tiene voz (música, solo texto en pantalla): su gancho está en la imagen, no en lo dicho. */
  sinVoz?: boolean
  /** Cuándo se transcribió. Sin él, aún no (o no se pudo). */
  transcrito?: number
  /**
   * En TikTok e Instagram: el idioma de su texto (`'es'`, `'en'`…). Lo da la búsqueda de TikTok; lo demás se deduce de
   * la descripción (`idiomaDe`). Sin él, no se sabe (solo hashtags, o muy poco texto).
   */
  idioma?: string
  /**
   * Sus vistas entre la mediana de los últimos videos largos de su canal, sin redondear: se redondea solo al pintarlo
   * (`veces`). Solo lo llevan los videos largos de un canal que se pudo medir.
   */
  x?: number
  /**
   * `'2026-09-14'`. Lo da la API de YouTube o, sin llave, la página del video, solo para los mejores. En TikTok e
   * Instagram viene siempre con el video.
   */
  fecha?: string
  likes?: number
  comentarios?: number
  /**
   * Cuándo se leyeron su fecha y comentarios. Con `leido` y sin `fecha`, YouTube ya no lo tiene (borrado o privado). En
   * TikTok e Instagram, cuándo se leyeron sus `destacados`.
   */
  leido?: number
  /**
   * Las búsquedas o referencias de donde salió: la búsqueda que lo dio, o la que trajo a su canal. Sin repetir. Una
   * referencia va como está en `canal.json`; el canal del usuario, `'tu canal'`. Lo de una que ya no está en el perfil
   * se guarda, pero no cuenta (`alPerfil`).
   */
  de: string[]
  visto: number
}

/** Un canal de YouTube, o una cuenta de TikTok o Instagram si lleva `red`. */
export interface CanalYT {
  id: string
  nombre: string
  url: string
  mediana: number
  /**
   * Cuántos videos largos, de los últimos que se leyeron, dan su mediana: el tamaño de la muestra. En TikTok e Instagram,
   * todos los videos leídos menos los fijados.
   */
  videos: number
  /** Suscriptores; en TikTok e Instagram, seguidores. */
  subs?: number
  red?: RedVertical
  /** En TikTok e Instagram, el `@usuario`. */
  usuario?: string
  /** En TikTok e Instagram: el idioma en que publica, el de la mayoría de sus videos. */
  idioma?: string
  /** Lo que lo trajo, como en `VideoYT.de`. */
  de: string
  /** Es el canal del usuario. */
  propio?: boolean
  visto: number
}

/** Una búsqueda: cuántos videos largos dio y la mediana de sus vistas, la medida más tosca de la demanda. */
export interface TerminoYT {
  termino: string
  /** Es un nicho vecino: de ahí salen fórmulas de empaque, no la demanda del tema. */
  vecino?: boolean
  /**
   * Una búsqueda en TikTok o en Instagram: cada frase de un canal vertical se busca en las dos, y cada red es su propia
   * búsqueda (se distinguen por `termino` y `red`). Sin él, en YouTube.
   */
  red?: RedVertical
  /**
   * En TikTok, el idioma de la frase (`idiomaDe`): una en inglés se busca pidiendo inglés y abre las cuentas que publican
   * en inglés. Sin él, español.
   */
  idioma?: 'en'
  /** Cuántos videos largos dio; en TikTok, cuántos videos. */
  largos: number
  mediana: number
  /** Los primeros resultados largos, en su orden: el feed contra el que compite una miniatura. */
  ids: string[]
  visto: number
  /**
   * No se abrieron todos los canales que trae (se llegó al tope de canales, uno falló o se detuvo): la vuelta siguiente
   * la repite aunque sea reciente.
   */
  cortado?: boolean
}

/**
 * `investigacion.json`: se va acumulando de una vuelta a otra. Junto a él, `resumen.json` (`server/ideas/resumen.ts`) es lo
 * que lee primero la skill.
 */
export interface Investigacion {
  terminos: TerminoYT[]
  canales: CanalYT[]
  /** Todos los videos leídos de cada canal, no solo los outliers: los que no funcionaron también son evidencia. */
  videos: VideoYT[]
  hecha?: number
}

/** Un paso de la investigación, como se enseña en la sección: qué hizo y qué encontró. */
export interface PasoYT {
  at: number
  tipo: 'buscar' | 'canal' | 'fecha' | 'comentarios' | 'transcribir' | 'temas' | 'pausa' | 'error' | 'info'
  texto: string
  detalle?: string
}

/** La investigación en curso, o la última. Sus pasos se guardan en `registro.json`. */
export interface TrabajoYT {
  canalId: string
  estado: 'trabajando' | 'listo' | 'error' | 'detenido'
  fase: string
  hecho: number
  total: number
  pasos: PasoYT[]
  empezo: number
  termino?: number
  error?: string
  /** La pidió «Proponer ideas» para lo que faltaba del perfil: al terminar bien, Claude propone. */
  proponer?: boolean
}

/**
 * `transcripciones/<id>.json` en la carpeta de un canal: lo que se dice en un video. En YouTube sale de sus subtítulos
 * (`fuente: 'subtitulos'`); en TikTok e Instagram, de su audio con el Whisper de Sloth. Se guarda entera: al preparar un
 * video, Claude lee completas las de su evidencia. Sin voz, `segmentos` va vacío.
 */
export interface Transcripcion {
  id: string
  red: 'youtube' | RedVertical
  fuente: 'subtitulos' | 'whisper'
  idioma?: string
  segmentos: { inicio: number; fin: number; texto: string }[]
  texto: string
  hecha: number
}

/**
 * `temas.json` (`server/ideas/vectores.ts`): los videos de la investigación agrupados por lo que dicen (su título o
 * descripción y su transcripción, convertidos en vectores con un modelo multilingüe local). Un tema junta videos que
 * hablan de lo mismo aunque usen otras palabras u otro idioma.
 */
export interface Tema {
  id: string
  /** Las palabras que más lo distinguen de los demás temas: «claude · editar · video». */
  nombre: string
  /** Los videos del tema. */
  ids: string[]
  /** Los más representativos (los más cerca de su centro). */
  ejemplos: string[]
}

export interface Temas {
  modelo: string
  hecho: number
  temas: Tema[]
  /**
   * De los outliers que no son en español, sus videos más parecidos en español: `[id, similitud de 0 a 1]`. Si no hay
   * ninguno cerca, lo que funciona en inglés aún no existe en español.
   */
  enEspanol: Record<string, [string, number][]>
}

/** Una idea que propuso Claude desde la investigación. La escribe la skill `ideas-youtube` en `ideas.json`. */
export interface Idea {
  id: string
  tema: string
  titulo: string
  titulos: { texto: string; formato: string; porque: string }[]
  miniatura: string
  /** Ids de videos de la investigación. */
  evidencia: string[]
  /** La búsqueda cuyo feed es la competencia directa. */
  termino?: string
  ejecucion: string
  gancho: { promesa: string; prueba: string; plan: string; persona: string }
  porque: string
  riesgo: string
  piso: number
  techo: number
  cta?: string
  /**
   * Solo en un canal vertical (skill `ideas-vertical`): el id de la card de Sloth con que conviene hacerlo (`cards.json`).
   * Ahí `titulo` es el texto del primer cuadro, y `miniatura`, lo que se ve en él.
   */
  estilo?: string
  /** Solo en un canal vertical: dónde conviene publicarla. */
  red?: RedVertical | 'ambas'
}

export interface Ideas {
  ideas: Idea[]
  terminosNuevos?: string[]
  generadas?: number
}

/** Lo que el usuario hizo con una idea, aparte de lo que escribe Claude. */
export interface IdeaElegida {
  estado: 'elegida' | 'descartada'
  en: number
  /** Los hilos que salieron de ella: puedes grabarla tú y además hacerla con uno o varios estilos. */
  hilos: HiloDeIdea[]
}

/** Un hilo que salió de una idea. */
export interface HiloDeIdea {
  /** La card con que se hace, o `'grabar'` para «Lo grabo yo». */
  cardId: string
  /** Sin `id`, «Hacer con…» abrió el borrador y el hilo aún no se manda. */
  id?: string
  en: number
}

/** Un hilo de la sección Ideas: el que propone ideas o el que prepara una para grabarla. */
export interface HiloIdeas {
  id: string
  title: string
  running: boolean
}

/**
 * Una vuelta anterior de «Proponer ideas»: antes de cada vuelta nueva, Sloth guarda la que había en
 * `anteriores/<vuelta>/`, para que ninguna idea se pierda.
 */
export interface VueltaAnterior {
  /** `'2026-10-09-1130'`, o `'2026-10-09-1130-2'` si ya había otra de ese minuto: el nombre de su carpeta. */
  vuelta: string
  en: number
  ideas: Idea[]
}

/** `GET /api/ideas/<id>/hilo`: qué hace ahora el hilo que propone ideas, sin abrirlo. */
export interface EnVivo {
  running: boolean
  /** Su última herramienta, dicha para el usuario, o «Pensando…». */
  ahora: string
  /** Cuándo empezó el turno en curso. */
  desde?: number
}

/** `GET /api/ideas/<id>`: todo lo de un canal. */
export interface CanalCompleto {
  canal: Canal
  carpeta: string
  investigacion: Investigacion | null
  trabajo: TrabajoYT | null
  ideas: Ideas | null
  /** Las vueltas anteriores, de la más nueva a la más vieja. */
  anteriores: VueltaAnterior[]
  elegidas: Record<string, IdeaElegida>
  /** El último hilo que propuso ideas. */
  hilo?: HiloIdeas
  /** La última entrevista que armó el perfil del canal con preguntas. */
  entrevista?: HiloIdeas
  /** El razonamiento de Claude, según va apareciendo, y el esquema de cada idea preparada para grabar. */
  demanda?: string
  formatos?: string
  esquemas: Record<string, string>
  /** Si está puesta la llave de la API de YouTube. */
  api: boolean
  /** Si se puede leer YouTube: hace falta yt-dlp (el Python de Sloth, o uno con yt-dlp instalado). */
  ytdlp: boolean
  /** Solo en un canal vertical: si está puesto el token de Meta, sin el que Instagram no se investiga. */
  meta?: boolean
  /** `temas.json`, si la investigación ya agrupó sus videos. */
  temas?: Temas | null
  /**
   * Cómo le fue a tus videos largos, si es un canal de YouTube y es el que conectaste para subir (`null` si aún no se
   * midió). Lleva ya puestos los números de Studio (`studio.json`).
   */
  rendimiento?: Rendimiento | null
  /** `diagnostico.md`: lo que Claude concluyó de esos números, el más nuevo arriba. */
  diagnostico?: string
  /** El último hilo que diagnosticó. */
  diagnosticoHilo?: HiloIdeas
}

/**
 * Un video largo tuyo y cómo le fue (`rendimiento.json`, `server/ideas/rendimiento.ts`). Lo de Analytics cuenta desde que
 * salió y tarda 2 o 3 días en llegar: sin él, falta el campo.
 */
export interface VideoPropio {
  id: string
  titulo: string
  fecha: string
  segundos: number
  privado?: boolean
  vistas: number
  likes?: number
  comentarios?: number
  minutos?: number
  /** Segundos que ve cada quien, en promedio, y qué parte del video es (%). */
  duracionMedia?: number
  visto?: number
  suscriptores?: number
  /** El % del público que sigue a los 30 s y al minuto. */
  a30?: number
  a60?: number
  /** De dónde llegaron (el tipo de YouTube: `YT_SEARCH`, `SUBSCRIBER`…) y qué buscaron, con sus vistas. */
  fuentes?: [string, number][]
  busquedas?: [string, number][]
  /** De Studio, que la API no los da: las veces que se vio la miniatura y el % que entró. */
  impresiones?: number
  ctr?: number
}

export interface Rendimiento {
  medido: number
  canal: { id: string; nombre: string; suscriptores: number }
  videos: VideoPropio[]
  /** Los últimos 28 días del canal: qué parte de las vistas es de suscriptores (%), y de dónde, qué edad y en qué te ven. */
  audiencia?: { deSuscriptores?: number; paises: [string, number][]; edades: [string, number][]; dispositivos: [string, number][] }
  /** Cuándo se leyó Studio (`studio.json`, «2026-10-20»). */
  studio?: string
}

/**
 * `GET /api/ideas/<id>/tiktok`: las cuentas de investigación, las que buscan y leen comentarios (nunca las que
 * publican), en el mismo navegador. `abierto`: si está abierto; `cuenta`: el `@usuario` de TikTok, o `null` sin sesión;
 * `instagram`: el de Instagram, o `null` sin sesión.
 */
export interface CuentaInvestigacion {
  abierto: boolean
  cuenta: string | null
  instagram?: string | null
}

/** De dónde sale una mejora pedida desde un hilo (el símbolo de su agente): el hilo y lo que pasó (lo que elegiste, o el error). */
export interface OrigenMejora {
  hilo: string
  titulo: string
  cita?: string
}

/** Lo que el agente del hilo (o Claude, sin hilo) propone al ayudarte a decir algo (`POST /api/comunidad/redactar`). */
export interface AyudaMejora {
  /** Lo que entendió que pasó o que quieres, en llano. */
  entendi: string
  /** El texto propuesto. */
  mejora: string
  /** Lo que le falta saber para decirlo bien (0 a 2). */
  preguntas: string[]
}

/** Las secciones de la comunidad (`licencias/src/comunidad.ts`). En Anuncios solo publica el creador. */
export type CategoriaComunidad = 'general' | 'hice' | 'ayuda' | 'mejoras' | 'anuncios'

/** Lo que los demás ven de un miembro de la comunidad. */
export interface Autor {
  id: string
  nombre: string
  /** La URL de su foto. */
  foto?: string
  /** El creador de Sloth. */
  creador?: boolean
  /** Fundador (de las primeras personas que apoyaron, para siempre) o Apoya (mientras apoya). */
  insignia?: 'fundador' | 'apoya'
  /** Solo en tu perfil: si sales en los créditos de sloth.vancci.org (los Fundadores que lo piden). */
  creditos?: boolean
}

/** Una imagen o un video de una publicación. `llave` es su nombre en la comunidad y `url`, de donde se carga. */
export interface AdjuntoComunidad {
  tipo: 'imagen' | 'video'
  llave: string
  url: string
  /** La portada de un video: su llave y su URL. */
  poster?: string
  posterUrl?: string
  vertical?: boolean
}

/** Una publicación de la comunidad. Las fechas, en ISO. */
export interface PublicacionComunidad {
  id: string
  autor: Autor
  categoria: CategoriaComunidad
  titulo: string
  texto: string
  adjuntos: AdjuntoComunidad[]
  fijada: boolean
  /** Solo en Mejoras: cómo va, según el creador. */
  estado?: 'haciendo' | 'hecha'
  creada: string
  editada?: string
  /** Lo último que pasó en ella: se publicó o se comentó. Ordena el feed. */
  actividad: string
  likes: number
  /** Si te gusta a ti. */
  megusta: boolean
  comentarios: number
  ultimoComentario?: string
  /** Los últimos que comentaron (hasta 5), el más reciente primero, para enseñar sus caras. */
  comentaron: Autor[]
  /** Cuántos la reportaron. Solo lo ve el creador; con 3 o más, los demás ya no la ven hasta que la revise. */
  reportes?: number
}

export interface ComentarioComunidad {
  id: string
  autor: Autor
  texto: string
  creada: string
  /** El comentario al que responde, siempre uno de primer nivel. */
  responde?: string
  /** Sus imágenes, si las lleva. */
  adjuntos?: AdjuntoComunidad[]
  likes: number
  megusta: boolean
  /** Como en `PublicacionComunidad`. */
  reportes?: number
}

/** Lo que le pasó a lo tuyo en la comunidad: te comentaron, te respondieron, te dieron me gusta… */
export interface AvisoComunidad {
  id: string
  tipo: 'comento' | 'respondio' | 'gusta' | 'gustaComentario' | 'estado' | 'reporte' | 'anuncio'
  de: Autor
  publicacion: string
  /** El título de la publicación, o el principio de su texto. */
  sobre: string
  comentario?: string
  /** El estado nuevo de una mejora, o el motivo de un reporte. */
  texto?: string
  creado: string
  leido: boolean
}

/** `GET /api/comunidad`: quién eres, los números de la comunidad y una página del feed. */
/** La votación de qué sigue en el roadmap: cada meta con sus votos (el de un Fundador vale dos) y la que votaste. */
export interface RoadmapComunidad {
  metas: { id: string; titulo: string; votos: number }[]
  mio?: string
}

export interface FeedComunidad {
  /** Con lo que llevas hecho, para «Comienza aquí». */
  yo: Autor & { publicaciones: number; comentarios: number }
  /** Las licencias activas. */
  miembros: number
  /** Las que abrieron Sloth en las últimas 24 horas. */
  activos: number
  /** Tus avisos sin leer. */
  avisos: number
  roadmap: RoadmapComunidad
  publicaciones: PublicacionComunidad[]
  /** Hay otra página. */
  mas: boolean
}

/** Lo que el servidor empuja por el WebSocket. */
export type ServerPush =
  | { type: 'events'; sessionId: string; from: number; events: AgentEvent[] }
  | { type: 'draft'; sessionId: string; draft: FileDraft }
  | { type: 'session'; session: SessionMeta }
  | { type: 'removed'; sessionId: string }
  | { type: 'cards'; cards: Card[] }
  /** El catálogo de modelos, cuando llega: `/api/state` no lo espera. */
  | { type: 'models'; models: Model[] }
  /** Panel de etapas: cambió algo de la carpeta de un hilo, y su avance se vuelve a pedir. */
  | { type: 'etapas'; sessionId: string }
  /** Barra lateral: el video de un hilo avanzó (o se miró por primera vez). */
  | { type: 'avance'; sessionId: string; avance: AvanceCorto }
  /** Ideas: con `trabajo`, un paso de la investigación; sin él, cambió un archivo de la carpeta del canal. */
  | { type: 'ideas'; canalId: string; trabajo?: TrabajoYT }
  /** Redes: cambió algo de lo programado (va cada vez que se guarda), con lo que pide atención; con `acabo`, al terminar lo que mandaste. */
  | { type: 'redes'; aviso: AvisoRedes; acabo?: TandaRedes }
  /** Comunidad: se publicó algo desde esta computadora fuera de la sección (desde un hilo, o el agente). */
  | { type: 'comunidad' }

/**
 * Una fuente del radar (`server/radar/fuentes.ts`), como se guarda en `data/radar/fuentes.json`. `pagina` es una página
 * sin feed: se leen sus enlaces que cuadran con `enlaces`, un patrón de URL (RegExp) en texto.
 */
export type FuenteRadar =
  | { tipo: 'x'; cuenta: string }
  | { tipo: 'rss'; nombre: string; url: string }
  | { tipo: 'pagina'; nombre: string; url: string; enlaces: string }
  | { tipo: 'hn' }
  | { tipo: 'github' }

/**
 * `GET /api/radar/fuentes`: lo que lee el radar, cada fuente con su última lectura. `deSiempre`: no las has cambiado.
 * `recientes`: las noticias de las últimas 24 h que trajeron.
 */
export interface FuentesRadar {
  fuentes: Array<FuenteRadar & { id: string; ultima: number | null; error: string | null; docs: number }>
  deSiempre: boolean
  recientes: number
}

/** Una fuente probada antes de añadirla: si respondió y lo que trae («20 noticias»), o por qué no. */
export interface FuenteProbada {
  fuente: FuenteRadar
  id: string
  ok: boolean
  detalle: string
}

/**
 * La clave de la app que se vende (`server/licencia.ts`), en `GET /api/licencia`: una cuenta gratis o un apoyo. Sin
 * `clave`, nunca creó cuenta ni apoyó en esta computadora; con `enlace`, espera el pago.
 */
export interface Licencia {
  activa: boolean
  clave?: string
  email?: string
  /** `mensual` o `anual`: un apoyo; `gratis`: uno de los lugares gratis de por vida (de cuando Sloth se vendía); `cuenta`: una cuenta gratis. */
  plan?: 'mensual' | 'anual' | 'gratis' | 'cuenta'
  /** Lo que se cobra cada mes o cada año, en pesos. */
  monto?: number
  /**
   * Como lo dice Mercado Pago: `pending` (sin pagar), `authorized`, `paused` o `cancelled`; `gratis`; o `pagado`, un
   * año pagado de una vez que no se renueva solo.
   */
  estado?: string
  /** Hasta cuándo está pagada (ISO): el próximo cobro o, cancelada o pagada de una vez, cuando se cierra. */
  pagadaHasta?: string
  /** El folio de su cancelación, si la canceló. */
  folio?: string
  /** De las primeras personas que apoyaron: fundadora para siempre, aunque cancele. */
  fundador?: boolean
  error?: string
}

/** La versión de esta app y, si la hay, la nueva y cómo va su descarga (electron/main.ts). */
export interface ActualizacionSloth {
  actual: string
  nueva?: string
  /** Lo que trae la nueva, en un renglón: se ve al pasar el cursor sobre «Actualizar». */
  novedad?: string
  /** De 0 a 1 mientras baja; 1, ya bajó y Sloth se cierra para ponerla. */
  avance?: number
  /** Bajando, se fue el internet: sigue sola cuando vuelva. */
  sinRed?: boolean
  error?: string
  /** En Mac sin firma de Apple: «Actualizar» abre su descarga en el navegador, y se instala encima. */
  aMano?: boolean
}

/** Lo que la ventana de Sloth (electron/preload.ts) le da a la interfaz como `window.sloth`. En un navegador no está. */
export interface PuenteSloth {
  actualizacion(): Promise<ActualizacionSloth>
  /** Baja la versión nueva y la pone: Sloth se cierra y se vuelve a abrir. */
  actualizar(): Promise<ActualizacionSloth>
  /** La ventana al frente (al pulsar un aviso). */
  traer(): void
  /** Si Sloth está anclada a la barra de tareas; `null` donde no se puede ofrecer (fuera de la app instalada en Windows). */
  anclada(): Promise<boolean | null>
  /** Pide a Windows anclarla, que pregunta en su ventana. `windows`: Windows no dejó pedirlo. */
  anclar(): Promise<'anclada' | 'no' | 'windows'>
  /** El navegador integrado de cada hilo. No está en una ventana de antes de que existiera. */
  navegador?: PuenteNavegador
}

/**
 * La página del navegador integrado donde Sloth publica en TikTok (`server/redes/navegador.ts`), como si fuera otro
 * hilo. Tiene su propio perfil: la sesión de las redes no la tienen los agentes.
 */
export const NAVEGADOR_REDES = 'redes'

/**
 * La página de un hilo en el navegador integrado (electron/navegador.ts). `url` vacía: aún no abrió nada. `agente`: el
 * agente la está usando. `error`: por qué no abrió la última dirección.
 */
export interface EstadoNavegador {
  hilo: string
  url: string
  titulo: string
  cargando: boolean
  atras: boolean
  adelante: boolean
  agente: boolean
  error?: string
}

export type AccionNavegador = 'atras' | 'adelante' | 'recargar' | 'parar' | 'fuera'

export interface PuenteNavegador {
  /** Pone la página del hilo en `caja` (en píxeles de la interfaz), encima de todo; sin hilo, la esconde. */
  ver(hilo: string | null, caja?: { x: number; y: number; width: number; height: number }): void
  ir(hilo: string, url: string): void
  hacer(hilo: string, accion: AccionNavegador): void
  /** Cada cambio de cualquier página. Devuelve con qué dejar de oír. */
  oir(cb: (e: EstadoNavegador) => void): () => void
  estados(): Promise<EstadoNavegador[]>
}

/** Lo que se puede borrar sin perder nada tuyo, en Opciones → Espacio en disco (`server/espacio.ts`). */
export type IdEspacio = 'temporales' | 'renders' | 'modulos' | 'caches' | 'perfiles' | 'fuentes' | 'python' | 'adjuntos'

export interface GrupoEspacio {
  id: IdEspacio
  nombre: string
  /** Qué es y qué pasa si se borra, en una frase. */
  detalle: string
  bytes: number
  cuantos: number
  /** Si Sloth lo borra solo (cada 6 horas) y entra en «Liberar»: lo demás se borra uno por uno, con su botón. */
  seguro: boolean
}

export interface Espacio {
  /** Bytes libres y totales del disco donde vive Sloth. */
  libre: number
  total: number
  grupos: GrupoEspacio[]
  /** Lo que se acaba de borrar, al liberar. */
  liberado?: number
}

/**
 * Con qué se transcribe la voz (`python/procesos/parakeet.py`): Whisper en una NVIDIA, o Parakeet en el procesador, con el
 * alineador de torch (`parakeet`) o sin torch (`parakeet-solo`, en los Mac con Intel).
 */
export type MotorVoz = 'whisper' | 'parakeet' | 'parakeet-solo'

/** Opciones → Tu equipo (`server/equipo.ts`): qué tiene esta computadora y cuánto tarda cada cosa en ella. */
export interface Equipo {
  procesador: string
  hilos: number
  /** Bytes. */
  memoria: number
  /** La tarjeta de video, si se supo cuál. */
  tarjeta?: string
  /** Con qué transcribe hoy la voz; null si aún no está el Python de Sloth. */
  motor: MotorVoz | null
  /** Si su Python de Sloth es el de CUDA: Whisper va en la tarjeta (si no, en el procesador, hasta bajar Parakeet). */
  nvidia: boolean
  /** Lo medido de la voz: segundos de trabajo por segundo de voz (`veces`) y de cargar el motor (`carga`). */
  voz?: { motor: MotorVoz; veces: number; carga: number; fecha: string }
  /** Lo medido del render final, a tamaño completo: cuadros por segundo. */
  render?: { cuadros: number; fecha: string }
  /** Con qué dibuja el 3D el Chrome del render; `software`, sin la tarjeta (muy lento). */
  tresD?: { nombre: string; software: boolean }
  /** Cuántos videos de un lote trabajan a la vez. */
  aLaVez: number
  /**
   * Si hay algo que la haría más rápida: Parakeet en una sin NVIDIA que aún transcribe con Whisper. Lo ofrece el aviso
   * del hilo nuevo; `estado`, `paso` y `error`, mientras se baja y si falló.
   */
  mejora?: { estado?: 'instalando' | 'esperando'; paso?: string; error?: string }
  midiendo: boolean
  /** Por qué no se pudo medir la última vez. */
  error?: string
}
