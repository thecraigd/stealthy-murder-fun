// Graphics self-check. Some phone GPUs choke on one of our rendering tricks and
// show a blank frame while the game runs fine underneath. After the first
// frames we read back a grid of pixels; if the frame is one flat colour we
// switch features off, turn them back on one at a time to find the culprit,
// and remember the result for this device. If even that fails we reload once
// with a conservative WebGL context, and as a last resort show a report.
import * as THREE from 'three';
import { GFX } from './materials.js';

const KEY = 'cleanslate.gfx.v1';
export const FEATURES = ['shadows', 'xray', 'cutaway', 'ocean', 'fog', 'outlines', 'sky', 'fx'];
const LABELS = {
  shadows: 'shadows', xray: 'see-through silhouettes', cutaway: 'wall cutaway', ocean: 'ocean shader',
  fog: 'fog', outlines: 'ink outlines', sky: 'sky gradient', fx: 'particles',
};
const params = new URLSearchParams(location.search);

export function loadGfxProfile() {
  if (params.has('gfxreset')) clearGfxProfile();
  if (params.has('safe')) forceSafeGfx();
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null') || { safeContext: false, off: [] };
  } catch (e) {
    return { safeContext: false, off: [] };
  }
}
function saveGfxProfile(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch (e) {
    /* private mode: fixes just won't stick */
  }
}
// Manual escape hatch (Settings or ?safe): conservative context from now on.
export function forceSafeGfx() {
  const p = { ...(loadStored() || { off: [] }), safeContext: true, manual: true };
  saveGfxProfile(p);
}
function loadStored() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (e) {
    return null;
  }
}
export function clearGfxProfile() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    /* ignore */
  }
}

function gpuInfo(gl) {
  const out = { version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(gl.RENDERER), vendor: gl.getParameter(gl.VENDOR) };
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (ext) {
    out.renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || out.renderer;
    out.vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || out.vendor;
  }
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  out.fragHighp = !!(hp && hp.precision > 0);
  out.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const a = gl.getContextAttributes() || {};
  out.ctx = `aa:${a.antialias} alpha:${a.alpha} depth:${a.depth} stencil:${a.stencil}`;
  out.depthBits = gl.getParameter(gl.DEPTH_BITS);
  return out;
}

