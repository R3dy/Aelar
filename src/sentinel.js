// The Stone Sentinel: a procedural rock golem mini boss with telegraphed slam, sweep and (phase 2) shockwave attacks.
import * as THREE from 'three';
import * as L from './layout.js';
import { lumpy, boxUV, clamp, lerp, mulberry } from './util.js';
import { TEX } from './world.js';

const HOME = { x: 0.6, z: -12.6 }; // the open ground at the foot of the stairs

function rockMat() {
  return new THREE.MeshStandardMaterial({ map: TEX.cliff, color: 0xb8b2a8, roughness: 0.95, emissive: new THREE.Color(0xff6a10), emissiveIntensity: 0 });
}
function crackTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  const R = mulberry(9);
  g.strokeStyle = '#fff'; g.lineCap = 'round';
  for (let k = 0; k < 14; k++) {
    let x = R() * 256, y = R() * 256; g.lineWidth = 1.5 + R() * 3;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (R() - 0.5) * 60; y += (R() - 0.5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function makeGolem() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const mat = rockMat(); mat.emissiveMap = crackTexture();
  const parts = [];
  const rock = (r, sx, sy, sz, x, y, z, seed, parent = body) => {
    let g = new THREE.IcosahedronGeometry(r, 2); g = lumpy(g, r * 0.18, 1.6 / r, seed);
    g.scale(sx, sy, sz);
    g = boxUV(g, 0.9, new THREE.Vector3(seed * 3.1, 0, seed * 1.7), true);
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
    parent.add(m); parts.push(m); return m;
  };
  // legs
  for (const s of [-1, 1]) { rock(0.42, 1, 1.5, 1, s * 0.5, 0.6, 0, 3 + s); rock(0.36, 1.2, 0.6, 1.4, s * 0.5, 0.18, 0.12, 5 + s); }
  rock(0.8, 1.35, 1, 1, 0, 1.7, 0, 1);      // hips + torso
  rock(0.95, 1.45, 1.05, 1.05, 0, 2.6, 0, 2); // chest
  const head = rock(0.42, 1.1, 0.9, 1, 0, 3.55, 0.25, 7);
  // glowing eyes and chest rune
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x7fd8ff, toneMapped: false });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat); e.position.set(s * 0.16, 3.6, 0.62); body.add(e); }
  const rune = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0x7fd8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  rune.scale.set(0.9, 0.9, 1); rune.position.set(0, 2.65, 1.0); body.add(rune);
  // arms: shoulder pivot -> upper arm -> fist
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group(); sh.position.set(s * 1.35, 3.0, 0); body.add(sh);
    rock(0.5, 1, 1, 1, 0, 0, 0, 11 + s, sh);
    rock(0.38, 0.9, 1.6, 0.9, s * 0.1, -0.8, 0, 13 + s, sh);
    const fist = rock(0.52, 1.1, 1, 1.1, s * 0.12, -1.75, 0.1, 15 + s, sh);
    return { sh, fist, s };
  });
  root.userData = { body, arms, head, mat, eyeMat, rune, parts };
  return root;
}

