// Las poses del personaje (public/personaje/, copiadas de la biblioteca de la skill por nuevo.py) y su alto en el
// video. El recorte se apoya por los pies en el piso: `bajar` son px que baja respecto al piso, `espejo` lo voltea.
// Para volar, caer o rodar no hace falta otra foto: la misma pose girada con `arco` (ESCENAS.md).
// Qué es cada pose y hacia dónde mira: personaje/POSES.md de la skill.
export type Pose = { src: string; alto: number; bajar?: number; espejo?: boolean; sombra?: boolean; x?: number };

export const POSES = {
  hablando: { src: "personaje/hablando.png", alto: 1000, x: 420 }, // el gancho: abajo a la derecha, sobre el clip
  parado: { src: "personaje/parado.png", alto: 660 },
  agachado: { src: "personaje/agachado.png", alto: 430 },
  capucha: { src: "personaje/capucha.png", alto: 650 },
  laptop: { src: "personaje/laptop.png", alto: 380 },
  explicando: { src: "personaje/explicando.png", alto: 650 },
  sorprendido: { src: "personaje/sorprendido.png", alto: 650 },
  rodillas: { src: "personaje/rodillas.png", alto: 470 },
  heroe: { src: "personaje/heroe.png", alto: 680 },
} as const satisfies Record<string, Pose>;

export type NombrePose = keyof typeof POSES;
export const pose = (n: NombrePose): Pose => POSES[n];

// La cabeza sola (personaje/cabeza.png), para pegarla sobre otro cuerpo: centro y ancho en % de ese cuerpo.
export const CABEZA = { src: "personaje/cabeza.png" };
