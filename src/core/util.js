// Small math + misc helpers shared everywhere.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Frame-rate independent exponential smoothing.
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function wrapAngle(a) {
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

export const angleDiff = (a, b) => wrapAngle(b - a);

export function dampAngle(a, b, lambda, dt) {
  return a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));
}

export function approachAngle(a, b, maxStep) {
  const d = angleDiff(a, b);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

export const dist = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);
export const dist2 = (ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az;
  return dx * dx + dz * dz;
};

// Yaw such that forward = (sin yaw, cos yaw) in XZ.
export const yawTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length) % arr.length];

export function shuffle(arr, r = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const isTouchDevice = () =>
  'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;

// Simple event emitter.
export class Emitter {
  constructor() {
    this._h = new Map();
  }
  on(name, fn) {
    if (!this._h.has(name)) this._h.set(name, []);
    this._h.get(name).push(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    const l = this._h.get(name);
    if (!l) return;
    const i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  }
  emit(name, ...args) {
    const l = this._h.get(name);
    if (!l) return;
    for (const fn of l.slice()) fn(...args);
  }
}

export function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Game-time scheduler (pauses with the game, respects slow-motion).
export const timers = {
  list: [],
  now: 0,
  after(sec, fn) {
    this.list.push({ t: this.now + sec, fn });
  },
  update(now) {
    this.now = now;
    if (!this.list.length) return;
    const due = [];
    this.list = this.list.filter((x) => {
      if (x.t <= now) {
        due.push(x);
        return false;
      }
      return true;
    });
    due.sort((a, b) => a.t - b.t);
    for (const x of due) {
      try {
        x.fn();
      } catch (e) {
        console.error(e);
      }
    }
  },
};
export const after = (sec, fn) => timers.after(sec, fn);
