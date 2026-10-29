// Item definitions + little 3D models for items lying in the world / in hand.
import * as THREE from 'three';
import { buildProp } from '../core/geo.js';
import { vtoon, outlineBasic, PAL } from '../core/materials.js';

// type: throw | melee | tool | poison | key | gun | place | quest | rifle
export const ITEMS = {
  coin: { name: 'Coin', icon: '🪙', type: 'throw', stack: true, desc: 'Toss it to make someone look. Classic.' },
  banana: { name: 'Banana', icon: '🍌', type: 'place', desc: 'Eat banana. Drop peel. Watch someone have a very bad day.' },
  fish: { name: 'Frozen Fish', icon: '🐟', type: 'melee', blunt: true, throwable: true, desc: 'Slap. Unconscious. Fishy.' },
  pan: { name: 'Frying Pan', icon: '🍳', type: 'melee', blunt: true, throwable: true, desc: 'A heavy, very satisfying BONK.' },
  baguette: { name: 'Baguette', icon: '🥖', type: 'melee', blunt: true, throwable: true, desc: 'Stale enough to knock someone out. Ooh la la.' },
  shovel: { name: 'Shovel', icon: '⛏️', type: 'melee', blunt: true, illegal: true, desc: 'A heavy garden shovel. Hard to explain.' },
  wrench: { name: 'Wrench', icon: '🔧', type: 'tool', blunt: true, throwable: true, desc: 'Loosens bolts. Also skulls (non-lethally).' },
  crowbar: { name: 'Crowbar', icon: '🪛', type: 'tool', blunt: true, illegal: true, throwable: true, desc: 'Pries open crates and locked doors. Noisily.' },
  cleaver: { name: 'Cleaver', icon: '🔪', type: 'melee', lethal: true, illegal: true, throwable: true, desc: 'Lethal. Very much frowned upon.' },
  shears: { name: 'Garden Shears', icon: '✂️', type: 'melee', lethal: true, illegal: true, desc: 'For topiary. And other things.' },
  ratpoison: { name: 'Rat Poison', icon: '🧪', type: 'poison', poison: 'emetic', desc: 'Won’t kill anyone, but they’ll make a run for the toilet.' },
  deathcap: { name: 'Deathcap Mushroom', icon: '🍄', type: 'poison', poison: 'lethal', illegal: false, desc: 'Grind into a drink. Very lethal. Very discreet.' },
  puffer: { name: 'Pufferfish Toxin', icon: '🐡', type: 'poison', poison: 'lethal', desc: 'A vial of tetrodotoxin, courtesy of Professor Puff. Lethal.' },
  keycard: { name: 'Security Keycard', icon: '💳', type: 'key', desc: 'Opens the Baron’s study.' },
  lockpick: { name: 'Lockpick', icon: '🗝️', type: 'tool', desc: 'Slowly opens locked doors.' },
  pistol: { name: 'Pistol', icon: '🔫', type: 'gun', lethal: true, illegal: true, ammo: 6, desc: 'Loud. Lethal. Absolutely the last resort.' },
  rifle: { name: 'Sniper Rifle', icon: '🎯', type: 'rifle', illegal: true, desc: 'Find a high perch. Breathe. Squeeze.' },
  boatkey: { name: 'Speedboat Key', icon: '🚤', type: 'key', desc: 'The Baron’s speedboat. A stylish exit.' },
  ledger: { name: 'The Ledger', icon: '📒', type: 'quest', desc: 'Proof your brother was framed. This is what it was all for.' },
  duck: { name: 'Rubber Duck', icon: '🦆', type: 'throw', desc: 'Squeak.' },
  firecracker: { name: 'Firecracker', icon: '🧨', type: 'throw', loud: true, desc: 'Big bang. Big panic. Very little subtlety.' },
};

export const OUTFIT_ITEM_PREFIX = 'outfit_';

