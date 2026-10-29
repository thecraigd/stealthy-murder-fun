// Everyone on Gullcrest Key, what they do all day, and what they gossip about.
import { mulberry32, pick } from '../core/util.js';
import { BODY_PRESETS, GUEST_LOOKS, GUEST_DRESSES, SKINS, HAIRS } from './outfits.js';

const PI = Math.PI;
const r = mulberry32(4242);

function randBody(opts = {}) {
  const fem = opts.fem ?? r() < 0.45;
  const hairs = fem ? ['long', 'bun', 'ponytail', 'curly', 'short'] : ['short', 'buzz', 'pompadour', 'curly', 'bald', 'short'];
  const b = {
    skin: pick(SKINS, r),
    hair: pick(hairs, r),
    hairColor: pick(HAIRS, r),
    height: 0.94 + r() * 0.14,
    girth: 0.88 + r() * 0.28,
    belly: r() < 0.25 ? r() * 0.9 : 0,
    head: 0.95 + r() * 0.1,
    acc: [],
    cheeks: r() < 0.35,
  };
  if (!fem && r() < 0.35) b.facial = pick(['mustache', 'beard', 'goatee', 'stubble'], r);
  if (fem) {
    b.acc.push('lashes');
    if (r() < 0.6) b.acc.push('lipstick');
    b.girth *= 0.9;
  }
  if (r() < 0.15) b.acc.push('glasses');
  if (b.hair === 'bald') b.fringe = r() < 0.5;
  return { ...b, ...opts.body, _fem: fem };
}

const T = (at, d, t, extra = {}) => ({ at, do: d, t, ...extra });
const P = (x, z, yaw = 0, extra = {}) => ({ x, z, yaw, ...extra });

// Extra anchors (on top of the ones the level defines).
export const EXTRA_ANCHORS = {
  aq_post: P(-3.3, -15.0, PI / 2),
  aq_chat: P(-4.4, -15.4, PI / 2),
  aq_door_out: P(-0.7, -16.0, PI / 2),
  study_door_aq: P(-10.7, -18.3, -PI / 2),
  toast_guard: P(8.4, -17.6, -PI * 0.75),
  ballroom_post: P(-0.9, -9.0, PI * 0.75),
  gossip_a: P(8.9, -10.6, PI / 2),
  gossip_b: P(10.0, -10.8, -PI / 2),
  security_maid: P(-16.2, -10.4, -PI / 2),
  spa_chat: P(27.4, -16.6, PI / 2),
  spa_guard_post: P(26.6, -18.6, -PI / 2),
  vex_assist_spa: P(26.6, -19.8, -PI / 2),
  vex_assist_bar: P(9.6, -18.6, PI / 2),
  vex_assist_gallery: P(-7.0, -10.4, PI),
  vex_assist_terrace: P(-11.0, -30.0, -PI / 2),
  terrace_garden: P(-11.5, -32.2, PI),
  gym_guard_post: P(28.6, 13.2, -PI / 2),
  trainer_bench: P(34.3, 9.2, -PI * 0.75),
  dock_worker_a: P(-12.6, 29.4, PI * 0.8),
  dock_worker_b: P(-9.8, 29.6, -PI * 0.8),
  crane_cabin: P(-16.6, 29.6, PI / 2),
  chef_stove: P(16.6, -24.6, PI),
  keeper_spot: P(-39.2, -37.4, PI * 0.25),
  baron_guard_toast: P(8.0, -18.2, -PI * 0.7),
  brick_kitchen: P(20.5, -16.1, PI / 2),
  frisk_zone: P(2, 1.2, 0),
  hos_foyer: P(0.2, -6.2, PI * 0.25),
  hos_gallery: P(-7.0, -2.5, PI),
  hos_lounge: P(-15.0, -1.2, PI),
  hos_security: P(-15.2, -12.0, 0),
  hos_ballroom: P(2.5, -12.5, PI),
  pool_guard_a: P(25.5, -10.5, PI / 2),
  pool_guard_b: P(44.6, 4.8, -PI / 2),
  pool_guard_c: P(25.0, 8.0, 0),
  cove_walk: P(-30, 21, 0),
};

