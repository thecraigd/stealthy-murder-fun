// Prop library. Each function writes merged geometry into the level sink and
// registers colliders / gameplay markers on the level builder `L`.
import * as THREE from 'three';
import { PAL } from '../core/materials.js';
import { UNIT } from '../core/geo.js';
import { mulberry32 } from '../core/util.js';

const rnd = mulberry32(1337);
const R = () => rnd();
const NO = { outline: false };

// Collider in world space for a local rect rotated by rot (multiples of 90°).
export function rectCol(L, x, z, w, d, rot = 0, opts = {}) {
  const s = Math.abs(Math.sin(rot)) > 0.7;
  return L.world.addRect(x, z, s ? d : w, s ? w : d, opts);
}

// Rotate a local offset into world.
export function local(x, z, rot, lx, lz) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
}

// ------------------------------------------------------------------ floors
export function floor(L, x1, z1, x2, z2, type, opts = {}) {
  const s = L.env;
  (L.floorRects = L.floorRects || []).push([Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2)]);
  const y = opts.y ?? 0.02;
  const w = x2 - x1, d = z2 - z1;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  switch (type) {
    case 'checker': {
      const a = opts.a ?? PAL.marble, b = opts.b ?? 0x3a3448;
      const t = opts.tile ?? 1;
      for (let x = x1; x < x2 - 0.01; x += t) {
        for (let z = z1; z < z2 - 0.01; z += t) {
          const i = Math.round((x - x1) / t) + Math.round((z - z1) / t);
          s.plane(x + t / 2, y, z + t / 2, Math.min(t, x2 - x), Math.min(t, z2 - z), i % 2 ? b : a);
        }
      }
      break;
    }
    case 'planks': {
      const c1 = opts.a ?? PAL.plank, c2 = opts.b ?? PAL.woodLight;
      const pw = 0.5;
      if (opts.alongX) {
        for (let z = z1, i = 0; z < z2 - 0.01; z += pw, i++) s.plane(cx, y, z + pw / 2, w, Math.min(pw, z2 - z) - 0.03, i % 3 === 0 ? c2 : c1);
      } else {
        for (let x = x1, i = 0; x < x2 - 0.01; x += pw, i++) s.plane(x + pw / 2, y, cz, Math.min(pw, x2 - x) - 0.03, d, i % 3 === 0 ? c2 : c1);
      }
      s.plane(cx, y - 0.005, cz, w, d, PAL.woodDark);
      break;
    }
    case 'tiles': {
      const a = opts.a ?? PAL.tileWhite, b = opts.b ?? 0xd5dee0;
      const t = opts.tile ?? 0.5;
      s.plane(cx, y - 0.004, cz, w, d, b);
      for (let x = x1; x < x2 - 0.01; x += t) for (let z = z1; z < z2 - 0.01; z += t) s.plane(x + t / 2, y, z + t / 2, Math.min(t, x2 - x) - 0.04, Math.min(t, z2 - z) - 0.04, a);
      break;
    }
    case 'carpet': {
      const a = opts.a ?? PAL.carpetRed, b = opts.b ?? PAL.carpetGold;
      s.plane(cx, y, cz, w, d, b);
      s.plane(cx, y + 0.004, cz, w - 0.5, d - 0.5, a);
      break;
    }
    case 'stone': {
      const a = opts.a ?? PAL.cobble, b = opts.b ?? PAL.stone;
      const t = opts.tile ?? 1.2;
      s.plane(cx, y - 0.004, cz, w, d, b);
      for (let x = x1; x < x2 - 0.01; x += t) for (let z = z1; z < z2 - 0.01; z += t) {
        const k = 0.94 + R() * 0.1;
        const c = new THREE.Color(a).multiplyScalar(k).getHex();
        s.plane(x + t / 2, y, z + t / 2, Math.min(t, x2 - x) - 0.08, Math.min(t, z2 - z) - 0.08, c);
      }
      break;
    }
    case 'path': {
      s.plane(cx, y, cz, w, d, opts.a ?? PAL.path);
      // scattered pebbles
      const n = Math.floor((w * d) / 6);
      for (let i = 0; i < n; i++) s.plane(x1 + R() * w, y + 0.003, z1 + R() * d, 0.18, 0.12, PAL.sandDark, { ry: R() * 3 });
      break;
    }
    case 'sand': {
      s.plane(cx, y, cz, w, d, opts.a ?? PAL.sand);
      const n = Math.floor((w * d) / 8);
      for (let i = 0; i < n; i++) s.plane(x1 + R() * w, y + 0.003, z1 + R() * d, 0.3, 0.12, PAL.sandDark, { ry: R() * 3 });
      break;
    }
    default:
      s.plane(cx, y, cz, w, d, opts.a ?? type);
  }
}

// ------------------------------------------------------------------ walls
// Axis-aligned wall with door/window gaps. opts: {h, t, a, b (side colours), doors:[[at,w]], windows:[[at,w]], ext}
export function wall(L, x1, z1, x2, z2, opts = {}) {
  const h = opts.h ?? 2.6;
  const t = opts.t ?? 0.25;
  const horiz = Math.abs(z2 - z1) < 1e-6;
  const a0 = horiz ? Math.min(x1, x2) : Math.min(z1, z2);
  const a1 = horiz ? Math.max(x1, x2) : Math.max(z1, z2);
  const fixed = horiz ? z1 : x1;
  const gaps = [];
  for (const [at, w, kind] of opts.doors ?? []) gaps.push({ s: at - w / 2, e: at + w / 2, kind: kind || 'door' });
  for (const [at, w, kind] of opts.windows ?? []) gaps.push({ s: at - w / 2, e: at + w / 2, kind: kind || 'window' });
  gaps.sort((p, q) => p.s - q.s);
  const colA = opts.a ?? PAL.plaster; // -side (north/west)
  const colB = opts.b ?? colA; // +side
  const trim = opts.trim ?? PAL.trim;
  const base = opts.base ?? 0xc9b89a;
  const s = L.env;
  const seg = (s0, s1, y0, y1, collide) => {
    if (s1 - s0 < 0.01) return;
    const len = s1 - s0, mid = (s0 + s1) / 2, hh = y1 - y0;
    const cx = horiz ? mid : fixed, cz = horiz ? fixed : mid;
    const w = horiz ? len : t, d = horiz ? t : len;
    if (colA === colB) {
      s.box(cx, y0 + hh / 2, cz, w, hh, d, colA);
    } else {
      // two halves with different colours
      const o = t / 4;
      s.box(horiz ? cx : cx - o, y0 + hh / 2, horiz ? cz - o : cz, horiz ? w : t / 2, hh, horiz ? t / 2 : d, colA, { outline: false });
      s.box(horiz ? cx : cx + o, y0 + hh / 2, horiz ? cz + o : cz, horiz ? w : t / 2, hh, horiz ? t / 2 : d, colB, { outline: false });
      s.prim(UNIT.box, cx, y0 + hh / 2, cz, w, hh, d, 0x000000, { onlyOutline: true });
    }
    if (y0 === 0 && opts.baseboard !== false) {
      s.box(cx, 0.13, cz, w + (horiz ? 0 : 0.05), 0.26, d + (horiz ? 0.05 : 0), base, NO);
    }
    if (y1 === h && opts.cornice !== false) {
      s.box(cx, h - 0.06, cz, w + (horiz ? 0 : 0.08), 0.12, d + (horiz ? 0.08 : 0), trim, NO);
    }
    if (collide) {
      L.world.addBox(horiz ? s0 : fixed - t / 2, horiz ? fixed - t / 2 : s0, horiz ? s1 : fixed + t / 2, horiz ? fixed + t / 2 : s1, { h, tag: 'wall' });
    }
  };
  let cur = a0;
  for (const g of gaps) {
    seg(cur, g.s, 0, h, true);
    const mid = (g.s + g.e) / 2;
    const gx = horiz ? mid : fixed, gz = horiz ? fixed : mid;
    const gw = g.e - g.s;
    if (g.kind === 'door' || g.kind === 'arch' || g.kind === 'locked') {
      // lintel + frame
      seg(g.s, g.e, 2.15, h, false);
      for (const e of [g.s, g.e]) {
        const px = horiz ? e : fixed, pz = horiz ? fixed : e;
        s.box(px, 1.08, pz, horiz ? 0.1 : t + 0.08, 2.16, horiz ? t + 0.08 : 0.1, trim, NO);
      }
      if (g.kind === 'locked' && L.onLockedDoor) L.onLockedDoor({ x: gx, z: gz, w: gw, horiz, t, ...opts.lock });
    } else if (g.kind === 'window' || g.kind === 'climb') {
      seg(g.s, g.e, 0, 0.85, false);
      seg(g.s, g.e, 2.1, h, false);
      s.box(gx, 0.88, gz, horiz ? gw : t + 0.12, 0.06, horiz ? t + 0.12 : gw, trim, NO);
      s.box(gx, 2.08, gz, horiz ? gw : t + 0.06, 0.06, horiz ? t + 0.06 : gw, trim, NO);
      // glass
      L.glass.box(gx, 1.48, gz, horiz ? gw - 0.04 : 0.04, 1.18, horiz ? 0.04 : gw - 0.04, PAL.glass, NO);
      s.box(gx, 1.48, gz, horiz ? 0.05 : 0.07, 1.2, horiz ? 0.07 : 0.05, trim, NO);
      const col = L.world.addBox(horiz ? g.s : fixed - t / 2, horiz ? fixed - t / 2 : g.s, horiz ? g.e : fixed + t / 2, horiz ? fixed + t / 2 : g.e, { h, sight: 'none', tag: 'window' });
      if (g.kind === 'climb') L.windows.push({ x: gx, z: gz, horiz, t, w: gw, col });
    }
    cur = g.e;
  }
  seg(cur, a1, 0, h, true);
}

