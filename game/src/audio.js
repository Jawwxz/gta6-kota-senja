// Kota Senja — all sound is synthesized with WebAudio. No audio files, no network.
export function createAudio() {
  let ctx = null, master = null, muted = false;
  let engineOsc1 = null, engineOsc2 = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null, sirenPhase = 0;
  let padOsc = null, padGain = null, padTimer = 0, padChord = 0;
  let skidSrc = null, skidGain = null;
  const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 196, 246.9]];

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      // engine hum
      engineOsc1 = ctx.createOscillator(); engineOsc1.type = 'sawtooth'; engineOsc1.frequency.value = 42;
      engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'square'; engineOsc2.frequency.value = 84;
      engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420;
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      engineOsc1.connect(engineFilter); engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain); engineGain.connect(master);
      engineOsc1.start(); engineOsc2.start();
      // siren
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master); sirenOsc.start();
      // ambient pad
      padOsc = [ctx.createOscillator(), ctx.createOscillator(), ctx.createOscillator()];
      padGain = ctx.createGain(); padGain.gain.value = 0.045;
      padOsc.forEach((o, i) => { o.type = 'triangle'; o.frequency.value = CHORDS[0][i] / 2; o.connect(padGain); o.start(); });
      padGain.connect(master);
      // skid noise loop
      const len = ctx.sampleRate * 1;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      skidSrc = ctx.createBufferSource(); skidSrc.buffer = buf; skidSrc.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2;
      skidGain = ctx.createGain(); skidGain.gain.value = 0;
      skidSrc.connect(bp); bp.connect(skidGain); skidGain.connect(master);
      skidSrc.start();
    } catch { ctx = null; }
  }

  function blip(freq, dur, type = 'sine', vol = 0.3, slideTo = null) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }
  function noiseBurst(dur, vol, freq = 1200) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  return {
    ensure,
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; },
    engine(level, speed) {
      if (!ctx) return;
      const on = level > 0.02;
      engineGain.gain.setTargetAtTime(on ? 0.05 + level * 0.06 : 0, ctx.currentTime, 0.1);
      const f = 42 + Math.abs(speed) * 4.2;
      engineOsc1.frequency.setTargetAtTime(f, ctx.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(f * 2, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(320 + level * 900, ctx.currentTime, 0.1);
    },
    siren(on, dist) {
      if (!ctx) return;
      sirenPhase += 0.016 * 2.4;
      const vol = on ? Math.max(0, 0.11 - dist * 0.0011) : 0;
      sirenGain.gain.setTargetAtTime(vol, ctx.currentTime, 0.2);
      sirenOsc.frequency.setTargetAtTime(Math.sin(sirenPhase) > 0 ? 950 : 700, ctx.currentTime, 0.03);
    },
    skid(on) { if (skidGain) skidGain.gain.setTargetAtTime(on ? 0.09 : 0, ctx.currentTime, 0.08); },
    shot() { noiseBurst(0.14, 0.5, 2600); blip(160, 0.1, 'sine', 0.35, 55); },
    enemyShot() { noiseBurst(0.1, 0.2, 1800); },
    punch() { blip(130, 0.12, 'sine', 0.4, 50); noiseBurst(0.06, 0.2, 700); },
    thud(v = 0.4) { blip(75, 0.22, 'sine', Math.min(0.6, v), 38); noiseBurst(0.1, v * 0.4, 500); },
    chime() { blip(880, 0.16, 'sine', 0.25); setTimeout(() => blip(1318, 0.22, 'sine', 0.25), 90); },
    jingle() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'triangle', 0.22), i * 110)); },
    reload() { blip(1400, 0.05, 'square', 0.15); setTimeout(() => blip(900, 0.05, 'square', 0.15), 180); },
    hurt() { blip(220, 0.2, 'sawtooth', 0.25, 70); },
    update(dt) {
      if (!ctx || muted) return;
      padTimer += dt;
      if (padTimer > 5) {
        padTimer = 0; padChord = (padChord + 1) % CHORDS.length;
        padOsc.forEach((o, i) => o.frequency.setTargetAtTime(CHORDS[padChord][i] / 2, ctx.currentTime, 1.2));
      }
    },
  };
}
