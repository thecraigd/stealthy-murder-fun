// Procedural chibi characters: every character is ONE skinned mesh (rigid
// skinning onto a tiny skeleton) + one outline hull sharing that skeleton, so
// a crowd of 40 costs ~80 draw calls. All animation is procedural.
import * as THREE from 'three';
import { makeCharMaterial, makeOutlineMaterial, makeXrayMaterial } from '../core/materials.js';
import { linColor } from '../core/geo.js';
import { damp, clamp, lerp } from '../core/util.js';

const B = {
  root: 0, hips: 1, spine: 2, head: 3, armL: 4, armR: 5, handL: 6, handR: 7,
  legL: 8, legR: 9, eyes: 10, eyesX: 11, browL: 12, browR: 13, mouth: 14, coat: 15,
};
const BONE_COUNT = 16;
export const BONES = B;

const charMat = makeCharMaterial();
const outlineMat = makeOutlineMaterial();

// Cached primitive geometries.
// Kept deliberately low-poly: every character is drawn three times
// (body, ink outline, shadow) and there are ~45 of them.
const P = {
  sphere: new THREE.SphereGeometry(0.5, 12, 9),
  sphereLo: new THREE.SphereGeometry(0.5, 7, 5),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  torus: new THREE.TorusGeometry(0.5, 0.1, 5, 12),
  capsule: (r, len) => new THREE.CapsuleGeometry(r, len, 3, 8),
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _s = new THREE.Vector3();
const _nm = new THREE.Matrix3();

class SkinBuf {
  constructor() {
    this.pos = []; this.nor = []; this.col = []; this.idx = []; this.si = []; this.sw = []; this.ow = [];
    this.count = 0;
  }
  add(src, x, y, z, sx, sy, sz, color, bone, rx = 0, ry = 0, rz = 0, ow = 1) {
    _q.setFromEuler(_e.set(rx, ry, rz));
    _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    _nm.getNormalMatrix(_m);
    const p = src.attributes.position, n = src.attributes.normal;
    const c = linColor(color);
    const base = this.count;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(_m);
      this.pos.push(_v.x, _v.y, _v.z);
      _n.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize();
      this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(c.r, c.g, c.b);
      this.si.push(bone, 0, 0, 0);
      this.sw.push(1, 0, 0, 0);
      this.ow.push(ow);
    }
    const ia = src.index.array;
    for (let i = 0; i < ia.length; i++) this.idx.push(ia[i] + base);
    this.count += p.count;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute('ow', new THREE.Float32BufferAttribute(this.ow, 1));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.6);
    return g;
  }
}

const lathe = (pts, seg = 11) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

function darken(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return c.getHex();
}

// Body dimensions derived from a spec.
function dims(body) {
  const h = body.height ?? 1;
  const girth = body.girth ?? 1;
  const head = body.head ?? 1;
  const legLen = 0.34 * h * (body.legs ?? 1);
  const hipY = legLen + 0.05;
  const torsoH = 0.42 * h * (body.torso ?? 1);
  const headR = 0.25 * head;
  const shoulderX = 0.17 * girth + 0.035;
  const armLen = 0.34 * h * (body.arms ?? 1);
  return { h, girth, head, legLen, hipY, torsoH, headR, shoulderX, armLen, belly: body.belly ?? 0, chest: body.chest ?? 0 };
}

