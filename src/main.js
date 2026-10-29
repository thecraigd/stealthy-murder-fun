// Boot: settings, progress, audio, the game, and the menus.
import * as THREE from 'three';
import { Game } from './game/game.js';
import { Menus } from './game/menus.js';
import { AudioEngine } from './core/audio.js';
import { Progress, Challenges } from './game/challenges.js';
import { G } from './core/materials.js';

const SKEY = 'cleanslate.settings.v1';
const coarse = matchMedia('(pointer: coarse)').matches;
const DEFAULTS = {
  music: 0.6, sfx: 0.85, quality: coarse ? 'medium' : 'high', guidance: true, cones: 'guards',
  killcam: true, slowmo: true, targetXray: true, showNoise: false,
};

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SKEY) || '{}') };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

const bootFill = document.getElementById('boot-fill');
const setBoot = (k) => bootFill && (bootFill.style.width = `${Math.round(k * 100)}%`);

class App {
  constructor() {
    this.settings = loadSettings();
    this.progress = new Progress();
    this.audio = new AudioEngine(this.settings);
    this.challenges = new Challenges(this.progress);
    this.game = new Game({ settings: this.settings, audio: this.audio, progress: this.progress, challenges: this.challenges });
    this.menus = null;
    this.lastStart = sessionStorage.getItem('cs.lastStart') || 'pier';
    this.lastItem = sessionStorage.getItem('cs.lastItem') || 'none';
  }

  async boot() {
    setBoot(0.15);
    await nextFrame();
    if (!webglOK()) {
      document.getElementById('boot').innerHTML = '<div class="boot-title">CLEAN SLATE</div><div class="boot-sub">Sorry — this game needs WebGL, which your browser doesn’t seem to support.</div>';
      return;
    }
    this.game.init(document.getElementById('game'));
    setBoot(0.7);
    await nextFrame();
    this.menus = new Menus(this);
    this.menus.makePortraits();
    setBoot(1);
    this.game.on('pause', () => this.menus.pause());
    this.game.on('complete', (info) => setTimeout(() => this.menus.results(info), 200));
    this.game.on('failed', (info) => this.menus.failed(info));
    this.game.on('gfxReload', () => {
      sessionStorage.setItem('cs.gfxSafe', '1');
      setTimeout(() => (this.game.running ? this.restart() : location.reload()), 1200);
    });
    // unlock audio on first interaction anywhere
    const unlock = () => {
      this.audio.unlock();
      if (!this.game.running) {
        this.audio.startMusic();
        this.audio.setIntensity(0);
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game.running && !this.game.paused) this.game.pause();
    });
    await nextFrame();
    document.getElementById('boot').classList.add('done');
    setTimeout(() => document.getElementById('boot')?.remove(), 600);

    const auto = sessionStorage.getItem('cs.autostart');
    if (auto) {
      sessionStorage.removeItem('cs.autostart');
      const a = JSON.parse(auto);
      this.start(a.start, a.item);
    } else {
      this.menus.title();
      this.game.gfx.check('title');
    }
    this.last = performance.now();
    requestAnimationFrame(this.loop);
    window.__game = this.game;
    window.__app = this;
  }

  loop = () => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const g = this.game;
    if (g.manual) return;
    if (g.running) {
      g.frame(dt);
    } else {
      // title fly-over
      this.titleT = (this.titleT || 0) + dt;
      G.uTime.value += dt;
      const t = this.titleT * 0.05 + 0.6;
      const cam = g.cam.camera;
      cam.position.set(Math.sin(t) * 62, 34, Math.cos(t) * 62 - 2);
      cam.lookAt(0, -2, -2);
      G.uCutOn.value = 0;
      for (const r of g.level.roofs) {
        r.fade.value = 0;
        r.group.visible = true;
      }
      g.sun.position.set(22, 40, 16);
      g.sun.target.position.set(0, 0, 0);
      g.render();
    }
  };

  // Phones: go fullscreen + landscape so the browser bar stops eating the view.
  // Needs a user gesture, so it's called from button handlers.
  fullscreen() {
    if (!coarse || document.fullscreenElement || document.webkitFullscreenElement) return;
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      p?.then?.(() => screen.orientation?.lock?.('landscape')?.catch(() => {})).catch(() => {});
    } catch (e) {
      /* not allowed here: fine */
    }
  }

  start(start, item) {
    this.fullscreen();
    this.lastStart = start;
    this.lastItem = item;
    sessionStorage.setItem('cs.lastStart', start);
    sessionStorage.setItem('cs.lastItem', item);
    this.audio.unlock();
    this.menus.close();
    this.game.startMission({ start, item });
  }
  resume() {
    this.menus.close();
    this.game.resume();
  }
  restart() {
    sessionStorage.setItem('cs.autostart', JSON.stringify({ start: this.lastStart, item: this.lastItem }));
    location.reload();
  }
  quit() {
    sessionStorage.removeItem('cs.autostart');
    location.reload();
  }
  saveSettings() {
    try {
      localStorage.setItem(SKEY, JSON.stringify(this.settings));
    } catch (e) {
      /* ignore */
    }
  }
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false;
  }
}

window.addEventListener('error', (e) => {
  console.error(e.error || e.message);
});

new App().boot();