// Rectangular room outline helper: walls on 4 sides with per-side options.
export function roomWalls(L, x1, z1, x2, z2, sides = {}, common = {}) {
  wall(L, x1, z1, x2, z1, { ...common, ...(sides.n || {}) });
  wall(L, x1, z2, x2, z2, { ...common, ...(sides.s || {}) });
  wall(L, x1, z1, x1, z2, { ...common, ...(sides.w || {}) });
  wall(L, x2, z1, x2, z2, { ...common, ...(sides.e || {}) });
}

// Hipped roof as its own mesh data (faded when inside).
export function hipRoof(sink, cx, cz, w, d, h, y, color, color2, over = 0.6) {
  const W = w / 2 + over, D = d / 2 + over;
  const pos = [], col = [];
  const c1 = new THREE.Color(color), c2 = new THREE.Color(color2);
  const ridgeAlongX = w >= d;
  const r = ridgeAlongX ? Math.max(0, W - D) : Math.max(0, D - W);
  const ridgeA = ridgeAlongX ? [-r, 0] : [0, -r];
  const ridgeB = ridgeAlongX ? [r, 0] : [0, r];
  const corners = [[-W, -D], [W, -D], [W, D], [-W, D]];
  // faces: north, east, south, west as quads/triangles (bottom edge -> ridge)
  const faces = ridgeAlongX
    ? [[corners[0], corners[1], ridgeB, ridgeA], [corners[1], corners[2], ridgeB, ridgeB], [corners[2], corners[3], ridgeA, ridgeB], [corners[3], corners[0], ridgeA, ridgeA]]
    : [[corners[0], corners[1], ridgeA, ridgeA], [corners[1], corners[2], ridgeB, ridgeA], [corners[2], corners[3], ridgeB, ridgeB], [corners[3], corners[0], ridgeA, ridgeB]];
  const bands = 9;
  for (const [p0, p1, q1, q0] of faces) {
    for (let i = 0; i < bands; i++) {
      const t0 = i / bands, t1 = (i + 1) / bands;
      const L0 = [p0[0] + (q0[0] - p0[0]) * t0, p0[1] + (q0[1] - p0[1]) * t0];
      const R0 = [p1[0] + (q1[0] - p1[0]) * t0, p1[1] + (q1[1] - p1[1]) * t0];
      const L1 = [p0[0] + (q0[0] - p0[0]) * t1, p0[1] + (q0[1] - p0[1]) * t1];
      const R1 = [p1[0] + (q1[0] - p1[0]) * t1, p1[1] + (q1[1] - p1[1]) * t1];
      const y0 = y + h * t0, y1 = y + h * t1;
      const c = i % 2 ? c2 : c1;
      const tris = [[[L0[0], y0, L0[1]], [R0[0], y0, R0[1]], [R1[0], y1, R1[1]]], [[L0[0], y0, L0[1]], [R1[0], y1, R1[1]], [L1[0], y1, L1[1]]]];
      for (const t of tris) {
        // ensure upward-facing winding
        const ax = t[1][0] - t[0][0], ay = t[1][1] - t[0][1], az = t[1][2] - t[0][2];
        const bx = t[2][0] - t[0][0], by = t[2][1] - t[0][1], bz = t[2][2] - t[0][2];
        const ny = az * bx - ax * bz;
        const len2 = (ay * bz - az * by) ** 2 + ny ** 2 + (ax * by - ay * bx) ** 2;
        if (len2 < 1e-10) continue;
        const order = ny >= 0 ? [0, 1, 2] : [0, 2, 1];
        for (const k of order) {
          pos.push(t[k][0] + cx, t[k][1], t[k][2] + cz);
          col.push(c.r, c.g, c.b);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Remove degenerate triangles' normals issues by computing flat normals.
  const ng = g.toNonIndexed ? g : g;
  ng.computeVertexNormals();
  sink.geo(ng, 0, 0, 0, null, { outline: false });
  // Eave trim
  sink.box(cx, y - 0.04, cz, w + over * 2 + 0.1, 0.12, d + over * 2 + 0.1, PAL.trim, { outline: true, ot: 0.03 });
}

// ------------------------------------------------------------------ furniture
export function table(L, x, z, opts = {}) {
  const s = L.env;
  const r = opts.r ?? 0.6;
  const cloth = opts.cloth ?? PAL.white;
  s.push(x, 0, z);
  if (opts.rect) {
    const w = opts.w ?? 1.6, d = opts.d ?? 0.8;
    s.block(0, 0.7, 0, w, 0.06, d, cloth);
    s.block(0, 0.42, 0, w + 0.02, 0.3, d + 0.02, cloth, NO);
    s.block(0, 0, 0, 0.12, 0.7, 0.12, PAL.woodDark, NO);
    L.world.addRect(x, z, w, d, { h: 0.78, sight: 'low', rot: opts.rot });
  } else {
    s.cyl(0, 0.38, 0, r, 0.38, cloth);
    s.cyl(0, 0.0, 0, 0.08, 0.4, PAL.woodDark, NO);
    L.world.addCircle(x, z, r, { h: 0.76, sight: 'low' });
  }
  if (opts.flowers !== false) {
    s.cyl(0, 0.76, 0, 0.07, 0.12, PAL.glass, NO);
    const fc = [PAL.flowerPink, PAL.flowerYellow, PAL.red, PAL.flowerPurple][Math.floor(R() * 4)];
    s.ball(0, 0.95, 0, 0.1, fc, { lo: true, outline: false });
    s.ball(0.06, 0.92, 0.03, 0.06, PAL.leaf, { lo: true, outline: false });
  }
  if (opts.glasses) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      s.cone(Math.cos(a) * r * 0.6, 0.76, Math.sin(a) * r * 0.6, 0.04, 0.1, PAL.glass, { outline: false });
      s.cyl(Math.cos(a) * r * 0.6, 0.86, Math.sin(a) * r * 0.6, 0.035, 0.06, 0xf7e08a, NO);
    }
  }
  s.pop();
}

export function chair(L, x, z, rot = 0, color = PAL.wood, seat = PAL.carpetRed) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0.42, 0, 0.42, 0.06, 0.42, seat);
  for (const [a, b] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) s.block(a, 0, b, 0.05, 0.42, 0.05, color, NO);
  s.block(0, 0.48, -0.19, 0.42, 0.5, 0.05, color);
  s.pop();
}

