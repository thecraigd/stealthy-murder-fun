// Global stealth state, statistics, and the "how loud is this going" meter.

export class Director {
  constructor(game) {
    this.game = game;
    this.level = 'calm';
    this.heightened = false;
    this.lastHuntT = -99;
    this.lastSpotT = -99;
    this.combatEpisode = false;
    this.stats = {
      time: 0, spotted: 0, bodiesFound: 0, witnesses: 0, targetsKilled: 0, nonTargetKills: 0, kos: 0,
      accidents: 0, disguises: 0, combat: 0, shots: 0, compromised: 0, hits: 0, bodiesHidden: 0, coinsThrown: 0,
      methods: [],
    };
  }

  spotted(npc) {
    const g = this.game;
    if (g.time - this.lastHuntT > 3 || !this.combatEpisode) {
      this.stats.spotted++;
      this.stats.combat++;
      g.audio.stinger('spotted');
      g.tips?.show('spotted');
      g.quip?.('spotted');
      g.ui.toast('You’ve been spotted!', 'danger');
      g.cam.shake(0.15, 0.2);
    }
    this.combatEpisode = true;
    this.lastHuntT = g.time;
    this.lastSpotT = g.time;
  }
  hunting(npc) {
    this.lastHuntT = this.game.time;
  }
  witness(npc) {
    this.stats.witnesses++;
  }
  bodyFound(body, by) {
    this.stats.bodiesFound++;
    this.heightened = true;
  }

  update(dt) {
    const g = this.game;
    this.stats.time += dt;
    let combat = false, search = false, sus = 0;
    for (const n of g.npcs) {
      if (n.inert) continue;
      if (n.state === 'combat') {
        if (g.time - this.lastHuntT < 4) combat = true;
        else search = true;
      } else if (n.state === 'search') search = true;
      else if (n.state === 'warn') sus = Math.max(sus, 1);
      if (n.suspicion > sus) sus = n.suspicion;
    }
    let lvl = 'calm';
    if (combat) lvl = 'combat';
    else if (search) lvl = 'search';
    else if (sus > 0.25) lvl = 'suspicious';
    if (!combat && this.combatEpisode && g.time - this.lastHuntT > 4) {
      this.combatEpisode = false;
    }
    if (lvl !== this.level) {
      const prev = this.level;
      this.level = lvl;
      g.audio.setIntensity({ calm: 0, suspicious: 1, search: 2, combat: 3 }[lvl]);
      if (prev === 'combat' && lvl === 'search') g.ui.toast('They lost sight of you. Stay hidden!', 'warn');
      if ((prev === 'search' || prev === 'combat') && lvl === 'calm') g.ui.toast('The search has been called off.', 'good');
    }
  }

  // Status for the HUD.
  status() {
    const g = this.game;
    const p = g.player;
    if (!p.alive) return { text: 'Down', cls: 'danger' };
    if (this.level === 'combat') return { text: 'Hunted', cls: 'danger' };
    if (p.flags.hidden) return { text: p.perched ? 'Perched' : 'Hidden', cls: 'good' };
    if (p.flags.compromised) return { text: 'Compromised', cls: 'danger' };
    if (this.level === 'search') return { text: 'Search in progress', cls: 'warn' };
    if (g.npcs.some((n) => n.state === 'warn' && !n.inert)) return { text: 'Being told off', cls: 'warn' };
    if (p.flags.trespass) return { text: 'Trespassing', cls: 'warn' };
    if (p.flags.blending) return { text: 'Blending in', cls: 'good' };
    if (this.level === 'suspicious') return { text: 'Suspicious', cls: 'warn' };
    return { text: 'Undetected', cls: 'good' };
  }

  rating() {
    const s = this.stats;
    let score = 100;
    score -= s.spotted * 12;
    score -= s.bodiesFound * 10;
    score -= s.witnesses * 8;
    score -= s.nonTargetKills * 15;
    score -= s.compromised * 5;
    score -= s.combat ? 5 : 0;
    score += s.accidents * 2;
    score = Math.max(0, Math.min(100, score));
    const clean = s.spotted === 0 && s.bodiesFound === 0 && s.witnesses === 0 && s.nonTargetKills === 0;
    let title, desc, stars;
    if (clean && s.kos === 0) {
      title = 'Clean Slate'; stars = 5; desc = 'Not a single soul knew you were there. Your brother would be proud.';
    } else if (clean) {
      title = 'Spotless'; stars = 5; desc = 'Silent, unseen, and nobody innocent got hurt. A few naps were taken.';
    } else if (score >= 80) {
      title = 'Mostly Clean'; stars = 4; desc = 'A smudge or two, but the island will never figure it out.';
    } else if (score >= 60) {
      title = 'Smudged'; stars = 3; desc = 'Rumours will spread. But the job is done.';
    } else if (score >= 35) {
      title = 'Messy'; stars = 2; desc = 'That was… loud. Old habits die hard.';
    } else {
      title = 'Still a Thug'; stars = 1; desc = 'You got it done, but the old Rook would have been proud. That’s not a compliment.';
    }
    if (s.nonTargetKills >= 5) {
      title = 'Relapse'; stars = 1; desc = 'This was supposed to be about making things right. Try again.';
    }
    return { score, title, desc, stars };
  }
}
