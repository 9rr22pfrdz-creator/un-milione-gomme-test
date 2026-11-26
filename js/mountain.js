// The mountain of 1,000,000 tires as a grid of stacks. Pure logic (no THREE), shared by game + tests.
// Each 1x1 m cell holds `count` tires; its surface height is count * H_UNIT. Only the top tires of each
// cell are real grabbable 3D tires; the bulk below is a heightfield that sinks as cells empty.
import { TOTAL_TIRES, tireTypeFrom, GOLD_ID } from './config.js';

export const N = 100;              // grid cells per side
export const CELL = 1.0;           // m
export const CENTER = { x: -42, z: -4 }; // world position of the mountain centre
export const ORIGIN = { x: CENTER.x - N * CELL / 2, z: CENTER.z - N * CELL / 2 };
export const MAX_SLOPE = 0.9;      // rise per metre before tires slide down (~42°)
export const GRAB_LAYERS = 2;      // top 2 tires of a cell can be grabbed
export const SHOW_BURIED = 2;      // then 2 more are visible but buried (fills the gaps)
export const SLIDE_RATIO = 1.5;    // in play a hole must be this much deeper than MAX_SLOPE before a landslide
const GOLD_Z = 3.4;

export function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); }
export function hash2(a, b) { return hash(a * 0.7071 + b * 12.9898 + 0.137); }

function rawShape(x, z) { // metres from centre -> height (m), irregular mound sitting on the ground
  const r = Math.hypot(x, z), th = Math.atan2(z, x);
  const R = 35 * (1 + 0.11 * Math.sin(3 * th + 0.7) + 0.07 * Math.sin(5 * th + 2.1) + 0.04 * Math.sin(9 * th + 0.3));
  let h = 0;
  if (r < R) h = 20 * Math.pow(1 - (r / R) * (r / R), 1.25);
  // secondary lumps: tipped truckloads that never got flattened
  const lump = (cx, cz, rr, hh) => { const d = Math.hypot(x - cx, z - cz); return d < rr ? hh * Math.pow(1 - (d / rr) * (d / rr), 2) : 0; };
  h += lump(14, 16, 11, 4.2) + lump(-10, -18, 13, 3.5) + lump(20, -9, 9, 3.0) + lump(28, 4, 7, 1.6);
  h *= 1 + 0.06 * Math.sin(x * 0.37 + 1.3) * Math.cos(z * 0.29 + 0.4);
  return Math.max(0, h);
}

