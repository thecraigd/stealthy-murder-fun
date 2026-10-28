// HUD: status, prompts, inventory, minimap, speech bubbles, suspicion meters,
// toasts, objectives, touch controls.
import * as THREE from 'three';
import { ITEMS } from './items.js';
import { OUTFITS, ZONE_NAMES, canAccess } from './outfits.js';
import { clamp, formatTime } from '../core/util.js';

const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export class UI {
  constructor(game) {
    this.game = game;
    const root = document.getElementById('ui');
    this.root = root;
    this.hud = h('div', 'hud hidden');
    root.appendChild(this.hud);

    // top-left
    this.btnPause = h('button', 'btn-pause', '<span>II</span>');
    this.btnPause.setAttribute('aria-label', 'Pause');
    this.hud.appendChild(this.btnPause);
    this.objectives = h('div', 'objectives');
    this.hud.appendChild(this.objectives);

    // top-center status
    this.statusBox = h('div', 'status');
    this.statusPill = h('div', 'status-pill good', 'Undetected');
    this.disguise = h('div', 'disguise', '');
    this.statusBox.append(this.statusPill, this.disguise);
    this.hud.appendChild(this.statusBox);
    this.hpBar = h('div', 'hp', '<div class="hp-fill"></div>');
    this.statusBox.appendChild(this.hpBar);
    this.zoneToast = h('div', 'zone-toast', '');
    this.hud.appendChild(this.zoneToast);

    // minimap
    this.mapWrap = h('div', 'minimap');
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = 220;
    this.mapCanvas.height = 220;
    this.mapWrap.appendChild(this.mapCanvas);
    this.hud.appendChild(this.mapWrap);
    this.mapWrap.addEventListener('click', () => this.mapWrap.classList.toggle('big'));
    this.mapWrap.addEventListener('touchstart', (e) => { e.stopPropagation(); e.preventDefault(); this.mapWrap.classList.toggle('big'); }, { passive: false });

    // toasts + hint
    this.toasts = h('div', 'toasts');
    this.hud.appendChild(this.toasts);
    this.tipBox = h('div', 'tipbox');
    this.hud.appendChild(this.tipBox);
    this.hint = h('div', 'hint hidden');
    this.hud.appendChild(this.hint);
    this.subtitles = h('div', 'subtitles');
    this.hud.appendChild(this.subtitles);
    this.big = h('div', 'bigtext');
    this.hud.appendChild(this.big);
    this.vignette = h('div', 'vignette');
    root.appendChild(this.vignette);
    this.dmg = h('div', 'dmgflash');
    root.appendChild(this.dmg);
    this.senseOverlay = h('div', 'sense-overlay');
    root.appendChild(this.senseOverlay);

    // world overlays (speech, meters, markers)
    this.worldLayer = h('div', 'world-layer');
    this.hud.appendChild(this.worldLayer);
    this.overlays = new Map();
    this.edgeLayer = h('div', 'edge-layer');
    this.hud.appendChild(this.edgeLayer);
    this.waypoint = h('div', 'waypoint hidden', '<div class="wp-icon">▼</div><div class="wp-dist"></div>');
    this.worldLayer.appendChild(this.waypoint);

    // prompts (desktop) + inventory
    this.prompts = h('div', 'prompts');
    this.hud.appendChild(this.prompts);
    this.inv = h('div', 'inventory');
    this.hud.appendChild(this.inv);
    this.itemDesc = h('div', 'item-desc');
    this.hud.appendChild(this.itemDesc);

    // touch controls
    this.touch = h('div', 'touch');
    this.joyZone = h('div', 'joy-zone');
    this.joyBase = h('div', 'joy-base hidden', '<div class="joy-knob"></div><div class="joy-run">RUN</div>');
    this.joyKnob = this.joyBase.firstChild;
    this.touch.append(this.joyZone, this.joyBase);
    this.btns = h('div', 'btns');
    this.btnPrimary = h('button', 'tbtn primary', '<span class="ic">✋</span><span class="lbl"></span>');
    this.btnSecondary = h('button', 'tbtn secondary', '<span class="ic">☠</span><span class="lbl"></span>');
    this.btnUse = h('button', 'tbtn use', '<span class="ic">✊</span><span class="lbl">Use</span>');
    this.btnSneak = h('button', 'tbtn sneak', '<span class="ic">🥷</span><span class="lbl">Sneak</span>');
    this.btnSense = h('button', 'tbtn sense', '<span class="ic">👁</span><span class="lbl">Sense</span>');
    this.btns.append(this.btnSense, this.btnSneak, this.btnUse, this.btnSecondary, this.btnPrimary);
    this.touch.appendChild(this.btns);
    this.hud.appendChild(this.touch);

    this.speechEls = new Map();
    this.lastZoneId = null;
    this._invKey = '';
    this.mapImg = null;
    this.subQueue = [];
    this._v = new THREE.Vector3();
    this.btnPause.addEventListener('click', () => game.pause());
    this.btnPause.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); game.pause(); }, { passive: false });
  }

  show() {
    this.hud.classList.remove('hidden');
  }
  hide() {
    this.hud.classList.add('hidden');
  }

  // ---------------------------------------------------------------- joystick
  showJoystick(x, y) {
    this.joyBase.classList.remove('hidden');
    this.joyBase.style.transform = `translate(${x}px, ${y}px)`;
    this.joyKnob.style.transform = 'translate(-50%,-50%)';
  }
  moveJoystick(x, y, dx, dy, over) {
    this.joyBase.style.transform = `translate(${x}px, ${y}px)`;
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.joyBase.classList.toggle('running', !!over);
  }
  hideJoystick() {
    this.joyBase.classList.add('hidden');
  }

  // ---------------------------------------------------------------- speech
  speak(npc, text, dur, opts = {}) {
    const g = this.game;
    const d = npc.distTo(g.player.pos);
    if (d > (opts.range || 13)) return;
    let el = this.speechEls.get(npc);
    if (!el) {
      el = h('div', 'bubble');
      this.worldLayer.appendChild(el);
      this.speechEls.set(npc, el);
    }
    el.textContent = text;
    el.classList.toggle('important', !!opts.important);
    el.classList.remove('fade');
    el._t = dur;
    el._npc = npc;
    if (opts.subtitle || opts.important) this.subtitle(npc.name, text, dur);
  }
  clearSpeech(npc) {
    const el = this.speechEls.get(npc);
    if (el) {
      el.remove();
      this.speechEls.delete(npc);
    }
  }
  subtitle(who, text, dur = 3) {
    const el = h('div', 'sub', `<b>${who}:</b> ${text}`);
    this.subtitles.appendChild(el);
    while (this.subtitles.children.length > 3) this.subtitles.firstChild.remove();
    setTimeout(() => {
      el.classList.add('fade');
      setTimeout(() => el.remove(), 400);
    }, dur * 1000);
  }

  // ---------------------------------------------------------------- toasts
  toast(text, kind = 'info', icon = '') {
    const el = h('div', 'toast ' + kind, (icon ? `<span class="ti">${icon}</span>` : '') + `<span>${text}</span>`);
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => {
      el.classList.add('fade');
      setTimeout(() => el.remove(), 500);
    }, 3600);
  }
  tip(icon, text) {
    const el = h('div', 'tip', `<span class="tip-ic">${icon}</span><span>${text}</span>`);
    this.tipBox.innerHTML = '';
    this.tipBox.appendChild(el);
    clearTimeout(this._tipT);
    this._tipT = setTimeout(() => {
      el.classList.add('fade');
      setTimeout(() => el.remove(), 500);
    }, 6500);
  }
  bigText(title, sub = '', kind = '') {
    this.big.innerHTML = `<div class="bt-title ${kind}">${title}</div>${sub ? `<div class="bt-sub">${sub}</div>` : ''}`;
    this.big.classList.remove('show');
    void this.big.offsetWidth;
    this.big.classList.add('show');
    clearTimeout(this._bigT);
    this._bigT = setTimeout(() => this.big.classList.remove('show'), 3200);
  }
  flashDamage() {
    this.dmg.classList.remove('on');
    void this.dmg.offsetWidth;
    this.dmg.classList.add('on');
  }
  setHint(text) {
    if (!text) {
      this.hint.classList.add('hidden');
      return;
    }
    this.hint.classList.remove('hidden');
    if (this.hint._t !== text) {
      this.hint._t = text;
      this.hint.innerHTML = text;
    }
  }

  // ---------------------------------------------------------------- prompts
  setPrompts(primary, secondary, useLabel) {
    const key = (primary?.label || '') + '|' + (secondary?.label || '') + '|' + (useLabel || '');
    if (key === this._pk) return;
    this._pk = key;
    const touch = document.body.classList.contains('touch-mode');
    let html = '';
    if (primary) html += `<div class="prompt ${primary.danger ? 'danger' : ''}"><kbd>E</kbd>${primary.label}</div>`;
    if (secondary) html += `<div class="prompt ${secondary.danger ? 'danger' : ''}"><kbd>F</kbd>${secondary.label}</div>`;
    this.prompts.innerHTML = touch ? '' : html;
    const setBtn = (btn, a, defIcon) => {
      btn.classList.toggle('off', !a);
      btn.classList.toggle('danger', !!a?.danger);
      btn.querySelector('.lbl').textContent = a ? a.label : '';
      btn.querySelector('.ic').textContent = a?.icon || defIcon;
    };
    setBtn(this.btnPrimary, primary, '✋');
    setBtn(this.btnSecondary, secondary, '☠');
    this.btnUse.querySelector('.lbl').textContent = useLabel || 'Use';
  }

  // ---------------------------------------------------------------- inventory
  renderInventory() {
    const p = this.game.player;
    const key = p.inv.map((s) => s.id + ':' + s.count + ':' + (s.ammo ?? '')).join(',') + '|' + p.sel;
    if (key === this._invKey) return;
    this._invKey = key;
    this.inv.innerHTML = '';
    const mk = (i, icon, count, title, sel, illegal) => {
      const b = h('button', 'slot' + (sel ? ' sel' : '') + (illegal ? ' illegal' : ''), `<span class="si">${icon}</span>${count > 1 ? `<span class="sc">${count}</span>` : ''}<span class="sk">${i < 0 ? '0' : i + 1}</span>`);
      b.title = title;
      const act = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (i < 0) {
          p.sel = -1;
          this.game.emit('inventory');
        } else p.selectIndex(i);
      };
      b.addEventListener('touchstart', act, { passive: false });
      b.addEventListener('mousedown', act);
      this.inv.appendChild(b);
    };
    mk(-1, '✋', 0, 'Empty hands', p.sel === -1, false);
    p.inv.forEach((s, i) => {
      const d = ITEMS[s.id];
      mk(i, d.icon, d.type === 'gun' ? s.ammo : s.count, d.name, p.sel === i, d.illegal);
    });
    const sel = p.selected;
    if (sel) {
      const d = ITEMS[sel.id];
      this.itemDesc.innerHTML = `<b>${d.icon} ${d.name}</b>${d.illegal ? ' <span class="tag-illegal">ILLEGAL</span>' : ''}<br>${d.desc}`;
      this.itemDesc.classList.add('show');
      clearTimeout(this._descT);
      this._descT = setTimeout(() => this.itemDesc.classList.remove('show'), 3500);
    } else this.itemDesc.classList.remove('show');
    const useIcon = sel ? ITEMS[sel.id].icon : '✊';
    this.btnUse.querySelector('.ic').textContent = useIcon;
    this.btnUse.classList.toggle('off', !sel);
  }

  // ---------------------------------------------------------------- objectives
  renderObjectives() {
    const g = this.game;
    const st = g.story;
    if (!st) return;
    const list = st.objectiveList();
    const key = JSON.stringify(list);
    if (key === this._objKey) return;
    this._objKey = key;
    this.objectives.innerHTML = list
      .map((o) => `<div class="obj ${o.done ? 'done' : ''} ${o.optional ? 'opt' : ''} ${o.fail ? 'fail' : ''}"><span class="ob">${o.done ? '✔' : o.fail ? '✖' : o.optional ? '◇' : '◆'}</span>${o.text}</div>`)
      .join('');
  }

  // ---------------------------------------------------------------- minimap
  buildMapImage() {
    const g = this.game;
    const w = g.world;
    const S = 3; // px per metre
    const W = Math.ceil((w.maxX - w.minX) * S), H = Math.ceil((w.maxZ - w.minZ) * S);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    const img = x.createImageData(W, H);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const wx = w.minX + i / S, wz = w.minZ + j / S;
        const sd = w.landSDF(wx, wz);
        const k = (j * W + i) * 4;
        if (sd < 0) {
          img.data[k] = 120; img.data[k + 1] = 196; img.data[k + 2] = 92;
        } else if (sd < 1.2) {
          img.data[k] = 210; img.data[k + 1] = 240; img.data[k + 2] = 245;
        } else {
          img.data[k] = 50; img.data[k + 1] = 140; img.data[k + 2] = 200;
        }
        img.data[k + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    // zones (buildings)
    for (const z of w.zones) {
      if (z.id === 'island' || z.outdoor) continue;
      x.fillStyle = z.access === 'public' ? '#efe2c4' : '#e6c6a6';
      x.fillRect((z.minX - w.minX) * S, (z.minZ - w.minZ) * S, (z.maxX - z.minX) * S, (z.maxZ - z.minZ) * S);
    }
    for (const c2 of w.colliders) {
      if (c2.type !== 'box' || c2.sight !== 'tall' && c2.tag !== 'window' && c2.tag !== 'glasswall') continue;
      x.fillStyle = c2.tag === 'hedge' ? '#3f8a2e' : c2.tag === 'window' || c2.tag === 'glasswall' ? '#9fd8f0' : '#3a3040';
      x.fillRect((c2.minX - w.minX) * S, (c2.minZ - w.minZ) * S, Math.max(1, (c2.maxX - c2.minX) * S), Math.max(1, (c2.maxZ - c2.minZ) * S));
    }
    this.mapImg = c;
    this.mapScale = S;
  }

  drawMinimap() {
    const g = this.game;
    if (!this.mapImg) this.buildMapImage();
    const cv = this.mapCanvas;
    const big = this.mapWrap.classList.contains('big');
    const size = big ? 360 : 180;
    if (cv.width !== size * 2) {
      cv.width = cv.height = size * 2;
    }
    const ctx = cv.getContext('2d');
    const w = g.world;
    const S = this.mapScale;
    const p = g.player.pos;
    const range = big ? 45 : 24; // metres from centre to edge
    const k = (cv.width / 2) / range; // px per metre on canvas
    ctx.save();
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.beginPath();
    ctx.arc(cv.width / 2, cv.height / 2, cv.width / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#2f8cc8';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.translate(cv.width / 2, cv.height / 2);
    ctx.rotate(g.cam.yaw);
    ctx.scale(k / S, k / S);
    ctx.translate(-(p.x - w.minX) * S, -(p.z - w.minZ) * S);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mapImg, 0, 0);
    // npcs
    const dot = (x0, z0, col, r, ring) => {
      ctx.beginPath();
      ctx.arc((x0 - w.minX) * S, (z0 - w.minZ) * S, r * S / k * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      if (ring) {
        ctx.lineWidth = (S / k) * 2;
        ctx.strokeStyle = ring;
        ctx.stroke();
      }
    };
    const sense = g.sensing;
    for (const n of g.npcs) {
      if (n.gone || n.hiddenIn) continue;
      const d = n.distTo(p);
      if (d > range * 1.5) continue;
      if (n.inert) {
        if (n.isTarget && n.state === 'dead') continue;
        dot(n.pos.x, n.pos.z, n.found ? '#888' : '#fff', 1.6, '#e33');
        continue;
      }
      const col = n.isTarget ? '#ff2a2a' : n.isGuard ? '#3a6aff' : n.role === 'staff' ? '#ffd23a' : '#f4f4f4';
      const ring = n.state === 'combat' ? '#ff0000' : n.suspicion > 0.3 ? '#ffb000' : '#222';
      if (d < 26 || n.isTarget || sense) dot(n.pos.x, n.pos.z, col, n.isTarget ? 2.6 : 1.8, ring);
    }
    // waypoint
    const wp = g.story?.waypoint();
    if (wp) {
      ctx.save();
      ctx.translate((wp.x - w.minX) * S, (wp.z - w.minZ) * S);
      ctx.rotate(-g.cam.yaw);
      ctx.fillStyle = '#ffe14a';
      ctx.strokeStyle = '#222';
      ctx.lineWidth = S / k * 2;
      ctx.beginPath();
      const r = (S / k) * 9;
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.7, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    // player arrow (centre, rotated by player yaw relative to camera)
    ctx.save();
    ctx.translate(cv.width / 2, cv.height / 2);
    ctx.rotate(g.cam.yaw - g.player.yaw + Math.PI);
    ctx.fillStyle = '#2fe0c8';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(10, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // north marker
    ctx.save();
    ctx.translate(cv.width / 2, cv.height / 2);
    ctx.rotate(g.cam.yaw);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -cv.height / 2 + 26);
    ctx.restore();
  }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    const g = this.game;
    const p = g.player;
    const cam = g.cam.camera;
    const W = window.innerWidth, H = window.innerHeight;
    const v = this._v;

    // status
    const st = g.director.status();
    if (this.statusPill._t !== st.text) {
      this.statusPill._t = st.text;
      this.statusPill.textContent = st.text;
      this.statusPill.className = 'status-pill ' + st.cls;
    }
    const o = OUTFITS[p.outfit];
    const dKey = p.outfit + (p.isCompromised ? '!' : '');
    if (this.disguise._k !== dKey) {
      this.disguise._k = dKey;
      this.disguise.innerHTML = `<span class="dg-ic">👔</span> ${o.name}${p.isCompromised ? ' <span class="dg-bad">COMPROMISED</span>' : ''}`;
    }
    const hpk = p.hp / p.maxHp;
    this.hpBar.style.opacity = hpk < 0.999 ? '1' : '0';
    this.hpBar.firstChild.style.width = `${hpk * 100}%`;
    this.vignette.className = 'vignette ' + (g.director.level === 'combat' ? 'combat' : g.director.level === 'search' ? 'search' : p.flags.trespass ? 'trespass' : '');
    this.senseOverlay.classList.toggle('on', g.sensing);

    // zone toast
    const zone = p.zone();
    if (zone && zone.id !== this.lastZoneId) {
      this.lastZoneId = zone.id;
      if (zone.id !== 'island') {
        const ok = canAccess(p.outfit, zone.access);
        this.zoneToast.innerHTML = `<div class="zt-name">${zone.name}</div><div class="zt-acc ${ok ? 'ok' : 'bad'}">${zone.access === 'public' ? 'Public area' : (ok ? '✔ ' : '⛔ ') + (ZONE_NAMES[zone.access] || zone.access)}</div>`;
        this.zoneToast.classList.remove('show');
        void this.zoneToast.offsetWidth;
        this.zoneToast.classList.add('show');
      }
    }

    // speech bubbles (only the few nearest stay visible, keeps crowds readable)
    const bubbleRank = [...this.speechEls.keys()].filter((n) => !n.inert).sort((a, b) => a.distTo(p.pos) - b.distTo(p.pos));
    const keep = new Set(bubbleRank.slice(0, 4));
    for (const [npc, el] of this.speechEls) {
      if (!keep.has(npc) && !el.classList.contains('important')) {
        el.style.display = 'none';
        el._t -= dt;
        if (el._t <= 0) {
          el.remove();
          this.speechEls.delete(npc);
        }
        continue;
      }
      el._t -= dt;
      if (el._t <= 0 || npc.inert) {
        el.remove();
        this.speechEls.delete(npc);
        continue;
      }
      v.set(npc.pos.x, npc.y + npc.char.headWorldY + 0.35, npc.pos.z).project(cam);
      const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      if (v.z > 1 || sx < -40 || sx > W + 40 || sy < 20 || sy > H + 40) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = '';
      el.style.transform = `translate(-50%,-100%) translate(${clamp(sx, 90, W - 90)}px,${clamp(sy, 50, H)}px)`;
    }

    // suspicion meters / target markers
    const used = new Set();
    const edge = [];
    for (const n of g.npcs) {
      if (n.gone) continue;
      const showTarget = n.isTarget && !n.inert;
      const showMeter = !n.inert && (n.suspicion > 0.03 || n.state === 'combat' || n.state === 'warn');
      const showBody = n.inert && n.isTarget && n.state !== 'dead';
      if (!showTarget && !showMeter && !showBody && !(g.sensing && !n.inert)) continue;
      v.set(n.pos.x, n.y + n.char.headWorldY + (n.speech ? 0.85 : 0.25), n.pos.z).project(cam);
      const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      const onScreen = v.z < 1 && sx > -20 && sx < W + 20 && sy > -20 && sy < H + 20;
      if (!onScreen) {
        if (showMeter && n.distTo(p.pos) < 20) edge.push({ n, sx, sy, behind: v.z > 1 });
        continue;
      }
      let el = this.overlays.get(n);
      if (!el) {
        el = h('div', 'npc-ov', '<div class="tm">▼</div><div class="meter"><svg viewBox="0 0 36 36"><circle class="bg" cx="18" cy="18" r="15"/><circle class="fg" cx="18" cy="18" r="15"/></svg><span class="mk">?</span></div><div class="nm"></div>');
        this.worldLayer.appendChild(el);
        this.overlays.set(n, el);
        el._fg = el.querySelector('.fg');
        el._mk = el.querySelector('.mk');
        el._meter = el.querySelector('.meter');
        el._tm = el.querySelector('.tm');
        el._nm = el.querySelector('.nm');
      }
      used.add(n);
      el.style.display = '';
      el.style.transform = `translate(-50%,-100%) translate(${sx}px,${sy}px)`;
      el._tm.style.display = showTarget || showBody ? '' : 'none';
      const hostile = n.state === 'combat';
      const showM = showMeter;
      el._meter.style.display = showM ? '' : 'none';
      if (showM) {
        const fill = hostile ? 1 : n.suspicion;
        el._fg.style.strokeDashoffset = String(94.2 * (1 - fill));
        const danger = hostile || n.susKind === 'illegal' || n.susKind === 'compromised';
        const cls = hostile ? 'hostile' : danger ? 'danger' : n.state === 'warn' ? 'warn' : '';
        if (el._cls !== cls) {
          el._cls = cls;
          el._meter.className = 'meter ' + cls;
        }
        el._mk.textContent = hostile || fill >= 0.99 ? '!' : '?';
      }
      const special = n.isTarget || n.isGuard || n.def.enforcer;
      const nm = g.sensing && special && (n.isTarget || n.distTo(p.pos) < 14) ? (n.isTarget ? n.name : n.def.enforcer ? `${n.def.title} \u2605` : n.def.title || '') : n.isTarget && n.distTo(p.pos) < 8 ? n.name : '';
      if (el._nmT !== nm) {
        el._nmT = nm;
        el._nm.textContent = nm;
      }
    }
    for (const [n, el] of this.overlays) {
      if (!used.has(n)) el.style.display = 'none';
    }
    // edge indicators
    let ek = '';
    for (const e of edge) ek += e.n.id + ',';
    if (ek !== this._ek) {
      this._ek = ek;
      this.edgeLayer.innerHTML = edge.map(() => '<div class="edge"><span>!</span></div>').join('');
    }
    edge.forEach((e, i) => {
      const el = this.edgeLayer.children[i];
      if (!el) return;
      let dx = e.sx - W / 2, dy = e.sy - H / 2;
      if (e.behind) {
        dx = -dx;
        dy = -dy;
      }
      const a = Math.atan2(dy, dx);
      const r = Math.min(W, H) * 0.42;
      const x = W / 2 + Math.cos(a) * Math.min(r * 1.5, W / 2 - 40);
      const y = H / 2 + Math.sin(a) * Math.min(r, H / 2 - 50);
      el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) rotate(${a}rad)`;
      el.style.opacity = String(0.35 + e.n.suspicion * 0.65);
      el.classList.toggle('hostile', e.n.state === 'combat');
    });

    // Sense: highlight interesting things (devices, pickups, hiding spots).
    this.senseMarks = this.senseMarks || [];
    let mi = 0;
    if (g.sensing) {
      const mark = (x, y, z, icon) => {
        if (Math.hypot(x - p.pos.x, z - p.pos.z) > 20) return;
        v.set(x, y, z).project(cam);
        if (v.z > 1) return;
        const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
        if (sx < 0 || sx > W || sy < 0 || sy > H) return;
        let el = this.senseMarks[mi];
        if (!el) {
          el = h('div', 'sense-mark');
          this.worldLayer.appendChild(el);
          this.senseMarks.push(el);
        }
        mi++;
        if (el._i !== icon) {
          el._i = icon;
          el.textContent = icon;
        }
        el.style.display = '';
        el.style.transform = `translate(-50%,-50%) translate(${sx}px,${sy}px)`;
      };
      for (const it of g.interactions.list) {
        if (it.npc || it.bodyDump || typeof it.x !== 'number') continue;
        if (it.when && !it.when(p)) continue;
        const lbl = typeof it.label === 'function' ? it.label(p) : it.label;
        if (!lbl) continue;
        mark(it.x, 1.3, it.z, it.icon || '\u270B');
      }
      for (const pk of g.interactions.pickups) mark(pk.x, pk.y + 0.5, pk.z, pk.outfit ? '\uD83D\uDC54' : ITEMS[pk.id]?.icon || '?');
      for (const hs of g.level.hideSpots) if (!hs.occupied) mark(hs.x, 1.2, hs.z, '\uD83D\uDEAA');
      for (const c of g.containers) if (c.bodies.length < c.cap) mark(c.x, 1.0, c.z, '\uD83D\uDCE6');
    }
    for (let i = mi; i < this.senseMarks.length; i++) this.senseMarks[i].style.display = 'none';

    // waypoint marker
    const wp = g.story?.waypoint();
    if (wp && g.settings.guidance) {
      v.set(wp.x, (wp.y ?? 0) + 2.2, wp.z).project(cam);
      let sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      if (v.z > 1) {
        sx = W - sx;
        sy = H - 60;
      }
      sx = clamp(sx, 30, W - 30);
      sy = clamp(sy, 70, H - 120);
      this.waypoint.classList.remove('hidden');
      this.waypoint.style.transform = `translate(-50%,-100%) translate(${sx}px,${sy}px)`;
      const d = Math.round(Math.hypot(wp.x - p.pos.x, wp.z - p.pos.z));
      const dl = this.waypoint.lastChild;
      if (dl._d !== d) {
        dl._d = d;
        dl.textContent = d + 'm';
      }
    } else this.waypoint.classList.add('hidden');

    // minimap @ ~15fps
    this._mapT = (this._mapT || 0) - dt;
    if (this._mapT <= 0) {
      this._mapT = 1 / 15;
      this.drawMinimap();
    }
    this.renderInventory();
    this.renderObjectives();
  }
}
