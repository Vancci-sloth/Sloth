import React from "react";
import { AbsoluteFill, Easing, Freeze, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { COLOR, FUENTE } from "../estilo";
import { Caja, Camara, Emoji, Lleno, Metraje, Rotulo, Sello, Tarjeta, TextoMeme, useBeat, useFormato, useResorte, useSacudida } from "../piezas";
import { encuadre, esVideo, type Contexto } from "../encuadre";
import LINEAS from "../lineas.json";

type Rect = [number, number, number, number];
/** Renglones del OCR de cada captura (los escribe guion.py): el encuadre vertical no los corta. */
const RENGLONES = LINEAS as unknown as Record<string, Rect[]>;
const centro: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center" };
const fijo = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Momento de algo dentro del beat: en una palabra (`en`) o en una fracción del beat (`t`). */
const useMomento = () => {
  const { en, duracion } = useBeat();
  return (x: { en?: string; t?: number; desde?: number }) => (x.en ? en(x.en, x.desde ?? 0) : Math.round((x.t ?? 0) * duracion));
};

const mezcla = (a: Rect, b: Rect, p: number): Rect => [0, 1, 2, 3].map((i) => a[i] + (b[i] - a[i]) * p) as Rect;

/**
 * Resaltador naranja que se pinta de izquierda a derecha sobre un rectángulo de pantalla. Con `aparece` no se pinta:
 * entra desvaneciéndose ahí (el resaltador de la traducción); con `sale` se desvanece desde ese fotograma.
 */
const Marcador: React.FC<{ x: number; y: number; w: number; h: number; desde: number; claro?: boolean; aparece?: boolean; sale?: number }> = ({
  x,
  y,
  w,
  h,
  desde,
  claro,
  aparece,
  sale,
}) => {
  const frame = useCurrentFrame();
  const p = aparece ? 1 : interpolate(frame, [desde, desde + 9], [0, 1], { ...fijo, easing: Easing.out(Easing.quad) });
  const entra = aparece ? interpolate(frame, [desde, desde + CAMBIO], [0, 1], fijo) : 1;
  const se = sale === undefined ? 1 : interpolate(frame, [sale, sale + CAMBIO], [1, 0], fijo);
  if (frame < desde || entra * se <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x - 6,
        top: y - 2,
        width: (w + 12) * p,
        height: h + 4,
        opacity: entra * se,
        background: claro ? "rgba(255, 196, 0, 0.55)" : "rgba(255, 140, 26, 0.38)",
        mixBlendMode: claro ? "multiply" : "normal",
        borderBottom: claro ? undefined : `4px solid ${COLOR.naranja}`,
        borderRadius: 4,
      }}
    />
  );
};

/** Fotogramas entre que termina de pintarse el resaltador y empieza la traducción, y lo que dura el cambio. */
const ESPERA = 12;
const CAMBIO = 10;
/** Fotograma en que una marca con traducción empieza a cambiar al español. */
const cambio = (desde: number) => desde + 9 + ESPERA;

/**
 * La traducción de una marca, en píxeles de la imagen (va dentro de la imagen y sigue a la cámara). En `T` el inglés
 * se desenfoca y se desvanece sobre su fondo y el español aparece en su lugar, con la letra y el color del original.
 */
const Traduccion: React.FC<{ es: any; T: number; img?: string; W: number; H: number }> = ({ es, T, img, W, H }) => {
  const frame = useCurrentFrame();
  if (frame < T) return null;
  // Cruce corto: el inglés se va en los primeros fotogramas del cambio y el español llega en cuanto empieza a irse.
  const sale = interpolate(frame, [T, T + 7], [0, 1], { ...fijo, easing: Easing.out(Easing.quad) });
  const entra = interpolate(frame, [T + 3, T + CAMBIO + 1], [0, 1], { ...fijo, easing: Easing.out(Easing.quad) });
  // Cada parche lleva el color del fondo en sus dos orillas (un degradado, por si el fondo cambia).
  const cubre = (es.cubre as any[]).map((c) => ({ r: c.r as Rect, fondo: `linear-gradient(90deg, ${c.fondo[0]}, ${c.fondo[1]})` }));
  return (
    <>
      {/* El fondo tapa el inglés; con la imagen, una copia del inglés encima se desenfoca al irse. */}
      {cubre.map(({ r, fondo }, i) => (
        <div key={`f${i}`} style={{ position: "absolute", left: r[0], top: r[1], width: r[2], height: r[3], background: fondo, opacity: img ? 1 : sale }} />
      ))}
      {img &&
        sale < 1 &&
        cubre.map(({ r }, i) => (
          <div key={`c${i}`} style={{ position: "absolute", left: r[0], top: r[1], width: r[2], height: r[3], overflow: "hidden", opacity: 1 - sale, filter: `blur(${sale * 5}px)` }}>
            <Img src={staticFile(img)} style={{ position: "absolute", left: -r[0], top: -r[1], width: W, height: H, maxWidth: "none" }} />
          </div>
        ))}
      <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: entra, filter: entra < 1 ? `blur(${(1 - entra) * 5}px)` : undefined }}>
        {(es.lineas as any[]).map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={l.base + (1 - entra) * 6}
            fill={es.tinta}
            textLength={l.w}
            lengthAdjust="spacing"
            style={{
              textRendering: "geometricPrecision",
              // La letra de la página (si la captura la trae y está instalada) y, si no, la de Windows que se le parece.
              fontFamily: `${es.familia ? `'${es.familia}', ` : ""}${es.serif ? "Georgia, serif" : "'Segoe UI', sans-serif"}`,
              fontSize: es.tam,
              fontWeight: es.peso,
              fontStyle: es.italica ? "italic" : "normal",
              whiteSpace: "pre",
            }}
          >
            {l.t}
          </text>
        ))}
      </svg>
    </>
  );
};

