// Challenges, mastery XP, unlocks, persistent progress (localStorage).

const KEY = 'cleanslate.save.v1';

export const CHALLENGES = [
  // --- Signature kills
  { id: 'k_lights', cat: 'Assassination', name: 'Lights Out', desc: 'Drop the chandelier on the Baron during his toast.', xp: 300, icon: '💡' },
  { id: 'k_shark', cat: 'Assassination', name: 'Feeding Time', desc: 'Feed the Baron to Mr. Nibbles.', xp: 300, icon: '🦈' },
  { id: 'k_whiskey', cat: 'Assassination', name: 'A Fine Nightcap', desc: 'Poison the Baron’s whiskey.', xp: 250, icon: '🥃' },
  { id: 'k_martini', cat: 'Assassination', name: 'The Vexed Martini', desc: 'Poison Madame Vex’s martini.', xp: 250, icon: '🍸' },
  { id: 'k_massage', cat: 'Assassination', name: 'Hands-On Treatment', desc: 'Eliminate Vex during her massage.', xp: 300, icon: '💆' },
  { id: 'k_tub', cat: 'Assassination', name: 'Hot Tub Time', desc: 'Electrocute Vex in the hot tub.', xp: 300, icon: '📻' },
  { id: 'k_rail', cat: 'Assassination', name: 'A Long Way Down', desc: 'Send Vex over the cliff-top railing.', xp: 300, icon: '🧱' },
  { id: 'k_barbell', cat: 'Assassination', name: 'Pumping Iron', desc: 'Let the barbell do the work on Brick.', xp: 300, icon: '🏋' },
  { id: 'k_sauna', cat: 'Assassination', name: 'Steam Room', desc: 'Cook Brick in his own sauna.', xp: 300, icon: '♨' },
  { id: 'k_crane', cat: 'Assassination', name: 'Special Delivery', desc: 'Drop the crane crate on Brick.', xp: 300, icon: '🏗' },
  { id: 'k_shake', cat: 'Assassination', name: 'Protein Shake', desc: 'Poison Brick’s protein shake.', xp: 250, icon: '🥤' },
  { id: 'k_sniper', cat: 'Assassination', name: 'Eye in the Sky', desc: 'Snipe a target from the lighthouse.', xp: 300, icon: '🎯' },
  { id: 'k_flush', cat: 'Assassination', name: 'Flushed', desc: 'Drown a target in a toilet.', xp: 250, icon: '🚽' },
  { id: 'k_statue', cat: 'Assassination', name: 'Art Critic', desc: 'Topple the gallery statue onto a target.', xp: 300, icon: '🗿' },
  { id: 'k_hands', cat: 'Assassination', name: 'Up Close & Personal', desc: 'Eliminate a target with your bare hands.', xp: 150, icon: '✋' },
  // --- Feats
  { id: 'f_banana', cat: 'Feats', name: 'Banana Republic', desc: 'Make someone slip on a banana peel.', xp: 150, icon: '🍌' },
  { id: 'f_selfslip', cat: 'Feats', name: 'Physical Comedy', desc: 'Slip on your own banana peel.', xp: 100, icon: '🤸' },
  { id: 'f_pan', cat: 'Feats', name: 'BONG', desc: 'Knock someone out with a frying pan.', xp: 100, icon: '🍳' },
  { id: 'f_fish', cat: 'Feats', name: 'Fish Slap', desc: 'Knock someone out with a frozen fish.', xp: 100, icon: '🐟' },
  { id: 'f_baguette', cat: 'Feats', name: 'Ooh La La', desc: 'Knock someone out with a baguette.', xp: 100, icon: '🥖' },
  { id: 'f_throw', cat: 'Feats', name: 'Long Distance Bonk', desc: 'Knock someone out with a thrown object.', xp: 100, icon: '🎯' },
  { id: 'f_sea', cat: 'Feats', name: 'Sleeps With the Fishes', desc: 'Dump a body into the sea.', xp: 100, icon: '🌊' },
  { id: 'f_nibbles', cat: 'Feats', name: 'Mr. Nibbles Says Thanks', desc: 'Feed a body to the shark.', xp: 150, icon: '🦈' },
  { id: 'f_hide', cat: 'Feats', name: 'Tidy Up', desc: 'Hide 3 bodies in containers in one run.', xp: 150, icon: '📦' },
  { id: 'f_disguises', cat: 'Feats', name: 'Wardrobe Malfunction', desc: 'Wear 5 different disguises in one run.', xp: 200, icon: '👔' },
  { id: 'f_telescope', cat: 'Feats', name: 'Sightseer', desc: 'Look through the terrace telescope.', xp: 50, icon: '🔭' },
  { id: 'f_party', cat: 'Feats', name: 'Party Animal', desc: 'Crank the DJ’s volume.', xp: 50, icon: '🎉' },
  { id: 'f_allopps', cat: 'Feats', name: 'All Ears', desc: 'Discover every opportunity (across runs).', xp: 300, icon: '👂' },
  // --- Classics (end of run)
  { id: 'c_clean', cat: 'Classics', name: 'Clean Slate', desc: 'Never spotted, no bodies found, no witnesses, only targets harmed.', xp: 500, icon: '🧽' },
  { id: 'c_spotless', cat: 'Classics', name: 'Spotless', desc: 'Complete the mission without being spotted or any body found.', xp: 300, icon: '✨' },
  { id: 'c_suit', cat: 'Classics', name: 'Coat Only', desc: 'Complete the mission without changing out of Rook’s coat.', xp: 300, icon: '🧥' },
  { id: 'c_accidents', cat: 'Classics', name: 'Accident Prone', desc: 'Eliminate all three targets with accidents.', xp: 400, icon: '🤕' },
  { id: 'c_ledger', cat: 'Classics', name: 'Brother’s Keeper', desc: 'Escape the island with the ledger.', xp: 300, icon: '📒' },
  { id: 'c_speed', cat: 'Classics', name: 'Stylish Exit', desc: 'Escape in the Baron’s speedboat.', xp: 150, icon: '🚤' },
  { id: 'c_row', cat: 'Classics', name: 'Row, Row, Row', desc: 'Escape quietly in the rowboat.', xp: 100, icon: '🚣' },
  { id: 'c_fast', cat: 'Classics', name: 'Express Service', desc: 'Complete the mission in under 12 minutes.', xp: 300, icon: '⏱' },
  { id: 'c_nokill', cat: 'Classics', name: 'Redemption', desc: 'Complete the mission without killing any non-target.', xp: 200, icon: '🕊' },
  { id: 'c_pacifist', cat: 'Classics', name: 'Light Touch', desc: 'Complete the mission without knocking anyone out.', xp: 300, icon: '🪶' },
];

