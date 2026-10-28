// Game: owns the world, the loop, and the shared API every system talks to.
import * as THREE from 'three';
import { G } from '../core/materials.js';
import { Input } from '../core/input.js';
import { Emitter, clamp, dist, yawTo, angleDiff, pick, damp, after, timers } from '../core/util.js';
import { Level } from './level.js';
import { CameraRig } from './camera.js';
import { Player } from './player.js';
import { NPC } from './npc.js';
import { buildCast, EXTRA_ANCHORS, CONVOS } from './cast.js';
import { Interactions } from './interact.js';
import { Director } from './director.js';
import { FX } from './fx.js';
import { UI } from './ui.js';
import { Story, TARGETS, OPPS } from './story.js';
import { SetPieces } from './setpieces.js';
import { ITEMS } from './items.js';
import { Tips } from './tips.js';
import { Ambient } from './ambient.js';
import { OUTFITS } from './outfits.js';
import { WATER_Y } from './terrain.js';

export const START_LOCATIONS = {
  pier: { name: 'The Pier', desc: 'Arrive by water taxi like an honest guest.', anchor: 'player_start', outfit: 'rook', mastery: 0 },
  kitchen: { name: 'Kitchen Back Door', desc: 'Start as a waiter, tray in hand.', at: { x: 23.6, z: -20.5, yaw: -Math.PI / 2 }, outfit: 'waiter', mastery: 2 },
  cargo: { name: 'Cargo Yard', desc: 'Start as a dockhand among the crates.', at: { x: -18.5, z: 27.6, yaw: Math.PI }, outfit: 'dockworker', mastery: 3 },
  spa: { name: 'Spa Lobby', desc: 'Start as a spa therapist.', at: { x: 30.0, z: -17.6, yaw: Math.PI / 2 }, outfit: 'masseur', mastery: 4 },
  security: { name: 'Security Office', desc: 'Start in a guard uniform.', at: { x: -15.5, z: -9.0, yaw: Math.PI }, outfit: 'guard', mastery: 5 },
  lighthouse: { name: 'Lighthouse', desc: 'Start as the keeper’s relief, rifle in hand.', at: { x: -36.4, z: -34.6, yaw: Math.PI * 0.8 }, outfit: 'keeper', mastery: 6, items: ['rifle'] },
};

export const LOADOUT_ITEMS = {
  none: { id: null, name: 'Nothing extra', mastery: 0 },
  lockpick: { id: 'lockpick', mastery: 1 },
  ratpoison: { id: 'ratpoison', mastery: 2 },
  banana: { id: 'banana', mastery: 2 },
  wrench: { id: 'wrench', mastery: 3 },
  deathcap: { id: 'deathcap', mastery: 4 },
  firecracker: { id: 'firecracker', mastery: 5 },
  duck: { id: 'duck', mastery: 6 },
  pistol: { id: 'pistol', mastery: 7 },
};

export class Game extends Emitter {
  constructor(opts) {
    super();
    this.opts = opts;
    this.settings = opts.settings;
    this.audio = opts.audio;
    this.progress = opts.progress;
    this.challenges = opts.challenges;
    this.time = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.hitStopT = 0;
    this.paused = true;
    this.running = false;
    this.npcs = [];
    this.sensing = false;
    this.sniper = null;
  }

  // ---------------------------------------------------------------- setup
  init(container) {
    const s = this.settings;
    const r = new THREE.WebGLRenderer({ antialias: s.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer = r;
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.mobile = mobile;
    this.pixelRatioMax = s.quality === 'high' ? 2 : s.quality === 'low' ? 1 : mobile ? 1.5 : 1.75;
    r.setPixelRatio(Math.min(devicePixelRatio, this.pixelRatioMax));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = s.quality !== 'low';
    r.shadowMap.type = THREE.PCFShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    this.canvas = r.domElement;

    const scene = new THREE.Scene();
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0xb09a7a, 1.75);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.5);
    sun.castShadow = s.quality !== 'low';
    const sm = s.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(sm, sm);
    const sc = sun.shadow.camera;
    const ext = s.quality === 'high' ? 26 : 20;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 120;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.sun = sun;
    this.sunExt = ext;

    this.level = new Level(scene);
    this.level.build();
    this.world = this.level.world;
    for (const [k, v] of Object.entries(EXTRA_ANCHORS)) this.level.anchors[k] = { name: k, ...v };

    this.cam = new CameraRig(window.innerWidth / window.innerHeight);
    this.input = new Input(this.canvas);
    this.ui = new UI(this);
    this.input.attachTouchUI(this.ui);
    this.fx = new FX(this);
    this.director = new Director(this);
    this.story = new Story(this);
    this.interactions = new Interactions(this);
    this.setpieces = new SetPieces(this);
    this.containers = this.level.containers.map((c) => ({ ...c, bodies: [] }));
    this.cones = new VisionCones(this);
    this.tips = new Tips(this);
    this.tutorial = (id) => this.tips.show(id);
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
    this.on('inventory', () => {});
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.cam.setAspect(w / h);
    if (this.sniperCam) {
      this.sniperCam.aspect = w / h;
      this.sniperCam.updateProjectionMatrix();
    }
  }

