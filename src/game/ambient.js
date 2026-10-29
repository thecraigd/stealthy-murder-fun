// Ambient critters: seagulls that scatter when you run past, circling gulls,
// sideways crabs and butterflies. Pure delight, no gameplay.
import * as THREE from 'three';
import { buildProp } from '../core/geo.js';
import { vtoon, outlineBasic, PAL } from '../core/materials.js';
import { dist, damp } from '../core/util.js';

const B = (fn) => buildProp(fn, vtoon(), outlineBasic(), { outline: 0.015, castShadow: true, receiveShadow: false });

function gullMesh() {
  const root = new THREE.Group();
  const body = B((s) => {
    s.sphere(0, 0.12, 0, 0.11, 0.1, 0.2, PAL.white);
    s.ball(0, 0.2, 0.15, 0.07, PAL.white);
    s.cone(0, 0.19, 0.24, 0.025, 0.08, PAL.orange, { rx: Math.PI / 2 });
    s.box(0, 0.13, -0.2, 0.12, 0.03, 0.1, 0x9aa4ae);
    s.ball(0.04, 0.22, 0.19, 0.012, PAL.black, { outline: false });
    s.ball(-0.04, 0.22, 0.19, 0.012, PAL.black, { outline: false });
    s.cyl(0.04, 0, 0, 0.008, 0.06, PAL.orange, { outline: false });
    s.cyl(-0.04, 0, 0, 0.008, 0.06, PAL.orange, { outline: false });
  });
  root.add(body);
  const wingGeo = (side) => B((s) => s.box(side * 0.18, 0, 0, 0.36, 0.02, 0.14, 0xd8dee4));
  const wl = new THREE.Group(), wr = new THREE.Group();
  wl.add(wingGeo(1));
  wr.add(wingGeo(-1));
  wl.position.set(0.06, 0.16, 0);
  wr.position.set(-0.06, 0.16, 0);
  root.add(wl, wr);
  root.userData = { wl, wr };
  return root;
}

function crabMesh() {
  return B((s) => {
    s.sphere(0, 0.06, 0, 0.12, 0.06, 0.09, PAL.red);
    s.ball(0.05, 0.13, 0.06, 0.02, PAL.white, { outline: false });
    s.ball(-0.05, 0.13, 0.06, 0.02, PAL.white, { outline: false });
    s.ball(0.15, 0.06, 0.08, 0.04, PAL.red);
    s.ball(-0.15, 0.06, 0.08, 0.04, PAL.red);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) s.box(sx * 0.14, 0.03, -0.04 + i * 0.04, 0.1, 0.015, 0.015, PAL.red, { outline: false, rz: sx * 0.4 });
  });
}

