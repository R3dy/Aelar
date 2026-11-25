import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, rr, n2, n3, smooth, lerp, clamp, boxUV, lumpy, vcolor, canvasTex, mulberry } from './util.js';
import * as L from './layout.js';

const loader = new THREE.TextureLoader();
export const TEX = {};
function tex(name, rep = 1, srgb = true) {
  const t = loader.load(`assets/tex/${name}`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene, quality) {
  TEX.grass = tex('grass.jpg');
  TEX.dirt = tex('dirt.jpg');
  TEX.cobble = tex('cobble.jpg');
  TEX.cliff = tex('cliff.jpg');
  TEX.boulder = tex('boulder.jpg');
  TEX.roof = tex('roof.jpg');
  TEX.wood = tex('wood.jpg');
  TEX.plaster = tex('plaster.jpg');
  TEX.banner = tex('banner.jpg');
  TEX.banner.wrapS = TEX.banner.wrapT = THREE.ClampToEdgeWrapping;
  TEX.gold = tex('gold.jpg');
  TEX.blade = tex('blade.png');
  TEX.glow = tex('glow.png');
  TEX.sparkle = tex('sparkle.png');

  const M = {
    wood: new THREE.MeshStandardMaterial({ map: TEX.wood, roughness: 0.8, color: 0xe8d8c8 }),
    woodDark: new THREE.MeshStandardMaterial({ map: TEX.wood, roughness: 0.85, color: 0x9a7a62 }),
    stone: new THREE.MeshStandardMaterial({ map: TEX.cobble, roughness: 0.9, color: 0xe8e0d8 }),
    rock: new THREE.MeshStandardMaterial({ map: TEX.cliff, roughness: 0.95, color: 0xf2eee8 }),
    boulder: new THREE.MeshStandardMaterial({ map: TEX.boulder, roughness: 0.95, color: 0xf0ece6 }),
    plaster: new THREE.MeshStandardMaterial({ map: TEX.plaster, roughness: 0.95, color: 0xfff6e8 }),
    roof: new THREE.MeshStandardMaterial({ map: TEX.roof, roughness: 0.7, color: 0xd8dce6 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x2c2a2a, roughness: 0.5, metalness: 0.6 }),
  };
  const world = { colliders: [], dummies: [], lanterns: [], updaters: [], M };
  const col = (x, z, r) => world.colliders.push({ x, z, r });

  scene.add(buildTerrain());
  scene.add(buildPath());
  scene.add(buildPaving());
  buildCliffs(scene, M);
  buildStairs(scene, M);
  buildArch(scene, M, world);
  buildHouse(scene, M, world, col);
  buildTower(scene, M);
  buildBridge(scene, M);
  buildWater(scene, world);
  buildBanners(scene, M, world, col);
  buildDummies(scene, M, world, col);
  buildRocks(scene, M, col);
  buildTrees(scene, col);
  buildGrass(scene, quality, world);
  buildFlowers(scene, quality);
  buildSky(scene, world);
  return world;
}

// ---------------------------------------------------------------- terrain
function terrainMaterial() {
  const m = new THREE.MeshStandardMaterial({ map: TEX.grass, roughness: 1, color: 0xffffff });
  m.onBeforeCompile = (s) => {
    s.uniforms.dirtMap = { value: TEX.dirt };
    s.uniforms.rockMap = { value: TEX.cliff };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSplat;\nvarying vec3 vSplat;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSplat = aSplat;\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D dirtMap;\nuniform sampler2D rockMap;\nvarying vec3 vSplat;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <map_fragment>', `
        vec2 wuv = vWPos.xz;
        vec4 g1 = texture2D(map, wuv * 0.16);
        vec4 g2 = texture2D(map, wuv * 0.043 + 0.37);
        vec4 grass = mix(g1, g2, 0.35);
        vec4 dirt = texture2D(dirtMap, wuv * 0.22);
        vec3 an = abs(vWNrm);
        vec4 rx = texture2D(rockMap, vWPos.zy * 0.14);
        vec4 rz = texture2D(rockMap, vWPos.xy * 0.14);
        vec4 ry = texture2D(rockMap, vWPos.xz * 0.14);
        vec4 rock = (rx * an.x + ry * an.y + rz * an.z) / (an.x + an.y + an.z);
        vec4 c = mix(grass, dirt, vSplat.x);
        c = mix(c, rock, vSplat.y);
        c.rgb *= mix(vec3(1.0), vec3(0.55, 0.62, 0.55), vSplat.z);
        diffuseColor *= c;
      `);
  };
  return m;
}

function buildTerrain() {
  const S = 220, N = 260;
  const g = new THREE.PlaneGeometry(S, S, N, N);
  g.rotateX(-Math.PI / 2);
  g.translate(2, 0, -10);
  const p = g.attributes.position;
  const splat = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, L.groundH(x, z));
  }
  g.computeVertexNormals();
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const pd = L.pathDist(x, z);
    let dirt = (1 - smooth(1.6, 2.6, pd)) * 0.9;
    dirt = Math.max(dirt, smooth(0.6, -0.4, L.pondSD(x, z)) * 0.8); // muddy banks
    dirt += smooth(0.55, 0.8, n2(x * 0.25, z * 0.25)) * 0.35;
    // under house + paving
    if (x > L.HOUSE.x0 - 1 && x < L.HOUSE.porchX + 4 && z > L.HOUSE.z0 - 1 && z < L.HOUSE.z1 + 1.5) dirt = Math.max(dirt, 0.7);
    const rock = smooth(0.88, 0.7, n.getY(i));
    const wet = smooth(0.3, -0.6, L.pondSD(x, z));
    splat[i * 3] = clamp(dirt, 0, 1); splat[i * 3 + 1] = rock; splat[i * 3 + 2] = wet;
  }
  g.setAttribute('aSplat', new THREE.BufferAttribute(splat, 3));
  const mesh = new THREE.Mesh(g, terrainMaterial());
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

// ---------------------------------------------------------------- path
function catmull(points, samples) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  return curve.getSpacedPoints(samples);
}
export function pathCurve() {
  return new THREE.CatmullRomCurve3(L.PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
}

function buildPath() {
  // individual flagstones laid along the path; merged into one mesh
  const curve = pathCurve();
  const len = curve.getLength();
  const geos = [];
  const R = mulberry(9);
  let s = 0;
  while (s < len) {
    const t = s / len;
    const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x);
    const width = 2.7 - 0.6 * smooth(-8, -15, p.z);
    const rowLen = 0.55 + R() * 0.35;
    let w = -width / 2;
    while (w < width / 2) {
      const sw = Math.min(0.5 + R() * 0.55, width / 2 - w + 0.1);
      const cx = p.x + side.x * (w + sw / 2) + (R() - 0.5) * 0.06;
      const cz = p.z + side.z * (w + sw / 2) + (R() - 0.5) * 0.06;
      if (R() > 0.06) {
        const geo = new THREE.BoxGeometry(sw - 0.07, 0.12, rowLen - 0.07, 2, 1, 2);
        // round off the corners a little
        const pp = geo.attributes.position;
        for (let i = 0; i < pp.count; i++) {
          const x = pp.getX(i), z = pp.getZ(i), y = pp.getY(i);
          if (y > 0) {
            const k = (Math.abs(x) / (sw / 2) + Math.abs(z) / (rowLen / 2));
            pp.setY(i, y - Math.max(0, k - 1.3) * 0.05);
          }
        }
        geo.rotateY(Math.atan2(tan.x, tan.z) + (R() - 0.5) * 0.12);
        const h = Math.max(L.groundH(cx, cz), 0) + 0.0;
        geo.translate(cx, h + 0.0, cz);
        geos.push(geo);
      }
      w += sw;
    }
    s += rowLen;
  }
  const g = boxUV(mergeGeometries(geos), 0.55);
  vcolor(g, 0xcfc7c0, 0xf4ede6, 0.12);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: TEX.cobble, vertexColors: true, roughness: 0.85, color: 0xf2e9e2 }));
  m.receiveShadow = true;
  return m;
}

function pavedRect(x0, x1, z0, z1, y, stone = 0.75, out = []) {
  const R = mulberry(Math.floor(x0 * 13 + z0 * 7));
  for (let z = z0; z < z1; z += stone) {
    const off = (Math.floor((z - z0) / stone) % 2) * stone * 0.5;
    for (let x = x0 - off; x < x1; x += stone) {
      const a = Math.max(x, x0), b = Math.min(x + stone, x1), c = Math.min(z + stone, z1);
      if (b - a < 0.1) continue;
      const geo = new THREE.BoxGeometry(b - a - 0.06, 0.16, c - z - 0.06);
      const h = y === undefined ? L.groundH((a + b) / 2, (z + c) / 2) : y;
      geo.translate((a + b) / 2, h - 0.02 + R() * 0.03, (z + c) / 2);
      out.push(geo);
    }
  }
  return out;
}

function buildPaving() {
  const geos = [];
  // in front of the porch
  pavedRect(L.HOUSE.porchX, -3.2, -10.5, -3.8, 0.1, 0.8, geos);
  // base of the stairs
  pavedRect(-2.8, 3.4, -16.4, -14.6, 0.05, 0.7, geos);
  // training platform
  const P = L.PLATFORM;
  pavedRect(P.x0, P.x1, P.z0, P.z1, 0.18, 0.8, geos);
  const g = boxUV(mergeGeometries(geos), 0.5);
  vcolor(g, 0xd2cac2, 0xf0e8e0, 0.15);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: TEX.cobble, vertexColors: true, roughness: 0.9 }));
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- cliffs
function rockColumn(h, r, seed) {
  const g = new THREE.CylinderGeometry(r * 0.8, r, h, 9, 6, false);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const top = smooth(h * 0.75, h, y);
    const k = 1 + n3(x * 0.7 + seed, y * 0.35, z * 0.7) * 0.22 - top * 0.25;
    p.setXYZ(i, x * k, y + (y > h - 0.01 ? -r * 0.3 + n2(x + seed, z) * 0.4 : 0), z * k);
  }
  return g;
}

function buildCliffs(scene, M) {
  const geos = [];
  const R = mulberry(77);
  // first tier face
  for (let x = -46; x < 46; x += 1.3 + R() * 0.8) {
    if (x > L.STAIRS.x0 - 0.6 && x < L.STAIRS.x1 + 0.6) continue;
    if (Math.abs(x - L.FALLS_X) < 3.4) continue;
    const cz = L.cliffZ(x);
    for (let row = 0; row < 2; row++) {
      const r = 1.0 + R() * 0.8;
      const h = L.PLAT + 0.3 + R() * 1.4 - row * 1.6;
      const g = rockColumn(h, r, R() * 100);
      g.rotateY(R() * 6.28);
      g.translate(x + (R() - 0.5) * 0.6, -0.8 + row * 0.2, cz + 0.6 + row * 1.0 + (R() - 0.5) * 0.4);
      geos.push(g);
    }
  }
  // gorge walls either side of the falls
  for (let z = -21.5; z < -17.0; z += 1.4) {
    for (const s of [-1, 1]) {
      const r = 0.9 + R() * 0.4;
      const g = rockColumn(L.PLAT + 0.6 + R(), r, R() * 50);
      g.translate(L.FALLS_X + s * (3.0 + R() * 0.4), -1, z);
      geos.push(g);
    }
  }
  // second tier face
  for (let x = -46; x < 46; x += 1.5 + R() * 1.0) {
    if (Math.abs(x - L.ARCH.x) < 1.5) continue;
    const uz = L.upperZ(x);
    const r = 1.1 + R() * 0.9;
    const base = L.PLAT - 0.6;
    const h = L.UPPER - base + 0.6 + R() * 1.2;
    const g = rockColumn(h, r, R() * 100);
    g.rotateY(R() * 6.28);
    g.translate(x, base, uz + 0.7);
    geos.push(g);
  }
  // behind and above the arch
  for (const dx of [-2.2, -1.2, 0, 1.2, 2.4]) {
    const g = rockColumn(L.UPPER - L.PLAT + 2.2 + Math.abs(dx) * -0.2, 1.3, dx * 10);
    g.translate(L.ARCH.x + dx, L.PLAT - 0.3, L.ARCH.z - 1.4 - Math.abs(dx) * 0.2);
    geos.push(g);
  }
  const g = boxUV(mergeGeometries(geos), 0.3);
  vcolor(g, 0xb4b0b4, 0xffffff, 0.12, -1, L.UPPER + 2);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: TEX.cliff, vertexColors: true, roughness: 0.95 }));
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  // moss/bush clumps on top edges
  const bush = [];
  for (let i = 0; i < 70; i++) {
    const x = rr(-40, 40);
    const tier = rand() < 0.6;
    const z = (tier ? L.cliffZ(x) : L.upperZ(x)) - rr(0.2, 1.2);
    if (Math.abs(x - L.ARCH.x) < 2.2 || Math.abs(x - L.FALLS_X) < 2) continue;
    const b = lumpy(new THREE.IcosahedronGeometry(rr(0.4, 0.9), 2), 0.15, 2.5, i);
    b.scale(1, 0.6, 1);
    b.translate(x, L.groundH(x, z) + 0.1, z);
    bush.push(b);
  }
  addBushes(scene, bush);
}

function addBushes(scene, geos, c0 = 0x3f6e1c, c1 = 0x9cc63c) {
  const g = mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)));
  const p = g.attributes.position, n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Color(c0), b = new THREE.Color(c1), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = clamp(n.getY(i) * 0.5 + 0.5 + n3(p.getX(i), p.getY(i), p.getZ(i)) * 0.25, 0, 1);
    c.copy(a).lerp(b, t);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
}

// ---------------------------------------------------------------- stairs
function buildStairs(scene, M) {
  const S = L.STAIRS;
  const geos = [], side = [];
  const run = (S.z0 - S.z1) / S.steps, rise = L.PLAT / S.steps;
  for (let i = 0; i < S.steps; i++) {
    const z = S.z0 - (i + 0.5) * run;
    const y = (i + 1) * rise;
    // each step is a few stone slabs
    let x = S.x0;
    const R = mulberry(i * 31 + 5);
    while (x < S.x1 - 0.05) {
      const w = Math.min(0.7 + R() * 0.6, S.x1 - x);
      const g = new THREE.BoxGeometry(w - 0.04, rise + 0.05, run + 0.1);
      g.translate(x + w / 2, y - rise / 2, z + 0.05);
      geos.push(g);
      x += w;
    }
    // fill below
    const f = new THREE.BoxGeometry(S.x1 - S.x0, y - rise, run);
    f.translate((S.x0 + S.x1) / 2, (y - rise) / 2, z);
    geos.push(f);
  }
  // side walls of blocks
  for (const sx of [S.x0 - 0.35, S.x1 + 0.35]) {
    for (let i = 0; i <= S.steps; i += 1) {
      const z = S.z0 - i * run;
      const top = Math.min(L.PLAT, (i + 1) * rise) + 0.35;
      const g = new THREE.BoxGeometry(0.7, top + 0.3, run + 0.02);
      g.translate(sx, top / 2 - 0.15, z - run / 2);
      side.push(g);
    }
  }
  const g = boxUV(mergeGeometries([...geos, ...side]), 0.6);
  vcolor(g, 0xc9c1ba, 0xf5eee8, 0.12);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: TEX.cobble, vertexColors: true, roughness: 0.85 }));
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
}

// ---------------------------------------------------------------- archway
function emblemTexture(color = '#ffcf4a', glow = '#ff9a1a', bg = null) {
  return canvasTex(256, 256, (c, w, h) => {
    if (bg) { c.fillStyle = bg; c.fillRect(0, 0, w, h); }
    c.translate(w / 2, h / 2);
    c.shadowColor = glow; c.shadowBlur = 24;
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 9; c.lineCap = 'round'; c.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      c.beginPath();
      // stylised crest: central blade with swept wings
      c.moveTo(0, -90); c.lineTo(0, 70);
      c.moveTo(-70, -10); c.quadraticCurveTo(-30, 10, 0, 60); c.quadraticCurveTo(30, 10, 70, -10);
      c.moveTo(-45, -60); c.quadraticCurveTo(-20, -20, 0, 20); c.quadraticCurveTo(20, -20, 45, -60);
      c.moveTo(-85, 30); c.lineTo(-55, 25); c.moveTo(85, 30); c.lineTo(55, 25);
      c.stroke();
      c.beginPath(); c.moveTo(0, -105); c.lineTo(-12, -80); c.lineTo(12, -80); c.closePath(); c.fill();
    }
  });
}

function buildArch(scene, M, world) {
  const A = L.ARCH;
  const grp = new THREE.Group();
  grp.position.set(A.x, L.PLAT - 0.05, A.z);
  const geos = [];
  const span = 1.5, ph = 2.4, d = 0.9;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const g = new THREE.BoxGeometry(0.7 + (i % 2) * 0.12, ph / 5 - 0.03, d);
      g.translate(s * (span + 0.35), (i + 0.5) * (ph / 5), 0);
      geos.push(g);
    }
    const base = new THREE.BoxGeometry(1.05, 0.5, 1.15);
    base.translate(s * (span + 0.35), 0.25, 0);
    geos.push(base);
  }
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * i / n, a1 = Math.PI * (i + 1) / n;
    const shape = new THREE.Shape();
    const ri = span, ro = span + 0.7;
    shape.moveTo(Math.cos(a0) * ri, Math.sin(a0) * ri);
    shape.lineTo(Math.cos(a0) * ro, Math.sin(a0) * ro);
    shape.lineTo(Math.cos(a1) * ro, Math.sin(a1) * ro);
    shape.lineTo(Math.cos(a1) * ri, Math.sin(a1) * ri);
    const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    g.scale(0.985, 0.985, 1);
    g.translate(0, ph, -d / 2);
    geos.push(g);
  }
  const key = new THREE.BoxGeometry(0.5, 0.75, d + 0.12);
  key.translate(0, ph + span + 0.35, 0);
  geos.push(key);
  const g = boxUV(mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x))), 0.7);
  vcolor(g, 0xcfc6bd, 0xf7f0ea, 0.1);
  const arch = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: TEX.cobble, vertexColors: true, roughness: 0.85 }));
  arch.castShadow = arch.receiveShadow = true;
  grp.add(arch);
  // dark recess with a warm glow and the crest
  const back = new THREE.Mesh(new THREE.PlaneGeometry(span * 2, ph + span),
    new THREE.MeshBasicMaterial({ map: canvasTex(64, 128, (c, w, h) => {
      const gr = c.createRadialGradient(w / 2, h * 0.45, 2, w / 2, h * 0.45, h * 0.6);
      gr.addColorStop(0, '#ffb347'); gr.addColorStop(0.35, '#a8571c'); gr.addColorStop(1, '#2a1a10');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
    }) }));
  back.position.set(0, (ph + span) / 2, -0.3);
  grp.add(back);
  const crest = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7),
    new THREE.MeshBasicMaterial({ map: emblemTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  crest.position.set(0, ph + 0.15, 0.05);
  grp.add(crest);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xffa040, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(3.6, 3.6, 1);
  halo.position.set(0, ph + 0.1, 0.2);
  grp.add(halo);
  world.updaters.push((t) => { crest.material.opacity = 0.85 + Math.sin(t * 2) * 0.15; halo.material.opacity = 0.45 + Math.sin(t * 2) * 0.1; });
  scene.add(grp);
  world.archPos = new THREE.Vector3(A.x, L.PLAT + 2.4, A.z);
}

// ---------------------------------------------------------------- house
function buildHouse(scene, M, world, col) {
  const H = L.HOUSE;
  const grp = new THREE.Group();
  const geoStone = [], geoWood = [], geoDark = [], geoPlaster = [];
  const F = H.floor;
  // foundation
  const fx0 = H.x0 - 0.3, fx1 = H.porchX + 0.3, fz0 = H.z0 - 0.3, fz1 = H.z1 + 0.3;
  const found = new THREE.BoxGeometry(fx1 - fx0, F + 0.4, fz1 - fz0);
  found.translate((fx0 + fx1) / 2, (F - 0.4) / 2 + 0.0, (fz0 + fz1) / 2);
  geoStone.push(found);
  // porch steps (east side)
  const step = new THREE.BoxGeometry(0.6, F * 0.5, 3.2);
  step.translate(H.porchX + 0.55, F * 0.25, -8.2);
  geoStone.push(step);
  // porch floor
  const floor = new THREE.BoxGeometry(H.porchX - H.x1 + 0.2, 0.08, H.z1 - H.z0);
  floor.translate((H.x1 + H.porchX) / 2, F + 0.04, (H.z0 + H.z1) / 2);
  geoWood.push(floor);
  // walls (plaster) with timber frame
  const wallH = 3.0;
  const bw = H.x1 - H.x0, bd = H.z1 - H.z0;
  const walls = new THREE.BoxGeometry(bw, wallH, bd);
  walls.translate((H.x0 + H.x1) / 2, F + wallH / 2, (H.z0 + H.z1) / 2);
  geoPlaster.push(walls);
  const beam = (x, y, z, sx, sy, sz, arr = geoDark) => { const b = new THREE.BoxGeometry(sx, sy, sz); b.translate(x, y, z); arr.push(b); };
  // vertical timbers on the east and south faces
  for (let z = H.z0; z <= H.z1 + 0.01; z += bd / 4) beam(H.x1 + 0.02, F + wallH / 2, z, 0.22, wallH, 0.22);
  for (let x = H.x0; x <= H.x1 + 0.01; x += bw / 3) beam(x, F + wallH / 2, H.z1 + 0.02, 0.22, wallH, 0.22);
  for (const y of [F + 0.1, F + 1.1, F + wallH - 0.1]) {
    beam(H.x1 + 0.04, y, (H.z0 + H.z1) / 2, 0.16, 0.18, bd);
    beam((H.x0 + H.x1) / 2, y, H.z1 + 0.04, bw, 0.18, 0.16);
  }
  // windows / doors (dark lattice) on the east wall
  const lattice = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#efe2c4'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#5a3a22'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    c.lineWidth = 3;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(i * w / 4, 0); c.lineTo(i * w / 4, h); c.stroke(); c.beginPath(); c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke(); }
  });
  const winMat = new THREE.MeshStandardMaterial({ map: lattice, emissive: 0xffb060, emissiveIntensity: 0.18, roughness: 0.8 });
  for (const [z, w, h, y] of [[-12.6, 1.4, 1.6, 1.0], [-9.8, 1.8, 2.3, 0.1], [-7.0, 1.4, 1.6, 1.0]]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w, h), winMat);
    win.rotation.y = Math.PI / 2;
    win.position.set(H.x1 + 0.03, F + y + h / 2, z);
    grp.add(win);
  }
  for (const [x, w, h, y] of [[-16.3, 1.3, 1.5, 1.0], [-13.2, 1.3, 1.5, 1.0]]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w, h), winMat);
    win.position.set(x, F + y + h / 2, H.z1 + 0.03);
    grp.add(win);
  }
  // porch posts + beams
  const postXs = [H.porchX - 0.15];
  const postZs = [H.z0 + 0.2, -11.0, -8.0, H.z1 - 0.2];
  for (const z of postZs) {
    beam(postXs[0], F + 1.6, z, 0.26, 3.2, 0.26, geoWood);
    const base = new THREE.BoxGeometry(0.5, 0.35, 0.5); base.translate(postXs[0], F + 0.17, z); geoStone.push(base);
  }
  beam(H.porchX - 0.15, F + 3.15, (H.z0 + H.z1) / 2, 0.3, 0.3, bd + 0.6, geoWood);
  beam((H.x1 + H.porchX) / 2, F + 3.15, H.z1 - 0.2, H.porchX - H.x1, 0.3, 0.3, geoWood);
  beam((H.x1 + H.porchX) / 2, F + 3.15, H.z0 + 0.2, H.porchX - H.x1, 0.3, 0.3, geoWood);
  // railing on porch south end
  for (let x = H.x1 + 0.4; x < H.porchX; x += 0.5) beam(x, F + 0.45, H.z1 - 0.2, 0.08, 0.9, 0.08, geoWood);
  beam((H.x1 + H.porchX) / 2, F + 0.9, H.z1 - 0.2, H.porchX - H.x1, 0.1, 0.12, geoWood);
  // tables and chairs
  for (const z of [-12.2, -9.3, -6.6]) {
    const tx = (H.x1 + H.porchX) / 2;
    beam(tx, F + 0.78, z, 1.3, 0.1, 0.9, geoWood);
    for (const [dx, dz] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]]) beam(tx + dx, F + 0.4, z + dz, 0.08, 0.76, 0.08, geoWood);
    for (const s of [-1, 1]) {
      beam(tx + s * 0.95, F + 0.45, z, 0.45, 0.07, 0.45, geoWood);
      beam(tx + s * 1.15, F + 0.75, z, 0.06, 0.7, 0.45, geoWood);
      for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) beam(tx + s * 0.95 + dx, F + 0.22, z + dz, 0.05, 0.45, 0.05, geoWood);
    }
  }
  const mk = (arr, mat, uv = 0.8) => {
    const g = boxUV(mergeGeometries(arr.map((x) => (x.index ? x.toNonIndexed() : x))), uv);
    const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; grp.add(m); return m;
  };
  mk(geoStone, M.stone, 0.6);
  mk(geoWood, M.wood, 0.7);
  mk(geoDark, M.woodDark, 0.7);
  mk(geoPlaster, M.plaster, 0.3);

  // roof: gable along z, sweeping out over the porch, upturned corners
  const rx0 = H.x0 - 1.0, rx1 = H.porchX + 1.1, rz0 = H.z0 - 1.1, rz1 = H.z1 + 1.3;
  const ridgeX = (rx0 + rx1) / 2, eaveY = F + 3.25, ridgeY = F + 6.0;
  const roofGeo = new THREE.BufferGeometry();
  const segX = 10, segZ = 16;
  const pos = [], uv = [], idx = [];
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (let j = 0; j <= segZ; j++) {
      for (let i = 0; i <= segX; i++) {
        const u = i / segX, v = j / segZ;
        const xEdge = side < 0 ? rx0 : rx1;
        const x = lerp(ridgeX, xEdge, u);
        const z = lerp(rz0, rz1, v);
        // concave slope + upturned eaves and corners
        let y = lerp(ridgeY, eaveY, Math.pow(u, 0.8)) + Math.pow(u, 6) * 0.35;
        const endT = Math.max(smooth(0.82, 1, v), smooth(0.18, 0, v));
        y += endT * u * u * 0.55;
        pos.push(x, y, z);
        uv.push(u * (rx1 - ridgeX) * 0.55, z * 0.55);
      }
    }
    for (let j = 0; j < segZ; j++) for (let i = 0; i < segX; i++) {
      const a = base + j * (segX + 1) + i, b = a + 1, c = a + segX + 1, d = c + 1;
      if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  roofGeo.setIndex(idx);
  roofGeo.computeVertexNormals();
  const roofMat = M.roof.clone();
  roofMat.side = THREE.DoubleSide;
  roofMat.map = TEX.roof.clone(); roofMat.map.rotation = Math.PI / 2; roofMat.map.needsUpdate = true;
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.castShadow = roof.receiveShadow = true;
  grp.add(roof);
  // ridge cap and gable ends
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, rz1 - rz0 + 0.5), M.iron);
  ridge.position.set(ridgeX, ridgeY + 0.1, (rz0 + rz1) / 2);
  grp.add(ridge);
  for (const z of [rz0 - 0.1, rz1 + 0.1]) {
    const orn = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.35), M.iron);
    orn.position.set(ridgeX, ridgeY + 0.35, z); orn.rotation.z = 0.4; grp.add(orn);
  }
  const gable = new THREE.Shape();
  gable.moveTo(H.x0 - 0.1, 0); gable.lineTo(H.porchX + 0.1, 0); gable.lineTo(ridgeX, ridgeY - eaveY - 0.1); gable.closePath();
  for (const z of [H.z1 + 0.4, H.z0 - 0.4]) {
    const gg = new THREE.ShapeGeometry(gable);
    const gm = new THREE.Mesh(boxUV(gg, 0.7), M.woodDark.clone());
    gm.material.side = THREE.DoubleSide;
    gm.position.set(0, eaveY - 0.05, z);
    grp.add(gm);
  }
  scene.add(grp);
  col((H.x0 + H.x1) / 2, (H.z0 + H.z1) / 2, 0); // placeholder, rect handled below
  world.houseRect = { x0: H.x0 - 0.4, x1: H.x1 + 0.4, z0: H.z0 - 0.4, z1: H.z1 + 0.4 };
  for (const z of postZs) col(H.porchX - 0.15, z, 0.3);
  // tables block
  for (const z of [-12.2, -9.3, -6.6]) col((H.x1 + H.porchX) / 2, z, 0.9);

  // banner hanging from the porch front beam (facing the camera)
  const ban = makeBanner(1.05, 2.4);
  ban.position.set(H.x1 + 1.3, F + 3.0, H.z1 + 0.15);
  grp.add(ban);
  world.updaters.push(ban.userData.update);
  // lanterns on the porch posts
  for (const [x, y, z, light] of [[H.porchX + 0.25, F + 2.55, -8.0, true], [H.porchX + 0.25, F + 2.55, H.z1 - 0.2, true], [H.x1 + 0.35, F + 2.2, -10.2, false]]) {
    const ln = makeLantern(light);
    ln.position.set(x, y, z);
    grp.add(ln);
    world.lanterns.push(ln);
  }
  // glowing wall emblem on the south wall
  const em = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ map: emblemTexture('#ffd27a', '#ff9a30', '#3a2412'), toneMapped: false }));
  em.position.set(-14.5, F + 1.9, H.z1 + 0.06);
  grp.add(em);
}

export function makeBanner(w, h) {
  const g = new THREE.PlaneGeometry(w, h, 6, 10);
  g.translate(0, -h / 2, 0);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: TEX.banner, side: THREE.DoubleSide, roughness: 0.9, emissive: 0x400000, emissiveIntensity: 0.25 }));
  m.castShadow = true;
  const base = Float32Array.from(g.attributes.position.array);
  const off = Math.random() * 10;
  m.userData.update = (t) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = base[i * 3 + 1], x = base[i * 3];
      const k = -y / h;
      p.setZ(i, Math.sin(t * 1.8 + off + k * 3 + x * 2) * 0.09 * k);
      p.setX(i, x + Math.sin(t * 1.3 + off + k * 2) * 0.03 * k);
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
  };
  return m;
}

export function makeLantern(withLight) {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.6, metalness: 0.4 });
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 6), frame); top.position.y = 0.26; g.add(top);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.36, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false }));
  body.position.y = 0.02; g.add(body);
  const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.08, 6), frame); bot.position.y = -0.19; g.add(bot);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xffb347, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(1.4, 1.4, 1); g.add(glow);
  if (withLight) {
    const l = new THREE.PointLight(0xffa450, 6, 7, 1.6);
    l.position.y = -0.1;
    g.add(l);
  }
  return g;
}

// ---------------------------------------------------------------- watchtower
function buildTower(scene, M) {
  const x = 6.8, z = -28.6, y = L.groundH(x, z) - 0.2;
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  const wood = [], dark = [];
  const B = (arr, px, py, pz, sx, sy, sz, rx = 0, rz = 0) => { const b = new THREE.BoxGeometry(sx, sy, sz); b.rotateX(rx); b.rotateZ(rz); b.translate(px, py, pz); arr.push(b); };
  const s = 1.6, deck = 2.6, top = 5.0;
  for (const [a, b] of [[-s, -s], [s, -s], [-s, s], [s, s]]) {
    B(wood, a, top / 2, b, 0.3, top, 0.3);
    B(wood, a, deck / 2, b === -s ? b + 0 : b, 0.12, deck * 1.3, 0.12, 0, a > 0 ? 0.5 : -0.5);
  }
  B(wood, 0, deck, 0, s * 2 + 0.8, 0.2, s * 2 + 0.8);
  for (const sd of [-1, 1]) {
    B(dark, 0, deck + 0.9, sd * (s + 0.3), s * 2 + 0.8, 0.12, 0.12);
    B(dark, sd * (s + 0.3), deck + 0.9, 0, 0.12, 0.12, s * 2 + 0.8);
    for (let i = -3; i <= 3; i++) {
      B(dark, i * 0.5, deck + 0.45, sd * (s + 0.3), 0.08, 0.9, 0.08);
      B(dark, sd * (s + 0.3), deck + 0.45, i * 0.5, 0.08, 0.9, 0.08);
    }
  }
  // stairs up the side
  for (let i = 0; i < 7; i++) B(wood, s + 0.9 + i * 0.28, deck - i * (deck / 7), s - 0.2, 0.3, 0.06, 0.9);
  const g = boxUV(mergeGeometries([...wood, ...dark].map((q) => (q.index ? q.toNonIndexed() : q))), 0.8);
  const m = new THREE.Mesh(g, M.wood); m.castShadow = true; grp.add(m);
  const roofG = new THREE.ConeGeometry(s * 2.3, 1.6, 4, 3, true);
  const rp = roofG.attributes.position;
  for (let i = 0; i < rp.count; i++) { const yy = rp.getY(i); const r = Math.hypot(rp.getX(i), rp.getZ(i)); rp.setY(i, yy - Math.pow(r / (s * 2.3), 3) * 0.2 + (r > s * 2.1 ? 0.15 : 0)); }
  roofG.computeVertexNormals();
  const roofMat = M.roof.clone(); roofMat.side = THREE.DoubleSide;
  const roof = new THREE.Mesh(roofG, roofMat);
  roof.rotation.y = Math.PI / 4; roof.position.y = top + 0.75; roof.castShadow = true;
  grp.add(roof);
  const fin = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), M.iron); fin.position.y = top + 1.65; grp.add(fin);
  scene.add(grp);
}

// ---------------------------------------------------------------- bridge
function buildBridge(scene, M) {
  const B = L.BRIDGE;
  const geos = [], rails = [];
  const n = 18;
  for (let i = 0; i < n; i++) {
    const x0 = lerp(B.x0, B.x1, i / n), x1 = lerp(B.x0, B.x1, (i + 1) / n);
    const y0 = L.bridgeH(x0), y1 = L.bridgeH(x1);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const g = new THREE.BoxGeometry(len + 0.02, 0.12, B.w);
    g.rotateZ(Math.atan2(y1 - y0, x1 - x0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2 - 0.06, B.z);
    geos.push(g);
    // arch beams underneath
    for (const s of [-1, 1]) {
      const b = new THREE.BoxGeometry(len + 0.02, 0.25, 0.15);
      b.rotateZ(Math.atan2(y1 - y0, x1 - x0));
      b.translate((x0 + x1) / 2, (y0 + y1) / 2 - 0.3, B.z + s * (B.w / 2 - 0.1));
      geos.push(b);
    }
  }
  for (let i = 0; i <= 8; i++) {
    const x = lerp(B.x0 + 0.1, B.x1 - 0.1, i / 8), y = L.bridgeH(x);
    for (const s of [-1, 1]) {
      const p = new THREE.BoxGeometry(0.16, 1.0, 0.16); p.translate(x, y + 0.45, B.z + s * (B.w / 2 - 0.05)); rails.push(p);
      if (i === 0 || i === 8) { const leg = new THREE.BoxGeometry(0.22, 1.6, 0.22); leg.translate(x, y - 0.6, B.z + s * (B.w / 2 - 0.1)); rails.push(leg); }
    }
    if (i < 8) {
      const xb = lerp(B.x0 + 0.1, B.x1 - 0.1, (i + 1) / 8), yb = L.bridgeH(xb);
      for (const s of [-1, 1]) for (const hh of [0.9, 0.5]) {
        const len = Math.hypot(xb - x, yb - y);
        const r = new THREE.BoxGeometry(len, 0.1, 0.1);
        r.rotateZ(Math.atan2(yb - y, xb - x));
        r.translate((x + xb) / 2, (y + yb) / 2 + hh, B.z + s * (B.w / 2 - 0.05));
        rails.push(r);
      }
    }
  }
  const g = boxUV(mergeGeometries([...geos, ...rails].map((q) => (q.index ? q.toNonIndexed() : q))), 0.9);
  const m = new THREE.Mesh(g, M.wood);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
}

// ---------------------------------------------------------------- water
function buildWater(scene, world) {
  const g = new THREE.PlaneGeometry(40, 30, 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(17, L.WATER_Y, -13);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uTime: { value: 0 }, fogColor: { value: new THREE.Color() }, fogNear: { value: 0 }, fogFar: { value: 1 } },
    fog: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `
      uniform float uTime; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      vec2 cellv(vec2 p){ vec2 i=floor(p), f=fract(p); float d1=8.0, d2=8.0;
        for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(x,y); vec2 o=vec2(h(i+g), h(i+g+17.0));
          o = 0.5+0.45*sin(uTime*0.7+6.2831*o); float d=length(g+o-f); if(d<d1){d2=d1;d1=d;} else if(d<d2) d2=d; }
        return vec2(d1,d2); }
      void main(){
        vec2 c = cellv(vW.xz*0.9);
        float caust = smoothstep(0.12, 0.0, c.y-c.x);
        vec2 c2 = cellv(vW.xz*1.7+vec2(uTime*0.15,0.0));
        caust += 0.6*smoothstep(0.08, 0.0, c2.y-c2.x);
        vec3 deep = vec3(0.05,0.36,0.52), shallow = vec3(0.16,0.66,0.78);
        float n = 0.5+0.5*sin(vW.x*0.35+vW.z*0.2);
        vec3 col = mix(deep, shallow, n*0.6+0.2);
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0-max(V.y,0.0), 3.0);
        col = mix(col, vec3(0.75,0.9,1.0), fres*0.55);
        col += caust*vec3(0.55,0.85,0.95)*0.45;
        gl_FragColor = vec4(col, 0.86);
        #include <colorspace_fragment>
      }`,
  });
  // only draw where the pond mask says there is water: clip the plane by depth test against terrain
  const water = new THREE.Mesh(g, mat);
  water.renderOrder = 2;
  scene.add(water);
  world.updaters.push((t) => { mat.uniforms.uTime.value = t; });

  // waterfall: curved sheet with scrolling streaks
  const fallTex = canvasTex(128, 256, (c, w, h) => {
    c.fillStyle = 'rgba(190,230,255,0.55)'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      const x = Math.random() * w, y = Math.random() * h, l = 20 + Math.random() * 80;
      c.strokeStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`; c.lineWidth = 1 + Math.random() * 3;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + l); c.stroke();
      c.beginPath(); c.moveTo(x, y - h); c.lineTo(x, y - h + l); c.stroke();
    }
  });
  fallTex.wrapS = fallTex.wrapT = THREE.RepeatWrapping;
  fallTex.repeat.set(2, 1.5);
  const top = L.UPPER - 0.2, bot = L.WATER_Y;
  const fg = new THREE.PlaneGeometry(3.2, top - bot, 8, 12);
  const fp = fg.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const y = fp.getY(i), t = 1 - (y + (top - bot) / 2) / (top - bot);
    fp.setZ(i, Math.pow(t, 0.5) * 1.6 - Math.pow(Math.abs(fp.getX(i)) / 1.4, 2) * 0.3);
    fp.setX(i, fp.getX(i) * (1 + t * 0.25));
  }
  fg.computeVertexNormals();
  const fall = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, color: 0xdff4ff }));
  fall.position.set(L.FALLS_X, (top + bot) / 2, L.upperZ(L.FALLS_X) + 0.9);
  scene.add(fall);
  // mist and foam at the base
  const mist = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    s.position.set(L.FALLS_X + rr(-1.3, 1.3), L.WATER_Y + rr(0.1, 0.9), L.upperZ(L.FALLS_X) + 2.6 + rr(-0.4, 0.6));
    s.scale.setScalar(rr(1.2, 2.4));
    s.userData.o = rand() * 6;
    scene.add(s); mist.push(s);
  }
  world.updaters.push((t) => {
    fallTex.offset.y = t * 1.2;
    for (const s of mist) { s.material.opacity = 0.25 + 0.15 * Math.sin(t * 2 + s.userData.o); }
  });
  // lily pads
  const pads = [];
  for (let i = 0; i < 26; i++) {
    const x = rr(6, 30), z = rr(-11.5, -4.5);
    if (L.pondSD(x, z) > -0.8) continue;
    const pg = new THREE.CircleGeometry(rr(0.22, 0.38), 10, 0.3, Math.PI * 2 - 0.5);
    pg.rotateX(-Math.PI / 2); pg.rotateY(rand() * 6); pg.translate(x, L.WATER_Y + 0.02, z);
    pads.push(pg);
  }
  if (pads.length) scene.add(new THREE.Mesh(mergeGeometries(pads), new THREE.MeshStandardMaterial({ color: 0x7dbb3a, roughness: 0.6 })));
  // stone curb along the far bank and the platform edge
  const curb = [];
  for (let x = 7; x < 32; x += 0.75) {
    // find bank z by marching north from the pond centre
    let z = -8;
    while (z > -14 && L.pondSD(x, z) < 0) z -= 0.1;
    if (z <= -13.9) continue;
    const g = lumpy(new THREE.IcosahedronGeometry(0.42, 1), 0.08, 2, x);
    g.scale(1.1, 0.55, 0.8);
    g.translate(x, Math.max(L.groundH(x, z), 0.0) + 0.05, z - 0.1);
    curb.push(g);
  }
  for (let z = -16; z < -5; z += 0.7) {
    let x = 9;
    while (x > 4 && L.pondSD(x, z) < 0) x -= 0.1;
    if (L.pondSD(x + 0.15, z) > 0.3 || L.onBridge(x, z)) continue;
    const g = lumpy(new THREE.IcosahedronGeometry(0.38, 1), 0.08, 2, z);
    g.scale(0.9, 0.5, 1.1);
    g.translate(x + 0.05, L.groundH(x, z) + 0.05, z);
    curb.push(g);
  }
  const cg = boxUV(mergeGeometries(curb.map((q) => (q.index ? q.toNonIndexed() : q))), 0.8);
  const cm = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ map: TEX.boulder, roughness: 0.9, color: 0xe8e2dc }));
  cm.receiveShadow = true;
  scene.add(cm);
}

