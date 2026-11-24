// actors.js — people of Kota Senja: Dimas the courier, pedestrians who walk
// the sidewalks and flee gunfire, and gang thugs who shoot back.

import * as THREE from 'three';
import { clamp, rand, dist2 } from './util.js';
import { collide } from './city.js';

export function makePersonMesh(shirt, pants, skin = 0xd9a066, bandana = null) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 1.0, 0.42),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 }),
  );
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 10, 8),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 }),
  );
  head.position.y = 1.78;
  g.add(head);
  if (bandana) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.14, 0.56),
      new THREE.MeshStandardMaterial({ color: bandana, roughness: 0.8 }),
    );
    band.position.y = 1.95;
    g.add(band);
  }
  const legMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  for (const lx of [-0.18, 0.18]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.55, 0.3), legMat);
    leg.position.set(lx, 0.28, 0);
    g.add(leg);
  }
  return g;
}

export class Player {
  constructor(scene, x, z) {
    this.mesh = makePersonMesh(0x2e6b4f, 0x1c2733);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.heading = Math.PI;
    this.speed = 0;
    this.hp = 100;
    this.ammo = 24;
    this.car = null;
    this.punchCd = 0;
    this.shootCd = 0;
  }

  get x() {
    return this.mesh.position.x;
  }

  get z() {
    return this.mesh.position.z;
  }

  // On-foot movement, relative to the camera yaw. input: {f,b,l,r,sprint}.
  walk(dt, input, camYaw, colliders) {
    if (this.car) return;
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    let mx = 0;
    let mz = 0;
    if (input.f) {
      mx += fx;
      mz += fz;
    }
    if (input.b) {
      mx -= fx;
      mz -= fz;
    }
    if (input.r) {
      mx += rx;
      mz += rz;
    }
    if (input.l) {
      mx -= rx;
      mz -= rz;
    }
    const len = Math.sqrt(mx * mx + mz * mz);
    const target = input.sprint ? 10 : 6;
    if (len > 0.01) {
      mx /= len;
      mz /= len;
      this.speed += (target - this.speed) * Math.min(1, 8 * dt);
      this.heading = Math.atan2(mx, mz);
    } else {
      this.speed += (0 - this.speed) * Math.min(1, 8 * dt);
    }
    let nx = this.mesh.position.x + mx * this.speed * dt;
    let nz = this.mesh.position.z + mz * this.speed * dt;
    const hit = collide(colliders, nx, nz, 0.6);
    if (hit.hit) {
      nx = hit.x;
      nz = hit.z;
    }
    this.mesh.position.x = clamp(nx, -200, 200);
    this.mesh.position.z = clamp(nz, -200, 210);
    this.mesh.rotation.y = this.heading;
    this.punchCd = Math.max(0, this.punchCd - dt);
    this.shootCd = Math.max(0, this.shootCd - dt);
  }

  enterCar(car) {
    this.car = car;
    this.mesh.visible = false;
    this.mesh.position.set(car.x, 0, car.z);
  }

  exitCar() {
    if (!this.car) return;
    const car = this.car;
    this.car = null;
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);
    this.mesh.position.set(car.x + rx * 2.4, 0, car.z + rz * 2.4);
    this.mesh.visible = true;
    this.heading = car.heading;
    this.mesh.rotation.y = this.heading;
  }

  // Melee: nearest living enemy within reach in front of the player.
  punch(enemies) {
    if (this.punchCd > 0 || this.car) return null;
    this.punchCd = 0.45;
    let best = null;
    let bestD = 2.4;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = dist2(this.x, this.z, e.x, e.z);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    if (best) best.damage(30);
    return best;
  }

  // Hitscan shot from the camera: nearest living enemy near the crosshair.
  shoot(camPos, camDir, enemies) {
    if (this.shootCd > 0 || this.car) return null;
    if (this.ammo <= 0) return 'empty';
    this.shootCd = 0.28;
    this.ammo -= 1;
    let best = null;
    let bestD = 70;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - camPos.x;
      const dy = 1.2 - camPos.y;
      const dz = e.z - camPos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > bestD) continue;
      const dot = (dx * camDir.x + dy * camDir.y + dz * camDir.z) / d;
      if (dot > 0.995) {
        best = e;
        bestD = d;
      }
    }
    if (best) best.damage(34);
    return best;
  }

  takeDamage(n) {
    this.hp = Math.max(0, this.hp - n);
  }
}