export function sofa(L, x, z, rot = 0, color = PAL.carpetBlue, w = 2) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0, 0, w, 0.45, 0.85, color);
  s.block(0, 0.45, -0.32, w, 0.45, 0.22, color);
  s.block(-w / 2 + 0.1, 0.45, 0.05, 0.2, 0.2, 0.75, color);
  s.block(w / 2 - 0.1, 0.45, 0.05, 0.2, 0.2, 0.75, color);
  for (let i = 0; i < Math.round(w / 0.7); i++) {
    const n = Math.round(w / 0.7);
    s.block(-w / 2 + 0.25 + (i + 0.5) * ((w - 0.5) / n), 0.45, 0.05, (w - 0.5) / n - 0.04, 0.1, 0.62, new THREE.Color(color).multiplyScalar(1.12).getHex(), NO);
  }
  s.pop();
  rectCol(L, x, z, w, 0.85, rot, { h: 0.9, sight: 'low' });
}

export function armchair(L, x, z, rot = 0, color = PAL.carpetRed) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0, 0, 0.9, 0.42, 0.85, color);
  s.block(0, 0.42, -0.32, 0.9, 0.55, 0.22, color);
  s.block(-0.38, 0.42, 0.05, 0.16, 0.22, 0.75, color);
  s.block(0.38, 0.42, 0.05, 0.16, 0.22, 0.75, color);
  s.pop();
  rectCol(L, x, z, 0.9, 0.85, rot, { h: 0.95, sight: 'low' });
}

export function bookshelf(L, x, z, rot = 0, w = 1.8, h = 2.2) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0, 0, w, h, 0.4, PAL.woodDark);
  const rows = Math.floor(h / 0.45);
  const bookCols = [PAL.red, PAL.blue, PAL.yellow, PAL.teal, PAL.purple, PAL.orange, 0x3a6b4a, PAL.cream];
  for (let r = 0; r < rows; r++) {
    const y = 0.12 + r * 0.45;
    s.block(0, y - 0.04, 0.12, w - 0.1, 0.04, 0.2, PAL.wood, NO);
    let bx = -w / 2 + 0.1;
    while (bx < w / 2 - 0.15) {
      const bw = 0.06 + R() * 0.06, bh = 0.25 + R() * 0.1;
      s.block(bx + bw / 2, y, 0.14, bw - 0.01, bh, 0.2, bookCols[Math.floor(R() * bookCols.length)], NO);
      bx += bw;
    }
  }
  s.pop();
  rectCol(L, x, z, w, 0.4, rot, { h });
}

export function plantPot(L, x, z, size = 1, kind = 'round') {
  const s = L.env;
  s.push(x, 0, z);
  s.cyl(0, 0, 0, 0.28 * size, 0.45 * size, 0xd9774a);
  s.cyl(0, 0.42 * size, 0, 0.31 * size, 0.07 * size, 0xc0603a, NO);
  if (kind === 'palm') {
    s.cyl(0, 0.45 * size, 0, 0.05 * size, 0.7 * size, PAL.woodDark, NO);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      s.sphere(Math.cos(a) * 0.35 * size, 1.15 * size, Math.sin(a) * 0.35 * size, 0.38 * size, 0.06 * size, 0.14 * size, i % 2 ? PAL.leaf : PAL.leafDark, { ry: -a, rz: -0.4, lo: true });
    }
  } else if (kind === 'tall') {
    s.sphere(0, 1.0 * size, 0, 0.32 * size, 0.6 * size, 0.32 * size, PAL.leafDark);
    s.ball(0.12 * size, 1.25 * size, 0.08 * size, 0.18 * size, PAL.leaf, { lo: true, outline: false });
  } else {
    s.ball(0, 0.75 * size, 0, 0.38 * size, PAL.leaf);
    s.ball(0.15 * size, 0.92 * size, 0.1 * size, 0.2 * size, PAL.grassLight, { lo: true, outline: false });
    if (kind === 'flower') for (let i = 0; i < 5; i++) s.ball(Math.cos(i * 1.3) * 0.3 * size, 0.85 * size + (i % 2) * 0.1, Math.sin(i * 1.3) * 0.3 * size, 0.07 * size, PAL.flowerPink, { lo: true, outline: false });
  }
  s.pop();
  L.world.addCircle(x, z, 0.3 * size, { h: 1.2 * size, sight: 'low' });
}

export function rug(L, x, z, w, d, color = PAL.carpetRed, border = PAL.carpetGold, rot = 0) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.plane(0, 0.03, 0, w, d, border);
  s.plane(0, 0.034, 0, w - 0.3, d - 0.3, color);
  s.plane(0, 0.038, 0, w * 0.4, d * 0.4, border);
  s.plane(0, 0.042, 0, w * 0.4 - 0.15, d * 0.4 - 0.15, color);
  s.pop();
}

export function floorLamp(L, x, z) {
  const s = L.env;
  s.push(x, 0, z);
  s.cyl(0, 0, 0, 0.18, 0.05, PAL.gold, NO);
  s.cyl(0, 0, 0, 0.03, 1.5, PAL.gold, NO);
  s.cone(0, 1.4, 0, 0.25, 0.32, 0xfff1c4);
  s.pop();
  L.world.addCircle(x, z, 0.18, { h: 1.6, sight: 'none' });
}

export function painting(L, x, z, rot, w = 1.2, h = 0.9, y = 1.5, palette) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.box(0, y, 0.02, w, h, 0.06, PAL.gold, NO);
  const cols = palette ?? [PAL.blue, PAL.yellow, PAL.red, PAL.teal, PAL.cream, PAL.purple];
  s.box(0, y, 0.055, w - 0.14, h - 0.14, 0.01, cols[0], NO);
  for (let i = 0; i < 4; i++) {
    const pw = (w - 0.2) * (0.2 + R() * 0.35), ph = (h - 0.2) * (0.2 + R() * 0.4);
    s.box((R() - 0.5) * (w - 0.2 - pw), y + (R() - 0.5) * (h - 0.2 - ph), 0.062 + i * 0.002, pw, ph, 0.004, cols[1 + (i % (cols.length - 1))], NO);
  }
  s.pop();
}

export function column(L, x, z, r = 0.3, h = 2.6, color = PAL.marble) {
  const s = L.env;
  s.push(x, 0, z);
  s.block(0, 0, 0, r * 2.4, 0.25, r * 2.4, color);
  s.cyl(0, 0.25, 0, r, h - 0.5, color);
  s.block(0, h - 0.25, 0, r * 2.4, 0.25, r * 2.4, color);
  s.pop();
  L.world.addCircle(x, z, r * 1.1, { h });
}

export function counter(L, x, z, w, d, rot = 0, color = PAL.woodDark, top = PAL.marble, h = 0.95) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0, 0, w, h - 0.05, d, color);
  s.block(0, h - 0.06, 0, w + 0.06, 0.06, d + 0.06, top);
  s.pop();
  return rectCol(L, x, z, w + 0.06, d + 0.06, rot, { h, sight: 'low' });
}

