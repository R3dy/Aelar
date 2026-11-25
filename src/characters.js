// Placeholder characters built from primitives, with procedural animation.
// They are to be swapped for image-to-3D models when that step happens.
import * as THREE from 'three';
import { canvasTex, lumpy, clamp, lerp } from './util.js';

const std = (color, rough = 0.7, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

function capsule(r, len, mat, segs = 10) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, segs), mat);
  m.castShadow = true;
  return m;
}
function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

function capeTexture() {
  return canvasTex(256, 384, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#8c1820'); g.addColorStop(0.7, '#7a121b'); g.addColorStop(1, '#5c0d14');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // pale emblem
    c.strokeStyle = 'rgba(240,215,215,0.92)'; c.lineWidth = 7; c.lineCap = 'round';
    c.save(); c.translate(w / 2, h * 0.36);
    c.beginPath(); c.moveTo(0, -55); c.lineTo(0, 55);
    c.moveTo(-42, -20); c.quadraticCurveTo(-15, 5, 0, 40); c.quadraticCurveTo(15, 5, 42, -20);
    c.moveTo(-28, -45); c.lineTo(-12, -15); c.moveTo(28, -45); c.lineTo(12, -15);
    c.stroke(); c.restore();
    // gold ornament near hem
    c.fillStyle = 'rgba(210,140,40,0.55)';
    for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(14 + i * 29, h * 0.84 + (i % 2) * 10, 9, 0, 7); c.fill(); }
    // tattered hem
    c.globalCompositeOperation = 'destination-out';
    for (let x = 0; x < w; x += 10) {
      const d = 12 + Math.random() * 42;
      c.beginPath(); c.moveTo(x, h); c.lineTo(x + 5, h - d); c.lineTo(x + 10, h); c.fill();
    }
    for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(Math.random() * w, h * (0.8 + Math.random() * 0.12), 4 + Math.random() * 5, 0, 7); c.fill(); }
  });
}

function makeSword() {
  const g = new THREE.Group();
  const steel = std(0x9aa3ad, 0.3, 0.85);
  const gold = std(0xd8a640, 0.35, 0.8, { emissive: 0x3a2000, emissiveIntensity: 0.4 });
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.075, 0); bladeShape.lineTo(0.075, 0); bladeShape.lineTo(0.07, 1.15); bladeShape.lineTo(0, 1.32); bladeShape.lineTo(-0.07, 1.15); bladeShape.closePath();
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(bladeShape, { depth: 0.025, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 1 }), steel);
  blade.position.z = -0.012; blade.castShadow = true; g.add(blade);
  const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.0, 0.05), new THREE.MeshBasicMaterial({ color: 0xffc040, toneMapped: false }));
  inlay.position.y = 0.55; g.add(inlay);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.09), gold); guard.castShadow = true; g.add(guard);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), std(0x2a7fff, 0.2, 0.3, { emissive: 0x1050ff, emissiveIntensity: 0.6 })); gem.position.z = 0.05; g.add(gem);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.3, 8), std(0x4a2a18, 0.8)); grip.position.y = -0.17; g.add(grip);
  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), gold); pommel.position.y = -0.35; g.add(pommel);
  return g;
}

