// Kota Senja — the dusk city. Procedural grid city, two districts, plaza, neon.
// All geometry is boxes + canvas textures; no external assets, no network.
import * as THREE from '../vendor/three.module.min.js';
import { RNG, canvasTexture, signTexture, clamp, TAU } from './util.js';

export const STREET_LINES = [-162, -126, -90, -54, -18, 18, 54, 90, 126, 162];
export const BLOCK_CENTERS = [-144, -108, -72, -36, 0, 36, 72, 108, 144];
const BLOCK = 26;      // block size
const STREET_W = 10;   // street width
const CITY_R = 175;    // playable radius (soft bound)

// Building facade: dark base with a grid of windows, some lit warm or cool.
function facadeTexture(rng, base, litRatio) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // subtle vertical shading
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 2, h);
    const cols = 5, rows = 10, ww = 16, wh = 14;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = 10 + c * 22, y = 12 + r * 23;
        const lit = rng.next() < litRatio;
        g.fillStyle = lit ? (rng.next() < 0.75 ? '#ffd28a' : '#9fd8ff') : '#14101f';
        g.fillRect(x, y, ww, wh);
      }
    }
  });
}

function awningTexture(c1, c2) {
  return canvasTexture(128, 32, (g, w, h) => {
    for (let x = 0; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? c1 : c2; g.fillRect(x, 0, 16, h); }
  });
}

