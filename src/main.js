import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, pathCurve, TEX } from './world.js';
import * as L from './layout.js';
import { makeHero, makeRyn, loadHeroModel, loadRynModel } from './characters.js';
import { createHUD } from './hud.js';
import { createFX } from './effects.js';
import { clamp, lerp } from './util.js';
import { QUESTS, createQuests } from './quests.js';
import { sfx, unlockAudio, setMuted, isMuted, setFallsDistance } from './audio.js';

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot');              // fixed camera matching the reference screenshot
const isTouch = matchMedia('(pointer: coarse)').matches;
let quality = params.get('q') || (isTouch ? 'low' : 'high');

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.75 : 2);
if (SHOT) pixelRatio = 1;
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9cc8ea, 90, 260);
const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 900);

// lights: warm sun from the left and behind, cool sky fill
const hemi = new THREE.HemisphereLight(0xd8ecff, 0x9aa060, 1.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.position.set(-26, 38, -14);
sun.target.position.set(2, 0, -8);
sun.castShadow = true;
sun.shadow.mapSize.set(quality === 'low' ? 1024 : 2048, quality === 'low' ? 1024 : 2048);
const sc = sun.shadow.camera;
sc.left = -34; sc.right = 34; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 110;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xbfdcff, 0.45);
fill.position.set(20, 15, 30);
scene.add(fill);

// loading screen
const loadBar = document.querySelector('#loading .bar div');
THREE.DefaultLoadingManager.onProgress = (u, a, b) => { loadBar.style.width = (a / b) * 100 + '%'; };
const loaded = new Promise((res) => { THREE.DefaultLoadingManager.onLoad = res; });

const world = buildWorld(scene, quality);

// ------------------------------------------------------------------ characters
let hero = makeHero();
scene.add(hero);
let ryn = makeRyn();
ryn.position.set(L.RYN.x, 0.1, L.RYN.z);
ryn.rotation.y = 0.9;
scene.add(ryn);
world.colliders.push({ x: L.RYN.x, z: L.RYN.z, r: 0.5 });

const fx = createFX(scene);

// swap the placeholders for the Meshy models when they arrive (placeholders stay if loading fails)
const modelsReady = Promise.all([
  loadHeroModel().then((h) => { h.position.copy(hero.position); h.rotation.copy(hero.rotation); scene.remove(hero); scene.add(h); hero = h; }),
  loadRynModel().then((r) => { r.position.copy(ryn.position); r.rotation.copy(ryn.rotation); scene.remove(ryn); scene.add(r); ryn = r; }),
]).catch((e) => console.warn('character models failed to load, using placeholders', e));
const hud = createHUD(document.getElementById('hud'));

// ------------------------------------------------------------------ post-processing
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.92);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.12 }, contrast: { value: 1.04 }, vig: { value: 0.22 }, warm: { value: 0.05 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, contrast, vig, warm; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(vec3(l), c.rgb, sat);
      c.rgb = (c.rgb - 0.18) * contrast + 0.18;
      c.rgb += vec3(warm, warm*0.4, -warm*0.6) * l;
      vec2 d = vUv - 0.5; c.rgb *= 1.0 - vig * dot(d, d) * 1.6;
      gl_FragColor = c; }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  // keep the horizontal view at least as wide as the reference on narrow screens
  // keep the horizontal view of the 16:9 reference: narrow screens widen the vertical view,
  // very wide screens (phones in landscape) narrow it so edges don't stretch
  const t169 = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * (16 / 9);
  const a = w / h;
  const hTan = a > 16 / 9 ? Math.min(a * Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)), t169 * 1.25) : t169;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(hTan / a));
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  bloom.resolution.set(w * pixelRatio / 2, h * pixelRatio / 2);
  fx.setScale(h * pixelRatio * 0.9);
}
let BASE_FOV = 60;
window.addEventListener('resize', () => setTimeout(resize, 60));
resize();

// ------------------------------------------------------------------ guidance: path lights follow the current objective
function groundAt(x, z) {
  if (L.inStairs(x, z)) return L.stairsH(z);
  if (z < L.STAIRS.z1 && Math.abs(x - L.ARCH.x) < 3) return L.PLAT;
  return L.walkH(x, z) ?? L.groundH(x, z);
}
function resample(pts, step = 1.35) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) { const t = k / n; out.push(new THREE.Vector3(ax + (bx - ax) * t, 0, az + (bz - az) * t)); }
  }
  const [lx, lz] = pts[pts.length - 1]; out.push(new THREE.Vector3(lx, 0, lz));
  for (const p of out) p.y = groundAt(p.x, p.z) + 0.12;
  return out;
}
const PATHPTS = L.PATH.map(([x, z]) => [x, z]);
const ROUTES = {
  ryn: resample([...PATHPTS.slice(0, 5), [-1.2, -4.6], [-4.6, -6.4], [L.RYN.x + 1.4, L.RYN.z]]),
  dummies: resample([...PATHPTS.slice(0, 8), [3.4, -16.2], [L.BRIDGE.x0 - 0.3, L.BRIDGE.z], [L.BRIDGE.x1 + 0.4, L.BRIDGE.z], [L.DUMMIES[1][0] - 1.2, L.DUMMIES[1][1] + 1.6]]),
  arch: (() => {
    const c = pathCurve(); const len = c.getLength(); const pts = [];
    for (let s2 = 0; s2 < len; s2 += 1.35) { const q = c.getPointAt(s2 / len); pts.push([q.x, q.z]); }
    for (let z = L.STAIRS.z0 - 0.5; z > L.STAIRS.z1; z -= 0.9) pts.push([0.25, z]);
    pts.push([L.ARCH.x, L.ARCH.z + 1.4]);
    return resample(pts, 0.9);
  })(),
};
const MAXM = 110;
const markers = [];
for (let i = 0; i < MAXM; i++) {
  const s2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.sparkle, color: 0xffc84a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  s2.visible = false; scene.add(s2); markers.push(s2);
}
let route = ROUTES.arch;