  // ---------------------------------------------------------------- mission start
  startMission({ start = 'pier', item = 'none' } = {}) {
    const loc = START_LOCATIONS[start] || START_LOCATIONS.pier;
    const a = loc.anchor ? this.anchor(loc.anchor) : loc.at;
    this.player = new Player(this, a.x, a.z, a.yaw ?? 0);
    if (loc.outfit !== 'rook') this.player.setOutfit(loc.outfit);
    this.player.add('coin', 3);
    const li = LOADOUT_ITEMS[item];
    if (li && li.id) this.player.add(li.id, 1);
    for (const id of loc.items || []) this.player.add(id, 1);
    if (start === 'kitchen') this.player.add('ratpoison', 0);
    this.player.inv = this.player.inv.filter((s) => s.count > 0);
    this.startLoc = start;
    this.loadoutItem = item;

    // NPCs
    for (const d of buildCast()) {
      const n = new NPC(this, d);
      if (d.follow) n.setState('follow');
      this.npcs.push(n);
    }
    this.npcMap = new Map(this.npcs.map((n) => [n.id, n]));
    // world items
    for (const it of this.level.items) this.interactions.spawnPickup(it.id, it.x, it.z, it.y ?? 0.02);
    this.setpieces.init();
    this.convos = new Convos(this);
    this.ambient = new Ambient(this);

    this.cam.yaw = this.cam.yawTarget = start === 'pier' ? 0 : this.cam.yaw;
    this.cam.zoom = this.cam.zoomTarget = this.mobile ? 0.25 : 0.32;
    this.cam.focus.set(this.player.pos.x, 0.8, this.player.pos.z);
    this.ui.show();
    this.paused = false;
    this.running = true;
    this.director.stats.disguises = loc.outfit === 'rook' ? 0 : 1;
    this.audio.startMusic();
    this.audio.setIntensity(0);
    this.audio.ambience(true);
    this.challenges.beginRun(this);
    // intro flourish
    after(0.4, () => this.ui.bigText('GULLCREST KEY', 'Three targets. One island. Make it right.'));
    after(3.8, () => {
      const lines = { pier: 'Here we go. Clean in, clean out. Nobody innocent gets hurt.', kitchen: 'Apron on. Smile. Nobody looks twice at the help.', cargo: 'Hard hat, hi-vis. The universal invisibility cloak.', spa: 'Cucumber water and murder. What a combination.', security: 'Borrowed badge. Try not to salute anybody.', lighthouse: 'Best seat in the house. Let\u2019s keep it quiet.' };
      this.ui.subtitle('Rook', lines[start] || lines.pier, 4);
    });
    if (start === 'pier') {
      after(4.5, () => this.ui.toast('Tip: overhear conversations to discover opportunities.', 'info', '👂'));
      after(9.5, () => this.ui.toast(this.mobile ? 'Hold 👁 Sense to see targets & guards through walls.' : 'Hold Tab / V to Sense targets & guards through walls.', 'info', '👁'));
    }
    this.last = performance.now();
    this.render();
  }

