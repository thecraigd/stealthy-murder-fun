// Cel-shaded material library. Everything shares a handful of programs so the
// whole island renders with very few shader switches.
import * as THREE from 'three';

// Optional rendering features. The graphics guard switches these off on
// devices whose GPU draws a blank frame with them on.
export const GFX = { shadows: true, xray: true, cutaway: true, ocean: true, fog: true, outlines: true, sky: true, fx: true };

// Global uniforms (shared by reference between every patched material).
export const G = {
  uTime: { value: 0 },
  uCutOn: { value: 0 },
  uCutCenter: { value: new THREE.Vector2(0, 0) },
  uCutRadius: { value: 200 },
  uCutHeight: { value: 0.95 },
  uCutPos: { value: new THREE.Vector3() },
  uCamPos: { value: new THREE.Vector3() },
  uOutline: { value: 0.028 },
};

function makeGradient(steps) {
  const data = new Uint8Array(steps.length);
  steps.forEach((v, i) => (data[i] = Math.round(v * 255)));
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// Two hard bands with a sliver of mid-tone: very Wind Waker.
export const toonGradient = makeGradient([0, 0, 0, 0, 0, 0, 0.0, 0.45, 1, 1, 1, 1, 1, 1, 1, 1]);
// Characters get a slightly softer terminator so faces stay friendly.
export const toonGradientChar = makeGradient([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.3, 1, 1, 1, 1, 1, 1, 1, 1, 1]);

const BAYER = /* glsl */ `
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x) + int(q.y) * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
`;

const CUT_PARS_FRAG = /* glsl */ `
uniform float uCutOn;
uniform vec2 uCutCenter;
uniform float uCutRadius;
uniform float uCutHeight;
uniform vec3 uCutPos;
uniform vec3 uCamPos;
varying vec3 vWPos;
${BAYER}
void cutaway() {
  if (uCutOn > 0.5 && vWPos.y > uCutHeight) {
    float d = distance(gl_FragCoord.xy, uCutCenter) / uCutRadius;
    if (d < 1.0) {
      float fragDist = distance(vWPos, uCamPos);
      float playerDist = distance(uCutPos, uCamPos);
      if (fragDist < playerDist - 0.4) {
        float edge = smoothstep(0.62, 1.0, d);
        if (bayer4(gl_FragCoord.xy) >= edge) discard;
      }
    }
  }
}
`;

function patchVertexWorld(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      {
        vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        vWPos = (modelMatrix * wp4).xyz;
      }`
    );
}

function attachGlobals(shader) {
  for (const k of Object.keys(G)) shader.uniforms[k] = G[k];
}

// --- Environment material (merged static geometry, vertex colours) --------
export function makeEnvMaterial({ cut = true, cap = true, side = THREE.DoubleSide } = {}) {
  const m = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonGradient,
    side,
  });
  // Only back faces go into the shadow map: no self-shadow acne on walls.
  m.shadowSide = THREE.BackSide;
  m.onBeforeCompile = (shader) => {
    attachGlobals(shader);
    patchVertexWorld(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + CUT_PARS_FRAG)
      .replace('void main() {', 'void main() {\n' + (cut ? 'cutaway();' : ''))
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        ${cap ? 'if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.10, 0.08, 0.11);' : ''}`
      );
  };
  m.customProgramCacheKey = () => `env-${cut}-${cap}`;
  return m;
}

// Black-ish inverted hull outline for merged static geometry.
export function makeEnvOutlineMaterial({ cut = true } = {}) {
  const m = new THREE.MeshBasicMaterial({ color: 0x1b1622, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    attachGlobals(shader);
    patchVertexWorld(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + CUT_PARS_FRAG)
      .replace('void main() {', 'void main() {\n' + (cut ? 'cutaway();' : ''));
  };
  m.customProgramCacheKey = () => `envoutline-${cut}`;
  return m;
}

export function makeGlassMaterial() {
  const m = new THREE.MeshToonMaterial({
    vertexColors: true, gradientMap: toonGradient, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide,
  });
  m.onBeforeCompile = (shader) => {
    attachGlobals(shader);
    patchVertexWorld(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + CUT_PARS_FRAG)
      .replace('void main() {', 'void main() {\ncutaway();');
  };
  m.customProgramCacheKey = () => 'glass';
  return m;
}

// Roof material: dither-fades out when the player is inside the building.
export function makeRoofMaterial() {
  const fade = { value: 0 };
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient });
  m.userData.fade = fade;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFade = fade;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFade;\n' + BAYER)
      .replace('void main() {', 'void main() {\n if (uFade > 0.001 && bayer4(gl_FragCoord.xy) < uFade) discard;');
  };
  m.customProgramCacheKey = () => 'roof';
  return m;
}

