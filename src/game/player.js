// Rook: the player character controller.
import * as THREE from 'three';
import { Character } from './character.js';
import { OUTFITS, BODY_PRESETS, canAccess } from './outfits.js';
import { ITEMS, makeHeldMesh } from './items.js';
import { damp, dampAngle, clamp, yawTo, angleDiff } from '../core/util.js';

const SPEED = { walk: 3.1, run: 5.6, sneak: 1.85, drag: 1.7 };

export class Player {
  constructor(game, x, z, yaw) {
    this.game = game;
    this.isPlayer = true;
    this.char = new Character({ body: BODY_PRESETS.rook, outfit: OUTFITS.rook, name: 'player' });
    this.char.setFace('sad');
    this.char.blinkT = 2;
    this.group = this.char.group;
    this.pos = { x, z };
    this.yaw = yaw;
    this.y = 0;
    this.vel = { x: 0, z: 0 };
    this.speed = 0;
    this.outfit = 'rook';
    this.compromised = new Set();
    this.sneak = false;
    this.running = false;
    this.inv = [];
    this.sel = -1;
    this.drag = null;
    this.hidden = null;
    this.busy = null;
    this.hp = 100;
    this.maxHp = 100;
    this.lastHurt = -99;
    this.footT = 0;
    this.radius = 0.3;
    this.flags = {};
    this.lastSeenZone = null;
    this.heldId = null;
    this.alive = true;
    this.disguiseLog = new Set(['rook']);
    this.perched = false;
    game.scene.add(this.group);
    this.group.position.set(x, 0, z);
    this.group.rotation.y = yaw;
    // silhouette when behind walls
    this.char.setXray(0xffffff);
    this.char.xrayMat.opacity = 0.35;
  }

  // ---------------------------------------------------------------- inventory
  has(id) {
    return this.inv.some((s) => s.id === id && s.count > 0);
  }
  count(id) {
    const s = this.inv.find((s) => s.id === id);
    return s ? s.count : 0;
  }
  add(id, n = 1, extra = {}) {
    const def = ITEMS[id];
    let s = this.inv.find((s) => s.id === id);
    if (s && def.stack !== false) {
      s.count += n;
    } else if (!s) {
      s = { id, count: n, ammo: def.ammo, ...extra };
      this.inv.push(s);
    } else {
      s.count += n;
    }
    this.game.emit('inventory');
    return s;
  }
  remove(id, n = 1) {
    const i = this.inv.findIndex((s) => s.id === id);
    if (i < 0) return;
    this.inv[i].count -= n;
    if (this.inv[i].count <= 0) {
      this.inv.splice(i, 1);
      if (this.sel === i) this.sel = -1;
      else if (this.sel > i) this.sel--;
    }
    this.game.emit('inventory');
  }
  get selected() {
    return this.sel >= 0 && this.sel < this.inv.length ? this.inv[this.sel] : null;
  }
  selectIndex(i) {
    if (i >= this.inv.length) return;
    this.sel = this.sel === i ? -1 : i;
    this.game.emit('inventory');
  }
  cycle(dir = 1) {
    const n = this.inv.length;
    if (!n) return;
    let i = this.sel + dir;
    if (i >= n) i = -1;
    if (i < -1) i = n - 1;
    this.sel = i;
    this.game.emit('inventory');
  }

  // ---------------------------------------------------------------- outfit
  setOutfit(id) {
    this.outfit = id;
    const o = OUTFITS[id];
    this.char.setOutfit(o);
    this.disguiseLog.add(id);
    this.game.emit('outfit', id);
  }
  get isCompromised() {
    return this.compromised.has(this.outfit);
  }