function buildGeometry(body, outfit) {
  const d = dims(body);
  const b = new SkinBuf();
  const skin = body.skin ?? 0xffd6ae;
  const skinD = darken(skin, 0.86);
  const top = outfit.top ?? 0x445566;
  const pants = outfit.pants ?? 0x333344;
  const shoes = outfit.barefoot ? skin : outfit.shoes ?? 0x3a2a22;
  const hipY = d.hipY;
  const g = d.girth;

  // ---- Torso (bone: spine). Local spine origin is at hips height. -----------
  const bl = d.belly;
  const ch = d.chest;
  const tH = d.torsoH;
  const torsoPts = [
    [0.0, -0.03],
    [0.15 * g, -0.02],
    [0.165 * g + bl * 0.06, tH * 0.18],
    [0.17 * g + bl * 0.11 + ch * 0.02, tH * 0.42],
    [0.175 * g + bl * 0.06 + ch * 0.05, tH * 0.7],
    [0.16 * g + ch * 0.04, tH * 0.9],
    [0.1 * g, tH * 1.0],
    [0.0, tH * 1.02],
  ];
  const torsoGeo = lathe(torsoPts);
  const zs = 0.82 + bl * 0.15;
  b.add(torsoGeo, 0, hipY, 0, 1, 1, zs, top, B.spine);
  // Shirt front / lapels / tie.
  const frontZ = (0.17 * g + bl * 0.08) * zs;
  if (outfit.shirt != null) {
    b.add(P.cone, 0, hipY + tH * 0.72, frontZ - 0.012, 0.13 * g, tH * 0.5, 0.03, outfit.shirt, B.spine, Math.PI, 0, 0);
  }
  if (outfit.tie != null) {
    b.add(P.box, 0, hipY + tH * 0.66, frontZ + 0.012, 0.045, tH * 0.42, 0.02, outfit.tie, B.spine);
  }
  if (outfit.bowtie != null) {
    b.add(P.sphere, 0.035, hipY + tH * 0.9, frontZ - 0.02, 0.06, 0.045, 0.03, outfit.bowtie, B.spine);
    b.add(P.sphere, -0.035, hipY + tH * 0.9, frontZ - 0.02, 0.06, 0.045, 0.03, outfit.bowtie, B.spine);
  }
  if (outfit.vest != null) {
    b.add(lathe(torsoPts.slice(1, 6).map(([r, y]) => [r * 1.03, y])), 0, hipY, 0, 1, 1, zs * 1.02, outfit.vest, B.spine);
  }
  if (outfit.buttons != null) {
    for (let i = 0; i < 3; i++) b.add(P.sphereLo, 0, hipY + tH * (0.25 + i * 0.17), frontZ + 0.005, 0.028, 0.028, 0.02, outfit.buttons, B.spine, 0, 0, 0, 0);
  }
  if (outfit.badge != null) {
    b.add(P.sphereLo, 0.09 * g, hipY + tH * 0.72, frontZ - 0.01, 0.045, 0.05, 0.02, outfit.badge, B.spine);
  }
  if (outfit.stripe != null) {
    b.add(lathe([[0.172 * g + bl * 0.1, 0], [0.176 * g + bl * 0.1, 0.06 * tH]]), 0, hipY + tH * 0.45, 0, 1, 1, zs * 1.01, outfit.stripe, B.spine);
  }
  if (outfit.apron != null) {
    b.add(P.box, 0, hipY + tH * 0.3, frontZ + 0.01, 0.26 * g, tH * 0.8, 0.02, outfit.apron, B.spine);
  }
  if (outfit.scarf != null) {
    b.add(P.torus, 0, hipY + tH * 0.98, 0, 0.32 * g, 0.32 * g, 0.9, outfit.scarf, B.spine, Math.PI / 2, 0, 0);
    b.add(P.box, 0.06, hipY + tH * 0.72, frontZ + 0.02, 0.07, tH * 0.38, 0.03, outfit.scarf, B.spine, 0, 0, 0.12);
  }
  if (outfit.pearls != null) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI - Math.PI;
      b.add(P.sphereLo, Math.cos(a) * 0.09, hipY + tH * 0.94 + Math.sin(a) * 0.05, 0.1 * g + Math.sin(-a) * 0.02, 0.03, 0.03, 0.03, outfit.pearls, B.spine);
    }
  }
  if (outfit.chain != null) {
    b.add(P.torus, 0, hipY + tH * 0.88, 0.03, 0.26 * g, 0.24, 0.6, outfit.chain, B.spine, Math.PI / 2 - 0.5, 0, 0);
  }
  if (outfit.straps != null) {
    b.add(P.box, 0.08 * g, hipY + tH * 0.55, frontZ - 0.005, 0.04, tH * 0.85, 0.02, outfit.straps, B.spine);
    b.add(P.box, -0.08 * g, hipY + tH * 0.55, frontZ - 0.005, 0.04, tH * 0.85, 0.02, outfit.straps, B.spine);
  }
  if (outfit.vestHi != null) {
    // hi-vis vest
    b.add(lathe(torsoPts.slice(1, 6).map(([r, y]) => [r * 1.035, y])), 0, hipY, 0, 1, 1, zs * 1.03, outfit.vestHi, B.spine);
    b.add(lathe([[0.18 * g, 0], [0.183 * g, 0.04]]), 0, hipY + tH * 0.4, 0, 1, 1, zs * 1.05, 0xf4f4f4, B.spine);
  }

  // Coat: upper on spine, tails on coat bone (child of hips).
  if (outfit.coat != null) {
    const cpts = torsoPts.slice(1, 7).map(([r, y]) => [r * 1.06 + 0.012, y]);
    b.add(lathe(cpts), 0, hipY, 0, 1, 1, zs * 1.05, outfit.coat, B.spine);
    const tail = lathe([
      [0.0, 0.02], [0.19 * g + bl * 0.08, 0.02], [0.2 * g + bl * 0.06, -0.08], [0.23 * g, -0.24], [0.25 * g, -0.3], [0.0, -0.3],
    ]);
    b.add(tail, 0, hipY + 0.04, 0, 1, 1, zs * 1.05, outfit.coat, B.coat);
    if (outfit.coatBelt != null) b.add(lathe([[0.2 * g + bl * 0.08, 0], [0.2 * g + bl * 0.08, 0.035]]), 0, hipY + 0.02, 0, 1, 1, zs * 1.08, outfit.coatBelt, B.spine);
  }

  // Dress / skirt on coat bone.
  if (outfit.dress != null) {
    const len = outfit.dressLen ?? 0.95;
    const dl = hipY * len;
    const dress = lathe([[0.0, 0.03], [0.17 * g, 0.03], [0.2 * g, -dl * 0.3], [0.26 * g, -dl * 0.75], [0.3 * g, -dl], [0.0, -dl]]);
    b.add(dress, 0, hipY + 0.03, 0, 1, 1, 0.9, outfit.dress, B.coat);
  }

  // Hips (pants) on hips bone.
  b.add(P.sphere, 0, hipY + 0.01, 0, 0.33 * g + bl * 0.05, 0.16, (0.29 * g + bl * 0.05) * 0.95, pants, B.hips);
  if (outfit.belt != null) {
    b.add(lathe([[0.168 * g + bl * 0.06, 0], [0.168 * g + bl * 0.06, 0.04]]), 0, hipY + 0.04, 0, 1, 1, zs * 1.02, outfit.belt, B.spine);
  }

  // ---- Legs ------------------------------------------------------------------
  const legR = 0.075 * (0.8 + 0.2 * g);
  const legGeo = P.capsule(legR, d.legLen - legR);
  const legColor = outfit.bareLegs ? skin : outfit.legs ?? pants;
  for (const side of [1, -1]) {
    const lx = side * 0.095 * (0.75 + 0.25 * g);
    const bone = side > 0 ? B.legL : B.legR;
    b.add(legGeo, lx, hipY - d.legLen / 2, 0, 1, 1, 1, legColor, bone);
    b.add(P.sphere, lx, 0.045, 0.035, 0.13, 0.09, 0.2, shoes, bone);
  }

  // ---- Arms ----------------------------------------------------------------------
  const armR = 0.06 * (0.75 + 0.25 * g) * (body.armThick ?? 1);
  const shoulderY = hipY + tH * 0.86;
  const sleeves = outfit.sleeves ?? 'long';
  const armColor = outfit.arms ?? (outfit.coat ?? top);
  for (const side of [1, -1]) {
    const ax = side * d.shoulderX;
    const bone = side > 0 ? B.armL : B.armR;
    const hand = side > 0 ? B.handL : B.handR;
    const al = d.armLen;
    if (sleeves === 'long') {
      b.add(P.capsule(armR, al - armR * 2), ax, shoulderY - al / 2 + armR * 0.5, 0, 1, 1, 1, armColor, bone);
    } else if (sleeves === 'short') {
      b.add(P.capsule(armR * 1.15, al * 0.3), ax, shoulderY - al * 0.18, 0, 1, 1, 1, armColor, bone);
      b.add(P.capsule(armR * 0.92, al - armR * 2), ax, shoulderY - al / 2 + armR * 0.5, 0, 1, 1, 1, skin, bone);
    } else {
      b.add(P.capsule(armR, al - armR * 2), ax, shoulderY - al / 2 + armR * 0.5, 0, 1, 1, 1, skin, bone);
    }
    // shoulder pad keeps silhouette round
    b.add(P.sphere, ax * 0.92, shoulderY, 0, armR * 2.4, armR * 2.4, armR * 2.4, sleeves === 'none' ? skin : armColor, bone);
    b.add(P.sphere, ax, shoulderY - al + 0.01, 0, 0.13, 0.13, 0.13, outfit.gloves ?? skin, hand);
  }

  // ---- Head ------------------------------------------------------------------------
  const hr = d.headR;
  const neckY = hipY + tH;
  const hy = neckY + hr * 0.92;
  b.add(P.capsule(0.06, 0.06), 0, neckY + 0.02, 0, 1, 1, 1, skin, B.head);
  b.add(P.sphere, 0, hy, 0, hr * 2.04, hr * 1.96, hr * 1.96, skin, B.head);
  // ears
  b.add(P.sphereLo, hr * 0.98, hy - 0.01, -0.01, 0.07, 0.1, 0.06, skin, B.head);
  b.add(P.sphereLo, -hr * 0.98, hy - 0.01, -0.01, 0.07, 0.1, 0.06, skin, B.head);
  // nose
  b.add(P.sphereLo, 0, hy - hr * 0.12, hr * 0.97, 0.07 * (body.nose ?? 1), 0.06 * (body.nose ?? 1), 0.06 * (body.nose ?? 1), skinD, B.head);
  if (body.cheeks) {
    b.add(P.sphereLo, hr * 0.55, hy - hr * 0.22, hr * 0.78, 0.07, 0.04, 0.03, 0xff9a9a, B.head, 0, 0, 0, 0);
    b.add(P.sphereLo, -hr * 0.55, hy - hr * 0.22, hr * 0.78, 0.07, 0.04, 0.03, 0xff9a9a, B.head, 0, 0, 0, 0);
  }
  // eyes (whites + pupils) on eye bone (pivot at eye height)
  const ey = hy + hr * 0.08;
  const ex = hr * 0.36;
  const ez = hr * 0.86;
  const eyeW = 0.075 * (body.eyeSize ?? 1);
  const eyeH = 0.095 * (body.eyeSize ?? 1);
  for (const side of [1, -1]) {
    b.add(P.sphereLo, side * ex, ey, ez, eyeW, eyeH, 0.05, 0xffffff, B.eyes, 0, 0, 0, 0.55);
    b.add(P.sphereLo, side * ex * 0.97, ey - 0.004, ez + 0.022, eyeW * 0.58, eyeH * 0.62, 0.03, body.eyeColor ?? 0x241c2c, B.eyes, 0, 0, 0, 0);
    b.add(P.sphereLo, side * ex * 0.97 + 0.01, ey + 0.012, ez + 0.037, 0.014, 0.016, 0.008, 0xffffff, B.eyes, 0, 0, 0, 0);
    // X eyes (KO)
    b.add(P.box, side * ex, ey, ez + 0.02, 0.085, 0.018, 0.02, 0x241c2c, B.eyesX, 0, 0, 0.78, 0);
    b.add(P.box, side * ex, ey, ez + 0.02, 0.085, 0.018, 0.02, 0x241c2c, B.eyesX, 0, 0, -0.78, 0);
  }
  // brows
  const hairColor = body.hairColor ?? 0x3a2a20;
  const browColor = body.browColor ?? darken(hairColor, 0.9);
  const browY = ey + eyeH * 0.75;
  b.add(P.box, ex, browY, ez + 0.01, 0.075 * (body.brow ?? 1), 0.018 * (body.brow ?? 1) + 0.004, 0.02, browColor, B.browL, 0, 0, 0, 0.2);
  b.add(P.box, -ex, browY, ez + 0.01, 0.075 * (body.brow ?? 1), 0.018 * (body.brow ?? 1) + 0.004, 0.02, browColor, B.browR, 0, 0, 0, 0.2);
  // mouth
  b.add(P.sphereLo, 0, hy - hr * 0.42, hr * 0.85, 0.06, 0.02, 0.02, 0x7a2f3a, B.mouth, 0, 0, 0, 0);

  // Facial hair
  const fh = body.facial;
  if (fh === 'stubble') {
    b.add(P.sphere, 0, hy - hr * 0.33, hr * 0.12, hr * 1.82, hr * 1.1, hr * 1.7, darken(skin, 0.78), B.head);
  } else if (fh === 'beard') {
    b.add(P.sphere, 0, hy - hr * 0.52, hr * 0.38, hr * 1.5, hr * 1.1, hr * 1.25, hairColor, B.head);
  } else if (fh === 'mustache' || fh === 'curly') {
    const curl = fh === 'curly' ? 0.25 : 0;
    b.add(P.sphereLo, 0.05, hy - hr * 0.27, hr * 0.94, 0.1, 0.04, 0.05, hairColor, B.head, 0, 0, -0.25 - curl);
    b.add(P.sphereLo, -0.05, hy - hr * 0.27, hr * 0.94, 0.1, 0.04, 0.05, hairColor, B.head, 0, 0, 0.25 + curl);
    if (curl) {
      b.add(P.sphereLo, 0.105, hy - hr * 0.2, hr * 0.86, 0.035, 0.035, 0.035, hairColor, B.head);
      b.add(P.sphereLo, -0.105, hy - hr * 0.2, hr * 0.86, 0.035, 0.035, 0.035, hairColor, B.head);
    }
  } else if (fh === 'goatee') {
    b.add(P.sphereLo, 0, hy - hr * 0.62, hr * 0.85, 0.07, 0.08, 0.05, hairColor, B.head);
  }

  // Hair (simplified when a hat is worn).
  const hat = outfit.hat;
  let hair = body.hair ?? 'short';
  if (hat && hat !== 'headband' && ['messy', 'pompadour', 'curly', 'bun'].includes(hair)) hair = 'short';
  if (hat && hair === 'beehive') hair = 'long';
  const cap = (s = 1.03) => b.add(P.sphere, 0, hy + hr * 0.14, -hr * 0.1, hr * 2.08 * s, hr * 1.9 * s, hr * 2.0 * s, hairColor, B.head);
  switch (hair) {
    case 'short':
      cap();
      break;
    case 'buzz':
      b.add(P.sphere, 0, hy + hr * 0.1, -hr * 0.06, hr * 2.07, hr * 1.95, hr * 2.0, hairColor, B.head);
      break;
    case 'messy':
      cap();
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + i * 0.3;
        b.add(P.cone, Math.sin(a) * hr * 0.6, hy + hr * 0.88, hr * 0.2 + Math.cos(a) * hr * 0.25, 0.11, 0.17, 0.11, hairColor, B.head, 0.6 + (i % 2) * 0.3, 0, -a * 0.6);
      }
      b.add(P.sphere, hr * 0.3, hy + hr * 0.62, hr * 0.55, 0.16, 0.1, 0.12, hairColor, B.head, 0, 0, -0.5);
      break;
    case 'pompadour':
      cap();
      b.add(P.sphere, 0, hy + hr * 0.85, hr * 0.42, hr * 1.4, hr * 0.85, hr * 0.9, hairColor, B.head, -0.3, 0, 0);
      break;
    case 'bun':
      cap();
      b.add(P.sphere, 0, hy + hr * 1.12, -hr * 0.35, 0.2, 0.2, 0.2, hairColor, B.head);
      break;
    case 'ponytail':
      cap();
      b.add(P.sphere, 0, hy + hr * 0.1, -hr * 1.15, 0.14, 0.32, 0.14, hairColor, B.head, 0.4, 0, 0);
      break;
    case 'long':
      cap();
      b.add(P.sphere, 0, hy - hr * 0.35, -hr * 0.45, hr * 2.0, hr * 2.0, hr * 1.4, hairColor, B.head);
      break;
    case 'beehive':
      cap();
      b.add(P.sphere, 0, hy + hr * 1.35, -hr * 0.15, hr * 1.6, hr * 2.4, hr * 1.6, hairColor, B.head);
      b.add(P.torus, 0, hy + hr * 0.75, -hr * 0.1, hr * 1.6, hr * 1.6, 1.2, outfit.hairband ?? 0xe0453a, B.head, Math.PI / 2, 0, 0);
      break;
    case 'curly':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.add(P.sphereLo, Math.cos(a) * hr * 0.75, hy + hr * 0.55 + Math.sin(i * 1.7) * 0.03, Math.sin(a) * hr * 0.7 - hr * 0.15, 0.2, 0.2, 0.2, hairColor, B.head);
      }
      b.add(P.sphere, 0, hy + hr * 0.75, -hr * 0.1, hr * 1.5, hr * 0.9, hr * 1.5, hairColor, B.head);
      break;
    case 'bald':
    default:
      if (hair === 'bald' && body.fringe) {
        b.add(P.sphere, 0, hy, -hr * 0.3, hr * 2.08, hr * 1.2, hr * 1.7, hairColor, B.head);
      }
      break;
  }

  // Hats
  const hc = outfit.hatColor ?? 0x2c3e6b;
  const hc2 = outfit.hatColor2 ?? 0x222222;
  const topY = hy + hr * 0.82;
  switch (hat) {
    case 'cap': // guard cap
      b.add(P.cyl, 0, topY + 0.02, 0, hr * 2.15, 0.12, hr * 2.15, hc, B.head);
      b.add(P.sphere, 0, topY + 0.08, 0, hr * 2.15, 0.12, hr * 2.15, hc, B.head);
      b.add(P.box, 0, topY - 0.03, hr * 0.95, hr * 1.5, 0.025, hr * 0.7, hc2, B.head, 0.15, 0, 0);
      b.add(P.sphereLo, 0, topY + 0.04, hr * 1.04, 0.07, 0.07, 0.03, outfit.hatBadge ?? 0xf2c14e, B.head);
      break;
    case 'toque':
      b.add(P.cyl, 0, topY + 0.1, 0, hr * 1.7, 0.24, hr * 1.7, 0xffffff, B.head);
      b.add(P.sphere, 0, topY + 0.3, 0, hr * 2.2, hr * 1.3, hr * 2.2, 0xffffff, B.head);
      break;
    case 'cookcap':
      b.add(P.cyl, 0, topY + 0.03, 0, hr * 2.0, 0.12, hr * 2.0, 0xffffff, B.head);
      break;
    case 'tophat':
      b.add(P.cyl, 0, topY + 0.01, 0, hr * 2.6, 0.03, hr * 2.6, hc, B.head);
      b.add(P.cyl, 0, topY + 0.2, 0, hr * 1.55, 0.38, hr * 1.55, hc, B.head);
      b.add(P.cyl, 0, topY + 0.07, 0, hr * 1.58, 0.07, hr * 1.58, hc2, B.head);
      break;
    case 'hardhat':
      b.add(P.sphere, 0, topY - 0.02, 0, hr * 2.2, hr * 1.5, hr * 2.2, hc, B.head);
      b.add(P.cyl, 0, topY - 0.06, 0.02, hr * 2.6, 0.03, hr * 2.6, hc, B.head);
      break;
    case 'sunhat':
      b.add(P.cyl, 0, topY - 0.02, 0, hr * 3.6, 0.03, hr * 3.6, hc, B.head);
      b.add(P.sphere, 0, topY + 0.02, 0, hr * 1.9, hr * 1.3, hr * 1.9, hc, B.head);
      b.add(P.cyl, 0, topY + 0.0, 0, hr * 1.95, 0.05, hr * 1.95, hc2, B.head);
      break;
    case 'beanie':
      b.add(P.sphere, 0, topY - 0.03, -0.01, hr * 2.2, hr * 1.6, hr * 2.2, hc, B.head);
      b.add(P.sphereLo, 0, topY + 0.15, -0.02, 0.1, 0.1, 0.1, hc2, B.head);
      break;
    case 'bucket':
      b.add(P.cone, 0, topY + 0.02, 0, hr * 2.9, 0.16, hr * 2.9, hc, B.head);
      b.add(P.cyl, 0, topY + 0.05, 0, hr * 1.9, 0.14, hr * 1.9, hc, B.head);
      break;
    case 'captain':
      b.add(P.cyl, 0, topY + 0.03, 0, hr * 2.25, 0.13, hr * 2.25, 0xffffff, B.head);
      b.add(P.cyl, 0, topY - 0.02, 0, hr * 2.1, 0.06, hr * 2.1, hc, B.head);
      b.add(P.box, 0, topY - 0.04, hr * 0.95, hr * 1.4, 0.025, hr * 0.6, 0x222222, B.head, 0.15, 0, 0);
      break;
    case 'beret':
      b.add(P.sphere, -0.04, topY + 0.0, -0.02, hr * 2.3, hr * 0.7, hr * 2.2, hc, B.head, 0, 0, 0.2);
      break;
    case 'headband':
      b.add(P.torus, 0, hy + hr * 0.45, 0, hr * 2.05, hr * 2.05, 0.55, hc, B.head, Math.PI / 2, 0, 0, 0.5);
      break;
    case 'maid':
      b.add(P.box, 0, topY + 0.01, hr * 0.3, hr * 1.7, 0.08, 0.05, 0xffffff, B.head, -0.3, 0, 0);
      break;
    case 'goggles':
      b.add(P.torus, 0, hy + hr * 0.5, 0, hr * 2.05, hr * 2.05, 1.2, 0x222222, B.head, Math.PI / 2, 0, 0);
      b.add(P.sphereLo, 0.08, hy + hr * 0.6, hr * 0.9, 0.13, 0.1, 0.06, 0x7fd8ff, B.head);
      b.add(P.sphereLo, -0.08, hy + hr * 0.6, hr * 0.9, 0.13, 0.1, 0.06, 0x7fd8ff, B.head);
      break;
    case 'swimcap':
      b.add(P.sphere, 0, hy + hr * 0.14, -hr * 0.05, hr * 2.12, hr * 1.95, hr * 2.05, hc, B.head);
      break;
    default:
      break;
  }

  // Accessories
  const acc = new Set([...(body.acc ?? []), ...(outfit.acc ?? [])]);
  if (acc.has('monocle')) {
    b.add(P.torus, ex, ey, ez + 0.05, 0.11, 0.11, 0.3, 0xf2c14e, B.head);
  }
  if (acc.has('glasses') || acc.has('cateye')) {
    const col = acc.has('cateye') ? 0xd83a7a : 0x2a2430;
    for (const s of [1, -1]) b.add(P.torus, s * ex, ey, ez + 0.05, 0.12, 0.1, 0.3, col, B.head);
    b.add(P.box, 0, ey + 0.01, ez + 0.06, 0.06, 0.012, 0.01, col, B.head);
  }
  if (acc.has('shades')) {
    for (const s of [1, -1]) b.add(P.box, s * ex, ey, ez + 0.05, 0.1, 0.06, 0.02, 0x15121a, B.head);
    b.add(P.box, 0, ey + 0.015, ez + 0.055, 0.2, 0.014, 0.012, 0x15121a, B.head);
  }
  if (acc.has('earpiece')) {
    b.add(P.sphereLo, hr * 1.02, hy - 0.01, 0.0, 0.05, 0.05, 0.05, 0x1a1a1a, B.head);
    b.add(P.box, hr * 0.98, hy - 0.08, -0.03, 0.012, 0.12, 0.012, 0x1a1a1a, B.head, 0.3, 0, 0);
  }
  if (acc.has('bandage')) {
    b.add(P.box, 0.015, hy - hr * 0.06, hr * 1.0, 0.11, 0.035, 0.02, 0xfff0d0, B.head, 0, 0, 0.35, 0.4);
  }
  if (acc.has('scar')) {
    b.add(P.box, -ex - 0.01, ey - 0.02, ez + 0.03, 0.012, 0.12, 0.01, 0xc06060, B.head, 0, 0, 0.3, 0);
  }
  if (acc.has('lipstick')) {
    b.add(P.sphereLo, 0, hy - hr * 0.42, hr * 0.87, 0.065, 0.028, 0.02, 0xd8264a, B.mouth, 0, 0, 0, 0);
  }
  if (acc.has('lashes')) {
    for (const s of [1, -1]) b.add(P.box, s * (ex + 0.035), ey + eyeH * 0.42, ez + 0.02, 0.04, 0.012, 0.012, 0x15121a, B.eyes, 0, 0, s * 0.5, 0);
  }

  return b.build();
}