/**
 * Un video que, si lleva `foco`, se congela en el fotograma `k` durante `F` fotogramas y luego sigue donde iba.
 * `desde` en segundos del video.
 */
const VideoFoco: React.FC<{ src: string; desde: number; vel?: number; congela?: { k: number; F: number }; style: React.CSSProperties }> = ({
  src,
  desde,
  vel = 1,
  congela,
  style,
}) => {
  const { fps } = useBeat();
  const s0 = Math.round(desde * fps);
  const video = (inicio: number) => <Metraje src={src} inicio={inicio} vel={vel} style={style} />;
  if (!congela) return video(s0);
  const { k, F } = congela;
  const s1 = s0 + Math.round(k * vel);
  return (
    <>
      <Sequence durationInFrames={Math.max(1, k)} layout="none">
        {video(s0)}
      </Sequence>
      <Sequence from={k} durationInFrames={F} layout="none">
        <Freeze frame={0}>{video(s1)}</Freeze>
      </Sequence>
      <Sequence from={k + F} layout="none">
        {video(s1)}
      </Sequence>
    </>
  );
};

/**
 * El foco: todo se oscurece menos un óvalo o rectángulo redondeado alrededor de algo, que lleva un contorno rojo que
 * se dibuja. En píxeles de la imagen; `esc` es la escala de la cámara (el contorno mide lo mismo en pantalla).
 */
const Foco: React.FC<{ f: any; k: number; F: number; esc: number }> = ({ f, k, F, esc }) => {
  const frame = useCurrentFrame();
  if (frame < k || frame > k + F) return null;
  const o = Math.min(interpolate(frame, [k, k + 5], [0, 1], fijo), interpolate(frame, [k + F - 6, k + F], [1, 0], fijo));
  const trazo = interpolate(frame, [k + 2, k + 14], [0, 1], { ...fijo, easing: Easing.out(Easing.quad) });
  const [x, y, w, h] = f.r as Rect;
  const ovalo = f.forma === "ovalo";
  const radio = ovalo ? 0 : Math.min(w, h) * 0.22;
  const g = 8 / esc;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: w,
          height: h,
          borderRadius: ovalo ? "50%" : radio,
          boxShadow: `0 0 0 20000px rgba(0, 0, 0, ${0.65 * o})`,
        }}
      />
      <svg style={{ position: "absolute", left: x - g, top: y - g, overflow: "visible", opacity: o }} width={w + 2 * g} height={h + 2 * g}>
        {ovalo ? (
          <ellipse cx={w / 2 + g} cy={h / 2 + g} rx={w / 2} ry={h / 2} fill="none" stroke={COLOR.rojo} strokeWidth={g} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - trazo} />
        ) : (
          <rect x={g} y={g} width={w} height={h} rx={radio} fill="none" stroke={COLOR.rojo} strokeWidth={g} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - trazo} />
        )}
      </svg>
    </>
  );
};

/** Fotograma (relativo al beat) de una marca: `f` ya calculado, la palabra `en` o la fracción `t`. */
const fotogramaDe = (b: { inicio: number; fin: number; palabras: { t: string; s: number }[] }, m: any, fps: number) => {
  if (m.f !== undefined) return m.f as number;
  const duracion = Math.round((b.fin - b.inicio) * fps);
  if (!m.en) return Math.round((m.t ?? 0) * duracion);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const i = b.palabras.findIndex((p, k) => k >= (m.desde ?? 0) && norm(p.t).startsWith(norm(m.en)));
  return i < 0 ? Math.round(duracion / 2) : Math.max(0, Math.round((b.palabras[i].s - b.inicio) * fps));
};

/**
 * Encadena los beats de `captura` con `sigue`: el beat sigue en la misma toma que el anterior, como si fuera uno
 * solo. Hereda la forma del marco, empieza con la cámara donde la dejó el anterior, el video sigue en el segundo
 * donde iba y las marcas del anterior siguen ahí, con su animación donde iba (salvo con `limpia`). Se aplica a toda
 * la línea de tiempo.
 */
export const encadena = <B extends { inicio: number; fin: number; palabras: { t: string; s: number }[]; v: Record<string, any> }>(
  beats: B[],
  fps: number
): B[] => {
  const salida: B[] = [];
  beats.forEach((b, i) => {
    const p = salida[i - 1];
    const v = b.v;
    const misma = p && v.tipo === "captura" && v.sigue && p.v.tipo === "captura" && (v.img ?? v.clip) === (p.v.img ?? p.v.clip);
    if (!misma) {
      salida.push(b);
      return;
    }
    const pv = p.v;
    const lleno: Rect = [0, 0, pv.w ?? 1920, pv.h ?? 1080];
    const camara = (pv.camara ?? []) as any[];
    const avance = p.fin - p.inicio - (pv.foco ? pv.foco.dura ?? 1.5 : 0);
    const nv: Record<string, any> = {
      ...v,
      forma: pv.forma ?? pv.vista ?? lleno,
      inicio: camara.length ? camara[camara.length - 1].r : pv.inicio ?? pv.vista ?? lleno,
      claro: v.claro ?? pv.claro,
      fuente: v.fuente ?? pv.fuente,
      maxW: v.maxW ?? pv.maxW,
      maxH: v.maxH ?? pv.maxH,
    };
    if (pv.video && (!v.video || (v.video.src === pv.video.src && v.video.desde === undefined))) {
      nv.video = { ...pv.video, ...v.video, desde: (pv.video.desde ?? 0) + avance };
    }
    if (v.clip && v.desde === undefined) nv.desde = (pv.desde ?? 0) + avance * (pv.velocidad ?? 1);
    if (!v.limpia) {
      // Cada marca heredada guarda su fotograma `f`, contado desde el inicio de este beat (negativo: ya pasó).
      const largo = Math.round((p.fin - p.inicio) * fps);
      const viejas = ((pv.marcas ?? []) as any[]).map((m) => ({ ...m, f: fotogramaDe(p, m, fps) - largo }));
      const igual = (a: any, m: any) => a.tipo === m.tipo && JSON.stringify(a.r) === JSON.stringify(m.r);
      const nuevas = ((v.marcas ?? []) as any[]).filter((m) => !viejas.some((a) => igual(a, m)));
      nv.marcas = [...viejas, ...nuevas];
    }
    salida.push({ ...b, v: nv });
  });
  return salida;
};

