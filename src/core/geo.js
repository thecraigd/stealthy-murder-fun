// Geometry batching: build thousands of vertex-coloured primitives into a few
// big indexed meshes (spatially chunked so frustum culling still helps), plus a
// matching inverted-hull outline mesh for that crisp cartoon ink line.
import * as THREE from 'three';

const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.5, 12, 8),
  sphereHi: new THREE.SphereGeometry(0.5, 18, 12),
  sphereLo: new THREE.SphereGeometry(0.5, 8, 6),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 12),
  cone8: new THREE.ConeGeometry(0.5, 1, 8),
  cone4: new THREE.ConeGeometry(0.5, 1, 4),
  plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  dodeca: new THREE.DodecahedronGeometry(0.5, 0),
  ico: new THREE.IcosahedronGeometry(0.5, 1),
  torus: new THREE.TorusGeometry(0.5, 0.12, 6, 16),
};
export { UNIT };

const colorCache = new Map();
export function linColor(hex) {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

class Buffers {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
    this.count = 0;
  }
  append(src, matrix, color, tint = 0) {
    const p = src.attributes.position;
    const n = src.attributes.normal;
    _nm.getNormalMatrix(matrix);
    const base = this.count;
    const sc = color ? null : src.attributes.color;
    let r = color ? color.r : 1, g = color ? color.g : 1, b = color ? color.b : 1;
    if (tint) {
      const k = 1 + (Math.random() * 2 - 1) * tint;
      r *= k; g *= k; b *= k;
    }
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(_v.x, _v.y, _v.z);
      if (n) {
        _n.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize();
        this.nor.push(_n.x, _n.y, _n.z);
      } else this.nor.push(0, 1, 0);
      if (sc) this.col.push(sc.getX(i), sc.getY(i), sc.getZ(i));
      else this.col.push(r, g, b);
    }
    if (src.index) {
      const ia = src.index.array;
      for (let i = 0; i < ia.length; i++) this.idx.push(ia[i] + base);
    } else {
      for (let i = 0; i < p.count; i++) this.idx.push(i + base);
    }
    // Mirror transforms (negative determinant) flip winding.
    if (matrix.determinant() < 0) {
      const start = this.idx.length - (src.index ? src.index.count : p.count);
      for (let i = start; i < this.idx.length; i += 3) {
        const t = this.idx[i + 1];
        this.idx[i + 1] = this.idx[i + 2];
        this.idx[i + 2] = t;
      }
    }
    this.count += p.count;
  }
  build() {
    if (this.count === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// A sink that collects primitives, chunked by world position.
export class MeshSink {
  constructor({ chunk = 16, outline = 0.035 } = {}) {
    this.chunk = chunk;
    this.outlineT = outline;
    this.chunks = new Map();
    this.stack = [new THREE.Matrix4()];
  }
  get top() {
    return this.stack[this.stack.length - 1];
  }
  push(x = 0, y = 0, z = 0, ry = 0, s = 1) {
    _q.setFromEuler(_e.set(0, ry, 0));
    const m = new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(s, s, s));
    this.stack.push(this.top.clone().multiply(m));
    return this;
  }
  pushMatrix(m) {
    this.stack.push(this.top.clone().multiply(m));
    return this;
  }
  pop() {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }
  _bucket(wx, wz) {
    const key = `${Math.floor(wx / this.chunk)},${Math.floor(wz / this.chunk)}`;
    let c = this.chunks.get(key);
    if (!c) {
      c = { main: new Buffers(), out: new Buffers() };
      this.chunks.set(key, c);
    }
    return c;
  }
  // Generic: src geometry in local space, local TRS.
  prim(src, x, y, z, sx, sy, sz, color, opts = {}) {
    const { rx = 0, ry = 0, rz = 0, outline = true, tint = 0, ot } = opts;
    _q.setFromEuler(_e.set(rx, ry, rz));
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    const world = this.top.clone().multiply(_m);
    _v.set(0, 0, 0).applyMatrix4(world);
    const b = this._bucket(_v.x, _v.z);
    if (!opts.onlyOutline) b.main.append(src, world, color == null ? null : linColor(color), tint);
    if (outline) {
      const t = (ot ?? this.outlineT) * 2;
      _q.setFromEuler(_e.set(rx, ry, rz));
      _m.compose(_p.set(x, y, z), _q, _s.set(Math.abs(sx) + t, Math.abs(sy) + t, Math.abs(sz) + t));
      const ow = this.top.clone().multiply(_m);
      b.out.append(src, ow, linColor(0x000000));
    }
    return this;
  }
  box(x, y, z, w, h, d, color, opts) {
    return this.prim(UNIT.box, x, y, z, w, h, d, color, opts);
  }
  // Box whose bottom sits at y.
  block(x, y, z, w, h, d, color, opts) {
    return this.prim(UNIT.box, x, y + h / 2, z, w, h, d, color, opts);
  }
  sphere(x, y, z, rx, ry, rz, color, opts = {}) {
    return this.prim(opts.lo ? UNIT.sphereLo : UNIT.sphere, x, y, z, rx * 2, ry * 2, rz * 2, color, opts);
  }
  ball(x, y, z, r, color, opts = {}) {
    return this.prim(opts.lo ? UNIT.sphereLo : UNIT.sphere, x, y, z, r * 2, r * 2, r * 2, color, opts);
  }
  cyl(x, y, z, r, h, color, opts = {}) {
    const src = opts.seg === 6 ? UNIT.cyl6 : opts.seg === 8 ? UNIT.cyl8 : UNIT.cyl;
    return this.prim(src, x, y + h / 2, z, r * 2, h, r * 2, color, opts);
  }
  cone(x, y, z, r, h, color, opts = {}) {
    const src = opts.seg === 4 ? UNIT.cone4 : opts.seg === 8 ? UNIT.cone8 : UNIT.cone;
    return this.prim(src, x, y + h / 2, z, r * 2, h, r * 2, color, opts);
  }
  // A ring of n blocks (basin rims, tubs) centred on radius r, bottom at y.
  ring(x, y, z, r, t, h, n, color, opts = {}) {
    const len = 2 * (r + t / 2) * Math.tan(Math.PI / n) + 0.02;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.prim(UNIT.box, x + Math.sin(a) * r, y + h / 2, z + Math.cos(a) * r, len, h, t, color, { ...opts, ry: a });
    }
    return this;
  }
  plane(x, y, z, w, d, color, opts = {}) {
    return this.prim(UNIT.plane, x, y, z, w, 1, d, color, { outline: false, ...opts });
  }
  geo(src, x, y, z, color, opts = {}) {
    const { sx = 1, sy = 1, sz = 1 } = opts;
    return this.prim(src, x, y, z, sx, sy, sz, color, opts);
  }
  // Build into meshes added to `parent`.
  build(parent, material, outlineMaterial, { castShadow = true, receiveShadow = true, name = 'sink' } = {}) {
    const meshes = [];
    for (const [key, c] of this.chunks) {
      const g = c.main.build();
      if (g) {
        const mesh = new THREE.Mesh(g, material);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
        mesh.name = `${name}:${key}`;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        parent.add(mesh);
        meshes.push(mesh);
      }
      if (outlineMaterial) {
        const og = c.out.build();
        if (og) {
          const om = new THREE.Mesh(og, outlineMaterial);
          om.name = `${name}-ol:${key}`;
          om.matrixAutoUpdate = false;
          om.updateMatrix();
          parent.add(om);
          meshes.push(om);
        }
      }
    }
    this.chunks.clear();
    return meshes;
  }
}

// Build a single standalone mesh (dynamic props) from a sink-like callback.
export function buildProp(fn, material, outlineMaterial, opts = {}) {
  const sink = new MeshSink({ chunk: 100000, outline: opts.outline ?? 0.03 });
  fn(sink);
  const group = new THREE.Group();
  const meshes = sink.build(group, material, outlineMaterial, opts);
  for (const m of meshes) m.matrixAutoUpdate = true;
  return group;
}
