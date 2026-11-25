// Straw bandits: procedural figures with a simple melee AI.
// Every attack is telegraphed (red glow, a ground wedge and a sound) and only one bandit attacks at a time.
import * as THREE from 'three';
import * as L from './layout.js';
import { clamp, lerp } from './util.js';

const STRAW = new THREE.MeshStandardMaterial({ color: 0xd9b45a, roughness: 1 });
const SACK = new THREE.MeshStandardMaterial({ color: 0xb59670, roughness: 1 });
const CLOTH = new THREE.MeshStandardMaterial({ color: 0x7a1e1e, roughness: 0.9 });
const WOOD = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 1 });

function makeBandit() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const mats = [];
  const M = (geo, mat, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat.clone()); m.position.set(x, y, z); m.castShadow = true; parent.add(m);
    mats.push(m.material); m.material.emissive = new THREE.Color(0); return m;
  };
  // legs: bundles of straw
  for (const s of [-1, 1]) { const l = M(new THREE.CylinderGeometry(0.09, 0.13, 0.8, 7), STRAW, s * 0.14, 0.4, 0); l.rotation.z = s * 0.06; }
  M(new THREE.CylinderGeometry(0.26, 0.2, 0.7, 9), STRAW, 0, 1.12, 0); // torso
  const belt = M(new THREE.CylinderGeometry(0.22, 0.22, 0.09, 9), DARK, 0, 0.84, 0);
  belt.scale.set(1.02, 1, 1.02);
  M(new THREE.CylinderGeometry(0.29, 0.27, 0.16, 9), CLOTH, 0, 1.42, 0); // scarf
  const head = M(new THREE.SphereGeometry(0.21, 12, 10), SACK, 0, 1.68, 0);
  head.scale.set(1, 1.1, 1);
  M(new THREE.ConeGeometry(0.23, 0.28, 10), CLOTH, 0, 1.92, -0.02); // hood tip
  for (const s of [-1, 1]) M(new THREE.SphereGeometry(0.035, 6, 5), DARK, s * 0.08, 1.72, 0.19); // eyes
  // arms
  const armL = new THREE.Group(); armL.position.set(-0.3, 1.35, 0); body.add(armL);
  M(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 6), STRAW, 0, -0.28, 0, armL);
  const armR = new THREE.Group(); armR.position.set(0.3, 1.35, 0); body.add(armR);
  M(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 6), STRAW, 0, -0.28, 0, armR);
  // crude wooden blade
  const blade = M(new THREE.BoxGeometry(0.08, 0.85, 0.03), WOOD, 0, -0.85, 0.12, armR);
  blade.rotation.x = 0.3;
  armR.rotation.x = -0.4;
  g.userData = { body, armL, armR, mats };
  return g;
}