// ---------------------------------------------------------------- banners
function buildBanners(scene, M, world, col) {
  for (const [x, z, h] of [[-3.0, -14.6, 4.6], [4.3, -15.4, 4.4]]) {
    const grp = new THREE.Group();
    grp.position.set(x, L.groundH(x, z), z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, h, 8), M.woodDark);
    pole.position.y = h / 2; pole.castShadow = true; grp.add(pole);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), M.woodDark);
    bar.rotation.z = Math.PI / 2; bar.position.y = h - 0.15; grp.add(bar);
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.iron);
      cap.position.set(s * 0.78, h - 0.15, 0); grp.add(cap);
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), M.iron); tip.position.y = h + 0.12; grp.add(tip);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), M.stone);
    base.position.y = 0.2; base.castShadow = base.receiveShadow = true; grp.add(base);
    const ban = makeBanner(1.25, 2.6);
    ban.position.set(0, h - 0.22, 0.09);
    grp.add(ban);
    world.updaters.push(ban.userData.update);
    scene.add(grp);
    col(x, z, 0.45);
  }
}

// ---------------------------------------------------------------- dummies
function targetTexture() {
  return canvasTex(128, 128, (c, w, h) => {
    const cols = ['#f1e6d2', '#d6322a', '#f1e6d2', '#d6322a', '#f1e6d2', '#d6322a'];
    for (let i = 0; i < cols.length; i++) {
      c.fillStyle = cols[i]; c.beginPath(); c.arc(w / 2, h / 2, (w / 2) * (1 - i / cols.length), 0, 7); c.fill();
    }
    c.strokeStyle = '#5a3a22'; c.lineWidth = 6; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 3, 0, 7); c.stroke();
  });
}
function buildDummies(scene, M, world, col) {
  const tgt = new THREE.MeshStandardMaterial({ map: targetTexture(), roughness: 0.8 });
  const face = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#c99a64'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#3a2414'; c.fillRect(16, 22, 10, 10); c.fillRect(38, 22, 10, 10); c.fillRect(26, 42, 12, 5);
  });
  const faceMat = new THREE.MeshStandardMaterial({ map: face, roughness: 0.9 });
  for (const [x, z] of L.DUMMIES) {
    const base = new THREE.Group();
    base.position.set(x, 0.18, z);
    base.rotation.y = Math.atan2(-x * 0.06, 1) + 0.2;
    const stone = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.8), M.stone);
    stone.position.y = 0.15; stone.castShadow = stone.receiveShadow = true; base.add(stone);
    const body = new THREE.Group(); body.position.y = 0.3; base.add(body);
    const W = (sx, sy, sz, px, py, pz, mat = M.wood) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(px, py, pz); m.castShadow = true; body.add(m); return m; };
    for (const s of [-1, 1]) W(0.24, 0.85, 0.24, s * 0.2, 0.42, 0);
    W(0.72, 0.5, 0.45, 0, 0.95, 0);
    W(0.6, 0.9, 0.4, 0, 1.55, 0);
    const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.5, 8), M.wood); arms.rotation.z = Math.PI / 2; arms.position.y = 1.7; arms.castShadow = true; body.add(arms);
    const head = W(0.4, 0.42, 0.4, 0, 2.25, 0);
    const hf = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.4), faceMat); hf.position.set(0, 2.25, 0.205); body.add(hf);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.14, 24), [M.wood, tgt, M.wood]);
    disc.rotation.x = Math.PI / 2; disc.position.set(0, 1.55, 0.27); disc.castShadow = true; body.add(disc);
    scene.add(base);
    col(x, z, 0.7);
    world.dummies.push({ group: base, body, x, z, wobble: 0, hits: 0, flash: 0, mats: [] });
  }
}

