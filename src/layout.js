// World layout: heights, masks and walkability. Units are metres.
// +x east (right in the reference shot), -z north (up the path toward the archway).
import { n2, smooth, lerp, clamp } from './util.js';

export const PLAT = 2.4;     // first cliff tier (archway level)
export const UPPER = 6.6;    // second tier (watchtower level)
export const STAIRS = { x0: -1.35, x1: 1.85, z0: -15.4, z1: -19.2, steps: 8 };
export const ARCH = { x: 0.25, z: -21.0 };
export const BRIDGE = { x0: 5.6, x1: 15.6, z: -17.2, w: 2.3, rise: 1.2 };
export const FALLS_X = 11.2;
export const HOUSE = { x0: -18, x1: -11.2, z0: -14.5, z1: -5.2, porchX: -7.7, floor: 0.5 };
export const RYN = { x: -6.9, z: -6.6 };
export const PLATFORM = { x0: 15.4, x1: 31, z0: -17.4, z1: -12.2 };
export const DUMMIES = [[17.2, -14.6], [20.6, -15.0], [24.0, -14.4]];

// path control points from the start to the foot of the stairs
export const PATH = [
  [-1.2, 22], [-0.8, 14], [-0.4, 8], [0.4, 3], [1.6, -2.5], [2.4, -7.5], [1.9, -11.2], [0.9, -13.8], [0.25, -15.6],
];

export function cliffZ(x) {
  let z = -19.1 + n2(x * 0.16, 3.1) * 0.9 + n2(x * 0.5, 1.3) * 0.25;
  const near = 1 - smooth(2.4, 4.5, Math.abs(x - 0.25));
  return lerp(z, -19.25, near);
}
export function upperZ(x) {
  let z = -22.6 + n2(x * 0.13, 7.7) * 1.2;
  const near = 1 - smooth(2.2, 4.2, Math.abs(x - ARCH.x));
  return lerp(z, -21.9, near);
}

function ellipseSD(x, z, cx, cz, rx, rz) {
  const dx = (x - cx) / rx, dz = (z - cz) / rz;
  return (Math.hypot(dx, dz) - 1) * Math.min(rx, rz);
}
function capsuleSD(x, z, ax, az, bx, bz, r) {
  const px = x - ax, pz = z - az, vx = bx - ax, vz = bz - az;
  const h = clamp((px * vx + pz * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(px - vx * h, pz - vz * h) - r;
}
/** Signed distance to the water outline (negative inside). */
export function pondSD(x, z) {
  const wob = n2(x * 0.3, z * 0.3) * 0.45;
  let d = ellipseSD(x, z, FALLS_X, -19.6, 2.4, 2.6);
  d = Math.min(d, capsuleSD(x, z, FALLS_X, -18.5, 10.4, -11.5, 1.9));
  d = Math.min(d, ellipseSD(x, z, 19.5, -8.0, 12.5, 3.6));
  d = Math.min(d, ellipseSD(x, z, 9.6, -8.4, 3.2, 3.0));
  return d + wob;
}
export const pondMask = (x, z) => smooth(0.8, -0.9, pondSD(x, z));

// distance from a point to the path polyline
export function pathDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    best = Math.min(best, capsuleSD(x, z, ax, az, bx, bz, 0));
  }
  return best;
}

export function groundH(x, z) {
  let h = n2(x * 0.045, z * 0.045) * 0.35 + n2(x * 0.14, z * 0.14) * 0.07;
  // the walkable area is kept gentle
  const r0 = Math.hypot(x - 2, (z + 2) * 0.8);
  h *= 0.4 + 0.6 * smooth(10, 26, r0);
  // first tier
  const cz = cliffZ(x);
  let t = smooth(cz + 0.9, cz - 0.9, z);
  const gorge = 1 - smooth(1.6, 2.8, Math.abs(x - FALLS_X));
  const uz = upperZ(x);
  t *= 1 - gorge * smooth(uz + 1.5, uz + 2.5, z);
  h = lerp(h, PLAT + n2(x * 0.11, z * 0.11) * 0.35, t);
  // second tier
  const t2 = smooth(uz + 0.9, uz - 0.9, z);
  h = lerp(h, UPPER + n2(x * 0.08, z * 0.08) * 0.6 + smooth(-30, -60, z) * 6, t2);
  // water
  h = lerp(h, -1.5, pondMask(x, z));
  // surrounding hills close off the play area
  const r = Math.hypot((x - 3) * 0.85, z + 2);
  h += smooth(40, 110, r) * 12 * (0.75 + 0.35 * n2(x * 0.04, z * 0.04));
  return h;
}

export const WATER_Y = -0.32;

export function stairsH(z) {
  const t = clamp((STAIRS.z0 - z) / (STAIRS.z0 - STAIRS.z1), 0, 1);
  return t * PLAT;
}
export function inStairs(x, z, pad = 0) {
  return x > STAIRS.x0 - pad && x < STAIRS.x1 + pad && z < STAIRS.z0 + 0.3 && z > STAIRS.z1 - 0.6;
}
export function bridgeH(x) {
  const t = clamp((x - BRIDGE.x0) / (BRIDGE.x1 - BRIDGE.x0), 0, 1);
  return 0.25 + BRIDGE.rise * Math.sin(Math.PI * t);
}
export function onBridge(x, z) {
  return x > BRIDGE.x0 - 0.4 && x < BRIDGE.x1 + 0.4 && Math.abs(z - BRIDGE.z) < BRIDGE.w / 2 - 0.15;
}
export function onPlatform(x, z) {
  return x > PLATFORM.x0 && x < PLATFORM.x1 && z > PLATFORM.z0 && z < PLATFORM.z1;
}

/** Height the player stands at, or null if the spot is not walkable. */
export function walkH(x, z, fromY) {
  if (inStairs(x, z)) return z < STAIRS.z1 ? PLAT : Math.max(stairsH(z), groundH(x, z));
  if (onBridge(x, z)) return bridgeH(x);
  if (x > HOUSE.x1 && x < HOUSE.porchX && z > HOUSE.z0 && z < HOUSE.z1) return HOUSE.floor;
  if (onPlatform(x, z)) return Math.max(groundH(x, z), 0.12);
  if (pondSD(x, z) < 0.35) return null;
  const h = groundH(x, z);
  if (fromY !== undefined && Math.abs(h - fromY) > 0.55) return null;
  return h;
}
