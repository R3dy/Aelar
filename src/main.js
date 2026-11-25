import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, pathCurve, TEX } from './world.js';
import * as L from './layout.js';
import { makeHero, makeRyn } from './characters.js';
import { createHUD } from './hud.js';
import { createFX } from './effects.js';
import { clamp, lerp } from './util.js';

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
const hero = makeHero();
scene.add(hero);
const ryn = makeRyn();
ryn.position.set(L.RYN.x, 0.1, L.RYN.z);
ryn.rotation.y = 0.9;
scene.add(ryn);
world.colliders.push({ x: L.RYN.x, z: L.RYN.z, r: 0.5 });

const fx = createFX(scene);
const hud = createHUD(document.getElementById('hud'));

// ------------------------------------------------------------------ post-processing
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.92);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.0 }, contrast: { value: 1.05 }, vig: { value: 0.28 }, warm: { value: 0.03 } },
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

// ------------------------------------------------------------------ path markers
const route = [];
{
  const c = pathCurve();
  const len = c.getLength();
  for (let s = 0; s < len; s += 1.35) { const p = c.getPointAt(s / len); route.push(new THREE.Vector3(p.x, 0, p.z)); }
  for (let z = L.STAIRS.z0 - 0.5; z > L.STAIRS.z1; z -= 0.9) route.push(new THREE.Vector3(0.25, 0, z));
  route.push(new THREE.Vector3(L.ARCH.x, 0, L.ARCH.z + 1.4));
  for (const p of route) {
    const h = L.inStairs(p.x, p.z) ? L.stairsH(p.z) : (p.z < L.STAIRS.z1 ? L.PLAT : L.groundH(p.x, p.z));
    p.y = h + 0.12;
  }
}
const markers = route.map((p, i) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.sparkle, color: 0xffc84a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  s.position.copy(p);
  s.position.x += Math.sin(i * 1.7) * 0.25;
  scene.add(s);
  return s;
});

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
  talked: false, combat: 0, ability: 0, finished: false, ended: false,
  clock: 10 * 60 + 24,
  cds: [0, 0, 0, 0, 0], cdMax: [4, 6, 5, 10, 2], cost: [10, 20, 15, 30, 0],
  dialog: null, swing: 1, atkCd: 0, dodgeCd: 0,
};
const player = { pos: new THREE.Vector3(-0.35, 0, 7.2), yaw: Math.PI, vel: new THREE.Vector3(), dash: 0, dashDir: new THREE.Vector3() };
const cam = { yaw: 0, pitch: 0.06, dist: 2.7 };

function updateQuestHUD() {
  hud.setQuest(0, 'Talk to Master Ryn', G.talked);
  hud.setQuest(1, `Learn Combat (${G.combat}/3)`, G.combat >= 3);
  hud.setQuest(2, `Use an Ability (${G.ability}/1)`, G.ability >= 1);
}
updateQuestHUD();

let toastTimer = 0;
function toast(msg, secs = 2.2) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block'; toastTimer = secs;
}

const DIALOG = [
  'Ah, Aelar. You came. Good.',
  'Before you leave the valley, you must show me you can hold your own.',
  'Strike the training dummies three times. Then call on one of your abilities, any of them.',
  'When you are done, follow the golden lights up the stairs to the archway.',
];
function openDialog() {
  G.dialog = 0;
  const d = document.getElementById('dialog');
  d.querySelector('.who').textContent = 'Master Ryn';
  d.querySelector('.txt').textContent = DIALOG[0];
  d.style.display = 'block';
}
document.getElementById('dialog').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  G.dialog++;
  const d = document.getElementById('dialog');
  if (G.dialog >= DIALOG.length) {
    d.style.display = 'none'; G.dialog = null;
    if (!G.talked) { G.talked = true; updateQuestHUD(); toast('Quest updated: Talk to Master Ryn ✓'); }
  } else d.querySelector('.txt').textContent = DIALOG[G.dialog];
});
document.getElementById('again').addEventListener('pointerdown', () => location.reload());

function checkFinished() {
  if (!G.finished && G.talked && G.combat >= 3 && G.ability >= 1) {
    G.finished = true;
    setTimeout(() => toast('Training complete! Head to the archway', 3.2), 600);
  }
}

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
function hitDummy(d, amount, color = '#ffe08a', countsForCombat = false) {
  d.wobble = 1; d.flash = 1;
  fx.hitSpark(new THREE.Vector3(d.x, 1.9, d.z));
  const el = document.createElement('div');
  el.className = 'dmg'; el.textContent = amount; el.style.color = color;
  el.style.fontSize = 30 * hud.scale + 'px';
  dmgLayer.appendChild(el);
  dmgs.push({ el, p: new THREE.Vector3(d.x + (Math.random() - 0.5) * 0.6, 2.6, d.z), age: 0 });
  if (countsForCombat) {
    if (!G.talked) { toast('Talk to Master Ryn first'); return; }
    if (G.combat < 3) { G.combat++; updateQuestHUD(); if (G.combat === 3) toast('Quest updated: Learn Combat ✓'); checkFinished(); }
  }
}