// ---------------------------------------------------------------------------------
// Pose helpers
const POSE_KEYS = [
  'hipsY', 'hipsRX', 'hipsRZ', 'spineRX', 'spineRY', 'spineRZ', 'headRX', 'headRY', 'headRZ',
  'armLX', 'armLY', 'armLZ', 'armRX', 'armRY', 'armRZ', 'legLX', 'legRX', 'legLZ', 'legRZ',
  'rootRX', 'rootRZ', 'rootY', 'coatRX', 'spineSY',
];

function zeroPose(p = {}) {
  for (const k of POSE_KEYS) p[k] = 0;
  p.spineSY = 1;
  return p;
}

export class Character {
  constructor(spec) {
    this.spec = { body: { ...spec.body }, outfit: { ...spec.outfit } };
    this.group = new THREE.Group();
    this.group.name = spec.name || 'char';
    this.d = dims(this.spec.body);

    // Skeleton
    this.bones = [];
    for (let i = 0; i < BONE_COUNT; i++) this.bones.push(new THREE.Bone());
    const bn = this.bones;
    const d = this.d;
    const parent = [
      -1, B.root, B.hips, B.spine, B.spine, B.spine, B.armL, B.armR, B.hips, B.hips,
      B.head, B.head, B.head, B.head, B.head, B.hips,
    ];
    const hr = d.headR;
    const hy = d.hipY + d.torsoH + hr * 0.92; // head centre (absolute)
    const ey = hy + hr * 0.08;
    const shoulderY = d.hipY + d.torsoH * 0.86;
    const abs = [
      [0, 0, 0], // root
      [0, d.hipY, 0], // hips
      [0, d.hipY, 0], // spine
      [0, d.hipY + d.torsoH, 0], // head (neck)
      [d.shoulderX, shoulderY, 0], // armL
      [-d.shoulderX, shoulderY, 0], // armR
      [d.shoulderX, shoulderY - d.armLen, 0], // handL
      [-d.shoulderX, shoulderY - d.armLen, 0], // handR
      [0.095, d.hipY, 0], // legL
      [-0.095, d.hipY, 0], // legR
      [0, ey, 0], // eyes
      [0, ey, 0], // eyesX
      [hr * 0.36, ey + 0.07, hr * 0.86], // browL
      [-hr * 0.36, ey + 0.07, hr * 0.86], // browR
      [0, hy - hr * 0.42, hr * 0.85], // mouth
      [0, d.hipY + 0.04, 0], // coat
    ];
    this.restPos = [];
    for (let i = 0; i < BONE_COUNT; i++) {
      const p = parent[i];
      const a = abs[i];
      const pa = p >= 0 ? abs[p] : [0, 0, 0];
      bn[i].position.set(a[0] - pa[0], a[1] - pa[1], a[2] - pa[2]);
      this.restPos.push(bn[i].position.clone());
      if (p >= 0) bn[p].add(bn[i]);
    }
    this.root = bn[B.root];
    this.group.add(this.root);
    this.group.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(bn);

    this._buildMeshes();

    this.pose = zeroPose();
    this.target = zeroPose();
    this.pose.hipsY = d.hipY;
    this.target.hipsY = d.hipY;
    this.phase = Math.random() * 10;
    this.time = Math.random() * 10;
    this.blinkT = 1 + Math.random() * 3;
    this.blink = 0;
    this.face = 'normal';
    this.talking = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.action = null; // one-shot overlay {name, t, dur}
    this.held = { L: null, R: null };
    this.xray = null;
    this.visibleFlag = true;
  }