export function bottles(L, x, z, rot, w, y) {
  const s = L.env;
  s.push(x, 0, z, rot);
  const cols = [0x3a8a4a, 0x8a3a2a, 0xe8c070, 0x3a6aa8, PAL.glass, 0xa04a8a];
  for (let bx = -w / 2 + 0.1; bx < w / 2 - 0.1; bx += 0.14) {
    const c = cols[Math.floor(R() * cols.length)];
    const bh = 0.22 + R() * 0.12;
    s.cyl(bx, y, 0, 0.045, bh, c, NO);
    s.cyl(bx, y + bh, 0, 0.018, 0.08, c, NO);
  }
  s.pop();
}

export function shelfUnit(L, x, z, rot, w = 2, h = 2, withBottles = true) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0, 0, w, h, 0.35, PAL.woodDark);
  for (let i = 1; i < 4; i++) s.block(0, i * 0.5, 0.06, w - 0.08, 0.04, 0.3, PAL.wood, NO);
  s.pop();
  if (withBottles) for (let i = 1; i < 4; i++) {
    const p = local(x, z, rot, 0, 0.1);
    bottles(L, p.x, p.z, rot, w, i * 0.5 + 0.04);
  }
  rectCol(L, x, z, w, 0.35, rot, { h });
}

export function bed(L, x, z, rot = 0, color = PAL.carpetBlue) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0, 0, 1.0, 0.4, 2.0, PAL.wood);
  s.block(0, 0.4, 0.15, 0.95, 0.14, 1.65, color);
  s.block(0, 0.4, -0.75, 0.8, 0.16, 0.38, PAL.white);
  s.block(0, 0, -1.0, 1.05, 0.95, 0.08, PAL.woodDark);
  s.pop();
  rectCol(L, x, z, 1.0, 2.0, rot, { h: 0.6, sight: 'low' });
}

export function locker(L, x, z, rot = 0, color = 0x6f8fb0, n = 1) {
  const s = L.env;
  s.push(x, 0, z, rot);
  for (let i = 0; i < n; i++) {
    const lx = (i - (n - 1) / 2) * 0.62;
    s.block(lx, 0, 0, 0.6, 2.0, 0.55, color);
    s.box(lx, 1.7, 0.28, 0.4, 0.04, 0.01, 0x2a2430, NO);
    s.box(lx, 1.6, 0.28, 0.4, 0.04, 0.01, 0x2a2430, NO);
    s.box(lx + 0.2, 1.0, 0.29, 0.04, 0.14, 0.02, PAL.metalDark, NO);
  }
  s.pop();
  return rectCol(L, x, z, 0.62 * n, 0.55, rot, { h: 2.0 });
}

export function wardrobe(L, x, z, rot = 0, color = PAL.woodDark) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0, 0, 1.2, 2.1, 0.6, color);
  s.box(0, 1.05, 0.305, 0.02, 1.9, 0.01, 0x2a2430, NO);
  s.box(-0.08, 1.05, 0.31, 0.03, 0.18, 0.03, PAL.gold, NO);
  s.box(0.08, 1.05, 0.31, 0.03, 0.18, 0.03, PAL.gold, NO);
  s.block(0, 2.1, 0, 1.3, 0.1, 0.7, color);
  s.pop();
  return rectCol(L, x, z, 1.2, 0.6, rot, { h: 2.1 });
}

export function crate(L, x, z, size = 1, rot = 0, color = PAL.woodLight, opts = {}) {
  const s = L.env;
  s.push(x, opts.y ?? 0, z, rot);
  s.block(0, 0, 0, size, size, size, color);
  const dk = new THREE.Color(color).multiplyScalar(0.75).getHex();
  for (const sx of [-1, 1]) {
    s.box(sx * size * 0.5, size / 2, 0, 0.02, size * 0.9, size * 0.15, dk, NO);
    s.box(0, size / 2, sx * size * 0.5, size * 0.15, size * 0.9, 0.02, dk, NO);
  }
  s.box(0, size + 0.005, 0, size * 0.9, 0.01, size * 0.15, dk, NO);
  s.pop();
  if (opts.collide !== false) return rectCol(L, x, z, size, size, rot, { h: (opts.y ?? 0) + size, sight: size + (opts.y ?? 0) > 1.6 ? 'tall' : 'low' });
}

export function barrel(L, x, z, color = 0x8a5a33) {
  const s = L.env;
  s.push(x, 0, z);
  s.cyl(0, 0, 0, 0.35, 0.95, color);
  s.cyl(0, 0.15, 0, 0.37, 0.06, PAL.metalDark, NO);
  s.cyl(0, 0.75, 0, 0.37, 0.06, PAL.metalDark, NO);
  s.pop();
  L.world.addCircle(x, z, 0.36, { h: 0.95, sight: 'low' });
}

export function hedge(L, x1, z1, x2, z2, h = 1.1, color = PAL.hedge) {
  const s = L.env;
  const w = Math.abs(x2 - x1), d = Math.abs(z2 - z1);
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  s.block(cx, 0, cz, w, h - 0.12, d, color);
  // puffy top
  const along = w > d;
  const n = Math.max(1, Math.round((along ? w : d) / 0.7));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const px = along ? Math.min(x1, x2) + t * w : cx;
    const pz = along ? cz : Math.min(z1, z2) + t * d;
    s.sphere(px, h - 0.15, pz, (along ? w / n : w) * 0.62, 0.2, (along ? d : d / n) * 0.62, i % 2 ? color : PAL.leaf, { lo: true });
  }
  L.world.addBox(Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2), { h, sight: 'low', tag: 'hedge' });
}

export function tree(L, x, z, kind = 'round', size = 1) {
  const s = L.env;
  s.push(x, 0, z, R() * 6);
  if (kind === 'palm') {
    let px = 0, py = 0, pz = 0;
    const lean = 0.18 + R() * 0.12;
    for (let i = 0; i < 6; i++) {
      s.cyl(px, py, pz, 0.16 * size - i * 0.012, 0.75 * size, i % 2 ? 0xa0703c : 0x8a5c30, { seg: 8, outline: i === 0 });
      py += 0.72 * size;
      px += lean * 0.35 * size * (i / 3);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      s.sphere(px + Math.cos(a) * 0.85 * size, py - 0.15, pz + Math.sin(a) * 0.85 * size, 1.0 * size, 0.08, 0.28 * size, i % 2 ? PAL.leaf : PAL.leafDark, { ry: -a, rz: -0.35, lo: true });
    }
    s.ball(px, py, pz, 0.22 * size, 0x7a5a2a, { lo: true });
    s.pop();
    L.world.addCircle(x, z, 0.25 * size, { h: 4, sight: 'none' });
  } else if (kind === 'pine') {
    s.cyl(0, 0, 0, 0.18 * size, 1.0 * size, PAL.woodDark, { seg: 8 });
    for (let i = 0; i < 3; i++) s.cone(0, (0.8 + i * 0.75) * size, 0, (1.3 - i * 0.32) * size, 1.3 * size, i % 2 ? PAL.leafDark : 0x358a3a, { seg: 8 });
    s.pop();
    L.world.addCircle(x, z, 0.3 * size, { h: 4, sight: 'tall' });
  } else {
    s.cyl(0, 0, 0, 0.2 * size, 1.4 * size, PAL.woodDark, { seg: 8 });
    s.ball(0, 2.0 * size, 0, 1.0 * size, PAL.leaf);
    s.ball(0.6 * size, 1.7 * size, 0.2 * size, 0.7 * size, PAL.leafDark);
    s.ball(-0.5 * size, 1.8 * size, -0.3 * size, 0.75 * size, PAL.grassLight);
    s.ball(0.1 * size, 2.6 * size, -0.1 * size, 0.6 * size, PAL.leaf);
    s.pop();
    L.world.addCircle(x, z, 0.28 * size, { h: 4, sight: 'tall' });
  }
}

