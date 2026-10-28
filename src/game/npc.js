// NPC: routine + perception + reactions. The beating heart of the stealth.
import * as THREE from 'three';
import { Character } from './character.js';
import { OUTFITS, canAccess } from './outfits.js';
import { makeHeldMesh } from './items.js';
import { damp, dampAngle, clamp, yawTo, angleDiff, dist, pick, approachAngle, after } from '../core/util.js';

const WALK = 1.75;
const HURRY = 2.8;
const RUN = 4.3;

const LINES = {
  trespassWarn: ['Hey! You can’t be in here.', 'Whoa, whoa. Off limits, pal.', 'You lost? This area’s private.', 'Turn around. Now.'],
  trespassStaff: ['Excuse me! Staff only!', 'Ahem. Guests don’t come back here.', 'You’re not supposed to be here!'],
  leaveOk: ['And stay out.', 'Thank you. Enjoy the party.', 'Good. Off you go.'],
  odd: ['What are you up to?', 'Something funny going on here?', 'Hey. Slow down.'],
  oddClear: ['Hmph. Keep it down.', 'Right. Carry on.', 'Weird guy.'],
  investigate: ['What was that?', 'Hello? Anyone there?', 'Huh?', 'Did you hear that?'],
  investigateEnd: ['Must have been the wind.', 'Probably nothing.', 'Seagulls again…', 'Huh. Weird.', 'I need a vacation.'],
  coinFound: ['Ooh, a coin!', 'Finders keepers.', 'Lucky day!'],
  spotted: ['HEY! Stop right there!', 'Intruder!', 'Got you!', 'Freeze!'],
  combatLost: ['Where did he go?!', 'Spread out!', 'He’s around here somewhere…'],
  searchEnd: ['Lost him. Back to it.', 'All clear… I guess.', 'If you see him, shout.'],
  bodyFoundGuard: ['Man down! We have a body!', 'Oh no. Oh no no no. Radio it in!', 'Security! Someone’s hurt!'],
  bodyFoundCiv: ['AAAAAH!', 'Is… is he okay?! HELP!', 'SOMEBODY HELP!'],
  enforcer: ['Wait… I don’t know you.', 'Hold on. You’re not on the roster.', 'Who hired YOU?'],
  scream: ['AAAH!', 'EEK!', 'HELP! MURDER!', 'Somebody call security!'],
  cower: ['Please don’t hurt me…', 'I didn’t see anything!', '*whimper*'],
  frisk: ['Arms up, please.', 'Quick pat-down. House rules.'],
  friskOk: ['You’re clean. Enjoy the party.', 'All good. Go on in.'],
  friskBad: ['WEAPON! We’ve got a weapon!'],
  disguiseBlown: ['That’s him! In the uniform!'],
};
export { LINES };

let NEXT_ID = 1;