/** Una tecla de teclado que se hunde al presionarse. */
const Tecla: React.FC<{ texto: string; desde: number }> = ({ texto, desde }) => {
  const frame = useCurrentFrame();
  const s = useResorte(desde, { damping: 12, stiffness: 220 });
  if (frame < desde) return null;
  const abajo = frame > desde + 6 && frame < desde + 12 ? 10 : 0;
  return (
    <div
      style={{
        minWidth: 150,
        height: 150,
        padding: "0 34px",
        borderRadius: 26,
        background: "linear-gradient(180deg, #f6f6f6, #d4d4d8)",
        boxShadow: `0 ${16 - abajo}px 0 #8b8b95, 0 30px 50px rgba(0,0,0,0.6)`,
        transform: `translateY(${abajo}px) scale(${s})`,
        fontFamily: FUENTE.ui,
        fontWeight: 800,
        fontSize: 80,
        color: "#222",
        ...centro,
      }}
    >
      {texto}
    </div>
  );
};

/**
 * Una captura o un clip original con cámara: arranca mostrando `vista` y se va a cada rectángulo de `camara`
 * cuando la voz dice su palabra; fuera de las tomas la cámara se queda quieta. Las `marcas` (caja o resaltador) se
 * dibujan sobre lo que se está citando, y un resaltador con `es` cambia el inglés por su traducción. `foco` congela
 * el video y oscurece todo menos algo. Todas las coordenadas están en píxeles de la imagen original (los clips miden
 * 1920x1080). Con `sigue`, `encadena` le pasa `forma` (la forma del marco) e `inicio` (dónde empieza la cámara).
 */
export const Captura: React.FC = () => (useFormato().vertical ? <CapturaVertical /> : <CapturaHorizontal />);

