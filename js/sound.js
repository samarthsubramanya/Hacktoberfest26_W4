// All sound is synthesised with WebAudio, so there is nothing extra to download or cache.

export class Sound {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.drone = null;
  }

  // Must be called from a user gesture (browser autoplay rules).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggle() {
    this.on = !this.on;
    if (this.master) this.master.gain.setTargetAtTime(this.on ? 0.9 : 0, this.ctx.currentTime, 0.1);
    return this.on;
  }

  noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Low detuned hum + wind that rises and falls.
  startDrone() {
    if (!this.ctx || this.drone) return;
    const c = this.ctx;
    const out = c.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(0.16, c.currentTime, 2.5);
    out.connect(this.master);

    const nodes = [];
    for (const f of [55, 55.7, 82.4]) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = f > 80 ? 0.12 : 0.3;
      o.connect(g).connect(out);
      o.start();
      nodes.push(o);
    }

    const wind = c.createBufferSource();
    wind.buffer = this.noiseBuffer(4);
    wind.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 3;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 300;
    lfo.connect(lfoGain).connect(bp.frequency);
    const wg = c.createGain();
    wg.gain.value = 0.18;
    wind.connect(bp).connect(wg).connect(out);
    wind.start();
    lfo.start();
    nodes.push(wind, lfo);

    this.drone = { out, nodes };
  }

  stopDrone() {
    if (!this.drone) return;
    const { out, nodes } = this.drone;
    out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.8);
    setTimeout(() => nodes.forEach((n) => n.stop()), 4000);
    this.drone = null;
  }

  // Wooden "tock" when the planchette settles on a letter.
  tock() {
    if (!this.ctx) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer(0.08);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 300;
    bp.Q.value = 6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.5, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
    src.connect(bp).connect(g).connect(this.master);
    src.start();
  }

  // A falling, breathy chord: the spirit arrives, or leaves.
  whoosh(up = false) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    for (const f of [220, 261.6, 311.1]) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(up ? f / 2 : f, t);
      o.frequency.exponentialRampToValueAtTime(up ? f : f / 2, t + 2.2);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 2.5);
    }
  }
}
