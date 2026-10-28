// Island terrain (marching-squares outline from an SDF), toon water with
// animated shore foam, and a soft sky.
import * as THREE from 'three';
import { G, PAL, toonGradient } from '../core/materials.js';

export const WATER_Y = -1.6;

function sdfUnion(shapes, x, z) {
  let d = 1e9;
  for (const s of shapes) {
    let v;
    if (s.type === 'rrect') {
      const qx = Math.abs(x - s.cx) - (s.hw - s.r);
      const qz = Math.abs(z - s.cz) - (s.hd - s.r);
      v = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - s.r;
    } else if (s.type === 'circle') {
      v = Math.hypot(x - s.x, z - s.z) - s.r;
    } else if (s.type === 'cut') {
      continue;
    } else {
      const qx = Math.abs(x - (s.minX + s.maxX) / 2) - (s.maxX - s.minX) / 2;
      const qz = Math.abs(z - (s.minZ + s.maxZ) / 2) - (s.maxZ - s.minZ) / 2;
      v = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
    }
    if (v < d) d = v;
  }
  // subtractive circles (coves)
  for (const s of shapes) {
    if (s.type !== 'cut') continue;
    const v = s.r - Math.hypot(x - s.x, z - s.z);
    d = Math.max(d, v);
  }
  return d;
}

export function makeSDF(shapes) {
  return (x, z) => sdfUnion(shapes, x, z);
}

