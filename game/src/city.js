// city.js — procedural dusk city for Kota Senja.
// Roads run on a 36-unit grid; blocks between them hold buildings, the
// market, the warehouse, the garage and the pier. Everything is built from
// boxes, planes and canvas textures — no external assets, no network.

import * as THREE from 'three';
import { mulberry32, rand, randInt, pick } from './util.js';

export const ROAD_COORDS = [-162, -126, -90, -54, -18, 18, 54, 90, 126, 162];
export const ROAD_HALF = 5;
export const CITY_EXTENT = 180;

// Named places the missions and the test driver use.
export const PLACES = {
  warehouse: { x: 0, z: -117 },
  kiosk: { x: 0, z: 90 },
  market: { x: 0, z: 84 },
  pier: { x: 0, z: 162 },
  garage: { x: -126, z: 126 },
  turf: { x: -90, z: -54 },
  goldSedan: { x: 126, z: -18 },
  ownCar: { x: 22, z: 126 },
};

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0e0d1a';
  g.fillRect(0, 0, 128, 256);
  const rng = mulberry32(7);
  for (let y = 12; y < 244; y += 22) {
    for (let x = 10; x < 118; x += 20) {
      const lit = rng() < 0.55;
      g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98a' : '#9fd8ff') : '#1c1a2e';
      g.fillRect(x, y, 12, 14);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#211d2c';
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#3a3348';
  g.fillRect(0, 0, 3, 256);
  g.fillRect(61, 0, 3, 256);
  g.fillStyle = '#b8b49a';
  g.fillRect(30, 20, 4, 60);
  g.fillRect(30, 148, 4, 60);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function textTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  g.font = 'bold 56px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 22;
  g.fillStyle = color;
  g.fillText(text, 256, 64);
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.fillText(text, 256, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function neonSign(scene, text, color, x, y, z, ry, w = 14) {
  const mat = new THREE.MeshBasicMaterial({
    map: textTexture(text, color),
    transparent: true,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  scene.add(m);
  return m;
}

export function buildCity(scene, seed = 1) {
  const rng = mulberry32(seed);
  const colliders = [];
  const addCollider = (x, z, hw, hd) => {
    colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  };

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshStandardMaterial({ color: 0x16111f, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);

  // Roads with dashed centrelines.
  const roadTex = roadTexture();
  const roadMatV = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
  roadTex.repeat.set(1, 16);
  const roadTexH = roadTexture();
  roadTexH.center.set(0.5, 0.5);
  roadTexH.rotation = Math.PI / 2;
  roadTexH.repeat.set(1, 16);
  const roadMatH = new THREE.MeshStandardMaterial({ map: roadTexH, roughness: 0.95 });
  for (const c of ROAD_COORDS) {
    const rv = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 400), roadMatV);
    rv.rotation.x = -Math.PI / 2;
    rv.position.set(c, 0, 0);
    scene.add(rv);
    const rh = new THREE.Mesh(new THREE.PlaneGeometry(400, ROAD_HALF * 2), roadMatH);
    rh.rotation.x = -Math.PI / 2;
    rh.position.set(0, 0.001, c);
    scene.add(rh);
  }

  // Buildings, one or two per block. A block is the square between two
  // neighbouring roads; special blocks are left for the market, the
  // warehouse, the garage and the pier.
  const winTex = windowTexture();
  const facadeColors = [0x2a2438, 0x33262e, 0x24303a, 0x2e2a33, 0x3a2c22];
  const special = (bx, bz) => {
    // Market row around the kiosk, warehouse block, garage block, pier.
    if (bz === 90 && bx >= -72 && bx <= 72) return 'market';
    if (bx === 0 && bz === -108) return 'warehouse';
    if (bx === -126 && bz === 126) return 'garage';
    if (bz === 162) return 'pier';
    return null;
  };
  for (let i = 0; i < ROAD_COORDS.length - 1; i++) {
    for (let j = 0; j < ROAD_COORDS.length - 1; j++) {
      const bx = (ROAD_COORDS[i] + ROAD_COORDS[i + 1]) / 2;
      const bz = (ROAD_COORDS[j] + ROAD_COORDS[j + 1]) / 2;
      const kind = special(bx, bz);
      if (kind === 'market' || kind === 'pier') continue;
      if (kind === 'warehouse') {
        const wh = new THREE.Mesh(
          new THREE.BoxGeometry(32, 11, 16),
          new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.9 }),
        );
        wh.position.set(0, 5.5, -104);
        scene.add(wh);
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(34, 1, 18),
          new THREE.MeshStandardMaterial({ color: 0x2c2430, roughness: 1 }),
        );
        roof.position.set(0, 11.5, -104);
        scene.add(roof);
        addCollider(0, -104, 17, 9);
        neonSign(scene, 'GUDANG', '#ffb347', 0, 13.5, -95, 0, 12);
        continue;
      }
      if (kind === 'garage') {
        const g = new THREE.Mesh(
          new THREE.BoxGeometry(24, 8, 14),
          new THREE.MeshStandardMaterial({ color: 0x2e3a2e, roughness: 0.9 }),
        );
        g.position.set(-126, 4, 140);
        scene.add(g);
        addCollider(-126, 140, 13, 8);
        neonSign(scene, 'BENGKEL', '#7dffce', -126, 10, 132, 0, 10);
        continue;
      }
      const n = rng() < 0.6 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const w = rand(rng, 10, 18);
        const d = rand(rng, 10, 18);
        const h = rand(rng, 9, 30);
        const ox = n === 1 ? 0 : (k === 0 ? -6 : 6);
        const oz = n === 1 ? 0 : (k === 0 ? -6 : 6);
        const x = bx + ox;
        const z = bz + oz;
        const side = new THREE.MeshStandardMaterial({
          map: winTex,
          color: pick(rng, facadeColors),
          roughness: 0.9,
        });
        const top = new THREE.MeshStandardMaterial({ color: 0x1a1626, roughness: 1 });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, top, side, side]);
        b.position.set(x, h / 2, z);
        scene.add(b);
        addCollider(x, z, w / 2 + 0.5, d / 2 + 0.5);
      }
    }
  }

  // Market stalls along the kiosk street (z = 90), leaving a clear patch
  // around x = 0 for the delivery point and the ambush.
  const stallColors = [0xd94f70, 0x4f9fd8, 0xe8a33d, 0x7d5fd0, 0x3fae7a];
  for (const z of [78, 102]) {
    for (let x = -66; x <= 66; x += 12) {
      if (Math.abs(x) < 10) continue;
      const stall = new THREE.Mesh(
        new THREE.BoxGeometry(7, 2.6, 4),
        new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 1 }),
      );
      stall.position.set(x, 1.3, z);
      scene.add(stall);
      const awn = new THREE.Mesh(
        new THREE.BoxGeometry(7.6, 0.25, 4.6),
        new THREE.MeshStandardMaterial({ color: pick(rng, stallColors), roughness: 0.8 }),
      );
      awn.position.set(x, 3.1, z);
      awn.rotation.x = 0.12;
      scene.add(awn);
      addCollider(x, z, 3.8, 2.3);
    }
  }
  // The flower kiosk itself, just off the road at the delivery point.
  const kiosk = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3, 4),
    new THREE.MeshStandardMaterial({ color: 0x6b2d5c, roughness: 0.85 }),
  );
  kiosk.position.set(0, 1.5, 97);
  scene.add(kiosk);
  const kioskRoof = new THREE.Mesh(
    new THREE.BoxGeometry(6.8, 0.3, 4.8),
    new THREE.MeshStandardMaterial({ color: 0xe86ba8, roughness: 0.7 }),
  );
  kioskRoof.position.set(0, 3.4, 97);
  scene.add(kioskRoof);
  addCollider(0, 97, 3.5, 2.5);
  neonSign(scene, 'KIOS BUNGA SENJA', '#ff7ad9', 0, 5.2, 94.6, 0, 16);
  neonSign(scene, 'PASAR SENJA', '#ffd166', -36, 6, 84.6, 0, 12);
  neonSign(scene, 'DERMAGA', '#7dd8ff', 0, 6, 158, 0, 10);

  // Pier planks and water south of the city.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 200),
    new THREE.MeshStandardMaterial({ color: 0x0d2b45, roughness: 0.35, metalness: 0.4 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.2, 268);
  scene.add(water);
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.6, 26),
    new THREE.MeshStandardMaterial({ color: 0x5a4128, roughness: 1 }),
  );
  pier.position.set(0, 0.3, 178);
  scene.add(pier);

  // Street lamps at every other intersection.
  const lampPole = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  const lampHead = new THREE.SphereGeometry(0.5, 8, 6);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  for (let i = 0; i < ROAD_COORDS.length; i += 2) {
    for (let j = 0; j < ROAD_COORDS.length; j += 2) {
      const x = ROAD_COORDS[i] + 6;
      const z = ROAD_COORDS[j] + 6;
      const pole = new THREE.Mesh(lampPole, lampPoleMat);
      pole.position.set(x, 3, z);
      scene.add(pole);
      const head = new THREE.Mesh(lampHead, lampHeadMat);
      head.position.set(x, 6.2, z);
      scene.add(head);
    }
  }

  // Turf hangout: crates and a rival sign near the turf point.
  for (const [cx, cz] of [[-84, -48], [-80, -50], [-86, -52]]) {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2.2, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 1 }),
    );
    crate.position.set(cx, 1.1, cz);
    scene.add(crate);
    addCollider(cx, cz, 1.3, 1.3);
  }
  neonSign(scene, 'GENG PURNAMA', '#c77dff', -84, 5, -46, 0, 12);

  return { colliders, places: PLACES };
}

// Push a circle (x, z, radius) out of every building collider. Returns true
// when a push happened.
export function collide(colliders, x, z, radius) {
  let hit = false;
  let nx = x;
  let nz = z;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(nx, c.maxX));
    const cz = Math.max(c.minZ, Math.min(nz, c.maxZ));
    const dx = nx - cx;
    const dz = nz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * radius;
        nz = cz + (dz / d) * radius;
      } else {
        nz = c.maxZ + radius;
      }
    }
  }
  return { x: nx, z: nz, hit };
}

export function insideCity(x, z) {
  return Math.abs(x) < CITY_EXTENT + 40 && Math.abs(z) < CITY_EXTENT + 40;
}
