// Gullcrest Key: the Baron's island estate. Static geometry, colliders, zones
// and named anchors used by NPC routines and set-pieces.
import * as THREE from 'three';
import { MeshSink } from '../core/geo.js';
import {
  PAL, makeEnvMaterial, makeEnvOutlineMaterial, makeRoofMaterial, makeRoofOutlineMaterial, makeGlassMaterial,
} from '../core/materials.js';
import { World } from '../core/world.js';
import * as P from './props.js';
import { buildTerrain, buildSky, makePoolWaterMaterial, makeSDF } from './terrain.js';

const EXT = PAL.plaster;
const C = {
  study: 0x4f7f62, aquarium: 0x6fb0d0, ballroom: 0xf6e3b8, kitchen: 0xeaf2f0, security: 0xaab4be,
  lounge: 0xd0705a, gallery: 0xfaf5ea, foyer: 0xc4e6dc, restroom: 0xc6e6ee, staff: 0xe6d4b0,
};

export const BOUNDS = { minX: -60, maxX: 60, minZ: -46, maxZ: 54 };

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.world = new World({ ...BOUNDS, cell: 0.5 });
    this.anchors = {};
    this.hideSpots = [];
    this.containers = [];
    this.items = [];
    this.windows = [];
    this.doors = [];
    this.dumpSpots = [];
    this.waterDiscs = [];
    this.roofs = [];
    this.buildings = {};
    this.patrols = {};
  }

  A(name, x, z, yaw = 0, extra = {}) {
    this.anchors[name] = { name, x, z, yaw, ...extra };
    return this.anchors[name];
  }

  zone(id, name, access, x1, z1, x2, z2, extra = {}) {
    return this.world.addZone({ id, name, access, minX: Math.min(x1, x2), maxX: Math.max(x1, x2), minZ: Math.min(z1, z2), maxZ: Math.max(z1, z2), ...extra });
  }

  build() {
    const env = new MeshSink({ chunk: 16, outline: 0.035 });
    const glass = new MeshSink({ chunk: 32, outline: 0 });
    this.env = env;
    this.glass = glass;
    this.onLockedDoor = (d) => this.doors.push(d);

    this.buildLand();
    this.buildManor();
    this.buildTerrace();
    this.buildSpa();
    this.buildPool();
    this.buildGym();
    this.buildGarden();
    this.buildDock();
    this.buildWest();
    this.buildLighthouse();
    this.buildCove();

    const group = new THREE.Group();
    group.name = 'level';
    this.group = group;
    this.envMat = makeEnvMaterial();
    this.envOutline = makeEnvOutlineMaterial();
    env.build(group, this.envMat, this.envOutline, { name: 'env' });
    glass.build(group, makeGlassMaterial(), null, { castShadow: false, receiveShadow: false, name: 'glass' });
    for (const r of this.roofs) {
      const mat = makeRoofMaterial();
      const om = makeRoofOutlineMaterial(mat.userData.fade);
      const rg = new THREE.Group();
      r.sink.build(rg, mat, om, { name: 'roof-' + r.id, castShadow: true, receiveShadow: false });
      group.add(rg);
      r.group = rg;
      r.fade = mat.userData.fade;
    }
    // Small water discs (fountains etc.)
    const pw = makePoolWaterMaterial(0x5fd8ee);
    for (const d of this.waterDiscs) {
      const m = new THREE.Mesh(d.rect ? new THREE.PlaneGeometry(d.w, d.d) : new THREE.CircleGeometry(d.r, 24), d.mat || pw);
      m.rotation.x = -Math.PI / 2;
      m.position.set(d.x, d.y, d.z);
      group.add(m);
    }
    this.scene.add(group);
    this.clouds = buildSky(this.scene);
    this.world.buildNav(0.32);
  }

  // ------------------------------------------------------------------ land
  buildLand() {
    const w = this.world;
    const terrain = [
      { type: 'rrect', cx: 0, cz: -1, hw: 48, hd: 33, r: 10 },
      { type: 'circle', x: -40, z: -37, r: 7.5 },
      { type: 'cut', x: -36, z: 37.5, r: 7 },
    ];
    for (const s of terrain) if (s.type !== 'cut') w.addLand(s);
    // Piers are walkable but not terrain.
    const piers = [
      { minX: -2, maxX: 2, minZ: 30, maxZ: 46 },
      { minX: 15.5, maxX: 18, minZ: 30, maxZ: 40 },
    ];
    for (const p of piers) w.addLand({ type: 'rect', ...p });
    // Walkable = terrain (with the cove cut) plus the piers.
    const terrSDF = makeSDF(terrain);
    const pierSDF = (x, z) => {
      let d = 1e9;
      for (const p of piers) {
        const qx = Math.abs(x - (p.minX + p.maxX) / 2) - (p.maxX - p.minX) / 2;
        const qz = Math.abs(z - (p.minZ + p.maxZ) / 2) - (p.maxZ - p.minZ) / 2;
        d = Math.min(d, Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0));
      }
      return d;
    };
    w.landSDF = (x, z) => Math.min(terrSDF(x, z), pierSDF(x, z));
    const beach = (x, z) => (z > 22 || (x < -26 && z > 14) ? 1 : 0);
    this.terrain = buildTerrain(this.scene, terrain, { bounds: BOUNDS, beach, piers });
    this.zone('island', 'Gullcrest Grounds', 'public', -60, -46, 60, 54, { outdoor: true });
  }

  // ------------------------------------------------------------------ manor
  buildManor() {
    const L = this;
    const W = (x1, z1, x2, z2, o) => P.wall(L, x1, z1, x2, z2, o);
    const ET = 0.4;
    // Floors
    P.floor(L, -22, -26, -12, -14, 'carpet', { a: 0x2f5a46, b: 0xc9a24a });
    P.floor(L, -12, -26, -2, -14, 'tiles', { a: 0x9fd6e6, b: 0x7ab8cc, tile: 1 });
    P.floor(L, -2, -26, 14, -8, 'checker', { a: 0xf4ecdc, b: 0xc9a24a, tile: 1 });
    P.floor(L, 14, -26, 22, -14, 'checker', { a: 0xffffff, b: 0x7fb8d6, tile: 0.8 });
    P.floor(L, -22, -14, -12, -7, 'tiles', { a: 0xb8c0c8, b: 0x9aa2aa, tile: 1 });
    P.floor(L, -22, -7, -12, 0, 'planks', { alongX: true });
    P.floor(L, -12, -14, -2, 0, 'checker', { a: 0xf2ece4, b: 0xdcd2c4, tile: 2 });
    P.floor(L, -2, -8, 6, 0, 'checker', { a: 0xffffff, b: 0x2f2a38, tile: 1 });
    P.floor(L, 6, -8, 14, 0, 'tiles', { a: 0xeaf6f8, b: 0xb9dfe8, tile: 0.5 });
    P.floor(L, 14, -14, 22, 0, 'planks', { a: 0xc08a58, b: 0xd09a68 });

    // Exterior walls
    const ext = { t: ET, base: 0xd8c8a8 };
    W(-22, -26, -12, -26, { ...ext, a: EXT, b: C.study, windows: [[-17, 1.6]] });
    W(-12, -26, -2, -26, { ...ext, a: EXT, b: C.aquarium });
    W(-2, -26, 14, -26, { ...ext, a: EXT, b: C.ballroom, doors: [[6, 3.0]], windows: [[1, 1.8], [11, 1.8]] });
    W(14, -26, 22, -26, { ...ext, a: EXT, b: C.kitchen, windows: [[18, 1.6]] });
    W(-22, 0, -12, 0, { ...ext, a: C.lounge, b: EXT, windows: [[-19, 1.6], [-15, 1.6]] });
    W(-12, 0, -2, 0, { ...ext, a: C.gallery, b: EXT, windows: [[-9, 1.8], [-5, 1.8]] });
    W(-2, 0, 6, 0, { ...ext, a: C.foyer, b: EXT, doors: [[2, 2.4]] });
    W(6, 0, 14, 0, { ...ext, a: C.restroom, b: EXT, windows: [[10, 1.4, 'climb']] });
    W(14, 0, 22, 0, { ...ext, a: C.staff, b: EXT, doors: [[18, 1.6]] });
    W(-22, -26, -22, -14, { ...ext, a: EXT, b: C.study, windows: [[-20, 1.4, 'climb']] });
    W(-22, -14, -22, -7, { ...ext, a: EXT, b: C.security, doors: [[-10, 1.6]] });
    W(-22, -7, -22, 0, { ...ext, a: EXT, b: C.lounge, windows: [[-3.5, 1.4, 'climb']] });
    W(22, -26, 22, -14, { ...ext, a: C.kitchen, b: EXT, doors: [[-20, 1.6]] });
    W(22, -14, 22, 0, { ...ext, a: C.staff, b: EXT, doors: [[-4, 1.6]], windows: [[-10, 1.6]] });
    // Interior walls
    W(-12, -26, -12, -14, { a: C.study, b: C.aquarium, doors: [[-20, 1.6]] });
    W(-2, -26, -2, -14, { a: C.aquarium, b: C.ballroom, doors: [[-16, 1.8]] });
    W(14, -26, 14, -14, { a: C.ballroom, b: C.kitchen, doors: [[-17, 1.6]] });
    W(-22, -14, -12, -14, { a: C.study, b: C.security, doors: [[-17, 1.4, 'locked']], lock: { id: 'studyDoor', key: 'keycard', name: 'Study Door' } });
    W(-12, -14, -2, -14, { a: C.aquarium, b: C.gallery, doors: [[-4, 1.6]] });
    W(14, -14, 22, -14, { a: C.kitchen, b: C.staff, doors: [[18, 1.6]] });
    W(-12, -14, -12, -7, { a: C.security, b: C.gallery, doors: [[-10, 1.6]] });
    W(-12, -7, -12, 0, { a: C.lounge, b: C.gallery, doors: [[-3.5, 1.8]] });
    W(-22, -7, -12, -7, { a: C.security, b: C.lounge });
    W(-2, -14, -2, -8, { a: C.gallery, b: C.ballroom, doors: [[-11, 2.0]] });
    W(-2, -8, -2, 0, { a: C.gallery, b: C.foyer, doors: [[-4, 2.0]] });
    W(-2, -8, 6, -8, { a: C.ballroom, b: C.foyer, doors: [[2, 3.0]] });
    W(6, -8, 14, -8, { a: C.ballroom, b: C.restroom });
    W(6, -8, 6, 0, { a: C.foyer, b: C.restroom, doors: [[-5, 1.6]] });
    W(14, -14, 14, -8, { a: C.ballroom, b: C.staff, doors: [[-11, 1.6]] });
    W(14, -8, 14, 0, { a: C.restroom, b: C.staff });

    // Zones
    const Z = (...a) => this.zone(...a);
    Z('study', 'Baron’s Study', 'restricted', -22, -26, -12, -14, { building: 'manor' });
    Z('aquarium', 'Aquarium', 'aquarium', -12, -26, -2, -14, { building: 'manor' });
    Z('ballroom', 'Ballroom', 'public', -2, -26, 14, -8, { building: 'manor' });
    Z('bar', 'Behind the Bar', 'bar', 12.3, -22.2, 14, -13.8, { building: 'manor' });
    Z('backstage', 'Backstage', 'bar', 11.2, -26, 14, -22.2, { building: 'manor' });
    Z('kitchen', 'Kitchen', 'kitchen', 14, -26, 22, -14, { building: 'manor' });
    Z('security', 'Security Office', 'security', -22, -14, -12, -7, { building: 'manor' });
    Z('lounge', 'Lounge', 'public', -22, -7, -12, 0, { building: 'manor' });
    Z('gallery', 'Gallery', 'public', -12, -14, -2, 0, { building: 'manor' });
    Z('foyer', 'Foyer', 'public', -2, -8, 6, 0, { building: 'manor' });
    Z('restroom', 'Restroom', 'public', 6, -8, 14, 0, { building: 'manor' });
    Z('staff', 'Staff Quarters', 'staff', 14, -14, 22, 0, { building: 'manor' });
    this.buildings.manor = { minX: -22, maxX: 22, minZ: -26, maxZ: 0 };

    // ---- Study
    P.rug(L, -17, -20, 6, 4, 0x8a2a3a, 0xc9a24a);
    P.desk(L, -17, -21.6, 0, { w: 2.2, lamp: true, papers: true });
    P.chair(L, -17, -22.8, 0, PAL.woodDark, 0x8a2a3a);
    this.A('baron_desk', -17, -22.7, 0);
    this.A('baron_desk_stand', -17, -22.7, 0);
    P.bookshelf(L, -20, -25.6, 0, 2.6);
    P.bookshelf(L, -14.2, -25.6, 0, 2.6);
    this.safe = { x: -21.45, z: -24.2, rot: Math.PI / 2 };
    P.safe(L, -21.45, -24.2, Math.PI / 2);
    this.A('safe', -20.4, -24.2, -Math.PI / 2);
    P.globe(L, -13.4, -15.2);
    P.armchair(L, -20.6, -16, Math.PI * 0.75, 0x8a2a3a);
    P.armchair(L, -18.8, -15.3, Math.PI, 0x8a2a3a);
    P.painting(L, -17, -25.75 + 0.15, 0, 1.6, 1.1, 1.9, [0x6a4a8a, PAL.gold, PAL.red, 0xffd9bd, PAL.purple]);
    P.plantPot(L, -21.3, -14.8, 0.9, 'tall');
    P.floorLamp(L, -21.3, -17.2);
    // drinks trolley with decanter (set-piece places the decanter)
    P.counter(L, -12.9, -23.2, 0.6, 1.6, 0, PAL.woodDark, PAL.gold, 0.85);
    this.A('whiskey', -12.9, -23.2, 0);
    this.A('whiskey_use', -13.8, -23.2, Math.PI / 2);

    // ---- Aquarium
    const tank = { x1: -10, z1: -24, x2: -4, z2: -18 };
    this.tank = tank;
    const s = this.env;
    s.block((tank.x1 + tank.x2) / 2, 0, (tank.z1 + tank.z2) / 2, tank.x2 - tank.x1 + 0.4, 0.25, tank.z2 - tank.z1 + 0.4, 0x5a6f80);
    for (const [x1, z1, x2, z2] of [[tank.x1, tank.z1, tank.x2, tank.z1], [tank.x1, tank.z2, tank.x2, tank.z2], [tank.x1, tank.z1, tank.x1, tank.z2], [tank.x2, tank.z1, tank.x2, tank.z2]]) {
      const horiz = z1 === z2;
      this.glass.box((x1 + x2) / 2, 0.75, (z1 + z2) / 2, horiz ? x2 - x1 : 0.1, 1.0, horiz ? 0.1 : z2 - z1, 0x9fe8ff, { outline: false });
      s.box((x1 + x2) / 2, 1.28, (z1 + z2) / 2, horiz ? x2 - x1 + 0.2 : 0.2, 0.08, horiz ? 0.2 : z2 - z1 + 0.2, 0x3a4a5a);
    }
    for (const [x, z] of [[tank.x1, tank.z1], [tank.x2, tank.z1], [tank.x1, tank.z2], [tank.x2, tank.z2]]) s.block(x, 0, z, 0.25, 1.32, 0.25, 0x3a4a5a);
    this.world.addBox(tank.x1 - 0.15, tank.z1 - 0.15, tank.x2 + 0.15, tank.z2 + 0.15, { h: 1.3, sight: 'none', tag: 'tank' });
    this.waterDiscs.push({ rect: true, x: -7, y: 1.0, z: -21, w: 5.9, d: 5.9, mat: makePoolWaterMaterial(0x2a9ac8) });
    // feeding platform (south side)
    s.block(-7, 0, -17.35, 1.6, 0.18, 0.9, 0x8a9aa8);
    s.block(-7, 0.18, -17.35, 1.4, 0.03, 0.7, 0xf2c14e, { outline: false });
    this.A('feed_spot', -7, -17.25, Math.PI);
    this.A('aquarist_work', -3.2, -24.6, Math.PI);
    P.fishTank(L, -2.45, -21.8, -Math.PI / 2, 3);
    P.fishTank(L, -11.6, -16.2, Math.PI / 2, 1.6);
    this.A('puffer_tank', -10.9, -16.2, -Math.PI / 2);
    P.counter(L, -3.6, -25.4, 2.4, 0.7, 0, 0x5a6f80, 0xd8e8f0);
    P.barrel(L, -11.4, -25.3, 0x3f7fa8);

    // ---- Ballroom
    P.stage(L, 0, -26, 11, -23.2);
    this.world.addBox(0, -26, 11, -23.2, { h: 0.35, sight: 'none', tag: 'stage' });
    P.piano(L, 1.8, -24.4, Math.PI * 0.5);
    P.mic(L, 6, -23.4);
    this.A('pianist', 3.15, -24.4, -Math.PI / 2, { y: 0.35, sit: true });
    this.A('singer', 6, -24.0, 0, { y: 0.35 });
    this.A('chandelier', 5.5, -15.5, 0);
    this.A('toast', 5.5, -15.5, 0);
    // bar
    P.counter(L, 11.95, -18.1, 0.8, 7.8, 0, PAL.woodDark, PAL.marble, 1.05);
    P.shelfUnit(L, 13.7, -19.5, -Math.PI / 2, 3.4, 2.1);
    this.A('bartender', 13.0, -18.5, -Math.PI / 2);
    this.A('bar_counter', 11.95, -18.6, 0);
    this.A('vex_bar', 11.05, -18.6, Math.PI / 2);
    this.A('bar_guest1', 11.0, -16.2, Math.PI / 2);
    this.A('bar_guest2', 11.0, -20.8, Math.PI / 2);
    for (const z of [-21.2, -16.2]) P.chair(L, 10.7, z - 0.01, Math.PI / 2, PAL.woodDark, PAL.carpetRed);
    // backstage winch area
    this.A('winch', 13.0, -24.6, Math.PI / 2);
    s.block(13.75, 0, -24.6, 0.4, 1.4, 0.8, PAL.metalDark);
    s.cyl(13.7, 1.0, -24.6, 0.25, 0.4, PAL.metal, { rz: Math.PI / 2 });
    s.box(12.9, 2.3, -24.6, 0.05, 0.6, 0.05, PAL.black, { outline: false });
    // curtains separating backstage (only reachable from behind the bar)
    for (let z = -25.8; z < -22.3; z += 0.5) s.cyl(11.3, 0, z, 0.27, 2.4, 0xb02a3a, { outline: false, seg: 8 });
    for (let x = 11.6; x < 12.7; x += 0.5) s.cyl(x, 0, -22.3, 0.27, 2.4, 0xb02a3a, { outline: false, seg: 8 });
    this.world.addBox(11.05, -26, 11.55, -22.1, { h: 2.4, sight: 'tall' });
    this.world.addBox(11.05, -22.55, 12.8, -22.05, { h: 2.4, sight: 'tall' });
    // tables + guests
    const tables = [[0.6, -20.6], [0.6, -15.4], [0.6, -10.6], [9.4, -12.0]];
    tables.forEach(([x, z], i) => {
      P.table(L, x, z, { r: 0.65, glasses: true });
      this.A(`btable${i}a`, x + 1.1, z, -Math.PI / 2);
      this.A(`btable${i}b`, x, z + 1.1, Math.PI);
      this.A(`btable${i}c`, x, z - 1.1, 0);
    });
    P.champagneTower(L, 7.4, -9.4);
    P.buffet(L, 10.4, -8.8, Math.PI, 2.8);
    P.plantPot(L, -1.3, -25.3, 1.2, 'palm');
    P.plantPot(L, 10.6, -25.3, 1.0, 'palm');
    P.plantPot(L, -1.3, -8.7, 1.0, 'palm');
    P.plantPot(L, 13.3, -8.7, 1.0, 'palm');
    P.painting(L, -1.86, -20.5, Math.PI / 2, 1.4, 1.0, 1.7);
    this.A('dance0', 3.6, -17.8, 0.4);
    this.A('dance1', 4.4, -17.2, -2.7);
    this.A('dance2', 7.2, -13.6, 2.2);
    this.A('dance3', 7.8, -14.4, -0.9);
    this.A('ballroom_mingle0', 3.4, -11.8, 1.2);
    this.A('ballroom_mingle1', 4.6, -11.5, -1.6);
    this.A('ballroom_view', 8.6, -12.4, -2.5);
    this.A('buffet', 10.4, -9.9, 0);

    // ---- Kitchen
    P.counter(L, 16.6, -25.4, 4.6, 0.8, 0, 0xd8e0e8, 0xb8c4cc);
    this.A('stove', 16.0, -24.6, Math.PI);
    s.block(16.0, 0.95, -25.4, 1.2, 0.04, 0.7, PAL.black, { outline: false });
    for (const [dx, dz] of [[-0.3, -0.15], [0.3, -0.15], [-0.3, 0.18], [0.3, 0.18]]) s.cyl(16.0 + dx, 0.99, -25.4 + dz, 0.14, 0.015, 0x5a5a64, { outline: false });
    s.cyl(15.7, 1.0, -25.55, 0.22, 0.25, PAL.metal);
    s.cyl(17.6, 0.95, -25.4, 0.24, 0.05, 0xdfe8ea, { outline: false });
    // walk-in freezer
    s.block(20.75, 0, -24.6, 2.5, 2.4, 2.8, 0xd8e8f0);
    s.block(20.75, 0.1, -23.18, 1.2, 2.0, 0.06, 0xb8c8d8);
    s.box(21.2, 1.1, -23.12, 0.08, 0.4, 0.08, PAL.metalDark, { outline: false });
    this.world.addBox(19.5, -26, 22, -23.2, { h: 2.4 });
    this.containers.push({ id: 'freezer', name: 'Walk-in Freezer', x: 20.75, z: -22.5, cap: 3, yaw: Math.PI });
    P.counter(L, 18.2, -19.6, 3.2, 1.3, 0, 0xd8e0e8, 0xb8c4cc);
    this.A('chef_island', 18.2, -18.55, Math.PI);
    this.A('cook_island', 18.2, -20.65, 0);
    this.A('cook_stove', 16.0, -24.55, Math.PI);
    s.block(21.45, 0, -16.1, 0.9, 2.1, 1.0, 0xe8eef2);
    s.box(20.98, 1.3, -16.1, 0.04, 0.5, 0.06, PAL.metalDark, { outline: false });
    this.world.addRect(21.45, -16.1, 0.9, 1.0, { h: 2.1 });
    P.counter(L, 21.5, -22.4, 0.8, 1.4, 0, 0xd8e0e8, 0xb8c4cc);
    P.shelfUnit(L, 14.4, -21.7, Math.PI / 2, 2.4, 2.0, true);
    this.A('kitchen_sink', 20.7, -22.4, Math.PI / 2);
    this.A('kitchen_back', 21.0, -20, -Math.PI / 2);
    this.A('kitchen_fridge', 20.5, -16.1, Math.PI / 2);
    this.items.push({ id: 'pan', x: 17.1, z: -25.35, y: 0.98 });
    this.items.push({ id: 'cleaver', x: 18.9, z: -19.6, y: 1.0 });
    this.items.push({ id: 'ratpoison', x: 21.5, z: -22.0, y: 0.98 });
    this.items.push({ id: 'baguette', x: 17.6, z: -19.4, y: 1.0 });

    // ---- Security office
    P.desk(L, -19.4, -11.4, Math.PI / 2, { w: 2.0, monitor: true });
    P.chair(L, -18.4, -11.4, Math.PI / 2 + Math.PI, 0x3a3a48, 0x2a2a38);
    this.A('security_desk', -18.3, -11.4, -Math.PI / 2);
    this.items.push({ id: 'keycard', x: -19.2, z: -12.0, y: 0.82 });
    P.locker(L, -21.4, -8.4, Math.PI / 2, 0x5a6f8a, 3);
    this.hideSpots.push({ id: 'seclocker', name: 'Locker', x: -20.9, z: -8.4, yaw: -Math.PI / 2, kind: 'locker' });
    this.items.push({ id: 'outfit_guard', x: -20.2, z: -9.6, y: 0.0 });
    P.counter(L, -13.6, -13.2, 2.4, 0.8, 0, 0x5a6470, 0x8a949e, 0.95);
    this.env.box(-13.6, 1.25, -13.4, 2.0, 0.6, 0.1, 0x2a2430);
    for (let i = 0; i < 4; i++) this.env.box(-14.4 + i * 0.5, 1.25, -13.34, 0.4, 0.45, 0.02, [0x5ad0ff, 0x7fef9f, 0x5ad0ff, 0xffd96a][i], { outline: false });
    this.A('security_monitors', -13.6, -12.4, Math.PI);
    this.A('security_lockers', -20.4, -8.4, -Math.PI / 2);
    P.plantPot(L, -12.7, -7.6, 0.8);

    // ---- Lounge
    P.fireplace(L, -17, -6.55, 0);
    P.rug(L, -17, -3.6, 5, 3.4, 0x3d6fb6, 0xe4b84a);
    P.sofa(L, -17, -2.1, Math.PI, 0x3d6fb6, 2.4);
    P.armchair(L, -19.8, -4.2, Math.PI / 2, 0xe4b84a);
    P.armchair(L, -14.2, -4.2, -Math.PI / 2, 0xe4b84a);
    P.table(L, -17, -4.1, { r: 0.5, flowers: false, glasses: true });
    P.bookshelf(L, -12.35, -6.0, -Math.PI / 2, 1.6);
    P.plantPot(L, -21.3, -0.8, 1, 'palm');
    P.plantPot(L, -12.7, -0.8, 0.9, 'flower');
    this.A('lounge_sofa', -17, -2.0, Math.PI, { sit: true });
    this.A('lounge_chairL', -19.7, -4.2, Math.PI / 2, { sit: true });
    this.A('lounge_chairR', -14.3, -4.2, -Math.PI / 2, { sit: true });
    this.A('lounge_fire', -17, -5.6, Math.PI);
    P.wardrobe(L, -21.4, -5.6, Math.PI / 2, PAL.woodDark);
    this.hideSpots.push({ id: 'lounge_wardrobe', name: 'Wardrobe', x: -20.7, z: -5.6, yaw: -Math.PI / 2, kind: 'wardrobe' });

    // ---- Gallery
    P.painting(L, -9, -13.85, 0, 1.8, 1.3, 1.6, [0xf4e4c4, 0x3a6aa8, 0xe8c070, 0x2a2430, PAL.red, 0xffffff]);
    this.A('vex_painting', -9, -12.6, Math.PI);
    P.painting(L, -11.85, -6.5, Math.PI / 2, 1.4, 1.0, 1.6);
    P.painting(L, -2.15, -7.5, -Math.PI / 2, 1.2, 1.4, 1.6, [0xffe0a0, PAL.teal, PAL.pink, PAL.blue]);
    P.painting(L, -6.0, -13.85, 0, 1.0, 0.8, 1.6, [0xe8f0e0, PAL.leaf, PAL.yellow]);
    this.A('statue_topple', -7.5, -11.7, 0);
    P.statue(L, -7, -6.6, 0.3, 'bust');
    P.statue(L, -4.2, -1.6, -0.4, 'fish');
    P.bench(L, -9, -9.8, Math.PI);
    P.bench(L, -5.5, -4.2, Math.PI / 2);
    this.A('gallery_bench', -9, -9.7, Math.PI, { sit: true });
    this.A('gallery_view1', -6.0, -12.7, Math.PI);
    this.A('gallery_view2', -3.3, -7.5, Math.PI / 2);
    this.A('gallery_view3', -10.6, -6.5, -Math.PI / 2);
    // suits of armour (hiding)
    for (const [x, z, id, yaw] of [[-11.45, -1.0, 'armour1', Math.PI / 2], [-2.55, -13.3, 'armour2', -Math.PI / 2]]) {
      s.block(x, 0, z, 0.7, 0.2, 0.7, PAL.woodDark);
      s.cyl(x, 0.2, z, 0.22, 1.0, 0xb8c4d0);
      s.ball(x, 1.45, z, 0.24, 0xb8c4d0);
      s.box(x, 1.45, z, 0.5, 0.06, 0.5, 0x2a2430, { outline: false, ry: yaw });
      s.cone(x, 1.65, z, 0.08, 0.3, PAL.red, { outline: false });
      this.world.addRect(x, z, 0.6, 0.6, { h: 1.7, sight: 'low' });
      this.hideSpots.push({ id, name: 'Suit of Armour', x: x + Math.sin(yaw) * 0.7, z: z + Math.cos(yaw) * 0.7, yaw: yaw + Math.PI, kind: 'armour', ax: x, az: z });
    }

    // ---- Foyer
    P.rug(L, 2, -4, 2.6, 7, PAL.carpetRed, PAL.carpetGold);
    P.column(L, -1.2, -1, 0.28);
    P.column(L, 5.2, -1, 0.28);
    P.column(L, -1.2, -7, 0.28);
    P.column(L, 5.2, -7, 0.28);
    P.counter(L, 4.8, -4.6, 0.7, 2.2, 0, PAL.woodDark, PAL.marble, 1.0);
    this.A('reception', 5.5, -4.6, -Math.PI / 2);
    this.A('foyer_greet', 2, -2.6, 0);
    this.A('foyer_guest', 2.2, -1.4, Math.PI);
    P.plantPot(L, -1.3, -4.2, 0.9, 'flower');
    P.painting(L, -0.3, -7.85, 0, 1.0, 1.3, 1.6, [0x7a3a8a, 0xffd9bd, PAL.gold, 0x2a2430]);
    this.A('foyer_inside', 2, -3, Math.PI);

    // ---- Restroom
    for (const [i, x] of [[0, 7.6], [1, 9.6], [2, 11.6]].map((v) => v)) {
      P.stall(L, x, -7.05, 0, 1.8, 1.7, 0x8fc9d6);
      P.toilet(L, x, -7.45, 0);
      this.A(`toilet${i}`, x, -6.6, Math.PI);
    }
    P.sinkVanity(L, 13.45, -3.5, -Math.PI / 2, 3);
    this.A('sink0', 12.7, -4.4, Math.PI / 2);
    this.A('sink1', 12.7, -2.6, Math.PI / 2);
    P.plantPot(L, 6.6, -0.7, 0.7);

    // ---- Staff quarters
    P.locker(L, 14.45, -4.0, -Math.PI / 2 + Math.PI, 0x8fa8c8, 4);
    this.hideSpots.push({ id: 'staff_locker', name: 'Locker', x: 15.0, z: -2.8, yaw: -Math.PI / 2, kind: 'locker' });
    this.items.push({ id: 'outfit_waiter', x: 15.2, z: -5.4, y: 0 });
    P.bed(L, 21.0, -12.2, -Math.PI / 2, 0x8fc9d6);
    P.bed(L, 21.0, -7.4, -Math.PI / 2, 0xf59ac4);
    P.table(L, 17.2, -9.0, { r: 0.55, cloth: PAL.woodLight, flowers: false });
    this.A('staff_table1', 17.2, -10.0, 0, { sit: true });
    this.A('staff_table2', 18.2, -9.0, -Math.PI / 2, { sit: true });
    P.chair(L, 17.2, -10.0, 0, PAL.wood, PAL.wood);
    P.chair(L, 18.2, -9.0, -Math.PI / 2, PAL.wood, PAL.wood);
    for (const [x, z, id] of [[15.0, -0.75, 'laundry1'], [16.1, -0.75, 'laundry2']]) {
      P.laundryBasket(L, x, z);
      this.containers.push({ id, name: 'Laundry Basket', x, z: z - 0.9, cap: 1, yaw: 0 });
    }
    this.env.block(20.0, 0, -0.65, 0.9, 0.9, 0.8, 0xf0f4f8);
    this.env.cyl(20.0, 0.45, -0.24, 0.28, 0.02, 0x5ad0ff, { rx: Math.PI / 2, outline: false });
    this.env.block(21.0, 0, -0.65, 0.9, 0.9, 0.8, 0xf0f4f8);
    this.env.cyl(21.0, 0.45, -0.24, 0.28, 0.02, 0x5ad0ff, { rx: Math.PI / 2, outline: false });
    this.world.addBox(19.5, -1.1, 21.6, -0.2, { h: 0.9, sight: 'low' });
    P.wardrobe(L, 21.45, -2.8, -Math.PI / 2);
    this.hideSpots.push({ id: 'staff_wardrobe', name: 'Wardrobe', x: 20.75, z: -2.8, yaw: Math.PI / 2, kind: 'wardrobe' });
    this.A('staff_iron', 18.5, -4.5, 0);
    this.A('staff_lockers', 15.2, -4.0, -Math.PI / 2);

    // Manor roof
    const roof = new MeshSink({ chunk: 1000, outline: 0.04 });
    P.hipRoof(roof, 0, -13, 44.8, 26.8, 5.5, 2.62, PAL.roof, PAL.roofDark, 0.7);
    roof.block(-12, 5.5, -18, 1.2, 2.4, 1.2, 0xc8a080);
    roof.block(14, 5.0, -6, 1.2, 2.4, 1.2, 0xc8a080);
    this.roofs.push({ id: 'manor', sink: roof, ...this.buildings.manor });
  }

  // ------------------------------------------------------------------ terrace
  buildTerrace() {
    const L = this;
    P.floor(L, -26, -34, 26, -26, 'stone', { a: 0xe8dcc4, b: 0xcfc2a8, tile: 1.6 });
    this.zone('terrace', 'Cliff Terrace', 'public', -26, -34.5, 26, -26, { outdoor: true });
    const rail = [];
    for (let x = -26; x < 26; x += 4) {
      const x2 = Math.min(x + 4, 26);
      if (x2 > -16 && x < -12) continue;
      rail.push(P.railing(L, x, -33.5, x2, -33.5));
    }
    // The loose railing section (set-piece).
    this.A('rail_loose', -14, -33.5, 0);
    this.A('vex_smoke', -14, -32.6, Math.PI);
    this.dumpSpots.push({ x1: -26, z1: -33.2, x2: 26, z2: -33.2, nx: 0, nz: -1, name: 'Throw over the cliff', y: -1.6 });
    P.umbrellaTable(L, -6, -30, PAL.teal);
    P.umbrellaTable(L, 1, -29.4, PAL.red);
    P.umbrellaTable(L, 15, -30, PAL.yellow);
    for (const [x, z] of [[-20, -30.5], [-18.6, -30.5], [8, -31], [9.4, -31]]) P.deckChair(L, x, z, Math.PI, PAL.blue);
    this.A('terrace_chair1', -20, -30.2, Math.PI, { lie: true });
    this.A('terrace_chair2', 8, -30.7, Math.PI, { lie: true });
    this.A('terrace_table1', -6, -31.0, 0);
    this.A('terrace_table2', 1, -30.4, 0);
    this.A('terrace_table3', 1, -28.4, Math.PI);
    this.A('terrace_view1', 4, -32.7, Math.PI);
    this.A('terrace_view2', -2, -32.7, Math.PI);
    this.A('terrace_door', 6, -27.0, Math.PI);
    for (const x of [-20, -10, 0, 12, 20]) P.plantPot(L, x, -26.6, 1.0, x % 20 === 0 ? 'palm' : 'flower');
    // telescope
    const s = this.env;
    s.cyl(19, 0, -32.9, 0.08, 1.1, PAL.metalDark);
    s.cyl(19, 1.2, -33.1, 0.12, 0.7, PAL.gold, { rx: 1.2 });
    this.world.addCircle(19, -32.9, 0.2, { h: 1.3, sight: 'none' });
    this.A('telescope', 19, -32.2, Math.PI);
    // paths east/west
    P.floor(L, 22, -32, 30, -28, 'stone', { a: 0xe8dcc4, b: 0xcfc2a8, tile: 1.6 });
    P.floor(L, -34, -32, -26, -28, 'path');
  }

  // ------------------------------------------------------------------ spa
  buildSpa() {
    const L = this;
    const W = (x1, z1, x2, z2, o) => P.wall(L, x1, z1, x2, z2, o);
    const spa = 0xd8f0ea, ET = 0.35;
    P.floor(L, 28, -28, 42, -16, 'tiles', { a: 0xf4fbf8, b: 0xc8e8e0, tile: 0.8 });
    W(28, -28, 42, -28, { t: ET, a: EXT, b: spa, windows: [[31.5, 2.4], [38.5, 1.8]] });
    W(28, -16, 42, -16, { t: ET, a: spa, b: EXT, windows: [[33, 1.6], [38, 1.6]] });
    W(28, -28, 28, -16, { t: ET, a: EXT, b: spa, doors: [[-18, 1.6]] });
    W(42, -28, 42, -16, { t: ET, a: spa, b: EXT });
    W(28, -20, 42, -20, { a: spa, b: spa, doors: [[31.5, 1.6], [38.5, 1.6]] });
    W(35, -28, 35, -20, { a: spa, b: spa });
    this.zone('spa', 'Spa', 'spa', 28, -28, 42, -16, { building: 'spa' });
    this.zone('spa_lobby', 'Spa Lobby', 'spa', 28, -20, 42, -16, { building: 'spa' });
    this.buildings.spa = { minX: 28, maxX: 42, minZ: -28, maxZ: -16 };
    // hot tub
    const s = this.env;
    s.cyl(31.5, 0, -24.2, 1.9, 0.75, 0xb89878);
    s.cyl(31.5, 0.72, -24.2, 2.0, 0.08, 0xd8c0a0);
    this.world.addCircle(31.5, -24.2, 1.95, { h: 0.8, sight: 'none', tag: 'hottub' });
    this.waterDiscs.push({ x: 31.5, z: -24.2, r: 1.75, y: 0.62, mat: makePoolWaterMaterial(0x7fe8f0) });
    this.A('hottub', 31.5, -24.2, Math.PI * 0.75, { y: 0.2 });
    this.A('hottub_radio', 33.7, -22.4, -2.2);
    s.block(33.9, 0, -22.1, 0.6, 0.6, 0.6, PAL.woodLight);
    this.world.addRect(33.9, -22.1, 0.6, 0.6, { h: 0.6, sight: 'none' });
    P.plantPot(L, 28.8, -27.3, 1.0, 'palm');
    P.plantPot(L, 34.3, -27.3, 0.9, 'tall');
    P.towelStack(L, 29.0, -21.0);
    // massage room
    P.massageTable(L, 38.5, -24.2, 0);
    this.A('massage_table', 38.5, -23.45, Math.PI, { y: 0.62 });
    this.A('massage_therapist', 37.6, -24.0, Math.PI / 2);
    P.wardrobe(L, 41.4, -26.8, -Math.PI / 2, 0xe8e0d0);
    this.hideSpots.push({ id: 'spa_closet', name: 'Linen Closet', x: 40.7, z: -26.8, yaw: Math.PI / 2, kind: 'wardrobe' });
    P.plantPot(L, 35.7, -27.3, 0.8, 'flower');
    for (const [x, z] of [[41.4, -21.0], [36.0, -21.0]]) {
      s.cyl(x, 0, z, 0.2, 0.7, PAL.woodLight);
      s.cyl(x, 0.7, z, 0.06, 0.12, PAL.cream, { outline: false });
      s.ball(x, 0.88, z, 0.04, PAL.orange, { lo: true, outline: false });
    }
    // lobby
    P.counter(L, 36.5, -17.75, 3.0, 0.7, 0, 0xc8e8e0, PAL.marble, 1.0);
    this.A('spa_reception', 36.5, -16.75, Math.PI);
    this.A('spa_reception_in', 36.5, -18.4, 0);
    P.plantPot(L, 29.0, -16.8, 0.9, 'palm');
    P.plantPot(L, 41.2, -16.8, 0.9, 'palm');
    P.towelStack(L, 34.5, -16.9);
    P.locker(L, 41.45, -18.4, -Math.PI / 2, 0xa8e0d0, 2);
    this.items.push({ id: 'outfit_masseur', x: 40.6, z: -18.4, y: 0 });
    this.A('spa_entrance', 26.8, -18, -Math.PI / 2);
    const roof = new MeshSink({ chunk: 1000, outline: 0.04 });
    P.hipRoof(roof, 35, -22, 14.7, 12.7, 3.2, 2.62, PAL.roofTeal, 0x2f7f7b, 0.6);
    this.roofs.push({ id: 'spa', sink: roof, ...this.buildings.spa });
    P.floor(L, 22, -21, 28, -15, 'stone', { a: 0xe8dcc4, b: 0xcfc2a8 });
    P.floor(L, 28.5, -15, 31, -8, 'stone', { a: 0xe8dcc4, b: 0xcfc2a8 });
  }

  // ------------------------------------------------------------------ pool
  buildPool() {
    const L = this;
    const s = this.env;
    P.floor(L, 24, -12, 44, 4, 'tiles', { a: 0xf8f2e4, b: 0xe8dcc4, tile: 1 });
    this.zone('pool', 'Pool Deck', 'public', 24, -12, 46, 4, { outdoor: true });
    // pool basin
    s.block(34, -0.02, -4, 12.4, 0.12, 8.4, 0xffffff);
    this.waterDiscs.push({ rect: true, x: 34, y: 0.12, z: -4, w: 12, d: 8, mat: makePoolWaterMaterial(0x4fd0f0) });
    this.world.addBox(28, -8, 40, 0, { h: 0.2, sight: 'none', tag: 'pool' });
    // diving board
    s.block(34, 0, 0.6, 0.8, 0.5, 0.6, PAL.white);
    s.block(34, 0.5, -0.4, 0.5, 0.06, 2.4, PAL.blue);
    this.world.addRect(34, 0.6, 0.8, 0.6, { h: 0.5, sight: 'none' });
    for (const [x, z] of [[26.5, -9], [26.5, -6.5], [26.5, -4], [42, -9], [42, -6.5]]) P.deckChair(L, x, z, x < 30 ? Math.PI / 2 : -Math.PI / 2, x < 30 ? PAL.red : PAL.yellow);
    this.A('pool_chair1', 26.6, -9, Math.PI / 2, { lie: true });
    this.A('pool_chair2', 26.6, -4, Math.PI / 2, { lie: true });
    this.A('pool_chair3', 41.9, -6.5, -Math.PI / 2, { lie: true });
    P.umbrellaTable(L, 26.5, -1.5, PAL.blue);
    P.umbrellaTable(L, 42, -2.5, PAL.pink);
    this.A('pool_table', 27.5, -1.5, -Math.PI / 2);
    this.A('pool_edge1', 33, 0.9, Math.PI);
    this.A('pool_edge2', 41, -1.0, -Math.PI / 2);
    this.A('pool_swim', 34, -4, 0);
    // flamingo float (cute)
    s.push(31.5, 0.15, -5.5, 0.6);
    s.prim(new THREE.TorusGeometry(0.5, 0.2, 8, 16).rotateX(Math.PI / 2), 0, 0.05, 0, 1, 1, 1, PAL.pink);
    s.cyl(0.4, 0.05, 0, 0.08, 0.7, PAL.pink, { rz: -0.3 });
    s.ball(0.55, 0.8, 0, 0.14, PAL.pink);
    s.cone(0.7, 0.75, 0, 0.05, 0.15, PAL.yellow, { rz: -Math.PI / 2, outline: false });
    s.pop();
    // pool bar
    P.counter(L, 43.2, -10.5, 2.4, 0.8, Math.PI / 2, 0xf7d44c, 0xffffff, 1.0);
    this.A('poolbar', 43.9, -10.5, -Math.PI / 2);
    this.A('poolbar_guest', 42.3, -10.5, Math.PI / 2);
    P.plantPot(L, 44.5, -1, 1.1, 'palm');
    P.tree(L, 45, 2, 'palm', 1.0);
    P.tree(L, 24.8, 3, 'palm', 0.9);
  }

  // ------------------------------------------------------------------ gym
  buildGym() {
    const L = this;
    const W = (x1, z1, x2, z2, o) => P.wall(L, x1, z1, x2, z2, o);
    const gym = 0xf0d8c0, ET = 0.35;
    P.floor(L, 30, 6, 40, 18, 'tiles', { a: 0x3a4a6a, b: 0x2f3c58, tile: 1 });
    P.floor(L, 40, 6, 44, 11, 'planks', { a: 0xd9a46b, b: 0xc8935a });
    P.floor(L, 40, 11, 44, 18, 'tiles', { a: 0xe8eef0, b: 0xc8d0d4, tile: 0.5 });
    W(30, 6, 44, 6, { t: ET, a: EXT, b: gym, windows: [[33, 1.8], [37, 1.8]] });
    W(30, 18, 44, 18, { t: ET, a: gym, b: EXT, windows: [[34, 1.8], [42, 1.4, 'climb']] });
    W(30, 6, 30, 18, { t: ET, a: EXT, b: gym, doors: [[12, 1.8]], windows: [[8.5, 1.4]] });
    W(44, 6, 44, 18, { t: ET, a: gym, b: EXT });
    W(40, 6, 40, 11, { a: gym, b: 0xc89a6a, doors: [[8.5, 1.2]] });
    this.A('sauna_door', 40, 8.5, Math.PI / 2);
    W(40, 11, 44, 11, { a: 0xc89a6a, b: gym });
    W(40, 11, 40, 18, { a: gym, b: gym, doors: [[14.5, 1.4]] });
    this.zone('gym', 'Gym', 'gym', 30, 6, 44, 18, { building: 'gym' });
    this.zone('sauna', 'Sauna', 'gym', 40, 6, 44, 11, { building: 'gym' });
    this.buildings.gym = { minX: 30, maxX: 44, minZ: 6, maxZ: 18 };
    // bench press (set-piece adds barbell)
    const s = this.env;
    s.block(33.2, 0, 10.4, 0.5, 0.45, 1.6, PAL.black);
    s.block(33.2, 0.45, 10.4, 0.45, 0.06, 1.5, PAL.red, { outline: false });
    for (const sx of [-0.6, 0.6]) s.block(33.2 + sx, 0, 9.85, 0.08, 1.15, 0.08, PAL.metal);
    this.world.addRect(33.2, 10.4, 1.3, 1.7, { h: 0.6, sight: 'none' });
    this.A('bench', 33.2, 11.15, 0);
    this.A('bench_spot', 33.2, 9.0, 0);
    P.weightsRack(L, 31.2, 16.8, Math.PI);
    P.punchingBag(L, 31.4, 13.6);
    this.A('punchbag', 32.2, 13.6, -Math.PI / 2);
    P.treadmill(L, 37.6, 8.0, 0);
    P.treadmill(L, 38.8, 8.0, 0);
    P.boxingRing(L, 36.2, 14.4, 4.4);
    this.A('ring1', 35.4, 14.4, Math.PI / 2, { y: 0.6 });
    this.A('ring2', 37.0, 14.4, -Math.PI / 2, { y: 0.6 });
    P.plantPot(L, 30.8, 6.8, 0.8, 'tall');
    // sauna interior
    s.block(43.4, 0, 8.5, 0.9, 0.45, 4.2, PAL.woodLight);
    s.block(42.0, 0, 6.6, 3.0, 0.45, 0.9, PAL.woodLight);
    this.world.addBox(42.9, 6.4, 44, 10.8, { h: 0.5, sight: 'none' });
    s.block(41.0, 0, 10.4, 0.7, 0.7, 0.6, 0x5a5a64);
    for (let i = 0; i < 6; i++) s.ball(40.8 + (i % 3) * 0.2, 0.75, 10.3 + Math.floor(i / 3) * 0.2, 0.09, 0x8a8a94, { lo: true, outline: false });
    this.world.addRect(41.0, 10.4, 0.7, 0.6, { h: 0.8, sight: 'none' });
    this.A('sauna_sit', 43.1, 8.5, -Math.PI / 2, { sit: true, y: 0.0 });
    this.A('sauna_panel', 39.6, 9.6, Math.PI / 2);
    s.block(39.86, 1.0, 9.6, 0.1, 0.5, 0.4, PAL.metalDark);
    s.box(39.8, 1.3, 9.6, 0.02, 0.12, 0.2, PAL.red, { outline: false });
    // locker room
    P.locker(L, 43.45, 15.5, -Math.PI / 2, 0xe0453a, 3);
    this.items.push({ id: 'outfit_trainer', x: 42.6, z: 16.6, y: 0 });
    this.hideSpots.push({ id: 'gym_locker', name: 'Locker', x: 42.8, z: 14.3, yaw: Math.PI / 2, kind: 'locker' });
    s.block(43.5, 0, 12.1, 0.8, 1.6, 0.8, 0xffffff);
    s.box(43.08, 1.0, 12.1, 0.02, 0.8, 0.6, PAL.glass, { outline: false });
    this.world.addRect(43.5, 12.1, 0.8, 0.8, { h: 1.6 });
    this.A('shake_fridge', 42.6, 12.1, Math.PI / 2);
    P.bench(L, 41.0, 17.4, Math.PI);
    const roof = new MeshSink({ chunk: 1000, outline: 0.04 });
    P.hipRoof(roof, 37, 12, 14.7, 12.7, 3.0, 2.62, 0x4a7fd6, 0x3a6ab8, 0.6);
    this.roofs.push({ id: 'gym', sink: roof, ...this.buildings.gym });
    this.A('gym_door_out', 28.8, 12, Math.PI / 2);
    P.floor(L, 24, 10.5, 30, 13.5, 'path');
  }

  // ------------------------------------------------------------------ garden
  buildGarden() {
    const L = this;
    // main path & plaza
    P.floor(L, 0.4, 0.3, 3.6, 9.2, 'path');
    P.floor(L, 0.4, 18.8, 3.6, 31, 'path');
    const s = this.env;
    // plaza circle (stone)
    s.cyl(2, -0.05, 14, 5.2, 0.08, 0xe0d4bc, { outline: false, seg: 0 });
    P.fountain(L, 2, 14, 2.3);
    this.A('fountain_n', 2, 11.2, 0);
    this.A('fountain_e', 4.9, 14, -Math.PI / 2);
    this.A('fountain_w', -0.9, 14, Math.PI / 2);
    this.A('fountain_s', 2, 16.9, Math.PI);
    for (const [x, z] of [[-2.2, 10.5], [6.2, 10.5], [-2.2, 17.5], [6.2, 17.5]]) P.lampPost(L, x, z);
    // front door area
    P.floor(L, -4, 0.3, 8, 3, 'stone', { a: 0xe8dcc4, b: 0xcfc2a8 });
    this.A('door_guard1', 0.2, 1.7, 0.3);
    this.A('door_guard2', 3.8, 1.7, -0.3);
    this.A('front_door_out', 2, 2.2, Math.PI);
    this.A('front_door_in', 2, -1.6, Math.PI);
    for (const x of [-3.5, 7.5]) P.plantPot(L, x, 1.6, 1.1, 'palm');
    // side paths
    P.floor(L, 3.6, 4.0, 24, 6.0, 'path');
    P.floor(L, 22.5, -15, 25, 6, 'path');
    P.floor(L, -22, 4.0, 0.4, 6.0, 'path');

    // Party lawn (west)
    this.zone('party', 'Garden Party', 'public', -22, 6, -2, 20, { outdoor: true });
    P.stringLights(L, [[-20, 7], [-12, 9], [-4, 7]], 3.0, 0.5);
    P.stringLights(L, [[-20, 18], [-12, 16], [-4, 18]], 3.0, 0.5);
    for (const [x, z] of [[-20, 7], [-4, 7], [-20, 18], [-4, 18], [-12, 9], [-12, 16]]) P.pole(L, x, z, 3.0);
    const ptables = [[-17, 10.5], [-8, 10.5], [-16, 15], [-7.5, 15]];
    ptables.forEach(([x, z], i) => {
      P.umbrellaTable(L, x, z, [PAL.red, PAL.teal, PAL.yellow, PAL.pink][i]);
      this.A(`ptable${i}a`, x + 1.0, z, -Math.PI / 2);
      this.A(`ptable${i}b`, x - 1.0, z, Math.PI / 2);
    });
    P.buffet(L, -12, 19.3, Math.PI, 4);
    this.A('party_buffet', -12, 18.3, 0);
    P.champagneTower(L, -12, 12.6);
    // DJ booth
    s.block(-21.2, 0, 12.6, 1.2, 1.0, 2.4, PAL.black);
    s.box(-20.58, 0.7, 12.6, 0.02, 0.3, 2.2, PAL.purple, { outline: false });
    s.cyl(-21.2, 1.0, 12.0, 0.25, 0.04, 0x2a2430, { outline: false });
    s.cyl(-21.2, 1.0, 13.2, 0.25, 0.04, 0x2a2430, { outline: false });
    for (const z of [10.6, 14.6]) {
      s.block(-21.3, 0, z, 0.8, 1.6, 0.8, 0x2a2430);
      s.cyl(-20.88, 1.1, z, 0.25, 0.04, 0x5a5a64, { rz: Math.PI / 2, outline: false });
      s.cyl(-20.88, 0.5, z, 0.3, 0.04, 0x5a5a64, { rz: Math.PI / 2, outline: false });
      this.world.addRect(-21.3, z, 0.8, 0.8, { h: 1.6 });
    }
    this.world.addRect(-21.2, 12.6, 1.2, 2.4, { h: 1.0, sight: 'low' });
    this.A('dj', -22.1, 12.6, Math.PI / 2);
    this.A('party_dance0', -18.4, 12.4, -1.2);
    this.A('party_dance1', -17.6, 13.4, 2.2);
    this.A('party_dance2', -18.8, 13.8, 0.9);
    this.A('party_mingle0', -12.5, 11.2, 2.6);
    this.A('party_mingle1', -11.5, 11.8, -2.6);
    this.A('party_mingle2', -6.0, 12.6, 0.4);
    this.A('party_mingle3', -5.5, 13.6, -2.8);
    // hedges framing lawn
    P.hedge(L, -23, 20.5, -14.5, 21.3, 1.1);
    P.hedge(L, -9.5, 20.5, -1.5, 21.3, 1.1);
    P.hedge(L, -23, 3.0, -23.8, 20.5, 1.1);
    for (const [x, z] of [[-2.5, 8], [-2.5, 19]]) P.bush(L, x, z, 1.0, PAL.flowerPink);

    // East garden + gazebo
    this.zone('egarden', 'Rose Garden', 'public', 6, 6, 26, 22, { outdoor: true });
    this.buildGazebo(14, 12);
    this.A('gazebo1', 13.0, 12.0, Math.PI / 2);
    this.A('gazebo2', 15.0, 12.0, -Math.PI / 2);
    this.A('gazebo3', 14.0, 13.1, Math.PI);
    P.flowerBed(L, 7.5, 7.8, 10.5, 9.8);
    P.flowerBed(L, 17.5, 7.8, 20.5, 9.8);
    P.flowerBed(L, 7.5, 14.4, 10.5, 16.4);
    P.flowerBed(L, 17.5, 14.4, 20.5, 16.4);
    P.hedge(L, 6.5, 19.5, 12, 20.3, 1.1);
    P.hedge(L, 21, 7.5, 21.8, 14, 1.1);
    P.statue(L, 8.2, 18.0, 0.6, 'thinker');
    P.bench(L, 10.5, 18.3, Math.PI);
    P.bench(L, 17.6, 18.5, Math.PI);
    this.A('egarden_bench', 10.5, 18.2, Math.PI, { sit: true });
    this.A('egarden_bench2', 17.6, 18.4, Math.PI, { sit: true });
    this.A('rose_view', 9.2, 10.6, Math.PI);
    for (const [x, z] of [[6.5, 22.5], [24.5, 8], [-1, 24], [5, 24.5], [12.5, 23.6]]) P.tree(L, x, z, 'round', 0.9 + (x % 3) * 0.08);
    for (const [x, z, c] of [[7, 3.4, PAL.flowerYellow], [9.4, 3.2, null], [-6, 3.4, PAL.flowerPink], [-9, 3.2, null], [12, 3.3, PAL.flowerWhite]]) P.bush(L, x, z, 0.9, c);
    this.hideSpots.push({ id: 'bush_front', name: 'Bush', x: 9.4, z: 4.1, yaw: 0, kind: 'bush' });
    this.containers.push({ id: 'bush_front_c', name: 'Bush', x: 9.4, z: 4.2, cap: 1, yaw: 0, bush: true, bx: 9.4, bz: 3.2 });

    // Gardener's shed
    const W = (x1, z1, x2, z2, o) => P.wall(L, x1, z1, x2, z2, o);
    P.floor(L, 18, 16, 24, 22, 'planks', { a: 0xb8885a, b: 0xa87848 });
    const shedC = 0xe8d0a0;
    W(18, 16, 24, 16, { t: 0.3, a: 0x8a6a4a, b: shedC, windows: [[21, 1.2]] });
    W(18, 22, 24, 22, { t: 0.3, a: shedC, b: 0x8a6a4a });
    W(18, 16, 18, 22, { t: 0.3, a: 0x8a6a4a, b: shedC, doors: [[19, 1.6]] });
    W(24, 16, 24, 22, { t: 0.3, a: shedC, b: 0x8a6a4a });
    this.zone('shed', 'Gardener’s Shed', 'garden', 18, 16, 24, 22, { building: 'shed' });
    this.buildings.shed = { minX: 18, maxX: 24, minZ: 16, maxZ: 22 };
    P.workbench(L, 21, 21.4, Math.PI);
    this.items.push({ id: 'shovel', x: 23.4, z: 19, y: 0.05 });
    this.items.push({ id: 'banana', x: 20.4, z: 21.3, y: 0.92 });
    this.items.push({ id: 'shears', x: 21.6, z: 21.3, y: 0.92 });
    this.env.block(23.3, 0, 17.0, 0.9, 0.7, 1.2, 0xc0603a);
    this.world.addRect(23.3, 17.0, 0.9, 1.2, { h: 0.7, sight: 'low' });
    this.A('gardener_bench', 21, 20.6, 0);
    P.wardrobe(L, 18.7, 21.3, Math.PI / 2, 0x8a6a4a);
    this.hideSpots.push({ id: 'shed_closet', name: 'Tool Closet', x: 19.4, z: 21.3, yaw: -Math.PI / 2, kind: 'wardrobe' });
    this.containers.push({ id: 'compost', name: 'Compost Bin', x: 23.0, z: 15.1, cap: 2, yaw: Math.PI });
    P.dumpster(L, 23.0, 14.0, 0, 0x6a8a3a);
    this.items.push({ id: 'outfit_gardener', x: 19.6, z: 17.0, y: 0 });
    const roof = new MeshSink({ chunk: 1000, outline: 0.04 });
    P.hipRoof(roof, 21, 19, 6.6, 6.6, 2.2, 2.62, 0x8a5a3a, 0x7a4a2a, 0.5);
    this.roofs.push({ id: 'shed', sink: roof, ...this.buildings.shed });
  }

  buildGazebo(x, z) {
    const s = this.env;
    s.cyl(x, 0, z, 3.0, 0.06, PAL.white, { seg: 8 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const px = x + Math.cos(a) * 2.7, pz = z + Math.sin(a) * 2.7;
      s.cyl(px, 0.2, pz, 0.12, 2.4, PAL.white, { seg: 8 });
      this.world.addCircle(px, pz, 0.15, { h: 2.6, sight: 'none' });
      if (i !== 7 && i !== 3) s.box(x + Math.cos(a + Math.PI / 8) * 2.6, 0.7, z + Math.sin(a + Math.PI / 8) * 2.6, 2.0, 0.08, 0.08, PAL.white, { ry: -a - Math.PI / 8 + Math.PI / 2, outline: false });
    }
    const roof = new MeshSink({ chunk: 1000, outline: 0.04 });
    roof.cone(x, 2.6, z, 3.6, 1.8, PAL.roofTeal, { seg: 8 });
    roof.ball(x, 4.45, z, 0.18, PAL.gold);
    this.roofs.push({ id: 'gazebo', sink: roof, minX: x - 3, maxX: x + 3, minZ: z - 3, maxZ: z + 3 });
    this.buildings.gazebo = { minX: x - 3, maxX: x + 3, minZ: z - 3, maxZ: z + 3 };
    this.zone('gazebo', 'Gazebo', 'public', x - 3, z - 3, x + 3, z + 3, { building: 'gazebo', outdoor: true });
  }

  // ------------------------------------------------------------------ dock
  buildDock() {
    const L = this;
    const s = this.env;
    P.floor(L, -24, 26, 26, 32, 'planks', { a: 0xc99561, b: 0xb88450, alongX: false });
    // piers
    P.floor(L, -2, 31.8, 2, 46, 'planks', { a: 0xc99561, b: 0xb88450, alongX: true, y: 0.05 });
    P.floor(L, 15.5, 31.8, 18, 40, 'planks', { a: 0xc99561, b: 0xb88450, alongX: true, y: 0.05 });
    for (let z = 33; z <= 46; z += 2.6) for (const x of [-2, 2]) {
      s.cyl(x, -3, z, 0.18, 3.4, PAL.woodDark, { seg: 8 });
    }
    for (let z = 33; z <= 40; z += 2.4) for (const x of [15.5, 18]) s.cyl(x, -3, z, 0.18, 3.4, PAL.woodDark, { seg: 8 });
    // pier railings (with gaps for boats)
    P.railing(L, -2, 33, -2, 40, PAL.white);
    P.railing(L, 2, 33, 2, 40, PAL.white);
    P.railing(L, -2, 46, 2, 46, PAL.white);
    this.zone('dock', 'Docks', 'public', -24, 24, 26, 48, { outdoor: true });
    this.zone('pier', 'Pier', 'public', -2.2, 31, 2.2, 48, { outdoor: true });
    this.dumpSpots.push({ x1: -2, z1: 40.5, x2: -2, z2: 45.6, nx: -1, nz: 0, name: 'Dump in the sea' });
    this.dumpSpots.push({ x1: 2, z1: 40.5, x2: 2, z2: 45.6, nx: 1, nz: 0, name: 'Dump in the sea' });
    this.dumpSpots.push({ x1: 15.5, z1: 32.5, x2: 15.5, z2: 39.6, nx: -1, nz: 0, name: 'Dump in the sea' });
    this.dumpSpots.push({ x1: -24, z1: 31.6, x2: -3, z2: 31.6, nx: 0, nz: 1, name: 'Dump in the sea' });
    this.dumpSpots.push({ x1: 3, z1: 31.6, x2: 15, z2: 31.6, nx: 0, nz: 1, name: 'Dump in the sea' });
    this.A('player_start', 0, 43.6, Math.PI);
    this.A('taxi', 3.6, 43.2, 0);
    this.A('taxi_exit', 1.4, 43.2, Math.PI / 2);
    this.A('speedboat', 20.2, 36.5, 0);
    this.A('speedboat_exit', 17.6, 36.5, Math.PI / 2);
    this.A('pier_guard', 0.9, 34.2, 0);
    this.A('pier_greeter', -0.9, 38.6, 0.3);
    // Cargo area
    this.zone('cargo', 'Cargo Yard', 'dock', -24, 17, -5, 31.8, { outdoor: true });
    P.floor(L, -24, 17, -5, 26, 'stone', { a: 0xc8c0b0, b: 0xa8a090, tile: 2 });
    const container = (x, z, rot, color) => {
      s.push(x, 0, z, rot);
      s.block(0, 0, 0, 6, 2.6, 2.4, color);
      for (let i = -2.7; i <= 2.7; i += 0.45) s.box(i, 1.3, 1.21, 0.12, 2.5, 0.04, new THREE.Color(color).multiplyScalar(0.82).getHex(), { outline: false });
      for (let i = -2.7; i <= 2.7; i += 0.45) s.box(i, 1.3, -1.21, 0.12, 2.5, 0.04, new THREE.Color(color).multiplyScalar(0.82).getHex(), { outline: false });
      s.pop();
      P.rectCol(L, x, z, 6, 2.4, rot, { h: 2.6 });
    };
    container(-19, 19.6, 0, 0xe0453a);
    container(-19, 22.6, 0, 0x3f7fd6);
    container(-8.5, 19.0, Math.PI / 2, 0x3fae5a);
    P.crate(L, -14, 19.4, 1.2);
    P.crate(L, -13.2, 19.6, 0.8, 0.3, PAL.woodLight, { y: 1.2, collide: false });
    P.crate(L, -15.4, 19.6, 1.0, 0.2);
    P.crate(L, -22.5, 26.5, 1.2);
    P.crate(L, -21.3, 26.5, 1.0, 0.4);
    P.crate(L, -16.6, 24.4, 1.1, 0.1);
    P.barrel(L, -6.5, 24);
    P.barrel(L, -6.5, 25);
    P.barrel(L, -7.4, 24.5);
    // the shipment Brick inspects + crane
    P.crate(L, -9.6, 27.6, 1.0, 0.25, 0xd9a46b);
    P.crate(L, -12.6, 27.6, 1.0, -0.2, 0xd9a46b);
    this.A('shipment', -11.1, 27.2, Math.PI);
    this.A('shipment_worker', -11.0, 29.5, Math.PI);
    this.A('crane_hook', -11.1, 27.2, 0);
    this.A('crane_base', -14.5, 30.4, 0);
    this.A('crane_controls', -16.6, 29.6, Math.PI / 2);
    this.containers.push({ id: 'cargo_crate', name: 'Shipping Crate', x: -15.4, z: 20.8, cap: 2, yaw: Math.PI });
    P.dumpster(L, -22.6, 23.2, Math.PI / 2, 0x3f8a5a);
    this.containers.push({ id: 'dock_dumpster', name: 'Dumpster', x: -21.4, z: 23.2, cap: 2, yaw: -Math.PI / 2 });
    this.A('cargo_guard', -13.0, 23.8, Math.PI / 2);
    this.A('fish_stall', -3.6, 28.6, Math.PI);
    // fish stall
    s.block(-4.6, 0, 28.0, 2.4, 0.9, 0.8, PAL.white);
    for (let i = 0; i < 5; i++) s.sphere(-5.5 + i * 0.45, 0.98, 28.0, 0.18, 0.07, 0.08, [0x7aa8c8, PAL.orange, 0x8ab8d8, PAL.pink, 0x7aa8c8][i], { lo: true });
    for (const x of [-5.7, -3.5]) s.cyl(x, 0, 27.65, 0.04, 2.0, PAL.woodDark, { outline: false });
    s.box(-4.6, 2.0, 27.9, 2.6, 0.1, 1.2, PAL.red, { rx: -0.2 });
    this.world.addRect(-4.6, 28.0, 2.4, 0.8, { h: 0.9, sight: 'low' });
    this.items.push({ id: 'fish', x: -4.4, z: 28.1, y: 1.0 });

    // Boathouse
    const W = (x1, z1, x2, z2, o) => P.wall(L, x1, z1, x2, z2, o);
    const bh = 0xc8e0e8;
    P.floor(L, 8, 22, 16, 29, 'planks', { a: 0xa87848, b: 0x98683a });
    W(8, 22, 16, 22, { t: 0.3, a: 0x5a7f9a, b: bh, windows: [[12, 1.6]] });
    W(8, 29, 16, 29, { t: 0.3, a: bh, b: 0x5a7f9a, doors: [[12, 2.4]] });
    W(8, 22, 8, 29, { t: 0.3, a: 0x5a7f9a, b: bh, doors: [[25.5, 1.6]] });
    W(16, 22, 16, 29, { t: 0.3, a: bh, b: 0x5a7f9a, windows: [[25.5, 1.4, 'climb']] });
    this.zone('boathouse', 'Boathouse', 'dock', 8, 22, 16, 29, { building: 'boathouse' });
    this.buildings.boathouse = { minX: 8, maxX: 16, minZ: 22, maxZ: 29 };
    P.workbench(L, 12, 22.6, 0);
    this.items.push({ id: 'wrench', x: 11.5, z: 22.7, y: 0.92 });
    this.items.push({ id: 'crowbar', x: 12.6, z: 22.7, y: 0.92 });
    P.locker(L, 15.45, 23.6, -Math.PI / 2, 0xf28a30, 2);
    this.items.push({ id: 'outfit_dockworker', x: 14.6, z: 24.8, y: 0 });
    this.hideSpots.push({ id: 'bh_locker', name: 'Locker', x: 14.85, z: 23.3, yaw: Math.PI / 2, kind: 'locker' });
    s.push(10.2, 0, 26.4, 0);
    s.block(0, 0, 0, 1.4, 0.4, 3.0, PAL.metalDark);
    P.boat(s, 'row');
    s.pop();
    this.world.addRect(10.2, 26.4, 1.6, 3.4, { h: 0.9, sight: 'low' });
    P.barrel(L, 15.2, 27.8, 0x3f7fa8);
    this.A('dock_workbench', 12, 23.5, Math.PI);
    this.A('boathouse_in', 13.0, 26.5, Math.PI);
    const roof = new MeshSink({ chunk: 1000, outline: 0.04 });
    P.hipRoof(roof, 12, 25.5, 8.6, 7.6, 2.6, 2.62, 0x3f7fa8, 0x346a8c, 0.5);
    this.roofs.push({ id: 'boathouse', sink: roof, ...this.buildings.boathouse });
    // dock decorations
    for (const [x, z] of [[-3, 31.4], [3, 31.4], [15, 31.4], [18.5, 31.4]]) {
      s.cyl(x, 0, z, 0.2, 0.7, PAL.woodDark, { seg: 8 });
      this.world.addCircle(x, z, 0.22, { h: 0.7, sight: 'none' });
    }
    for (const [x, z] of [[-20, 30.5], [24, 29.5], [-6, 30.8]]) {
      s.cyl(x, 0, z, 0.5, 0.25, 0xd8c8a0, { outline: false });
      s.cyl(x, 0.25, z, 0.35, 0.1, 0xc0b088, { outline: false });
    }
    // seaside lamp posts
    for (const x of [-8, 6, 20]) P.lampPost(this, x, 26.6);
    P.tree(this, 24, 25, 'palm', 1.1);
    P.tree(this, -23.8, 31.0, 'palm', 0.9);
  }

  // ------------------------------------------------------------------ west
  buildWest() {
    const L = this;
    const s = this.env;
    // Greenhouse
    const gx1 = -40, gz1 = -24, gx2 = -28, gz2 = -12;
    P.floor(L, gx1, gz1, gx2, gz2, 'stone', { a: 0xd8d0c0, b: 0xb8b0a0, tile: 1 });
    const glassWall = (x1, z1, x2, z2, door) => {
      const horiz = z1 === z2;
      const len = horiz ? x2 - x1 : z2 - z1;
      const n = Math.round(len / 2);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        s.block(x1 + (x2 - x1) * t, 0, z1 + (z2 - z1) * t, 0.14, 2.6, 0.14, PAL.white);
      }
      s.box((x1 + x2) / 2, 2.6, (z1 + z2) / 2, horiz ? len : 0.14, 0.12, horiz ? 0.14 : len, PAL.white);
      s.box((x1 + x2) / 2, 0.3, (z1 + z2) / 2, horiz ? len : 0.16, 0.6, horiz ? 0.16 : len, PAL.white);
      const segs = door ? [[horiz ? x1 : z1, door - 0.9], [door + 0.9, horiz ? x2 : z2]] : [[horiz ? x1 : z1, horiz ? x2 : z2]];
      for (const [a, b] of segs) {
        if (horiz) {
          this.glass.box((a + b) / 2, 1.6, z1, b - a, 2.0, 0.05, 0xcff4ff, { outline: false });
          this.world.addBox(a, z1 - 0.1, b, z1 + 0.1, { h: 2.6, sight: 'none', tag: 'glasswall' });
        } else {
          this.glass.box(x1, 1.6, (a + b) / 2, 0.05, 2.0, b - a, 0xcff4ff, { outline: false });
          this.world.addBox(x1 - 0.1, a, x1 + 0.1, b, { h: 2.6, sight: 'none', tag: 'glasswall' });
        }
      }
    };
    glassWall(gx1, gz1, gx2, gz1);
    glassWall(gx1, gz2, gx2, gz2, -34);
    glassWall(gx1, gz1, gx1, gz2);
    glassWall(gx2, gz1, gx2, gz2, -18);
    this.zone('greenhouse', 'Greenhouse', 'greenhouse', gx1, gz1, gx2, gz2, { building: 'greenhouse' });
    P.planter(L, -37.5, -21, 1.4, 4.5, 'veg');
    P.planter(L, -34, -21, 1.4, 4.5, 'flower');
    P.planter(L, -30.5, -21, 1.4, 4.5, 'veg');
    P.planter(L, -37.5, -15.8, 1.4, 3.2, 'cactus');
    P.planter(L, -30.5, -15.8, 1.4, 3.2, 'flower');
    P.workbench(L, -34, -23.4, 0);
    this.A('greenhouse_bench', -34, -22.5, Math.PI);
    this.A('greenhouse_water1', -36, -18.5, -Math.PI / 2);
    this.A('greenhouse_water2', -32, -18.5, Math.PI / 2);
    // the deadly shrooms (poison source)
    s.cyl(-39.2, 0, -12.9, 0.35, 0.5, 0x7a4a8a);
    for (let i = 0; i < 4; i++) {
      s.cyl(-39.2 + (i - 1.5) * 0.12, 0.5, -12.9 + (i % 2) * 0.1, 0.03, 0.15, PAL.cream, { outline: false });
      s.sphere(-39.2 + (i - 1.5) * 0.12, 0.66, -12.9 + (i % 2) * 0.1, 0.09, 0.05, 0.09, PAL.purple, { lo: true });
    }
    this.world.addCircle(-39.2, -12.9, 0.35, { h: 0.6, sight: 'none' });
    this.items.push({ id: 'deathcap', x: -39.2, z: -13.4, y: 0.5 });
    P.plantPot(L, -28.8, -23.2, 1.2, 'palm');
    P.plantPot(L, -39.2, -23.2, 1.2, 'palm');
    // glass roof (frame only)
    const roof = new MeshSink({ chunk: 1000, outline: 0.03 });
    for (let x = gx1; x <= gx2; x += 2) roof.box(x, 3.4, (gz1 + gz2) / 2, 0.1, 0.1, gz2 - gz1, PAL.white, { rx: 0 });
    roof.box((gx1 + gx2) / 2, 4.2, (gz1 + gz2) / 2, gx2 - gx1, 0.12, 0.14, PAL.white);
    this.roofs.push({ id: 'greenhouse', sink: roof, minX: gx1, maxX: gx2, minZ: gz1, maxZ: gz2 });
    this.buildings.greenhouse = { minX: gx1, maxX: gx2, minZ: gz1, maxZ: gz2 };
    // beehive
    s.block(-42.5, 0, -14.5, 0.6, 0.6, 0.6, PAL.white);
    s.block(-42.5, 0.6, -14.5, 0.55, 0.5, 0.55, PAL.yellow);
    s.block(-42.5, 1.1, -14.5, 0.7, 0.08, 0.7, PAL.white);
    this.world.addRect(-42.5, -14.5, 0.6, 0.6, { h: 1.2, sight: 'low' });

    // Guard post outside security
    this.A('west_post', -24.2, -10, -Math.PI / 2);
    this.zone('westlawn', 'West Lawn', 'public', -48, -26, -22, -6, { outdoor: true });
    P.floor(L, -28, -12, -23, -9, 'path');
    P.floor(L, -34, -12, -28, -9, 'path');
    // Hedge maze
    this.buildMaze(-47.0, -6.0);
    // trees around
    for (const [x, z, k] of [[-26, -24, 'pine'], [-44, -26, 'pine'], [-27, -20, 'round'], [-45, -18, 'pine'], [-25, 18.5, 'round'], [-46, -8, 'pine']]) P.tree(L, x, z, k, 1.0);
    for (const [x, z] of [[-23.4, -5.0], [-23.4, 1.8]]) P.bush(L, x, z, 0.9, null);
    this.hideSpots.push({ id: 'bush_west', name: 'Bush', x: -23.4, z: 0.6, yaw: 0, kind: 'bush' });
    this.containers.push({ id: 'bush_west_c', name: 'Bush', x: -23.4, z: -3.8, cap: 1, yaw: Math.PI, bush: true, bx: -23.4, bz: -5.0 });
    P.rocks(L, -47, -12, 1.2);
    P.rocks(L, -46, 8, 1.0);
  }

  buildMaze(x0, z0) {
    // 9x9 cell maze. Even indices are thin hedge walls, odd indices are wide paths.
    const M = [
      '#########E#########',
      '#   #     #       #',
      '# # # ### # ##### #',
      '# #   #   #     # #',
      '# ##### ##### # # #',
      '#     #     # #   #',
      '##### # ### # #####',
      '#   # # #   #     #',
      '# # # # # ####### #',
      '# #   #   #  S     ',
      '# ######### ##### #',
      '#     #   #     # #',
      '# ### # # ##### # #',
      '#   # # #     # # #',
      '### # # ##### # # #',
      '#   #   #   # #   #',
      '# ####### # # ### #',
      '#         #       #',
      '##########N########',
    ];
    const tw = 0.6, cw = 1.85;
    const pos = (i) => Math.ceil(i / 2) * tw + Math.floor(i / 2) * cw;
    const size = (i) => (i % 2 === 0 ? tw : cw);
    const n = M.length;
    const total = pos(n - 1) + size(n - 1);
    const L = this;
    const h = 2.0;
    this.mazeInfo = { x0, z0, total, pos, size };
    this.zone('maze', 'Hedge Maze', 'public', x0, z0, x0 + total, z0 + total, { outdoor: true });
    P.floor(L, x0, z0, x0 + total, z0 + total, 0x8fd060, { y: 0.01 });
    const grid = M.map((r) => r.split(''));
    // horizontal runs (length >= 2 cells)
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (grid[r][c] === '#') {
          let e = c;
          while (e + 1 < n && grid[r][e + 1] === '#') e++;
          if (e > c) {
            P.hedge(L, x0 + pos(c), z0 + pos(r), x0 + pos(e) + size(e), z0 + pos(r) + size(r), h, PAL.hedge);
            for (let k = c; k <= e; k++) grid[r][k] = 'x';
          }
          c = e + 1;
        } else c++;
      }
    }
    // vertical runs of what's left
    for (let c = 0; c < n; c++) {
      let r = 0;
      while (r < n) {
        if (grid[r][c] === '#') {
          let e = r;
          while (e + 1 < n && grid[e + 1][c] === '#') e++;
          P.hedge(L, x0 + pos(c), z0 + pos(r), x0 + pos(c) + size(c), z0 + pos(e) + size(e), h, PAL.hedge);
          r = e + 1;
        } else r++;
      }
    }
    for (const col of this.world.colliders) if (col.tag === 'hedge' && col.h >= 1.9) col.sight = 'tall';
    const cx = (i) => x0 + pos(i) + size(i) / 2;
    const cz = (i) => z0 + pos(i) + size(i) / 2;
    this.A('maze_centre', cx(13) - 1.0, cz(9), Math.PI / 2);
    P.statue(L, cx(13) + 0.3, cz(9), -Math.PI / 2, 'thinker');
    this.A('maze_s', cx(10), z0 + total + 0.8, Math.PI);
    this.A('maze_n', cx(9), z0 - 0.8, 0);
    this.A('maze_e', x0 + total + 0.8, cz(9), -Math.PI / 2);
    this.A('maze_mid1', cx(3), cz(5), 0);
    this.A('maze_mid2', cx(15), cz(15), 0);
    this.A('maze_mid3', cx(1), cz(17), 0);
    this.A('maze_mid4', cx(7), cz(1), 0);
    this.hideSpots.push({ id: 'maze_bush', name: 'Hedge Nook', x: cx(17), z: cz(1), yaw: 0, kind: 'bush' });
    this.containers.push({ id: 'maze_nook', name: 'Hedge Nook', x: cx(7), z: cz(13), cap: 2, yaw: 0, bush: true });
  }

  // ------------------------------------------------------------------ lighthouse
  buildLighthouse() {
    const L = this;
    const s = this.env;
    const x = -40, z = -38.5;
    P.floor(L, -38, -36, -32, -31, 'path');
    // tower (round, stripes)
    const R = 2.6;
    for (let i = 0; i < 4; i++) s.cyl(x, i * 0.65, z, R, 0.65, i % 2 ? PAL.red : PAL.white, { outline: i === 0 });
    const roof = new MeshSink({ chunk: 1000, outline: 0.04 });
    for (let i = 4; i < 14; i++) roof.cyl(x, i * 0.65, z, R - (i - 4) * 0.06, 0.65, i % 2 ? PAL.red : PAL.white, { outline: i === 4 });
    roof.cyl(x, 9.1, z, 2.6, 0.2, PAL.black);
    roof.cyl(x, 9.3, z, 1.4, 1.2, 0xfff1a0);
    roof.cone(x, 10.5, z, 1.8, 1.2, PAL.red);
    roof.ball(x, 11.8, z, 0.2, PAL.gold);
    // railing ring on the gallery
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      roof.cyl(x + Math.cos(a) * 2.5, 9.3, z + Math.sin(a) * 2.5, 0.04, 0.8, PAL.black, { outline: false });
    }
    this.roofs.push({ id: 'lighthouse', sink: roof, minX: x - R, maxX: x + R, minZ: z - R, maxZ: z + R });
    this.buildings.lighthouse = { minX: x - R, maxX: x + R, minZ: z - R, maxZ: z + R };
    // walls as colliders: ring of boxes leaving a door to the SE
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const da = Math.atan2(Math.sin(a - 0.75), Math.cos(a - 0.75));
      if (Math.abs(da) < 0.32) continue;
      const px = x + Math.cos(a) * (R - 0.15), pz = z + Math.sin(a) * (R - 0.15);
      this.world.addCircle(px, pz, 0.45, { h: 2.6 });
    }
    // interior floor
    s.cyl(x, 0.01, z, R - 0.3, 0.02, 0xc8a878, { outline: false });
    const da = 0.75;
    this.A('lighthouse_door', x + Math.cos(da) * (R + 0.8), z + Math.sin(da) * (R + 0.8), Math.PI + 0.5);
    this.A('lighthouse_in', x + 0.2, z + 0.4, 0.8);
    this.A('sniper_perch', x - 0.6, z - 0.6, 0.8);
    s.cyl(x - 0.9, 0, z - 0.9, 0.45, 2.6, 0x8a6a4a, { seg: 8 });
    this.world.addCircle(x - 0.9, z - 0.9, 0.45, { h: 2.6, sight: 'none' });
    this.zone('lighthouse', 'Lighthouse', 'lighthouse', x - R, z - R, x + R, z + R, { building: 'lighthouse' });
    // crate with the rifle (set-piece)
    P.crate(L, x + 1.2, z - 0.6, 0.8, 0.4, 0x6a7a4a);
    this.A('rifle_crate', x + 0.9, z + 0.3, -2.4);
    P.rocks(L, -45, -42, 1.4);
    P.rocks(L, -35, -43, 1.0);
    P.tree(L, -33, -36.2, 'pine', 0.9);
  }

  // ------------------------------------------------------------------ cove
  buildCove() {
    const L = this;
    const s = this.env;
    P.floor(L, -46, 18, -26, 31, 'sand');
    this.zone('cove', 'Smuggler’s Cove', 'public', -48, 16, -24, 36, { outdoor: true });
    // fishing hut
    const W = (x1, z1, x2, z2, o) => P.wall(L, x1, z1, x2, z2, o);
    W(-46, 18, -40, 18, { t: 0.25, a: 0x8a6a4a, b: 0xb89070, h: 2.4, cornice: false });
    W(-46, 23, -40, 23, { t: 0.25, a: 0xb89070, b: 0x8a6a4a, h: 2.4, cornice: false, doors: [[-42, 1.4]] });
    W(-46, 18, -46, 23, { t: 0.25, a: 0x8a6a4a, b: 0xb89070, h: 2.4, cornice: false });
    W(-40, 18, -40, 23, { t: 0.25, a: 0xb89070, b: 0x8a6a4a, h: 2.4, cornice: false, windows: [[20.5, 1.2]] });
    P.floor(L, -46, 18, -40, 23, 'planks', { a: 0x9a7048, b: 0x8a6038 });
    this.zone('hut', 'Fishing Hut', 'dock', -46, 18, -40, 23, { building: 'hut' });
    this.buildings.hut = { minX: -46, maxX: -40, minZ: 18, maxZ: 23 };
    P.bed(L, -44.9, 20.4, 0, 0x7a9a5a);
    P.crate(L, -41.0, 18.9, 0.8);
    this.items.push({ id: 'lockpick', x: -41.0, z: 18.9, y: 0.82 });
    this.items.push({ id: 'outfit_fisherman', x: -43.0, z: 19.0, y: 0 });
    P.wardrobe(L, -42.4, 18.5, 0, 0x8a6a4a);
    this.hideSpots.push({ id: 'hut_closet', name: 'Wardrobe', x: -42.4, z: 19.2, yaw: Math.PI, kind: 'wardrobe' });
    const roof = new MeshSink({ chunk: 1000, outline: 0.04 });
    P.hipRoof(roof, -43, 20.5, 6.5, 5.5, 2.0, 2.42, 0x8a5a3a, 0x6a4a2a, 0.5);
    this.roofs.push({ id: 'hut', sink: roof, ...this.buildings.hut });
    // campfire
    s.cyl(-36, 0, 24, 0.7, 0.12, 0x8a8a8a, { outline: false });
    s.ball(-36, 0.25, 24, 0.25, PAL.orange, { lo: true, outline: false });
    s.ball(-36, 0.38, 24, 0.15, PAL.yellow, { lo: true, outline: false });
    for (let i = 0; i < 3; i++) s.cyl(-36, 0.1, 24, 0.07, 0.9, PAL.woodDark, { rz: Math.PI / 2, ry: i, outline: false });
    this.world.addCircle(-36, 24, 0.7, { h: 0.4, sight: 'none' });
    for (const [x, z, r] of [[-38, 24, Math.PI / 2], [-34, 24, -Math.PI / 2]]) {
      s.cyl(x, 0.2, z, 0.2, 1.4, PAL.wood, { rz: Math.PI / 2, ry: r, outline: true });
      this.world.addRect(x, z, 0.4, 1.4, { h: 0.4, sight: 'none' });
    }
    this.A('campfire', -34.5, 24, -Math.PI / 2, { sit: true });
    this.A('fisherman', -29.5, 29.6, 0.2);
    P.rocks(L, -29.5, 30.6, 0.6);
    this.A('rowboat', -36, 33.5, 0.3);
    this.A('rowboat_exit', -36, 30.0, 0);
    this.dumpSpots.push({ x1: -42, z1: 30.4, x2: -30, z2: 30.4, nx: 0, nz: 1, name: 'Dump in the sea' });
    for (const [x, z] of [[-45, 26], [-28, 19], [-31.5, 26.5], [-40, 28.5]]) P.tree(L, x, z, 'palm', 1.0 + (x % 2) * 0.1);
    P.rocks(L, -47, 30, 1.2);
    P.rocks(L, -25.5, 30.8, 1.0);
    P.umbrellaTable(L, -32, 21.5, PAL.orange);
  }
}