// ------------------------------------------------------------------ minimap (top-down render once)
const MAP = { x0: -45, x1: 50, z0: -50, z1: 45 };
const mapImg = document.createElement('canvas');
function renderMinimap() {
  const size = 512;
  const cam = new THREE.OrthographicCamera(MAP.x0, MAP.x1, -MAP.z0, -MAP.z1, 1, 200);
  cam.position.set(0, 100, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
  // ortho frustum in camera space: x right = world x, y up = world -z
  cam.left = MAP.x0; cam.right = MAP.x1; cam.top = -MAP.z0; cam.bottom = -MAP.z1; cam.updateProjectionMatrix();
  const t = new THREE.WebGLRenderTarget(size, size);
  const fog = scene.fog; scene.fog = null;
  world.sky.visible = false;
  for (const m of markers) m.visible = false;
  hero.visible = false;
  renderer.setRenderTarget(t);
  renderer.render(scene, cam);
  const buf = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(t, 0, 0, size, size, buf);
  renderer.setRenderTarget(null);
  scene.fog = fog; world.sky.visible = true; hero.visible = true;
  for (const m of markers) m.visible = true;
  mapImg.width = mapImg.height = size;
  const g = mapImg.getContext('2d');
  const id = g.createImageData(size, size);
  for (let y = 0; y < size; y++) id.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  g.putImageData(id, 0, 0);
  // stylise: soften, warm and saturate like the reference minimap
  g.globalCompositeOperation = 'soft-light'; g.fillStyle = 'rgba(200,190,60,0.5)'; g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'source-over';
  t.dispose();
}

// ------------------------------------------------------------------ game state
const G = {
  hp: 240, hpMax: 240, mp: 100, mpMax: 100, potions: 3,
  talked: false, ended: false,
  clock: 10 * 60 + 24,
  cds: [0, 0, 0, 0, 0, 0], cdMax: [4, 6, 5, 10, 2, 6], cost: [10, 20, 15, 30, 0, 15],
  slot6: false, comboN: 0, chain: 0, lastAtk: -9, lastDodge: -9, shownQ: 0,
  dialog: null, swing: 1, atkCd: 0, dodgeCd: 0,
  xp: 0, xpMax: 600, level: 1, objKey: null,
};
const player = { pos: new THREE.Vector3(-0.35, 0, 7.2), yaw: Math.PI, vel: new THREE.Vector3(), dash: 0, dashDir: new THREE.Vector3() };
const cam = { yaw: 0, pitch: 0.07, dist: 2.25 };

function updateQuestHUD() {
  // show the quest the player was told about; a finished quest stays ticked for a moment before the next appears
  const q = QUESTS[G.shownQ], live = G.shownQ === Q.index;
  for (let j = 0; j < 3; j++) {
    const st = q.steps[j];
    if (!st) { hud.setQuest(j, null); continue; }
    hud.setQuest(j, st.label, live ? Q.stepDone(j) : true);
  }
}
hud.setXP(0, 600, 1);

let toastTimer = 0;
function toast(msg, secs = 2.2) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block'; toastTimer = secs;
}

// current objective: the compass, path lights and the floating marker follow it, never further ahead
const OBJ = {
  ryn: { name: 'A Familiar Face', target: new THREE.Vector3(L.RYN.x, 0, L.RYN.z) },
  dummies: { name: 'The Drill', target: new THREE.Vector3(L.DUMMIES[1][0], 0, L.DUMMIES[1][1]) },
  arch: { name: 'Ascension', target: new THREE.Vector3(L.ARCH.x, L.PLAT, L.ARCH.z) },
};
function objectiveKey() { if (SHOT) return 'arch'; return Q.over ? 'arch' : QUESTS[G.shownQ].obj; }
function refreshObjective() {
  const k = objectiveKey();
  if (k === G.objKey) return;
  const first = G.objKey === null;
  G.objKey = k; route = ROUTES[k];
  if (!first && !SHOT) banner(OBJ[k].name);
}
let bannerTimer = 0;
function banner(name) {
  const b = document.getElementById('banner');
  b.querySelector('.n').textContent = name;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  bannerTimer = 3.2;
}
let sayTimer = 0;
function say(who, text, secs = 4.2) {
  const el = document.getElementById('say');
  el.querySelector('.w').textContent = who; el.querySelector('.x').textContent = text;
  el.style.display = 'block'; sayTimer = secs;
}
function gainXP(n, label = '') {
  G.xp = Math.min(G.xpMax, G.xp + n);
  hud.setXP(G.xp, G.xpMax, G.level);
  hud.xpPop(`+${n} XP${label ? '  ' + label : ''}`);
  sfx.xp();
}

const DIALOG = [
  'Ah, Aelar. You came. Good.',
  'Before you leave the valley, you must show me you can hold your own.',
  'Cross the bridge to the training dummies. Strike three times without pause, then call on one of your abilities.',
  'And watch the old dummy on the end. It still swings back. When it glows red, roll away.',
];
const Q = createQuests({
  onStep: (q, st) => { sfx.chime(); toast(`${st.label} ✓`); },
  onQuestDone: (q) => {
    if (q.xp) setTimeout(() => gainXP(q.xp, q.name), 350);
    if (q.unlockSlot !== undefined) setTimeout(() => unlockSlot6(), 1200);
    if (q.outro) setTimeout(() => say(...q.outro), 900);
  },
  onQuestStart: (q) => {
    setTimeout(() => { G.shownQ = Q.index; updateQuestHUD(); if (q.intro) say(...q.intro); }, q.unlockSlot !== undefined || QUESTS[Q.index - 1]?.outro ? 4200 : 1800);
  },
  onChange: updateQuestHUD,
});
updateQuestHUD();
function unlockSlot6() {
  G.slot6 = true;
  hud.unlockSlot(5);
  sfx.fanfare();
  toast('New ability: Whirlwind (slot 6)', 3);
}