// ---- 3D models ------------------------------------------------------------------
const cache = new Map();
function model(id) {
  const mat = vtoon();
  const om = outlineBasic();
  const B = (fn) => buildProp(fn, mat, om, { outline: 0.012, castShadow: true, receiveShadow: false });
  switch (id) {
    case 'coin':
      return B((s) => s.cyl(0, 0, 0, 0.06, 0.015, PAL.gold, { rx: 0 }));
    case 'banana':
      return B((s) => {
        for (let i = 0; i < 5; i++) {
          const a = -0.6 + i * 0.3;
          s.sphere(Math.sin(a) * 0.12, 0.05, Math.cos(a) * 0.12 - 0.1, 0.045, 0.045, 0.05, PAL.yellow, { ry: a });
        }
        s.cyl(Math.sin(0.6) * 0.12, 0.03, Math.cos(0.6) * 0.12 - 0.08, 0.012, 0.04, PAL.brown, { outline: false });
      });
    case 'peel':
      return B((s) => {
        s.sphere(0, 0.02, 0, 0.09, 0.025, 0.06, PAL.yellow);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.3;
          s.sphere(Math.cos(a) * 0.1, 0.01, Math.sin(a) * 0.1, 0.07, 0.012, 0.03, PAL.yellow, { ry: -a });
        }
      });
    case 'fish':
      return B((s) => {
        s.sphere(0, 0.06, 0, 0.07, 0.06, 0.2, 0x7aa8c8);
        s.cone(0, 0.06, -0.24, 0.07, 0.12, 0x5a88a8, { rx: Math.PI / 2 });
        s.ball(0.035, 0.08, 0.13, 0.015, PAL.black, { outline: false });
      });
    case 'pan':
      return B((s) => {
        s.cyl(0, 0, 0, 0.16, 0.05, PAL.black);
        s.box(0, 0.03, -0.28, 0.04, 0.03, 0.26, PAL.woodDark);
      });
    case 'baguette':
      return B((s) => s.sphere(0, 0.05, 0, 0.05, 0.05, 0.32, 0xd9a050));
    case 'shovel':
      return B((s) => {
        s.box(0, 0.03, 0, 0.04, 0.04, 0.8, PAL.woodDark);
        s.box(0, 0.03, 0.48, 0.2, 0.02, 0.24, PAL.metal);
      });
    case 'wrench':
      return B((s) => {
        s.box(0, 0.02, 0, 0.05, 0.03, 0.3, PAL.metal);
        s.box(0, 0.02, 0.17, 0.12, 0.03, 0.06, PAL.metal);
      });
    case 'crowbar':
      return B((s) => {
        s.box(0, 0.02, 0, 0.04, 0.04, 0.55, PAL.red);
        s.box(0, 0.02, 0.29, 0.04, 0.04, 0.1, PAL.red, { rx: 0.8 });
      });
    case 'cleaver':
      return B((s) => {
        s.box(0, 0.01, 0.06, 0.14, 0.02, 0.18, PAL.metal);
        s.box(0, 0.015, -0.09, 0.04, 0.03, 0.12, PAL.black);
      });
    case 'shears':
      return B((s) => {
        s.box(0.03, 0.01, 0.08, 0.03, 0.02, 0.24, PAL.metal, { ry: 0.1 });
        s.box(-0.03, 0.01, 0.08, 0.03, 0.02, 0.24, PAL.metal, { ry: -0.1 });
        s.box(0, 0.015, -0.1, 0.12, 0.03, 0.1, PAL.red);
      });
    case 'ratpoison':
      return B((s) => {
        s.cyl(0, 0, 0, 0.06, 0.16, 0x7fcf4f);
        s.cyl(0, 0.16, 0, 0.03, 0.04, PAL.white, { outline: false });
        s.box(0, 0.08, 0.06, 0.07, 0.07, 0.005, PAL.white, { outline: false });
      });
    case 'deathcap':
      return B((s) => {
        s.cyl(0, 0, 0, 0.025, 0.08, PAL.cream);
        s.sphere(0, 0.09, 0, 0.08, 0.045, 0.08, PAL.purple);
        s.ball(0.03, 0.12, 0.02, 0.012, PAL.white, { outline: false });
      });
    case 'puffer':
      return B((s) => {
        s.cyl(0, 0, 0, 0.035, 0.12, 0xbfe8f5);
        s.cyl(0, 0.03, 0, 0.03, 0.06, 0xf7d44c, { outline: false });
        s.cyl(0, 0.12, 0, 0.02, 0.03, PAL.black, { outline: false });
      });
    case 'keycard':
      return B((s) => s.box(0, 0.005, 0, 0.09, 0.01, 0.14, PAL.blue));
    case 'boatkey':
      return B((s) => {
        s.box(0, 0.01, 0, 0.03, 0.02, 0.1, PAL.gold);
        s.ball(0, 0.02, -0.07, 0.04, PAL.red);
      });
    case 'lockpick':
      return B((s) => {
        s.box(0, 0.01, 0, 0.012, 0.012, 0.16, PAL.metal);
        s.box(0.03, 0.01, 0, 0.012, 0.012, 0.14, PAL.metal);
        s.box(0.015, 0.012, -0.08, 0.06, 0.02, 0.04, PAL.woodDark);
      });
    case 'pistol':
      return B((s) => {
        s.box(0, 0.05, 0.03, 0.05, 0.06, 0.22, PAL.black);
        s.box(0, 0.0, -0.06, 0.05, 0.12, 0.06, PAL.black, { rx: -0.3 });
      });
    case 'rifle':
      return B((s) => {
        s.box(0, 0.04, 0, 0.05, 0.06, 0.9, 0x3a3a3a);
        s.box(0, 0.03, -0.35, 0.06, 0.1, 0.3, PAL.woodDark);
        s.cyl(0, 0.1, 0.05, 0.035, 0.25, PAL.black, { rx: Math.PI / 2 });
      });
    case 'rifle_case':
      return B((s) => {
        s.box(0, 0.08, 0, 0.35, 0.16, 1.0, 0x4a5a3a);
        s.box(0, 0.17, 0, 0.1, 0.03, 0.2, PAL.black);
      });
    case 'ledger':
      return B((s) => {
        s.box(0, 0.03, 0, 0.18, 0.05, 0.24, 0x7a3a2a);
        s.box(0, 0.035, 0, 0.17, 0.045, 0.22, PAL.cream, { outline: false });
      });
    case 'duck':
      return B((s) => {
        s.sphere(0, 0.06, 0, 0.07, 0.05, 0.09, PAL.yellow);
        s.ball(0, 0.13, 0.05, 0.045, PAL.yellow);
        s.cone(0, 0.13, 0.11, 0.02, 0.05, PAL.orange, { rx: Math.PI / 2, outline: false });
      });
    case 'firecracker':
      return B((s) => {
        s.cyl(0, 0, 0, 0.03, 0.14, PAL.red, { rz: Math.PI / 2 });
        s.cyl(0.08, 0.03, 0, 0.005, 0.05, PAL.white, { outline: false });
      });
    case 'outfit':
      return B((s) => {
        s.box(0, 0.05, 0, 0.4, 0.1, 0.3, PAL.blue);
        s.box(0, 0.11, 0, 0.38, 0.03, 0.28, PAL.white, { outline: false });
      });
    case 'decanter':
      return B((s) => {
        s.sphere(0, 0.12, 0, 0.09, 0.11, 0.09, 0xd8a050);
        s.cyl(0, 0.2, 0, 0.03, 0.1, PAL.glass);
        s.ball(0, 0.32, 0, 0.035, PAL.glass);
        s.cyl(0.18, 0, 0.05, 0.035, 0.08, PAL.glass, { outline: false });
      });
    case 'tray':
      return B((s) => {
        s.cyl(0, 0, 0, 0.22, 0.02, PAL.metal);
        for (let i = 0; i < 3; i++) s.cone(Math.cos(i * 2) * 0.1, 0.02, Math.sin(i * 2) * 0.1, 0.035, 0.1, PAL.glass, { outline: false, rx: Math.PI });
      });
    case 'glass':
      return B((s) => {
        s.cone(0, 0.0, 0, 0.04, 0.11, PAL.glass, { outline: false, rx: Math.PI });
        s.cyl(0, 0.06, 0, 0.03, 0.04, 0xf7e08a, { outline: false });
      });
    case 'cigarette':
      return B((s) => {
        s.box(0, 0, 0.1, 0.012, 0.012, 0.25, PAL.black, { outline: false });
        s.box(0, 0, 0.24, 0.014, 0.014, 0.04, PAL.white, { outline: false });
        s.ball(0, 0, 0.27, 0.012, PAL.orange, { outline: false });
      });
    case 'cane':
      return B((s) => {
        s.cyl(0, -0.75, 0, 0.018, 0.75, PAL.black, { outline: false });
        s.ball(0, 0.02, 0, 0.04, PAL.gold);
      });
    case 'mop':
      return B((s) => {
        s.cyl(0, -0.8, 0.05, 0.015, 1.2, PAL.woodLight, { outline: false });
        s.sphere(0, -0.85, 0.05, 0.12, 0.08, 0.12, PAL.white);
      });
    case 'shake':
      return B((s) => {
        s.cyl(0, 0, 0, 0.05, 0.16, 0xffb0d0);
        s.cyl(0, 0.16, 0, 0.052, 0.03, PAL.white, { outline: false });
      });
    case 'bucket':
      return B((s) => {
        s.cyl(0, 0, 0, 0.12, 0.18, PAL.metal);
        s.sphere(0, 0.2, 0, 0.1, 0.04, 0.1, PAL.orange, { outline: false });
      });
    case 'clipboard':
      return B((s) => {
        s.box(0, 0, 0, 0.2, 0.02, 0.28, PAL.woodLight);
        s.box(0, 0.012, 0, 0.17, 0.005, 0.22, PAL.white, { outline: false });
      });
    case 'fishingrod':
      return B((s) => {
        s.cyl(0, 0, 0.6, 0.012, 1.8, PAL.woodDark, { rx: Math.PI / 2 - 0.5, outline: false });
      });
    case 'drink':
      return B((s) => {
        s.cyl(0, 0, 0, 0.04, 0.1, PAL.glass, { outline: false });
        s.cyl(0, 0.02, 0, 0.036, 0.06, 0xf28a30, { outline: false });
      });
    case 'martini':
      return B((s) => {
        s.cyl(0, 0, 0, 0.004, 0.08, PAL.glass, { outline: false });
        s.cone(0, 0.08, 0, 0.06, 0.07, PAL.glass, { rx: Math.PI, outline: false });
        s.ball(0, 0.12, 0, 0.012, 0x7fcf4f, { outline: false });
      });
    default:
      return B((s) => s.box(0, 0.05, 0, 0.15, 0.1, 0.15, PAL.purple));
  }
}