function attack() {
  if (G.dialog !== null) return;
  if (!G.talked && nearRyn()) { openDialog(); return; }
  if (G.atkCd > 0) return;
  G.atkCd = 0.55;
  G.swing *= -1;
  hero.userData.attack(G.swing);
  setTimeout(() => {
    const yaw = player.yaw;
    fx.slash(player.pos, yaw, new THREE.Color(0xffe6b0), 1.6, 0.35);
    for (const d of dummiesInArc(2.9, 2.2)) hitDummy(d, 12 + Math.floor(Math.random() * 6), '#fff2c8', true);
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
  fx.burst(player.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), new THREE.Color(0xd8c8a0), 12, 2, 0.4, 0.3, 0.3);
}
function useAbility(i) {
  if (G.dialog !== null) return;
  if (G.cds[i] > 0) return;
  if (i === 4) {
    if (G.potions <= 0) { toast('No potions left'); return; }
    G.potions--; G.hp = G.hpMax; G.mp = Math.min(G.mpMax, G.mp + 40);
    hud.els.potion.textContent = G.potions;
    G.cds[4] = G.cdMax[4];
    fx.potion(player.pos);
    return;
  }
  if (G.mp < G.cost[i]) { toast('Not enough mana'); return; }
  G.mp -= G.cost[i];
  G.cds[i] = G.cdMax[i];
  const f = forward();
  const chest = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
  if (i === 0) {
    hero.userData.attack(1);
    setTimeout(() => {
      fx.slash(player.pos, player.yaw);
      for (const d of dummiesInArc(3.8, 2.4)) hitDummy(d, 34 + Math.floor(Math.random() * 8), '#ffb347');
    }, 250);
  } else if (i === 1) {
    hero.userData.cast();
    const d = nearestDummy(16);
    const end = d ? new THREE.Vector3(d.x, 1.7, d.z) : chest.clone().addScaledVector(f, 9);
    setTimeout(() => { fx.bolt(chest.clone().addScaledVector(f, 0.5).add(new THREE.Vector3(0, 0.4, 0)), end); if (d) hitDummy(d, 48 + Math.floor(Math.random() * 10), '#8fd8ff'); }, 120);
  } else if (i === 2) {
    hero.userData.cast();
    const hitSet = new Set();
    fx.fireball(chest.clone().addScaledVector(f, 0.8), f, 16, (p) => {
      for (const d of world.dummies) {
        if (!hitSet.has(d) && Math.hypot(d.x - p.x, d.z - p.z) < 1.0) { hitSet.add(d); hitDummy(d, 41 + Math.floor(Math.random() * 9), '#ff9a3a'); return true; }
      }
      return false;
    });
  } else if (i === 3) {
    hero.userData.cast();
    fx.vortex(player.pos.clone());
    for (const d of world.dummies) if (Math.hypot(d.x - player.pos.x, d.z - player.pos.z) < 5) hitDummy(d, 27 + Math.floor(Math.random() * 6), '#8fd8ff');
  }
  if (!G.talked) { toast('Talk to Master Ryn first'); return; }
  if (G.ability < 1) { G.ability = 1; updateQuestHUD(); toast('Quest updated: Use an Ability ✓'); checkFinished(); }
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
canvas.addEventListener('pointerdown', (e) => {
  if (G.dialog !== null) return;
  canvas.setPointerCapture(e.pointerId);
  if (e.clientX < window.innerWidth * 0.45 && e.pointerType !== 'mouse') stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
  else look = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
});
canvas.addEventListener('pointermove', (e) => {
  if (stick && e.pointerId === stick.id) {
    const R = 55;
    let dx = (e.clientX - stick.x) / R, dy = -(e.clientY - stick.y) / R;
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; stick.x = e.clientX - dx * R; stick.y = e.clientY + dy * R; }
    moveInput.set(dx, dy);
  } else if (look && e.pointerId === look.id) {
    const dx = e.clientX - look.x, dy = e.clientY - look.y;
    look.x = e.clientX; look.y = e.clientY; look.moved += Math.abs(dx) + Math.abs(dy);
    const k = e.pointerType === 'mouse' ? 0.005 : 0.008;
    cam.yaw -= dx * k;
    cam.pitch = clamp(cam.pitch + dy * k * 0.7, -0.15, 0.85);
  }
});
function endPointer(e) {
  if (stick && e.pointerId === stick.id) { stick = null; moveInput.set(0, 0); }
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
  const n = '12345'.indexOf(e.key); if (n >= 0) useAbility(n);
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
hud.els.menuBtns.forEach((b, i) => btn(b, () => toast(`${menuNames[i]}: not in this prototype`)));
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
  const want = player.pos.clone().add(new THREE.Vector3(0, 1.95, 0)).addScaledVector(right, 0.85);
  if (snap) camTarget.copy(want); else camTarget.lerp(want, 1 - Math.exp(-dt * 10));
  const cp = Math.cos(cam.pitch);
  const off = new THREE.Vector3(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp).multiplyScalar(cam.dist);
  const pos = camTarget.clone().add(off);
  const floor = L.groundH(pos.x, pos.z) + 0.6;
  if (pos.y < floor) pos.y = floor;
  camera.position.copy(pos);
  camera.lookAt(camTarget.x, camTarget.y - 0.2 + cam.pitch * 0.4, camTarget.z);
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
  const canTalk = nearRyn() && G.dialog === null;
  talk.style.display = canTalk && !SHOT ? 'block' : 'none';
  if (canTalk) { const p = project(new THREE.Vector3(L.RYN.x, 1.0, L.RYN.z)); talk.style.left = p.x + 'px'; talk.style.top = p.y + 'px'; }
  for (let i = dmgs.length - 1; i >= 0; i--) {
    const d = dmgs[i]; d.age += dt; d.p.y += dt * 1.2;
    const p = project(d.p);
    d.el.style.left = p.x + 'px'; d.el.style.top = p.y + 'px';
    d.el.style.opacity = String(1 - Math.max(0, d.age - 0.5) / 0.5);
    d.el.style.transform = `translate(-50%,-50%) scale(${1 + Math.max(0, 0.15 - d.age) * 3})`;
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
  T += dt;
  for (const u of world.updaters) u(T);
  // lantern flicker
  for (const l of world.lanterns) { const pl = l.children.find((c) => c.isPointLight); if (pl) pl.intensity = 6 + Math.sin(T * 9 + l.position.z) * 0.5; }
  // dummies
  for (const d of world.dummies) {
    d.wobble = Math.max(0, d.wobble - dt * 1.6);
    d.body.rotation.x = Math.sin(T * 18) * 0.12 * d.wobble;
    d.body.rotation.z = Math.cos(T * 14) * 0.06 * d.wobble;
  }
  // path markers: pulse travelling toward the archway; hide those behind the player
  let nearest = 0, nd = 1e9;
  route.forEach((p, i) => { const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z); if (d < nd) { nd = d; nearest = i; } });
  markers.forEach((m, i) => {
    const ahead = i >= nearest - (SHOT ? 0 : 1);
    m.visible = ahead && !G.ended;
    const wave = 0.5 + 0.5 * Math.sin(T * 4 - i * 0.6);
    const sz = 0.32 + wave * 0.18;
    m.scale.set(sz, sz, 1);
    m.position.y = route[i].y + 0.08 + wave * 0.1;
    m.material.opacity = 0.65 + wave * 0.35;
  });

  if (!SHOT) movePlayer(dt); else { hero.position.copy(player.pos); hero.rotation.y = player.yaw; hero.userData.update(dt, 0); }
  ryn.userData.update(dt);
  // Ryn turns to face the hero when close
  const toHero = Math.atan2(player.pos.x - ryn.position.x, player.pos.z - ryn.position.z);
  const wantRyn = player.pos.distanceTo(ryn.position) < 6 ? toHero : 0.9;
  let dr = wantRyn - ryn.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
  ryn.rotation.y += dr * (1 - Math.exp(-dt * 3));
  updateCamera(dt, SHOT || T < 0.1);
  fx.update(dt);

  // stats, cooldowns
  G.mp = Math.min(G.mpMax, G.mp + dt * 4);
  G.atkCd = Math.max(0, G.atkCd - dt); G.dodgeCd = Math.max(0, G.dodgeCd - dt);
  for (let i = 0; i < 5; i++) {
    G.cds[i] = Math.max(0, G.cds[i] - dt);
    hud.setCooldown(i, G.cds[i] / G.cdMax[i], G.cds[i], i < 4 ? G.mp < G.cost[i] : G.potions <= 0);
  }
  hud.setBars(G.hp, G.hpMax, G.mp, G.mpMax);
  G.clock += dt / 10;
  hud.setClock(G.clock);
  const target = world.archPos;
  hud.drawCompass(headingDeg(), bearingTo(target), player.pos.distanceTo(target));
  if (mapImg.width) drawMinimap();
  updateWorldHUD(dt);
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) document.getElementById('toast').style.display = 'none'; }
  if (G.finished && !G.ended && Math.hypot(player.pos.x - L.ARCH.x, player.pos.z - L.ARCH.z) < 2.2) {
    G.ended = true; document.getElementById('fin').style.display = 'flex';
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

loaded.then(() => {
  renderMinimap();
  const ld = document.getElementById('loading');
  ld.style.opacity = '0';
  setTimeout(() => ld.remove(), 650);
  window.__ready = true;
});
frame();
window.__game = { G, player, cam, camera, scene, renderer, L, resize };