// ---------------------------------------------------------------- rocks
function buildRocks(scene, M, col) {
  const list = [
    // x, z, radius, squash
    [-6.6, 3.2, 1.6, 0.6], [-9.5, 6.5, 1.3, 0.7], [7.6, -5.6, 1.5, 0.55], [9.5, 7.5, 1.8, 0.6], [12.5, 3.5, 1.2, 0.6],
    [-4.2, -12.3, 0.8, 0.7], [3.9, -12.9, 0.9, 0.7], [-7.5, -16.4, 1.0, 0.7], [6.8, -14.3, 0.7, 0.7], [-11.5, 1.5, 0.7, 0.7],
    [4.5, 1.0, 0.45, 0.7], [-3.1, 9.5, 0.6, 0.7], [15.2, -2.6, 0.9, 0.6], [-15, -1.5, 1.1, 0.7], [20, 1.5, 1.4, 0.6], [-2.6, -9.5, 0.4, 0.8],
    [24, -3.2, 0.8, 0.6], [-13, 10, 1.3, 0.6],
  ];
  const geos = [];
  list.forEach(([x, z, r, sq], i) => {
    const g = lumpy(new THREE.IcosahedronGeometry(r, 3), r * 0.16, 1.1 / r, i * 3.3);
    // flatten facets a little for the chiselled look
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) * sq + (p.getY(k) < 0 ? p.getY(k) * 0.3 : 0));
    g.rotateY(i);
    g.translate(x, L.groundH(x, z) + r * sq * 0.45, z);
    geos.push(g.toNonIndexed());
    col(x, z, r * 0.95);
  });
  const g = boxUV(mergeGeometries(geos), 0.45);
  // moss on top via vertex colours
  g.computeVertexNormals();
  const n = g.attributes.normal, p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const moss = smooth(0.55, 0.9, n.getY(i)) * smooth(-0.2, 0.4, n3(p.getX(i) * 0.8, p.getY(i), p.getZ(i) * 0.8));
    c[i * 3] = lerp(1, 0.62, moss); c[i * 3 + 1] = lerp(1, 0.85, moss); c[i * 3 + 2] = lerp(1, 0.35, moss);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: TEX.boulder, vertexColors: true, roughness: 0.9, color: 0xf4f0ea }));
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
}

