// Disguises (outfits) and body presets.

export const OUTFITS = {
  rook: {
    name: 'Rook’s Coat',
    short: 'Own Coat',
    coat: 0x8b7a4e, coatBelt: 0x5a4a2c, top: 0x3c4655, shirt: 0xe8e2d0, tie: null,
    pants: 0x2f3442, shoes: 0x2b2018, scarf: 0x2fb5a8, sleeves: 'long',
    access: ['public'],
  },
  guest: {
    name: 'Party Guest',
    short: 'Guest',
    top: 0x2c5d8a, shirt: 0xffffff, tie: 0xe0453a, pants: 0x283044, shoes: 0x2b2018, buttons: 0xf2c14e,
    access: ['public'],
  },
  guard: {
    name: 'Security Guard',
    short: 'Guard',
    top: 0x2c3e6b, shirt: 0xd8e4f0, tie: 0x1c2440, pants: 0x232a40, shoes: 0x1a1a1a, belt: 0x1a1a1a,
    badge: 0xf2c14e, hat: 'cap', hatColor: 0x2c3e6b, hatColor2: 0x1a1a22, acc: ['earpiece'],
    access: ['public', 'staff', 'kitchen', 'security', 'restricted', 'spa', 'gym', 'dock', 'garden', 'aquarium', 'greenhouse', 'lighthouse'],
    enforcer: true,
  },
  waiter: {
    name: 'Waiter',
    short: 'Waiter',
    top: 0xffffff, shirt: 0xffffff, bowtie: 0x1c1c24, pants: 0x1f1f28, shoes: 0x1a1a1a, gloves: 0xffffff,
    buttons: 0xf2c14e, access: ['public', 'staff', 'kitchen', 'bar'],
  },
  bartender: {
    name: 'Bartender',
    short: 'Bartender',
    top: 0xf4f4f4, vest: 0x2a2430, bowtie: 0xc23b4a, pants: 0x1f1f28, shoes: 0x1a1a1a, sleeves: 'long',
    access: ['public', 'staff', 'bar', 'kitchen'],
  },
  chef: {
    name: 'Chef',
    short: 'Chef',
    top: 0xffffff, buttons: 0x2a2430, pants: 0x6b6f7a, shoes: 0x1a1a1a, apron: 0xf0f0f0, hat: 'toque',
    scarf: 0xe0453a, access: ['staff', 'kitchen'],
  },
  cook: {
    name: 'Cook',
    short: 'Cook',
    top: 0xffffff, pants: 0x8a8f9a, shoes: 0x1a1a1a, apron: 0x8fc9d6, hat: 'cookcap', sleeves: 'short',
    access: ['staff', 'kitchen'],
  },
  gardener: {
    name: 'Gardener',
    short: 'Gardener',
    top: 0x8fbf5a, pants: 0x4f7a3a, shoes: 0x5a3a20, straps: 0x4f7a3a, hat: 'sunhat', hatColor: 0xe8c878, hatColor2: 0xc23b4a,
    sleeves: 'short', gloves: 0xd9a46b, access: ['garden', 'greenhouse', 'staff'],
  },
  dockworker: {
    name: 'Dock Worker',
    short: 'Dockhand',
    top: 0x5a7fb0, vestHi: 0xff8a1e, pants: 0x3c4f7a, shoes: 0x4a3420, hat: 'hardhat', hatColor: 0xf7d44c,
    sleeves: 'short', gloves: 0x8a6a40, access: ['dock', 'staff'],
  },
  aquarist: {
    name: 'Aquarist',
    short: 'Aquarist',
    top: 0x1f3b5a, stripe: 0x3fb7b0, pants: 0x1f3b5a, shoes: 0x1a1a1a, hat: 'goggles', legs: 0x1f3b5a,
    gloves: 0x3fb7b0, access: ['aquarium', 'staff'],
  },
  masseur: {
    name: 'Spa Therapist',
    short: 'Therapist',
    top: 0xa8e0d0, pants: 0xffffff, shoes: 0xffffff, buttons: 0xffffff, sleeves: 'short', hat: 'headband', hatColor: 0xffffff,
    access: ['spa', 'staff'],
  },
  maid: {
    name: 'Housekeeper',
    short: 'Housekeeper',
    top: 0x2a2430, dress: 0x2a2430, dressLen: 0.55, apron: 0xffffff, pants: 0x2a2430, legs: 0x2a2430, shoes: 0x1a1a1a,
    hat: 'maid', sleeves: 'short', access: ['staff', 'public', 'restricted'],
  },
  trainer: {
    name: 'Personal Trainer',
    short: 'Trainer',
    top: 0xe0453a, stripe: 0xffffff, pants: 0x2a2430, shoes: 0xffffff, sleeves: 'none', hat: 'headband', hatColor: 0xffffff,
    access: ['gym', 'staff', 'spa'],
  },
  keeper: {
    name: 'Lighthouse Keeper',
    short: 'Keeper',
    top: 0x2c3e6b, stripe: 0xffffff, pants: 0x5a4a3a, shoes: 0x2b2018, hat: 'captain', hatColor: 0x2c3e6b,
    access: ['lighthouse', 'dock'],
  },
  underwear: {
    name: 'Underwear',
    short: 'Underwear',
    top: 0xffffff, pants: 0xe0453a, sleeves: 'none', bareLegs: true, barefoot: true,
    access: ['public'],
  },
  fisherman: {
    name: 'Fisherman',
    short: 'Fisherman',
    top: 0xf7d44c, coat: 0xf7d44c, pants: 0x3c4f7a, shoes: 0x2b2018, hat: 'bucket', hatColor: 0xf7d44c,
    access: ['dock'],
  },
};