  // ---------------------------------------------------------------- loop
  loop = () => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.running) return;
    this.frame(dt);
  };
  frame(dt) {
    this.perfSample(dt);
    if (!this.paused) {
      this.update(dt);
    }
    this.render();
  }

  perfSample(dt) {
    // Auto-drop resolution if we are struggling.
    this._pf = this._pf || { t: 0, n: 0, acc: 0, done: 0 };
    const pf = this._pf;
    if (this.paused || pf.done > 2) return;
    pf.t += dt;
    pf.n++;
    pf.acc += dt;
    if (pf.t > 4) {
      const avg = pf.acc / pf.n;
      if (avg > 1 / 40 && this.settings.quality !== 'high') {
        const pr = this.renderer.getPixelRatio();
        if (pr > 1.0) {
          this.renderer.setPixelRatio(Math.max(1, pr - 0.25));
          pf.done++;
        }
      }
      pf.t = 0;
      pf.n = 0;
      pf.acc = 0;
    }
  }

  update(rawDt) {
    const input = this.input;
    input.poll();
    // time scaling
    if (this.slowT > 0) {
      this.slowT -= rawDt;
      if (this.slowT <= 0) this.timeScale = 1;
    }
    if (this.hitStopT > 0) {
      this.hitStopT -= rawDt;
      input.endFrame();
      return;
    }
    const dt = rawDt * this.timeScale;
    this.time += dt;
    timers.update(this.time);
    G.uTime.value += rawDt;

    // global input
    if (input.pressed('pause')) {
      this.pause();
      input.endFrame();
      return;
    }
    if (input.pressed('map')) this.ui.mapWrap.classList.toggle('big');
    if (input.pressed('rotL')) this.cam.snapRotate(-1);
    if (input.pressed('rotR')) this.cam.snapRotate(1);
    if (input.camRotate) this.cam.rotate(input.camRotate);
    if (input.camZoom) this.cam.zoomBy(input.camZoom);

    const p = this.player;
    if (this.sniper) {
      this.updateSniper(dt, rawDt);
    } else if (p.alive) {
      if (input.pressed('sneak') || input.pressed('senseTap') && false) {
        p.sneak = !p.sneak;
        this.ui.btnSneak.classList.toggle('on', p.sneak);
      }
      this.ui.btnSneak.classList.toggle('on', p.sneak);
      if (input.pressed('itemNext')) p.cycle(1);
      if (input.pressed('holster')) {
        p.sel = -1;
        this.emit('inventory');
      }
      for (let i = 1; i <= 9; i++) if (input.pressed('item' + i)) p.selectIndex(i - 1);
      if (input.pressed('drop')) this.dropSelected();
      // item use: keyboard space / touch tap = auto-aim; mouse click / touch drag = aimed
      if (input.pressed('use')) this.interactions.useItem(input, null);
      if (input.pressed('throw')) this.interactions.useItem(input, null, true);
      if (input.pressed('useAimed') && input.aim) this.interactions.useItem(input, this.aimFromTouch(input.aim));
      if (input.pressed('click') && !this.mobileTouchActive()) this.interactions.useItem(input, this.mouseGround());
    }
    this.sensing = input.sense && p.alive && !this.sniper;

    p.update(dt, input);
    this.interactions.update(dt, input);

    // NPCs
    for (const n of this.npcs) n.update(dt);
    this.separateNpcs();
    this.convos.update(dt);
    this.setpieces.update(dt);
    this.ambient.update(dt);
    this.director.update(dt);
    this.story.update(dt);
    this.challenges.update(dt);
    this.tips.update(rawDt);
    this.fx.update(rawDt);
    this.cones.update(dt);
    this.updateSense();

    // camera (frames remote set-piece targets when standing at their controls)
    if (!this.sniper) {
      let tgt = p.pos;
      let extra = 0;
      if (!p.drag && p.speed < 2.5) {
        for (const it of this.interactions.list) {
          if (!it.focus || (it.when && !it.when(p))) continue;
          if (typeof it.label === 'function' && !it.label(p)) continue;
          const d = dist(p.pos.x, p.pos.z, it.x, it.z);
          if (d < (it.r || 1.4) + 0.4) {
            const f = typeof it.focus === 'function' ? it.focus() : it.focus;
            tgt = { x: (p.pos.x + f.x) / 2, z: (p.pos.z + f.z) / 2 };
            extra = Math.min(0.45, dist(p.pos.x, p.pos.z, f.x, f.z) / 30);
            break;
          }
        }
      }
      this._camTgt = this._camTgt || { x: p.pos.x, z: p.pos.z };
      this._camTgt.x = damp(this._camTgt.x, tgt.x, 4, rawDt);
      this._camTgt.z = damp(this._camTgt.z, tgt.z, 4, rawDt);
      this.cam.extraZoom = damp(this.cam.extraZoom || 0, extra, 3, rawDt);
      this.cam.update(rawDt, this._camTgt, p.vel);
    }
    this.updateCutaway();
    this.updateRoofs(rawDt);
    this.updateSun();
    this.ui.update(rawDt);
    this.audio.update(rawDt, this);
    this.level.clouds.children.forEach((c) => {
      c.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.004 * c.userData.speed);
    });
    input.endFrame();
  }

  render() {
    if (!this.renderer) return;
    const cam = this.sniper ? this.sniperCam : this.cam.camera;
    this.renderer.render(this.scene, cam);
  }

  // ---------------------------------------------------------------- per-frame helpers
  separateNpcs() {
    const list = this.npcs;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.solid || a.gone) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.solid || b.gone) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.36 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (0.6 - d) * 0.5;
        const am = a.speed > 0.1 || a.state !== 'routine' ? 1 : 0.2;
        const bm = b.speed > 0.1 || b.state !== 'routine' ? 1 : 0.2;
        a.pos.x -= (dx / d) * push * am;
        a.pos.z -= (dz / d) * push * am;
        b.pos.x += (dx / d) * push * bm;
        b.pos.z += (dz / d) * push * bm;
      }
    }
  }

  updateCutaway() {
    const p = this.player;
    const cam = this.cam.camera;
    const v = new THREE.Vector3(p.pos.x, 1.0 + p.y, p.pos.z).project(cam);
    const size = this.renderer.getDrawingBufferSize(this._dbs || (this._dbs = new THREE.Vector2()));
    G.uCutCenter.value.set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y);
    G.uCutRadius.value = size.y * (this.cam.portrait ? 0.16 : 0.22);
    G.uCutPos.value.set(p.pos.x, 1.0, p.pos.z);
    G.uCamPos.value.copy(cam.position);
    G.uCutOn.value = this.sniper ? 0 : 1;
  }

  updateRoofs(dt) {
    const p = this.player;
    for (const r of this.level.roofs) {
      const pad = 0.4;
      const inside = p.pos.x > r.minX - pad && p.pos.x < r.maxX + pad && p.pos.z > r.minZ - pad && p.pos.z < r.maxZ + pad;
      // also fade roofs between camera and player (player just south of building)
      let want = inside ? 1 : 0;
      if (!inside && this.sensing) want = 0.85;
      if (this.sniper) want = r.id === 'lighthouse' ? 1 : 0;
      r.fade.value = damp(r.fade.value, want, 8, dt);
      r.group.visible = r.fade.value < 0.99;
    }
  }

  updateSun() {
    const p = this.player;
    const s = this.sun;
    const step = (this.sunExt * 2) / s.shadow.mapSize.x;
    const cx = Math.round(p.pos.x / step) * step, cz = Math.round(p.pos.z / step) * step;
    s.position.set(cx + 22, 40, cz + 16);
    s.target.position.set(cx, 0, cz);
  }

  updateSense() {
    const on = this.sensing;
    for (const n of this.npcs) {
      if (n.gone) continue;
      if (on && (n.distTo(this.player.pos) < 40 || n.isTarget)) {
        const col = n.isTarget ? 0xff3030 : n.inert ? 0xbbbbbb : n.isGuard ? 0x4a7aff : n.def.enforcer ? 0xffa020 : n.role === 'staff' ? 0xffe04a : 0xffffff;
        n.char.setXray(col);
        n.group.visible = true;
      } else if (n.isTarget && !n.inert && this.settings.targetXray) {
        n.char.setXray(0xff3030);
        if (n.char.xrayMat) n.char.xrayMat.opacity = 0.35;
      } else n.char.setXray(null);
      if (n.char.xrayMat && on) n.char.xrayMat.opacity = 0.6;
    }
    // item glints
    this._glint = (this._glint || 0) - 1 / 60;
    if (this._glint <= 0) {
      this._glint = on ? 0.15 : 1.2;
      const ps = this.interactions.pickups;
      if (ps.length) {
        const it = ps[Math.floor(Math.random() * ps.length)];
        if (dist(it.x, it.z, this.player.pos.x, this.player.pos.z) < (on ? 30 : 14)) this.fx.glint(it.x, it.y + 0.25, it.z);
      }
    }
  }

  // ---------------------------------------------------------------- API
  anchor(name) {
    const a = this.level.anchors[name];
    if (!a) console.warn('missing anchor', name);
    return a;
  }
  npcById(id) {
    return this.npcMap?.get(id);
  }
  npcPos(id) {
    const n = this.npcById(id);
    return n && !n.gone ? n.pos : null;
  }
  pickupPos(id) {
    const p = this.interactions.pickups.find((x) => x.id === id);
    return p ? { x: p.x, z: p.z } : null;
  }
  dist(p) {
    if (!p) return 1e9;
    return dist(p.x, p.z, this.player.pos.x, this.player.pos.z);
  }
  hasPoison() {
    const p = this.player;
    return p.has('deathcap') || p.has('ratpoison') || p.has('puffer');
  }
  isOnScreen(pos, margin = 2) {
    const cam = this.sniper ? this.sniperCam : this.cam.camera;
    const v = this._osv || (this._osv = new THREE.Vector3());
    v.set(pos.x, 1, pos.z).project(cam);
    return v.z < 1 && v.x > -1.25 && v.x < 1.25 && v.y > -1.3 && v.y < 1.4;
  }
  mobileTouchActive() {
    return this.input.lastDevice === 'touch';
  }
  mouseGround() {
    const m = this.input.mouse;
    if (!m.active || performance.now() - m.lastMove > 3000) return null;
    const ndc = new THREE.Vector2((m.x / window.innerWidth) * 2 - 1, -(m.y / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.cam.camera);
    const t = -ray.ray.origin.y / ray.ray.direction.y;
    if (t <= 0) return null;
    const pt = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    const p = this.player.pos;
    const d = dist(p.x, p.z, pt.x, pt.z);
    if (d > 14) {
      pt.x = p.x + ((pt.x - p.x) / d) * 14;
      pt.z = p.z + ((pt.z - p.z) / d) * 14;
    }
    return { x: pt.x, z: pt.z };
  }
  aimFromTouch(aim) {
    const w = this.cam.toWorld(aim.x, aim.y);
    const L = 2 + aim.mag * 10;
    const p = this.player.pos;
    return { x: p.x + w.x * L, z: p.z + w.z * L };
  }
  dropSelected() {
    const p = this.player;
    const s = p.selected;
    if (!s || p.busy) return;
    const f = p.forward();
    this.interactions.spawnPickup(s.id, p.pos.x + f.x * 0.6, p.pos.z + f.z * 0.6, 0.02, { count: ITEMS[s.id].stack ? 1 : 1, ammo: s.ammo });
    p.remove(s.id, 1);
    this.audio.sfx('clatter', p.pos);
  }

  emitNoise(x, z, radius, type, source, extra = {}) {
    const listeners = [];
    for (const n of this.npcs) {
      if (n.inert || n.gone || n === source) continue;
      const d = dist(n.pos.x, n.pos.z, x, z);
      if (d > radius) continue;
      const blocked = this.world.segmentBlocked(n.pos.x, 1.4, n.pos.z, x, 1.0, z, { ignoreLow: true });
      if (blocked && d > radius * 0.55) continue;
      listeners.push({ n, d });
    }
    listeners.sort((a, b) => (a.n.isGuard ? 0 : 1) - (b.n.isGuard ? 0 : 1) || a.d - b.d);
    let inv = type === 'impact' || type === 'clatter' || type === 'device' ? 1 : type === 'splash' ? 2 : 99;
    for (const { n, d } of listeners) {
      const wantsInv = inv > 0 && (n.isGuard || d < 6.5 || type === 'device') && !n.isTarget;
      const did = n.hear({ x, z, type, ...extra }, wantsInv);
      if (did) inv--;
    }
    if (this.settings.showNoise && type !== 'footsteps') this.fx.groundRing(x, z, radius, 0xffffff, 0.6);
  }

  nearestGuard(pos, maxD = 1e9) {
    let best = null, bd = maxD;
    for (const n of this.npcs) {
      if (!n.isGuard || n.inert || n.gone) continue;
      const d = n.distTo(pos);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  findSafePoint(pos, from) {
    const cands = ['player_start', 'foyer_inside', 'party_buffet', 'terrace_door', 'pool_guard_c', 'gym_door_out', 'west_post', 'fountain_s', 'campfire'].map((a) => this.anchor(a));
    let best = cands[0], bs = -1e9;
    for (const c of cands) {
      const dFrom = dist(c.x, c.z, from.x, from.z);
      const dMe = dist(c.x, c.z, pos.x, pos.z);
      const s = dFrom * 1.0 - dMe * 0.6;
      if (dMe > 3 && s > bs) { bs = s; best = c; }
    }
    return best;
  }

  // Who can see position p right now?
  witnesses(pos, opts = {}) {
    const out = [];
    for (const n of this.npcs) {
      if (n.inert || n.gone || n.scripted?.blind) continue;
      if (opts.exclude && opts.exclude.includes(n)) continue;
      const dx = pos.x - n.pos.x, dz = pos.z - n.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > n.visionRange * 1.05) continue;
      const ang = Math.abs(angleDiff(n.headYaw, Math.atan2(dx, dz)));
      if (ang > n.fov / 2 && d > 2) continue;
      if (this.world.segmentBlocked(n.pos.x, 1.45, n.pos.z, pos.x, 1.0, pos.z)) continue;
      out.push(n);
    }
    return out;
  }
  wasWitnessed(pos) {
    return this.witnesses(pos).length > 0;
  }
  witnessCheck(pos, what) {
    // handled through player.flags.illegal per-frame perception
  }
  compromise(by) {
    const p = this.player;
    if (!p.compromised.has(p.outfit)) {
      p.compromised.add(p.outfit);
      this.director.stats.compromised++;
      this.ui.toast(p.outfit === 'rook' ? 'You’ve been made! Change clothes to shake them off.' : `Your ${OUTFITS[p.outfit].name} disguise is blown! Find a new one.`, 'danger', '👔');
    }
  }
  compromiseIfSeen(reason) {
    if (this.wasWitnessed(this.player.pos)) this.compromise();
  }

  bodyFound(body, by) {
    if (body.found) return;
    body.found = true;
    this.director.bodyFound(body, by);
    this.ui.toast(body.isTarget ? 'A target’s body was found!' : 'A body was found! Security is on alert.', 'danger', '⚠');
    this.audio.stinger('body');
    // a few guards converge
    let k = 0;
    for (const n of this.npcs) {
      if (!n.isGuard || n.inert || n === by || n.scripted || n.state === 'combat') continue;
      if (n.distTo(body.pos) < 28 && k < 3) {
        k++;
        n.setState('search', { center: { ...body.pos }, t: 30, radius: 9, hurry: true });
      }
    }
    this.challenges.event('bodyFound');
  }

  dropCarried(n) {
    for (const id of n.carries) {
      this.interactions.spawnPickup(id, n.pos.x + (Math.random() - 0.5), n.pos.z + (Math.random() - 0.5));
    }
    n.carries = [];
    if (n.isGuard && n.heldItem === 'pistol') {
      // drop gun
    }
    if (n.isGuard && Math.random() < 0.35) this.interactions.spawnPickup('pistol', n.pos.x + 0.5, n.pos.z - 0.3, 0.02, { ammo: 6 });
  }

  knockOut(n, cause = {}) {
    if (n.inert) return;
    if (this.player.drag === n) return;
    n.knockOut(cause);
    this.tips.show('ko');
    this.fx.stars(n, 5);
    this.audio.sfx('thud', n.pos);
    this.director.stats.kos++;
    this.dropCarried(n);
    if (cause.method !== 'subdue') this.compromiseIfSeen('ko');
    this.challenges.event('ko', { npc: n, cause });
  }
  killNpc(n, cause = {}) {
    if (n.state === 'dead' || n.gone) return;
    const wasTarget = n.isTarget;
    if (wasTarget) return this.eliminateTarget(n, cause);
    n.kill(cause);
    this.director.stats.nonTargetKills++;
    this.dropCarried(n);
    if (!cause.silent) {
      this.ui.toast(cause.accident ? 'Non-target killed in an “accident”. Karma ↓' : 'Non-target eliminated. That’s not who you are anymore. Karma ↓', 'warn', '👻');
    }
    this.challenges.event('nonTargetKill', { npc: n, cause });
  }
  eliminateTarget(n, cause = {}) {
    if (n.state === 'dead' && n.isTarget && this.story.killed[n.id]) return;
    const witnessed = !cause.accident && this.wasWitnessed(n.pos);
    n.kill(cause);
    this.dropCarried(n);
    this.director.stats.targetsKilled++;
    if (cause.accident) this.director.stats.accidents++;
    this.director.stats.methods.push(cause.label || cause.method);
    this.story.targetKilled(n.id, cause.method);
    this.audio.stinger('kill');
    const title = cause.accident ? 'ACCIDENT' : 'TARGET ELIMINATED';
    after(0.3, () => this.ui.bigText(title, `${n.name}${cause.label ? ' — ' + cause.label : ''}`, cause.accident ? 'accident' : 'kill'));
    this.challenges.event('targetKilled', { npc: n, cause, witnessed });
    if (cause.opp) this.progress.completeOpp(cause.opp);
    if (cause.noBody) n.found = true;
  }
  slipNpc(n, hz) {
    const g = this;
    n.stop();
    n.scripted = { blind: true, noPanic: true, update: () => 'idle' };
    n.char.play('slip', 0.9);
    this.audio.sfx('slip', n.pos);
    this.fx.pop(n.pos.x, 1.9, n.pos.z, 'WHOOPS!', '#fff3a0');
    n.say('Whoa-whoa-WHOA—', 1);
    after(0.65, () => {
      n.scripted = null;
      // near a ledge? Slip into the sea!
      const dz = this.level.dumpSpots.some((s) => {
        const t = Math.max(0, Math.min(1, ((n.pos.x - s.x1) * (s.x2 - s.x1) + (n.pos.z - s.z1) * (s.z2 - s.z1)) / ((s.x2 - s.x1) ** 2 + (s.z2 - s.z1) ** 2 || 1)));
        return dist(n.pos.x, n.pos.z, s.x1 + (s.x2 - s.x1) * t, s.z1 + (s.z2 - s.z1) * t) < 1.0;
      });
      if (n.isTarget) {
        g.knockOut(n, { method: 'slip' });
        g.fx.pop(n.pos.x, 1.6, n.pos.z, 'BONK', '#ffe14a');
      } else g.knockOut(n, { method: 'slip' });
      this.challenges.event('slip', { npc: n, ledge: dz });
    });
  }
  tossIntoSea(body, x, z, y = WATER_Y) {
    const sx = body.pos.x, sz = body.pos.z;
    let k = 0;
    const fn = (dt) => {
      k += dt / 0.7;
      body.pos.x = sx + (x - sx) * Math.min(1, k);
      body.pos.z = sz + (z - sz) * Math.min(1, k);
      body.y = Math.sin(Math.min(1, k) * Math.PI) * 0.8 - Math.max(0, k - 0.5) * 3;
      body.syncTransform();
      if (k >= 1) {
        this.setpieces.updaters.splice(this.setpieces.updaters.indexOf(fn), 1);
        this.fx.splash(x, WATER_Y + 0.1, z, true);
        this.audio.sfx('splash', { x, z });
        this.fx.pop(x, 0.8, z, 'SPLOOSH', '#9fe8ff');
        body.removeFromWorld();
        body.hiddenIn = { name: 'Sea' };
        this.emitNoise(x, z, 6, 'splash', null);
        this.ui.toast('Sleeps with the fishes.', 'good', '🌊');
      }
    };
    this.setpieces.updaters.push(fn);
  }
  npcPickupNear(n, x, z) {
    const ps = this.interactions.pickups;
    for (const p of ps) {
      if (dist(p.x, p.z, x, z) < 1.5 && !p.outfit) {
        this.interactions.removePickup(p);
        return p.id;
      }
    }
    return null;
  }

  slowmo(scale, dur) {
    if (!this.settings.slowmo) return;
    this.timeScale = scale;
    this.slowT = dur;
  }
  hitStop(dur) {
    this.hitStopT = dur;
  }
  killCam(n, dur = 2) {
    if (!this.settings.killcam) return;
    const yaw = this.cam.yaw;
    const pos = new THREE.Vector3(n.pos.x + Math.sin(yaw) * 5 + 1.5, 3.4, n.pos.z + Math.cos(yaw) * 5);
    this.cam.cinematic(pos, new THREE.Vector3(n.pos.x, 0.9, n.pos.z), dur);
  }

  // ---------------------------------------------------------------- sniper
  enterSniper() {
    const lh = this.anchor('sniper_perch');
    if (!this.sniperCam) {
      this.sniperCam = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.5, 500);
    }
    this.sniper = { yaw: Math.atan2(40, 25), pitch: -0.32, fov: 40, x: -40, y: 10.4, z: -38.5, shotCD: 0, bullet: null };
    this.sniperCam.position.set(this.sniper.x, this.sniper.y, this.sniper.z);
    this.ui.root.classList.add('sniping');
    this.audio.sfx('door', lh);
    // touch: drag the canvas to aim, use button to fire
    this._sniperDrag = (dx, dy) => {
      const s = this.sniper;
      if (!s) return;
      s.yaw -= dx * 0.0025 * (s.fov / 40);
      s.pitch = clamp(s.pitch - dy * 0.0025 * (s.fov / 40), -1.1, 0.15);
    };
    this._sniperTouch = (e) => {
      if (!this.sniper) return;
      const t = e.touches[0];
      if (!t) return;
      if (this._sniperLast) this._sniperDrag(t.clientX - this._sniperLast.x, t.clientY - this._sniperLast.y);
      this._sniperLast = { x: t.clientX, y: t.clientY };
    };
    this._sniperEnd = () => (this._sniperLast = null);
    this.canvas.addEventListener('touchmove', this._sniperTouch);
    this.canvas.addEventListener('touchend', this._sniperEnd);
    this._sniperMouse = (e) => {
      if (!this.sniper || this.mobileTouchActive()) return;
      if (e.buttons & 1 || document.pointerLockElement) this._sniperDrag(e.movementX, e.movementY);
      else this._sniperDrag(e.movementX * 0.6, e.movementY * 0.6);
    };
    window.addEventListener('mousemove', this._sniperMouse);
  }
  exitSniper() {
    this.sniper = null;
    this.ui.root.classList.remove('sniping');
    this.canvas.removeEventListener('touchmove', this._sniperTouch);
    this.canvas.removeEventListener('touchend', this._sniperEnd);
    window.removeEventListener('mousemove', this._sniperMouse);
  }
  updateSniper(dt, rawDt) {
    const s = this.sniper;
    const input = this.input;
    // keyboard aim
    s.yaw -= input.move.x * rawDt * 0.9 * (s.fov / 40);
    s.pitch = clamp(s.pitch + input.move.y * rawDt * 0.6 * (s.fov / 40), -1.1, 0.15);
    if (input.camZoom) s.fov = clamp(s.fov + input.camZoom * 40, 8, 45);
    if (input.pressed('secondary')) s.fov = s.fov > 20 ? 12 : 40;
    const cam = this.sniperCam;
    cam.fov = damp(cam.fov, s.fov, 10, rawDt);
    cam.updateProjectionMatrix();
    const dir = new THREE.Vector3(Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), Math.cos(s.yaw) * Math.cos(s.pitch));
    if (s.bullet) {
      const b = s.bullet;
      b.t += rawDt;
      const k = Math.min(1, b.t / b.dur);
      cam.position.lerpVectors(b.from, b.to, k * 0.9);
      cam.lookAt(b.to);
      if (k >= 1) {
        b.onHit();
        s.bullet = null;
        after(0.9, () => {
          if (this.sniper) {
            cam.position.set(s.x, s.y, s.z);
          }
        });
      }
      return;
    }
    cam.position.set(s.x, s.y, s.z);
    cam.lookAt(cam.position.clone().add(dir));
    s.shotCD -= rawDt;
    if ((input.pressed('use') || input.pressed('click') || input.pressed('useAimed')) && s.shotCD <= 0) this.sniperFire(dir);
    if (input.pressed('primary')) {
      input.edges.delete('primary');
      this.setpieces.exitPerch();
    }
    input.edges.delete('use');
    input.edges.delete('click');
    this.ui.setPrompts({ label: 'Climb down', icon: '⬇' }, { label: s.fov > 20 ? 'Zoom in' : 'Zoom out', icon: '🔍' }, 'Fire');
  }
  sniperFire(dir) {
    const s = this.sniper;
    s.shotCD = 1.5;
    this.audio.sfx('rifle', this.player.pos);
    this.cam.shake(0.1, 0.1);
    const o = new THREE.Vector3(s.x, s.y, s.z);
    let best = null, bt = 1e9;
    for (const n of this.npcs) {
      if (n.inert || n.gone) continue;
      // capsule from y .2 to 1.6
      const c = new THREE.Vector3(n.pos.x, n.y + 0.9, n.pos.z);
      const toC = c.clone().sub(o);
      const t = toC.dot(dir);
      if (t < 0) continue;
      const closest = o.clone().addScaledVector(dir, t);
      const dxz = Math.hypot(closest.x - c.x, closest.z - c.z);
      const dy = Math.abs(closest.y - c.y);
      if (dxz < 0.42 && dy < 0.85 && t < bt) {
        // blocked by roofs / indoors?
        const z = this.world.zoneAt(n.pos.x, n.pos.z);
        if (z && z.building && z.building !== 'greenhouse') continue;
        bt = t;
        best = n;
      }
    }
    // ground impact point (for tracer)
    const hitPoint = best ? new THREE.Vector3(best.pos.x, best.y + 1.0, best.pos.z) : o.clone().addScaledVector(dir, dir.y < -0.01 ? (-o.y / dir.y) : 80);
    const finish = () => {
      if (best) {
        if (best.isTarget) {
          this.eliminateTarget(best, { method: 'sniper', label: 'Eye in the Sky' });
          this.story.flag('sniped');
          this.progress.completeOpp('sniper');
        } else this.killNpc(best, { method: 'sniper' });
        this.fx.pop(best.pos.x, 2.0, best.pos.z, 'PEW!', '#ff5a5a', true);
        this.emitNoise(best.pos.x, best.pos.z, 14, 'gunshot', null);
        this.director.stats.shots++;
      } else {
        this.fx.puff(hitPoint.x, Math.max(0.2, hitPoint.y), hitPoint.z, 4, 0.3);
        this.emitNoise(hitPoint.x, hitPoint.z, 9, 'impact', null);
      }
    };
    if (best && best.isTarget && this.settings.killcam) {
      // bullet cam!
      this.slowmo(0.3, 1.2);
      s.bullet = { from: o.clone(), to: hitPoint.clone(), t: 0, dur: 0.9, onHit: finish };
      this.audio.sfx('whoosh', this.player.pos);
    } else finish();
  }

  // ---------------------------------------------------------------- flow
  pause() {
    if (!this.running || this.paused || this.ended) return;
    this.paused = true;
    this.audio.duck(true);
    this.emit('pause');
  }
  resume() {
    this.paused = false;
    this.last = performance.now();
    this.audio.duck(false);
  }
  playerDied(from) {
    this.audio.stinger('death');
    this.cam.shake(0.4, 0.4);
    this.player.char.setFace('ko');
    after(2.2, () => {
      this.ended = true;
      this.paused = true;
      this.emit('failed', { reason: 'You got got.' });
    });
  }
  missionComplete(kind, mesh) {
    if (this.ended) return;
    const p = this.player;
    p.hidden = { name: 'boat', kind: 'boat', x: p.pos.x, z: p.pos.z, yaw: 0 };
    p.group.visible = false;
    this.ended = true;
    this.audio.stinger('win');
    if (p.has('ledger')) this.story.flag('ledger_escaped');
    this.challenges.event('exit', { kind });
    // sail away
    let t = 0;
    const start = mesh.position.clone();
    const dir = kind === 'row' ? new THREE.Vector3(0, 0, 1) : kind === 'speedboat' ? new THREE.Vector3(1, 0, 1).normalize() : new THREE.Vector3(0, 0, 1);
    const sail = (dt) => {
      t += dt;
      mesh.position.copy(start).addScaledVector(dir, t * t * (kind === 'speedboat' ? 6 : 2.5));
      if (Math.random() < dt * 20) this.fx.emit('drop', mesh.position.x, WATER_Y + 0.2, mesh.position.z, { n: 2, speed: 1, up: 1.5, life: 0.6, size: 0.15 });
      if (t > 4.2) this.setpieces.updaters.splice(this.setpieces.updaters.indexOf(sail), 1);
    };
    this.setpieces.updaters.push(sail);
    this.cam.cinematic(new THREE.Vector3(start.x + 8, 7, start.z - 6), start.clone().add(dir.clone().multiplyScalar(10)), 4.5);
    after(4.3, () => {
      this.paused = true;
      this.emit('complete', { exit: kind });
    });
  }
}