export function makeHero() {
  const root = new THREE.Group();
  const M = {
    armor: std(0x2e3036, 0.45, 0.55),
    armorHi: std(0x3d4048, 0.4, 0.6),
    leather: std(0x5b3b26, 0.75),
    leatherDark: std(0x3a2618, 0.8),
    skin: std(0xc58a62, 0.65),
    hair: std(0x161214, 0.6),
    pants: std(0x2a2a30, 0.8),
    gold: std(0xd0a040, 0.35, 0.8),
    red: std(0x8a1720, 0.8),
  };
  const hips = pivot(root, 0, 1.0, 0);
  // legs
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = pivot(hips, s * 0.13, 0, 0);
    const thigh = capsule(0.1, 0.32, M.pants); thigh.position.y = -0.24; hip.add(thigh);
    const knee = pivot(hip, 0, -0.47, 0);
    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), M.armor); kneeCap.position.z = 0.06; knee.add(kneeCap);
    const shin = capsule(0.095, 0.3, M.leatherDark); shin.position.y = -0.22; knee.add(shin);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.28), M.leatherDark); boot.position.set(0, -0.46, 0.05); boot.castShadow = true; knee.add(boot);
    legs.push({ hip, knee });
  }
  // armoured skirt
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.36, 10, 1, true), std(0x2b2b31, 0.6, 0.3, { side: THREE.DoubleSide }));
  skirt.position.y = -0.12; skirt.castShadow = true; hips.add(skirt);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 16), M.leather); belt.rotation.x = Math.PI / 2; belt.position.y = 0.05; hips.add(belt);
  for (const s of [-1, 1]) { const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.07), M.leather); pouch.position.set(s * 0.18, -0.02, 0.15); pouch.castShadow = true; hips.add(pouch); }
  // torso
  const spine = pivot(hips, 0, 0.08, 0);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.5, 10), M.armor);
  torso.scale.z = 0.72; torso.position.y = 0.28; torso.castShadow = true; spine.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.armorHi);
  chest.scale.set(1, 0.5, 0.75); chest.position.y = 0.52; chest.castShadow = true; spine.add(chest);
  // cross straps
  for (const s of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.42), M.leather);
    strap.position.y = 0.3; strap.rotation.z = s * 0.6; strap.scale.z = 0.9; spine.add(strap);
  }
  // hood/scarf around the neck
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.08, 8, 14), M.red);
  hood.rotation.x = Math.PI / 2; hood.position.y = 0.6; hood.castShadow = true; spine.add(hood);
  const neck = pivot(spine, 0, 0.62, 0);
  const head = new THREE.Group(); head.position.y = 0.16; neck.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), M.skin); skull.scale.set(0.95, 1.12, 1.02); skull.castShadow = true; head.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M.skin); jaw.position.set(0, -0.07, 0.03); jaw.scale.set(1, 0.8, 1); head.add(jaw);
  const hairG = lumpy(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), 0.03, 14, 3);
  const hair = new THREE.Mesh(hairG, M.hair); hair.position.set(0, 0.03, -0.012); hair.scale.set(1.02, 1.05, 1.06); hair.castShadow = true; head.add(hair);
  const back = lumpy(new THREE.SphereGeometry(0.13, 10, 8), 0.03, 12, 5);
  const hairBack = new THREE.Mesh(back, M.hair); hairBack.position.set(0, -0.02, -0.06); head.add(hairBack);
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), M.skin); ear.position.set(s * 0.125, -0.01, 0); head.add(ear); }
  // arms
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = pivot(spine, s * 0.33, 0.5, 0);
    const paul = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), M.armorHi);
    paul.scale.set(1.1, 0.8, 1.1); paul.position.y = 0.03; paul.castShadow = true; sh.add(paul);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.015, 4, 14), M.gold); trim.rotation.x = Math.PI / 2; trim.position.y = -0.01; sh.add(trim);
    const upper = capsule(0.075, 0.22, M.skin); upper.position.y = -0.18; sh.add(upper);
    const elbow = pivot(sh, 0, -0.36, 0);
    const fore = capsule(0.07, 0.2, M.leatherDark); fore.position.y = -0.15; elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), M.skin); hand.position.y = -0.32; elbow.add(hand);
    const handPivot = pivot(elbow, 0, -0.33, 0);
    arms.push({ sh, elbow, hand: handPivot, s });
  }
  // greatsword on the back: hilt over the right shoulder, tip toward the left hip
  const backSword = makeSword();
  backSword.position.set(0.05, 0.25, -0.24);
  backSword.rotation.z = -2.6;
  backSword.rotation.y = 0;
  spine.add(backSword);
  const handSword = makeSword();
  handSword.rotation.x = Math.PI / 2;
  handSword.position.y = -0.02;
  handSword.visible = false;
  arms[1].hand.add(handSword);
  // cape
  const capeGeo = new THREE.PlaneGeometry(0.72, 1.25, 6, 12);
  capeGeo.translate(0, -0.62, 0);
  const capeBase = Float32Array.from(capeGeo.attributes.position.array);
  const cape = new THREE.Mesh(capeGeo, new THREE.MeshStandardMaterial({ map: capeTexture(), side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.9 }));
  cape.position.set(0, 0.58, -0.17);
  cape.castShadow = true;
  spine.add(cape);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  const st = { phase: 0, speed: 0, attack: -1, attackDur: 0.5, cast: -1, dodge: -1, swingSide: 1, t: 0 };
  function update(dt, speed01) {
    st.t += dt;
    st.speed = lerp(st.speed, speed01, 1 - Math.exp(-dt * 10));
    const sp = st.speed;
    st.phase += dt * (4 + sp * 6.5) * (sp > 0.05 ? 1 : 0.0);
    const ph = st.phase;
    const swing = Math.sin(ph) * 0.75 * sp;
    legs[0].hip.rotation.x = swing; legs[1].hip.rotation.x = -swing;
    legs[0].knee.rotation.x = Math.max(0, -Math.sin(ph + 0.6)) * 1.1 * sp;
    legs[1].knee.rotation.x = Math.max(0, Math.sin(ph + 0.6)) * 1.1 * sp;
    hips.position.y = 1.0 + Math.abs(Math.cos(ph)) * 0.05 * sp - sp * 0.04;
    spine.rotation.x = sp * 0.12;
    const breathe = Math.sin(st.t * 1.8) * 0.012;
    spine.position.y = 0.08 + breathe;
    for (const a of arms) {
      a.sh.rotation.x = -Math.sin(ph) * 0.6 * sp * a.s;
      a.sh.rotation.z = a.s * (0.12 + Math.sin(st.t * 1.8) * 0.015);
      a.elbow.rotation.x = -0.25 - sp * 0.35;
    }
    // attack: right arm overhead slash with the sword in hand
    if (st.attack >= 0) {
      st.attack += dt;
      const t = st.attack / st.attackDur;
      const A = arms[1];
      const wind = clamp(t / 0.35, 0, 1), strike = clamp((t - 0.35) / 0.3, 0, 1), rec = clamp((t - 0.7) / 0.3, 0, 1);
      A.sh.rotation.x = lerp(lerp(0, -2.6, wind), 0.4, strike) * (1 - rec);
      A.sh.rotation.z = lerp(0.12, lerp(-0.4, 0.5, strike) * st.swingSide, wind) * (1 - rec) + 0.12 * rec;
      A.elbow.rotation.x = lerp(-0.3, -1.0, wind) * (1 - strike) - 0.2;
      spine.rotation.y = lerp(0, -0.5, wind) * (1 - strike) + lerp(0, 0.4, strike) * (1 - rec);
      arms[0].sh.rotation.x = -0.6 * wind * (1 - rec);
      handSword.visible = t < 0.95; backSword.visible = !handSword.visible;
      if (t >= 1) { st.attack = -1; spine.rotation.y = 0; }
    } else { spine.rotation.y = lerp(spine.rotation.y, 0, 0.2); }
    if (st.cast >= 0) {
      st.cast += dt;
      const t = clamp(st.cast / 0.5, 0, 1), k = Math.sin(t * Math.PI);
      arms[0].sh.rotation.x = -1.4 * k; arms[0].elbow.rotation.x = -0.1;
      arms[0].sh.rotation.z = -0.3 * k;
      if (t >= 1) st.cast = -1;
    }
    if (st.dodge >= 0) {
      st.dodge += dt;
      const t = clamp(st.dodge / 0.45, 0, 1);
      spine.rotation.x = Math.sin(t * Math.PI) * 0.7;
      hips.position.y -= Math.sin(t * Math.PI) * 0.35;
      for (const l of legs) l.knee.rotation.x = Math.sin(t * Math.PI) * 1.4;
      if (t >= 1) st.dodge = -1;
    }
    // cape: hangs back, flaps with speed
    const p = capeGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = capeBase[i * 3], y = capeBase[i * 3 + 1];
      const k = -y / 1.25;
      const flap = Math.sin(st.t * 3 + k * 4 + x * 3) * (0.03 + sp * 0.07) * k;
      p.setZ(i, -k * k * (0.12 + sp * 0.45) - Math.abs(x) * 0.15 * (1 - k) + flap);
      p.setY(i, y + k * k * sp * 0.2);
      p.setX(i, x * (1 + k * 0.25));
    }
    p.needsUpdate = true;
    capeGeo.computeVertexNormals();
  }
  root.userData = { update, st, attack(side) { st.attack = 0; st.swingSide = side; }, cast() { st.cast = 0; }, dodge() { st.dodge = 0; }, handSword };
  return root;
}

