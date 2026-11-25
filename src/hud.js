// HUD: art cut from the HUD render, laid out in the 1672x941 reference frame
// and scaled to the screen. Text, bars, compass and minimap are live.
import layout from '../assets/hud/layout.json';

const REF_W = 1672, REF_H = 941;
const ANCHOR = { topleft: 'L', menu: 'L', quest: 'R', map: 'R', dodge: 'R', attack: 'R', bar: 'C', compass: 'C' };

export function createHUD(root) {
  const els = {};
  const pieces = [];
  function place(el, box, anchor) { pieces.push({ el, box, anchor }); root.appendChild(el); return el; }
  function img(name, cls = '') {
    const d = document.createElement('div');
    d.className = 'p ' + cls;
    d.innerHTML = `<img src="assets/hud/${name}.png" alt="">`;
    return place(d, layout[name], ANCHOR[name]);
  }
  function text(str, x, y, size, anchor, align = 'center', extra = '') {
    const d = document.createElement('div');
    d.className = 'p t ' + extra;
    d.textContent = str;
    d.dataset.size = size;
    d.dataset.align = align;
    return place(d, { x, y, w: 0, h: 0 }, anchor);
  }
  function box(x, y, w, h, anchor, cls = '') {
    const d = document.createElement('div');
    d.className = 'p ' + cls;
    return place(d, { x, y, w, h }, anchor);
  }

  // minimap canvas sits under the ring art
  const mm = layout.minimap;
  els.mapCanvas = document.createElement('canvas');
  const mapBox = box(mm.cx - mm.r, mm.cy - mm.r, mm.r * 2, mm.r * 2, 'R');
  mapBox.style.borderRadius = '50%'; mapBox.style.overflow = 'hidden';
  mapBox.appendChild(els.mapCanvas);
  els.mapCanvas.style.width = '100%'; els.mapCanvas.style.height = '100%';

  els.topleft = img('topleft');
  // bar depletion overlays (parallelograms over the red and blue bars)
  els.hpEmpty = box(196, 66, 262, 24, 'L'); els.hpEmpty.style.cssText += 'background:rgba(25,8,8,.82);clip-path:polygon(4% 0,100% 0,96% 100%,0 100%);transform-origin:right;';
  els.mpEmpty = box(194, 100, 244, 22, 'L'); els.mpEmpty.style.cssText += 'background:rgba(8,10,28,.82);clip-path:polygon(4% 0,100% 0,96% 100%,0 100%);';
  els.hpEmpty.style.display = 'none';
  // XP bar under the mana bar
  els.xpBack = box(200, 129, 232, 9, 'L', 'xpbar');
  els.xpFill = document.createElement('div'); els.xpFill.className = 'fill'; els.xpBack.appendChild(els.xpFill);
  els.xpText = text('XP 0 / 600', 316, 147, 12.5, 'L', 'center', 'xptext');
  els.xpPopAt = box(440, 128, 0, 0, 'L');
  els.hpText = text('240 / 240', 364, 77, 17, 'L');
  els.lv = text('Lv 2', 57, 129, 16, 'L', 'center', 'lvtxt'); els.lv.style.display = 'none';
  els.mpText = text('100 / 100', 362, 111, 17, 'L');

  // compass (drawn), objective diamond and distance
  els.compass = document.createElement('canvas');
  const cb = box(540, 22, 620, 60, 'C'); cb.appendChild(els.compass);
  els.compass.style.width = '100%'; els.compass.style.height = '100%';
  els.compassBox = cb;
  els.diamond = img('compass_diamond');
  els.dist = text('32 m', 851, 95, 19, 'C');

  els.map = img('map');
  els.clock = text('10:24 AM', 1404, 80, 15, 'R');
  els.gear = box(1598, 163, 58, 58, 'R', 'btn');

  els.quest = img('quest');
  els.q = [
    { y: 324, label: 'Talk to Master Ryn' },
    { y: 352, label: 'Learn Combat (0/3)' },
    { y: 381, label: 'Use an Ability (0/1)' },
  ].map((q) => {
    const t = text(q.label, 1433, q.y, 17.5, 'R', 'left', 'qline');
    t.innerHTML = `<span class="qt">${q.label}</span>`;
    const c = text('✓', 1407, q.y - 4, 22, 'R', 'left', 'check');
    return { t, c };
  });

  els.menu = img('menu');
  els.menuBtns = [0, 1, 2, 3].map((i) => box(26 + i * 70.5, 846, 60, 62, 'L', 'btn'));

  els.bar = img('bar');
  els.slots = layout.slots.map((s, i) => {
    const b = box(s.x, s.y, s.w, s.h, 'C', 'btn');
    const cd = document.createElement('div'); cd.className = 'cd'; b.appendChild(cd);
    const n = document.createElement('div'); n.className = 'cdn t'; n.style.position = 'absolute'; b.appendChild(n);
    return { b, cd, n };
  });
  els.potion = text('3', 950, 888, 21, 'C');
  // slot 6 sits over the first padlock; its icon appears when the drill unlocks it
  {
    const b = box(974, 826, 76, 76, 'C', 'btn slot6');
    const ic = document.createElement('canvas'); ic.width = ic.height = 128; ic.className = 'icon';
    const g = ic.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 6, 64, 64, 64); gr.addColorStop(0, '#fff6d0'); gr.addColorStop(0.35, '#e0a030'); gr.addColorStop(1, '#2a1404');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#fff2c0'; g.lineCap = 'round';
    for (let k = 0; k < 3; k++) { g.lineWidth = 9 - k * 2; g.globalAlpha = 1 - k * 0.25; g.beginPath(); g.arc(64, 64, 22 + k * 14, k * 2.1, k * 2.1 + 3.6); g.stroke(); }
    g.globalAlpha = 1; g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.fillText('6', 8, 28);
    b.appendChild(ic);
    const cd = document.createElement('div'); cd.className = 'cd'; b.appendChild(cd);
    const n = document.createElement('div'); n.className = 'cdn t'; n.style.position = 'absolute'; b.appendChild(n);
    els.slots.push({ b, cd, n });
  }

  els.dodge = img('dodge', 'btn');
  els.attack = img('attack', 'btn');

  // world-anchored NPC marker and talk button
  els.npc = document.createElement('div');
  els.npc.className = 'p';
  els.npc.innerHTML = '<img src="assets/hud/npc_marker.png" alt="">';
  root.appendChild(els.npc);
  els.npcName = document.createElement('div');
  els.npcName.className = 't'; els.npcName.textContent = 'Master Ryn'; els.npcName.style.display = 'none';
  root.appendChild(els.npcName);
  els.talk = document.createElement('div');
  els.talk.className = 'talk btn'; els.talk.textContent = 'Talk';
  root.appendChild(els.talk);

  let S = 1;
  function layoutAll() {
    const W = window.innerWidth, H = window.innerHeight;
    let s = Math.min(H / REF_H, W / REF_W * 1.25);
    if (H < 520) s *= 1.22; // phones: a little larger so it can be read and tapped
    S = s;
    const cs = getComputedStyle(document.documentElement);
    const sl = parseFloat(cs.getPropertyValue('--sal')) || 0, sr = parseFloat(cs.getPropertyValue('--sar')) || 0;
    const sb = parseFloat(cs.getPropertyValue('--sab')) || 0;
    const yOff = (y) => y * s + (y > REF_H / 2 ? -sb * 0.5 : 0);
    for (const { el, box: b, anchor } of pieces) {
      let x;
      if (anchor === 'L') x = b.x * s + sl;
      else if (anchor === 'R') x = W - (REF_W - b.x) * s - sr;
      else x = W / 2 + (b.x - REF_W / 2) * s;
      const y = b.y > REF_H / 2 ? H - (REF_H - b.y) * s - sb * 0.5 : yOff(b.y);
      if (el.classList.contains('t')) {
        const fs = parseFloat(el.dataset.size) * s;
        el.style.fontSize = fs + 'px';
        el.style.left = x + 'px';
        el.style.top = y - fs * 0.5 + 'px';
        el.style.transform = el.dataset.align === 'center' ? 'translateX(-50%)' : '';
      } else {
        el.style.left = x + 'px'; el.style.top = y + 'px';
        el.style.width = b.w * s + 'px'; el.style.height = b.h * s + 'px';
      }
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    els.mapCanvas.width = els.mapCanvas.height = Math.round(mm.r * 2 * s * dpr);
    els.compass.width = Math.round(620 * s * dpr); els.compass.height = Math.round(60 * s * dpr);
    const dlg = document.getElementById('dialog');
    dlg.style.bottom = (REF_H - 790) * s + 'px';
    dlg.style.fontSize = Math.max(13, 20 * s) + 'px';
    const toast = document.getElementById('toast');
    toast.style.top = 150 * s + 'px';
    toast.style.fontSize = Math.max(14, 26 * s) + 'px';
    els.npc.style.width = layout.npc_marker.w * s + 'px';
    els.npc.style.height = layout.npc_marker.h * s + 'px';
    els.npcName.style.fontSize = 17 * s + 'px';
    els.talk.style.fontSize = Math.max(13, 18 * s) + 'px';
    for (const sl2 of els.slots) sl2.n.style.fontSize = 26 * s + 'px';
  }
  // safe-area insets as CSS vars we can read
  const st = document.createElement('style');
  st.textContent = ':root{--sal:env(safe-area-inset-left);--sar:env(safe-area-inset-right);--sab:env(safe-area-inset-bottom);}';
  document.head.appendChild(st);
  window.addEventListener('resize', () => setTimeout(layoutAll, 50));
  layoutAll();

  // ---- live updates
  function setBars(hp, hpMax, mp, mpMax) {
    els.hpText.textContent = `${Math.round(hp)} / ${hpMax}`;
    els.mpText.textContent = `${Math.round(mp)} / ${mpMax}`;
    const f = 1 - mp / mpMax;
    els.mpEmpty.style.clipPath = `polygon(${100 - f * 100}% 0,100% 0,96% 100%,${Math.max(0, 96 - f * 100)}% 100%)`;
    els.mpEmpty.style.display = f > 0.005 ? 'block' : 'none';
    const fh = 1 - hp / hpMax;
    els.hpEmpty.style.clipPath = `polygon(${100 - fh * 100}% 0,100% 0,96% 100%,${Math.max(0, 96 - fh * 100)}% 100%)`;
    els.hpEmpty.style.display = fh > 0.005 ? 'block' : 'none';
  }
  function setQuest(i, label, done) {
    els.q[i].t.style.visibility = label === null ? 'hidden' : 'visible';
    if (label === null) { els.q[i].c.style.display = 'none'; return; }
    els.q[i].t.querySelector('.qt').textContent = label;
    els.q[i].t.classList.toggle('done', done);
    els.q[i].c.style.display = done ? 'block' : 'none';
  }
  function setCooldown(i, frac, secs, disabled) {
    const s = els.slots[i];
    s.cd.style.background = frac > 0 ? `conic-gradient(rgba(0,0,0,0) ${(1 - frac) * 360}deg, rgba(0,0,0,.68) 0)` : 'none';
    s.n.textContent = frac > 0 && secs > 0.05 ? (secs >= 1 ? Math.ceil(secs) : secs.toFixed(1)) : '';
    s.b.classList.toggle('dim', !!disabled);
  }
  function setClock(minutes) {
    let h = Math.floor(minutes / 60) % 24, m = Math.floor(minutes % 60);
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    els.clock.textContent = `${h}:${String(m).padStart(2, '0')} ${ap}`;
  }

  // compass: heading in degrees (0 = N, 90 = E), objective bearing, distance
  const diamondBox = layout.compass_diamond;
  function drawCompass(heading, objBearing, dist) {
    const c = els.compass, g = c.getContext('2d');
    const w = c.width, h = c.height, k = w / 620;
    g.clearRect(0, 0, w, h);
    const cx = (851 - 540) * k, ly = (51 - 22) * k;
    const pxPerDeg = 463 / 90 * k;
    // line with fading ends
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(201,162,74,0)'); grad.addColorStop(0.1, 'rgba(225,190,100,.95)');
    grad.addColorStop(0.9, 'rgba(225,190,100,.95)'); grad.addColorStop(1, 'rgba(201,162,74,0)');
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, ly + 1.5 * k, w, 2.5 * k);
    g.fillStyle = grad; g.fillRect(0, ly - 1.2 * k, w, 2.4 * k);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 ${24 * k}px 'Fira Sans', sans-serif`;
    const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    for (let d = 0; d < 360; d += 15) {
      let rel = ((d - heading + 540) % 360) - 180;
      const x = cx + rel * pxPerDeg;
      if (x < -10 || x > w + 10) continue;
      const fade = Math.min(1, Math.min(x, w - x) / (60 * k));
      g.globalAlpha = Math.max(0, fade);
      if (names[d] !== undefined) {
        g.lineWidth = 4 * k; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(names[d], x, ly - 4 * k);
        g.fillStyle = '#fff'; g.fillText(names[d], x, ly - 4 * k);
      } else {
        g.fillStyle = '#e8c870';
        g.beginPath(); g.moveTo(x, ly - 7 * k); g.lineTo(x + 2.5 * k, ly); g.lineTo(x, ly + 7 * k); g.lineTo(x - 2.5 * k, ly); g.closePath(); g.fill();
      }
    }
    g.globalAlpha = 1;
    // move the diamond and the distance label to the objective
    let rel = ((objBearing - heading + 540) % 360) - 180;
    rel = Math.max(-55, Math.min(55, rel));
    const off = rel * 463 / 90;
    const p = pieces.find((q) => q.el === els.diamond);
    p.box = { ...diamondBox, x: diamondBox.x + off };
    const pd = pieces.find((q) => q.el === els.dist);
    pd.box = { ...pd.box, x: 851 + off };
    els.dist.textContent = `${Math.round(dist)} m`;
    const W = window.innerWidth;
    els.diamond.style.left = W / 2 + (p.box.x - REF_W / 2) * S + 'px';
    els.dist.style.left = W / 2 + (pd.box.x - REF_W / 2) * S + 'px';
  }

  function setXP(xp, max, level) {
    els.xpFill.style.width = (100 * xp / max) + '%';
    els.xpText.textContent = `XP ${xp} / ${max}`;
  }
  function xpPop(str) {
    const d = document.createElement('div');
    d.className = 't xppop'; d.textContent = str;
    d.style.fontSize = Math.max(13, 20 * S) + 'px';
    d.style.left = els.xpPopAt.style.left; d.style.top = els.xpPopAt.style.top;
    root.appendChild(d);
    els.xpBack.classList.remove('glow'); void els.xpBack.offsetWidth; els.xpBack.classList.add('glow');
    setTimeout(() => d.remove(), 1600);
  }

  function setLevel(n) { els.lv.textContent = `Lv ${n}`; els.lv.style.display = 'block'; els.lv.classList.add('up'); }
  function unlockSlot(i) { els.slots[i].b.classList.add('unlocked'); }

  return { els, layoutAll, setBars, setXP, xpPop, unlockSlot, setLevel, setQuest, setCooldown, setClock, drawCompass, get scale() { return S; }, layout };
}
