// Kota Senja — bootstrap, game loop, camera, input, wanted system, save/load.
// Original open-world game: explore the dusk city on foot and by car, six missions.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, damp, angDiff, dist2, TAU } from './util.js';
import { buildCity } from './city.js';
import { createVehicles } from './vehicles.js';
import { createActors } from './actors.js';
import { createMissions } from './missions.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || 1);
const SAVE_KEY = 'kota-senja-save-v1';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 700);

const G = {
  scene, camera, renderer,
  time: 0, shake: 0, skidding: false, threat: { x: 0, z: 0 },
  camYaw: Math.PI, camPitch: 0.12, camDist: 6.5, lastDrag: -99,
  shotRear: false, shotOrbit: false,
  events: [],
  state: { mode: 'menu', cash: 50000, wanted: 0, missionIndex: 0, wantedDecayFast: false },
  emit(type, data) { G.events.push({ type, data, at: G.time }); },
  addCash(n) { G.state.cash += n; },
};
G.city = buildCity(scene, SEED);
G.audio = createAudio();
G.hud = createHud();
G.vehicles = createVehicles(G);
G.actors = createActors(G);
G.missions = createMissions(G);
G.vehicles.spawnInitial();

// ---------- save / load ----------
G.save = () => {
  try {
    const p = G.actors.player;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.state.cash, missionIndex: G.state.missionIndex, hp: p.hp,
      pos: [p.pos.x, p.pos.z], heading: p.heading,
    }));
  } catch { /* storage unavailable — play on without saving */ }
};
G.load = () => {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!s) return false;
    G.state.cash = s.cash; G.state.missionIndex = s.missionIndex;
    G.actors.player.hp = s.hp ?? 100;
    G.actors.player.pos.set(s.pos[0], 0, s.pos[1]);
    G.actors.player.heading = s.heading ?? Math.PI;
    G.actors.player.mesh.position.copy(G.actors.player.pos);
    return true;
  } catch { return false; }
};
if (params.get('fresh') === '1') { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

// ---------- wanted ----------
let decayT = 0, bustT = 0, lastShotCrime = -99;
function addWanted(n) {
  G.state.wanted = clamp(G.state.wanted + n, 0, 5);
  G.state.wantedDecayFast = false;
  decayT = 0;
}

// ---------- start / win / death ----------
G.startGame = () => {
  G.audio.ensure();
  G.state.mode = 'playing';
  G.hud.showMenu(null);
  if (!G.missions.active) G.missions.start(G.state.missionIndex);
};
G.win = () => {
  G.state.mode = 'won';
  G.state.wanted = 0;
  G.save();
  const mins = Math.floor(G.time / 60);
  document.getElementById('win-stats').textContent =
    `Enam misi selesai dalam ${mins} menit — Rp ${G.state.cash.toLocaleString('id-ID')} di kantong. Kota Senja bebas, untuk malam ini.`;
  G.hud.showMenu('win');
};
function respawnAt(spotsKey, loseFrac, title) {
  const s = G.city.spots[spotsKey];
  const p = G.actors.player;
  if (p.car) {
    p.car.kind = 'parked'; p.car.speed = 0;
    G.vehicles.parked.push(p.car);
    G.vehicles.attachHeadlight(null); p.car = null;
  }
  p.pos.set(s.x, 0, s.z);
  p.heading = Math.PI;
  p.mesh.position.copy(p.pos);
  p.hp = 100; p.dead = false; p.ammo = p.maxAmmo;
  const lost = Math.floor(G.state.cash * loseFrac);
  G.state.cash -= lost;
  G.state.wanted = 0;
  G.hud.toast(`${title} — kehilangan Rp ${lost.toLocaleString('id-ID')}`);
  G.state.mode = 'playing';
  G.hud.showMenu(null);
}

// ---------- input ----------
const keys = {};
let dragging = false, dragMoved = 0, lastMX = 0, lastMY = 0;
const input = {
  get fwd() { return keys.KeyW || keys.ArrowUp; },
  get back() { return keys.KeyS || keys.ArrowDown; },
  get left() { return keys.KeyA || keys.ArrowLeft; },
  get right() { return keys.KeyD || keys.ArrowRight; },
  get sprint() { return keys.ShiftLeft || keys.ShiftRight; },
  get handbrake() { return keys.Space; },
};
addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (G.state.mode !== 'playing') return;
  if (e.code === 'KeyE') toggleCar();
  if (e.code === 'KeyF') G.actors.tryPunch();
  if (e.code === 'KeyR') G.actors.startReload();
  if (e.code === 'KeyP' || e.code === 'Escape') pauseGame();
  if (e.code === 'Digit0') {
    const m = G.audio.toggleMute();
    G.hud.toast(m ? 'Suara mati' : 'Suara hidup');
  }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', (e) => { dragging = true; dragMoved = 0; lastMX = e.clientX; lastMY = e.clientY; });
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMX, dy = e.clientY - lastMY;
  lastMX = e.clientX; lastMY = e.clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  G.camYaw -= dx * 0.005;
  G.camPitch = clamp(G.camPitch + dy * 0.003, -0.12, 0.55);
  G.lastDrag = G.time;
});
addEventListener('mouseup', (e) => {
  if (dragging && dragMoved < 6 && G.state.mode === 'playing' && !G.actors.player.car && e.target === canvas) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    G.actors.tryShoot(camera.position, dir);
    if (G.time - lastShotCrime > 5) { addWanted(1); lastShotCrime = G.time; }
  }
  dragging = false;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  G.camDist = clamp(G.camDist + Math.sign(e.deltaY) * 0.8, 4, 12);
}, { passive: false });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function toggleCar() {
  const p = G.actors.player;
  if (p.car) {
    const car = p.car;
    // step out to the right side of the car
    const rx = -Math.cos(car.heading), rz = Math.sin(car.heading);
    p.pos.set(car.pos.x + rx * 2.6, 0, car.pos.z + rz * 2.6);
    G.city.collideCircle(p.pos, 0.55);
    p.heading = car.heading;
    p.mesh.position.copy(p.pos);
    car.kind = 'parked';
    car.speed = 0;
    G.vehicles.parked.push(car); // back on the street, stealable again
    G.vehicles.attachHeadlight(null);
    p.car = null;
    return;
  }
  const car = G.vehicles.nearestCar(p.pos, 4.2);
  if (!car) { G.hud.toast('Tidak ada mobil di dekatmu'); return; }
  if (car.kind === 'traffic') G.vehicles.traffic.splice(G.vehicles.traffic.indexOf(car), 1);
  else G.vehicles.parked.splice(G.vehicles.parked.indexOf(car), 1);
  car.kind = 'player';
  if (!car.own) {
    addWanted(1);
    G.hud.toast(car.target ? 'Sedan emas dicuri! Patroli datang.' : 'Mobil curian! Patroli datang.');
  }
  G.vehicles.attachHeadlight(car);
  p.car = car;
  p.pos.copy(car.pos);
}

