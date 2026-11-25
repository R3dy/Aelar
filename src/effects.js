// Ability effects built in code, coloured from the HUD icons.
import * as THREE from 'three';
import { TEX } from './world.js';

const ORANGE = new THREE.Color(0xff8a1c), GOLD = new THREE.Color(0xffd060), BLUE = new THREE.Color(0x2fa8ff), CYAN = new THREE.Color(0x9fe8ff), RED = new THREE.Color(0xff2a3a);

export function createFX(scene) {
  const live = [];
  // pooled additive particles
  const MAX = 600;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), size = new Float32Array(MAX);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const pmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { map: { value: TEX.glow }, scale: { value: 500 } },
    vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC;
      uniform float scale;
      void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*scale/-mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC*t.a*1.6, t.a); }`,
  });
  const points = new THREE.Points(geo, pmat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);
  const parts = [];
  function emit(p, v, color, life, sz, drag = 1, grav = 0) {
    if (parts.length >= MAX) parts.shift();
    parts.push({ p: p.clone(), v: v.clone(), c: color.clone(), life, age: 0, sz, drag, grav });
  }
  function burst(at, color, n, speed, life = 0.6, sz = 0.35, up = 0.5) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * up, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      emit(at, v, color, life * (0.6 + Math.random() * 0.6), sz * (0.6 + Math.random() * 0.8), 0.92, -2);
    }
  }

  function add(obj, life, tick) { scene.add(obj); live.push({ obj, life, age: 0, tick }); }

  function ribbonMat(color, map) {
    return new THREE.MeshBasicMaterial({ color, map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  }
  const arcTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 32);
    const t = new THREE.CanvasTexture(c); return t;
  })();

  // 1: flame slash — a sweeping arc in front of the hero
  function slash(origin, yaw, color = ORANGE, radius = 2.2, width = 0.7) {
    const g = new THREE.RingGeometry(radius - width / 2, radius + width / 2, 32, 1, -Math.PI * 0.4, Math.PI * 0.8);
    // map u along the arc
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const a = Math.atan2(p.getY(i), p.getX(i));
      const r = Math.hypot(p.getX(i), p.getY(i));
      uv.setXY(i, (a + Math.PI * 0.4) / (Math.PI * 0.8), (r - (radius - width / 2)) / width);
    }
    const m = new THREE.Mesh(g, ribbonMat(color, arcTex));
    m.rotation.order = 'YXZ';
    m.rotation.set(-Math.PI / 2 + 0.25, yaw + Math.PI / 2, 0.3);
    m.position.copy(origin).add(new THREE.Vector3(0, 1.1, 0));
    const inner = new THREE.Mesh(g, ribbonMat(GOLD, arcTex)); inner.scale.setScalar(0.92); m.add(inner);
    add(m, 0.35, (t) => {
      m.material.opacity = 1 - t; inner.material.opacity = 1 - t;
      m.rotation.z = 0.3 - t * 0.9;
      m.scale.setScalar(0.85 + t * 0.35);
    });
    for (let i = 0; i < 26; i++) {
      const a = yaw + (Math.random() - 0.5) * 1.6;
      const at = origin.clone().add(new THREE.Vector3(Math.sin(a) * radius, 1.0 + Math.random() * 0.4, Math.cos(a) * radius));
      emit(at, new THREE.Vector3(Math.sin(a), 0.6, Math.cos(a)).multiplyScalar(1.5 + Math.random() * 2), Math.random() < 0.5 ? ORANGE : GOLD, 0.5, 0.35, 0.9, -1);
    }
  }

  // 2: lightning — jagged bolt between two points
  function bolt(a, b) {
    for (let k = 0; k < 2; k++) {
      const pts = [];
      const n = 12;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = a.clone().lerp(b, t);
        if (i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7));
        pts.push(p);
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), 40, k ? 0.03 : 0.09, 4);
      const m = new THREE.Mesh(tube, ribbonMat(k ? new THREE.Color(0xffffff) : BLUE));
      add(m, 0.35, (t) => { m.material.opacity = (1 - t) * (Math.random() < 0.3 ? 0.3 : 1); });
    }
    const flash = new THREE.PointLight(0x5ab8ff, 30, 10, 1.5);
    flash.position.copy(b);
    add(flash, 0.25, (t) => { flash.intensity = 30 * (1 - t); });
    burst(b, CYAN, 30, 4, 0.5, 0.3);
    burst(a, BLUE, 10, 2, 0.3, 0.25);
  }

  // 3: fire streak — projectile with a trail
  function fireball(start, dir, range, onHit) {
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xffb040, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    core.scale.setScalar(1.1);
    core.position.copy(start);
    const light = new THREE.PointLight(0xff8a2a, 12, 8, 1.6);
    core.add(light);
    const speed = 18;
    let travelled = 0, done = false;
    add(core, range / speed, (t, dt) => {
      if (done) return;
      const step = dir.clone().multiplyScalar(speed * dt);
      core.position.add(step);
      travelled += step.length();
      for (let i = 0; i < 4; i++) emit(core.position, new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5), Math.random() < 0.6 ? ORANGE : GOLD, 0.45, 0.45, 0.9, 1);
      if (onHit && onHit(core.position)) {
        done = true;
        burst(core.position, ORANGE, 40, 5, 0.6, 0.45);
        burst(core.position, GOLD, 20, 3, 0.5, 0.3);
        core.visible = false;
      }
    });
  }

  // 4: frost vortex — swirling ring around the hero
  function vortex(center) {
    const ringTex = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const g = c.getContext('2d');
      g.translate(128, 128);
      for (let i = 0; i < 5; i++) {
        g.rotate(Math.PI * 2 / 5);
        const gr = g.createLinearGradient(0, -110, 0, -20);
        gr.addColorStop(0, 'rgba(160,230,255,0)'); gr.addColorStop(1, 'rgba(160,230,255,1)');
        g.strokeStyle = gr; g.lineWidth = 10; g.lineCap = 'round';
        g.beginPath(); g.arc(0, 0, 90, -0.2, 1.1); g.stroke();
        g.beginPath(); g.arc(0, 0, 55, 0.4, 1.4); g.stroke();
      }
      return new THREE.CanvasTexture(c);
    })();
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ribbonMat(BLUE, ringTex));
    disc.rotation.x = -Math.PI / 2;
    disc.position.copy(center).add(new THREE.Vector3(0, 0.25, 0));
    const disc2 = disc.clone(); disc2.material = ribbonMat(CYAN, ringTex); disc2.position.y += 0.6;
    const light = new THREE.PointLight(0x4ab0ff, 20, 10, 1.4); light.position.copy(center).add(new THREE.Vector3(0, 1, 0));
    add(light, 0.9, (t) => { light.intensity = 20 * (1 - t); });
    add(disc2, 0.9, (t) => { disc2.rotation.z = -t * 9; disc2.scale.setScalar(1 + t * 6); disc2.material.opacity = 1 - t; });
    add(disc, 0.9, (t) => { disc.rotation.z = t * 7; disc.scale.setScalar(2 + t * 7); disc.material.opacity = 1 - t * t; });
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random();
      emit(center.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.3 + Math.random() * 1.5, Math.sin(a) * r)),
        new THREE.Vector3(Math.cos(a + 1.4) * 5, 0.5, Math.sin(a + 1.4) * 5), Math.random() < 0.5 ? BLUE : CYAN, 0.7, 0.35, 0.94, 0);
    }
  }

  function potion(center) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.5;
      emit(center.clone().add(new THREE.Vector3(Math.cos(a) * r, Math.random() * 1.6, Math.sin(a) * r)), new THREE.Vector3(0, 1.2 + Math.random(), 0), Math.random() < 0.6 ? RED : new THREE.Color(0xff8aa0), 0.9, 0.25, 0.97, 0);
    }
  }

  function hitSpark(at) { burst(at, GOLD, 14, 3.5, 0.35, 0.22); }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const L = live[i];
      L.age += dt;
      const t = Math.min(1, L.age / L.life);
      L.tick && L.tick(t, dt);
      if (L.age >= L.life) { scene.remove(L.obj); L.obj.traverse?.((o) => { o.geometry?.dispose?.(); }); live.splice(i, 1); }
    }
    let n = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      p.v.multiplyScalar(Math.pow(p.drag, dt * 60));
      p.v.y += p.grav * dt;
      p.p.addScaledVector(p.v, dt);
    }
    for (const p of parts) {
      const f = 1 - p.age / p.life;
      pos[n * 3] = p.p.x; pos[n * 3 + 1] = p.p.y; pos[n * 3 + 2] = p.p.z;
      col[n * 3] = p.c.r * f; col[n * 3 + 1] = p.c.g * f; col[n * 3 + 2] = p.c.b * f;
      size[n] = p.sz * (0.5 + f * 0.5);
      n++;
    }
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.size.needsUpdate = true;
  }
  function setScale(h) { pmat.uniforms.scale.value = h; }
  return { slash, bolt, fireball, vortex, potion, hitSpark, burst, update, setScale };
}
