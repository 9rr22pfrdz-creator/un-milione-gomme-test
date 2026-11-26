// Conveyor belts: pure grid + path + transport logic (no THREE, no DOM) so node tests can run it.
// Grid of 2 m cells. A piece sits in one cell; `rot` is the heading a tire has when it ENTERS the piece
// (0 = +x toward the van, 1 = +z, 2 = -x, 3 = -z; +1 = turn right). Curves leave at rot+1 (right) / rot+3 (left).
export const GRID = 2, GX0 = 0, GZ0 = 0.6; // cell centres at x = 2*gx, z = 2*gz + 0.6 (lined up with the van bay)
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const PIECES = {
  straight: { key: '1', name: 'Nastro dritto', short: 'Dritto', cost: 60 },
  curveR: { key: '2', name: 'Curva destra', short: 'Curva dx', cost: 80 },
  curveL: { key: '3', name: 'Curva sinistra', short: 'Curva sx', cost: 80 },
  intake: { key: '4', name: 'Caricatore montagna', short: 'Caricatore', cost: 400 },
};
export const PIECE_ORDER = ['straight', 'curveR', 'curveL', 'intake'];
export const SINK_DIST = 2.5;     // a belt ending this close to the van's rear bay throws its tires in
export const INTAKE_REACH = 4.5;  // the intake grabs tires from the mountain within this radius of its back
export const TIRE_GAP = 0.7;      // m between tire centres on a belt
export const BASE_SPEED = 1.4;    // m/s at motor level 1 (x beltSpeed upgrade) -> 2 tires/s per intake

export const cellKey = (gx, gz) => gx + ',' + gz;
export function cellCenter(gx, gz) { return { x: gx * GRID + GX0, z: gz * GRID + GZ0 }; }
export function worldToCell(x, z) { return { gx: Math.round((x - GX0) / GRID), gz: Math.round((z - GZ0) / GRID) }; }
export function outDir(p) { return p.type === 'curveR' ? (p.rot + 1) % 4 : p.type === 'curveL' ? (p.rot + 3) % 4 : p.rot; }
export function pathLen(p) { return p.type === 'intake' ? GRID / 2 : (p.type === 'curveR' || p.type === 'curveL') ? Math.PI / 2 * (GRID / 2) : GRID; }
// point + heading along the piece path at distance s (m) from its start
export function pathPoint(p, s, out = {}) {
  const c = cellCenter(p.gx, p.gz), h = GRID / 2, d = DIRS[p.rot], L = pathLen(p), k = Math.max(0, Math.min(1, s / L));
  if (p.type === 'straight' || p.type === 'intake') {
    const x0 = p.type === 'intake' ? 0 : -h, along = x0 + k * (h - x0);
    out.x = c.x + d[0] * along; out.z = c.z + d[1] * along; out.hx = d[0]; out.hz = d[1];
  } else {
    const e = DIRS[outDir(p)], th = k * Math.PI / 2, cs = Math.cos(th), sn = Math.sin(th);
    const cx = c.x + (e[0] - d[0]) * h, cz = c.z + (e[1] - d[1]) * h; // the inner corner = arc centre
    out.x = cx + h * (-e[0] * cs + d[0] * sn); out.z = cz + h * (-e[1] * cs + d[1] * sn);
    out.hx = e[0] * sn + d[0] * cs; out.hz = e[1] * sn + d[1] * cs;
  }
  return out;
}
export function endPoint(p) { const c = cellCenter(p.gx, p.gz), e = DIRS[outDir(p)]; return { x: c.x + e[0] * GRID / 2, z: c.z + e[1] * GRID / 2 }; }
export function backPoint(p) { const c = cellCenter(p.gx, p.gz), d = DIRS[p.rot]; return { x: c.x - d[0] * GRID * 0.45, z: c.z - d[1] * GRID * 0.45 }; }
// the piece downstream of p (or null): it must sit in the next cell and take tires heading our way
export function nextPiece(p, map) {
  const e = DIRS[outDir(p)], n = map.get(cellKey(p.gx + e[0], p.gz + e[1]));
  return n && n.type !== 'intake' && n.rot === outDir(p) ? n : null;
}
// a sink is a point {x, z} (the vehicle's rear bay) or a segment {x0, z0, x1, z1} (the storage rack front); `rear` = one or a list
export function sinkDist(e, k) {
  if (k.x0 !== undefined) { const dx = k.x1 - k.x0, dz = k.z1 - k.z0, l2 = dx * dx + dz * dz; const t = l2 ? Math.max(0, Math.min(1, ((e.x - k.x0) * dx + (e.z - k.z0) * dz) / l2)) : 0; return Math.hypot(e.x - (k.x0 + dx * t), e.z - (k.z0 + dz * t)); }
  return Math.hypot(e.x - k.x, e.z - k.z);
}
export function sinkIndex(p, rear) { if (!rear) return -1; const e = endPoint(p), L = Array.isArray(rear) ? rear : [rear]; for (let i = 0; i < L.length; i++) if (sinkDist(e, L[i]) <= SINK_DIST) return i; return -1; }
export function isSink(p, rear) { return sinkIndex(p, rear) >= 0; }

