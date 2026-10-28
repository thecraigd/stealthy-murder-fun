// Blend-in spots: do a job that suits your disguise and the people who know
// that uniform (Enforcers) stop looking twice. Moving or acting ends it.
import { dist } from '../core/util.js';

const PI = Math.PI;

// [x, z, yaw, outfits, label, anim, fx]
export const BLEND_SPOTS = [
  // kitchen: right under Chef Gustave's nose
  [17.0, -20.65, 0, ['chef', 'cook'], 'Chop onions', 'cook', 'steam'],
  [20.7, -22.4, PI / 2, ['chef', 'cook', 'waiter'], 'Wash dishes', 'work', 'bubbles'],
  // waiters & bar staff
  [13.0, -16.4, -PI / 2, ['bartender', 'waiter'], 'Polish glasses', 'work', 'sparkle'],
  [9.2, -9.9, 0, ['waiter'], 'Tidy the buffet', 'serve', null],
  [-10.4, 18.3, 0, ['waiter'], 'Serve canapés', 'serve', null],
  // guards
  [-1.0, -2.0, PI * 0.75, ['guard'], 'Stand guard', 'guard', null],
  [-12.9, -12.4, PI, ['guard'], 'Watch the monitors', 'type', null],
  [-0.9, -13.0, PI / 2, ['guard'], 'Stand guard', 'guard', null],
  [-4.0, -29.0, PI, ['guard'], 'Stand guard', 'lookaround', null],
  [27.0, 11.0, -PI / 2, ['guard'], 'Stand guard', 'guard', null],
  // grounds staff
  [19.0, 10.4, PI, ['gardener'], 'Prune the roses', 'kneel', 'leaves'],
  [-32.0, -15.2, PI, ['gardener'], 'Water the plants', 'work', 'drops'],
  [-9.0, 25.0, -PI / 2, ['dockworker'], 'Check the manifest', 'work', null],
  [-13.0, -6.0, PI / 2, ['maid'], 'Dust the shelves', 'sweep', 'dust'],
  [37.5, 10.0, 0, ['trainer'], 'Do push-ups', 'pushups', 'sweat'],
  [29.8, -21.0, -PI / 2, ['masseur'], 'Fold towels', 'work', null],
  [-3.6, -20.5, -PI / 2, ['aquarist'], 'Clean the glass', 'mop', 'bubbles'],
  // guests can always hit the dance floor
  [-16.6, 11.6, -1.45, ['guest'], 'Dance', 'dance', 'notes'],
  [3.0, -14.2, PI, ['guest'], 'Dance', 'dance', 'notes'],
];

export function initBlend(game) {
  const g = game;
  const spots = [];
  for (const [x0, z0, yaw, outfits, label, anim, fx] of BLEND_SPOTS) {
    const w = g.world.isWalkable(x0, z0) ? { x: x0, z: z0 } : g.world.nearestWalkable(x0, z0) || { x: x0, z: z0 };
    const spot = { x: w.x, z: w.z, yaw, outfits, label, anim, fx };
    spots.push(spot);
    g.interactions.add({
      x: spot.x, z: spot.z, r: 1.2, icon: '🎭', priority: 1.6, blend: spot,
      when: (p) => outfits.includes(p.outfit) && p.blend !== spot && !p.isCompromised,
      label: `Blend in: ${label}`,
      act: (p) => startBlend(g, spot),
    });
  }
  return spots;
}

export function startBlend(g, spot) {
  const p = g.player;
  if (p.drag || p.busy) return;
  p.blend = spot;
  p.blendT = 0;
  p.sneak = false;
  // put weapons away: nobody chops onions with a crowbar
  p.sel = -1;
  g.emit('inventory');
  g.tips?.show('blend');
  g.challenges?.event('blend', { outfit: p.outfit, anim: spot.anim });
}

export function stopBlend(g) {
  const p = g.player;
  if (!p.blend) return;
  p.blend = null;
}

// Per-frame flavour while blending.
export function updateBlendFx(g, dt) {
  const p = g.player;
  const s = p.blend;
  if (!s) return;
  p.blendT = (p.blendT || 0) + dt;
  if (dist(p.pos.x, p.pos.z, s.x, s.z) > 0.6) return;
  p._blendFx = (p._blendFx || 0) - dt;
  if (p._blendFx > 0 || !s.fx) return;
  p._blendFx = 0.7 + Math.random() * 0.5;
  const fx = g.fx;
  const f = p.forward();
  const hx = p.pos.x + f.x * 0.45, hz = p.pos.z + f.z * 0.45;
  switch (s.fx) {
    case 'notes': fx.notes(p.pos.x, 1.9, p.pos.z, 1); break;
    case 'steam': fx.emit('puff', hx, 1.2, hz, { n: 2, color: 0xffffff, speed: 0.3, up: 0.8, gravity: -0.5, life: 0.9, size: 0.14 }); break;
    case 'bubbles': fx.emit('drop', hx, 1.0, hz, { n: 3, color: 0xcff4ff, speed: 0.6, up: 1.2, gravity: 3, life: 0.6, size: 0.08 }); break;
    case 'sparkle': fx.emit('glint', hx, 1.2, hz, { n: 1, color: 0xffffff, speed: 0.2, up: 0.3, gravity: 0, life: 0.5, size: 0.16 }); break;
    case 'leaves': fx.emit('puff', hx, 0.5, hz, { n: 2, color: 0x6fcf4a, speed: 0.8, up: 1, gravity: 3, life: 0.7, size: 0.1 }); break;
    case 'drops': fx.emit('drop', hx, 0.9, hz, { n: 4, color: 0x7fd8ff, speed: 0.4, up: 0.2, gravity: 8, life: 0.5, size: 0.07 }); break;
    case 'dust': fx.emit('puff', hx, 1.4, hz, { n: 2, color: 0xe8e0d0, speed: 0.4, up: 0.2, gravity: 0, life: 0.8, size: 0.16 }); break;
    case 'sweat': fx.emit('drop', p.pos.x, 0.6, p.pos.z, { n: 2, color: 0x9fe0ff, speed: 0.8, up: 1.2, gravity: 8, life: 0.5, size: 0.06 }); break;
  }
}