  // ---------------------------------------------------------------- state helpers
  get crouched() {
    return this.sneak && !this.drag && !this.running;
  }
  forward() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }
  zone() {
    return this.game.world.zoneAt(this.pos.x, this.pos.z);
  }
  trespassing() {
    const z = this.zone();
    return z ? !canAccess(this.outfit, z.access) : false;
  }

  startBusy(b) {
    this.busy = { t: 0, ...b };
    if (b.face) this.yaw = yawTo(this.pos.x, this.pos.z, b.face.x, b.face.z);
  }

  hurt(dmg, from) {
    if (!this.alive || this.game.godMode) return;
    this.hp -= dmg;
    this.lastHurt = this.game.time;
    this.char.play('hit', 0.3);
    this.game.cam.shake(0.25, 0.25);
    this.game.ui.flashDamage();
    this.game.audio.sfx('hurt', this.pos);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.game.playerDied(from);
    }
  }

  // ---------------------------------------------------------------- update
  update(dt, input) {
    const g = this.game;
    if (!this.alive) {
      this.char.update(dt, { state: 'ko' });
      return;
    }
    // regen
    if (g.time - this.lastHurt > 6 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 12 * dt);

    if (this.hidden) {
      this.group.visible = false;
      this.vel.x = this.vel.z = 0;
      this.speed = 0;
      this.computeFlags();
      return;
    }
    this.group.visible = !this.perched;

    let state = 'idle';
    let snappy = false;
    if (this.busy) {
      const b = this.busy;
      b.t += dt;
      if (b.onTick) b.onTick(dt, b);
      state = b.anim || 'idle';
      this.vel.x = damp(this.vel.x, 0, 20, dt);
      this.vel.z = damp(this.vel.z, 0, 20, dt);
      if (b.t >= b.dur) {
        this.busy = null;
        if (b.onDone) b.onDone();
      }
      this.speed = 0;
    } else if (!this.perched) {
      // Movement
      const cam = g.cam;
      const mv = cam.toWorld(input.move.x, input.move.y);
      const mag = Math.min(1, Math.hypot(input.move.x, input.move.y));
      this.running = input.run && mag > 0.2 && !this.drag;
      if (this.running && this.sneak) this.sneak = false;
      let max = this.drag ? SPEED.drag : this.running ? SPEED.run : this.sneak ? SPEED.sneak : SPEED.walk;
      if (!this.running && !this.drag) max *= clamp(mag * 1.15, 0, 1);
      const len = Math.hypot(mv.x, mv.z) || 1;
      const tx = mag > 0.05 ? (mv.x / len) * max : 0;
      const tz = mag > 0.05 ? (mv.z / len) * max : 0;
      const acc = mag > 0.05 ? 16 : 22;
      this.vel.x = damp(this.vel.x, tx, acc, dt);
      this.vel.z = damp(this.vel.z, tz, acc, dt);
      if (mag > 0.05) {
        const want = Math.atan2(mv.x, mv.z);
        this.yaw = dampAngle(this.yaw, want, this.drag ? 8 : 18, dt);
      }
      const ox = this.pos.x, oz = this.pos.z;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      g.world.resolveCircle(this.pos, this.radius);
      // NPC bodies are solid.
      for (const n of g.npcs) {
        if (!n.solid) continue;
        const dx = this.pos.x - n.pos.x, dz = this.pos.z - n.pos.z;
        const d = Math.hypot(dx, dz);
        const rr = this.radius + n.radius;
        if (d < rr && d > 1e-4) {
          this.pos.x += (dx / d) * (rr - d) * 0.8;
          this.pos.z += (dz / d) * (rr - d) * 0.8;
        }
      }
      g.world.resolveCircle(this.pos, this.radius);
      this.speed = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
      if (this.speed > 0.15) state = this.drag ? 'drag' : this.running ? 'run' : this.sneak ? 'sneak' : 'walk';
      else state = this.drag ? 'drag' : this.sneak ? 'sneak' : 'idle';
      if (this.drag && this.speed <= 0.15) state = 'drag';

      // Footsteps & noise
      if (this.speed > 0.4) {
        this.footT -= dt * (this.running ? 1.6 : this.sneak ? 0.7 : 1);
        if (this.footT <= 0) {
          this.footT = 0.36;
          const surf = this.zone()?.outdoor ? 'grass' : 'floor';
          if (!this.sneak) g.audio.sfx(this.running ? 'stepRun' : 'step', this.pos, { surf });
          if (this.running) {
            g.emitNoise(this.pos.x, this.pos.z, 5.5, 'footsteps', this);
            g.fx.groundRing(this.pos.x, this.pos.z, 5.5, 0xfff1c0, 0.5);
          }
        }
      }
    }

    // Dragged body follows.
    if (this.drag) {
      const d = this.drag;
      const f = this.forward();
      d.pos.x = this.pos.x - f.x * 1.75;
      d.pos.z = this.pos.z - f.z * 1.75;
      d.yaw = this.yaw + Math.PI;
      if (state !== 'drag' && !this.busy) state = 'drag';
    }

    // Held item visual.
    const sel = this.selected;
    const wantHeld = this.drag || this.busy?.hideHeld ? null : sel ? sel.id : null;
    if (wantHeld !== this.heldId) {
      this.heldId = wantHeld;
      this.char.hold('R', wantHeld && wantHeld !== 'coin' ? makeHeldMesh(wantHeld) : null);
    }

    this.group.position.set(this.pos.x, this.y, this.pos.z);
    this.group.rotation.y = this.yaw;
    this.char.update(dt, { state, speed: this.speed, snappy, holdItem: !!wantHeld && wantHeld !== 'pistol', holdingGun: wantHeld === 'pistol' });
    this.computeFlags();
  }

  // What would an observer think right now?
  computeFlags() {
    const f = this.flags;
    const sel = this.selected;
    f.hidden = !!this.hidden || this.perched;
    f.crouched = this.crouched;
    f.trespass = this.trespassing();
    f.compromised = this.isCompromised;
    f.illegal = null;
    if (this.busy && this.busy.illegal) f.illegal = this.busy.illegalReason || 'act';
    else if (this.drag) f.illegal = 'drag';
    else if (sel && ITEMS[sel.id].illegal && !(ITEMS[sel.id].type === 'gun' && this.outfit === 'guard')) f.illegal = 'weapon';
    f.running = this.running && this.speed > 3;
    f.sneaking = this.sneak && this.speed > 0.2;
    f.speed = this.speed;
  }
}