export class Pedestrian {
  constructor(scene, x, z, waypoints) {
    this.mesh = makePersonMesh(0x8a6d3b, 0x2a2a3a, 0xc98a5a);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.waypoints = waypoints;
    this.wpIndex = 0;
    this.speed = rand(Math.random, 1.4, 2.4);
    this.state = 'walk';
    this.fleeTimer = 0;
    this.fallenTimer = 0;
  }

  get x() {
    return this.mesh.position.x;
  }

  get z() {
    return this.mesh.position.z;
  }

  update(dt, colliders, gunshotPos) {
    if (this.state === 'fallen') {
      this.fallenTimer -= dt;
      if (this.fallenTimer <= 0) {
        this.state = 'walk';
        this.mesh.rotation.x = 0;
        this.mesh.visible = true;
      }
      return;
    }
    if (gunshotPos && dist2(this.x, this.z, gunshotPos.x, gunshotPos.z) < 22) {
      this.state = 'flee';
      this.fleeTimer = 3;
    }
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) this.state = 'walk';
      const dx = this.x - gunshotPos.x;
      const dz = this.z - gunshotPos.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      const nx = this.x + (dx / d) * 5 * dt;
      const nz = this.z + (dz / d) * 5 * dt;
      const hit = collide(colliders, nx, nz, 0.6);
      this.mesh.position.x = hit.hit ? hit.x : nx;
      this.mesh.position.z = hit.hit ? hit.z : nz;
      this.mesh.rotation.y = Math.atan2(dx, dz);
      return;
    }
    const wp = this.waypoints[this.wpIndex];
    const dx = wp.x - this.x;
    const dz = wp.z - this.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 2) {
      this.wpIndex = (this.wpIndex + 1) % this.waypoints.length;
      return;
    }
    const nx = this.x + (dx / d) * this.speed * dt;
    const nz = this.z + (dz / d) * this.speed * dt;
    this.mesh.position.x = nx;
    this.mesh.position.z = nz;
    this.mesh.rotation.y = Math.atan2(dx, dz);
  }

  fall() {
    if (this.state === 'fallen') return;
    this.state = 'fallen';
    this.fallenTimer = 6;
    this.mesh.rotation.x = -Math.PI / 2;
  }
}

export class Enemy {
  constructor(scene, x, z, bandana = 0x8a2be2) {
    this.mesh = makePersonMesh(0x3a3a3a, 0x222222, 0xc98a5a, bandana);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.hp = 60;
    this.dead = false;
    this.shootTimer = 1 + Math.random();
    this.fadeTimer = 0;
  }

  get x() {
    return this.mesh.position.x;
  }

  get z() {
    return this.mesh.position.z;
  }

  damage(n) {
    if (this.dead) return;
    this.hp -= n;
    if (this.hp <= 0) {
      this.dead = true;
      this.fadeTimer = 4;
      this.mesh.rotation.x = -Math.PI / 2;
    }
  }

  update(dt, player, colliders) {
    if (this.dead) {
      this.fadeTimer -= dt;
      if (this.fadeTimer <= 0) this.mesh.visible = false;
      return;
    }
    const d = dist2(this.x, this.z, player.x, player.z);
    this.mesh.rotation.y = Math.atan2(player.x - this.x, player.z - this.z);
    if (d > 16) {
      const dx = player.x - this.x;
      const dz = player.z - this.z;
      const nx = this.x + (dx / d) * 3 * dt;
      const nz = this.z + (dz / d) * 3 * dt;
      const hit = collide(colliders, nx, nz, 0.6);
      this.mesh.position.x = hit.hit ? hit.x : nx;
      this.mesh.position.z = hit.hit ? hit.z : nz;
    } else if (d < 38 && !player.car) {
      this.shootTimer -= dt;
      if (this.shootTimer <= 0) {
        this.shootTimer = 1.1 + Math.random() * 0.6;
        if (Math.random() < 0.45) player.takeDamage(6);
      }
    }
  }
}
