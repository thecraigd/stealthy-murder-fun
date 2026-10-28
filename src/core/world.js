// Collision, line-of-sight and navigation for a single-floor world.
// Colliders are exact boxes/circles (smooth movement, exact sight checks);
// navigation uses a 0.5 m grid with A* + string-pulling.
import { clamp } from './util.js';

const BUCKET = 4;

export class World {
  constructor({ minX, maxX, minZ, maxZ, cell = 0.5 }) {
    this.minX = minX; this.maxX = maxX; this.minZ = minZ; this.maxZ = maxZ;
    this.cell = cell;
    this.gw = Math.ceil((maxX - minX) / cell);
    this.gh = Math.ceil((maxZ - minZ) / cell);
    this.walk = new Uint8Array(this.gw * this.gh);
    this.colliders = [];
    this.hash = new Map();
    this.stamp = 1;
    this.landShapes = [];
    this.zones = [];
    this._id = 1;
  }

  // ---------------------------------------------------------------- colliders
  _keys(minX, minZ, maxX, maxZ) {
    const out = [];
    const x0 = Math.floor(minX / BUCKET), x1 = Math.floor(maxX / BUCKET);
    const z0 = Math.floor(minZ / BUCKET), z1 = Math.floor(maxZ / BUCKET);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) out.push(x * 73856093 ^ z * 19349663);
    return out;
  }
  _insert(c) {
    c._keys = this._keys(c.minX, c.minZ, c.maxX, c.maxZ);
    for (const k of c._keys) {
      let a = this.hash.get(k);
      if (!a) this.hash.set(k, (a = []));
      a.push(c);
    }
  }
  // opts: {solid=true, sight='tall'|'low'|'none', h, tag, owner}
  addBox(minX, minZ, maxX, maxZ, opts = {}) {
    if (minX > maxX) [minX, maxX] = [maxX, minX];
    if (minZ > maxZ) [minZ, maxZ] = [maxZ, minZ];
    const c = {
      id: this._id++, type: 'box', minX, minZ, maxX, maxZ,
      solid: opts.solid ?? true,
      sight: opts.sight ?? 'tall',
      h: opts.h ?? (opts.sight === 'low' ? 1.0 : 2.6),
      tag: opts.tag, owner: opts.owner, _s: 0,
    };
    this.colliders.push(c);
    this._insert(c);
    return c;
  }
  // Box from centre/size with optional 90° rotation.
  addRect(cx, cz, w, d, opts = {}) {
    if (opts.rot && Math.abs(Math.sin(opts.rot)) > 0.7) [w, d] = [d, w];
    return this.addBox(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, opts);
  }
  addCircle(x, z, r, opts = {}) {
    const c = {
      id: this._id++, type: 'circle', x, z, r, minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r,
      solid: opts.solid ?? true, sight: opts.sight ?? 'tall', h: opts.h ?? 2.6, tag: opts.tag, owner: opts.owner, _s: 0,
    };
    this.colliders.push(c);
    this._insert(c);
    return c;
  }
  remove(c) {
    if (!c || !c._keys) return;
    for (const k of c._keys) {
      const a = this.hash.get(k);
      if (!a) continue;
      const i = a.indexOf(c);
      if (i >= 0) a.splice(i, 1);
    }
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
    c._keys = null;
  }
  query(minX, minZ, maxX, maxZ, out = []) {
    const s = ++this.stamp;
    const x0 = Math.floor(minX / BUCKET), x1 = Math.floor(maxX / BUCKET);
    const z0 = Math.floor(minZ / BUCKET), z1 = Math.floor(maxZ / BUCKET);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const a = this.hash.get(x * 73856093 ^ z * 19349663);
        if (!a) continue;
        for (const c of a) {
          if (c._s === s) continue;
          c._s = s;
          if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- land
  // shapes: {type:'rrect', cx, cz, hw, hd, r} | {type:'circle', x, z, r} | {type:'rect', minX..}
  addLand(shape) {
    this.landShapes.push(shape);
  }
  landSDF(x, z) {
    let d = 1e9;
    for (const s of this.landShapes) {
      let v;
      if (s.type === 'rrect') {
        const qx = Math.abs(x - s.cx) - (s.hw - s.r);
        const qz = Math.abs(z - s.cz) - (s.hd - s.r);
        v = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - s.r;
      } else if (s.type === 'circle') {
        v = Math.hypot(x - s.x, z - s.z) - s.r;
      } else {
        const qx = Math.abs(x - (s.minX + s.maxX) / 2) - (s.maxX - s.minX) / 2;
        const qz = Math.abs(z - (s.minZ + s.maxZ) / 2) - (s.maxZ - s.minZ) / 2;
        v = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
      }
      if (v < d) d = v;
    }
    return d;
  }

  // ---------------------------------------------------------------- movement
  // Push a circle out of solids. p: {x, z}. Returns true if anything was hit.
  resolveCircle(p, r, ignore = null) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const list = this.query(p.x - r, p.z - r, p.x + r, p.z + r, (this._tmp = this._tmp || [] , this._tmp.length = 0, this._tmp));
      for (const c of list) {
        if (!c.solid || c === ignore || c.passable) continue;
        if (c.type === 'box') {
          const cx = clamp(p.x, c.minX, c.maxX);
          const cz = clamp(p.z, c.minZ, c.maxZ);
          let dx = p.x - cx, dz = p.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            if (d2 > 1e-9) {
              const d = Math.sqrt(d2);
              p.x += (dx / d) * (r - d);
              p.z += (dz / d) * (r - d);
            } else {
              // centre inside: push along least penetration
              const l = p.x - c.minX, rr = c.maxX - p.x, t = p.z - c.minZ, b = c.maxZ - p.z;
              const m = Math.min(l, rr, t, b);
              if (m === l) p.x = c.minX - r;
              else if (m === rr) p.x = c.maxX + r;
              else if (m === t) p.z = c.minZ - r;
              else p.z = c.maxZ + r;
            }
            moved = hit = true;
          }
        } else {
          const dx = p.x - c.x, dz = p.z - c.z;
          const d = Math.hypot(dx, dz);
          const rr = r + c.r;
          if (d < rr) {
            if (d > 1e-6) {
              p.x += (dx / d) * (rr - d);
              p.z += (dz / d) * (rr - d);
            } else p.x += rr;
            moved = hit = true;
          }
        }
      }
      // Land boundary (smooth SDF).
      if (this.landShapes.length) {
        const sd = this.landSDF(p.x, p.z);
        if (sd > -r) {
          const e = 0.05;
          const gx = this.landSDF(p.x + e, p.z) - this.landSDF(p.x - e, p.z);
          const gz = this.landSDF(p.x, p.z + e) - this.landSDF(p.x, p.z - e);
          const gl = Math.hypot(gx, gz) || 1;
          const push = sd + r;
          p.x -= (gx / gl) * push;
          p.z -= (gz / gl) * push;
          moved = hit = true;
        }
      }
      if (!moved) break;
    }
    return hit;
  }

  // ---------------------------------------------------------------- sight
  // Is the 3D segment blocked? lowOk: ignore low cover entirely.
  segmentBlocked(ax, ay, az, bx, by, bz, opts = {}) {
    const minX = Math.min(ax, bx), maxX = Math.max(ax, bx);
    const minZ = Math.min(az, bz), maxZ = Math.max(az, bz);
    const list = this.query(minX, minZ, maxX, maxZ, (this._tmp2 = this._tmp2 || [], this._tmp2.length = 0, this._tmp2));
    const dx = bx - ax, dz = bz - az, dy = by - ay;
    for (const c of list) {
      if (c.sight === 'none' || c.open) continue;
      if (opts.ignoreLow && c.sight === 'low') continue;
      if (opts.ignore && opts.ignore === c) continue;
      let t0 = 0, t1 = 1;
      if (c.type === 'box') {
        // slab test (XZ)
        if (Math.abs(dx) < 1e-9) {
          if (ax < c.minX || ax > c.maxX) continue;
        } else {
          let ta = (c.minX - ax) / dx, tb = (c.maxX - ax) / dx;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) continue;
        }
        if (Math.abs(dz) < 1e-9) {
          if (az < c.minZ || az > c.maxZ) continue;
        } else {
          let ta = (c.minZ - az) / dz, tb = (c.maxZ - az) / dz;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) continue;
        }
      } else {
        const fx = ax - c.x, fz = az - c.z;
        const A = dx * dx + dz * dz;
        const Bq = 2 * (fx * dx + fz * dz);
        const C = fx * fx + fz * fz - c.r * c.r;
        const disc = Bq * Bq - 4 * A * C;
        if (disc < 0 || A < 1e-9) continue;
        const sq = Math.sqrt(disc);
        const ta = (-Bq - sq) / (2 * A), tb = (-Bq + sq) / (2 * A);
        t0 = Math.max(0, ta); t1 = Math.min(1, tb);
        if (t0 > t1) continue;
      }
      const y0 = ay + dy * t0, y1 = ay + dy * t1;
      if (Math.min(y0, y1) < c.h) return true;
    }
    return false;
  }

  // Distance along a 2D ray to the first tall sight blocker (for vision cone drawing).
  raycastSight(ax, az, dx, dz, maxD, eyeY = 1.4) {
    const bx = ax + dx * maxD, bz = az + dz * maxD;
    const list = this.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), (this._tmp3 = this._tmp3 || [], this._tmp3.length = 0, this._tmp3));
    let best = maxD;
    for (const c of list) {
      if (c.sight !== 'tall' || c.open || c.h < eyeY) continue;
      let t0 = 0, t1 = maxD;
      if (c.type === 'box') {
        if (Math.abs(dx) < 1e-9) {
          if (ax < c.minX || ax > c.maxX) continue;
        } else {
          let ta = (c.minX - ax) / dx, tb = (c.maxX - ax) / dx;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) continue;
        }
        if (Math.abs(dz) < 1e-9) {
          if (az < c.minZ || az > c.maxZ) continue;
        } else {
          let ta = (c.minZ - az) / dz, tb = (c.maxZ - az) / dz;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) continue;
        }
      } else {
        const fx = ax - c.x, fz = az - c.z;
        const Bq = 2 * (fx * dx + fz * dz);
        const C = fx * fx + fz * fz - c.r * c.r;
        const disc = Bq * Bq - 4 * C;
        if (disc < 0) continue;
        const ta = (-Bq - Math.sqrt(disc)) / 2;
        if (ta < 0) continue;
        t0 = ta;
      }
      if (t0 < best) best = t0;
    }
    return best;
  }

  // ---------------------------------------------------------------- zones
  addZone(z) {
    this.zones.push(z);
    return z;
  }
  zoneAt(x, z) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zn = this.zones[i];
      if (x >= zn.minX && x <= zn.maxX && z >= zn.minZ && z <= zn.maxZ) return zn;
    }
    return null;
  }

  // ---------------------------------------------------------------- nav grid
  cellIndex(x, z) {
    const cx = Math.floor((x - this.minX) / this.cell);
    const cz = Math.floor((z - this.minZ) / this.cell);
    if (cx < 0 || cz < 0 || cx >= this.gw || cz >= this.gh) return -1;
    return cz * this.gw + cx;
  }
  cellCenter(i) {
    const cx = i % this.gw, cz = (i / this.gw) | 0;
    return { x: this.minX + (cx + 0.5) * this.cell, z: this.minZ + (cz + 0.5) * this.cell };
  }
  buildNav(agentR = 0.32) {
    this.agentR = agentR;
    this.updateNavRegion(this.minX, this.minZ, this.maxX, this.maxZ);
    // Path cost per cell: non-public zones are "expensive" so people prefer
    // public routes and only cut through private rooms when they must.
    this.cost = new Float32Array(this.gw * this.gh);
    for (let gz = 0; gz < this.gh; gz++) {
      for (let gx = 0; gx < this.gw; gx++) {
        const x = this.minX + (gx + 0.5) * this.cell, z = this.minZ + (gz + 0.5) * this.cell;
        const zn = this.zoneAt(x, z);
        this.cost[gz * this.gw + gx] = zn && zn.access !== 'public' ? 3 : 1;
      }
    }
  }
  updateNavRegion(minX, minZ, maxX, maxZ) {
    const r = this.agentR;
    const c = this.cell;
    const x0 = clamp(Math.floor((minX - r - this.minX) / c) - 1, 0, this.gw - 1);
    const x1 = clamp(Math.ceil((maxX + r - this.minX) / c) + 1, 0, this.gw - 1);
    const z0 = clamp(Math.floor((minZ - r - this.minZ) / c) - 1, 0, this.gh - 1);
    const z1 = clamp(Math.ceil((maxZ + r - this.minZ) / c) + 1, 0, this.gh - 1);
    const tmp = [];
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        const x = this.minX + (gx + 0.5) * c;
        const z = this.minZ + (gz + 0.5) * c;
        let ok = this.landShapes.length ? this.landSDF(x, z) < -r : true;
        if (ok) {
          tmp.length = 0;
          this.query(x - r, z - r, x + r, z + r, tmp);
          for (const k of tmp) {
            if (!k.solid || k.passable) continue;
            if (k.type === 'box') {
              const px = clamp(x, k.minX, k.maxX), pz = clamp(z, k.minZ, k.maxZ);
              if ((x - px) ** 2 + (z - pz) ** 2 < r * r) { ok = false; break; }
            } else if (Math.hypot(x - k.x, z - k.z) < k.r + r) { ok = false; break; }
          }
        }
        this.walk[gz * this.gw + gx] = ok ? 1 : 0;
      }
    }
  }
  isWalkable(x, z) {
    const i = this.cellIndex(x, z);
    return i >= 0 && this.walk[i] === 1;
  }
  nearestWalkable(x, z, maxR = 6) {
    const i = this.cellIndex(x, z);
    if (i >= 0 && this.walk[i]) return this.cellCenter(i);
    const c = this.cell;
    for (let rr = 1; rr <= maxR / c; rr++) {
      let best = null, bd = 1e9;
      for (let dz = -rr; dz <= rr; dz++) {
        for (let dx = -rr; dx <= rr; dx++) {
          if (Math.abs(dx) !== rr && Math.abs(dz) !== rr) continue;
          const j = this.cellIndex(x + dx * c, z + dz * c);
          if (j >= 0 && this.walk[j]) {
            const p = this.cellCenter(j);
            const d = (p.x - x) ** 2 + (p.z - z) ** 2;
            if (d < bd) { bd = d; best = p; }
          }
        }
      }
      if (best) return best;
    }
    return null;
  }
  // Walkable straight line (grid-sampled).
  lineWalkable(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!this.isWalkable(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  findPath(sx, sz, tx, tz, maxIter = 40000) {
    let s = this.cellIndex(sx, sz);
    let t = this.cellIndex(tx, tz);
    if (s < 0 || t < 0) return null;
    if (!this.walk[s]) {
      const p = this.nearestWalkable(sx, sz, 3);
      if (!p) return null;
      s = this.cellIndex(p.x, p.z);
    }
    if (!this.walk[t]) {
      const p = this.nearestWalkable(tx, tz, 4);
      if (!p) return null;
      t = this.cellIndex(p.x, p.z);
      tx = p.x; tz = p.z;
    }
    if (s === t) return [{ x: tx, z: tz }];
    const N = this.gw * this.gh;
    if (!this._g || this._g.length !== N) {
      this._g = new Float32Array(N);
      this._from = new Int32Array(N);
      this._seen = new Uint32Array(N);
      this._closed = new Uint32Array(N);
      this._gen = 0;
    }
    const gen = ++this._gen;
    const g = this._g, from = this._from, seen = this._seen, closed = this._closed;
    const W = this.gw;
    const tcx = t % W, tcz = (t / W) | 0;
    const h = (i) => {
      const dx = Math.abs((i % W) - tcx), dz = Math.abs(((i / W) | 0) - tcz);
      return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz);
    };
    // binary heap of [f, idx]
    const heapF = [], heapI = [];
    const push = (f, i) => {
      heapF.push(f); heapI.push(i);
      let k = heapF.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heapF[p] <= heapF[k]) break;
        [heapF[p], heapF[k]] = [heapF[k], heapF[p]];
        [heapI[p], heapI[k]] = [heapI[k], heapI[p]];
        k = p;
      }
    };
    const pop = () => {
      const i = heapI[0];
      const lf = heapF.pop(), li = heapI.pop();
      if (heapF.length) {
        heapF[0] = lf; heapI[0] = li;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < heapF.length && heapF[l] < heapF[m]) m = l;
          if (r < heapF.length && heapF[r] < heapF[m]) m = r;
          if (m === k) break;
          [heapF[m], heapF[k]] = [heapF[k], heapF[m]];
          [heapI[m], heapI[k]] = [heapI[k], heapI[m]];
          k = m;
        }
      }
      return i;
    };
    g[s] = 0; seen[s] = gen; from[s] = -1;
    push(h(s), s);
    const DX = [1, -1, 0, 0, 1, 1, -1, -1];
    const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
    const DC = [1, 1, 1, 1, 1.4142, 1.4142, 1.4142, 1.4142];
    let iter = 0, found = false;
    while (heapF.length && iter++ < maxIter) {
      const cur = pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === t) { found = true; break; }
      const cx = cur % W, cz = (cur / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], nz = cz + DZ[k];
        if (nx < 0 || nz < 0 || nx >= W || nz >= this.gh) continue;
        const ni = nz * W + nx;
        if (!this.walk[ni] || closed[ni] === gen) continue;
        if (k >= 4 && (!this.walk[cz * W + nx] || !this.walk[nz * W + cx])) continue;
        const ng = g[cur] + DC[k] * (this.cost ? this.cost[ni] : 1);
        if (seen[ni] !== gen || ng < g[ni]) {
          seen[ni] = gen; g[ni] = ng; from[ni] = cur;
          push(ng + h(ni) * 1.001, ni);
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = t; c !== -1; c = from[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => this.cellCenter(c));
    pts[pts.length - 1] = { x: tx, z: tz };
    // String-pull.
    const out = [];
    let a = { x: sx, z: sz };
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineWalkable(a.x, a.z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]);
      a = pts[j];
      i = j + 1;
    }
    return out;
  }

  randomWalkableNear(x, z, radius, rnd = Math.random) {
    for (let k = 0; k < 20; k++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * radius;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (this.isWalkable(px, pz) && !this.segmentBlocked(x, 1, z, px, 1, pz, { ignoreLow: true })) return { x: px, z: pz };
    }
    return this.nearestWalkable(x, z);
  }
}
