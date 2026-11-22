/*! mg-runtime v1.0 — contrato "seek, no play" (window.__mg)
 *
 * Una composición es una función pura del tiempo: dado t, el fotograma es siempre el mismo.
 * Este archivo hace tres cosas:
 *   1) Expone window.__mg (lo que lee tools/render.mjs y tools/qa.mjs).
 *   2) Da la misma ruta de código a la vista previa y al render (todo pasa por seek).
 *   3) Trae helpers deterministas (easing, ventanas, interpolación, PRNG con semilla).
 *
 * Uso mínimo:
 *   MG.register({ duration: 8, fps: 60, width: 1920, height: 1080, render(t){ ... } });
 *
 * Con GSAP (timeline finita y pausada):
 *   const tl = gsap.timeline({ paused: true }); ...
 *   MG.register({ duration: 8, width: 1920, height: 1080, render: MG.fromGsap(tl) });
 *
 * Reglas (ver skills/core-contract.md): nada de Math.random, Date.now, repeat:-1,
 * transition/@keyframes de CSS ni fuentes remotas dentro de render(t).
 */
(function (global) {
  'use strict';

  // ---------- Helpers numéricos ----------
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, p) => a + (b - a) * p;
  /** Progreso 0..1 de t dentro de [a, b], recortado. */
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  /** Ventana con entrada y salida suaves: 0 → 1 en [a, a+f], 1 → 0 en [b-f, b]. */
  const win = (t, a, b, f) => Math.min(seg(t, a, a + f), 1 - seg(t, b - f, b));
  /** Interpolación lineal por tramos. pts = [[t0, v0], [t1, v1], ...] */
  const interp = (t, pts) => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], seg(t, pts[i - 1][0], pts[i][0]));
    }
    return pts[pts.length - 1][1];
  };

  // ---------- Easing (p: 0..1 → 0..1). Nombres por intención, ver skills/motion-patterns.md ----------
  const ease = {
    linear: (p) => p,
    out2: (p) => 1 - Math.pow(1 - p, 2),
    out3: (p) => 1 - Math.pow(1 - p, 3),
    out4: (p) => 1 - Math.pow(1 - p, 4),
    in2: (p) => p * p,
    in3: (p) => p * p * p,
    inOut3: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    outExpo: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    inExpo: (p) => (p <= 0 ? 0 : Math.pow(2, 10 * p - 10)),
    inOutExpo: (p) =>
      p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2,
    outBack: (p, s = 1.70158) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2),
    /** Resorte subamortiguado en forma cerrada (determinista). zeta<1 rebota; w = rapidez. */
    spring: (p, zeta = 0.6, w = 12) => {
      if (p <= 0) return 0;
      if (p >= 1) p = 1;
      const wd = w * Math.sqrt(1 - zeta * zeta);
      const v = 1 - Math.exp(-zeta * w * p) * (Math.cos(wd * p) + ((zeta * w) / wd) * Math.sin(wd * p));
      return v;
    },
  };

  /** PRNG con semilla: mismo resultado en cada fotograma y en cada máquina. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Adaptador GSAP: la timeline debe ser finita y estar en pausa. */
  const fromGsap = (tl) => (t) => {
    tl.totalTime(t, false);
  };

  // ---------- Registro del contrato ----------
  const params = new URLSearchParams(global.location ? global.location.search : '');
  const RENDER_MODE = params.get('render') === '1';

  function register(opts) {
    const o = Object.assign({ fps: 60, width: 1920, height: 1080, stage: '#stage', ui: true, autoplay: true }, opts);
    if (!(o.duration > 0)) throw new Error('MG.register: duration debe ser > 0');
    if (typeof o.render !== 'function') throw new Error('MG.register: falta render(t, frame)');

    const stage = typeof o.stage === 'string' ? document.querySelector(o.stage) : o.stage;
    if (!stage) throw new Error('MG.register: no existe el stage ' + o.stage);

    const state = { t: 0, playing: false };
    const quantize = (t) => Math.round(t * o.fps) / o.fps;

    const mg = {
      duration: o.duration,
      fps: o.fps,
      width: o.width,
      height: o.height,
      ready: false,
      seek(t) {
        const q = clamp(quantize(t), 0, o.duration);
        state.t = q;
        o.render(q, Math.round(q * o.fps));
        if (mg._onSeek) mg._onSeek(q);
        return q;
      },
    };
    global.__mg = mg;

    // Estilo base del stage: tamaño nativo fijo. En render se ancla en (0,0) sin escala.
    stage.style.position = 'absolute';
    stage.style.width = o.width + 'px';
    stage.style.height = o.height + 'px';
    stage.style.overflow = 'hidden';
    document.documentElement.style.background = '#000';
    document.body.style.cssText += ';margin:0;overflow:hidden;background:#000';

    if (RENDER_MODE) {
      stage.style.left = '0px';
      stage.style.top = '0px';
      stage.style.transform = 'none';
    } else {
      stage.style.transformOrigin = '0 0';
      buildPreview(o, stage, mg, state);
    }

    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fontsReady.then(() => {
      mg.seek(0);
      mg.ready = true;
      if (!RENDER_MODE) {
        const reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) mg.seek(o.duration); // accesibilidad: mostrar el estado final, sin animar
        else if (o.autoplay) state.play && state.play();
      }
    });
    return mg;
  }

  // ---------- Vista previa (solo fuera de ?render=1) ----------
  function buildPreview(o, stage, mg, state) {
    const fit = () => {
      const bar = o.ui ? 64 : 0;
      const s = Math.min(global.innerWidth / o.width, (global.innerHeight - bar) / o.height);
      const x = (global.innerWidth - o.width * s) / 2;
      const y = (global.innerHeight - bar - o.height * s) / 2;
      stage.style.left = x + 'px';
      stage.style.top = y + 'px';
      stage.style.transform = 'scale(' + s + ')';
    };
    global.addEventListener('resize', fit);
    fit();

    let last = 0;
    let raf = 0;
    const tick = (now) => {
      if (!state.playing) return;
      const dt = (now - last) / 1000;
      last = now;
      let t = state.t + dt;
      if (t >= o.duration + 0.6) t = 0; // pausa breve en el estado final y repite
      mg.seek(Math.min(t, o.duration));
      state.t = t; // conserva el excedente para el hold final
      raf = global.requestAnimationFrame(tick);
    };
    state.play = () => {
      if (state.playing) return;
      state.playing = true;
      last = global.performance.now();
      raf = global.requestAnimationFrame(tick);
      sync();
    };
    state.pause = () => {
      state.playing = false;
      global.cancelAnimationFrame(raf);
      sync();
    };

    if (!o.ui) return;
    const css = document.createElement('style');
    css.textContent =
      '#mg-ui{position:fixed;left:0;right:0;bottom:0;height:64px;padding:0 16px env(safe-area-inset-bottom,0px);' +
      'display:flex;gap:12px;align-items:center;background:#111;color:#eee;font:13px system-ui,sans-serif;z-index:99999}' +
      '#mg-ui button{background:#eee;color:#111;border:0;border-radius:18px;padding:8px 14px;font:600 13px system-ui;cursor:pointer}' +
      '#mg-ui input{flex:1;accent-color:#eee}#mg-ui span{font-variant-numeric:tabular-nums;min-width:110px;text-align:right}';
    document.head.appendChild(css);
    const ui = document.createElement('div');
    ui.id = 'mg-ui';
    ui.innerHTML =
      '<button id="mg-pp" aria-label="Reproducir o pausar">Pausar</button>' +
      '<input id="mg-sl" type="range" min="0" max="' + o.duration + '" step="' + 1 / o.fps + '" value="0" aria-label="Línea de tiempo">' +
      '<span id="mg-tm"></span>';
    document.body.appendChild(ui);
    const pp = ui.querySelector('#mg-pp');
    const sl = ui.querySelector('#mg-sl');
    const tm = ui.querySelector('#mg-tm');
    function sync() {
      pp.textContent = state.playing ? 'Pausar' : 'Reproducir';
    }
    pp.onclick = () => (state.playing ? state.pause() : state.play());
    sl.oninput = () => {
      state.pause();
      mg.seek(parseFloat(sl.value));
    };
    mg._onSeek = (q) => {
      sl.value = q;
      tm.textContent = q.toFixed(2) + 's · f' + Math.round(q * o.fps);
    };
    global.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); pp.click(); }
      if (e.code === 'ArrowRight') { state.pause(); mg.seek(state.t + 1 / o.fps); }
      if (e.code === 'ArrowLeft') { state.pause(); mg.seek(state.t - 1 / o.fps); }
    });
  }

  global.MG = { register, fromGsap, clamp, lerp, seg, win, interp, ease, mulberry32, RENDER_MODE };
})(window);
