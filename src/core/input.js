// Unified input: keyboard + mouse on desktop, floating joystick + context
// buttons on touch. The game reads a simple per-frame state.
import { clamp } from './util.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.run = false;
    this.edges = new Set();
    this.useHeld = false;
    this.aim = null; // {x,y} screen-space direction while aiming by touch
    this.senseHeld = false;
    this.camRotate = 0;
    this.camZoom = 0;
    this.mouse = { x: 0, y: 0, active: false, lastMove: -1e9 };
    this.lastDevice = 'kbm';
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, radius: 62, runHold: 0 };
    this.camTouch = null;
    this.pinch = null;
    this.enabled = true;
    this.touchUI = null;
    this._bind();
  }

  pressed(name) {
    return this.edges.has(name);
  }

  fire(name) {
    this.edges.add(name);
  }

  endFrame() {
    this.edges.clear();
    this.camRotate = 0;
    this.camZoom = 0;
  }

  _bind() {
    const kmap = {
      KeyE: 'primary', Enter: 'primary', KeyF: 'secondary', Space: 'use', KeyQ: 'itemNext',
      KeyC: 'sneak', ControlLeft: 'sneak', KeyG: 'drop', Escape: 'pause', KeyP: 'pause', KeyM: 'map',
      BracketLeft: 'rotL', BracketRight: 'rotR', Digit0: 'holster', Backquote: 'holster', KeyH: 'help',
      KeyZ: 'rotL', KeyX: 'rotR', KeyT: 'throw',
    };
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.lastDevice = 'kbm';
      document.body.classList.remove('touch-mode');
      if (e.code === 'Tab') e.preventDefault();
      if (e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) {
        const a = kmap[e.code];
        if (a) this.fire(a);
        if (e.code.startsWith('Digit')) {
          const n = parseInt(e.code.slice(5), 10);
          if (n >= 1) this.fire('item' + n);
        }
        if (e.code === 'Space') this.useHeld = true;
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') {
        this.useHeld = false;
      }
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.useHeld = false;
      this.senseHeld = false;
    });

    // Mouse
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    let rdrag = null;
    c.addEventListener('mousedown', (e) => {
      this.lastDevice = 'kbm';
      if (e.button === 2 || e.button === 1) {
        rdrag = { x: e.clientX };
      } else if (e.button === 0) {
        this.mouse.active = true;
        this.mouse.lastMove = performance.now();
        this.fire('click');
      }
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (e.movementX || e.movementY) {
        this.mouse.lastMove = performance.now();
        this.mouse.active = true;
      }
      if (rdrag) {
        this.camRotate += (e.clientX - rdrag.x) * 0.006;
        rdrag.x = e.clientX;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2 || e.button === 1) rdrag = null;
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.camZoom += Math.sign(e.deltaY) * 0.08;
      },
      { passive: false }
    );

    // Touch on canvas: camera rotate (one finger) / pinch zoom (two fingers).
    c.addEventListener('touchstart', (e) => this._canvasTouch(e, 'start'), { passive: false });
    c.addEventListener('touchmove', (e) => this._canvasTouch(e, 'move'), { passive: false });
    c.addEventListener('touchend', (e) => this._canvasTouch(e, 'end'), { passive: false });
    c.addEventListener('touchcancel', (e) => this._canvasTouch(e, 'end'), { passive: false });
  }

  _canvasTouch(e, kind) {
    e.preventDefault();
    this._setTouchMode();
    const touches = [...e.touches].filter((t) => t.identifier !== this.joy.id);
    if (touches.length >= 2) {
      const [a, b] = touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const ang = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
      if (this.pinch) {
        this.camZoom -= (d - this.pinch.d) * 0.004;
        let da = ang - this.pinch.a;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        this.camRotate -= da;
      }
      this.pinch = { d, a: ang };
      this.camTouch = null;
      return;
    }
    this.pinch = null;
    if (kind === 'start' && e.changedTouches.length) {
      const t = e.changedTouches[0];
      if (t.identifier === this.joy.id) return;
      // Left part of the screen spawns the joystick even on the canvas.
      if (t.clientX < window.innerWidth * 0.42 && this.joy.id === null) {
        this._joyStart(t);
        return;
      }
      this.camTouch = { id: t.identifier, x: t.clientX, y: t.clientY, moved: 0, t0: performance.now() };
    } else if (kind === 'move' && this.camTouch) {
      for (const t of e.changedTouches) {
        if (t.identifier === this.camTouch.id) {
          const dx = t.clientX - this.camTouch.x;
          this.camRotate += dx * 0.008;
          this.camTouch.moved += Math.abs(dx);
          this.camTouch.x = t.clientX;
        }
      }
    } else if (kind === 'end') {
      for (const t of e.changedTouches) {
        if (this.camTouch && t.identifier === this.camTouch.id) {
          this.camTouch = null;
        }
      }
    }
    // Joystick tracking also happens here when the joystick began on canvas.
    if (this.joy.id !== null) {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          if (kind === 'move') this._joyMove(t);
          if (kind === 'end') this._joyEnd();
        }
      }
    }
  }

  _setTouchMode() {
    if (this.lastDevice !== 'touch') {
      this.lastDevice = 'touch';
      document.body.classList.add('touch-mode');
    }
  }

  // Wire up DOM touch controls created by the UI.
  attachTouchUI(ui) {
    this.touchUI = ui;
    const zone = ui.joyZone;
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._setTouchMode();
      if (this.joy.id !== null) return;
      this._joyStart(e.changedTouches[0]);
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === this.joy.id) this._joyMove(t);
    }, { passive: false });
    const end = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === this.joy.id) this._joyEnd();
    };
    zone.addEventListener('touchend', end, { passive: false });
    zone.addEventListener('touchcancel', end, { passive: false });

    const tapBtn = (el, name, holdName) => {
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._setTouchMode();
        el.classList.add('down');
        this.fire(name);
        if (holdName) this[holdName] = true;
      }, { passive: false });
      const up = (e) => {
        e.preventDefault();
        el.classList.remove('down');
        if (holdName) this[holdName] = false;
      };
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
      // Mouse fallback (desktop clicking the on-screen buttons).
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.fire(name);
        if (holdName) this[holdName] = true;
      });
      el.addEventListener('mouseup', () => {
        if (holdName) this[holdName] = false;
      });
    };
    tapBtn(ui.btnPrimary, 'primary');
    tapBtn(ui.btnSecondary, 'secondary');
    tapBtn(ui.btnSneak, 'sneak');
    tapBtn(ui.btnSense, 'senseTap', 'senseHeld');

    // Use button: tap = use with auto-aim, drag = manual aim, release throws.
    const ub = ui.btnUse;
    let ut = null;
    ub.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._setTouchMode();
      const t = e.changedTouches[0];
      ut = { id: t.identifier, x: t.clientX, y: t.clientY, dragging: false };
      ub.classList.add('down');
      this.useHeld = true;
      this.aim = null;
    }, { passive: false });
    ub.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!ut) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== ut.id) continue;
        const dx = t.clientX - ut.x, dy = t.clientY - ut.y;
        const m = Math.hypot(dx, dy);
        if (m > 18) ut.dragging = true;
        if (ut.dragging) this.aim = { x: dx / Math.max(m, 1), y: -dy / Math.max(m, 1), mag: clamp(m / 120, 0.2, 1) };
      }
    }, { passive: false });
    const uend = (e) => {
      e.preventDefault();
      if (!ut) return;
      ub.classList.remove('down');
      this.useHeld = false;
      this.fire(ut.dragging ? 'useAimed' : 'use');
      if (!ut.dragging) this.aim = null;
      ut = null;
    };
    ub.addEventListener('touchend', uend, { passive: false });
    ub.addEventListener('touchcancel', uend, { passive: false });
    ub.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.fire('use');
    });
  }

  _joyStart(t) {
    const j = this.joy;
    j.id = t.identifier;
    j.ox = t.clientX;
    j.oy = t.clientY;
    j.x = 0;
    j.y = 0;
    j.runHold = 0;
    if (this.touchUI) this.touchUI.showJoystick(j.ox, j.oy);
  }
  _joyMove(t) {
    const j = this.joy;
    let dx = t.clientX - j.ox;
    let dy = t.clientY - j.oy;
    const m = Math.hypot(dx, dy);
    const over = m - j.radius;
    if (over > 40) {
      // Drag the base along so the stick never "runs out".
      j.ox += (dx / m) * (over - 40);
      j.oy += (dy / m) * (over - 40);
      dx = t.clientX - j.ox;
      dy = t.clientY - j.oy;
    }
    const mm = Math.hypot(dx, dy);
    const k = Math.min(mm, j.radius) / Math.max(mm, 1e-6);
    j.x = (dx * k) / j.radius;
    j.y = (-dy * k) / j.radius;
    j.over = mm > j.radius * 1.12;
    if (this.touchUI) this.touchUI.moveJoystick(j.ox, j.oy, dx * k, dy * k, j.over);
  }
  _joyEnd() {
    const j = this.joy;
    j.id = null;
    j.x = 0;
    j.y = 0;
    j.over = false;
    if (this.touchUI) this.touchUI.hideJoystick();
  }

  // Called each frame before the game reads input.
  poll() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (x || y) {
      const m = Math.hypot(x, y);
      x /= m;
      y /= m;
      this.run = k.has('ShiftLeft') || k.has('ShiftRight');
    } else if (this.joy.id !== null) {
      x = this.joy.x;
      y = this.joy.y;
      const mag = Math.hypot(x, y);
      // Dead zone + response curve for fine control.
      if (mag < 0.12) {
        x = 0;
        y = 0;
      } else {
        const nm = clamp((mag - 0.12) / 0.88, 0, 1);
        const curved = 0.35 + nm * 0.65;
        x = (x / mag) * curved;
        y = (y / mag) * curved;
      }
      this.run = !!this.joy.over;
    } else {
      this.run = false;
    }
    this.move.x = x;
    this.move.y = y;
    this.senseHeldKey = k.has('Tab') || k.has('KeyV');
  }

  get sense() {
    return this.senseHeld || this.senseHeldKey;
  }
}