export function buildCast() {
  const C = [];
  const add = (d) => C.push(d);

  // ======================================================== TARGETS
  add({
    id: 'baron', name: 'Baron Silas Crowe', title: 'Target', role: 'guest', target: true, outfit: 'guest',
    body: BODY_PRESETS.baron,
    look: { top: 0x7a3a8a, shirt: 0xffffff, tie: 0xf2c14e, pants: 0x5a2a6a, buttons: 0xf2c14e, hat: 'tophat', hatColor: 0x2a2430, hatColor2: 0x7a3a8a },
    spawn: 'foyer_greet', voice: 0.8, carries: ['boatkey'], face: 'happy', hold: null,
    routine: [
      T('foyer_greet', 'talk', [38, 38], { id: 'greet', lines: ['Welcome, welcome! Mind the shark.', 'Champagne is in the ballroom. The shark is in the aquarium. Don’t mix them up! Ha!', 'So glad you could come. Truly.'], guardAt: 'hos_foyer' }),
      T('feed_spot', 'feed', [34, 34], { id: 'feed', event: 'baronFeed', guardAt: 'aq_door_out', private: true, lines: ['Who’s a hungry boy? Who’s a hungry boy!', 'Mr. Nibbles! Dinner time!', 'Look at those teeth. Magnificent.'] }),
      T('baron_desk', 'sit', [36, 36], { id: 'study', event: 'baronWhiskey', guardAt: 'study_door_aq', private: true, lines: ['Ahh. Sixty years old and smooth as silk.', 'Now where did I put that ledger… ah, the safe. Of course.'] }),
      T('toast', 'toast', [34, 34], { id: 'toast', event: 'baronToast', guardAt: 'baron_guard_toast' }),
      T('terrace_view1', 'idle', [26, 26], { id: 'terrace', lines: ['Look at that view. All mine. Well — the bank’s, technically.', 'The sea air. Wonderful for business.'] }),
      T('fountain_n', 'idle', [24, 24], { id: 'fountain', lines: ['My fountain! Imported from… somewhere expensive.', 'Every coin in there is a wish. Mine all came true. Ha!'] }),
    ],
  });
  add({
    id: 'baron_guard', name: 'Baron’s Bodyguard', title: 'Bodyguard', role: 'guard', outfit: 'guard',
    body: { skin: 0xc98d62, hair: 'buzz', hairColor: 0x1f1a1a, height: 1.12, girth: 1.3, acc: ['shades'] },
    look: { top: 0x1f2238, tie: 0x111111, hatColor: 0x1f2238 }, spawn: 'hos_foyer', follow: 'baron', enforcer: true,
    vision: 12,
  });

  add({
    id: 'vex', name: 'Madame Odette Vex', title: 'Target', role: 'guest', target: true, outfit: 'guest',
    body: BODY_PRESETS.vex,
    look: { top: 0x2a2430, dress: 0xc23b4a, dressLen: 1.0, pearls: 0xffffff, legs: 0xf7dcc8, shoes: 0xc23b4a, sleeves: 'none', tie: null, shirt: null, buttons: null },
    spawn: 'vex_painting', voice: 1.3, face: 'normal', taskIdx: 0,
    routine: [
      T('vex_painting', 'idle', [36, 36], { id: 'gallery', event: 'vexGallery', lines: ['Exquisite. And entirely fake. I should know — I paid for it.', 'Darling, do you see the brushwork? Neither do I.'] }),
      T('vex_bar', 'drink', [36, 36], { id: 'bar', event: 'vexBar' }),
      T('massage_table', 'facedown', [36, 36], { id: 'massage', event: 'vexMassage', guardAt: 'vex_assist_spa', private: true }),
      T('hottub', 'tub', [36, 36], { id: 'tub', event: 'vexTub', guardAt: 'vex_assist_spa', private: true, lines: ['Mmm. Turn that radio up, darling.', 'This is what money is for.'] }),
      T('vex_smoke', 'smoke', [36, 36], { id: 'smoke', event: 'vexSmoke', hold: 'cigarette', lines: ['Such a long way down…', 'One more of these and I’m quitting. Again.'] }),
    ],
  });
  add({
    id: 'vex_assistant', name: 'Pip (Vex’s Assistant)', title: 'Assistant', role: 'staff', outfit: 'guest',
    body: { skin: 0xffe6cc, hair: 'pompadour', hairColor: 0xe8c070, height: 0.92, girth: 0.85, acc: ['glasses'], cheeks: true },
    look: { top: 0x8fc9d6, tie: 0x2a2430, pants: 0x3a4a5a }, spawn: 'vex_assist_gallery', follow: 'vex', hold: 'clipboard',
    vision: 8,
  });

  add({
    id: 'brick', name: 'Brick Mallory', title: 'Target', role: 'guest', target: true, brawler: true, outfit: 'trainer',
    body: BODY_PRESETS.brick,
    look: { top: 0xffffff, stripe: 0xe0453a, pants: 0x8a8f9a, sleeves: 'none', hat: 'headband', hatColor: 0xe0453a, chain: 0xf2c14e },
    spawn: 'bench', voice: 0.6, outfitless: true, vision: 10,
    routine: [
      T('bench', 'bench', [36, 36], { id: 'bench', event: 'brickBench', private: true }),
      T('punchbag', 'punch', [26, 26], { id: 'punch', lines: ['HUP! HUP!', 'Who’s the champ? Brick’s the champ!', 'Feel the burn, Brick. FEEL IT.'] }),
      T('shake_fridge', 'drink', [14, 14], { id: 'shake', event: 'brickShake' }),
      T('sauna_sit', 'sit', [36, 36], { id: 'sauna', event: 'brickSauna', private: true, lines: ['Ahhh. Sweat out the toxins, Brick.', 'Hot. Good hot.'] }),
      T('shipment', 'idle', [34, 34], { id: 'shipment', event: 'brickShipment', lines: ['These crates better all be here.', 'Count ’em again. Slower this time.'] }),
      T('brick_kitchen', 'drink', [22, 22], { id: 'kitchen', lines: ['Chef! Where’s the protein?!', 'Is this tofu? Brick doesn’t eat tofu.'] }),
    ],
  });

  // ======================================================== GUARDS
  const guardBody = (o = {}) => ({ ...randBody({ fem: r() < 0.25 }), height: 1.02 + r() * 0.1, girth: 1.05 + r() * 0.25, acc: r() < 0.4 ? ['shades'] : [], ...o });
  const guard = (id, extra) => add({ id, name: 'Guard', title: 'Guard', role: 'guard', outfit: 'guard', body: guardBody(), hold: null, ...extra });
  guard('door_guard1', { spawn: 'door_guard1', routine: [T('door_guard1', 'guard', [999, 999], { forever: true })], doorman: true });
  guard('door_guard2', { spawn: 'door_guard2', routine: [T('door_guard2', 'guard', [999, 999], { forever: true })], doorman: true });
  guard('pier_guard', { spawn: 'pier_guard', routine: [T('pier_guard', 'guard', [40, 40]), T(P(1.0, 30.5, 0), 'lookaround', [8, 8]), T(P(-1, 36, PI), 'lookaround', [6, 6])] });
  guard('aq_guard', { spawn: 'aq_post', routine: [T('aq_post', 'guard', [999, 999], { forever: true })] });
  guard('security_desk_guard', { name: 'Security Officer', spawn: 'security_desk', routine: [T('security_desk', 'sit', [999, 999], { forever: true })], vision: 8 });
  guard('ballroom_guard', { spawn: 'ballroom_post', routine: [T('ballroom_post', 'guard', [50, 50]), T(P(4.5, -21.5, PI), 'lookaround', [8, 8]), T(P(9.8, -20, -PI / 2), 'guard', [10, 10])] });
  guard('spa_guard', { spawn: 'spa_guard_post', routine: [T('spa_guard_post', 'guard', [999, 999], { forever: true })] });
  guard('gym_guard', { spawn: 'gym_guard_post', routine: [T('gym_guard_post', 'phone', [40, 40], { convo: 'sauna' }), T('gym_guard_post', 'guard', [30, 30])] });
  guard('cargo_guard', { spawn: 'cargo_guard', routine: [T('cargo_guard', 'guard', [30, 30]), T(P(-19, 25.5, PI / 2), 'lookaround', [6, 6]), T(P(-8, 22.5, 0), 'lookaround', [6, 6])] });
  guard('west_guard', {
    spawn: 'west_post',
    routine: [
      T('west_post', 'guard', [20, 20]),
      T(P(-30.5, -10.5, PI), 'lookaround', [4, 4]),
      T(P(-34, -10.6, 0), 'lookaround', [4, 4]),
      T(P(-30, -30.5, PI), 'lookaround', [6, 6]),
      T(P(-24.5, -27.5, PI / 2), 'lookaround', [4, 4]),
    ],
  });
  guard('terrace_guard', {
    spawn: 'terrace_door',
    routine: [
      T(P(-21, -28, -PI / 2), 'lookaround', [5, 5]),
      T(P(-8, -32.4, PI), 'guard', [8, 8]),
      T(P(10, -28.2, PI / 2), 'lookaround', [5, 5]),
      T(P(23.5, -30, PI / 2), 'guard', [10, 10]),
      T(P(10, -32.4, PI), 'lookaround', [5, 5]),
    ],
  });
  guard('garden_guard', {
    spawn: 'fountain_e',
    routine: [
      T(P(-6, 5, -PI / 2), 'lookaround', [4, 4]),
      T(P(-21.5, 5.2, -PI / 2), 'lookaround', [6, 6]),
      T(P(-14, 21.8, PI), 'guard', [8, 8]),
      T(P(5.2, 20.5, PI / 2), 'lookaround', [5, 5]),
      T(P(14, 5.2, PI / 2), 'lookaround', [4, 4]),
    ],
  });
  guard('pool_guard', {
    spawn: 'pool_guard_a',
    routine: [
      T('pool_guard_a', 'guard', [10, 10]),
      T(P(41, -12.8, PI), 'lookaround', [5, 5]),
      T('pool_guard_b', 'lookaround', [6, 6]),
      T('pool_guard_c', 'guard', [10, 10]),
    ],
  });
  guard('hos', {
    name: 'Head of Security', title: 'Head of Security', enforcer: true, body: guardBody({ facial: 'mustache', height: 1.1, girth: 1.35, acc: ['earpiece'] }),
    look: { hat: 'captain', hatColor: 0x2c3e6b, badge: 0xf2c14e }, spawn: 'hos_security', vision: 12.5,
    routine: [
      T('hos_security', 'guard', [12, 12]),
      T('hos_lounge', 'lookaround', [6, 6]),
      T('hos_gallery', 'lookaround', [6, 6]),
      T('hos_foyer', 'guard', [8, 8]),
      T('hos_ballroom', 'lookaround', [8, 8]),
      T(P(-18, -1.5, PI), 'lookaround', [4, 4]),
    ],
  });
  guard('keeper_guard', {
    spawn: 'lighthouse_door', routine: [T('lighthouse_door', 'guard', [40, 40]), T(P(-33, -31, PI / 2), 'lookaround', [8, 8])],
  });

  // ======================================================== STAFF
  const staffBody = () => randBody();
  add({ id: 'bartender', name: 'Bartender', title: 'Bartender', role: 'staff', outfit: 'bartender', body: { ...staffBody(), facial: 'mustache' }, spawn: 'bartender', routine: [T('bartender', 'work', [999, 999], { forever: true, convo: 'martini' })] });
  add({ id: 'barfly', name: 'Guest', title: 'Guest', role: 'guest', outfit: 'guest', look: GUEST_LOOKS[4], body: randBody({ fem: false, body: { belly: 0.8 } }), spawn: 'bar_guest1', routine: [T('bar_guest1', 'drink', [999, 999], { forever: true, convo: 'martini' })], hold: 'drink' });
  add({ id: 'waiter_g1', name: 'Waiter', title: 'Waiter', role: 'staff', outfit: 'waiter', body: staffBody(), spawn: 'gossip_a', hold: 'tray', routine: [T('gossip_a', 'talk', [999, 999], { forever: true, convo: 'chandelier' })] });
  add({ id: 'waiter_g2', name: 'Waiter', title: 'Waiter', role: 'staff', outfit: 'waiter', body: staffBody(), spawn: 'gossip_b', routine: [T('gossip_b', 'talk', [999, 999], { forever: true, convo: 'chandelier' })] });
  const waiterRoute = [
    T('chef_island', 'work', [8, 8], { hold: 'tray' }),
    T('btable0a', 'serve', [5, 5]),
    T('btable1a', 'serve', [5, 5]),
    T('dance1', 'serve', [4, 4]),
    T('foyer_inside', 'serve', [3, 3]),
    T('ptable0a', 'serve', [5, 5]),
    T('ptable1b', 'serve', [5, 5]),
    T('party_mingle1', 'serve', [4, 4]),
    T('kitchen_back', 'idle', [3, 3]),
  ];
  add({ id: 'waiter1', name: 'Waiter', title: 'Waiter', role: 'staff', outfit: 'waiter', body: staffBody(), spawn: 'chef_island', hold: 'tray', routine: waiterRoute });
  add({ id: 'waiter2', name: 'Waiter', title: 'Waiter', role: 'staff', outfit: 'waiter', body: staffBody(), spawn: 'ptable1b', hold: 'tray', routine: waiterRoute, taskIdx: 5 });
  add({
    id: 'chef', name: 'Chef Gustave', title: 'Head Chef', role: 'staff', outfit: 'chef', enforcer: true,
    body: { skin: 0xffd9bd, hair: 'short', hairColor: 0x3a2a20, facial: 'curly', belly: 1.0, girth: 1.1, cheeks: true }, spawn: 'chef_island',
    routine: [T('chef_island', 'cook', [999, 999], { forever: true, convo: 'shake', lines: ['Faster! The soufflé waits for no one!', 'Who touched my knives?!'] })],
  });
  add({ id: 'cook', name: 'Cook', title: 'Cook', role: 'staff', outfit: 'cook', body: staffBody(), spawn: 'chef_stove', routine: [T('chef_stove', 'cook', [999, 999], { forever: true, convo: 'shake' })] });
  add({
    id: 'aquarist', name: 'Finn the Aquarist', title: 'Aquarist', role: 'staff', outfit: 'aquarist', body: { ...staffBody(), hair: 'curly', hairColor: 0x8a3a20 }, spawn: 'aquarist_work',
    routine: [
      T('aquarist_work', 'work', [30, 30]),
      T('aq_chat', 'talk', [30, 30], { convo: 'feeding' }),
      T('puffer_tank', 'work', [16, 16], { lines: ['Hello, Professor Puff. Don’t puff at me.', 'Careful, pufferfish. Very toxic. Do not lick.'] }),
    ],
  });
  add({
    id: 'maid', name: 'Housekeeper', title: 'Housekeeper', role: 'staff', outfit: 'maid', body: randBody({ fem: true, body: { hair: 'bun' } }), spawn: 'security_maid', hold: 'mop',
    routine: [
      T('security_maid', 'mop', [32, 32], { convo: 'whiskey' }),
      T(P(-8, -5, 0), 'mop', [16, 16]),
      T(P(2, -5.5, 0), 'mop', [14, 14]),
      T(P(10, -3, 0), 'mop', [14, 14]),
      T(P(-17, -3.8, 0), 'mop', [14, 14]),
    ],
  });
  add({
    id: 'therapist', name: 'Spa Therapist', title: 'Therapist', role: 'staff', outfit: 'masseur', body: randBody({ fem: true, body: { hair: 'ponytail' } }), spawn: 'spa_reception',
    routine: [
      T('spa_reception', 'phone', [30, 30], { convo: 'massage' }),
      T('spa_chat', 'talk', [28, 28], { convo: 'hottub' }),
      T('massage_therapist', 'work', [24, 24]),
    ],
  });
  add({
    id: 'gardener', name: 'Old Moss the Gardener', title: 'Gardener', role: 'staff', outfit: 'gardener', body: { skin: 0xc98d62, hair: 'short', hairColor: 0xd0d0d0, facial: 'beard', height: 0.95, belly: 0.4 }, spawn: 'rose_view',
    routine: [
      T('rose_view', 'work', [24, 24]),
      T('terrace_garden', 'work', [34, 34], { convo: 'railing' }),
      T('greenhouse_water1', 'work', [22, 22]),
      T('gardener_bench', 'work', [18, 18]),
    ],
  });
  add({ id: 'dock1', name: 'Dockhand', title: 'Dockhand', role: 'staff', outfit: 'dockworker', body: staffBody(), spawn: 'dock_worker_a', routine: [T('dock_worker_a', 'talk', [999, 999], { forever: true, convo: 'crane' })] });
  add({ id: 'dock2', name: 'Dockhand', title: 'Dockhand', role: 'staff', outfit: 'dockworker', body: staffBody(), spawn: 'dock_worker_b', routine: [T('dock_worker_b', 'talk', [999, 999], { forever: true, convo: 'crane' })] });
  add({ id: 'fishmonger', name: 'Fishmonger', title: 'Fishmonger', role: 'staff', outfit: 'dockworker', look: { vestHi: null, apron: 0xffffff, hat: 'bucket', hatColor: 0x3f7fa8 }, body: staffBody(), spawn: 'fish_stall', routine: [T('fish_stall', 'work', [999, 999], { forever: true, lines: ['Fresh fish! Frozen fish! Fish!', 'Get your fish here. Great for slapping. I mean, eating.'] })] });
  add({ id: 'trainer', name: 'Coach Dee', title: 'Trainer', role: 'staff', outfit: 'trainer', body: randBody({ fem: true, body: { hair: 'ponytail', girth: 1.0 } }), spawn: 'trainer_bench', routine: [T('trainer_bench', 'stretch', [40, 40], { convo: 'barbell' }), T('ring1', 'punch', [30, 30])] });
  add({ id: 'keeper', name: 'Lighthouse Keeper', title: 'Keeper', role: 'staff', outfit: 'keeper', body: { skin: 0xf2c49c, hair: 'short', hairColor: 0xd0d0d0, facial: 'beard', height: 0.95 }, spawn: 'keeper_spot', routine: [T('keeper_spot', 'read', [999, 999], { forever: true, convo: 'sniper' })] });
  add({ id: 'fisherman', name: 'Fisherman', title: 'Fisherman', role: 'staff', outfit: 'fisherman', body: { skin: 0xa86e48, hair: 'short', hairColor: 0x3a2a20, facial: 'stubble' }, spawn: 'fisherman', hold: 'fishingrod', routine: [T('fisherman', 'fish', [60, 60], { lines: ['Not a bite all day.', 'The fish here know too much.'] }), T('campfire', 'sit', [30, 30])] });
  add({ id: 'dj', name: 'DJ Laser Shark', title: 'DJ', role: 'staff', outfit: 'guest', look: { top: 0x2a2430, tie: null, shirt: 0xff7fb0, hat: 'beanie', hatColor: 0xff7fb0, hatColor2: 0x2a2430 }, body: { ...staffBody(), acc: ['shades'] }, spawn: 'dj', routine: [T('dj', 'dance', [999, 999], { forever: true })] });
  add({ id: 'pianist', name: 'Pianist', title: 'Pianist', role: 'staff', outfit: 'guest', look: { top: 0x1f1f28, tie: null, bowtie: 0xffffff }, body: { ...staffBody(), hair: 'pompadour' }, spawn: 'pianist', routine: [T('pianist', 'type', [999, 999], { forever: true })] });
  add({ id: 'singer', name: 'Lounge Singer', title: 'Singer', role: 'staff', outfit: 'guest', look: { ...GUEST_DRESSES[4], dress: 0xf2c14e, top: 0xf2c14e }, body: randBody({ fem: true, body: { hair: 'curly' } }), spawn: 'singer', routine: [T('singer', 'talk', [999, 999], { forever: true })] });
  add({ id: 'poolbartender', name: 'Pool Bartender', title: 'Bartender', role: 'staff', outfit: 'bartender', look: { vest: 0xf7d44c, bowtie: 0x3fb7b0 }, body: staffBody(), spawn: 'poolbar', routine: [T('poolbar', 'work', [999, 999], { forever: true })] });
  add({ id: 'cleaner2', name: 'Housekeeper', title: 'Housekeeper', role: 'staff', outfit: 'maid', body: randBody({ fem: true }), spawn: 'staff_iron', routine: [T('staff_iron', 'work', [30, 30]), T('staff_table1', 'sit', [30, 30]), T('staff_lockers', 'idle', [10, 10])] });

  // ======================================================== GUESTS
  const guest = (id, routine, extra = {}) => {
    const fem = extra.fem ?? r() < 0.5;
    const look = fem ? pick(GUEST_DRESSES, r) : pick(GUEST_LOOKS, r);
    add({ id, name: 'Guest', title: 'Guest', role: 'guest', outfit: 'guest', look: { ...look, ...(fem ? { tie: null, shirt: null, buttons: null, sleeves: 'short' } : {}) }, body: randBody({ fem }), routine, shuffle: !!extra.shuffle, hold: extra.hold ?? (r() < 0.5 ? 'drink' : null), spawn: extra.spawn, ...extra });
  };
  guest('g_ball1', [T('btable0a', 'talk', [30, 50]), T('dance0', 'dance', [30, 40]), T('buffet', 'idle', [12, 18])], { spawn: 'btable0a' });
  guest('g_ball2', [T('btable0b', 'drink', [30, 50]), T('dance1', 'dance', [30, 40]), T('btable1c', 'talk', [20, 30])], { spawn: 'btable0b' });
  guest('g_ball3', [T('dance2', 'dance', [40, 60]), T('btable2a', 'drink', [30, 40])], { spawn: 'dance2' });
  guest('g_ball4', [T('dance3', 'dance', [40, 60]), T('ballroom_view', 'clap', [20, 30])], { spawn: 'dance3' });
  guest('g_ball5', [T('btable3a', 'talk', [40, 60]), T('ballroom_mingle0', 'talk', [20, 30])], { spawn: 'btable3a' });
  guest('g_party1', [T('party_dance0', 'dance', [40, 60]), T('ptable0b', 'drink', [30, 40])], { spawn: 'party_dance0' });
  guest('g_party2', [T('party_dance1', 'dance', [40, 60]), T('party_buffet', 'idle', [15, 20])], { spawn: 'party_dance1' });
  guest('g_party3', [T('party_mingle0', 'talk', [40, 60]), T('ptable2a', 'drink', [30, 40])], { spawn: 'party_mingle0' });
  guest('g_party4', [T('party_mingle1', 'talk', [40, 60]), T('fountain_w', 'idle', [20, 30])], { spawn: 'party_mingle1' });
  guest('g_party5', [T('ptable3b', 'drink', [40, 60]), T('party_mingle2', 'talk', [30, 40])], { spawn: 'ptable3b' });
  guest('g_party6', [T('party_dance2', 'dance', [40, 60]), T('party_mingle3', 'talk', [30, 40])], { spawn: 'party_dance2' });
  guest('g_garden1', [T('gazebo1', 'talk', [40, 60]), T('egarden_bench', 'sit', [30, 40])], { spawn: 'gazebo1' });
  guest('g_garden2', [T('gazebo2', 'talk', [40, 60]), T('rose_view', 'idle', [20, 30])], { spawn: 'gazebo2' });
  guest('g_terrace1', [T('terrace_table1', 'drink', [40, 60]), T('terrace_view2', 'idle', [20, 30])], { spawn: 'terrace_table1' });
  guest('g_terrace2', [T('terrace_chair1', 'liedown', [60, 90]), T('terrace_table2', 'drink', [30, 40])], { spawn: 'terrace_chair1' });
  guest('g_terrace3', [T('terrace_table3', 'talk', [40, 60]), T('telescope', 'idle', [15, 25])], { spawn: 'terrace_table3' });
  guest('g_pool1', [T('pool_chair1', 'liedown', [60, 90]), T('pool_edge1', 'idle', [20, 30])], { spawn: 'pool_chair1' });
  guest('g_pool2', [T('poolbar_guest', 'drink', [40, 60]), T('pool_chair3', 'liedown', [40, 60])], { spawn: 'poolbar_guest' });
  guest('g_lounge1', [T('lounge_sofa', 'sit', [50, 80]), T('lounge_fire', 'idle', [15, 25])], { spawn: 'lounge_sofa' });
  guest('g_lounge2', [T('lounge_chairL', 'sit', [50, 80]), T('gallery_view3', 'idle', [20, 30])], { spawn: 'lounge_chairL' });
  guest('g_gallery', [T('gallery_view1', 'idle', [25, 35]), T('gallery_bench', 'sit', [30, 40]), T('gallery_view2', 'idle', [20, 30])], { spawn: 'gallery_view2' });
  guest('g_foyer', [T('foyer_guest', 'talk', [40, 50]), T('reception', 'idle', [5, 8]), T('fountain_s', 'idle', [30, 40])], { spawn: 'foyer_guest' });
  guest('g_pier', [T('pier_greeter', 'wave', [999, 999], { forever: true, lines: ['Welcome to Gullcrest Key!', 'Party’s up the path! Mind the guards, they’re grumpy.', 'Lovely evening for it!'] })], { spawn: 'pier_greeter', hold: null, fem: true });
  guest('g_cove', [T('campfire', 'sit', [60, 80]), T('cove_walk', 'idle', [20, 30])], { spawn: 'campfire', hold: null });
  guest('g_maze', [T('maze_centre', 'idle', [40, 60]), T('maze_mid1', 'lookaround', [10, 20]), T('maze_mid2', 'lookaround', [10, 20])], { spawn: 'maze_centre', hold: null });

  return C;
}