function openDialog() {
  G.dialog = 0;
  ryn.userData.setTalking?.(true);
  const d = document.getElementById('dialog');
  d.querySelector('.who').textContent = 'Master Ryn';
  d.querySelector('.txt').textContent = DIALOG[0];
  d.style.display = 'block';
}
document.getElementById('dialog').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  G.dialog++;
  sfx.ui();
  const d = document.getElementById('dialog');
  if (G.dialog >= DIALOG.length) {
    d.style.display = 'none'; G.dialog = null; ryn.userData.setTalking?.(false);
    if (!G.talked) { G.talked = true; Q.event('talk'); }
  } else d.querySelector('.txt').textContent = DIALOG[G.dialog];
});
document.getElementById('again').addEventListener('pointerdown', () => location.reload());

function nearRyn() { return player.pos.distanceTo(new THREE.Vector3(L.RYN.x, player.pos.y, L.RYN.z)) < 3.2; }

// ------------------------------------------------------------------ combat
const tmpV = new THREE.Vector3();
function forward() { return new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)); }
function dummiesInArc(range, arc) {
  const f = forward();
  return world.dummies.filter((d) => {
    tmpV.set(d.x - player.pos.x, 0, d.z - player.pos.z);
    const dist = tmpV.length();
    if (dist > range) return false;
    return tmpV.normalize().dot(f) > Math.cos(arc / 2);
  });
}
function nearestDummy(range) {
  let best = null, bd = range;
  for (const d of world.dummies) { const dd = Math.hypot(d.x - player.pos.x, d.z - player.pos.z); if (dd < bd) { bd = dd; best = d; } }
  return best;
}
const dmgLayer = document.getElementById('hud');
const dmgs = [];
// hit feel: a short freeze on contact, camera shake, a white flash on the target, popping numbers
let hitStop = 0, shake = 0;
function impact(stopSecs, shakeAmt) { hitStop = Math.max(hitStop, stopSecs); shake = Math.max(shake, shakeAmt); }
for (const d of world.dummies) {
  d.body.traverse((m) => {
    if (!m.isMesh) return;
    m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
    for (const mm of [].concat(m.material)) { if (mm.emissive) { mm.emissive.set(0xffffff); mm.emissiveIntensity = 0; d.mats.push(mm); } }
  });
}
function hitDummy(d, amount, color = '#ffe08a', kind = 'melee', heavy = false) {
  d.wobble = 1; d.flash = 1;
  fx.hitSpark(new THREE.Vector3(d.x, 1.9, d.z));
  const crit = Math.random() < 0.12;
  if (crit) amount = Math.round(amount * 1.6);
  impact(heavy || crit ? 0.08 : 0.065, heavy ? 0.16 : crit ? 0.12 : 0.07);
  sfx.hit('wood', heavy || crit);
  const el = document.createElement('div');
  el.className = 'dmg' + (crit ? ' crit' : ''); el.textContent = crit ? amount + '!' : amount; el.style.color = crit ? '#ffcf3a' : color;
  el.style.fontSize = (crit ? 44 : 30) * hud.scale + 'px';
  dmgLayer.appendChild(el);
  dmgs.push({ el, p: new THREE.Vector3(d.x + (Math.random() - 0.5) * 0.6, 2.6, d.z), age: 0, crit });
  if (kind === 'ability') Q.event('ability');
}

