// Kota Senja — HUD, minimap, menus, toasts. DOM only, no three.js.
import { STREET_LINES } from './city.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const el = {
    hud: $('hud'), cash: $('cash'), hpfill: $('hpfill'), ammo: $('ammo'),
    stars: $('stars'), objT: document.querySelector('#objective .t'),
    objD: document.querySelector('#objective .d'), speed: $('speed'),
    help: $('help'), minimap: $('minimap'), xhair: $('xhair'),
    toast: $('toast'), banner: $('banner'), bannerBig: document.querySelector('#banner .big'),
    bannerSub: document.querySelector('#banner .sub'), dmg: $('dmg'),
    status: $('status'),
  };
  const mm = el.minimap.getContext('2d');
  let toastTimer = null, bannerTimer = null, marker = null;

  function showMenu(name) {
    for (const m of document.querySelectorAll('.menu')) m.classList.remove('on');
    if (name) $(`menu-${name}`).classList.add('on');
    el.hud.classList.toggle('on', !name);
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.style.opacity = '1';
    el.status.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.style.opacity = '0'; }, 3400);
  }

  function banner(big, sub = '') {
    el.bannerBig.textContent = big;
    el.bannerSub.textContent = sub;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 3000);
  }

  function damageFlash() {
    el.dmg.style.transition = 'none';
    el.dmg.style.opacity = '1';
    requestAnimationFrame(() => {
      el.dmg.style.transition = 'opacity .5s';
      el.dmg.style.opacity = '0';
    });
  }

  function setObjective(title, detail, dist) {
    el.objT.textContent = title;
    el.objD.textContent = detail + (dist > 0 ? ` — ${Math.round(dist)} m` : '');
  }

  function drawMinimap(G) {
    const S = 190, C = S / 2, k = S / 360; // city spans -180..180
    const px = (x) => C + x * k, pz = (z) => C + z * k;
    mm.clearRect(0, 0, S, S);
    mm.fillStyle = '#241a30'; mm.fillRect(0, 0, S, S);
    // districts
    mm.fillStyle = 'rgba(180,120,60,0.18)'; mm.fillRect(0, 0, S, pz(-54));
    mm.fillStyle = 'rgba(255,46,136,0.14)'; mm.fillRect(0, pz(54), S, S - pz(54));
    // roads
    mm.strokeStyle = '#5a4a72'; mm.lineWidth = 3;
    for (const s of STREET_LINES) {
      mm.beginPath(); mm.moveTo(px(-180), pz(s)); mm.lineTo(px(180), pz(s)); mm.stroke();
      mm.beginPath(); mm.moveTo(px(s), pz(-180)); mm.lineTo(px(s), pz(180)); mm.stroke();
    }
    // plaza
    mm.fillStyle = '#8a6ab0'; mm.fillRect(px(-13), pz(-13), 26 * k, 26 * k);
    // mission marker
    if (marker) {
      const pulse = 4 + Math.sin(G.time * 5) * 1.6;
      mm.fillStyle = '#ffb36b';
      mm.beginPath(); mm.arc(px(marker.x), pz(marker.z), pulse, 0, 7); mm.fill();
      mm.strokeStyle = '#fff'; mm.lineWidth = 1.5;
      mm.beginPath(); mm.arc(px(marker.x), pz(marker.z), pulse + 3, 0, 7); mm.stroke();
    }
    // traffic + police + enemies
    mm.fillStyle = '#b8b0c8';
    for (const c of G.vehicles.traffic) { mm.fillRect(px(c.pos.x) - 1.5, pz(c.pos.z) - 1.5, 3, 3); }
    mm.fillStyle = '#3a86ff';
    for (const c of G.vehicles.police) {
      mm.beginPath(); mm.arc(px(c.pos.x), pz(c.pos.z), 3.4, 0, 7); mm.fill();
    }
    mm.fillStyle = '#ff3344';
    for (const e of G.actors.enemies) {
      if (!e.dead) { mm.beginPath(); mm.arc(px(e.pos.x), pz(e.pos.z), 3, 0, 7); mm.fill(); }
    }
    // player arrow
    const p = G.actors.player.pos, h = G.actors.player.heading;
    mm.save();
    mm.translate(px(p.x), pz(p.z)); mm.rotate(Math.atan2(Math.sin(h), -Math.cos(h)) + Math.PI);
    mm.fillStyle = '#ffffff';
    mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4.4, 5); mm.lineTo(-4.4, 5); mm.closePath(); mm.fill();
    mm.restore();
  }

  function update(G) {
    const p = G.actors.player;
    el.cash.textContent = `Rp ${G.state.cash.toLocaleString('id-ID')}`;
    el.hpfill.style.width = `${Math.max(0, p.hp)}%`;
    el.ammo.textContent = p.car ? 'Mobil — Spasi rem tangan' :
      (p.reloading > 0 ? 'Isi peluru…' : `Pistol ${p.ammo}/${p.maxAmmo} — F pukul, Klik tembak`);
    let stars = '';
    for (let i = 0; i < 5; i++) stars += `<span class="${i < G.state.wanted ? 'lit' : ''}">★</span>`;
    el.stars.innerHTML = stars;
    if (p.car) {
      el.speed.style.display = 'block';
      el.speed.textContent = `${Math.round(Math.abs(p.car.speed) * 3.6)} km/h`;
    } else el.speed.style.display = 'none';
    el.xhair.style.display = (!p.car && G.state.mode === 'playing') ? 'block' : 'none';
    drawMinimap(G);
  }

  return {
    showMenu, toast, banner, damageFlash, setObjective, update,
    setMarker(m) { marker = m; },
  };
}