// ---------------------------------------------------------------- trees
function canopyGeo(r, blobs, seed, R) {
  const geos = [];
  for (let i = 0; i < blobs; i++) {
    const a = R() * Math.PI * 2, d = i === 0 ? 0 : r * (0.45 + R() * 0.45);
    const br = r * (0.5 + R() * 0.35) * (i === 0 ? 1.15 : 1);
    const g = lumpy(new THREE.IcosahedronGeometry(br, 3), br * 0.22, 2.2 / br, seed + i * 7);
    g.translate(Math.cos(a) * d, (R() - 0.3) * r * 0.55, Math.sin(a) * d);
    geos.push(g.toNonIndexed());
  }
  return mergeGeometries(geos);
}

const TREE_COLORS = {
  green: [0x2f5a14, 0x8fbf34, 0xb9d94c],
  lime: [0x3d6a18, 0x9fcb3c, 0xd2e866],
  red: [0x6e0d10, 0xc8242a, 0xf2533d],
  yellow: [0x7a5208, 0xe0a516, 0xfde05a],
};

function paintCanopy(g, cols, R) {
  const p = g.attributes.position, n = g.attributes.normal;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const c0 = new THREE.Color(cols[0]), c1 = new THREE.Color(cols[1]), c2 = new THREE.Color(cols[2]), c = new THREE.Color();
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = clamp((p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y) * 0.6 + n.getY(i) * 0.35 + 0.15 + n3(p.getX(i) * 1.3, p.getY(i) * 1.3, p.getZ(i) * 1.3) * 0.25, 0, 1);
    if (t < 0.5) c.copy(c0).lerp(c1, t * 2); else c.copy(c1).lerp(c2, (t - 0.5) * 2);
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

function trunkGeo(h, r, R, branches = 3) {
  const geos = [];
  const t = new THREE.CylinderGeometry(r * 0.6, r, h, 8, 4);
  t.translate(0, h / 2, 0);
  const p = t.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.sin(y * 0.8) * 0.1); }
  geos.push(t.toNonIndexed());
  for (let i = 0; i < branches; i++) {
    const b = new THREE.CylinderGeometry(r * 0.25, r * 0.4, h * 0.5, 6);
    b.translate(0, h * 0.25, 0);
    b.rotateZ((R() - 0.5) * 1.6);
    b.rotateY(R() * 6.28);
    b.translate(0, h * (0.6 + R() * 0.25), 0);
    geos.push(b.toNonIndexed());
  }
  return mergeGeometries(geos);
}

