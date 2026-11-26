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
  // tire lands in the van: a bright two-tone "bling!" (C6 -> G6 with bell partials) over a soft rubber settle.
  // combo (tires landing in quick succession) and gold nudge the pitch up.
  clink(size = 1, height = 0, pan = 0, gold = false) {
    if (!this.ok()) return; const t = this.t, o = this.out(pan, 0.85);
    const now = t; this._combo = (now - (this._lastBling || -9) < 1.2) ? Math.min(6, (this._combo || 0) + 1) : 0; this._lastBling = now;
    const up = Math.pow(2, (this._combo * 0.5 + (gold ? 3 : 0) + height * 1.5) / 12) * this.rnd(0.995, 1.005);
    const f1 = 1046.5 * up, f2 = 1568 * up; // C6, G6
    const bell = (t0, f, peak, dur) => { // clean fast attack, inharmonic bell partials, long shimmer ring-out
      this.tone(o, t0, f, f, dur, 'sine', peak, 0.0015);
      this.tone(o, t0, f * 2.01, f * 2.01, dur * 0.55, 'sine', peak * 0.32, 0.0015);
      this.tone(o, t0, f * 3.02, f * 3.02, dur * 0.3, 'sine', peak * 0.14, 0.001);
      this.tone(o, t0, f * 4.17, f * 4.17, dur * 0.18, 'sine', peak * 0.07, 0.001);
      this.tone(o, t0, f * 1.003, f * 1.003, dur, 'sine', peak * 0.35, 0.0015); // slight detune = shimmer
    };
    bell(t, f1, gold ? 0.3 : 0.24, 0.55);
    bell(t + 0.075, f2, gold ? 0.32 : 0.26, gold ? 1.2 : 0.85);
    if (gold) bell(t + 0.15, f2 * 1.335, 0.2, 1.2); // extra sparkle for gold (C7)
    this.noise(o, t, 0.012, 'highpass', 6000, 6000, 0.7, 0.12); // tiny metallic tick on the attack
    // light rubber settle underneath, kept low so the bling stays in front
    const k = (1 - size * 0.1) * this.rnd(0.94, 1.06);
    this.tone(o, t, 140 * k, 85 * k, 0.14, 'sine', 0.22);
    this.noise(o, t, 0.05, 'bandpass', 900 * k, 600 * k, 2, 0.1);
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
  // distance attenuation for the van: full-ish at 3 m, quiet past 20 m
  engAtt(dist) { return 1 / (1 + Math.max(0, dist - 3) * 0.22 + Math.max(0, dist - 3) ** 2 * 0.012); }
  engineStart(dist = 10) {
    if (!this.ok()) return; const c = this.ctx, t = this.t, a = this.engAtt(dist);
    // starter motor whirr + catch
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 700;
    o.frequency.setValueAtTime(18, t); for (let i = 0; i < 6; i++) o.frequency.setValueAtTime(i & 1 ? 16 : 24, t + i * 0.09);
    o.frequency.linearRampToValueAtTime(62, t + 0.75); o.frequency.exponentialRampToValueAtTime(38, t + 1.3);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * a, t + 0.05); g.gain.linearRampToValueAtTime(0.08 * a, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.4);
    o.connect(f); f.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 1.5);
  }
  engineStop(dist = 10) {
    if (!this.ok()) return; const c = this.ctx, t = this.t, a = this.engAtt(dist);
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = 'triangle'; f.type = 'lowpass'; f.frequency.value = 240;
    o.frequency.setValueAtTime(34, t); o.frequency.exponentialRampToValueAtTime(14, t + 0.6);
    g.gain.setValueAtTime(0.06 * a, t); g.gain.exponentialRampToValueAtTime(0.0006, t + 0.7);
    o.connect(f); f.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.8);
  }
  setEngine(on, level = 0, dist = 10) {
    if (!this.ctx) return;
    if (on && !this.engine) {
      // soft diesel hum: triangle + filtered noise, no harsh square/saw
      const c = this.ctx, o1 = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
      o1.type = 'triangle'; o2.type = 'sine'; lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 0.5; g.gain.value = 0;
      const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true; const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 120; nf.Q.value = 1.2; const ng = c.createGain(); ng.gain.value = 0.35;
      o1.connect(lp); o2.connect(lp); n.connect(nf); nf.connect(ng); ng.connect(lp); lp.connect(g); g.connect(this.bus); o1.start(); o2.start(); n.start();
      this.engine = { o1, o2, lp, g, n };
    }
    if (!this.engine) return;
    const e = this.engine, t = this.ctx.currentTime, base = 30 + level * 26;
    e.o1.frequency.setTargetAtTime(base, t, 0.25); e.o2.frequency.setTargetAtTime(base * 0.5, t, 0.25);
    e.lp.frequency.setTargetAtTime(150 + level * 200, t, 0.3);
    const vol = on && !this.muted ? 0.055 * (0.5 + level * 0.6) * this.engAtt(dist) : 0;
    e.g.gain.setTargetAtTime(vol, t, on ? 0.25 : 0.12);
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
