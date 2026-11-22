import type { CategoriaComunidad, VideoHecho } from '../../shared/types'

/** Las pantallas que se apilan sobre las pestañas, con lo que recibe cada una. */
export type Rutas = {
  Pestanas: undefined
  Nuevo: { cardId: string }
  Hilo: { id: string }
  Avance: { id: string }
  Reproductor: { video: Pick<VideoHecho, 'src' | 'titulo' | 'archivo' | 'vertical'> & { nombre?: string } }
  SobreTi: undefined
  Publicacion: { id: string }
  Escribir: { seccion: CategoriaComunidad }
}

export type Pestanas = {
  Estilos: undefined
  Hilos: undefined
  Videos: undefined
  Comunidad: undefined
  Mas: undefined
}

/** Las del modo «Solo en el celular»: el agente trabaja en el teléfono y los hilos viven aquí. */
export type RutasCelular = {
  PestanasCelular: undefined
  NuevoLocal: { estiloId: string }
  HiloLocal: { id: string }
  ArchivosLocal: { id: string }
  LlaveClaude: undefined
  SobreTiLocal: undefined
  Publicacion: { id: string }
  Escribir: { seccion: CategoriaComunidad }
}

export type PestanasCelular = {
  InicioLocal: undefined
  HilosLocal: undefined
  Comunidad: undefined
  MasLocal: undefined
}
