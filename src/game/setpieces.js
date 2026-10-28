// Set-pieces: the interactive contraptions behind every "accident".
import * as THREE from 'three';
import { buildProp, MeshSink } from '../core/geo.js';
import { vtoon, outlineBasic, PAL, toonGradient, makeRoofMaterial, makeRoofOutlineMaterial } from '../core/materials.js';
import { makeItemMesh, ITEMS } from './items.js';
import { pick, dist, yawTo, angleDiff, clamp, damp } from '../core/util.js';
import { WATER_Y } from './terrain.js';

const PI = Math.PI;
const B = (fn, o = 0.03) => buildProp(fn, vtoon(), outlineBasic(), { outline: o, castShadow: true, receiveShadow: true });

export class SetPieces {
  constructor(game) {
    this.game = game;
    this.updaters = [];
    this.perch = null;
  }

  init() {
    this.buildChandelier();
    this.buildShark();
    this.buildWhiskey();
    this.buildBar();
    this.buildToiletDrown();
    this.buildHotTub();
    this.buildRailing();
    this.buildMassage();
    this.buildBarbell();
    this.buildSauna();
    this.buildCrane();
    this.buildShake();
    this.buildSniper();
    this.buildSafe();
    this.buildDoors();
    this.buildExits();
    this.buildFrisk();
    this.buildStatue();
    this.buildTelescope();
    this.buildPuffer();
    this.buildMisc();
  }

  get g() {
    return this.game;
  }
  A(n) {
    return this.game.anchor(n);
  }
  add(it) {
    return this.game.interactions.add(it);
  }
  onEvent(name, npc) {
    const h = this['ev_' + name];
    if (h) h.call(this, npc);
  }
  update(dt) {
    for (const u of this.updaters) u(dt);
  }

  // Poison helpers ------------------------------------------------------------------
  poisonOptions(p) {
    const out = [];
    for (const id of ['deathcap', 'puffer', 'ratpoison']) if (p.has(id)) out.push(id);
    return out;
  }
  poisonAction(label, flagName, at, extra = {}) {
    const g = this.game;
    return this.add({
      x: at.x, z: at.z, r: extra.r || 1.5, icon: '🧪',
      when: extra.when,
      label: (p) => (g.story.has(flagName) ? null : label),
      requires: (p) => (this.poisonOptions(p).length ? null : 'You need poison: Deathcap (greenhouse), Pufferfish toxin (aquarium) or Rat Poison (kitchen).'),
      act: (p) => {
        const opts = this.poisonOptions(p);
        // Prefer lethal unless only emetic available.
        const id = opts.includes('deathcap') ? 'deathcap' : opts.includes('puffer') ? 'puffer' : 'ratpoison';
        p.startBusy({
          dur: 1.6, anim: 'use', illegal: true, illegalReason: 'poison', face: at,
          onDone: () => {
            p.remove(id, 1);
            g.story.flag(flagName);
            g.story.poisons = g.story.poisons || {};
            g.story.poisons[flagName] = ITEMS[id].poison;
            g.audio.sfx('pour', at);
            g.ui.toast(`${ITEMS[id].poison === 'lethal' ? 'Lethal' : 'Emetic'} poison added.`, 'good', ITEMS[id].icon);
            extra.onDone?.(ITEMS[id].poison);
          },
        });
      },
      altLabel: extra.altLabel,
      alt: extra.alt,
    });
  }
  // Apply a poison effect to an NPC: lethal -> collapses; emetic -> runs to a toilet.
  poisonNpc(n, kind, vomitAnchor) {
    const g = this.game;
    if (kind === 'lethal') {
      n.poisoned = { kind: 'lethal', t: 0, delay: 4 };
      g.challenges.event('poisonTaken', { npc: n });
      return;
    }
    // emetic: scripted run to a toilet, vomit there, then resume
    n.say(pick(['Ooh… that didn’t taste right…', 'Urp. Excuse me. EXCUSE ME.', 'I need… the little room… NOW.']), 2.5, { important: true });
    const spot = vomitAnchor ? this.A(vomitAnchor) : this.freeToilet();
    const st = { phase: 'run', t: 0, spot };
    n.goTo(spot.x, spot.z, 3.4);
    n.scripted = {
      blind: true, noPanic: true, vomiting: true, spot,
      update: (dt, npc) => {
        st.t += dt;
        if (st.phase === 'run') {
          if (npc.arrived || dist(npc.pos.x, npc.pos.z, spot.x, spot.z) < 0.5) {
            st.phase = 'vomit';
            st.t = 0;
            npc.stop();
            npc.yaw = spot.yaw ?? npc.yaw;
            npc.say('BLEEEARGH', 1.5);
            g.audio.sfx('vomit', npc.pos);
          }
          return 'run';
        }
        npc.yaw = damp(npc.yaw, spot.yaw ?? npc.yaw, 6, dt);
        if (Math.random() < dt * 0.6) g.fx.emit('drop', npc.pos.x + Math.sin(npc.yaw) * 0.5, 0.8, npc.pos.z + Math.cos(npc.yaw) * 0.5, { n: 3, color: 0x9fdf5a, speed: 0.6, up: 0.5, life: 0.5, size: 0.1 });
        if (st.t > 22) {
          npc.scripted = null;
          npc.say('Ugh. Better. Never drinking again.', 2);
          npc.resumeRoutine();
        }
        return 'vomit';
      },
    };
  }
  freeToilet() {
    return this.A('toilet0');
  }

