// Las pruebas, rehechas en limpio: la prueba corta (logo, fuente y la frase con su dato subrayado), el calendario de
// mesa que arranca sus hojas, las barras que comparan y la tarjeta del cierre (la cuenta o el canal al que invita el
// video, en su red). El texto citado es el original, palabra por palabra; lo que se resalta se marca cuando la voz lo dice.
import React from "react";
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { Red } from "../marca";
import { AZUL, LETRA, MONO } from "../tema";
import { Glifo, type NombreIcono } from "./iconos";
import { Contador, Resaltado, Subrayado, sujeta, suave, useColores } from "./ui";

/**
 * Texto con tramos marcados: ["texto normal", { t: "lo resaltado", en: cuadro }, …]. Con `subraya`, en vez del
 * marcador lleva el subrayado rojo a mano: el dato exacto que prueba lo que dice la voz.
 */
export type Partes = (string | { t: string; en: number; color?: string; subraya?: boolean })[];
const Texto: React.FC<{ partes: Partes }> = ({ partes }) => (
  <>
    {partes.map((p, i) =>
      typeof p === "string" ? (
        <span key={i}>{p}</span>
      ) : p.subraya ? (
        <Subrayado key={i} en={p.en}>
          {p.t}
        </Subrayado>
      ) : (
        <Resaltado key={i} en={p.en} color={p.color}>
          {p.t}
        </Resaltado>
      ),
    )}
  </>
);

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const DIAS = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];

/** Una hoja del calendario de mesa: el mes en rojo con los agujeros de las argollas, el día grande y su nombre. */
const Hoja: React.FC<{ iso: string; ancho: number; alto: number }> = ({ iso, ancho: W, alto: H }) => {
  const [anio, mes, dia] = iso.split("-").map(Number);
  const semana = DIAS[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()];
  return (
    <div style={{ position: "absolute", inset: 0, borderRadius: W * 0.09, overflow: "hidden", background: "linear-gradient(180deg, #ffffff 0%, #f6f4ef 100%)", fontFamily: LETRA }}>
      <div
        style={{
          height: H * 0.27,
          background: "linear-gradient(180deg, #ff6461 0%, #e5484d 58%, #c9383d 100%)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: W * 0.03,
          paddingBottom: H * 0.045,
          color: "#fff",
          fontSize: W * 0.082,
          fontWeight: 800,
          letterSpacing: "0.08em",
          boxSizing: "border-box",
        }}
      >
        {MESES[mes - 1]}
        <span style={{ fontWeight: 600, opacity: 0.78 }}>{anio}</span>
      </div>
      {/* Los agujeros de las argollas y la sombra que deja la banda roja sobre el papel. */}
      {[0.25, 0.75].map((x) => (
        <div key={x} style={{ position: "absolute", left: W * x - W * 0.035, top: H * 0.05, width: W * 0.07, height: W * 0.035, borderRadius: W, background: "rgba(60,0,0,0.45)", boxShadow: "inset 0 2px 3px rgba(0,0,0,0.5)" }} />
      ))}
      <div style={{ height: H * 0.05, background: "linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0))" }} />
      <div style={{ textAlign: "center", color: "#1c1c1e", fontSize: W * 0.44, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", marginTop: H * 0.02 }}>{dia}</div>
      <div style={{ textAlign: "center", color: "#8e8e93", fontSize: W * 0.07, fontWeight: 700, letterSpacing: "0.12em", marginTop: H * 0.04 }}>{semana}</div>
    </div>
  );
};

/**
 * El calendario de mesa, hecho con cuidado: hojas de papel con su grosor, dos argollas de metal,
 * el mes en rojo, el día grande y su nombre. En cada fecha de la lista la hoja de arriba se arranca: gira hacia arriba
 * sobre las argollas, se oscurece y se va, y deja ver la siguiente con la sombra que le hacía.
 */
export const Calendario: React.FC<{ fechas: [number, string][]; ancho?: number }> = ({ fechas, ancho: W = 280 }) => {
  const f = useCurrentFrame();
  const H = W * 1.08;
  const i = Math.max(0, fechas.findLastIndex(([en]) => en <= f));
  const vuela = i > 0 ? interpolate(f, [fechas[i][0], fechas[i][0] + 9], [0, 1], { ...sujeta, easing: Easing.in(Easing.quad) }) : 1;
  const argolla = (x: number) => (
    <div
      key={x}
      style={{
        position: "absolute",
        left: W * x - W * 0.026,
        top: -W * 0.075,
        width: W * 0.052,
        height: W * 0.17,
        borderRadius: W * 0.03,
        background: "linear-gradient(90deg, #7d7d7d 0%, #f4f4f4 38%, #c2c2c2 62%, #6a6a6a 100%)",
        boxShadow: "0 3px 5px rgba(0,0,0,0.45)",
      }}
    />
  );
  return (
    <div style={{ position: "relative", width: W, height: H + W * 0.06, perspective: W * 4 }}>
      {/* El grosor del bloque de hojas. */}
      <div style={{ position: "absolute", left: W * 0.04, right: W * 0.04, top: W * 0.06, height: H, borderRadius: W * 0.09, background: "#cfccc6", boxShadow: "0 30px 60px rgba(0,0,0,0.35)" }} />
      <div style={{ position: "absolute", left: W * 0.02, right: W * 0.02, top: W * 0.03, height: H, borderRadius: W * 0.09, background: "#e4e1db" }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, boxShadow: "0 6px 14px rgba(0,0,0,0.18)", borderRadius: W * 0.09 }}>
        <Hoja iso={fechas[i][1]} ancho={W} alto={H} />
        {vuela < 1 ? <div style={{ position: "absolute", inset: 0, borderRadius: W * 0.09, background: "linear-gradient(180deg, rgba(0,0,0,0.3), rgba(0,0,0,0) 70%)", opacity: 1 - vuela }} /> : null}
      </div>
      {vuela < 1 ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: W,
            height: H,
            transformOrigin: "50% 0%",
            transform: `rotateX(${vuela * 110}deg) rotateZ(${-vuela * 5}deg)`,
            backfaceVisibility: "hidden",
            filter: `brightness(${1 - vuela * 0.35})`,
            opacity: 1 - interpolate(vuela, [0.7, 1], [0, 1], sujeta),
          }}
        >
          <Hoja iso={fechas[i - 1][1]} ancho={W} alto={H} />
        </div>
      ) : null}
      {argolla(0.25)}
      {argolla(0.75)}
    </div>
  );
};