function pauseGame() {
  if (G.state.mode !== 'playing') return;
  G.state.mode = 'paused';
  G.save();
  G.hud.showMenu('pause');
}

// ---------- buttons ----------
document.getElementById('btn-start').onclick = () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  G.state.cash = 50000; G.state.missionIndex = 0; G.state.wanted = 0;
  G.actors.player.hp = 100;
  G.actors.player.pos.set(18, 0, 126);
  G.actors.player.heading = Math.PI;
  G.actors.player.mesh.position.copy(G.actors.player.pos);
  G.startGame();
};
document.getElementById('btn-continue').onclick = () => { G.load(); G.startGame(); };
document.getElementById('btn-resume').onclick = () => { G.state.mode = 'playing'; G.hud.showMenu(null); };
document.getElementById('btn-quit').onclick = () => { G.state.mode = 'menu'; G.hud.showMenu('start'); };
document.getElementById('btn-busted').onclick = () => respawnAt('policeStation', 0.15, 'Dibebaskan Patroli');
document.getElementById('btn-dead').onclick = () => respawnAt('hospital', 0.1, 'Keluar dari klinik');
document.getElementById('btn-freeroam').onclick = () => { G.state.mode = 'playing'; G.hud.showMenu(null); };
document.getElementById('btn-again').onclick = () => { location.href = location.pathname + '?fresh=1'; };
if (!params.get('shot') && G.load()) document.getElementById('btn-continue').style.display = 'inline-block';

// ---------- camera ----------
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
function updateCamera(dt) {
  const p = G.actors.player;
  if (G.state.mode === 'menu') {
    const a = G.time * (G.shotOrbit ? 0.03 : 0.06);
    camPos.set(Math.sin(a) * 46, 17, Math.cos(a) * 46);
    camera.position.lerp(camPos, damp(2, dt));
    camera.lookAt(0, 5, 0);
    return;
  }
  const inCar = !!p.car;
  const fwdX = Math.sin(G.camYaw), fwdZ = Math.cos(G.camYaw);
  if (inCar && G.time - G.lastDrag > 1.6) {
    G.camYaw += angDiff(G.camYaw, p.car.heading) * damp(1.4, dt);
  }
  camTarget.copy(p.pos); camTarget.y += inCar ? 1.8 : 1.7;
  const dist = inCar ? 10.5 : G.camDist;
  const height = inCar ? 3.4 : 2.4 + G.camPitch * 4;
  if (G.shotRear && inCar) {
    // camera ahead of the car, looking back at it and its pursuers
    camPos.set(p.pos.x + fwdX * 11, height + 1, p.pos.z + fwdZ * 11);
    camera.position.lerp(camPos, damp(6, dt));
    camera.lookAt(p.pos.x - fwdX * 8, 1.4, p.pos.z - fwdZ * 8);
  } else {
    camPos.set(camTarget.x - fwdX * dist, camTarget.y + height, camTarget.z - fwdZ * dist);
    camera.position.lerp(camPos, damp(7, dt));
    camera.lookAt(camTarget.x + fwdX * 2.5, camTarget.y - 0.4, camTarget.z + fwdZ * 2.5);
  }
  if (G.shake > 0.005) {
    camera.position.x += (Math.random() - 0.5) * G.shake;
    camera.position.y += (Math.random() - 0.5) * G.shake * 0.6;
    G.shake = Math.max(0, G.shake - dt * 1.4);
  }
}

