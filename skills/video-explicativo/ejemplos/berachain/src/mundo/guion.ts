// El guion del mundo 3D de este video, atado a las palabras de la voz con en(): dónde vive cada cosa (L), por dónde
// pasa la cámara (PLANOS), qué le pasa a la moneda protagonista (monedaEn) y qué precio lleva pegado (precioEn).
//
// El mapa: la cadena corre por el piso hacia −x desde su punta (0, 0, 0); delante, en z = 5, está la casa de la moneda
// (el gancho y el cierre pasan ahí). A la derecha de la punta, tú y el panal de las apps; a la izquierda, Ethereum y,
// más allá, lo que salió mal (el regalo, la bóveda, Balancer). La cámara vuelve a los sitios que ya se vieron.
import { Easing, interpolate, spring } from "remotion";
import { FPS } from "../tema";
import { en } from "../tiempo";
import type { EstadoMoneda, Rota } from "../modelos/moneda";
import { Plano, V3 } from "./camara";

export const T = {
  // El gancho
  anillo: en("los fondos"),
  precio: en("tres dólares"),
  bera: en("vera"),
  hoy: en("hoy vale"),
  rompe: en("dieciocho"),
  uno: en("uno de esos fondos"),
  devuelve: en("devolvieran"),
  // Qué es Berachain
  pero: en("pero primero"),
  queEs: en("qué es berachain"),
  blockchain: en("blockchain"),
  eth: en("como ethereum"),
  truco: en("truco"),
  casi: en("casi todas"),
  imprimen: en("imprimen"),
  dan: en("se las dan"),
  bera2: en("berachain se las daba"),
  pone: en("pone su dinero"),
  apps: en("apps"),
  pol: en("proof of liquidity"),
  recompensa: en("la recompensa"),
  bgt: en("bgt"),
  no: en("no se podía vender"),
  vender: en("vender", 1),
  regalar: en("regalar"),
  solo: en("solo se podía"),
  unoAUno: en("uno a uno"),
  porBera: en("por bera"),
  yVender: en("y vender"),
  // Qué falló
  fallo: en("entonces qué falló"),
  tres: en("tres cosas"),
  t1: en("uno imprimía"),
  mas: en("más de lo que"),
  ganaba: en("ganaba"),
  admitio: en("lo admitió"),
  menos: en("recibe menos"),
  t2: en("dos los que"),
  barata: en("barata"),
  vendieron: en("vendieron"),
  cuatro: en("cuatro días"),
  lanza: en("lanzamiento", 1),
  t69: en("sesenta y nueve"),
  feb: en("y el seis de febrero"),
  libero: en("se liberó"),
  inv: en("inversionistas"),
  yEquipo: en("y equipo"),
  t43: en("cuarenta y tres"),
  t3: en("tres la confianza"),
  hack: en("hackearon"),
  exchange: en("exchange"),
  valid: en("los validadores"),
  apagaron: en("apagaron"),
  doce: en("doce millones"),
  acuerdo: en("luego salió"),
  veinti: en("veinticinco millones"),
  anio: en("hasta un año"),
  sabe: en("todavía no se sabe"),
  // Hoy
  julio: en("en julio"),
  jubilaron: en("jubilaron"),
  corazon: en("el corazón"),
  agosto: en("en agosto"),
  minimo: en("catorce centavos"),
  mismo: en("ese mismo día"),
  empresa: en("una empresa"),
  pago: en("setenta millones"),
  valia: en("valía"),
  llego: en("llegó a tener"),
  tresMil: en("tres mil trescientos"),
  quedan: en("hoy le quedan"),
  treinta: en("treinta y cuatro"),
  // Cierre
  ahora: en("ahora dice"),
  motor: en("motor de negocios"),
  revive: en("revive"),
  apaga: en("se apaga"),
  yo: en("yo no te digo"),
  compres: en("compres"),
  vendas: en("vendas"),
  pero2: en("pero si quieres"),
  unete: en("únete"),
  enlace: en("el enlace"),
};

export const L = {
  casa: [-4.0, 1.08, 3.6] as V3, // la casa de la moneda: parada en el piso, delante y a la izquierda de la cadena
  brevan: [-3.38, 1.8, 3.6] as V3,
  cabeza: [0, 0.45, 0] as V3, // donde entra cada bloque; la cadena se va hacia el fondo (−z) como un camino
  escudo: [0, 1.95, -0.25] as V3, // quien vigila la red, sobre la punta
  eter: [-2.1, 1.6, -2.4] as V3,
  tu: [1.9, 0.72, 1.0] as V3,
  panal: [2.5, 0, -2.6] as V3, // detrás de ti: en la pantalla queda arriba
  regalo: [-3.8, 0, -5.5] as V3, // lo que salió mal, a la izquierda del camino, más atrás cada vez
  boveda: [-4.0, 0, -10] as V3,
  balancer: [-3.2, 1.75, -15.2] as V3,
  bex: [-1.4, 0.95, -13.8] as V3,
  nasdaq: [6.6, 1.5, -4.2] as V3,
};