function buildTrees(scene, col) {
  const R = mulberry(5);
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 1, map: TEX.wood });
  const leafTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#9a9a9a'; c.fillRect(0, 0, w, h);
    const R2 = mulberry(21);
    for (let i = 0; i < 1400; i++) {
      const x = R2() * w, y = R2() * h, s = 4 + R2() * 7, v = Math.floor(120 + R2() * 135);
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.save(); c.translate(x, y); c.rotate(R2() * 6.28);
      c.beginPath(); c.ellipse(0, 0, s, s * 0.45, 0, 0, 7); c.fill(); c.restore();
    }
  });
  leafTex.wrapS = leafTex.wrapT = THREE.RepeatWrapping;
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, map: leafTex });
  const trunks = [], canopies = [], leafCards = [];
  const broad = [
    // x, z, height, canopy radius, colour
    [-16.5, 1.5, 7.5, 4.2, 'green'], [-6.2, -18.6, 6.0, 3.0, 'red'], [-9.5, -20.5, 7.5, 3.4, 'red'], [-20, -9, 8, 4.0, 'yellow'],
    [-13.5, -17.5, 8.5, 3.8, 'green'], [27, -22, 7.5, 4.5, 'green'], [31, -16, 7, 3.8, 'lime'],
    [-24, 4, 7, 4, 'green'], [22, 10, 6.5, 3.6, 'lime'], [33, -6, 7.5, 4.2, 'green'], [-3.3, -18.2, 2.6, 1.3, 'lime'], [4.9, -18.6, 2.8, 1.4, 'green'],
    [15, -23.8, 3.5, 1.8, 'lime'], [-26, -16, 8, 4.5, 'green'], [-12, 14, 6, 3.5, 'yellow'], [14, 15, 6, 3.5, 'red'], [-30, -4, 9, 5, 'lime'],
    [38, -26, 9, 5, 'green'], [-33, -24, 8, 5, 'green'], [-28, 14, 7, 4, 'lime'],
  ];
  for (const [x, z, h, cr, kind] of broad) {
    const y = L.groundH(x, z);
    const t = trunkGeo(h * 0.7, Math.max(0.18, cr * 0.09), R, h > 4 ? 3 : 1);
    t.translate(x, y - 0.2, z);
    trunks.push(boxUV(t, 0.5));
    const c = canopyGeo(cr, h > 4 ? 6 : 3, x * 3 + z, R);
    c.scale(1, 0.85, 1);
    paintCanopy(c, TREE_COLORS[kind], R);
    c.translate(x, y + h * 0.72, z);
    canopies.push(c);
    col(x, z, Math.max(0.35, cr * 0.12));
    // leaf cards scattered over the canopy surface break up the blob silhouette
    const cp = c.attributes.position, cn = c.attributes.normal, cc = c.attributes.color;
    const nCards = Math.round(cr * cr * 9);
    for (let k = 0; k < nCards; k++) {
      const i = Math.floor(R() * cp.count);
      if (cn.getY(i) < -0.5) continue;
      leafCards.push([cp.getX(i) + cn.getX(i) * 0.15, cp.getY(i) + cn.getY(i) * 0.15, cp.getZ(i) + cn.getZ(i) * 0.15,
        cn.getX(i), cn.getY(i), cn.getZ(i), cc.getX(i), cc.getY(i), cc.getZ(i), cr]);
    }
  }
  // pines (on the tiers, behind the cliffs, and around the edges)
  const pines = [
    [-6, -27], [-2.5, -29.5], [3.5, -30.8], [12.5, -28], [16.5, -27.2], [20.5, -29], [24.5, -26.5], [-10.5, -26.8],
    [-15, -28], [9.8, -33], [0.5, -34], [-7, -33], [18, -33], [28, -31], [-20, -26], [33, -20], [-37, -12], [36, 6], [-34, 12],
    [-22, -30], [23, -36], [6, -39], [-12, -36], [14, -38],
  ];
  const pineG = [];
  for (const [x, z] of pines) {
    const y = L.groundH(x, z);
    const h = 5 + R() * 3.5;
    const tr = new THREE.CylinderGeometry(0.12, 0.2, h * 0.3, 6);
    tr.translate(x, y + h * 0.15 - 0.1, z);
    trunks.push(boxUV(tr.toNonIndexed(), 0.5));
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const tt = i / tiers;
      const rad = (1 - tt * 0.8) * h * 0.24;
      const cone = new THREE.ConeGeometry(rad, h * 0.32, 9, 2);
      lumpyCone(cone, rad, x + i);
      cone.translate(x, y + h * 0.25 + tt * h * 0.7, z);
      pineG.push(cone.toNonIndexed());
    }
  }
  const pg = mergeGeometries(pineG);
  pg.computeVertexNormals();
  paintCanopy(pg, [0x163a1a, 0x2f6b2a, 0x5e9a3a], R);
  canopies.push(pg);

  const tm = new THREE.Mesh(mergeGeometries(trunks), barkMat);
  tm.castShadow = true; tm.receiveShadow = true;
  scene.add(tm);
  const cg = mergeGeometries(canopies.map((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; }));
  const cgUV = boxUV(cg, 0.9, undefined, true);
  const cm = new THREE.Mesh(cgUV, leafMat);
  {
    const cardTex = canvasTex(128, 128, (c2, w2, h2) => {
      const R3 = mulberry(8);
      for (let i = 0; i < 70; i++) {
        const a = R3() * 6.28, d = R3() * 44;
        const x = w2 / 2 + Math.cos(a) * d, y = h2 / 2 + Math.sin(a) * d, s = 6 + R3() * 8, v = Math.floor(150 + R3() * 105);
        c2.fillStyle = `rgb(${v},${v},${v})`;
        c2.save(); c2.translate(x, y); c2.rotate(R3() * 6.28);
        c2.beginPath(); c2.ellipse(0, 0, s, s * 0.45, 0, 0, 7); c2.fill(); c2.restore();
      }
    });
    const q = new THREE.PlaneGeometry(1, 1);
    const cardMat = new THREE.MeshStandardMaterial({ map: cardTex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.85 });
    const inst = new THREE.InstancedMesh(q, cardMat, leafCards.length);
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3(), nn = new THREE.Vector3(), col2 = new THREE.Color();
    const zAxis = new THREE.Vector3(0, 0, 1), spin = new THREE.Quaternion();
    leafCards.forEach(([x, y, z, nx, ny, nz, r, g, b, cr], i) => {
      nn.set(nx, ny, nz).normalize();
      qq.setFromUnitVectors(zAxis, nn);
      spin.setFromAxisAngle(nn, R() * 6.28); qq.premultiply(spin);
      const s = (0.7 + R() * 0.6) * Math.min(1.6, 0.45 + cr * 0.25);
      sc.set(s, s, s); pp.set(x, y, z);
      m4.compose(pp, qq, sc); inst.setMatrixAt(i, m4);
      col2.setRGB(r * 1.05, g * 1.05, b * 1.05); inst.setColorAt(i, col2);
    });
    inst.castShadow = true; inst.receiveShadow = true;
    scene.add(inst);
  }
  cm.castShadow = true; cm.receiveShadow = true;
  scene.add(cm);

  // small shrubs dotted around
  const bush = [];
  const spots = [[-2.8, -17.0], [3.8, -17.2], [5.8, -16.2], [-4.6, -16.0], [-8.2, -2.5], [6.5, -9.5], [-6, -11], [13.5, -18.5], [8.4, -20.6], [3.2, -20.0], [-2.6, -20.2], [-12, -3.5], [12, -3.5], [-1, -19.6], [17, -18.5]];
  for (const [x, z] of spots) {
    const g = lumpy(new THREE.IcosahedronGeometry(rr(0.5, 0.9), 2), 0.18, 2.4, x * z);
    g.scale(1, 0.75, 1);
    g.translate(x, L.walkH(x, z) ?? L.groundH(x, z), z);
    bush.push(g);
  }
  addBushes(scene, bush, 0x2f5a14, 0xa6d040);
}

