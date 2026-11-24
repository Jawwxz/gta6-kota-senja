// Kota Senja — people: Dimas on foot, pedestrians, gang enemies, combat, pickups.
import * as THREE from '../vendor/three.module.min.js';
import { RNG, clamp, angDiff, damp, dist2, TAU } from './util.js';

const SKINS = [0xc98d64, 0x8a5a3b, 0xe8b98a, 0x6b4423];
const JACKETS = [0x7a4a9e, 0x2e6f8e, 0xc77b21, 0x4a7a3a, 0x8a2f2f, 0xd8d2c8];
const PANTS = [0x2a2a3a, 0x3a2a1a, 0x1c2a3a, 0x4a4a4a];

function makePersonMesh({ jacket = 0x7a4a9e, pants = 0x2a2a3a, skin = 0xc98d64, hat = null, scale = 1 } = {}) {
  const g = new THREE.Group();
  const jMat = new THREE.MeshLambertMaterial({ color: jacket });
  const pMat = new THREE.MeshLambertMaterial({ color: pants });
  const sMat = new THREE.MeshLambertMaterial({ color: skin });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), pMat);
  legL.position.set(-0.14, 0.4, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.14; g.add(legR);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), jMat);
  torso.position.y = 1.16; g.add(torso);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.2), jMat);
  armL.position.set(-0.42, 1.14, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), sMat);
  head.position.y = 1.72; g.add(head);
  if (hat) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.38), new THREE.MeshLambertMaterial({ color: hat }));
    cap.position.y = 1.94; g.add(cap);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; g.add(shadow);
  g.scale.setScalar(scale);
  return { group: g, legL, legR, armL, armR, head, torso };
}

