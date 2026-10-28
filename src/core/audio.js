// Fully procedural audio: synthesized SFX and a layered "spy jazz" score whose
// layers fade in and out with the stealth state (calm / suspicious / search / combat).

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
// MIDI helpers
const D2 = 38, F2 = 41, A2 = 45, C3 = 48, Bb1 = 34, G1 = 31, A1 = 33;

const CHORDS = [
  // root, bass walk, chord tones (midi) for pads/keys
  { walk: [D2, F2, A2, C3], tones: [62, 65, 69, 72, 76] }, // Dm9
  { walk: [Bb1, D2, F2, A2], tones: [58, 62, 65, 69, 74] }, // Bbmaj7
  { walk: [G1, Bb1, D2, F2], tones: [55, 58, 62, 65, 69] }, // Gm7
  { walk: [A1, 37, 40, 43], tones: [57, 61, 64, 67, 70] }, // A7b9
];
const MELODY = [
  // sparse vibes melody per bar (step 0-15 -> midi or null)
  { 0: 74, 6: 72, 10: 69, 14: 72 },
  { 2: 70, 6: 69, 8: 65, 12: 69 },
  { 0: 67, 4: 70, 8: 74, 11: 72 },
  { 0: 73, 4: 72, 6: 70, 8: 69, 12: 64 },
];

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.intensity = 0;
    this.layerGains = {};
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.started = false;
    this.step = 0;
    this.bar = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.ambBus.connect(this.master);
    this.applyVolumes();
    // noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // reverb-ish: simple feedback delay for music
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.27;
    const fb = ctx.createGain();
    fb.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(this.musicBus);
    this.musicDelay = delay;
    const layers = ['bass', 'keys', 'brush', 'tension', 'pulse', 'drums', 'brass'];
    for (const l of layers) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.musicBus);
      this.layerGains[l] = g;
    }
    this.layerGains.keys.connect(delay);
    this.layerGains.tension.connect(delay);
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.sfxBus.gain.value = s.sfx;
    this.musicBus.gain.value = s.music * 0.55;
    this.ambBus.gain.value = s.sfx * 0.6;
  }

  duck(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.35 : 0.9, t, 0.15);
  }

  // ---------------------------------------------------------------- primitives
  _env(g, t, a, peak, d, sus = 0) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d);
  }
  tone(freq, dur, { type = 'sine', vol = 0.3, attack = 0.005, slide = null, at = 0, dest = null, pan = 0, filter = null, q = 1 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    const g = ctx.createGain();
    this._env(g, t, attack, vol, dur);
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      f.Q.value = q;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) {
      p.pan.value = pan;
      g.connect(p);
      p.connect(dest || this.sfxBus);
    } else g.connect(dest || this.sfxBus);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }
  noise(dur, { vol = 0.3, type = 'bandpass', freq = 1000, q = 1, sweep = null, attack = 0.003, at = 0, dest = null, pan = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this._env(g, t, attack, vol, dur);
    src.connect(f);
    f.connect(g);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) {
      p.pan.value = pan;
      g.connect(p);
      p.connect(dest || this.sfxBus);
    } else g.connect(dest || this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + attack + dur + 0.05);
  }

  // ---------------------------------------------------------------- sfx
  spatial(pos) {
    if (!pos) return { v: 1, pan: 0 };
    const l = this.listener;
    const dx = pos.x - l.x, dz = pos.z - l.z;
    const d = Math.hypot(dx, dz);
    const v = Math.pow(Math.max(0, 1 - d / 32), 1.6);
    // screen-space pan from camera yaw
    const c = Math.cos(l.yaw), s = Math.sin(l.yaw);
    const sx = dx * c - dz * s;
    return { v, pan: Math.max(-0.8, Math.min(0.8, sx / 12)) };
  }

  sfx(name, pos, opts = {}) {
    if (!this.ctx) return;
    const { v, pan } = this.spatial(pos);
    if (v < 0.02) return;
    const r = () => 0.9 + Math.random() * 0.2;
    const P = { pan };
    switch (name) {
      case 'step':
        this.noise(0.05, { vol: 0.05 * v, freq: opts.surf === 'grass' ? 900 : 2200, q: 1.2, ...P });
        break;
      case 'stepRun':
        this.noise(0.06, { vol: 0.09 * v, freq: opts.surf === 'grass' ? 800 : 1800, q: 1, ...P });
        this.tone(90 * r(), 0.05, { vol: 0.06 * v, ...P });
        break;
      case 'hurt':
        this.tone(220, 0.25, { type: 'sawtooth', vol: 0.18, slide: 110, filter: 900 });
        this.noise(0.12, { vol: 0.15, freq: 600, q: 0.7 });
        break;
      case 'punch':
        this.tone(120 * r(), 0.12, { vol: 0.4 * v, slide: 50, ...P });
        this.noise(0.08, { vol: 0.25 * v, freq: 1500, q: 0.6, ...P });
        break;
      case 'bonk':
        this.tone(600 * r(), 0.18, { type: 'triangle', vol: 0.4 * v, slide: 180, ...P });
        this.tone(1200 * r(), 0.08, { type: 'square', vol: 0.06 * v, slide: 400, ...P });
        this.noise(0.04, { vol: 0.2 * v, freq: 3000, ...P });
        break;
      case 'bong':
        for (const f of [420, 610, 890]) this.tone(f * r(), 0.9, { type: 'sine', vol: 0.18 * v, ...P });
        this.noise(0.05, { vol: 0.25 * v, freq: 2500, ...P });
        break;
      case 'struggle':
        this.noise(0.6, { vol: 0.12 * v, freq: 500, q: 2, sweep: 900, ...P });
        this.tone(180, 0.5, { type: 'sawtooth', vol: 0.04 * v, slide: 140, filter: 600, ...P });
        break;
      case 'thud':
        this.tone(80 * r(), 0.22, { vol: 0.45 * v, slide: 40, ...P });
        this.noise(0.1, { vol: 0.15 * v, type: 'lowpass', freq: 400, ...P });
        break;
      case 'grab':
        this.noise(0.12, { vol: 0.1 * v, freq: 1200, q: 1, ...P });
        break;
      case 'zip':
        this.noise(0.25, { vol: 0.14 * v, freq: 2000, q: 4, sweep: 6000, ...P });
        this.tone(500, 0.2, { type: 'triangle', vol: 0.06 * v, slide: 1400, at: 0.25, ...P });
        break;
      case 'pickup':
        this.tone(880, 0.08, { type: 'triangle', vol: 0.15 });
        this.tone(1320, 0.12, { type: 'triangle', vol: 0.12, at: 0.06 });
        break;
      case 'rustle':
        this.noise(0.35, { vol: 0.14 * v, freq: 3500, q: 0.8, ...P });
        break;
      case 'door':
        this.tone(200 * r(), 0.35, { type: 'sawtooth', vol: 0.06 * v, slide: 320, filter: 700, ...P });
        this.tone(90, 0.15, { vol: 0.25 * v, at: 0.3, ...P });
        break;
      case 'whoosh':
        this.noise(0.22, { vol: 0.12 * v, freq: 600, q: 1.5, sweep: 2400, ...P });
        break;
      case 'clink':
        this.tone(2400 * r(), 0.25, { vol: 0.12 * v, ...P });
        this.tone(3600 * r(), 0.18, { vol: 0.07 * v, at: 0.07, ...P });
        break;
      case 'squeak':
        this.tone(900, 0.18, { type: 'square', vol: 0.08 * v, slide: 1500, filter: 2500, ...P });
        this.tone(1500, 0.12, { type: 'square', vol: 0.06 * v, slide: 900, at: 0.18, filter: 2500, ...P });
        break;
      case 'clatter':
        for (let i = 0; i < 3; i++) this.tone(900 + Math.random() * 1200, 0.07, { type: 'square', vol: 0.05 * v, at: i * 0.06, filter: 3000, ...P });
        this.noise(0.08, { vol: 0.1 * v, freq: 2500, ...P });
        break;
      case 'bang':
        this.noise(0.6, { vol: 0.6 * v, type: 'lowpass', freq: 3000, sweep: 200, ...P });
        this.tone(60, 0.5, { vol: 0.5 * v, slide: 30, ...P });
        break;
      case 'gunshot':
        this.noise(0.35, { vol: 0.5 * v, type: 'lowpass', freq: 5000, sweep: 300, ...P });
        this.tone(140, 0.18, { type: 'square', vol: 0.2 * v, slide: 50, filter: 1200, ...P });
        break;
      case 'rifle':
        this.noise(0.15, { vol: 0.35, type: 'highpass', freq: 1200, sweep: 3000 });
        this.tone(220, 0.08, { type: 'square', vol: 0.12, slide: 80, filter: 2000 });
        break;
      case 'click':
        this.tone(1800, 0.03, { type: 'square', vol: 0.06 * v, filter: 4000, ...P });
        break;
      case 'slip':
        this.tone(500, 0.35, { type: 'sine', vol: 0.25 * v, slide: 1600, ...P });
        this.tone(1600, 0.5, { type: 'sine', vol: 0.22 * v, slide: 300, at: 0.35, ...P });
        break;
      case 'nom':
        for (let i = 0; i < 3; i++) this.noise(0.06, { vol: 0.12, freq: 700, q: 3, at: i * 0.18 });
        break;
      case 'scream': {
        const pitch = opts.pitch || 1;
        this.tone(700 * pitch * r(), 0.7, { type: 'sawtooth', vol: 0.12 * v, slide: 1100 * pitch, filter: 2200, q: 6, ...P });
        this.tone(1050 * pitch, 0.6, { type: 'triangle', vol: 0.06 * v, slide: 1400 * pitch, at: 0.05, ...P });
        break;
      }
      case 'huh':
        this.tone(260 * r(), 0.22, { type: 'triangle', vol: 0.12 * v, slide: 420, ...P });
        break;
      case 'splash':
        this.noise(0.8, { vol: 0.35 * v, type: 'lowpass', freq: 4000, sweep: 400, ...P });
        this.noise(0.3, { vol: 0.2 * v, freq: 1800, q: 1.5, at: 0.05, ...P });
        break;
      case 'chomp':
        this.tone(70, 0.3, { type: 'square', vol: 0.3 * v, slide: 40, filter: 500, ...P });
        this.noise(0.25, { vol: 0.35 * v, freq: 900, q: 1, ...P });
        this.tone(60, 0.3, { type: 'square', vol: 0.25 * v, slide: 35, filter: 500, at: 0.25, ...P });
        break;
      case 'burp':
        this.tone(110, 0.5, { type: 'sawtooth', vol: 0.2 * v, slide: 70, filter: 400, q: 4, ...P });
        break;
      case 'crash':
        this.noise(1.2, { vol: 0.45 * v, type: 'highpass', freq: 2000, sweep: 6000, ...P });
        this.tone(70, 0.6, { vol: 0.5 * v, slide: 35, ...P });
        for (let i = 0; i < 8; i++) this.tone(2000 + Math.random() * 3000, 0.25, { vol: 0.05 * v, at: Math.random() * 0.6, ...P });
        break;
      case 'snap':
        this.noise(0.08, { vol: 0.4 * v, freq: 2500, q: 0.8, ...P });
        this.tone(300, 0.15, { type: 'square', vol: 0.1 * v, slide: 90, filter: 1200, ...P });
        break;
      case 'ratchet':
        this.tone(1100 * r(), 0.03, { type: 'square', vol: 0.06 * v, filter: 3000, ...P });
        break;
      case 'pour':
        this.noise(0.9, { vol: 0.08 * v, freq: 1400, q: 3, sweep: 2600, ...P });
        break;
      case 'vomit':
        this.noise(0.6, { vol: 0.2 * v, freq: 400, q: 2, sweep: 200, ...P });
        this.tone(150, 0.6, { type: 'sawtooth', vol: 0.08 * v, slide: 90, filter: 500, ...P });
        break;
      case 'flush':
        this.noise(1.4, { vol: 0.25 * v, freq: 1200, q: 0.8, sweep: 300, ...P });
        break;
      case 'zap':
        this.tone(60, 1.2, { type: 'sawtooth', vol: 0.25 * v, ...P });
        this.tone(120, 1.2, { type: 'square', vol: 0.12 * v, filter: 3000, ...P });
        this.noise(1.2, { vol: 0.2 * v, freq: 5000, q: 0.5, ...P });
        break;
      case 'hiss':
        this.noise(1.5, { vol: 0.2 * v, type: 'highpass', freq: 3000, ...P });
        break;
      case 'creak':
        this.tone(140, 0.8, { type: 'sawtooth', vol: 0.08 * v, slide: 90, filter: 500, q: 8, ...P });
        break;
      case 'airhorn':
        for (let i = 0; i < 3; i++) for (const f of [466, 554, 698]) this.tone(f, 0.22, { type: 'sawtooth', vol: 0.06 * v, at: i * 0.28, filter: 2500, ...P });
        break;
      case 'slash':
        this.noise(0.15, { vol: 0.25 * v, freq: 4000, q: 2, sweep: 1500, ...P });
        break;
      default:
        this.tone(440, 0.1, { vol: 0.05 * v, ...P });
    }
  }

  stinger(name) {
    if (!this.ctx) return;
    const B = this.musicBus;
    switch (name) {
      case 'spotted':
        for (const f of [311, 330, 466, 494]) this.tone(f, 0.6, { type: 'sawtooth', vol: 0.09, filter: 2400, dest: B });
        this.noise(0.4, { vol: 0.2, freq: 800, q: 0.5, dest: B });
        this.tone(73, 0.8, { vol: 0.3, slide: 55, dest: B });
        break;
      case 'kill':
        [62, 65, 69, 72, 76, 81].forEach((m, i) => this.tone(NOTE(m), 0.9, { type: 'triangle', vol: 0.12, at: i * 0.07, dest: B }));
        this.tone(NOTE(38), 1.4, { vol: 0.3, dest: B });
        break;
      case 'body':
        this.tone(NOTE(41), 1.0, { type: 'sawtooth', vol: 0.12, filter: 800, dest: B });
        this.tone(NOTE(42), 1.0, { type: 'sawtooth', vol: 0.1, filter: 800, at: 0.05, dest: B });
        break;
      case 'opportunity':
        [74, 79, 83, 86, 91].forEach((m, i) => this.tone(NOTE(m), 0.5, { type: 'sine', vol: 0.1, at: i * 0.06, dest: B }));
        break;
      case 'death':
        [58, 57, 56, 55].forEach((m, i) => this.tone(NOTE(m - 12), 0.45 + (i === 3 ? 0.6 : 0), { type: 'sawtooth', vol: 0.12, filter: 900, q: 3, at: i * 0.38, slide: i === 3 ? NOTE(m - 13) : null, dest: B }));
        break;
      case 'win':
        [62, 66, 69, 74, 78, 81, 86].forEach((m, i) => this.tone(NOTE(m), 0.7, { type: 'triangle', vol: 0.12, at: i * 0.09, dest: B }));
        [50, 57, 62].forEach((m) => this.tone(NOTE(m), 2.0, { type: 'sawtooth', vol: 0.06, filter: 1500, at: 0.6, dest: B }));
        break;
    }
  }

  // ---------------------------------------------------------------- music
  startMusic() {
    this.unlock();
    if (!this.ctx || this.started) return;
    this.started = true;
    this.tempo = 104;
    this.stepDur = 60 / this.tempo / 4;
    this.nextT = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.bar = 0;
    this.timer = setInterval(() => this._schedule(), 25);
    this.setIntensity(0);
  }
  stopMusic() {
    clearInterval(this.timer);
    this.started = false;
  }
  setIntensity(level) {
    this.intensity = level;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const targets = [
      { bass: 0.5, keys: 0.35, brush: 0.3, tension: 0, pulse: 0, drums: 0, brass: 0 },
      { bass: 0.5, keys: 0.22, brush: 0.3, tension: 0.35, pulse: 0.25, drums: 0, brass: 0 },
      { bass: 0.55, keys: 0.12, brush: 0.2, tension: 0.4, pulse: 0.5, drums: 0.25, brass: 0 },
      { bass: 0.6, keys: 0, brush: 0.1, tension: 0.3, pulse: 0.5, drums: 0.6, brass: 0.45 },
    ][level];
    for (const [k, v] of Object.entries(targets)) {
      const g = this.layerGains[k];
      if (!g) continue;
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(v, t, level === 3 ? 0.15 : 1.0);
    }
  }
  _schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextT < ctx.currentTime + 0.12) {
      this._playStep(this.step, this.bar, this.nextT);
      this.nextT += this.stepDur * (this.step % 2 === 0 ? 1.12 : 0.88); // swing
      this.step++;
      if (this.step >= 16) {
        this.step = 0;
        this.bar = (this.bar + 1) % 4;
      }
    }
  }
  _note(layer, midi, t, dur, { type = 'sine', vol = 0.2, attack = 0.005, filter = null, q = 1, slide = null } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(NOTE(midi), t);
    if (slide) o.frequency.exponentialRampToValueAtTime(NOTE(slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    let n = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      f.Q.value = q;
      o.connect(f);
      n = f;
    }
    n.connect(g);
    g.connect(this.layerGains[layer]);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }
  _hit(layer, t, { dur = 0.05, vol = 0.2, type = 'highpass', freq = 6000, q = 1, tone = null } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.layerGains[layer]);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
    if (tone) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(tone[0], t);
      o.frequency.exponentialRampToValueAtTime(tone[1], t + dur);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(vol * 1.6, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g2);
      g2.connect(this.layerGains[layer]);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }
  _playStep(step, bar, t) {
    const ch = CHORDS[bar];
    const lvl = this.intensity;
    const sd = this.stepDur;
    // bass: walking quarters (calm), driving eighths (combat)
    if (step % 4 === 0) this._note('bass', ch.walk[step / 4], t, sd * 3.2, { type: 'triangle', vol: 0.5, attack: 0.01, filter: 900 });
    if (lvl >= 3 && step % 2 === 1) this._note('bass', ch.walk[0] + (step % 8 === 3 ? 12 : 0), t, sd * 0.9, { type: 'sawtooth', vol: 0.18, filter: 700, q: 4 });
    // keys: off-beat chord stabs + melody
    if (step === 4 || step === 12 || (step === 10 && bar % 2)) {
      for (const m of ch.tones.slice(0, 4)) this._note('keys', m, t, sd * 2.5, { type: 'sine', vol: 0.07, attack: 0.01 });
    }
    const mel = MELODY[bar][step];
    if (mel) this._note('keys', mel, t, sd * 3, { type: 'triangle', vol: 0.09, attack: 0.005 });
    // brushes / ride
    if (step % 4 === 0 || step % 4 === 3) this._hit('brush', t, { dur: 0.07, vol: step % 8 === 4 ? 0.12 : 0.07, freq: 7000 });
    if (step === 4 || step === 12) this._hit('brush', t, { dur: 0.18, vol: 0.08, type: 'bandpass', freq: 2500, q: 0.6 });
    // tension: sustained high strings on chord change + minor second rub
    if (step === 0) {
      for (const m of [ch.tones[2] + 12, ch.tones[3] + 12]) this._note('tension', m, t, sd * 15, { type: 'sawtooth', vol: 0.03, attack: 0.6, filter: 1800 });
      this._note('tension', ch.tones[0] + 13, t, sd * 15, { type: 'sawtooth', vol: 0.012, attack: 1.2, filter: 1400 });
    }
    // pulse: heartbeat / ostinato
    if (step === 0 || step === 3) this._hit('pulse', t, { dur: 0.16, vol: 0.4, type: 'lowpass', freq: 160, tone: [80, 45] });
    if (step % 2 === 0) this._note('pulse', ch.walk[0] + 24, t, sd * 0.5, { type: 'square', vol: 0.025, filter: 1200 });
    // drums (search/combat)
    if (step % 4 === 0) this._hit('drums', t, { dur: 0.18, vol: 0.6, type: 'lowpass', freq: 180, tone: [110, 45] });
    if (step === 4 || step === 12) this._hit('drums', t, { dur: 0.15, vol: 0.35, type: 'bandpass', freq: 1800, q: 0.7 });
    if (lvl >= 3) this._hit('drums', t, { dur: 0.03, vol: 0.08, freq: 8000 });
    if (lvl >= 3 && (step === 14 || step === 15) && bar === 3) this._hit('drums', t, { dur: 0.12, vol: 0.3, type: 'bandpass', freq: 1500 });
    // brass stabs (combat)
    if ((step === 0 || step === 6 || (step === 10 && bar % 2 === 1)) && lvl >= 3) {
      for (const m of ch.tones.slice(0, 3)) this._note('brass', m - 12, t, sd * (step === 0 ? 2.5 : 1.2), { type: 'sawtooth', vol: 0.06, attack: 0.02, filter: 1600, q: 2 });
    }
  }

  // ---------------------------------------------------------------- ambience
  ambience(on) {
    if (!this.ctx) return;
    if (on && !this.amb) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 500;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.12;
      const lg = ctx.createGain();
      lg.gain.value = 0.035;
      lfo.connect(lg);
      lg.connect(g.gain);
      src.connect(f);
      f.connect(g);
      g.connect(this.ambBus);
      src.start();
      lfo.start();
      // crowd murmur
      const src2 = ctx.createBufferSource();
      src2.buffer = this.noiseBuf;
      src2.loop = true;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 450;
      f2.Q.value = 1.4;
      const g2 = ctx.createGain();
      g2.gain.value = 0;
      src2.connect(f2);
      f2.connect(g2);
      g2.connect(this.ambBus);
      src2.start();
      this.amb = { waves: g, crowd: g2 };
    }
  }

  update(dt, game) {
    if (!this.ctx) return;
    const p = game.player;
    this.listener.x = p.pos.x;
    this.listener.z = p.pos.z;
    this.listener.yaw = game.cam.yaw;
    if (this.amb) {
      let crowd = 0;
      for (const n of game.npcs) {
        if (n.inert || n.gone || n.role !== 'guest') continue;
        const d = n.distTo(p.pos);
        if (d < 12) crowd += (1 - d / 12) * 0.012;
      }
      const t = this.ctx.currentTime;
      this.amb.crowd.gain.setTargetAtTime(Math.min(0.06, crowd), t, 0.5);
      const shore = Math.max(0, 1 - Math.max(0, -game.world.landSDF(p.pos.x, p.pos.z)) / 20);
      this.amb.waves.gain.setTargetAtTime(0.025 + shore * 0.06, t, 0.5);
      // seagulls
      this._gull = (this._gull || 4) - dt;
      if (this._gull <= 0) {
        this._gull = 6 + Math.random() * 10;
        if (shore > 0.2) {
          const base = 1400 + Math.random() * 400;
          for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) this.tone(base, 0.18, { type: 'triangle', vol: 0.03, slide: base * 0.7, at: i * 0.22, dest: this.ambBus, pan: Math.random() - 0.5 });
        }
      }
    }
  }
}
