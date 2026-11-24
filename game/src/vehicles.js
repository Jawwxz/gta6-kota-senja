// Kota Senja — cars: player driving, traffic AI, police chase, parked stealables.
import * as THREE from '../vendor/three.module.min.js';
import { RNG, clamp, angDiff, damp, dist2 } from './util.js';
import { STREET_LINES } from './city.js';

const CAR_COLORS = [0xc23b4e, 0x2e7f9e, 0xd8a13a, 0x5a6b8a, 0x7a4a9e, 0x3a7a4a, 0xd8d2c8, 0x30343c, 0x8a2f2f, 0x3f6fb5];

function makeCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14101f });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2a3a, emissive: 0x0a1420, emissiveIntensity: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.72, 1.9), bodyMat);
  body.position.y = 0.62; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 1.7), glassMat);
  cabin.position.set(-0.25, 1.22, 0); g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 1.6), bodyMat);
  roof.position.set(-0.25, 1.56, 0); g.add(roof);
  // bumpers
  const bump = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 1.9), darkMat);
  bump.position.set(2.1, 0.42, 0); g.add(bump);
  const bump2 = bump.clone(); bump2.position.x = -2.1; g.add(bump2);
  // headlights / taillights
  const hlMat = new THREE.MeshLambertMaterial({ color: 0xfff2c8, emissive: 0xffe6a0, emissiveIntensity: 1.6 });
  for (const z of [-0.62, 0.62]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.34), hlMat);
    hl.position.set(2.12, 0.68, z); g.add(hl);
  }
  const tlMat = new THREE.MeshLambertMaterial({ color: 0x881111, emissive: 0xdd2222, emissiveIntensity: 0.9 });
  for (const z of [-0.62, 0.62]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.34), tlMat);
    tl.position.set(-2.12, 0.68, z); g.add(tl);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
  wheelGeo.rotateX(Math.PI / 2);
  const wheels = [], steerWheels = [];
  for (const [x, z] of [[1.35, 0.85], [1.35, -0.85], [-1.35, 0.85], [-1.35, -0.85]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(x, 0.42, z); g.add(w); wheels.push(w);
    if (x > 0) steerWheels.push(w);
  }
  let bar = null;
  if (opts.police) {
    bar = new THREE.Group();
    const rMat = new THREE.MeshLambertMaterial({ color: 0xdd1111, emissive: 0xff2222, emissiveIntensity: 2 });
    const bMat = new THREE.MeshLambertMaterial({ color: 0x1122dd, emissive: 0x2244ff, emissiveIntensity: 2 });
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), rMat);
    r.position.z = -0.45; bar.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), bMat);
    b.position.z = 0.45; bar.add(b);
    bar.position.set(-0.25, 1.68, 0);
    g.add(bar);
    bar.userData = { rMat, bMat };
    // police livery: white body with dark doors
    bodyMat.color.set(0xe8e8e8);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.92), new THREE.MeshLambertMaterial({ color: 0x1c2a4a }));
    door.position.set(0.1, 0.66, 0); g.add(door);
  }
  // fake blob shadow
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.4),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; g.add(shadow);
  return { group: g, wheels, steerWheels, bar, bodyMat };
}