export const MASTERY = [0, 300, 800, 1400, 2100, 2900, 3800, 4800, 6000, 7500, 9999999];

const OPP_TO_CH = {
  lights_out: 'k_lights', feeding_time: 'k_shark', nightcap: 'k_whiskey', vexed_martini: 'k_martini', hands_on: 'k_massage',
  hot_tub: 'k_tub', long_way_down: 'k_rail', pumping_iron: 'k_barbell', steam_room: 'k_sauna', special_delivery: 'k_crane',
  protein_shake: 'k_shake', sniper: 'k_sniper',
};

export class Progress {
  constructor() {
    this.data = { xp: 0, done: {}, discovered: {}, runs: 0, wins: 0, best: null, settings: null };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...this.data, ...JSON.parse(raw) };
    } catch (e) {
      /* private mode etc */
    }
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      /* ignore */
    }
  }
  get xp() {
    return this.data.xp;
  }
  get level() {
    let l = 0;
    while (l < MASTERY.length - 1 && this.data.xp >= MASTERY[l + 1]) l++;
    return l;
  }
  levelProgress() {
    const l = this.level;
    const a = MASTERY[l], b = MASTERY[l + 1];
    return Math.min(1, (this.data.xp - a) / (b - a));
  }
  isDone(id) {
    return !!this.data.done[id];
  }
  discover(id) {
    this.data.discovered[id] = true;
    this.save();
  }
  completeOpp(id) {
    this._pendingOpp = id;
  }
  reset() {
    this.data = { xp: 0, done: {}, discovered: {}, runs: 0, wins: 0, best: null, settings: this.data.settings };
    this.save();
  }
}