function lumpyCone(g, rad, seed) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const a = Math.atan2(z, x);
    const k = 1 + Math.sin(a * 9 + seed) * 0.12 + n2(a * 2 + seed, y) * 0.1;
    p.setX(i, x * k); p.setZ(i, z * k);
    if (y < 0) p.setY(i, y - Math.hypot(x, z) / rad * 0.25);
  }
}

// ---------------------------------------------------------------- grass
function grassAllowed(x, z) {
  if (L.pondSD(x, z) < 0.3) return 0;
  const pd = L.pathDist(x, z);
  if (pd < 1.25) return 0;
  const H = L.HOUSE;
  if (x > H.x0 - 0.6 && x < H.porchX + 0.6 && z > H.z0 - 0.6 && z < H.z1 + 0.6) return 0;
  if (x > H.porchX && x < -3.0 && z > -10.7 && z < -3.6) return 0;
  if (L.onPlatform(x, z) || (x > L.PLATFORM.x0 - 0.3 && z < L.PLATFORM.z1 + 0.3 && z > L.PLATFORM.z0 - 0.3)) return 0;
  if (x > -3 && x < 3.6 && z < -14.4 && z > -16.6) return 0;
  if (L.inStairs(x, z, 0.8)) return 0;
  const h = L.groundH(x, z);
  if (h > 0.9 && h < L.PLAT - 0.4) return 0; // cliff faces
  if (h > L.PLAT + 0.5 && h < L.UPPER - 0.4) return 0;
  return smooth(1.2, 2.4, pd) * (0.5 + 0.5 * smooth(-0.3, 0.3, n2(x * 0.2, z * 0.2) + 0.3));
}