function popAt(p, text, color, size = 30) {
  const el = document.createElement('div');
  el.className = 'dmg'; el.textContent = text; el.style.color = color;
  el.style.fontSize = size * hud.scale + 'px';
  dmgLayer.appendChild(el);
  dmgs.push({ el, p: p.clone(), age: 0, crit: false });
}
function attack() {
  if (G.dialog !== null) return;
  if (!G.talked && nearRyn()) { openDialog(); return; }
  if (G.atkCd > 0) return;
  const t = performance.now() / 1000;
  G.comboN = t - G.lastAtk < 1.05 ? G.comboN % 3 + 1 : 1;
  G.lastAtk = t;
  const n = G.comboN, third = n === 3;
  G.atkCd = third ? 0.62 : 0.4;
  G.swing *= -1;
  hero.userData.attack(G.swing);
  setTimeout(() => sfx.whoosh(third), 180);
  setTimeout(() => {
    const yaw = player.yaw;
    fx.slash(player.pos, yaw, new THREE.Color(third ? 0xffc870 : 0xffe6b0), third ? 2.1 : 1.6, third ? 0.5 : 0.35);
    const hits = dummiesInArc(third ? 3.3 : 2.9, third ? 2.6 : 2.2);
    for (const d of hits) hitDummy(d, Math.round((12 + Math.floor(Math.random() * 6)) * (third ? 1.6 : 1)), '#fff2c8', 'melee', third);
    if (hits.length) {
      G.chain = n === 1 ? 1 : G.chain === n - 1 ? n : 0;
      if (n > 1 && G.chain === n) popAt(player.pos.clone().add(new THREE.Vector3(0, 2.3, 0)), `Combo ×${n}`, '#ffd84a', 26);
      if (G.chain === 3) Q.event('combo');
    } else G.chain = 0;
  }, 260);
}
function dodge() {
  if (G.dodgeCd > 0 || G.dialog !== null) return;
  G.dodgeCd = 0.8;
  player.dash = 0.32;
  const mv = moveInput.lengthSq() > 0.01 ? camRelative(moveInput) : forward();
  player.dashDir.copy(mv).normalize();
  player.yaw = Math.atan2(player.dashDir.x, player.dashDir.z);
  hero.userData.dodge();
  sfx.dodge();
  G.lastDodge = performance.now() / 1000;
  fx.burst(player.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), new THREE.Color(0xd8c8a0), 12, 2, 0.4, 0.3, 0.3);
}
function useAbility(i) {
  if (G.dialog !== null) return;
  if (G.cds[i] > 0) return;
  if (i === 4) {
    if (G.potions <= 0) { toast('No potions left'); sfx.error(); return; }
    sfx.cast('potion');
    G.potions--; G.hp = G.hpMax; G.mp = Math.min(G.mpMax, G.mp + 40);
    hud.els.potion.textContent = G.potions;
    G.cds[4] = G.cdMax[4];
    fx.potion(player.pos);
    return;
  }
  if (i === 5 && !G.slot6) { toast('Locked: finish the drill to learn it'); sfx.error(); return; }
  if (G.mp < G.cost[i]) { toast('Not enough mana'); sfx.error(); return; }
  sfx.cast(['slash', 'bolt', 'fire', 'vortex', '', 'slash'][i]);
  G.mp -= G.cost[i];
  G.cds[i] = G.cdMax[i];
  const f = forward();
  const chest = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
  if (i === 0) {
    hero.userData.attack(1);
    setTimeout(() => {
      fx.slash(player.pos, player.yaw);
      for (const d of dummiesInArc(3.8, 2.4)) hitDummy(d, 34 + Math.floor(Math.random() * 8), '#ffb347', 'ability', true);
    }, 250);
  } else if (i === 1) {
    hero.userData.cast();
    const d = nearestDummy(16);
    const end = d ? new THREE.Vector3(d.x, 1.7, d.z) : chest.clone().addScaledVector(f, 9);
    setTimeout(() => { fx.bolt(chest.clone().addScaledVector(f, 0.5).add(new THREE.Vector3(0, 0.4, 0)), end); if (d) hitDummy(d, 48 + Math.floor(Math.random() * 10), '#8fd8ff', 'ability', true); }, 120);
  } else if (i === 2) {
    hero.userData.cast();
    const hitSet = new Set();
    fx.fireball(chest.clone().addScaledVector(f, 0.8), f, 16, (p) => {
      for (const d of world.dummies) {
        if (!hitSet.has(d) && Math.hypot(d.x - p.x, d.z - p.z) < 1.0) { hitSet.add(d); hitDummy(d, 41 + Math.floor(Math.random() * 9), '#ff9a3a', 'ability', true); return true; }
      }
      return false;
    });
  } else if (i === 5) {
    hero.userData.attack(1);
    for (let k = 0; k < 4; k++) setTimeout(() => fx.slash(player.pos, player.yaw + k * Math.PI / 2, new THREE.Color(0xfff0c0), 1.9, 0.3), k * 70);
    setTimeout(() => { for (const d of world.dummies) if (Math.hypot(d.x - player.pos.x, d.z - player.pos.z) < 3.4) hitDummy(d, 22 + Math.floor(Math.random() * 7), '#fff2c8', 'ability', true); }, 200);
  } else if (i === 3) {
    hero.userData.cast();
    fx.vortex(player.pos.clone());
    for (const d of world.dummies) if (Math.hypot(d.x - player.pos.x, d.z - player.pos.z) < 5) hitDummy(d, 27 + Math.floor(Math.random() * 6), '#8fd8ff', 'ability', true);
  }
}