export class NPC {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.id = def.id || 'npc' + NEXT_ID++;
    this.name = def.name || 'Someone';
    this.role = def.role || 'guest';
    this.isGuard = this.role === 'guard';
    this.isTarget = !!def.target;
    this.outfit = def.outfit;
    this.hasOutfit = def.outfitless ? false : true;
    const outfitSpec = { ...OUTFITS[def.outfit], ...(def.look || {}) };
    this.char = new Character({ body: def.body, outfit: outfitSpec, name: this.id });
    this.group = this.char.group;
    game.scene.add(this.group);
    this.pos = { x: 0, z: 0 };
    this.yaw = 0;
    this.headYaw = 0;
    this.y = 0;
    this.radius = 0.3;
    this.speed = 0;
    this.state = 'routine';
    this.stateT = 0;
    this.s = {}; // state data
    this.suspicion = 0;
    this.susKind = null;
    this.seesPlayer = false;
    this.lastSeen = null;
    this.path = null;
    this.pathIdx = 0;
    this.moveTarget = null;
    this.moveSpeed = WALK;
    this.stuckT = 0;
    this.lastProgressPos = { x: 0, z: 0 };
    this.routine = def.routine || [];
    this.taskIdx = 0;
    this.task = null;
    this.taskPhase = 'goto';
    this.taskT = 0;
    this.anim = 'idle';
    this.carries = [...(def.carries || [])];
    this.alerted = false;
    this.inert = false;
    this.found = false;
    this.hiddenIn = null;
    this.gone = false;
    this.cause = null;
    this.speech = null;
    this.lookAt = null;
    this.lookT = 0;
    this.face = 'normal';
    this.visionRange = def.vision ?? (this.isGuard ? 11.5 : 9);
    this.fov = (def.fov ?? (this.isGuard ? 112 : 124)) * (Math.PI / 180);
    this.heldItem = null;
    this.aimT = 0;
    this.shotCD = 0;
    this.meleeCD = 0;
    this.warnT = 0;
    this.noticedBodies = new Set();
    this.reportTo = null;
    this.scripted = null;
    this.poisoned = null;
    this.carryKey = def.carryKey;
    this.solid = true;
    this.dumped = false;
    this.ghostT = 0;
    if (def.hold) this.setHeld(def.hold);
    const st = def.spawn ? game.anchor(def.spawn) : null;
    if (st) {
      this.pos.x = st.x;
      this.pos.z = st.z;
      this.yaw = st.yaw ?? 0;
      this.y = st.y ?? 0;
    } else if (def.x != null) {
      this.pos.x = def.x;
      this.pos.z = def.z;
      this.yaw = def.yaw ?? 0;
    }
    this.headYaw = this.yaw;
    if (def.taskIdx != null) this.taskIdx = def.taskIdx;
    this.syncTransform();
  }

  // ------------------------------------------------------------------ helpers
  get alive() {
    return this.state !== 'dead' && !this.gone;
  }
  get awake() {
    return !this.inert;
  }
  get isBody() {
    return this.inert && !this.gone && !this.hiddenIn;
  }
  get hostile() {
    return this.state === 'combat';
  }
  forward() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }
  distTo(p) {
    return dist(this.pos.x, this.pos.z, p.x, p.z);
  }
  setHeld(id) {
    if (this.heldItem === id) return;
    this.heldItem = id;
    this.char.hold('R', id ? makeHeldMesh(id) : null);
  }
  say(text, dur = 2.6, opts = {}) {
    if (!text) return;
    if (Array.isArray(text)) text = pick(text);
    this.speech = { text, t: dur, ...opts };
    this.char.talking = Math.min(dur, 1.6 + text.length * 0.03);
    this.game.ui.speak(this, text, dur, opts);
  }
  syncTransform() {
    this.group.position.set(this.pos.x, this.y, this.pos.z);
    this.group.rotation.y = this.yaw;
  }

  // ------------------------------------------------------------------ movement
  goTo(x, z, speed = WALK) {
    const g = this.game;
    this.moveSpeed = speed;
    if (this.moveTarget && dist(this.moveTarget.x, this.moveTarget.z, x, z) < 0.3 && this.path) return true;
    this.moveTarget = { x, z };
    const p = g.world.findPath(this.pos.x, this.pos.z, x, z);
    if (!p) {
      this.path = null;
      return false;
    }
    this.path = p;
    this.pathIdx = 0;
    this.stuckT = 0;
    this.lastProgressPos.x = this.pos.x;
    this.lastProgressPos.z = this.pos.z;
    return true;
  }
  stop() {
    this.path = null;
    this.moveTarget = null;
  }
  get arrived() {
    return !this.path;
  }
  _move(dt) {
    if (!this.path) {
      this.speed = damp(this.speed, 0, 10, dt);
      return;
    }
    const wp = this.path[this.pathIdx];
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const last = this.pathIdx === this.path.length - 1;
    if (d < (last ? 0.12 : 0.35)) {
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) {
        this.path = null;
        return;
      }
      return;
    }
    const want = Math.atan2(dx, dz);
    this.yaw = dampAngle(this.yaw, want, this.moveSpeed > 3 ? 12 : 8, dt);
    const sp = Math.min(this.moveSpeed, d / Math.max(dt, 1e-3));
    this.speed = damp(this.speed, sp, 8, dt);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    // Move mostly toward the waypoint (not only facing) so corners are clean.
    const mx = (dx / d) * 0.7 + fx * 0.3, mz = (dz / d) * 0.7 + fz * 0.3;
    const ml = Math.hypot(mx, mz) || 1;
    this.pos.x += (mx / ml) * this.speed * dt;
    this.pos.z += (mz / ml) * this.speed * dt;
    this.game.world.resolveCircle(this.pos, this.radius * 0.9);
    // stuck detection
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      const prog = dist(this.pos.x, this.pos.z, this.lastProgressPos.x, this.lastProgressPos.z);
      this.stuckT = 0;
      this.lastProgressPos.x = this.pos.x;
      this.lastProgressPos.z = this.pos.z;
      if (prog < 0.25) {
        const t = this.moveTarget;
        // Close enough to the goal? Call it arrived instead of grinding.
        if (t && dist(this.pos.x, this.pos.z, t.x, t.z) < 1.1) {
          this.path = null;
          this.moveTarget = null;
          return;
        }
        this.path = null;
        this.moveTarget = null;
        if (t) {
          // nudge sideways then repath
          this.pos.x += (Math.random() - 0.5) * 0.3;
          this.pos.z += (Math.random() - 0.5) * 0.3;
          this.game.world.resolveCircle(this.pos, this.radius);
          this.goTo(t.x, t.z, this.moveSpeed);
          this._stuckCount = (this._stuckCount || 0) + 1;
          if (this._stuckCount > 4) {
            this._stuckCount = 0;
            if (this.pathIdx < (this.path?.length || 0) - 1) this.pathIdx++;
          }
        }
      } else this._stuckCount = 0;
    }
  }
  faceTo(x, z, dt, rate = 8) {
    this.yaw = dampAngle(this.yaw, yawTo(this.pos.x, this.pos.z, x, z), rate, dt);
  }

  // ------------------------------------------------------------------ state machine
  setState(s, data = {}) {
    const prev = this.state;
    this.state = s;
    this.stateT = 0;
    this.s = data;
    if (s !== 'routine') this.stop();
    if (s === 'routine') {
      this.taskPhase = 'goto';
      this.task = null;
    }
    this.alerted = s === 'combat' || s === 'search' || s === 'flee' || s === 'cower';
    this.game.onNpcState?.(this, prev, s);
  }

  // Called when a noise is heard. Returns true if the NPC will investigate.
  hear(noise, investigate) {
    if (this.inert || this.scripted || this.state === 'combat') {
      if (this.state === 'combat' && noise.type === 'gunshot') this.s.lastKnown = { x: noise.x, z: noise.z };
      return false;
    }
    const n = noise;
    const type = n.type;
    if (type === 'gunshot' || type === 'explosion') {
      if (this.isGuard) {
        this.setState('search', { center: { x: n.x, z: n.z }, t: 30, hurry: true });
        this.say(LINES.investigate);
      } else {
        this.panic(n.x, n.z);
      }
      return true;
    }
    if (type === 'scream' || type === 'fight' || type === 'crash') {
      if (this.isGuard) {
        if (this.state !== 'search') this.setState('investigate', { x: n.x, z: n.z, hurry: true, reason: type });
        this.say(pick(['What was that?!', 'On my way!', 'Trouble!']));
        return true;
      }
      if (type === 'crash' && dist(this.pos.x, this.pos.z, n.x, n.z) < 7) {
        this.lookAt = { x: n.x, z: n.z };
        this.lookT = 3;
        this.char.play('stagger', 0.6);
        this.face = 'scared';
        return false;
      }
      if (dist(this.pos.x, this.pos.z, n.x, n.z) < 9 && type !== 'crash') this.panic(n.x, n.z, false);
      return false;
    }
    if (type === 'footsteps') {
      if (this.state === 'search') return false;
      this.lookAt = { x: n.x, z: n.z };
      this.lookT = 1.6;
      if (this.isGuard) this.suspicion = Math.min(0.6, this.suspicion + 0.12);
      return false;
    }
    if (type === 'impact' || type === 'splash' || type === 'device' || type === 'clatter') {
      if (investigate && this.state !== 'search') {
        this.setState('investigate', { x: n.x, z: n.z, reason: type, item: n.item, device: n.device });
        this.say(type === 'device' ? n.line || 'Who left that on?' : LINES.investigate, 2);
        return true;
      }
      this.lookAt = { x: n.x, z: n.z };
      this.lookT = 2.5;
      return false;
    }
    return false;
  }

  panic(fromX, fromZ, scream = true) {
    if (this.inert || this.isGuard || this.scripted?.noPanic) return;
    if (this.def.brawler && this.state !== 'combat') {
      this.say('Who\u2019s shooting at Brick\u2019s party?!', 2);
      this.setState('search', { center: { x: fromX, z: fromZ }, t: 20, hurry: true });
      return;
    }
    if (this.state === 'flee' || this.state === 'cower') return;
    this.face = 'scared';
    if (scream) {
      this.say(LINES.scream, 2);
      this.game.emitNoise(this.pos.x, this.pos.z, 13, 'scream', this);
      this.game.audio.sfx('scream', this.pos, { pitch: this.def.voice || 1 });
    }
    const safe = this.game.findSafePoint(this.pos, { x: fromX, z: fromZ });
    this.setState('flee', { to: safe, from: { x: fromX, z: fromZ }, t: 0 });
    this.goTo(safe.x, safe.z, RUN * 0.95);
  }

  // ------------------------------------------------------------------ perception
  perceive(dt) {
    const g = this.game;
    const p = g.player;
    this.seesPlayer = false;
    if (!p.alive || g.ghost) return;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const f = p.flags;
    if (d > 26 || f.hidden) {
      this._decay(dt);
      return;
    }
    const alertBoost = this.state === 'search' || this.state === 'combat' ? 1.3 : 1;
    const range = this.visionRange * alertBoost * (g.director.heightened && this.isGuard ? 1.12 : 1);
    const ang = Math.abs(angleDiff(this.headYaw, Math.atan2(dx, dz)));
    const inCone = d < range && ang < this.fov / 2;
    const close = d < (f.crouched ? 0.9 : 1.9);
    if (inCone || close) {
      const ey = 1.45 + this.y;
      const ty = (f.crouched ? 0.55 : 1.05) + p.y;
      const hy = (f.crouched ? 0.9 : 1.5) + p.y;
      const w = g.world;
      if (!w.segmentBlocked(this.pos.x, ey, this.pos.z, p.pos.x, ty, p.pos.z) || !w.segmentBlocked(this.pos.x, ey, this.pos.z, p.pos.x, hy, p.pos.z)) {
        this.seesPlayer = true;
      }
    }
    if (!this.seesPlayer) {
      this._decay(dt);
      return;
    }
    this.lastSeen = { x: p.pos.x, z: p.pos.z, t: g.time };
    const closeness = 1 - clamp(d / range, 0, 1);
    const vis = 0.3 + 0.7 * closeness * closeness + (close ? 0.6 : 0);
    let kind = null, rate = 0;
    const zone = p.zone();
    const heightened = this.state === 'search' ? 1.6 : 1;
    if (f.illegal) {
      kind = 'illegal';
      rate = 2.4 * vis + 0.7;
    } else if (f.compromised && (this.isGuard || this.knowsCompromised)) {
      kind = 'compromised';
      rate = (1.3 * vis + 0.35) * heightened;
    } else if (f.trespass && this.caresAbout(zone)) {
      kind = 'trespass';
      rate = (0.62 * vis + 0.14) * heightened;
    } else if (this.def.enforcer && p.outfit === this.outfit && d < 5.5) {
      kind = 'enforcer';
      rate = 0.42 * vis + 0.05;
    } else if (this.isGuard && d < 7 && (f.running || (f.sneaking && d < 4.5))) {
      kind = 'odd';
      rate = 0.22 * vis;
    }
    if (kind) {
      const sev = { odd: 1, enforcer: 2, trespass: 2, compromised: 3, illegal: 4 };
      if (!this.susKind || sev[kind] >= sev[this.susKind] || this.suspicion < 0.05) this.susKind = kind;
      this.suspicion = Math.min(1, this.suspicion + rate * dt);
      this.susHold = 1.5;
      if (this.suspicion >= 1) this.react(this.susKind);
    } else {
      this._decay(dt);
    }
  }
  _decay(dt) {
    if (this.susHold > 0) {
      this.susHold -= dt;
      return;
    }
    if (this.suspicion > 0) this.suspicion = Math.max(0, this.suspicion - dt * 0.22);
    if (this.suspicion < 0.02) this.susKind = null;
  }
  caresAbout(zone) {
    if (!zone || zone.access === 'public') return false;
    if (this.isGuard) return true;
    if (this.role === 'guest' || this.isTarget) return zone.access === 'restricted';
    // staff care about their own areas
    const o = OUTFITS[this.outfit];
    return o && o.access.includes(zone.access);
  }

  react(kind) {
    const g = this.game;
    const p = g.player;
    if (this.state === 'combat') return;
    if (kind === 'illegal' || kind === 'compromised' || kind === 'enforcer') {
      if (kind === 'enforcer') this.say(LINES.enforcer, 2);
      g.compromise(this);
      if (this.isGuard || this.def.brawler) {
        this.startCombat();
      } else {
        this.knowsCompromised = true;
        this.panic(p.pos.x, p.pos.z, true);
        g.director.witness(this);
      }
      return;
    }
    if (kind === 'trespass') {
      if (this.isGuard) {
        if (this.state !== 'warn') {
          this.setState('warn', { t: 0, warned: false });
          this.say(LINES.trespassWarn, 2.5);
          g.audio.sfx('huh', this.pos);
        }
      } else {
        this.say(LINES.trespassStaff, 2.5);
        this.suspicion = 0.35;
        this.susKind = null;
        // tattle to a guard
        const guard = g.nearestGuard(this.pos, 30);
        if (guard && guard.state === 'routine') {
          guard.setState('investigate', { x: p.pos.x, z: p.pos.z, reason: 'report', susp: 0.6 });
        }
      }
      return;
    }
    if (kind === 'odd') {
      if (this.state !== 'investigate') {
        this.setState('investigate', { x: p.pos.x, z: p.pos.z, reason: 'odd', player: true });
        this.say(LINES.odd, 2);
      }
      this.suspicion = 0.6;
    }
  }

  startCombat() {
    const g = this.game;
    if (this.state === 'combat' || this.inert) return;
    this.setState('combat', { lastKnown: { ...g.player.pos }, aim: 0 });
    this.face = 'angry';
    this.say(this.def.brawler ? 'You picked the wrong island, pal!' : LINES.spotted, 2);
    if (!this.def.brawler) this.setHeld('pistol');
    g.director.spotted(this);
    // radio: nearby guards join in
    for (const o of g.npcs) {
      if (o === this || !o.isGuard || o.inert || o.state === 'combat' || o.scripted) continue;
      const d = o.distTo(this.pos);
      if (d < 32) {
        after((600 + d * 60) / 1000, () => {
          if (!o.inert && o.state !== 'combat' && !o.scripted) {
            o.setState('search', { center: { ...g.player.pos }, t: 30, hurry: true, fromRadio: true });
            o.knowsCompromised = true;
          }
        });
      }
    }
  }

  checkBodies(dt) {
    const g = this.game;
    if (this.state === 'combat' || this.state === 'flee' || this.state === 'checkBody' || this.scripted) return;
    for (const b of g.npcs) {
      if (!b.isBody || b.found || b === this || this.noticedBodies.has(b)) continue;
      if (g.player.drag === b) continue;
      const dx = b.pos.x - this.pos.x, dz = b.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > this.visionRange * 0.95) continue;
      const ang = Math.abs(angleDiff(this.headYaw, Math.atan2(dx, dz)));
      if (ang > this.fov / 2 && d > 1.5) continue;
      // check torso of the lying body
      const bx = b.pos.x - Math.sin(b.yaw) * 0.6, bz = b.pos.z - Math.cos(b.yaw) * 0.6;
      if (g.world.segmentBlocked(this.pos.x, 1.45 + this.y, this.pos.z, bx, 0.3, bz)) continue;
      this.noticedBodies.add(b);
      this.setState('checkBody', { body: b });
      this.face = 'scared';
      this.say(pick(['Huh? Hey… buddy?', 'What the…', 'Is that…?']), 1.6);
      return;
    }
  }

  // ------------------------------------------------------------------ main update
  update(dt) {
    const g = this.game;
    if (this.gone) return;
    if (this.speech) {
      this.speech.t -= dt;
      if (this.speech.t <= 0) this.speech = null;
    }
    if (this.inert) {
      this.solid = false;
      this._updateInert(dt);
      return;
    }
    this.solid = true;
    this.stateT += dt;
    if (this.shotCD > 0) this.shotCD -= dt;
    if (this.meleeCD > 0) this.meleeCD -= dt;

    // Perception (skip when scripted to be oblivious).
    const near = this.distTo(g.player.pos) < 30;
    if (near && !this.scripted?.blind) {
      this.perceive(dt);
      this._bodyT = (this._bodyT || 0) - dt;
      if (this._bodyT <= 0) {
        this._bodyT = 0.25;
        this.checkBodies(dt);
      }
    } else this.seesPlayer = false;

    if (this.poisoned) this._updatePoison(dt);

    let anim = 'idle';
    let look = null;
    if (this.scripted) {
      anim = this.scripted.update ? this.scripted.update(dt, this) || this.anim : this.anim;
    } else {
      switch (this.state) {
        case 'routine': anim = this._routine(dt); break;
        case 'investigate': anim = this._investigate(dt); break;
        case 'warn': anim = this._warn(dt); break;
        case 'combat': anim = this._combat(dt); break;
        case 'search': anim = this._search(dt); break;
        case 'flee': anim = this._flee(dt); break;
        case 'cower': anim = this._cower(dt); break;
        case 'checkBody': anim = this._checkBody(dt); break;
        case 'follow': anim = this._follow(dt); break;
        case 'frisk': anim = this._frisk(dt); break;
        case 'stunned': anim = this._stunned(dt); break;
        default: anim = 'idle';
      }
    }
    this._move(dt);
    // NPC separation (cheap: only against the player and close NPCs)
    // Suspicion: stop and stare
    if (this.seesPlayer && this.suspicion > 0.18 && (this.state === 'routine' || this.state === 'investigate' || this.state === 'search') && !this.scripted) {
      look = g.player.pos;
      if (this.state === 'routine' && this.suspicion > 0.3) {
        this.path = null;
        anim = 'idle';
      }
      this.face = this.suspicion > 0.6 ? 'angry' : 'suspicious';
    } else if (this.state === 'routine' && !this.scripted && this.face !== 'scared') {
      this.face = this.def.face || 'normal';
    }
    if (this.lookT > 0) {
      this.lookT -= dt;
      if (this.lookAt) look = this.lookAt;
    }
    if (this.state === 'combat' && this.seesPlayer) look = g.player.pos;

    // Head look
    let hy = 0;
    if (look) {
      const want = yawTo(this.pos.x, this.pos.z, look.x, look.z);
      const d = angleDiff(this.yaw, want);
      if (Math.abs(d) > 1.2 && this.speed < 0.3) this.yaw = dampAngle(this.yaw, want, 4, dt);
      hy = clamp(angleDiff(this.yaw, want), -1.1, 1.1);
    }
    this.char.lookYaw = damp(this.char.lookYaw, hy, 6, dt);
    this.headYaw = this.yaw + this.char.lookYaw;
    // idle head scan for guards
    if (!look && (anim === 'guard' || anim === 'lookaround')) {
      this.headYaw = this.yaw + Math.sin(this.char.time * (anim === 'lookaround' ? 1.4 : 0.6)) * (anim === 'lookaround' ? 0.9 : 0.5);
    }
    this.char.setFace(this.face);
    if (this.speed > 0.15 && anim !== 'panic' && anim !== 'serve' && anim !== 'aim' && anim !== 'drag') {
      anim = this.speed > 3.2 ? 'run' : 'walk';
      if (this.state === 'flee') anim = 'panic';
    }
    this.anim = anim;
    this.syncTransform();
    const onScreen = g.isOnScreen(this.pos, 3);
    this.group.visible = onScreen || this.distTo(g.player.pos) < 14;
    this.char.update(dt, { state: anim, speed: this.speed, holdingTray: this.heldItem === 'tray', holdingGun: this.heldItem === 'pistol' }, !onScreen);
  }

  _updateInert(dt) {
    const g = this.game;
    let st = this.state === 'dead' ? 'dead' : 'ko';
    if (g.player.drag === this) st = 'dragged';
    this.y = 0;
    if (this.state === 'dead' && this.ghostT < 3) {
      this.ghostT += dt;
    }
    this.syncTransform();
    this.group.visible = g.isOnScreen(this.pos, 3) || this.distTo(g.player.pos) < 14;
    this.char.update(dt, { state: st, speed: 0 });
  }

  _updatePoison(dt) {
    const p = this.poisoned;
    p.t += dt;
    if (p.kind === 'lethal' && p.t > p.delay) {
      this.poisoned = null;
      this.scripted = null;
      this.say(pick(['*cough* that tasted… funny…', 'Urk—', 'Ooh… my tummy…']), 1.6);
      after(1.2, () => this.game.killNpc(this, { method: 'poison', accident: true, label: 'Poisoned' }));
      this.poisoned = { kind: 'dying', t: 0 };
      this.scripted = { blind: true, noPanic: true, update: () => 'vomit' };
    }
  }

  // ------------------------------------------------------------------ routine
  _routine(dt) {
    const g = this.game;
    if (this.def.follow) return this._follow(dt);
    if (!this.routine.length) {
      return this.def.idle || 'idle';
    }
    if (!this.task) {
      this.task = this.routine[this.taskIdx % this.routine.length];
      this.taskPhase = 'goto';
      this.taskT = 0;
      const a = this._taskSpot(this.task);
      if (a && dist(this.pos.x, this.pos.z, a.x, a.z) < 0.6) {
        this.stop();
      } else if (a) {
        const ok = this.goTo(a.x, a.z, this.task.speed === 'hurry' ? HURRY : this.task.speed === 'run' ? RUN : WALK);
        if (!ok && dist(this.pos.x, this.pos.z, a.x, a.z) > 1) {
          // unreachable: skip
          this.taskIdx++;
          this.task = null;
          return 'idle';
        }
      }
      if (this.task.holdTravel !== undefined) this.setHeld(this.task.holdTravel);
      this.task.onGo?.(this, g);
    }
    const t = this.task;
    if (this.taskPhase === 'goto') {
      if (this.arrived) {
        const sp = this._taskSpot(t);
        if (sp && dist(this.pos.x, this.pos.z, sp.x, sp.z) > 3.2) {
          // Couldn't get there (blocked door, etc). Try the next task.
          this._advanceTask();
          return 'idle';
        }
        this.taskPhase = 'act';
        const a = this._taskSpot(t);
        const span = t.t || [6, 12];
        this.taskDur = Array.isArray(span) ? span[0] + Math.random() * (span[1] - span[0]) : span;
        this.taskT = 0;
        if (a) {
          this.pos.x = damp(this.pos.x, a.x, 1, 0.5);
          this.pos.z = damp(this.pos.z, a.z, 1, 0.5);
        }
        if (t.hold !== undefined) this.setHeld(t.hold);
        if (t.say) this.say(t.say, 3);
        t.onStart?.(this, g);
        if (t.event) g.story.event(t.event, this);
      }
      return this.heldItem === 'tray' ? 'serve' : 'walk';
    }
    // act
    this.taskT += dt;
    const a = this._taskSpot(t);
    if (a) {
      if (a.yaw != null) this.yaw = dampAngle(this.yaw, a.yaw, 6, dt);
      if (a.y != null) this.y = damp(this.y, a.y, 10, dt);
      if (t.face) {
        const fp = typeof t.face === 'string' ? g.anchor(t.face) : t.face;
        if (fp) this.faceTo(fp.x, fp.z, dt, 6);
      }
      // Glide onto the exact spot (it may be inside furniture: tubs, sofas,
      // tables). Re-path only if something shoved us far away.
      if (dist(this.pos.x, this.pos.z, a.x, a.z) > 3.2) {
        this.taskPhase = 'goto';
        this.goTo(a.x, a.z, WALK);
      } else {
        this.pos.x = damp(this.pos.x, a.x, 5, dt);
        this.pos.z = damp(this.pos.z, a.z, 5, dt);
      }
    }
    if (t.onTick) {
      const r = t.onTick(this, g, dt);
      if (r === 'done') this.taskT = this.taskDur;
    }
    if (t.lines && this.taskT > (this._nextLineT || 0)) {
      this._nextLineT = this.taskT + 6 + Math.random() * 8;
      if (Math.random() < 0.7) this.say(t.lines, 3);
    }
    if (this.taskT >= this.taskDur && !t.forever) {
      t.onEnd?.(this, g);
      this.y = 0;
      this._nextLineT = 0;
      this._advanceTask();
    }
    return t.do || 'idle';
  }
  _advanceTask() {
    const t = this.task;
    if (t && t.next) {
      const i = this.routine.findIndex((x) => x.id === t.next);
      this.taskIdx = i >= 0 ? i : this.taskIdx + 1;
    } else if (this.def.shuffle) {
      this.taskIdx = Math.floor(Math.random() * this.routine.length);
    } else this.taskIdx = (this.taskIdx + 1) % this.routine.length;
    this.task = null;
  }
  _taskSpot(t) {
    if (!t) return null;
    if (t.at) {
      const a = typeof t.at === 'string' ? this.game.anchor(t.at) : t.at;
      return a;
    }
    return null;
  }
  resumeRoutine() {
    this.y = 0;
    this.face = this.def.face || 'normal';
    if (this.def.follow) this.setState('follow');
    else this.setState('routine');
    if (this.def.hold !== undefined) this.setHeld(this.def.hold);
  }

  // ------------------------------------------------------------------ follower (bodyguard)
  _follow(dt) {
    const g = this.game;
    const leader = g.npcById(this.def.follow);
    if (!leader || leader.inert) {
      // leader down: guard goes to search mode around the leader
      if (leader && leader.inert && !leader.found) {
        this.def.follow = null;
        this.noticedBodies.add(leader);
        this.setState('checkBody', { body: leader });
        return 'run';
      }
      this.def.follow = null;
      this.routine = [{ at: { x: this.pos.x, z: this.pos.z }, do: 'guard', t: [30, 60] }];
      this.setState('routine');
      return 'guard';
    }
    const lt = leader.task;
    let tx, tz, wait = false;
    if (lt && lt.guardAt && leader.taskPhase === 'act') {
      const a = g.anchor(lt.guardAt);
      tx = a.x; tz = a.z; wait = true;
      if (dist(this.pos.x, this.pos.z, tx, tz) < 0.5) this.yaw = dampAngle(this.yaw, a.yaw ?? this.yaw, 5, dt);
    } else {
      const f = leader.forward();
      const side = { x: f.z, z: -f.x };
      tx = leader.pos.x - f.x * 1.5 + side.x * 0.8;
      tz = leader.pos.z - f.z * 1.5 + side.z * 0.8;
    }
    const d = dist(this.pos.x, this.pos.z, tx, tz);
    if (d > 0.8) {
      if (!this.moveTarget || dist(this.moveTarget.x, this.moveTarget.z, tx, tz) > 1.2 || !this.path) {
        this.goTo(tx, tz, d > 4 ? HURRY : leader.speed > 0.2 ? WALK * 1.1 : WALK);
      }
    } else if (!wait) {
      this.stop();
      this.faceTo(leader.pos.x, leader.pos.z, dt, 3);
    }
    return 'guard';
  }

  // ------------------------------------------------------------------ investigate
  _investigate(dt) {
    const s = this.s;
    const g = this.game;
    if (!s.started) {
      s.started = true;
      const p = g.world.nearestWalkable(s.x, s.z, 3) || { x: s.x, z: s.z };
      this.goTo(p.x, p.z, s.hurry ? HURRY : WALK * 1.1);
      s.look = 0;
    }
    if (s.player && this.seesPlayer) {
      // walking up to a suspicious player
      const d = this.distTo(g.player.pos);
      if (d < 2.2) {
        this.stop();
        this.faceTo(g.player.pos.x, g.player.pos.z, dt);
        s.look += dt;
        if (s.look > 2.6) {
          this.say(LINES.oddClear, 2);
          this.suspicion = 0;
          this.resumeRoutine();
        }
        return 'idle';
      }
      if (this.stateT % 1 < dt) this.goTo(g.player.pos.x, g.player.pos.z, WALK * 1.1);
    }
    if (this.arrived) {
      s.look += dt;
      if (s.item && !s.pickedUp && s.look > 1.2) {
        s.pickedUp = g.npcPickupNear(this, s.x, s.z);
        if (s.pickedUp) {
          this.char.play('pickup', 0.6);
          if (s.pickedUp === 'coin') this.say(LINES.coinFound, 2);
          else this.say(pick(['Who left this here?', 'Hm. I’ll take that.', 'Huh. Odd.']), 2);
        }
      }
      if (s.device && !s.deviceDone && s.look > 1.0) {
        s.deviceDone = true;
        s.device.onInvestigate?.(this);
        this.char.play('use', 0.6);
      }
      const lookDur = s.reason === 'report' ? 4.5 : 3.5;
      if (s.look > lookDur) {
        if (s.reason !== 'odd') this.say(LINES.investigateEnd, 2);
        this.suspicion = Math.min(this.suspicion, 0.2);
        this.resumeRoutine();
      }
      return s.device ? 'idle' : 'lookaround';
    }
    return 'walk';
  }

  // ------------------------------------------------------------------ warn (trespass)
  _warn(dt) {
    const g = this.game;
    const p = g.player;
    const s = this.s;
    const d = this.distTo(p.pos);
    if (!p.flags.trespass || p.flags.hidden) {
      s.okT = (s.okT || 0) + dt;
      if (s.okT > 1.2) {
        if (!p.flags.hidden) this.say(LINES.leaveOk, 2);
        this.suspicion = 0;
        this.resumeRoutine();
      }
      this.stop();
      return 'idle';
    }
    s.okT = 0;
    if (d > 2.0) {
      if (!this.path || this.stateT % 0.8 < dt) this.goTo(p.pos.x, p.pos.z, HURRY);
    } else {
      this.stop();
      this.faceTo(p.pos.x, p.pos.z, dt);
    }
    s.t += dt;
    if (s.t > 4.0 && !s.second) {
      s.second = true;
      this.say(pick(['I said OUT!', 'Last warning, buddy.', 'Don’t make me ask again.']), 2);
    }
    if (s.t > 8.0) {
      g.compromise(this);
      this.startCombat();
    }
    if (!this.seesPlayer && s.t > 2 && d > 6) {
      this.setState('search', { center: this.lastSeen ? { x: this.lastSeen.x, z: this.lastSeen.z } : { ...this.pos }, t: 12 });
    }
    return 'idle';
  }

  // ------------------------------------------------------------------ combat
  _combat(dt) {
    const g = this.game;
    const p = g.player;
    const s = this.s;
    const d = this.distTo(p.pos);
    if (!p.alive) {
      this.stop();
      return 'idle';
    }
    if (this.seesPlayer) {
      s.lastKnown = { x: p.pos.x, z: p.pos.z };
      s.lostT = 0;
      g.director.hunting(this);
      const brawler = !!this.def.brawler;
      if (d < (brawler ? 1.5 : 1.3) && this.meleeCD <= 0) {
        this.stop();
        this.faceTo(p.pos.x, p.pos.z, dt, 14);
        this.meleeCD = brawler ? 1.0 : 1.3;
        this.char.play('punch', 0.4);
        if (brawler && Math.random() < 0.5) this.say(pick(['BRICK SMASH!', 'Come here, little man!', 'HYAAA!', 'Nobody touches Brick\u2019s friends!']), 1.2);
        after(0.18, () => {
          if (!this.inert && this.distTo(p.pos) < 1.7 && !p.hidden) {
            p.hurt(brawler ? 26 : 16, this);
            g.audio.sfx('punch', p.pos);
            g.fx.pop(p.pos.x, 1.6, p.pos.z, brawler ? 'KA-POW!' : 'POW!', '#ff5a3a');
            if (brawler) g.cam.shake(0.3, 0.25);
          }
        });
        return 'idle';
      }
      if (brawler) {
        if (!this.path || this.stateT % 0.5 < dt) this.goTo(p.pos.x, p.pos.z, RUN * 0.95);
        return 'run';
      }
      if (d > 8.5 || (s.aim || 0) < 0 && d > 3) {
        if (!this.path || this.stateT % 0.6 < dt) this.goTo(p.pos.x, p.pos.z, RUN);
        s.aim = Math.min(s.aim || 0, 0);
      } else {
        this.stop();
        this.faceTo(p.pos.x, p.pos.z, dt, 12);
        s.aim = (s.aim || 0) + dt;
        if (s.aim > 0.85 && this.shotCD <= 0) {
          this.shoot();
          s.aim = -0.2;
          this.shotCD = 1.1 + Math.random() * 0.5;
        }
        return 'aim';
      }
      return 'run';
    }
    // lost sight
    s.lostT = (s.lostT || 0) + dt;
    s.aim = 0;
    if (s.checkHide && p.hidden === s.checkHide) {
      const hs = s.checkHide;
      if (this.distTo(hs) > 1.1) {
        if (!this.path || this.stateT % 0.7 < dt) this.goTo(hs.x, hs.z, RUN);
        return 'run';
      }
      // Got you!
      this.stop();
      this.say(pick(['Nice try. OUT!', 'Found you!', 'Hide and seek\u2019s over, pal.']), 2);
      g.interactions.leaveHiding();
      g.fx.pop(hs.x, 1.8, hs.z, 'YOINK!', '#ffb02e');
      g.cam.shake(0.2, 0.2);
      p.hurt(10, this);
      s.checkHide = null;
      s.lostT = 0;
      return 'idle';
    }
    if (s.lastKnown) {
      if (!this.path && this.distTo(s.lastKnown) > 1) this.goTo(s.lastKnown.x, s.lastKnown.z, RUN);
      if (this.arrived || s.lostT > 7) {
        this.say(LINES.combatLost, 2);
        this.setState('search', { center: s.lastKnown, t: 28, hurry: true });
        if (!this.def.brawler) this.setHeld('pistol');
      }
    }
    return 'run';
  }

  shoot() {
    const g = this.game;
    const p = g.player;
    this.char.play('shoot', 0.25);
    const d = this.distTo(p.pos);
    const moving = p.speed > 3.5 ? 0.25 : p.speed > 1 ? 0.1 : 0;
    const chance = clamp(0.82 - d * 0.035 - moving - (p.flags.crouched ? 0.05 : 0), 0.15, 0.85);
    const hit = Math.random() < chance;
    const f = this.forward();
    const from = { x: this.pos.x + f.x * 0.5, y: 1.15, z: this.pos.z + f.z * 0.5 };
    const to = hit ? { x: p.pos.x, y: 1.0, z: p.pos.z } : { x: p.pos.x + (Math.random() - 0.5) * 2.5, y: 0.8 + Math.random(), z: p.pos.z + (Math.random() - 0.5) * 2.5 };
    g.fx.tracer(from, to);
    g.audio.sfx('gunshot', this.pos);
    g.emitNoise(this.pos.x, this.pos.z, 26, 'gunshot', this);
    if (hit) {
      after(0.06, () => p.hurt(22, this));
    }
  }

  // ------------------------------------------------------------------ search
  _search(dt) {
    const g = this.game;
    const s = this.s;
    s.t -= dt;
    if (!s.pt || (this.arrived && (s.wait = (s.wait || 0) + dt) > 2.2)) {
      s.wait = 0;
      const c = s.center || this.pos;
      s.pt = g.world.randomWalkableNear(c.x, c.z, s.radius || 8) || c;
      this.goTo(s.pt.x, s.pt.z, s.hurry ? HURRY : WALK * 1.2);
    }
    if (s.t <= 0) {
      this.say(LINES.searchEnd, 2);
      this.suspicion = 0;
      this.setHeld(this.def.hold || null);
      this.resumeRoutine();
    }
    if (this.seesPlayer && g.player.flags.compromised && this.knowsCompromised) {
      this.startCombat();
    }
    return this.arrived ? 'lookaround' : 'walk';
  }

  // ------------------------------------------------------------------ flee / cower
  _flee(dt) {
    const s = this.s;
    s.t += dt;
    if (this.arrived || s.t > 14) {
      this.setState('cower', { t: 14 + Math.random() * 10 });
      return 'cower';
    }
    return 'panic';
  }
  _cower(dt) {
    const s = this.s;
    s.t -= dt;
    this.face = 'scared';
    if (this.stateT % 7 < dt && Math.random() < 0.4) this.say(LINES.cower, 2);
    if (s.t <= 0 && this.game.director.level !== 'combat') {
      this.face = this.def.face || 'normal';
      this.resumeRoutine();
    }
    return 'cower';
  }

  // ------------------------------------------------------------------ bodies
  _checkBody(dt) {
    const g = this.game;
    const s = this.s;
    const b = s.body;
    if (!b || !b.isBody || b.found) {
      if (b && b.found && !s.reported) {
        this.resumeRoutine();
        return 'idle';
      }
      if (!b || !b.isBody) {
        this.say(pick(['Huh? It was right here…', 'Am I seeing things?']), 2);
        this.resumeRoutine();
        return 'idle';
      }
    }
    if (!s.started) {
      s.started = true;
      const p = g.world.nearestWalkable(b.pos.x + 0.6, b.pos.z + 0.6, 2) || b.pos;
      this.goTo(p.x, p.z, HURRY);
    }
    if (this.arrived || this.distTo(b.pos) < 1.4) {
      this.stop();
      this.faceTo(b.pos.x, b.pos.z, dt);
      s.k = (s.k || 0) + dt;
      if (s.k > 1.6 && !s.reported) {
        s.reported = true;
        if (b.cause?.accident) {
          // A tragic accident: shock and gossip, but no manhunt.
          b.found = true;
          this.say(pick(['Oh no! There\u2019s been a terrible accident!', 'Someone call a doctor! \u2026Or a priest.', 'What a horrible accident!']), 3);
          this.face = 'scared';
          this.resumeRoutine();
          return 'kneel';
        }
        if (this.isGuard) {
          this.say(LINES.bodyFoundGuard, 3);
          g.bodyFound(b, this);
          this.setState('search', { center: { ...b.pos }, t: 25, radius: 10 });
          this.knowsCompromised = true;
        } else {
          this.say(LINES.bodyFoundCiv, 2);
          g.bodyFound(b, this);
          this.panic(b.pos.x, b.pos.z, true);
        }
      }
      return 'kneel';
    }
    return 'run';
  }

  // ------------------------------------------------------------------ frisk (door guard)
  _frisk(dt) {
    const g = this.game;
    const s = this.s;
    this.faceTo(g.player.pos.x, g.player.pos.z, dt);
    s.t = (s.t || 0) + dt;
    if (s.t > 1.6 && !s.done) {
      s.done = true;
      s.onDone?.();
    }
    if (s.t > 2.2) this.resumeRoutine();
    return 'work';
  }

  _stunned(dt) {
    if (this.stateT > (this.s.t || 2)) {
      this.setState('investigate', { x: this.pos.x, z: this.pos.z, reason: 'stunned' });
    }
    return 'shocked';
  }

  // ------------------------------------------------------------------ inert
  knockOut(cause = {}) {
    if (this.inert) return;
    this.inert = true;
    this.state = 'ko';
    this.cause = cause;
    this.scripted = null;
    this.stop();
    this.speed = 0;
    this.suspicion = 0;
    this.speech = null;
    this.setHeld(null);
    this.y = 0;
    this.game.ui.clearSpeech(this);
  }
  kill(cause = {}) {
    const wasInert = this.inert;
    this.inert = true;
    this.state = 'dead';
    this.cause = cause;
    this.scripted = null;
    this.poisoned = null;
    this.stop();
    this.speed = 0;
    this.suspicion = 0;
    this.speech = null;
    this.setHeld(null);
    this.y = 0;
    this.game.ui.clearSpeech(this);
    if (!wasInert || cause.method) this.game.fx.ghost(this.pos.x, this.pos.z);
  }
  removeFromWorld() {
    this.gone = true;
    this.group.visible = false;
    this.group.removeFromParent();
  }
}

export { WALK, HURRY, RUN };