export class Challenges {
  constructor(progress) {
    this.progress = progress;
    this.run = null;
  }
  beginRun(game) {
    this.game = game;
    this.run = { completed: [], xp: 0, hidden: 0, disguises: new Set(), kills: {} };
    this.progress.data.runs++;
    this.progress.save();
  }
  complete(id) {
    const c = CHALLENGES.find((x) => x.id === id);
    if (!c || !this.run) return;
    if (this.run.completed.includes(id)) return;
    const first = !this.progress.isDone(id);
    this.run.completed.push(id);
    if (first) {
      this.progress.data.done[id] = true;
      this.progress.data.xp += c.xp;
      this.run.xp += c.xp;
      this.progress.save();
      this.game?.ui.toast(`Challenge complete: <b>${c.name}</b> +${c.xp} XP`, 'challenge', c.icon);
    }
  }
  event(name, d = {}) {
    if (!this.run) return;
    const g = this.game;
    switch (name) {
      case 'targetKilled': {
        const m = d.cause?.method;
        const opp = d.cause?.opp;
        if (opp && OPP_TO_CH[opp]) {
          // only count signature kills when the method matches the opportunity
          const map = { k_lights: 'chandelier', k_shark: 'shark', k_rail: 'fall', k_barbell: 'barbell', k_sauna: 'sauna', k_crane: 'crane', k_tub: 'electrocuted', k_massage: 'massage', k_sniper: 'sniper' };
          const ch = OPP_TO_CH[opp];
          if (!map[ch] || map[ch] === m) this.complete(ch);
        }
        if (m === 'poison' && d.npc.poisonSource && OPP_TO_CH[d.npc.poisonSource]) this.complete(OPP_TO_CH[d.npc.poisonSource]);
        if (m === 'sniper') this.complete('k_sniper');
        if (m === 'drowned') this.complete('k_flush');
        if (m === 'statue') this.complete('k_statue');
        if (m === 'takedown') this.complete('k_hands');
        this.run.kills[d.npc.id] = { method: m, accident: !!d.cause?.accident };
        break;
      }
      case 'slip':
        this.complete('f_banana');
        break;
      case 'selfSlip':
        this.complete('f_selfslip');
        break;
      case 'meleeKO':
      case 'thrownKO':
        if (d.item === 'pan') this.complete('f_pan');
        if (d.item === 'fish') this.complete('f_fish');
        if (d.item === 'baguette') this.complete('f_baguette');
        if (name === 'thrownKO') this.complete('f_throw');
        break;
      case 'bodyDumped':
        this.complete('f_sea');
        break;
      case 'sharkFed':
        this.complete('f_nibbles');
        break;
      case 'bodyHidden':
        this.run.hidden++;
        if (this.run.hidden >= 3) this.complete('f_hide');
        break;
      case 'disguise':
        this.run.disguises.add(d.outfit);
        if (this.run.disguises.size >= 5) this.complete('f_disguises');
        break;
      case 'telescope':
        this.complete('f_telescope');
        break;
      case 'partyMode':
        this.complete('f_party');
        break;
      case 'exit': {
        const s = g.director.stats;
        const clean = s.spotted === 0 && s.bodiesFound === 0 && s.witnesses === 0 && s.nonTargetKills === 0;
        if (clean && s.kos === 0) this.complete('c_clean');
        if (s.spotted === 0 && s.bodiesFound === 0) this.complete('c_spotless');
        if (g.player.disguiseLog.size === 1 && g.player.outfit === 'rook') this.complete('c_suit');
        const ks = Object.values(this.run.kills);
        if (ks.length >= 3 && ks.every((k) => k.accident)) this.complete('c_accidents');
        if (g.player.has('ledger')) this.complete('c_ledger');
        if (d.kind === 'speedboat') this.complete('c_speed');
        if (d.kind === 'rowboat') this.complete('c_row');
        if (s.time < 12 * 60) this.complete('c_fast');
        if (s.nonTargetKills === 0) this.complete('c_nokill');
        if (s.kos === 0) this.complete('c_pacifist');
        this.progress.data.wins++;
        this.progress.save();
        break;
      }
    }
    if (Object.keys(this.progress.data.discovered).length >= 13) this.complete('f_allopps');
  }
  update() {}
}
