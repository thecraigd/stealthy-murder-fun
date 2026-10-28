// Juice: particles, comic pop-text, tracers, ghosts, splashes, star rings.
import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { toonGradient } from '../core/materials.js';

function canvasTex(draw, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TEX = {};
function tex(name) {
  if (TEX[name]) return TEX[name];
  switch (name) {
    case 'star':
      TEX[name] = canvasTex((g, s) => {
        g.translate(s / 2, s / 2);
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? s * 0.2 : s * 0.46;
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.closePath();
        g.fillStyle = '#ffe14a';
        g.fill();
        g.lineWidth = 4;
        g.strokeStyle = '#2a2026';
        g.stroke();
      });
      break;
    case 'puff':
      TEX[name] = canvasTex((g, s) => {
        g.fillStyle = '#ffffff';
        g.strokeStyle = '#2a2026';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = '#dfe8f0';
        g.beginPath();
        g.arc(s * 0.58, s * 0.6, s * 0.2, 0, Math.PI * 2);
        g.fill();
      });
      break;
    case 'drop':
      TEX[name] = canvasTex((g, s) => {
        g.fillStyle = '#e8fbff';
        g.strokeStyle = '#2a7ab0';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(s / 2, s / 2, s * 0.35, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      });
      break;
    case 'spark':
      TEX[name] = canvasTex((g, s) => {
        g.strokeStyle = '#7fe8ff';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(s * 0.1, s * 0.5);
        g.lineTo(s * 0.4, s * 0.3);
        g.lineTo(s * 0.55, s * 0.65);
        g.lineTo(s * 0.9, s * 0.45);
        g.stroke();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2;
        g.stroke();
      });
      break;
    case 'heart':
      TEX[name] = canvasTex((g, s) => {
        g.fillStyle = '#ff5a8a';
        g.translate(s / 2, s / 2 + 4);
        g.beginPath();
        g.moveTo(0, s * 0.3);
        g.bezierCurveTo(-s * 0.5, 0, -s * 0.3, -s * 0.4, 0, -s * 0.15);
        g.bezierCurveTo(s * 0.3, -s * 0.4, s * 0.5, 0, 0, s * 0.3);
        g.fill();
      });
      break;
    case 'note':
      TEX[name] = canvasTex((g, s) => {
        g.fillStyle = '#2a2026';
        g.font = `bold ${s * 0.8}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('♪', s / 2, s / 2);
      });
      break;
    case 'zzz':
      TEX[name] = canvasTex((g, s) => {
        g.fillStyle = '#ffffff';
        g.strokeStyle = '#2a2026';
        g.lineWidth = 5;
        g.font = `900 ${s * 0.7}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.strokeText('z', s / 2, s / 2);
        g.fillText('z', s / 2, s / 2);
      });
      break;
    case 'confetti':
      TEX[name] = canvasTex((g, s) => {
        g.fillStyle = '#ffffff';
        g.fillRect(s * 0.25, s * 0.35, s * 0.5, s * 0.3);
      });
      break;
    case 'glint':
      TEX[name] = canvasTex((g, s) => {
        g.translate(s / 2, s / 2);
        g.fillStyle = '#ffffff';
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const r = i % 2 ? s * 0.08 : s * 0.48;
          const a = (i / 8) * Math.PI * 2;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.fill();
      });
      break;
    case 'ring':
      TEX[name] = canvasTex((g, s) => {
        g.strokeStyle = '#ffffff';
        g.lineWidth = 5;
        g.beginPath();
        g.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2);
        g.stroke();
      });
      break;
  }
  return TEX[name];
}

export class FX {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.parts = [];
    this.pool = [];
    this.pops = [];
    this.tracers = [];
    this.ghosts = [];
    this.starRings = [];
    this.glints = [];
    this.root = new THREE.Group();
    this.root.name = 'fx';
    this.scene.add(this.root);
    this.popLayer = document.createElement('div');
    this.popLayer.className = 'pop-layer';
    document.getElementById('ui').appendChild(this.popLayer);
    const gm = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient, transparent: true, opacity: 0.9 });
    this.ghostMat = gm;
    this.ghostGeo = new THREE.SphereGeometry(0.25, 12, 10);
    this.tailGeo = new THREE.ConeGeometry(0.22, 0.4, 10);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x241c2c });
    this.eyeGeo = new THREE.SphereGeometry(0.04, 6, 6);
  }

  _sprite(texName, color = 0xffffff) {
    let s = this.pool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      this.root.add(s);
    }
    s.material.map = tex(texName);
    s.material.color.set(color);
    s.material.opacity = 1;
    s.material.rotation = 0;
    s.material.needsUpdate = true;
    s.visible = true;
    return s;
  }

  emit(texName, x, y, z, opts = {}) {
    const n = opts.n ?? 8;
    for (let i = 0; i < n; i++) {
      const s = this._sprite(texName, Array.isArray(opts.color) ? opts.color[i % opts.color.length] : opts.color ?? 0xffffff);
      const sp = opts.speed ?? 2;
      const a = Math.random() * Math.PI * 2;
      const up = opts.up ?? 2;
      const p = {
        s, x: x + (Math.random() - 0.5) * (opts.spread ?? 0.2), y, z: z + (Math.random() - 0.5) * (opts.spread ?? 0.2),
        vx: Math.cos(a) * sp * (0.4 + Math.random() * 0.6), vy: up * (0.5 + Math.random() * 0.8), vz: Math.sin(a) * sp * (0.4 + Math.random() * 0.6),
        g: opts.gravity ?? 6, life: (opts.life ?? 0.8) * (0.7 + Math.random() * 0.6), t: 0,
        size: (opts.size ?? 0.25) * (0.7 + Math.random() * 0.6), grow: opts.grow ?? 0, spin: (Math.random() - 0.5) * (opts.spin ?? 0),
        drag: opts.drag ?? 0.5,
      };
      p.s.scale.setScalar(p.size);
      p.s.position.set(p.x, p.y, p.z);
      this.parts.push(p);
    }
  }

  puff(x, y, z, n = 8, size = 0.5) {
    this.emit('puff', x, y, z, { n, speed: 1.6, up: 0.8, gravity: -0.6, life: 0.9, size, grow: 1.4, drag: 2.5 });
  }
  splash(x, y, z, big = false) {
    this.emit('drop', x, y, z, { n: big ? 26 : 12, speed: big ? 3 : 1.8, up: big ? 7 : 4.5, gravity: 14, life: 1.0, size: big ? 0.28 : 0.18 });
    this.emit('puff', x, y + 0.1, z, { n: big ? 8 : 4, speed: 1.2, up: 0.4, gravity: -0.4, life: 0.8, size: big ? 0.7 : 0.4, grow: 1, drag: 3, color: 0xe8fbff });
  }
  sparks(x, y, z, n = 14) {
    this.emit('spark', x, y, z, { n, speed: 3.5, up: 3, gravity: 6, life: 0.5, size: 0.3, spin: 20 });
  }
  confetti(x, y, z, n = 40) {
    this.emit('confetti', x, y, z, { n, speed: 3, up: 6, gravity: 5, life: 2.2, size: 0.18, spin: 12, drag: 1.2, color: [0xff5a5a, 0xffd94a, 0x4ad0ff, 0x7fef6a, 0xff7fd0, 0xb07fff] });
  }
  hearts(x, y, z, n = 5) {
    this.emit('heart', x, y, z, { n, speed: 0.6, up: 1.2, gravity: -0.5, life: 1.4, size: 0.25 });
  }
  notes(x, y, z, n = 1) {
    this.emit('note', x, y, z, { n, speed: 0.4, up: 0.8, gravity: -0.3, life: 1.6, size: 0.3 });
  }
  zzz(x, y, z) {
    this.emit('zzz', x, y, z, { n: 1, speed: 0.15, up: 0.5, gravity: -0.2, life: 1.8, size: 0.25 });
  }

  // Circling stars above a KO'd head.
  stars(npc, dur = 4) {
    const ring = { npc, t: 0, dur, sprites: [] };
    for (let i = 0; i < 4; i++) {
      const s = this._sprite('star');
      s.scale.setScalar(0.2);
      ring.sprites.push(s);
    }
    this.starRings.push(ring);
  }

  pop(x, y, z, text, color = '#ffe14a', big = false) {
    const el = document.createElement('div');
    el.className = 'pop' + (big ? ' big' : '');
    el.textContent = text;
    el.style.color = color;
    this.popLayer.appendChild(el);
    this.pops.push({ el, x, y, z, t: 0, dur: big ? 1.6 : 1.1 });
  }

  tracer(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)]);
    const mat = new THREE.LineBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 1 });
    const line = new THREE.Line(geo, mat);
    this.root.add(line);
    this.tracers.push({ line, t: 0 });
    this.emit('puff', a.x, a.y, a.z, { n: 2, speed: 0.6, up: 0.4, gravity: -0.5, life: 0.4, size: 0.18, grow: 1, color: 0xfff1a0 });
  }

  ghost(x, z) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.ghostGeo, this.ghostMat);
    const tail = new THREE.Mesh(this.tailGeo, this.ghostMat);
    tail.position.y = -0.22;
    tail.rotation.x = Math.PI;
    const e1 = new THREE.Mesh(this.eyeGeo, this.eyeMat);
    const e2 = e1.clone();
    e1.position.set(0.08, 0.04, 0.21);
    e2.position.set(-0.08, 0.04, 0.21);
    g.add(body, tail, e1, e2);
    g.position.set(x, 0.6, z);
    g.scale.setScalar(0.01);
    this.root.add(g);
    this.ghosts.push({ g, t: 0, x, z });
  }

  glint(x, y, z) {
    const s = this._sprite('glint', 0xffffff);
    s.scale.setScalar(0.01);
    s.position.set(x, y, z);
    this.glints.push({ s, t: 0 });
  }

  update(dt) {
    const cam = this.game.cam.camera;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        p.s.visible = false;
        this.pool.push(p.s);
        this.parts.splice(i, 1);
        continue;
      }
      p.vy -= p.g * dt;
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr;
      p.vz *= dr;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.s.position.set(p.x, p.y, p.z);
      p.s.scale.setScalar(p.size * (1 + p.grow * k));
      p.s.material.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      if (p.spin) p.s.material.rotation += p.spin * dt;
    }
    for (let i = this.starRings.length - 1; i >= 0; i--) {
      const r = this.starRings[i];
      r.t += dt;
      const n = r.npc;
      const done = r.t > r.dur || !n || n.gone || this.game.player.drag === n;
      r.sprites.forEach((s, j) => {
        if (done) {
          s.visible = false;
          return;
        }
        const a = r.t * 4 + (j / r.sprites.length) * Math.PI * 2;
        // head position of a lying character: behind the feet along -forward
        const hx = n.pos.x - Math.sin(n.yaw) * 1.25, hz = n.pos.z - Math.cos(n.yaw) * 1.25;
        s.position.set(hx + Math.cos(a) * 0.35, 0.55 + Math.sin(a * 2) * 0.05, hz + Math.sin(a) * 0.35);
        s.material.opacity = clamp((r.dur - r.t) / 0.5, 0, 1);
      });
      if (done) {
        for (const s of r.sprites) this.pool.push(s);
        this.starRings.splice(i, 1);
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt;
      t.line.material.opacity = 1 - t.t / 0.15;
      if (t.t > 0.15) {
        t.line.removeFromParent();
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.t += dt;
      const k = g.t / 2.6;
      g.g.position.set(g.x + Math.sin(g.t * 3) * 0.2, 0.6 + k * 2.6, g.z);
      g.g.scale.setScalar(Math.min(1, g.t * 4) * (1 - Math.max(0, k - 0.75) * 4));
      g.g.lookAt(cam.position.x, g.g.position.y, cam.position.z);
      if (k >= 1) {
        g.g.removeFromParent();
        this.ghosts.splice(i, 1);
      }
    }
    for (let i = this.glints.length - 1; i >= 0; i--) {
      const gl = this.glints[i];
      gl.t += dt;
      const k = gl.t / 0.6;
      gl.s.scale.setScalar(Math.sin(Math.min(1, k) * Math.PI) * 0.35);
      gl.s.material.rotation = k * 2;
      if (k >= 1) {
        gl.s.visible = false;
        this.pool.push(gl.s);
        this.glints.splice(i, 1);
      }
    }
    // pop text (DOM)
    const w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      const k = p.t / p.dur;
      if (k >= 1) {
        p.el.remove();
        this.pops.splice(i, 1);
        continue;
      }
      v.set(p.x, p.y + k * 0.8, p.z).project(cam);
      const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
      const sc = k < 0.15 ? 0.4 + (k / 0.15) * 0.9 : k < 0.25 ? 1.3 - ((k - 0.15) / 0.1) * 0.3 : 1;
      p.el.style.transform = `translate(-50%,-50%) translate(${sx}px,${sy}px) scale(${sc}) rotate(${-6 + (i % 3) * 6}deg)`;
      p.el.style.opacity = k > 0.75 ? String(1 - (k - 0.75) / 0.25) : '1';
    }
  }
}