export function createActors(G) {
  const { scene, city, audio, hud } = G;
  const rng = RNG(4242);

  const player = {
    pos: new THREE.Vector3(18, 0, 126), heading: Math.PI, speed: 0,
    hp: 100, maxHp: 100, ammo: 12, maxAmmo: 12, reloading: 0,
    punchCd: 0, punchT: 0, shootCd: 0, lastDamage: -99, car: null,
    mesh: null, parts: null, walkPhase: 0, dead: false,
  };
  player.parts = makePersonMesh({ jacket: 0x7a4a9e, pants: 0x2a2a3a, skin: 0xc98d64, hat: 0x1c2a3a });
  player.mesh = player.parts.group;
  player.mesh.position.copy(player.pos);
  scene.add(player.mesh);

  const peds = [];
  const enemies = [];
  const pickups = [];
  let tracer = null;
  let tracerT = 0;
  let muzzle = null;

  function spawnPed() {
    const p = city.randomSidewalkPoint(rng);
    const parts = makePersonMesh({
      jacket: JACKETS[rng.int(0, JACKETS.length - 1)],
      pants: PANTS[rng.int(0, PANTS.length - 1)],
      skin: SKINS[rng.int(0, SKINS.length - 1)],
      hat: rng.chance(0.3) ? 0xd8a13a : null,
    });
    parts.group.position.set(p.x, 0, p.z);
    scene.add(parts.group);
    const ped = {
      parts, pos: parts.group.position, heading: rng.range(0, TAU),
      speed: 0, target: city.randomSidewalkPoint(rng), state: 'walk',
      idleT: 0, fleeT: 0, phase: rng.range(0, TAU),
    };
    peds.push(ped);
    return ped;
  }
  for (let i = 0; i < 20; i++) spawnPed();

  function spawnEnemy(x, z, kind = 'thug', missionId = 0) {
    const parts = makePersonMesh({
      jacket: 0x8a2f2f, pants: 0x1c1c22, skin: SKINS[rng.int(0, 3)],
      hat: kind === 'shooter' ? 0x111111 : null,
    });
    parts.group.position.set(x, 0, z);
    scene.add(parts.group);
    const e = {
      parts, pos: parts.group.position, heading: rng.range(0, TAU),
      hp: 100, kind, missionId, speed: 0, attackCd: 0, shootCd: rng.range(0.5, 1.5),
      phase: rng.range(0, TAU), dead: false, deadT: 0, flashT: 0,
    };
    enemies.push(e);
    return e;
  }

  function spawnPickup(x, z, kind, amount) {
    const color = kind === 'cash' ? 0xffd23e : 0x7cfc66;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.9 }));
    mesh.position.set(x, 0.8, z);
    scene.add(mesh);
    pickups.push({ mesh, pos: mesh.position, kind, amount, spin: rng.range(0, TAU) });
  }

  function walkAnim(parts, phase, amount) {
    parts.legL.rotation.x = Math.sin(phase) * 0.7 * amount;
    parts.legR.rotation.x = -Math.sin(phase) * 0.7 * amount;
    parts.armL.rotation.x = -Math.sin(phase) * 0.5 * amount;
    parts.armR.rotation.x = Math.sin(phase) * 0.5 * amount;
  }

  function damagePlayer(amount, fromPos) {
    if (player.dead || G.state.mode !== 'playing') return;
    player.hp -= amount;
    player.lastDamage = G.time;
    G.shake = Math.min(0.6, G.shake + 0.25);
    hud.damageFlash();
    audio.hurt();
    if (player.hp <= 0) {
      player.hp = 0;
      player.dead = true;
      G.state.mode = 'dying';
      G.dieAt = G.time;
    }
  }

  function tryPunch() {
    if (player.punchCd > 0 || player.car || player.dead) return;
    player.punchCd = 0.45;
    player.punchT = 0.25;
    audio.punch();
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.4 && (dx * fx + dz * fz) / (d || 1) > 0.4) {
        hurtEnemy(e, 25, player.pos);
      }
    }
  }

  function rayBlocked(from, to) {
    // sample along the ray; blocked if a sample sits inside a building collider
    const steps = Math.ceil(dist2(from.x, from.z, to.x, to.z) / 3);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
      for (const c of city.colliders) {
        if (Math.abs(x - c.x) < c.hx && Math.abs(z - c.z) < c.hz) return true;
      }
    }
    return false;
  }

  function tryShoot(camPos, camDir) {
    if (player.car || player.dead || player.reloading > 0 || player.shootCd > 0) return;
    if (player.ammo <= 0) { startReload(); return; }
    player.shootCd = 0.22;
    player.ammo -= 1;
    audio.shot();
    G.shake = Math.min(0.4, G.shake + 0.08);
    // find nearest enemy inside a narrow cone from the camera
    let best = null, bd = 45;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - camPos.x, dy = 1.2 - camPos.y, dz = e.pos.z - camPos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 45 || d < 0.5) continue;
      const dot = (dx * camDir.x + dy * camDir.y + dz * camDir.z) / d;
      if (dot > 0.985 && d < bd && !rayBlocked(camPos, e.pos)) { best = e; bd = d; }
    }
    const end = best ? new THREE.Vector3(best.pos.x, 1.2, best.pos.z)
      : camPos.clone().add(camDir.clone().multiplyScalar(45));
    showTracer(camPos.clone().add(camDir.clone().multiplyScalar(1.2)), end);
    if (best) hurtEnemy(best, 34, player.pos);
    if (player.ammo === 0) startReload();
  }

  function showTracer(a, b) {
    if (!tracer) {
      const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
      tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.9 }));
      scene.add(tracer);
    } else {
      tracer.geometry.setFromPoints([a, b]);
      tracer.material.opacity = 0.9;
    }
    tracerT = 0.09;
    if (!muzzle) {
      muzzle = new THREE.PointLight(0xffe6a0, 40, 12, 1.5);
      scene.add(muzzle);
    }
    muzzle.position.copy(a);
  }

  function hurtEnemy(e, dmg, fromPos) {
    e.hp -= dmg;
    e.flashT = 0.12;
    const dx = e.pos.x - fromPos.x, dz = e.pos.z - fromPos.z;
    const d = Math.hypot(dx, dz) || 1;
    e.pos.x += (dx / d) * 0.7; e.pos.z += (dz / d) * 0.7;
    if (e.hp <= 0 && !e.dead) {
      e.dead = true; e.deadT = 0;
      e.parts.group.rotation.x = -Math.PI / 2;
      e.parts.group.position.y = 0.35;
      audio.thud(0.4);
      if (rng.chance(0.35)) spawnPickup(e.pos.x, e.pos.z, 'health', 30);
      else spawnPickup(e.pos.x, e.pos.z, 'cash', 25000);
      G.emit('enemy-down', { missionId: e.missionId });
    }
  }

  function startReload() {
    if (player.reloading > 0 || player.ammo === player.maxAmmo) return;
    player.reloading = 1.2;
    audio.reload();
  }

  function onGunshot(pos) {
    for (const p of peds) {
      if (dist2(p.pos.x, p.pos.z, pos.x, pos.z) < 32) {
        p.state = 'flee'; p.fleeT = 4;
      }
    }
  }

  function updatePlayerOnFoot(dt, input, camYaw) {
    let mx = 0, mz = 0;
    if (input.fwd) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
    if (input.back) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
    if (input.left) { mx += Math.sin(camYaw - Math.PI / 2); mz += Math.cos(camYaw - Math.PI / 2); }
    if (input.right) { mx += Math.sin(camYaw + Math.PI / 2); mz += Math.cos(camYaw + Math.PI / 2); }
    const len = Math.hypot(mx, mz);
    const sprint = input.sprint && len > 0;
    const targetSpeed = len > 0 ? (sprint ? 7.2 : 4.2) : 0;
    player.speed = damp(10, dt) * targetSpeed + (1 - damp(10, dt)) * player.speed;
    if (len > 0) {
      mx /= len; mz /= len;
      const wantHeading = Math.atan2(mx, mz);
      player.heading += angDiff(player.heading, wantHeading) * damp(12, dt);
      player.pos.x += mx * player.speed * dt;
      player.pos.z += mz * player.speed * dt;
      player.walkPhase += player.speed * dt * 1.9;
    }
    if (city.collideCircle(player.pos, 0.55)) player.speed *= 0.4;
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = player.heading;
    walkAnim(player.parts, player.walkPhase, clamp(player.speed / 5, 0, 1));
    // punch arm
    if (player.punchT > 0) {
      player.punchT -= dt;
      player.parts.armR.rotation.x = -1.6 * Math.sin((0.25 - player.punchT) / 0.25 * Math.PI);
    }
    player.punchCd = Math.max(0, player.punchCd - dt);
    player.shootCd = Math.max(0, player.shootCd - dt);
    if (player.reloading > 0) {
      player.reloading -= dt;
      if (player.reloading <= 0) { player.ammo = player.maxAmmo; }
    }
    // regen
    if (G.time - player.lastDamage > 6 && player.hp > 0 && player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + 3 * dt);
    }
  }

  function updatePeds(dt) {
    for (const p of peds) {
      if (p.state === 'flee') {
        p.fleeT -= dt;
        const away = Math.atan2(p.pos.x - G.threat.x, p.pos.z - G.threat.z);
        p.heading += angDiff(p.heading, away) * damp(6, dt);
        p.speed = damp(6, dt) * 3.6 + (1 - damp(6, dt)) * p.speed;
        if (p.fleeT <= 0) { p.state = 'walk'; p.target = city.randomSidewalkPoint(rng); }
      } else if (p.state === 'idle') {
        p.idleT -= dt; p.speed = damp(6, dt) * 0;
        if (p.idleT <= 0) { p.state = 'walk'; p.target = city.randomSidewalkPoint(rng); }
      } else {
        const dx = p.target.x - p.pos.x, dz = p.target.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.5) {
          if (rng.chance(0.3)) { p.state = 'idle'; p.idleT = rng.range(2, 5); }
          else p.target = city.randomSidewalkPoint(rng);
        } else {
          const want = Math.atan2(dx, dz);
          p.heading += angDiff(p.heading, want) * damp(5, dt);
          p.speed = damp(4, dt) * 1.25 + (1 - damp(4, dt)) * p.speed;
        }
        // scatter from fast cars
        for (const c of G.vehicles.cars) {
          if (Math.abs(c.speed) > 6 && dist2(p.pos.x, p.pos.z, c.pos.x, c.pos.z) < 5) {
            p.state = 'flee'; p.fleeT = 3; G.threat = { x: c.pos.x, z: c.pos.z };
          }
        }
      }
      p.pos.x += Math.sin(p.heading) * p.speed * dt;
      p.pos.z += Math.cos(p.heading) * p.speed * dt;
      city.collideCircle(p.pos, 0.5);
      p.parts.group.position.copy(p.pos);
      p.parts.group.rotation.y = p.heading;
      p.phase += p.speed * dt * 2.2;
      walkAnim(p.parts, p.phase, clamp(p.speed / 2, 0, 1));
    }
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      if (e.dead) {
        e.deadT += dt;
        if (e.deadT > 4) {
          scene.remove(e.parts.group);
          enemies.splice(enemies.indexOf(e), 1);
        }
        continue;
      }
      e.flashT = Math.max(0, e.flashT - dt);
      e.parts.torso.material.emissive?.setHex(e.flashT > 0 ? 0x881111 : 0x000000);
      const d = dist2(e.pos.x, e.pos.z, player.pos.x, player.pos.z);
      e.attackCd = Math.max(0, e.attackCd - dt);
      e.shootCd = Math.max(0, e.shootCd - dt);
      if (player.dead || G.state.mode !== 'playing') { walkAnim(e.parts, e.phase, 0); continue; }
      if (e.kind === 'thug') {
        if (d < 30) {
          const want = Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
          e.heading += angDiff(e.heading, want) * damp(6, dt);
          e.speed = damp(4, dt) * (d > 2.1 ? 4.6 : 0) + (1 - damp(4, dt)) * e.speed;
          if (d < 2.1 && e.attackCd <= 0) {
            e.attackCd = 1.0;
            e.parts.armR.rotation.x = -1.6;
            damagePlayer(8, e.pos);
          }
        } else { e.speed = damp(4, dt) * 0; }
      } else {
        // shooter: keep 12-18m, fire
        const want = Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
        e.heading += angDiff(e.heading, want) * damp(6, dt);
        const target = d > 18 ? 3.6 : d < 10 ? -2.5 : 0;
        e.speed = damp(4, dt) * target + (1 - damp(4, dt)) * e.speed;
        if (d < 26 && e.shootCd <= 0 && !rayBlocked(e.pos, player.pos)) {
          e.shootCd = 1.9;
          audio.enemyShot();
          showTracer(new THREE.Vector3(e.pos.x, 1.4, e.pos.z), new THREE.Vector3(player.pos.x, 1.2, player.pos.z));
          if (rng.chance(0.35)) damagePlayer(9, e.pos);
        }
      }
      e.pos.x += Math.sin(e.heading) * e.speed * dt;
      e.pos.z += Math.cos(e.heading) * e.speed * dt;
      city.collideCircle(e.pos, 0.55);
      e.parts.group.position.copy(e.pos);
      e.parts.group.rotation.y = e.heading;
      e.phase += Math.abs(e.speed) * dt * 2.2;
      walkAnim(e.parts, e.phase, clamp(Math.abs(e.speed) / 3, 0, 1));
    }
  }

  function updatePickups(dt) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.spin += dt * 3;
      p.mesh.rotation.y = p.spin;
      p.mesh.position.y = 0.8 + Math.sin(p.spin * 1.4) * 0.15;
      if (!player.car && dist2(player.pos.x, player.pos.z, p.pos.x, p.pos.z) < 1.6) {
        if (p.kind === 'cash') { G.addCash(p.amount); hud.toast(`+Rp ${p.amount.toLocaleString('id-ID')}`); }
        else { player.hp = Math.min(player.maxHp, player.hp + p.amount); hud.toast(`+${p.amount} HP — nasi bungkus`); }
        audio.chime();
        scene.remove(p.mesh);
        pickups.splice(i, 1);
      }
    }
    if (tracerT > 0) {
      tracerT -= dt;
      if (tracer) tracer.material.opacity = Math.max(0, tracerT / 0.09) * 0.9;
    }
  }

  function update(dt, input, camYaw) {
    if (!player.dead && !player.car && G.state.mode === 'playing') updatePlayerOnFoot(dt, input, camYaw);
    if (player.car) {
      player.pos.copy(player.car.pos);
      player.mesh.visible = false;
    } else player.mesh.visible = true;
    updatePeds(dt);
    updateEnemies(dt);
    updatePickups(dt);
  }

  return {
    player, peds, enemies, pickups,
    spawnPed, spawnEnemy, spawnPickup, damagePlayer, tryPunch, tryShoot, startReload, onGunshot, update,
  };
}