const CapturaHorizontal: React.FC = () => {
  const { v, fps } = useBeat();
  const frame = useCurrentFrame();
  const momento = useMomento();
  const esClip = !!v.clip;
  const W: number = esClip ? 1920 : v.w;
  const H: number = esClip ? 1080 : v.h;
  const completo = !!v.completo;
  const vista: Rect = v.vista ?? [0, 0, W, H];
  const forma: Rect = v.forma ?? vista;
  const maxW = completo ? 1920 : v.maxW ?? 1640;
  const maxH = completo ? 1080 : v.maxH ?? 860;
  const e0 = Math.min(maxW / forma[2], maxH / forma[3]);
  const FW = completo ? 1920 : Math.round(forma[2] * e0);
  const FH = completo ? 1080 : Math.round(forma[3] * e0);

  // La cámara: cada toma lleva de la anterior a su rectángulo.
  let r: Rect = v.inicio ?? vista;
  for (const c of (v.camara ?? []) as any[]) {
    const k = momento(c);
    if (frame < k) break;
    const p = interpolate(frame, [k, k + (c.dura ?? 14)], [0, 1], { ...fijo, easing: Easing.inOut(Easing.cubic) });
    r = mezcla(r, c.r, p);
  }
  const k = Math.min(FW / r[2], FH / r[3]);
  const ajusta = (centroR: number, largo: number, F: number) => {
    const t = F / 2 - centroR * k;
    return largo * k >= F ? Math.min(0, Math.max(F - largo * k, t)) : (F - largo * k) / 2;
  };
  const tx = ajusta(r[0] + r[2] / 2, W, FW);
  const ty = ajusta(r[1] + r[3] / 2, H, FH);
  const pant = (m: Rect) => ({ x: m[0] * k + tx, y: m[1] * k + ty, w: m[2] * k, h: m[3] * k });

  // El foco congela el video de encima (`video`) o, si no hay, el clip.
  const foco = v.foco ? { k: momento(v.foco), F: Math.round((v.foco.dura ?? 1.5) * fps) } : undefined;
  const cuando = (m: any) => (m.f !== undefined ? (m.f as number) : momento(m));
  const traducciones = ((v.marcas ?? []) as any[]).filter((m) => m.es);

  const base = (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transform: `translate(${tx}px, ${ty}px) scale(${k})`, transformOrigin: "0 0" }}>
      {esClip ? (
        <VideoFoco src={v.clip} desde={v.desde ?? 0} vel={v.velocidad ?? 1} congela={v.video ? undefined : foco} style={{ width: W, height: H }} />
      ) : (
        <Img src={staticFile(v.img)} style={{ width: W, height: H, display: "block" }} />
      )}
      {v.video && (
        <div style={{ position: "absolute", left: v.video.r[0], top: v.video.r[1], width: v.video.r[2], height: v.video.r[3], overflow: "hidden", borderRadius: 18, background: "#000" }}>
          <VideoFoco src={v.video.src} desde={v.video.desde ?? 0} congela={foco} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      )}
      {traducciones.map((m, i) => (
        <Traduccion key={i} es={m.es} T={cambio(cuando(m))} img={esClip ? undefined : v.img} W={W} H={H} />
      ))}
      {foco && <Foco f={v.foco} k={foco.k} F={foco.F} esc={k} />}
    </div>
  );

  // Las marcas de una traducción (la primera lleva `es`, las de sus otros renglones `parte`) se desvanecen al
  // cambiar, y el resaltador del español aparece en los renglones de la traducción.
  let T: number | undefined;
  const marcas = ((v.marcas ?? []) as any[]).flatMap((m, i) => {
    const desde = cuando(m);
    if (m.es) T = cambio(desde);
    else if (!m.parte) T = undefined;
    const p = pant(m.r);
    if (m.tipo !== "marcador") {
      return [<Caja key={i} x={p.x - 8} y={p.y - 8} w={p.w + 16} h={p.h + 16} desde={desde} color={m.color ?? COLOR.rojo} grosor={8} />];
    }
    const sale = m.es || m.parte ? T : undefined;
    return [
      <Marcador key={i} {...p} desde={desde} claro={v.claro} sale={sale} />,
      ...(m.es ? (m.es.lineas as any[]) : []).map((l, j) => <Marcador key={`${i}-${j}`} {...pant(l.r)} desde={T!} claro={v.claro} aparece />),
    ];
  });

  const marco = (
    <div
      style={{
        position: "relative",
        width: FW,
        height: FH,
        overflow: "hidden",
        borderRadius: completo ? 0 : 18,
        background: v.claro ? "#ffffff" : "#0d1117",
        border: completo ? undefined : "3px solid #2c2c33",
      }}
    >
      {base}
      {marcas}
    </div>
  );

  const sacudida = useSacudida(v.sello ? momento(v.sello) : -100, 16, 10);
  const aparece = v.sigue ? 1 : interpolate(frame, [6, 12], [0, 1], fijo);
  const imagen = (
    <Lleno style={{ ...centro, transform: sacudida }}>
      {completo ? marco : <Tarjeta rot={v.rot ?? 0} desde={v.sigue ? -30 : 0}>{marco}</Tarjeta>}
    </Lleno>
  );
  const extra = v.extra && <Extra e={v.extra} desde={momento(v.extra)} />;
  return (
    <AbsoluteFill>
      {imagen}
      {v.fuente && (
        <div
          style={{
            position: "absolute",
            left: completo ? 50 : (1920 - FW) / 2,
            top: completo ? undefined : (1080 + FH) / 2 + 22,
            bottom: completo ? 40 : undefined,
            fontFamily: FUENTE.codigo,
            fontSize: 28,
            color: "#c9c9d1",
            background: "rgba(0,0,0,0.7)",
            padding: "6px 16px",
            borderRadius: 10,
            opacity: aparece,
          }}
        >
          ↗ {v.fuente}
        </div>
      )}
      {v.etiqueta && (
        <div
          style={{
            position: "absolute",
            left: 70,
            top: 46,
            fontFamily: FUENTE.ui,
            fontWeight: 800,
            fontSize: 40,
            color: "white",
            background: "rgba(0,0,0,0.78)",
            padding: "10px 26px",
            borderRadius: 12,
            transform: `translateX(${v.sigue ? 0 : interpolate(frame, [4, 14], [-700, 0], fijo)}px)`,
          }}
        >
          {v.etiqueta}
        </div>
      )}
      {extra}
      {v.teclas && (
        <Lleno style={{ ...centro, alignItems: "flex-end", paddingBottom: 110, gap: 40 }}>
          {(v.teclas.textos as string[]).map((t, i) => (
            <Tecla key={t} texto={t} desde={momento(v.teclas) + i * 5} />
          ))}
        </Lleno>
      )}
      {((v.emojis ?? []) as any[]).map((e, i) => (
        <Emoji key={i} src={e.src} tam={e.tam ?? 200} desde={momento(e)} x={e.x ?? 1700} y={e.y ?? 820} rot={e.rot ?? 10} />
      ))}
      {v.sello && (
        <Lleno style={{ ...centro, alignItems: v.sello.arriba ? "flex-start" : "center", paddingTop: v.sello.arriba ? 60 : 0 }}>
          <Sello texto={v.sello.texto} desde={momento(v.sello)} tam={v.sello.tam ?? 150} rot={v.sello.rot ?? -9} color={v.sello.color ?? COLOR.amarillo} />
        </Lleno>
      )}
      {v.texto && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 70, ...centro }}>
          <div style={{ transform: `scale(${useResorte(momento(v.texto))})` }}>
            <TextoMeme texto={v.texto.texto} tam={v.texto.tam ?? 76} rojo={v.texto.rojo} />
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

/**
 * La captura en vertical: sin marco, a lo ancho de la zona de contenido. Cada rectángulo de cámara (`vista`,
 * `inicio` y cada `toma`) pasa por `encuadre` (ver `encuadre.ts`): el texto cabe a lo ancho y se acerca a lo citado
 * sin cortar renglones; un video llena la zona centrado en su foco. Las marcas, traducciones y focos son los mismos
 * de la captura horizontal y siguen a la cámara. Lo de encima (fuente, etiqueta, sello, extra...) se acomoda a la zona.
 */
