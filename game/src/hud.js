// hud.js — DOM heads-up display for Kota Senja: cash, health, ammo, wanted
// stars, speed, mission objective, a top-down minimap, and the menu /
// pause / busted / wasted / complete overlays.

import { fmtCash } from './util.js';
import { ROAD_COORDS } from './city.js';

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.cashEl = this.el('cash');
    this.hpFill = this.el('hp-fill');
    this.ammoEl = this.el('ammo');
    this.starsEl = this.el('stars');
    this.speedEl = this.el('speed');
    this.objTitle = document.querySelector('#objective .t');
    this.objDesc = document.querySelector('#objective .d');
    this.minimap = this.el('minimap');
    this.mm = this.minimap.getContext('2d');
    this.toastEl = this.el('toast');
    this.toastTimer = null;
    this.last = {};
  }

  show(id) {
    const e = this.el(id);
    if (e) e.classList.remove('hidden');
  }

  hide(id) {
    const e = this.el(id);
    if (e) e.classList.add('hidden');
  }

  showMenu() {
    this.show('menu');
    this.hide('pause');
    this.hide('busted');
    this.hide('wasted');
    this.hide('complete');
    this.hide('hud');
  }

  showPlaying() {
    this.hide('menu');
    this.hide('pause');
    this.hide('busted');
    this.hide('wasted');
    this.hide('complete');
    this.show('hud');
  }

  showPause() {
    this.show('pause');
  }

  showBusted() {
    this.show('busted');
  }

  showWasted() {
    this.show('wasted');
  }

  showComplete() {
    this.show('complete');
  }

  setObjective(title, text) {
    if (this.objTitle) this.objTitle.textContent = title;
    if (this.objDesc) this.objDesc.textContent = text;
  }

  toast(msg, ms = 2600) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }

  update(g) {
    const p = g.player;
    const cash = fmtCash(g.state.cash);
    if (this.last.cash !== cash) {
      this.cashEl.textContent = cash;
      this.last.cash = cash;
    }
    const hp = Math.round(p.hp);
    if (this.last.hp !== hp) {
      this.hpFill.style.width = hp + '%';
      this.hpFill.style.background = hp > 50 ? '#3fae7a' : hp > 25 ? '#e8a33d' : '#d94f4f';
      this.last.hp = hp;
    }
    const ammo = p.car ? '—' : String(p.ammo);
    if (this.last.ammo !== ammo) {
      this.ammoEl.textContent = '🔫 ' + ammo;
      this.last.ammo = ammo;
    }
    const stars = '★'.repeat(g.state.wanted) + '☆'.repeat(5 - g.state.wanted);
    if (this.last.stars !== stars) {
      this.starsEl.textContent = stars;
      this.last.stars = stars;
    }
    const speed = p.car ? Math.round(Math.abs(p.car.speed) * 3.6) : Math.round(Math.abs(p.speed) * 3.6);
    if (this.last.speed !== speed) {
      this.speedEl.textContent = speed + ' km/h';
      this.last.speed = speed;
    }
    this.drawMinimap(g);
  }

  drawMinimap(g) {
    const c = this.mm;
    const S = 180;
    const mx = (x) => ((x + 200) / 400) * S;
    const mz = (z) => ((z + 200) / 400) * S;
    c.fillStyle = '#0d0a18';
    c.fillRect(0, 0, S, S);
    c.fillStyle = '#0d2b45';
    c.fillRect(0, mz(165), S, S - mz(165));
    c.strokeStyle = '#3a3348';
    c.lineWidth = 2;
    for (const coord of ROAD_COORDS) {
      c.beginPath();
      c.moveTo(mx(coord), 0);
      c.lineTo(mx(coord), S);
      c.stroke();
      c.beginPath();
      c.moveTo(0, mz(coord));
      c.lineTo(S, mz(coord));
      c.stroke();
    }
    const dot = (x, z, color, r) => {
      c.fillStyle = color;
      c.beginPath();
      c.arc(mx(x), mz(z), r, 0, Math.PI * 2);
      c.fill();
    };
    // Mission target, pulsing.
    const m = g.missions.active;
    if (m) {
      const step = m.steps[m.step];
      if (step && step.target) {
        const pulse = 5 + Math.sin(performance.now() / 250) * 2;
        c.strokeStyle = '#ffd166';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(mx(step.target.x), mz(step.target.z), pulse, 0, Math.PI * 2);
        c.stroke();
      }
    }
    for (const t of g.traffic) dot(t.x, t.z, '#8a8f98', 2);
    for (const e of g.enemies) if (!e.dead) dot(e.x, e.z, '#ff4d4d', 2.5);
    for (const pc of g.police) dot(pc.x, pc.z, '#4d8dff', 3);
    if (g.goldCar) dot(g.goldCar.x, g.goldCar.z, '#ffd700', 3);
    dot(g.ownCar.x, g.ownCar.z, '#2ec4b6', 3);
    // Player, with a facing tick.
    const p = g.player;
    dot(p.x, p.z, '#ffffff', 3.5);
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(mx(p.x), mz(p.z));
    c.lineTo(mx(p.x + fx * 8), mz(p.z + fz * 8));
    c.stroke();
  }
}