export function makeRoofOutlineMaterial(fade) {
  const m = new THREE.MeshBasicMaterial({ color: 0x1b1622, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFade = fade;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFade;\n' + BAYER)
      .replace('void main() {', 'void main() {\n if (uFade > 0.001 && bayer4(gl_FragCoord.xy) < uFade) discard;');
  };
  m.customProgramCacheKey = () => 'roofoutline';
  return m;
}

// --- Character materials ------------------------------------------------------
export function makeCharMaterial() {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradientChar });
  return m;
}

export function makeOutlineMaterial(color = 0x1b1622, thicknessUniform = G.uOutline) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = thicknessUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline;\nattribute float ow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uOutline * ow;');
  };
  m.customProgramCacheKey = () => 'charoutline';
  return m;
}

// Seen-through-walls silhouette. Rendered in the opaque pass *after* the
// environment but *before* characters (renderOrder), with GREATER depth: it
// only shows where walls are in front, and visible characters paint over it.
export function makeXrayMaterial(color, opacity = 0.55) {
  return new THREE.MeshBasicMaterial({
    color,
    opacity,
    transparent: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthWrite: false,
    depthFunc: THREE.GreaterDepth,
  });
}

// Plain toon material with a solid colour (for dynamic props).
const toonCache = new Map();
export function toon(color) {
  const key = typeof color === 'number' ? color : new THREE.Color(color).getHex();
  if (!toonCache.has(key)) {
    toonCache.set(key, new THREE.MeshToonMaterial({ color: key, gradientMap: toonGradient }));
  }
  return toonCache.get(key);
}

export function vtoon() {
  if (!toonCache.has('v')) {
    toonCache.set('v', new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient }));
  }
  return toonCache.get('v');
}

let _outlineBasic = null;
export function outlineBasic() {
  if (!_outlineBasic) _outlineBasic = new THREE.MeshBasicMaterial({ color: 0x1b1622, side: THREE.BackSide });
  return _outlineBasic;
}

// Palette: bright, saturated, toy-like.
export const PAL = {
  grass: 0x7fcf4f,
  grassDark: 0x5fb43c,
  grassLight: 0x9be060,
  sand: 0xf3dca0,
  sandDark: 0xe2c483,
  path: 0xe9d7b0,
  stone: 0xc9c2b6,
  stoneDark: 0xa39c91,
  cobble: 0xd8cdb8,
  plaster: 0xfbf1de,
  plasterShade: 0xeedfc4,
  trim: 0xffffff,
  roof: 0xd9603b,
  roofDark: 0xb44a2f,
  roofTeal: 0x3f9f9b,
  wood: 0xb57d4c,
  woodDark: 0x8a5a33,
  woodLight: 0xd9a46b,
  plank: 0xc99561,
  carpetRed: 0xc23b4a,
  carpetGold: 0xe4b84a,
  carpetBlue: 0x3d6fb6,
  marble: 0xf2ece4,
  marbleDark: 0xd6cfc5,
  tileWhite: 0xeef3f3,
  tileBlue: 0x8fc9d6,
  tileGreen: 0xa6d49c,
  metal: 0xa9b4bf,
  metalDark: 0x6b7480,
  gold: 0xf2c14e,
  black: 0x2a2430,
  white: 0xffffff,
  leaf: 0x5cbf3c,
  leafDark: 0x3f9a2e,
  hedge: 0x4fae3a,
  flowerPink: 0xff7fb0,
  flowerYellow: 0xffd94a,
  flowerWhite: 0xffffff,
  flowerPurple: 0xb07fff,
  water: 0x2ea8d8,
  glass: 0xbfe8f5,
  red: 0xe0453a,
  orange: 0xf28a30,
  yellow: 0xf7d44c,
  teal: 0x3fb7b0,
  blue: 0x4a7fd6,
  navy: 0x2c3e6b,
  purple: 0x8a5ac8,
  pink: 0xf59ac4,
  brown: 0x7a5236,
  cream: 0xfff6e0,
};