const CapturaVertical: React.FC = () => {
  const { v, fps } = useBeat();
  const { W: ZW, H: ZH } = useFormato();
  const frame = useCurrentFrame();
  const momento = useMomento();
  const esClip = !!v.clip;
  const W: number = esClip ? 1920 : v.w;
  const H: number = esClip ? 1080 : v.h;
  const vista: Rect = v.vista ?? [0, 0, W, H];
  const ctx: Contexto = {
    W,
    H,
    ZW,
    ZH,
    esClip,
    video: v.video?.r,
    importantes: [...((v.citas?.imp ?? []) as Rect[]), ...(v.importante ? [v.importante as Rect] : [])],
    textos: (v.citas?.txt ?? []) as Rect[],
    lineas: esClip ? [] : RENGLONES[v.img] ?? [],
    foco: v.foco?.r,
    modo: v.encuadre,
  };

  // La cámara: cada toma lleva del encuadre anterior al suyo.
  let r: Rect = encuadre(v.inicio ?? vista, ctx);
  for (const c of (v.camara ?? []) as any[]) {
    const kk = momento(c);
    if (frame < kk) break;
    const p = interpolate(frame, [kk, kk + (c.dura ?? 14)], [0, 1], { ...fijo, easing: Easing.inOut(Easing.cubic) });
    r = mezcla(r, encuadre(c.r, ctx), p);
  }
  const k = Math.min(ZW / r[2], ZH / r[3]);
  const ajusta = (centroR: number, largo: number, F: number) => {
    const t = F / 2 - centroR * k;
    return largo * k >= F ? Math.min(0, Math.max(F - largo * k, t)) : (F - largo * k) / 2;
  };
  const tx = ajusta(r[0] + r[2] / 2, W, ZW);
  const ty = ajusta(r[1] + r[3] / 2, H, ZH);
  const pant = (m: Rect) => ({ x: m[0] * k + tx, y: m[1] * k + ty, w: m[2] * k, h: m[3] * k });

  const foco = v.foco ? { k: momento(v.foco), F: Math.round((v.foco.dura ?? 1.5) * fps) } : undefined;
  const cuando = (m: any) => (m.f !== undefined ? (m.f as number) : momento(m));
  const traducciones = ((v.marcas ?? []) as any[]).filter((m) => m.es);
  const enVideo = esClip || esVideo(r, ctx);

  const base = (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: W,
        height: H,
        transform: `translate(${tx}px, ${ty}px) scale(${k})`,
        transformOrigin: "0 0",
        borderRadius: esClip ? 0 : 14 / k,
        overflow: "hidden",
        boxShadow: esClip ? undefined : "0 20px 60px rgba(0,0,0,0.6)",
        background: v.claro ? "#ffffff" : "#0d1117",
      }}
    >
      {esClip ? (
        <VideoFoco src={v.clip} desde={v.desde ?? 0} vel={v.velocidad ?? 1} congela={v.video ? undefined : foco} style={{ width: W, height: H }} />
      ) : (
        <Img src={staticFile(v.img)} style={{ width: W, height: H, display: "block" }} />
      )}
      {v.video && (
        <div style={{ position: "absolute", left: v.video.r[0], top: v.video.r[1], width: v.video.r[2], height: v.video.r[3], overflow: "hidden", borderRadius: 18, background: "#000" }}>
          <VideoFoco src={v.video.src} desde={v.video.desde ?? 0} congela={foco} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      )}
      {traducciones.map((m, i) => (
        <Traduccion key={i} es={m.es} T={cambio(cuando(m))} img={esClip ? undefined : v.img} W={W} H={H} />
      ))}
      {foco && <Foco f={v.foco} k={foco.k} F={foco.F} esc={k} />}
    </div>
  );

  let T: number | undefined;
  const marcas = ((v.marcas ?? []) as any[]).flatMap((m, i) => {
    const desde = cuando(m);
    if (m.es) T = cambio(desde);
    else if (!m.parte) T = undefined;
    const p = pant(m.r);
    if (m.tipo !== "marcador") {
      return [<Caja key={i} x={p.x - 8} y={p.y - 8} w={p.w + 16} h={p.h + 16} desde={desde} color={m.color ?? COLOR.rojo} grosor={7} />];
    }
    const sale = m.es || m.parte ? T : undefined;
    return [
      <Marcador key={i} {...p} desde={desde} claro={v.claro} sale={sale} />,
      ...(m.es ? (m.es.lineas as any[]) : []).map((l, j) => <Marcador key={`${i}-${j}`} {...pant(l.r)} desde={T!} claro={v.claro} aparece />),
    ];
  });

  // Si una imagen de texto sigue más allá de la zona, sus orillas de arriba y abajo se desvanecen: así un renglón
  // partido por el borde no se ve rebanado. En un video no hace falta.
  // Igual a los lados, más corto: un pedazo de palabra en la orilla se desvanece en vez de quedar suelto.
  const arriba = !enVideo && ty < -1;
  const abajo = !enVideo && ty + H * k > ZH + 1;
  const izq = !enVideo && tx < -1;
  const der = !enVideo && tx + W * k > ZW + 1;
  const desvanece = (dir: string, a: boolean, b: boolean, o: number) =>
    `linear-gradient(${dir}, ${a ? `transparent 0px, black ${o}px` : "black 0px"}, ${b ? `black calc(100% - ${o}px), transparent 100%` : "black 100%"})`;
  const mascara = arriba || abajo || izq || der ? `${desvanece("180deg", arriba, abajo, 44)}, ${desvanece("90deg", izq, der, 30)}` : undefined;

  const sacudida = useSacudida(v.sello ? momento(v.sello) : -100, 12, 10);
  const aparece = v.sigue ? 1 : interpolate(frame, [0, 7], [0, 1], fijo);
  const resorteTexto = useResorte(v.texto ? momento(v.texto) : 0);
  const chip: React.CSSProperties = { position: "absolute", color: "white", background: "rgba(0,0,0,0.72)", borderRadius: 10, opacity: aparece };
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: `${sacudida} translateY(${(1 - aparece) * 60}px)`,
          opacity: aparece,
          WebkitMaskImage: mascara,
          maskImage: mascara,
          WebkitMaskComposite: "source-in",
          maskComposite: "intersect",
        }}
      >
        {base}
        {marcas}
      </AbsoluteFill>
      {v.fuente && <div style={{ ...chip, left: 18, bottom: 12, fontFamily: FUENTE.codigo, fontSize: 24, color: "#c9c9d1", padding: "5px 14px" }}>↗ {v.fuente}</div>}
      {v.etiqueta && (
        <div
          style={{
            ...chip,
            left: 18,
            top: 14,
            fontFamily: FUENTE.ui,
            fontWeight: 800,
            fontSize: 32,
            padding: "8px 20px",
            transform: `translateX(${v.sigue ? 0 : interpolate(frame, [4, 14], [-700, 0], fijo)}px)`,
          }}
        >
          {v.etiqueta}
        </div>
      )}
      {v.extra && <Extra e={v.extra} desde={momento(v.extra)} ancho={ZW - 60} derecha={30} abajo={70} />}
      {v.teclas && (
        <Lleno style={{ ...centro, alignItems: "flex-end", paddingBottom: 80, gap: 30, transform: "scale(0.75)" }}>
          {(v.teclas.textos as string[]).map((t, i) => (
            <Tecla key={t} texto={t} desde={momento(v.teclas) + i * 5} />
          ))}
        </Lleno>
      )}
      {((v.emojis ?? []) as any[]).map((e, i) => (
        <Emoji key={i} src={e.src} tam={(e.tam ?? 200) * 0.8} desde={momento(e)} x={((e.x ?? 1700) * ZW) / 1920} y={((e.y ?? 820) * ZH) / 1080} rot={e.rot ?? 10} />
      ))}
      {/* Un sello `arriba` taparía el encabezado de la captura, que en vertical llena la zona: va abajo. */}
      {v.sello && (
        <Lleno style={{ ...centro, alignItems: v.sello.arriba ? "flex-end" : "center", paddingBottom: v.sello.arriba ? 110 : 0 }}>
          <Sello
            texto={v.sello.texto}
            desde={momento(v.sello)}
            tam={(v.sello.tam ?? 150) * 0.8}
            rot={v.sello.rot ?? -9}
            color={v.sello.color ?? COLOR.amarillo}
            style={{ background: "rgba(0,0,0,0.78)" }}
          />
        </Lleno>
      )}
      {v.texto && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 60, ...centro }}>
          <div style={{ transform: `scale(${resorteTexto})` }}>
            <TextoMeme texto={v.texto.texto} tam={(v.texto.tam ?? 76) * 0.85} rojo={v.texto.rojo} />
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