  // =============================================================== CHANDELIER
  buildChandelier() {
    const g = this.game;
    const a = this.A('chandelier');
    const ch = B((s) => {
      s.cyl(0, 0, 0, 1.1, 0.12, PAL.gold);
      s.cyl(0, 0.12, 0, 0.6, 0.3, PAL.gold);
      s.ball(0, 0.6, 0, 0.22, PAL.gold);
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * PI * 2;
        s.box(Math.cos(t) * 0.9, 0.08, Math.sin(t) * 0.9, 0.08, 0.12, 0.08, PAL.gold, { outline: false });
        s.cyl(Math.cos(t) * 0.9, 0.12, Math.sin(t) * 0.9, 0.035, 0.18, PAL.cream, { outline: false });
        s.ball(Math.cos(t) * 0.9, 0.36, Math.sin(t) * 0.9, 0.055, 0xfff3a0, { outline: false });
        s.cone(Math.cos(t + 0.4) * 0.75, -0.25, Math.sin(t + 0.4) * 0.75, 0.06, 0.22, 0xcff4ff, { outline: false, rx: PI });
      }
      s.cone(0, -0.5, 0, 0.18, 0.5, 0xcff4ff, { rx: PI });
    });
    ch.position.set(a.x, 3.6, a.z);
    g.scene.add(ch);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4, 6), new THREE.MeshToonMaterial({ color: 0x8a7a4a, gradientMap: toonGradient }));
    chain.position.set(a.x, 6.3, a.z);
    g.scene.add(chain);
    const st = { y: 3.6, vy: 0, falling: false, down: false };
    this.chandelier = st;
    const w = this.A('winch');
    this.add({
      x: w.x, z: w.z, r: 1.4, focus: this.A('chandelier'), icon: '🔧',
      label: () => (st.down ? null : g.story.has('winch_loose') ? 'Release the chandelier' : 'Loosen winch bolts'),
      requires: (p) => (g.story.has('winch_loose') || p.has('wrench') ? null : 'The bolts are rusted solid. You need a Wrench.'),
      danger: true,
      act: (p) => {
        if (!g.story.has('winch_loose')) {
          p.startBusy({
            dur: 2.6, anim: 'work', illegal: true, illegalReason: 'tamper', face: { x: w.x + 1, z: w.z },
            onTick: (dt, b) => { if (Math.random() < dt * 3) g.audio.sfx('ratchet', w); },
            onDone: () => {
              g.story.flag('winch_loose');
              g.story.reveal('lights_out', true);
              g.ui.toast('Winch loosened. One pull and it drops.', 'good', '🔧');
            },
          });
        } else {
          p.startBusy({
            dur: 0.6, anim: 'use', illegal: true, illegalReason: 'tamper', face: { x: w.x + 1, z: w.z },
            onDone: () => this.dropChandelier(),
          });
        }
      },
    });
    this.updaters.push((dt) => {
      if (st.falling) {
        st.vy -= 20 * dt;
        st.y += st.vy * dt;
        if (st.y <= 0.15) {
          st.y = 0.15;
          st.falling = false;
          st.down = true;
          this.chandelierCrash();
        }
        ch.position.y = st.y;
        chain.position.y = st.y + 2.7;
      } else if (!st.down) {
        ch.rotation.y += dt * 0.05;
        ch.position.y = 3.6 + Math.sin(g.time * 0.8) * 0.02;
      }
    });
    this.chandelierMesh = ch;
  }
  dropChandelier() {
    const g = this.game;
    const st = this.chandelier;
    if (st.down || st.falling) return;
    st.falling = true;
    st.vy = 0;
    g.audio.sfx('snap', this.A('chandelier'));
    const baron = g.npcById('baron');
    if (baron && !baron.inert && dist(baron.pos.x, baron.pos.z, this.A('chandelier').x, this.A('chandelier').z) < 1.8) {
      g.slowmo(0.25, 1.4);
      g.killCam(baron, 1.8);
    }
  }
  chandelierCrash() {
    const g = this.game;
    const a = this.A('chandelier');
    g.audio.sfx('crash', a);
    g.cam.shake(0.5, 0.5);
    g.fx.sparks(a.x, 0.5, a.z, 20);
    g.fx.emit('drop', a.x, 0.4, a.z, { n: 26, color: 0xcff4ff, speed: 5, up: 4, gravity: 12, life: 0.9, size: 0.15 });
    g.fx.puff(a.x, 0.4, a.z, 10, 0.7);
    g.fx.pop(a.x, 2.2, a.z, 'CRASH!', '#ffe14a', true);
    g.world.addCircle(a.x, a.z, 1.0, { h: 0.6, sight: 'none' });
    for (const n of g.npcs) {
      if (n.gone || n.inert) continue;
      if (dist(n.pos.x, n.pos.z, a.x, a.z) < 1.5) {
        if (n.isTarget) g.eliminateTarget(n, { method: 'chandelier', label: 'Lights Out', accident: true, opp: 'lights_out' });
        else g.killNpc(n, { method: 'chandelier', accident: true });
      }
    }
    g.emitNoise(a.x, a.z, 22, 'crash', null);
  }
  ev_baronToast(n) {
    const g = this.game;
    const lines = [
      'Ahem! AHEM! Ladies and gentlemen!',
      'Thank you all for coming to my humble little island.',
      'Twenty years ago I was a nobody with a boat. Now I have… several boats!',
      'And I owe it all to my dear friends. And my enemies’ money! Ha!',
      'So raise your glasses! To the Syndicate! To me!',
    ];
    lines.forEach((l, i) => setTimeout(() => {
      if (n.inert || n.task?.id !== 'toast') return;
      n.say(l, 4.5, { important: true, range: 22 });
      if (i === lines.length - 1) {
        for (const o of g.npcs) if (!o.inert && o.role === 'guest' && o !== n && o.distTo(n.pos) < 12 && !o.scripted) o.char.play('cheer', 1.2);
      }
    }, 2000 + i * 5800));
    g.story.flag('baron_toasting');
  }

  // =============================================================== SHARK
  buildShark() {
    const g = this.game;
    const t = g.level.tank;
    const shark = B((s) => {
      s.sphere(0, 0, 0, 0.32, 0.3, 0.9, 0x6f8aa8);
      s.sphere(0, -0.08, 0.1, 0.26, 0.16, 0.7, 0xeef4f8, { outline: false });
      s.cone(0, 0.38, -0.05, 0.16, 0.42, 0x6f8aa8, { rx: -0.3 });
      s.cone(0, 0.05, -1.0, 0.2, 0.45, 0x6f8aa8, { rx: -PI / 2 });
      s.box(0, 0.2, -1.15, 0.05, 0.4, 0.15, 0x6f8aa8, { rx: 0.4 });
      s.box(0.3, -0.12, 0.15, 0.4, 0.04, 0.18, 0x6f8aa8, { rz: -0.4, ry: 0.3 });
      s.box(-0.3, -0.12, 0.15, 0.4, 0.04, 0.18, 0x6f8aa8, { rz: 0.4, ry: -0.3 });
      s.ball(0.17, 0.08, 0.6, 0.05, 0x111111, { outline: false });
      s.ball(-0.17, 0.08, 0.6, 0.05, 0x111111, { outline: false });
      s.box(0, -0.07, 0.78, 0.26, 0.03, 0.04, 0x8a2a3a, { outline: false });
      for (let i = 0; i < 6; i++) s.cone(-0.1 + i * 0.04, -0.06, 0.79, 0.012, 0.04, 0xffffff, { outline: false, rx: PI });
    });
    const cx = (t.x1 + t.x2) / 2, cz = (t.z1 + t.z2) / 2;
    g.scene.add(shark);
    const st = { a: 0, chomp: 0, burp: 0 };
    this.shark = st;
    this.updaters.push((dt) => {
      st.a += dt * 0.55;
      const R = 1.9;
      let x = cx + Math.cos(st.a) * R, z = cz + Math.sin(st.a) * R * 0.85;
      let y = 0.62 + Math.sin(st.a * 3) * 0.05;
      let yaw = Math.atan2(-Math.sin(st.a), Math.cos(st.a) * 0.85);
      if (st.chomp > 0) {
        st.chomp -= dt;
        const k = 1 - st.chomp / 1.4;
        x = st.cx; z = st.cz;
        y = 0.6 + Math.sin(k * PI) * 1.2;
        yaw = st.cyaw;
        shark.rotation.x = -Math.sin(k * PI) * 0.9;
      } else shark.rotation.x = 0;
      shark.position.set(x, y, z);
      shark.rotation.y = yaw;
      if (st.burp > 0) {
        st.burp -= dt;
        if (Math.random() < dt * 6) g.fx.emit('drop', x, 1.0, z, { n: 1, color: 0xe8fbff, speed: 0.2, up: 1.2, gravity: -1, life: 0.8, size: 0.15 });
      }
    });
    this.sharkMesh = shark;
    const fs = this.A('feed_spot');
    // Feed a body to the shark
    this.add({
      bodyDump: true, x: fs.x, z: fs.z, r: 1.8, label: 'Feed body to Mr. Nibbles', icon: '🦈',
      act: (body) => {
        const p = g.player;
        p.startBusy({
          dur: 1.1, anim: 'push', illegal: true, illegalReason: 'drag', face: { x: fs.x, z: fs.z - 1 },
          onDone: () => {
            p.drag = null;
            this.sharkEat(body, false);
            g.director.stats.bodiesHidden++;
            g.challenges.event('sharkFed', { body });
          },
        });
      },
    });
    // Push the Baron when he is feeding
    const baron = g.npcById('baron');
    this.add({
      npc: baron, r: 1.6, label: 'Push into the shark tank', icon: '🦈', danger: true,
      when: (p) => baron.task?.id === 'feed' && baron.taskPhase === 'act' && !baron.inert && !baron.scripted && Math.abs(angleDiff(baron.yaw, yawTo(baron.pos.x, baron.pos.z, p.pos.x, p.pos.z))) > 1.6,
      act: () => {
        const p = g.player;
        p.char.play('push', 0.5);
        p.startBusy({
          dur: 0.5, anim: 'idle', illegal: true, illegalReason: 'push', face: baron.pos,
          onDone: () => {
            g.story.flag('baron_fed');
            this.sharkEat(baron, true);
          },
        });
      },
    });
  }
  sharkEat(n, alive) {
    const g = this.game;
    const t = g.level.tank;
    const st = this.shark;
    const tx = clamp(n.pos.x, t.x1 + 1, t.x2 - 1), tz = t.z2 - 1.2;
    st.cx = tx; st.cz = tz; st.cyaw = 0;
    if (alive) {
      n.scripted = { blind: true, noPanic: true, update: () => 'panic' };
      n.say('WHOA— WHOA WHOA—', 1.2);
      g.slowmo(0.3, 1.2);
      g.killCam(n, 2.2);
    }
    // fling into the tank
    const sx = n.pos.x, sz = n.pos.z;
    let k = 0;
    const fly = (dt) => {
      k += dt / 0.45;
      n.pos.x = sx + (tx - sx) * Math.min(1, k);
      n.pos.z = sz + (tz - sz) * Math.min(1, k);
      n.y = Math.sin(Math.min(1, k) * PI) * 1.2 + 0.4;
      n.syncTransform();
      if (k >= 1) {
        this.updaters.splice(this.updaters.indexOf(fly), 1);
        g.fx.splash(tx, 1.05, tz, true);
        g.audio.sfx('splash', { x: tx, z: tz });
        setTimeout(() => {
          st.chomp = 1.4;
          g.audio.sfx('chomp', { x: tx, z: tz });
          g.fx.pop(tx, 2.4, tz, 'CHOMP!', '#ff5a5a', true);
          g.cam.shake(0.25, 0.3);
          setTimeout(() => {
            g.fx.splash(tx, 1.05, tz, true);
            if (n.isTarget) g.eliminateTarget(n, { method: 'shark', label: 'Feeding Time', accident: true, noBody: true, opp: 'feeding_time' });
            else if (!n.inert || n.state !== 'dead') g.killNpc(n, { method: 'shark', accident: true, noBody: true, silent: !alive });
            n.removeFromWorld();
            n.hiddenIn = { name: 'Shark' };
            st.burp = 3;
            setTimeout(() => {
              g.fx.pop(tx, 1.8, tz, '*burp*', '#9fe8ff');
              g.audio.sfx('burp', { x: tx, z: tz });
            }, 2200);
          }, 500);
        }, 250);
      }
    };
    this.updaters.push(fly);
    g.emitNoise(tx, tz, 7, 'splash', null);
  }
  ev_baronFeed(n) {
    const g = this.game;
    g.story.flag('baron_feeding');
    const p = g.player;
    if (p.outfit === 'aquarist' && p.zone()?.id === 'aquarium') {
      setTimeout(() => !n.inert && n.say('Ah, Finn! Just in time. Stand back, he’s feisty today.', 3, { important: true }), 1500);
    }
    setTimeout(() => g.story.flags.delete('baron_feeding'), 34000);
  }

  // =============================================================== WHISKEY
  buildWhiskey() {
    const g = this.game;
    const a = this.A('whiskey');
    const dec = makeItemMesh('decanter');
    dec.position.set(a.x, 0.86, a.z);
    g.scene.add(dec);
    this.poisonAction('Poison the whiskey decanter', 'whiskey_poisoned', this.A('whiskey_use'));
  }
  ev_baronWhiskey(n) {
    const g = this.game;
    setTimeout(() => {
      if (n.inert || n.task?.id !== 'study') return;
      n.setHeld('drink');
      n.char.play('use', 0.8);
      n.say('Ahh. Sixty years old and smooth as silk.', 3);
      if (g.story.has('whiskey_poisoned')) {
        const kind = g.story.poisons.whiskey_poisoned;
        g.story.flags.delete('whiskey_poisoned');
        n.poisonSource = 'nightcap';
        setTimeout(() => this.poisonNpc(n, kind, 'toilet2'), 2500);
      }
    }, 5000);
  }

  // =============================================================== BAR / MARTINI
  buildBar() {
    const g = this.game;
    const c = this.A('bar_counter');
    const glass = makeItemMesh('martini');
    glass.position.set(c.x - 0.15, 1.06, c.z);
    glass.visible = false;
    g.scene.add(glass);
    this.martini = { glass, on: false };
    this.poisonAction('Poison the martini', 'martini_poisoned', { x: c.x - 0.75, z: c.z }, {
      when: () => this.martini.on,
      onDone: () => g.story.reveal('vexed_martini', true),
    });
  }
  ev_vexBar(n) {
    const g = this.game;
    const bt = g.npcById('bartender');
    n.say('The usual, darling. Extra olive.', 2.5, { important: true });
    setTimeout(() => {
      if (bt && !bt.inert) bt.say('One Vexed Martini, coming right up.', 2.5);
      setTimeout(() => {
        if (n.inert || n.task?.id !== 'bar') return;
        this.martini.on = true;
        this.martini.glass.visible = true;
        if (bt && !bt.inert) bt.say('There you go. Let it breathe.', 2);
        setTimeout(() => {
          this.martini.on = false;
          this.martini.glass.visible = false;
          if (n.inert || n.task?.id !== 'bar') return;
          n.setHeld('martini');
          n.char.play('use', 0.8);
          n.say(pick(['Mmm. Perfection.', 'Delicious. Another in an hour.', 'Divine.']), 2);
          if (g.story.has('martini_poisoned')) {
            const kind = g.story.poisons.martini_poisoned;
            g.story.flags.delete('martini_poisoned');
            n.poisonSource = 'vexed_martini';
            setTimeout(() => this.poisonNpc(n, kind, 'toilet1'), 2000);
          }
          setTimeout(() => !n.inert && n.setHeld(null), 4000);
        }, 15000);
      }, 3000);
    }, 2000);
  }

  // =============================================================== TOILET DROWN
  buildToiletDrown() {
    const g = this.game;
    for (const id of ['baron', 'vex', 'brick']) {
      const n = g.npcById(id);
      this.add({
        npc: n, r: 1.5, label: 'Drown in the toilet', icon: '🚽', danger: true,
        when: (p) => n.scripted?.vomiting && !n.inert && dist(n.pos.x, n.pos.z, n.scripted.spot.x, n.scripted.spot.z) < 0.8,
        act: () => {
          const p = g.player;
          const f = p.forward();
          n.scripted = { blind: true, noPanic: true, update: () => 'struggle' };
          p.startBusy({
            dur: 2.0, anim: 'choke', illegal: true, illegalReason: 'takedown', face: n.pos,
            onTick: (dt, b) => { if (Math.random() < dt * 4) g.fx.emit('drop', n.pos.x, 0.6, n.pos.z, { n: 2, color: 0xbfe8f5, speed: 1, up: 1.5, life: 0.4, size: 0.1 }); },
            onDone: () => {
              g.audio.sfx('flush', n.pos);
              g.fx.pop(n.pos.x, 1.6, n.pos.z, 'glub glub', '#9fe8ff');
              g.eliminateTarget(n, { method: 'drowned', label: 'Flushed', accident: true, opp: n.poisonSource });
            },
          });
        },
      });
    }
  }

  // =============================================================== HOT TUB
  buildHotTub() {
    const g = this.game;
    const a = this.A('hottub_radio');
    const radio = B((s) => {
      s.box(0, 0.18, 0, 0.5, 0.36, 0.22, 0xc0603a);
      s.box(0, 0.18, 0.115, 0.42, 0.28, 0.02, 0xf2e0b0, { outline: false });
      s.cyl(-0.1, 0.18, 0.12, 0.08, 0.02, 0x5a3a2a, { rx: PI / 2, outline: false });
      s.cyl(0.13, 0.22, 0.12, 0.04, 0.02, PAL.gold, { rx: PI / 2, outline: false });
      s.box(0.15, 0.42, 0, 0.02, 0.25, 0.02, PAL.metal, { rz: -0.4, outline: false });
    }, 0.02);
    radio.position.set(33.9, 0.6, -22.1);
    radio.rotation.y = -2.3;
    g.scene.add(radio);
    const st = { inTub: false, done: false, radio };
    this.hottub = st;
    this.updaters.push((dt) => {
      if (!st.done && Math.random() < dt * 1.2 && g.dist(a) < 14) g.fx.notes(radio.position.x, 1.1, radio.position.z);
    });
    this.add({
      x: a.x, z: a.z, r: 1.3, icon: '📻', danger: true,
      label: () => (st.done ? null : 'Knock the radio into the hot tub'),
      act: (p) => {
        p.char.play('push', 0.5);
        p.startBusy({
          dur: 0.6, anim: 'idle', illegal: true, illegalReason: 'tamper', face: radio.position,
          onDone: () => this.radioDrop(),
        });
      },
    });
  }
  radioDrop() {
    const g = this.game;
    const st = this.hottub;
    st.done = true;
    g.story.flag('radio_dropped');
    const tub = this.A('hottub');
    const r = st.radio;
    const sx = r.position.x, sz = r.position.z;
    let k = 0;
    const fall = (dt) => {
      k += dt / 0.5;
      r.position.x = sx + (tub.x + 1.0 - sx) * Math.min(1, k);
      r.position.z = sz + (tub.z + 0.6 - sz) * Math.min(1, k);
      r.position.y = 0.6 + Math.sin(Math.min(1, k) * PI) * 0.5 - Math.max(0, k - 0.8) * 1.5;
      r.rotation.x += dt * 8;
      if (k >= 1) {
        this.updaters.splice(this.updaters.indexOf(fall), 1);
        r.visible = false;
        g.fx.splash(tub.x + 1, 0.7, tub.z + 0.6);
        g.fx.sparks(tub.x, 0.9, tub.z, 30);
        g.audio.sfx('zap', tub);
        g.fx.pop(tub.x, 2.2, tub.z, 'BZZZZT!', '#7fe8ff', true);
        let victim = null;
        for (const n of g.npcs) {
          if (n.inert || n.gone) continue;
          if (dist(n.pos.x, n.pos.z, tub.x, tub.z) < 2.0) victim = n;
        }
        if (victim) {
          victim.scripted = { blind: true, noPanic: true, update: () => 'electro' };
          if (victim.isTarget) {
            g.slowmo(0.35, 1.2);
            g.killCam(victim, 2.0);
          }
          this.flashSkeleton(victim, 1.4);
          setTimeout(() => {
            if (victim.isTarget) g.eliminateTarget(victim, { method: 'electrocuted', label: 'Hot Tub Time', accident: true, opp: 'hot_tub' });
            else g.killNpc(victim, { method: 'electrocuted', accident: true });
          }, 1400);
        }
        g.emitNoise(tub.x, tub.z, 9, 'crash', null);
      }
    };
    this.updaters.push(fall);
  }
  // Cartoon electrocution: flicker the character dark/bright.
  flashSkeleton(n, dur) {
    const g = this.game;
    let t = 0;
    const mesh = n.char.mesh;
    const orig = mesh.material;
    const dark = new THREE.MeshBasicMaterial({ color: 0x111122 });
    const fn = (dt) => {
      t += dt;
      mesh.material = Math.floor(t * 18) % 2 ? dark : orig;
      if (Math.random() < dt * 10) g.fx.sparks(n.pos.x, 1.0, n.pos.z, 3);
      if (t > dur) {
        mesh.material = orig;
        this.updaters.splice(this.updaters.indexOf(fn), 1);
      }
    };
    this.updaters.push(fn);
  }

  // =============================================================== RAILING
  buildRailing() {
    const g = this.game;
    const a = this.A('rail_loose');
    const rail = B((s) => {
      for (let i = 0; i <= 4; i++) s.cyl(-2 + i, 0, 0, 0.06, 1.0, 0xfff4e0, { seg: 6 });
      s.box(0, 1.0, 0, 4, 0.08, 0.1, 0xfff4e0);
      s.box(0, 0.5, 0, 4, 0.05, 0.05, 0xfff4e0, { outline: false });
      s.box(-1.5, 0.12, 0.06, 0.12, 0.12, 0.02, 0xa0603a, { outline: false });
      s.box(1.5, 0.12, 0.06, 0.12, 0.12, 0.02, 0xa0603a, { outline: false });
    });
    rail.position.set(a.x, 0, a.z);
    g.scene.add(rail);
    const col = g.world.addBox(a.x - 2, a.z - 0.15, a.x + 2, a.z + 0.15, { h: 1.05, sight: 'none', tag: 'railing' });
    const st = { broken: false, rail, col };
    this.railing = st;
    const spot = { x: a.x + 1.2, z: a.z + 0.9 };
    this.add({
      x: spot.x, z: spot.z, r: 1.5, icon: '🔧',
      label: () => (st.broken || g.story.has('rail_loose') ? null : 'Loosen the railing bolts'),
      requires: (p) => (p.has('wrench') ? null : 'The bolts are rusty. You need a Wrench.'),
      act: (p) => {
        p.startBusy({
          dur: 2.6, anim: 'kneel', illegal: true, illegalReason: 'tamper', face: { x: a.x + 1.2, z: a.z },
          onTick: (dt) => { if (Math.random() < dt * 3) g.audio.sfx('ratchet', a); },
          onDone: () => {
            g.story.flag('rail_loose');
            g.story.reveal('long_way_down', true);
            g.ui.toast('The railing wobbles ominously.', 'good', '🔧');
          },
        });
      },
    });
    const vex = g.npcById('vex');
    this.add({
      npc: vex, r: 1.6, label: 'Push over the railing', icon: '👐', danger: true,
      when: (p) => vex.task?.id === 'smoke' && vex.taskPhase === 'act' && !vex.inert && !vex.scripted && Math.abs(angleDiff(vex.yaw, yawTo(vex.pos.x, vex.pos.z, p.pos.x, p.pos.z))) > 1.6,
      act: () => {
        const p = g.player;
        p.char.play('push', 0.5);
        p.startBusy({ dur: 0.5, anim: 'idle', illegal: true, illegalReason: 'push', face: vex.pos, onDone: () => this.fallOff(vex, true) });
      },
    });
  }
  fallOff(n, pushed) {
    const g = this.game;
    const st = this.railing;
    const a = this.A('rail_loose');
    if (!st.broken) {
      st.broken = true;
      g.world.remove(st.col);
      let k = 0;
      const r = st.rail;
      const fn = (dt) => {
        k += dt;
        r.rotation.x = -Math.min(1.6, k * 3);
        r.position.y = -k * k * 6;
        r.position.z = a.z - k * 1.5;
        if (k > 1.5) {
          r.visible = false;
          this.updaters.splice(this.updaters.indexOf(fn), 1);
        }
      };
      this.updaters.push(fn);
      g.audio.sfx('snap', a);
    }
    n.scripted = { blind: true, noPanic: true, update: () => 'panic' };
    n.say(pushed ? 'Wha—?! NOOOooo…' : 'Oh— oh no— OHHHH NOOOO…', 2.5);
    if (n.isTarget) {
      g.slowmo(0.35, 1.3);
      g.killCam(n, 2.4);
    }
    const sx = n.pos.x, sz = n.pos.z;
    let k = 0;
    const fall = (dt) => {
      k += dt;
      n.pos.x = sx;
      n.pos.z = sz - Math.min(k, 1.2) * 2.4;
      n.y = 0.4 * Math.sin(Math.min(k, 0.4) * PI / 0.8) - Math.max(0, k - 0.3) ** 2 * 5;
      n.syncTransform();
      n.group.rotation.x = -k * 2.5;
      if (n.y < WATER_Y - 0.2) {
        this.updaters.splice(this.updaters.indexOf(fall), 1);
        g.fx.splash(n.pos.x, WATER_Y + 0.1, n.pos.z, true);
        g.audio.sfx('splash', n.pos);
        g.fx.pop(n.pos.x, 0.5, n.pos.z, 'SPLASH!', '#9fe8ff', true);
        n.group.rotation.x = 0;
        if (n.isTarget) g.eliminateTarget(n, { method: 'fall', label: 'A Long Way Down', accident: !pushed || !g.wasWitnessed(n.pos), noBody: true, opp: 'long_way_down' });
        else g.killNpc(n, { method: 'fall', accident: true, noBody: true });
        n.removeFromWorld();
        n.hiddenIn = { name: 'Sea' };
      }
    };
    this.updaters.push(fall);
  }
  ev_vexSmoke(n) {
    const g = this.game;
    if (g.story.has('rail_loose')) {
      setTimeout(() => {
        if (n.inert || n.task?.id !== 'smoke' || n.scripted) return;
        n.char.play('stretch', 1.0);
        n.say('Ahh, what a view. I’ll just lean on—', 2);
        setTimeout(() => !n.inert && n.task?.id === 'smoke' && !n.scripted && this.fallOff(n, false), 1400);
      }, 5000);
    }
  }

  // =============================================================== MASSAGE
  buildMassage() {
    const g = this.game;
    const vex = g.npcById('vex');
    this.add({
      npc: vex, r: 1.9, label: 'Eliminate (she won’t look)', icon: '💆', danger: true,
      when: (p) => vex.task?.id === 'massage' && vex.taskPhase === 'act' && !vex.inert && !vex.scripted && p.outfit === 'masseur',
      act: () => {
        const p = g.player;
        const t = this.A('massage_therapist');
        p.pos.x = t.x;
        p.pos.z = t.z;
        p.startBusy({
          dur: 2.2, anim: 'work', illegal: true, illegalReason: 'takedown', face: vex.pos,
          onTick: (dt, b) => {
            if (b.t > 1.2 && !b.said) {
              b.said = true;
              vex.say('Mmm, harder darling— hrk—', 1.5);
            }
          },
          onDone: () => g.eliminateTarget(vex, { method: 'massage', label: 'Hands-On Treatment', silent: true, opp: 'hands_on' }),
        });
      },
    });
  }
  ev_vexMassage(n) {
    const g = this.game;
    const th = g.npcById('therapist');
    const p = g.player;
    setTimeout(() => {
      if (n.inert) return;
      const thereT = th && !th.inert && th.distTo(this.A('massage_therapist')) < 4;
      if (p.outfit === 'masseur' && p.zone()?.id === 'spa' && g.dist(this.A('massage_table')) < 5) {
        n.say('You’re new. Your hands had better be warm. Shoulders, darling.', 3.5, { important: true });
        g.story.reveal('hands_on', true);
      } else if (!thereT) {
        n.say('Where IS that therapist? Honestly. The help on this island.', 3, { important: true });
      } else {
        n.say('Mmm. Yes. Right there. Don’t talk.', 2.5);
      }
    }, 1500);
    // Pull the therapist to work if she's around.
    if (th && !th.inert && th.state === 'routine') {
      th.task = { at: 'massage_therapist', do: 'work', t: [34, 34] };
      th.taskPhase = 'goto';
      const a = this.A('massage_therapist');
      th.goTo(a.x, a.z, 2.2);
    }
  }

  // =============================================================== BARBELL
  buildBarbell() {
    const g = this.game;
    const bar = B((s) => {
      s.cyl(0, 0, 0, 0.025, 1.6, PAL.metal, { rz: PI / 2 });
      for (const sx of [-0.62, -0.52, 0.52, 0.62]) s.cyl(sx, 0, 0, 0.2, 0.08, PAL.black, { rz: PI / 2 });
    });
    const b = this.A('bench');
    const restY = 1.15;
    bar.position.set(b.x, restY, 9.85);
    g.scene.add(bar);
    const st = { bar, y: restY, mode: 'rest', dropT: 0 };
    this.barbell = st;
    const spot = this.A('bench_spot');
    this.add({
      x: spot.x, z: spot.z, r: 1.4, icon: '🔧',
      label: () => (g.story.has('rack_loose') || st.mode === 'dropped' ? null : 'Loosen the rack’s safety pins'),
      requires: (p) => (p.has('wrench') ? null : 'The pins are bolted tight. You need a Wrench.'),
      act: (p) => {
        p.startBusy({
          dur: 2.2, anim: 'work', illegal: true, illegalReason: 'tamper', face: { x: b.x, z: 9.85 },
          onTick: (dt) => { if (Math.random() < dt * 3) g.audio.sfx('ratchet', spot); },
          onDone: () => {
            g.story.flag('rack_loose');
            g.story.reveal('pumping_iron', true);
            g.ui.toast('Safety pins loosened. Gravity will do the rest.', 'good', '🔧');
          },
        });
      },
    });
    this.updaters.push((dt) => {
      const brick = g.npcById('brick');
      if (st.mode === 'rest') {
        st.y = damp(st.y, restY, 8, dt);
        if (brick && !brick.inert && brick.task?.id === 'bench' && brick.taskPhase === 'act' && !brick.scripted) {
          st.y = 0.95 + (Math.sin(brick.char.time * 2.4) * 0.5 + 0.5) * 0.45;
          bar.position.z = damp(bar.position.z, 10.0, 6, dt);
        } else bar.position.z = damp(bar.position.z, 9.85, 6, dt);
      } else if (st.mode === 'falling') {
        st.v = (st.v || 0) - 18 * dt;
        st.y += st.v * dt;
        if (st.y <= 0.72) {
          st.y = 0.72;
          st.mode = 'dropped';
          g.audio.sfx('thud', bar.position);
          g.audio.sfx('crash', bar.position);
          g.fx.pop(bar.position.x, 1.6, bar.position.z, 'CLANG!', '#ffe14a', true);
          g.cam.shake(0.35, 0.3);
          g.emitNoise(bar.position.x, bar.position.z, 10, 'crash', null);
          if (brick && !brick.inert && dist(brick.pos.x, brick.pos.z, b.x, b.z) < 1.5) {
            g.eliminateTarget(brick, { method: 'barbell', label: 'Pumping Iron', accident: true, opp: 'pumping_iron' });
          }
        }
      }
      bar.position.y = st.y;
    });
  }
  ev_brickBench(n) {
    const g = this.game;
    n.say('Time to lift! No spotter. Spotters are for wimps.', 2.5);
    if (g.story.has('rack_loose')) {
      setTimeout(() => {
        if (n.inert || n.task?.id !== 'bench') return;
        n.say('Ninety-eight… ninety-nine… ONE HUNDR—', 2);
        g.slowmo(0.35, 1.2);
        g.killCam(n, 2.0);
        setTimeout(() => {
          this.barbell.mode = 'falling';
          this.barbell.v = -1;
        }, 600);
      }, 8000);
    }
  }

  // =============================================================== SAUNA
  buildSauna() {
    const g = this.game;
    const d = this.A('sauna_door');
    const door = B((s) => {
      s.box(0, 1.05, 0.55, 0.08, 2.1, 1.1, 0xb07a48);
      s.box(0, 1.5, 0.55, 0.1, 0.4, 0.4, 0xcff4ff, { outline: false });
      s.box(0.07, 1.0, 1.0, 0.06, 0.08, 0.2, PAL.metal, { outline: false });
    });
    door.position.set(d.x, 0, d.z - 0.55);
    g.scene.add(door);
    const st = { door, open: true, locked: false, heat: false, steamT: 0, col: null };
    this.sauna = st;
    door.rotation.y = -PI / 2;
    const brickInside = () => {
      const b = g.npcById('brick');
      return b && !b.inert && b.pos.x > 40.2 && b.pos.z < 11 && b.pos.z > 6;
    };
    this.add({
      x: d.x - 0.7, z: d.z, r: 1.4, icon: '🔒',
      label: () => (st.locked ? 'Unlatch the sauna door' : 'Latch the sauna door'),
      act: (p) => {
        p.startBusy({
          dur: 0.8, anim: 'use', illegal: !st.locked && brickInside(), illegalReason: 'tamper', face: d,
          onDone: () => {
            st.locked = !st.locked;
            g.audio.sfx('door', d);
            if (st.locked) {
              door.rotation.y = 0;
              st.col = g.world.addBox(d.x - 0.1, d.z - 0.7, d.x + 0.1, d.z + 0.7, { h: 2.4, tag: 'door' });
              if (brickInside()) g.story.flag('sauna_locked');
            } else {
              door.rotation.y = -PI / 2;
              g.world.remove(st.col);
              st.col = null;
              g.story.flags.delete('sauna_locked');
            }
          },
        });
      },
    });
    const pn = this.A('sauna_panel');
    this.add({
      x: pn.x, z: pn.z, r: 1.3, icon: '♨',
      label: () => (st.heat ? null : 'Crank the sauna heat to MAX'),
      act: (p) => {
        p.startBusy({
          dur: 1.2, anim: 'use', illegal: brickInside(), illegalReason: 'tamper', face: { x: pn.x + 1, z: pn.z },
          onDone: () => {
            st.heat = true;
            st.heatT = 0;
            g.audio.sfx('hiss', pn);
            g.ui.toast('Sauna: MAXIMUM HEAT.', 'good', '♨');
          },
        });
      },
    });
    this.updaters.push((dt) => {
      if (!st.heat) return;
      st.heatT += dt;
      if (Math.random() < dt * 8) g.fx.puff(41 + Math.random() * 2.5, 1.5, 7 + Math.random() * 3.5, 1, 0.4);
      const b = g.npcById('brick');
      const inside = brickInside();
      if (inside && st.locked && !st.cooking) {
        st.cooking = true;
        st.cookT = 0;
        g.story.flag('sauna_locked');
        b.scripted = {
          blind: true, noPanic: true,
          update: (dt2, npc) => {
            st.cookT += dt2;
            if (st.cookT < 9) {
              if (Math.random() < dt2 * 0.5) npc.say(pick(['HOT! HOT HOT HOT!', 'HEY! WHO LOCKED THE DOOR?!', 'LET BRICK OUT!', 'Brick is… melting…']), 1.6, { important: true });
              const a = this.A('sauna_door');
              npc.goTo(a.x + 0.6, a.z, 2.5);
              if (Math.random() < dt2 * 2) {
                g.audio.sfx('thud', a);
                g.emitNoise(a.x, a.z, 6, 'impact', npc);
              }
              return 'punch';
            }
            npc.stop();
            return 'shiver';
          },
        };
        setTimeout(() => {
          if (b.inert) return;
          if (st.locked && st.heat) {
            g.killCam(b, 1.6);
            g.eliminateTarget(b, { method: 'sauna', label: 'Steam Room', accident: true, opp: 'steam_room' });
          } else {
            b.scripted = null;
            b.say('Freedom! Brick needs… a cold shower.', 2);
            b.resumeRoutine();
          }
          st.cooking = false;
        }, 12000);
      } else if (inside && !st.locked && st.heatT > 3 && !st.complained) {
        st.complained = true;
        b.say('Whoa, too hot! Brick is out!', 2);
        b.taskT = 999;
        st.heat = false;
      }
      if (st.heatT > 40 && !st.cooking) {
        st.heat = false;
        st.complained = false;
      }
    });
  }
  ev_brickSauna(n) {
    this.game.story.flag('brick_in_sauna');
    setTimeout(() => this.game.story.flags.delete('brick_in_sauna'), 36000);
  }

  // =============================================================== CRANE
  buildCrane() {
    const g = this.game;
    const base = this.A('crane_base');
    const hook = this.A('crane_hook');
    const crane = B((s) => {
      s.block(0, 0, 0, 1.4, 0.4, 1.4, PAL.metalDark);
      for (let i = 0; i < 6; i++) s.block(0, 0.4 + i * 0.9, 0, 0.8, 0.9, 0.8, i % 2 ? PAL.yellow : 0xe8b030);
      s.block(0, 5.8, 0, 1.6, 1.0, 1.6, PAL.yellow);
      s.box(0, 6.0, 0.81, 1.2, 0.5, 0.04, PAL.glass, { outline: false });
    });
    crane.position.set(base.x, 0, base.z);
    g.scene.add(crane);
    const dx = hook.x - base.x, dz = hook.z - base.z;
    const len = Math.hypot(dx, dz) + 1.2;
    const arm = B((s) => {
      s.box(0, 0, len / 2 - 0.6, 0.5, 0.5, len, PAL.yellow);
      s.box(0, 0.6, -1.5, 1.0, 1.0, 1.4, PAL.metalDark);
    });
    arm.position.set(base.x, 6.6, base.z);
    arm.rotation.y = Math.atan2(dx, dz);
    g.scene.add(arm);
    // The tall crane would block the view: dither it away when Rook is near.
    const fadeMat = makeRoofMaterial();
    const fadeOl = makeRoofOutlineMaterial(fadeMat.userData.fade);
    for (const obj of [arm, crane]) obj.traverse((m) => { if (m.isMesh) m.material = m.material.side === THREE.BackSide ? fadeOl : fadeMat; });
    this.updaters.push((dt) => {
      const d = g.dist(base);
      fadeMat.userData.fade.value = damp(fadeMat.userData.fade.value, d < 16 ? 0.8 : 0, 5, dt);
    });
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5), new THREE.MeshBasicMaterial({ color: 0x2a2430 }));
    g.scene.add(cable);
    const crate = B((s) => {
      s.block(0, -0.65, 0, 1.3, 1.3, 1.3, 0xc0703a);
      s.box(0, -0.65, 0.66, 1.2, 0.2, 0.02, 0x8a4a2a, { outline: false });
      s.box(0, -0.65, -0.66, 1.2, 0.2, 0.02, 0x8a4a2a, { outline: false });
      s.box(0, 0.05, 0, 0.1, 0.1, 0.1, PAL.metal);
    });
    g.scene.add(crate);
    const st = { y: 4.6, falling: false, down: false, v: 0, crate, cable };
    this.crane = st;
    const place = () => {
      crate.position.set(hook.x, st.y, hook.z);
      const top = 6.4, bot = st.falling || st.down ? 6.3 : st.y + 0.05;
      cable.scale.y = Math.max(0.01, top - bot);
      cable.position.set(hook.x, (top + bot) / 2, hook.z);
    };
    place();
    const c = this.A('crane_controls');
    s_controls(this, g, c, st);
    this.updaters.push((dt) => {
      if (st.falling) {
        st.v -= 22 * dt;
        st.y += st.v * dt;
        if (st.y <= 1.3) {
          st.y = 1.3;
          st.falling = false;
          st.down = true;
          g.audio.sfx('crash', hook);
          g.cam.shake(0.45, 0.4);
          g.fx.puff(hook.x, 0.3, hook.z, 12, 0.7);
          g.fx.emit('confetti', hook.x, 0.6, hook.z, { n: 20, color: 0xc0703a, speed: 4, up: 4, life: 1, size: 0.15 });
          g.fx.pop(hook.x, 2.6, hook.z, 'KA-THUNK!', '#ffb02e', true);
          g.world.addRect(hook.x, hook.z, 1.3, 1.3, { h: 1.3, sight: 'low' });
          g.emitNoise(hook.x, hook.z, 18, 'crash', null);
          for (const n of g.npcs) {
            if (n.inert || n.gone) continue;
            if (dist(n.pos.x, n.pos.z, hook.x, hook.z) < 1.3) {
              if (n.isTarget) g.eliminateTarget(n, { method: 'crane', label: 'Special Delivery', accident: true, noBody: true, opp: 'special_delivery' });
              else g.killNpc(n, { method: 'crane', accident: true, noBody: true });
              n.removeFromWorld();
              n.hiddenIn = { name: 'Crate' };
            }
          }
        }
      } else if (!st.down) {
        st.y = 4.6 + Math.sin(g.time * 0.7) * 0.05;
        crate.rotation.y = Math.sin(g.time * 0.4) * 0.1;
      }
      place();
    });
    function s_controls(self, g2, c2, st2) {
      self.add({
        x: c2.x, z: c2.z, r: 1.5, focus: hook, icon: '🏗', danger: true,
        label: () => (st2.down || st2.falling ? null : 'Release the crane load'),
        act: (p) => {
          p.startBusy({
            dur: 0.8, anim: 'use', illegal: p.outfit !== 'dockworker', illegalReason: 'tamper', face: { x: c2.x + 1, z: c2.z },
            onDone: () => {
              st2.falling = true;
              st2.v = 0;
              g2.audio.sfx('snap', c2);
              const b = g2.npcById('brick');
              if (b && !b.inert && dist(b.pos.x, b.pos.z, hook.x, hook.z) < 1.5) {
                g2.slowmo(0.3, 1.0);
                g2.killCam(b, 1.8);
              }
            },
          });
        },
      });
    }
  }

  // =============================================================== SHAKE
  buildShake() {
    this.poisonAction('Poison the protein shake', 'shake_poisoned', this.A('shake_fridge'), { onDone: () => this.game.story.reveal('protein_shake', true) });
  }
  ev_brickShake(n) {
    const g = this.game;
    n.setHeld('shake');
    n.say('Shake time! GAINS!', 2);
    setTimeout(() => {
      if (n.inert) return;
      n.char.play('use', 0.8);
      setTimeout(() => !n.inert && n.setHeld(null), 3000);
      if (g.story.has('shake_poisoned')) {
        const kind = g.story.poisons.shake_poisoned;
        g.story.flags.delete('shake_poisoned');
        n.poisonSource = 'protein_shake';
        setTimeout(() => this.poisonNpc(n, kind, 'toilet0'), 2500);
      }
    }, 4000);
  }

  // =============================================================== SNIPER
  buildSniper() {
    const g = this.game;
    const rc = this.A('rifle_crate');
    const caseMesh = makeItemMesh('rifle_case');
    caseMesh.position.set(-38.8, 0.82, -39.1);
    caseMesh.rotation.y = 0.4;
    g.scene.add(caseMesh);
    this.add({
      x: rc.x, z: rc.z, r: 1.5, icon: '🎯',
      label: (p) => (p.has('rifle') || caseMesh.userData.empty ? null : 'Take the sniper rifle'),
      act: (p) => {
        p.startBusy({
          dur: 1.2, anim: 'use', illegal: true, illegalReason: 'weapon', face: caseMesh.position,
          onDone: () => {
            caseMesh.userData.empty = true;
            p.add('rifle', 1);
            g.audio.sfx('pickup', p.pos);
            g.ui.toast('🎯 Sniper rifle acquired. Now find a high perch.', 'good');
            g.story.reveal('sniper', true);
          },
        });
      },
    });
    const pp = this.A('sniper_perch');
    this.add({
      x: pp.x, z: pp.z, r: 1.5, icon: '⬆',
      label: () => 'Climb to the lantern gallery',
      requires: (p) => (p.has('rifle') ? null : 'Nice view up there. You’d need a rifle to make use of it.'),
      act: (p) => this.enterPerch(),
    });
  }
  enterPerch() {
    const g = this.game;
    const p = g.player;
    p.perched = true;
    p.sneak = false;
    this.perch = { yaw: 0.6, pitch: -0.25, zoom: 1, cool: 0 };
    g.ui.toast('Drag / move mouse to aim. Tap the shoot button or click to fire. Climb down when done.', 'info', '🎯');
    g.audio.sfx('door', p.pos);
    g.enterSniper();
  }
  exitPerch() {
    const g = this.game;
    g.player.perched = false;
    this.perch = null;
    g.exitSniper();
  }

  // =============================================================== SAFE
  buildSafe() {
    const g = this.game;
    const s = this.A('safe');
    const st = { open: false };
    this.add({
      x: s.x, z: s.z, r: 1.3, icon: '🔓',
      label: (p) => (st.open ? null : g.story.has('code_known') ? 'Open the safe (7-1-3)' : p.has('lockpick') ? 'Crack the safe (Lockpick)' : 'Try the safe'),
      act: (p) => {
        if (!g.story.has('code_known') && !p.has('lockpick')) {
          p.startBusy({ dur: 1.0, anim: 'use', illegal: true, illegalReason: 'tamper', face: { x: s.x - 1, z: s.z } });
          g.ui.toast('Locked. You need the code — or a lockpick and patience.', 'warn', '🔒');
          g.story.reveal('ledger', true);
          g.story.flags.delete('code_known');
          return;
        }
        const dur = g.story.has('code_known') ? 2.0 : 6.0;
        p.startBusy({
          dur, anim: 'work', illegal: true, illegalReason: 'tamper', face: { x: s.x - 1, z: s.z },
          onTick: (dt) => { if (Math.random() < dt * 4) g.audio.sfx('click', s); },
          onDone: () => {
            st.open = true;
            p.add('ledger', 1);
            g.audio.stinger('opportunity');
            g.ui.bigText('THE LEDGER', 'Proof your brother was framed. Get it off the island.', 'good');
            g.challenges.event('ledger');
          },
        });
      },
    });
  }

  // =============================================================== LOCKED DOORS
  buildDoors() {
    const g = this.game;
    for (const d of g.level.doors) {
      const w = d.w;
      const mesh = B((s) => {
        s.box(0, 1.05, w / 2, 0.08, 2.1, w, 0x7a4a2a);
        s.box(0, 1.05, w / 2, 0.1, 1.7, w - 0.3, 0x8a5a3a, { outline: false });
        s.ball(0.06, 1.0, w - 0.15, 0.05, PAL.gold, { outline: false });
        s.ball(-0.06, 1.0, w - 0.15, 0.05, PAL.gold, { outline: false });
      });
      // hinge at one end
      if (d.horiz) {
        mesh.position.set(d.x - w / 2, 0, d.z);
        mesh.rotation.y = PI / 2;
      } else {
        mesh.position.set(d.x, 0, d.z - w / 2);
      }
      g.scene.add(mesh);
      const col = d.horiz ? g.world.addBox(d.x - w / 2, d.z - 0.15, d.x + w / 2, d.z + 0.15, { h: 2.6, tag: 'door' }) : g.world.addBox(d.x - 0.15, d.z - w / 2, d.x + 0.15, d.z + w / 2, { h: 2.6, tag: 'door' });
      const st = { open: false, mesh, col };
      const open = () => {
        st.open = true;
        g.world.remove(col);
        g.world.updateNavRegion(col.minX, col.minZ, col.maxX, col.maxZ);
        g.audio.sfx('door', d);
        let k = 0;
        const base = mesh.rotation.y;
        const fn = (dt) => {
          k = Math.min(1, k + dt * 2.5);
          mesh.rotation.y = base - k * 1.6;
          if (k >= 1) this.updaters.splice(this.updaters.indexOf(fn), 1);
        };
        this.updaters.push(fn);
      };
      this.add({
        x: d.x + (d.horiz ? 0 : 0), z: d.z + (d.horiz ? 0.6 : 0), r: 1.6, icon: '🔑',
        label: (p) => (st.open ? null : p.has('keycard') ? `Unlock ${d.name} (Keycard)` : p.has('lockpick') ? `Pick the lock (${d.name})` : p.has('crowbar') ? `Pry open ${d.name} (noisy)` : `${d.name} is locked`),
        requires: (p) => (p.has('keycard') || p.has('lockpick') || p.has('crowbar') ? null : 'Locked. A Keycard would open it (security office desk). Or try the west window.'),
        act: (p) => {
          if (p.has('keycard')) p.startBusy({ dur: 0.6, anim: 'use', face: d, onDone: open });
          else if (p.has('lockpick')) p.startBusy({ dur: 4, anim: 'kneel', illegal: true, illegalReason: 'tamper', face: d, onTick: (dt) => { if (Math.random() < dt * 4) g.audio.sfx('click', d); }, onDone: open });
          else p.startBusy({ dur: 1.4, anim: 'work', illegal: true, illegalReason: 'tamper', face: d, onDone: () => { open(); g.emitNoise(d.x, d.z, 9, 'impact', null); g.fx.pop(d.x, 1.6, d.z, 'CRACK!', '#ffe14a'); } });
        },
      });
      // also allow from the other side
      this.add({
        x: d.x, z: d.z - (d.horiz ? 0.6 : 0), r: 1.6, icon: '🔑',
        label: () => (st.open ? null : `Open ${d.name} from inside`),
        act: (p) => p.startBusy({ dur: 0.5, anim: 'use', face: d, onDone: open }),
        when: (p) => (d.horiz ? p.pos.z < d.z : true),
      });
    }
  }

  // =============================================================== EXITS
  buildExits() {
    const g = this.game;
    const taxi = B((s) => {
      // water taxi
      const sk = new MeshSink();
      void sk;
      s.sphere(0, 0.2, 0, 1.2, 0.55, 3.0, PAL.white);
      s.sphere(0, 0.36, 0, 1.05, 0.32, 2.8, PAL.yellow, { outline: false });
      s.sphere(0, 0.42, 0, 0.96, 0.22, 2.6, PAL.woodLight, { outline: false });
      s.block(0, 0.45, -0.5, 1.5, 1.0, 1.5, PAL.white);
      s.block(0, 1.45, -0.5, 1.7, 0.1, 1.8, PAL.yellow);
      s.box(0, 1.0, 0.26, 1.2, 0.45, 0.02, PAL.glass, { outline: false });
      s.box(0, 1.65, -0.5, 0.9, 0.25, 0.04, PAL.black);
    });
    const ta = this.A('taxi');
    taxi.position.set(ta.x, WATER_Y + 0.9, ta.z);
    g.scene.add(taxi);
    const speed = B((s) => {
      s.sphere(0, 0.2, 0, 1.0, 0.45, 2.6, 0xc23b4a);
      s.sphere(0, 0.34, 0, 0.88, 0.25, 2.4, PAL.white, { outline: false });
      s.box(0, 0.75, 0.6, 1.4, 0.45, 0.06, PAL.glass, { rx: -0.6, outline: false });
      s.block(0, 0.4, -0.4, 1.2, 0.35, 0.9, 0x2a2430);
      s.block(0, 0.3, -2.4, 0.5, 0.6, 0.4, PAL.metalDark);
    });
    const sa = this.A('speedboat');
    speed.position.set(sa.x, WATER_Y + 0.9, sa.z);
    g.scene.add(speed);
    const row = B((s) => {
      s.sphere(0, 0.1, 0, 0.75, 0.3, 1.8, PAL.wood);
      s.sphere(0, 0.22, 0, 0.62, 0.15, 1.6, PAL.woodDark, { outline: false });
      s.block(0, 0.22, 0.2, 1.2, 0.05, 0.25, PAL.woodLight);
    });
    const ra = this.A('rowboat');
    row.position.set(ra.x, WATER_Y + 0.9, ra.z);
    row.rotation.y = ra.yaw;
    g.scene.add(row);
    this.boats = [taxi, speed, row];
    this.updaters.push(() => {
      const t = g.time;
      taxi.position.y = WATER_Y + 0.75 + Math.sin(t * 1.3) * 0.06;
      taxi.rotation.z = Math.sin(t * 1.1) * 0.03;
      speed.position.y = WATER_Y + 0.75 + Math.sin(t * 1.5 + 1) * 0.06;
      row.position.y = WATER_Y + 0.8 + Math.sin(t * 1.2 + 2) * 0.05;
      row.rotation.z = Math.sin(t * 0.9) * 0.05;
    });
    const exitAct = (name, mesh, kind) => (p) => {
      if (!g.story.exitReady) {
        g.ui.toast('You still have targets to deal with. (Pause → Abandon to quit.)', 'warn');
        return;
      }
      g.missionComplete(kind, mesh);
    };
    const te = this.A('taxi_exit');
    this.add({ x: te.x, z: te.z, r: 1.6, icon: '⛵', label: () => (g.story.exitReady ? 'Leave on the water taxi' : 'Water taxi (finish the job first)'), act: exitAct('taxi', taxi, 'taxi') });
    const se = this.A('speedboat_exit');
    this.add({
      x: se.x, z: se.z, r: 1.6, icon: '🚤', label: () => (g.story.exitReady ? 'Escape in the Baron’s speedboat' : 'Baron’s speedboat'),
      requires: (p) => (p.has('boatkey') ? null : 'Needs the speedboat key. The Baron keeps it on him.'),
      act: exitAct('speed', speed, 'speedboat'),
    });
    const re = this.A('rowboat_exit');
    this.add({ x: re.x, z: re.z, r: 1.8, icon: '🚣', label: () => (g.story.exitReady ? 'Row away quietly' : 'Rowboat (finish the job first)'), act: exitAct('row', row, 'rowboat') });
  }

  // =============================================================== FRISK
  buildFrisk() {
    const g = this.game;
    const st = { cooldown: 0, friskedOutfit: null };
    this.frisk = st;
    this.updaters.push((dt) => {
      st.cooldown -= dt;
      const p = g.player;
      if (!p.alive || p.busy || p.hidden || st.cooldown > 0) return;
      // entering the front door from outside
      if (p.pos.x > 0.5 && p.pos.x < 3.5 && p.pos.z > 0.1 && p.pos.z < 1.3 && p.vel.z < -0.3) {
        if (['guard', 'waiter', 'bartender', 'chef', 'cook', 'maid'].includes(p.outfit)) return;
        if (st.friskedOutfit === p.outfit + p.inv.map((s) => s.id).join()) return;
        const guards = ['door_guard1', 'door_guard2'].map((id) => g.npcById(id)).filter((n) => n && !n.inert && n.state === 'routine');
        if (!guards.length) return;
        const gd = guards[0];
        st.cooldown = 4;
        gd.say(['Hold it. Arms up, please.', 'Quick pat-down. House rules.'], 2);
        const illegal = p.inv.filter((s) => ITEMS[s.id].illegal);
        p.startBusy({
          dur: 1.8, anim: 'surrender', face: gd.pos,
          onDone: () => {
            if (illegal.length) {
              gd.say(`What’s THIS? ${ITEMS[illegal[0].id].name}! INTRUDER!`, 2.5, { important: true });
              g.compromise(gd);
              gd.startCombat();
            } else {
              gd.say(['You’re clean. Enjoy the party.', 'All good. Go on in.'], 2);
              st.friskedOutfit = p.outfit + p.inv.map((s) => s.id).join();
            }
          },
        });
        gd.setState('frisk', { t: 0 });
        g.tutorial?.('frisk');
      }
    });
  }

  // =============================================================== STATUE
  buildStatue() {
    const g = this.game;
    const a = this.A('statue_topple');
    const statue = B((s) => {
      s.block(0, 0, 0, 0.8, 0.9, 0.8, PAL.marbleDark);
      s.sphere(0, 1.45, 0, 0.3, 0.45, 0.25, PAL.marble);
      s.ball(0, 2.05, 0, 0.22, PAL.marble);
      s.cone(0, 2.25, 0, 0.26, 0.2, PAL.gold, { outline: false });
      s.sphere(0.32, 1.6, 0, 0.08, 0.32, 0.08, PAL.marble, { rz: -1.0 });
      s.cyl(0.55, 1.7, 0, 0.03, 0.9, PAL.gold, { rz: -0.3 });
    });
    statue.position.set(a.x, 0, a.z);
    g.scene.add(statue);
    const col = g.world.addRect(a.x, a.z, 0.8, 0.8, { h: 2.2, sight: 'low' });
    const st = { fallen: false };
    this.add({
      x: a.x + 1.0, z: a.z, r: 1.3, icon: '🗿', danger: true,
      label: () => (st.fallen ? null : 'Topple the statue'),
      act: (p) => {
        p.startBusy({
          dur: 1.4, anim: 'push', illegal: true, illegalReason: 'tamper', face: a,
          onDone: () => {
            st.fallen = true;
            g.world.remove(col);
            g.audio.sfx('creak', a);
            const vex = g.npcById('vex');
            if (vex && !vex.inert && dist(vex.pos.x, vex.pos.z, a.x - 1.6, a.z - 0.6) < 1.5) {
              g.slowmo(0.3, 1.0);
              g.killCam(vex, 1.8);
            }
            let k = 0;
            const fn = (dt) => {
              k += dt * 2.2 * (1 + k);
              const ang = Math.min(PI / 2, k);
              statue.rotation.z = ang;
              statue.rotation.y = 0.35;
              if (ang >= PI / 2) {
                this.updaters.splice(this.updaters.indexOf(fn), 1);
                g.audio.sfx('crash', a);
                g.cam.shake(0.35, 0.3);
                g.fx.puff(a.x - 1.5, 0.3, a.z - 0.5, 10, 0.6);
                g.fx.pop(a.x - 1.5, 1.6, a.z - 0.5, 'KRAK!', '#ffffff', true);
                g.world.addBox(a.x - 2.3, a.z - 0.9, a.x - 0.2, a.z + 0.3, { h: 0.8, sight: 'none' });
                g.emitNoise(a.x, a.z, 16, 'crash', null);
                for (const n of g.npcs) {
                  if (n.inert || n.gone) continue;
                  if (dist(n.pos.x, n.pos.z, a.x - 1.5, a.z - 0.5) < 1.2) {
                    if (n.isTarget) g.eliminateTarget(n, { method: 'statue', label: 'Art Critic', accident: true });
                    else g.killNpc(n, { method: 'statue', accident: true });
                  }
                }
              }
            };
            this.updaters.push(fn);
          },
        });
      },
    });
  }

  // =============================================================== TELESCOPE (fun)
  buildTelescope() {
    const g = this.game;
    const t = this.A('telescope');
    this.add({
      x: t.x, z: t.z, r: 1.3, icon: '🔭',
      label: () => 'Look through the telescope',
      act: (p) => {
        const z0 = g.cam.zoomTarget;
        g.cam.zoomTarget = 1;
        g.cam.override = null;
        g.cam.cinematic(new THREE.Vector3(t.x, 30, t.z + 26), new THREE.Vector3(0, 0, -6), 5);
        p.startBusy({ dur: 5, anim: 'read', face: { x: t.x, z: t.z - 1 }, onDone: () => (g.cam.zoomTarget = z0) });
        g.ui.toast('What a view. You can see the whole estate from here.', 'info', '🔭');
        g.challenges.event('telescope');
      },
    });
  }

  // =============================================================== PUFFERFISH
  buildPuffer() {
    const g = this.game;
    const a = this.A('puffer_tank');
    const st = { taken: 0 };
    this.add({
      x: a.x, z: a.z, r: 1.3, icon: '🐡',
      label: () => (st.taken >= 1 ? null : 'Milk the pufferfish (toxin)'),
      act: (p) => {
        p.startBusy({
          dur: 2.0, anim: 'work', illegal: true, illegalReason: 'tamper', face: { x: a.x - 1, z: a.z },
          onDone: () => {
            st.taken++;
            p.add('puffer', 1);
            g.fx.pop(a.x - 0.6, 1.6, a.z, '*puff*', '#ffe14a');
            g.audio.sfx('pickup', p.pos);
            g.ui.toast('🐡 Pufferfish toxin. Very lethal. Professor Puff looks offended.', 'good');
          },
        });
      },
    });
  }

  // =============================================================== MISC (DJ, piano)
  buildMisc() {
    const g = this.game;
    const dj = this.A('dj');
    const st = { loud: 0 };
    this.add({
      x: dj.x + 1.6, z: dj.z + 1.6, r: 1.4, icon: '🎵',
      label: () => (st.loud > 0 ? null : 'Crank the DJ’s volume'),
      act: (p) => {
        p.startBusy({
          dur: 0.8, anim: 'use', illegal: false, face: { x: dj.x + 1, z: dj.z },
          onDone: () => {
            st.loud = 18;
            g.audio.sfx('airhorn', dj);
            g.ui.toast('PARTY MODE.', 'info', '🎉');
            g.fx.confetti(dj.x + 1, 2, dj.z, 40);
            g.emitNoise(dj.x + 1, dj.z, 14, 'device', null, { line: 'Turn that DOWN!', device: { onInvestigate: () => (st.loud = 0) } });
            g.challenges.event('partyMode');
          },
        });
      },
    });
    this.updaters.push((dt) => {
      if (st.loud > 0) {
        st.loud -= dt;
        if (Math.random() < dt * 8) g.fx.notes(dj.x + 1 + (Math.random() - 0.5) * 4, 1.5, dj.z + (Math.random() - 0.5) * 6);
        for (const n of g.npcs) {
          if (n.inert || n.role !== 'guest' || n.isTarget || n.state !== 'routine') continue;
          if (n.distTo(dj) < 10 && Math.random() < dt * 0.4) n.char.play('cheer', 0.8);
        }
      }
    });
  }
}
