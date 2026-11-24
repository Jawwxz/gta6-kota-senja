// Kota Senja — small shared helpers: seeded RNG, math, canvas textures.
// No network, no dependencies beyond the vendored three.js.
import * as THREE from '../vendor/three.module.min.js';

export const TAU = Math.PI * 2;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
/** Frame-rate independent damping factor. */
export function damp(rate, dt) { return 1 - Math.exp(-rate * dt); }
/** Shortest signed angle difference, in [-PI, PI]. */
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function dist2(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

/** Deterministic RNG (mulberry32). Same seed => same city, same traffic. */
export function RNG(seed) {
  let s = seed >>> 0;
  const next = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => Math.floor(a + next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

/** Canvas texture from a draw callback; used for facades, signs, awnings. */
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Bold sign texture with glowing text on a dark plate. */
export function signTexture(text, { fg = '#ff2e88', bg = '#160a24', font = 64 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `800 ${font}px 'Segoe UI', sans-serif`;
  const tw = Math.ceil(ctx.measureText(text).width);
  c.width = tw + 48; c.height = font + 56;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(4, 4, c.width - 8, c.height - 8);
  g.font = `800 ${font}px 'Segoe UI', sans-serif`;
  g.textBaseline = 'middle';
  g.shadowColor = fg; g.shadowBlur = 22;
  g.fillStyle = fg; g.fillText(text, 24, c.height / 2 + 2);
  return c;
}