/** Una segunda captura que entra por abajo a la derecha, encima de la principal. */
const Extra: React.FC<{ e: any; desde: number; ancho?: number; derecha?: number; abajo?: number }> = ({ e, desde, ancho: a, derecha, abajo }) => {
  const ancho = a ?? e.ancho ?? 1100;
  const r: Rect = e.recorte ?? [0, 0, e.w, e.h];
  const esc = ancho / r[2];
  return (
    <div style={{ position: "absolute", right: derecha ?? e.derecha ?? 90, bottom: abajo ?? e.abajo ?? 80 }}>
      <Tarjeta desde={desde} rot={e.rot ?? 2}>
        <div style={{ width: ancho, height: r[3] * esc, overflow: "hidden", borderRadius: 14, border: "4px solid white", position: "relative", background: "#111" }}>
          <Img src={staticFile(e.img)} style={{ position: "absolute", left: -r[0] * esc, top: -r[1] * esc, width: e.w * esc, height: e.h * esc }} />
        </div>
      </Tarjeta>
    </div>
  );
};

/** Una imagen o clip recortado a un rectángulo, del tamaño de la tarjeta. */
const Recuadro: React.FC<{ it: any; W: number; H: number }> = ({ it, W, H }) => {
  const { fps } = useBeat();
  if (it.clip || it.video) {
    const r: Rect = it.recorte ?? [0, 0, 1920, 1080];
    const esc = Math.max(W / r[2], H / r[3]);
    return (
      <div style={{ position: "absolute", left: -r[0] * esc + (W - r[2] * esc) / 2, top: -r[1] * esc + (H - r[3] * esc) / 2, width: 1920 * esc, height: 1080 * esc }}>
        <Metraje src={it.clip ?? it.video} inicio={Math.round((it.desde ?? 0) * fps)} style={{ width: "100%", height: "100%" }} />
      </div>
    );
  }
  // Una captura se ve entera (con bandas si no tiene la forma de la tarjeta): así no se corta su texto.
  const r: Rect = it.recorte ?? [0, 0, it.w, it.h];
  const esc = Math.min(W / r[2], H / r[3]);
  return <Img src={staticFile(it.img)} style={{ position: "absolute", left: -r[0] * esc + (W - r[2] * esc) / 2, top: -r[1] * esc + (H - r[3] * esc) / 2, width: it.w * esc, height: it.h * esc }} />;
};

