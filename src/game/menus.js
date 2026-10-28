// Title, briefing, loadout, pause, results, failure, settings, help.
import * as THREE from 'three';
import { Character } from './character.js';
import { OUTFITS, BODY_PRESETS } from './outfits.js';
import { OPPS } from './story.js';
import { CHALLENGES, MASTERY } from './challenges.js';
import { START_LOCATIONS, LOADOUT_ITEMS } from './game.js';
import { ITEMS } from './items.js';
import { formatTime } from '../core/util.js';

const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export class Menus {
  constructor(app) {
    this.app = app;
    this.root = h('div', 'menus');
    document.getElementById('ui').appendChild(this.root);
    this.portraits = {};
  }

  clear() {
    this.root.innerHTML = '';
    this.root.className = 'menus';
  }
  panel(cls = '') {
    this.clear();
    this.root.classList.add('open');
    const p = h('div', 'panel ' + cls);
    this.root.appendChild(p);
    return p;
  }
  close() {
    this.clear();
  }
  btn(label, cls, fn) {
    const b = h('button', 'mbtn ' + (cls || ''), label);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.app.audio.unlock();
      this.app.audio.sfx('click', null);
      fn();
    });
    return b;
  }

  // ---------------------------------------------------------------- portraits
  makePortraits() {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(256, 256);
    r.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8a7a, 2.0));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    sun.position.set(2, 3, 4);
    scene.add(sun);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    const make = (id, body, outfit, bg) => {
      const c = new Character({ body, outfit });
      scene.add(c.group);
      c.update(1 / 60, { state: 'idle' });
      c.setFace(id === 'rook' ? 'sad' : id === 'brick' ? 'angry' : 'happy');
      for (let i = 0; i < 30; i++) c.update(1 / 30, { state: 'idle' });
      const hy = c.headWorldY;
      cam.position.set(0.5, hy - 0.15, 2.3);
      cam.lookAt(0, hy - 0.45, 0);
      scene.background = new THREE.Color(bg);
      r.render(scene, cam);
      this.portraits[id] = r.domElement.toDataURL();
      scene.remove(c.group);
    };
    make('baron', BODY_PRESETS.baron, { ...OUTFITS.guest, top: 0x7a3a8a, shirt: 0xffffff, tie: 0xf2c14e, pants: 0x5a2a6a, buttons: 0xf2c14e, hat: 'tophat', hatColor: 0x2a2430, hatColor2: 0x7a3a8a }, 0xf2c14e);
    make('vex', BODY_PRESETS.vex, { ...OUTFITS.guest, top: 0x2a2430, dress: 0xc23b4a, pearls: 0xffffff, tie: null, shirt: null, buttons: null, sleeves: 'none' }, 0xf59ac4);
    make('brick', BODY_PRESETS.brick, { ...OUTFITS.trainer, top: 0xffffff, stripe: 0xe0453a, pants: 0x8a8f9a, hat: 'headband', hatColor: 0xe0453a, chain: 0xf2c14e }, 0x7fcf4f);
    make('rook', BODY_PRESETS.rook, OUTFITS.rook, 0x3fb7b0);
    r.dispose();
    r.forceContextLoss?.();
  }

  // ---------------------------------------------------------------- title
  title() {
    const app = this.app;
    const p = this.panel('title');
    const lvl = app.progress.level;
    p.innerHTML = `
      <div class="logo"><span class="l1">CLEAN</span><span class="l2">SLATE</span></div>
      <div class="tagline">One island. Three old friends. A hundred ways to make it look like an accident.</div>`;
    const b = h('div', 'btn-col');
    b.append(
      this.btn('▶︎ Play', 'big', () => this.briefing()),
      this.btn('🏆 Challenges', '', () => this.challenges(() => this.title())),
      this.btn('❓ How to Play', '', () => this.help(() => this.title())),
      this.btn('⚙ Settings', '', () => this.settings(() => this.title())),
    );
    p.appendChild(b);
    const m = h('div', 'mastery-mini', `<div>Mastery <b>${lvl}</b></div><div class="mbar"><div style="width:${app.progress.levelProgress() * 100}%"></div></div><div class="xp">${app.progress.xp} XP</div>`);
    p.appendChild(m);
    p.appendChild(h('div', 'credits', 'A stealth sandbox • everything procedurally drawn & synthesized'));
  }

  // ---------------------------------------------------------------- briefing
  briefing() {
    const p = this.panel('briefing');
    const P = this.portraits;
    p.innerHTML = `
      <h2>Briefing</h2>
      <div class="story">
        <img class="rook-por" src="${P.rook}" alt="Rook">
        <p>Ten years ago you were <b>Rook</b>, the Syndicate’s best “cleaner”. You made problems — and people — disappear.</p>
        <p>Then they framed your little brother for a job you did, and he took the fall. You got out. You got clean. You’ve spent every day since trying to make it right.</p>
        <p>Tonight the three people who set him up are celebrating at the Baron’s island estate, <b>Gullcrest Key</b>. Their ledger — the proof he was innocent — sits in the Baron’s safe.</p>
        <p class="vow">Take them down. Leave no innocent harmed. Wipe the slate clean.</p>
      </div>
      <div class="targets">
        <div class="tcard"><img src="${P.baron}" alt=""><div class="tn">Baron Silas Crowe</div><div class="td">Host. Collector of boats, fish and grudges. Loves the sound of his own toasts.</div></div>
        <div class="tcard"><img src="${P.vex}" alt=""><div class="tn">Madame Odette Vex</div><div class="td">The Syndicate’s accountant. Exquisite taste in forgeries, martinis and spa days.</div></div>
        <div class="tcard"><img src="${P.brick}" alt=""><div class="tn">Brick Mallory</div><div class="td">The muscle. Refers to himself in the third person. Never skips leg day.</div></div>
      </div>`;
    const row = h('div', 'btn-row');
    row.append(this.btn('← Back', '', () => this.title()), this.btn('Plan Loadout →', 'big', () => this.loadout()));
    p.appendChild(row);
  }

  // ---------------------------------------------------------------- loadout
  loadout() {
    const app = this.app;
    const lvl = app.progress.level;
    const p = this.panel('loadout');
    p.appendChild(h('h2', '', 'Loadout'));
    p.appendChild(h('div', 'sub', `Mastery level <b>${lvl}</b> — earn XP from challenges to unlock new starts and gear.`));
    p.appendChild(h('h3', '', 'Starting location'));
    const grid = h('div', 'cards');
    let start = app.lastStart && START_LOCATIONS[app.lastStart]?.mastery <= lvl ? app.lastStart : 'pier';
    let item = app.lastItem && LOADOUT_ITEMS[app.lastItem]?.mastery <= lvl ? app.lastItem : 'none';
    const renderStarts = () => {
      grid.innerHTML = '';
      for (const [id, s] of Object.entries(START_LOCATIONS)) {
        const locked = s.mastery > lvl;
        const c = h('button', 'card' + (id === start ? ' sel' : '') + (locked ? ' locked' : ''), `<div class="cn">${locked ? '🔒 ' : ''}${s.name}</div><div class="cd">${locked ? `Unlocks at mastery ${s.mastery}` : s.desc}</div><div class="co">👔 ${OUTFITS[s.outfit].name}</div>`);
        if (!locked) c.addEventListener('click', () => { start = id; renderStarts(); });
        grid.appendChild(c);
      }
    };
    renderStarts();
    p.appendChild(grid);
    p.appendChild(h('h3', '', 'Extra item <span class="dim">(you always bring 3 coins)</span>'));
    const ig = h('div', 'cards items');
    const renderItems = () => {
      ig.innerHTML = '';
      for (const [id, it] of Object.entries(LOADOUT_ITEMS)) {
        const locked = it.mastery > lvl;
        const d = it.id ? ITEMS[it.id] : null;
        const c = h('button', 'card small' + (id === item ? ' sel' : '') + (locked ? ' locked' : ''), `<div class="ci">${locked ? '🔒' : d ? d.icon : '∅'}</div><div class="cn">${d ? d.name : it.name}</div>${locked ? `<div class="cd">Mastery ${it.mastery}</div>` : d?.illegal ? '<div class="cd tag-illegal">illegal</div>' : ''}`);
        if (!locked) c.addEventListener('click', () => { item = id; renderItems(); });
        ig.appendChild(c);
      }
    };
    renderItems();
    p.appendChild(ig);
    const row = h('div', 'btn-row');
    row.append(this.btn('← Back', '', () => this.briefing()), this.btn('▶︎ Start Mission', 'big go', () => app.start(start, item)));
    p.appendChild(row);
  }

  // ---------------------------------------------------------------- pause
  pause() {
    const app = this.app;
    const g = app.game;
    const p = this.panel('pause');
    p.appendChild(h('h2', '', 'Paused'));
    const s = g.director.stats;
    p.appendChild(h('div', 'sub', `⏱ ${formatTime(s.time)} • Targets ${s.targetsKilled}/3 • ${g.director.status().text}`));
    const tabs = h('div', 'tabs');
    const body = h('div', 'tab-body');
    const tab = (name, fn) => {
      const b = h('button', 'tab', name);
      b.addEventListener('click', () => {
        tabs.querySelectorAll('.tab').forEach((t) => t.classList.remove('sel'));
        b.classList.add('sel');
        body.innerHTML = '';
        fn(body);
      });
      tabs.appendChild(b);
      return b;
    };
    const t1 = tab('Opportunities', (b) => this.oppList(b));
    tab('Challenges', (b) => this.challengeList(b));
    tab('Controls', (b) => this.helpBody(b));
    tab('Settings', (b) => this.settingsBody(b));
    p.append(tabs, body);
    t1.click();
    const row = h('div', 'btn-row');
    row.append(
      this.btn('▶︎ Resume', 'big go', () => app.resume()),
      this.btn('↻ Restart', '', () => app.restart()),
      this.btn('✖ Quit', 'danger', () => app.quit()),
    );
    p.appendChild(row);
  }

  oppList(b) {
    const g = this.app.game;
    const st = g.story;
    const list = Object.entries(OPPS);
    if (!st.discovered.size) b.appendChild(h('div', 'empty', 'No opportunities discovered yet. Eavesdrop on conversations — staff gossip a lot.'));
    for (const [id, o] of list) {
      const known = st.discovered.has(id);
      if (!known) continue;
      const done = st.done.has(id) || (o.target && st.killed[o.target]);
      const tracked = st.tracked === id;
      const row = h('div', 'opp' + (done ? ' done' : '') + (tracked ? ' tracked' : ''));
      const tn = o.target ? g.npcById(o.target)?.name : 'Any target';
      const step = st.currentStep(id);
      row.innerHTML = `<div class="oi">${o.icon}</div><div class="ot"><div class="on">${o.title} <span class="dim">• ${tn}</span></div><div class="od">${o.desc}</div>${!done && step < o.steps.length ? `<div class="os">Next: ${o.steps[step].text}</div>` : ''}</div>`;
      if (!done) {
        const tb = this.btn(tracked ? 'Untrack' : 'Track', 'small', () => {
          st.track(tracked ? null : id);
          b.innerHTML = '';
          this.oppList(b);
        });
        row.appendChild(tb);
      }
      b.appendChild(row);
    }
    const unknown = list.filter(([id]) => !st.discovered.has(id)).length;
    if (unknown) b.appendChild(h('div', 'dim center', `${unknown} more opportunit${unknown === 1 ? 'y' : 'ies'} to discover…`));
  }

  challengeList(b, filterRun = false) {
    const pr = this.app.progress;
    const cats = [...new Set(CHALLENGES.map((c) => c.cat))];
    const done = CHALLENGES.filter((c) => pr.isDone(c.id)).length;
    b.appendChild(h('div', 'sub', `${done}/${CHALLENGES.length} complete • Mastery ${pr.level} • ${pr.xp} XP`));
    for (const cat of cats) {
      b.appendChild(h('h3', '', cat));
      const grid = h('div', 'chs');
      for (const c of CHALLENGES.filter((x) => x.cat === cat)) {
        const d = pr.isDone(c.id);
        grid.appendChild(h('div', 'ch' + (d ? ' done' : ''), `<div class="chi">${c.icon}</div><div><div class="chn">${c.name}</div><div class="chd">${c.desc}</div></div><div class="chx">${d ? '✔' : c.xp + 'xp'}</div>`));
      }
      b.appendChild(grid);
    }
  }

  challenges(back) {
    const p = this.panel('wide');
    p.appendChild(h('h2', '', 'Challenges'));
    const body = h('div', 'tab-body');
    this.challengeList(body);
    p.appendChild(body);
    const row = h('div', 'btn-row');
    row.append(this.btn('← Back', '', back));
    p.appendChild(row);
  }

  helpBody(b) {
    b.innerHTML = `
      <div class="help">
        <div class="hcol"><h3>📱 Touch</h3>
          <p><b>Left thumb:</b> drag anywhere on the left to move. Push to the edge to run.</p>
          <p><b>✋ Action</b> (big button): context action — subdue, drag, pick up, hide, use.</p>
          <p><b>☠ Alt</b>: alternate action — eliminate, take outfit.</p>
          <p><b>Item button</b>: tap to use the held item. <b>Drag from it</b> to aim a throw.</p>
          <p><b>🥷 Sneak</b> toggles tiptoeing. <b>👁 Sense</b>: hold to see people through walls.</p>
          <p>Drag on the right side to rotate the camera, pinch to zoom. Tap the minimap to enlarge.</p>
        </div>
        <div class="hcol"><h3>⌨ Keyboard &amp; Mouse</h3>
          <p><kbd>WASD</kbd> move • <kbd>Shift</kbd> run • <kbd>C</kbd> sneak</p>
          <p><kbd>E</kbd> action • <kbd>F</kbd> alt action</p>
          <p><kbd>Space</kbd> use item (auto-aim) • <kbd>Click</kbd> use/throw at cursor • <kbd>T</kbd> throw</p>
          <p><kbd>1-9</kbd> / <kbd>Q</kbd> select item • <kbd>0</kbd> empty hands • <kbd>G</kbd> drop</p>
          <p><kbd>Tab</kbd>/<kbd>V</kbd> hold Sense • <kbd>Z</kbd>/<kbd>X</kbd> or right-drag rotate • wheel zoom</p>
          <p><kbd>M</kbd> big map • <kbd>Esc</kbd> pause</p>
        </div>
        <div class="hcol wide"><h3>🧽 How to be a ghost</h3>
          <p><b>Disguises</b> get you into places. Each zone shows who’s allowed when you enter. Guards and <b>enforcers</b> (🟧 in Sense) look closely at people wearing <i>their</i> uniform.</p>
          <p><b>Suspicion meters</b> fill above heads when someone sees something odd. White “?” = curious, red = alarm. Break line of sight and they calm down.</p>
          <p><b>Illegal acts</b> (takedowns, dragging bodies, holding weapons, tampering) are seen instantly. Do them where nobody is looking.</p>
          <p><b>Bodies</b> get found. Drag them into containers, bushes, the sea, or… the shark tank.</p>
          <p>If you’re <b>spotted</b>, run, break line of sight, hide in a closet or change disguise. The search will die down.</p>
          <p><b>Eavesdrop!</b> Gossip reveals opportunities — elaborate accidents that never look like murder.</p>
        </div>
      </div>`;
  }
  help(back) {
    const p = this.panel('wide');
    p.appendChild(h('h2', '', 'How to Play'));
    const body = h('div', 'tab-body');
    this.helpBody(body);
    p.appendChild(body);
    const row = h('div', 'btn-row');
    row.append(this.btn('← Back', '', back));
    p.appendChild(row);
  }

  settingsBody(b) {
    const app = this.app;
    const s = app.settings;
    const row = (label, ctrl) => {
      const r = h('div', 'set-row', `<label>${label}</label>`);
      r.appendChild(ctrl);
      b.appendChild(r);
    };
    const slider = (key) => {
      const i = document.createElement('input');
      i.type = 'range';
      i.min = 0;
      i.max = 1;
      i.step = 0.05;
      i.value = s[key];
      i.addEventListener('input', () => {
        s[key] = +i.value;
        app.saveSettings();
        app.audio.applyVolumes();
      });
      return i;
    };
    const choice = (key, opts, onChange) => {
      const w = h('div', 'choice');
      for (const [v, l] of opts) {
        const bb = h('button', 'chip' + (s[key] === v ? ' sel' : ''), l);
        bb.addEventListener('click', () => {
          s[key] = v;
          app.saveSettings();
          w.querySelectorAll('.chip').forEach((c) => c.classList.remove('sel'));
          bb.classList.add('sel');
          onChange?.(v);
        });
        w.appendChild(bb);
      }
      return w;
    };
    row('Music', slider('music'));
    row('Sound effects', slider('sfx'));
    row('Graphics', choice('quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => app.toast?.('Graphics change applies on restart.')));
    row('Mission guidance', choice('guidance', [[true, 'On'], [false, 'Off']]));
    row('Vision cones', choice('cones', [['guards', 'Guards'], ['all', 'Everyone'], ['off', 'Off']]));
    row('Kill cams', choice('killcam', [[true, 'On'], [false, 'Off']]));
    row('Slow motion', choice('slowmo', [[true, 'On'], [false, 'Off']]));
    row('Targets through walls', choice('targetXray', [[true, 'On'], [false, 'Off']]));
    const rp = this.btn('Reset all progress', 'danger small', () => {
      if (confirm('Erase all XP, unlocks and challenges?')) {
        app.progress.reset();
        app.game.tips?.reset();
        b.innerHTML = '';
        this.settingsBody(b);
      }
    });
    b.appendChild(rp);
  }
  settings(back) {
    const p = this.panel('wide');
    p.appendChild(h('h2', '', 'Settings'));
    const body = h('div', 'tab-body');
    this.settingsBody(body);
    p.appendChild(body);
    const row = h('div', 'btn-row');
    row.append(this.btn('← Back', '', back));
    p.appendChild(row);
  }

  // ---------------------------------------------------------------- end screens
  results(info) {
    const app = this.app;
    const g = app.game;
    const s = g.director.stats;
    const r = g.director.rating();
    const run = g.challenges.run;
    const p = this.panel('results');
    const stars = '★'.repeat(r.stars) + '<span class="dim">' + '★'.repeat(5 - r.stars) + '</span>';
    const exitName = { taxi: 'Water taxi', speedboat: 'The Baron’s speedboat', rowboat: 'Rowboat' }[info.exit] || info.exit;
    const ledger = g.player.has('ledger');
    p.innerHTML = `
      <div class="rating"><div class="r-label">MISSION COMPLETE</div><div class="r-title">${r.title}</div><div class="stars">${stars}</div><div class="r-desc">${r.desc}</div></div>
      ${ledger ? '<div class="ledger-note">📒 You escaped with the ledger. Your brother walks free next week.</div>' : '<div class="ledger-note dim">The ledger is still in the Baron’s safe… maybe next time.</div>'}
      <div class="stats">
        <div><span>Time</span><b>${formatTime(s.time)}</b></div>
        <div><span>Exit</span><b>${exitName}</b></div>
        <div><span>Spotted</span><b>${s.spotted}</b></div>
        <div><span>Bodies found</span><b>${s.bodiesFound}</b></div>
        <div><span>Witnesses</span><b>${s.witnesses}</b></div>
        <div><span>Knockouts</span><b>${s.kos}</b></div>
        <div><span>Non-target kills</span><b>${s.nonTargetKills}</b></div>
        <div><span>Accidents</span><b>${s.accidents}</b></div>
      </div>
      <div class="methods">${s.methods.map((m) => `<span class="chip">${m}</span>`).join('')}</div>`;
    if (run.completed.length) {
      p.appendChild(h('h3', '', `Challenges this run <span class="dim">+${run.xp} XP</span>`));
      const grid = h('div', 'chs');
      for (const id of run.completed) {
        const c = CHALLENGES.find((x) => x.id === id);
        grid.appendChild(h('div', 'ch done', `<div class="chi">${c.icon}</div><div><div class="chn">${c.name}</div><div class="chd">${c.desc}</div></div><div class="chx">+${c.xp}</div>`));
      }
      p.appendChild(grid);
    }
    const pr = app.progress;
    p.appendChild(h('div', 'mastery-mini', `<div>Mastery <b>${pr.level}</b></div><div class="mbar"><div style="width:${pr.levelProgress() * 100}%"></div></div><div class="xp">${pr.xp} XP</div>`));
    const row = h('div', 'btn-row');
    row.append(this.btn('↻ Play Again', 'big go', () => app.restart(true)), this.btn('Title', '', () => app.quit()));
    p.appendChild(row);
  }

  failed(info) {
    const app = this.app;
    const p = this.panel('failed');
    p.innerHTML = `<div class="rating"><div class="r-label">MISSION FAILED</div><div class="r-title bad">You Got Got</div><div class="r-desc">${info.reason || ''} Old habits, old enemies. Try a quieter approach.</div></div>`;
    const row = h('div', 'btn-row');
    row.append(this.btn('↻ Try Again', 'big go', () => app.restart()), this.btn('Title', '', () => app.quit()));
    p.appendChild(row);
  }
}
