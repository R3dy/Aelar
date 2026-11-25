import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const simplex = new SimplexNoise({ random: mulberry(1234) });
export function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rand = mulberry(42);
export const rr = (a, b) => a + (b - a) * rand();
export const n2 = (x, y) => simplex.noise(x, y);
export const n3 = (x, y, z) => simplex.noise3d(x, y, z);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export function smooth(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Assign UVs by projecting world-space positions along the dominant normal axis. */
export function boxUV(geo, scale = 1, offset = new THREE.Vector3(), keepNormals = false) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  if (!keepNormals || !geo.attributes.normal) geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    // use the face normal so a triangle is projected consistently
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < 3; k++) { nx += n.getX(i + k); ny += n.getY(i + k); nz += n.getZ(i + k); }
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k) + offset.x, y = p.getY(i + k) + offset.y, z = p.getZ(i + k) + offset.z;
      let u, v;
      if (ay >= ax && ay >= az) { u = x; v = z; }
      else if (ax >= az) { u = z; v = y; }
      else { u = x; v = y; }
      uv[(i + k) * 2] = u * scale; uv[(i + k) * 2 + 1] = v * scale;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Displace vertices of a geometry by 3D noise along their direction from centre. */
export function lumpy(geo, amp = 0.2, freq = 1.5, seed = 0) {
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = n3(v.x * freq + seed, v.y * freq + seed * 1.7, v.z * freq - seed) * amp
      + n3(v.x * freq * 2.3 - seed, v.y * freq * 2.3, v.z * freq * 2.3 + seed) * amp * 0.4;
    const len = v.length() || 1;
    v.multiplyScalar((len + d) / len);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Paint vertex colours: gradient by height plus noise. */
export function vcolor(geo, bottom, top, noiseAmt = 0.08, y0 = null, y1 = null) {
  const p = geo.attributes.position;
  geo.computeBoundingBox();
  const lo = y0 ?? geo.boundingBox.min.y, hi = y1 ?? geo.boundingBox.max.y;
  const a = new THREE.Color(bottom), b = new THREE.Color(top), c = new THREE.Color();
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = clamp((p.getY(i) - lo) / (hi - lo || 1), 0, 1);
    c.copy(a).lerp(b, t);
    const nn = 1 + n3(p.getX(i) * 0.9, p.getY(i) * 0.9, p.getZ(i) * 0.9) * noiseAmt;
    col[i * 3] = c.r * nn; col[i * 3 + 1] = c.g * nn; col[i * 3 + 2] = c.b * nn;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