/** Tarjetas con material original (capturas o clips) que entran una por una, con su rótulo. */
export const Tarjetas: React.FC = () => (useFormato().vertical ? <TarjetasVertical /> : <TarjetasHorizontal />);

/**
 * En vertical: una o dos tarjetas en columna, a lo ancho; tres o cuatro en una rejilla de 2 columnas (la tercera,
 * centrada abajo). El título arriba. Cada tarjeta es tan grande como cabe en la zona.
 */
const TarjetasVertical: React.FC = () => {
  const { v, duracion } = useBeat();
  const { W, H } = useFormato();
  const momento = useMomento();
  const items: any[] = v.items;
  const n = items.length;
  const ya = v.ya ?? 0;
  const tituloH = v.titulo ? 120 : 0;
  const barra = items.some((it) => it.texto) ? 70 : 0;
  const gap = 34;
  const cols = n >= 3 ? 2 : 1;
  const filas = Math.ceil(n / cols);
  const altoMax = (H - tituloH - 50 - gap * (filas - 1)) / filas;
  let cw = cols === 1 ? W - 80 : (W - 40 - gap) / 2;
  let ch = (cw * 9) / 16;
  if (ch + barra > altoMax) {
    ch = altoMax - barra;
    cw = (ch * 16) / 9;
  }
  const alto = ch + barra;
  const y0 = tituloH + (H - tituloH - (filas * alto + (filas - 1) * gap)) / 2;
  const pos = (i: number): [number, number] => {
    const fila = Math.floor(i / cols);
    const enFila = Math.min(cols, n - fila * cols);
    const col = i % cols;
    return [W / 2 + (col - (enFila - 1) / 2) * (cw + gap), y0 + fila * (alto + gap) + alto / 2];
  };
  return (
    <Camara>
      {v.titulo && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 26, ...centro }}>
          <Rotulo texto={v.titulo} color="crema" tam={Math.min(92, Math.floor((W - 80) / (String(v.titulo).length * 0.5)))} />
        </div>
      )}
      {items.map((it, i) => {
        const desde = i < ya ? -30 : it.en || it.t !== undefined ? momento(it) : Math.round(4 + ((i - ya) * duracion * 0.5) / Math.max(1, n - ya));
        const [x, y] = pos(i);
        return (
          <div key={i} style={{ position: "absolute", left: x - cw / 2, top: y - alto / 2 }}>
            <Tarjeta desde={desde} rot={i % 2 ? 1.5 : -1.5}>
              <div style={{ width: cw, height: alto, borderRadius: 16, overflow: "hidden", position: "relative", border: "4px solid #2c2c33", background: "#111" }}>
                <div style={{ position: "relative", width: cw, height: ch, overflow: "hidden" }}>
                  <Recuadro it={it} W={cw} H={ch} />
                </div>
                {it.texto && (
                  <div style={{ height: barra, display: "flex", alignItems: "center", paddingLeft: 16 }}>
                    <TextoMeme texto={it.texto} tam={it.tam ?? (cols === 2 ? 44 : 52)} rojo={it.rojo} />
                  </div>
                )}
              </div>
            </Tarjeta>
          </div>
        );
      })}
    </Camara>
  );
};

const TarjetasHorizontal: React.FC = () => {
  const { v, duracion } = useBeat();
  const momento = useMomento();
  const items: any[] = v.items;
  const n = items.length;
  const ya = v.ya ?? 0;
  const conTitulo = !!v.titulo;
  // El material va en 16:9 y el rótulo en una barra debajo, para que no tape lo que muestra la tarjeta.
  const [cw, ch] = n === 1 ? [1000, 562] : n === 2 ? [820, 461] : n === 3 ? [580, 326] : conTitulo ? [560, 315] : [680, 382];
  const barra = items.some((it) => it.texto) ? (n >= 3 ? 64 : 76) : 0;
  const alto = ch + barra;
  const pos = (i: number): [number, number] => {
    if (n <= 2) return [960 + (i - (n - 1) / 2) * 900, conTitulo ? 610 : 540];
    if (n === 3) return [960 + (i - 1) * 615, conTitulo ? 620 : 540];
    const arriba = conTitulo ? 215 : 80;
    return [960 + ((i % 2) - 0.5) * (cw + 60), arriba + alto / 2 + Math.floor(i / 2) * (alto + 30)];
  };
  return (
    <Camara>
      {conTitulo && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 60, ...centro }}>
          <Rotulo texto={v.titulo} color="crema" tam={120} />
        </div>
      )}
      {items.map((it, i) => {
        const desde = i < ya ? -30 : it.en || it.t !== undefined ? momento(it) : Math.round(4 + ((i - ya) * duracion * 0.5) / Math.max(1, n - ya));
        const [x, y] = pos(i);
        return (
          <div key={i} style={{ position: "absolute", left: x - cw / 2, top: y - alto / 2 }}>
            <Tarjeta desde={desde} rot={i % 2 ? 2 : -2}>
              <div style={{ width: cw, height: alto, borderRadius: 18, overflow: "hidden", position: "relative", border: "4px solid #2c2c33", background: "#111" }}>
                <div style={{ position: "relative", width: cw, height: ch, overflow: "hidden" }}>
                  <Recuadro it={it} W={cw} H={ch} />
                </div>
                {it.texto && (
                  <div style={{ height: barra, display: "flex", alignItems: "center", paddingLeft: 18 }}>
                    <TextoMeme texto={it.texto} tam={it.tam ?? (n >= 3 ? 48 : 58)} rojo={it.rojo} />
                  </div>
                )}
              </div>
            </Tarjeta>
          </div>
        );
      })}
    </Camara>
  );
};