/** Arriba de la punta: de donde sale lo que la cadena imprime. */
export const SALE: V3 = [L.cabeza[0], L.cabeza[1] + 0.55, L.cabeza[2]];

export const PLANOS: Plano[] = [
  // El gancho: la moneda en su casa; la cámara se le acerca despacio.
  { en: 0, pos: [-4, 3.6, 12.6], mira: [-4, 1.1, 3.6] },
  { en: 1, pos: [-4, 3.2, 11.0], mira: [-4, 1.1, 3.6], dura: T.pero - 1 },
  // «Pero primero»: un paso atrás mientras la moneda se rebobina.
  { en: T.pero, pos: [-3.2, 2.2, 11.8], mira: [-4, 1.25, 3.6], dura: 40 },
  // La cadena se arma hacia el fondo, como un camino; Ethereum al lado.
  { en: T.queEs + 20, pos: [7.0, 7.5, 11.5], mira: [0, 0.9, -1.6], dura: 34 },
  { en: T.eth - 2, pos: [1.7, 5.0, 12.0], mira: [-1.1, 1.2, -1.2], dura: 26 },
  // Imprimen en cada bloque y se las dan a quien vigila (arriba de la punta).
  { en: T.casi - 4, pos: [2.6, 3.2, 10.5], mira: [0, 1.3, -0.15], dura: 34 },
  // Berachain: a ti; y tu dinero, al panal de las apps (detrás de ti).
  { en: T.bera2 - 2, pos: [4.1, 3.05, 9.7], mira: [1.05, 0.62, 0.46], dura: 30 },
  { en: T.apps - 10, pos: [5.1, 5.6, 12.1], mira: [2.37, 1.23, -0.93], dura: 32 },
  { en: T.pol - 6, pos: [4.9, 9.5, 13.0], mira: [2.3, 0.9, -1.0], dura: 30 },
  // La recompensa: la moneda arriba de ti, sola contra el cielo.
  { en: T.recompensa - 4, pos: [1.3, 3.16, 5.57], mira: [2, 3.44, 1.61], dura: 30 },
  // Qué falló: arriba, el camino de noche.
  { en: T.fallo - 4, pos: [6, 12, 14], mira: [-0.8, 0.4, -5], dura: 36 },
  // 1 · La punta imprime de más.
  { en: T.t1 - 2, pos: [5.1, 5.91, 13.94], mira: [-0.49, 1.62, 0.09], dura: 32 },
  // 2 · El regalo y los que vendieron: por la izquierda del camino, hacia atrás.
  { en: T.t2 - 3, pos: [-10.0, 4.0, -1.2], mira: [-3.5, 0.64, -6.26], dura: 36 },
  // Cuatro días después: la moneda, su precio y el calendario.
  { en: T.cuatro - 6, pos: [-7.03, 2.22, -3.91], mira: [-3.27, 0.96, -7.3], dura: 26 },
  // La bóveda que se abre.
  { en: T.feb - 3, pos: [-13.58, 5.7, -1.37], mira: [-3.52, 1.06, -9.23], dura: 32 },
  // 3 · La confianza: Balancer y su exchange.
  { en: T.t3 - 3, pos: [-11.53, 4.35, -4.35], mira: [-2.34, 1.43, -14.57], dura: 34 },
  // La cadena se detiene: de vuelta a la punta, por la izquierda, mirando el camino.
  { en: T.valid - 6, pos: [-9.14, 7.41, 15.93], mira: [0.54, 2.17, 0.43], dura: 38 },
  // Brevan Howard: en la casa de la moneda.
  { en: T.acuerdo - 4, pos: [-2.8, 3.95, 20.14], mira: [-3.94, 1.65, 3.79], dura: 36 },
  // Hoy: tú y BGT; el mínimo; la empresa del Nasdaq; el panal que se vacía.
  { en: T.julio - 2, pos: [1.19, 3.39, 6.18], mira: [2, 3.71, 1.6], dura: 34 },
  { en: T.agosto - 2, pos: [1.26, 3.11, 5.8], mira: [2, 3.41, 1.61], dura: 28 },
  { en: T.mismo - 2, pos: [10.52, 4.5, 6.28], mira: [5.91, 2.09, -4.07], dura: 34 },
  { en: T.llego - 3, pos: [5.12, 3.16, 7.92], mira: [2.55, 1.29, -2.4], dura: 30 },
  // Cierre: la casa de la moneda, como en el gancho.
  { en: T.ahora - 2, pos: [-4, 2.9, 12.6], mira: [-4, 2.1, 3.6], dura: 24, arco: [0, 4, 10] },
  { en: T.revive - 4, pos: [-4, 2.35, 12.1], mira: [-4, 1.16, 3.6], dura: 22 },
  { en: T.pero2 - 2, pos: [-4, 5.5, 14.4], mira: [-4, 2.5, 3.6], dura: 30 },
];