export function makeItemMesh(id) {
  const key = ITEMS[id] ? id : id;
  if (!cache.has(key)) cache.set(key, model(key));
  return cache.get(key).clone();
}

// Orient models nicely when held in the hand (hand bone space: -Y is down the arm).
export function makeHeldMesh(id) {
  const m = makeItemMesh(id === 'banana' ? 'banana' : id);
  const g = new THREE.Group();
  g.add(m);
  switch (id) {
    case 'pan':
    case 'wrench':
    case 'crowbar':
    case 'shovel':
    case 'baguette':
    case 'fish':
    case 'cleaver':
    case 'shears':
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, -0.02, 0.06);
      if (id === 'pan') m.position.set(0, -0.06, 0.32);
      if (id === 'shovel') m.position.set(0, -0.1, 0.2);
      break;
    case 'pistol':
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, -0.08, 0.04);
      break;
    case 'rifle':
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, -0.3, 0.05);
      break;
    case 'tray':
      m.position.set(0, 0.07, 0.15);
      break;
    case 'cigarette':
      m.position.set(0, -0.02, 0.02);
      break;
    case 'cane':
      m.position.set(0, 0, 0.02);
      break;
    case 'mop':
      m.position.set(0, 0, 0.05);
      break;
    case 'fishingrod':
      m.position.set(0, 0, 0);
      break;
    default:
      m.position.set(0, -0.06, 0.04);
  }
  return g;
}