// ------------------------------------------------------------------ the live dummy (teaches dodging)
const LD = { d: world.dummies[0], state: 'idle', t: 0, cd: 1.5, hintShown: 0 };
const decal = new THREE.Mesh(new THREE.RingGeometry(0.15, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
decal.rotation.x = -Math.PI / 2; decal.visible = false; scene.add(decal);
const LD_REACH = 2.9;
function setLDGlow(r, g, b, k) { for (const mm of LD.d.mats) { mm.emissive.setRGB(r, g, b); mm.emissiveIntensity = k; } }
function updateLiveDummy(dt) {
  const d = LD.d;
  const active = Q.isActive('drill') && G.shownQ === Q.index;
  const dx = player.pos.x - d.x, dz = player.pos.z - d.z, dist = Math.hypot(dx, dz);
  if (!active) { decal.visible = false; if (LD.state !== 'idle') { LD.state = 'idle'; d.body.rotation.y = 0; } return; }
  // turn to face the hero
  const want = Math.atan2(dx, dz);
  let dr = want - d.group.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
  d.group.rotation.y += dr * (1 - Math.exp(-dt * 4));
  if (LD.state === 'idle') {
    LD.cd -= dt;
    if (dist < 3.6 && LD.cd <= 0) { LD.state = 'windup'; LD.t = 0; sfx.windup(); }
  } else if (LD.state === 'windup') {
    LD.t += dt;
    const k = Math.min(1, LD.t / 1.2);
    decal.visible = true;
    decal.position.set(d.x, L.groundH(d.x, d.z) + 0.3, d.z);
    const r = LD_REACH * (0.35 + 0.65 * k);
    decal.scale.set(r, r, 1);
    decal.material.opacity = 0.35 + 0.35 * Math.abs(Math.sin(LD.t * 10));
    setLDGlow(1, 0.12, 0.05, 0.25 + 0.75 * k);
    d.body.rotation.y = -0.6 * k; // wind back
    if (LD.t >= 1.2) {
      LD.state = 'swing'; LD.t = 0; decal.visible = false; setLDGlow(1, 1, 1, 0);
      sfx.whoosh(true);
      const now = performance.now() / 1000;
      if (dist < LD_REACH + 0.4) {
        if (now - G.lastDodge < 0.6 || player.dash > 0) {
          popAt(player.pos.clone().add(new THREE.Vector3(0, 2.3, 0)), 'Perfect dodge!', '#9fe8ff', 28);
          Q.event('dodge');
        } else {
          // staggered: knocked back, no damage
          impact(0.1, 0.2); sfx.hit('wood', true);
          player.dash = 0.16; player.dashDir.set(dx, 0, dz).normalize();
          popAt(player.pos.clone().add(new THREE.Vector3(0, 2.3, 0)), 'Staggered', '#ff8a6a', 24);
          if (LD.hintShown++ < 3) toast('Tap dodge when it glows red', 2.6);
        }
      }
    }
  } else if (LD.state === 'swing') {
    LD.t += dt;
    d.body.rotation.y = -0.6 + Math.min(1, LD.t / 0.18) * 2.2 - Math.max(0, LD.t - 0.25) * 4;
    if (LD.t > 0.65) { LD.state = 'idle'; d.body.rotation.y = 0; LD.cd = 1.6 + Math.random() * 0.8; }
  }
}

// ------------------------------------------------------------------ input
const moveInput = new THREE.Vector2();
const keys = {};
let stick = null, look = null;
function camRelative(v) {
  // v.x = right, v.y = forward
  const fwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  return fwd.multiplyScalar(v.y).add(right.multiplyScalar(v.x));
}
addEventListener('pointerdown', unlockAudio, true);
addEventListener('keydown', unlockAudio, true);
const ring = document.getElementById('stick'), knob = ring.querySelector('div');
function showStick(x, y) { ring.style.display = 'block'; ring.style.left = x + 'px'; ring.style.top = y + 'px'; knob.style.transform = 'translate(-50%,-50%)'; }
canvas.addEventListener('pointerdown', (e) => {
  if (G.dialog !== null) return;
  canvas.setPointerCapture(e.pointerId);
  if (e.clientX < window.innerWidth * 0.45 && e.pointerType !== 'mouse') { stick = { id: e.pointerId, x: e.clientX, y: e.clientY }; showStick(e.clientX, e.clientY); }
  else look = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
});
canvas.addEventListener('pointermove', (e) => {
  if (stick && e.pointerId === stick.id) {
    const R = 55;
    let dx = (e.clientX - stick.x) / R, dy = -(e.clientY - stick.y) / R;
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; stick.x = e.clientX - dx * R; stick.y = e.clientY + dy * R; ring.style.left = stick.x + 'px'; ring.style.top = stick.y + 'px'; }
    moveInput.set(dx, dy);
    knob.style.transform = `translate(calc(-50% + ${dx * R}px), calc(-50% + ${-dy * R}px))`;
  } else if (look && e.pointerId === look.id) {
    const dx = e.clientX - look.x, dy = e.clientY - look.y;
    look.x = e.clientX; look.y = e.clientY; look.moved += Math.abs(dx) + Math.abs(dy);
    const k = e.pointerType === 'mouse' ? 0.005 : 0.008;
    cam.yaw -= dx * k;
    cam.pitch = clamp(cam.pitch + dy * k * 0.7, -0.15, 0.85);
  }
});
function endPointer(e) {
  if (stick && e.pointerId === stick.id) { stick = null; moveInput.set(0, 0); ring.style.display = 'none'; }
  if (look && e.pointerId === look.id) {
    // a tap on Master Ryn talks to him
    if (look.moved < 8 && performance.now() - look.t < 350) tapWorld(e.clientX, e.clientY);
    look = null;
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
function tapWorld(x, y) {
  const p = new THREE.Vector3(L.RYN.x, 1.0, L.RYN.z).project(camera);
  const sx = (p.x * 0.5 + 0.5) * window.innerWidth, sy = (-p.y * 0.5 + 0.5) * window.innerHeight;
  if (Math.hypot(sx - x, sy - y) < 60 && player.pos.distanceTo(new THREE.Vector3(L.RYN.x, player.pos.y, L.RYN.z)) < 9) {
    if (nearRyn()) openDialog(); else toast('Walk closer to Master Ryn');
  }
}
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') attack();
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') dodge();
  if (e.code === 'KeyE' && nearRyn()) openDialog();
  const n = '123456'.indexOf(e.key); if (n >= 0) useAbility(n);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

function btn(el, fn) {
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); el.classList.add('pressed'); fn(); });
  el.addEventListener('pointerup', () => el.classList.remove('pressed'));
  el.addEventListener('pointerleave', () => el.classList.remove('pressed'));
}
btn(hud.els.attack, attack);
btn(hud.els.dodge, dodge);
hud.els.slots.forEach((s, i) => btn(s.b, () => useAbility(i)));
const menuNames = ['Inventory', 'Equipment', 'Journal', 'Settings'];
hud.els.menuBtns.forEach((b, i) => btn(b, () => {
  if (i === 3) { setMuted(!isMuted()); toast(isMuted() ? 'Sound off' : 'Sound on'); return; }
  toast(`${menuNames[i]}: not in this prototype`);
}));
btn(hud.els.gear, () => {
  quality = quality === 'low' ? 'high' : 'low';
  pixelRatio = quality === 'low' ? Math.min(devicePixelRatio, 1.3) : Math.min(devicePixelRatio, 2);
  bloom.enabled = quality !== 'low' || pixelRatio > 1.2;
  resize();
  toast(`Graphics: ${quality === 'low' ? 'faster' : 'sharper'}`);
});
btn(hud.els.talk, () => openDialog());

