// Procedural audio: every sound is synthesized (no files). One AudioContext, started on the first gesture.
export class Sfx {
  constructor() { this.ctx = null; this.vol = 0.8; this.muted = false; this.engine = null; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(c.destination);
    // short outdoor slap-back reverb
    const len = c.sampleRate * 0.9, ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < c.sampleRate * 0.05 ? 0.3 : 1); }
    this.verb = c.createConvolver(); this.verb.buffer = ir; this.verbIn = c.createGain(); this.verbIn.gain.value = 0.22; this.verbIn.connect(this.verb); this.verb.connect(this.master);
    this.bus = c.createGain(); this.bus.connect(this.master); this.bus.connect(this.verbIn);
    const nl = c.sampleRate * 2; this.noiseBuf = c.createBuffer(1, nl, c.sampleRate);
    const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    this.startWind();
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05); }
  get t() { return this.ctx.currentTime; }
  out(pan = 0, gain = 1) {
    const g = this.ctx.createGain(); g.gain.value = gain;
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(this.bus); } else g.connect(this.bus);
    return g;
  }
  env(g, t0, a, peak, d, end = 0.0001) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(end, t0 + a + d); }
  tone(dest, t0, f0, f1, dur, type = 'sine', peak = 0.5, a = 0.003) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    this.env(g, t0, a, peak, dur); o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + a + dur + 0.05);
    return o;
  }
  noise(dest, t0, dur, ftype, f0, f1, q = 1, peak = 0.4, a = 0.002) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loopStart = Math.random(); 
    const f = this.ctx.createBiquadFilter(); f.type = ftype; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = this.ctx.createGain(); this.env(g, t0, a, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t0, Math.random() * 1.5); s.stop(t0 + a + dur + 0.05);
  }
  ok() { return this.ctx && !this.muted && this.ctx.state === 'running'; }
  rnd(a, b) { return a + Math.random() * (b - a); }

  // rubber squeak + scrape as a tire is pulled off the pile
  grab(size = 1, pan = 0) {
    if (!this.ok()) return; const t = this.t, o = this.out(pan, 0.8), k = 1 - size * 0.12;
    this.noise(o, t, 0.16, 'bandpass', 900 * k, 500 * k, 1.2, 0.35);
    this.tone(o, t + 0.02, 520 * k * this.rnd(0.9, 1.1), 780 * k, 0.09, 'sine', 0.12);
    this.tone(o, t, 95 * k, 70 * k, 0.16, 'sine', 0.35);
  }
  // tire lands in the van: rubber "bonk" + hollow clink, a little brighter as the stack grows
  clink(size = 1, height = 0, pan = 0) {
    if (!this.ok()) return; const t = this.t, o = this.out(pan, 0.9), k = (1 - size * 0.1) * (1 + height * 0.15) * this.rnd(0.94, 1.06);
    this.tone(o, t, 150 * k, 85 * k, 0.22, 'sine', 0.6);
    this.noise(o, t, 0.07, 'bandpass', 1100 * k, 700 * k, 3, 0.35);
    for (const [f, a] of [[1180, 0.07], [1745, 0.05], [2630, 0.035], [3410, 0.02]]) this.tone(o, t + 0.004, f * k, f * k * 0.985, 0.16 + Math.random() * 0.08, 'sine', a);
    this.tone(o, t + 0.11, 120 * k, 90 * k, 0.1, 'sine', 0.18); // small bounce
  }
  // tire dropped in the cart: deep thud + rattling metal frame
  thud(n = 1, pan = 0) {
    if (!this.ok()) return; const t = this.t, o = this.out(pan, 1);
    this.tone(o, t, 88 * this.rnd(0.9, 1.1), 48, 0.3, 'sine', 0.8);
    this.noise(o, t, 0.12, 'lowpass', 500, 200, 0.7, 0.5);
    for (let i = 0; i < 4; i++) this.noise(o, t + 0.015 + i * this.rnd(0.025, 0.05), 0.05, 'bandpass', this.rnd(2200, 3400), 2000, 9, 0.12 / (i + 1));
    this.tone(o, t + 0.01, 610, 590, 0.18, 'triangle', 0.03 + n * 0.002);
  }
  whoosh(pan = 0) { if (!this.ok()) return; const t = this.t, o = this.out(pan, 0.6); this.noise(o, t, 0.32, 'bandpass', 380, 1500, 1.4, 0.25, 0.08); }
  step(soft = false) { if (!this.ok()) return; const t = this.t, o = this.out(this.rnd(-0.15, 0.15), soft ? 0.25 : 0.45); this.noise(o, t, 0.07, 'highpass', this.rnd(1300, 2200), 900, 0.6, 0.22); this.noise(o, t, 0.05, 'lowpass', 300, 150, 0.7, 0.3); }
  coin(big = false) { if (!this.ok()) return; const t = this.t, o = this.out(0, big ? 0.5 : 0.25); this.tone(o, t, 1318, 1318, 0.09, 'triangle', 0.3); this.tone(o, t + 0.07, 1760, 1760, big ? 0.35 : 0.18, 'triangle', 0.3); }
  buy() { if (!this.ok()) return; const t = this.t, o = this.out(0, 0.6); this.noise(o, t, 0.05, 'bandpass', 3000, 2000, 2, 0.4); this.tone(o, t + 0.05, 2093, 2093, 0.5, 'sine', 0.25); this.tone(o, t + 0.05, 2637, 2637, 0.6, 'sine', 0.2); this.tone(o, t + 0.05, 3136, 3136, 0.4, 'sine', 0.1); }
  buried(pan = 0) { if (!this.ok()) return; const t = this.t, o = this.out(pan, 0.8); this.tone(o, t, 70, 45, 0.2, 'sine', 0.7); this.noise(o, t, 0.1, 'lowpass', 260, 120, 0.8, 0.5); }
  nope() { if (!this.ok()) return; const t = this.t, o = this.out(0, 0.3); this.tone(o, t, 330, 300, 0.08, 'triangle', 0.25); this.tone(o, t + 0.1, 262, 240, 0.12, 'triangle', 0.25); }
  slide(n = 5, pan = 0) {
    if (!this.ok()) return; const t = this.t, o = this.out(pan, 0.9);
    this.noise(o, t, 0.9 + n * 0.03, 'lowpass', 420, 140, 0.8, 0.45, 0.06);
    for (let i = 0; i < Math.min(14, n); i++) { const tt = t + 0.05 + Math.random() * 0.8, k = this.rnd(0.8, 1.2); this.tone(o, tt, 130 * k, 80 * k, 0.15, 'sine', 0.3); }
  }
  doors() { if (!this.ok()) return; const t = this.t, o = this.out(0.3, 0.7); this.noise(o, t, 0.15, 'bandpass', 700, 300, 1.5, 0.6); this.tone(o, t, 140, 80, 0.25, 'sine', 0.6); this.noise(o, t + 0.01, 0.2, 'bandpass', 2600, 2200, 10, 0.08); }
  horn() { if (!this.ok()) return; const t = this.t, o = this.out(0.4, 0.35); for (const [d, l] of [[0, 0.16], [0.22, 0.28]]) { const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600; lp.connect(o); this.tone(lp, t + d, 415, 415, l, 'square', 0.25, 0.01); this.tone(lp, t + d, 523, 523, l, 'square', 0.18, 0.01); } }
  beep() { if (!this.ok()) return; const t = this.t, o = this.out(0.4, 0.2); this.tone(o, t, 1050, 1050, 0.18, 'square', 0.12, 0.005); }
  milestone() { if (!this.ok()) return; const t = this.t, o = this.out(0, 0.45); [523, 659, 784, 1047].forEach((f, i) => this.tone(o, t + i * 0.09, f, f, 0.35, 'triangle', 0.25)); }
  click() { if (!this.ok()) return; const t = this.t, o = this.out(0, 0.25); this.tone(o, t, 1400, 900, 0.03, 'square', 0.12); }
  // van engine, continuous. level 0..1 (idle..revving), gain by distance
  setEngine(on, level = 0, dist = 10) {
    if (!this.ctx) return;
    if (on && !this.engine) {
      const c = this.ctx, o1 = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 260; g.gain.value = 0;
      o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.bus); o1.start(); o2.start();
      this.engine = { o1, o2, lp, g };
    }
    if (!this.engine) return;
    const e = this.engine, t = this.ctx.currentTime, base = 34 + level * 40;
    e.o1.frequency.setTargetAtTime(base, t, 0.15); e.o2.frequency.setTargetAtTime(base * 0.5, t, 0.15);
    e.lp.frequency.setTargetAtTime(220 + level * 500, t, 0.2);
    const vol = on && !this.muted ? Math.min(0.16, 1.4 / (dist * dist * 0.08 + 6)) * (0.6 + level) : 0;
    e.g.gain.setTargetAtTime(vol, t, 0.2);
  }
  startWind() {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = c.createGain(); g.gain.value = 0.035;
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.02; lfo.connect(lg); lg.connect(g.gain); lfo.start();
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    // occasional distant birds
    this.birdTimer = setInterval(() => { if (!this.ok() || Math.random() < 0.6) return; const t = this.t, o = this.out(this.rnd(-0.8, 0.8), 0.05); for (let i = 0; i < 3; i++) this.tone(o, t + i * 0.13, this.rnd(2600, 3400), this.rnd(3000, 4200), 0.08, 'sine', 0.2); }, 7000);
  }
}
