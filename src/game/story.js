import { after } from '../core/util.js';
// Mission objectives, discoverable opportunities (guided kill stories), flags.

export const OPPS = {
  lights_out: {
    title: 'Lights Out', target: 'baron', icon: '💡',
    desc: 'The ballroom chandelier hangs from a rusty winch backstage. The Baron toasts right beneath it.',
    steps: [
      { text: 'Get a wrench (the boathouse workbench has one).', done: (g) => g.player.has('wrench') || g.story.has('winch_loose'), wp: (g) => g.pickupPos('wrench') },
      { text: 'Loosen the chandelier winch backstage (behind the bar curtain).', done: (g) => g.story.has('winch_loose'), wp: (g) => g.anchor('winch') },
      { text: 'Wait for the Baron’s toast, then release the chandelier.', done: () => false, wp: (g) => g.anchor('winch') },
    ],
  },
  feeding_time: {
    title: 'Feeding Time', target: 'baron', icon: '🦈',
    desc: 'The Baron feeds his shark himself, leaning right over the tank.',
    steps: [
      { text: 'Get the aquarist’s wetsuit (Finn works in the aquarium).', done: (g) => g.player.outfit === 'aquarist' || g.story.has('baron_fed'), wp: (g) => g.npcPos('aquarist') },
      { text: 'Wait by the shark tank for the Baron’s feeding time.', done: (g) => g.story.has('baron_feeding'), wp: (g) => g.anchor('feed_spot') },
      { text: 'Give him a little nudge.', done: () => false, wp: (g) => g.npcPos('baron') },
    ],
  },
  nightcap: {
    title: 'A Fine Nightcap', target: 'baron', icon: '🥃',
    desc: 'The Baron never misses a glass of his 60-year-old whiskey at his desk.',
    steps: [
      { text: 'Find poison: Deathcap mushroom (greenhouse), pufferfish toxin (aquarium) or rat poison (kitchen).', done: (g) => g.hasPoison() || g.story.has('whiskey_poisoned'), wp: (g) => g.pickupPos('deathcap') },
      { text: 'Get into the study (keycard on the security desk — or the west window).', done: (g) => g.player.zone()?.id === 'study' || g.story.has('whiskey_poisoned'), wp: (g) => g.anchor('whiskey') },
      { text: 'Poison the whiskey decanter on the drinks trolley.', done: (g) => g.story.has('whiskey_poisoned'), wp: (g) => g.anchor('whiskey') },
      { text: 'Wait for the Baron’s nightcap.', done: () => false, wp: (g) => g.anchor('baron_desk') },
    ],
  },
  vexed_martini: {
    title: 'The Vexed Martini', target: 'vex', icon: '🍸',
    desc: 'Vex lets her martini “breathe” on the bar counter before she drinks it.',
    steps: [
      { text: 'Find poison (lethal, or rat poison to send her to the toilet).', done: (g) => g.hasPoison() || g.story.has('martini_poisoned'), wp: (g) => g.pickupPos('ratpoison') },
      { text: 'Wait for Vex at the bar and poison her martini while it “breathes”.', done: (g) => g.story.has('martini_poisoned'), wp: (g) => g.anchor('bar_counter') },
      { text: 'Watch the poison work. (If she runs to the restroom… follow her.)', done: () => false, wp: (g) => g.npcPos('vex') },
    ],
  },
  hands_on: {
    title: 'Hands-On Treatment', target: 'vex', icon: '💆',
    desc: 'Vex gets a massage face-down, eyes closed. She never looks at her therapist.',
    steps: [
      { text: 'Get a Spa Therapist uniform (the spa lockers, or the therapist herself).', done: (g) => g.player.outfit === 'masseur', wp: (g) => g.pickupPos('outfit_masseur') || g.npcPos('therapist') },
      { text: 'Make sure the real therapist isn’t around for the appointment.', done: (g) => { const t = g.npcById('therapist'); return !t || t.inert; }, wp: (g) => g.npcPos('therapist') },
      { text: 'Be in the massage room when Vex arrives.', done: () => false, wp: (g) => g.anchor('massage_therapist') },
    ],
  },
  hot_tub: {
    title: 'Hot Tub Time', target: 'vex', icon: '📻',
    desc: 'Vex soaks in the spa hot tub with an ancient radio playing right beside it.',
    steps: [
      { text: 'Get into the spa (staff only — a therapist uniform helps).', done: (g) => ['spa', 'spa_lobby'].includes(g.player.zone()?.id) || g.story.has('radio_dropped'), wp: (g) => g.anchor('spa_entrance') },
      { text: 'When Vex is in the hot tub, knock the radio in.', done: () => false, wp: (g) => g.anchor('hottub_radio') },
    ],
  },
  long_way_down: {
    title: 'A Long Way Down', target: 'vex', icon: '🧱',
    desc: 'Vex smokes against a rusty section of the cliff-top railing.',
    steps: [
      { text: 'Get a wrench.', done: (g) => g.player.has('wrench') || g.story.has('rail_loose'), wp: (g) => g.pickupPos('wrench') },
      { text: 'Loosen the bolts on the terrace railing.', done: (g) => g.story.has('rail_loose'), wp: (g) => g.anchor('rail_loose') },
      { text: 'Wait for Vex’s cigarette break.', done: () => false, wp: (g) => g.anchor('vex_smoke') },
    ],
  },
  pumping_iron: {
    title: 'Pumping Iron', target: 'brick', icon: '🏋',
    desc: 'Brick bench presses without a spotter, under a rack with loose safety pins.',
    steps: [
      { text: 'Get a wrench.', done: (g) => g.player.has('wrench') || g.story.has('rack_loose'), wp: (g) => g.pickupPos('wrench') },
      { text: 'Loosen the safety pins on the bench rack in the gym.', done: (g) => g.story.has('rack_loose'), wp: (g) => g.anchor('bench_spot') },
      { text: 'Wait for Brick to bench press.', done: () => false, wp: (g) => g.anchor('bench') },
    ],
  },
  steam_room: {
    title: 'Steam Room', target: 'brick', icon: '♨',
    desc: 'The sauna door latches from the outside. The heat dial is right next to it.',
    steps: [
      { text: 'Wait for Brick to go into the sauna after his workout.', done: (g) => g.story.has('brick_in_sauna'), wp: (g) => g.anchor('sauna_door') },
      { text: 'Latch the sauna door.', done: (g) => g.story.has('sauna_locked'), wp: (g) => g.anchor('sauna_door') },
      { text: 'Crank the heat.', done: () => false, wp: (g) => g.anchor('sauna_panel') },
    ],
  },
  special_delivery: {
    title: 'Special Delivery', target: 'brick', icon: '🏗',
    desc: 'Brick counts the shipment standing right under the crane hook.',
    steps: [
      { text: 'Get into the crane cabin in the cargo yard (dock crew only).', done: (g) => g.dist(g.anchor('crane_controls')) < 3, wp: (g) => g.anchor('crane_controls') },
      { text: 'Drop the crate when Brick inspects the shipment.', done: () => false, wp: (g) => g.anchor('crane_controls') },
    ],
  },
  protein_shake: {
    title: 'Protein Shake', target: 'brick', icon: '🥤',
    desc: 'Brick downs a protein shake from the gym fridge after his workout.',
    steps: [
      { text: 'Find poison.', done: (g) => g.hasPoison() || g.story.has('shake_poisoned'), wp: (g) => g.pickupPos('ratpoison') },
      { text: 'Poison the shake in the gym locker-room fridge.', done: (g) => g.story.has('shake_poisoned'), wp: (g) => g.anchor('shake_fridge') },
      { text: 'Wait for him to drink up.', done: () => false, wp: (g) => g.npcPos('brick') },
    ],
  },
  sniper: {
    title: 'Eye in the Sky', target: null, icon: '🎯',
    desc: 'There’s a rifle in the lighthouse, and the best view on the island.',
    steps: [
      { text: 'Take the rifle from the lighthouse.', done: (g) => g.player.has('rifle') || g.story.has('sniped'), wp: (g) => g.anchor('rifle_crate') },
      { text: 'Climb to the lantern gallery and line up a shot.', done: (g) => g.story.has('sniped'), wp: (g) => g.anchor('sniper_perch') },
    ],
  },
  ledger: {
    title: 'The Ledger', target: null, icon: '📒', optional: true,
    desc: 'The proof your brother was framed is in the Baron’s safe. Code: his lucky number, 7-1-3.',
    steps: [
      { text: 'Get into the Baron’s study.', done: (g) => g.player.zone()?.id === 'study' || g.player.has('ledger'), wp: (g) => g.anchor('safe') },
      { text: 'Open the safe (7-1-3) and take the ledger.', done: (g) => g.player.has('ledger'), wp: (g) => g.anchor('safe') },
    ],
  },
};