export class Ambient {
  constructor(game) {
    this.game = game;
    this.gulls = [];
    this.crabs = [];
    this.flies = [];
    const g = game;
    const perches = [
      [-3, 31.4, 0.72], [3, 31.4, 0.72], [15, 31.4, 0.72], [18.5, 31.4, 0.72], [-2, 44.6, 1.05], [2, 41.0, 1.05],
      [-20, 30.5, 0.36], [24, 29.5, 0.36], [-10, -33.5, 1.06], [6, -33.5, 1.06], [-47, 30, 1.0], [-25.5, 30.8, 0.9],
    ];
    for (const [x, z, y] of perches) {
      const m = gullMesh();
      m.position.set(x, y, z);
      m.rotation.y = Math.random() * 6;
      g.scene.add(m);
      this.gulls.push({ m, home: { x, y, z }, state: 'perch', t: Math.random() * 5, vy: 0, a: Math.random() * 6, r: 6 + Math.random() * 6, cx: x, cz: z, h: 7 + Math.random() * 3 });
    }
    // always-circling gulls
    for (const [cx, cz] of [[0, 38], [-30, -38], [40, -30], [-40, 30], [10, 20]]) {
      const m = gullMesh();
      g.scene.add(m);
      this.gulls.push({ m, home: null, state: 'circle', t: 0, a: Math.random() * 6, r: 8 + Math.random() * 6, cx, cz, h: 8 + Math.random() * 4 });
    }
    for (const [x, z] of [[-38, 28.5], [-31, 27.5], [-43, 26]]) {
      const m = crabMesh();
      m.position.set(x, 0.02, z);
      g.scene.add(m);
      this.crabs.push({ m, x, z, ox: x, dir: 1, t: Math.random() * 3 });
    }
    const fcol = [0xffd94a, 0xff7fb0, 0xffffff, 0x9fd8ff];
    for (const [x, z] of [[9, 8.8], [19, 8.8], [9, 15.4], [19, 15.4], [-34, -21], [-30.5, -15.8], [-12, 16]]) {
      for (let k = 0; k < 2; k++) {
        const mat = new THREE.MeshBasicMaterial({ color: fcol[(((k + Math.round(x)) % 4) + 4) % 4], side: THREE.DoubleSide });
        const wg = new THREE.PlaneGeometry(0.12, 0.09);
        const grp = new THREE.Group();
        const w1 = new THREE.Mesh(wg, mat), w2 = new THREE.Mesh(wg, mat);
        w1.position.x = 0.06;
        w2.position.x = -0.06;
        const p1 = new THREE.Group(), p2 = new THREE.Group();
        p1.add(w1);
        p2.add(w2);
        grp.add(p1, p2);
        g.scene.add(grp);
        this.flies.push({ grp, p1, p2, cx: x, cz: z, a: Math.random() * 6, s: 0.6 + Math.random() * 0.5 });
      }
    }
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    for (const b of this.gulls) {
      b.t += dt;
      const { wl, wr } = b.m.userData;
      if (b.state === 'perch') {
        // pecking idle
        b.m.rotation.x = Math.sin(b.t * 2) > 0.9 ? 0.4 : 0;
        wl.rotation.z = wr.rotation.z = 0;
        const d = dist(p.pos.x, p.pos.z, b.home.x, b.home.z);
        const scare = (d < 3.2 && p.speed > 3.5) || d < 1.2 || g.npcs.some((n) => !n.inert && n.speed > 3 && dist(n.pos.x, n.pos.z, b.home.x, b.home.z) < 2.5);
        if (scare) {
          b.state = 'flee';
          b.t = 0;
          b.vy = 3;
          b.fx = (b.home.x - p.pos.x) / (d || 1);
          b.fz = (b.home.z - p.pos.z) / (d || 1);
          g.audio.sfx('gull', b.home);
          g.fx.emit('puff', b.home.x, b.home.y + 0.2, b.home.z, { n: 3, color: 0xffffff, speed: 1, up: 0.5, gravity: 0, life: 0.5, size: 0.12 });
        }
      } else if (b.state === 'flee') {
        b.m.position.x += b.fx * 4 * dt;
        b.m.position.z += b.fz * 4 * dt;
        b.m.position.y += b.vy * dt;
        b.vy = damp(b.vy, 1.2, 1, dt);
        b.m.rotation.y = Math.atan2(b.fx, b.fz);
        b.m.rotation.x = -0.3;
        const f = Math.sin(b.t * 24) * 0.9;
        wl.rotation.z = f;
        wr.rotation.z = -f;
        if (b.t > 2.5) {
          b.state = 'circle';
          b.cx = b.home.x;
          b.cz = b.home.z;
          b.t = 0;
        }
      } else {
        // circle, return home after a while
        b.a += dt * (0.35 + 2 / b.r);
        const tx = b.cx + Math.cos(b.a) * b.r, tz = b.cz + Math.sin(b.a) * b.r;
        b.m.position.x = damp(b.m.position.x, tx, 2, dt);
        b.m.position.z = damp(b.m.position.z, tz, 2, dt);
        b.m.position.y = damp(b.m.position.y, b.h + Math.sin(b.a * 2) * 0.5, 1, dt);
        b.m.rotation.y = b.a + Math.PI;
        b.m.rotation.x = 0;
        b.m.rotation.z = 0.35;
        const glide = Math.sin(b.t * 0.7) > 0.3;
        const f = glide ? 0.15 : Math.sin(b.t * 14) * 0.7;
        wl.rotation.z = f;
        wr.rotation.z = -f;
        if (b.home && b.t > 14 && dist(p.pos.x, p.pos.z, b.home.x, b.home.z) > 8) b.state = 'land';
      }
      if (b.state === 'land') {
        b.m.position.x = damp(b.m.position.x, b.home.x, 2.5, dt);
        b.m.position.z = damp(b.m.position.z, b.home.z, 2.5, dt);
        b.m.position.y = damp(b.m.position.y, b.home.y, 2.5, dt);
        b.m.rotation.z = 0;
        const f = Math.sin(b.t * 18) * 0.6;
        wl.rotation.z = f;
        wr.rotation.z = -f;
        if (Math.abs(b.m.position.y - b.home.y) < 0.05) b.state = 'perch';
      }
    }
    for (const c of this.crabs) {
      c.t += dt;
      const d = dist(p.pos.x, p.pos.z, c.x, c.z);
      const sp = d < 2.5 ? 2.2 : 0.4;
      if (d < 2.5) c.dir = Math.sign(c.x - p.pos.x) || 1;
      else if (Math.abs(c.x - c.ox) > 2.5) c.dir = -Math.sign(c.x - c.ox);
      c.x += c.dir * sp * dt * (Math.sin(c.t * 3) > -0.3 ? 1 : 0);
      c.m.position.set(c.x, 0.02 + Math.abs(Math.sin(c.t * 14)) * 0.02, c.z);
    }
    for (const f of this.flies) {
      f.a += dt * f.s;
      f.grp.position.set(f.cx + Math.sin(f.a * 1.3) * 1.2, 0.9 + Math.sin(f.a * 3.1) * 0.3, f.cz + Math.cos(f.a) * 0.9);
      f.grp.rotation.y = f.a * 1.3;
      const fl = Math.sin(g.time * 22 + f.cx) * 1.1;
      f.p1.rotation.y = fl;
      f.p2.rotation.y = -fl;
    }
  }
}