function marchingLoops(sdf, minX, minZ, maxX, maxZ, step) {
  const nx = Math.ceil((maxX - minX) / step) + 1;
  const nz = Math.ceil((maxZ - minZ) / step) + 1;
  const v = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = sdf(minX + i * step, minZ + j * step);
  const pts = new Map();
  const adj = new Map();
  const edgePoint = (id, ax, az, av, bx, bz, bv) => {
    if (!pts.has(id)) {
      const t = av / (av - bv);
      pts.set(id, [ax + (bx - ax) * t, az + (bz - az) * t]);
    }
    return id;
  };
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  };
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = v[j * nx + i], b = v[j * nx + i + 1], c = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];
      const idx = (a < 0 ? 1 : 0) | (b < 0 ? 2 : 0) | (c < 0 ? 4 : 0) | (d < 0 ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const x0 = minX + i * step, z0 = minZ + j * step, x1 = x0 + step, z1 = z0 + step;
      const E = [
        () => edgePoint(`h${i},${j}`, x0, z0, a, x1, z0, b),
        () => edgePoint(`v${i + 1},${j}`, x1, z0, b, x1, z1, c),
        () => edgePoint(`h${i},${j + 1}`, x1, z1, c, x0, z1, d),
        () => edgePoint(`v${i},${j}`, x0, z1, d, x0, z0, a),
      ];
      const seg = {
        1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]],
        8: [[2, 3]], 9: [[2, 0]], 10: [[0, 1], [2, 3]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]],
      }[idx];
      for (const [p, q] of seg) link(E[p](), E[q]());
    }
  }
  const loops = [];
  const used = new Set();
  for (const start of adj.keys()) {
    if (used.has(start)) continue;
    const loop = [];
    let prev = null, cur = start;
    while (cur && !used.has(cur)) {
      used.add(cur);
      loop.push(pts.get(cur));
      const nb = adj.get(cur);
      const next = nb[0] !== prev && !used.has(nb[0]) ? nb[0] : nb[1] !== prev && !used.has(nb[1]) ? nb[1] : null;
      prev = cur;
      cur = next;
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

// Ramer-Douglas-Peucker-lite: drop nearly collinear points.
function simplify(loop, eps = 0.04) {
  const out = [];
  for (let i = 0; i < loop.length; i++) {
    const a = out.length ? out[out.length - 1] : loop[loop.length - 1];
    const b = loop[i], c = loop[(i + 1) % loop.length];
    const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    if (cross > eps || out.length === 0) out.push(b);
  }
  return out;
}

export function buildTerrain(scene, shapes, opts = {}) {
  const sdf = makeSDF(shapes);
  const bounds = opts.bounds;
  const loops = marchingLoops(sdf, bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ, 0.5).map((l) => simplify(l));
  const group = new THREE.Group();
  group.name = 'terrain';
  const beachFn = opts.beach || (() => 0);

  const topMat = new THREE.MeshToonMaterial({ color: PAL.grass, gradientMap: toonGradient });
  const sideMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient, side: THREE.DoubleSide });

  for (const loop of loops) {
    const shape = new THREE.Shape(loop.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    const top = new THREE.Mesh(g, topMat);
    top.receiveShadow = true;
    group.add(top);

    // Skirt: grass lip -> rock/sand slope down under the water.
    const pos = [], col = [];
    const grassLip = new THREE.Color(PAL.grassDark);
    const rock = new THREE.Color(0xb8a58a), rockDark = new THREE.Color(0x8f7d66);
    const sand = new THREE.Color(PAL.sand), sandWet = new THREE.Color(0xd8bf86);
    const n = loop.length;
    const ring = loop.map(([x, z]) => {
      const e = 0.2;
      let gx = sdf(x + e, z) - sdf(x - e, z), gz = sdf(x, z + e) - sdf(x, z - e);
      const gl = Math.hypot(gx, gz) || 1;
      gx /= gl; gz /= gl;
      const b = beachFn(x, z);
      return { x, z, gx, gz, b };
    });
    const levels = (p) => {
      const out = p.b > 0.5 ? 4.5 : 0.7;
      return [
        [p.x, 0, p.z],
        [p.x + p.gx * 0.08, -0.25, p.z + p.gz * 0.08],
        [p.x + p.gx * out * 0.55, -1.7, p.z + p.gz * out * 0.55],
        [p.x + p.gx * out, -3.4, p.z + p.gz * out],
      ];
    };
    const colors = (p) =>
      p.b > 0.5 ? [sand, sand, sandWet, sandWet] : [grassLip, rock, rockDark, rockDark];
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n];
      const la = levels(a), lb = levels(b);
      const ca = colors(a), cb = colors(b);
      for (let k = 0; k < 3; k++) {
        const quad = [la[k], lb[k], lb[k + 1], la[k], lb[k + 1], la[k + 1]];
        const qc = [ca[k], cb[k], cb[k + 1], ca[k], cb[k + 1], ca[k + 1]];
        for (let q = 0; q < 6; q++) {
          pos.push(...quad[q]);
          col.push(qc[q].r, qc[q].g, qc[q].b);
        }
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    sg.computeVertexNormals();
    const side = new THREE.Mesh(sg, sideMat);
    side.receiveShadow = true;
    group.add(side);
  }
  scene.add(group);

  // SDF texture for water foam (distance to the *waterline*).
  const TS = 256;
  const W = bounds.maxX - bounds.minX + 40, D = bounds.maxZ - bounds.minZ + 40;
  const ox = bounds.minX - 20, oz = bounds.minZ - 20;
  const data = new Uint8Array(TS * TS * 4);
  for (let j = 0; j < TS; j++) {
    for (let i = 0; i < TS; i++) {
      const x = ox + ((i + 0.5) / TS) * W;
      const z = oz + ((j + 0.5) / TS) * D;
      let d = sdf(x, z);
      d -= beachFn(x, z) > 0.5 ? 2.4 : 0.35;
      let pdm = 40;
      for (const p of opts.piers || []) {
        const qx = Math.abs(x - (p.minX + p.maxX) / 2) - (p.maxX - p.minX) / 2;
        const qz = Math.abs(z - (p.minZ + p.maxZ) / 2) - (p.maxZ - p.minZ) / 2;
        const pd = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
        pdm = Math.min(pdm, pd);
      }
      const v = Math.max(0, Math.min(255, Math.round(((d + 4) / 36) * 255)));
      const pv = Math.max(0, Math.min(255, Math.round(((pdm + 4) / 36) * 255)));
      const k = (j * TS + i) * 4;
      data[k] = v; data[k + 1] = pv; data[k + 2] = 0; data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, TS, TS, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const water = makeOcean(tex, { ox, oz, W, D });
  scene.add(water);
  return { group, water, sdf };
}

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
`;

function makeOcean(tex, { ox, oz, W, D }) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uSdf: { value: tex },
      uOrigin: { value: new THREE.Vector2(ox, oz) },
      uSize: { value: new THREE.Vector2(W, D) },
      uDeep: { value: new THREE.Color(0x1b6fc2) },
      uMid: { value: new THREE.Color(0x2ea8d8) },
      uShallow: { value: new THREE.Color(0x6fe0e0) },
    },
  ]);
  uniforms.uTime = G.uTime;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vW;
      uniform float uTime;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += sin(wp.x * 0.15 + uTime * 0.9) * 0.05 + cos(wp.z * 0.12 + uTime * 0.7) * 0.05;
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uSdf;
      uniform vec2 uOrigin, uSize;
      uniform vec3 uDeep, uMid, uShallow;
      uniform float uTime;
      varying vec3 vW;
      ${NOISE}
      void main() {
        vec2 uv = (vW.xz - uOrigin) / uSize;
        vec4 tx = texture2D(uSdf, uv);
        float d = tx.r * 36.0 - 4.0;
        float dp = tx.g * 36.0 - 4.0;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { d = 40.0; dp = 40.0; }
        vec3 col = mix(uShallow, uMid, smoothstep(0.0, 5.0, d));
        col = mix(col, uDeep, smoothstep(8.0, 30.0, d));
        // Wind Waker style wobbly highlight lines in open water.
        vec2 p = vW.xz * 0.11;
        float n = vnoise(p + vec2(uTime * 0.06, uTime * 0.04)) + 0.5 * vnoise(p * 2.3 - vec2(uTime * 0.05, 0.0));
        float band = abs(fract(n * 2.2) - 0.5);
        float line = 1.0 - smoothstep(0.02, 0.05, band);
        col = mix(col, vec3(1.0), line * 0.55 * smoothstep(2.0, 6.0, d));
        // Shore foam: solid edge + travelling rings.
        float wob = vnoise(vW.xz * 0.6 + uTime * 0.3) * 0.35;
        float edge = 1.0 - smoothstep(0.25 + wob, 0.45 + wob, d);
        edge = max(edge, 1.0 - smoothstep(0.05 + wob * 0.4, 0.25 + wob * 0.4, dp));
        float ring = fract(d * 0.45 - uTime * 0.22);
        float rings = smoothstep(0.86, 0.9, ring) * (1.0 - smoothstep(0.86, 0.98, ring) * 0.0) * (1.0 - smoothstep(1.0, 4.5, d));
        rings *= step(0.5, vnoise(vW.xz * 0.35 + uTime * 0.1) + 0.3);
        col = mix(col, vec3(1.0), max(edge, rings * 0.9));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(600, 600, 60, 60);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WATER_Y;
  mesh.name = 'ocean';
  return mesh;
}

export function makePoolWaterMaterial(color = 0x4fd8e8) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: G.uTime, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vW;
      ${NOISE}
      void main() {
        vec2 p = vW.xz * 0.9;
        float n = vnoise(p + uTime * 0.35) + vnoise(p * 1.7 - uTime * 0.3);
        float band = abs(fract(n * 1.6) - 0.5);
        float line = 1.0 - smoothstep(0.03, 0.07, band);
        vec3 col = mix(uColor, vec3(1.0), line * 0.7);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return mat;
}

export function buildSky(scene) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#5fb6f0');
  grd.addColorStop(0.55, '#a9dcf7');
  grd.addColorStop(1, '#e6f6ff');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
  scene.fog = new THREE.Fog(0xbfe6fa, 70, 170);

  // Puffy clouds far out at sea.
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient });
  const shade = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const geo = new THREE.SphereGeometry(1, 12, 8);
  const clouds = new THREE.Group();
  const rr = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 14; i++) {
    const cg = new THREE.Group();
    const n = 4 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(geo, k % 3 === 0 ? shade : mat);
      const s = rr(2.5, 5);
      m.scale.set(s * 1.3, s * 0.8, s);
      m.position.set(k * 3 - n * 1.5 + rr(-1, 1), rr(0, 1.5), rr(-1.5, 1.5));
      cg.add(m);
    }
    const a = (i / 14) * Math.PI * 2;
    const R = rr(95, 140);
    cg.position.set(Math.cos(a) * R, rr(10, 22), Math.sin(a) * R);
    cg.rotation.y = rr(0, 6);
    cg.userData.speed = rr(0.3, 0.8);
    clouds.add(cg);
  }
  scene.add(clouds);
  return clouds;
}