// ------------------------------------------------------------------ movement
function collide(x, z) {
  for (const c of world.colliders) {
    if (c.r <= 0) continue;
    const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), min = c.r + 0.35;
    if (d < min && d > 1e-4) { x = c.x + dx / d * min; z = c.z + dz / d * min; }
  }
  const h = world.houseRect;
  if (x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) {
    const dl = x - h.x0, dr = h.x1 - x, dt = z - h.z0, db = h.z1 - z, m = Math.min(dl, dr, dt, db);
    if (m === dl) x = h.x0; else if (m === dr) x = h.x1; else if (m === dt) z = h.z0; else z = h.z1;
  }
  return [x, z];
}
function movePlayer(dt) {
  let mv = new THREE.Vector2(moveInput.x, moveInput.y);
  if (keys.KeyW || keys.ArrowUp) mv.y += 1;
  if (keys.KeyS || keys.ArrowDown) mv.y -= 1;
  if (keys.KeyA || keys.ArrowLeft) mv.x -= 1;
  if (keys.KeyD || keys.ArrowRight) mv.x += 1;
  if (mv.length() > 1) mv.normalize();
  if (G.dialog !== null) mv.set(0, 0);
  let dir = camRelative(mv);
  let speed = mv.length() * 5.2;
  if (player.dash > 0) { player.dash -= dt; dir = player.dashDir.clone(); speed = 11; }
  let moving = 0;
  if (speed > 0.05) {
    const step = dir.clone().normalize().multiplyScalar(speed * dt);
    let [nx, nz] = collide(player.pos.x + step.x, player.pos.z + step.z);
    let h = L.walkH(nx, nz, player.pos.y);
    if (h === null) { // slide along the blocking edge
      [nx, nz] = collide(player.pos.x + step.x, player.pos.z); h = L.walkH(nx, nz, player.pos.y);
      if (h === null) { [nx, nz] = collide(player.pos.x, player.pos.z + step.z); h = L.walkH(nx, nz, player.pos.y); }
    }
    if (h !== null && Math.hypot(nx - 3, nz + 2) < 40) {
      player.pos.x = nx; player.pos.z = nz;
      moving = player.dash > 0 ? 0 : mv.length();
    }
    if (player.dash <= 0) {
      const target = Math.atan2(dir.x, dir.z);
      let d = target - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      player.yaw += d * (1 - Math.exp(-dt * 12));
    }
    // camera drifts behind the hero while running
    if (!look && mv.y > 0.3) {
      let d = (player.yaw + Math.PI) - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      cam.yaw += d * (1 - Math.exp(-dt * 0.8)) * mv.y;
    }
  }
  const gh = L.walkH(player.pos.x, player.pos.z) ?? player.pos.y;
  player.pos.y = lerp(player.pos.y, gh, 1 - Math.exp(-dt * 20));
  hero.position.copy(player.pos);
  hero.rotation.y = player.yaw;
  hero.userData.update(dt, moving);
}

const camTarget = new THREE.Vector3();
function updateCamera(dt, snap) {
  // over-the-shoulder: look point is offset to the hero's right, as in the reference
  const right = new THREE.Vector3(-Math.cos(cam.yaw), 0, Math.sin(cam.yaw)).multiplyScalar(-1);
  const want = player.pos.clone().add(new THREE.Vector3(0, 1.95, 0)).addScaledVector(right, 0.72);
  if (snap) camTarget.copy(want); else camTarget.lerp(want, 1 - Math.exp(-dt * 10));
  const cp = Math.cos(cam.pitch);
  const off = new THREE.Vector3(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp).multiplyScalar(cam.dist);
  const pos = camTarget.clone().add(off);
  const floor = L.groundH(pos.x, pos.z) + 0.6;
  if (pos.y < floor) pos.y = floor;
  camera.position.copy(pos);
  camera.lookAt(camTarget.x, camTarget.y - 0.2 + cam.pitch * 0.4, camTarget.z);
  if (shake > 0.001) {
    const a = shake * shake;
    camera.position.x += (Math.random() - 0.5) * a; camera.position.y += (Math.random() - 0.5) * a;
    camera.rotation.z += (Math.random() - 0.5) * a * 0.15;
    shake = Math.max(0, shake - dt * 0.9);
  }
}