  _buildMeshes() {
    const geo = buildGeometry(this.spec.body, this.spec.outfit);
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geo;
      this.outline.geometry = geo;
      if (this.xray) this.xray.geometry = geo;
      return;
    }
    this.mesh = new THREE.SkinnedMesh(geo, charMat);
    this.mesh.renderOrder = 2;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    this.group.add(this.mesh);
    this.outline = new THREE.SkinnedMesh(geo, outlineMat);
    this.outline.renderOrder = 2;
    this.outline.frustumCulled = false;
    this.outline.bind(this.skeleton, new THREE.Matrix4());
    this.group.add(this.outline);
  }

  setOutfit(outfit) {
    this.spec.outfit = { ...outfit };
    this._buildMeshes();
  }

  setBody(body) {
    this.spec.body = { ...this.spec.body, ...body };
    this._buildMeshes();
  }

  setXray(color) {
    if (color == null) {
      if (this.xray) this.xray.visible = false;
      return;
    }
    if (!this.xray) {
      this.xrayMat = makeXrayMaterial(color, 0.6);
      this.xray = new THREE.SkinnedMesh(this.mesh.geometry, this.xrayMat);
      this.xray.frustumCulled = false;
      this.xray.renderOrder = 1;
      this.xray.bind(this.skeleton, new THREE.Matrix4());
      this.group.add(this.xray);
    }
    this.xrayMat.color.set(color);
    this.xray.visible = true;
  }

  hold(side, obj) {
    const bone = this.bones[side === 'L' ? B.handL : B.handR];
    if (this.held[side]) bone.remove(this.held[side]);
    this.held[side] = obj || null;
    if (obj) bone.add(obj);
  }

  play(name, dur = 0.4) {
    this.action = { name, t: 0, dur };
  }

  setFace(f) {
    this.face = f;
  }

  // anim: {state, speed, ...}
  update(dt, anim, cheap = false) {
    this.time += dt;
    const st = anim.state || 'idle';
    const sp = anim.speed || 0;
    const t = this.target;
    const d = this.d;
    zeroPose(t);
    t.hipsY = d.hipY;

    // Locomotion phase driven by real speed so feet don't skate.
    const stride = st === 'run' || st === 'panic' ? 0.9 : st === 'sneak' ? 0.42 : 0.6;
    this.phase += (sp / stride) * dt * Math.PI;
    const ph = this.phase;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const moveAmt = clamp(sp / 1.2, 0, 1);
    const breathe = Math.sin(this.time * 2.2) * 0.012;

    switch (st) {
      case 'idle':
      default:
        t.spineSY = 1 + breathe;
        t.armLZ = 0.08; t.armRZ = -0.08;
        t.headRY = Math.sin(this.time * 0.5) * 0.15;
        break;
      case 'walk': {
        t.legLX = s * 0.55 * moveAmt; t.legRX = -s * 0.55 * moveAmt;
        t.armLX = -s * 0.45 * moveAmt; t.armRX = s * 0.45 * moveAmt;
        t.armLZ = 0.1; t.armRZ = -0.1;
        t.hipsY = d.hipY + Math.abs(c) * 0.035 * moveAmt;
        t.spineRY = s * 0.08 * moveAmt;
        t.spineRX = 0.05 * moveAmt;
        t.coatRX = -0.1 * moveAmt;
        break;
      }
      case 'run':
      case 'panic': {
        t.legLX = s * 0.95; t.legRX = -s * 0.95;
        t.hipsY = d.hipY + Math.abs(c) * 0.07;
        t.spineRX = 0.28;
        t.headRX = -0.18;
        t.coatRX = -0.45;
        if (st === 'panic') {
          t.armLX = -2.6 + s * 0.5; t.armRX = -2.6 - s * 0.5;
          t.armLZ = 0.5; t.armRZ = -0.5;
          t.spineRX = 0.1;
        } else {
          t.armLX = -s * 1.0 - 0.2; t.armRX = s * 1.0 - 0.2;
          t.armLZ = 0.15; t.armRZ = -0.15;
        }
        t.spineRY = s * 0.12;
        break;
      }
      case 'sneak': {
        // Exaggerated cartoon tiptoe.
        const lift = moveAmt;
        t.hipsY = d.hipY - 0.1 + Math.abs(c) * 0.05 * lift;
        t.legLX = s * 0.8 * lift - 0.1; t.legRX = -s * 0.8 * lift - 0.1;
        t.spineRX = 0.42;
        t.headRX = -0.35;
        t.armLX = -1.05 + s * 0.25 * lift; t.armRX = -1.05 - s * 0.25 * lift;
        t.armLZ = 0.35; t.armRZ = -0.35;
        t.spineRY = s * 0.1 * lift;
        t.coatRX = -0.2;
        if (sp < 0.05) {
          t.spineSY = 1 + breathe;
          t.headRY = Math.sin(this.time * 1.3) * 0.35;
        }
        break;
      }
      case 'drag': {
        t.legLX = s * 0.5 * moveAmt; t.legRX = -s * 0.5 * moveAmt;
        t.hipsY = d.hipY - 0.05 + Math.abs(c) * 0.03 * moveAmt;
        t.spineRX = 0.5;
        t.armLX = 0.9; t.armRX = 0.9; t.armLZ = 0.15; t.armRZ = -0.15;
        t.headRX = -0.3;
        break;
      }
      case 'carry': {
        t.legLX = s * 0.5 * moveAmt; t.legRX = -s * 0.5 * moveAmt;
        t.armLX = -1.2; t.armRX = -1.2; t.armLZ = 0.2; t.armRZ = -0.2;
        break;
      }
      case 'ko':
      case 'dead':
      case 'dragged':
      case 'liedown': {
        t.rootRX = -Math.PI / 2;
        t.rootY = 0.16 * (d.girth * 0.6 + 0.4) + d.belly * 0.05;
        t.armLZ = 0.8; t.armRZ = -0.8;
        t.legLZ = 0.15; t.legRZ = -0.15;
        t.headRY = st === 'dead' ? 0.5 : 0.3;
        if (st === 'dragged') {
          t.armLX = -2.9; t.armRX = -2.9; t.armLZ = 0.2; t.armRZ = -0.2;
          t.headRY = Math.sin(this.time * 6) * 0.15;
        }
        if (st === 'liedown') {
          t.armLZ = 0.25; t.armRZ = -0.25; t.legLZ = 0.05; t.legRZ = -0.05; t.headRY = 0;
        }
        break;
      }
      case 'facedown': {
        t.rootRX = Math.PI / 2;
        t.rootY = 0.62;
        t.armLX = -2.8; t.armRX = -2.8; t.armLZ = 0.3; t.armRZ = -0.3;
        t.headRX = -0.6;
        break;
      }
      case 'bench': {
        t.rootRX = -Math.PI / 2;
        t.rootY = 0.6;
        const pump = (Math.sin(this.time * 2.4) * 0.5 + 0.5);
        t.armLX = -Math.PI / 2 - 0.0; t.armRX = -Math.PI / 2;
        t.armLZ = 0.4 - pump * 0.4; t.armRZ = -0.4 + pump * 0.4;
        t.legLX = -1.4; t.legRX = -1.4; t.legLZ = 0.3; t.legRZ = -0.3;
        break;
      }
      case 'sit': {
        t.hipsY = d.hipY - d.legLen * 0.62;
        t.legLX = -1.5; t.legRX = -1.5;
        t.legLZ = 0.06; t.legRZ = -0.06;
        t.armLX = -0.35; t.armRX = -0.35;
        t.spineSY = 1 + breathe;
        t.headRY = Math.sin(this.time * 0.4) * 0.2;
        break;
      }
      case 'tub': {
        t.hipsY = d.hipY - d.legLen * 0.62;
        t.legLX = -1.5; t.legRX = -1.5;
        t.armLZ = 1.25; t.armRZ = -1.25; t.armLX = -0.2; t.armRX = -0.2;
        t.spineRX = -0.25;
        t.headRX = 0.2;
        break;
      }
      case 'talk': {
        t.spineSY = 1 + breathe;
        const g1 = Math.sin(this.time * 2.7), g2 = Math.sin(this.time * 2.1 + 1);
        t.armRX = -0.5 - g1 * 0.35; t.armRZ = -0.25 - g2 * 0.1;
        t.armLX = -0.2 + g2 * 0.2; t.armLZ = 0.12;
        t.headRY = Math.sin(this.time * 1.1) * 0.2;
        t.headRX = Math.sin(this.time * 3.0) * 0.05;
        break;
      }
      case 'drink': {
        t.spineSY = 1 + breathe;
        const cyc = (this.time % 5) / 5;
        const up = cyc > 0.7 && cyc < 0.9 ? 1 : 0;
        t.armRX = -0.9 - up * 1.0; t.armRZ = -0.25 + up * 0.15;
        t.headRX = -up * 0.3;
        t.armLZ = 0.1;
        break;
      }
      case 'smoke': {
        const cyc = (this.time % 6) / 6;
        const up = cyc > 0.6 && cyc < 0.85 ? 1 : 0;
        t.armRX = -0.6 - up * 1.3; t.armRZ = -0.3 + up * 0.25;
        t.armLX = -0.6; t.armLZ = 0.45;
        t.headRX = -up * 0.15;
        break;
      }
      case 'guard': {
        t.spineSY = 1 + breathe;
        t.armLX = 0.35; t.armRX = 0.35; t.armLZ = -0.1; t.armRZ = 0.1;
        t.headRY = Math.sin(this.time * 0.6) * 0.5;
        break;
      }
      case 'lookaround': {
        t.headRY = Math.sin(this.time * 1.4) * 0.9;
        t.spineRY = Math.sin(this.time * 1.4) * 0.25;
        t.armLZ = 0.15; t.armRZ = -0.15;
        break;
      }
      case 'aim': {
        t.armRX = -Math.PI / 2; t.armRZ = 0.05;
        t.armLX = -1.3; t.armLZ = -0.45;
        t.spineRY = 0.15;
        t.legLX = s * 0.5 * moveAmt; t.legRX = -s * 0.5 * moveAmt;
        break;
      }
      case 'surrender': {
        t.armLX = -2.9; t.armRX = -2.9; t.armLZ = 0.3; t.armRZ = -0.3;
        break;
      }
      case 'cower': {
        t.hipsY = d.hipY - d.legLen * 0.55;
        t.legLX = -1.2; t.legRX = -1.2;
        t.spineRX = 0.8;
        t.armLX = -2.4; t.armRX = -2.4; t.armLZ = 0.9; t.armRZ = -0.9;
        t.headRX = 0.3;
        t.spineRZ = Math.sin(this.time * 30) * 0.03;
        break;
      }
      case 'kneel': {
        t.hipsY = d.hipY - d.legLen * 0.5;
        t.legLX = -1.4; t.legRX = 0.4;
        t.spineRX = 0.5;
        t.armLX = -0.9; t.armRX = -0.9;
        t.headRX = 0.4;
        break;
      }
      case 'clap': {
        const cl = Math.abs(Math.sin(this.time * 9));
        t.armLX = -1.1; t.armRX = -1.1; t.armLZ = -0.3 + cl * 0.45; t.armRZ = 0.3 - cl * 0.45;
        break;
      }
      case 'dance': {
        const b2 = Math.sin(this.time * 5.5);
        t.hipsY = d.hipY + Math.abs(b2) * 0.04;
        t.hipsRZ = b2 * 0.12;
        t.spineRZ = -b2 * 0.18;
        t.armLX = -2.4 + b2 * 0.4; t.armRX = -0.4 - b2 * 0.4; t.armLZ = 0.4; t.armRZ = -0.6;
        t.headRZ = b2 * 0.15;
        t.legLX = b2 * 0.2; t.legRX = -b2 * 0.2;
        break;
      }
      case 'mop':
      case 'sweep': {
        const sw = Math.sin(this.time * 2.6);
        t.armLX = -0.9 + sw * 0.2; t.armRX = -0.6 + sw * 0.2; t.armLZ = -0.2; t.armRZ = 0.3;
        t.spineRY = sw * 0.25; t.spineRX = 0.2;
        break;
      }
      case 'cook':
      case 'type':
      case 'work': {
        const w = Math.sin(this.time * (st === 'type' ? 12 : 4));
        t.armLX = -1.0 + w * 0.12; t.armRX = -1.0 - w * 0.12; t.armLZ = -0.15; t.armRZ = 0.15;
        t.spineRX = 0.18;
        t.headRX = 0.25;
        break;
      }
      case 'serve': {
        t.armLX = -1.4; t.armLZ = 0.35; t.armRZ = -0.1;
        t.legLX = s * 0.5 * moveAmt; t.legRX = -s * 0.5 * moveAmt;
        t.armRX = s * 0.3 * moveAmt;
        break;
      }
      case 'toast': {
        const cyc = Math.sin(this.time * 1.6);
        t.armRX = -2.6; t.armRZ = -0.1;
        t.armLX = -0.6 + cyc * 0.4; t.armLZ = 0.5;
        t.spineRX = -0.15;
        t.headRX = -0.2;
        break;
      }
      case 'punch': {
        const p1 = Math.max(0, Math.sin(this.time * 7)), p2 = Math.max(0, Math.sin(this.time * 7 + Math.PI));
        t.armLX = -0.9 - p1 * 0.7; t.armRX = -0.9 - p2 * 0.7; t.armLZ = -0.2; t.armRZ = 0.2;
        t.spineRY = (p1 - p2) * 0.25;
        t.hipsY = d.hipY + Math.abs(Math.sin(this.time * 7)) * 0.03;
        break;
      }
      case 'pushups': {
        t.rootRX = Math.PI / 2 - 0.15;
        t.rootY = 0.25 + (Math.sin(this.time * 3) * 0.5 + 0.5) * 0.12;
        t.armLX = -1.6; t.armRX = -1.6;
        break;
      }
      case 'vomit': {
        const h = Math.sin(this.time * 6);
        t.spineRX = 0.9 + h * 0.1;
        t.headRX = 0.3;
        t.armLX = -0.5; t.armRX = -0.5;
        t.hipsY = d.hipY - 0.05;
        break;
      }
      case 'struggle': {
        const h = Math.sin(this.time * 22);
        t.armLX = -1.8 + h * 0.4; t.armRX = -1.8 - h * 0.4; t.armLZ = 0.5; t.armRZ = -0.5;
        t.spineRX = -0.25; t.headRX = -0.4;
        t.legLX = h * 0.3; t.legRX = -h * 0.3;
        break;
      }
      case 'choke': {
        t.armLX = -1.4; t.armRX = -1.4; t.armLZ = -0.5; t.armRZ = 0.5;
        t.spineRX = 0.15;
        t.hipsY = d.hipY - 0.04;
        break;
      }
      case 'lean': {
        t.spineRX = 0.35;
        t.armLX = -1.2; t.armRX = -1.2; t.armLZ = 0.2; t.armRZ = -0.2;
        t.headRX = 0.1;
        t.headRY = Math.sin(this.time * 0.4) * 0.3;
        break;
      }
      case 'fish': {
        t.armLX = -1.0; t.armRX = -1.1; t.armLZ = -0.15; t.armRZ = 0.15;
        t.spineSY = 1 + breathe;
        break;
      }
      case 'feed': {
        const cyc = (this.time % 2.2) / 2.2;
        const th = cyc < 0.25 ? 1 : 0;
        t.armRX = -0.4 - th * 1.8; t.armLX = -0.3; t.armLZ = 0.1;
        t.spineRX = 0.15 - th * 0.15;
        break;
      }
      case 'phone': {
        t.armRX = -0.4; t.armRZ = -1.9; t.armRY = 0.4;
        t.headRZ = -0.15;
        t.headRY = Math.sin(this.time * 0.8) * 0.2;
        break;
      }
      case 'read': {
        t.armLX = -1.1; t.armRX = -1.1; t.armLZ = -0.25; t.armRZ = 0.25;
        t.headRX = 0.35;
        break;
      }
      case 'shiver': {
        t.spineRZ = Math.sin(this.time * 40) * 0.03;
        t.armLX = -0.8; t.armRX = -0.8; t.armLZ = -0.6; t.armRZ = 0.6;
        break;
      }
      case 'swim': {
        const sw = Math.sin(this.time * 3);
        t.rootY = -0.75;
        t.armLX = -2.2 + sw * 0.8; t.armRX = -2.2 - sw * 0.8; t.armLZ = 0.6; t.armRZ = -0.6;
        break;
      }
      case 'wave': {
        const w = Math.sin(this.time * 9);
        t.armRX = -0.3; t.armRZ = -2.6 + w * 0.3;
        break;
      }
      case 'stretch': {
        const w = Math.sin(this.time * 1.2);
        t.armLX = -2.9; t.armRX = -2.9; t.spineRZ = w * 0.3; t.armLZ = 0.2; t.armRZ = -0.2;
        break;
      }
      case 'shocked': {
        t.armLZ = 0.9; t.armRZ = -0.9; t.armLX = -0.3; t.armRX = -0.3;
        t.spineRX = -0.15;
        break;
      }
      case 'electro': {
        const j = Math.sin(this.time * 60);
        t.armLZ = 1.6 + j * 0.3; t.armRZ = -1.6 - j * 0.3;
        t.legLZ = 0.4; t.legRZ = -0.4;
        t.hipsY = d.hipY + 0.05 + Math.abs(j) * 0.04;
        t.spineRZ = j * 0.1;
        break;
      }
    }

    // Hands-on overlays for movement states holding things.
    if (anim.holdingTray && (st === 'walk' || st === 'idle')) {
      t.armLX = -1.4; t.armLZ = 0.35;
    }
    if (anim.holdingGun && st !== 'aim' && st !== 'ko' && st !== 'dead') {
      t.armRX = Math.min(t.armRX, -0.35);
    }
    if (anim.holdItem && (st === 'walk' || st === 'idle' || st === 'run' || st === 'sneak')) {
      t.armRX = st === 'sneak' ? -1.2 : -0.5 + t.armRX * 0.3;
    }

    // One-shot action overlays.
    if (this.action) {
      const a = this.action;
      a.t += dt;
      const k = clamp(a.t / a.dur, 0, 1);
      const pulse = Math.sin(k * Math.PI);
      switch (a.name) {
        case 'throw':
          t.armRX = k < 0.4 ? -2.6 * (k / 0.4) : -2.6 + (k - 0.4) / 0.6 * 2.2;
          t.spineRY = -0.4 * pulse;
          break;
        case 'swing':
          t.armRX = k < 0.35 ? -2.8 : -2.8 + ((k - 0.35) / 0.65) * 2.6;
          t.armRZ = -0.2;
          t.spineRX = 0.3 * pulse;
          break;
        case 'push':
          t.armLX = -1.5 * pulse - 0.2; t.armRX = -1.5 * pulse - 0.2;
          t.spineRX = 0.35 * pulse;
          break;
        case 'pickup':
          t.spineRX = 0.9 * pulse;
          t.armRX = -0.9 * pulse; t.armLX = -0.9 * pulse;
          t.hipsY = d.hipY - 0.12 * pulse;
          break;
        case 'use':
          t.armRX = -1.2 * pulse - 0.2; t.armLX = -1.0 * pulse;
          t.spineRX = 0.25 * pulse;
          break;
        case 'shoot':
          t.armRX = -Math.PI / 2 - 0.4 * (1 - k); t.armLX = -1.3; t.armLZ = -0.45;
          break;
        case 'hit':
          t.spineRX = -0.4 * pulse; t.headRX = -0.5 * pulse;
          t.armLZ = 0.8 * pulse; t.armRZ = -0.8 * pulse;
          break;
        case 'punch':
          t.armRX = -1.6 * pulse; t.spineRY = -0.4 * pulse;
          break;
        case 'stagger':
          t.spineRZ = Math.sin(k * 20) * 0.25 * (1 - k);
          t.headRZ = Math.sin(k * 15) * 0.3 * (1 - k);
          break;
        case 'slip':
          t.rootRX = -1.4 * pulse;
          t.legLX = -1.8 * pulse; t.legRX = -1.6 * pulse;
          t.armLZ = 2 * pulse; t.armRZ = -2 * pulse;
          t.rootY = 0.6 * pulse;
          break;
        case 'cheer':
          t.armLX = -2.9; t.armRX = -2.9; t.armLZ = 0.4; t.armRZ = -0.4;
          t.hipsY = d.hipY + 0.12 * pulse;
          break;
      }
      if (a.t >= a.dur) this.action = null;
    }

    // Head look (additive).
    if (st !== 'ko' && st !== 'dead' && st !== 'dragged') {
      t.headRY += clamp(this.lookYaw, -1.2, 1.2);
      t.headRX += this.lookPitch;
    }

    // Blend toward target.
    const lying = st === 'ko' || st === 'dead' || st === 'dragged';
    const rate = lying ? 9 : anim.snappy ? 22 : 13;
    const p = this.pose;
    for (const k of POSE_KEYS) p[k] = damp(p[k], t[k], rate, dt);

    if (cheap && !this.action && !lying) {
      // Off-screen characters: skip expensive bone update half the time.
      this._skip = !this._skip;
      if (this._skip) return;
    }
    this._apply();
    this._updateFace(dt, st);
  }

  _apply() {
    const p = this.pose;
    const bn = this.bones;
    const rp = this.restPos;
    bn[B.root].rotation.set(p.rootRX, 0, p.rootRZ);
    bn[B.root].position.set(0, p.rootY, 0);
    bn[B.hips].position.set(0, p.hipsY, 0);
    bn[B.hips].rotation.set(p.hipsRX, 0, p.hipsRZ);
    bn[B.spine].rotation.set(p.spineRX, p.spineRY, p.spineRZ);
    bn[B.spine].scale.set(1, p.spineSY, 1);
    bn[B.head].rotation.set(p.headRX, p.headRY, p.headRZ);
    bn[B.armL].rotation.set(p.armLX, p.armLY, p.armLZ);
    bn[B.armR].rotation.set(p.armRX, p.armRY, p.armRZ);
    bn[B.legL].rotation.set(p.legLX, 0, p.legLZ);
    bn[B.legR].rotation.set(p.legRX, 0, p.legRZ);
    bn[B.coat].rotation.set(p.coatRX, 0, 0);
    // Keep legs attached to hips but feet on the ground when hips bob.
    bn[B.legL].position.copy(rp[B.legL]);
    bn[B.legR].position.copy(rp[B.legR]);
  }

  _updateFace(dt, st) {
    const bn = this.bones;
    const eyes = bn[B.eyes];
    const eyesX = bn[B.eyesX];
    const bl = bn[B.browL];
    const br = bn[B.browR];
    const mouth = bn[B.mouth];
    const f = st === 'ko' || st === 'dead' || st === 'dragged' ? 'ko' : st === 'electro' ? 'shock' : this.face;

    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 0.13;
      this.blinkT = 2 + Math.random() * 3.5;
    }
    if (this.blink > 0) this.blink -= dt;
    const blinking = this.blink > 0;

    let ey = 1, ex = 0, browRot = 0, browUp = 0, mouthS = 1, mouthW = 1;
    switch (f) {
      case 'ko':
        ey = 0; ex = 1; mouthS = 1.4;
        break;
      case 'shock':
        ey = 1.35; mouthS = 3; browUp = 0.03;
        break;
      case 'alert':
        ey = 1.25; browRot = 0.45; browUp = -0.005; mouthS = 1.5;
        break;
      case 'angry':
        ey = 0.8; browRot = 0.5; browUp = -0.01;
        break;
      case 'suspicious':
        ey = 0.65; browRot = 0.15; browUp = 0.01;
        break;
      case 'scared':
        ey = 1.3; browRot = -0.45; browUp = 0.02; mouthS = 2.2;
        break;
      case 'sad':
        ey = 0.9; browRot = -0.3; browUp = 0.005;
        break;
      case 'happy':
        ey = 0.55; browUp = 0.015; mouthW = 1.3;
        break;
      case 'sleep':
        ey = 0.08;
        break;
      default:
        break;
    }
    if (blinking && f !== 'ko') ey *= 0.1;
    eyes.scale.set(ey > 0 ? 1 : 0.0001, Math.max(ey, 0.0001), ey > 0 ? 1 : 0.0001);
    eyesX.scale.setScalar(ex > 0 ? 1 : 0.0001);
    bl.rotation.z = browRot;
    br.rotation.z = -browRot;
    bl.position.y = this.restPos[B.browL].y + browUp;
    br.position.y = this.restPos[B.browR].y + browUp;
    if (f === 'suspicious') bl.position.y += 0.02;
    if (this.talking > 0) {
      this.talking -= dt;
      mouthS = Math.max(mouthS, 0.6 + Math.abs(Math.sin(this.time * 16)) * 2.2);
    }
    mouth.scale.set(mouthW, mouthS, 1);
  }

  get headWorldY() {
    return this.d.hipY + this.d.torsoH + this.d.headR * 2 + 0.1;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.group.removeFromParent();
  }
}

export function lerpColor(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}
export { lerp };
