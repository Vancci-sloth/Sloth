/**
 * El sonido de la entrada, sintetizado con Web Audio y a la medida de `splash.css`: cada golpe cae en su fotograma.
 * Va en La mayor (pentatónica), cálido como la paleta: el pincel que dibuja, las burbujas de la cara, el teclado, el
 * susto, el portazo del portátil, la cola que se recoge, el acorde del logo con su brillo y el «tin» del guiño.
 *
 * Los tiempos son los de la animación, que empieza con la página, no con este código (llega más tarde, con el resto
 * de la app): todo se programa sobre ese mismo reloj, así que suena en su sitio aunque arranque tarde. Lo que ya
 * sonó se salta, y lo que estaba sonando entra desde donde va.
 */

const A3 = 220
const E4 = 329.63
const A4 = 440
const B4 = 493.88
const CS5 = 554.37
const E5 = 659.25
const FS5 = 739.99
const A5 = 880
const B5 = 987.77
const CS6 = 1108.73
const E6 = 1318.51
const FS6 = 1479.98
const A6 = 1760
const B6 = 1975.53
const CS7 = 2217.46

/** El volumen de todo, antes del compresor: la entrada acompaña, no asusta. */
const VOLUME = 1.1

export interface SplashSound {
  /** La entrada se va: un soplo de aire y todo se apaga. */
  leave(): void
}

/** Empieza a sonar la entrada, si el sistema deja animarla y hay audio. */
export function playSplashSound(): SplashSound | null {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null
  let context: AudioContext
  let score: { leave(at: number): void }
  try {
    context = new AudioContext({ latencyHint: 'interactive' })
    score = composeSplash(context, context.currentTime - animationElapsed() / 1000)
  } catch {
    // Sin sonido, la entrada es la misma: nunca impide que cargue la app.
    return null
  }
  let gone = false
  return {
    leave() {
      if (gone) return
      gone = true
      score.leave(context.currentTime)
      setTimeout(() => void context.close(), 1500)
    }
  }
}

/**
 * Cuánto lleva la animación, en ms: desde que arrancaron las de `splash.css` (todas a la vez, al pintar la página por
 * primera vez) o, si aún no consta, desde que empezó a cargarse la página.
 */
function animationElapsed(): number {
  const started = document.getElementById('splash')?.getAnimations({ subtree: true })[0]?.startTime
  return performance.now() - (typeof started === 'number' ? started : 0)
}

/**
 * Programa la entrada entera en `context`, con el cero de la animación en `zero` (en el reloj de `context`), y
 * devuelve cómo despedirla. Se usa tal cual para grabarla sin tiempo real (`OfflineAudioContext`).
 */