export function createSentinel(scene, fx, hooks) {
  const mesh = makeGolem();
  mesh.visible = false; scene.add(mesh);
  const decalMat = () => new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const circle = new THREE.Mesh(new THREE.CircleGeometry(1, 40), decalMat()); circle.rotation.x = -Math.PI / 2; circle.visible = false; scene.add(circle);
  const wedge = new THREE.Mesh(new THREE.CircleGeometry(1, 40, -1.3, 2.6), decalMat()); wedge.rotation.x = -Math.PI / 2; wedge.visible = false; scene.add(wedge);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);

  const S = {
    isEnemy: true, isBoss: true, mesh, x: HOME.x, z: HOME.z - 7, yaw: 0, hp: 600, hpMax: 600,
    state: 'dormant', t: 0, cd: 1.5, phase: 1, flash: 0, dead: false, deadT: 0, atk: null, hitDone: false,
    impact: new THREE.Vector3(), wave: null,
  };
  const ud = mesh.userData;
  const gy = (x, z) => L.walkH(x, z) ?? L.groundH(x, z);

  function wake() {
    S.state = 'intro'; S.t = 0; mesh.visible = true;
    S.x = 0.25; S.z = -20.2; S.y = L.PLAT; S.hp = S.hpMax; S.phase = 1; S.dead = false;
  }
  function reset() {
    if (S.dead) return;
    S.x = HOME.x; S.z = HOME.z - 1; S.hp = S.hpMax; S.phase = 1; S.state = 'idle'; S.t = 0; S.cd = 2;
    circle.visible = wedge.visible = ring.visible = false; S.wave = null; setPhaseLook();
  }
  function setPhaseLook() {
    ud.eyeMat.color.set(S.phase === 2 ? 0xff7a20 : 0x7fd8ff);
    ud.rune.material.color.set(S.phase === 2 ? 0xff7a20 : 0x7fd8ff);
  }
  function damage(_, amount, heavy) {
    if (S.dead || S.state === 'intro' || S.state === 'dormant') return false;
    S.hp = Math.max(0, S.hp - amount); S.flash = 1;
    if (S.phase === 1 && S.hp < S.hpMax / 2) { S.phase = 2; setPhaseLook(); hooks.onPhase2(); }
    if (S.hp <= 0) {
      S.dead = true; S.state = 'dying'; S.t = 0;
      circle.visible = wedge.visible = ring.visible = false; S.wave = null;
      hooks.onDefeat(S);
    }
    return true;
  }

  function startAttack(dist) {
    const p = hooks.playerPos();
    const slam = dist > 2.6 || Math.random() < 0.5;
    S.atk = slam ? 'slam' : 'sweep';
    S.state = 'windup'; S.t = 0; S.hitDone = false;
    S.wind = slam ? (S.phase === 2 ? 0.85 : 1.0) : (S.phase === 2 ? 0.65 : 0.8);
    if (slam) {
      // aim at where the hero stands now (clamped to reach)
      const dx = p.x - S.x, dz = p.z - S.z, d = Math.hypot(dx, dz) || 1, r = Math.min(d, 2.8);
      S.impact.set(S.x + dx / d * r, 0, S.z + dz / d * r); S.impact.y = gy(S.impact.x, S.impact.z);
    }
    hooks.windup();
  }

  function update(dt, T) {
    if (S.state === 'dormant') return;
    const p = hooks.playerPos();
    const dx = p.x - S.x, dz = p.z - S.z, dist = Math.hypot(dx, dz);
    S.t += dt;
    S.flash = Math.max(0, S.flash - dt * 6);
    const pulse = S.phase === 2 ? 0.9 + 0.5 * Math.sin(T * 6) : 0.12;
    ud.mat.emissiveIntensity = pulse + S.flash * 1.5;
    ud.mat.emissive.set(S.flash > 0.3 ? 0xffffff : 0xff6a10);
    let walking = 0;
    const faceTo = (spd) => { let d = Math.atan2(dx, dz) - S.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); S.yaw += d * (1 - Math.exp(-dt * spd)); };
    const A = ud.arms;
    if (S.state === 'intro') {
      // leap down from the archway to the foot of the stairs
      const k = clamp(S.t / 1.4, 0, 1);
      const sx = 0.25, sz = -20.2;
      S.x = lerp(sx, HOME.x, k); S.z = lerp(sz, HOME.z, k);
      S.y = lerp(L.PLAT, gy(HOME.x, HOME.z), k) + Math.sin(k * Math.PI) * 3;
      S.yaw = 0;
      if (S.t >= 1.4 && !S.landed) { S.landed = true; hooks.land(new THREE.Vector3(S.x, gy(S.x, S.z), S.z)); }
      if (S.t > 2.4) { S.state = 'idle'; S.t = 0; S.cd = 1.0; }
    } else if (S.state === 'idle') {
      faceTo(3);
      S.cd -= dt;
      const reach = 3.0;
      if (dist > reach) {
        const sp = (S.phase === 2 ? 2.1 : 1.6) * dt;
        const nx = S.x + dx / dist * sp, nz = S.z + dz / dist * sp;
        if (L.walkH(nx, nz) !== null && L.pondSD(nx, nz) > 0.8) { S.x = nx; S.z = nz; walking = 1; }
      }
      if (S.cd <= 0 && dist < 4.2) startAttack(dist);
    } else if (S.state === 'windup') {
      const k = clamp(S.t / S.wind, 0, 1);
      if (S.atk === 'slam') {
        faceTo(2);
        for (const a of A) { a.sh.rotation.x = lerp(0, -2.8, k); a.sh.rotation.z = -a.s * 0.25 * k; }
        circle.visible = true; circle.position.set(S.impact.x, S.impact.y + 0.06, S.impact.z);
        const r = 2.2 * (0.3 + 0.7 * k); circle.scale.set(r, r, 1);
        circle.material.opacity = 0.3 + 0.35 * Math.abs(Math.sin(S.t * 10));
      } else {
        faceTo(4);
        A[1].sh.rotation.y = lerp(0, 1.4, k); A[1].sh.rotation.x = -0.6 * k; ud.body.rotation.y = 0.4 * k;
        wedge.visible = true; wedge.position.set(S.x, gy(S.x, S.z) + 0.07, S.z);
        wedge.rotation.z = S.yaw - Math.PI / 2;
        const r = 3.7 * (0.4 + 0.6 * k); wedge.scale.set(r, r, 1);
        wedge.material.opacity = 0.3 + 0.35 * Math.abs(Math.sin(S.t * 12));
      }
      if (S.t >= S.wind) { S.state = 'strike'; S.t = 0; hooks.whoosh(); }
    } else if (S.state === 'strike') {
      if (S.atk === 'slam') {
        for (const a of A) a.sh.rotation.x = lerp(-2.8, -0.9, clamp(S.t / 0.12, 0, 1));
        if (!S.hitDone && S.t > 0.1) {
          S.hitDone = true; circle.visible = false;
          hooks.slam(S.impact.clone());
          if (Math.hypot(p.x - S.impact.x, p.z - S.impact.z) < 2.4) hooks.hitPlayer(40);
          if (S.phase === 2) S.wave = { c: S.impact.clone(), r: 0.6, hit: false };
        }
        if (S.t > 0.25) { S.state = 'stuck'; S.t = 0; } // fists in the ground: the window to punish it
      } else {
        A[1].sh.rotation.y = lerp(1.4, -1.6, clamp(S.t / 0.18, 0, 1)); ud.body.rotation.y = lerp(0.4, -0.5, clamp(S.t / 0.18, 0, 1));
        if (!S.hitDone && S.t > 0.08) {
          S.hitDone = true; wedge.visible = false;
          const fwd = (dx * Math.sin(S.yaw) + dz * Math.cos(S.yaw)) / (dist || 1);
          if (dist < 3.7 && fwd > Math.cos(1.3)) hooks.hitPlayer(28);
        }
        if (S.t > 0.5) { S.state = 'recover'; S.t = 0; }
      }
    } else if (S.state === 'stuck') {
      if (S.t > (S.phase === 2 ? 1.1 : 1.5)) { S.state = 'recover'; S.t = 0; }
    } else if (S.state === 'recover') {
      const k = clamp(S.t / 0.5, 0, 1);
      for (const a of A) { a.sh.rotation.x = lerp(a.sh.rotation.x, 0, k); a.sh.rotation.y = lerp(a.sh.rotation.y, 0, k); a.sh.rotation.z = lerp(a.sh.rotation.z, 0, k); }
      ud.body.rotation.y = lerp(ud.body.rotation.y, 0, k);
      if (S.t > 0.5) { S.state = 'idle'; S.t = 0; S.cd = S.phase === 2 ? 0.7 : 1.2; }
    } else if (S.state === 'dying') {
      // crumble: rocks tumble apart and sink
      for (const [i, m] of ud.parts.entries()) {
        if (!m.userData.v) m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3);
        const v = m.userData.v; v.y -= 9 * dt;
        m.position.addScaledVector(v, dt * 0.5);
        if (m.position.y < -0.5) { m.position.y = -0.5; v.set(0, 0, 0); }
        m.rotation.x += dt * (i % 3); m.rotation.z += dt * ((i + 1) % 2);
      }
      ud.eyeMat.color.set(0x000000); ud.rune.visible = false;
      ud.mat.emissiveIntensity = Math.max(0, 1.5 - S.t);
      if (S.t > 2.4) { mesh.position.y -= dt * 0.6; }
      if (S.t > 5) { mesh.visible = false; S.state = 'gone'; }
    }
    // shockwave ring (phase 2): expands from the slam; dodge through it
    if (S.wave) {
      const w = S.wave; w.r += dt * 6.5;
      ring.visible = true; ring.position.set(w.c.x, w.c.y + 0.1, w.c.z); ring.scale.set(w.r, w.r, 1);
      ring.material.opacity = Math.max(0, 0.9 - w.r / 10);
      const pd = Math.hypot(p.x - w.c.x, p.z - w.c.z);
      if (!w.hit && Math.abs(pd - w.r) < 0.45) { w.hit = true; hooks.hitPlayer(30); }
      if (w.r > 9) { S.wave = null; ring.visible = false; }
    }
    if (S.state !== 'dying' && S.state !== 'gone') {
      mesh.position.set(S.x, S.state === 'intro' ? S.y : gy(S.x, S.z), S.z);
      mesh.rotation.y = S.yaw;
      ud.body.position.y = walking ? Math.abs(Math.sin(T * 4)) * 0.08 : Math.sin(T * 1.5) * 0.03;
      ud.body.rotation.z = walking ? Math.sin(T * 4) * 0.05 : 0;
    }
  }
  return { S, wake, reset, damage, update, get active() { return !S.dead && S.state !== 'dormant' && S.state !== 'intro'; }, get x() { return S.x; }, get z() { return S.z; } };
}