export function bush(L, x, z, size = 1, flowers = null) {
  const s = L.env;
  s.push(x, 0, z, R() * 6);
  s.ball(0, 0.45 * size, 0, 0.6 * size, PAL.leafDark);
  s.ball(0.35 * size, 0.4 * size, 0.2 * size, 0.42 * size, PAL.leaf);
  s.ball(-0.3 * size, 0.38 * size, -0.25 * size, 0.45 * size, PAL.leaf);
  s.ball(0.05 * size, 0.75 * size, 0.05 * size, 0.38 * size, PAL.grassLight, { lo: true });
  if (flowers) for (let i = 0; i < 6; i++) s.ball(Math.cos(i * 1.1) * 0.5 * size, 0.55 * size + (i % 3) * 0.12, Math.sin(i * 1.1) * 0.5 * size, 0.07, flowers, { lo: true, outline: false });
  s.pop();
  L.world.addCircle(x, z, 0.55 * size, { h: 1.1 * size, sight: 'low', tag: 'bush' });
}

export function flowerBed(L, x1, z1, x2, z2, colors = [PAL.flowerPink, PAL.flowerYellow, PAL.flowerWhite, PAL.flowerPurple]) {
  const s = L.env;
  const w = x2 - x1, d = z2 - z1;
  s.block((x1 + x2) / 2, 0, (z1 + z2) / 2, w, 0.18, d, 0x8a5a3a);
  s.block((x1 + x2) / 2, 0.18, (z1 + z2) / 2, w - 0.12, 0.02, d - 0.12, 0x5a3a20, NO);
  const n = Math.floor(w * d * 3);
  for (let i = 0; i < n; i++) {
    const fx = x1 + 0.15 + R() * (w - 0.3), fz = z1 + 0.15 + R() * (d - 0.3);
    s.cyl(fx, 0.18, fz, 0.015, 0.2, PAL.leafDark, { outline: false, seg: 6 });
    s.ball(fx, 0.42, fz, 0.08, colors[Math.floor(R() * colors.length)], { lo: true, outline: false });
  }
  L.world.addBox(x1, z1, x2, z2, { h: 0.4, sight: 'none' });
}

export function bench(L, x, z, rot = 0) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0.4, 0, 1.6, 0.06, 0.45, PAL.wood);
  s.block(0, 0.55, -0.2, 1.6, 0.35, 0.06, PAL.wood);
  for (const sx of [-0.7, 0.7]) s.block(sx, 0, 0, 0.08, 0.42, 0.42, PAL.metalDark, NO);
  s.pop();
  rectCol(L, x, z, 1.6, 0.45, rot, { h: 0.8, sight: 'none' });
}

export function lampPost(L, x, z) {
  const s = L.env;
  s.push(x, 0, z);
  s.cyl(0, 0, 0, 0.14, 0.3, PAL.black);
  s.cyl(0, 0, 0, 0.06, 2.6, PAL.black, NO);
  s.ball(0, 2.7, 0, 0.2, 0xfff3c4);
  s.cone(0, 2.82, 0, 0.22, 0.18, PAL.black, NO);
  s.pop();
  L.world.addCircle(x, z, 0.15, { h: 2.8, sight: 'none' });
}

export function fountain(L, x, z, r = 2.2) {
  const s = L.env;
  s.push(x, 0, z);
  s.cyl(0, 0, 0, r, 0.55, PAL.stone, { seg: 0 });
  s.cyl(0, 0.5, 0, r + 0.12, 0.08, PAL.marble);
  s.cyl(0, 0.0, 0, 0.35, 1.2, PAL.marble);
  s.cyl(0, 1.2, 0, 0.9, 0.15, PAL.marble);
  s.cyl(0, 1.35, 0, 0.2, 0.6, PAL.marble);
  s.ball(0, 2.0, 0, 0.3, PAL.marble);
  s.pop();
  L.waterDiscs.push({ x, z, r: r - 0.12, y: 0.45 });
  L.waterDiscs.push({ x, z, r: 0.82, y: 1.36 });
  L.world.addCircle(x, z, r, { h: 0.6, sight: 'low', tag: 'fountain' });
}

export function statue(L, x, z, rot = 0, kind = 'thinker') {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0, 0, 0.9, 1.0, 0.9, PAL.marbleDark);
  s.block(0, 1.0, 0, 1.0, 0.08, 1.0, PAL.marble);
  const c = PAL.marble;
  if (kind === 'fish') {
    s.sphere(0, 1.6, 0, 0.3, 0.45, 0.2, c, { rx: 0.3 });
    s.cone(0, 2.05, -0.1, 0.25, 0.3, c, { rx: 0.5 });
  } else if (kind === 'bust') {
    s.sphere(0, 1.35, 0, 0.35, 0.25, 0.25, c);
    s.ball(0, 1.75, 0, 0.25, c);
  } else {
    s.sphere(0, 1.45, 0, 0.25, 0.35, 0.2, c);
    s.ball(0, 1.95, 0.05, 0.18, c);
    s.cyl(-0.12, 1.08, 0.05, 0.07, 0.3, c);
    s.cyl(0.12, 1.08, 0.05, 0.07, 0.3, c);
    s.sphere(0.2, 1.6, 0.08, 0.06, 0.25, 0.06, c, { rz: 0.5 });
    s.sphere(-0.2, 1.75, 0.08, 0.06, 0.25, 0.06, c, { rz: -2.5 });
  }
  s.pop();
  rectCol(L, x, z, 0.9, 0.9, rot, { h: 2.0, sight: 'low' });
}

export function umbrellaTable(L, x, z, color = PAL.red) {
  const s = L.env;
  s.push(x, 0, z);
  s.cyl(0, 0, 0, 0.5, 0.72, PAL.white);
  s.cyl(0, 0, 0, 0.04, 2.3, PAL.white, NO);
  for (let i = 0; i < 8; i++) {
    s.prim(UNIT.cone8, 0, 2.35, 0, 2.1, 0.42, 2.1, i % 2 ? color : PAL.white, { outline: i === 0, ry: (i / 8) * Math.PI * 2 });
  }
  s.pop();
  L.world.addCircle(x, z, 0.5, { h: 0.75, sight: 'none' });
}

export function deckChair(L, x, z, rot = 0, color = PAL.blue) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0.25, 0.25, 0.65, 0.06, 1.2, PAL.white);
  s.block(0, 0.3, 0.25, 0.6, 0.05, 1.15, color, NO);
  s.box(0, 0.6, -0.45, 0.6, 0.06, 0.8, color, { rx: -1.0 });
  for (const sx of [-0.28, 0.28]) for (const sz of [-0.2, 0.75]) s.block(sx, 0, sz, 0.05, 0.27, 0.05, PAL.white, NO);
  s.pop();
  rectCol(L, x, z, 0.65, 1.6, rot, { h: 0.5, sight: 'none' });
}