// ---------- car vs pedestrian hits ----------
function checkCarPedHits() {
  const p = G.actors.player;
  if (!p.car || Math.abs(p.car.speed) < 3) return;
  for (let i = G.actors.peds.length - 1; i >= 0; i--) {
    const ped = G.actors.peds[i];
    if (dist2(ped.pos.x, ped.pos.z, p.car.pos.x, p.car.pos.z) < 2.1) {
      G.actors.peds.splice(i, 1);
      ped.parts.group.rotation.x = -Math.PI / 2;
      ped.parts.group.position.y = 0.3;
      setTimeout(() => G.scene.remove(ped.parts.group), 4000);
      addWanted(1);
      G.hud.toast('Kamu menabrak pejalan kaki! Patroli datang.');
      G.audio.thud(0.7);
      G.shake = 0.5;
      setTimeout(() => G.actors.spawnPed(), 9000);
      break;
    }
  }
}

// ---------- busted check: police close + slow = arrested ----------
function checkBusted(dt) {
  const p = G.actors.player;
  if (G.state.wanted === 0 || G.state.mode !== 'playing') { bustT = 0; return; }
  let close = false;
  for (const c of G.vehicles.police) {
    if (dist2(c.pos.x, c.pos.z, p.pos.x, p.pos.z) < (p.car ? 4.5 : 3.2)) { close = true; break; }
  }
  const slow = p.car ? Math.abs(p.car.speed) < 1 : p.speed < 1;
  if (close && slow) {
    bustT += dt;
    if (bustT > 2) {
      bustT = 0;
      G.state.mode = 'busted';
      const fine = Math.min(G.state.cash, 50000);
      G.state.cash -= fine;
      G.state.wanted = 0;
      G.hud.showMenu('busted');
    }
  } else bustT = Math.max(0, bustT - dt * 2);
}

// ---------- main loop ----------
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;
  const mode = G.state.mode;
  G.city.update(dt, G.time);
  if (mode === 'menu') {
    G.vehicles.updateTraffic(dt);
    G.actors.update(dt, input, G.camYaw);
  } else if (mode === 'playing') {
    // wanted decay (faster once the chase is escaped)
    if (G.state.wanted > 0) {
      decayT += dt;
      const interval = G.state.wantedDecayFast ? 4 : 16;
      if (decayT > interval) { decayT = 0; G.state.wanted = Math.max(0, G.state.wanted - 1); }
    }
    G.vehicles.update(dt, input, G.actors.player);
    G.actors.update(dt, input, G.camYaw);
    G.missions.update(dt);
    G.audio.engine(G.actors.player.car ? 1 : 0, G.actors.player.car ? G.actors.player.car.speed : 0);
    G.audio.skid(G.skidding && !!G.actors.player.car);
    G.audio.update(dt);
    checkCarPedHits();
    checkBusted(dt);
    if (G.state.mode === 'dying' && G.time - G.dieAt > 1.6) {
      G.state.mode = 'dead';
      G.hud.showMenu('dead');
    }
    G.hud.update(G);
  } else if (mode === 'won' || mode === 'paused' || mode === 'busted' || mode === 'dead' || mode === 'dying') {
    G.audio.engine(0, 0);
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}

// ---------- boot ----------
if (params.get('shot')) {
  const shot = params.get('shot');
  G.audio.ensure();
  stageShot(shot, G);
  if (shot !== 'menu') G.hud.showMenu(null);
}
document.getElementById('status').textContent = 'Kota Senja siap. Pilih Mulai Main.';

// Debug / test handle for the screenshot driver. Assigned BEFORE loop() starts,
// so a runtime error inside the loop can never hide the handle from the driver.
window.__game = {
  state: G.state, actors: G.actors, vehicles: G.vehicles, missions: G.missions,
  city: G.city, audio: G.audio, hud: G.hud,
  get time() { return G.time; },
  startGame: G.startGame,
  teleport(x, z) {
    const p = G.actors.player;
    // If the player is driving, the car comes along (and stops): otherwise the
    // per-frame car sync snaps the player straight back to the old spot.
    if (p.car) {
      p.car.pos.set(x, 0, z);
      p.car.mesh.position.copy(p.car.pos);
      p.car.speed = 0;
    }
    p.pos.set(x, 0, z); p.mesh.position.copy(p.pos);
  },
  setWanted(n) { G.state.wanted = n; },
  get camYaw() { return G.camYaw; }, set camYaw(v) { G.camYaw = v; },
};

loop();