export function makeRyn() {
  const root = new THREE.Group();
  const robe = std(0xb5864a, 0.85), robeDark = std(0x8a6236, 0.85), sash = std(0x5a3a26, 0.8), skin = std(0xc8946e, 0.7), hairM = std(0xd8d4d0, 0.8), trim = std(0xe0a83a, 0.5, 0.4), inner = std(0xe8d6b0, 0.85);
  // robe body via lathe
  const prof = [[0.0, 0], [0.36, 0.0], [0.34, 0.3], [0.29, 0.75], [0.24, 1.05], [0.25, 1.3], [0.27, 1.38], [0.2, 1.46], [0.08, 1.5], [0, 1.5]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), robe);
  body.scale.z = 0.8; body.castShadow = true; root.add(body);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.355, 0.02, 4, 24), trim); hem.rotation.x = Math.PI / 2; hem.scale.y = 0.8; hem.position.y = 0.04; root.add(hem);
  // front panel and lapels
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.02), robeDark); panel.position.set(0, 0.5, 0.27); panel.rotation.x = -0.07; root.add(panel);
  const panelTrim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.025), trim); panelTrim.position.set(0, 0.07, 0.3); root.add(panelTrim);
  for (const s of [-1, 1]) { const lap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.03), inner); lap.position.set(s * 0.06, 1.28, 0.2); lap.rotation.z = s * 0.45; root.add(lap); }
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.05, 6, 20), sash); belt.rotation.x = Math.PI / 2; belt.scale.y = 0.8; belt.position.y = 0.95; root.add(belt);
  // folded arms
  const arms = new THREE.Group(); arms.position.set(0, 1.12, 0.2); root.add(arms);
  for (const s of [-1, 1]) {
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.25, 4, 8), robe); up.position.set(s * 0.25, 0.08, -0.06); up.rotation.x = 0.3; up.castShadow = true; arms.add(up);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.3, 4, 8), robe); fore.rotation.z = Math.PI / 2; fore.position.set(0, -0.02 + s * 0.04, 0.05 + s * 0.01); fore.castShadow = true; arms.add(fore);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.015, 4, 10), trim); cuff.rotation.y = Math.PI / 2; cuff.position.set(-s * 0.16, -0.02 + s * 0.04, 0.05); arms.add(cuff);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skin); hand.position.set(-s * 0.2, 0.0 + s * 0.04, 0.03); arms.add(hand);
  }
  for (const s of [-1, 1]) { const sh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), robe); sh.position.set(s * 0.26, 1.38, 0); sh.castShadow = true; root.add(sh); }
  // head
  const head = new THREE.Group(); head.position.set(0, 1.64, 0.02); root.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), skin); skull.scale.set(0.95, 1.1, 1.0); skull.castShadow = true; head.add(skull);
  const hairRing = lumpy(new THREE.SphereGeometry(0.128, 12, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.25), 0.012, 20, 1);
  const hr = new THREE.Mesh(hairRing, hairM); hr.rotation.x = 0.35; hr.position.z = -0.01; head.add(hr);
  const beard = new THREE.Mesh(lumpy(new THREE.ConeGeometry(0.09, 0.22, 10), 0.015, 18, 2), hairM);
  beard.rotation.x = Math.PI + 0.25; beard.position.set(0, -0.15, 0.07); beard.castShadow = true; head.add(beard);
  const mous = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 4, 10, Math.PI), hairM); mous.position.set(0, -0.05, 0.11); head.add(mous);
  for (const s of [-1, 1]) { const brow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.02), hairM); brow.position.set(s * 0.04, 0.035, 0.11); brow.rotation.z = -s * 0.2; head.add(brow); }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  let t = Math.random() * 5;
  root.userData.update = (dt) => {
    t += dt;
    head.rotation.z = Math.sin(t * 0.7) * 0.03;
    body.scale.x = 1 + Math.sin(t * 1.6) * 0.008;
    arms.position.y = 1.12 + Math.sin(t * 1.6) * 0.005;
  };
  root.userData.head = head;
  return root;
}