export function railing(L, x1, z1, x2, z2, color = PAL.white, opts = {}) {
  const s = L.env;
  const len = Math.hypot(x2 - x1, z2 - z1);
  const ang = Math.atan2(x2 - x1, z2 - z1);
  const n = Math.max(1, Math.round(len / 1.0));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    s.cyl(x1 + (x2 - x1) * t, 0, z1 + (z2 - z1) * t, 0.06, 1.0, color, { seg: 6 });
  }
  s.box((x1 + x2) / 2, 1.0, (z1 + z2) / 2, 0.1, 0.08, len, color, { ry: ang });
  s.box((x1 + x2) / 2, 0.5, (z1 + z2) / 2, 0.05, 0.05, len, color, { ry: ang, outline: false });
  if (opts.collide !== false) {
    const t = 0.15;
    return L.world.addBox(Math.min(x1, x2) - t, Math.min(z1, z2) - t, Math.max(x1, x2) + t, Math.max(z1, z2) + t, { h: 1.05, sight: 'none', tag: 'railing' });
  }
}

export function rocks(L, x, z, size = 1, color = 0x9a9590) {
  const s = L.env;
  s.push(x, 0, z, R() * 6);
  s.prim(UNIT.dodeca, 0, 0.3 * size, 0, 1.3 * size, 0.9 * size, 1.1 * size, color, { rx: R(), ry: R() });
  s.prim(UNIT.dodeca, 0.6 * size, 0.2 * size, 0.3 * size, 0.7 * size, 0.6 * size, 0.7 * size, new THREE.Color(color).multiplyScalar(0.9).getHex(), { rx: R() });
  s.pop();
  if (size > 0.6) L.world.addCircle(x, z, 0.6 * size, { h: 0.7 * size, sight: 'low' });
}

export function toilet(L, x, z, rot = 0) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.cyl(0, 0, 0.1, 0.18, 0.4, PAL.white);
  s.sphere(0, 0.42, 0.15, 0.24, 0.06, 0.3, PAL.white);
  s.block(0, 0, -0.2, 0.42, 0.85, 0.2, PAL.white);
  s.block(0, 0.85, -0.2, 0.46, 0.06, 0.24, PAL.white, NO);
  s.pop();
}

export function stall(L, x, z, rot = 0, w = 1.6, d = 1.6, color = 0x8fc9d6) {
  // three-sided stall, open at +z (door gap)
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(-w / 2, 0.1, 0, 0.06, 1.9, d, color);
  s.block(w / 2, 0.1, 0, 0.06, 1.9, d, color);
  s.block(-w / 2 + 0.25, 0.1, d / 2, 0.5, 1.9, 0.06, color);
  s.pop();
  const a = local(x, z, rot, -w / 2, 0), b = local(x, z, rot, w / 2, 0), c = local(x, z, rot, -w / 2 + 0.25, d / 2);
  rectCol(L, a.x, a.z, 0.08, d, rot, { h: 2.0 });
  rectCol(L, b.x, b.z, 0.08, d, rot, { h: 2.0 });
  rectCol(L, c.x, c.z, 0.5, 0.08, rot, { h: 2.0 });
}

export function sinkVanity(L, x, z, rot = 0, n = 2) {
  const s = L.env;
  s.push(x, 0, z, rot);
  const w = n * 0.9;
  s.block(0, 0, 0, w, 0.85, 0.55, PAL.woodDark);
  s.block(0, 0.85, 0, w + 0.04, 0.05, 0.6, PAL.marble);
  for (let i = 0; i < n; i++) {
    const lx = (i - (n - 1) / 2) * 0.9;
    s.cyl(lx, 0.86, 0.02, 0.2, 0.05, 0xdfe8ea, NO);
    s.cyl(lx, 0.9, -0.2, 0.025, 0.2, PAL.metal, NO);
    s.box(lx, 1.6, -0.27, 0.6, 0.8, 0.03, 0xcfeefa);
    s.box(lx, 1.6, -0.285, 0.68, 0.88, 0.02, PAL.gold, NO);
  }
  s.pop();
  rectCol(L, x, z, w, 0.6, rot, { h: 0.95, sight: 'low' });
}

export function piano(L, x, z, rot = 0) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0.6, 0, 1.5, 0.35, 1.7, PAL.black);
  s.block(0, 0.95, -0.2, 1.4, 0.04, 1.2, PAL.black, { rx: -0.5 });
  for (const [a, b] of [[-0.6, 0.7], [0.6, 0.7], [0, -0.7]]) s.cyl(a, 0, b, 0.06, 0.6, PAL.black, NO);
  s.block(0, 0.86, 0.82, 1.3, 0.04, 0.16, PAL.white, NO);
  for (let i = 0; i < 9; i++) s.block(-0.6 + i * 0.15, 0.9, 0.79, 0.05, 0.03, 0.09, PAL.black, NO);
  s.block(0, 0, 1.35, 0.9, 0.48, 0.4, PAL.black);
  s.pop();
  rectCol(L, x, z, 1.5, 2.0, rot, { h: 1.0, sight: 'low' });
}

export function fireplace(L, x, z, rot = 0) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0, 0, 2.0, 1.4, 0.6, 0xb8a080);
  s.block(0, 0, 0.12, 1.1, 0.9, 0.4, 0x2a2026, NO);
  s.block(0, 1.4, 0, 2.2, 0.12, 0.7, PAL.woodDark);
  s.ball(-0.15, 0.2, 0.2, 0.22, PAL.orange, { lo: true, outline: false });
  s.ball(0.15, 0.25, 0.2, 0.18, PAL.yellow, { lo: true, outline: false });
  s.cyl(0, 0.05, 0.2, 0.08, 0.6, PAL.woodDark, { rz: Math.PI / 2, outline: false });
  s.block(0, 1.52, 0, 2.0, 1.08, 0.4, 0xb8a080, NO);
  s.pop();
  rectCol(L, x, z, 2.2, 0.7, rot, { h: 2.6 });
}

export function desk(L, x, z, rot = 0, opts = {}) {
  const s = L.env;
  s.push(x, 0, z, rot);
  const w = opts.w ?? 1.8;
  s.block(0, 0.72, 0, w, 0.07, 0.9, opts.color ?? PAL.woodDark);
  s.block(-w / 2 + 0.3, 0, 0, 0.55, 0.72, 0.85, opts.color ?? PAL.woodDark);
  s.block(w / 2 - 0.3, 0, 0, 0.55, 0.72, 0.85, opts.color ?? PAL.woodDark);
  if (opts.monitor) {
    s.block(0, 0.79, -0.2, 0.7, 0.45, 0.06, PAL.black);
    s.box(0, 1.02, -0.165, 0.62, 0.36, 0.01, 0x5ad0ff, NO);
    s.block(0, 0.79, 0.15, 0.5, 0.03, 0.18, 0x3a3a48, NO);
  }
  if (opts.lamp) {
    s.cyl(w / 2 - 0.25, 0.79, -0.2, 0.08, 0.3, PAL.gold, NO);
    s.cone(w / 2 - 0.25, 1.05, -0.2, 0.14, 0.18, 0x3a8a4a, NO);
  }
  if (opts.papers) {
    s.box(-0.3, 0.77, 0.1, 0.3, 0.02, 0.4, PAL.white, { ry: 0.2, outline: false });
    s.box(0.25, 0.77, 0.15, 0.3, 0.02, 0.4, 0xfff6e0, { ry: -0.3, outline: false });
  }
  s.pop();
  rectCol(L, x, z, w, 0.9, rot, { h: 0.8, sight: 'low' });
}

export function fishTank(L, x, z, rot = 0, w = 2) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0, 0, w, 0.8, 0.6, PAL.woodDark);
  s.block(0, 0.8, 0, w, 0.9, 0.55, 0x3fb7e0);
  s.block(0, 1.7, 0, w + 0.05, 0.08, 0.6, PAL.black, NO);
  const fc = [PAL.orange, PAL.yellow, PAL.pink, PAL.red, PAL.white];
  for (let i = 0; i < w * 3; i++) s.sphere(-w / 2 + 0.2 + R() * (w - 0.4), 1.0 + R() * 0.55, 0.28, 0.08, 0.05, 0.02, fc[i % fc.length], { outline: false, lo: true });
  for (let i = 0; i < w * 2; i++) s.cone(-w / 2 + 0.2 + R() * (w - 0.4), 0.8, 0.1, 0.05, 0.3 + R() * 0.3, 0x3fae5a, { outline: false, seg: 4 });
  s.pop();
  rectCol(L, x, z, w, 0.6, rot, { h: 1.75 });
}