export class GfxGuard {
  constructor(game) {
    this.game = game;
    this.r = game.renderer;
    this.gl = this.r.getContext();
    this.profile = loadGfxProfile();
    this.info = gpuInfo(this.gl);
    this.lines = [];
    this.errors = [];
    this.state = 'idle';
    this.wait = 0;
    this.skyTex = null;
    this.fogObj = null;
    this.debug = params.has('debug');
    const r = this.r;
    r.debug.onShaderError = (gl, program, vs, fs) => {
      const lg = (s) => (gl.getShaderInfoLog(s) || '').trim();
      const msg = `Shader error: ${gl.getProgramInfoLog(program) || ''} ${lg(vs)} ${lg(fs)}`.replace(/\s+/g, ' ').slice(0, 400);
      console.error(msg);
      this.error(msg);
    };
    const cv = r.domElement;
    cv.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.error('WebGL context lost');
      this.showReport('The browser reset the graphics. Reloading usually fixes it.');
    });
    cv.addEventListener('webglcontextrestored', () => this.note('WebGL context restored'));
    window.addEventListener('error', (e) => this.error(`JS: ${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
    window.addEventListener('unhandledrejection', (e) => this.error(`Promise: ${e.reason?.message || e.reason}`));
    this.note(`GPU: ${this.info.renderer} (${this.info.vendor})`);
    this.note(`${this.info.version}; ${this.info.ctx}; depth bits ${this.info.depthBits}; frag highp ${this.info.fragHighp}; max tex ${this.info.maxTex}`);
    this.note(`Screen ${innerWidth}x${innerHeight} @${devicePixelRatio}; profile: ${this.profile.safeContext ? 'safe context, ' : ''}off=[${this.profile.off.join(', ')}]`);
    this.breakHook();
  }

  note(s) {
    this.lines.push(s);
    if (this.lines.length > 80) this.lines.shift();
    if (this.panel) this.renderReport();
  }
  error(s) {
    this.errors.push(s);
    this.note('⚠ ' + s);
  }

  // Apply the remembered fixes once the world exists.
  applyProfile() {
    this.skyTex = this.game.scene.background;
    this.fogObj = this.game.scene.fog;
    for (const f of this.profile.off) if (FEATURES.includes(f)) this.setFeature(f, false);
    if (this.debug) this.showReport();
  }

  // --------------------------------------------------------------- features
  setFeature(name, on) {
    const g = this.game;
    const scene = g.scene;
    GFX[name] = on;
    switch (name) {
      case 'shadows': {
        const want = on && g.settings.quality !== 'low';
        if (this.r.shadowMap.enabled !== want) {
          this.r.shadowMap.enabled = want;
          g.sun.castShadow = want;
          this.recompile();
        }
        break;
      }
      case 'xray':
        scene.traverse((o) => {
          if (o.isSkinnedMesh && o.renderOrder === 1 && o.material?.depthFunc === THREE.GreaterDepth) o.visible = on;
        });
        if (on && g.player) g.player.char.setXray(0xffffff);
        break;
      case 'ocean': {
        const o = scene.getObjectByName('ocean');
        if (o) {
          o.userData.fancy = o.userData.fancy || o.material;
          o.userData.plain = o.userData.plain || new THREE.MeshBasicMaterial({ color: 0x2ea8d8 });
          o.material = on ? o.userData.fancy : o.userData.plain;
        }
        break;
      }
      case 'fog': {
        const want = on ? this.fogObj : null;
        if (scene.fog !== want) {
          scene.fog = want;
          this.recompile();
        }
        break;
      }
      case 'outlines':
        this.eachMaterial((m) => {
          if (m.isMeshBasicMaterial && m.side === THREE.BackSide) m.visible = on;
        });
        break;
      case 'sky':
        scene.background = on ? this.skyTex : new THREE.Color(0x9fd4f2);
        break;
      case 'fx':
        if (g.fx) g.fx.root.visible = on;
        break;
      // 'cutaway' is read every frame by Game.updateCutaway()
    }
  }
  eachMaterial(fn) {
    this.game.scene.traverse((o) => {
      if (o.material) for (const m of [].concat(o.material)) fn(m);
    });
  }
  recompile() {
    this.eachMaterial((m) => (m.needsUpdate = true));
  }
  // Things created after a fix was applied (new characters, outlines...).
  reapply() {
    for (const f of FEATURES) if (!GFX[f]) this.setFeature(f, false);
  }

  // --------------------------------------------------------------- probing
  check(label) {
    if (this.game.manual || this.state === 'fixing') return;
    this.label = label;
    this.state = 'watch';
    this.strikes = 0;
    this.wait = 30;
  }
  probe() {
    const gl = this.gl;
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(4);
    const counts = new Map();
    for (let i = 1; i <= 5; i++) {
      for (let j = 1; j <= 4; j++) {
        gl.readPixels(Math.floor((w * i) / 6), Math.floor((h * j) / 5), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const c = (px[0] << 16) | (px[1] << 8) | px[2];
        counts.set(c, (counts.get(c) || 0) + 1);
      }
    }
    // Blank = (nearly) every sample the same pure white or pure black. A real
    // frame of the island never looks like that, even on a flat lawn.
    let top = 0, col = 0;
    for (const [c, n] of counts) if (n > top) [top, col] = [n, c];
    const r = col >> 16, g = (col >> 8) & 255, b = col & 255;
    const extreme = Math.min(r, g, b) >= 245 || Math.max(r, g, b) <= 10;
    return { ok: !(top >= 18 && extreme), n: counts.size, col: '#' + col.toString(16).padStart(6, '0') };
  }

  afterRender() {
    if ((this.state !== 'watch' && this.state !== 'fixing') || this.game.manual) return;
    if (--this.wait > 0) return;
    let res;
    try {
      res = this.probe();
    } catch (e) {
      this.error(`Probe failed: ${e.message}`);
      this.state = 'idle';
      return;
    }
    switch (this.state) {
      case 'watch':
        if (res.ok) {
          this.note(`${this.label}: frame OK (${res.n} colours sampled${this.strikes ? `, after ${this.strikes} blank probe(s)` : ''})`);
          this.state = 'idle';
          if (sessionStorage.getItem('cs.gfxSafe')) {
            sessionStorage.removeItem('cs.gfxSafe');
            this.note('Safe mode fixed it.');
            this.banner('Graphics switched to safe mode for this device. Reset in Settings.', 7);
          }
          return;
        }
        if (++this.strikes < 3) {
          this.wait = 10;
          return;
        }
        this.note(`${this.label}: blank frame (${res.n} colour(s), ${res.col}). Trying fixes…`);
        this.banner('Graphics problem detected on this device — adjusting…');
        this.state = 'fixing';
        this.sub = 'alloff';
        this.before = FEATURES.filter((f) => GFX[f]);
        for (const f of FEATURES) this.setFeature(f, false);
        this.wait = 15;
        return;
      case 'fixing':
        return this.fixStep(res);
    }
  }

  fixStep(res) {
    if (this.sub === 'alloff') {
      if (res.ok) {
        this.note('All optional features off: frame OK. Finding the culprit…');
        this.culprits = [];
        this.queue = [...this.before];
        this.sub = 'bisect';
        return this.nextFeature();
      }
      this.note(`All optional features off: still blank (${res.col}).`);
      if (!this.profile.safeContext) {
        this.profile = { ...this.profile, safeContext: true, off: [], gpu: this.info.renderer };
        saveGfxProfile(this.profile);
        this.banner('Graphics problem detected — restarting in safe mode…');
        this.state = 'reloading';
        this.game.emit('gfxReload');
        return;
      }
      // Nothing we can toggle helps. Work out which part of the scene is to
      // blame for the report, then give up gracefully.
      this.sub = 'cats';
      this.cats = this.categories();
      this.catResults = [];
      return this.nextCategory();
    }
    if (this.sub === 'bisect') {
      if (!res.ok) {
        this.culprits.push(this.cur);
        this.setFeature(this.cur, false);
        this.note(`  ${this.cur}: breaks rendering → off`);
      } else this.note(`  ${this.cur}: fine`);
      if (this.queue.length) return this.nextFeature();
      this.sub = 'confirm';
      this.wait = 10;
      return;
    }
    if (this.sub === 'confirm') {
      if (!res.ok) {
        this.note('Combination still blank: keeping every optional feature off.');
        this.culprits = [...this.before];
        for (const f of FEATURES) this.setFeature(f, false);
      }
      this.profile = { ...this.profile, off: this.culprits, gpu: this.info.renderer };
      saveGfxProfile(this.profile);
      const what = this.culprits.map((f) => LABELS[f]).join(', ');
      const ctx = this.profile.safeContext ? 'safe mode' : '';
      this.note(`Fixed. Off: ${what || 'nothing'}${ctx ? ' (+ ' + ctx + ')' : ''}`);
      this.banner(`Graphics adjusted for this device${what ? ': turned off ' + what : ''}${ctx && what ? ' + ' : ''}${ctx}. Reset in Settings.`, 7);
      this.state = 'idle';
      if (this.debug) this.showReport();
      return;
    }
    if (this.sub === 'cats') {
      const c = this.curCat;
      this.catResults.push(`${c.name}:${res.ok ? 'FIXES' : 'no'}`);
      this.hideObjects(c.objs, false);
      if (this.cats.length) return this.nextCategory();
      this.note(`Hiding parts → ${this.catResults.join(' ')}`);
      this.state = 'idle';
      this.showReport('Sorry — the graphics still aren’t drawing on this device. A screenshot of this report would help fix it.');
    }
  }
  nextFeature() {
    this.cur = this.queue.shift();
    this.setFeature(this.cur, true);
    this.wait = 15;
  }
  categories() {
    const s = this.game.scene;
    const chars = s.children.filter((o) => o.name === 'player' || this.game.npcs?.some((n) => n.group === o));
    const named = (n) => s.children.filter((o) => o.name === n);
    const other = s.children.filter((o) => !o.isLight && !chars.includes(o) && !['terrain', 'ocean', 'level', 'fx'].includes(o.name));
    return [
      { name: 'characters', objs: chars }, { name: 'terrain', objs: named('terrain') }, { name: 'ocean', objs: named('ocean') },
      { name: 'buildings', objs: named('level') }, { name: 'props', objs: other }, { name: 'fx', objs: named('fx') },
    ].filter((c) => c.objs.length);
  }
  nextCategory() {
    this.curCat = this.cats.shift();
    this.hideObjects(this.curCat.objs, true);
    this.wait = 6;
  }
  hideObjects(objs, hide) {
    for (const o of objs) o.traverse((c) => (hide ? c.layers.set(31) : c.layers.set(0)));
  }

  // --------------------------------------------------------------- UI
  banner(text, secs = 0) {
    let b = document.getElementById('gfx-banner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'gfx-banner';
      document.body.appendChild(b);
    }
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(this._bt);
    if (secs) this._bt = setTimeout(() => b.classList.remove('show'), secs * 1000);
  }
  report() {
    // GPU first, then what happened, then the rest of the device details.
    const [gpu, ctx, screen, ...events] = this.lines;
    return ['Clean Slate graphics report', gpu, ...events, ctx, screen, navigator.userAgent].join('\n');
  }
  showReport(headline = '') {
    document.getElementById('gfx-banner')?.classList.remove('show');
    if (!this.panel) {
      const p = document.createElement('div');
      p.id = 'gfx-report';
      p.innerHTML = '<div class="gr-head"></div><pre></pre><div class="gr-btns"></div>';
      const btn = (t, fn) => {
        const b = document.createElement('button');
        b.textContent = t;
        b.onclick = fn;
        p.querySelector('.gr-btns').appendChild(b);
      };
      btn('Copy', () => navigator.clipboard?.writeText(this.report()).then(() => this.note('(copied)')).catch(() => {}));
      btn('Reload', () => location.reload());
      btn('Reset fixes', () => {
        clearGfxProfile();
        location.reload();
      });
      btn('Close', () => {
        p.remove();
        this.panel = null;
      });
      document.body.appendChild(p);
      this.panel = p;
    }
    if (headline) this.headline = headline;
    this.renderReport();
  }
  renderReport() {
    this.panel.querySelector('.gr-head').textContent = this.headline || 'Graphics report';
    this.panel.querySelector('pre').textContent = this.report();
  }

  // --------------------------------------------------------------- testing
  // ?gfxbreak=<feature> paints a white full-screen layer while that feature is
  // on, mimicking a driver bug ('context' = until safe mode, 'all' = always).
  breakHook() {
    const what = params.get('gfxbreak');
    if (!what) return;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
        transparent: true,
        depthTest: false,
        depthWrite: false,
      })
    );
    m.frustumCulled = false;
    m.renderOrder = 9999;
    this.breakMesh = m;
    this.breakWhat = what;
    this.game.scene.add(m);
    const upd = () => {
      m.visible = what === 'all' ? true : what === 'context' ? !this.profile.safeContext : !!GFX[what];
      requestAnimationFrame(upd);
    };
    upd();
  }
}