// ------------------------------------------------------------------ per-frame HUD bits
const v3 = new THREE.Vector3();
function project(p) {
  v3.copy(p).project(camera);
  return { x: (v3.x * 0.5 + 0.5) * window.innerWidth, y: (-v3.y * 0.5 + 0.5) * window.innerHeight, vis: v3.z < 1 && v3.z > -1 };
}
function updateWorldHUD(dt) {
  const s = hud.scale;
  const head = project(new THREE.Vector3(L.RYN.x, 2.65, L.RYN.z));
  const dist = player.pos.distanceTo(ryn.position);
  const npc = hud.els.npc, name = hud.els.npcName, talk = hud.els.talk;
  const showMarker = !G.talked && head.vis && dist < 45;
  npc.style.display = showMarker ? 'block' : 'none';
  if (showMarker) {
    const k = clamp(14 / Math.max(dist, 6), 0.75, 1.35);
    npc.style.transform = `translate(-50%, -100%) scale(${k})`;
    npc.style.transformOrigin = '50% 100%';
    npc.style.left = head.x + 'px'; npc.style.top = head.y + 'px';
    npc.style.position = 'absolute';
    npc.style.marginTop = 2 * s + 'px';
  }
  name.style.display = G.talked && head.vis && dist < 25 ? 'block' : 'none';
  if (G.talked) { name.style.left = head.x + 'px'; name.style.top = head.y + 'px'; name.style.transform = 'translate(-50%,-50%)'; }
  const canTalk = !G.talked && nearRyn() && G.dialog === null;
  talk.style.display = canTalk && !SHOT ? 'block' : 'none';
  if (canTalk) { const p = project(new THREE.Vector3(L.RYN.x, 1.0, L.RYN.z)); talk.style.left = p.x + 'px'; talk.style.top = p.y + 'px'; }
  // floating objective marker over the current target (Ryn has his own "!")
  const om = document.getElementById('objmark');
  const o = OBJ[G.objKey];
  if (o && G.objKey !== 'ryn' && !G.ended && !SHOT) {
    const tp = o.target.clone(); tp.y = (G.objKey === 'arch' ? L.PLAT + 5.6 : 3.2);
    const pp = project(tp);
    const dd = player.pos.distanceTo(o.target);
    om.style.display = pp.vis && dd > 3 ? 'block' : 'none';
    om.style.left = pp.x + 'px'; om.style.top = pp.y + 'px';
    om.style.fontSize = Math.max(12, 22 * s) + 'px';
    om.querySelector('.d').textContent = Math.round(dd) + ' m';
  } else om.style.display = 'none';
  for (let i = dmgs.length - 1; i >= 0; i--) {
    const d = dmgs[i]; d.age += dt; d.p.y += dt * 1.2;
    const p = project(d.p);
    d.el.style.left = p.x + 'px'; d.el.style.top = p.y + 'px';
    d.el.style.opacity = String(1 - Math.max(0, d.age - 0.5) / 0.5);
    d.el.style.transform = `translate(-50%,-50%) scale(${1 + Math.max(0, 0.15 - d.age) * (d.crit ? 6 : 3)})`;
    if (d.age > 1) { d.el.remove(); dmgs.splice(i, 1); }
  }
}

// heading: compass north is fixed in the world so that the reference view reads ~318 degrees
const NORTH_OFFSET = 318;
function headingDeg() { return ((NORTH_OFFSET - THREE.MathUtils.radToDeg(cam.yaw)) % 360 + 360) % 360; }
function bearingTo(p) {
  const dx = p.x - player.pos.x, dz = p.z - player.pos.z;
  const yaw = Math.atan2(-dx, -dz); // the camera yaw that would face p
  return ((NORTH_OFFSET - THREE.MathUtils.radToDeg(yaw)) % 360 + 360) % 360;
}