export function dumpster(L, x, z, rot = 0, color = 0x3f8a5a) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0.12, 0, 1.8, 1.1, 1.1, color);
  s.block(0, 1.22, -0.05, 1.85, 0.08, 1.2, new THREE.Color(color).multiplyScalar(0.8).getHex(), { rx: -0.08 });
  for (const sx of [-0.7, 0.7]) for (const sz of [-0.4, 0.4]) s.cyl(sx, 0, sz, 0.08, 0.14, PAL.black, NO);
  s.pop();
  return rectCol(L, x, z, 1.8, 1.1, rot, { h: 1.3, sight: 'low' });
}

export function laundryBasket(L, x, z) {
  const s = L.env;
  s.push(x, 0, z);
  s.block(0, 0, 0, 0.9, 0.8, 0.7, 0xd8c8a0);
  for (let i = 0; i < 4; i++) s.box(0, 0.15 + i * 0.18, 0, 0.92, 0.03, 0.72, 0xb8a880, NO);
  s.ball(0.1, 0.8, 0, 0.3, PAL.white, { lo: true });
  s.ball(-0.2, 0.78, 0.1, 0.25, PAL.tileBlue, { lo: true });
  s.pop();
  return L.world.addRect(x, z, 0.9, 0.7, { h: 0.9, sight: 'low' });
}

export function stringLights(L, pts, y = 2.8, sag = 0.4) {
  const s = L.env;
  const cols = [PAL.red, PAL.yellow, PAL.teal, PAL.pink, PAL.white];
  let k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.round(len / 0.8);
    for (let j = 0; j <= n; j++) {
      const t = j / n;
      const yy = y - Math.sin(t * Math.PI) * sag;
      s.ball(ax + (bx - ax) * t, yy - 0.08, az + (bz - az) * t, 0.07, cols[k++ % cols.length], { lo: true, outline: false });
    }
    for (let j = 0; j < n; j++) {
      const t0 = j / n, t1 = (j + 1) / n;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, y0 = y - Math.sin(t0 * Math.PI) * sag;
      const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1, y1 = y - Math.sin(t1 * Math.PI) * sag;
      const sl = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      const e = new THREE.Euler().setFromQuaternion(q);
      s.prim(UNIT.box, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0.015, 0.015, sl, 0x2a2430, { rx: e.x, ry: e.y, rz: e.z, outline: false });
    }
  }
}

export function pole(L, x, z, h = 3, color = PAL.woodDark) {
  L.env.cyl(x, 0, z, 0.08, h, color, { seg: 8 });
  L.world.addCircle(x, z, 0.1, { h, sight: 'none' });
}

export function buffet(L, x, z, rot = 0, w = 3) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0, 0, w, 0.75, 0.9, PAL.white);
  s.block(0, 0.1, 0.46, w, 0.55, 0.02, PAL.carpetGold, NO);
  const foods = [PAL.orange, PAL.red, PAL.yellow, 0x8fcf5a, PAL.pink, 0xf0e0c0, 0xa0603a];
  for (let i = 0; i < Math.floor(w / 0.5); i++) {
    const fx = -w / 2 + 0.35 + i * 0.5;
    s.cyl(fx, 0.75, 0, 0.18, 0.03, PAL.white, NO);
    s.sphere(fx, 0.8, 0, 0.12, 0.06, 0.12, foods[i % foods.length], { lo: true, outline: false });
    if (i % 2) s.ball(fx + 0.06, 0.86, 0.03, 0.05, foods[(i + 3) % foods.length], { lo: true, outline: false });
  }
  s.pop();
  rectCol(L, x, z, w, 0.9, rot, { h: 0.8, sight: 'low' });
}

export function champagneTower(L, x, z) {
  const s = L.env;
  s.push(x, 0, z);
  s.cyl(0, 0, 0, 0.55, 0.8, PAL.white);
  let y = 0.8;
  for (let lvl = 0; lvl < 4; lvl++) {
    const n = 4 - lvl;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const px = (i - (n - 1) / 2) * 0.16, pz = (j - (n - 1) / 2) * 0.16;
      s.cone(px, y, pz, 0.07, 0.12, PAL.glass, { outline: false, rx: Math.PI, seg: 8 });
      s.cyl(px, y + 0.06, pz, 0.055, 0.05, 0xf7e08a, { outline: false, seg: 6 });
    }
    y += 0.15;
  }
  s.pop();
  L.world.addCircle(x, z, 0.55, { h: 1.0, sight: 'low' });
}

export function stage(L, x1, z1, x2, z2, color = PAL.woodDark) {
  const s = L.env;
  s.block((x1 + x2) / 2, 0, (z1 + z2) / 2, x2 - x1, 0.35, z2 - z1, color);
  s.block((x1 + x2) / 2, 0.35, (z1 + z2) / 2, x2 - x1 - 0.2, 0.02, z2 - z1 - 0.2, PAL.carpetRed, NO);
  // curtains at back
  for (let x = x1 + 0.3; x < x2; x += 0.6) s.cyl(x, 0.35, z1 + 0.2, 0.3, 2.25, x % 1.2 < 0.6 ? 0xb02a3a : 0xc23b4a, { outline: false, seg: 8 });
}

export function mic(L, x, z) {
  const s = L.env;
  s.cyl(x, 0.35, z, 0.18, 0.03, PAL.black, NO);
  s.cyl(x, 0.35, z, 0.02, 1.2, PAL.metal, NO);
  s.ball(x, 1.58, z, 0.06, PAL.metalDark, { lo: true });
}

export function safe(L, x, z, rot = 0) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0, 0, 0.8, 1.0, 0.7, 0x5a6470);
  s.box(0, 0.5, 0.355, 0.6, 0.8, 0.02, 0x4a525c, NO);
  s.cyl(0.1, 0.55, 0.36, 0.1, 0.04, PAL.gold, { rx: Math.PI / 2, outline: false });
  s.box(-0.15, 0.55, 0.37, 0.05, 0.2, 0.03, PAL.metal, NO);
  s.pop();
  return rectCol(L, x, z, 0.8, 0.7, rot, { h: 1.0, sight: 'low' });
}

export function globe(L, x, z) {
  const s = L.env;
  s.cyl(x, 0, z, 0.25, 0.05, PAL.woodDark, NO);
  s.cyl(x, 0, z, 0.04, 0.7, PAL.woodDark, NO);
  s.ball(x, 0.95, z, 0.32, PAL.blue);
  s.sphere(x + 0.1, 1.05, z + 0.15, 0.15, 0.12, 0.2, PAL.leaf, { outline: false, lo: true });
  s.sphere(x - 0.15, 0.85, z + 0.1, 0.12, 0.15, 0.2, PAL.leaf, { outline: false, lo: true });
  L.world.addCircle(x, z, 0.33, { h: 1.2, sight: 'low' });
}

export function weightsRack(L, x, z, rot = 0) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0, 0, 2.0, 0.7, 0.5, PAL.metalDark);
  for (let i = 0; i < 6; i++) {
    const px = -0.85 + i * 0.34;
    s.cyl(px, 0.7, 0, 0.05, 0.05, PAL.metal, NO);
    s.box(px, 0.82, 0, 0.3, 0.06, 0.06, PAL.metal, NO);
    s.ball(px - 0.14, 0.82, 0, 0.08 + i * 0.008, PAL.black, { lo: true });
    s.ball(px + 0.14, 0.82, 0, 0.08 + i * 0.008, PAL.black, { lo: true });
  }
  s.pop();
  rectCol(L, x, z, 2.0, 0.5, rot, { h: 0.9, sight: 'low' });
}