function buildGrass(scene, quality, world) {
  const count = quality === 'low' ? 10000 : 20000;
  // blade card: two crossed quads
  const q1 = new THREE.PlaneGeometry(0.5, 0.3, 1, 2); q1.translate(0, 0.15, 0);
  const q2 = q1.clone(); q2.rotateY(Math.PI / 2);
  const q3 = q1.clone(); q3.rotateY(Math.PI / 4);
  const geo = mergeGeometries([q1, q2, q3]);
  const nrm = geo.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  const mat = new THREE.MeshStandardMaterial({ map: TEX.blade, alphaTest: 0.45, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 1 });
  const uni = { uTime: { value: 0 } };
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = uni.uTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 ip = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
        float sway = sin(uTime*1.7 + ip.x*0.35 + ip.z*0.27) * 0.08 + sin(uTime*3.1 + ip.x*1.3) * 0.025;
        transformed.x += sway * uv.y * uv.y;
        transformed.z += sway * 0.5 * uv.y * uv.y;`);
    s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb *= mix(0.8, 1.2, vMapUv.y);`);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  const c = new THREE.Color();
  let n = 0, tries = 0;
  const R = mulberry(3);
  while (n < count && tries < count * 8) {
    tries++;
    // denser near the reference camera, sparser further out
    const near = R() < 0.55;
    const x = near ? -14 + R() * 32 : -34 + R() * 70;
    const z = near ? -14 + R() * 26 : -32 + R() * 52;
    const a = grassAllowed(x, z);
    if (R() > a) continue;
    const y = L.groundH(x, z);
    e.set(0, R() * Math.PI, 0); q.setFromEuler(e);
    const sc = (0.75 + R() * 0.7) * (0.75 + 0.5 * a);
    s.set(sc * 1.1, sc * (0.8 + R() * 0.5), sc * 1.1);
    p.set(x, y - 0.03, z);
    m4.compose(p, q, s);
    mesh.setMatrixAt(n, m4);
    const hue = 0.22 + (R() - 0.5) * 0.04 + n2(x * 0.1, z * 0.1) * 0.02;
    c.setHSL(hue - 0.015, 0.55 + R() * 0.1, 0.62 + R() * 0.1 + n2(x * 0.3, z * 0.3) * 0.05);
    mesh.setColorAt(n, c);
    n++;
  }
  mesh.count = n;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  world.updaters.push((t) => { uni.uTime.value = t; });
}