export function composeSplash(context: BaseAudioContext, zero: number): { leave(at: number): void } {
  const synth = new Synth(context)
  const at = (seconds: number) => zero + seconds

  // Se dibuja: el pincel de la cabeza y el de la cola, con un brillo que sube; al levantar el pincel, un tic.
  synth.swoosh(at(0.05), 0.64, 520, 3400, 1.1, 0.2)
  synth.glide(at(0.05), 0.64, 330, 660, 0.035)
  synth.swoosh(at(0.16), 0.6, 380, 2300, 1.3, 0.13)
  synth.bell(at(0.68), E6, 0.025, 0.5)

  // Brota la cara: una burbuja por parche, la nariz y las pupilas.
  synth.bloop(at(0.32), A4, 0.12)
  synth.bloop(at(0.38), CS5, 0.12)
  synth.bloop(at(0.46), E5, 0.11)
  synth.bloop(at(0.54), A5, 0.07)
  synth.bloop(at(0.56), A5 * 1.006, 0.05)

  // El portátil: el teclado, la tapa que se abre y se asienta, el logo que se enciende y el zumbido de la pantalla.
  synth.pluck(at(0.48), A3, 0.09, 0.25, 'triangle')
  synth.swoosh(at(0.52), 0.32, 300, 1600, 1.4, 0.07)
  synth.click(at(0.8), 0.05, 3200)
  synth.bell(at(0.83), A5, 0.06, 1.1)
  synth.bell(at(0.83), E6, 0.03, 0.9)
  synth.hum(at(0.8), at(1.44), 0.022)

  // Teclea tres veces, y de cada tecla sale un Vídeo que sube como una burbuja.
  for (const [index, glyph] of [CS6, E6, A6].entries()) {
    const key = at(0.86 + index * 0.11)
    synth.click(key, 0.1, 2400)
    synth.thock(key, 0.06)
    synth.bloop(key + 0.04, glyph, 0.045)
  }

  // El susto: coge aire, «¡boing!», el «!» y un temblor grave.
  synth.swoosh(at(1.1), 0.13, 800, 2600, 1, 0.05)
  synth.boing(at(1.2), 0.13)
  synth.chord(at(1.22), [E5, A5, CS6], 0.05, 0.35)
  synth.air(at(1.2), 0.3, 5000, 0.04)
  synth.thump(at(1.21), 0.08, 90)

  // El portátil se cierra de golpe: el aire que baja, el golpe con su madera y el polvo.
  synth.swoosh(at(1.4), 0.22, 2600, 420, 1.2, 0.1)
  synth.thump(at(1.6), 0.38, 150)
  synth.click(at(1.6), 0.22, 1800)
  synth.knock(at(1.6), 0.14)
  synth.dust(at(1.62), 0.06)

  // La cola se recoge.
  synth.swoosh(at(1.64), 0.36, 2100, 480, 3, 0.08)
  synth.glide(at(1.64), 0.36, 900, 300, 0.025)

  // Se convierte en el logo: un arpegio que sube, el destello y el acorde que se queda.
  synth.swoosh(at(1.7), 0.42, 300, 6500, 0.9, 0.07)
  for (const [index, note] of [A4, CS5, E5, A5, CS6].entries()) synth.pluck(at(1.72 + index * 0.06), note, 0.045, 0.5)
  synth.pad(at(1.94), at(3.1), [A3, E4, A4, CS5, E5, B5], 0.05)
  synth.sub(at(2.02), at(3.1), 110, 0.09)
  synth.bell(at(2.06), A5, 0.07, 1.8)
  synth.bell(at(2.06), CS6, 0.035, 1.6)

  // El brillo cruza el logo.
  for (const [index, note] of [E6, FS6, A6, B6, CS7].entries()) synth.pluck(at(2.24 + index * 0.035), note, 0.022, 0.4)
  synth.air(at(2.2), 0.45, 7000, 0.025)

  // El guiño: un «bwip» de la mejilla, el destello y el «tin».
  synth.bloop(at(2.38), FS5, 0.05)
  synth.bell(at(2.44), E6, 0.05, 1.2)
  synth.bell(at(2.5), A6, 0.04, 1.4)
  synth.bell(at(2.5), B4 * 4, 0.012, 1)

  return {
    leave(when) {
      synth.air(when, 0.5, 2500, 0.05)
      synth.fadeOut(when + 0.1, 0.7)
    }
  }
}

/** Los instrumentos de la entrada, sobre un compresor y una reverberación propia. */
class Synth {
  private readonly master: GainNode
  private readonly dry: GainNode
  private readonly noise: AudioBuffer

  /** Lo más pronto que puede empezar algo: antes, ya pasó. */
  private readonly floor: number

  constructor(private readonly context: BaseAudioContext) {
    this.floor = context.currentTime + 0.005
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.ratio.value = 3
    compressor.attack.value = 0.004
    compressor.release.value = 0.2
    this.master = context.createGain()
    this.master.gain.value = VOLUME
    this.master.connect(compressor).connect(context.destination)

    // Todo pasa por la sala: seco y, un poco, con su eco.
    this.dry = context.createGain()
    const reverb = context.createConvolver()
    reverb.buffer = this.room(1.8)
    const wet = context.createGain()
    wet.gain.value = 0.28
    this.dry.connect(this.master)
    this.dry.connect(reverb).connect(wet).connect(this.master)

    this.noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
    const samples = this.noise.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
  }

  /** Aire filtrado que barre de `from` a `to` Hz: el pincel, la tapa, la cola. */
  swoosh(start: number, duration: number, from: number, to: number, q: number, volume: number): void {
    const span = this.fit(start, duration)
    if (!span) return
    ;[start, duration] = span
    const source = this.noiseSource(start, duration)
    const filter = this.context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = q
    filter.frequency.setValueAtTime(from, start)
    filter.frequency.exponentialRampToValueAtTime(to, start + duration)
    const gain = this.envelope(start, duration * 0.35, duration, volume)
    source.connect(filter).connect(gain).connect(this.dry)
  }

  /** Aire agudo que se apaga: chispas y soplos. */
  air(start: number, duration: number, cutoff: number, volume: number): void {
    const span = this.fit(start, duration)
    if (!span) return
    ;[start, duration] = span
    const source = this.noiseSource(start, duration)
    const filter = this.context.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = cutoff
    const gain = this.envelope(start, 0.01, duration, volume)
    source.connect(filter).connect(gain).connect(this.dry)
  }