export const TARGETS = ['baron', 'vex', 'brick'];

export class Story {
  constructor(game) {
    this.game = game;
    this.flags = new Set();
    this.discovered = new Set();
    this.tracked = null;
    this.killed = {};
    this.done = new Set();
    this.exitReady = false;
  }
  has(f) {
    return this.flags.has(f);
  }
  flag(f) {
    this.flags.add(f);
  }
  event(name, npc) {
    this.game.setpieces?.onEvent(name, npc);
  }
  reveal(id, silent = false) {
    const o = OPPS[id];
    if (!o || this.discovered.has(id)) return;
    if (o.target && this.killed[o.target]) return;
    this.discovered.add(id);
    const g = this.game;
    if (!silent) {
      g.ui.toast(`Opportunity: <b>${o.title}</b>`, 'opp', o.icon);
      g.audio.stinger('opportunity');
    }
    if (id === 'ledger') this.flag('code_known');
    if (!this.tracked && g.settings.guidance) this.track(id);
    if (!silent) g.tips?.show('opportunity');
    g.progress?.discover(id);
  }
  track(id) {
    this.tracked = id && this.discovered.has(id) ? id : null;
  }
  currentStep(id) {
    const o = OPPS[id];
    for (let i = 0; i < o.steps.length; i++) if (!o.steps[i].done(this.game)) return i;
    return o.steps.length;
  }
  targetKilled(id, method) {
    this.killed[id] = method;
    for (const [oid, o] of Object.entries(OPPS)) {
      if (o.target === id) this.done.add(oid);
    }
    if (this.tracked && OPPS[this.tracked].target === id) {
      this.tracked = null;
      // auto-track another discovered, unfinished opportunity
      for (const oid of this.discovered) if (!this.done.has(oid)) { this.tracked = oid; break; }
    }
    if (TARGETS.every((t) => this.killed[t])) {
      this.exitReady = true;
      const g = this.game;
      g.ui.toast('All targets down. Get off the island!', 'good', '⛵');
      after(3.5, () => g.ui.bigText('ESCAPE THE ISLAND', 'Water taxi (pier), rowboat (cove) or the Baron’s speedboat', 'exit'));
    }
  }
  objectiveList() {
    const g = this.game;
    const name = (id) => g.npcById(id)?.name || id;
    const list = TARGETS.map((t) => ({ text: name(t), done: !!this.killed[t] }));
    list.push({ text: 'Recover the ledger', done: g.player.has('ledger') || this.has('ledger_escaped'), optional: true });
    if (this.exitReady) list.push({ text: 'Escape the island', done: false });
    return list;
  }
  waypoint() {
    const g = this.game;
    if (this.exitReady && !this.tracked) {
      // nearest exit
      let best = null, bd = 1e9;
      for (const a of ['taxi_exit', 'rowboat_exit', 'speedboat_exit']) {
        const p = g.anchor(a);
        const d = g.dist(p);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    }
    if (!this.tracked) return null;
    const o = OPPS[this.tracked];
    const i = this.currentStep(this.tracked);
    const s = o.steps[Math.min(i, o.steps.length - 1)];
    return s.wp ? s.wp(g) : null;
  }
  hintText() {
    if (!this.tracked) return null;
    const o = OPPS[this.tracked];
    const i = this.currentStep(this.tracked);
    if (i >= o.steps.length) return null;
    return `<span class="hint-ic">${o.icon}</span><b>${o.title}</b> — ${o.steps[i].text}`;
  }
  update() {
    const g = this.game;
    if (this.tracked && this.currentStep(this.tracked) >= OPPS[this.tracked].steps.length) {
      this.done.add(this.tracked);
      this.tracked = null;
    }
    g.ui.setHint(g.settings.guidance ? this.hintText() : null);
  }
}