function drawMinimap() {
  const c = hud.els.mapCanvas, g = c.getContext('2d');
  const w = c.width, r = w / 2;
  const viewM = 26; // metres from centre to edge
  const pxPerM = r / viewM, imgPxPerM = mapImg.width / (MAP.x1 - MAP.x0);
  g.save();
  g.fillStyle = '#6f8f3a'; g.fillRect(0, 0, w, w);
  g.translate(r, r);
  g.rotate(cam.yaw);
  g.scale(pxPerM / imgPxPerM, pxPerM / imgPxPerM);
  g.translate(-(player.pos.x - MAP.x0) * imgPxPerM, -(player.pos.z - MAP.z0) * imgPxPerM);
  g.drawImage(mapImg, 0, 0);
  g.restore();
  // points of interest
  const poi = (x, z, draw) => {
    const dx = (x - player.pos.x) * pxPerM, dz = (z - player.pos.z) * pxPerM;
    const a = cam.yaw;
    const rx = dx * Math.cos(a) - dz * Math.sin(a), ry = dx * Math.sin(a) + dz * Math.cos(a);
    const d = Math.hypot(rx, ry), lim = r * 0.86;
    const k = d > lim ? lim / d : 1;
    draw(r + rx * k, r + ry * k);
  };
  if (G.objKey === 'dummies') poi(OBJ.dummies.target.x, OBJ.dummies.target.z, (x, y) => { const pr = w * (0.035 + 0.015 * Math.sin(T * 5)); g.fillStyle = '#ff5a3a'; g.strokeStyle = '#000'; g.lineWidth = w * 0.012; g.beginPath(); g.arc(x, y, pr, 0, 7); g.fill(); g.stroke(); });
  if (!G.talked) poi(L.RYN.x, L.RYN.z, (x, y) => { g.fillStyle = '#ffd21f'; g.strokeStyle = '#000'; g.lineWidth = w * 0.012; g.beginPath(); g.arc(x, y, w * 0.035, 0, 7); g.fill(); g.stroke(); });
  poi(L.ARCH.x, L.ARCH.z, (x, y) => { g.fillStyle = '#ffcf4a'; g.strokeStyle = '#3a2400'; g.lineWidth = w * 0.01; g.beginPath(); g.moveTo(x, y - w * 0.04); g.lineTo(x + w * 0.03, y); g.lineTo(x, y + w * 0.04); g.lineTo(x - w * 0.03, y); g.closePath(); g.fill(); g.stroke(); });
  // player arrow (gold, pointing up)
  const a = w * 0.075;
  g.save(); g.translate(r, r);
  g.rotate(Math.PI - player.yaw + cam.yaw);
  g.fillStyle = '#ffcc1a'; g.strokeStyle = '#3a2400'; g.lineWidth = w * 0.012;
  g.beginPath(); g.moveTo(0, -a); g.lineTo(a * 0.7, a * 0.7); g.lineTo(0, a * 0.35); g.lineTo(-a * 0.7, a * 0.7); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

// ------------------------------------------------------------------ main loop
let last = performance.now(), T = 0, frames = 0, ftAcc = 0, adapted = false;
const clock = new THREE.Clock();
let shotFrames = 0;
function frame() {
  if (SHOT && window.__ready && ++shotFrames > 4) { window.__shotDone = true; return; }
  requestAnimationFrame(frame);
  const now = performance.now();
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (SHOT) dt = 1 / 60;
  const realDt = dt;
  if (hitStop > 0) { hitStop -= dt; dt = 0; } // freeze-frame on impact
  T += dt;
  for (const u of world.updaters) u(T);
  // lantern flicker
  for (const l of world.lanterns) { const pl = l.children.find((c) => c.isPointLight); if (pl) pl.intensity = 6 + Math.sin(T * 9 + l.position.z) * 0.5; }
  // dummies
  for (const d of world.dummies) {
    d.wobble = Math.max(0, d.wobble - dt * 1.6);
    d.body.rotation.x = Math.sin(T * 18) * 0.12 * d.wobble;
    d.body.rotation.z = Math.cos(T * 14) * 0.06 * d.wobble;
    d.flash = Math.max(0, d.flash - realDt * 7);
    if (!(d === LD.d && LD.state === 'windup')) for (const mm of d.mats) mm.emissiveIntensity = d.flash * 0.9;
  }
  // path lights toward the current objective: pulse travelling forward, hide those behind the player
  refreshObjective();
  let nearest = 0, nd = 1e9;
  route.forEach((p, i) => { const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z); if (d < nd) { nd = d; nearest = i; } });
  const first = Math.max(0, nearest - (SHOT ? 0 : 1));
  markers.forEach((m, j) => {
    const i = first + j;
    if (i >= route.length || G.ended || j > 60) { m.visible = false; return; }
    m.visible = true;
    const wave = 0.5 + 0.5 * Math.sin(T * 4 - i * 0.6);
    const sz = 0.32 + wave * 0.18;
    m.scale.set(sz, sz, 1);
    m.position.set(route[i].x + Math.sin(i * 1.7) * 0.25, route[i].y + 0.08 + wave * 0.1, route[i].z);
    m.material.opacity = (0.65 + wave * 0.35) * Math.min(1, (60 - j) / 12);
  });

  if (!SHOT) movePlayer(dt); else { hero.position.copy(player.pos); hero.rotation.y = player.yaw; hero.userData.update(dt, 0); }
  ryn.userData.update(dt);
  // Ryn turns to face the hero when close
  const toHero = Math.atan2(player.pos.x - ryn.position.x, player.pos.z - ryn.position.z);
  const wantRyn = player.pos.distanceTo(ryn.position) < 6 ? toHero : 0.9;
  let dr = wantRyn - ryn.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
  ryn.rotation.y += dr * (1 - Math.exp(-dt * 3));
  updateCamera(realDt, SHOT || T < 0.1);
  fx.update(dt);

  // stats, cooldowns
  G.mp = Math.min(G.mpMax, G.mp + dt * 4);
  G.atkCd = Math.max(0, G.atkCd - dt); G.dodgeCd = Math.max(0, G.dodgeCd - dt);
  for (let i = 0; i < 6; i++) {
    G.cds[i] = Math.max(0, G.cds[i] - dt);
    if (i === 5 && !G.slot6) continue;
    hud.setCooldown(i, G.cds[i] / G.cdMax[i], G.cds[i], i === 4 ? G.potions <= 0 : G.mp < G.cost[i]);
  }
  hud.setBars(G.hp, G.hpMax, G.mp, G.mpMax);
  G.clock += dt / 10;
  hud.setClock(G.clock);
  const target = OBJ[G.objKey].target;
  hud.drawCompass(headingDeg(), bearingTo(target), player.pos.distanceTo(target));
  setFallsDistance(Math.hypot(player.pos.x - L.FALLS_X, player.pos.z + 19.5));
  if (sayTimer > 0) { sayTimer -= realDt; if (sayTimer <= 0) document.getElementById('say').style.display = 'none'; }
  updateLiveDummy(dt);
  if (bannerTimer > 0) { bannerTimer -= realDt; if (bannerTimer <= 0) document.getElementById('banner').classList.remove('show'); }
  if (mapImg.width) drawMinimap();
  updateWorldHUD(dt);
  if (toastTimer > 0) { toastTimer -= realDt; if (toastTimer <= 0) document.getElementById('toast').style.display = 'none'; }
  if (Q.isActive('ascend') && !G.ended && Math.hypot(player.pos.x - L.ARCH.x, player.pos.z - L.ARCH.z) < 2.2) {
    Q.event('arch');
    G.ended = true; document.getElementById('fin').style.display = 'flex'; sfx.fanfare();
  }

  composer.render();

  // adaptive quality on phones: if the first seconds run slow, render fewer pixels
  if (!SHOT && T > 1.5 && !adapted) {
    frames++; ftAcc += dt;
    if (frames === 90) {
      const fps = frames / ftAcc;
      adapted = true;
      if (fps < 40 && pixelRatio > 1.4) { pixelRatio = Math.max(1.4, pixelRatio * 0.8); resize(); }
      if (fps < 28) { bloom.enabled = false; sun.shadow.mapSize.set(1024, 1024); }
    }
  }
}

// shot mode: place the hero where the reference has him
if (SHOT) {
  const s = params.get('shot').split(',').map(Number);
  if (s.length >= 5) { player.pos.set(s[0], 0, s[1]); cam.yaw = s[2]; cam.pitch = s[3]; cam.dist = s[4]; if (s[5]) BASE_FOV = s[5]; resize(); }
  player.yaw = cam.yaw + Math.PI;
  player.pos.y = L.walkH(player.pos.x, player.pos.z) ?? 0;
}
player.yaw = cam.yaw + Math.PI;
player.pos.y = L.walkH(player.pos.x, player.pos.z) ?? 0;

Promise.all([loaded, modelsReady]).then(() => {
  renderMinimap();
  const ld = document.getElementById('loading');
  ld.style.opacity = '0';
  setTimeout(() => ld.remove(), 650);
  window.__ready = true;
});
frame();
window.__game = { G, player, cam, camera, scene, renderer, L, resize, Q, LD, attack, useAbility, dodge };
