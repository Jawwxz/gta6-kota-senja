// Kota Senja — six missions: a courier's night across the dusk city.
import * as THREE from '../vendor/three.module.min.js';
import { dist2 } from './util.js';

// All goto/deliver points sit on streets or open ground, never inside a
// building footprint, so every step is reachable on foot or by car.
const MISSIONS = [
  {
    id: 1, title: 'Paket Pertama',
    briefing: 'Bu Ratna: "Dimas, ambil paket di Gudang Beras, antar ke Kios Bunga. Cepat, sebelum senja habis."',
    reward: 150000,
    steps: [
      { type: 'goto', x: 0, z: -117, r: 6, label: 'Ambil paket di Gudang Beras' },
      { type: 'goto', x: 0, z: 90, r: 7, label: 'Antar paket ke Kios Bunga Senja' },
    ],
  },
  {
    id: 2, title: 'Preman Pasar',
    briefing: 'Geng Purnama memalak pedagang pasar. Usir mereka — tangan kosong atau pistol, terserah kamu.',
    reward: 200000,
    steps: [
      { type: 'defeat', missionId: 2, label: 'Usir preman Geng Purnama dari pasar (0/4)' },
    ],
  },
  {
    id: 3, title: 'Kejar Patroli',
    briefing: 'Patroli datang! Kabur lewat tiga titik — jangan sampai ketangkap.',
    reward: 250000,
    steps: [
      { type: 'goto', x: -90, z: -90, r: 8, label: 'Kabur ke titik 1 — gang utara' },
      { type: 'goto', x: 90, z: 90, r: 8, label: 'Kabur ke titik 2 — pasar timur' },
      { type: 'goto', x: -162, z: 0, r: 8, label: 'Kabur ke titik 3 — ujung barat' },
    ],
  },
  {
    id: 4, title: 'Mobil Pesanan',
    briefing: 'Anak Senja butuh mobil itu — sedan emas di timur. Ambil, antar ke bengkel barat.',
    reward: 300000,
    steps: [
      { type: 'steal', x: 126, z: -30, r: 6, label: 'Curi sedan emas di timur (E untuk masuk)' },
      { type: 'deliver', x: -108, z: 18, r: 7, label: 'Antar mobil ke bengkel' },
    ],
  },
  {
    id: 5, title: 'Gudang Gelap',
    briefing: 'Paket penting disembunyikan di gudang. Masuk, hadapi penjaga, bawa keluar.',
    reward: 400000,
    steps: [
      { type: 'goto', x: 0, z: -126, r: 6, label: 'Masuk halaman Gudang Beras' },
      { type: 'defeat', missionId: 5, label: 'Hadapi penjaga gudang (0/5)' },
      { type: 'goto', x: 0, z: -126, r: 4, label: 'Ambil paket dari peti' },
      { type: 'goto', x: 0, z: 90, r: 7, label: 'Bawa paket ke Bu Ratna' },
    ],
  },
  {
    id: 6, title: 'Senja Terakhir',
    briefing: 'Ini dia. Bawa paket ke dermaga — Patroli mengejar habis-habisan. Jangan berhenti.',
    reward: 500000,
    steps: [
      { type: 'goto', x: -150, z: 162, r: 8, label: 'Bawa paket ke dermaga barat daya' },
    ],
  },
];