// ---------------------------------------------------------------------------------------------------------------------
// La moneda protagonista

type Paso = { en: number; pos: V3; escala: number; dura?: number };

/** Por dónde anda la moneda. Con escala 0 desaparece; si estaba en 0, aparece ya en su sitio nuevo (no viaja). */
const PASOS: Paso[] = [
  { en: 0, pos: L.casa, escala: 1 },
  { en: T.uno, pos: [-4.43, 1.0, 3.6], escala: 0.78, dura: 22 }, // se aparta para dejar ver a Brevan Howard
  { en: T.pero + 24, pos: L.casa, escala: 0.9, dura: 20 }, // rebobinada, al centro de su casa
  { en: T.queEs + 20, pos: [0.25, 2.0, 0.9], escala: 0.42, dura: 34 }, // sobre la punta: es la moneda de esta cadena
  { en: T.casi - 4, pos: [0.25, 2.0, 0.9], escala: 0, dura: 10 }, // se va mientras la cadena imprime: una idea a la vez
  { en: T.recompensa - 6, pos: [2.0, 3.5, 1.6], escala: 0.38, dura: 16 }, // llega a ti
  { en: T.yVender + 10, pos: [-3, 7, -12], escala: 0.2, dura: 40 }, // vendida: se va
  { en: T.yVender + 52, pos: [-3, 7, -12], escala: 0, dura: 6 },
  { en: T.cuatro - 8, pos: [-3.4, 1.0, -7.4], escala: 0.42, dura: 16 }, // vuelve con su precio junto al regalo
  { en: T.feb - 3, pos: [-3.4, 1.0, -7.4], escala: 0, dura: 12 },
  { en: T.acuerdo - 6, pos: [-4.5, 0.6, 3.6], escala: 0.55, dura: 20 }, // en su casa, a un lado de Brevan Howard
  { en: T.julio - 2, pos: [2.0, 3.5, 1.6], escala: 0.38, dura: 34 }, // otra vez contigo: BGT
  { en: T.mismo, pos: [5.2, 1.0, -3.4], escala: 0.36, dura: 30 }, // la compra la empresa del Nasdaq
  { en: T.llego - 2, pos: [5.2, 1.0, -3.4], escala: 0, dura: 12 },
  { en: T.ahora - 2, pos: L.casa, escala: 0.7, dura: 24 }, // en casa, como al principio
];

const curva = Easing.inOut(Easing.cubic);

const pasoEn = (f: number) => {
  let pos = [...PASOS[0].pos] as V3;
  let escala = PASOS[0].escala;
  for (const p of PASOS.slice(1)) {
    if (f < p.en) break;
    const t = curva(Math.min(1, (f - p.en) / (p.dura ?? 24)));
    if (escala < 0.01) pos = [...p.pos] as V3;
    else pos = pos.map((v, i) => v + (p.pos[i] - v) * t) as V3;
    escala += (p.escala - escala) * t;
  }
  return { pos, escala };
};

/** Un resorte de 0 a 1 que empieza en `desde`. */
const resorte = (f: number, desde: number, rigidez = 80) => spring({ frame: f - desde, fps: FPS, config: { damping: 14, stiffness: rigidez } });

const REBOBINA = 24; // cuadros en que los cubos vuelven a ser moneda