// Zone access labels. Each zone in the level has one of these.
export const ZONE_NAMES = {
  public: 'Public',
  staff: 'Staff Only',
  kitchen: 'Kitchen',
  bar: 'Behind the Bar',
  security: 'Security',
  restricted: 'Private',
  spa: 'Spa',
  gym: 'Gym',
  dock: 'Dock Works',
  garden: 'Grounds',
  aquarium: 'Aquarium',
  greenhouse: 'Greenhouse',
  lighthouse: 'Lighthouse',
};

export function canAccess(outfitId, zoneAccess) {
  if (!zoneAccess || zoneAccess === 'public') return true;
  const o = OUTFITS[outfitId];
  return !!o && o.access.includes(zoneAccess);
}

// Guest variations (outfit overrides).
export const GUEST_LOOKS = [
  { top: 0x2c5d8a, tie: 0xe0453a },
  { top: 0x7a3a6a, tie: 0xf2c14e },
  { top: 0x3a6b4a, tie: 0xffffff },
  { top: 0xe8e0d0, tie: 0x2c3e6b, pants: 0xd8d0c0 },
  { top: 0x3a3a48, tie: 0x3fb7b0 },
  { top: 0xc8803a, tie: 0x2a2430, pants: 0x4a3a2a },
];
export const GUEST_DRESSES = [
  { top: 0xf59ac4, dress: 0xf59ac4, pearls: 0xffffff },
  { top: 0x3fb7b0, dress: 0x3fb7b0, pearls: 0xf2c14e },
  { top: 0xf7d44c, dress: 0xf7d44c, pearls: 0xffffff },
  { top: 0x8a5ac8, dress: 0x8a5ac8, pearls: 0xffffff },
  { top: 0xe0453a, dress: 0xe0453a, pearls: 0xf2c14e },
  { top: 0xffffff, dress: 0x9fd0ff, pearls: 0xffffff },
];

export const SKINS = [0xffdcb8, 0xf5c79e, 0xe8b088, 0xc98d62, 0xa86e48, 0x8a5636, 0xffe6cc, 0xd9a07a];
export const HAIRS = [0x3a2a20, 0x1f1a1a, 0x6b4426, 0xb07a3a, 0xe8c070, 0x8a3a20, 0xd0d0d0, 0x4a3020];

export const BODY_PRESETS = {
  rook: {
    skin: 0xf2c49c, hair: 'messy', hairColor: 0x2a2026, facial: 'stubble', acc: ['bandage'],
    height: 1.04, girth: 1.0, brow: 1.3,
  },
  baron: {
    skin: 0xffd9bd, hair: 'bald', fringe: true, hairColor: 0xb8b0a8, facial: 'curly', acc: ['monocle'],
    height: 1.0, girth: 1.15, belly: 1.6, head: 1.05, cheeks: true, nose: 1.4,
  },
  vex: {
    skin: 0xf7dcc8, hair: 'beehive', hairColor: 0x6a5a9a, acc: ['cateye', 'lipstick', 'lashes'],
    height: 1.16, girth: 0.82, legs: 1.15, head: 0.95, eyeSize: 0.9,
  },
  brick: {
    skin: 0xd9a07a, hair: 'buzz', hairColor: 0x2a2020, facial: 'mustache', acc: ['scar'],
    height: 1.18, girth: 1.75, chest: 1.6, head: 0.78, armThick: 1.55, legs: 0.9, brow: 1.6,
  },
};