// ---------------------------------------------------------------- vision cones
class VisionCones {
  constructor(game) {
    this.game = game;
    this.pool = [];
    this.active = new Map();
    this.N = 18;
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  }
  _mesh() {
    let m = this.pool.pop();
    if (!m) {
      const g = new THREE.BufferGeometry();
      const N = this.N;
      const pos = new Float32Array((N + 2) * 3);
      const col = new Float32Array((N + 2) * 4);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 4));
      const idx = [];
      for (let i = 1; i <= N; i++) idx.push(0, i, i + 1);
      g.setIndex(idx);
      m = new THREE.Mesh(g, this.mat);
      m.frustumCulled = false;
      m.renderOrder = 2;
      this.game.scene.add(m);
    }
    m.visible = true;
    return m;
  }
  update() {
    const g = this.game;
    const p = g.player;
    const mode = g.settings.cones;
    const want = new Set();
    if (mode !== 'off' && !g.sniper) {
      for (const n of g.npcs) {
        if (n.inert || n.gone) continue;
        const d = n.distTo(p.pos);
        const show = (n.isGuard || n.def.enforcer || (mode === 'all') || g.sensing) && d < (g.sensing ? 26 : 20);
        if (show) want.add(n);
      }
    }
    for (const [n, m] of this.active) {
      if (!want.has(n)) {
        m.visible = false;
        this.pool.push(m);
        this.active.delete(n);
      }
    }
    for (const n of want) {
      let m = this.active.get(n);
      if (!m) {
        m = this._mesh();
        this.active.set(n, m);
      }
      this._fill(m, n);
    }
  }
  _fill(m, n) {
    const g = this.game;
    const N = this.N;
    const pos = m.geometry.attributes.position.array;
    const col = m.geometry.attributes.color.array;
    const range = n.visionRange * (n.state === 'search' || n.state === 'combat' ? 1.3 : 1);
    const fov = n.fov;
    const cx = n.pos.x, cz = n.pos.z;
    let r = 1, gg = 1, b = 1, a = 0.16;
    if (n.state === 'combat') { r = 1; gg = 0.2; b = 0.15; a = 0.3; }
    else if (n.suspicion > 0.05 || n.state === 'search' || n.state === 'warn') { r = 1; gg = 0.82; b = 0.2; a = 0.2 + n.suspicion * 0.15; }
    else if (n.isTarget) { r = 1; gg = 0.4; b = 0.4; a = 0.14; }
    pos[0] = cx; pos[1] = 0.06; pos[2] = cz;
    col[0] = r; col[1] = gg; col[2] = b; col[3] = a * 1.6;
    for (let i = 0; i <= N; i++) {
      const ang = n.headYaw - fov / 2 + (fov * i) / N;
      const dx = Math.sin(ang), dz = Math.cos(ang);
      const d = g.world.raycastSight(cx, cz, dx, dz, range, 1.4);
      const k = (i + 1) * 3;
      pos[k] = cx + dx * d;
      pos[k + 1] = 0.06;
      pos[k + 2] = cz + dz * d;
      const c4 = (i + 1) * 4;
      col[c4] = r; col[c4 + 1] = gg; col[c4 + 2] = b; col[c4 + 3] = a * 0.25;
    }
    m.geometry.attributes.position.needsUpdate = true;
    m.geometry.attributes.color.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- conversations
class Convos {
  constructor(game) {
    this.game = game;
    this.state = {};
    for (const id of Object.keys(CONVOS)) this.state[id] = { line: -1, t: 0, cooldown: 0, heard: false };
    this.active = null;
  }
  update(dt) {
    const g = this.game;
    const p = g.player;
    for (const s of Object.values(this.state)) if (s.cooldown > 0) s.cooldown -= dt;
    if (this.active) {
      const c = CONVOS[this.active];
      const s = this.state[this.active];
      const speakers = c.speakers.map((id) => g.npcById(id));
      const ok = speakers.every((n) => n && !n.inert && !n.alerted && n.state === 'routine' && !n.scripted && n.taskPhase === 'act');
      if (!ok) {
        this.active = null;
        s.line = -1;
        s.cooldown = 10;
        return;
      }
      s.t -= dt;
      if (s.t <= 0) {
        s.line++;
        if (s.line >= c.lines.length) {
          if (c.reveal && !s.heard) {
            s.heard = true;
            const near = speakers.some((n) => n.distTo(p.pos) < c.range + 3);
            if (near) g.story.reveal(c.reveal);
            else s.heard = false;
          }
          this.active = null;
          s.line = -1;
          s.cooldown = s.heard ? 75 : 20;
          return;
        }
        const [who, text] = c.lines[s.line];
        const n = speakers[who];
        const dur = Math.max(2.6, text.length * 0.055);
        n.say(text, dur, { subtitle: true, range: c.range + 4 });
        // face each other
        const other = speakers[(who + 1) % speakers.length];
        if (other && other !== n) {
          n.lookAt = other.pos;
          n.lookT = dur;
        }
        s.t = dur + 0.4;
      }
      return;
    }
    // pick a convo to start
    for (const [id, c] of Object.entries(CONVOS)) {
      const s = this.state[id];
      if (s.cooldown > 0) continue;
      const speakers = c.speakers.map((sid) => g.npcById(sid));
      if (!speakers.every((n) => n && !n.inert && !n.alerted && n.state === 'routine' && !n.scripted && n.taskPhase === 'act')) continue;
      if (speakers.length > 1 && dist(speakers[0].pos.x, speakers[0].pos.z, speakers[1].pos.x, speakers[1].pos.z) > 6) continue;
      const near = speakers.some((n) => n.distTo(p.pos) < c.range);
      if (!near) continue;
      // speaker's task must allow it (or no convo marked = ambient)
      if (speakers.some((n) => n.task && n.task.convo && n.task.convo !== id && !(id === 'ledger'))) continue;
      this.active = id;
      s.line = -1;
      s.t = 0.4;
      break;
    }
  }
}

export { TARGETS, OPPS };
