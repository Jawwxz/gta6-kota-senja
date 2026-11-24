// vehicles.js — cars for Kota Senja: the player's own car, traffic that loops
// the road grid, police that chase, and the gold sedan to steal.
// Cars are built from boxes; forward is +z of the mesh, heading 0 faces +z.

import * as THREE from 'three';
import { clamp, angleLerp, rand, pick } from './util.js';
import { ROAD_COORDS, collide } from './city.js';

export function makeCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.75, 4.4),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 }),
  );
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.65, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x101018, roughness: 0.2, metalness: 0.6 }),
  );
  cabin.position.set(0, 1.2, -0.3);
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 });
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
  }
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  for (const hx of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), hlMat);
    h.position.set(hx, 0.6, 2.22);
    g.add(h);
  }
  const tlMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const hx of [-0.7, 0.7]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tlMat);
    t.position.set(hx, 0.6, -2.22);
    g.add(t);
  }
  if (opts.police) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.18, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2266ff }),
    );
    bar.position.set(0, 1.62, -0.3);
    g.add(bar);
    const bar2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    bar2.position.set(-0.62, 1.62, -0.3);
    g.add(bar2);
  }
  return g;
}

export class Car {
  constructor(scene, { color, x, z, heading = 0, kind = 'traffic', maxSpeed = 24, police = false }) {
    this.kind = kind;
    this.police = police;
    this.maxSpeed = maxSpeed;
    this.speed = 0;
    this.heading = heading;
    this.mesh = makeCarMesh(color, { police });
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.waypoints = null;
    this.wpIndex = 0;
  }

  get x() {
    return this.mesh.position.x;
  }

  get z() {
    return this.mesh.position.z;
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // Player driving: input { fwd, back, steer } with steer -1..1.
  drive(dt, input, colliders) {
    if (input.fwd) this.speed += 16 * dt;
    if (input.back) this.speed -= (this.speed > 0.5 ? 24 : 10) * dt;
    this.speed -= this.speed * 0.7 * dt;
    this.speed = clamp(this.speed, -8, this.maxSpeed);
    const sf = clamp(Math.abs(this.speed) / 8, 0, 1);
    this.heading += input.steer * 2.0 * dt * sf * (this.speed >= 0 ? 1 : -1);
    const f = this.forward();
    let nx = this.mesh.position.x + f.x * this.speed * dt;
    let nz = this.mesh.position.z + f.z * this.speed * dt;
    const hit = collide(colliders, nx, nz, 1.6);
    if (hit.hit) {
      nx = hit.x;
      nz = hit.z;
      this.speed *= 0.55;
    }
    this.mesh.position.x = clamp(nx, -200, 200);
    this.mesh.position.z = clamp(nz, -200, 210);
    this.mesh.rotation.y = this.heading;
  }

  // Traffic: follow a rectangular loop of road intersections.
  followWaypoints(dt, colliders, playerCar) {
    if (!this.waypoints || this.waypoints.length === 0) return;
    const wp = this.waypoints[this.wpIndex];
    const dx = wp.x - this.mesh.position.x;
    const dz = wp.z - this.mesh.position.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 3) {
      this.wpIndex = (this.wpIndex + 1) % this.waypoints.length;
      return;
    }
    const want = Math.atan2(dx, dz);
    this.heading = angleLerp(this.heading, want, Math.min(1, 2.6 * dt));
    // Yield to the player's car directly ahead.
    let target = 9;
    if (playerCar) {
      const pdx = playerCar.x - this.mesh.position.x;
      const pdz = playerCar.z - this.mesh.position.z;
      const pd = Math.sqrt(pdx * pdx + pdz * pdz);
      const f = this.forward();
      if (pd < 8 && pdx * f.x + pdz * f.z > 0) target = 0;
    }
    this.speed += (target - this.speed) * Math.min(1, 2 * dt);
    const f = this.forward();
    const nx = this.mesh.position.x + f.x * this.speed * dt;
    const nz = this.mesh.position.z + f.z * this.speed * dt;
    const hit = collide(colliders, nx, nz, 1.6);
    this.mesh.position.x = hit.hit ? hit.x : nx;
    this.mesh.position.z = hit.hit ? hit.z : nz;
    this.mesh.rotation.y = this.heading;
  }

  // Police: steer toward the target and close in.
  chase(dt, tx, tz, colliders) {
    const dx = tx - this.mesh.position.x;
    const dz = tz - this.mesh.position.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.5) return;
    const want = Math.atan2(dx, dz);
    this.heading = angleLerp(this.heading, want, Math.min(1, 3.2 * dt));
    const target = d > 12 ? 23 : 15;
    this.speed += (target - this.speed) * Math.min(1, 2.5 * dt);
    const f = this.forward();
    const nx = this.mesh.position.x + f.x * this.speed * dt;
    const nz = this.mesh.position.z + f.z * this.speed * dt;
    const hit = collide(colliders, nx, nz, 1.6);
    this.mesh.position.x = hit.hit ? hit.x : nx;
    this.mesh.position.z = hit.hit ? hit.z : nz;
    this.mesh.rotation.y = this.heading;
  }
}

// A rectangular loop around one city block, for traffic to follow.
export function trafficLoop(rng) {
  const i = Math.floor(rng() * (ROAD_COORDS.length - 1));
  const j = Math.floor(rng() * (ROAD_COORDS.length - 1));
  const x0 = ROAD_COORDS[i];
  const x1 = ROAD_COORDS[i + 1];
  const z0 = ROAD_COORDS[j];
  const z1 = ROAD_COORDS[j + 1];
  return [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ];
}

export function spawnTraffic(scene, rng, count, colliders) {
  const colors = [0x8a8f98, 0x5a6b7a, 0x7a5a4a, 0x4a5a3a, 0x6a4a6a, 0x9a8a6a];
  const cars = [];
  for (let n = 0; n < count; n++) {
    const loop = trafficLoop(rng);
    const wp = loop[Math.floor(rng() * loop.length)];
    const next = loop[(loop.indexOf(wp) + 1) % loop.length];
    const heading = Math.atan2(next.x - wp.x, next.z - wp.z);
    const car = new Car(scene, {
      color: pick(rng, colors),
      x: wp.x + rand(rng, -2, 2),
      z: wp.z + rand(rng, -2, 2),
      heading,
      kind: 'traffic',
      maxSpeed: 10,
    });
    car.waypoints = loop;
    car.wpIndex = (loop.indexOf(wp) + 1) % loop.length;
    cars.push(car);
  }
  return cars;
}
