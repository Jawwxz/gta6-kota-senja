// util.js — small shared helpers for Kota Senja: seeded random, math, money.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rand(rng, a, b) {
  return a + rng() * (b - a);
}

export function randInt(rng, a, b) {
  return Math.floor(rand(rng, a, b + 1));
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function fmtCash(n) {
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}