export const monedaEn = (f: number): { e: EstadoMoneda; rota?: Rota } => {
  const { pos, escala } = pasoEn(f);
  // Entra girando (ya está a medio entrar en el cuadro 0: la miniatura del feed no puede ir vacía) y se balancea.
  const entrada = spring({ frame: f + 14, fps: FPS, config: { damping: 20, stiffness: 70 } });
  const golpe = f >= T.rompe && f < T.rompe + 10 ? Math.sin((f - T.rompe) * 2.6) * (10 - (f - T.rompe)) * 0.012 : 0;
  // Las vueltas: a BGT, de vuelta a BERA (el canje), a BGT (jubilado) y a BERA (el mínimo).
  const vueltas = [T.bgt - 10, T.unoAUno + 6, T.julio + 12, T.agosto + 4].reduce((s, t) => s + Math.PI * resorte(f, t, 70), 0);
  const giro = (1 - entrada) * Math.PI * 2.4 + vueltas + Math.sin(f / 34) * (f < T.pero ? 0.55 : 0.15) + golpe;
  let brillo = 1;
  if (f < T.pero) brillo = interpolate(f, [T.hoy, T.hoy + 8, T.rompe, T.rompe + 3], [1.15, 0.8, 0.8, 1.05], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  else if (f >= T.t69 && f < T.feb) brillo = interpolate(f, [T.t69, T.t69 + 20], [1, 0.7], { extrapolateRight: "clamp" });
  else if (f >= T.agosto && f < T.ahora) brillo = 0.8;
  else if (f >= T.ahora) brillo = interpolate(f, [T.revive - 4, T.revive + 6, T.apaga, T.apaga + 10], [0.7, 1.6, 1.6, 0.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const gris =
    f >= T.ahora ? 0 : interpolate(f, [T.corazon, T.corazon + 12, T.agosto, T.agosto + 10], [0, 1, 1, 0.25], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const candado = f < T.unoAUno + 6 ? resorte(f, T.no + 2, 180) : 1 - resorte(f, T.unoAUno + 6, 180);
  const e: EstadoMoneda = { pos, escala: escala * (f < T.pero ? 0.82 + 0.18 * entrada : 1), giro, inclina: 0.1 + Math.sin(f / 47) * 0.07, brillo, gris, candado };

  // Se deshace en «dieciocho» y, en «pero primero», se rebobina: los cubos vuelven a ser moneda.
  let g = f;
  if (f >= T.pero) g = f < T.pero + REBOBINA ? T.pero - ((f - T.pero) / REBOBINA) * (T.pero - T.rompe) : -1;
  const rota = g >= T.rompe ? { t: (g - T.rompe) / FPS, vuelta: g >= T.devuelve ? (g - T.devuelve) / FPS : 0, destino: L.brevan, queda: 0.06 } : undefined;
  return { e, rota };
};

// ---------------------------------------------------------------------------------------------------------------------
// El precio pegado a la moneda

export type Precio = { valor: number; rojo: boolean; nota: string; tam: number; visible: number };

const fundido = (f: number, desde: number, hasta: number) => interpolate(f, [desde, desde + 5, hasta - 5, hasta], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
const corre = (f: number, desde: number, hasta: number, de: number, a: number) =>
  interpolate(f, [desde, hasta], [de, a], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

/** El precio de BERA que la moneda lleva pegado cuando la historia habla de él; null cuando no. */
export const precioEn = (f: number): Precio | null => {
  if (f >= T.precio && f < T.pero + 4) {
    const rojo = f >= T.rompe;
    return {
      valor: corre(f, T.rompe, T.rompe + 16, 3, 0.18),
      rojo,
      nota: rojo ? "hoy, 17 oct 2026 · CoinGecko" : "Serie B, abril 2024 · Unchained",
      tam: 170,
      visible: fundido(f, T.precio, T.pero + 4),
    };
  }
  if (f >= T.cuatro - 4 && f < T.feb - 3) {
    const cae = T.lanza - 4;
    return {
      valor: corre(f, cae, T.t69 + 6, 15.5, 4.74),
      rojo: f >= cae,
      nota: f < cae ? "su pico · 6 feb 2025" : "10 feb 2025 · Binance",
      tam: 84,
      visible: fundido(f, T.cuatro - 4, T.feb - 3),
    };
  }
  if (f >= T.agosto && f < T.mismo - 2) {
    return { valor: corre(f, T.agosto, T.minimo + 4, 0.195, 0.142), rojo: true, nota: "14 ago 2026 · Binance", tam: 84, visible: fundido(f, T.agosto, T.mismo - 2) };
  }
  if (f >= T.revive - 6 && f < T.compres - 6) {
    return { valor: 0.18, rojo: false, nota: "hoy · CoinGecko", tam: 110, visible: fundido(f, T.revive - 6, T.compres - 6) };
  }
  return null;
};

/** Cuánta miel (dinero depositado) hay en el panal: se llena con tu dinero y, hoy, se vacía de 3,307 a 34 millones. */
export const nivelPanal = (f: number) => {
  if (f < T.llego - 3) return interpolate(f, [T.apps, T.pol + 10], [0, 0.85], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return interpolate(f, [T.llego - 3, T.llego + 6, T.quedan - 4, T.treinta + 10], [0.85, 1, 1, 0.012], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
};
