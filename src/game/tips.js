// First-time contextual tips. Each fires once per browser (remembered).
const KEY = 'cleanslate.tips.v1';

const TIPS = {
  behind: { icon: '🥷', touch: 'Sneak up behind someone, then tap ✋ to subdue them quietly.', kbm: 'Sneak up behind someone and press E to subdue them quietly.' },
  ko: { icon: '🧲', touch: 'Out cold! Drag the body (✋) somewhere nobody will find it — or take their clothes (☠ button).', kbm: 'Out cold! Drag the body (E) out of sight — or take their outfit (F).' },
  drag: { icon: '📦', touch: 'Dragging a body is very suspicious. Dumpsters, closets, laundry, bushes and the sea all work.', kbm: 'Dragging is very suspicious. Dumpsters, closets, laundry baskets, bushes and the sea all hide bodies.' },
  trespass: { icon: '⛔', touch: 'Off-limits area! Guards will warn you, then attack. A matching disguise lets you walk in freely.', kbm: 'Off-limits area! Guards will warn you, then attack. A matching disguise lets you walk in freely.' },
  spotted: { icon: '🏃', touch: 'Spotted! Run, break line of sight, hide in a closet or change clothes. Guards are slower than you.', kbm: 'Spotted! Run (Shift), break line of sight, hide in a closet or change clothes. Guards are slower than you.' },
  suspicion: { icon: '❓', touch: 'That meter above their head is suspicion. Get out of their sight before it fills!', kbm: 'That meter above their head is suspicion. Get out of their sight before it fills!' },
  opportunity: { icon: '💡', touch: 'Opportunity found! Follow the yellow marker. Manage them from the pause menu.', kbm: 'Opportunity found! Follow the yellow marker. Manage them from the pause menu (Esc).' },
  item: { icon: '🪙', touch: 'Tap the item button to use it. Drag from it to aim a throw — coins distract, heavy things knock people out.', kbm: 'Space uses your item, click throws at the cursor, T throws. Coins distract; heavy things bonk.' },
  frisk: { icon: '✋', touch: 'Front-door guards frisk guests. Weapons, crowbars and shovels will get you caught — stash them or find another way in.', kbm: 'Front-door guards frisk guests. Illegal items will get you caught — stash them (G) or find another way in.' },
  enforcer: { icon: '★', touch: 'Careful: some people (★ in Sense) know everyone in their uniform. Keep your distance, or blend in at a 🎭 work spot.', kbm: 'Careful: some people (★ in Sense) know everyone in their uniform. Keep your distance, or blend in at a 🎭 work spot.' },
  blend: { icon: '🎭', touch: 'Blending in! While you do the job, people who know your uniform won’t look twice. Move to stop.', kbm: 'Blending in! While you do the job, people who know your uniform won’t look twice. Move to stop.' },
  blendSpot: { icon: '🎭', touch: 'A 🎭 work spot for your disguise. Blend in here to dodge suspicious colleagues.', kbm: 'A 🎭 work spot for your disguise. Blend in here to dodge suspicious colleagues.' },
  disguise: { icon: '👔', touch: 'New disguise! The zone banner tells you where you’re allowed. Fellow staff may look twice.', kbm: 'New disguise! The zone banner tells you where you’re allowed. Fellow staff may look twice.' },
};

export class Tips {
  constructor(game) {
    this.game = game;
    this.seen = {};
    try {
      this.seen = JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch (e) {
      this.seen = {};
    }
    this.cool = 0;
    this.queue = [];
  }
  show(id) {
    if (this.seen[id] || !TIPS[id] || this.queue.includes(id)) return;
    this.queue.push(id);
  }
  update(dt) {
    const g = this.game;
    this.cool -= dt;
    // passive triggers
    const p = g.player;
    if (p.alive && !p.busy && !p.drag) {
      if (p.flags.trespass) this.show('trespass');
      for (const n of g.npcs) {
        if (n.inert || n.gone) continue;
        if (n.suspicion > 0.25 && n.seesPlayer) this.show('suspicion');
        if (n.def.enforcer && n.outfit === p.outfit && n.distTo(p.pos) < 7) this.show('enforcer');
      }
      const c = g.interactions.current;
      if (c.target && !c.target.inert && /Subdue/.test(c.primary?.label || '') && c.primary.label === 'Subdue') this.show('behind');
      if (p.inv.length > 1 && g.time > 25) this.show('item');
      if (/^Blend in/.test(c.primary?.label || '')) this.show('blendSpot');
    }
    if (this.cool > 0 || !this.queue.length) return;
    const id = this.queue.shift();
    this.seen[id] = true;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.seen));
    } catch (e) {
      /* ignore */
    }
    const t = TIPS[id];
    g.ui.tip(t.icon, g.mobileTouchActive() ? t.touch : t.kbm);
    this.cool = 7;
  }
  reset() {
    this.seen = {};
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      /* ignore */
    }
  }
}