export function buildCity(scene, seed = 1) {
  const rng = RNG(seed);
  const group = new THREE.Group();
  scene.add(group);
  const colliders = []; // {x, z, hx, hz}
  const addCollider = (x, z, hx, hz) => colliders.push({ x, z, hx, hz });

  // ---- sky, light, sun, stars ----
  scene.background = new THREE.Color(0x2e1445);
  scene.fog = new THREE.Fog(0x2e1445, 70, 320);
  const hemi = new THREE.HemisphereLight(0x8a5ab0, 0x1c1026, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 1.5);
  sun.position.set(-180, 42, -60);
  scene.add(sun);
  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(16, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xff9a3c, fog: false }),
  );
  sunBall.position.set(-250, 30, -90);
  group.add(sunBall);
  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(24, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.28, fog: false }),
  );
  sunGlow.position.copy(sunBall.position);
  group.add(sunGlow);
  // stars
  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 420; i++) {
    const a = rng.range(0, TAU), r = rng.range(180, 320), y = rng.range(70, 260);
    starPos.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, fog: false })));

  // ---- ground + roads ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(360, 360),
    new THREE.MeshLambertMaterial({ color: 0x241a2e }),
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x322540 });
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xffd76a });
  const crossMat = new THREE.MeshLambertMaterial({ color: 0xd8d2e8 });
  for (const s of STREET_LINES) {
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(360, STREET_W), roadMat);
    rx.rotation.x = -Math.PI / 2; rx.position.set(0, 0.02, s); group.add(rx);
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(STREET_W, 360), roadMat);
    rz.rotation.x = -Math.PI / 2; rz.position.set(s, 0.02, 0); group.add(rz);
    // center dashes
    for (let d = -162; d < 162; d += 12) {
      const dx = new THREE.Mesh(new THREE.BoxGeometry(5, 0.06, 0.35), dashMat);
      dx.position.set(d, 0.05, s); group.add(dx);
      const dz = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 5), dashMat);
      dz.position.set(s, 0.05, d); group.add(dz);
    }
    // crosswalks at the central intersections
    for (const t of [-54, 0, 54]) {
      for (let k = -2; k <= 2; k++) {
        const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 7), crossMat);
        c1.position.set(s + k * 2.2, 0.05, t - 7.5); group.add(c1);
        const c2 = new THREE.Mesh(new THREE.BoxGeometry(7, 0.06, 1.1), crossMat);
        c2.position.set(t - 7.5, 0.05, s + k * 2.2); group.add(c2);
      }
    }
  }

  // ---- shared materials / textures ----
  const texRes1 = facadeTexture(RNG(seed + 11), '#4a3560', 0.55);
  const texRes2 = facadeTexture(RNG(seed + 22), '#3d2c50', 0.45);
  const texRes3 = facadeTexture(RNG(seed + 33), '#54402e', 0.5);
  const texShop = facadeTexture(RNG(seed + 44), '#5e2f52', 0.7);
  const texWare = facadeTexture(RNG(seed + 55), '#4c3a28', 0.12);
  const matRes = [texRes1, texRes2, texRes3].map((t) => new THREE.MeshLambertMaterial({
    map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.5,
  }));
  const matShop = new THREE.MeshLambertMaterial({ map: texShop, emissive: 0xffffff, emissiveMap: texShop, emissiveIntensity: 0.55 });
  const matWare = new THREE.MeshLambertMaterial({ map: texWare, emissive: 0xffffff, emissiveMap: texWare, emissiveIntensity: 0.25 });
  const matRoof = new THREE.MeshLambertMaterial({ color: 0x241a30 });
  const matSidewalk = new THREE.MeshLambertMaterial({ color: 0x3a2c4c });
  const matContainer = [0xb03a4b, 0x2e7f9e, 0xc77b21, 0x4a7a3a].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const awnTex = [awningTexture('#ff2e88', '#fff2f8'), awningTexture('#ff9a3c', '#fff6ea'), awningTexture('#22e6ff', '#eafcff')];
  const matAwn = awnTex.map((t) => new THREE.MeshLambertMaterial({ map: t }));
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2138 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe6b0, emissive: 0xffc46b, emissiveIntensity: 1.4 });
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.10, depthWrite: false });
  const stallCols = [0xff2e88, 0x22e6ff, 0xff9a3c, 0x7cfc66];

  const neonSigns = []; // flickering signs {mat, base, phase}
  function neonSign(text, fg, w = 2.2) {
    const tex = new THREE.CanvasTexture(signTexture(text, { fg }));
    tex.colorSpace = THREE.SRGBColorSpace;
    const aspect = tex.image.width / tex.image.height;
    const mat = new THREE.MeshLambertMaterial({
      map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.6, transparent: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w * aspect, w), mat);
    neonSigns.push({ mat, base: 1.6, phase: rng.range(0, TAU) });
    return mesh;
  }

  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

  // ---- blocks: north = warehouses (Gudang), south = market (Pasar), middle = homes ----
  const districtOf = (bx, bz) => (bz <= -54 ? 'gudang' : bz >= 54 ? 'pasar' : 'campur');
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      if (bx === 0 && bz === 0) continue; // plaza, built below
      const district = districtOf(bx, bz);
      // sidewalk slab
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK + 1, BLOCK + 1), matSidewalk);
      walk.rotation.x = -Math.PI / 2; walk.position.set(bx, 0.12, bz); group.add(walk);
      if (district === 'gudang') {
        // warehouse + containers
        const w = rng.range(16, 21), d = rng.range(9, 13), h = rng.range(7, 10);
        const wh = box(w, h, d, matWare);
        wh.position.set(bx, h / 2 + 0.12, bz); group.add(wh);
        const roof = box(w + 0.4, 0.4, d + 0.4, matRoof);
        roof.position.set(bx, h + 0.3, bz); group.add(roof);
        addCollider(bx, bz, w / 2, d / 2);
        for (let i = 0; i < rng.int(1, 3); i++) {
          const cx = bx + rng.range(-9, 9), cz = bz + rng.range(-9, 9);
          if (Math.abs(cx - bx) < w / 2 + 2 && Math.abs(cz - bz) < d / 2 + 2) continue;
          const cont = box(6, 2.6, 2.6, matContainer[rng.int(0, 3)]);
          cont.position.set(cx, 1.42, cz); cont.rotation.y = rng.chance(0.5) ? 0 : Math.PI / 2;
          group.add(cont); addCollider(cx, cz, 3.1, 1.4);
        }
        if (rng.chance(0.3)) {
          const sign = neonSign(rng.pick(['GUDANG 7', 'GUDANG 3', 'BERAS CAP SENJA']), '#ff9a3c', 1.8);
          sign.position.set(bx, h * 0.72, bz + d / 2 + 0.15); group.add(sign);
        }
      } else if (district === 'pasar') {
        // market shops with awnings + stalls + neon
        const n = rng.int(2, 3);
        for (let i = 0; i < n; i++) {
          const ox = (i - (n - 1) / 2) * 10;
          const w = rng.range(7, 9), h = rng.range(5.5, 8), d = rng.range(6, 8);
          const shop = box(w, h, d, matShop);
          shop.position.set(bx + ox, h / 2 + 0.12, bz + rng.range(-3, 3)); group.add(shop);
          addCollider(bx + ox, shop.position.z, w / 2, d / 2);
          const awn = box(w + 0.6, 0.25, 3.2, matAwn[rng.int(0, 2)]);
          awn.position.set(shop.position.x, 3.1, shop.position.z + d / 2 + 1.2); group.add(awn);
          if (rng.chance(0.75)) {
            const sign = neonSign(rng.pick(['KEDAI KOPI', 'BUNGA SENJA', 'WARTEG 24', 'SENJA MART', 'SATE SENJA', 'BENGKEL']), rng.pick(['#ff2e88', '#22e6ff', '#ff9a3c', '#7cfc66']), 1.5);
            sign.position.set(shop.position.x, h * 0.78, shop.position.z + d / 2 + 0.12); group.add(sign);
          }
        }
        // stalls on the sidewalk edge
        for (let i = 0; i < rng.int(1, 2); i++) {
          const sx = bx + rng.range(-10, 10), sz = bz + rng.range(8, 11);
          const stall = box(3, 2.4, 2.4, new THREE.MeshLambertMaterial({ color: stallCols[rng.int(0, 3)] }));
          stall.position.set(sx, 1.32, sz); group.add(stall); addCollider(sx, sz, 1.6, 1.3);
          const awn = box(3.6, 0.2, 3, matAwn[rng.int(0, 2)]);
          awn.position.set(sx, 2.7, sz); group.add(awn);
        }
      } else {
        // residential / mixed: 1-2 apartment blocks
        const n = rng.chance(0.6) ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const ox = n === 2 ? (i === 0 ? -6 : 6) : 0;
          const w = rng.range(10, 13), d = rng.range(10, 13), h = rng.range(11, 30);
          const b = box(w, h, d, matRes[rng.int(0, 2)]);
          b.position.set(bx + ox, h / 2 + 0.12, bz + rng.range(-3, 3)); group.add(b);
          const roof = box(w * 0.4, 1.2, d * 0.4, matRoof);
          roof.position.set(b.position.x, h + 0.7, b.position.z); group.add(roof);
          addCollider(b.position.x, b.position.z, w / 2, d / 2);
        }
        if (rng.chance(0.25)) {
          const sign = neonSign(rng.pick(['KOS SENJA', 'LAUNDRY', 'FOTOKOPI']), '#22e6ff', 1.4);
          sign.position.set(bx, 6, bz + 7); group.add(sign);
        }
      }
    }
  }

  // ---- plaza (block 0,0): fountain + SENJA arch ----
  const plazaWalk = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK + 1, BLOCK + 1), new THREE.MeshLambertMaterial({ color: 0x4a3560 }));
  plazaWalk.rotation.x = -Math.PI / 2; plazaWalk.position.set(0, 0.12, 0); group.add(plazaWalk);
  const fountainBase = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.8, 1.1, 20), new THREE.MeshLambertMaterial({ color: 0x6b5a8a }));
  fountainBase.position.set(0, 0.65, 0); group.add(fountainBase);
  const water = new THREE.Mesh(new THREE.CircleGeometry(4.1, 20), new THREE.MeshLambertMaterial({ color: 0x22e6ff, emissive: 0x2288aa, emissiveIntensity: 0.7 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 1.2, 0); group.add(water);
  const fountainTop = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 2.2, 12), new THREE.MeshLambertMaterial({ color: 0x8a76b0 }));
  fountainTop.position.set(0, 2.2, 0); group.add(fountainTop);
  addCollider(0, 0, 4.8, 4.8);
  // SENJA arch over the south plaza entrance
  const archMat = new THREE.MeshLambertMaterial({ color: 0x2a1a3e });
  for (const px of [-7, 7]) {
    const pillar = box(1.2, 9, 1.2, archMat);
    pillar.position.set(px, 4.5, 20); group.add(pillar); addCollider(px, 20, 0.7, 0.7);
  }
  const beam = box(15.6, 1.6, 1.2, archMat);
  beam.position.set(0, 9.4, 20); group.add(beam);
  const archSign = neonSign('SENJA', '#ff2e88', 3.2);
  archSign.position.set(0, 7.6, 19.3); group.add(archSign);

  // ---- streetlights at every other intersection ----
  for (const sx of STREET_LINES) {
    for (const sz of STREET_LINES) {
      if ((STREET_LINES.indexOf(sx) + STREET_LINES.indexOf(sz)) % 2 !== 0) continue;
      if (Math.abs(sx) > 150 || Math.abs(sz) > 150) continue;
      const px = sx + 6.5, pz = sz + 6.5;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.5, 8), poleMat);
      pole.position.set(px, 3.25, pz); group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), lampMat);
      lamp.position.set(px, 6.6, pz); group.add(lamp);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(5, 16), poolMat);
      pool.rotation.x = -Math.PI / 2; pool.position.set(px, 0.06, pz); group.add(pool);
    }
  }

  // ---- distant skyline silhouette ----
  const skyMat = new THREE.MeshLambertMaterial({ color: 0x1c0f30 });
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * TAU + rng.range(-0.05, 0.05);
    const r = rng.range(210, 265);
    const w = rng.range(14, 30), h = rng.range(18, 62), d = rng.range(14, 30);
    const b = box(w, h, d, skyMat);
    b.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    group.add(b);
  }

  // ---- named spots (missions, respawns, saves) ----
  const spots = {
    market: { x: 0, z: 90 },
    warehouse: { x: 0, z: -108 },
    pier: { x: -150, z: 162 },
    garage: { x: -108, z: 18 },
    hospital: { x: 108, z: -18 },
    policeStation: { x: 54, z: -54 },
    plaza: { x: 0, z: 0 },
    home: { x: 18, z: 126 },
  };

  /** Push a circle (x,z,r) out of building colliders; returns true if it hit. */
  function collideCircle(p, r) {
    let hit = false;
    for (const c of colliders) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const ox = c.hx + r - Math.abs(dx), oz = c.hz + r - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        hit = true;
        if (ox < oz) p.x = c.x + Math.sign(dx || 1) * (c.hx + r);
        else p.z = c.z + Math.sign(dz || 1) * (c.hz + r);
      }
    }
    // soft city bound
    const d = Math.hypot(p.x, p.z);
    if (d > CITY_R) { const s = CITY_R / d; p.x *= s; p.z *= s; hit = true; }
    return hit;
  }

  const randomRoadPoint = (r) => {
    const horiz = r.chance(0.5);
    const line = r.pick(STREET_LINES);
    const along = r.range(-150, 150);
    return horiz ? { x: along, z: line } : { x: line, z: along };
  };
  const randomSidewalkPoint = (r) => {
    const bx = r.pick(BLOCK_CENTERS), bz = r.pick(BLOCK_CENTERS);
    return { x: bx + r.range(-11, 11), z: bz + r.range(-11, 11) };
  };

  function update(dt, t) {
    water.rotation.z += dt * 0.4;
    sunGlow.material.opacity = 0.24 + Math.sin(t * 0.4) * 0.06;
    for (const s of neonSigns) {
      // a few signs buzz and flicker; most just breathe gently
      const flick = Math.sin(t * 7 + s.phase) > 0.86 ? 0.25 : 1;
      s.mat.emissiveIntensity = s.base * flick * (0.92 + Math.sin(t * 1.3 + s.phase) * 0.08);
    }
  }

  return { group, colliders, spots, collideCircle, randomRoadPoint, randomSidewalkPoint, update };
}