/** Barras que comparan dos o más cifras; cada una crece en su cuadro y su número corre con ella. */
export const Barras: React.FC<{
  filas: { etiqueta: React.ReactNode; valor: number; color: string; en: number; texto?: (v: number) => string }[];
  ancho?: number;
  max?: number;
}> = ({ filas, ancho = 820, max }) => {
  const f = useCurrentFrame();
  const c = useColores();
  const tope = max ?? Math.max(...filas.map((x) => x.valor));
  return (
    <div style={{ width: ancho, fontFamily: LETRA, color: c.texto, display: "flex", flexDirection: "column", gap: 26 }}>
      {filas.map((fila, k) => {
        const p = interpolate(f, [fila.en, fila.en + 14], [0, 1], { ...sujeta, easing: suave });
        if (p <= 0) return <div key={k} style={{ height: 136 }} />;
        const v = fila.valor * p;
        return (
          <div key={k} style={{ opacity: Math.min(1, p * 3) }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 38, fontWeight: 700, marginBottom: 12 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>{fila.etiqueta}</span>
              <span style={{ fontFamily: MONO, color: fila.color }}>{fila.texto ? fila.texto(v) : v.toFixed(1)}</span>
            </div>
            <div style={{ height: 76, borderRadius: 14, background: c.tarjeta2, border: `2px solid ${c.borde}`, overflow: "hidden" }}>
              <div style={{ width: `${(v / tope) * 100}%`, height: "100%", background: fila.color, borderRadius: 10 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Un número grande con su etiqueta, que corre entre dos valores. */
export const Cifra: React.FC<{
  de: number;
  a: number;
  desde: number;
  hasta: number;
  etiqueta?: string;
  color?: string;
  decimales?: number;
  prefijo?: string;
  sufijo?: string;
  tam?: number;
}> = ({ de, a, desde, hasta, etiqueta, color, decimales = 0, prefijo, sufijo, tam = 150 }) => {
  const c = useColores();
  return (
    <div style={{ textAlign: "center", fontFamily: LETRA, color: color ?? c.texto }}>
      <div style={{ fontSize: tam, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em" }}>
        <Contador de={de} a={a} desde={desde} hasta={hasta} decimales={decimales} prefijo={prefijo} sufijo={sufijo} />
      </div>
      {etiqueta ? <div style={{ fontSize: 38, fontWeight: 600, color: c.tenue, marginTop: 10 }}>{etiqueta}</div> : null}
    </div>
  );
};

/**
 * Cómo se ve la tarjeta del cierre en cada red: sus colores, el logo, qué dice debajo del nombre y el botón antes y
 * después de pulsarlo. `web` es una página propia; `ninguna` no tiene tarjeta.
 */
const REDES: Record<Exclude<Red, "ninguna">, { logo: NombreIcono; banda: string; fondo: string; tenue: string; sub: string; boton: [string, string]; color: [string, string]; letra?: string }> = {
  telegram: { logo: "TelegramLogo", banda: "linear-gradient(135deg, #2aabee, #229ed9)", fondo: "#17212b", tenue: "#8ea3b5", sub: "canal de Telegram", boton: ["UNIRME", "TE UNISTE"], color: ["#2aabee", "#1f6f3f"] },
  whatsapp: { logo: "WhatsappLogo", banda: "linear-gradient(135deg, #25d366, #00a884)", fondo: "#111b21", tenue: "#8696a0", sub: "canal de WhatsApp", boton: ["UNIRME", "TE UNISTE"], color: ["#00a884", "#1f6f3f"] },
  instagram: { logo: "InstagramLogo", banda: "linear-gradient(135deg, #f58529, #dd2a7b 55%, #8134af)", fondo: "#000000", tenue: "#a8a8a8", sub: "en Instagram", boton: ["SEGUIR", "SIGUIENDO"], color: ["#0095f6", "#363636"] },
  tiktok: { logo: "TiktokLogo", banda: "linear-gradient(135deg, #25f4ee, #fe2c55)", fondo: "#121212", tenue: "#a0a0a0", sub: "en TikTok", boton: ["SEGUIR", "SIGUIENDO"], color: ["#fe2c55", "#2f2f2f"] },
  youtube: { logo: "YoutubeLogo", banda: "linear-gradient(135deg, #ff0000, #b80000)", fondo: "#0f0f0f", tenue: "#aaaaaa", sub: "en YouTube", boton: ["SUSCRIBIRME", "SUSCRITO"], color: ["#f1f1f1", "#272727"], letra: "#0f0f0f" },
  x: { logo: "XLogo", banda: "linear-gradient(135deg, #2f3336, #000000)", fondo: "#000000", tenue: "#71767b", sub: "en X", boton: ["SEGUIR", "SIGUIENDO"], color: ["#eff3f4", "#2f3336"], letra: "#0f1419" },
  web: { logo: "Globe", banda: `linear-gradient(135deg, ${AZUL}, #1b4f99)`, fondo: "#17181c", tenue: "#9a9da6", sub: "", boton: ["ENTRAR", "LISTO"], color: [AZUL, "#1f6f3f"] },
};

/** El color del botón de la red y el fondo de su tarjeta: para lo que acompaña a la tarjeta (el pulso, la píldora). */
export const colorDeRed = (red: Exclude<Red, "ninguna">) => ({ color: REDES[red].color[0], fondo: REDES[red].fondo });

/**
 * La tarjeta del cierre: la cuenta o el canal de `red` con su foto (`avatar`, en public; sin ella, el logo de la red),
 * su nombre y el botón, que se pulsa en `clic`.
 */
export const TarjetaCierre: React.FC<{ red: Exclude<Red, "ninguna">; clic: number; nombre: string; avatar?: string; sub?: string; ancho?: number }> = ({ red, clic, nombre, avatar, sub, ancho = 760 }) => {
  const f = useCurrentFrame();
  const r = REDES[red];
  const pulsado = interpolate(f, [clic, clic + 3, clic + 7], [1, 0.94, 1], sujeta);
  const cursor = interpolate(f, [clic - 14, clic], [0, 1], { ...sujeta, easing: suave });
  const hecho = f >= clic + 4;
  return (
    <div style={{ width: ancho, borderRadius: 30, overflow: "hidden", background: r.fondo, boxShadow: "0 24px 60px rgba(0,0,0,0.5)", fontFamily: LETRA, color: "#fff", position: "relative" }}>
      <div style={{ height: 150, background: r.banda }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: -84, padding: "0 30px 34px" }}>
        {avatar ? (
          <Img src={staticFile(avatar)} style={{ width: 168, height: 168, borderRadius: 168, objectFit: "cover", border: `8px solid ${r.fondo}`, background: r.fondo }} />
        ) : (
          <div style={{ width: 168, height: 168, borderRadius: 168, border: `8px solid ${r.fondo}`, background: r.banda, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
            <Glifo nombre={r.logo} tam={92} peso="fill" />
          </div>
        )}
        <div style={{ fontSize: 50, fontWeight: 800, marginTop: 14, textAlign: "center" }}>{nombre}</div>
        {(sub ?? r.sub) ? (
          <div style={{ fontSize: 28, color: r.tenue, fontWeight: 500, marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <Glifo nombre={r.logo} tam={30} peso="fill" />
            {sub ?? r.sub}
          </div>
        ) : null}
        <div
          style={{
            marginTop: 30,
            width: "100%",
            textAlign: "center",
            padding: "24px 0",
            borderRadius: 18,
            background: hecho ? r.color[1] : r.color[0],
            color: hecho ? "#fff" : r.letra ?? "#fff",
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: "0.04em",
            transform: `scale(${pulsado})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          {hecho ? <Glifo nombre="Check" tam={38} peso="bold" /> : null}
          {hecho ? r.boton[1] : r.boton[0]}
        </div>
      </div>
      {cursor > 0 ? (
        <svg width="56" height="56" viewBox="0 0 24 24" style={{ position: "absolute", left: ancho / 2 + 40 + (1 - cursor) * 180, top: 470 + (1 - cursor) * 160, filter: "drop-shadow(0 4px 6px #0008)" }}>
          <path d="M4 2l14 9.5-6.2 1.3 3.6 7.2-2.7 1.3-3.6-7.2L4 18.5z" fill="#fff" stroke="#000" strokeWidth="1.2" />
        </svg>
      ) : null}
    </div>
  );
};

/** Una ventana de navegador con su dirección, para una página web rehecha. */
export const Navegador: React.FC<{ url: string; ancho?: number; children: React.ReactNode }> = ({ url, ancho = 880, children }) => {
  const c = useColores();
  return (
    <div style={{ width: ancho, borderRadius: 22, overflow: "hidden", background: c.tarjeta, border: `2px solid ${c.borde}`, boxShadow: c.sombra, fontFamily: LETRA }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: c.tarjeta2, borderBottom: `2px solid ${c.borde}` }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((k) => (
          <div key={k} style={{ width: 16, height: 16, borderRadius: 16, background: k }} />
        ))}
        <div style={{ marginLeft: 14, flex: 1, borderRadius: 10, background: c.tarjeta, border: `2px solid ${c.borde}`, padding: "6px 16px", fontFamily: MONO, fontSize: 27, color: c.tenue }}>{url}</div>
      </div>
      {children}
    </div>
  );
};

/** Una barra de tiempo que se llena entre dos fechas (el año del reembolso). */
export const Plazo: React.FC<{ desde: number; hasta: number; inicio: string; fin: string; color: string; ancho?: number }> = ({ desde, hasta, inicio, fin, color, ancho = 820 }) => {
  const f = useCurrentFrame();
  const c = useColores();
  const p = interpolate(f, [desde, hasta], [0, 1], { ...sujeta, easing: suave });
  return (
    <div style={{ width: ancho, fontFamily: LETRA }}>
      <div style={{ height: 22, borderRadius: 22, background: c.tarjeta2, border: `2px solid ${c.borde}`, position: "relative" }}>
        <div style={{ width: `${p * 100}%`, height: "100%", borderRadius: 22, background: color }} />
        <div style={{ position: "absolute", left: `${p * 100}%`, top: "50%", width: 34, height: 34, marginLeft: -17, marginTop: -17, borderRadius: 34, background: color, border: `5px solid ${c.tarjeta}` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 32, fontWeight: 700, color: c.texto }}>
        <span>{inicio}</span>
        <span style={{ opacity: p > 0.9 ? 1 : 0.4 }}>{fin}</span>
      </div>
    </div>
  );
};

/**
 * La prueba en corto: el logo de quien lo dijo, de dónde y cuándo, y solo la frase que importa (con su dato subrayado
 * en rojo). En vez de la cita entera: el texto de arriba ya dice el resto.
 */
export const Prueba: React.FC<{ logo: string; fuente: string; partes: Partes; ancho?: number; tam?: number }> = ({ logo, fuente, partes, ancho, tam = 50 }) => {
  const c = useColores();
  return (
    <div style={{ width: ancho, maxWidth: 940, background: c.tarjeta, border: `2px solid ${c.borde}`, borderRadius: 28, boxShadow: c.sombra, padding: `${tam * 0.48}px ${tam * 0.64}px ${tam * 0.6}px`, fontFamily: LETRA, color: c.texto }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: tam * 0.28 }}>
        <Img src={staticFile(`logos/${logo}.png`)} style={{ width: tam * 1.16, height: tam * 1.16, borderRadius: tam, background: "#fff" }} />
        <span style={{ fontSize: tam * 0.56, fontWeight: 600, color: c.tenue }}>{fuente}</span>
      </div>
      <div style={{ fontSize: tam, lineHeight: 1.25, fontWeight: 700 }}>
        <Texto partes={partes} />
      </div>
    </div>
  );
};
