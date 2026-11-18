// audio.js — all sound is synthesized with WebAudio. No audio files, no network.
// Engine hum, police siren, wind, gunshots and a quiet ambient pad.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.windGain = null;
    this.padTimer = 0;
    this.padStep = 0;
    this.started = false;
  }

  // Must be called from a user gesture at least once.
  ensure() {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.started = true;
      this.startEngine();
      this.startWind();
    } catch (e) {
      this.started = false;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  startEngine() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 40;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  startWind() {
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.035;
    src.connect(filter);
    filter.connect(this.windGain);
    this.windGain.connect(this.master);
    src.start();
  }

  // Called every frame: engine pitch follows speed, siren wails when wanted.
  update(dt, speed, wanted) {
    if (!this.started || !this.ctx) return;
    const target = Math.min(0.12, 0.02 + (speed / 470) * 0.1);
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(38 + (speed / 470) * 90, this.ctx.currentTime, 0.1);
    if (wanted > 0) {
      if (!this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = 'sine';
        this.sirenOsc.frequency.value = 720;
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0.05;
        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.master);
        this.sirenOsc.start();
      }
      this.sirenTimer += dt;
      if (this.sirenTimer > 0.45) {
        this.sirenTimer = 0;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 720, this.ctx.currentTime, 0.05);
      }
    } else if (this.sirenOsc) {
      try { this.sirenOsc.stop(); } catch (e) { /* already stopped */ }
      this.sirenOsc = null;
      this.sirenGain = null;
    }
    // A slow ambient pad: a soft chord that changes every few seconds.
    this.padTimer += dt;
    if (this.padTimer > 6) {
      this.padTimer = 0;
      this.padStep = (this.padStep + 1) % 4;
      const chords = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [196, 262, 330]];
      const chord = chords[this.padStep];
      for (const freq of chord) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, this.ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.02, this.ctx.currentTime + 1.5);
        g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 5.5);
        osc.connect(g);
        g.connect(this.master);
        osc.start();
        osc.stop(this.ctx.currentTime + 6);
      }
    }
  }

  blip(freq, dur, type, vol) {
    if (!this.started || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.15, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + dur + 0.05);
  }

  noiseBurst(dur, vol, cutoff) {
    if (!this.started || !this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff || 1200;
    const g = this.ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
  }

  shot() { this.noiseBurst(0.18, 0.4, 2400); this.blip(140, 0.12, 'square', 0.2); }
  punch() { this.noiseBurst(0.08, 0.25, 500); }
  pickup() { this.blip(660, 0.12, 'sine', 0.18); setTimeout(() => this.blip(880, 0.15, 'sine', 0.18), 90); }
  cash() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'sine', 0.18), i * 110));
  }
  missionStart() { this.blip(392, 0.15, 'triangle', 0.2); setTimeout(() => this.blip(523, 0.2, 'triangle', 0.2), 130); }
  busted() { [400, 340, 280, 200].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'sawtooth', 0.15), i * 160)); }
  horn() { this.blip(330, 0.25, 'square', 0.12); setTimeout(() => this.blip(415, 0.25, 'square', 0.12), 20); }
}
