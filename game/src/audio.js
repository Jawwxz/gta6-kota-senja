// audio.js — synthesized WebAudio for Kota Senja. No audio files, no
// network: engine hum, gunshots, punches, pickups and mission jingles are
// all oscillators and filtered noise. Everything is guarded so a headless
// browser without audio can never throw.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.engine = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
  }

  init() {
    try {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.engine = this.ctx.createOscillator();
      this.engine.type = 'sawtooth';
      this.engine.frequency.value = 55;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 320;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engine.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engine.start();
    } catch (e) {
      this.ctx = null;
    }
  }

  setEngine(speed, inCar) {
    if (!this.ctx || !this.engineGain) return;
    try {
      const t = this.ctx.currentTime;
      this.engine.frequency.setTargetAtTime(55 + Math.abs(speed) * 4.5, t, 0.1);
      this.engineGain.gain.setTargetAtTime(inCar ? 0.045 : 0, t, 0.15);
    } catch (e) {}
  }

  blip(freq, dur = 0.12, type = 'sine', vol = 0.12, when = 0) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime + when;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  gunshot() {
    if (!this.ctx) return;
    try {
      const dur = 0.16;
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1800;
      const g = this.ctx.createGain();
      g.gain.value = 0.25;
      src.connect(f);
      f.connect(g);
      g.connect(this.ctx.destination);
      src.start();
    } catch (e) {}
  }

  punch() {
    this.blip(90, 0.1, 'sine', 0.2);
  }

  pickup() {
    this.blip(660, 0.1, 'sine', 0.12);
    this.blip(990, 0.14, 'sine', 0.12, 0.09);
  }

  missionDone() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => this.blip(n, 0.22, 'triangle', 0.14, i * 0.12));
  }

  setSiren(on) {
    if (!this.ctx) return;
    try {
      if (on && !this.sirenOn) {
        this.sirenOn = true;
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = 'square';
        this.sirenOsc.frequency.value = 700;
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0.02;
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 1.4;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 250;
        lfo.connect(lfoGain);
        lfoGain.connect(this.sirenOsc.frequency);
        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.ctx.destination);
        this.sirenOsc.start();
        lfo.start();
        this.sirenLfo = lfo;
      } else if (!on && this.sirenOn) {
        this.sirenOn = false;
        try {
          this.sirenOsc.stop();
        } catch (e) {}
        try {
          this.sirenLfo.stop();
        } catch (e) {}
        this.sirenOsc = null;
        this.sirenLfo = null;
      }
    } catch (e) {
      this.sirenOn = false;
    }
  }
}