export function createMissions(G) {
  const { scene, hud, audio } = G;
  // marker beacon: light pillar + ground ring at the current objective
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 34, 16, 1, true), beaconMat);
  beacon.position.y = 17;
  scene.add(beacon);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.0, 24),
    new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15;
  scene.add(ring);
  beacon.visible = false; ring.visible = false;

  let index = 0;       // mission index (0-based)
  let step = 0;
  let active = null;   // current mission def
  let done = false;
  let spawnedForStep = -1;

  function labelWithCount(s) {
    if (s.type !== 'defeat') return s.label;
    const total = s.missionId === 2 ? 4 : 5;
    const left = G.actors.enemies.filter((e) => !e.dead && e.missionId === s.missionId).length;
    return s.label.replace(/\(\d+\/\d+\)/, `(${total - left}/${total})`);
  }

  function moveMarker(x, z) {
    beacon.position.x = x; beacon.position.z = z;
    ring.position.x = x; ring.position.z = z;
    beacon.visible = true; ring.visible = true;
  }

  function start(i) {
    index = i;
    step = 0;
    spawnedForStep = -1;
    active = MISSIONS[i];
    done = false;
    G.state.missionIndex = i;
    if (i === 2) G.state.wanted = 3; // Kejar Patroli: the chase is on
    if (i === 5) G.state.wanted = 4; // Senja Terakhir: full pursuit
    hud.toast(active.briefing);
    hud.banner(active.title, 'Misi ' + (i + 1) + ' dari 6');
    audio.jingle();
    beginStep();
  }

  function beginStep() {
    const s = active.steps[step];
    if (s.type === 'goto' || s.type === 'deliver' || s.type === 'steal') moveMarker(s.x, s.z);
    else { beacon.visible = false; ring.visible = false; }
    if (s.type === 'defeat' && spawnedForStep !== step) {
      spawnedForStep = step;
      if (s.missionId === 2) {
        // four thugs around the market plaza, all on the street
        const spots = [[-8, 84], [8, 96], [-4, 100], [10, 82]];
        spots.forEach(([x, z]) => G.actors.spawnEnemy(x, z, 'thug', 2));
        moveMarker(0, 90);
      } else if (s.missionId === 5) {
        // five warehouse guards: three thugs, two shooters
        const spots = [[-8, -124], [8, -128], [0, -120], [-12, -130], [12, -122]];
        spots.forEach(([x, z], k) => G.actors.spawnEnemy(x, z, k < 3 ? 'thug' : 'shooter', 5));
        moveMarker(0, -126);
      }
    }
  }

  function completeStep() {
    audio.chime();
    step += 1;
    if (step >= active.steps.length) completeMission();
    else beginStep();
  }

  function completeMission() {
    G.addCash(active.reward);
    hud.banner('MISI SELESAI', `${active.title} — +Rp ${active.reward.toLocaleString('id-ID')}`);
    audio.jingle();
    if (index === 2) G.state.wantedDecayFast = true; // escaped: heat cools off fast
    G.save();
    if (index + 1 >= MISSIONS.length) {
      done = true;
      active = null;
      beacon.visible = false; ring.visible = false;
      G.win();
    } else {
      start(index + 1);
    }
  }

  function update(dt) {
    if (!active || G.state.mode !== 'playing') {
      if (active) hud.setObjective(active.title, labelWithCount(active.steps[step]), 0);
      return;
    }
    const s = active.steps[step];
    const p = G.actors.player.pos;
    let dist = 0;
    if (s.type === 'goto' || s.type === 'deliver') {
      dist = dist2(p.x, p.z, s.x, s.z);
      const ok = s.type === 'deliver' ? !!G.actors.player.car : true;
      if (dist < s.r && ok) completeStep();
    } else if (s.type === 'steal') {
      dist = dist2(p.x, p.z, s.x, s.z);
      if (G.actors.player.car && G.actors.player.car.target) completeStep();
    } else if (s.type === 'defeat') {
      const left = G.actors.enemies.filter((e) => !e.dead && e.missionId === s.missionId).length;
      if (left === 0) completeStep();
    }
    if (active) {
      hud.setObjective(`Misi ${index + 1}/6 — ${active.title}`, labelWithCount(s), dist);
      hud.setMarker(s.type === 'defeat' ? null : { x: s.x, z: s.z });
    }
    // beacon pulse
    beaconMat.opacity = 0.16 + Math.sin(G.time * 3) * 0.07;
  }

  return {
    list: MISSIONS, start, update,
    get index() { return index; },
    get active() { return active; },
    get finished() { return done; },
  };
}
