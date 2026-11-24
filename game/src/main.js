// main.js — Kota Senja: bootstrap, game loop, input, camera, wanted level,
// police, save/load, and the window.__game handle the test driver reads.

import * as THREE from 'three';
import { buildCity, PLACES, collide } from './city.js';
import { Car, spawnTraffic } from './vehicles.js';
import { Player, Pedestrian, Enemy } from './actors.js';
import { Missions } from './missions.js';
import { AudioSys } from './audio.js';
import { HUD } from './hud.js';
import { parseParams, stageShot } from './shots.js';
import { mulberry32, clamp, dist2, rand } from './util.js';

const SAVE_KEY = 'kota-senja-save';

class Game {
  constructor() {
    const params = parseParams();
    this.seed = params.seed;
    this.rng = mulberry32(this.seed);
    this.params = params;
    this.state = { mode: 'menu', wanted: 0, cash: 50000 };
    this.noDamage = false;
    this.arrestTimer = 0;
    this.wantedTimer = 0;
    this.gunshotPos = null;
    this.gunshotTimer = 0;

    // Renderer, scene, camera, lights.
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('game').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x241631);
    this.scene.fog = new THREE.Fog(0x241631, 80, 420);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 40, 120);
    const hemi = new THREE.HemisphereLight(0x8a6fd8, 0x1a1210, 1.25);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xff9a5a, 1.6);
    sun.position.set(-80, 60, -40);
    this.scene.add(sun);
    this.addSky();

    // City.
    const city = buildCity(this.scene, this.seed);
    this.colliders = city.colliders;

    // Vehicles.
    this.ownCar = new Car(this.scene, {
      color: 0x2ec4b6, x: PLACES.ownCar.x, z: PLACES.ownCar.z, heading: Math.PI, kind: 'own', maxSpeed: 26,
    });
    this.goldCar = new Car(this.scene, {
      color: 0xd4af37, x: PLACES.goldSedan.x, z: PLACES.goldSedan.z, heading: Math.PI / 2, kind: 'gold', maxSpeed: 28,
    });
    this.traffic = spawnTraffic(this.scene, this.rng, 8, this.colliders);
    this.police = [];

    // People.
    this.player = new Player(this.scene, 22, 120);
    this.pedestrians = this.spawnPedestrians(12);
    this.enemies = [];

    // Systems.
    this.missions = new Missions(this);
    this.audio = new AudioSys();
    this.hud = new HUD();
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.keys = {};
    this.menuAngle = 0;

    this.bindInput();
    this.bindButtons();
    window.addEventListener('resize', () => this.onResize());

    // Fresh start clears the save; otherwise resume where Dimas left off.
    if (params.fresh) {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch (e) {}
    } else {
      this.loadSave();
    }

    this.hud.showMenu();
    this.hud.setObjective('Kota Senja', 'Tekan MULAI untuk mulai mengantar bunga.');
    stageShot(this, params.shot);

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.loop());
  }

  addSky() {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#2a1650');
    grad.addColorStop(0.55, '#7a3d8f');
    grad.addColorStop(0.75, '#ff7a3c');
    grad.addColorStop(1, '#1a0f2e');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(480, 16, 12),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
    );
    this.scene.add(sky);
  }

  spawnPedestrians(count) {
    const list = [];
    const loop = [
      { x: -18, z: -18 }, { x: 18, z: -18 }, { x: 18, z: 18 }, { x: -18, z: 18 },
      { x: -54, z: 54 }, { x: -54, z: 90 }, { x: -18, z: 90 }, { x: -18, z: 54 },
    ];
    for (let i = 0; i < count; i++) {
      const wp = loop[i % loop.length];
      const p = new Pedestrian(this.scene, wp.x + rand(this.rng, -4, 4), wp.z + rand(this.rng, -4, 4), loop);
      p.wpIndex = i % loop.length;
      list.push(p);
    }
    return list;
  }

  spawnEnemies(spec) {
    for (let i = 0; i < spec.count; i++) {
      const a = (i / spec.count) * Math.PI * 2;
      const x = spec.around.x + Math.cos(a) * spec.spread;
      const z = spec.around.z + Math.sin(a) * spec.spread;
      this.enemies.push(new Enemy(this.scene, x, z, spec.bandana));
    }
  }

  setWanted(n) {
    this.state.wanted = clamp(n, 0, 5);
    this.audio.setSiren(this.state.wanted > 0);
    const want = Math.min(this.state.wanted, 3);
    while (this.police.length < want) {
      const a = this.rng() * Math.PI * 2;
      const x = this.player.x + Math.cos(a) * 55;
      const z = this.player.z + Math.sin(a) * 55;
      const car = new Car(this.scene, {
        color: 0xe8e8e8, x: clamp(x, -190, 190), z: clamp(z, -190, 200),
        heading: 0, kind: 'police', maxSpeed: 24, police: true,
      });
      this.police.push(car);
    }
    while (this.police.length > want) {
      const car = this.police.pop();
      this.scene.remove(car.mesh);
    }
  }

  enterOwnCar() {
    this.player.enterCar(this.ownCar);
  }

  teleport(x, z) {
    if (this.player.car) {
      const car = this.player.car;
      car.mesh.position.set(x, 0, z);
      car.speed = 0;
      this.player.mesh.position.set(x, 0, z);
    } else {
      this.player.mesh.position.set(x, 0, z);
      this.player.speed = 0;
    }
    this.snapCamera();
  }

  startGame() {
    if (this.state.mode === 'playing') return;
    this.state.mode = 'playing';
    this.audio.init();
    this.hud.showPlaying();
    if (!this.missions.active && !this.missions.done) this.missions.start(this.missions.index);
    this.hud.setObjective(this.missions.active ? this.missions.active.title : 'Kota Senja', this.currentStepText());
    this.save();
  }

  currentStepText() {
    const m = this.missions.active;
    if (!m) return 'Selesaikan semua misi.';
    const step = m.steps[m.step];
    return step ? step.text : m.briefing;
  }

  onMissionStart(m) {
    this.hud.setObjective(m.title, this.currentStepText());
    this.hud.toast(m.title + ' — ' + m.briefing, 3600);
    this.player.ammo += 12;
  }

  onMissionStep() {
    this.hud.setObjective(this.missions.active.title, this.currentStepText());
    this.audio.pickup();
  }

  onMissionPayout(def) {
    this.hud.toast('Misi selesai! +' + def.payout.toLocaleString('id-ID'), 3200);
    this.audio.missionDone();
    this.save();
  }

  onAllMissionsDone() {
    this.state.mode = 'complete';
    this.hud.showComplete();
    this.hud.setObjective('Kota Senja selesai', 'Semua misi selesai. Dimas menguasai senja.');
    this.save();
  }

  bindButtons() {
    const start = document.getElementById('btn-start');
    if (start) start.addEventListener('click', () => this.startGame());
    const resume = document.getElementById('btn-resume');
    if (resume) {
      resume.addEventListener('click', () => {
        if (this.state.mode === 'paused') {
          this.state.mode = 'playing';
          this.hud.showPlaying();
        }
      });
    }
    for (const id of ['btn-retry', 'btn-again', 'btn-restart']) {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', () => { location.href = location.pathname + '?fresh=1&seed=1'; });
    }
  }

  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (this.state.mode !== 'playing') return;
      if (e.code === 'KeyE') this.tryEnterCar();
      if (e.code === 'KeyF') {
        const hit = this.player.punch(this.enemies);
        if (hit) {
          this.audio.punch();
          this.gunshotPos = { x: this.player.x, z: this.player.z };
          this.gunshotTimer = 0.5;
        }
      }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        this.state.mode = 'paused';
        this.hud.showPause();
      }
      if (e.code === 'ArrowLeft') this.camYaw += 0.12;
      if (e.code === 'ArrowRight') this.camYaw -= 0.12;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (this.state.mode === 'playing' && !this.player.car) {
        try {
          canvas.requestPointerLock();
        } catch (e) {}
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas && this.state.mode === 'playing') {
        this.camYaw -= e.movementX * 0.0028;
        this.camPitch = clamp(this.camPitch + e.movementY * 0.002, 0.05, 0.9);
      }
    });
    window.addEventListener('mousedown', (e) => {
      if (this.state.mode !== 'playing' || this.player.car) return;
      if (e.target && (e.target.tagName === 'BUTTON' || e.target.closest('button'))) return;
      this.shoot();
    });
  }

  shoot() {
    const camPos = this.camera.position;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const res = this.player.shoot(camPos, dir, this.enemies);
    if (res && res !== 'empty') {
      this.audio.gunshot();
      this.gunshotPos = { x: this.player.x, z: this.player.z };
      this.gunshotTimer = 0.5;
    } else if (res === 'empty') {
      this.audio.blip(180, 0.06, 'square', 0.08);
    }
  }

  tryEnterCar() {
    if (this.player.car) {
      this.player.exitCar();
      return;
    }
    for (const car of [this.ownCar, this.goldCar]) {
      if (dist2(this.player.x, this.player.z, car.x, car.z) < 3.5) {
        if (car.kind !== 'own') this.setWanted(this.state.wanted + 1);
        this.player.enterCar(car);
        this.audio.blip(320, 0.1, 'sine', 0.1);
        return;
      }
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.state.cash,
        mission: this.missions.index,
        x: this.player.x,
        z: this.player.z,
        hp: this.player.hp,
      }));
    } catch (e) {}
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.cash === 'number') this.state.cash = s.cash;
      if (typeof s.mission === 'number') this.missions.index = Math.min(s.mission, 5);
      if (typeof s.hp === 'number') this.player.hp = s.hp;
      if (typeof s.x === 'number' && typeof s.z === 'number') {
        this.player.mesh.position.set(s.x, 0, s.z);
      }
    } catch (e) {}
  }

  snapCamera() {
    const t = this.player.car ? this.player.car.mesh.position : this.player.mesh.position;
    const yaw = this.player.car ? this.player.car.heading : this.camYaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    this.camera.position.set(t.x - fx * 9, 4.2, t.z - fz * 9);
    this.camera.lookAt(t.x + fx * 5, 1.6, t.z + fz * 5);
  }

  updateCamera(dt) {
    if (this.state.mode === 'menu') {
      this.menuAngle += dt * 0.05;
      const x = Math.sin(this.menuAngle) * 130;
      const z = Math.cos(this.menuAngle) * 130;
      this.camera.position.set(x, 42, z);
      this.camera.lookAt(0, 6, 30);
      return;
    }
    const target = this.player.car ? this.player.car.mesh.position : this.player.mesh.position;
    if (this.player.car) {
      const dy = this.player.car.heading - this.camYaw;
      let d = ((dy % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      this.camYaw += d * Math.min(1, 2.2 * dt);
    }
    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);
    const want = new THREE.Vector3(target.x - fx * 9, 4.4, target.z - fz * 9);
    this.camera.position.lerp(want, Math.min(1, 6 * dt));
    this.camera.lookAt(target.x + fx * 5, 1.6, target.z + fz * 5);
  }

  loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state.mode === 'playing') {
      this.update(dt);
    }
    this.updateCamera(dt);
    if (this.state.mode === 'playing') this.hud.update(this);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    const p = this.player;
    const input = {
      f: !!this.keys['KeyW'], b: !!this.keys['KeyS'],
      l: !!this.keys['KeyA'], r: !!this.keys['KeyD'],
      sprint: !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']),
    };
    if (p.car) {
      p.car.drive(dt, {
        fwd: input.f,
        back: input.b,
        steer: (input.l ? -1 : 0) + (input.r ? 1 : 0),
      }, this.colliders);
      p.mesh.position.set(p.car.x, 0, p.car.z);
      this.audio.setEngine(p.car.speed, true);
      // Running over a pedestrian is a crime.
      for (const ped of this.pedestrians) {
        if (ped.state !== 'fallen' && Math.abs(p.car.speed) > 3 &&
          dist2(p.car.x, p.car.z, ped.x, ped.z) < 2.4) {
          ped.fall();
          this.setWanted(this.state.wanted + 1);
        }
      }
    } else {
      p.walk(dt, input, this.camYaw, this.colliders);
      this.audio.setEngine(0, false);
    }
    p.punchCd = Math.max(0, p.punchCd - dt);
    p.shootCd = Math.max(0, p.shootCd - dt);

    // Traffic, police, pedestrians, enemies.
    const playerCar = p.car;
    for (const t of this.traffic) t.followWaypoints(dt, this.colliders, playerCar);
    for (const pc of this.police) pc.chase(dt, p.x, p.z, this.colliders);
    if (this.gunshotTimer > 0) this.gunshotTimer -= dt;
    const shotPos = this.gunshotTimer > 0 ? this.gunshotPos : null;
    for (const ped of this.pedestrians) ped.update(dt, this.colliders, shotPos);
    for (const e of this.enemies) {
      if (this.noDamage) {
        // Staged screenshot: thugs menace but their shots never land.
        const d = dist2(e.x, e.z, p.x, p.z);
        e.mesh.rotation.y = Math.atan2(p.x - e.x, p.z - e.z);
        if (d > 16) {
          const nx = e.x + ((p.x - e.x) / d) * 3 * dt;
          const nz = e.z + ((p.z - e.z) / d) * 3 * dt;
          const hit = collide(this.colliders, nx, nz, 0.6);
          e.mesh.position.x = hit.hit ? hit.x : nx;
          e.mesh.position.z = hit.hit ? hit.z : nz;
        }
      } else {
        e.update(dt, p, this.colliders);
      }
    }

    // Police ramming and arrest.
    if (this.police.length > 0) {
      let near = false;
      for (const pc of this.police) {
        const d = dist2(pc.x, pc.z, p.x, p.z);
        if (d < 60) near = true;
        if (p.car && d < 3.2) {
          p.car.speed *= 0.985;
          const dx = p.x - pc.x;
          const dz = p.z - pc.z;
          const dl = Math.sqrt(dx * dx + dz * dz) || 1;
          p.car.mesh.position.x += (dx / dl) * 0.4;
          p.car.mesh.position.z += (dz / dl) * 0.4;
        }
        if (!p.car && d < 4 && this.state.wanted >= 1) {
          this.arrestTimer += dt;
          if (this.arrestTimer > 2.5) {
            this.state.mode = 'busted';
            this.hud.showBusted();
            this.audio.setSiren(false);
            return;
          }
        }
      }
      if (!near) {
        this.arrestTimer = 0;
        this.wantedTimer += dt;
        if (this.wantedTimer > 20 && this.state.wanted > 0) {
          this.wantedTimer = 0;
          this.setWanted(this.state.wanted - 1);
        }
      } else {
        this.wantedTimer = 0;
      }
    }

    // Death.
    if (p.hp <= 0) {
      this.state.mode = 'wasted';
      this.hud.showWasted();
      this.audio.setSiren(false);
      return;
    }

    this.missions.update();
  }
}

const game = new Game();
window.__game = {
  state: game.state,
  missions: game.missions,
  actors: { player: game.player, enemies: game.enemies, pedestrians: game.pedestrians },
  vehicles: { police: game.police, traffic: game.traffic, ownCar: game.ownCar, goldCar: game.goldCar },
  teleport: (x, z) => game.teleport(x, z),
  startGame: () => game.startGame(),
  setWanted: (n) => game.setWanted(n),
  enterOwnCar: () => game.enterOwnCar(),
};