export function createVehicles(G) {
  const { scene, city, audio } = G;
  const rng = RNG(777);
  const cars = [];      // every car
  const traffic = [];   // moving AI cars
  const police = [];    // police cars
  const parked = [];    // parked stealables
  let headlight = null;

  function newCar(color, kind, x, z, heading, opts = {}) {
    const { group, wheels, steerWheels, bar, bodyMat } = makeCarMesh(color, opts);
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    scene.add(group);
    const car = {
      mesh: group, wheels, steerWheels, bar, bodyMat,
      pos: group.position, heading, speed: 0, steer: 0,
      kind, color, own: !!opts.own, target: !!opts.target,
      route: [], nodeIdx: 0, targetSpeed: rng.range(9, 13),
      stuck: 0, lastPos: { x, z }, sirenPhase: rng.range(0, 1),
      brakeLight: 0,
    };
    cars.push(car);
    return car;
  }

  // ---- road graph: intersections of street lines ----
  function nodeFor(x, z) {
    let bx = STREET_LINES[0], bz = STREET_LINES[0];
    for (const s of STREET_LINES) { if (Math.abs(s - x) < Math.abs(bx - x)) bx = s; if (Math.abs(s - z) < Math.abs(bz - z)) bz = s; }
    return { x: bx, z: bz };
  }
  function lanePoint(from, to) {
    // right-hand lane offset
    const dx = to.x - from.x, dz = to.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    const rx = -dz / len, rz = dx / len; // right of travel
    return { x: to.x + rx * 2.2, z: to.z + rz * 2.2 };
  }
  function pickNextNode(car, goal) {
    const cur = nodeFor(car.pos.x, car.pos.z);
    const options = [];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx * 36, nz = cur.z + dz * 36;
      if (nx < -162 || nx > 162 || nz < -162 || nz > 162) continue;
      // avoid immediate U-turn unless no choice
      const back = car.route.length > 1 &&
        nx === car.route[car.route.length - 2].x && nz === car.route[car.route.length - 2].z;
      options.push({ x: nx, z: nz, back });
    }
    let pool = options.filter((o) => !o.back);
    if (!pool.length) pool = options;
    if (goal) {
      pool.sort((a, b) => (dist2(a.x, a.z, goal.x, goal.z) - dist2(b.x, b.z, goal.x, goal.z)) + rng.range(-14, 14));
      return pool[0];
    }
    return pool[Math.floor(rng.next() * pool.length)];
  }

  function spawnInitial() {
    // traffic
    for (let i = 0; i < 13; i++) {
      const p = city.randomRoadPoint(RNG(100 + i));
      const heading = rng.chance(0.5) ? 0 : Math.PI / 2;
      const c = newCar(CAR_COLORS[i % CAR_COLORS.length], 'traffic', p.x, p.z, heading + (rng.chance(0.5) ? Math.PI : 0));
      c.route = [nodeFor(p.x, p.z), pickNextNode(c)];
      traffic.push(c);
    }
    // parked stealables along market + residential streets
    const parkSpots = [
      [10, 90, 0], [-14, 90, Math.PI], [36, 126, Math.PI / 2], [-30, 54, 0],
      [46, -18, Math.PI], [-46, 126, 0], [90, 36, Math.PI / 2], [-90, -36, Math.PI],
    ];
    parkSpots.forEach(([x, z, h], i) => {
      const c = newCar(CAR_COLORS[(i + 3) % CAR_COLORS.length], 'parked', x, z, h);
      parked.push(c);
    });
    // the mission-4 target: gold sedan, east residential
    const target = newCar(0xd8a13a, 'parked', 126, -30, Math.PI / 2, { target: true });
    parked.push(target);
    // Dimas' own beat-up sedan near home (no wanted for taking it)
    const own = newCar(0x5a6b8a, 'parked', 24, 126, Math.PI, { own: true });
    parked.push(own);
  }

  function attachHeadlight(car) {
    if (headlight) { headlight.parent?.remove(headlight); headlight = null; }
    if (!car) return;
    headlight = new THREE.SpotLight(0xffe6b0, 90, 55, 0.55, 0.5, 1.2);
    headlight.position.set(2, 1, 0);
    const tgt = new THREE.Object3D();
    tgt.position.set(18, 0, 0);
    car.mesh.add(tgt);
    headlight.target = tgt;
    car.mesh.add(headlight);
  }

  function nearestCar(pos, maxDist, kinds = ['parked', 'traffic']) {
    let best = null, bd = maxDist;
    for (const c of cars) {
      if (!kinds.includes(c.kind)) continue;
      if (c.kind === 'traffic' && Math.abs(c.speed) > 0.6) continue;
      const d = dist2(pos.x, pos.z, c.pos.x, c.pos.z);
      // On a tie (or nearer), prefer the player's own car: taking it is free,
      // so it must win over a stealable parked at the same spot.
      if (d < bd || (c.own && d <= bd)) { bd = d; best = c; }
    }
    return best;
  }

  function carAhead(car, range) {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    for (const o of cars) {
      if (o === car) continue;
      const dx = o.pos.x - car.pos.x, dz = o.pos.z - car.pos.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < range && side < 2.4) return true;
    }
    return false;
  }

  function collideCars(car) {
    for (const o of cars) {
      if (o === car) continue;
      const dx = car.pos.x - o.pos.x, dz = car.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.6 && d > 0.001) {
        const push = (3.6 - d) / 2;
        const nx = dx / d, nz = dz / d;
        car.pos.x += nx * push; car.pos.z += nz * push;
        if (o.kind !== 'parked') { o.pos.x -= nx * push; o.pos.z -= nz * push; }
        const impact = Math.abs(car.speed - o.speed);
        if (impact > 4) { car.speed *= 0.55; o.speed *= 0.55; audio.thud(impact / 20); G.shake = Math.min(0.5, impact / 40); }
      }
    }
  }

  function drivePlayerCar(car, input, dt) {
    const maxF = 27, maxR = 9;
    if (input.fwd) car.speed += 15 * dt;
    if (input.back) car.speed -= (car.speed > 0.5 ? 24 : 9) * dt;
    if (!input.fwd && !input.back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
    if (input.handbrake) {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 18 * dt);
      car.steer = clamp(car.steer + (input.left ? -1 : input.right ? 1 : 0) * 2.4 * dt, -0.85, 0.85);
      G.skidding = Math.abs(car.speed) > 8;
    } else {
      G.skidding = false;
      const target = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      const maxSteer = 0.55 * clamp(1 - Math.abs(car.speed) / 45, 0.35, 1);
      car.steer = damp(8, dt) * target * maxSteer + (1 - damp(8, dt)) * car.steer;
    }
    car.speed = clamp(car.speed, -maxR, maxF);
    if (Math.abs(car.speed) > 0.05) {
      const wheelBase = 2.7;
      car.heading += (car.speed / wheelBase) * Math.tan(car.steer) * dt * (input.handbrake ? 1.5 : 1);
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
    }
    if (city.collideCircle(car.pos, 1.9)) {
      if (Math.abs(car.speed) > 6) { audio.thud(Math.abs(car.speed) / 22); G.shake = Math.min(0.5, Math.abs(car.speed) / 45); }
      car.speed *= 0.35;
    }
    collideCars(car);
    car.mesh.rotation.y = car.heading;
    car.steerWheels.forEach((w) => { w.rotation.y = car.steer * 0.9; });
    car.wheels.forEach((w) => { w.rotation.z -= car.speed * dt * 2.4; });
    audio.engine(clamp(Math.abs(car.speed) / maxF, 0, 1), car.speed);
  }

  function updateTraffic(dt) {
    for (const c of traffic) {
      const goal = c.route[c.route.length - 1];
      if (!goal) { c.route = [nodeFor(c.pos.x, c.pos.z), pickNextNode(c)]; continue; }
      const lp = lanePoint(nodeFor(c.pos.x, c.pos.z), goal);
      const dx = lp.x - c.pos.x, dz = lp.z - c.pos.z;
      const d = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      const dh = angDiff(c.heading, wantHeading);
      c.heading += clamp(dh, -1.6 * dt, 1.6 * dt);
      const blocked = carAhead(c, 10);
      const target = blocked ? 0 : c.targetSpeed;
      c.speed = damp(1.6, dt) * target + (1 - damp(1.6, dt)) * c.speed;
      c.pos.x += Math.sin(c.heading) * c.speed * dt;
      c.pos.z += Math.cos(c.heading) * c.speed * dt;
      if (d < 4) {
        c.route.push(pickNextNode(c));
        if (c.route.length > 3) c.route.shift();
      }
      // anti-stuck: nudge if barely moved
      if (dist2(c.pos.x, c.pos.z, c.lastPos.x, c.lastPos.z) < 0.05 && c.speed > 1) c.stuck += dt;
      else c.stuck = 0;
      c.lastPos = { x: c.pos.x, z: c.pos.z };
      if (c.stuck > 3) { c.route = [nodeFor(c.pos.x, c.pos.z), pickNextNode(c)]; c.stuck = 0; }
      city.collideCircle(c.pos, 1.9);
      c.mesh.rotation.y = c.heading;
      c.wheels.forEach((w) => { w.rotation.z -= c.speed * dt * 2.4; });
    }
  }

  function spawnPolice(n, near) {
    while (police.length < n) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(55, 85);
      const p = { x: clamp(near.x + Math.cos(a) * r, -150, 150), z: clamp(near.z + Math.sin(a) * r, -150, 150) };
      const rp = city.randomRoadPoint(RNG(police.length * 31 + 7));
      const c = newCar(0xe8e8e8, 'police', rp.x, rp.z, rng.range(0, Math.PI * 2), { police: true });
      c.route = [nodeFor(rp.x, rp.z), pickNextNode(c, near)];
      c.targetSpeed = 20;
      police.push(c);
      void p;
    }
  }

  function updatePolice(dt, player, wanted) {
    const playerPos = player.pos;
    const playerInCar = !!player.car;
    const want = wanted === 0 ? 0 : wanted <= 1 ? 1 : wanted <= 2 ? 2 : wanted <= 3 ? 3 : 4;
    if (police.length < want) spawnPolice(want, playerPos);
    for (let i = police.length - 1; i >= 0; i--) {
      const c = police[i];
      if (wanted === 0) {
        // peel off: drive away, despawn when far
        const d = dist2(c.pos.x, c.pos.z, playerPos.x, playerPos.z);
        if (d > 130) { scene.remove(c.mesh); cars.splice(cars.indexOf(c), 1); police.splice(i, 1); continue; }
      }
      const dPlayer = dist2(c.pos.x, c.pos.z, playerPos.x, playerPos.z);
      let goal;
      if (dPlayer < 26) {
        // direct pursuit
        goal = { x: playerPos.x, z: playerPos.z };
        const wantHeading = Math.atan2(goal.x - c.pos.x, goal.z - c.pos.z);
        const dh = angDiff(c.heading, wantHeading);
        c.heading += clamp(dh, -2.2 * dt, 2.2 * dt);
        c.speed = damp(1.2, dt) * (playerInCar ? 24 : 13) + (1 - damp(1.2, dt)) * c.speed;
      } else {
        goal = c.route[c.route.length - 1] || nodeFor(c.pos.x, c.pos.z);
        const lp = lanePoint(nodeFor(c.pos.x, c.pos.z), goal);
        const wantHeading = Math.atan2(lp.x - c.pos.x, lp.z - c.pos.z);
        const dh = angDiff(c.heading, wantHeading);
        c.heading += clamp(dh, -2.0 * dt, 2.0 * dt);
        c.speed = damp(1.2, dt) * 20 + (1 - damp(1.2, dt)) * c.speed;
        if (dist2(c.pos.x, c.pos.z, lp.x, lp.z) < 5) {
          c.route.push(pickNextNode(c, playerPos));
          if (c.route.length > 3) c.route.shift();
        }
      }
      c.pos.x += Math.sin(c.heading) * c.speed * dt;
      c.pos.z += Math.cos(c.heading) * c.speed * dt;
      if (city.collideCircle(c.pos, 1.9)) c.speed *= 0.5;
      collideCars(c);
      // ram the player car (push the car itself, not the detached pos copy)
      if (playerInCar && player.car && dPlayer < 4.2) {
        const dx = player.car.pos.x - c.pos.x, dz = player.car.pos.z - c.pos.z;
        const l = Math.hypot(dx, dz) || 1;
        player.car.pos.x += (dx / l) * 1.4; player.car.pos.z += (dz / l) * 1.4;
        if (Math.abs(c.speed) > 8) { audio.thud(0.5); G.shake = Math.min(0.5, 0.3); }
      }
      // flashing light bar
      if (c.bar) {
        const on = Math.floor(G.time * 6 + c.sirenPhase) % 2 === 0;
        c.bar.userData.rMat.emissiveIntensity = on ? 2.4 : 0.25;
        c.bar.userData.bMat.emissiveIntensity = on ? 0.25 : 2.4;
      }
      c.mesh.rotation.y = c.heading;
      c.wheels.forEach((w) => { w.rotation.z -= c.speed * dt * 2.4; });
    }
    audio.siren(police.length > 0 && wanted > 0, police.length ? Math.min(...police.map((p) => dist2(p.pos.x, p.pos.z, playerPos.x, playerPos.z))) : 999);
  }

  function removeCar(car) {
    scene.remove(car.mesh);
    for (const arr of [cars, traffic, police, parked]) {
      const i = arr.indexOf(car); if (i >= 0) arr.splice(i, 1);
    }
  }

  function update(dt, input, player) {
    updateTraffic(dt);
    updatePolice(dt, player, G.state.wanted);
    if (player.car) drivePlayerCar(player.car, input, dt);
  }

  return {
    cars, traffic, police, parked,
    spawnInitial, nearestCar, attachHeadlight, removeCar, spawnPolice, update,
    updateTraffic,
    nodeFor, pickNextNode,
  };
}
