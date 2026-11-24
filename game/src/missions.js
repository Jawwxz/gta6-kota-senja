// missions.js — the six-mission story of Kota Senja.
// A step is 'goto' (reach a place), 'defeat' (all spawned enemies down),
// 'steal' (get into the gold sedan) or 'park' (deliver the gold sedan).
// The machine only reads the game object; it never touches the DOM.

import { dist2 } from './util.js';

export const MISSION_DEFS = [
  {
    id: 'antar-bunga',
    title: 'Antar Bunga',
    briefing: 'Bu Ratna: "Dimas, ambil buket di gudang, antar ke kios sebelum layu!"',
    payout: 150000,
    steps: [
      { kind: 'goto', text: 'Ambil buket bunga di gudang', target: { x: 0, z: -117 }, radius: 10 },
      { kind: 'goto', text: 'Antar buket ke Kios Bunga Senja', target: { x: 0, z: 90 }, radius: 10 },
    ],
  },
  {
    id: 'penyergapan',
    title: 'Penyergapan',
    briefing: 'Geng Purnama menghadang di pasar! Hadapi mereka.',
    payout: 100000,
    spawn: { count: 4, around: { x: 0, z: 84 }, spread: 9, bandana: 0x8a2be2 },
    steps: [
      { kind: 'defeat', text: 'Kalahkan penyergap Geng Purnama', target: { x: 0, z: 84 }, radius: 18 },
    ],
  },
  {
    id: 'rebut-wilayah',
    title: 'Rebut Wilayah',
    briefing: 'Anak Senja menguasai tikungan barat. Rebut kembali.',
    payout: 120000,
    spawn: { count: 3, around: { x: -90, z: -54 }, spread: 6, bandana: 0xe86b2d },
    steps: [
      { kind: 'goto', text: 'Datangi titik kumpul Anak Senja', target: { x: -90, z: -54 }, radius: 14 },
      { kind: 'defeat', text: 'Kalahkan penjaga wilayah', target: { x: -90, z: -54 }, radius: 18 },
    ],
  },
  {
    id: 'curi-sedan',
    title: 'Curi Sedan Emas',
    briefing: 'Sedan emas Geng Purnama parkir di timur. Curi, bawa ke bengkel.',
    payout: 150000,
    steps: [
      { kind: 'steal', text: 'Curi sedan emas di jalan timur', target: { x: 126, z: -18 }, radius: 9 },
      { kind: 'park', text: 'Bawa sedan emas ke bengkel', target: { x: -126, z: 126 }, radius: 10 },
    ],
  },
  {
    id: 'gudang',
    title: 'Penjaga Gudang',
    briefing: 'Geng Purnama menjaga gudang. Bersihkan mereka.',
    payout: 150000,
    spawn: { count: 4, around: { x: 0, z: -117 }, spread: 7, bandana: 0x8a2be2 },
    steps: [
      { kind: 'goto', text: 'Datangi gudang', target: { x: 0, z: -117 }, radius: 14 },
      { kind: 'defeat', text: 'Kalahkan penjaga gudang', target: { x: 0, z: -117 }, radius: 18 },
    ],
  },
  {
    id: 'dermaga',
    title: 'Lari ke Dermaga',
    briefing: 'Polisi mengejar! Bawa paket terakhir ke dermaga.',
    payout: 200000,
    wanted: 3,
    steps: [
      { kind: 'goto', text: 'Kabur ke dermaga selatan', target: { x: 0, z: 162 }, radius: 12 },
    ],
  },
];

export class Missions {
  constructor(g) {
    this.g = g;
    this.index = 0;
    this.active = null;
    this.completed = [];
    this.done = false;
  }

  start(i) {
    const def = MISSION_DEFS[i];
    if (!def) {
      this.active = null;
      this.done = true;
      return;
    }
    this.index = i;
    this.active = {
      id: def.id,
      title: def.title,
      briefing: def.briefing,
      payout: def.payout,
      steps: def.steps,
      step: 0,
    };
    if (def.spawn) this.g.spawnEnemies(def.spawn);
    if (def.wanted) this.g.setWanted(def.wanted);
    this.g.onMissionStart(this.active);
  }

  aliveEnemies() {
    return this.g.enemies.filter((e) => !e.dead).length;
  }

  update() {
    if (!this.active || this.done) return;
    const def = MISSION_DEFS[this.index];
    const step = def.steps[this.active.step];
    if (!step) return;
    const p = this.g.player;
    let done = false;
    if (step.kind === 'goto') {
      done = dist2(p.x, p.z, step.target.x, step.target.z) < step.radius;
    } else if (step.kind === 'defeat') {
      done = this.aliveEnemies() === 0;
    } else if (step.kind === 'steal') {
      done = !!(p.car && p.car.kind === 'gold');
    } else if (step.kind === 'park') {
      done = !!(p.car && p.car.kind === 'gold') &&
        dist2(p.x, p.z, step.target.x, step.target.z) < step.radius;
    }
    if (done) {
      this.active.step += 1;
      this.g.onMissionStep(this.active);
      if (this.active.step >= def.steps.length) this.complete();
    }
  }

  complete() {
    const def = MISSION_DEFS[this.index];
    this.g.state.cash += def.payout;
    this.completed.push(def.id);
    this.g.onMissionPayout(def);
    const next = this.index + 1;
    if (next >= MISSION_DEFS.length) {
      this.active = null;
      this.done = true;
      this.g.onAllMissionsDone();
    } else {
      this.start(next);
    }
  }
}