function flowerTex() {
  return canvasTex(256, 64, (c) => {
    // four flower kinds side by side: purple spike, yellow, white, pink
    const kinds = [['#8a4fd8', '#c79bff'], ['#ffd21f', '#ff9d00'], ['#ffffff', '#ffe27a'], ['#ff5fae', '#ffd0e6']];
    kinds.forEach(([a, b], k) => {
      const ox = k * 64;
      c.strokeStyle = '#6fae2e'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(ox + 32, 64); c.lineTo(ox + 32, 30); c.stroke();
      if (k === 0) {
        for (let i = 0; i < 9; i++) { c.fillStyle = i % 2 ? a : b; c.beginPath(); c.arc(ox + 32 + (i % 2 ? 4 : -4), 8 + i * 4.5, 5, 0, 7); c.fill(); }
      } else {
        for (const [dx, dy] of [[-12, 14], [12, 18], [0, 8]]) {
          c.fillStyle = a;
          for (let p = 0; p < 5; p++) { const an = p * 1.2566; c.beginPath(); c.arc(ox + 32 + dx + Math.cos(an) * 5, 20 + dy - 6 + Math.sin(an) * 5, 4.2, 0, 7); c.fill(); }
          c.fillStyle = b; c.beginPath(); c.arc(ox + 32 + dx, 20 + dy - 6, 2.8, 0, 7); c.fill();
        }
      }
    });
  });
}

function buildFlowers(scene, quality) {
  const count = quality === 'low' ? 1500 : 3500;
  const q1 = new THREE.PlaneGeometry(0.4, 0.4); q1.translate(0, 0.2, 0);
  const q2 = q1.clone(); q2.rotateY(Math.PI / 2);
  const geo = mergeGeometries([q1, q2]);
  const nrm = geo.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  const kind = new Float32Array(count);
  const t = flowerTex();
  const mat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.9 });
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aKind;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vec2((uv.x + aKind) * 0.25, uv.y);');
  };
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const R = mulberry(11);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  let n = 0, tries = 0;
  // clusters
  const centers = [];
  for (let i = 0; i < 90; i++) centers.push([-26 + R() * 56, -24 + R() * 40, Math.floor(R() * 4)]);
  centers.push([-7.5, 0.5, 0], [-8.8, 1.2, 3], [-10, -0.5, 2], [10.5, 3.2, 3], [11.2, 2.5, 0], [-4.2, -3.2, 1], [5.2, -3.8, 2], [-12.2, -1.2, 0]);
  while (n < count && tries < count * 10) {
    tries++;
    const [cx, cz, k] = centers[Math.floor(R() * centers.length)];
    const x = cx + (R() - 0.5) * 3.2, z = cz + (R() - 0.5) * 2.4;
    if (grassAllowed(x, z) < 0.3) continue;
    e.set(0, R() * Math.PI, 0); q.setFromEuler(e);
    const sc = 0.7 + R() * 0.6;
    s.set(sc, sc * (k === 0 ? 1.6 : 1), sc);
    p.set(x, L.groundH(x, z) - 0.02, z);
    m4.compose(p, q, s);
    mesh.setMatrixAt(n, m4);
    kind[n] = Math.max(1, R() < 0.8 ? k : Math.floor(R() * 4));
    n++;
  }
  geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
  mesh.count = n;
  mesh.frustumCulled = false;
  scene.add(mesh);
}

// ---------------------------------------------------------------- sky + distance
function buildSky(scene, world) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; void main(){
      float h = max(vD.y, 0.0);
      vec3 zen = vec3(0.10,0.36,0.85), hor = vec3(0.50,0.74,0.95);
      vec3 c = mix(hor, zen, pow(h, 0.55));
      gl_FragColor = vec4(c,1.0);
      #include <colorspace_fragment>
    }`,
  }));
  sky.renderOrder = -10;
  scene.add(sky);
  world.sky = sky;
  // painted cloud sprites
  const cloud = canvasTex(256, 128, (c, w, h) => {
    for (let i = 0; i < 14; i++) {
      const x = w * (0.2 + Math.random() * 0.6), y = h * (0.45 + Math.random() * 0.25), r = 18 + Math.random() * 30;
      const g = c.createRadialGradient(x, y - r * 0.3, 2, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.6, 'rgba(245,250,255,0.75)'); g.addColorStop(1, 'rgba(220,235,250,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
  });
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloud, transparent: true, depthWrite: false, fog: false, opacity: 0.9 }));
    const a = -Math.PI / 2 + (rand() - 0.5) * 2.4;
    const d = 230;
    s.position.set(Math.cos(a) * d, 55 + rand() * 50, Math.sin(a) * d);
    s.scale.set(90 + rand() * 60, 34 + rand() * 18, 1);
    scene.add(s);
  }
  // distant mountain ring
  const ring = new THREE.CylinderGeometry(170, 170, 60, 160, 6, true);
  const rp = ring.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), z = rp.getZ(i), y = rp.getY(i);
    const a = Math.atan2(z, x);
    const top = 18 + n2(Math.cos(a) * 2, Math.sin(a) * 2) * 14 + n2(Math.cos(a) * 7, Math.sin(a) * 7) * 5 + Math.max(0, n2(a * 1.3, 4)) * 25;
    rp.setY(i, y > 0 ? top : -30);
  }
  ring.computeVertexNormals();
  vcolor(ring, 0x3f6a50, 0x7ea0b0, 0.05, -5, 45);
  const mtn = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: true }));
  scene.add(mtn);
  // distant forest of pine silhouettes on the hills
  const cone = new THREE.ConeGeometry(1.6, 7, 6); cone.translate(0, 3.5, 0);
  const forest = new THREE.InstancedMesh(cone, new THREE.MeshLambertMaterial({ color: 0x3a6a40 }), 400);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i < 2000 && k < 400; i++) {
    const a = rand() * Math.PI * 2, d = 75 + rand() * 60;
    const x = 3 + Math.cos(a) * d, z = -2 + Math.sin(a) * d;
    if (z > 20 && rand() < 0.7) continue;
    const s = 0.8 + rand() * 0.9;
    m4.makeScale(s, s * (0.9 + rand() * 0.5), s).setPosition(x, L.groundH(x, z) - 0.5, z);
    forest.setMatrixAt(k++, m4);
  }
  forest.count = k;
  scene.add(forest);
}