// A conveyor network: pieces + the tires riding on them.
export class Belts {
  constructor() { this.pieces = []; this.map = new Map(); this.links = new Map(); this.sunk = 0; }
  rebuild() { this.map.clear(); for (const p of this.pieces) { this.map.set(cellKey(p.gx, p.gz), p); p.tires = p.tires || []; } for (const p of this.pieces) { p.next = nextPiece(p, this.map); p.len = pathLen(p); } }
  at(gx, gz) { return this.map.get(cellKey(gx, gz)) || null; }
  add(type, gx, gz, rot) { if (this.at(gx, gz) || !PIECES[type]) return null; const p = { type, gx, gz, rot: ((rot % 4) + 4) % 4, tires: [], hopper: [], t: 0 }; this.pieces.push(p); this.rebuild(); return p; }
  remove(p) { const i = this.pieces.indexOf(p); if (i < 0) return null; this.pieces.splice(i, 1); this.rebuild(); return p; }
  serialize() { return this.pieces.map(p => ({ type: p.type, gx: p.gx, gz: p.gz, rot: p.rot })); }
  load(list) { this.pieces = []; for (const q of list || []) if (PIECES[q.type] && !this.at(q.gx, q.gz)) { this.pieces.push({ type: q.type, gx: q.gx, gz: q.gz, rot: q.rot, tires: [], hopper: [], t: 0 }); this.map.set(cellKey(q.gx, q.gz), this.pieces[this.pieces.length - 1]); } this.rebuild(); }
  count(type) { return this.pieces.filter(p => p.type === type).length; }
  tireCount() { let n = 0; for (const p of this.pieces) n += p.tires.length + p.hopper.length; return n; }
  // follow the chain from an intake: [pieces..., sink?]
  route(p0, rear, max = 200) { const out = []; let p = p0; const seen = new Set(); while (p && !seen.has(p) && out.length < max) { seen.add(p); out.push(p); if (!p.next) break; p = p.next; } const last = out[out.length - 1]; return { pieces: out, sink: !!(last && rear && isSink(last, rear)) }; }
  // move every tire. canSink(tire, piece) -> true when the van took it (it is removed from the belt).
  step(dt, speed, rear, canSink) {
    const mv = speed * dt;
    for (const p of this.pieces) {
      const T = p.tires; if (!T.length) continue;
      T.sort((a, b) => b.s - a.s); // leader first
      for (let i = 0; i < T.length; i++) {
        const tr = T[i];
        if (i > 0) { tr.s = Math.max(tr.s, Math.min(tr.s + mv, T[i - 1].s - TIRE_GAP)); continue; } // never closer than the gap, never backwards
        let s = tr.s + mv;
        if (s < p.len) { tr.s = s; continue; }
        const n = p.next;
        if (n) {
          const over = s - p.len, nmin = n.tires.length ? Math.min(...n.tires.map(o => o.s)) : Infinity;
          if (nmin - over >= TIRE_GAP) { T.splice(i, 1); i--; tr.s = over; n.tires.push(tr); continue; }
          tr.s = p.len; continue;
        }
        if (rear && isSink(p, rear) && canSink(tr, p)) { T.splice(i, 1); i--; this.sunk++; continue; }
        tr.s = p.len; // dead end: the tires queue up
      }
    }
  }
  // drop a tire onto p at distance s (a robotic arm): only where there is a free gap
  insertAt(p, s, tire) { s = Math.max(0, Math.min(p.len, s)); if (p.tires.some(t => Math.abs(t.s - s) < TIRE_GAP)) return false; tire.s = s; p.tires.push(tire); return true; }
  // can a new tire be put at the start of p?
  startFree(p) { return !p.tires.some(t => t.s < TIRE_GAP); }
}