export class Mountain {
  constructor() {
    this.count = new Int32Array(N * N);
    this.initial = null;
    this.H_UNIT = 0.04;
    this.maxDiff = 20;
    this.gold = null; // the planted, visible-but-buried gold tire {cell, index, taken}
    this.dirty = new Set();
    this.generate();
  }
  idx(i, j) { return j * N + i; }
  cellOf(x, z) { const i = Math.floor((x - ORIGIN.x) / CELL), j = Math.floor((z - ORIGIN.z) / CELL); return (i < 0 || j < 0 || i >= N || j >= N) ? -1 : j * N + i; }
  cellCenter(c, out = {}) { out.x = ORIGIN.x + ((c % N) + 0.5) * CELL; out.z = ORIGIN.z + (Math.floor(c / N) + 0.5) * CELL; return out; }
  generate() {
    const f = new Float64Array(N * N); let sum = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = ORIGIN.x + (i + 0.5) * CELL - CENTER.x, z = ORIGIN.z + (j + 0.5) * CELL - CENTER.z;
      const h = rawShape(x, z); f[j * N + i] = h; sum += h;
    }
    // volume -> exactly TOTAL_TIRES tires
    this.H_UNIT = sum / TOTAL_TIRES;
    this.maxDiff = Math.max(2, Math.round(MAX_SLOPE * CELL / this.H_UNIT));
    let tot = 0, top = 0;
    for (let k = 0; k < N * N; k++) { this.count[k] = Math.round(f[k] / this.H_UNIT); tot += this.count[k]; if (this.count[k] > this.count[top]) top = k; }
    this.count[top] += TOTAL_TIRES - tot;
    this.relaxAll();
    this.initial = Int32Array.from(this.count);
    // plant the gold tire at the foot of the mountain facing the yard, third from the top (visible, buried)
    const c = this.findFootCell();
    this.gold = { cell: c, index: this.count[c] - 3, taken: false };
    this.dirty.clear();
  }
  findFootCell() { // a low front cell (about knee to waist high) facing the yard
    for (let x = 45; x > 0; x -= 0.5) { const c = this.cellOf(CENTER.x + x, CENTER.z + GOLD_Z); if (c >= 0 && this.count[c] >= 16) return c; }
    return this.cellOf(CENTER.x, CENTER.z);
  }
  total() { let t = 0; for (let k = 0; k < N * N; k++) t += this.count[k]; return t; }
  height(c) { return c < 0 ? 0 : this.count[c] * this.H_UNIT; }
  // smooth surface height at a world point (bilinear between cell centres)
  heightAt(x, z) {
    const fx = (x - ORIGIN.x) / CELL - 0.5, fz = (z - ORIGIN.z) / CELL - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const g = (a, b) => (a < 0 || b < 0 || a >= N || b >= N) ? 0 : this.count[b * N + a] * this.H_UNIT;
    return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - tz) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * tz;
  }
  // tire identity: type of the tire at stack position `index` (0 = bottom) in cell c
  typeAt(c, index) {
    if (this.gold && !this.gold.taken && c === this.gold.cell && index === this.gold.index) return GOLD_ID;
    const t = tireTypeFrom(hash2(c, index * 3.17), hash2(index + 0.5, c * 1.31));
    return t; // golds are scattered through the whole pile (plus the planted one at the foot)
  }
  // can the tire at (c, index) be grabbed? (only the top GRAB_LAYERS)
  isFree(c, index) { const n = this.count[c]; return index < n && index >= n - GRAB_LAYERS; }
  isVisible(c, index) { const n = this.count[c]; return index < n && index >= n - GRAB_LAYERS - SHOW_BURIED; }
  // remove a specific tire. Tires above it don't exist (it is in the top layers), so we swap identities:
  // the stack loses one, and if a lower-but-free tire was taken, the top one takes its place.
  take(c, index) {
    if (!this.isFree(c, index)) return null;
    const type = this.typeAt(c, index);
    const n = this.count[c];
    if (this.gold && !this.gold.taken && c === this.gold.cell) {
      if (index === this.gold.index) this.gold.taken = true;
      else if (this.gold.index === n - 1) this.gold.index = index; // the gold was on top; it drops into the gap
    }
    this.count[c] = n - 1;
    this.dirty.add(c);
    this.relaxFrom(c);
    return type;
  }
  // landslide: neighbours higher than maxDiff push tires into the hole
  relaxFrom(c0, budget = 400) {
    const q = [c0], thr = Math.round(this.maxDiff * SLIDE_RATIO);
    let slid = 0;
    while (q.length && budget-- > 0) {
      const c = q.pop(), i = c % N, j = (c / N) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const nb = b * N + a, d = this.count[nb] - this.count[c];
        if (d > thr) {
          const k = Math.ceil((d - this.maxDiff) / 2);
          this.moveTop(nb, c, k); slid += k;
          q.push(nb, c);
        }
      }
    }
    this.lastSlide = slid;
    return slid;
  }
  moveTop(from, to, k) {
    if (this.gold && !this.gold.taken && this.gold.cell === from && this.gold.index >= this.count[from] - k) {
      const depth = this.count[from] - 1 - this.gold.index; // 0 = top
      this.gold.cell = to; this.gold.index = this.count[to] + k - 1 - depth;
    }
    this.count[from] -= k; this.count[to] += k; this.dirty.add(from); this.dirty.add(to);
  }
  relaxAll() {
    for (let pass = 0; pass < 400; pass++) {
      let moved = false;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const c = j * N + i;
        if (i + 1 < N) { const d = this.count[c] - this.count[c + 1]; if (Math.abs(d) > this.maxDiff) { const k = Math.ceil((Math.abs(d) - this.maxDiff) / 2); d > 0 ? this.moveTop(c, c + 1, k) : this.moveTop(c + 1, c, k); moved = true; } }
        if (j + 1 < N) { const d = this.count[c] - this.count[c + N]; if (Math.abs(d) > this.maxDiff) { const k = Math.ceil((Math.abs(d) - this.maxDiff) / 2); d > 0 ? this.moveTop(c, c + N, k) : this.moveTop(c + N, c, k); moved = true; } }
      }
      if (!moved) break;
    }
  }
  // ---- save / load as a sparse diff against the deterministic start ----
  diff() { const out = []; for (let k = 0; k < N * N; k++) if (this.count[k] !== this.initial[k]) out.push(k, this.count[k]); return out; }
  applyDiff(d) {
    this.count.set(this.initial);
    if (Array.isArray(d)) for (let k = 0; k + 1 < d.length; k += 2) { const c = d[k] | 0, v = d[k + 1] | 0; if (c >= 0 && c < N * N && v >= 0) this.count[c] = v; }
    for (let k = 0; k < N * N; k++) this.dirty.add(k);
  }
}