/** Dos contendientes lado a lado, con sus números reales, y un sello con la conclusión. */
export const Duelo: React.FC = () => (useFormato().vertical ? <DueloVertical /> : <DueloHorizontal />);

/** En vertical: un contendiente arriba del otro (avatar y nombre a la izquierda, sus cifras a la derecha) y el sello abajo. */
const DueloVertical: React.FC = () => {
  const { v } = useBeat();
  const { W } = useFormato();
  const frame = useCurrentFrame();
  const momento = useMomento();
  const lado = (d: any, i: number) => {
    const s = interpolate(frame, [i * 5, i * 5 + 10], [0, 1], { ...fijo, easing: Easing.out(Easing.back(1.4)) });
    return (
      <div
        style={{
          width: W - 70,
          boxSizing: "border-box",
          background: "#16161c",
          border: `4px solid ${d.color}`,
          borderRadius: 26,
          padding: "34px 38px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          transform: `translateX(${(1 - s) * (i ? 900 : -900)}px)`,
          opacity: s,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Img src={staticFile(d.img)} style={{ width: 140, height: 140, borderRadius: 70, background: "white", flexShrink: 0 }} />
          <div style={{ fontFamily: FUENTE.ui, fontWeight: 800, fontSize: 50, color: "white", lineHeight: 1.1, whiteSpace: "pre-line" }}>{d.nombre}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          {(d.filas as any[]).map((f, j) => {
            const marcada = v.marcar && momento((d.filas.length === 1 ? v.marcar[i] : v.marcar[j]) ?? { t: 2 }) <= frame;
            return (
              <div key={j} style={{ padding: "6px 16px", borderRadius: 14, background: marcada ? "rgba(255,140,26,0.25)" : "transparent", textAlign: "right" }}>
                <div style={{ fontFamily: FUENTE.ui, fontSize: 34, color: COLOR.gris }}>{f.etiqueta}</div>
                <div style={{ fontFamily: FUENTE.codigo, fontWeight: 700, fontSize: 88, lineHeight: 1.05, whiteSpace: "nowrap", color: f.color ?? "white" }}>{f.valor}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  const tamSello = v.sello ? Math.min(v.sello.tam ?? 130, Math.floor((W - 140) / (String(v.sello.texto).length * 0.5 + 0.6))) : 0;
  return (
    <Camara>
      <Lleno style={{ ...centro, flexDirection: "column", gap: 18 }}>
        {lado(v.izq, 0)}
        <div style={{ fontFamily: FUENTE.titulo, fontSize: 110, lineHeight: 1, color: COLOR.crema }}>VS</div>
        {lado(v.der, 1)}
        {v.sello && (
          <div style={{ marginTop: 40, height: tamSello * 1.3, ...centro }}>
            <Sello texto={v.sello.texto} desde={momento(v.sello)} tam={tamSello} rot={-6} color={COLOR.verde} />
          </div>
        )}
      </Lleno>
    </Camara>
  );
};

const DueloHorizontal: React.FC = () => {
  const { v } = useBeat();
  const frame = useCurrentFrame();
  const momento = useMomento();
  const lado = (d: any, i: number) => {
    const s = interpolate(frame, [i * 5, i * 5 + 10], [0, 1], { ...fijo, easing: Easing.out(Easing.back(1.4)) });
    return (
      <div style={{ width: 720, background: "#16161c", border: `4px solid ${d.color}`, borderRadius: 28, padding: "34px 46px", transform: `translateY(${(1 - s) * 400}px)`, opacity: s }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <Img src={staticFile(d.img)} style={{ width: 120, height: 120, borderRadius: 60, background: "white" }} />
          <div style={{ fontFamily: FUENTE.ui, fontWeight: 800, fontSize: 52, color: "white", lineHeight: 1.1 }}>{d.nombre}</div>
        </div>
        {(d.filas as any[]).map((f, j) => {
          const marcada = v.marcar && momento(v.marcar[j] ?? { t: 2 }) <= frame;
          return (
            <div key={j} style={{ marginTop: 22, padding: "8px 18px", borderRadius: 14, background: marcada ? "rgba(255,140,26,0.25)" : "transparent" }}>
              <div style={{ fontFamily: FUENTE.ui, fontSize: 34, color: COLOR.gris }}>{f.etiqueta}</div>
              <div style={{ fontFamily: FUENTE.codigo, fontWeight: 700, fontSize: 84, color: f.color ?? "white" }}>{f.valor}</div>
            </div>
          );
        })}
      </div>
    );
  };
  return (
    <Camara>
      <Lleno style={{ ...centro, gap: 170, paddingBottom: 150 }}>
        {lado(v.izq, 0)}
        {lado(v.der, 1)}
      </Lleno>
      <div style={{ position: "absolute", left: 0, right: 0, top: 380, textAlign: "center", fontFamily: FUENTE.titulo, fontSize: 90, color: COLOR.crema }}>VS</div>
      {v.sello && (
        <Lleno style={{ ...centro, alignItems: "flex-end", paddingBottom: 80 }}>
          <Sello texto={v.sello.texto} desde={momento(v.sello)} tam={v.sello.tam ?? 230} rot={-8} color={COLOR.verde} />
        </Lleno>
      )}
    </Camara>
  );
};