// Conversations: lines spoken in turn by the listed speakers when the player
// is close enough. Some reveal opportunities.
export const CONVOS = {
  chandelier: {
    speakers: ['waiter_g1', 'waiter_g2'], reveal: 'lights_out', range: 7,
    lines: [
      [0, 'Did you see the chandelier wobble during soundcheck?'],
      [1, 'That winch backstage is held on by one rusty bolt. A wrench and a good yank, and…'],
      [0, 'Don’t. The Baron gives his toast right underneath it.'],
      [1, 'Every time, like clockwork. Same spot. Same terrible jokes.'],
      [0, 'Well, if it falls, it falls. I’m not cleaning that up.'],
    ],
  },
  feeding: {
    speakers: ['aquarist', 'aq_guard'], reveal: 'feeding_time', range: 7,
    lines: [
      [0, 'He’s doing it again today. Insists on feeding Mr. Nibbles himself.'],
      [1, 'The Baron? Up on that little platform?'],
      [0, 'Right on the edge. Leans over the water like he’s at a wishing well.'],
      [1, 'One little nudge…'],
      [0, 'Don’t even joke. Only staff in wetsuits are allowed near the tank anyway.'],
    ],
  },
  whiskey: {
    speakers: ['maid', 'security_desk_guard'], reveal: 'nightcap', range: 7,
    lines: [
      [0, 'I dusted the Baron’s decanter. Sixty-year-old whiskey, can you imagine?'],
      [1, 'He has a glass every single time he’s at his desk.'],
      [0, 'Nobody else is allowed to touch it. Not even me, and I polish it.'],
      [1, 'Keycard for the study’s right here on my desk, if you need to get in to clean.'],
    ],
  },
  ledger: {
    speakers: ['security_desk_guard'], reveal: 'ledger', range: 7,
    lines: [
      [0, '*on the phone* No, I don’t know the safe code. Why would I know the safe code?'],
      [0, '…His lucky number? Seven-one-three? Everyone knows that? Great security, boss.'],
    ],
  },
  martini: {
    speakers: ['bartender', 'barfly'], reveal: 'vexed_martini', range: 6,
    lines: [
      [1, 'What’s the fanciest drink you make?'],
      [0, 'The Vexed Martini. Madame Vex orders one every time she passes the bar.'],
      [0, 'I set it on the counter, she lets it sit a bit — says it “breathes”. Then down in one.'],
      [1, 'A martini doesn’t breathe.'],
      [0, 'You want to tell her that?'],
    ],
  },
  massage: {
    speakers: ['therapist'], reveal: 'hands_on', range: 7,
    lines: [
      [0, '*on the phone* Yes, Madame Vex’s massage, same time as always.'],
      [0, 'No, she won’t let anyone else do it. Face down, eyes closed, not a word.'],
      [0, 'If I’m sick? Then whoever wears my uniform, I suppose. She never looks.'],
    ],
  },
  hottub: {
    speakers: ['therapist', 'spa_guard'], reveal: 'hot_tub', range: 7,
    lines: [
      [0, 'She wants that ancient radio right by the hot tub again.'],
      [1, 'Isn’t that… dangerous?'],
      [0, 'Extremely. One bump and it’s in the water. But she likes her jazz.'],
    ],
  },
  railing: {
    speakers: ['gardener'], reveal: 'long_way_down', range: 7,
    lines: [
      [0, 'There, there, little fern. Grow nice and tall.'],
      [0, 'Don’t you go leaning on that railing, now. Bolts are rusted half through.'],
      [0, 'Madame Vex leans on it every evening for her cigarette. One good wrench and… SPLASH.'],
      [0, 'Not that I’d ever. I’m a gardener. I only murder weeds.'],
    ],
  },
  barbell: {
    speakers: ['trainer'], reveal: 'pumping_iron', range: 7,
    lines: [
      [0, 'Brick benches without a spotter. Every. Single. Time.'],
      [0, 'And the safety pins on that rack are loose. A couple of turns with a wrench and they’d drop right out.'],
      [0, 'Ugh. Why do I even bother. Twenty more stretches.'],
    ],
  },
  sauna: {
    speakers: ['gym_guard'], reveal: 'steam_room', range: 7,
    lines: [
      [0, '*radio* Yeah, Brick’s doing his sauna after his workout again.'],
      [0, 'The door latches from the OUTSIDE. Who designed that? And the heat dial’s right next to it.'],
      [0, 'Nah, nobody would lock him in. Probably.'],
    ],
  },
  crane: {
    speakers: ['dock1', 'dock2'], reveal: 'special_delivery', range: 7,
    lines: [
      [0, 'Brick’s coming to count the shipment again.'],
      [1, 'Stands right under the crane hook every time. Like a big dumb bullseye.'],
      [0, 'One wrong lever in that cabin and he’s a pancake.'],
      [1, 'Only dock crew are allowed in the cabin, so relax.'],
    ],
  },
  shake: {
    speakers: ['chef', 'cook'], reveal: 'protein_shake', range: 7,
    lines: [
      [1, 'Chef, Brick wants his protein shake in the gym fridge again.'],
      [0, 'Pah! Pink sludge! He drinks it straight after he’s done hitting things.'],
      [1, 'Should I make it extra strong?'],
      [0, 'Make it however you like. Nobody checks the gym fridge.'],
    ],
  },
  sniper: {
    speakers: ['keeper'], reveal: 'sniper', range: 7,
    lines: [
      [0, 'Some fancy fellow left a rifle case up here. “For the gulls,” he said.'],
      [0, 'Best view on the whole island from the lantern gallery. You can see the cliff terrace, the garden, the dock…'],
      [0, 'Not my business. I just keep the light on.'],
    ],
  },
};