export function createEnemies(scene, fx, hooks) {
  const list = [];
  let token = null; // the bandit allowed to attack right now
  const wedgeGeo = new THREE.CircleGeometry(1, 24, -0.55, 1.1);
  function spawn(x, z, delay = 0) {
    const mesh = makeBandit();
    mesh.position.set(x, L.groundH(x, z), z);
    mesh.visible = false;
    scene.add(mesh);
    const wedge = new THREE.Mesh(wedgeGeo, new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    wedge.rotation.x = -Math.PI / 2; wedge.visible = false; scene.add(wedge);
    const e = { isEnemy: true, mesh, wedge, x, z, home: [x, z], yaw: 0, hp: 60, hpMax: 60, state: 'spawn', t: -delay, flash: 0, stagger: 0, dead: false, deadT: 0, hpEl: null, phase: Math.random() * 6 };
    const bar = document.createElement('div'); bar.className = 'ehp'; bar.innerHTML = '<div></div>'; bar.style.display = 'none';
    document.getElementById('hud').appendChild(bar); e.hpEl = bar;
    list.push(e);
    return e;
  }
  function clear() {
    for (const e of list) { scene.remove(e.mesh); scene.remove(e.wedge); e.hpEl.remove(); }
    list.length = 0; token = null;
  }
  function alive() { return list.filter((e) => !e.dead && e.state !== 'spawn'); }
  function setGlow(e, r, g, b, k) { for (const m of e.mesh.userData.mats) { m.emissive.setRGB(r, g, b); m.emissiveIntensity = k; } }

  function damage(e, amount, heavy) {
    if (e.dead) return false;
    e.hp -= amount; e.flash = 1;
    // every hit staggers: cancels a windup and pushes the bandit back a little
    if (e.state === 'windup' || e.state === 'lunge') { e.state = 'recover'; e.t = 0; e.wedge.visible = false; if (token === e) token = null; }
    e.stagger = heavy ? 0.5 : 0.3;
    const p = hooks.playerPos();
    const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) || 1;
    tryMove(e, dx / d * (heavy ? 0.9 : 0.5), dz / d * (heavy ? 0.9 : 0.5));
    if (e.hp <= 0) {
      e.dead = true; e.deadT = 0; e.wedge.visible = false; e.hpEl.style.display = 'none';
      if (token === e) token = null;
      fx.burst(new THREE.Vector3(e.x, 1.0, e.z), new THREE.Color(0xe8c870), 26, 3, 0.8, 0.5, 0.6);
      hooks.onDeath(e);
    }
    return true;
  }
  function tryMove(e, dx, dz) {
    const nx = e.x + dx, nz = e.z + dz;
    if (L.pondSD(nx, nz) < 0.5) return;
    if (Math.abs(L.groundH(nx, nz) - L.groundH(e.x, e.z)) > 0.6) return;
    e.x = nx; e.z = nz;
  }

  function update(dt, T, project) {
    const p = hooks.playerPos();
    const live = alive();
    for (const e of list) {
      const m = e.mesh, ud = m.userData;
      if (e.dead) {
        e.deadT += dt;
        m.rotation.x = -Math.min(1, e.deadT * 3) * 1.4;
        m.position.y = L.groundH(e.x, e.z) - Math.max(0, e.deadT - 0.6) * 0.8;
        if (e.deadT > 1.6) m.visible = false;
        continue;
      }
      if (e.state === 'spawn') {
        e.t += dt;
        if (e.t >= 0) {
          m.visible = true; e.state = 'approach'; e.t = 0;
          fx.burst(new THREE.Vector3(e.x, 0.6, e.z), new THREE.Color(0x9a8a78), 22, 2.2, 0.9, 0.7, 0.8);
        }
        continue;
      }
      const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz);
      const face = Math.atan2(dx, dz);
      let dy = face - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      e.stagger = Math.max(0, e.stagger - dt);
      const slow = e.slowT > 0 ? 0.6 : 1; e.slowT = Math.max(0, (e.slowT || 0) - dt);
      if (e.state !== 'lunge') e.yaw += dy * (1 - Math.exp(-dt * (e.state === 'windup' ? 3 : 7)));
      e.t += dt;
      let moving = 0;
      if (e.stagger > 0) {
        // reel back
      } else if (e.state === 'approach') {
        // the token holder closes in; the others circle at a distance
        if (!token && dist < 6) token = e;
        const want = token === e ? 1.7 : 3.6;
        if (dist > want + 0.2) {
          const sp = (token === e ? 3.2 : 2.4) * dt * slow;
          tryMove(e, dx / dist * sp, dz / dist * sp); moving = 1;
        } else if (token !== e) {
          // strafe around the hero
          const sp = 1.2 * dt * (Math.sin(e.phase) > 0 ? 1 : -1);
          tryMove(e, -dz / dist * sp, dx / dist * sp); moving = 0.6;
        }
        // keep apart from each other
        for (const o of live) if (o !== e) {
          const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz);
          if (od < 1.2 && od > 1e-3) tryMove(e, ox / od * dt * 1.5, oz / od * dt * 1.5);
        }
        if (token === e && dist < 2.1 && e.t > 0.4) { e.state = 'windup'; e.t = 0; hooks.windup(e); }
      } else if (e.state === 'windup') {
        const k = Math.min(1, e.t / 0.8);
        setGlow(e, 1, 0.1, 0.05, 0.2 + 0.8 * k);
        ud.armR.rotation.x = lerp(-0.4, -2.6, k);
        e.wedge.visible = true;
        e.wedge.position.set(e.x, L.groundH(e.x, e.z) + 0.08, e.z);
        e.wedge.rotation.z = e.yaw - Math.PI / 2;
        const r = 2.3 * (0.4 + 0.6 * k); e.wedge.scale.set(r, r, 1);
        e.wedge.material.opacity = 0.3 + 0.35 * Math.abs(Math.sin(e.t * 12));
        if (e.t >= 0.8) { e.state = 'lunge'; e.t = 0; e.hitDone = false; hooks.whoosh(); }
      } else if (e.state === 'lunge') {
        e.wedge.visible = false;
        setGlow(e, 1, 1, 1, 0);
        ud.armR.rotation.x = lerp(-2.6, 0.9, Math.min(1, e.t / 0.15));
        if (e.t < 0.18) tryMove(e, Math.sin(e.yaw) * 6 * dt, Math.cos(e.yaw) * 6 * dt);
        if (!e.hitDone && e.t > 0.1) {
          e.hitDone = true;
          const fx2 = p.x - e.x, fz2 = p.z - e.z, d2 = Math.hypot(fx2, fz2);
          const inFront = (fx2 * Math.sin(e.yaw) + fz2 * Math.cos(e.yaw)) / (d2 || 1) > 0.3;
          if (d2 < 2.2 && inFront) hooks.hitPlayer(e, 18);
        }
        if (e.t > 0.3) { e.state = 'recover'; e.t = 0; }
      } else if (e.state === 'recover') {
        ud.armR.rotation.x = lerp(ud.armR.rotation.x, -0.4, 1 - Math.exp(-dt * 6));
        if (e.t > 0.9) { e.state = 'approach'; e.t = 0; if (token === e) token = null; }
      }
      // pose
      e.flash = Math.max(0, e.flash - dt * 7);
      if (e.state !== 'windup') for (const mm of ud.mats) { mm.emissive.setRGB(1, 1, 1); mm.emissiveIntensity = e.flash * 0.9; }
      m.position.set(e.x, L.groundH(e.x, e.z), e.z);
      m.rotation.y = e.yaw;
      ud.body.rotation.x = e.stagger > 0 ? -0.35 * (e.stagger / 0.5) : 0;
      const bob = moving ? Math.abs(Math.sin(T * 9 + e.phase)) * 0.06 : Math.sin(T * 2 + e.phase) * 0.01;
      ud.body.position.y = bob;
      ud.armL.rotation.x = moving ? Math.sin(T * 9 + e.phase) * 0.6 : 0;
      // HP bar
      const sp = project(new THREE.Vector3(e.x, L.groundH(e.x, e.z) + 2.25, e.z));
      const show = sp.vis && dist < 22 && e.hp < e.hpMax + 1;
      e.hpEl.style.display = show ? 'block' : 'none';
      if (show) { e.hpEl.style.left = sp.x + 'px'; e.hpEl.style.top = sp.y + 'px'; e.hpEl.firstChild.style.width = clamp(e.hp / e.hpMax, 0, 1) * 100 + '%'; }
    }
  }
  function reset() {
    for (const e of list) if (!e.dead) { e.hp = e.hpMax; e.x = e.home[0]; e.z = e.home[1]; e.state = 'approach'; e.t = 0; e.wedge.visible = false; }
    token = null;
  }
  return { list, spawn, clear, alive, damage, update, reset, get remaining() { return list.filter((e) => !e.dead).length; } };
}
