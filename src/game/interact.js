// Player verbs: context actions (takedowns, bodies, pickups, hiding, devices)
// and item use (throw, melee, place, shoot).
import * as THREE from 'three';
import { ITEMS, makeItemMesh } from './items.js';
import { OUTFITS } from './outfits.js';
import { angleDiff, yawTo, dist, clamp, pick, after } from '../core/util.js';

const GRAV = 14;

export class Interactions {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.pickups = [];
    this.projectiles = [];
    this.hazards = [];
    this.current = { primary: null, secondary: null };
    this.highlight = null;
    this._glintT = 0;
  }

  add(def) {
    this.list.push(def);
    return def;
  }
  remove(def) {
    const i = this.list.indexOf(def);
    if (i >= 0) this.list.splice(i, 1);
  }

  // ---------------------------------------------------------------- pickups
  spawnPickup(id, x, z, y = 0.02, extra = {}) {
    const g = this.game;
    const isOutfit = id.startsWith('outfit_');
    const mesh = makeItemMesh(isOutfit ? 'outfit' : id);
    if (isOutfit) {
      const o = OUTFITS[id.slice(7)];
      mesh.traverse((m) => {
        if (m.isMesh && m.material && !m.material.side) {
          /* keep */
        }
      });
      // tint the folded clothes with the outfit colour
      const c = new THREE.Color(o?.top ?? 0x4a7fd6);
      mesh.traverse((m) => {
        if (m.isMesh && m.geometry.attributes.color && m.material.vertexColors) {
          const col = m.geometry.attributes.color.clone();
          for (let i = 0; i < col.count; i++) {
            if (col.getX(i) < 0.9 || col.getY(i) < 0.9) col.setXYZ(i, c.r, c.g, c.b);
          }
          m.geometry = m.geometry.clone();
          m.geometry.setAttribute('color', col);
        }
      });
    }
    mesh.position.set(x, y, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    g.scene.add(mesh);
    const p = { id, x, y, z, mesh, count: extra.count ?? 1, ammo: extra.ammo, outfit: isOutfit ? id.slice(7) : null, t: Math.random() * 3 };
    this.pickups.push(p);
    return p;
  }
  removePickup(p) {
    const i = this.pickups.indexOf(p);
    if (i >= 0) this.pickups.splice(i, 1);
    p.mesh.removeFromParent();
  }

  // ---------------------------------------------------------------- resolve
  resolve() {
    const g = this.game;
    const p = g.player;
    const out = { primary: null, secondary: null, target: null };
    if (!p.alive || p.busy) return out;
    if (p.perched) {
      out.primary = { label: 'Climb down', icon: '⬇', run: () => g.setpieces.exitPerch() };
      return out;
    }
    if (p.hidden) {
      out.primary = { label: 'Leave hiding', icon: '🚪', run: () => this.leaveHiding() };
      return out;
    }
    const f = p.forward();
    const cands = [];
    const consider = (x, z, range, score, a) => {
      const d = dist(p.pos.x, p.pos.z, x, z);
      if (d > range) return;
      const ang = Math.abs(angleDiff(p.yaw, yawTo(p.pos.x, p.pos.z, x, z)));
      if (d > 0.6 && ang > 1.4) return;
      cands.push({ ...a, s: d + ang * 0.6 - (score || 0) });
    };

    if (p.drag) {
      const body = p.drag;
      // containers
      for (const c of g.containers) {
        if (c.bodies.length >= c.cap) continue;
        consider(c.x, c.z, 1.8, 0.5, {
          primary: { label: `Hide body in ${c.name}`, icon: '📦', run: () => this.hideBody(body, c) },
        });
      }
      for (const it of this.list) {
        if (!it.bodyDump || (it.when && !it.when(p))) continue;
        consider(it.x, it.z, it.r || 1.8, 1, { primary: { label: it.label, icon: it.icon || '🌊', run: () => it.act(body) } });
      }
      // dump spots (segments)
      for (const s of g.level.dumpSpots) {
        const q = closestOnSeg(p.pos.x, p.pos.z, s.x1, s.z1, s.x2, s.z2);
        const d = dist(p.pos.x, p.pos.z, q.x, q.z);
        if (d < 1.6) cands.push({ s: d - 0.3, primary: { label: s.name, icon: '🌊', run: () => this.dumpBody(body, s, q) } });
      }
      cands.sort((a, b) => a.s - b.s);
      out.primary = cands[0]?.primary || { label: 'Drop body', icon: '⬇', run: () => this.dropBody() };
      if (body.hasOutfit && body.outfit !== p.outfit) out.secondary = { label: `Take ${OUTFITS[body.outfit].short} outfit`, icon: '👔', run: () => this.takeOutfit(body) };
      return out;
    }

    // NPCs (awake)
    for (const n of g.npcs) {
      if (n.inert || n.gone) continue;
      const d = n.distTo(p.pos);
      if (d > 1.5) continue;
      const toPlayer = yawTo(n.pos.x, n.pos.z, p.pos.x, p.pos.z);
      const behind = Math.abs(angleDiff(n.yaw, toPlayer)) > 1.9;
      const unaware = n.state !== 'combat' && !(n.seesPlayer && n.suspicion > 0.75);
      const special = this.list.filter((it) => it.npc === n && (!it.when || it.when(p)));
      if (special.length) {
        const sp = special[0];
        consider(n.pos.x, n.pos.z, sp.r || 1.6, 2, {
          primary: { label: sp.label, icon: sp.icon || '✋', danger: sp.danger, run: () => sp.act() },
          secondary: unaware ? { label: n.isTarget ? 'Subdue' : 'Subdue', icon: '💤', run: () => this.takedown(n, false) } : null,
          target: n,
        });
        continue;
      }
      if (n.state === 'combat' || !unaware) {
        consider(n.pos.x, n.pos.z, 1.4, 1, { primary: { label: 'Brawl', icon: '👊', danger: true, run: () => this.brawl(n) }, target: n });
        continue;
      }
      if (n.def.noTakedown) continue;
      const kill = { label: n.isTarget ? 'Eliminate' : 'Eliminate', icon: '☠', danger: !n.isTarget, run: () => this.takedown(n, true) };
      const ko = { label: behind ? 'Subdue' : 'Subdue (front)', icon: '💤', run: () => this.takedown(n, false) };
      consider(n.pos.x, n.pos.z, 1.45, 1.5, { primary: n.isTarget ? kill : ko, secondary: n.isTarget ? ko : kill, target: n });
    }
    // bodies
    for (const n of g.npcs) {
      if (!n.isBody) continue;
      const bx = n.pos.x - Math.sin(n.yaw) * 0.6, bz = n.pos.z - Math.cos(n.yaw) * 0.6;
      const sec = n.isTarget && n.state === 'ko'
        ? { label: 'Eliminate', icon: '☠', run: () => this.finishTarget(n) }
        : n.hasOutfit && n.outfit !== p.outfit
          ? { label: `Take ${OUTFITS[n.outfit].short} outfit`, icon: '👔', run: () => this.takeOutfit(n) }
          : null;
      consider(bx, bz, 1.7, 0.8, { primary: { label: 'Drag body', icon: '🧲', run: () => this.startDrag(n) }, secondary: sec, target: n });
    }
    // pickups
    for (const it of this.pickups) {
      const d = ITEMS[it.id];
      const label = it.outfit ? `Wear ${OUTFITS[it.outfit].name}` : `Pick up ${d.name}`;
      if (it.outfit && it.outfit === p.outfit) continue;
      consider(it.x, it.z, 1.35, 1.2, { primary: { label, icon: it.outfit ? '👔' : d.icon, run: () => this.pickup(it) } });
    }
    // hide spots
    for (const hs of g.level.hideSpots) {
      if (hs.occupied) continue;
      consider(hs.x, hs.z, 1.3, 0.2, { primary: { label: `Hide in ${hs.name}`, icon: '🚪', run: () => this.hide(hs) } });
    }
    // registered interactables
    for (const it of this.list) {
      if (it.bodyDump || it.npc) continue;
      if (it.when && !it.when(p)) continue;
      const lbl = typeof it.label === 'function' ? it.label(p) : it.label;
      if (!lbl) continue;
      const x = typeof it.x === 'function' ? it.x() : it.x;
      const z = typeof it.z === 'function' ? it.z() : it.z;
      const req = it.requires ? it.requires(p) : null;
      const primary = req
        ? { label: lbl, icon: '🔒', locked: true, run: () => g.ui.toast(req, 'warn', '🔒') }
        : { label: lbl, icon: it.icon || '✋', danger: it.danger, run: () => it.act(p) };
      const secLbl = it.altLabel ? (typeof it.altLabel === 'function' ? it.altLabel(p) : it.altLabel) : null;
      const secondary = secLbl ? { label: secLbl, icon: it.altIcon || '✋', run: () => it.alt(p) } : null;
      consider(x, z, it.r || 1.4, it.priority || 0.6, { primary, secondary });
    }
    // windows
    for (const w of g.level.windows) {
      consider(w.x, w.z, 1.3, 0.3, { primary: { label: 'Climb through window', icon: '🪟', run: () => this.climb(w) } });
    }
    if (!cands.length) return out;
    cands.sort((a, b) => a.s - b.s);
    const c = cands[0];
    out.primary = c.primary;
    out.secondary = c.secondary || null;
    out.target = c.target || null;
    return out;
  }

  update(dt, input) {
    const g = this.game;
    const p = g.player;
    this.current = this.resolve();
    const sel = p.selected;
    let useLabel = 'Use';
    if (sel) {
      const d = ITEMS[sel.id];
      useLabel = d.type === 'throw' ? 'Throw' : d.type === 'melee' ? 'Swing' : d.type === 'place' ? 'Place' : d.type === 'gun' ? 'Shoot' : d.throwable ? 'Throw' : 'Use';
    }
    g.ui.setPrompts(this.current.primary, this.current.secondary, useLabel);
    if (!g.paused && p.alive) {
      if (input.pressed('primary') && this.current.primary) this.current.primary.run();
      else if (input.pressed('secondary') && this.current.secondary) this.current.secondary.run();
    }
    this._updatePickups(dt);
    this._updateProjectiles(dt);
    this._updateHazards(dt);
  }

  _updatePickups(dt) {
    for (const p of this.pickups) p.t += dt;
  }

  // ---------------------------------------------------------------- actions
  takedown(n, lethal) {
    const g = this.game;
    const p = g.player;
    const toPlayer = yawTo(n.pos.x, n.pos.z, p.pos.x, p.pos.z);
    const behind = Math.abs(angleDiff(n.yaw, toPlayer)) > 1.9;
    const dur = lethal ? (n.isTarget ? 1.2 : 1.35) : behind ? 0.85 : 1.25;
    // victim in front of player, facing away
    const f = p.forward();
    n.stop();
    n.scripted = { blind: true, noPanic: true, update: () => 'struggle' };
    n.face = 'scared';
    n.pos.x = p.pos.x + f.x * 0.55;
    n.pos.z = p.pos.z + f.z * 0.55;
    n.yaw = p.yaw;
    if (!behind) {
      n.say(pick(['Hey—!', 'Wha—', 'Mmmph!']), 1);
      g.emitNoise(n.pos.x, n.pos.z, 5, 'fight', n);
    }
    g.audio.sfx('struggle', n.pos);
    p.startBusy({
      dur, anim: 'choke', illegal: true, illegalReason: 'takedown', face: n.pos,
      onTick: () => {
        n.pos.x = p.pos.x + f.x * 0.55;
        n.pos.z = p.pos.z + f.z * 0.55;
      },
      onDone: () => {
        if (lethal) {
          if (n.isTarget) g.eliminateTarget(n, { method: 'takedown', label: 'Up Close & Personal', silent: true });
          else g.killNpc(n, { method: 'takedown', label: 'Eliminated' });
        } else {
          g.knockOut(n, { method: 'subdue' });
        }
      },
    });
  }

  finishTarget(n) {
    const g = this.game;
    const p = g.player;
    p.startBusy({
      dur: 1.0, anim: 'kneel', illegal: true, illegalReason: 'takedown', face: n.pos,
      onDone: () => g.eliminateTarget(n, { method: 'takedown', label: 'Finished Off', silent: true }),
    });
  }

  brawl(n) {
    const g = this.game;
    const p = g.player;
    p.char.play('punch', 0.35);
    p.startBusy({
      dur: 0.45, anim: 'idle', illegal: true, illegalReason: 'brawl', face: n.pos,
      onDone: () => {
        g.emitNoise(n.pos.x, n.pos.z, 7, 'fight', n);
        g.audio.sfx('punch', n.pos);
        g.fx.pop(n.pos.x, 1.7, n.pos.z, 'WHAM!', '#ffb02e');
        g.cam.shake(0.2, 0.15);
        if (Math.random() < (n.isGuard ? 0.55 : 0.9) || n._brawlHits >= 1) {
          g.knockOut(n, { method: 'brawl' });
        } else {
          n._brawlHits = (n._brawlHits || 0) + 1;
          n.char.play('stagger', 0.6);
          n.meleeCD = 0.6;
        }
      },
    });
  }

  startDrag(n) {
    const g = this.game;
    const p = g.player;
    p.drag = n;
    p.sneak = false;
    g.audio.sfx('grab', n.pos);
    // first ever drag hint
    g.tutorial?.('drag');
  }
  dropBody() {
    const g = this.game;
    const p = g.player;
    if (!p.drag) return;
    g.audio.sfx('thud', p.drag.pos);
    p.drag = null;
  }
  hideBody(body, c) {
    const g = this.game;
    const p = g.player;
    p.startBusy({
      dur: 1.0, anim: 'push', illegal: true, illegalReason: 'drag', face: c,
      onDone: () => {
        p.drag = null;
        body.hiddenIn = c;
        c.bodies.push(body);
        body.group.visible = false;
        body.removeFromWorld();
        body.gone = false;
        body.hiddenIn = c;
        g.audio.sfx('thud', c);
        g.fx.puff(c.x, 0.8, c.z, 5, 0.35);
        g.director.stats.bodiesHidden++;
        g.ui.toast(`Body hidden in the ${c.name}`, 'good', '📦');
        g.challenges.event('bodyHidden', { container: c, body });
      },
    });
  }
  dumpBody(body, s, q) {
    const g = this.game;
    const p = g.player;
    p.startBusy({
      dur: 1.1, anim: 'push', illegal: true, illegalReason: 'drag', face: { x: q.x + s.nx, z: q.z + s.nz },
      onDone: () => {
        p.drag = null;
        const tx = q.x + s.nx * 2.5, tz = q.z + s.nz * 2.5;
        g.tossIntoSea(body, tx, tz, s.y);
        g.director.stats.bodiesHidden++;
        g.challenges.event('bodyDumped', { body, cliff: s.name.includes('cliff') });
        g.quip('dump');
      },
    });
  }
  takeOutfit(n) {
    const g = this.game;
    const p = g.player;
    const wasDragging = p.drag === n;
    p.drag = null;
    const old = p.outfit;
    p.startBusy({
      dur: 1.6, anim: 'kneel', illegal: true, illegalReason: 'disguise', face: n.pos, hideHeld: true,
      onDone: () => {
        g.fx.puff(p.pos.x, 0.9, p.pos.z, 10, 0.5);
        g.audio.sfx('zip', p.pos);
        p.setOutfit(n.outfit);
        n.hasOutfit = false;
        n.char.setOutfit({ ...OUTFITS.underwear, ...(n.def.underwear || {}) });
        // leave our old clothes on the floor
        if (old !== 'rook' || true) this.spawnPickup('outfit_' + old, p.pos.x + Math.sin(p.yaw + 1.5) * 0.6, p.pos.z + Math.cos(p.yaw + 1.5) * 0.6);
        g.ui.toast(`Disguised as ${OUTFITS[n.outfit].name}`, 'good', '👔');
        g.director.stats.disguises++;
        g.challenges.event('disguise', { outfit: n.outfit });
        g.tips.show('disguise');
        g.quip('disguise');
        if (wasDragging) p.drag = n;
      },
    });
  }
  pickup(it) {
    const g = this.game;
    const p = g.player;
    if (it.outfit) {
      const old = p.outfit;
      p.startBusy({
        dur: 1.4, anim: 'kneel', illegal: true, illegalReason: 'disguise', face: it, hideHeld: true,
        onDone: () => {
          this.removePickup(it);
          g.fx.puff(p.pos.x, 0.9, p.pos.z, 10, 0.5);
          g.audio.sfx('zip', p.pos);
          p.setOutfit(it.outfit);
          this.spawnPickup('outfit_' + old, it.x, it.z);
          g.ui.toast(`Disguised as ${OUTFITS[it.outfit].name}`, 'good', '👔');
          g.director.stats.disguises++;
          g.challenges.event('disguise', { outfit: it.outfit });
          g.tips.show('disguise');
          g.quip('disguise');
        g.quip('disguise');
        },
      });
      return;
    }
    p.char.play('pickup', 0.45);
    p.startBusy({
      dur: 0.35, anim: 'idle', face: it, illegal: !!ITEMS[it.id].illegal, illegalReason: 'weapon',
      onDone: () => {
        if (!this.pickups.includes(it)) return;
        this.removePickup(it);
        const s = p.add(it.id, it.count);
        if (it.ammo != null) s.ammo = it.ammo;
        g.audio.sfx('pickup', p.pos);
        const d = ITEMS[it.id];
        g.ui.toast(`${d.icon} ${d.name}`, 'info');
        g.story.event('pickup:' + it.id);
        g.challenges.event('pickup', { id: it.id });
        if (g.player.sel === -1 && d.type !== 'key' && d.type !== 'quest' && d.type !== 'poison') g.player.sel = g.player.inv.indexOf(s);
        g.emit('inventory');
      },
    });
  }
  hide(hs) {
    const g = this.game;
    const p = g.player;
    p.startBusy({
      dur: 0.5, anim: 'idle', face: hs, illegal: false,
      onDone: () => {
        p.hidden = hs;
        hs.occupied = true;
        p.pos.x = hs.x;
        p.pos.z = hs.z;
        g.audio.sfx(hs.kind === 'bush' ? 'rustle' : 'door', hs);
        if (hs.kind === 'bush') g.fx.emit('puff', hs.x, 0.8, hs.z, { n: 6, color: 0x5cbf3c, speed: 1.5, up: 1.5, gravity: 4, life: 0.6, size: 0.2 });
        // guards who saw us go in will come and check
        for (const n of g.npcs) {
          if (n.state === 'combat' && n.seesPlayer) {
            n.s.lastKnown = { x: hs.x, z: hs.z };
            n.s.checkHide = hs;
          }
        }
        g.challenges.event('hide', { spot: hs });
        g.quip('hide');
      },
    });
  }
  leaveHiding() {
    const g = this.game;
    const p = g.player;
    const hs = p.hidden;
    if (!hs) return;
    hs.occupied = false;
    p.hidden = null;
    p.pos.x = hs.x + Math.sin(hs.yaw + Math.PI) * 0.3;
    p.pos.z = hs.z + Math.cos(hs.yaw + Math.PI) * 0.3;
    p.yaw = hs.yaw + Math.PI;
    g.audio.sfx(hs.kind === 'bush' ? 'rustle' : 'door', hs);
    p.group.visible = true;
  }
  climb(w) {
    const g = this.game;
    const p = g.player;
    // determine side
    const side = w.horiz ? Math.sign(p.pos.z - w.z) : Math.sign(p.pos.x - w.x);
    const tx = w.horiz ? w.x : w.x - side * 0.9;
    const tz = w.horiz ? w.z - side * 0.9 : w.z;
    w.col.passable = true;
    p.startBusy({
      dur: 1.0, anim: 'sneak', illegal: true, illegalReason: 'climb', face: { x: tx, z: tz },
      onTick: (dt, b) => {
        const k = b.t / b.dur;
        const sx = w.horiz ? w.x : w.x + side * 0.7, sz = w.horiz ? w.z + side * 0.7 : w.z;
        p.pos.x = sx + (tx - sx) * k;
        p.pos.z = sz + (tz - sz) * k;
        p.y = Math.sin(k * Math.PI) * 0.75;
      },
      onDone: () => {
        p.y = 0;
        w.col.passable = false;
        p.pos.x = tx;
        p.pos.z = tz;
        g.audio.sfx('thud', p.pos);
      },
    });
    g.audio.sfx('rustle', p.pos);
  }

  // ---------------------------------------------------------------- item use
  useItem(input, aimed, forceThrow = false) {
    const g = this.game;
    const p = g.player;
    if (!p.alive || p.busy || p.hidden || p.drag || p.perched) return;
    const sel = p.selected;
    if (!sel) {
      g.ui.toast('Select an item first (tap a slot below).', 'info');
      return;
    }
    const d = ITEMS[sel.id];
    if (d.type === 'gun') return this.shoot(sel, aimed);
    if (d.type === 'place') return this.placePeel(sel);
    if (forceThrow) {
      if (d.type === 'throw' || d.throwable || d.type === 'melee') return this.throwItem(sel, aimed);
      g.ui.toast('That can\u2019t be thrown.', 'info');
      return;
    }
    if (d.type === 'melee' && !aimed) return this.swing(sel);
    if (d.type === 'throw' || d.throwable || (d.type === 'melee' && aimed)) return this.throwItem(sel, aimed);
    if (d.type === 'poison') g.ui.toast('Look for a drink or food to poison — a prompt will appear.', 'info', d.icon);
    else if (d.type === 'key' || d.type === 'tool') g.ui.toast('Use it on the right thing: walk up to a door, bolt or crate.', 'info', d.icon);
    else if (d.type === 'rifle') g.ui.toast('Find a high vantage point to use this.', 'info', d.icon);
    else g.ui.toast('This can’t be used directly.', 'info');
  }

  autoAimTarget(range = 9, cone = 0.55, needUnaware = true) {
    const g = this.game;
    const p = g.player;
    let best = null, bs = 1e9;
    for (const n of g.npcs) {
      if (n.inert || n.gone) continue;
      if (needUnaware && n.state === 'combat') continue;
      const d = n.distTo(p.pos);
      if (d > range || d < 0.5) continue;
      const a = Math.abs(angleDiff(p.yaw, yawTo(p.pos.x, p.pos.z, n.pos.x, n.pos.z)));
      if (a > cone) continue;
      if (g.world.segmentBlocked(p.pos.x, 1.4, p.pos.z, n.pos.x, 1.3, n.pos.z)) continue;
      const s = d + a * 6;
      if (s < bs) {
        bs = s;
        best = n;
      }
    }
    return best;
  }

  aimPoint(aimed) {
    const g = this.game;
    const p = g.player;
    if (aimed) return aimed;
    const f = p.forward();
    let reach = 7;
    const r = g.world.raycastSight(p.pos.x, p.pos.z, f.x, f.z, reach, 0.5);
    reach = Math.max(1, r - 0.5);
    return { x: p.pos.x + f.x * reach, z: p.pos.z + f.z * reach };
  }

  throwItem(sel, aimed) {
    const g = this.game;
    const p = g.player;
    const id = sel.id;
    const d = ITEMS[id];
    let target = null;
    let to;
    if (aimed) {
      to = aimed;
      p.yaw = yawTo(p.pos.x, p.pos.z, to.x, to.z);
    } else if (id !== 'coin' && id !== 'duck' && id !== 'firecracker') {
      target = this.autoAimTarget();
      to = target ? { x: target.pos.x, z: target.pos.z, y: 1.35 } : this.aimPoint();
      if (target) p.yaw = yawTo(p.pos.x, p.pos.z, to.x, to.z);
    } else {
      to = this.aimPoint();
    }
    p.char.play('throw', 0.4);
    p.remove(id, 1);
    if (id === 'coin') g.director.stats.coinsThrown++;
    const f = p.forward();
    const from = { x: p.pos.x + f.x * 0.35, y: 1.45, z: p.pos.z + f.z * 0.35 };
    const ty = to.y ?? 0.05;
    const D = Math.hypot(to.x - from.x, to.z - from.z);
    const T = clamp(D / 11, 0.22, 0.9);
    const proj = {
      id, x: from.x, y: from.y, z: from.z,
      vx: (to.x - from.x) / T, vz: (to.z - from.z) / T, vy: (ty - from.y + 0.5 * GRAV * T * T) / T,
      mesh: makeItemMesh(id), spin: 10, t: 0, target, lethal: !!d.lethal, ammo: sel.ammo,
    };
    proj.mesh.position.set(from.x, from.y, from.z);
    g.scene.add(proj.mesh);
    this.projectiles.push(proj);
    g.audio.sfx('whoosh', p.pos);
    g.emit('thrown', proj);
  }

  _updateProjectiles(dt) {
    const g = this.game;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.t += dt;
      const ox = pr.x, oy = pr.y, oz = pr.z;
      pr.vy -= GRAV * dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.z += pr.vz * dt;
      pr.mesh.position.set(pr.x, pr.y, pr.z);
      pr.mesh.rotation.x += pr.spin * dt;
      pr.mesh.rotation.z += pr.spin * 0.5 * dt;
      let landed = false;
      // hit NPC heads
      for (const n of g.npcs) {
        if (n.inert || n.gone || pr.t < 0.05) continue;
        const hx = n.pos.x, hz = n.pos.z, hy = n.y + n.char.headWorldY - 0.3;
        if (Math.abs(pr.x - hx) < 0.45 && Math.abs(pr.z - hz) < 0.45 && Math.abs(pr.y - hy) < 0.55) {
          this.projectileHit(pr, n);
          landed = true;
          break;
        }
      }
      if (!landed && g.world.segmentBlocked(ox, oy, oz, pr.x, pr.y, pr.z, { ignoreLow: pr.y > 1.2 })) {
        pr.x = ox;
        pr.z = oz;
        pr.y = Math.max(0.05, oy);
        pr.vx *= -0.2;
        pr.vz *= -0.2;
        this.land(pr, true);
        landed = true;
      }
      if (!landed && pr.y <= 0.04) {
        pr.y = 0.04;
        this.land(pr, false);
        landed = true;
      }
      if (!landed && pr.t > 4) landed = true;
      if (landed) {
        pr.mesh.removeFromParent();
        this.projectiles.splice(i, 1);
      }
    }
  }

  projectileHit(pr, n) {
    const g = this.game;
    const d = ITEMS[pr.id];
    if (pr.id === 'coin' || pr.id === 'duck') {
      g.audio.sfx(pr.id === 'duck' ? 'squeak' : 'clink', n.pos);
      n.say(pick(['Ow!', 'Hey! Who threw that?', 'Ouch!']), 1.5);
      n.suspicion = Math.max(n.suspicion, 0.5);
      n.lookAt = { ...g.player.pos };
      n.lookT = 2;
      if (n.isGuard && n.state !== 'combat') n.setState('investigate', { x: g.player.pos.x, z: g.player.pos.z, reason: 'odd' });
      this.land({ ...pr, x: n.pos.x + 0.4, z: n.pos.z + 0.3, y: 0.04 }, true);
      return;
    }
    if (pr.id === 'firecracker') {
      this.land(pr, false);
      return;
    }
    g.cam.shake(0.12, 0.12);
    if (pr.lethal) {
      if (n.isTarget) g.eliminateTarget(n, { method: 'thrown', label: 'Long Distance Delivery' });
      else g.killNpc(n, { method: 'thrown', label: 'Eliminated' });
      g.fx.pop(n.pos.x, 1.8, n.pos.z, 'THWACK!', '#ff4a4a');
    } else {
      g.fx.pop(n.pos.x, 1.8, n.pos.z, pr.id === 'fish' ? 'SLAP!' : pr.id === 'baguette' ? 'BAGUETTE!' : 'BONK!', '#ffe14a');
      g.audio.sfx('bonk', n.pos);
      g.knockOut(n, { method: 'thrown', item: pr.id });
      if (pr.id === 'baguette') g.fx.emit('confetti', n.pos.x, 1.6, n.pos.z, { n: 12, color: 0xe8b060, speed: 2, up: 3, life: 0.8, size: 0.1 });
      g.challenges.event('thrownKO', { item: pr.id, npc: n });
    }
    g.emitNoise(n.pos.x, n.pos.z, 4, 'clatter', n);
    this.spawnPickup(pr.id, n.pos.x + 0.5, n.pos.z + 0.2, 0.02, { ammo: pr.ammo });
    g.witnessCheck(n.pos, 'thrown');
  }

  land(pr, wall) {
    const g = this.game;
    const id = pr.id;
    if (id === 'firecracker') {
      g.fx.sparks(pr.x, 0.4, pr.z, 22);
      g.fx.puff(pr.x, 0.4, pr.z, 12, 0.6);
      g.fx.pop(pr.x, 1.2, pr.z, 'BANG!', '#ff7a2a', true);
      g.audio.sfx('bang', pr);
      g.cam.shake(0.3, 0.3);
      g.emitNoise(pr.x, pr.z, 22, 'explosion', null);
      return;
    }
    const loud = id === 'coin' ? 8 : id === 'duck' ? 8 : 9;
    g.audio.sfx(id === 'coin' ? 'clink' : id === 'duck' ? 'squeak' : 'clatter', pr);
    const p = g.world.nearestWalkable(pr.x, pr.z, 2) || { x: pr.x, z: pr.z };
    const pk = this.spawnPickup(id, p.x, p.z, 0.02, { ammo: pr.ammo });
    g.emitNoise(p.x, p.z, loud, 'impact', null, { item: pk });
    g.fx.groundRing(p.x, p.z, loud, 0xffe14a, 0.7);
  }

  swing(sel) {
    const g = this.game;
    const p = g.player;
    const d = ITEMS[sel.id];
    p.char.play('swing', 0.45);
    g.audio.sfx('whoosh', p.pos);
    p.startBusy({ dur: 0.38, anim: 'idle', illegal: true, illegalReason: 'attack', hideHeld: false });
    after(0.16, () => {
      const n = this.autoAimTarget(1.6, 1.1, false);
      if (!n) return;
      g.cam.shake(0.18, 0.15);
      g.hitStop(0.06);
      if (n.state === 'combat' && n.isGuard && Math.random() < 0.35) {
        n.char.play('stagger', 0.5);
        g.fx.pop(n.pos.x, 1.8, n.pos.z, 'BLOCK!', '#9fd8ff');
        return;
      }
      if (d.lethal) {
        if (n.isTarget) g.eliminateTarget(n, { method: 'melee', label: 'Up Close & Personal', item: sel.id });
        else g.killNpc(n, { method: 'melee', item: sel.id });
        g.fx.pop(n.pos.x, 1.8, n.pos.z, 'SHNK!', '#ff4a4a');
        g.audio.sfx('slash', n.pos);
      } else {
        const word = sel.id === 'pan' ? 'BONG!' : sel.id === 'fish' ? 'SLAP!' : sel.id === 'baguette' ? 'CRUNCH!' : 'BONK!';
        g.fx.pop(n.pos.x, 1.8, n.pos.z, word, '#ffe14a');
        g.audio.sfx(sel.id === 'pan' ? 'bong' : 'bonk', n.pos);
        g.knockOut(n, { method: 'melee', item: sel.id });
        g.challenges.event('meleeKO', { item: sel.id, npc: n });
        if (sel.id === 'baguette' || sel.id === 'fish') {
          if (Math.random() < 0.5 || sel.id === 'baguette') {
            // breaks!
            p.remove(sel.id, 1);
            g.ui.toast(sel.id === 'baguette' ? 'The baguette shattered into crumbs.' : 'The fish is… no longer usable.', 'info', ITEMS[sel.id].icon);
            g.fx.emit('confetti', n.pos.x, 1.6, n.pos.z, { n: 14, color: sel.id === 'baguette' ? 0xe8b060 : 0x7aa8c8, speed: 2, up: 3, life: 0.8, size: 0.1 });
          }
        }
      }
      g.emitNoise(n.pos.x, n.pos.z, 5, 'clatter', n);
    });
  }

  placePeel(sel) {
    const g = this.game;
    const p = g.player;
    p.startBusy({
      dur: 0.9, anim: 'drink', illegal: false,
      onDone: () => {
        p.remove(sel.id, 1);
        const f = p.forward();
        const x = p.pos.x + f.x * 0.7, z = p.pos.z + f.z * 0.7;
        const mesh = makeItemMesh('peel');
        mesh.position.set(x, 0.02, z);
        g.scene.add(mesh);
        this.hazards.push({ type: 'peel', x, z, mesh, t: 0 });
        g.fx.pop(p.pos.x, 2.0, p.pos.z, 'nom nom', '#fff3a0');
        g.audio.sfx('nom', p.pos);
        g.ui.toast('Peel placed. Now… wait.', 'info', '🍌');
      },
    });
  }

  _updateHazards(dt) {
    const g = this.game;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hz = this.hazards[i];
      hz.t += dt;
      if (hz.type !== 'peel') continue;
      // NPCs slip
      for (const n of g.npcs) {
        if (n.inert || n.gone || n.speed < 0.6) continue;
        if (Math.hypot(n.pos.x - hz.x, n.pos.z - hz.z) < 0.42) {
          this.hazards.splice(i, 1);
          hz.mesh.removeFromParent();
          g.slipNpc(n, hz);
          break;
        }
      }
      // player slips if running over it
      const p = g.player;
      if (this.hazards.includes(hz) && hz.t > 1.5 && p.running && Math.hypot(p.pos.x - hz.x, p.pos.z - hz.z) < 0.4) {
        this.hazards.splice(i, 1);
        hz.mesh.removeFromParent();
        g.audio.sfx('slip', p.pos);
        p.char.play('slip', 1.0);
        p.startBusy({ dur: 1.1, anim: 'idle' });
        g.fx.pop(p.pos.x, 1.8, p.pos.z, 'WHOOPS!', '#fff3a0');
        g.challenges.event('selfSlip');
      }
    }
  }

  shoot(sel, aimed) {
    const g = this.game;
    const p = g.player;
    if ((sel.ammo ?? 0) <= 0) {
      g.audio.sfx('click', p.pos);
      g.ui.toast('Out of ammo.', 'warn', '🔫');
      return;
    }
    let n = null;
    if (aimed) {
      p.yaw = yawTo(p.pos.x, p.pos.z, aimed.x, aimed.z);
      n = this.autoAimTarget(20, 0.25, false);
    } else n = this.autoAimTarget(18, 0.4, false);
    if (n) p.yaw = yawTo(p.pos.x, p.pos.z, n.pos.x, n.pos.z);
    sel.ammo--;
    g.emit('inventory');
    p.char.play('shoot', 0.3);
    p.startBusy({ dur: 0.3, anim: 'aim', illegal: true, illegalReason: 'shoot' });
    const f = p.forward();
    const from = { x: p.pos.x + f.x * 0.5, y: 1.2, z: p.pos.z + f.z * 0.5 };
    let to;
    if (n) to = { x: n.pos.x, y: 1.1, z: n.pos.z };
    else {
      const r = g.world.raycastSight(p.pos.x, p.pos.z, f.x, f.z, 20, 1.2);
      to = { x: p.pos.x + f.x * r, y: 1.2, z: p.pos.z + f.z * r };
    }
    g.fx.tracer(from, to);
    g.audio.sfx('gunshot', p.pos);
    g.emitNoise(p.pos.x, p.pos.z, 24, 'gunshot', null);
    g.director.stats.shots++;
    g.compromiseIfSeen('shoot');
    if (n) {
      if (n.isTarget) g.eliminateTarget(n, { method: 'shot', label: 'Shot' });
      else g.killNpc(n, { method: 'shot' });
    }
  }
}

function closestOnSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  return { x: ax + dx * t, z: az + dz * t };
}