export function punchingBag(L, x, z) {
  const s = L.env;
  s.cyl(x, 2.3, z, 0.02, 0.3, PAL.metal, NO);
  s.cyl(x, 0.9, z, 0.28, 1.4, PAL.red);
  s.cyl(x, 1.4, z, 0.3, 0.08, PAL.black, NO);
  L.world.addCircle(x, z, 0.3, { h: 2.3, sight: 'low' });
}

export function treadmill(L, x, z, rot = 0) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0, 0, 0.8, 0.18, 1.8, PAL.black);
  s.block(0, 0.18, 0, 0.6, 0.02, 1.6, 0x3a3a48, NO);
  for (const sx of [-0.38, 0.38]) s.block(sx, 0.18, -0.75, 0.06, 1.1, 0.06, PAL.metal, NO);
  s.block(0, 1.2, -0.78, 0.8, 0.25, 0.15, PAL.black);
  s.pop();
  rectCol(L, x, z, 0.8, 1.8, rot, { h: 1.3, sight: 'none' });
}

export function boxingRing(L, x, z, size = 5) {
  const s = L.env;
  const h = 0.6;
  s.block(x, 0, z, size, h, size, PAL.blue);
  s.block(x, h, z, size - 0.1, 0.03, size - 0.1, 0xe8e8f0, NO);
  const hs = size / 2 - 0.1;
  const cols = [PAL.red, PAL.white, PAL.blue];
  for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) s.cyl(x + cx * hs, h, z + cz * hs, 0.08, 1.1, PAL.metal);
  for (let r = 0; r < 3; r++) {
    const y = h + 0.4 + r * 0.3;
    s.box(x, y, z - hs, size - 0.2, 0.04, 0.04, cols[r], NO);
    s.box(x, y, z + hs, size - 0.2, 0.04, 0.04, cols[r], NO);
    s.box(x - hs, y, z, 0.04, 0.04, size - 0.2, cols[r], NO);
    s.box(x + hs, y, z, 0.04, 0.04, size - 0.2, cols[r], NO);
  }
  L.world.addRect(x, z, size, size, { h: 1.6, sight: 'low' });
}

export function massageTable(L, x, z, rot = 0) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0.6, 0, 0.7, 0.14, 1.9, 0xf0f0f0);
  s.block(0, 0.6, -0.95, 0.35, 0.1, 0.25, 0xf0f0f0, NO);
  for (const sx of [-0.28, 0.28]) for (const sz of [-0.8, 0.8]) s.block(sx, 0, sz, 0.06, 0.6, 0.06, PAL.woodLight, NO);
  s.block(0, 0.74, 0.5, 0.72, 0.03, 0.6, PAL.teal, NO);
  s.pop();
  rectCol(L, x, z, 0.7, 2.0, rot, { h: 0.8, sight: 'low' });
}

export function towelStack(L, x, z) {
  const s = L.env;
  const cols = [PAL.white, PAL.teal, PAL.pink, PAL.white];
  for (let i = 0; i < 4; i++) s.block(x, 0.75 + i * 0.1, z, 0.5, 0.09, 0.35, cols[i], NO);
}

export function workbench(L, x, z, rot = 0) {
  const s = L.env;
  s.push(x, 0, z, rot);
  s.block(0, 0.85, 0, 2.0, 0.08, 0.8, PAL.wood);
  for (const sx of [-0.9, 0.9]) for (const sz of [-0.33, 0.33]) s.block(sx, 0, sz, 0.08, 0.85, 0.08, PAL.woodDark, NO);
  s.block(0, 0.25, 0, 1.9, 0.04, 0.7, PAL.woodDark, NO);
  s.block(0, 0.93, -0.36, 2.0, 1.0, 0.06, 0x8a6a4a);
  for (let i = 0; i < 5; i++) s.box(-0.8 + i * 0.4, 1.4, -0.32, 0.06, 0.35, 0.03, [PAL.red, PAL.metal, PAL.yellow, PAL.blue, PAL.metal][i], NO);
  s.pop();
  rectCol(L, x, z, 2.0, 0.85, rot, { h: 0.95, sight: 'low' });
}

export function planter(L, x, z, w, d, plant = 'veg') {
  const s = L.env;
  s.block(x, 0, z, w, 0.55, d, PAL.wood);
  s.block(x, 0.55, z, w - 0.12, 0.02, d - 0.12, 0x5a3a20, NO);
  const n = Math.floor(w * d * 2.5);
  for (let i = 0; i < n; i++) {
    const px = x - w / 2 + 0.2 + R() * (w - 0.4), pz = z - d / 2 + 0.2 + R() * (d - 0.4);
    if (plant === 'veg') {
      s.ball(px, 0.7, pz, 0.15, i % 3 ? PAL.leaf : PAL.leafDark, { lo: true, outline: false });
      if (i % 3 === 0) s.ball(px + 0.05, 0.78, pz, 0.07, PAL.red, { lo: true, outline: false });
    } else if (plant === 'flower') {
      s.cyl(px, 0.56, pz, 0.015, 0.3, PAL.leafDark, { outline: false, seg: 6 });
      s.ball(px, 0.88, pz, 0.08, [PAL.flowerPink, PAL.flowerPurple, PAL.flowerYellow][i % 3], { lo: true, outline: false });
    } else if (plant === 'cactus') {
      s.cyl(px, 0.55, pz, 0.08, 0.4 + R() * 0.3, 0x5a9a4a, { seg: 6 });
    }
  }
  L.world.addRect(x, z, w, d, { h: 0.8, sight: 'low' });
}

export function boat(sink, kind = 'taxi', color = PAL.white, accent = PAL.red) {
  const s = sink;
  if (kind === 'row') {
    s.sphere(0, 0.1, 0, 0.75, 0.3, 1.8, PAL.wood);
    s.sphere(0, 0.22, 0, 0.62, 0.15, 1.6, PAL.woodDark, { outline: false });
    s.block(0, 0.22, 0.2, 1.2, 0.05, 0.25, PAL.woodLight, NO);
    s.cyl(0.65, 0.3, 0, 0.03, 0.03, PAL.woodDark, { rz: 1.2, sx: 1, outline: false });
    return;
  }
  const L2 = kind === 'speed' ? 2.6 : 3.2;
  s.sphere(0, 0.2, 0, 1.25, 0.55, L2, color);
  s.sphere(0, 0.36, 0, 1.08, 0.32, L2 * 0.92, accent, { outline: false });
  s.sphere(0, 0.42, 0, 1.0, 0.22, L2 * 0.86, PAL.woodLight, { outline: false });
  if (kind === 'speed') {
    s.box(0, 0.75, 0.6, 1.4, 0.45, 0.06, PAL.glass, { rx: -0.6 });
    s.block(0, 0.4, -0.6, 1.4, 0.4, 0.9, accent);
    s.block(0, 0.4, -1.9, 0.5, 0.5, 0.4, PAL.metalDark);
  } else {
    s.block(0, 0.45, -0.4, 1.6, 1.1, 1.6, color);
    s.block(0, 1.55, -0.4, 1.8, 0.1, 1.9, accent);
    s.box(0, 1.0, 0.41, 1.3, 0.5, 0.02, PAL.glass, NO);
    s.cyl(0.6, 1.65, -0.9, 0.06, 0.6, PAL.black, NO);
  }
}