  /** Un tono que se desliza de una nota a otra. */
  glide(start: number, duration: number, from: number, to: number, volume: number): void {
    const span = this.fit(start, duration)
    if (!span) return
    ;[start, duration] = span
    const oscillator = this.oscillator('sine', start, duration)
    oscillator.frequency.setValueAtTime(from, start)
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration)
    oscillator.connect(this.envelope(start, duration * 0.4, duration, volume)).connect(this.dry)
  }

  /** Una burbuja: sube un poco hasta su nota y se apaga enseguida. */
  bloop(start: number, frequency: number, volume: number): void {
    if (start < this.floor) return
    const oscillator = this.oscillator('sine', start, 0.22)
    oscillator.frequency.setValueAtTime(frequency * 0.7, start)
    oscillator.frequency.exponentialRampToValueAtTime(frequency, start + 0.045)
    oscillator.connect(this.envelope(start, 0.008, 0.22, volume)).connect(this.dry)
  }

  /** Una nota pulsada que se apaga. */
  pluck(start: number, frequency: number, volume: number, duration = 0.4, type: OscillatorType = 'sine'): void {
    if (start < this.floor) return
    const oscillator = this.oscillator(type, start, duration)
    oscillator.frequency.value = frequency
    oscillator.connect(this.envelope(start, 0.004, duration, volume)).connect(this.dry)
  }

  /** Una campana de cristal: parciales inarmónicos que se apagan a su ritmo. */
  bell(start: number, frequency: number, volume: number, duration: number): void {
    if (start < this.floor) return
    for (const [ratio, level, length] of [[1, 1, 1], [2.76, 0.35, 0.55], [5.4, 0.15, 0.3]] as const) {
      const oscillator = this.oscillator('sine', start, duration * length)
      oscillator.frequency.value = frequency * ratio
      oscillator.connect(this.envelope(start, 0.003, duration * length, volume * level)).connect(this.dry)
    }
  }

  /** Varias notas a la vez, brillantes y cortas: el «!». */
  chord(start: number, frequencies: number[], volume: number, duration: number): void {
    if (start < this.floor) return
    const filter = this.context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(5000, start)
    filter.frequency.exponentialRampToValueAtTime(900, start + duration)
    filter.connect(this.envelope(start, 0.005, duration, volume)).connect(this.dry)
    for (const frequency of frequencies) {
      const oscillator = this.oscillator('sawtooth', start, duration)
      oscillator.frequency.value = frequency
      oscillator.connect(filter)
    }
  }

  /** «¡Boing!»: un salto de tono que tiembla al apagarse. */
  boing(start: number, volume: number): void {
    if (start < this.floor) return
    const oscillator = this.oscillator('triangle', start, 0.42)
    oscillator.frequency.setValueAtTime(360, start)
    oscillator.frequency.exponentialRampToValueAtTime(1150, start + 0.09)
    oscillator.frequency.exponentialRampToValueAtTime(900, start + 0.42)
    const vibrato = this.oscillator('sine', start, 0.42)
    vibrato.frequency.value = 17
    const depth = this.context.createGain()
    depth.gain.setValueAtTime(0, start)
    depth.gain.linearRampToValueAtTime(60, start + 0.12)
    depth.gain.exponentialRampToValueAtTime(1, start + 0.42)
    vibrato.connect(depth).connect(oscillator.frequency)
    oscillator.connect(this.envelope(start, 0.01, 0.42, volume)).connect(this.dry)
  }

  /** El chasquido de una tecla o de un golpe: ruido muy corto. */
  click(start: number, volume: number, cutoff: number): void {
    if (start < this.floor) return
    const source = this.noiseSource(start, 0.03)
    const filter = this.context.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = cutoff
    source.connect(filter).connect(this.envelope(start, 0.001, 0.03, volume)).connect(this.dry)
  }

  /** El cuerpo de una tecla: un golpecito con tono. */
  thock(start: number, volume: number): void {
    if (start < this.floor) return
    const oscillator = this.oscillator('sine', start, 0.05)
    oscillator.frequency.setValueAtTime(950, start)
    oscillator.frequency.exponentialRampToValueAtTime(380, start + 0.04)
    oscillator.connect(this.envelope(start, 0.001, 0.05, volume)).connect(this.dry)
  }

  /** Un golpe grave que cae de tono. */
  thump(start: number, volume: number, from: number): void {
    if (start < this.floor) return
    const oscillator = this.oscillator('sine', start, 0.32)
    oscillator.frequency.setValueAtTime(from, start)
    oscillator.frequency.exponentialRampToValueAtTime(42, start + 0.16)
    oscillator.connect(this.envelope(start, 0.002, 0.32, volume)).connect(this.dry)
  }

  /** La madera del portátil al cerrarse. */
  knock(start: number, volume: number): void {
    if (start < this.floor) return
    const source = this.noiseSource(start, 0.12)
    const filter = this.context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1700
    filter.Q.value = 5
    source.connect(filter).connect(this.envelope(start, 0.001, 0.12, volume * 3)).connect(this.dry)
  }

  /** El polvo que levanta el golpe. */
  dust(start: number, volume: number): void {
    if (start < this.floor) return
    const source = this.noiseSource(start, 0.5)
    const filter = this.context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(1400, start)
    filter.frequency.exponentialRampToValueAtTime(300, start + 0.5)
    source.connect(filter).connect(this.envelope(start, 0.02, 0.5, volume)).connect(this.dry)
  }

  /** El zumbido de la pantalla encendida, que se corta al cerrarla. */
  hum(start: number, end: number, volume: number): void {
    if (end <= this.floor) return
    start = Math.max(start, this.floor)
    for (const frequency of [110, 165, 220.5]) {
      const oscillator = this.oscillator('sine', start, end - start + 0.1)
      oscillator.frequency.value = frequency
      oscillator.connect(this.hold(start, 0.2, end, 0.06, volume / 2)).connect(this.dry)
    }
  }

  /** El acorde que se queda: sierras desafinadas tras un filtro que se abre. */
  pad(start: number, end: number, frequencies: number[], volume: number): void {
    if (end <= this.floor) return
    start = Math.max(start, this.floor)
    const filter = this.context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.7
    filter.frequency.setValueAtTime(500, start)
    filter.frequency.exponentialRampToValueAtTime(2600, start + 0.4)
    filter.frequency.exponentialRampToValueAtTime(1200, end)
    filter.connect(this.hold(start, 0.28, end, 0.6, volume)).connect(this.dry)
    for (const frequency of frequencies) {
      for (const detune of [-7, 7]) {
        const oscillator = this.oscillator('sawtooth', start, end - start + 0.7)
        oscillator.frequency.value = frequency
        oscillator.detune.value = detune
        oscillator.connect(filter)
      }
    }
  }

  /** El grave que sostiene el acorde. */
  sub(start: number, end: number, frequency: number, volume: number): void {
    if (end <= this.floor) return
    start = Math.max(start, this.floor)
    const oscillator = this.oscillator('sine', start, end - start + 0.7)
    oscillator.frequency.value = frequency
    oscillator.connect(this.hold(start, 0.2, end, 0.6, volume)).connect(this.dry)
  }

  /** Baja todo hasta el silencio. */
  fadeOut(start: number, duration: number): void {
    start = Math.max(start, this.floor)
    const gain = this.master.gain
    gain.cancelScheduledValues(start)
    gain.setValueAtTime(VOLUME, start)
    gain.linearRampToValueAtTime(0, start + duration)
  }

  /**
   * Lo que queda de un sonido que empieza en `start` y dura `duration`: entero si aún no ha empezado, desde ahora si
   * ya estaba sonando, y nada si ya sonó o apenas le queda.
   */
  private fit(start: number, duration: number): [number, number] | null {
    if (start >= this.floor) return [start, duration]
    const left = start + duration - this.floor
    return left > 0.08 ? [this.floor, left] : null
  }

  private oscillator(type: OscillatorType, start: number, duration: number): OscillatorNode {
    const oscillator = this.context.createOscillator()
    oscillator.type = type
    oscillator.start(start)
    oscillator.stop(start + duration + 0.05)
    return oscillator
  }

  private noiseSource(start: number, duration: number): AudioBufferSourceNode {
    const source = this.context.createBufferSource()
    source.buffer = this.noise
    source.loop = true
    source.start(start, Math.random())
    source.stop(start + duration + 0.05)
    return source
  }

  /** Sube en `attack` y se apaga hasta el final de `duration`. */
  private envelope(start: number, attack: number, duration: number, volume: number): GainNode {
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.max(attack, 0.001))
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    return gain
  }

  /** Sube en `attack`, se mantiene hasta `end` y se apaga en `release`. */
  private hold(start: number, attack: number, end: number, release: number, volume: number): GainNode {
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + attack)
    gain.gain.setValueAtTime(volume, end)
    gain.gain.exponentialRampToValueAtTime(0.0001, end + release)
    return gain
  }

  /** Una sala pequeña y cálida: ruido estéreo que se apaga. */
  private room(seconds: number): AudioBuffer {
    const length = Math.floor(this.context.sampleRate * seconds)
    const impulse = this.context.createBuffer(2, length, this.context.sampleRate)
    for (let channel = 0; channel < 2; channel++) {
      const samples = impulse.getChannelData(channel)
      for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3
    }
    return impulse
  }
}
